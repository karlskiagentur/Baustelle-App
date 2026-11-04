// Ruft die Vercel-Handler direkt auf (ohne Vercel), gegen die Mock-Airtable
process.env.AIRTABLE_TOKEN = "test";
process.env.AIRTABLE_BASE_ID = "appTEST";
process.env.SETUP_SECRET = "geheim";
process.env.HOOK_SECRET = "hook";
process.env.VAPID_PUBLIC_KEY = "BNVs_ymfR2n1Wjxx4pXQyoJ2gTBIY7v6dfxKV1zZbXV_5D_e2Y7Ep2Wl3n7pR2C2yZ0v8kQ7l7bqfC-9pC1qGnA"; // Platzhalter
process.env.VAPID_PRIVATE_KEY = "x";
// Airtable-URL auf Mock umbiegen
const original = globalThis.fetch;
globalThis.fetch = (url, opts) => original(String(url).replace("https://api.airtable.com", "http://localhost:4010").replace("https://content.airtable.com", "http://localhost:4010/content").replace("https://ai-gateway.vercel.sh", "http://localhost:4010/gateway"), opts);

import login from "../api/login.js";
import daten from "../api/daten.js";
import aktion from "../api/aktion.js";
import einsatzPush from "../api/cron/einsatz-push.js";
import stundenzettel from "../api/cron/stundenzettel.js";
import health from "../api/health.js";
import setup from "../api/setup.js";
import { pushText, SPRACH_CODES, PUSH_SCHLUESSEL, spracheVon } from "../api/_lib/sprachen.js";
import exportHandler from "../api/export.js";
import dokumentPush from "../api/cron/dokument-push.js";
import webpush from "web-push";
import { berichtPdf } from "../api/_lib/bericht-pdf.js";
import { pdfText } from "../api/_lib/pdf.js";
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
async function rufRoh(handler, url) { const r = res(); await handler(req("GET", null, url), r); return { code: r.code, text: String(r.body || "") }; }
// Rohdaten direkt aus der Mock-Airtable (auch Felder, die die App nicht ausliefert)
const roh = async (tabelle, id) => (await (await original(`http://localhost:4010/v0/appTEST/${encodeURIComponent(tabelle)}/${id}`)).json()).fields || {};
const alle = async (tabelle) => (await (await original(`http://localhost:4010/v0/appTEST/${encodeURIComponent(tabelle)}`)).json()).records || [];
const MINI_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
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
pruef("Spanisch: Profil-Sprache und Push-Texte", spracheVon({ Sprache: "Spanisch" }) === "es" && pushText("es", "dokument.titel") === "Nuevo documento" && pushText({ Sprache: "Spanisch" }, "einsatz.beginn", { zeit: "07:00" }) === "Inicio 07:00");
pruef("Italienisch + Französisch: Profil-Sprache und Push-Texte", spracheVon({ Sprache: "Italienisch" }) === "it" && spracheVon({ Sprache: "Französisch" }) === "fr" && pushText("it", "einsatz.beginn", { zeit: "07:00" }) === "Inizio 07:00" && pushText({ Sprache: "Französisch" }, "dokument.titel") === "Nouveau document");

r = await ruf(daten, "POST", { token: "falsch", bereich: "start" });
pruef("Daten mit falschem Token → 401 mit code", r.code === 401 && r.json.code === "sitzung_abgelaufen");
r = await ruf(daten, "POST", { token, bereich: "start" });
pruef("Daten start: Tagesplan 1, Material 1, Mitteilung 1", r.json.tagesplan?.length === 1 && r.json.material?.length === 1 && r.json.mitteilungen?.length === 1, JSON.stringify(r.json));
r = await ruf(daten, "POST", { token, bereich: "karte" });
pruef("Daten karte: Einsätze/Fahrzeuge/Baustellen", r.json.einsaetze?.length === 1 && r.json.fahrzeuge?.length === 1 && r.json.baustellen?.length === 1);
r = await ruf(daten, "POST", { token, bereich: "baustellen" });
pruef("Daten baustellen: 1 aktive Baustelle für die Foto-Auswahl", r.json.baustellen?.length === 1 && r.json.baustellen[0].Name === "Musterweg 12", JSON.stringify(r.json));

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

