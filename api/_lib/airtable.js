// Zentrale Helfer (Muster: Wunschlos api/_lib.js) – Airtable-REST, Formel-Escape,
// einheitliche Fehlerantwort ohne Detail-Leak, Alarm-Mail per Resend, CORS/Preflight.
const API = "https://api.airtable.com/v0";

export const TABELLEN = {
  mitarbeiter: "Mitarbeiter",
  baustellen: "Baustellen",
  einsaetze: "Einsätze",
  fahrzeuge: "Fahrzeuge",
  material: "Materialbedarf",
  zeit: "Zeiteinträge",
  urlaub: "Urlaubsanträge",
  doku: "Doku",
  dokumente: "Dokumente",
  mitteilungen: "Mitteilungen",
};

// Record-IDs prüfen, bevor sie in URLs/Formeln landen.
export const REC_RE = /^rec[A-Za-z0-9]{14,}$/;
export const recIdOk = (id) => REC_RE.test(String(id || ""));

function kopf() {
  return {
    Authorization: `Bearer ${process.env.AIRTABLE_TOKEN}`,
    "Content-Type": "application/json",
  };
}
function basisUrl(tabelle) {
  return `${API}/${process.env.AIRTABLE_BASE_ID}/${encodeURIComponent(tabelle)}`;
}

// Fehlerobjekt mit Status/Detail (Detail geht NIE an den Client, nur ins Log/Alarm)
async function airtableFehler(prefix, r) {
  const e = new Error(`${prefix}: Airtable ${r.status}`);
  e.status = r.status;
  e.detail = await r.text().catch(() => "");
  return e;
}

/** Alle Datensätze einer Tabelle (paginiert), optional gefiltert/sortiert. */
export async function suchen(tabelle, formel, extra = {}) {
  const alle = [];
  let offset;
  let schutz = 0;
  do {
    const p = new URLSearchParams();
    if (formel) p.set("filterByFormula", formel);
    if (extra.sortFeld) {
      p.set("sort[0][field]", extra.sortFeld);
      p.set("sort[0][direction]", extra.sortRichtung || "asc");
    }
    if (extra.maxRecords) p.set("maxRecords", String(extra.maxRecords));
    (extra.felder || []).forEach((f0) => p.append("fields[]", f0));
    if (offset) p.set("offset", offset);
    const r = await fetch(`${basisUrl(tabelle)}?${p}`, { headers: kopf() });
    if (!r.ok) throw await airtableFehler(`suchen ${tabelle}`, r);
    const j = await r.json();
    alle.push(...j.records);
    offset = j.offset;
  } while (offset && ++schutz < 50);
  return alle.map((r) => ({ id: r.id, ...r.fields }));
}

export async function lesen(tabelle, id) {
  if (!recIdOk(id)) return null;
  const r = await fetch(`${basisUrl(tabelle)}/${id}`, { headers: kopf() });
  if (r.status === 404) return null;
  if (!r.ok) throw await airtableFehler(`lesen ${tabelle}`, r);
  const j = await r.json();
  return { id: j.id, ...j.fields };
}

export async function anlegen(tabelle, felder) {
  const r = await fetch(basisUrl(tabelle), {
    method: "POST",
    headers: kopf(),
    body: JSON.stringify({ records: [{ fields: felder }], typecast: true }),
  });
  if (!r.ok) throw await airtableFehler(`anlegen ${tabelle}`, r);
  const j = await r.json();
  return { id: j.records[0].id, ...j.records[0].fields };
}

export async function aendern(tabelle, id, felder) {
  if (!recIdOk(id)) { const e = new Error("Ungültige ID"); e.status = 400; throw e; }
  const r = await fetch(basisUrl(tabelle), {
    method: "PATCH",
    headers: kopf(),
    body: JSON.stringify({ records: [{ id, fields: felder }], typecast: true }),
  });
  if (!r.ok) throw await airtableFehler(`ändern ${tabelle}`, r);
  const j = await r.json();
  return { id: j.records[0].id, ...j.records[0].fields };
}

