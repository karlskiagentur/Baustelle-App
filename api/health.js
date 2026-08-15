import { suchen, TABELLEN, cors, jsonAntwort } from "./_lib/airtable.js";

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
  return jsonAntwort(res, ok ? 200 : 503, { status: ok ? "ok" : "degraded", checks, fehlendeEnv: fehlend, zeit: new Date().toISOString() });
}
