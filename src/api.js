// Gespräch mit dem Vercel-Backend. Session-Token liegt lokal auf dem Gerät und
// wird als Authorization-Header mitgeschickt (nicht in der URL).
import i18n, { locale } from "./i18n.js";

const SCHLUESSEL = "baustelle_session";

export function sitzung() {
  try { return JSON.parse(localStorage.getItem(SCHLUESSEL)) || null; } catch { return null; }
}
export function sitzungSetzen(s) {
  if (s) localStorage.setItem(SCHLUESSEL, JSON.stringify(s));
  else localStorage.removeItem(SCHLUESSEL);
}

/** Server-Fehler in die Sprache des Nutzers übersetzen (Server schickt `code`, deutscher Text bleibt Fallback). */
function uebersetzen(j) {
  if (j && j.ok === false && j.code) j.fehler = i18n.t(`server.${j.code}`, { defaultValue: j.fehler || i18n.t("server.serverfehler") });
  return j;
}

export async function api(pfad, body = {}) {
  const s = sitzung();
  let r;
  try {
    r = await fetch(`/api/${pfad}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(s ? { Authorization: `Bearer ${s.token}` } : {}) },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, fehler: i18n.t("server.keineVerbindung") };
  }
  const j = await r.json().catch(() => ({ ok: false, fehler: i18n.t("server.serverfehler") }));
  if (r.status === 401 && s) {
    sitzungSetzen(null);
    window.dispatchEvent(new Event("baustelle-abgemeldet"));
  }
  return uebersetzen(j);
}

/** Download-Link für ein eigenes Dokument (Server prüft Eigentum, holt die Datei frisch von Airtable). */
export function dokumentUrl(dokumentId) {
  const s = sitzung();
  return `/api/dokument-download?id=${encodeURIComponent(dokumentId)}&token=${encodeURIComponent(s?.token || "")}`;
}

// Datum/Uhrzeit in der Sprache des Nutzers (Locale aus i18n.js)
export const datumSchoen = (iso) => {
  if (!iso) return "";
  const d = new Date(iso.length <= 10 ? iso + "T00:00:00" : iso);
  return d.toLocaleDateString(locale(), { weekday: "short", day: "2-digit", month: "2-digit" });
};
export const zeitSchoen = (iso) =>
  iso ? new Date(iso).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) : ""; // immer 24 h (Baustelle: „07:00“)
export const monatSchoen = (d) => d.toLocaleDateString(locale(), { month: "long", year: "numeric" });
export const minutenSchoen = (min) => {
  if (min == null || isNaN(min)) return i18n.t("allgemein.keinWert");
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return `${h}:${String(m).padStart(2, "0")} ${i18n.t("allgemein.stundenKurz")}`;
};
