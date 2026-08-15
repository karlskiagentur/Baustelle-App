import { lesen, anlegen, aendern, anhangHochladen, recIdOk, TABELLEN, jsonAntwort, bodyLesen, handledPreflight, sendError } from "./_lib/airtable.js";
import { mitarbeiterAusToken, tokenLesen } from "./_lib/auth.js";

const dd = (d) => String(d.getDate()).padStart(2, "0") + "." + String(d.getMonth() + 1).padStart(2, "0") + ".";
const MAX_FOTO_BASE64 = 4.5 * 1024 * 1024; // ~3,3 MB Bild – App verkleinert vorher auf 1600 px
const STATUS_ERLAUBT = new Set(["Offen", "Besorgt", "Nicht verfügbar"]);
const ART_ERLAUBT = new Set(["Arbeit", "Fahrzeit", "Rüstzeit"]);
const URLAUB_ART = new Set(["Urlaub", "Überstundenausgleich", "Unbezahlt", "Lehrgang"]);
const KATEGORIEN = new Set(["Zwischenstand", "Besonderheit", "Mangel", "Lieferung", "Sonstiges"]);
const ISO_TAG = /^\d{4}-\d{2}-\d{2}$/;
const gehoertMir = (rec, ma) => Array.isArray(rec?.Mitarbeiter) && rec.Mitarbeiter.includes(ma.id);
const kurz = (s, n) => String(s ?? "").slice(0, n);

/**
 * POST /api/aktion   { token, aktion, daten }
 * Auth: Session-Token; jede schreibende Aktion prüft Eigentum (IDOR-Schutz) und Eingaben.
 */
