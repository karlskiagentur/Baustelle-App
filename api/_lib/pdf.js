// Gemeinsame PDF-Helfer (pdf-lib): Unicode-Schrift für Namen und Texte in allen App-Sprachen
// (ş ğ ı ł ś ż ț ș č ć đ ë, Kyrillisch …). Die Standard-Schrift Helvetica kann nur Westeuropäisch –
// ein Name wie „Şahin“ oder „Łukasz“ würde das PDF sonst abbrechen lassen.
import fs from "node:fs";
import fontkit from "@pdf-lib/fontkit";
import { StandardFonts } from "pdf-lib";

// new URL(…, import.meta.url): so packt Vercel die Schriftdateien automatisch mit in die Function
const DATEI_NORMAL = new URL("./schriften/DejaVuSans.ttf", import.meta.url);
const DATEI_FETT = new URL("./schriften/DejaVuSans-Bold.ttf", import.meta.url);
let schriftBytes = null;

export function unicodeSchriftDa() {
  try { return fs.existsSync(DATEI_NORMAL) && fs.existsSync(DATEI_FETT); } catch { return false; }
}

/** Schriften einbetten: DejaVu Sans (nur benutzte Zeichen), sonst Helvetica + Zeichen-Ersatz. */
export async function schriften(pdf) {
  try {
    schriftBytes = schriftBytes || { normal: fs.readFileSync(DATEI_NORMAL), fett: fs.readFileSync(DATEI_FETT) };
    pdf.registerFontkit(fontkit);
    const font = await pdf.embedFont(schriftBytes.normal, { subset: true });
    const bold = await pdf.embedFont(schriftBytes.fett, { subset: true });
    return { font, bold, unicode: true };
  } catch (e) {
    console.warn("[pdf] Unicode-Schrift nicht verfügbar – Helvetica mit Zeichen-Ersatz:", e && e.message);
    return { font: await pdf.embedFont(StandardFonts.Helvetica), bold: await pdf.embedFont(StandardFonts.HelveticaBold), unicode: false };
  }
}

// Ersatz für Zeichen außerhalb von WinAnsi (nur im Helvetica-Notfall)
const ERSATZ = {
  ş: "s", Ş: "S", ğ: "g", Ğ: "G", ı: "i", İ: "I", ł: "l", Ł: "L", ś: "s", Ś: "S", ż: "z", Ż: "Z", ź: "z", Ź: "Z",
  ć: "c", Ć: "C", ń: "n", Ń: "N", ą: "a", Ą: "A", ę: "e", Ę: "E", ș: "s", Ș: "S", ț: "t", Ț: "T", ţ: "t", Ţ: "T",
  ă: "a", Ă: "A", č: "c", Č: "C", đ: "d", Đ: "D", ő: "o", ű: "u", "–": "-", "—": "-", "„": "\"", "“": "\"", "”": "\"", "‚": "'", "‘": "'", "’": "'", "…": "...",
};
const KYRILLISCH = "абвгдеёжзийклмнопрстуфхцчшщъыьэюя".split("");
const LATEIN = ["a", "b", "v", "g", "d", "e", "e", "zh", "z", "i", "j", "k", "l", "m", "n", "o", "p", "r", "s", "t", "u", "f", "h", "c", "ch", "sh", "shch", "", "y", "", "e", "yu", "ya"];

/** Text PDF-tauglich machen: Steuerzeichen raus; im Helvetica-Notfall Sonderzeichen ersetzen. */
export function pdfText(text, unicode = true) {
  let s = String(text ?? "").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, " ");
  if (unicode) return s;
  return s.split("").map((ch) => {
    if (ERSATZ[ch] !== undefined) return ERSATZ[ch];
    const k = KYRILLISCH.indexOf(ch.toLowerCase());
    if (k >= 0) { const l = LATEIN[k]; return ch === ch.toLowerCase() ? l : l.charAt(0).toUpperCase() + l.slice(1); }
    return ch.charCodeAt(0) <= 0xff ? ch : "?";
  }).join("");
}

/** Text auf eine Breite umbrechen (Wörter, notfalls hart) – liefert Zeilen. */
export function umbrechen(text, font, groesse, breite) {
  const zeilen = [];
  for (const absatz of String(text ?? "").split("\n")) {
    let zeile = "";
    for (const wort of absatz.split(/\s+/).filter(Boolean)) {
      const probe = zeile ? `${zeile} ${wort}` : wort;
      if (font.widthOfTextAtSize(probe, groesse) <= breite) { zeile = probe; continue; }
      if (zeile) zeilen.push(zeile);
      // überlanges Wort hart teilen
      let rest = wort;
      while (font.widthOfTextAtSize(rest, groesse) > breite && rest.length > 1) {
        let n = rest.length;
        while (n > 1 && font.widthOfTextAtSize(rest.slice(0, n), groesse) > breite) n--;
        zeilen.push(rest.slice(0, n));
        rest = rest.slice(n);
      }
      zeile = rest;
    }
    zeilen.push(zeile);
  }
  return zeilen;
}

/** Datum/Uhrzeit in deutscher Zeit (Europe/Berlin) */
export const berlin = (iso, o) => new Date(iso).toLocaleString("de-DE", { timeZone: "Europe/Berlin", ...o });
