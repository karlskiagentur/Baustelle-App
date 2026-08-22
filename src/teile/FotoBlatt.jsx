import React, { useEffect, useMemo, useState } from "react";
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

/**
 * Foto-Fenster. Die Baustelle wird automatisch aus dem Einsatz erkannt
 * (laufende Stempelung > angeklickter Einsatz > erster Einsatz heute) –
 * alle anderen Baustellen bleiben aber wählbar.
 */
export default function FotoBlatt({ einsatz, plan = [], laufendEinsatzId, schliessen }) {
  const { t } = useTranslation();
  const [bild, setBild] = useState(null);
  const [kategorie, setKategorie] = useState("Zwischenstand");
  const [notiz, setNotiz] = useState("");
  const [busy, setBusy] = useState(false);
  const [meldung, setMeldung] = useState(null); // { text, ok }
  const [baustellen, setBaustellen] = useState(null); // alle aktiven Baustellen (nachgeladen)

  // Automatische Vorauswahl der Baustelle
  const vorschlag = useMemo(() => (
    (einsatz?.Baustelle || [])[0]
    || (plan.find((e) => e.id === laufendEinsatzId)?.Baustelle || [])[0]
    || (plan[0]?.Baustelle || [])[0]
    || ""
  ), [einsatz, plan, laufendEinsatzId]);
  const [baustelleId, setBaustelleId] = useState(vorschlag);

  useEffect(() => {
    api("daten", { bereich: "baustellen" }).then((r) => setBaustellen(r.ok ? r.baustellen : []));
  }, []);

  // Passenden Einsatz zur gewählten Baustelle finden (für die Verknüpfung in Airtable)
  const einsatzZu = (bid) => {
    if (!bid) return undefined;
    if (einsatz && (einsatz.Baustelle || [])[0] === bid) return einsatz.id;
    const lauf = plan.find((e) => e.id === laufendEinsatzId);
    if (lauf && (lauf.Baustelle || [])[0] === bid) return lauf.id;
    return plan.find((e) => (e.Baustelle || [])[0] === bid)?.id;
  };

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
        einsatzId: einsatzZu(baustelleId), baustelleId: baustelleId || undefined, kategorie, notiz,
        fotoBase64: bild?.base64, fotoTyp: "image/jpeg", fotoName: `foto-${Date.now()}.jpg`,
      },
    });
    setBusy(false);
    if (r.ok) { setMeldung({ text: t("allgemein.gespeichert"), ok: true }); setTimeout(schliessen, 800); }
    else setMeldung({ text: r.fehler || t("allgemein.fehler"), ok: false });
  }

  // Auswahl-Liste: alle aktiven Baustellen; die vorgeschlagene notfalls ergänzen
  const liste = baustellen || [];
  const auswahl = vorschlag && !liste.some((b) => b.id === vorschlag)
    ? [{ id: vorschlag, Name: ((einsatz?.Adresse_Auto || plan.find((e) => (e.Baustelle || [])[0] === vorschlag)?.Adresse_Auto || [])[0] || "…").split("\n")[0] }, ...liste]
    : liste;

  return (
    <div className="overlay" onClick={schliessen}>
      <div className="blatt" onClick={(e) => e.stopPropagation()}>
        <h2>📷 {t("foto.titel")}</h2>
        <label>🏗️ {t("foto.baustelleLabel")}</label>
        {baustellen === null
          ? <div className="klein">{t("allgemein.laden")}</div>
          : (
            <select value={baustelleId} onChange={(e) => setBaustelleId(e.target.value)}>
              {auswahl.map((b) => <option key={b.id} value={b.id}>{b.Name}</option>)}
              <option value="">{t("foto.keineBaustelle")}</option>
            </select>
          )}
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
