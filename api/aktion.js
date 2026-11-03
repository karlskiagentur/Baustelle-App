import { lesen, suchen, anlegen, aendern, anhangHochladen, recIdOk, f, TABELLEN, jsonAntwort, bodyLesen, handledPreflight, sendError } from "./_lib/airtable.js";
import { mitarbeiterAusToken, tokenLesen } from "./_lib/auth.js";
import { spracheOk, sprachName } from "./_lib/sprachen.js";
import { modulAn } from "./_lib/module.js";
import { berichtPdf } from "./_lib/bericht-pdf.js";

// Datum „03.11.“ in deutscher Zeit (Server läuft in UTC)
const dd = (d) => d.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit" });
const tagISO = (d) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" }); // „2026-11-03“
const MAX_FOTO_BASE64 = 4.5 * 1024 * 1024; // ~3,3 MB Bild – App verkleinert vorher auf 1600 px
const STATUS_ERLAUBT = new Set(["Offen", "Besorgt", "Nicht verfügbar"]);
const ART_ERLAUBT = new Set(["Arbeit", "Fahrzeit", "Rüstzeit"]);
const URLAUB_ART = new Set(["Urlaub", "Überstundenausgleich", "Unbezahlt", "Lehrgang"]);
const KATEGORIEN = new Set(["Zwischenstand", "Besonderheit", "Mangel", "Lieferung", "Sonstiges"]);
const ISO_TAG = /^\d{4}-\d{2}-\d{2}$/;
const gehoertMir = (rec, ma) => Array.isArray(rec?.Mitarbeiter) && rec.Mitarbeiter.includes(ma.id);
const kurz = (s, n) => String(s ?? "").slice(0, n);
const nein = (res, status, code, fehler) => jsonAntwort(res, status, { ok: false, fehler, code });

// ---- Offline-Erfassung -------------------------------------------------------------------
// Die App speichert Stempel, Fotos, Material und Tagesberichte zuerst auf dem Handy (Warteschlange)
// und sendet sie, sobald Netz da ist. Jede Sendung trägt eine Client-ID (cid) → doppelte Sendungen
// werden erkannt, und die Uhrzeit der Erfassung (zeit) → zählt statt der Eingangszeit.
const CID_RE = /^[A-Za-z0-9-]{8,64}$/;
const MAX_NACHTRAG_TAGE = 31;
/** Erfassungszeitpunkt vom Gerät übernehmen, wenn plausibel. null = unbrauchbar (zu alt/ungültig). */
function zeitpunkt(d, jetzt) {
  if (d.zeit == null || d.zeit === "") return { t: jetzt, offline: false };
  const t = new Date(d.zeit);
  if (isNaN(t) || t.getTime() < jetzt.getTime() - MAX_NACHTRAG_TAGE * 86400000) return null;
  if (t.getTime() > jetzt.getTime() + 2 * 60000) // Handy-Uhr geht vor → Serverzeit nehmen und vermerken
    return { t: jetzt, offline: false, hinweis: `Handy-Uhr ging ${Math.round((t - jetzt) / 60000)} Min. vor – Eingangszeit verwendet (${jetzt.toISOString()}).` };
  return { t, offline: jetzt.getTime() - t.getTime() > 2 * 60000 }; // > 2 Min. später angekommen = offline erfasst
}
/** Wurde diese Sendung schon gespeichert? (z. B. Antwort ging im Funkloch verloren) */
async function schonGespeichert(tabelle, cid) {
  if (!CID_RE.test(String(cid || ""))) return null;
  return (await suchen(tabelle, `{Client_ID}="${f(cid)}"`, { maxRecords: 1 }))[0] || null;
}
// Neue Felder (Client_ID, Gesendet_Am …) fehlen evtl. in älteren Bases → dann ohne sie speichern statt abzubrechen
async function mitExtras(fn, felder, extras) {
  const zusatz = Object.fromEntries(Object.entries(extras).filter(([, v]) => v !== undefined && v !== ""));
  try { return await fn({ ...felder, ...zusatz }); }
  catch (e) {
    if (e && e.status === 422 && Object.keys(zusatz).length) {
      console.warn("[aktion] Feld fehlt in Airtable – /api/setup?secret=… erneut aufrufen:", Object.keys(zusatz).join(", "));
      return fn(felder);
    }
    throw e;
  }
}
const offlineExtras = (d, zp, jetzt) => ({
  Client_ID: CID_RE.test(String(d.cid || "")) ? d.cid : undefined,
  Gesendet_Am: zp.offline ? jetzt.toISOString() : undefined,
});

