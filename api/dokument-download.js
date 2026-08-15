import { lesen, TABELLEN, handledPreflight, fehlerMelden } from "./_lib/airtable.js";
import { mitarbeiterAusToken, tokenLesen } from "./_lib/auth.js";

// Nur echte Airtable-Anhang-Domains als Quelle (kein offener Proxy / SSRF).
const ERLAUBT = ["airtableusercontent.com", "dl.airtable.com"];
const hostOk = (u) => {
  try { const { protocol, hostname } = new URL(u); return protocol === "https:" && ERLAUBT.some((h) => hostname === h || hostname.endsWith("." + h)); }
  catch { return false; }
};

/**
 * GET /api/dokument-download?id=recXXX&token=…
 * Liefert die Datei eines Dokuments – NUR wenn es dem eingeloggten Mitarbeiter gehört.
 * (Airtable-Anhang-URLs laufen nach ~2 h ab; deshalb holt der Server sie frisch.)
 */
export default async function handler(req, res) {
  if (handledPreflight(req, res)) return;
  if (req.method !== "GET") { res.status(405).send("Nur GET"); return; }
  try {
    const url = new URL(req.url, "http://x");
    const ma = await mitarbeiterAusToken(tokenLesen(req));
    if (!ma) { res.status(401).send("Nicht autorisiert"); return; }
    const dok = await lesen(TABELLEN.dokumente, url.searchParams.get("id"));
    if (!dok || !(Array.isArray(dok.Mitarbeiter) && dok.Mitarbeiter.includes(ma.id))) { res.status(403).send("Kein Zugriff"); return; }
    const anhang = Array.isArray(dok.Datei) ? dok.Datei[0] : null;
    if (!anhang || !hostOk(anhang.url)) { res.status(404).send("Keine Datei"); return; }

    const datei = await fetch(anhang.url);
    if (!datei.ok) { res.status(502).send("Datei konnte nicht geladen werden"); return; }
    const buffer = Buffer.from(await datei.arrayBuffer());
    const name = String(anhang.filename || "Dokument.pdf").replace(/[^A-Za-z0-9._ -]/g, "_").slice(0, 120);
    res.setHeader("Content-Type", anhang.type || "application/octet-stream");
    res.setHeader("Content-Disposition", `inline; filename="${name}"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.status(200).send(buffer);
  } catch (e) {
    fehlerMelden("api/dokument-download", e);
    res.status(500).send("Download fehlgeschlagen");
  }
}
