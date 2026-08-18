import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, zeitSchoen } from "../api.js";
import { wert } from "../i18n.js";
import FotoBlatt from "../teile/FotoBlatt.jsx";
import PushHinweis from "../teile/PushHinweis.jsx";

const STEMPEL_KEY = "baustelle_stempel"; // laufender Zeiteintrag (lokal gemerkt)

export default function Heute({ sitzung }) {
  const { t } = useTranslation();
  const [daten, setDaten] = useState(null);
  const [fehler, setFehler] = useState("");
  const [laufend, setLaufend] = useState(() => { try { return JSON.parse(localStorage.getItem(STEMPEL_KEY)); } catch { return null; } });
  const [tick, setTick] = useState(0);
  const [pause, setPause] = useState(30);
  const [foto, setFoto] = useState(null); // {einsatz}
  const [busy, setBusy] = useState(false);
  const timer = useRef();

  async function laden() {
    const r = await api("daten", { bereich: "start" });
    if (r.ok) setDaten(r); else setFehler(r.fehler || t("allgemein.fehlerLaden"));
  }
  useEffect(() => { laden(); }, []);
  useEffect(() => {
    timer.current = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(timer.current);
  }, []);

  async function start(einsatz) {
    setBusy(true);
    const r = await api("aktion", { aktion: "stempel_start", daten: { einsatzId: einsatz?.id, baustelleId: einsatz?.Baustelle?.[0] } });
    setBusy(false);
    if (r.ok) {
      const l = { zeiteintragId: r.zeiteintragId, einsatzId: einsatz?.id, name: einsatz?.Aufgabe || "", start: new Date().toISOString() };
      localStorage.setItem(STEMPEL_KEY, JSON.stringify(l)); setLaufend(l); laden();
    } else setFehler(r.fehler);
  }
  async function ende() {
    if (!laufend) return;
    setBusy(true);
    const r = await api("aktion", { aktion: "stempel_ende", daten: { zeiteintragId: laufend.zeiteintragId, einsatzId: laufend.einsatzId, pauseMinuten: pause } });
    setBusy(false);
    if (r.ok) { localStorage.removeItem(STEMPEL_KEY); setLaufend(null); laden(); } else setFehler(r.fehler);
  }

  const dauer = laufend ? Math.floor((Date.now() - new Date(laufend.start)) / 60000) : 0;
  const plan = daten?.tagesplan || [];
  const offenesMaterial = (daten?.material || []).filter((m) => m.Status === "Offen").length;

  return (
    <>
      <PushHinweis />
      {fehler && <div className="fehler">{fehler}</div>}

      {/* Stempeluhr */}
      <div className="karte">
        <h2>{t("heute.stempeluhr")}</h2>
        {laufend ? (
          <>
            <div className="zeile">
              <div>
                <div className="klein">{t("heute.laeuftSeit", { zeit: zeitSchoen(laufend.start), name: laufend.name || t("heute.einsatz") })}</div>
                <div className="gross timer">{Math.floor(dauer / 60)}:{String(dauer % 60).padStart(2, "0")} {t("allgemein.stundenKurz")}</div>
              </div>
              <span className="chip ok">{t("heute.vorOrt")}</span>
            </div>
            <label>{t("heute.pauseHeute")}</label>
            <select value={pause} onChange={(e) => setPause(Number(e.target.value))}>
              {[0, 15, 30, 45, 60].map((p) => <option key={p} value={p}>{t("heute.minuten", { n: p })}</option>)}
            </select>
            <button className="btn bad" disabled={busy} onClick={ende}>{t("heute.feierabend")}</button>
          </>
        ) : (
          <>
            <div className="klein">{t("heute.nochNicht")}</div>
            <button className="btn hell" disabled={busy} onClick={() => start(null)}>{t("heute.startOhne")}</button>
          </>
        )}
      </div>

      {/* Tagesplan */}
      <div className="karte">
        <h2>{t("heute.meineEinsaetze")}</h2>
        {!daten && <div className="laden">{t("allgemein.laden")}</div>}
        {daten && plan.length === 0 && <div className="leer">{t("heute.keinEinsatz")}</div>}
        {plan.map((e) => {
          const adresse = (e.Adresse_Auto || [])[0] || "";
          const fzgTyp = (e.Fahrzeug_Typ_Auto || [])[0];
          const fzgAus = (e.Fahrzeug_Ausstattung_Auto || [])[0];
          const nav = adresse ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(adresse.replace(/\n/g, ", "))}` : null;
          return (
            <div key={e.id} style={{ borderTop: "1px solid var(--line)", paddingTop: 10, marginTop: 10 }}>
              <div className="zeile">
                <h3>{e.Aufgabe || t("heute.einsatz")}</h3>
                <span className={"chip " + (e.Status === "Vor Ort" ? "ok" : e.Status === "Beendet" ? "blau" : "")}>{wert(e.Status || "Geplant")}</span>
              </div>
              <div className="klein" style={{ whiteSpace: "pre-line" }}>{adresse}</div>
              <div style={{ marginTop: 6 }}>
                {e.Beginn && <span className="chip">{t("heute.beginn", { zeit: e.Beginn })}</span>}
                {fzgTyp && <span className="chip blau">🚚 {wert(fzgTyp)}{fzgAus ? ` · ${fzgAus}` : ""}</span>}
                {e.Ladung_Besonderes && <span className="chip warn">{t("heute.ladung", { text: e.Ladung_Besonderes })}</span>}
              </div>
              {e.Notiz && <div className="klein" style={{ marginTop: 6 }}>{e.Notiz}</div>}
              <div className="btn-reihe">
                {nav && <a className="btn hell" style={{ display: "grid", placeItems: "center", textDecoration: "none" }} href={nav} target="_blank" rel="noreferrer">{t("heute.navigation")}</a>}
                {!laufend && <button className="btn ok" disabled={busy} onClick={() => start(e)}>{t("heute.start")}</button>}
                <button className="btn hell" onClick={() => setFoto({ einsatz: e })}>{t("heute.foto")}</button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Hinweise */}
      {offenesMaterial > 0 && (
        <div className="hinweis">{t("heute.materialOffen", { count: offenesMaterial })}</div>
      )}
      {(daten?.mitteilungen || []).map((m) => (
        <div className="karte" key={m.id}>
          <h3>📢 {m.Titel}</h3>
          <div style={{ whiteSpace: "pre-line" }}>{m.Nachricht}</div>
        </div>
      ))}

      {foto && <FotoBlatt einsatz={foto.einsatz} schliessen={() => setFoto(null)} />}
    </>
  );
}
