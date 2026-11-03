// Tagesbericht / Regiebericht als PDF (A4 hoch) mit Unterschrift des Auftraggebers.
// Wird komplett selbst gezeichnet (keine Vorlage mit vermessenen Kästchen nötig).
import { PDFDocument, rgb } from "pdf-lib";
import { schriften, pdfText, umbrechen, berlin } from "./pdf.js";

const A4 = [595.28, 841.89], M = 48, UNTEN = 64;
const SCHWARZ = rgb(0.13, 0.13, 0.13), GRAU = rgb(0.42, 0.45, 0.5), LINIE = rgb(0.8, 0.82, 0.86), BLAU = rgb(0.12, 0.22, 0.39);
const std = (h) => String(Math.round(h * 100) / 100).replace(".", ",");

export async function berichtPdf({ art, zeit, ma, baustelle, einsatz, arbeiten, leute = [], summe = 0, material, unterzeichner, unterschriftPng, offline }) {
  const pdf = await PDFDocument.create();
  const { font, bold, unicode } = await schriften(pdf);
  const T = (s) => pdfText(s, unicode);
  const titel = art === "Regiebericht" ? "Regiebericht (Stundenlohnarbeiten)" : "Tagesbericht";
  pdf.setTitle(`${titel} ${berlin(zeit, { day: "2-digit", month: "2-digit", year: "numeric" })}`);
  pdf.setProducer("Baustellen-App");

  let page, y;
  const neueSeite = () => { page = pdf.addPage(A4); y = A4[1] - M; };
  const platz = (h) => { if (y - h < UNTEN) neueSeite(); };
  const text = (s, o = {}) => page.drawText(T(s), { x: o.x ?? M, y, size: o.size ?? 10.5, font: o.bold ? bold : font, color: o.color ?? SCHWARZ });
  const absatz = (s, o = {}) => {
    const groesse = o.size ?? 10.5, zeilenH = groesse * 1.42;
    for (const zeile of umbrechen(T(s), o.bold ? bold : font, groesse, A4[0] - 2 * M - (o.einzug ?? 0))) {
      platz(zeilenH); text(zeile, { ...o, x: M + (o.einzug ?? 0), size: groesse }); y -= zeilenH;
    }
  };
  const ueberschrift = (s) => { platz(40); y -= 10; text(s, { bold: true, size: 12, color: BLAU }); y -= 7; page.drawLine({ start: { x: M, y }, end: { x: A4[0] - M, y }, thickness: 0.7, color: LINIE }); y -= 16; };

  // ---- Kopf ----------------------------------------------------------------------------
  neueSeite();
  text(process.env.FIRMA_NAME || "Baustellen-App", { bold: true, size: 15 });
  const datumText = berlin(zeit, { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
  page.drawText(T(titel), { x: A4[0] - M - bold.widthOfTextAtSize(T(titel), 13), y, size: 13, font: bold, color: BLAU });
  y -= 26;
  const infos = [
    ["Datum", datumText],
    ["Baustelle", [baustelle?.Name, String(baustelle?.Adresse || "").replace(/\s*\n\s*/g, ", ")].filter(Boolean).join(" – ") || "–"],
    ...(baustelle?.Auftraggeber ? [["Auftraggeber", baustelle.Auftraggeber]] : []),
    ...(einsatz?.Aufgabe ? [["Einsatz", einsatz.Aufgabe]] : []),
    ["Erstellt von", `${ma.Name}${ma.Kolonne ? ` (${ma.Kolonne})` : ""}`],
  ];
  for (const [k, v] of infos) {
    platz(16);
    text(`${k}:`, { color: GRAU, size: 10 });
    const zeilen = umbrechen(T(v), font, 10.5, A4[0] - 2 * M - 95);
    zeilen.forEach((z, i) => { if (i) { y -= 14; platz(14); } text(z, { x: M + 95 }); });
    y -= 16;
  }

  // ---- Arbeiten --------------------------------------------------------------------------
  ueberschrift("Ausgeführte Arbeiten");
  absatz(arbeiten || "–");

  // ---- Personal & Stunden ----------------------------------------------------------------
  if (leute.length) {
    ueberschrift("Personal und Stunden");
    for (const l of leute) {
      platz(16);
      text(l.name);
      const s = `${std(l.stunden)} Std.`;
      page.drawText(T(s), { x: A4[0] - M - font.widthOfTextAtSize(T(s), 10.5), y, size: 10.5, font, color: SCHWARZ });
      y -= 16;
    }
    platz(22);
    page.drawLine({ start: { x: A4[0] - M - 160, y: y + 10 }, end: { x: A4[0] - M, y: y + 10 }, thickness: 0.7, color: LINIE });
    const s = `Summe: ${std(summe)} Std.`;
    page.drawText(T(s), { x: A4[0] - M - bold.widthOfTextAtSize(T(s), 11), y: y - 4, size: 11, font: bold, color: SCHWARZ });
    y -= 22;
  }

  // ---- Material / Geräte ------------------------------------------------------------------
  if (material) { ueberschrift("Material / Geräte"); absatz(material); }

  // ---- Unterschrift -----------------------------------------------------------------------
  platz(170);
  ueberschrift("Bestätigung des Auftraggebers");
  absatz("Mit der Unterschrift bestätigt der Auftraggeber die Ausführung der oben aufgeführten Arbeiten" +
    (leute.length ? " und die angegebenen Stunden." : "."), { size: 9.5, color: GRAU });
  y -= 6;
  const box = { x: M, y: y - 80, w: 240, h: 76 };
  if (unterschriftPng) {
    try {
      const bild = await pdf.embedPng(unterschriftPng);
      const f = Math.min(box.w / bild.width, box.h / bild.height, 1.2);
      const w = bild.width * f, h = bild.height * f;
      page.drawImage(bild, { x: box.x, y: box.y + (box.h - h) / 2, width: w, height: h });
    } catch { /* defekte Grafik: Bericht trotzdem erzeugen */ }
  }
  y = box.y - 4;
  page.drawLine({ start: { x: M, y }, end: { x: M + 260, y }, thickness: 0.8, color: SCHWARZ });
  y -= 14;
  if (unterschriftPng) {
    text(`${unterzeichner} · unterschrieben am ${berlin(zeit, { day: "2-digit", month: "2-digit", year: "numeric" })}, ${berlin(zeit, { hour: "2-digit", minute: "2-digit" })} Uhr`, { size: 9.5 });
  } else {
    text("Nicht unterschrieben (Auftraggeber nicht anwesend)", { size: 9.5, color: GRAU });
  }

  // ---- Fußzeile auf jeder Seite -------------------------------------------------------------
  const seiten = pdf.getPages();
  const fuss = `Elektronisch erstellt mit der Baustellen-App · ${berlin(zeit, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })} Uhr${offline ? " · offline erfasst, später übertragen" : ""}`;
  seiten.forEach((p, i) => {
    p.drawText(T(fuss), { x: M, y: 32, size: 7.5, font, color: GRAU });
    const s = `Seite ${i + 1}/${seiten.length}`;
    p.drawText(s, { x: A4[0] - M - font.widthOfTextAtSize(s, 7.5), y: 32, size: 7.5, font, color: GRAU });
  });
  return pdf.save();
}
