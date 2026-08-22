// Mini-Airtable-Attrappe für lokale Tests (Suche per einfacher Formel-Auswertung, Anlegen, Ändern)
import http from "node:http";

const db = {
  Mitarbeiter: [
    { id: "recMA10000000000A", fields: { Name: "Max Beispiel", Kolonne: "Kolonne A", Aktiv: true, Personal_Nr: 1, Login_Code: 1234, Failed_Attempts: 0, Soll_Wochenstunden: 40, Urlaubsanspruch_Tage: 30, Push_Subscription: "" } },
  ],
  Baustellen: [{ id: "recB100000000000B", fields: { Name: "Musterweg 12", Adresse: "Musterweg 12\n21075 Hamburg", Lat: 53.46, Lng: 9.98, Status: "Aktiv" } }],
  Fahrzeuge: [{ id: "recF100000000000F", fields: { Bezeichnung: "Sprinter", Typ: "Sprinter", Kennzeichen: "HH-BA 200", Aktiv: true, Standard_Ausstattung: "Gerüst" } }],
  "Einsätze": [{ id: "recE100000000000E", fields: { Aufgabe: "Trockenbau", Datum: new Date().toISOString().slice(0, 10), Mitarbeiter: ["recMA10000000000A"], Baustelle: ["recB100000000000B"], Fahrzeug: ["recF100000000000F"], Beginn: "07:00", Status: "Geplant", Adresse_Auto: ["Musterweg 12\n21075 Hamburg"], Fahrzeug_Typ_Auto: ["Sprinter"], Fahrzeug_Ausstattung_Auto: ["Gerüst"] } }],
  Materialbedarf: [{ id: "recM100000000000M", fields: { Position: "Gips", Status: "Offen", "Zuständig": ["recMA10000000000A"], Quelle: "Büro" } }],
  "Zeiteinträge": [], "Urlaubsanträge": [], Doku: [], Dokumente: [], Mitteilungen: [
    { id: "recMT1000000000MT", fields: { Titel: "Hallo", Nachricht: "Willkommen", Zielgruppe: "Alle Mitarbeiter", Status: "Aktiv" } },
  ],
};
let seq = 100;

// sehr grobe Formel-Auswertung für die im Backend genutzten Muster
function passt(rec, formel, tabelle) {
  if (!formel) return true;
  const f = rec.fields;
  const namen = { ...f };
  // Lookups aus Links: ARRAYJOIN({Mitarbeiter}) -> Namen
  const arrayjoin = (feld) => (f[feld] || []).map((id) => (db.Mitarbeiter.find((m) => m.id === id) || { fields: {} }).fields.Name || id).join(",");
  let ok = true;
  const tests = [];
  const re = /\{Session_Token\}="([^"]*)"/.exec(formel); if (re) tests.push(f.Session_Token === re[1]);
  const pn = /\{Personal_Nr\}=(\d+)/.exec(formel); if (pn) tests.push(Number(f.Personal_Nr) === Number(pn[1]));
  const dm = /DATETIME_FORMAT\(\{Start\},'YYYY-MM'\)="(\d{4}-\d{2})"/.exec(formel); if (dm) tests.push(String(f.Start || "").startsWith(dm[1]));
  const dmo = /DATETIME_FORMAT\(\{Monat\},'YYYY-MM'\)="(\d{4}-\d{2})"/.exec(formel); if (dmo) tests.push(String(f.Monat || "").startsWith(dmo[1]));
  const typ = /\{Typ\}="([^"]+)"/.exec(formel); if (typ) tests.push(f.Typ === typ[1]);
  if (/, \{Ende\}\)/.test(formel)) tests.push(!!f.Ende);
  const find = /FIND\("([^"]+)", ARRAYJOIN\(\{(\w+)\}\)\)/.exec(formel); if (find) tests.push(arrayjoin(find[2]).includes(find[1]));
  if (/IS_SAME\(\{Datum\}, TODAY\(\)/.test(formel)) tests.push(f.Datum === new Date().toISOString().slice(0, 10));
  if (/DATEADD\(TODAY\(\), 1/.test(formel)) tests.push(f.Datum === new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  if (/NOT\(\{Push_gesendet\}\)/.test(formel)) tests.push(!f.Push_gesendet);
  if (/\{Status\}!="Besorgt"/.test(formel)) tests.push(f.Status !== "Besorgt");
  if (/\{Status\}!="Abgeschlossen"/.test(formel)) tests.push(f.Status !== "Abgeschlossen");
  if (/^\{Aktiv\}$/.test(formel)) tests.push(!!f.Aktiv);
  if (/AND\(\{Aktiv\}, \{Push_Subscription\}!=""\)/.test(formel)) tests.push(!!f.Aktiv && !!f.Push_Subscription);
  if (/\{Status\}="Aktiv"/.test(formel)) tests.push(f.Status === "Aktiv");
  const ps = /\{Push_senden\}="Senden"/.test(formel); if (ps) tests.push(f.Push_senden === "Senden");
  return tests.every(Boolean);
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const teile = url.pathname.split("/").filter(Boolean); // v0, base, tabelle
  let body = ""; for await (const c of req) body += c;
  const json = (s, d) => { res.writeHead(s, { "Content-Type": "application/json" }); res.end(JSON.stringify(d)); };
  // Attachment-Upload: /content/v0/base/rec/feld/uploadAttachment
  if (teile[0] === "content" && teile[5] === "uploadAttachment") {
    const b = JSON.parse(body);
    for (const t of Object.values(db)) { const rec = t.find((x) => x.id === teile[3]); if (rec) { rec.fields[decodeURIComponent(teile[4])] = [{ url: "https://v5.airtableusercontent.com/x/" + teile[3], filename: b.filename, type: b.contentType, size: b.file.length }]; return json(200, { id: rec.id, fields: rec.fields }); } }
    return json(404, { error: "rec" });
  }
  if (teile[0] === "v0" && teile[2]) {
    const tabelle = decodeURIComponent(teile[2]);
    if (!db[tabelle]) return json(404, { error: "Tabelle unbekannt: " + tabelle });
    if (req.method === "GET" && teile[3]) {
      const rec = db[tabelle].find((x) => x.id === teile[3]);
      return rec ? json(200, rec) : json(404, { error: "NOT_FOUND" });
    }
    if (req.method === "GET") {
      const formel = url.searchParams.get("filterByFormula");
      return json(200, { records: db[tabelle].filter((r) => passt(r, formel, tabelle)) });
    }
    if (req.method === "POST") {
      const b = JSON.parse(body); const out = [];
      for (const r of b.records) { const rec = { id: "recGEN" + String(seq++).padStart(11, "0"), fields: r.fields }; db[tabelle].push(rec); out.push(rec); }
      return json(200, { records: out });
    }
    if (req.method === "PATCH") {
      const b = JSON.parse(body); const out = [];
      for (const r of b.records) { const rec = db[tabelle].find((x) => x.id === r.id); if (!rec) return json(404, { error: "rec" }); Object.assign(rec.fields, r.fields); out.push(rec); }
      return json(200, { records: out });
    }
  }
  json(404, { error: "?" });
}).listen(4010, () => console.log("Mock-Airtable auf :4010"));
