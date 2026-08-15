import { jsonAntwort, fehlerMelden } from "./_lib/airtable.js";
import { cronErlaubt } from "./_lib/auth.js";

/**
 * GET /api/setup?secret=SETUP_SECRET          – legt alle Tabellen an (einmalig)
 * GET /api/setup?secret=…&demo=1              – zusätzlich Beispieldaten einfüllen
 *
 * Idempotent: vorhandene Tabellen werden übersprungen. Formel-/Lookup-Felder
 * werden versucht; falls die Airtable-API sie ablehnt, listet die Antwort sie
 * unter "manuellNachtragen" auf (dann in 2 Minuten von Hand anlegen).
 */

const META = "https://api.airtable.com/v0/meta/bases";

function kopf() {
  return { Authorization: `Bearer ${process.env.AIRTABLE_TOKEN}`, "Content-Type": "application/json" };
}

const datum = { dateFormat: { name: "european" } };
const datumZeit = { dateFormat: { name: "european" }, timeFormat: { name: "24hour" }, timeZone: "Europe/Berlin" };
const kaestchen = { icon: "check", color: "greenBright" };
const wahl = (...namen) => ({ choices: namen.map((n) => (typeof n === "string" ? { name: n } : n)) });

function tabellenDefinitionen() {
  return [
    {
      key: "mitarbeiter",
      name: "Mitarbeiter",
      description: "Stammdaten & App-Zugänge. System-Felder nach dem Pflege-App-Muster – nicht umbenennen.",
      fields: [
        { name: "Name", type: "singleLineText", description: "Vor- und Nachname, z. B. „Max Mustermann“" },
        { name: "Handynummer", type: "phoneNumber" },
        { name: "Kolonne", type: "singleSelect", options: wahl("Kolonne A", "Kolonne B", "Kolonne C"), description: "Optionen frei anpassbar" },
        { name: "Rolle", type: "singleSelect", options: wahl("Monteur", "Vorarbeiter", "Büro") },
        { name: "Soll_Wochenstunden", type: "number", options: { precision: 1 } },
        { name: "Urlaubsanspruch_Tage", type: "number", options: { precision: 0 }, description: "Baugewerbe i. d. R. 30 (BRTV)" },
        { name: "Aktiv", type: "checkbox", options: kaestchen, description: "Abhaken = darf sich in der App anmelden" },
        { name: "Personal_Nr", type: "number", options: { precision: 0 }, description: "Fortlaufend 1, 2, 3 … – Anmelde-ID der App = 90000 + diese Nummer. Tipp: Feldtyp in Airtable auf „Auto Number“ umstellen." },
        { name: "Login_Code", type: "number", options: { precision: 0 }, description: "PIN für die App (4–6 Ziffern). Vom Büro vergeben." },
        { name: "Session_Token", type: "singleLineText", description: "System-Feld: wird beim Login gesetzt. Nicht manuell ändern." },
        { name: "Failed_Attempts", type: "number", options: { precision: 0 }, description: "System-Feld: Fehlversuche (Schutz vor PIN-Raten)" },
        { name: "Locked_Until", type: "dateTime", options: datumZeit, description: "System-Feld: gesperrt bis (nach 5 Fehlversuchen 15 Min.)" },
        { name: "Push_Subscription", type: "multilineText", description: "System-Feld: Web-Push-Abo des Handys (JSON). Leeren = Push aus." },
        { name: "Notiz", type: "multilineText" },
      ],
    },
    {
      key: "baustellen",
      name: "Baustellen",
      description: "Alle Objekte. Lat/Lng einmal eintragen – dann erscheint die Baustelle auf der Karte.",
      fields: [
        { name: "Name", type: "singleLineText", description: "z. B. „Musterweg 12 – EFH Sanierung“" },
        { name: "Adresse", type: "multilineText" },
        { name: "Lat", type: "number", options: { precision: 6 }, description: "Breitengrad, z. B. 53.4609 (Google Maps: Rechtsklick → Koordinaten kopieren)" },
        { name: "Lng", type: "number", options: { precision: 6 }, description: "Längengrad, z. B. 9.9872" },
        { name: "Auftraggeber", type: "singleLineText" },
        { name: "Status", type: "singleSelect", options: wahl({ name: "Geplant", color: "grayLight1" }, { name: "Aktiv", color: "greenBright" }, { name: "Pausiert", color: "yellowLight1" }, { name: "Abgeschlossen", color: "blueLight1" }) },
        { name: "Zeitraum_Von", type: "date", options: datum },
        { name: "Zeitraum_Bis", type: "date", options: datum },
        { name: "Notizen", type: "multilineText" },
      ],
    },
    {
      key: "fahrzeuge",
      name: "Fahrzeuge",
      description: "Fuhrpark. Die Standard-Ausstattung ist auf der Karte und im Einsatz sichtbar – so weiß jeder, welches Auto was dabei hat.",
      fields: [
        { name: "Bezeichnung", type: "singleLineText", description: "z. B. „Sprinter – HH-BA 200“" },
        { name: "Typ", type: "singleSelect", options: wahl({ name: "LKW", color: "redBright" }, { name: "Sprinter", color: "blueBright" }, { name: "Caddy", color: "greenBright" }, { name: "Pritsche", color: "orangeBright" }, { name: "Anhänger", color: "grayBright" }, { name: "PKW", color: "purpleBright" }), description: "Farbe = Farbe des Symbols auf der Karte" },
        { name: "Kennzeichen", type: "singleLineText" },
        { name: "Fester_Fahrer", type: "link", linkKey: "mitarbeiter", description: "Wer dieses Fahrzeug fest fährt" },
        { name: "Standard_Ausstattung", type: "multilineText", description: "Was üblicherweise geladen ist – z. B. „Gerüst, Leitern“. Wichtig für „Wo ist das Gerüst?“" },
        { name: "Aktiv", type: "checkbox", options: kaestchen },
        { name: "Notizen", type: "multilineText" },
      ],
    },
    {
      key: "einsaetze",
      name: "Einsätze",
      description: "Der Tagesplan: wer, wann, wo, mit welchem Fahrzeug. Um 17:30 geht der Push für morgen raus.",
      fields: [
        { name: "Aufgabe", type: "singleLineText", description: "Was zu tun ist, z. B. „Trockenbau OG“" },
        { name: "Datum", type: "date", options: datum },
        { name: "Mitarbeiter", type: "link", linkKey: "mitarbeiter" },
        { name: "Baustelle", type: "link", linkKey: "baustellen" },
        { name: "Fahrzeug", type: "link", linkKey: "fahrzeuge" },
        { name: "Ladung_Besonderes", type: "singleLineText", description: "Heute zusätzlich geladen – z. B. „Schuttcontainer“" },
        { name: "Beginn", type: "singleSelect", options: wahl("06:00", "06:30", "07:00", "07:30", "08:00", "08:30", "09:00") },
        { name: "Status", type: "singleSelect", options: wahl({ name: "Geplant", color: "grayLight1" }, { name: "Vor Ort", color: "greenBright" }, { name: "Beendet", color: "blueLight1" }, { name: "Ausgefallen", color: "redLight1" }), description: "„Vor Ort“/„Beendet“ setzt die Stempeluhr automatisch" },
        { name: "Push_gesendet", type: "checkbox", options: kaestchen, description: "System-Feld: 17:30-Push verschickt (verhindert Doppel-Push)" },
        { name: "Notiz", type: "multilineText" },
      ],
    },
    {
      key: "material",
      name: "Materialbedarf",
      description: "Einkaufs- und Anforderungslisten. Quelle „Büro“ = Chef trägt ein; „Baustelle“ = Monteur fordert per App an.",
      fields: [
        { name: "Position", type: "singleLineText", description: "z. B. „Gipskartonplatten 12,5 mm“" },
        { name: "Menge", type: "singleLineText", description: "z. B. „20 Stück“" },
        { name: "Baustelle", type: "link", linkKey: "baustellen" },
        { name: "Für_Datum", type: "date", options: datum, description: "Einkaufs-/Bedarfstag" },
        { name: "Markt_Lieferant", type: "singleLineText", description: "z. B. „Bauhaus Harburg“" },
        { name: "Zuständig", type: "link", linkKey: "mitarbeiter", description: "Wer es besorgt – erscheint auf dessen Materialseite" },
        { name: "Status", type: "singleSelect", options: wahl({ name: "Offen", color: "yellowLight1" }, { name: "Besorgt", color: "greenBright" }, { name: "Nicht verfügbar", color: "redBright" }, { name: "Angefordert", color: "orangeLight1" }, { name: "Bestellt", color: "blueLight1" }, { name: "Geliefert", color: "tealBright" }) },
        { name: "Quelle", type: "singleSelect", options: wahl("Büro", "Baustelle") },
        { name: "Bon_Foto", type: "multipleAttachments", description: "Kassenbon-Foto aus der App" },
        { name: "Notiz", type: "multilineText" },
      ],
    },
    {
      key: "zeit",
      name: "Zeiteinträge",
      description: "Stempelungen & Nachträge (§ 17 MiLoG: binnen 7 Tagen, 2 Jahre aufbewahren). Korrekturen im Korrektur_Log festhalten.",
      fields: [
        { name: "Eintrag", type: "singleLineText", description: "Wird von der App benannt, z. B. „17.08. Max“" },
        { name: "Mitarbeiter", type: "link", linkKey: "mitarbeiter" },
        { name: "Baustelle", type: "link", linkKey: "baustellen" },
        { name: "Einsatz", type: "link", linkKey: "einsaetze" },
        { name: "Start", type: "dateTime", options: datumZeit },
        { name: "Ende", type: "dateTime", options: datumZeit },
        { name: "Pause_Minuten", type: "number", options: { precision: 0 } },
        { name: "Art", type: "singleSelect", options: wahl("Arbeit", "Fahrzeit", "Rüstzeit") },
        { name: "Quelle", type: "singleSelect", options: wahl("App", "Büro", "Nachtrag") },
        { name: "Korrektur_Log", type: "multilineText", description: "Wer hat wann was geändert – für Prüfungen wichtig, nicht löschen" },
      ],
    },
    {
      key: "urlaub",
      name: "Urlaubsanträge",
      description: "Anträge aus der App. Status auf „Genehmigt“/„Abgelehnt“ stellen – der Mitarbeiter sieht es sofort in der App.",
      fields: [
        { name: "Titel", type: "singleLineText" },
        { name: "Mitarbeiter", type: "link", linkKey: "mitarbeiter" },
        { name: "Von", type: "date", options: datum },
        { name: "Bis", type: "date", options: datum },
        { name: "Art", type: "singleSelect", options: wahl("Urlaub", "Krank", "Überstundenausgleich", "Unbezahlt", "Lehrgang") },
        { name: "Status", type: "singleSelect", options: wahl({ name: "Offen", color: "yellowLight1" }, { name: "Genehmigt", color: "greenBright" }, { name: "Abgelehnt", color: "redLight1" }) },
        { name: "Vertretung", type: "link", linkKey: "mitarbeiter" },
        { name: "Kommentar", type: "multilineText" },
        { name: "Eingereicht_Am", type: "date", options: datum },
      ],
    },
    {
      key: "doku",
      name: "Doku",
      description: "Foto-Dokumentation je Baustelle (Foto + Notiz + Kategorie). Aufbewahrung bis Gewährleistungsende.",
      fields: [
        { name: "Titel", type: "singleLineText" },
        { name: "Baustelle", type: "link", linkKey: "baustellen" },
        { name: "Einsatz", type: "link", linkKey: "einsaetze" },
        { name: "Kategorie", type: "singleSelect", options: wahl("Zwischenstand", "Besonderheit", "Mangel", "Lieferung", "Sonstiges") },
        { name: "Foto", type: "multipleAttachments" },
        { name: "Drive_Link", type: "url", description: "Optional: Ablage in Google Drive (spart Airtable-Speicher, Pflege-App-Muster)" },
        { name: "Notiz", type: "multilineText" },
        { name: "Ersteller", type: "link", linkKey: "mitarbeiter" },
        { name: "Aufgenommen_Am", type: "dateTime", options: datumZeit },
      ],
    },
    {
      key: "dokumente",
      name: "Dokumente",
      description: "Geschützte PDFs je Mitarbeiter (Lohnabrechnung, Stundenzettel). Push geht NUR raus, wenn Push_senden auf „Senden“ steht.",
      fields: [
        { name: "Titel", type: "singleLineText", description: "z. B. „Lohnabrechnung Juli 2026 – Max“" },
        { name: "Mitarbeiter", type: "link", linkKey: "mitarbeiter", description: "WICHTIG: Nur dieser Mitarbeiter sieht das Dokument in der App" },
        { name: "Typ", type: "singleSelect", options: wahl("Lohnabrechnung", "Stundenzettel", "Sonstiges") },
        { name: "Monat", type: "date", options: datum, description: "Beliebiger Tag des Monats" },
        { name: "Datei", type: "multipleAttachments" },
        { name: "Drive_Link", type: "url" },
        { name: "Push_senden", type: "singleSelect", options: wahl({ name: "Senden", color: "orangeBright" }, { name: "Gesendet", color: "greenLight1" }), description: "Auf „Senden“ stellen → neutraler Push „Neues Dokument“ geht raus, System stellt auf „Gesendet“" },
        { name: "Vom_Mitarbeiter_Gesehen", type: "checkbox", options: kaestchen },
      ],
    },
    {
      key: "mitteilungen",
      name: "Mitteilungen",
      description: "Rundnachrichten des Büros an alle, eine Kolonne oder Einzelne – mit Push per „Senden“-Freigabe.",
      fields: [
        { name: "Titel", type: "singleLineText" },
        { name: "Nachricht", type: "multilineText" },
        { name: "Zielgruppe", type: "singleSelect", options: wahl("Alle Mitarbeiter", "Kolonne A", "Kolonne B", "Kolonne C", "Einzelne") },
        { name: "Empfänger_Einzeln", type: "link", linkKey: "mitarbeiter", description: "Nur bei Zielgruppe „Einzelne“" },
        { name: "Status", type: "singleSelect", options: wahl("Entwurf", "Aktiv", "Archiviert"), description: "Nur „Aktiv“ erscheint in der App" },
        { name: "Push_senden", type: "singleSelect", options: wahl({ name: "Senden", color: "orangeBright" }, { name: "Gesendet", color: "greenLight1" }) },
        { name: "Erstellt_Am", type: "date", options: datum },
      ],
    },
  ];
}