/**
 * POST /api/aktion   { token, aktion, daten }
 * Auth: Session-Token; jede schreibende Aktion prüft Eigentum (IDOR-Schutz) und Eingaben.
 * Fehlerantworten tragen einen `code` (z. B. "kein_zugriff"), den die App übersetzt anzeigt.
 */
export default async function handler(req, res) {
  if (handledPreflight(req, res)) return;
  if (req.method !== "POST") return jsonAntwort(res, 405, { ok: false, fehler: "Nur POST" });
  try {
    const b = await bodyLesen(req);
    const ma = await mitarbeiterAusToken(tokenLesen(req, b));
    if (!ma) return jsonAntwort(res, 401, { ok: false, fehler: "Sitzung abgelaufen – bitte neu anmelden", code: "sitzung_abgelaufen" });

    const d = b.daten || {};
    const jetzt = new Date();
    const optLink = (id) => (recIdOk(id) ? [id] : undefined);

    switch (String(b.aktion || "")) {
      case "push_abo": {
        const abo = d.abo && typeof d.abo === "object" ? d.abo : null;
        if (!abo || !abo.endpoint || !/^https:\/\//.test(String(abo.endpoint)))
          return jsonAntwort(res, 400, { ok: false, fehler: "Ungültiges Push-Abo", code: "push_abo_ungueltig" });
        await aendern(TABELLEN.mitarbeiter, ma.id, { Push_Subscription: JSON.stringify(abo).slice(0, 4000) });
        return jsonAntwort(res, 200, { ok: true });
      }
      case "push_abo_loeschen": {
        await aendern(TABELLEN.mitarbeiter, ma.id, { Push_Subscription: "" });
        return jsonAntwort(res, 200, { ok: true });
      }
      case "sprache_setzen": {
        // App-Sprache ins Profil (Feld „Sprache“, deutscher Auswahlwert) – Push-Texte und das nächste Gerät nutzen sie
        if (!spracheOk(d.sprache)) return jsonAntwort(res, 400, { ok: false, fehler: "Sprache unbekannt", code: "ungueltig" });
        try {
          await aendern(TABELLEN.mitarbeiter, ma.id, { Sprache: sprachName(d.sprache) });
        } catch (e) {
          // Feld fehlt in älteren Bases (422): App bleibt in der gewählten Sprache, nur das Profil bleibt leer → /api/setup erneut aufrufen
          if (e && e.status === 422) { console.warn("[aktion] Feld „Sprache“ fehlt in Airtable – /api/setup?secret=… erneut aufrufen"); return jsonAntwort(res, 200, { ok: true, gespeichert: false }); }
          throw e;
        }
        return jsonAntwort(res, 200, { ok: true, gespeichert: true, sprache: d.sprache });
      }
      case "stempel_start": {
        const zp = zeitpunkt(d, jetzt);
        if (!zp) return nein(res, 400, "zeit_ungueltig", "Uhrzeit ungültig");
        const doppelt = await schonGespeichert(TABELLEN.zeit, d.cid);
        if (doppelt) return gehoertMir(doppelt, ma) ? jsonAntwort(res, 200, { ok: true, zeiteintragId: doppelt.id, doppelt: true }) : nein(res, 403, "kein_zugriff", "Kein Zugriff");
        // Einsatz muss (falls angegeben) dem Mitarbeiter gehören
        if (d.einsatzId) {
          const e = await lesen(TABELLEN.einsaetze, d.einsatzId);
          if (!e || !gehoertMir(e, ma)) return jsonAntwort(res, 403, { ok: false, fehler: "Kein Zugriff", code: "kein_zugriff" });
        }
        const eintrag = await mitExtras((felder) => anlegen(TABELLEN.zeit, felder), {
          Eintrag: `${dd(zp.t)} ${ma.Name} – läuft`,
          Mitarbeiter: [ma.id],
          ...(optLink(d.baustelleId) ? { Baustelle: [d.baustelleId] } : {}),
          ...(optLink(d.einsatzId) ? { Einsatz: [d.einsatzId] } : {}),
          Start: zp.t.toISOString(),
          Art: ART_ERLAUBT.has(d.art) ? d.art : "Arbeit",
          Quelle: zp.offline ? "App (offline)" : "App",
          ...(zp.hinweis ? { Korrektur_Log: zp.hinweis } : {}),
        }, offlineExtras(d, zp, jetzt));
        if (recIdOk(d.einsatzId)) await aendern(TABELLEN.einsaetze, d.einsatzId, { Status: "Vor Ort" });
        return jsonAntwort(res, 200, { ok: true, zeiteintragId: eintrag.id });
      }
      case "stempel_ende": {
        // Eintrag über seine ID – oder, wenn offline gestartet, über die Client-ID des Starts
        let z = null;
        if (recIdOk(d.zeiteintragId)) z = await lesen(TABELLEN.zeit, d.zeiteintragId);
        else if (CID_RE.test(String(d.startCid || ""))) z = await schonGespeichert(TABELLEN.zeit, d.startCid);
        else return jsonAntwort(res, 400, { ok: false, fehler: "zeiteintragId fehlt", code: "ungueltig" });
        if (!z) return nein(res, 404, "eintrag_fehlt", "Zeiteintrag nicht gefunden");
        if (!gehoertMir(z, ma)) return jsonAntwort(res, 403, { ok: false, fehler: "Kein Zugriff", code: "kein_zugriff" });
        if (z.Ende) return jsonAntwort(res, 409, { ok: false, fehler: "Dieser Eintrag ist bereits beendet", code: "bereits_beendet" });
        const zp = zeitpunkt(d, jetzt);
        if (!zp || (z.Start && zp.t <= new Date(z.Start))) return nein(res, 400, "zeit_ungueltig", "Uhrzeit ungültig");
        const pause = Math.max(0, Math.min(480, Number(d.pauseMinuten || 0)));
        const start = z.Start ? new Date(z.Start) : zp.t;
        await mitExtras((felder) => aendern(TABELLEN.zeit, z.id, felder), {
          Eintrag: `${dd(start)} ${ma.Name}`, Ende: zp.t.toISOString(), Pause_Minuten: pause,
          ...(zp.offline ? { Quelle: "App (offline)" } : {}),
          ...(zp.hinweis ? { Korrektur_Log: [z.Korrektur_Log, zp.hinweis].filter(Boolean).join("\n") } : {}),
        }, { Gesendet_Am: zp.offline ? jetzt.toISOString() : undefined });
        if (recIdOk(d.einsatzId)) {
          const e = await lesen(TABELLEN.einsaetze, d.einsatzId);
          if (e && gehoertMir(e, ma)) await aendern(TABELLEN.einsaetze, e.id, { Status: "Beendet" });
        }
        return jsonAntwort(res, 200, { ok: true });
      }
      case "material_status": {
        if (!recIdOk(d.materialId) || !STATUS_ERLAUBT.has(d.status))
          return jsonAntwort(res, 400, { ok: false, fehler: "materialId/status ungültig", code: "ungueltig" });
        const m = await lesen(TABELLEN.material, d.materialId);
        if (!m || !(Array.isArray(m["Zuständig"]) && m["Zuständig"].includes(ma.id)))
          return jsonAntwort(res, 403, { ok: false, fehler: "Kein Zugriff", code: "kein_zugriff" });
        await aendern(TABELLEN.material, m.id, { Status: d.status, ...(d.notiz ? { Notiz: kurz(d.notiz, 500) } : {}) });
        return jsonAntwort(res, 200, { ok: true });
      }
      case "material_anfordern": {
        const position = kurz(d.position, 120).trim();
        if (!position) return jsonAntwort(res, 400, { ok: false, fehler: "position fehlt", code: "ungueltig" });
        if (await schonGespeichert(TABELLEN.material, d.cid)) return jsonAntwort(res, 200, { ok: true, doppelt: true });
        await mitExtras((felder) => anlegen(TABELLEN.material, felder), {
          Position: position,
          Menge: kurz(d.menge, 60),
          ...(optLink(d.baustelleId) ? { Baustelle: [d.baustelleId] } : {}),
          Zuständig: [ma.id],
          Status: "Angefordert",
          Quelle: "Baustelle",
          ...(ISO_TAG.test(String(d.datum || "")) ? { "Für_Datum": d.datum } : {}),
        }, { Client_ID: CID_RE.test(String(d.cid || "")) ? d.cid : undefined });
        return jsonAntwort(res, 200, { ok: true });
      }
      case "urlaub_antrag": {
        if (!ISO_TAG.test(String(d.von || "")) || !ISO_TAG.test(String(d.bis || "")) || d.bis < d.von)
          return jsonAntwort(res, 400, { ok: false, fehler: "Zeitraum ungültig", code: "zeitraum_ungueltig" });
        const art = URLAUB_ART.has(d.art) ? d.art : "Urlaub";
        await anlegen(TABELLEN.urlaub, {
          Titel: `${art} ${ma.Name} ${d.von} – ${d.bis}`,
          Mitarbeiter: [ma.id],
          Von: d.von,
          Bis: d.bis,
          Art: art,
          Status: "Offen",
          Kommentar: kurz(d.kommentar, 500),
          Eingereicht_Am: jetzt.toISOString().slice(0, 10),
        });
        return jsonAntwort(res, 200, { ok: true });
      }
      case "foto_doku": {
        if (d.fotoBase64 && String(d.fotoBase64).length > MAX_FOTO_BASE64)
          return jsonAntwort(res, 413, { ok: false, fehler: "Foto zu groß", code: "foto_zu_gross" });
        const zp = zeitpunkt(d, jetzt);
        if (!zp) return nein(res, 400, "zeit_ungueltig", "Uhrzeit ungültig");
        if (d.einsatzId) {
          const e = await lesen(TABELLEN.einsaetze, d.einsatzId);
          if (!e || !gehoertMir(e, ma)) return jsonAntwort(res, 403, { ok: false, fehler: "Kein Zugriff", code: "kein_zugriff" });
        }
        // Schon da (Antwort ging verloren)? Dann nur ein evtl. fehlendes Foto nachreichen
        const vorher = await schonGespeichert(TABELLEN.doku, d.cid);
        if (vorher && !(Array.isArray(vorher.Ersteller) && vorher.Ersteller.includes(ma.id))) return nein(res, 403, "kein_zugriff", "Kein Zugriff");
        const eintrag = vorher || await mitExtras((felder) => anlegen(TABELLEN.doku, felder), {
          Titel: kurz(d.titel, 120) || `${dd(zp.t)} Foto von ${ma.Name}`,
          ...(optLink(d.baustelleId) ? { Baustelle: [d.baustelleId] } : {}),
          ...(optLink(d.einsatzId) ? { Einsatz: [d.einsatzId] } : {}),
          Kategorie: KATEGORIEN.has(d.kategorie) ? d.kategorie : "Zwischenstand",
          Notiz: kurz(d.notiz, 1000),
          Ersteller: [ma.id],
          Aufgenommen_Am: zp.t.toISOString(),
        }, offlineExtras(d, zp, jetzt));
        if (d.fotoBase64 && !(Array.isArray(eintrag.Foto) && eintrag.Foto.length)) {
          await anhangHochladen(eintrag.id, "Foto", {
            base64: String(d.fotoBase64),
            contentType: /^image\/(jpeg|png|webp)$/.test(String(d.fotoTyp)) ? d.fotoTyp : "image/jpeg",
            dateiname: `foto-${Date.now()}.jpg`,
          });
        }
        return jsonAntwort(res, 200, { ok: true, dokuId: eintrag.id });
      }
      case "tagesbericht": {
        // Tagesbericht / Regiebericht mit Unterschrift des Auftraggebers (Modul „tagesbericht“)
        if (!modulAn("tagesbericht")) return nein(res, 403, "modul_aus", "Funktion nicht freigeschaltet");
        const zp = zeitpunkt(d, jetzt);
        if (!zp) return nein(res, 400, "zeit_ungueltig", "Uhrzeit ungültig");
        const arbeiten = kurz(d.arbeiten, 4000).trim();
        if (!arbeiten) return nein(res, 400, "ungueltig", "Arbeiten fehlen");
        const art = d.art === "Regiebericht" ? "Regiebericht" : "Tagesbericht";
        const leute = (Array.isArray(d.leute) ? d.leute : []).slice(0, 30).map((x) => ({
          name: kurz(x && x.name, 80).trim(),
          stunden: Math.max(0, Math.min(24, Math.round((Number(String((x && x.stunden) ?? "").replace(",", ".")) || 0) * 4) / 4)),
        })).filter((x) => x.name);
        const material = kurz(d.material, 2000).trim();
        const unterzeichner = kurz(d.unterzeichner, 80).trim();
        const sig = typeof d.unterschrift === "string" ? d.unterschrift : "";
        const sigOk = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(sig) && sig.length < 600000;
        if (sig && !sigOk) return nein(res, 400, "ungueltig", "Unterschrift ungültig");
        if (sigOk && !unterzeichner) return nein(res, 400, "ungueltig", "Name des Unterzeichners fehlt");

        let einsatz = null;
        if (d.einsatzId) {
          einsatz = await lesen(TABELLEN.einsaetze, d.einsatzId);
          if (!einsatz || !gehoertMir(einsatz, ma)) return nein(res, 403, "kein_zugriff", "Kein Zugriff");
        }
        const baustelleId = recIdOk(d.baustelleId) ? d.baustelleId : (einsatz?.Baustelle || [])[0];
        const baustelle = baustelleId ? await lesen(TABELLEN.baustellen, baustelleId) : null;

        let bericht = await schonGespeichert(TABELLEN.tagesberichte, d.cid);
        if (bericht && !(Array.isArray(bericht.Erstellt_von) && bericht.Erstellt_von.includes(ma.id))) return nein(res, 403, "kein_zugriff", "Kein Zugriff");
        const summe = leute.reduce((s0, l) => s0 + l.stunden, 0);
        if (!bericht) {
          bericht = await mitExtras((felder) => anlegen(TABELLEN.tagesberichte, felder), {
            Bericht: `${art} ${dd(zp.t)}${zp.t.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin", year: "numeric" })} – ${baustelle?.Name || "ohne Baustelle"}`,
            Datum: tagISO(zp.t),
            Art: art,
            ...(baustelle ? { Baustelle: [baustelle.id] } : {}),
            ...(einsatz ? { Einsatz: [einsatz.id] } : {}),
            Erstellt_von: [ma.id],
            Arbeiten: arbeiten,
            Personal_Stunden: leute.map((l) => `${l.name}: ${String(l.stunden).replace(".", ",")} Std.`).join("\n"),
            Stunden_gesamt: summe,
            Material: material,
            Unterzeichner: unterzeichner,
            Status: sigOk ? "Unterschrieben" : "Ohne Unterschrift",
            ...(sigOk ? { Unterschrieben_Am: zp.t.toISOString() } : {}),
          }, { ...offlineExtras(d, zp, jetzt) });
        }
        // PDF + Unterschrift anhängen (fehlt nach abgebrochener Sendung → wird nachgereicht)
        const sigBytes = sigOk ? Buffer.from(sig.split(",")[1], "base64") : null;
        if (!(Array.isArray(bericht.PDF) && bericht.PDF.length)) {
          const pdf = await berichtPdf({ art, zeit: zp.t, ma, baustelle, einsatz, arbeiten, leute, summe, material, unterzeichner, unterschriftPng: sigBytes, offline: zp.offline });
          const name = `${art}_${tagISO(zp.t)}_${String(baustelle?.Name || "Baustelle").replace(/[^A-Za-z0-9ÄÖÜäöüß]+/g, "_").slice(0, 40)}.pdf`;
          await anhangHochladen(bericht.id, "PDF", { base64: Buffer.from(pdf).toString("base64"), contentType: "application/pdf", dateiname: name });
        }
        if (sigBytes && !(Array.isArray(bericht.Unterschrift) && bericht.Unterschrift.length)) {
          await anhangHochladen(bericht.id, "Unterschrift", { base64: sigBytes.toString("base64"), contentType: "image/png", dateiname: "unterschrift.png" });
        }
        return jsonAntwort(res, 200, { ok: true, berichtId: bericht.id });
      }
      case "dokument_gesehen": {
        if (!recIdOk(d.dokumentId)) return jsonAntwort(res, 400, { ok: false, fehler: "dokumentId fehlt", code: "ungueltig" });
        const dok = await lesen(TABELLEN.dokumente, d.dokumentId);
        if (!dok || !gehoertMir(dok, ma)) return jsonAntwort(res, 403, { ok: false, fehler: "Kein Zugriff", code: "kein_zugriff" });
        await aendern(TABELLEN.dokumente, dok.id, { Vom_Mitarbeiter_Gesehen: true });
        return jsonAntwort(res, 200, { ok: true });
      }
      default:
        return jsonAntwort(res, 400, { ok: false, fehler: "Unbekannte Aktion", code: "ungueltig" });
    }
  } catch (e) {
    return sendError(res, e, "api/aktion");
  }
}
