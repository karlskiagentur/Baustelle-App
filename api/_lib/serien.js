// Mehrtägige Einsätze (Feld „Bis“, seit V1.7): Das Büro plant z. B. Mo–Fr als EINEN Eintrag in der Plantafel.
// Das System legt daraus die einzelnen Arbeitstage als eigene Einsätze an (im 17:30-Cron vor dem Push, also
// spätestens am Vorabend). So laufen Stempeluhr, Status, Push und Berichte wie gewohnt je Tag.
// Bis zum Aufteilen deckt der Ursprungs-Einsatz die Tage über HEUTE_FORMEL ab – es fehlt also nie ein Tag.
import { suchen, anlegenViele, aendern, TABELLEN, f } from "./airtable.js";

/** Heute eingeteilt: Einsatz von heute – oder ein (noch nicht aufgeteilter) mehrtägiger Einsatz, der heute (Mo–Fr) abdeckt. */
export const HEUTE_FORMEL =
  "OR(IS_SAME({Datum}, TODAY(), 'day'), AND({Bis}, NOT(IS_AFTER({Datum}, TODAY())), NOT(IS_BEFORE({Bis}, TODAY())), WEEKDAY(TODAY()) != 0, WEEKDAY(TODAY()) != 6))";

/** Noch aufzuteilen: mehrtägig und reicht über heute hinaus. */
export const SERIE_OFFEN = "AND({Bis}, IS_AFTER({Bis}, {Datum}), IS_AFTER({Bis}, TODAY()))";

const MAX_TAGE = 62; // Schutz vor Tippfehlern (z. B. „Bis“ im falschen Jahr)
const KOPIE_FELDER = ["Aufgabe", "Beginn", "Notiz", "Ladung_Besonderes", "Mitarbeiter", "Baustelle", "Fahrzeug", "Übersetzungen"];
const TAG_RE = /^\d{4}-\d{2}-\d{2}$/;

export const berlinHeute = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });

export function plusTage(tag, n) {
  const d = new Date(`${tag}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const wochenende = (tag) => [0, 6].includes(new Date(`${tag}T12:00:00Z`).getUTCDay());

/** Arbeitstage (Mo–Fr) von … bis, jeweils einschließlich. */
export function arbeitstage(von, bis) {
  const tage = [];
  for (let d = von, i = 0; d <= bis && i < 400; d = plusTage(d, 1), i++) if (!wochenende(d)) tage.push(d);
  return tage;
}

/**
 * Teilt alle offenen mehrtägigen Einsätze in Tages-Einsätze auf.
 * Ab dem 2. Tag (frühestens ab morgen) entsteht je Arbeitstag ein eigener Einsatz mit Serie_ID = Ursprung.
 * Der Ursprung behält Datum … heute (falls schon begonnen), sonst nur seinen ersten Tag.
 * Mehrfach-Aufruf ist sicher: vorhandene Tage einer Serie werden nicht doppelt angelegt.
 */
export async function einsaetzeAufteilen(heute = berlinHeute()) {
  const offen = await suchen(TABELLEN.einsaetze, SERIE_OFFEN);
  let serien = 0, neu = 0;
  for (const e of offen) {
    if (!TAG_RE.test(e.Datum || "") || !TAG_RE.test(e.Bis || "") || e.Bis <= e.Datum) continue;
    serien++;
    const grenze = plusTage(e.Datum, MAX_TAGE);
    const bis = e.Bis > grenze ? grenze : e.Bis;
    const zweiterTag = plusTage(e.Datum, 1), morgen = plusTage(heute, 1);
    const ab = zweiterTag > morgen ? zweiterTag : morgen;
    const serieId = e.Serie_ID || e.id;
    const vorhanden = new Set((await suchen(TABELLEN.einsaetze, `{Serie_ID}="${f(serieId)}"`, { felder: ["Datum"] })).map((x) => x.Datum));
    const tage = arbeitstage(ab, bis).filter((d) => d !== e.Datum && !vorhanden.has(d));
    const basis = Object.fromEntries(KOPIE_FELDER.filter((k) => e[k] != null && e[k] !== "").map((k) => [k, e[k]]));
    const status = e.Status === "Ausgefallen" ? "Ausgefallen" : "Geplant";
    if (tage.length) await anlegenViele(TABELLEN.einsaetze, tage.map((Datum) => ({ ...basis, Datum, Status: status, Serie_ID: serieId })));
    neu += tage.length;
    // Ursprung: nur noch die schon begonnenen Tage (Datum … heute), sonst nur sein erster Tag
    const deckt = heute > e.Datum ? (heute < bis ? heute : bis) : e.Datum;
    await aendern(TABELLEN.einsaetze, e.id, { Bis: deckt > e.Datum ? deckt : null, Serie_ID: serieId });
  }
  return { serien, neu };
}
