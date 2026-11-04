import { suchen, TABELLEN, cors, jsonAntwort } from "./_lib/airtable.js";
import { unicodeSchriftDa } from "./_lib/pdf.js";
import { aktiveModule } from "./_lib/module.js";
import { uebersetzungBereit } from "./_lib/uebersetzung.js";

/**
 * GET /api/health – für Uptime-Monitoring (z. B. Betterstack/UptimeRobot, 5-Min-Ping).
 * 200 nur, wenn Env vollständig und Airtable erreichbar; sonst 503.
 */
export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  const fehlend = ["AIRTABLE_TOKEN", "AIRTABLE_BASE_ID", "VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "SETUP_SECRET"].filter((n) => !process.env[n]);
  const checks = { env: fehlend.length === 0, airtable: true };
  try { await suchen(TABELLEN.mitarbeiter, "", { maxRecords: 1, felder: ["Name"] }); } catch { checks.airtable = false; }
  const ok = checks.env && checks.airtable;
  // pdfSchrift: Unicode-Schrift für PDFs mit ausgeliefert (sonst Ersatzzeichen statt „ş“, „ł“ …)
  return jsonAntwort(res, ok ? 200 : 503, { status: ok ? "ok" : "degraded", checks, pdfSchrift: unicodeSchriftDa(), module: aktiveModule(), uebersetzungBereit: uebersetzungBereit(req), fehlendeEnv: fehlend, zeit: new Date().toISOString() });
}
