import crypto from "node:crypto";
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

function geheimnisAusRequest(req) {
  const kopf = String(req.headers?.["x-hook-secret"] || "");
  if (kopf) return kopf;
  try { return new URL(req.url, "http://x").searchParams.get("secret") || ""; } catch { return ""; }
}
const gleich = (a, b) => !!a && !!b && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Schützt Cron-/Setup-/Hook-Endpunkte (fail closed):
 *  - Vercel-Cron:  Authorization: Bearer <CRON_SECRET>
 *  - Betreiber (Setup, manuelle Aufrufe): ?secret=<SETUP_SECRET>  oder Header X-Hook-Secret
 */
export function cronErlaubt(req) {
  const auth = String(req.headers?.authorization || "");
  if (process.env.CRON_SECRET && gleich(auth, `Bearer ${process.env.CRON_SECRET}`)) return true;
  return gleich(geheimnisAusRequest(req), process.env.SETUP_SECRET || "");
}

/**
 * Wie cronErlaubt, zusätzlich mit HOOK_SECRET: das Geheimnis für Airtable-Automationen
 * (steht im Automations-Skript, das Base-Mitarbeiter sehen können) – darf Pushes auslösen,
 * aber NICHT /api/setup. Für die Push-Endpunkte (dokument-push, einsatz-push, stempel-erinnerung).
 */
export function hookErlaubt(req) {
  if (cronErlaubt(req)) return true;
  return gleich(geheimnisAusRequest(req), process.env.HOOK_SECRET || "");
}
