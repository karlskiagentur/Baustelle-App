import { suchen, aendern, TABELLEN, jsonAntwort, sendError } from "../_lib/airtable.js";
import { pushAnMitarbeiter, mitarbeiterMitAbo } from "../_lib/push.js";
import { hookErlaubt } from "../_lib/auth.js";
import { pushText, spracheVon } from "../_lib/sprachen.js";
import { datensaetzeUebersetzen } from "../_lib/uebersetzung.js";

/**
 * GET /api/cron/dokument-push?secret=…
 * Verschickt Pushes für Dokumente und Mitteilungen mit Push_senden = "Senden"
 * und stellt sie danach auf "Gesendet" (bewusste Freigabe, Pflege-App-Muster).
 *
 * Aufruf: per Airtable-Automation (Skript-Aktion mit HOOK_SECRET, sobald Push_senden = "Senden")
 * oder von Hand im Browser (?secret=SETUP_SECRET). Dokument-Pushes sind bewusst neutral und kommen
 * in der Sprache des Empfängers; Mitteilungen mit Modul „uebersetzung“ ebenfalls (sonst wie vom Büro geschrieben).
 */
export default async function handler(req, res) {
  if (!hookErlaubt(req)) return jsonAntwort(res, 401, { ok: false, fehler: "nicht erlaubt" });
  try {
    const [docs, mitt, mas] = await Promise.all([
      suchen(TABELLEN.dokumente, `{Push_senden}="Senden"`),
      suchen(TABELLEN.mitteilungen, `{Push_senden}="Senden"`),
      mitarbeiterMitAbo(),
    ]);

    let gesendet = 0;

    for (const doc of docs) {
      for (const maId of doc.Mitarbeiter || []) {
        const ma = mas.find((m) => m.id === maId);
        if (ma) {
          const erg = await pushAnMitarbeiter(ma, {
            titel: pushText(ma, "dokument.titel"),
            text: pushText(ma, "dokument.text"),
            url: "/",
          });
          if (erg.ok) gesendet++;
        }
      }
      await aendern(TABELLEN.dokumente, doc.id, { Push_senden: "Gesendet" });
    }

    for (const m of mitt) {
      const ziel = m.Zielgruppe || "Alle Mitarbeiter";
      let empfaenger = [];
      if (ziel === "Alle Mitarbeiter") empfaenger = mas;
      else if (ziel === "Einzelne") empfaenger = mas.filter((x) => (m.Empfänger_Einzeln || []).includes(x.id));
      else empfaenger = mas.filter((x) => x.Kolonne === ziel);
      const jeSprache = new Map(); // je Empfängersprache einmal übersetzen (wird gemerkt → App nutzt es mit)
      for (const ma of empfaenger) {
        const sp = spracheVon(ma);
        if (!jeSprache.has(sp)) jeSprache.set(sp, (await datensaetzeUebersetzen(TABELLEN.mitteilungen, ["Titel", "Nachricht"], [m], sp, req))[0]);
        const mt = jeSprache.get(sp);
        const erg = await pushAnMitarbeiter(ma, {
          titel: mt.Titel || pushText(ma, "mitteilung.titel"),
          text: String(mt.Nachricht || "").slice(0, 160),
          url: "/",
        });
        if (erg.ok) gesendet++;
      }
      await aendern(TABELLEN.mitteilungen, m.id, { Push_senden: "Gesendet" });
    }

    return jsonAntwort(res, 200, { ok: true, dokumente: docs.length, mitteilungen: mitt.length, pushes: gesendet });
  } catch (e) {
    return sendError(res, e, "api/cron/dokument-push");
  }
}
