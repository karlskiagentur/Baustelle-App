// Startet Mock-Airtable + Mini-Server (dist + /api-Handler) und macht Screenshots mit Playwright
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { Readable } from "node:stream";

process.env.AIRTABLE_TOKEN = "test"; process.env.AIRTABLE_BASE_ID = "appTEST"; process.env.SETUP_SECRET = "geheim";
process.env.VAPID_PUBLIC_KEY = "x"; process.env.VAPID_PRIVATE_KEY = "x";
const original = globalThis.fetch;
globalThis.fetch = (url, opts) => original(String(url).replace("https://api.airtable.com", "http://localhost:4010").replace("https://content.airtable.com", "http://localhost:4010/content"), opts);
await import("./mock-airtable.mjs");
const handler = { login: (await import("../api/login.js")).default, daten: (await import("../api/daten.js")).default, aktion: (await import("../api/aktion.js")).default };

const dist = path.resolve("dist");
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".webmanifest": "application/manifest+json", ".json": "application/json" };
http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname.startsWith("/api/")) {
    const name = url.pathname.split("/")[2];
    let body = ""; for await (const c of req) body += c;
    const r = Readable.from([Buffer.from(body)]); r.method = req.method; r.headers = req.headers; r.url = req.url;
    const o = { status(c) { res.statusCode = c; return o; }, setHeader(k, v) { res.setHeader(k, v); return o; }, end(b) { res.end(b); } };
    return handler[name] ? handler[name](r, o) : (res.statusCode = 404, res.end("{}"));
  }
  let p = path.join(dist, url.pathname === "/" ? "index.html" : url.pathname);
  if (!fs.existsSync(p)) p = path.join(dist, "index.html");
  res.setHeader("Content-Type", mime[path.extname(p)] || "application/octet-stream");
  fs.createReadStream(p).pipe(res);
}).listen(4020);

// Chromium der Sandbox suchen (Version/Ordnername wechselt je Container) – sonst Playwright-Standard
const chromeKandidaten = fs.existsSync("/opt/pw-browsers")
  ? fs.readdirSync("/opt/pw-browsers").filter((d) => /^chromium-\d+$/.test(d)).sort().reverse()
      .flatMap((d) => ["chrome-linux64", "chrome-linux"].map((u) => path.join("/opt/pw-browsers", d, u, "chrome")))
  : [];
const executablePath = chromeKandidaten.find((p0) => fs.existsSync(p0));
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, locale: "de-DE" });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
await page.goto("http://localhost:4020/");
await page.waitForSelector("input");
await page.screenshot({ path: "test/shot-1-login.png" });
// Mehrsprachigkeit: Sprachwahl im Login (Türkisch, Arabisch = rechts-nach-links), danach zurück auf Deutsch
await page.click(".sprachen >> text=Türkçe"); await page.waitForTimeout(200);
await page.screenshot({ path: "test/shot-1b-login-tr.png" });
await page.click(".sprachen >> text=العربية"); await page.waitForTimeout(200);
if ((await page.getAttribute("html", "dir")) !== "rtl") console.log("PAGE ERROR: dir=rtl fehlt bei Arabisch");
await page.screenshot({ path: "test/shot-1c-login-ar.png" });
await page.click(".sprachen >> text=Italiano"); await page.waitForTimeout(200);
await page.screenshot({ path: "test/shot-1d-login-it.png" });
await page.click(".sprachen >> text=Deutsch"); await page.waitForTimeout(200);
await page.fill("input >> nth=0", "90001"); await page.fill("input >> nth=1", "1234");
await page.click("button.btn");
await page.waitForSelector(".menue");
await page.waitForTimeout(600);
await page.screenshot({ path: "test/shot-2-heute.png" });
// Stempeluhr-Fenster: Einsatz wählen → läuft
await page.click(".menue >> text=Stempeluhr");
await page.waitForSelector(".blatt"); await page.waitForTimeout(300);
await page.click(".blatt >> text=Trockenbau"); await page.waitForTimeout(900);
await page.screenshot({ path: "test/shot-3-laeuft.png" });
await page.click(".blatt >> text=Abbrechen"); await page.waitForTimeout(400);
// Tagesbericht mit Unterschrift (V1.5): Formular → Unterschrift mit dem Finger → gespeichert mit PDF
const mock = async (tabelle) => (await (await fetch(`http://localhost:4010/v0/appTEST/${encodeURIComponent(tabelle)}`)).json()).records || [];
await page.click(".menue >> text=Tagesbericht"); await page.waitForSelector(".blatt textarea"); await page.waitForTimeout(700);
await page.fill(".blatt textarea >> nth=0", "Ständerwerk OG gestellt, 14 m² beplankt");
await page.fill(".person-zeile .std >> nth=0", "8,5");
await page.screenshot({ path: "test/shot-10-bericht.png" });
await page.click(".blatt >> text=Weiter zur Unterschrift"); await page.waitForSelector(".unterschrift-feld");
await page.fill(".blatt input", "Anna Beispiel");
const feld = await page.locator(".unterschrift-feld").boundingBox();
await page.mouse.move(feld.x + 30, feld.y + 140); await page.mouse.down();
for (let i = 1; i <= 24; i++) await page.mouse.move(feld.x + 30 + i * 12, feld.y + 110 + Math.sin(i / 2) * 45, { steps: 2 });
await page.mouse.up(); await page.waitForTimeout(200);
await page.screenshot({ path: "test/shot-10b-unterschrift.png" });
await page.click(".blatt >> text=Unterschreiben & speichern"); await page.waitForTimeout(2200);
const berichte = await mock("Tagesberichte");
if (berichte.length !== 1 || berichte[0].fields.PDF?.length !== 1 || berichte[0].fields.Status !== "Unterschrieben" || berichte[0].fields.Stunden_gesamt !== 8.5)
  console.log("PAGE ERROR: Tagesbericht nicht korrekt angekommen", JSON.stringify(berichte.map((b) => ({ ...b.fields, PDF: b.fields.PDF?.length, Unterschrift: b.fields.Unterschrift?.length }))));
