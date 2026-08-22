import { suchen, aendern, TABELLEN, f, jsonAntwort, bodyLesen, handledPreflight, sendError } from "./_lib/airtable.js";
import { mitarbeiterAusToken, tokenLesen } from "./_lib/auth.js";

const HEUTE = `IS_SAME({Datum}, TODAY(), 'day')`;

// Feld-Whitelists: nur ausliefern, was die App braucht (kein Token/PIN/Interna)
const nur = (obj, felder) => Object.fromEntries(["id", ...felder].filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]]));

// Fehlende Baustellen-Koordinaten EINMALIG aus der Adresse erzeugen (OpenStreetMap/Nominatim, kostenlos)
// und dauerhaft nach Airtable zurückschreiben. So muss das Büro nur die Adresse eintragen, keine Lat/Lng.
const GEO_KONTAKT = process.env.ALERT_EMAIL || "denis@sprach-ki.live";
const schlaf = (ms) => new Promise((r) => setTimeout(r, ms));
async function geocode(adresse) {
  const frage = async (q) => {
    const r = await fetch("https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=de&q=" + encodeURIComponent(q),
      { headers: { "User-Agent": `BaustellenApp-Karte/1.0 (${GEO_KONTAKT})` } });
    if (!r.ok) return null;
    const j = await r.json();
    return j && j[0] ? { lat: +(+j[0].lat).toFixed(6), lng: +(+j[0].lon).toFixed(6) } : null;
  };
  const voll = String(adresse).replace(/\s*\n\s*/g, ", ").trim();
  let g = await frage(voll);
  if (g) return g;
  await schlaf(1100); // Nominatim-Fair-Use: max. 1 Anfrage/Sekunde
  const zeilen = String(adresse).split("\n").map((s) => s.trim()).filter(Boolean); // Fallback: nur "PLZ Ort"
  const letzte = zeilen[zeilen.length - 1];
  return letzte && letzte !== voll ? frage(letzte) : null;
}
// Ändert `baustellen` in-place; läuft nur für Einträge ohne Lat/Lng (also praktisch nie – einmalig pro neuer Baustelle).
async function koordinatenNachtragen(baustellen) {
  const offen = baustellen.filter((b) => (b.Lat == null || b.Lng == null) && b.Adresse);
  let n = 0;
  for (const b of offen) {
    if (n >= 5) break; // pro Aufruf begrenzen; der Rest wird beim nächsten Laden nachgetragen
    try {
      const g = await geocode(b.Adresse);
      if (g) { b.Lat = g.lat; b.Lng = g.lng; await aendern(TABELLEN.baustellen, b.id, { Lat: g.lat, Lng: g.lng }); n++; await schlaf(1100); }
    } catch { /* Geocoding darf die Karte nie blockieren */ }
  }
}
const F_EINSATZ = ["Aufgabe", "Datum", "Mitarbeiter", "Baustelle", "Fahrzeug", "Ladung_Besonderes", "Beginn", "Status", "Notiz", "Adresse_Auto", "Fahrzeug_Typ_Auto", "Fahrzeug_Ausstattung_Auto"];
const F_MATERIAL = ["Position", "Menge", "Baustelle", "Für_Datum", "Markt_Lieferant", "Status", "Quelle", "Notiz"];
const F_MITT = ["Titel", "Nachricht", "Erstellt_Am"];
const F_FZG = ["Bezeichnung", "Typ", "Kennzeichen", "Standard_Ausstattung", "Fester_Fahrer", "Aktuelle_Baustelle"];
const F_BST = ["Name", "Adresse", "Lat", "Lng", "Status"];
const F_ZEIT = ["Start", "Ende", "Pause_Minuten", "Art", "Baustelle", "Dauer_Minuten"];
const F_DOK = ["Titel", "Typ", "Monat", "Datei", "Drive_Link", "Vom_Mitarbeiter_Gesehen"];
const F_URL = ["Von", "Bis", "Art", "Status", "Kommentar", "Eingereicht_Am"];

/**
 * POST /api/daten   { token, bereich }
 * bereiche: start | tagesplan | material | baustellen | karte | zeitkonto | dokumente | urlaub | mitteilungen
 */