export default async function handler(req, res) {
  if (handledPreflight(req, res)) return;
  if (req.method !== "POST") return jsonAntwort(res, 405, { ok: false, fehler: "Nur POST" });
  try {
    const b = await bodyLesen(req);
    const ma = await mitarbeiterAusToken(tokenLesen(req, b));
    if (!ma) return jsonAntwort(res, 401, { ok: false, fehler: "Sitzung abgelaufen – bitte neu anmelden" });

    const d = b.daten || {};
    const jetzt = new Date();
    const optLink = (id) => (recIdOk(id) ? [id] : undefined);

    switch (String(b.aktion || "")) {
      case "push_abo": {
        const abo = d.abo && typeof d.abo === "object" ? d.abo : null;
        if (!abo || !abo.endpoint || !/^https:\/\//.test(String(abo.endpoint)))
          return jsonAntwort(res, 400, { ok: false, fehler: "Ungültiges Push-Abo" });
        await aendern(TABELLEN.mitarbeiter, ma.id, { Push_Subscription: JSON.stringify(abo).slice(0, 4000) });
        return jsonAntwort(res, 200, { ok: true });
      }
      case "push_abo_loeschen": {
        await aendern(TABELLEN.mitarbeiter, ma.id, { Push_Subscription: "" });
        return jsonAntwort(res, 200, { ok: true });
      }
      case "stempel_start": {
        // Einsatz muss (falls angegeben) dem Mitarbeiter gehören
        if (d.einsatzId) {
          const e = await lesen(TABELLEN.einsaetze, d.einsatzId);
          if (!e || !gehoertMir(e, ma)) return jsonAntwort(res, 403, { ok: false, fehler: "Kein Zugriff" });
        }
        const eintrag = await anlegen(TABELLEN.zeit, {
          Eintrag: `${dd(jetzt)} ${ma.Name} – läuft`,
          Mitarbeiter: [ma.id],
          ...(optLink(d.baustelleId) ? { Baustelle: [d.baustelleId] } : {}),
          ...(optLink(d.einsatzId) ? { Einsatz: [d.einsatzId] } : {}),
          Start: jetzt.toISOString(),
          Art: ART_ERLAUBT.has(d.art) ? d.art : "Arbeit",
          Quelle: "App",
        });
        if (recIdOk(d.einsatzId)) await aendern(TABELLEN.einsaetze, d.einsatzId, { Status: "Vor Ort" });
        return jsonAntwort(res, 200, { ok: true, zeiteintragId: eintrag.id });
      }
      case "stempel_ende": {
        if (!recIdOk(d.zeiteintragId)) return jsonAntwort(res, 400, { ok: false, fehler: "zeiteintragId fehlt" });
        const z = await lesen(TABELLEN.zeit, d.zeiteintragId);
        if (!z || !gehoertMir(z, ma)) return jsonAntwort(res, 403, { ok: false, fehler: "Kein Zugriff" });
        if (z.Ende) return jsonAntwort(res, 409, { ok: false, fehler: "Dieser Eintrag ist bereits beendet" });
        const pause = Math.max(0, Math.min(480, Number(d.pauseMinuten || 0)));
        await aendern(TABELLEN.zeit, z.id, { Eintrag: `${dd(jetzt)} ${ma.Name}`, Ende: jetzt.toISOString(), Pause_Minuten: pause });
        if (recIdOk(d.einsatzId)) {
          const e = await lesen(TABELLEN.einsaetze, d.einsatzId);
          if (e && gehoertMir(e, ma)) await aendern(TABELLEN.einsaetze, e.id, { Status: "Beendet" });
        }
        return jsonAntwort(res, 200, { ok: true });
      }
      case "material_status": {
        if (!recIdOk(d.materialId) || !STATUS_ERLAUBT.has(d.status))
          return jsonAntwort(res, 400, { ok: false, fehler: "materialId/status ungültig" });
        const m = await lesen(TABELLEN.material, d.materialId);
        if (!m || !(Array.isArray(m["Zuständig"]) && m["Zuständig"].includes(ma.id)))
          return jsonAntwort(res, 403, { ok: false, fehler: "Kein Zugriff" });
        await aendern(TABELLEN.material, m.id, { Status: d.status, ...(d.notiz ? { Notiz: kurz(d.notiz, 500) } : {}) });
        return jsonAntwort(res, 200, { ok: true });
      }
      case "material_anfordern": {
        const position = kurz(d.position, 120).trim();
        if (!position) return jsonAntwort(res, 400, { ok: false, fehler: "position fehlt" });
        await anlegen(TABELLEN.material, {
          Position: position,
          Menge: kurz(d.menge, 60),
          ...(optLink(d.baustelleId) ? { Baustelle: [d.baustelleId] } : {}),
          Zuständig: [ma.id],
          Status: "Angefordert",
          Quelle: "Baustelle",
          ...(ISO_TAG.test(String(d.datum || "")) ? { "Für_Datum": d.datum } : {}),
        });
        return jsonAntwort(res, 200, { ok: true });
      }
      case "urlaub_antrag": {
        if (!ISO_TAG.test(String(d.von || "")) || !ISO_TAG.test(String(d.bis || "")) || d.bis < d.von)
          return jsonAntwort(res, 400, { ok: false, fehler: "Zeitraum ungültig" });
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
          return jsonAntwort(res, 413, { ok: false, fehler: "Foto zu groß" });
        if (d.einsatzId) {
          const e = await lesen(TABELLEN.einsaetze, d.einsatzId);
          if (!e || !gehoertMir(e, ma)) return jsonAntwort(res, 403, { ok: false, fehler: "Kein Zugriff" });
        }
        const eintrag = await anlegen(TABELLEN.doku, {
          Titel: kurz(d.titel, 120) || `${dd(jetzt)} Foto von ${ma.Name}`,
          ...(optLink(d.baustelleId) ? { Baustelle: [d.baustelleId] } : {}),
          ...(optLink(d.einsatzId) ? { Einsatz: [d.einsatzId] } : {}),
          Kategorie: KATEGORIEN.has(d.kategorie) ? d.kategorie : "Zwischenstand",
          Notiz: kurz(d.notiz, 1000),
          Ersteller: [ma.id],
          Aufgenommen_Am: jetzt.toISOString(),
        });
        if (d.fotoBase64) {
          await anhangHochladen(eintrag.id, "Foto", {
            base64: String(d.fotoBase64),
            contentType: /^image\/(jpeg|png|webp)$/.test(String(d.fotoTyp)) ? d.fotoTyp : "image/jpeg",
            dateiname: `foto-${Date.now()}.jpg`,
          });
        }
        return jsonAntwort(res, 200, { ok: true, dokuId: eintrag.id });
      }
      case "dokument_gesehen": {
        if (!recIdOk(d.dokumentId)) return jsonAntwort(res, 400, { ok: false, fehler: "dokumentId fehlt" });
        const dok = await lesen(TABELLEN.dokumente, d.dokumentId);
        if (!dok || !gehoertMir(dok, ma)) return jsonAntwort(res, 403, { ok: false, fehler: "Kein Zugriff" });
        await aendern(TABELLEN.dokumente, dok.id, { Vom_Mitarbeiter_Gesehen: true });
        return jsonAntwort(res, 200, { ok: true });
      }
      default:
        return jsonAntwort(res, 400, { ok: false, fehler: "Unbekannte Aktion" });
    }
  } catch (e) {
    return sendError(res, e, "api/aktion");
  }
}
