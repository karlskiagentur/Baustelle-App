import { PDFDocument, rgb } from "pdf-lib";
import { suchen, anlegen, anhangHochladen, TABELLEN, f, jsonAntwort, sendError } from "../_lib/airtable.js";
import { cronErlaubt } from "../_lib/auth.js";
import { schriften, pdfText } from "../_lib/pdf.js";
import { modulAn } from "../_lib/module.js";
import { lohnExport } from "../_lib/export.js";

/**
 * GET /api/cron/stundenzettel?secret=…            → Vormonat für alle aktiven Mitarbeiter
 * GET /api/cron/stundenzettel?secret=…&monat=2026-08 → bestimmter Monat
 * GET …&mitarbeiter=recXXX                          → nur einer
 * GET …&force=1                                     → auch wenn schon vorhanden
 *
 * Läuft per Vercel-Cron am 1. jedes Monats (vercel.json). Erzeugt je Mitarbeiter
 * einen Monats-Stundenzettel als PDF (Vorbild Wunschlos api/stundenzettel.js) und legt
 * ihn als Dokument (Typ „Stundenzettel") ab – der Mitarbeiter sieht ihn in „Dokumente".
 * Push geht bewusst NICHT automatisch raus (Büro setzt bei Bedarf Push_senden = Senden).
 * Modul „export“: legt zusätzlich den Lohn-Export (CSV, ggf. DATEV) in der Tabelle „Exporte“ ab.
 * GET …&nurExport=1 → nur den Lohn-Export (neu) erzeugen, keine Stundenzettel.
 */
const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const hmm = (min) => `${Math.floor(min / 60)}:${String(Math.round(min % 60)).padStart(2, "0")}`;
const berlin = (iso, o) => new Date(iso).toLocaleString("de-DE", { timeZone: "Europe/Berlin", ...o });