export default async function handler(req, res) {
  if (!cronErlaubt(req)) return jsonAntwort(res, 401, { ok: false, fehler: "secret fehlt oder falsch (?secret=SETUP_SECRET)" });
  const baseId = process.env.AIRTABLE_BASE_ID;
  if (!baseId || !process.env.AIRTABLE_TOKEN)
    return jsonAntwort(res, 500, { ok: false, fehler: "AIRTABLE_TOKEN / AIRTABLE_BASE_ID fehlen (Vercel → Environment Variables)" });

  const url = new URL(req.url, "http://x");
  const mitDemo = url.searchParams.get("demo") === "1";
  const bericht = { angelegt: [], uebersprungen: [], manuellNachtragen: [], demo: null };

  try {
    // 1) Vorhandene Tabellen lesen
    const schemaAntwort = await fetch(`${META}/${baseId}/tables`, { headers: kopf() });
    if (!schemaAntwort.ok) throw new Error(`Schema lesen: ${schemaAntwort.status} ${await schemaAntwort.text()}`);
    const vorhandene = (await schemaAntwort.json()).tables;
    const idVon = {}; // key -> tableId
    const defs = tabellenDefinitionen();

    // 2) Tabellen der Reihe nach anlegen (Links erst, wenn Zieltabelle existiert)
    for (const def of defs) {
      const schonDa = vorhandene.find((t) => t.name.toLowerCase() === def.name.toLowerCase());
      if (schonDa) {
        idVon[def.key] = schonDa.id;
        bericht.uebersprungen.push(def.name);
        continue;
      }
      const felder = def.fields.map((f0) => {
        if (f0.type === "link") {
          return { name: f0.name, type: "multipleRecordLinks", options: { linkedTableId: idVon[f0.linkKey] }, ...(f0.description ? { description: f0.description } : {}) };
        }
        const { linkKey, ...rest } = f0;
        return rest;
      });
      const r = await fetch(`${META}/${baseId}/tables`, {
        method: "POST",
        headers: kopf(),
        body: JSON.stringify({ name: def.name, description: def.description, fields: felder }),
      });
      if (!r.ok) throw new Error(`Tabelle ${def.name}: ${r.status} ${await r.text()}`);
      const neu = await r.json();
      idVon[def.key] = neu.id;
      bericht.angelegt.push(def.name);
    }

    // 3) Rück-Link: Mitarbeiter.Festes_Fahrzeug (erst möglich, wenn Fahrzeuge existiert)
    async function feldAnlegen(tabelleKey, feld, merken = true) {
      const r = await fetch(`${META}/${baseId}/tables/${idVon[tabelleKey]}/fields`, {
        method: "POST",
        headers: kopf(),
        body: JSON.stringify(feld),
      });
      if (!r.ok) {
        const text = await r.text();
        if (merken && !text.includes("DUPLICATE")) bericht.manuellNachtragen.push({ tabelle: tabelleKey, feld: feld.name, grund: text.slice(0, 160) });
        return false;
      }
      return true;
    }

    if (bericht.angelegt.includes("Mitarbeiter") || bericht.angelegt.includes("Fahrzeuge")) {
      await feldAnlegen("mitarbeiter", {
        name: "Festes_Fahrzeug",
        type: "multipleRecordLinks",
        options: { linkedTableId: idVon.fahrzeuge },
        description: "Fest zugeordnetes Fahrzeug (LKW, Sprinter, Caddy …)",
      });
    }

    // 4) Komfort-Felder (Formel/Lookup) – nice to have, App funktioniert auch ohne
    await feldAnlegen("mitarbeiter", {
      name: "Anmelde_ID", type: "formula",
      options: { formula: "IF({Personal_Nr}, 90000 + {Personal_Nr}, BLANK())" },
      description: "Login-ID für die App (90000 + Personal_Nr)",
    });
    await feldAnlegen("einsaetze", { name: "Adresse_Auto", type: "multipleLookupValues", options: { recordLinkFieldId: "Baustelle", fieldIdInLinkedTable: "Adresse" }, description: "Automatisch aus der Baustelle" });
    await feldAnlegen("einsaetze", { name: "Fahrzeug_Typ_Auto", type: "multipleLookupValues", options: { recordLinkFieldId: "Fahrzeug", fieldIdInLinkedTable: "Typ" } });
    await feldAnlegen("einsaetze", { name: "Fahrzeug_Ausstattung_Auto", type: "multipleLookupValues", options: { recordLinkFieldId: "Fahrzeug", fieldIdInLinkedTable: "Standard_Ausstattung" } });
    await feldAnlegen("zeit", {
      name: "Dauer_Minuten", type: "formula",
      options: { formula: "IF(AND({Start},{Ende}), DATETIME_DIFF({Ende},{Start},'minutes') - IF({Pause_Minuten},{Pause_Minuten},0), BLANK())" },
      description: "Netto-Minuten (Ende − Start − Pause)",
    });

    // 5) Beispieldaten
    if (mitDemo && bericht.angelegt.length) {
      bericht.demo = await beispieldaten(baseId, idVon);
    }

    return jsonAntwort(res, 200, { ok: true, ...bericht, hinweis: "Fertig. PINs in der Tabelle Mitarbeiter setzen (Login_Code), dann kann sich die App anmelden." });
  } catch (e) {
    fehlerMelden("api/setup", e);
    return jsonAntwort(res, 500, { ok: false, fehler: String(e.message || e).slice(0, 300), ...bericht });
  }
}