/** Datei (Base64) an ein Attachment-Feld hängen (Airtable-Limit 5 MB je Upload). */
export async function anhangHochladen(recordId, feldName, { base64, contentType, dateiname }) {
  if (!recIdOk(recordId)) { const e = new Error("Ungültige ID"); e.status = 400; throw e; }
  const url = `https://content.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${recordId}/${encodeURIComponent(feldName)}/uploadAttachment`;
  const r = await fetch(url, {
    method: "POST",
    headers: kopf(),
    body: JSON.stringify({ contentType, filename: dateiname, file: base64 }),
  });
  if (!r.ok) throw await airtableFehler("upload", r);
  return r.json();
}

/** Escape für Strings in filterByFormula (Injection-Schutz). Pflicht für JEDEN String. */
export function f(text) {
  return String(text ?? "").replace(/(["\\])/g, "\\$1");
}
export const esc = f;

// ---------- HTTP-Helfer ---------------------------------------------------------
export function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
}
/** true, wenn OPTIONS bereits beantwortet wurde (dann im Handler returnen). */
export function handledPreflight(req, res) {
  cors(res);
  if (req.method === "OPTIONS") { res.status(204).end(); return true; }
  return false;
}

export function jsonAntwort(res, status, daten) {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(daten));
}

export async function bodyLesen(req) {
  if (req.body) return typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  const teile = [];
  for await (const t of req) teile.push(Buffer.isBuffer(t) ? t : Buffer.from(String(t)));
  const roh = Buffer.concat(teile).toString("utf8");
  return roh ? JSON.parse(roh) : {};
}

// ---------- Alarmierung (Resend, ohne n8n) ------------------------------------------
/** Alarm-Mail an den Betreiber – fire and forget, wirft nie. Ohne RESEND_API_KEY nur Log. */
export async function alarm(betreff, text) {
  try {
    if (!process.env.RESEND_API_KEY) { console.warn("[alarm] RESEND_API_KEY fehlt – nur Log:", betreff); return; }
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.ALERT_FROM || "Baustellen-App <onboarding@resend.dev>",
        to: [process.env.ALERT_EMAIL || "denis@sprach-ki.live"],
        subject: betreff,
        text,
      }),
    });
  } catch { /* Alarm darf den Request nie stören */ }
}

export function fehlerMelden(quelle, fehler, kontext = {}) {
  try {
    const text = `Quelle: ${quelle}\nZeit: ${new Date().toISOString()}\nUmgebung: ${process.env.VERCEL_ENV || "lokal"}\n\n` +
      `Fehler:\n${String((fehler && fehler.stack) || fehler).slice(0, 1500)}\n\nDetail: ${String((fehler && fehler.detail) || "").slice(0, 600)}\n\nKontext: ${JSON.stringify(kontext).slice(0, 800)}`;
    console.error("[ALERT]", quelle, String(fehler && fehler.message || fehler).slice(0, 300));
    alarm(`🚨 Baustellen-App Fehler: ${quelle}`, text); // kein await
  } catch { /* nie werfen */ }
}

/**
 * Einheitliche Fehlerantwort: 429 → 503 „kurz erneut versuchen", sonst 500 generisch.
 * Der Client bekommt NIE Airtable-Details; die gehen ins Log + Alarm-Mail.
 */
export function sendError(res, e, quelle = "api") {
  if (e && e.status === 429) return jsonAntwort(res, 503, { ok: false, fehler: "Bitte kurz erneut versuchen" });
  if (e && e.status === 400) return jsonAntwort(res, 400, { ok: false, fehler: e.message || "Ungültige Anfrage" });
  fehlerMelden(quelle, e, { status: e && e.status });
  return jsonAntwort(res, 500, { ok: false, fehler: "Interner Fehler. Bitte später erneut versuchen." });
}
