import { suchen, aendern, TABELLEN, jsonAntwort, sendError } from "../_lib/airtable.js";
import { pushAnMitarbeiter, mitarbeiterMitAbo } from "../_lib/push.js";
import { hookErlaubt } from "../_lib/auth.js";
import { pushText } from "../_lib/sprachen.js";

/**
 * GET /api/cron/einsatz-push
 * Läuft täglich um 17:30 (vercel.json, UTC-Zeitplan) und schickt jedem eingeteilten
 * Mitarbeiter seine Einsätze für MORGEN als Push. Mehrfachversand wird über
 * das Feld Push_gesendet am Einsatz verhindert. Text in der Sprache des Empfängers
 * (Feld „Sprache“ am Mitarbeiter, Fallback Deutsch); Aufgabe/Adresse bleiben wie in Airtable.
 */
export default async function handler(req, res) {
  if (!hookErlaubt(req)) return jsonAntwort(res, 401, { ok: false, fehler: "nicht erlaubt" });
  try {
    const einsaetze = await suchen(
      TABELLEN.einsaetze,
      `AND(IS_SAME({Datum}, DATEADD(TODAY(), 1, 'days'), 'day'), NOT({Push_gesendet}))`
    );
    if (!einsaetze.length) return jsonAntwort(res, 200, { ok: true, hinweis: "keine Einsätze morgen" });

    const [mas, baustellen] = await Promise.all([mitarbeiterMitAbo(), suchen(TABELLEN.baustellen, "")]);
    const adresseVon = new Map(baustellen.map((b) => [b.id, String(b.Adresse || b.Name || "").replace(/\n/g, ", ")]));
    const proMa = new Map();
    for (const e of einsaetze) {
      for (const maId of e.Mitarbeiter || []) {
        if (!proMa.has(maId)) proMa.set(maId, []);
        proMa.get(maId).push(e);
      }
    }

    let gesendet = 0;
    for (const [maId, liste] of proMa) {
      const ma = mas.find((m) => m.id === maId);
      if (!ma) continue; // kein Abo – Mitarbeiter sieht alles in der App
      const e = liste[0];
      const adresse = adresseVon.get((e.Baustelle || [])[0]) || "";
      const teile = [
        e.Aufgabe || pushText(ma, "einsatz.standard"),
        String(adresse).replace(/\n/g, ", "),
        e.Beginn ? pushText(ma, "einsatz.beginn", { zeit: e.Beginn }) : null,
        Array.isArray(e.Fahrzeug) && e.Fahrzeug.length ? pushText(ma, "einsatz.fahrzeug") : null,
      ].filter(Boolean);
      const erg = await pushAnMitarbeiter(ma, {
        titel: liste.length > 1 ? pushText(ma, "einsatz.titelMehrere", { n: liste.length }) : pushText(ma, "einsatz.titel"),
        text: teile.join(" · "),
        url: "/",
      });
      if (erg.ok) gesendet++;
    }

    for (const e of einsaetze) await aendern(TABELLEN.einsaetze, e.id, { Push_gesendet: true });
    return jsonAntwort(res, 200, { ok: true, einsaetze: einsaetze.length, pushes: gesendet });
  } catch (e) {
    return sendError(res, e, "api/cron/einsatz-push");
  }
}