// ---- Offline-Erfassung (V1.5): Handy-Uhrzeit, Client-ID gegen Doppelte, Ende über Start-ID ----
const vor2h = new Date(Date.now() - 2 * 3600e3).toISOString(), vor1h = new Date(Date.now() - 3600e3).toISOString();
r = await ruf(aktion, "POST", { token, aktion: "stempel_start", daten: { einsatzId: "recE100000000000E", baustelleId: "recB100000000000B", cid: "test-offline-start-1", zeit: vor2h } });
const zOff = r.json.zeiteintragId;
pruef("Offline-Start gespeichert", r.json.ok && zOff, JSON.stringify(r.json));
r = await ruf(aktion, "POST", { token, aktion: "stempel_start", daten: { einsatzId: "recE100000000000E", cid: "test-offline-start-1", zeit: vor2h } });
pruef("Doppelte Sendung (gleiche Client-ID) → kein zweiter Eintrag", r.json.ok && r.json.doppelt === true && r.json.zeiteintragId === zOff, JSON.stringify(r.json));
r = await ruf(aktion, "POST", { token, aktion: "stempel_ende", daten: { startCid: "test-offline-start-1", einsatzId: "recE100000000000E", pauseMinuten: 15, zeit: vor1h } });
pruef("Offline-Ende über die Client-ID des Starts", r.json.ok, JSON.stringify(r.json));
r = await ruf(aktion, "POST", { token, aktion: "stempel_ende", daten: { startCid: "test-offline-start-1", zeit: vor1h } });
pruef("Ende doppelt gesendet → 409 (App verwirft es)", r.code === 409 && r.json.code === "bereits_beendet", JSON.stringify(r.json));
let zr = await roh("Zeiteinträge", zOff);
pruef("Offline-Eintrag: Start/Ende = Handy-Zeit, Quelle „App (offline)“, Eingang vermerkt", zr.Start === vor2h && zr.Ende === vor1h && zr.Quelle === "App (offline)" && !!zr.Gesendet_Am && zr.Client_ID === "test-offline-start-1", JSON.stringify(zr));
r = await ruf(aktion, "POST", { token, aktion: "stempel_start", daten: { cid: "test-zu-alt-0001", zeit: new Date(Date.now() - 40 * 86400e3).toISOString() } });
pruef("Zu alter Offline-Stempel (40 Tage) → 400 zeit_ungueltig", r.code === 400 && r.json.code === "zeit_ungueltig", JSON.stringify(r.json));
r = await ruf(aktion, "POST", { token, aktion: "stempel_start", daten: { cid: "test-uhr-vor-0001", zeit: new Date(Date.now() + 3600e3).toISOString() } });
zr = await roh("Zeiteinträge", r.json.zeiteintragId);
pruef("Handy-Uhr geht vor → Serverzeit + Vermerk im Korrektur_Log", r.json.ok && new Date(zr.Start) <= new Date() && /Handy-Uhr/.test(zr.Korrektur_Log || ""), JSON.stringify(zr));
r = await ruf(aktion, "POST", { token, aktion: "stempel_ende", daten: { startCid: "test-uhr-vor-0001" } });
pruef("Ende ohne Uhrzeit (online) ok", r.json.ok, JSON.stringify(r.json));
r = await ruf(aktion, "POST", { token, aktion: "stempel_ende", daten: { startCid: "test-gibt-es-nicht" } });
pruef("Ende zu unbekanntem Start → 404 eintrag_fehlt", r.code === 404 && r.json.code === "eintrag_fehlt", JSON.stringify(r.json));
r = await ruf(aktion, "POST", { token, aktion: "foto_doku", daten: { baustelleId: "recB100000000000B", kategorie: "Mangel", notiz: "Riss", fotoBase64: "AAAA", cid: "test-foto-0001", zeit: vor1h } });
const fotoId = r.json.dokuId;
r = await ruf(aktion, "POST", { token, aktion: "foto_doku", daten: { baustelleId: "recB100000000000B", fotoBase64: "AAAA", cid: "test-foto-0001", zeit: vor1h } });
pruef("Offline-Foto: doppelt gesendet → ein Eintrag, ein Foto, Aufnahmezeit vom Handy", r.json.ok && r.json.dokuId === fotoId && (await alle("Doku")).filter((x) => x.fields.Client_ID === "test-foto-0001").length === 1 && (await roh("Doku", fotoId)).Foto?.length === 1 && (await roh("Doku", fotoId)).Aufgenommen_Am === vor1h);
r = await ruf(aktion, "POST", { token, aktion: "material_anfordern", daten: { position: "Kies", cid: "test-mat-00001" } });
const r2 = await ruf(aktion, "POST", { token, aktion: "material_anfordern", daten: { position: "Kies", cid: "test-mat-00001" } });
pruef("Material offline angefordert, doppelt gesendet → nur einmal", r.json.ok && r2.json.doppelt === true && (await alle("Materialbedarf")).filter((x) => x.fields.Client_ID === "test-mat-00001").length === 1);

