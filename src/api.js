// Gespräch mit dem Vercel-Backend. Session-Token liegt lokal auf dem Gerät und
// wird als Authorization-Header mitgeschickt (nicht in der URL).
const SCHLUESSEL = "baustelle_session";

export function sitzung() {
  try { return JSON.parse(localStorage.getItem(SCHLUESSEL)) || null; } catch { return null; }
}
export function sitzungSetzen(s) {
  if (s) localStorage.setItem(SCHLUESSEL, JSON.stringify(s));
  else localStorage.removeItem(SCHLUESSEL);
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
    return { ok: false, fehler: "Keine Verbindung – bitte Netz prüfen und erneut versuchen." };
  }
  const j = await r.json().catch(() => ({ ok: false, fehler: "Serverfehler" }));
  if (r.status === 401 && s) {
    sitzungSetzen(null);
    window.dispatchEvent(new Event("baustelle-abgemeldet"));
  }
  return j;
}

/** Download-Link für ein eigenes Dokument (Server prüft Eigentum, holt die Datei frisch von Airtable). */
export function dokumentUrl(dokumentId) {
  const s = sitzung();
  return `/api/dokument-download?id=${encodeURIComponent(dokumentId)}&token=${encodeURIComponent(s?.token || "")}`;
}

export const datumSchoen = (iso) => {
  if (!iso) return "";
  const d = new Date(iso.length <= 10 ? iso + "T00:00:00" : iso);
  return d.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
};
export const zeitSchoen = (iso) =>
  iso ? new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) : "";
export const minutenSchoen = (min) => {
  if (min == null || isNaN(min)) return "–";
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return `${h}:${String(m).padStart(2, "0")} h`;
};
