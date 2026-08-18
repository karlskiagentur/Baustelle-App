// Mehrsprachigkeit (react-i18next). Eine JSON-Datei je Sprache in src/locales/ –
// der Code bleibt einer, nur die Texte werden ausgetauscht.
// Sprachwahl: Login-Screen bzw. „Mehr“ → localStorage (Gerät) + Airtable-Profil (Feld „Sprache“).
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import de from "./locales/de.json";
import tr from "./locales/tr.json";
import pl from "./locales/pl.json";
import ro from "./locales/ro.json";
import hr from "./locales/hr.json";
import ar from "./locales/ar.json";
import ru from "./locales/ru.json";
import sq from "./locales/sq.json";

/** Reihenfolge = Reihenfolge der Buttons. Name in der jeweiligen Sprache (eindeutiger als Flaggen). */
export const SPRACHEN = [
  { code: "de", name: "Deutsch", locale: "de-DE" },
  { code: "tr", name: "Türkçe", locale: "tr-TR" },
  { code: "pl", name: "Polski", locale: "pl-PL" },
  { code: "ro", name: "Română", locale: "ro-RO" },
  { code: "hr", name: "Hrvatski", locale: "hr-HR" },
  { code: "ar", name: "العربية", locale: "ar-u-nu-latn", rtl: true }, // lateinische Ziffern (wie IDs/Uhrzeiten)
  { code: "ru", name: "Русский", locale: "ru-RU" },
  { code: "sq", name: "Shqip", locale: "sq-AL" },
];
export const SPRACH_CODES = SPRACHEN.map((s) => s.code);
const RESSOURCEN = { de, tr, pl, ro, hr, ar, ru, sq };
const SCHLUESSEL = "baustelle_sprache";
const STANDARD = "de";

export const spracheOk = (code) => SPRACH_CODES.includes(String(code || ""));

/** Auf diesem Gerät gespeicherte Sprache (oder null). */
export function gespeicherteSprache() {
  try { const s = localStorage.getItem(SCHLUESSEL); return spracheOk(s) ? s : null; } catch { return null; }
}

/** Startsprache: Gerät → Browser-Sprache (falls unterstützt) → Deutsch. */
function startSprache() {
  const lokal = gespeicherteSprache();
  if (lokal) return lokal;
  const browser = (navigator.languages || [navigator.language || ""]).map((l) => String(l).slice(0, 2).toLowerCase());
  return browser.find(spracheOk) || STANDARD;
}

/** Sprache umschalten und auf dem Gerät merken. (Airtable-Profil wird vom Aufrufer per API gesetzt.) */
export function spracheSetzen(code) {
  if (!spracheOk(code)) return;
  try { localStorage.setItem(SCHLUESSEL, code); } catch { /* privater Modus o. ä. */ }
  if (i18n.language !== code) i18n.changeLanguage(code);
}

export const aktuelleSprache = () => (spracheOk(i18n.language) ? i18n.language : STANDARD);
export const locale = () => (SPRACHEN.find((s) => s.code === aktuelleSprache()) || SPRACHEN[0]).locale;
export const istRtl = (code = aktuelleSprache()) => !!SPRACHEN.find((s) => s.code === code)?.rtl;

/** Airtable-Auswahlwert (z. B. Status „Vor Ort“) übersetzen – unbekannte Werte unverändert anzeigen. */
export const wert = (v) => (v == null || v === "" ? "" : i18n.t(`werte.${v}`, { defaultValue: String(v) }));

function dokumentAnpassen(code) {
  const html = document.documentElement;
  html.lang = code;
  html.dir = istRtl(code) ? "rtl" : "ltr";
}

i18n.use(initReactI18next).init({
  resources: Object.fromEntries(Object.entries(RESSOURCEN).map(([k, v]) => [k, { translation: v }])),
  lng: startSprache(),
  fallbackLng: STANDARD,
  supportedLngs: SPRACH_CODES,
  keySeparator: ".",
  nsSeparator: false, // Werte wie „06:00“ dürfen kein Namespace-Trenner sein
  interpolation: { escapeValue: false }, // React escaped selbst
  returnEmptyString: false,
});
dokumentAnpassen(i18n.language);
i18n.on("languageChanged", dokumentAnpassen);

export default i18n;
