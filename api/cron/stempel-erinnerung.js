import { suchen, TABELLEN, f, jsonAntwort, sendError } from "../_lib/airtable.js";
import { pushAnMitarbeiter, mitarbeiterMitAbo } from "../_lib/push.js";
import { cronErlaubt } from "../_lib/auth.js";
import { pushText } from "../_lib/sprachen.js";

/**
 * GET /api/cron/stempel-erinnerung
 * Werktags morgens (vercel.json): erinnert alle, die HEUTE eingeteilt sind
 * und noch keinen Zeiteintrag haben, ans Einstempeln.
 */
export default async function handler(req, res) {
  if (!cronErlaubt(req)) return jsonAntwort(res, 401, { ok: false, fehler: "nicht erlaubt" });
  try {
    const [einsaetze, mas] = await Promise.all([
      suchen(TABELLEN.einsaetze, `IS_SAME({Datum}, TODAY(), 'day')`),
      mitarbeiterMitAbo(),
    ]);
    let gesendet = 0;
    const eingeteilt = new Set();
    for (const e of einsaetze) for (const id of e.Mitarbeiter || []) eingeteilt.add(id);

    for (const maId of eingeteilt) {
      const ma = mas.find((m) => m.id === maId);
      if (!ma) continue;
      const offene = await suchen(
        TABELLEN.zeit,
        `AND(FIND("${f(ma.Name)}", ARRAYJOIN({Mitarbeiter})), IS_SAME({Start}, TODAY(), 'day'))`,
        { maxRecords: 1 }
      );
      if (offene.length) continue;
      const erg = await pushAnMitarbeiter(ma, {
        titel: pushText(ma, "erinnerung.titel"),
        text: pushText(ma, "erinnerung.text"),
        url: "/",
      });
      if (erg.ok) gesendet++;
    }
    return jsonAntwort(res, 200, { ok: true, eingeteilt: eingeteilt.size, erinnerungen: gesendet });
  } catch (e) {
    return sendError(res, e, "api/cron/stempel-erinnerung");
  }
}