// ---- Tagesbericht mit Unterschrift (Modul „tagesbericht“) ----
r = await ruf(daten, "POST", { token, bereich: "bericht_vorschlag", einsatzId: "recE100000000000E" });
pruef("Berichtsvorschlag: Team des Einsatzes mit heutigen Stunden", r.json.ok && r.json.leute?.[0]?.name === "Max Beispiel" && typeof r.json.leute[0].stunden === "number" && r.json.module?.includes("tagesbericht"), JSON.stringify(r.json));
const bericht = { einsatzId: "recE100000000000E", art: "Regiebericht", arbeiten: "Durchbruch Bad verschlossen", leute: [{ name: "Max Beispiel", stunden: "7,5" }, { name: "Şahin Yılmaz", stunden: 8 }], material: "2 Sack Gips", unterzeichner: "Anna Łukasiewicz", unterschrift: MINI_PNG, cid: "test-bericht-001", zeit: vor1h };
r = await ruf(aktion, "POST", { token, aktion: "tagesbericht", daten: bericht });
const berichtId = r.json.berichtId;
let br = await roh("Tagesberichte", berichtId);
pruef("Tagesbericht gespeichert: PDF + Unterschrift, Status unterschrieben, 15,5 Std.", r.json.ok && br.PDF?.length === 1 && br.Unterschrift?.length === 1 && br.Status === "Unterschrieben" && br.Stunden_gesamt === 15.5 && br.Art === "Regiebericht" && br.Baustelle?.[0] === "recB100000000000B", JSON.stringify({ r: r.json, br: { ...br, PDF: br.PDF?.length } }));
r = await ruf(aktion, "POST", { token, aktion: "tagesbericht", daten: bericht });
pruef("Tagesbericht doppelt gesendet → gleicher Bericht, kein zweites PDF", r.json.berichtId === berichtId && (await roh("Tagesberichte", berichtId)).PDF.length === 1 && (await alle("Tagesberichte")).length === 1);
r = await ruf(aktion, "POST", { token, aktion: "tagesbericht", daten: { ...bericht, cid: "test-bericht-002", arbeiten: "  " } });
pruef("Tagesbericht ohne Arbeiten → 400", r.code === 400);
r = await ruf(aktion, "POST", { token, aktion: "tagesbericht", daten: { ...bericht, cid: "test-bericht-003", unterzeichner: "" } });
pruef("Unterschrift ohne Namen → 400", r.code === 400);
r = await ruf(aktion, "POST", { token, aktion: "tagesbericht", daten: { arbeiten: "Aufgeräumt", cid: "test-bericht-004" } });
pruef("Tagesbericht ohne Unterschrift → Status „Ohne Unterschrift“", r.json.ok && (await roh("Tagesberichte", r.json.berichtId)).Status === "Ohne Unterschrift");
process.env.MODULE = "export";
r = await ruf(aktion, "POST", { token, aktion: "tagesbericht", daten: { ...bericht, cid: "test-bericht-005" } });
const rm = await ruf(daten, "POST", { token, bereich: "tagesplan" });
pruef("Modul aus → Tagesbericht 403 modul_aus, App bekommt Modulliste", r.code === 403 && r.json.code === "modul_aus" && JSON.stringify(rm.json.module) === '["export"]', JSON.stringify(rm.json.module));
delete process.env.MODULE;
const pdfBytes = await berichtPdf({ art: "Tagesbericht", zeit: new Date(), ma: { Name: "Đorđe Petrović" }, arbeiten: "Кирилл, Łukasz, Şahin, Ștefan", leute: [{ name: "Ștefan", stunden: 8 }], summe: 8 });
pruef("Bericht-PDF mit Namen aus allen App-Sprachen (Unicode-Schrift)", Buffer.from(pdfBytes).subarray(0, 4).toString() === "%PDF" && pdfBytes.length > 2000);
pruef("Notfall ohne Unicode-Schrift: Sonderzeichen ersetzt statt Absturz", pdfText("Şahin Łukasz Ștefan Кирилл", false) === "Sahin Lukasz Stefan Kirill");
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
const monatJetzt = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" }).slice(0, 7);
r = await ruf(stundenzettel, "GET", null, "/api/cron/stundenzettel?secret=geheim&monat=" + monatJetzt);
pruef("Stundenzettel-PDF erzeugt (1 Mitarbeiter)", r.code === 200 && r.json.erzeugt === 1, JSON.stringify(r.json));
const ex = await alle("Exporte");
pruef("Lohn-Export am Monatsanfang in „Exporte“ abgelegt (Zeiten + Summen, DATEV-Hinweis)", r.json.export === "ok" && ex.length === 1 && ex[0].fields.Dateien?.length === 2 && /DATEV/.test(ex[0].fields.Hinweise || ""), JSON.stringify(ex[0]?.fields));

