// Lohn-Export eines Monats (Modul „export“): Excel-taugliche CSV-Dateien und – wenn eingerichtet –
// eine DATEV-LODAS-Importdatei. Grundlage: abgeschlossene Zeiteinträge + genehmigte Abwesenheiten.
import { suchen, TABELLEN, f } from "./airtable.js";

const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const ABWESEND = ["Urlaub", "Krank", "Überstundenausgleich", "Unbezahlt", "Lehrgang"];
const ARTEN = ["Arbeit", "Fahrzeit", "Rüstzeit"];

const tz = { timeZone: "Europe/Berlin" };
const tagDE = (iso) => new Date(iso).toLocaleDateString("de-DE", { ...tz, day: "2-digit", month: "2-digit", year: "numeric" });
const uhr = (iso) => new Date(iso).toLocaleTimeString("de-DE", { ...tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const stunden = (min) => (Math.round((min / 60) * 100) / 100).toFixed(2).replace(".", ",");
const nettoMin = (z) => Math.max(0, Math.round((new Date(z.Ende) - new Date(z.Start)) / 60000) - (Number(z.Pause_Minuten) || 0));

/** CSV für deutsches Excel: Semikolon, Komma als Dezimalzeichen, UTF-8 mit BOM */
export function csv(zeilen) {
  const zelle = (v) => {
    const s = String(v ?? "");
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + zeilen.map((z) => z.map(zelle).join(";")).join("\r\n") + "\r\n";
}

/** Werktage (Mo–Fr) eines Zeitraums, die im Monat liegen */
function werktageImMonat(von, bis, monat) {
  let n = 0;
  const d = new Date(`${von}T12:00:00Z`), ende = new Date(`${bis}T12:00:00Z`);
  for (let i = 0; d <= ende && i < 400; i++, d.setUTCDate(d.getUTCDate() + 1)) {
    const wt = d.getUTCDay();
    if (wt !== 0 && wt !== 6 && d.toISOString().slice(0, 7) === monat) n++;
  }
  return n;
}

export function monatLabel(monat) {
  const [j, m] = monat.split("-").map(Number);
  return `${MONATE[m - 1]} ${j}`;
}

/** DATEV-Einstellungen aus der Umgebung (alle Nummern legt das Steuerbüro fest) */
export function datevEinstellungen() {
  const e = process.env;
  const ok = !!(e.DATEV_BERATERNR && e.DATEV_MANDANTENNR && e.DATEV_LA_ARBEIT);
  return {
    ok,
    berater: String(e.DATEV_BERATERNR || "").trim(),
    mandant: String(e.DATEV_MANDANTENNR || "").trim(),
    bs: String(e.DATEV_BS_STUNDEN || "1").trim(), // Bearbeitungsschlüssel für Stunden – mit dem Steuerbüro abstimmen
    la: { Arbeit: String(e.DATEV_LA_ARBEIT || "").trim(), Fahrzeit: String(e.DATEV_LA_FAHRZEIT || "").trim(), Rüstzeit: String(e.DATEV_LA_RUESTZEIT || "").trim() },
  };
}

/**
 * Alle Exportdaten eines Monats („2026-10“).
 * Liefert { label, dateien: [{ name, inhalt, typ }], hinweise: [], anzahl }
 */
export async function lohnExport(monat) {
  if (!/^\d{4}-\d{2}$/.test(monat)) throw Object.assign(new Error("Monat ungültig (JJJJ-MM)"), { status: 400 });
  const [mas, zeiten, abw, baustellen] = await Promise.all([
    suchen(TABELLEN.mitarbeiter, "", { felder: ["Name", "Personal_Nr", "DATEV_PNr", "Aktiv"] }),
    suchen(TABELLEN.zeit, `AND(DATETIME_FORMAT(SET_TIMEZONE({Start},'Europe/Berlin'),'YYYY-MM')="${f(monat)}", {Ende})`, { sortFeld: "Start" }),
    suchen(TABELLEN.urlaub, `{Status}="Genehmigt"`),
    suchen(TABELLEN.baustellen, "", { felder: ["Name"] }),
  ]);
  const maVon = new Map(mas.map((m) => [m.id, m]));
  const bstName = new Map(baustellen.map((b) => [b.id, b.Name || ""]));
  const pnr = (m) => String(m?.DATEV_PNr ?? m?.Personal_Nr ?? "");
  const hinweise = [];

  // ---- Zeiten (eine Zeile je Eintrag) ----
  const zeilen = zeiten
    .filter((z) => z.Start && z.Ende && new Date(z.Start).toLocaleDateString("sv-SE", tz).slice(0, 7) === monat)
    .map((z) => ({ z, m: maVon.get((z.Mitarbeiter || [])[0]) }))
    .filter(({ m }) => m)
    .sort((a, b) => a.m.Name.localeCompare(b.m.Name, "de") || new Date(a.z.Start) - new Date(b.z.Start));
  const zeitenCsv = [["Personalnr.", "Name", "Datum", "Beginn", "Ende", "Pause (Min.)", "Stunden netto", "Art", "Baustelle", "Quelle"]];
  for (const { z, m } of zeilen) {
    zeitenCsv.push([pnr(m), m.Name, tagDE(z.Start), uhr(z.Start), uhr(z.Ende), Number(z.Pause_Minuten) || 0, stunden(nettoMin(z)),
      z.Art || "Arbeit", bstName.get((z.Baustelle || [])[0]) || "", z.Quelle || ""]);
  }

  // ---- Summen je Mitarbeiter ----
  const summen = new Map();
  const summeVon = (m) => {
    if (!summen.has(m.id)) summen.set(m.id, { m, min: { Arbeit: 0, Fahrzeit: 0, Rüstzeit: 0 }, tage: new Set(), abw: Object.fromEntries(ABWESEND.map((a) => [a, 0])), offline: 0 });
    return summen.get(m.id);
  };
  for (const { z, m } of zeilen) {
    const s = summeVon(m);
    s.min[ARTEN.includes(z.Art) ? z.Art : "Arbeit"] += nettoMin(z);
    s.tage.add(new Date(z.Start).toLocaleDateString("sv-SE", tz));
    if (String(z.Quelle || "").includes("offline")) s.offline++;
  }
  for (const a of abw) {
    const m = maVon.get((a.Mitarbeiter || [])[0]);
    if (!m || !a.Von || !a.Bis || !ABWESEND.includes(a.Art)) continue;
    const n = werktageImMonat(a.Von, a.Bis, monat);
    if (n) summeVon(m).abw[a.Art] += n;
  }
  const sortiert = [...summen.values()].sort((a, b) => a.m.Name.localeCompare(b.m.Name, "de"));
  const summenCsv = [["Personalnr.", "Name", "Arbeit (Std.)", "Fahrzeit (Std.)", "Rüstzeit (Std.)", "Gesamt (Std.)", "Arbeitstage",
    ...ABWESEND.map((a) => `${a} (Tage)`), "davon offline erfasst"]];
  for (const s of sortiert) {
    const ges = s.min.Arbeit + s.min.Fahrzeit + s.min.Rüstzeit;
    summenCsv.push([pnr(s.m), s.m.Name, stunden(s.min.Arbeit), stunden(s.min.Fahrzeit), stunden(s.min.Rüstzeit), stunden(ges), s.tage.size,
      ...ABWESEND.map((a) => s.abw[a]), s.offline]);
  }

  const dateien = [
    { name: `Zeiten_${monat}.csv`, inhalt: csv(zeitenCsv), typ: "text/csv" },
    { name: `Summen_${monat}.csv`, inhalt: csv(summenCsv), typ: "text/csv" },
  ];

  // ---- DATEV LODAS (nur wenn eingerichtet) ----
  const dv = datevEinstellungen();
  if (dv.ok) {
    const [j, mm] = monat.split("-");
    const zeitraum = `01.${mm}.${j}`;
    const zeilenDatev = [];
    for (const s of sortiert) {
      const nr = String(s.m.DATEV_PNr ?? "").trim();
      if (!/^\d{1,5}$/.test(nr)) { hinweise.push(`DATEV: ${s.m.Name} hat keine DATEV-Personalnummer (Feld „DATEV_PNr“) – nicht übertragen.`); continue; }
      const proLa = new Map();
      for (const art of ARTEN) {
        const la = dv.la[art] || dv.la.Arbeit; // ohne eigene Lohnart zählt Fahr-/Rüstzeit als Arbeitszeit
        proLa.set(la, (proLa.get(la) || 0) + s.min[art]);
      }
      for (const [la, min] of proLa) if (min > 0) zeilenDatev.push(`21;${nr};${zeitraum};${stunden(min)};${dv.bs};${la};;;`);
    }
    const inhalt = [
      "[Allgemein]", "Ziel=LODAS", "Version_SST=1.0", `BeraterNr=${dv.berater}`, `MandantenNr=${dv.mandant}`, "Datumsformat=TT.MM.JJJJ", "Stringbegrenzer='", "",
      "[Satzbeschreibung]", "21;u_lod_bwd_buchung_standard;pnr#bwd;abrechnung_zeitraum#bwd;bs_wert_butab#bwd;bs_nr#bwd;la_eigene#bwd;kostenstelle#bwd;kostentraeger#bwd;", "",
      "[Bewegungsdaten]", ...zeilenDatev, "",
    ].join("\r\n");
    // LODAS liest ANSI (Windows-1252) – Inhalt ist rein ASCII (Zahlen), daher unkritisch
    dateien.push({ name: `DATEV_LODAS_${monat}.txt`, inhalt, typ: "text/plain" });
  } else {
    hinweise.push("DATEV-Datei nicht erzeugt: DATEV_BERATERNR, DATEV_MANDANTENNR und DATEV_LA_ARBEIT in Vercel eintragen (Nummern vom Steuerbüro).");
  }
  return { label: monatLabel(monat), dateien, hinweise, anzahl: { eintraege: zeilen.length, mitarbeiter: sortiert.length } };
}
