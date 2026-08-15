import webpush from "web-push";
import { suchen, aendern, TABELLEN } from "./airtable.js";

let konfiguriert = false;
function initPush() {
  if (konfiguriert) return;
  webpush.setVapidDetails(
    `mailto:${process.env.VAPID_MAIL || "info@example.de"}`,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  konfiguriert = true;
}

/**
 * Schickt eine Push-Nachricht an einen Mitarbeiter-Datensatz.
 * Bei abgelaufenem Abo (404/410) wird Push_Subscription automatisch geleert.
 */
export async function pushAnMitarbeiter(ma, { titel, text, url }) {
  if (!ma?.Push_Subscription) return { ok: false, grund: "kein Abo" };
  initPush();
  let abo;
  try {
    abo = JSON.parse(ma.Push_Subscription);
  } catch {
    return { ok: false, grund: "Abo unlesbar" };
  }
  try {
    await webpush.sendNotification(abo, JSON.stringify({ title: titel, body: text, url: url || "/" }));
    return { ok: true };
  } catch (e) {
    const code = e.statusCode || 0;
    if (code === 404 || code === 410) {
      try { await aendern(TABELLEN.mitarbeiter, ma.id, { Push_Subscription: "" }); } catch {}
      return { ok: false, grund: "Abo abgelaufen (geleert)" };
    }
    return { ok: false, grund: `Fehler ${code || e.message}` };
  }
}

/** Alle aktiven Mitarbeiter mit Push-Abo. */
export async function mitarbeiterMitAbo() {
  return suchen(TABELLEN.mitarbeiter, `AND({Aktiv}, {Push_Subscription}!="")`);
}
