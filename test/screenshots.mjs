// Startet Mock-Airtable + Mini-Server (dist + /api-Handler) und macht Screenshots mit Playwright
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { Readable } from "node:stream";

process.env.AIRTABLE_TOKEN = "test"; process.env.AIRTABLE_BASE_ID = "appTEST"; process.env.SETUP_SECRET = "geheim";
process.env.VAPID_PUBLIC_KEY = "x"; process.env.VAPID_PRIVATE_KEY = "x";
const original = globalThis.fetch;
globalThis.fetch = (url, opts) => original(String(url).replace("https://api.airtable.com", "http://localhost:4010"), opts);
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

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
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
await page.click(".sprachen >> text=Deutsch"); await page.waitForTimeout(200);
await page.fill("input >> nth=0", "90001"); await page.fill("input >> nth=1", "1234");
await page.click("button.btn");
await page.waitForSelector("text=Stempeluhr");
await page.waitForTimeout(600);
await page.screenshot({ path: "test/shot-2-heute.png" });
await page.click("text=Start >> nth=-1"); await page.waitForTimeout(800);
await page.screenshot({ path: "test/shot-3-laeuft.png" });
await page.click("nav >> text=Material"); await page.waitForTimeout(600);
await page.screenshot({ path: "test/shot-4-material.png" });
await page.click("nav >> text=Karte"); await page.waitForTimeout(2500);
await page.screenshot({ path: "test/shot-5-karte.png" });
await page.click("nav >> text=Zeitkonto"); await page.waitForTimeout(600);
await page.screenshot({ path: "test/shot-6-zeit.png" });
await page.click("nav >> text=Mehr"); await page.waitForTimeout(400);
await page.screenshot({ path: "test/shot-7a-mehr.png" });
await page.click("text=Urlaub beantragen"); await page.waitForTimeout(500);
await page.screenshot({ path: "test/shot-7-urlaub.png" });
// Sprache unter „Mehr“ umschalten → Heute-Seite auf Arabisch (RTL) und Russisch
await page.click("nav >> nth=0 >> text=Mehr"); await page.waitForTimeout(300);
await page.click(".sprachen >> text=العربية"); await page.waitForTimeout(300);
await page.click("nav button >> nth=0"); await page.waitForTimeout(600);
await page.screenshot({ path: "test/shot-8-heute-ar.png" });
await page.click("nav button >> nth=5"); await page.waitForTimeout(300);
await page.click(".sprachen >> text=Русский"); await page.waitForTimeout(300);
await page.click("nav button >> nth=0"); await page.waitForTimeout(600);
await page.screenshot({ path: "test/shot-9-heute-ru.png" });
await browser.close();
console.log("Screenshots fertig");
process.exit(0);
