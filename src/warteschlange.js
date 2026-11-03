// Offline-Warteschlange: Stempel, Fotos, Material und Tagesberichte werden zuerst auf dem Handy
// gespeichert (IndexedDB) und dann gesendet – sofort, wenn Netz da ist, sonst automatisch später.
// Jede Sendung hat eine Client-ID (cid): kommt sie doppelt an (Antwort im Funkloch verloren),
// erkennt der Server das. Die Uhrzeit der Erfassung (zeit) reist mit und zählt.
import { api, sitzung } from "./api.js";

const DB_NAME = "baustelle-offline", OFFEN = "warteschlange", FEHL = "fehlgeschlagen";
let dbVersprechen = null;

function db() {
  if (!dbVersprechen) {
    dbVersprechen = new Promise((ok, nein) => {
      if (!("indexedDB" in window)) return nein(new Error("kein IndexedDB"));
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains(OFFEN)) d.createObjectStore(OFFEN, { keyPath: "cid" });
        if (!d.objectStoreNames.contains(FEHL)) d.createObjectStore(FEHL, { keyPath: "cid" });
      };
      r.onsuccess = () => ok(r.result);
      r.onerror = () => nein(r.error);
    }).catch((e) => { dbVersprechen = null; throw e; });
  }
  return dbVersprechen;
}
async function mitStore(name, modus, fn) {
  const d = await db();
  return new Promise((ok, nein) => {
    const t = d.transaction(name, modus);
    const anfrage = fn(t.objectStore(name));
    t.oncomplete = () => ok(anfrage ? anfrage.result : undefined);
    t.onerror = () => nein(t.error);
    t.onabort = () => nein(t.error);
  });
}

export function neueId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  const b = new Uint8Array(16); window.crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("").replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5");
}

const meine = (liste) => { const id = sitzung()?.mitarbeiterId; return liste.filter((x) => !x.ma || x.ma === id); };
const melden = async () => { try { window.dispatchEvent(new CustomEvent("warteschlange", { detail: await zustand() })); } catch { /* egal */ } };

/** Anzahl wartender Einträge + fehlgeschlagene (nur die des angemeldeten Mitarbeiters) */
export async function zustand() {
  try {
    const [offen, fehl] = await Promise.all([mitStore(OFFEN, "readonly", (s) => s.getAll()), mitStore(FEHL, "readonly", (s) => s.getAll())]);
    return { anzahl: meine(offen || []).length, fehlgeschlagen: meine(fehl || []).sort((a, b) => a.erstellt.localeCompare(b.erstellt)) };
  } catch { return { anzahl: 0, fehlgeschlagen: [] }; }
}

/**
 * Aktion merken und senden. Antwort sofort nach dem Speichern auf dem Handy:
 * { ok: true, cid, gespeichert: true }. Ohne IndexedDB (selten) wird direkt gesendet.
 */
export async function einreihen(aktion, daten = {}) {
  const cid = daten.cid || neueId();
  const eintrag = { cid, aktion, daten: { ...daten, cid, zeit: daten.zeit || new Date().toISOString() }, ma: sitzung()?.mitarbeiterId || null, erstellt: new Date().toISOString(), versuche: 0 };
  try {
    await mitStore(OFFEN, "readwrite", (s) => s.put(eintrag));
  } catch {
    const r = await api("aktion", { aktion, daten: eintrag.daten }); // Notweg: wie früher direkt
    return { ...r, cid, direkt: true };
  }
  melden();
  senden();
  return { ok: true, cid, gespeichert: true };
}

let laeuft = null;
let wiederholung = null;
/** Alles Wartende der Reihe nach senden (nur ein Durchlauf gleichzeitig). */
export function senden() {
  if (laeuft) return laeuft;
  laeuft = (async () => {
    try {
      const alle = await mitStore(OFFEN, "readonly", (s) => s.getAll());
      const liste = meine(alle || []).sort((a, b) => a.erstellt.localeCompare(b.erstellt));
      let stempelWartet = false; // Feierabend nie vor seinem Arbeitsbeginn senden
      for (const e of liste) {
        const istStempel = e.aktion.startsWith("stempel_");
        if (stempelWartet && istStempel) continue;
        const r = await api("aktion", { aktion: e.aktion, daten: e.daten });
        const st = r.httpStatus || 0;
        if (r.ok || st === 409) { // 409 = schon erledigt (z. B. Feierabend doppelt) → nicht erneut
          await mitStore(OFFEN, "readwrite", (s) => s.delete(e.cid));
          window.dispatchEvent(new CustomEvent("warteschlange-gesendet", { detail: { eintrag: e, antwort: r } }));
          continue;
        }
        if (r.netz || !st || st === 401) { // kein Netz / abgemeldet → alles später (nach Netz bzw. Anmeldung)
          await mitStore(OFFEN, "readwrite", (s) => s.put({ ...e, versuche: (e.versuche || 0) + 1 }));
          planen();
          break;
        }
        if (st === 429 || st >= 500) { // Server gestört: diesen Eintrag später erneut, die anderen trotzdem versuchen
          await mitStore(OFFEN, "readwrite", (s) => s.put({ ...e, versuche: (e.versuche || 0) + 1 }));
          planen();
          if (istStempel) stempelWartet = true;
          continue;
        }
        // Dauerhaft abgelehnt (z. B. kein Zugriff, Uhrzeit ungültig): zur Anzeige beiseitelegen, nicht endlos senden
        await mitStore(FEHL, "readwrite", (s) => s.put({ ...e, fehler: r.fehler || String(st) }));
        await mitStore(OFFEN, "readwrite", (s) => s.delete(e.cid));
      }
    } catch { planen(); }
    finally { laeuft = null; melden(); }
  })();
  return laeuft;
}
function planen() {
  clearTimeout(wiederholung);
  wiederholung = setTimeout(() => senden(), 30000);
}

/** Fehlgeschlagenen Eintrag nach dem Lesen entfernen */
export async function fehlerQuittieren(cid) {
  try { await mitStore(FEHL, "readwrite", (s) => s.delete(cid)); } catch { /* egal */ }
  melden();
}

/** Einmal beim App-Start: senden bei Netz-Rückkehr, beim Zurückkehren in die App und regelmäßig */
let gestartet = false;
export function warteschlangeStarten() {
  if (gestartet) return;
  gestartet = true;
  window.addEventListener("online", () => senden());
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") senden(); });
  setInterval(() => senden(), 60000);
  senden();
}
