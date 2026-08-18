import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api.js";
import { wert } from "../i18n.js";

// Auswahlwerte bleiben deutsch (Airtable-Whitelist), angezeigt wird die Übersetzung
const KATEGORIEN = ["Zwischenstand", "Besonderheit", "Mangel", "Lieferung", "Sonstiges"];

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
  const { t } = useTranslation();
  const [bild, setBild] = useState(null);
  const [kategorie, setKategorie] = useState("Zwischenstand");
  const [notiz, setNotiz] = useState("");
  const [busy, setBusy] = useState(false);
  const [meldung, setMeldung] = useState(null); // { text, ok }

  async function waehlen(e) {
    const datei = e.target.files?.[0];
    if (!datei) return;
    setBild(await verkleinern(datei));
  }
  async function senden() {
    setBusy(true); setMeldung(null);
    const r = await api("aktion", {
      aktion: "foto_doku",
      daten: {
        einsatzId: einsatz?.id, baustelleId: einsatz?.Baustelle?.[0], kategorie, notiz,
        fotoBase64: bild?.base64, fotoTyp: "image/jpeg", fotoName: `foto-${Date.now()}.jpg`,
      },
    });
    setBusy(false);
    if (r.ok) { setMeldung({ text: t("allgemein.gespeichert"), ok: true }); setTimeout(schliessen, 800); }
    else setMeldung({ text: r.fehler || t("allgemein.fehler"), ok: false });
  }

  return (
    <div className="overlay" onClick={schliessen}>
      <div className="blatt" onClick={(e) => e.stopPropagation()}>
        <h2>{t("foto.titel")}</h2>
        <div className="klein">{einsatz?.Aufgabe || t("foto.ohneEinsatz")}</div>
        <label>{t("foto.foto")}</label>
        <input type="file" accept="image/*" capture="environment" onChange={waehlen} />
        {bild && <img className="vorschau" src={bild.vorschau} alt={t("foto.vorschau")} />}
        <label>{t("foto.kategorie")}</label>
        <select value={kategorie} onChange={(e) => setKategorie(e.target.value)}>
          {KATEGORIEN.map((k) => <option key={k} value={k}>{wert(k)}</option>)}
        </select>
        <label>{t("foto.notiz")}</label>
        <textarea value={notiz} onChange={(e) => setNotiz(e.target.value)} placeholder={t("foto.notizBeispiel")} />
        {meldung && <div className={meldung.ok ? "erfolg" : "fehler"}>{meldung.text}</div>}
        <div className="btn-reihe">
          <button className="btn hell" onClick={schliessen}>{t("allgemein.abbrechen")}</button>
          <button className="btn ok" disabled={busy || !bild} onClick={senden}>{busy ? t("allgemein.sende") : t("allgemein.speichern")}</button>
        </div>
      </div>
    </div>
  );
}
