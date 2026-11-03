// Zuschaltbare Module je Kunde (Paket-Staffel nach Mitarbeiterzahl).
// Vercel → Environment Variable MODULE, z. B. „tagesbericht,export“ – leer/fehlend = alle an (Demo).
// Grundfunktionen (Stempeln inkl. Offline, Einsätze, Material, Fotos, Karte, Urlaub, Dokumente) sind immer an.
export const ALLE_MODULE = ["tagesbericht", "export"];

export function aktiveModule() {
  const roh = process.env.MODULE;
  if (roh == null || String(roh).trim() === "") return [...ALLE_MODULE];
  const gewuenscht = String(roh).split(",").map((s) => s.trim().toLowerCase());
  return ALLE_MODULE.filter((m) => gewuenscht.includes(m));
}

export const modulAn = (name) => aktiveModule().includes(name);
