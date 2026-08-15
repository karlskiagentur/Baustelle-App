import React, { useState } from "react";
import { api } from "../api.js";

/** Foto verkleinern (max. 1600 px, JPEG 0.8) und als Base64 liefern */
async function verkleinern(datei) {
  const bmp = await createImageBitmap(datei);
  const f = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * f); c.height = Math.round(bmp.height * f);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  const dataUrl = c.toDataURL("image/jpeg", 0.8);
  return { base64: dataUrl.split(",")[1], vorschau: dataUrl };
}

export default function FotoBlatt({ einsatz, schliessen }) {
  const [bild, setBild] = useState(null);
  const [kategorie, setKategorie] = useState("Zwischenstand");
  const [notiz, setNotiz] = useState("");
  const [busy, setBusy] = useState(false);
  const [meldung, setMeldung] = useState("");

  async function waehlen(e) {
    const datei = e.target.files?.[0];
    if (!datei) return;
    setBild(await verkleinern(datei));
  }
  async function senden() {
    setBusy(true); setMeldung("");
    const r = await api("aktion", {
      aktion: "foto_doku",
      daten: {
        einsatzId: einsatz?.id, baustelleId: einsatz?.Baustelle?.[0], kategorie, notiz,
        fotoBase64: bild?.base64, fotoTyp: "image/jpeg", fotoName: `foto-${Date.now()}.jpg`,
      },
    });
    setBusy(false);
    if (r.ok) { setMeldung("Gespeichert ✓"); setTimeout(schliessen, 800); } else setMeldung(r.fehler || "Fehler");
  }

  return (
    <div className="overlay" onClick={schliessen}>
      <div className="blatt" onClick={(e) => e.stopPropagation()}>
        <h2>Foto zur Baustelle</h2>
        <div className="klein">{einsatz?.Aufgabe || "Ohne Einsatz"}</div>
        <label>Foto</label>
        <input type="file" accept="image/*" capture="environment" onChange={waehlen} />
        {bild && <img className="vorschau" src={bild.vorschau} alt="Vorschau" />}
        <label>Kategorie</label>
        <select value={kategorie} onChange={(e) => setKategorie(e.target.value)}>
          {["Zwischenstand", "Besonderheit", "Mangel", "Lieferung", "Sonstiges"].map((k) => <option key={k}>{k}</option>)}
        </select>
        <label>Kurznotiz</label>
        <textarea value={notiz} onChange={(e) => setNotiz(e.target.value)} placeholder="Was ist zu sehen?" />
        {meldung && <div className={meldung.includes("✓") ? "erfolg" : "fehler"}>{meldung}</div>}
        <div className="btn-reihe">
          <button className="btn hell" onClick={schliessen}>Abbrechen</button>
          <button className="btn ok" disabled={busy || !bild} onClick={senden}>{busy ? "Sende…" : "Speichern"}</button>
        </div>
      </div>
    </div>
  );
}
