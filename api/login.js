import crypto from "node:crypto";
import { suchen, aendern, TABELLEN, jsonAntwort, bodyLesen, handledPreflight, sendError } from "./_lib/airtable.js";
import { spracheVon } from "./_lib/sprachen.js";

const SPERRE_NACH = 5;
const SPERRE_MINUTEN = 15;
const FEHL = { ok: false, fehler: "Anmeldung fehlgeschlagen", code: "login_fehlgeschlagen" };

/**
 * POST /api/login   { "anmelde_id": 90001, "pin": "1234" }
 * Muster Wunschlos ma-login: 5-stellige ID (90000 + Personal_Nr) + PIN,
 * generische Fehlermeldung (keine Enumeration), Sperre nach 5 Fehlversuchen.
 * Fehlerantworten tragen einen `code`, den die App in die Sprache des Nutzers übersetzt.
 */
export default async function handler(req, res) {
  if (handledPreflight(req, res)) return;
  if (req.method !== "POST") return jsonAntwort(res, 405, { ok: false, fehler: "Nur POST" });
  try {
    const b = await bodyLesen(req);
    const idText = String(b.anmelde_id ?? "").trim();
    const pin = String(b.pin ?? "").trim();
    // Nur Ziffern zulassen, bevor irgendetwas in eine Formel wandert (Injection-Schutz)
    if (!/^\d{5,6}$/.test(idText) || !/^\d{4,8}$/.test(pin))
      return jsonAntwort(res, 401, FEHL);
    const anmeldeId = Number(idText);
    if (anmeldeId <= 90000) return jsonAntwort(res, 401, FEHL);

    // Suche über Personal_Nr (Anmelde_ID = 90000 + Personal_Nr) – funktioniert auch ohne Formelfeld
    const treffer = await suchen(TABELLEN.mitarbeiter, `{Personal_Nr}=${anmeldeId - 90000}`, { maxRecords: 1 });
    const ma = treffer[0];
    if (!ma) return jsonAntwort(res, 401, FEHL);
    if (ma.Aktiv !== true) return jsonAntwort(res, 401, FEHL);
    if (ma.Locked_Until && new Date(ma.Locked_Until) > new Date())
      return jsonAntwort(res, 423, { ok: false, fehler: "Zu viele Fehlversuche – bitte in 15 Minuten erneut", code: "gesperrt" });

    if (String(ma.Login_Code ?? "") !== String(Number(pin))) {
      const fehl = (Number(ma.Failed_Attempts) || 0) + 1;
      const update = fehl >= SPERRE_NACH
        ? { Failed_Attempts: 0, Locked_Until: new Date(Date.now() + SPERRE_MINUTEN * 60000).toISOString() }
        : { Failed_Attempts: fehl };
      await aendern(TABELLEN.mitarbeiter, ma.id, update);
      return jsonAntwort(res, 401, FEHL);
    }

    // Erfolg: Token rotieren, Zähler zurücksetzen
    const token = crypto.randomBytes(30).toString("base64url");
    await aendern(TABELLEN.mitarbeiter, ma.id, { Session_Token: token, Failed_Attempts: 0, Locked_Until: null });
    return jsonAntwort(res, 200, {
      ok: true,
      token,
      mitarbeiterId: ma.id,
      name: ma.Name || "",
      kolonne: ma.Kolonne || null,
      sprache: ma.Sprache ? spracheVon(ma) : null, // App-Sprache aus dem Profil (Feld „Sprache“); null = nicht gesetzt → App behält Geräte-/Browser-Sprache
    });
  } catch (e) {
    return sendError(res, e, "api/login");
  }
}
