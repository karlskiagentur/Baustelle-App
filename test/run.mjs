// Ruft die Vercel-Handler direkt auf (ohne Vercel), gegen die Mock-Airtable
process.env.AIRTABLE_TOKEN = "test";
process.env.AIRTABLE_BASE_ID = "appTEST";
process.env.SETUP_SECRET = "geheim";
process.env.HOOK_SECRET = "hook";
process.env.VAPID_PUBLIC_KEY = "BNVs_ymfR2n1Wjxx4pXQyoJ2gTBIY7v6dfxKV1zZbXV_5D_e2Y7Ep2Wl3n7pR2C2yZ0v8kQ7l7bqfC-9pC1qGnA"; // Platzhalter
process.env.VAPID_PRIVATE_KEY = "x";
// Airtable-URL auf Mock umbiegen
const original = globalThis.fetch;
globalThis.fetch = (url, opts) => original(String(url).replace("https://api.airtable.com", "http://localhost:4010").replace("https://content.airtable.com", "http://localhost:4010/content"), opts);

import login from "../api/login.js";
import daten from "../api/daten.js";
import aktion from "../api/aktion.js";
import einsatzPush from "../api/cron/einsatz-push.js";
import stundenzettel from "../api/cron/stundenzettel.js";
import health from "../api/health.js";
import setup from "../api/setup.js";
import { pushText, SPRACH_CODES, PUSH_SCHLUESSEL, spracheVon } from "../api/_lib/sprachen.js";
import { Readable } from "node:stream";

function req(method, body, url = "/") {
  const r = Readable.from([JSON.stringify(body || {})]);
  r.method = method; r.headers = {}; r.url = url; return r;
}
function res() {
  const o = { code: 0, body: "", status(c) { o.code = c; return o; }, setHeader() { return o; }, end(b) { o.body = b; } };
  return o;
}
async function ruf(handler, method, body, url) { const r = res(); await handler(req(method, body, url), r); return { code: r.code, json: JSON.parse(r.body || "{}") }; }
const pruef = (name, bed, extra = "") => { console.log((bed ? "✓ " : "✗ ") + name, bed ? "" : extra); if (!bed) process.exitCode = 1; };

let r = await ruf(login, "POST", { anmelde_id: 90001, pin: "9999" });
pruef("Login falsche PIN → 401 mit code", r.code === 401 && r.json.code === "login_fehlgeschlagen", JSON.stringify(r.json));
r = await ruf(login, "POST", { anmelde_id: 90001, pin: "1234" });
pruef("Login richtig → token", r.code === 200 && r.json.token?.length === 40, JSON.stringify(r.json));
pruef("Login ohne Profil-Sprache → sprache null", r.json.sprache === null, JSON.stringify(r.json));
let token = r.json.token;

// Mehrsprachigkeit: Sprache ins Profil schreiben, beim nächsten Login zurückbekommen
r = await ruf(aktion, "POST", { token, aktion: "sprache_setzen", daten: { sprache: "tr" } });
pruef("Sprache setzen (tr) ok", r.json.ok && r.json.gespeichert === true, JSON.stringify(r.json));
r = await ruf(aktion, "POST", { token, aktion: "sprache_setzen", daten: { sprache: "xx" } });
pruef("Unbekannte Sprache → 400", r.code === 400 && r.json.code === "ungueltig", JSON.stringify(r.json));
r = await ruf(login, "POST", { anmelde_id: 90001, pin: "1234" });
pruef("Login liefert gespeicherte Sprache tr", r.code === 200 && r.json.sprache === "tr", JSON.stringify(r.json));
token = r.json.token; // Token wurde beim Login rotiert
pruef("Push-Texte in allen Sprachen vollständig", SPRACH_CODES.every((c) => PUSH_SCHLUESSEL.every((k) => pushText(c, k) && pushText(c, k) !== k)));
pruef("Push-Text mit Platzhalter (tr)", pushText({ Sprache: "Türkisch" }, "einsatz.beginn", { zeit: "07:00" }) === "Başlangıç 07:00" && spracheVon({ Sprache: "Arabisch" }) === "ar" && spracheVon({}) === "de");

r = await ruf(daten, "POST", { token: "falsch", bereich: "start" });
pruef("Daten mit falschem Token → 401 mit code", r.code === 401 && r.json.code === "sitzung_abgelaufen");
r = await ruf(daten, "POST", { token, bereich: "start" });
pruef("Daten start: Tagesplan 1, Material 1, Mitteilung 1", r.json.tagesplan?.length === 1 && r.json.material?.length === 1 && r.json.mitteilungen?.length === 1, JSON.stringify(r.json));
r = await ruf(daten, "POST", { token, bereich: "karte" });
pruef("Daten karte: Einsätze/Fahrzeuge/Baustellen", r.json.einsaetze?.length === 1 && r.json.fahrzeuge?.length === 1 && r.json.baustellen?.length === 1);

