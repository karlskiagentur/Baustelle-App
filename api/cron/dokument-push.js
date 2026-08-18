import { suchen, aendern, TABELLEN, jsonAntwort, sendError } from "../_lib/airtable.js";
import { pushAnMitarbeiter, mitarbeiterMitAbo } from "../_lib/push.js";
import { cronErlaubt } from "../_lib/auth.js";
import { pushText } from "../_lib/sprachen.js";

/**
 * GET /api/cron/dokument-push?secret=…
 * Verschickt Pushes für Dokumente und Mitteilungen mit Push_senden = "Senden"
 * und stellt sie danach auf "Gesendet" (bewusste Freigabe, Pflege-App-Muster).
 *
 * Aufruf: per Airtable-Automation (Webhook, sobald Push_senden = "Senden")
 * oder einfach von Hand im Browser. Dokument-Pushes sind bewusst neutral und kommen
 * in der Sprache des Empfängers; Mitteilungen werden so verschickt, wie das Büro sie schreibt.
 */
export default async function handler(req, res) {
  if (!cronErlaubt(req)) return jsonAntwort(res, 401, { ok: false, fehler: "nicht erlaubt" });
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
      for (const ma of empfaenger) {
        const erg = await pushAnMitarbeiter(ma, {
          titel: m.Titel || pushText(ma, "mitteilung.titel"),
          text: String(m.Nachricht || "").slice(0, 160),
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
