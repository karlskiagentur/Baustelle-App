import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, zeitSchoen } from "../api.js";
import { wert } from "../i18n.js";
import FotoBlatt from "../teile/FotoBlatt.jsx";
import PushHinweis from "../teile/PushHinweis.jsx";

const STEMPEL_KEY = "baustelle_stempel"; // laufender Zeiteintrag (lokal gemerkt)

/**
 * Startseite = Menü mit 4 großen Knöpfen (kindgerecht, wenig Text):
 *  ⏱️ Stempeluhr  → Fenster (Blatt) zum Ein-/Ausstempeln inkl. Pause
 *  📋 Einsätze    → Liste „Wo bin ich geplant?“, Zielort öffnet die Karte
 *  📷 Fotos       → Foto-Blatt, Baustelle automatisch aus dem Einsatz vorausgewählt
 *  🛒 Material    → wechselt zum Reiter „Material“
 */
export default function Heute({ geheZu, zeigeKarte }) {
  const { t } = useTranslation();
  const [daten, setDaten] = useState(null);
  const [fehler, setFehler] = useState("");
  const [laufend, setLaufend] = useState(() => { try { return JSON.parse(localStorage.getItem(STEMPEL_KEY)); } catch { return null; } });
  const [ansicht, setAnsicht] = useState("menue"); // "menue" | "einsaetze"
  const [stempelAuf, setStempelAuf] = useState(false); // Stempeluhr-Fenster
  const [tick, setTick] = useState(0);
  const [pause, setPause] = useState(30);
  const [foto, setFoto] = useState(null); // { einsatz? } → Foto-Blatt
  const [busy, setBusy] = useState(false);
  const timer = useRef();

  async function laden() {
    const r = await api("daten", { bereich: "start" });
    if (r.ok) setDaten(r); else setFehler(r.fehler || t("allgemein.fehlerLaden"));
  }
  useEffect(() => { laden(); }, []);
  useEffect(() => {
    timer.current = setInterval(() => setTick((x) => x + 1), 30000);
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
    if (r.ok) { localStorage.removeItem(STEMPEL_KEY); setLaufend(null); setStempelAuf(false); laden(); } else setFehler(r.fehler);
  }

  const dauer = laufend ? Math.floor((Date.now() - new Date(laufend.start)) / 60000) : 0;
  const plan = daten?.tagesplan || [];
  const offenesMaterial = (daten?.material || []).filter((m) => m.Status === "Offen").length;

  /* ---------- Menü (Startansicht) ---------- */
  const menue = (
    <>
      <PushHinweis />
      {fehler && <div className="fehler">{fehler}</div>}
      <div className="menue">
        <button className={"gross-knopf" + (laufend ? " laeuft" : "")} onClick={() => setStempelAuf(true)}>
          <span className="gk-ico" aria-hidden="true">⏱️</span>
          <span className="gk-titel">{t("heute.stempeluhr")}</span>
          <span className="gk-sub">{laufend ? t("heute.laeuftKurz", { zeit: zeitSchoen(laufend.start) }) : t("heute.subStempel")}</span>
          {laufend && <span className="gk-badge gruen">▶</span>}
        </button>
        <button className="gross-knopf" onClick={() => setAnsicht("einsaetze")}>
          <span className="gk-ico" aria-hidden="true">📋</span>
          <span className="gk-titel">{t("heute.einsaetzeTitel")}</span>
          <span className="gk-sub">{t("heute.subEinsaetze")}</span>
          {plan.length > 0 && <span className="gk-badge blau">{plan.length}</span>}
        </button>
        <button className="gross-knopf" onClick={() => setFoto({})}>
          <span className="gk-ico" aria-hidden="true">📷</span>
          <span className="gk-titel">{t("heute.fotosTitel")}</span>
          <span className="gk-sub">{t("heute.subFoto")}</span>
        </button>
        <button className="gross-knopf" onClick={() => geheZu("material")}>
          <span className="gk-ico" aria-hidden="true">🛒</span>
          <span className="gk-titel">{t("nav.material")}</span>
          <span className="gk-sub">{t("heute.subMaterial")}</span>
          {offenesMaterial > 0 && <span className="gk-badge">{offenesMaterial}</span>}
        </button>
      </div>

      {(daten?.mitteilungen || []).map((m) => (
        <div className="karte" key={m.id}>
          <h3>📢 {m.Titel}</h3>
          <div style={{ whiteSpace: "pre-line" }}>{m.Nachricht}</div>
        </div>
      ))}
    </>
  );

  /* ---------- Einsätze (Unteransicht) ---------- */
  const einsaetzeAnsicht = (
    <>
      {fehler && <div className="fehler">{fehler}</div>}
      <button className="btn hell klein-btn" onClick={() => setAnsicht("menue")}>← {t("allgemein.zurueck")}</button>
      <div className="karte" style={{ marginTop: 10 }}>
        <h2>📋 {t("heute.meineEinsaetze")}</h2>
        {!daten && <div className="laden">{t("allgemein.laden")}</div>}
        {daten && plan.length === 0 && <div className="leer">{t("heute.keinEinsatz")}</div>}
        {plan.map((e) => {
          const adresse = (e.Adresse_Auto || [])[0] || "";
          const bstId = (e.Baustelle || [])[0];
          const fzgTyp = (e.Fahrzeug_Typ_Auto || [])[0];
          const fzgAus = (e.Fahrzeug_Ausstattung_Auto || [])[0];
          const nav = adresse ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(adresse.replace(/\n/g, ", "))}` : null;
          return (
            <div key={e.id} style={{ borderTop: "1px solid var(--line)", paddingTop: 10, marginTop: 10 }}>
              <div className="zeile">
                <h3>{e.Aufgabe || t("heute.einsatz")}</h3>
                <span className={"chip " + (e.Status === "Vor Ort" ? "ok" : e.Status === "Beendet" ? "blau" : "")}>{wert(e.Status || "Geplant")}</span>
              </div>
              {/* Zielort: antippen öffnet die Karte mit dieser Baustelle */}
              {bstId
                ? <button className="adresse" onClick={() => zeigeKarte(bstId)}>{adresse ? `📍 ${adresse}` : "📍"}<span className="adresse-mehr">🗺️ {t("nav.karte")} ›</span></button>
                : adresse && <div className="klein" style={{ whiteSpace: "pre-line" }}>{adresse}</div>}
              <div style={{ marginTop: 6 }}>
                {e.Beginn && <span className="chip">{t("heute.beginn", { zeit: e.Beginn })}</span>}
                {fzgTyp && <span className="chip blau">🚚 {wert(fzgTyp)}{fzgAus ? ` · ${fzgAus}` : ""}</span>}
                {e.Ladung_Besonderes && <span className="chip warn">{t("heute.ladung", { text: e.Ladung_Besonderes })}</span>}
              </div>
              {e.Notiz && <div className="klein" style={{ marginTop: 6 }}>{e.Notiz}</div>}
              <div className="btn-reihe">
                {nav && <a className="btn hell" style={{ display: "grid", placeItems: "center", textDecoration: "none" }} href={nav} target="_blank" rel="noreferrer">🧭 {t("heute.navigation")}</a>}
                {!laufend && <button className="btn ok" disabled={busy} onClick={() => start(e)}>{t("heute.start")}</button>}
                <button className="btn hell" onClick={() => setFoto({ einsatz: e })}>{t("heute.foto")}</button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );

  return (
    <>
      {ansicht === "menue" ? menue : einsaetzeAnsicht}

      {/* Stempeluhr-Fenster */}
      {stempelAuf && (
        <div className="overlay" onClick={() => setStempelAuf(false)}>
          <div className="blatt" onClick={(ev) => ev.stopPropagation()}>
            <h2>⏱️ {t("heute.stempeluhr")}</h2>
            {laufend ? (
              <>
                <div className="klein">{t("heute.laeuftSeit", { zeit: zeitSchoen(laufend.start), name: laufend.name || t("heute.einsatz") })}</div>
                <div className="gross timer" style={{ margin: "6px 0 2px" }}>{Math.floor(dauer / 60)}:{String(dauer % 60).padStart(2, "0")} {t("allgemein.stundenKurz")}</div>
                <label>{t("heute.pauseHeute")}</label>
                <select value={pause} onChange={(ev) => setPause(Number(ev.target.value))}>
                  {[0, 15, 30, 45, 60].map((p) => <option key={p} value={p}>{t("heute.minuten", { n: p })}</option>)}
                </select>
                <button className="btn bad" disabled={busy} onClick={ende}>{t("heute.feierabend")}</button>
              </>
            ) : (
              <>
                <div className="klein">{plan.length ? t("heute.stempelFrage") : t("heute.keinEinsatz")}</div>
                {plan.map((e) => (
                  <button key={e.id} className="btn ok" disabled={busy} onClick={() => start(e)}>
                    ▶ {e.Aufgabe || t("heute.einsatz")}{e.Beginn ? ` · ${e.Beginn}` : ""}
                  </button>
                ))}
                <button className="btn hell" disabled={busy} onClick={() => start(null)}>{t("heute.startOhne")}</button>
              </>
            )}
            <button className="btn hell" onClick={() => setStempelAuf(false)}>{t("allgemein.abbrechen")}</button>
          </div>
        </div>
      )}

      {/* Foto-Fenster (Baustelle automatisch vorausgewählt, alle wählbar) */}
      {foto && <FotoBlatt einsatz={foto.einsatz} plan={plan} laufendEinsatzId={laufend?.einsatzId} schliessen={() => setFoto(null)} />}
    </>
  );
}
