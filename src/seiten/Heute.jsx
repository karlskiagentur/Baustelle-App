import React, { useEffect, useRef, useState } from "react";
import { api, zeitSchoen } from "../api.js";
import FotoBlatt from "../teile/FotoBlatt.jsx";
import PushHinweis from "../teile/PushHinweis.jsx";

const STEMPEL_KEY = "baustelle_stempel"; // laufender Zeiteintrag (lokal gemerkt)

export default function Heute({ sitzung }) {
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
    if (r.ok) setDaten(r); else setFehler(r.fehler || "Fehler beim Laden");
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
      const l = { zeiteintragId: r.zeiteintragId, einsatzId: einsatz?.id, name: einsatz?.Aufgabe || "Einsatz", start: new Date().toISOString() };
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
        <h2>Stempeluhr</h2>
        {laufend ? (
          <>
            <div className="zeile">
              <div>
                <div className="klein">Läuft seit {zeitSchoen(laufend.start)} · {laufend.name}</div>
                <div className="gross timer">{Math.floor(dauer / 60)}:{String(dauer % 60).padStart(2, "0")} h</div>
              </div>
              <span className="chip ok">Vor Ort</span>
            </div>
            <label>Pause heute (Minuten)</label>
            <select value={pause} onChange={(e) => setPause(Number(e.target.value))}>
              {[0, 15, 30, 45, 60].map((p) => <option key={p} value={p}>{p} min</option>)}
            </select>
            <button className="btn bad" disabled={busy} onClick={ende}>Feierabend / Ende</button>
          </>
        ) : (
          <>
            <div className="klein">Noch nicht eingestempelt. Tippe bei deinem Einsatz auf „Start“ – oder starte ohne Einsatz.</div>
            <button className="btn hell" disabled={busy} onClick={() => start(null)}>Start ohne Einsatz</button>
          </>
        )}
      </div>

      {/* Tagesplan */}
      <div className="karte">
        <h2>Meine Einsätze heute</h2>
        {!daten && <div className="laden">Lade…</div>}
        {daten && plan.length === 0 && <div className="leer">Für heute ist kein Einsatz eingetragen.</div>}
        {plan.map((e) => {
          const adresse = (e.Adresse_Auto || [])[0] || "";
          const fzgTyp = (e.Fahrzeug_Typ_Auto || [])[0];
          const fzgAus = (e.Fahrzeug_Ausstattung_Auto || [])[0];
          const nav = adresse ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(adresse.replace(/\n/g, ", "))}` : null;
          return (
            <div key={e.id} style={{ borderTop: "1px solid var(--line)", paddingTop: 10, marginTop: 10 }}>
              <div className="zeile">
                <h3>{e.Aufgabe || "Einsatz"}</h3>
                <span className={"chip " + (e.Status === "Vor Ort" ? "ok" : e.Status === "Beendet" ? "blau" : "")}>{e.Status || "Geplant"}</span>
              </div>
              <div className="klein" style={{ whiteSpace: "pre-line" }}>{adresse}</div>
              <div style={{ marginTop: 6 }}>
                {e.Beginn && <span className="chip">Beginn {e.Beginn}</span>}
                {fzgTyp && <span className="chip blau">🚚 {fzgTyp}{fzgAus ? ` · ${fzgAus}` : ""}</span>}
                {e.Ladung_Besonderes && <span className="chip warn">Ladung: {e.Ladung_Besonderes}</span>}
              </div>
              {e.Notiz && <div className="klein" style={{ marginTop: 6 }}>{e.Notiz}</div>}
              <div className="btn-reihe">
                {nav && <a className="btn hell" style={{ display: "grid", placeItems: "center", textDecoration: "none" }} href={nav} target="_blank" rel="noreferrer">Navigation</a>}
                {!laufend && <button className="btn ok" disabled={busy} onClick={() => start(e)}>Start</button>}
                <button className="btn hell" onClick={() => setFoto({ einsatz: e })}>📷 Foto</button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Hinweise */}
      {offenesMaterial > 0 && (
        <div className="hinweis">🛒 {offenesMaterial} Material-Position{offenesMaterial > 1 ? "en" : ""} offen – siehe „Material“.</div>
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