export default async function handler(req, res) {
  if (!cronErlaubt(req)) return jsonAntwort(res, 401, { ok: false, fehler: "nicht erlaubt" });
  try {
    const url = new URL(req.url, "http://x");
    let monat = url.searchParams.get("monat");
    if (!/^\d{4}-\d{2}$/.test(monat || "")) {
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
      monat = d.toISOString().slice(0, 7);
    }
    const nurMa = url.searchParams.get("mitarbeiter");
    const force = url.searchParams.get("force") === "1";
    const nurExport = url.searchParams.get("nurExport") === "1";
    const [jahr, mm] = monat.split("-").map(Number);
    const monatLabel = `${MONATE[mm - 1]} ${jahr}`;

    let mas = nurExport ? [] : await suchen(TABELLEN.mitarbeiter, `{Aktiv}`, { felder: ["Name", "Personal_Nr", "Soll_Wochenstunden"] });
    if (nurMa) mas = mas.filter((m) => m.id === nurMa);
    const vorhandene = await suchen(TABELLEN.dokumente, `AND({Typ}="Stundenzettel", DATETIME_FORMAT({Monat},'YYYY-MM')="${f(monat)}")`, { felder: ["Mitarbeiter"] });
    const schonDa = new Set(vorhandene.flatMap((d) => d.Mitarbeiter || []));

    const baustellen = await suchen(TABELLEN.baustellen, "", { felder: ["Name"] });
    const bstName = new Map(baustellen.map((b) => [b.id, b.Name || ""]));

    let erzeugt = 0, uebersprungen = 0;
    for (const ma of mas) {
      if (schonDa.has(ma.id) && !force) { uebersprungen++; continue; }
      const zeiten = await suchen(
        TABELLEN.zeit,
        `AND(FIND("${f(ma.Name)}", ARRAYJOIN({Mitarbeiter})), DATETIME_FORMAT(SET_TIMEZONE({Start},'Europe/Berlin'),'YYYY-MM')="${f(monat)}", {Ende})`,
        { sortFeld: "Start" }
      );
      const zeilen = zeiten.map((z) => {
        const min = Math.max(0, Math.round((new Date(z.Ende) - new Date(z.Start)) / 60000) - (Number(z.Pause_Minuten) || 0));
        return {
          datum: berlin(z.Start, { day: "2-digit", month: "2-digit", year: "numeric" }),
          zeit: `${berlin(z.Start, { hour: "2-digit", minute: "2-digit" })} – ${berlin(z.Ende, { hour: "2-digit", minute: "2-digit" })}`,
          pause: Number(z.Pause_Minuten) || 0,
          baustelle: bstName.get((z.Baustelle || [])[0]) || "–",
          art: z.Art || "Arbeit",
          min,
        };
      });
      const summe = zeilen.reduce((s, z) => s + z.min, 0);

      // ---- PDF ---------------------------------------------------------------
      const pdf = await PDFDocument.create();
      // Unicode-Schrift: Namen wie „Şahin“, „Łukasz“, „Đorđe“ brachen mit Helvetica das PDF ab
      const { font, bold, unicode } = await schriften(pdf);
      const T = (s) => pdfText(s, unicode);
      const grau = rgb(0.45, 0.45, 0.45), schwarz = rgb(0.15, 0.15, 0.15);
      const A4 = [595.28, 841.89], M = 48;
      const COL = { datum: M, zeit: M + 80, baustelle: M + 190, art: M + 370, ist: M + 440 };
      let page = pdf.addPage(A4), y = A4[1] - M;
      const kopf = () => {
        page.drawText(T(`${process.env.FIRMA_NAME || "Baustellen-App"} – Stundennachweis`), { x: M, y, size: 16, font: bold, color: schwarz });
        y -= 22;
        page.drawText(T(`${ma.Name}${ma.Personal_Nr ? ` · Nr. ${90000 + Number(ma.Personal_Nr)}` : ""} · ${monatLabel}`), { x: M, y, size: 11, font, color: grau });
        y -= 28;
        for (const [k, t] of [["datum", "Datum"], ["zeit", "Zeit"], ["baustelle", "Baustelle"], ["art", "Art"], ["ist", "Netto (h:mm)"]])
          page.drawText(t, { x: COL[k], y, size: 10, font: bold, color: schwarz });
        y -= 6;
        page.drawLine({ start: { x: M, y }, end: { x: A4[0] - M, y }, thickness: 0.8, color: grau });
        y -= 16;
      };
      kopf();
      const cut = (s, n) => (String(s).length > n ? String(s).slice(0, n - 1) + "…" : String(s));
      for (const z of zeilen) {
        if (y < M + 60) { page = pdf.addPage(A4); y = A4[1] - M; kopf(); }
        page.drawText(z.datum, { x: COL.datum, y, size: 10, font, color: schwarz });
        page.drawText(`${z.zeit}${z.pause ? ` (P ${z.pause})` : ""}`, { x: COL.zeit, y, size: 9.5, font, color: schwarz });
        page.drawText(T(cut(z.baustelle, 34)), { x: COL.baustelle, y, size: 9.5, font, color: schwarz });
        page.drawText(T(z.art), { x: COL.art, y, size: 9.5, font, color: schwarz });
        page.drawText(hmm(z.min), { x: COL.ist, y, size: 10, font, color: schwarz });
        y -= 15;
      }
      if (!zeilen.length) { page.drawText("Keine abgeschlossenen Zeiteinträge in diesem Monat.", { x: M, y, size: 10, font, color: grau }); y -= 16; }
      if (y < M + 90) { page = pdf.addPage(A4); y = A4[1] - M; }
      y -= 6;
      page.drawLine({ start: { x: M, y }, end: { x: A4[0] - M, y }, thickness: 0.8, color: grau });
      y -= 20;
      page.drawText(`Monatssumme: ${hmm(summe)} Std. · ${zeilen.length} Einträge`, { x: M, y, size: 12, font: bold, color: schwarz });
      if (ma.Soll_Wochenstunden) {
        y -= 16;
        page.drawText(`Vertragliche Wochenstunden: ${ma.Soll_Wochenstunden} · (P = Pause in Minuten, bereits abgezogen)`, { x: M, y, size: 9, font, color: grau });
      }
      y -= 60;
      page.drawLine({ start: { x: A4[0] - M - 200, y }, end: { x: A4[0] - M, y }, thickness: 0.8, color: schwarz });
      page.drawText("Geschäftsführung", { x: A4[0] - M - 200, y: y - 14, size: 9, font, color: grau });
      page.drawText(`Erstellt am ${new Date().toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })} · elektronisch erzeugt`, { x: M, y: M - 20, size: 8, font, color: grau });
      const bytes = await pdf.save();

      // ---- als Dokument ablegen ---------------------------------------------
      const dok = await anlegen(TABELLEN.dokumente, {
        Titel: `Stundenzettel ${monatLabel} – ${ma.Name}`,
        Mitarbeiter: [ma.id],
        Typ: "Stundenzettel",
        Monat: `${monat}-01`,
      });
      await anhangHochladen(dok.id, "Datei", {
        base64: Buffer.from(bytes).toString("base64"),
        contentType: "application/pdf",
        dateiname: `Stundenzettel_${monat}_${String(ma.Name).replace(/[^A-Za-z0-9]+/g, "_")}.pdf`,
      });
      erzeugt++;
    }

    // ---- Lohn-Export ablegen (Modul „export“) – Fehler hier stoppt die Stundenzettel nicht --------
    let exportStatus = "aus";
    if (modulAn("export") && (!nurMa || nurExport)) {
      try {
        const ex = await lohnExport(monat);
        const rec = await anlegen(TABELLEN.exporte, {
          Titel: `Lohn-Export ${ex.label}`,
          Monat: `${monat}-01`,
          Eintraege: ex.anzahl.eintraege,
          Mitarbeiter_Anzahl: ex.anzahl.mitarbeiter,
          Hinweise: ex.hinweise.join("\n"),
          Erstellt_Am: new Date().toISOString(),
        });
        for (const d of ex.dateien) {
          await anhangHochladen(rec.id, "Dateien", { base64: Buffer.from(d.inhalt, "utf8").toString("base64"), contentType: d.typ, dateiname: d.name });
        }
        exportStatus = "ok";
      } catch (e) {
        exportStatus = "fehler";
        console.error("[stundenzettel] Lohn-Export fehlgeschlagen:", e && e.message, e && e.detail);
      }
    }
    return jsonAntwort(res, 200, { ok: true, monat, mitarbeiter: mas.length, erzeugt, uebersprungen, export: exportStatus });
  } catch (e) {
    return sendError(res, e, "api/cron/stundenzettel");
  }
}
