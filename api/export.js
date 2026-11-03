import { jsonAntwort, sendError } from "./_lib/airtable.js";
import { hookErlaubt } from "./_lib/auth.js";
import { modulAn } from "./_lib/module.js";
import { lohnExport } from "./_lib/export.js";

/**
 * Lohn-Export zum Herunterladen (Modul „export“) – fürs Büro als Lesezeichen:
 *   GET /api/export?secret=<HOOK_SECRET>&monat=2026-10&datei=zeiten   → Zeiten_2026-10.csv (jede Stempelung)
 *   GET …&datei=summen                                                → Summen je Mitarbeiter inkl. Urlaub/Krank
 *   GET …&datei=datev                                                 → DATEV-LODAS-Importdatei (wenn eingerichtet)
 * Ohne monat = Vormonat. Am 1. jedes Monats legt der Stundenzettel-Cron die Dateien zusätzlich
 * in der Airtable-Tabelle „Exporte“ ab.
 */
export default async function handler(req, res) {
  if (!hookErlaubt(req)) return jsonAntwort(res, 401, { ok: false, fehler: "nicht erlaubt (?secret=…)" });
  if (!modulAn("export")) return jsonAntwort(res, 403, { ok: false, fehler: "Modul „export“ ist für diesen Betrieb nicht freigeschaltet", code: "modul_aus" });
  try {
    const url = new URL(req.url, "http://x");
    let monat = url.searchParams.get("monat");
    if (!/^\d{4}-\d{2}$/.test(monat || "")) {
      const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1);
      monat = d.toISOString().slice(0, 7);
    }
    const art = String(url.searchParams.get("datei") || "zeiten").toLowerCase();
    const ex = await lohnExport(monat);
    const datei = ex.dateien.find((x) => x.name.toLowerCase().startsWith(art === "datev" ? "datev" : art));
    if (!datei) return jsonAntwort(res, 400, { ok: false, fehler: ex.hinweise.join(" ") || "Datei unbekannt (zeiten | summen | datev)" });
    res.status(200);
    res.setHeader("Content-Type", `${datei.typ}; charset=utf-8`);
    res.setHeader("Content-Disposition", `attachment; filename="${datei.name}"`);
    res.setHeader("Cache-Control", "no-store");
    res.end(datei.inhalt);
  } catch (e) {
    return sendError(res, e, "api/export");
  }
}