export default async function handler(req, res) {
  if (handledPreflight(req, res)) return;
  if (req.method !== "POST") return jsonAntwort(res, 405, { ok: false, fehler: "Nur POST" });
  try {
    const b = await bodyLesen(req);
    const ma = await mitarbeiterAusToken(tokenLesen(req, b));
    if (!ma) return jsonAntwort(res, 401, { ok: false, fehler: "Sitzung abgelaufen – bitte neu anmelden", code: "sitzung_abgelaufen" });

    const ich = `FIND("${f(ma.Name)}", ARRAYJOIN({Mitarbeiter}))`;
    const bereich = String(b.bereich || "start");

    const tagesplan = async () => (await suchen(TABELLEN.einsaetze, `AND(${HEUTE}, ${ich})`, { sortFeld: "Beginn" })).map((x) => nur(x, F_EINSATZ));
    const material = async () => (await suchen(TABELLEN.material, `AND(FIND("${f(ma.Name)}", ARRAYJOIN({Zuständig})), {Status}!="Besorgt")`, { sortFeld: "Für_Datum" })).map((x) => nur(x, F_MATERIAL));
    const mitteilungen = async () => {
      const ziel = `OR({Zielgruppe}="Alle Mitarbeiter"${ma.Kolonne ? `, {Zielgruppe}="${f(ma.Kolonne)}"` : ""}, AND({Zielgruppe}="Einzelne", FIND("${f(ma.Name)}", ARRAYJOIN({Empfänger_Einzeln}))))`;
      return (await suchen(TABELLEN.mitteilungen, `AND({Status}="Aktiv", ${ziel})`)).map((x) => nur(x, F_MITT));
    };

    let daten = {};
    if (bereich === "start") {
      const [plan, mat, mitt] = await Promise.all([tagesplan(), material(), mitteilungen()]);
      daten = { tagesplan: plan, material: mat, mitteilungen: mitt };
    } else if (bereich === "tagesplan") {
      daten = { tagesplan: await tagesplan() };
    } else if (bereich === "material") {
      daten = { material: await material() };
    } else if (bereich === "baustellen") {
      // Für die Foto-Auswahl: alle nicht abgeschlossenen Baustellen (nur Name + Status)
      daten = { baustellen: (await suchen(TABELLEN.baustellen, `{Status}!="Abgeschlossen"`, { sortFeld: "Name" })).map((x) => nur(x, ["Name", "Status"])) };
    } else if (bereich === "karte") {
      const [einsaetze, fahrzeuge, baustellen] = await Promise.all([
        suchen(TABELLEN.einsaetze, HEUTE),
        suchen(TABELLEN.fahrzeuge, `{Aktiv}`),
        suchen(TABELLEN.baustellen, `{Status}!="Abgeschlossen"`),
      ]);
      await koordinatenNachtragen(baustellen); // fehlende Lat/Lng aus der Adresse erzeugen (einmalig, schreibt zurück)
      daten = {
        einsaetze: einsaetze.map((x) => nur(x, F_EINSATZ)),
        fahrzeuge: fahrzeuge.map((x) => nur(x, F_FZG)),
        baustellen: baustellen.map((x) => nur(x, F_BST)),
      };
    } else if (bereich === "zeitkonto") {
      const monat = new Date().toISOString().slice(0, 7);
      daten = {
        zeit: (await suchen(TABELLEN.zeit, `AND(${ich}, DATETIME_FORMAT({Start},'YYYY-MM')="${monat}")`, { sortFeld: "Start", sortRichtung: "desc" })).map((x) => nur(x, F_ZEIT)),
        sollWochenstunden: ma.Soll_Wochenstunden || null,
        urlaubsanspruch: ma.Urlaubsanspruch_Tage || null,
      };
    } else if (bereich === "dokumente") {
      // Anhang-URLs von Airtable laufen nach ~2 h ab; der Download läuft daher über /api/dokument-download
      daten = { dokumente: (await suchen(TABELLEN.dokumente, ich, { sortFeld: "Monat", sortRichtung: "desc" })).map((x) => ({
        ...nur(x, F_DOK), Datei: Array.isArray(x.Datei) && x.Datei.length ? [{ filename: x.Datei[0].filename }] : undefined,
      })) };
    } else if (bereich === "urlaub") {
      daten = { urlaub: (await suchen(TABELLEN.urlaub, ich, { sortFeld: "Von", sortRichtung: "desc" })).map((x) => nur(x, F_URL)) };
    } else if (bereich === "mitteilungen") {
      daten = { mitteilungen: await mitteilungen() };
    } else {
      return jsonAntwort(res, 400, { ok: false, fehler: "Unbekannter Bereich", code: "ungueltig" });
    }

    return jsonAntwort(res, 200, { ok: true, name: ma.Name, ...daten });
  } catch (e) {
    return sendError(res, e, "api/daten");
  }
}