async function beispieldaten(baseId, idVon) {
  async function rein(tabelleKey, records) {
    const r = await fetch(`https://api.airtable.com/v0/${baseId}/${idVon[tabelleKey]}`, {
      method: "POST",
      headers: kopf(),
      body: JSON.stringify({ records: records.map((f0) => ({ fields: f0 })), typecast: true }),
    });
    if (!r.ok) throw new Error(`Demo ${tabelleKey}: ${r.status} ${await r.text()}`);
    return (await r.json()).records.map((x) => x.id);
  }
  const morgen = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const gestern = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  const [maxId, aliId, tomId] = await rein("mitarbeiter", [
    { Name: "Max Beispiel", Kolonne: "Kolonne A", Rolle: "Vorarbeiter", Soll_Wochenstunden: 40, Urlaubsanspruch_Tage: 30, Aktiv: true, Personal_Nr: 1, Login_Code: 1234, Notiz: "Beispieldatensatz – kann gelöscht werden" },
    { Name: "Ali Beispiel", Kolonne: "Kolonne A", Rolle: "Monteur", Soll_Wochenstunden: 40, Urlaubsanspruch_Tage: 30, Aktiv: true, Personal_Nr: 2, Login_Code: 2345, Notiz: "Beispieldatensatz" },
    { Name: "Tom Beispiel", Kolonne: "Kolonne B", Rolle: "Monteur", Soll_Wochenstunden: 40, Urlaubsanspruch_Tage: 30, Aktiv: true, Personal_Nr: 3, Login_Code: 3456, Notiz: "Beispieldatensatz" },
  ]);
  const [b1, b2, b3] = await rein("baustellen", [
    { Name: "Musterweg 12 – EFH Sanierung", Adresse: "Musterweg 12\n21075 Hamburg", Lat: 53.4609, Lng: 9.9872, Auftraggeber: "Familie Beispiel", Status: "Aktiv" },
    { Name: "Eichenallee 3 – Dachstuhl", Adresse: "Eichenallee 3\n22605 Hamburg", Lat: 53.5581, Lng: 9.9278, Auftraggeber: "WEG Eichenallee", Status: "Aktiv" },
    { Name: "Hauptstraße 45 – Büroausbau", Adresse: "Hauptstraße 45\n22087 Hamburg", Lat: 53.5766, Lng: 10.0154, Auftraggeber: "Muster GmbH", Status: "Geplant" },
  ]);
  const [lkw, sprinter, caddy] = await rein("fahrzeuge", [
    { Bezeichnung: "LKW – HH-BA 100", Typ: "LKW", Kennzeichen: "HH-BA 100", Fester_Fahrer: [tomId], Standard_Ausstattung: "Kran, Schuttmulde", Aktiv: true },
    { Bezeichnung: "Sprinter – HH-BA 200", Typ: "Sprinter", Kennzeichen: "HH-BA 200", Fester_Fahrer: [maxId], Standard_Ausstattung: "Gerüst, Leitern", Aktiv: true },
    { Bezeichnung: "Caddy – HH-BA 300", Typ: "Caddy", Kennzeichen: "HH-BA 300", Fester_Fahrer: [aliId], Standard_Ausstattung: "Elektro-Werkzeug", Aktiv: true },
  ]);
  await rein("einsaetze", [
    { Aufgabe: "Trockenbau OG", Datum: morgen, Mitarbeiter: [maxId, aliId], Baustelle: [b1], Fahrzeug: [sprinter], Beginn: "07:00", Status: "Geplant", Ladung_Besonderes: "10 Sack Ausgleichsmasse" },
    { Aufgabe: "Dachlatten abladen", Datum: morgen, Mitarbeiter: [tomId], Baustelle: [b2], Fahrzeug: [lkw], Beginn: "07:30", Status: "Geplant" },
  ]);
  await rein("material", [
    { Position: "Gipskartonplatten 12,5 mm", Menge: "20 Stück", Baustelle: [b1], "Für_Datum": morgen, Markt_Lieferant: "Bauhaus Harburg", Zuständig: [maxId], Status: "Offen", Quelle: "Büro" },
    { Position: "Silikon weiß", Menge: "5 Kartuschen", Baustelle: [b1], "Für_Datum": morgen, Markt_Lieferant: "Bauhaus Harburg", Zuständig: [maxId], Status: "Offen", Quelle: "Büro" },
    { Position: "Schnellbauschrauben 3,5×35", Menge: "2 Pakete", Baustelle: [b2], "Für_Datum": morgen, Markt_Lieferant: "Hornbach", Zuständig: [tomId], Status: "Offen", Quelle: "Büro" },
  ]);
  await rein("zeit", [
    { Eintrag: "gestern Max – Musterweg", Mitarbeiter: [maxId], Baustelle: [b1], Start: `${gestern}T07:02:00.000Z`, Ende: `${gestern}T16:15:00.000Z`, Pause_Minuten: 45, Art: "Arbeit", Quelle: "App" },
  ]);
  await rein("urlaub", [
    { Titel: "Urlaub Tom 07.09. – 11.09.", Mitarbeiter: [tomId], Von: "2026-09-07", Bis: "2026-09-11", Art: "Urlaub", Status: "Offen", Eingereicht_Am: new Date().toISOString().slice(0, 10) },
  ]);
  await rein("mitteilungen", [
    { Titel: "Willkommen in der Baustellen-App", Nachricht: "Ab sofort kommen Einsätze, Materiallisten und Dokumente über diese App. Bei Fragen: Büro.", Zielgruppe: "Alle Mitarbeiter", Status: "Aktiv", Erstellt_Am: new Date().toISOString().slice(0, 10) },
  ]);
  await rein("dokumente", [
    { Titel: "Stundenzettel Juli 2026 – Max Beispiel", Mitarbeiter: [maxId], Typ: "Stundenzettel", Monat: "2026-07-01" },
  ]);
  return "3 Mitarbeiter (Login: 90001/1234, 90002/2345, 90003/3456), 3 Baustellen, 3 Fahrzeuge, 2 Einsätze morgen, 3 Material-Positionen, 1 Zeiteintrag, 1 Urlaub, 1 Mitteilung, 1 Dokument";
}
