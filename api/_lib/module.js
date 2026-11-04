// Zuschaltbare Module je Kunde (Paket-Staffel nach Mitarbeiterzahl).
// Vercel → Environment Variable MODULE, z. B. „tagesbericht,export,uebersetzung“.
// Leer/fehlend = Tagesbericht + Export an (Demo); die Übersetzung kostet pro Text Bruchteile eines Cents
// und läuft deshalb NUR, wenn „uebersetzung“ ausdrücklich in MODULE steht.
// Grundfunktionen (Stempeln inkl. Offline, Einsätze, Material, Fotos, Karte, Urlaub, Dokumente) sind immer an.
export const ALLE_MODULE = ["tagesbericht", "export", "uebersetzung"];
const OHNE_EINSTELLUNG = ["tagesbericht", "export"];

export function aktiveModule() {
  const roh = process.env.MODULE;
  if (roh == null || String(roh).trim() === "") return [...OHNE_EINSTELLUNG];
  const gewuenscht = String(roh).split(",").map((s) => s.trim().toLowerCase());
  return ALLE_MODULE.filter((m) => gewuenscht.includes(m));
}

export const modulAn = (name) => aktiveModule().includes(name);
