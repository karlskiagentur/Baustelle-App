// Prüft die Sprachdateien in src/locales: gleiche Schlüssel wie de.json, gleiche
// Platzhalter ({{x}}), vollständige Pluralformen je Sprache (Intl.PluralRules), keine leeren Texte.
// Aufruf: node test/sprachen-pruefen.mjs   → Exit-Code 1 bei Abweichungen (Teil des Test-Gates)
import fs from "node:fs";
import path from "node:path";

const ORDNER = path.resolve("src/locales");
const QUELLE = "de";
const PLURAL_SUFFIXE = ["zero", "one", "two", "few", "many", "other"];

const dateien = fs.readdirSync(ORDNER).filter((f) => f.endsWith(".json")).sort();
const sprachen = Object.fromEntries(dateien.map((f) => [f.replace(".json", ""), JSON.parse(fs.readFileSync(path.join(ORDNER, f), "utf8"))]));
if (!sprachen[QUELLE]) { console.error(`✗ ${QUELLE}.json fehlt`); process.exit(1); }

function flach(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") flach(v, key, out); else out[key] = v;
  }
  return out;
}
// "heute.materialOffen_one" -> { basis: "heute.materialOffen", form: "one" }
function zerlegen(key) {
  const m = /^(.*)_(zero|one|two|few|many|other)$/.exec(key);
  return m ? { basis: m[1], form: m[2] } : { basis: key, form: null };
}
const platzhalter = (s) => [...String(s).matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).sort().join(",");

const quelle = flach(sprachen[QUELLE]);
const quelleBasen = new Map(); // basis -> { plural: bool, platzhalter }
for (const [k, v] of Object.entries(quelle)) {
  const { basis, form } = zerlegen(k);
  const e = quelleBasen.get(basis) || { plural: false, platzhalter: platzhalter(v) };
  if (form) e.plural = true;
  quelleBasen.set(basis, e);
}

let fehler = 0;
const melden = (s) => { console.log("✗ " + s); fehler++; };

for (const [code, json] of Object.entries(sprachen)) {
  const f = flach(json);
  const basen = new Map();
  for (const [k, v] of Object.entries(f)) {
    const { basis, form } = zerlegen(k);
    const e = basen.get(basis) || { formen: new Set(), platzhalter: new Set() };
    if (form) e.formen.add(form);
    e.platzhalter.add(platzhalter(v));
    basen.set(basis, e);
    if (String(v).trim() === "") melden(`${code}: leerer Text bei "${k}"`);
  }
  // fehlende / überzählige Schlüssel
  for (const basis of quelleBasen.keys()) if (!basen.has(basis)) melden(`${code}: Schlüssel fehlt "${basis}"`);
  for (const basis of basen.keys()) if (!quelleBasen.has(basis)) melden(`${code}: unbekannter Schlüssel "${basis}" (nicht in ${QUELLE}.json)`);
  // Pluralformen: genau die Kategorien der Sprache (Intl.PluralRules)
  const kategorien = new Intl.PluralRules(code).resolvedOptions().pluralCategories;
  for (const [basis, q] of quelleBasen) {
    const z = basen.get(basis);
    if (!z || !q.plural) continue;
    for (const kat of kategorien) if (!z.formen.has(kat)) melden(`${code}: Pluralform "${basis}_${kat}" fehlt (Sprache braucht: ${kategorien.join(", ")})`);
    for (const form of z.formen) if (!kategorien.includes(form)) melden(`${code}: Pluralform "${basis}_${form}" wird in dieser Sprache nie benutzt`);
    // Platzhalter: bei Pluralformen darf {{count}} in einzelnen Formen fehlen (z. B. „eine Person“)
  }
  // Platzhalter-Parität (ohne Pluralschlüssel, dort ist {{count}} optional)
  for (const [basis, q] of quelleBasen) {
    const z = basen.get(basis);
    if (!z || q.plural) continue;
    for (const p of z.platzhalter) if (p !== q.platzhalter) melden(`${code}: Platzhalter bei "${basis}" = [${p}] statt [${q.platzhalter}]`);
  }
  console.log(`${code}: ${Object.keys(f).length} Texte, ${basen.size} Schlüssel, Pluralkategorien: ${kategorien.join("/")}`);
}

if (fehler) { console.log(`\n${fehler} Abweichung(en) in den Sprachdateien.`); process.exit(1); }
console.log(`\nSprachdateien vollständig: ${Object.keys(sprachen).join(", ")} (${quelleBasen.size} Schlüssel).`);
