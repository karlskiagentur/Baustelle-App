import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { api } from "../api.js";

/* Fahrzeug-Typen: Farbe + Symbol – identisch zur Auswahl in Airtable */
export const TYPEN = {
  LKW:      { farbe: "#d64545", sym: "🚛" },
  Sprinter: { farbe: "#2b6be4", sym: "🚐" },
  Caddy:    { farbe: "#1e9e5a", sym: "🚗" },
  Pritsche: { farbe: "#e07b00", sym: "🛻" },
  Anhänger: { farbe: "#6b7280", sym: "🚜" },
  PKW:      { farbe: "#7c3aed", sym: "🚙" },
  ohne:     { farbe: "#1f3864", sym: "📍" },
};

function icon(typ) {
  const t = TYPEN[typ] || TYPEN.ohne;
  return L.divIcon({
    className: "fzg-marker",
    html: `<div class="pin" style="background:${t.farbe}"><span>${t.sym}</span></div>`,
    iconSize: [38, 38], iconAnchor: [19, 38], popupAnchor: [0, -36],
  });
}

export default function Karte() {
  const ref = useRef(null);
  const mapRef = useRef(null);
  const [daten, setDaten] = useState(null);
  const [fehler, setFehler] = useState("");
  const [filter, setFilter] = useState("alle");

  useEffect(() => {
    api("daten", { bereich: "karte" }).then((r) => (r.ok ? setDaten(r) : setFehler(r.fehler)));
  }, []);

  useEffect(() => {
    if (!daten || !ref.current) return;
    if (!mapRef.current) {
      mapRef.current = L.map(ref.current, { zoomControl: true }).setView([53.55, 9.99], 10);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(mapRef.current);
    }
    const map = mapRef.current;
    map.eachLayer((l) => { if (l instanceof L.Marker) map.removeLayer(l); });

    const fzgVon = Object.fromEntries((daten.fahrzeuge || []).map((f) => [f.id, f]));
    const bstVon = Object.fromEntries((daten.baustellen || []).map((b) => [b.id, b]));
    const bounds = [];

    // Pro Baustelle die heutigen Einsätze bündeln
    const proBaustelle = {};
    for (const e of daten.einsaetze || []) {
      const bId = (e.Baustelle || [])[0];
      if (!bId) continue;
      (proBaustelle[bId] = proBaustelle[bId] || []).push(e);
    }

    for (const [bId, einsaetze] of Object.entries(proBaustelle)) {
      const b = bstVon[bId];
      if (!b || b.Lat == null || b.Lng == null) continue;
      const fahrzeuge = einsaetze.flatMap((e) => (e.Fahrzeug || []).map((id) => fzgVon[id]).filter(Boolean));
      const typen = [...new Set(fahrzeuge.map((f) => f.Typ))];
      if (filter !== "alle" && !typen.includes(filter)) continue;
      const hauptTyp = typen[0] || "ohne";
      const status = einsaetze.some((e) => e.Status === "Vor Ort") ? "Vor Ort" : einsaetze.every((e) => e.Status === "Beendet") ? "Beendet" : "Geplant";
      const leute = [...new Set(einsaetze.flatMap((e) => e.Mitarbeiter_Namen || []))];
      const html = `
        <b>${b.Name || ""}</b><br>${String(b.Adresse || "").replace(/\n/g, "<br>")}<br>
        <span style="color:${status === "Vor Ort" ? "#187a45" : "#667085"};font-weight:700">${status}</span><br>
        ${fahrzeuge.length ? fahrzeuge.map((f) => `<div style="margin-top:4px;color:${(TYPEN[f.Typ] || TYPEN.ohne).farbe}"><b>${(TYPEN[f.Typ] || TYPEN.ohne).sym} ${f.Typ || ""} ${f.Kennzeichen || ""}</b>${f.Standard_Ausstattung ? " · " + f.Standard_Ausstattung : ""}</div>`).join("") : "<i>kein Fahrzeug eingeteilt</i>"}
        ${einsaetze.filter((e) => e.Ladung_Besonderes).map((e) => `<div>Ladung heute: ${e.Ladung_Besonderes}</div>`).join("")}
        <div style="margin-top:4px">${einsaetze.map((e) => e.Aufgabe).filter(Boolean).join(", ")}${einsaetze[0]?.Beginn ? " · ab " + einsaetze[0].Beginn : ""}</div>
        <div style="margin-top:4px;color:#667085">${einsaetze.length} Einsatz/Einsätze · ${einsaetze.reduce((n, e) => n + (e.Mitarbeiter || []).length, 0)} Personen</div>`;
      L.marker([b.Lat, b.Lng], { icon: icon(hauptTyp) }).addTo(map).bindPopup(html);
      bounds.push([b.Lat, b.Lng]);
    }
    if (bounds.length) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    setTimeout(() => map.invalidateSize(), 50);
  }, [daten, filter]);

  // Fahrzeug-Liste: wo steht heute welches Fahrzeug
  const fzgHeute = (daten?.fahrzeuge || []).map((f) => {
    const e = (daten.einsaetze || []).find((x) => (x.Fahrzeug || []).includes(f.id));
    const b = e ? (daten.baustellen || []).find((x) => x.id === (e.Baustelle || [])[0]) : null;
    return { f, e, b };
  });

  return (
    <>
      {fehler && <div className="fehler">{fehler}</div>}
      <div className="legende">
        <button className={"mini " + (filter === "alle" ? "ok" : "")} onClick={() => setFilter("alle")}>Alle</button>
        {Object.entries(TYPEN).filter(([k]) => k !== "ohne").map(([k, t]) => (
          <button key={k} className="mini" style={{ color: t.farbe, borderColor: t.farbe, fontWeight: filter === k ? 800 : 500 }} onClick={() => setFilter(filter === k ? "alle" : k)}>
            {t.sym} {k}
          </button>
        ))}
      </div>
      <div className="map" ref={ref} />
      <div className="klein" style={{ margin: "8px 2px" }}>Symbol = Fahrzeug an der Baustelle · Antippen zeigt Personen, Ausstattung und Ladung.</div>

      <div className="karte fzg-liste">
        <h2>Fahrzeuge heute</h2>
        {!daten && <div className="laden">Lade…</div>}
        {fzgHeute.map(({ f, e, b }) => {
          const t = TYPEN[f.Typ] || TYPEN.ohne;
          return (
            <div className="fzg" key={f.id}>
              <div>
                <div><span className="punkt" style={{ background: t.farbe }} /><b>{t.sym} {f.Typ} {f.Kennzeichen}</b></div>
                <div className="klein">{f.Standard_Ausstattung || "–"}{e?.Ladung_Besonderes ? ` · heute: ${e.Ladung_Besonderes}` : ""}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                {b ? <><div style={{ fontWeight: 600, fontSize: 14 }}>{b.Name}</div><span className={"chip " + (e.Status === "Vor Ort" ? "ok" : "")}>{e.Status || "Geplant"}</span></> : <span className="chip">nicht eingeteilt</span>}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
