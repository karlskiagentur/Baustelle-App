// Sprachen der App (Serverseite): Zuordnung Sprachcode ↔ Airtable-Auswahlwert (Feld „Sprache“
// in Mitarbeiter, deutsche Namen – so liest es das Büro) und die Push-Texte je Sprache.
// Die UI-Texte der App selbst liegen in src/locales/*.json (react-i18next).

export const SPRACHEN = {
  de: "Deutsch",
  tr: "Türkisch",
  pl: "Polnisch",
  ro: "Rumänisch",
  hr: "Kroatisch",
  ar: "Arabisch",
  ru: "Russisch",
  sq: "Albanisch",
};
export const SPRACH_CODES = Object.keys(SPRACHEN);
export const STANDARD_SPRACHE = "de";

export const spracheOk = (code) => SPRACH_CODES.includes(String(code || ""));

/** Sprachcode aus dem Mitarbeiter-Datensatz (Airtable-Wert „Türkisch“ oder Code „tr“) – Fallback Deutsch. */
export function spracheVon(ma) {
  const wert = String(ma?.Sprache || "").trim();
  if (!wert) return STANDARD_SPRACHE;
  const klein = wert.toLowerCase();
  return SPRACH_CODES.find((c) => c === klein || SPRACHEN[c].toLowerCase() === klein) || STANDARD_SPRACHE;
}

/** Airtable-Auswahlwert für einen Sprachcode („tr“ → „Türkisch“). */
export const sprachName = (code) => SPRACHEN[spracheOk(code) ? code : STANDARD_SPRACHE];