// ---- Lohn-Export zum Herunterladen (Modul „export“) ----
let t = await rufRoh(exportHandler, `/api/export?monat=${monatJetzt}`);
pruef("Export ohne Secret → 401", t.code === 401);
t = await rufRoh(exportHandler, `/api/export?secret=hook&monat=${monatJetzt}&datei=zeiten`);
pruef("Export Zeiten: CSV mit BOM, Kopfzeile, offline-Eintrag", t.code === 200 && t.text.startsWith("\uFEFFPersonalnr.;Name;Datum") && /App \(offline\)/.test(t.text) && /;Max Beispiel;/.test(t.text), t.text.slice(0, 300));
t = await rufRoh(exportHandler, `/api/export?secret=hook&monat=${monatJetzt}&datei=summen`);
pruef("Export Summen je Mitarbeiter (Stunden mit Komma)", t.code === 200 && /^7;Max Beispiel;\d+,\d\d;/m.test(t.text.replace("\uFEFF", "")), t.text.slice(0, 400));
t = await rufRoh(exportHandler, `/api/export?secret=hook&monat=${monatJetzt}&datei=datev`);
pruef("DATEV ohne Einrichtung → 400 mit Hinweis", t.code === 400 && /DATEV_BERATERNR/.test(t.text));
Object.assign(process.env, { DATEV_BERATERNR: "1234567", DATEV_MANDANTENNR: "12345", DATEV_LA_ARBEIT: "100" });
t = await rufRoh(exportHandler, `/api/export?secret=hook&monat=${monatJetzt}&datei=datev`);
const [jj, mm2] = monatJetzt.split("-");
pruef("DATEV-LODAS-Datei: Kopf, Satzbeschreibung, Stunden je Personalnummer", t.code === 200 && t.text.includes("Ziel=LODAS") && t.text.includes("BeraterNr=1234567") && t.text.includes("u_lod_bwd_buchung_standard") && new RegExp(`^21;7;01\\.${mm2}\\.${jj};\\d+,\\d\\d;1;100;;;`, "m").test(t.text), t.text);
for (const k of ["DATEV_BERATERNR", "DATEV_MANDANTENNR", "DATEV_LA_ARBEIT"]) delete process.env[k];
process.env.MODULE = "tagesbericht";
t = await rufRoh(exportHandler, `/api/export?secret=hook&monat=${monatJetzt}`);
pruef("Export bei abgeschaltetem Modul → 403", t.code === 403);
delete process.env.MODULE;
r = await ruf(daten, "POST", { token, bereich: "dokumente" });
pruef("Stundenzettel erscheint unter Dokumente (ohne Attachment-URL)", r.json.dokumente?.length === 1 && r.json.dokumente[0].Typ === "Stundenzettel" && !r.json.dokumente[0].Datei?.[0]?.url, JSON.stringify(r.json));
r = await ruf(aktion, "POST", { token, aktion: "dokument_gesehen", daten: { dokumentId: r.json.dokumente[0].id } });
pruef("Dokument als gesehen markiert", r.json.ok);
// ---- Büro-Übersetzung über Claude (Vercel AI Gateway), Modul „uebersetzung“ ----
const gateway = async () => (await (await original("http://localhost:4010/gateway")).json()).aufrufe;
const mitteilungSetzen = (felder) => original("http://localhost:4010/v0/appTEST/Mitteilungen", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ records: [{ id: "recMT1000000000MT", fields: felder }] }) });
r = await ruf(daten, "POST", { token, bereich: "start" });
pruef("Übersetzung aus (Standard): Mitteilung deutsch, kein KI-Aufruf", r.json.mitteilungen?.[0]?.Titel === "Hallo" && !r.json.mitteilungen[0].uebersetzt && (await gateway()) === 0 && !r.json.module?.includes("uebersetzung"), JSON.stringify(r.json.mitteilungen));
Object.assign(process.env, { MODULE: "tagesbericht,export,uebersetzung", AI_GATEWAY_API_KEY: "test-gateway" });
r = await ruf(daten, "POST", { token, bereich: "start" }); // Profil-Sprache Türkisch
const m0 = r.json.mitteilungen?.[0], e0 = r.json.tagesplan?.[0];
pruef("Übersetzung an: Mitteilung + Einsatz auf Türkisch, Original dabei", m0?.Titel === "«Turkish» Hallo" && m0?.Nachricht === "«Turkish» Willkommen" && m0?.original?.Titel === "Hallo" && m0?.uebersetzt === true && e0?.Aufgabe === "«Turkish» Trockenbau" && e0?.original?.Aufgabe === "Trockenbau", JSON.stringify({ m0, e0: e0 && { Aufgabe: e0.Aufgabe, original: e0.original } }));
const aufrufe1 = await gateway();
r = await ruf(daten, "POST", { token, bereich: "start" });
pruef("Gemerkt: zweiter Abruf ohne neuen KI-Aufruf", r.json.mitteilungen?.[0]?.Titel === "«Turkish» Hallo" && aufrufe1 >= 1 && aufrufe1 <= 2 && (await gateway()) === aufrufe1, `Aufrufe ${aufrufe1} → ${await gateway()}`);
pruef("Übersetzung in Airtable gemerkt (Feld „Übersetzungen“)", /Turkish/.test((await roh("Mitteilungen", "recMT1000000000MT"))["Übersetzungen"] || ""));
await mitteilungSetzen({ Nachricht: "Morgen 7 Uhr Treffpunkt Lager" });
r = await ruf(daten, "POST", { token, bereich: "mitteilungen" });
pruef("Büro ändert den Text → neu übersetzt", r.json.mitteilungen?.[0]?.Nachricht === "«Turkish» Morgen 7 Uhr Treffpunkt Lager" && (await gateway()) === aufrufe1 + 1, JSON.stringify(r.json.mitteilungen));
r = await ruf(daten, "POST", { token, bereich: "mitteilungen", sprache: "de" });
pruef("App auf Deutsch → Originaltext, kein KI-Aufruf", r.json.mitteilungen?.[0]?.Nachricht === "Morgen 7 Uhr Treffpunkt Lager" && !r.json.mitteilungen[0].uebersetzt && (await gateway()) === aufrufe1 + 1);
r = await ruf(daten, "POST", { token, bereich: "mitteilungen", sprache: "es" });
pruef("App auf Spanisch → spanische Übersetzung", r.json.mitteilungen?.[0]?.Titel === "«Spanish» Hallo", JSON.stringify(r.json.mitteilungen));
// Push abfangen statt senden (Test ohne echte VAPID-Schlüssel)
const pushes = [];
webpush.setVapidDetails = () => {};
webpush.sendNotification = async (abo, nutzlast) => { pushes.push(JSON.parse(nutzlast)); };
await mitteilungSetzen({ Push_senden: "Senden" });
r = await ruf(dokumentPush, "GET", null, "/api/cron/dokument-push?secret=hook");
pruef("Push „Mitteilung“ kommt übersetzt an (Türkisch) und wird als gesendet markiert", r.code === 200 && r.json.ok && pushes.some((p) => p.title === "«Turkish» Hallo" && /^«Turkish» Morgen 7 Uhr/.test(p.body)) && (await roh("Mitteilungen", "recMT1000000000MT")).Push_senden === "Gesendet", JSON.stringify({ r: r.json, pushes }));
await mitteilungSetzen({ Nachricht: "GATEWAY-FEHLER bitte melden" });
r = await ruf(daten, "POST", { token, bereich: "mitteilungen", sprache: "pl" });
pruef("KI nicht erreichbar → deutscher Text, keine Fehlermeldung", r.json.ok && r.json.mitteilungen?.[0]?.Nachricht === "GATEWAY-FEHLER bitte melden" && !r.json.mitteilungen[0].uebersetzt, JSON.stringify(r.json));
delete process.env.AI_GATEWAY_API_KEY;
r = await ruf(daten, "POST", { token, bereich: "mitteilungen", sprache: "ru" });
const rh = await ruf(health, "GET", null, "/api/health");
pruef("Ohne Zugang zum AI Gateway → deutscher Text; Health meldet „nicht bereit“", r.json.ok && !r.json.mitteilungen?.[0]?.uebersetzt && rh.json.module?.includes("uebersetzung") && rh.json.uebersetzungBereit === false, JSON.stringify(rh.json));
delete process.env.MODULE;
await mitteilungSetzen({ Nachricht: "Willkommen" });

r = await ruf(health, "GET", null, "/api/health");
pruef("Health 200 (Unicode-Schrift für PDFs vorhanden)", r.code === 200 && r.json.status === "ok" && r.json.pdfSchrift === true, JSON.stringify(r.json));

// 5× falsche PIN → Sperre
for (let i = 0; i < 5; i++) await ruf(login, "POST", { anmelde_id: 90001, pin: "0000" });
r = await ruf(login, "POST", { anmelde_id: 90001, pin: "1234" });
pruef("Nach 5 Fehlversuchen gesperrt (423)", r.code === 423, JSON.stringify(r.json));
console.log(process.exitCode ? "\nFEHLER" : "\nAlle Tests bestanden.");
