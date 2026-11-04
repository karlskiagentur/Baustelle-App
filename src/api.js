// Gespräch mit dem Vercel-Backend. Session-Token liegt lokal auf dem Gerät und
// wird als Authorization-Header mitgeschickt (nicht in der URL).
import i18n, { locale } from "./i18n.js";

const SCHLUESSEL = "baustelle_session";

export function sitzung() {
  try { return JSON.parse(localStorage.getItem(SCHLUESSEL)) || null; } catch { return null; }
}
export function sitzungSetzen(s) {
  if (s) localStorage.setItem(SCHLUESSEL, JSON.stringify(s));
  else { localStorage.removeItem(SCHLUESSEL); cacheLeeren(); } // Abmelden: zwischengespeicherte Daten weg (geteiltes Handy)
}

// ---- Letzter Stand je Seite (für Funklöcher) ---------------------------------------------
// Lesezugriffe merken sich die letzte erfolgreiche Antwort; ohne Netz zeigt die App diesen Stand.
const CACHE = "baustelle_cache_";
const cacheKey = (s, body) => `${CACHE}${s?.mitarbeiterId || "x"}_${body.bereich || "start"}${body.einsatzId ? "_" + body.einsatzId : ""}`;
function cacheLesen(s, body) {
  try { const c = JSON.parse(localStorage.getItem(cacheKey(s, body))); return c && c.daten ? { ...c.daten, offline: true, stand: c.stand } : null; } catch { return null; }
}
function cacheSchreiben(s, body, j) {
  try { localStorage.setItem(cacheKey(s, body), JSON.stringify({ stand: new Date().toISOString(), daten: j })); } catch { /* Speicher voll: egal */ }
}
function cacheLeeren() {
  try { Object.keys(localStorage).filter((k) => k.startsWith(CACHE)).forEach((k) => localStorage.removeItem(k)); } catch { /* egal */ }
}

/** Server-Fehler in die Sprache des Nutzers übersetzen (Server schickt `code`, deutscher Text bleibt Fallback). */
function uebersetzen(j) {
  if (j && j.ok === false && j.code) j.fehler = i18n.t(`server.${j.code}`, { defaultValue: j.fehler || i18n.t("server.serverfehler") });
  return j;
}

export async function api(pfad, body = {}) {
  const s = sitzung();
  // Lesezugriffe nennen die aktuelle App-Sprache → Büro-Texte kommen (Modul „uebersetzung“) passend übersetzt
  if (pfad === "daten" && !body.sprache) body = { ...body, sprache: i18n.language };
  let r;
  try {
    r = await fetch(`/api/${pfad}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(s ? { Authorization: `Bearer ${s.token}` } : {}) },
      body: JSON.stringify(body),
    });
  } catch {
    // Kein Netz (Funkloch): Lesezugriffe zeigen den letzten Stand vom Handy
    if (pfad === "daten") { const c = cacheLesen(s, body); if (c) return c; }
    return { ok: false, netz: true, fehler: i18n.t("server.keineVerbindung") };
  }
  const j = await r.json().catch(() => ({ ok: false, fehler: i18n.t("server.serverfehler") }));
  j.httpStatus = r.status;
  if (r.status === 401 && s) {
    sitzungSetzen(null);
    window.dispatchEvent(new Event("baustelle-abgemeldet"));
  }
  if (pfad === "daten") {
    if (j.ok) cacheSchreiben(s, body, j);
    else if (r.status >= 500) { const c = cacheLesen(s, body); if (c) return c; } // Server/Netz gestört → letzter Stand
  }
  return uebersetzen(j);
}

/** Download-Link für ein eigenes Dokument (Server prüft Eigentum, holt die Datei frisch von Airtable). */
export function dokumentUrl(dokumentId) {
  const s = sitzung();
  return `/api/dokument-download?id=${encodeURIComponent(dokumentId)}&token=${encodeURIComponent(s?.token || "")}`;
}

// Datum/Uhrzeit in der Sprache des Nutzers (Locale aus i18n.js)
export const datumSchoen = (iso) => {
  if (!iso) return "";
  const d = new Date(iso.length <= 10 ? iso + "T00:00:00" : iso);
  return d.toLocaleDateString(locale(), { weekday: "short", day: "2-digit", month: "2-digit" });
};
export const zeitSchoen = (iso) =>
  iso ? new Date(iso).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) : ""; // immer 24 h (Baustelle: „07:00“)
export const monatSchoen = (d) => d.toLocaleDateString(locale(), { month: "long", year: "numeric" });
export const minutenSchoen = (min) => {
  if (min == null || isNaN(min)) return i18n.t("allgemein.keinWert");
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return `${h}:${String(m).padStart(2, "0")} ${i18n.t("allgemein.stundenKurz")}`;
};