// Push-Texte je Sprache. Platzhalter: {{n}}, {{zeit}}. Bewusst kurz – Push zeigt ~120 Zeichen.
const PUSH_TEXTE = {
  de: {
    "einsatz.titel": "Dein Einsatz morgen",
    "einsatz.titelMehrere": "Deine Einsätze morgen ({{n}})",
    "einsatz.standard": "Einsatz",
    "einsatz.beginn": "Beginn {{zeit}}",
    "einsatz.fahrzeug": "Fahrzeug eingeteilt – Details in der App",
    "dokument.titel": "Neues Dokument",
    "dokument.text": "In deinem Dokumente-Bereich liegt ein neues Dokument bereit.",
    "erinnerung.titel": "Erinnerung",
    "erinnerung.text": "Du bist heute eingeteilt und noch nicht eingestempelt.",
    "mitteilung.titel": "Mitteilung",
  },
  tr: {
    "einsatz.titel": "Yarınki görevin",
    "einsatz.titelMehrere": "Yarınki görevlerin ({{n}})",
    "einsatz.standard": "Görev",
    "einsatz.beginn": "Başlangıç {{zeit}}",
    "einsatz.fahrzeug": "Araç atandı – ayrıntılar uygulamada",
    "dokument.titel": "Yeni belge",
    "dokument.text": "Belgeler bölümünde yeni bir belge hazır.",
    "erinnerung.titel": "Hatırlatma",
    "erinnerung.text": "Bugün görevlisin ve henüz giriş yapmadın.",
    "mitteilung.titel": "Bildirim",
  },
  pl: {
    "einsatz.titel": "Twoje zlecenie na jutro",
    "einsatz.titelMehrere": "Twoje zlecenia na jutro ({{n}})",
    "einsatz.standard": "Zlecenie",
    "einsatz.beginn": "Początek {{zeit}}",
    "einsatz.fahrzeug": "Pojazd przydzielony – szczegóły w aplikacji",
    "dokument.titel": "Nowy dokument",
    "dokument.text": "W Twoich dokumentach czeka nowy dokument.",
    "erinnerung.titel": "Przypomnienie",
    "erinnerung.text": "Masz dziś zlecenie i jeszcze nie zarejestrowałeś czasu.",
    "mitteilung.titel": "Wiadomość",
  },
  ro: {
    "einsatz.titel": "Lucrarea ta de mâine",
    "einsatz.titelMehrere": "Lucrările tale de mâine ({{n}})",
    "einsatz.standard": "Lucrare",
    "einsatz.beginn": "Început {{zeit}}",
    "einsatz.fahrzeug": "Vehicul alocat – detalii în aplicație",
    "dokument.titel": "Document nou",
    "dokument.text": "În secțiunea Documente te așteaptă un document nou.",
    "erinnerung.titel": "Reamintire",
    "erinnerung.text": "Ești programat azi și nu ai pontat încă.",
    "mitteilung.titel": "Mesaj",
  },
  hr: {
    "einsatz.titel": "Tvoj zadatak sutra",
    "einsatz.titelMehrere": "Tvoji zadaci sutra ({{n}})",
    "einsatz.standard": "Zadatak",
    "einsatz.beginn": "Početak {{zeit}}",
    "einsatz.fahrzeug": "Vozilo dodijeljeno – detalji u aplikaciji",
    "dokument.titel": "Novi dokument",
    "dokument.text": "U tvojim dokumentima čeka novi dokument.",
    "erinnerung.titel": "Podsjetnik",
    "erinnerung.text": "Danas si raspoređen/a i još se nisi prijavio/la.",
    "mitteilung.titel": "Obavijest",
  },
  ar: {
    "einsatz.titel": "مهمتك غدًا",
    "einsatz.titelMehrere": "مهامك غدًا ({{n}})",
    "einsatz.standard": "مهمة",
    "einsatz.beginn": "البداية {{zeit}}",
    "einsatz.fahrzeug": "تم تخصيص مركبة – التفاصيل في التطبيق",
    "dokument.titel": "مستند جديد",
    "dokument.text": "يوجد مستند جديد في قسم المستندات.",
    "erinnerung.titel": "تذكير",
    "erinnerung.text": "لديك مهمة اليوم ولم تسجّل الحضور بعد.",
    "mitteilung.titel": "إشعار",
  },
  ru: {
    "einsatz.titel": "Твоё задание на завтра",
    "einsatz.titelMehrere": "Твои задания на завтра ({{n}})",
    "einsatz.standard": "Задание",
    "einsatz.beginn": "Начало {{zeit}}",
    "einsatz.fahrzeug": "Машина назначена – подробности в приложении",
    "dokument.titel": "Новый документ",
    "dokument.text": "В разделе «Документы» появился новый документ.",
    "erinnerung.titel": "Напоминание",
    "erinnerung.text": "Ты сегодня в графике и ещё не отметился.",
    "mitteilung.titel": "Сообщение",
  },
  sq: {
    "einsatz.titel": "Detyra jote nesër",
    "einsatz.titelMehrere": "Detyrat e tua nesër ({{n}})",
    "einsatz.standard": "Detyrë",
    "einsatz.beginn": "Fillimi {{zeit}}",
    "einsatz.fahrzeug": "Automjeti u caktua – detajet në aplikacion",
    "dokument.titel": "Dokument i ri",
    "dokument.text": "Në dokumentet e tua të pret një dokument i ri.",
    "erinnerung.titel": "Kujtesë",
    "erinnerung.text": "Sot je i caktuar dhe ende nuk je regjistruar.",
    "mitteilung.titel": "Njoftim",
  },
};
export const PUSH_SCHLUESSEL = Object.keys(PUSH_TEXTE.de);

/** Push-Text in der Sprache des Mitarbeiters: pushText(ma, "einsatz.beginn", { zeit: "07:00" }). Fallback Deutsch. */
export function pushText(maOderCode, schluessel, vars = {}) {
  const code = typeof maOderCode === "string" ? (spracheOk(maOderCode) ? maOderCode : STANDARD_SPRACHE) : spracheVon(maOderCode);
  const vorlage = (PUSH_TEXTE[code] && PUSH_TEXTE[code][schluessel]) || PUSH_TEXTE.de[schluessel] || schluessel;
  return vorlage.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (vars[k] == null ? "" : String(vars[k])));
}
