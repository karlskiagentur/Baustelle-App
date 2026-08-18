import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { api } from "../api.js";
import { wert } from "../i18n.js";

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

// Popup-Inhalt wird als HTML gebaut → Nutzdaten aus Airtable escapen
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function icon(typ) {
  const t = TYPEN[typ] || TYPEN.ohne;
  return L.divIcon({
    className: "fzg-marker",
    html: `<div class="pin" style="background:${t.farbe}"><span>${t.sym}</span></div>`,
    iconSize: [38, 38], iconAnchor: [19, 38], popupAnchor: [0, -36],
  });
}

export default function Karte() {
  const { t, i18n } = useTranslation();
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
      const personen = einsaetze.reduce((n, e) => n + (e.Mitarbeiter || []).length, 0);
      const html = `
        <b>${esc(b.Name)}</b><br>${esc(b.Adresse).replace(/\n/g, "<br>")}<br>
        <span style="color:${status === "Vor Ort" ? "#187a45" : "#667085"};font-weight:700">${esc(wert(status))}</span><br>
        ${fahrzeuge.length ? fahrzeuge.map((f) => `<div style="margin-top:4px;color:${(TYPEN[f.Typ] || TYPEN.ohne).farbe}"><b>${(TYPEN[f.Typ] || TYPEN.ohne).sym} ${esc(wert(f.Typ))} ${esc(f.Kennzeichen)}</b>${f.Standard_Ausstattung ? " · " + esc(f.Standard_Ausstattung) : ""}</div>`).join("") : `<i>${esc(t("karte.keinFahrzeug"))}</i>`}
        ${einsaetze.filter((e) => e.Ladung_Besonderes).map((e) => `<div>${esc(t("karte.ladungHeute", { text: e.Ladung_Besonderes }))}</div>`).join("")}
        <div style="margin-top:4px">${esc(einsaetze.map((e) => e.Aufgabe).filter(Boolean).join(", "))}${einsaetze[0]?.Beginn ? " · " + esc(t("karte.ab", { zeit: einsaetze[0].Beginn })) : ""}</div>
        <div style="margin-top:4px;color:#667085">${esc(t("karte.einsaetze", { count: einsaetze.length }))} · ${esc(t("karte.personen", { count: personen }))}</div>`;
      L.marker([b.Lat, b.Lng], { icon: icon(hauptTyp) }).addTo(map).bindPopup(html);
      bounds.push([b.Lat, b.Lng]);
    }
    if (bounds.length) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    setTimeout(() => map.invalidateSize(), 50);
  }, [daten, filter, i18n.language]);

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
        <button className={"mini " + (filter === "alle" ? "ok" : "")} onClick={() => setFilter("alle")}>{t("allgemein.alle")}</button>
        {Object.entries(TYPEN).filter(([k]) => k !== "ohne").map(([k, ty]) => (
          <button key={k} className="mini" style={{ color: ty.farbe, borderColor: ty.farbe, fontWeight: filter === k ? 800 : 500 }} onClick={() => setFilter(filter === k ? "alle" : k)}>
            {ty.sym} {wert(k)}
          </button>
        ))}
      </div>
      <div className="map" ref={ref} dir="ltr" />
      <div className="klein" style={{ margin: "8px 2px" }}>{t("karte.legende")}</div>

      <div className="karte fzg-liste">
        <h2>{t("karte.fahrzeugeHeute")}</h2>
        {!daten && <div className="laden">{t("allgemein.laden")}</div>}
        {fzgHeute.map(({ f, e, b }) => {
          const ty = TYPEN[f.Typ] || TYPEN.ohne;
          return (
            <div className="fzg" key={f.id}>
              <div>
                <div><span className="punkt" style={{ background: ty.farbe }} /><b>{ty.sym} {wert(f.Typ)} {f.Kennzeichen}</b></div>
                <div className="klein">{f.Standard_Ausstattung || t("allgemein.keinWert")}{e?.Ladung_Besonderes ? ` · ${t("karte.heuteLadung", { text: e.Ladung_Besonderes })}` : ""}</div>
              </div>
              <div style={{ textAlign: "end" }}>
                {b ? <><div style={{ fontWeight: 600, fontSize: 14 }}>{b.Name}</div><span className={"chip " + (e.Status === "Vor Ort" ? "ok" : "")}>{wert(e.Status || "Geplant")}</span></> : <span className="chip">{t("karte.nichtEingeteilt")}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
