import { suchen, TABELLEN, f } from "./airtable.js";

const TOKEN_RE = /^[A-Za-z0-9_-]{20,}$/;

/** Token aus Header (bevorzugt), Body oder Query lesen. */
export function tokenLesen(req, body) {
  const h = (req.headers && (req.headers.authorization || req.headers.Authorization)) || "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  if (m) return m[1].trim();
  if (body && body.token) return String(body.token);
  try {
    const url = new URL(req.url, "http://x");
    return url.searchParams.get("token") || "";
  } catch { return ""; }
}

/** Prüft das Session-Token und liefert den (aktiven) Mitarbeiter-Datensatz oder null. */
export async function mitarbeiterAusToken(token) {
  if (!token || !TOKEN_RE.test(String(token))) return null;
  const treffer = await suchen(TABELLEN.mitarbeiter, `{Session_Token}="${f(token)}"`, { maxRecords: 1 });
  if (!treffer.length) return null;
  const ma = treffer[0];
  // Airtable liefert eine NICHT angehakte Checkbox als undefined – deshalb `!== true` (nicht `=== false`)
  if (ma.Aktiv !== true) return null;
  return ma;
}

/**
 * Schützt Cron-/Setup-/Hook-Endpunkte (fail closed):
 *  - Vercel-Cron:  Authorization: Bearer <CRON_SECRET>
 *  - Airtable-Automation / manuell: ?secret=<SETUP_SECRET>  oder Header X-Hook-Secret
 */
export function cronErlaubt(req) {
  const auth = String(req.headers?.authorization || "");
  if (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) return true;
  const geheim = process.env.SETUP_SECRET || "";
  if (!geheim) return false;
  if (String(req.headers?.["x-hook-secret"] || "") === geheim) return true;
  try {
    const url = new URL(req.url, "http://x");
    return url.searchParams.get("secret") === geheim;
  } catch { return false; }
}