else console.log("✓ Tagesbericht mit Unterschrift + PDF angekommen");
// Einsätze-Ansicht (Zielort verlinkt auf die Karte)
await page.click(".menue >> text=Einsätze"); await page.waitForTimeout(600);
await page.screenshot({ path: "test/shot-3b-einsaetze.png" });
await page.click(".adresse"); await page.waitForTimeout(1500); // → Karte mit Fokus
await page.screenshot({ path: "test/shot-3c-karte-fokus.png" });
await page.click("nav >> text=Material"); await page.waitForTimeout(600);
await page.screenshot({ path: "test/shot-4-material.png" });
// Tastatur-Simulation (iOS-Fehler „Material anfordern: alles weiß, nichts geht“): sichtbare Höhe schrumpft,
// das Fenster wird hochgeschoben → die App muss zurückspringen, das Feld sichtbar bleiben und Tippen ankommen.
await page.setViewportSize({ width: 390, height: 430 }); // ≈ 350 px Tastatur
await page.evaluate(() => { document.body.style.height = "2000px"; window.scrollTo(0, 320); window.visualViewport.dispatchEvent(new Event("scroll")); });
await page.focus("form input >> nth=1"); // Menge (unterstes Feld)
await page.waitForTimeout(900);
const lage = await page.evaluate(() => {
  const r = document.activeElement.getBoundingClientRect();
  return { fenster: window.scrollY, oben: Math.round(r.top), unten: Math.round(r.bottom), sichtbar: window.innerHeight, feld: document.activeElement.tagName };
});
if (lage.fenster !== 0 || lage.feld !== "INPUT" || lage.oben < 0 || lage.unten > lage.sichtbar) console.log("PAGE ERROR: Tastatur – Eingabefeld nicht sichtbar", JSON.stringify(lage));
else console.log("✓ Tastatur: Feld sichtbar", JSON.stringify(lage));
await page.keyboard.type("40 Stück");
if ((await page.inputValue("form input >> nth=1")) !== "40 Stück") console.log("PAGE ERROR: Tippen im Feld Menge kommt nicht an");
await page.screenshot({ path: "test/shot-4b-material-tastatur.png" });
await page.evaluate(() => { document.body.style.height = ""; document.activeElement.blur(); });
await page.fill("form input >> nth=1", "");
await page.setViewportSize({ width: 390, height: 780 }); await page.waitForTimeout(400);
// Offline (Funkloch): Material anfordern → wartet auf dem Handy → Netz zurück → kommt an
await ctx.setOffline(true); await page.waitForTimeout(300);
await page.fill("form input >> nth=0", "Kies 0/16"); await page.fill("form input >> nth=1", "2 t");
await page.click("form button"); await page.waitForSelector(".offline-leiste"); await page.waitForTimeout(400);
const leiste = await page.textContent(".offline-leiste");
if (!/1 Eintrag wartet/.test(leiste) || !/Kein Netz/.test(leiste)) console.log("PAGE ERROR: Offline-Leiste fehlt/falsch:", leiste);
await page.screenshot({ path: "test/shot-11-offline.png" });
await ctx.setOffline(false); await page.waitForTimeout(2500);
const kies = (await mock("Materialbedarf")).filter((m) => m.fields.Position === "Kies 0/16");
if (kies.length !== 1 || (await page.locator(".offline-leiste").count()) !== 0) console.log("PAGE ERROR: Nach Funkloch nicht (genau einmal) nachgesendet", kies.length);
else console.log("✓ Offline angefordert, nach Funkloch genau einmal angekommen");
await page.click("nav >> text=Karte"); await page.waitForTimeout(2500);
await page.screenshot({ path: "test/shot-5-karte.png" });
await page.click("nav >> text=Zeitkonto"); await page.waitForTimeout(600);
await page.screenshot({ path: "test/shot-6-zeit.png" });
await page.click("nav >> text=Mehr"); await page.waitForTimeout(400);
await page.screenshot({ path: "test/shot-7a-mehr.png" });
await page.click("text=Urlaub beantragen"); await page.waitForTimeout(500);
await page.screenshot({ path: "test/shot-7-urlaub.png" });
// Zurück-Pfeil in der Kopfzeile: Urlaub → Mehr, dann Dokumente → Pfeil → Startmenü
await page.click(".kopf-zurueck"); await page.waitForTimeout(400); // zurück zu „Mehr“
if (!(await page.isVisible("text=Mitteilungen (Push)"))) console.log("PAGE ERROR: Zurück-Pfeil (Urlaub→Mehr) fehlgeschlagen");
await page.click("nav >> text=Dokumente"); await page.waitForTimeout(700);
await page.screenshot({ path: "test/shot-7b-dokumente.png" });
await page.click(".kopf-zurueck"); await page.waitForSelector(".menue"); await page.waitForTimeout(300); // Pfeil → Startmenü
// Sprache unter „Mehr“ umschalten → Heute-Seite auf Arabisch (RTL) und Russisch
await page.click("nav >> nth=0 >> text=Mehr"); await page.waitForTimeout(300);
await page.click(".sprachen >> text=العربية"); await page.waitForTimeout(300);
await page.screenshot({ path: "test/shot-7c-mehr-ar.png" }); // Kopfzeile mit RTL-Pfeil
await page.click("nav button >> nth=0"); await page.waitForTimeout(600);
await page.screenshot({ path: "test/shot-8-heute-ar.png" });
await page.click("nav button >> nth=5"); await page.waitForTimeout(300);
await page.click(".sprachen >> text=Русский"); await page.waitForTimeout(300);
await page.click("nav button >> nth=0"); await page.waitForTimeout(600);
await page.screenshot({ path: "test/shot-9-heute-ru.png" });
// Offline-Start (Funkloch beim Öffnen): App kommt aus dem Speicher (Service Worker), letzter Stand wird gezeigt
await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
await page.waitForTimeout(800);
await ctx.setOffline(true);
await page.reload().catch(() => {});
const startOffline = await page.waitForSelector(".menue", { timeout: 10000 }).then(() => true).catch(() => false);
const standSichtbar = (await page.locator(".offline-stand").count()) === 1;
if (!startOffline || !standSichtbar) console.log("PAGE ERROR: Offline-Start fehlgeschlagen", JSON.stringify({ startOffline, standSichtbar }));
else console.log("✓ Offline-Start: App öffnet ohne Netz mit letztem Stand");
await page.screenshot({ path: "test/shot-12-offline-start.png" });
await ctx.setOffline(false);
await browser.close();
console.log("Screenshots fertig");
process.exit(0);
