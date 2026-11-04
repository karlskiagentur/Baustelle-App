// Büro-Texte automatisch in die Sprache des Mitarbeiters übersetzen – über Claude, abgerechnet über Vercel
// (AI Gateway, kein eigenes Konto/kein weiterer Anbieter). Modul „uebersetzung“ (MODULE=…,uebersetzung).
// Jede Übersetzung wird am Datensatz gemerkt (Airtable-Feld „Übersetzungen“) → pro Text und Sprache nur einmal bezahlt.
// Geht etwas schief (kein Guthaben, kein Netz, Zeitlimit), sieht der Mitarbeiter einfach den deutschen Text.
import crypto from "node:crypto";
import { aendern } from "./airtable.js";
import { modulAn } from "./module.js";

const GATEWAY = "https://ai-gateway.vercel.sh/v1/chat/completions";
const modell = () => process.env.UEBERSETZUNG_MODELL || "anthropic/claude-haiku-5.5";
const SPRACHE_EN = { tr: "Turkish", pl: "Polish", ro: "Romanian", hr: "Croatian", ar: "Arabic", ru: "Russian", sq: "Albanian", it: "Italian", fr: "French", es: "Spanish" };
export const FELD_CACHE = "Übersetzungen";
const MAX_TEXTE = 40, MAX_ZEICHEN = 8000;

/** Zugang zum AI Gateway: eigener Schlüssel (falls gesetzt), sonst das Vercel-OIDC-Token des Deployments (kein Schlüssel nötig). */
function zugang(req) {
  return process.env.AI_GATEWAY_API_KEY || (req && req.headers && req.headers["x-vercel-oidc-token"]) || process.env.VERCEL_OIDC_TOKEN || "";
}
export const uebersetzungBereit = (req) => modulAn("uebersetzung") && !!zugang(req);

const anweisung = (sprache) =>
  `You translate short work instructions and messages from a German construction company for construction workers into ${SPRACHE_EN[sprache]}. ` +
  "Use simple, short sentences and the informal 'you'. Keep product names, measurements, numbers, times, dates, addresses, " +
  "people's and company names unchanged. Keep line breaks. Never add explanations. " +
  "Input: a JSON array of strings. Output: ONLY a JSON array of the translated strings, same order, same length.";

/** Texte in eine Sprache übersetzen. Ergebnis: Array gleicher Länge – oder null (dann bleibt es deutsch). */
export async function texteUebersetzen(texte, sprache, req) {
  if (!texte.length) return [];
  const schluessel = zugang(req);
  if (!schluessel || !SPRACHE_EN[sprache]) return null;
  const abbruch = new AbortController();
  const timer = setTimeout(() => abbruch.abort(), 9000);
  try {
    const r = await fetch(GATEWAY, {
      method: "POST",
      signal: abbruch.signal,
      headers: { Authorization: `Bearer ${schluessel}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modell(),
        temperature: 0,
        max_tokens: 4000,
        messages: [{ role: "system", content: anweisung(sprache) }, { role: "user", content: JSON.stringify(texte) }],
        providerOptions: { gateway: { zeroDataRetention: true } }, // Anbieter speichert die Texte nicht
      }),
    });
    if (!r.ok) {
      console.warn("[uebersetzung] AI Gateway", r.status, (await r.text().catch(() => "")).slice(0, 300));
      return null;
    }
    const inhalt = String((await r.json())?.choices?.[0]?.message?.content || "");
    const liste = JSON.parse(inhalt.slice(inhalt.indexOf("["), inhalt.lastIndexOf("]") + 1));
    if (!Array.isArray(liste) || liste.length !== texte.length) return null;
    return liste.map((x, i) => (typeof x === "string" && x.trim() ? x : texte[i]));
  } catch (e) {
    console.warn("[uebersetzung] fehlgeschlagen:", e && e.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const pruefsumme = (quelle) => crypto.createHash("sha1").update(JSON.stringify(quelle)).digest("hex").slice(0, 12);
const cacheLesen = (rec) => { try { return JSON.parse(rec[FELD_CACHE] || "{}") || {}; } catch { return {}; } };

/**
 * Datensätze (Airtable-Rohdaten) für eine Sprache übersetzen. Liefert Kopien: übersetzte Felder,
 * dazu `original` (deutsche Texte) und `uebersetzt: true`. Neue Übersetzungen werden am Datensatz gemerkt;
 * ändert das Büro den Text, passt die Prüfsumme nicht mehr und es wird neu übersetzt.
 */
export async function datensaetzeUebersetzen(tabelle, felder, records, sprache, req) {
  if (!sprache || sprache === "de" || !SPRACHE_EN[sprache] || !records.length || !modulAn("uebersetzung")) return records;
  const ergebnis = records.map((r) => ({ ...r }));
  const offen = [];
  records.forEach((r, i) => {
    const quelle = felder.filter((f) => typeof r[f] === "string" && r[f].trim()).map((f) => [f, r[f]]);
    if (!quelle.length) return;
    const summe = pruefsumme(quelle);
    const cache = cacheLesen(r);
    if (cache[sprache] && cache[sprache].h === summe && cache[sprache].t) anwenden(ergebnis[i], quelle, cache[sprache].t);
    else offen.push({ i, quelle, summe, cache });
  });
  if (!offen.length) return ergebnis;

  // Alles Fehlende in EINER Anfrage (mit Obergrenze gegen Ausreißer)
  const auswahl = [];
  let zeichen = 0;
  for (const o of offen) {
    const laenge = o.quelle.reduce((s, [, t]) => s + t.length, 0);
    if (auswahl.length && (auswahl.reduce((s, x) => s + x.quelle.length, 0) + o.quelle.length > MAX_TEXTE || zeichen + laenge > MAX_ZEICHEN)) break;
    auswahl.push(o); zeichen += laenge;
  }
  const uebersetzt = await texteUebersetzen(auswahl.flatMap((o) => o.quelle.map(([, t]) => t)), sprache, req);
  if (!uebersetzt) return ergebnis;
  let k = 0;
  for (const o of auswahl) {
    const t = Object.fromEntries(o.quelle.map(([f]) => [f, uebersetzt[k++]]));
    anwenden(ergebnis[o.i], o.quelle, t);
    o.cache[sprache] = { h: o.summe, t };
    try { await aendern(tabelle, records[o.i].id, { [FELD_CACHE]: JSON.stringify(o.cache).slice(0, 95000) }); }
    catch (e) { console.warn(`[uebersetzung] nicht gemerkt (Feld „${FELD_CACHE}“ in ${tabelle}?):`, e && e.status); }
  }
  return ergebnis;
}

function anwenden(ziel, quelle, t) {
  ziel.original = Object.fromEntries(quelle);
  for (const [f] of quelle) if (typeof t[f] === "string" && t[f].trim()) ziel[f] = t[f];
  ziel.uebersetzt = true;
}