r = await ruf(aktion, "POST", { token, aktion: "stempel_start", daten: { einsatzId: "recE100000000000E", baustelleId: "recB100000000000B" } });
pruef("Stempel Start → zeiteintragId", r.json.ok && r.json.zeiteintragId, JSON.stringify(r.json));
const zid = r.json.zeiteintragId;
r = await ruf(daten, "POST", { token, bereich: "tagesplan" });
pruef("Einsatz-Status ist 'Vor Ort'", r.json.tagesplan?.[0]?.Status === "Vor Ort");
r = await ruf(aktion, "POST", { token, aktion: "stempel_ende", daten: { zeiteintragId: zid, einsatzId: "recE100000000000E", pauseMinuten: 30 } });
pruef("Stempel Ende ok", r.json.ok);
r = await ruf(daten, "POST", { token, bereich: "zeitkonto" });
pruef("Zeitkonto enthält 1 Eintrag mit Pause 30", r.json.zeit?.length === 1 && r.json.zeit[0].Pause_Minuten === 30, JSON.stringify(r.json));

r = await ruf(aktion, "POST", { token, aktion: "material_status", daten: { materialId: "recM100000000000M", status: "Besorgt" } });
pruef("Material abhaken ok", r.json.ok);
r = await ruf(daten, "POST", { token, bereich: "material" });
pruef("Besorgtes Material verschwindet aus der Liste", r.json.material?.length === 0);
r = await ruf(aktion, "POST", { token, aktion: "material_anfordern", daten: { position: "Dachlatten", menge: "40" } });
pruef("Material anfordern ok", r.json.ok);
r = await ruf(aktion, "POST", { token, aktion: "urlaub_antrag", daten: { von: "2026-09-07", bis: "2026-09-11" } });
pruef("Urlaubsantrag ok", r.json.ok);
r = await ruf(daten, "POST", { token, bereich: "urlaub" });
pruef("Urlaub sichtbar mit Status Offen", r.json.urlaub?.[0]?.Status === "Offen");
r = await ruf(aktion, "POST", { token, aktion: "push_abo", daten: { abo: { endpoint: "https://x", keys: { p256dh: "a", auth: "b" } } } });
pruef("Push-Abo speichern ok", r.json.ok);
r = await ruf(aktion, "POST", { token, aktion: "unbekannt" });
pruef("Unbekannte Aktion → 400", r.code === 400);

r = await ruf(einsatzPush, "GET", null, "/api/cron/einsatz-push");
pruef("Cron ohne Secret → 401", r.code === 401);
r = await ruf(einsatzPush, "GET", null, "/api/cron/einsatz-push?secret=geheim");
pruef("Cron mit Secret läuft (keine Einsätze morgen)", r.code === 200 && r.json.ok, JSON.stringify(r.json));
r = await ruf(einsatzPush, "GET", null, "/api/cron/einsatz-push?secret=hook");
pruef("Push-Endpunkt mit HOOK_SECRET erlaubt", r.code === 200 && r.json.ok, JSON.stringify(r.json));
r = await ruf(einsatzPush, "GET", null, "/api/cron/einsatz-push?secret=falsch");
pruef("Push-Endpunkt mit falschem Secret → 401", r.code === 401);
r = await ruf(setup, "GET", null, "/api/setup?secret=hook");
pruef("Setup mit HOOK_SECRET verweigert (401)", r.code === 401, JSON.stringify(r.json));

r = await ruf(aktion, "POST", { token, aktion: "stempel_start", daten: { einsatzId: "recFREMD00000000" } });
pruef("Stempel auf fremden Einsatz → 403", r.code === 403, JSON.stringify(r.json));
r = await ruf(aktion, "POST", { token, aktion: "material_status", daten: { materialId: "recM100000000000M", status: "Bestellt" } });
pruef("Unerlaubter Materialstatus → 400", r.code === 400);
r = await ruf(aktion, "POST", { token, aktion: "urlaub_antrag", daten: { von: "2026-09-11", bis: "2026-09-07" } });
pruef("Urlaub bis<von → 400", r.code === 400);
r = await ruf(stundenzettel, "GET", null, "/api/cron/stundenzettel?secret=geheim&monat=" + new Date().toISOString().slice(0, 7));
pruef("Stundenzettel-PDF erzeugt (1 Mitarbeiter)", r.code === 200 && r.json.erzeugt === 1, JSON.stringify(r.json));
r = await ruf(daten, "POST", { token, bereich: "dokumente" });
pruef("Stundenzettel erscheint unter Dokumente (ohne Attachment-URL)", r.json.dokumente?.length === 1 && r.json.dokumente[0].Typ === "Stundenzettel" && !r.json.dokumente[0].Datei?.[0]?.url, JSON.stringify(r.json));
r = await ruf(aktion, "POST", { token, aktion: "dokument_gesehen", daten: { dokumentId: r.json.dokumente[0].id } });
pruef("Dokument als gesehen markiert", r.json.ok);
r = await ruf(health, "GET", null, "/api/health");
pruef("Health 200", r.code === 200 && r.json.status === "ok", JSON.stringify(r.json));

// 5× falsche PIN → Sperre
for (let i = 0; i < 5; i++) await ruf(login, "POST", { anmelde_id: 90001, pin: "0000" });
r = await ruf(login, "POST", { anmelde_id: 90001, pin: "1234" });
pruef("Nach 5 Fehlversuchen gesperrt (423)", r.code === 423, JSON.stringify(r.json));
console.log(process.exitCode ? "\nFEHLER" : "\nAlle Tests bestanden.");
