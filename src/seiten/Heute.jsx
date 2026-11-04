import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, zeitSchoen, datumSchoen } from "../api.js";
import { wert } from "../i18n.js";
import { einreihen } from "../warteschlange.js";
import FotoBlatt from "../teile/FotoBlatt.jsx";
import BerichtBlatt from "../teile/BerichtBlatt.jsx";
import PushHinweis from "../teile/PushHinweis.jsx";

const STEMPEL_KEY = "baustelle_stempel"; // laufender Zeiteintrag (lokal gemerkt)

/**
 * Startseite = Menü mit 4 großen Knöpfen (kindgerecht, wenig Text):
 *  ⏱️ Stempeluhr  → Fenster (Blatt) zum Ein-/Ausstempeln inkl. Pause
 *  📋 Einsätze    → Liste „Wo bin ich geplant?“, Zielort öffnet die Karte
 *  📷 Fotos       → Foto-Blatt, Baustelle automatisch aus dem Einsatz vorausgewählt
 *  🛒 Material    → wechselt zum Reiter „Material“
 *  ✍️ Tagesbericht → Bericht mit Unterschrift des Auftraggebers (Modul „tagesbericht“)
 * Stempeln läuft über die Offline-Warteschlange: sofort sichtbar, gesendet wird sobald Netz da ist.
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
  const [bericht, setBericht] = useState(null); // { einsatz? } → Tagesbericht
  const [busy, setBusy] = useState(false);
  const [original, setOriginal] = useState(() => new Set()); // Datensätze, deren deutscher Originaltext gezeigt wird
  const timer = useRef();
  // Büro-Texte: Übersetzung (Modul „uebersetzung“) – auf Wunsch der deutsche Originaltext
  const zeig = (rec, feld) => (original.has(rec.id) && rec.original?.[feld]) || rec[feld];
  const uebKnopf = (rec) => rec.uebersetzt && (
    <button className="ueb-knopf" onClick={() => setOriginal((alt) => { const n = new Set(alt); if (n.has(rec.id)) n.delete(rec.id); else n.add(rec.id); return n; })}>
      🌐 {original.has(rec.id) ? t("uebersetzung.uebersetzung") : `${t("uebersetzung.automatisch")} · ${t("uebersetzung.original")}`}
    </button>
  );

  async function laden() {
    const r = await api("daten", { bereich: "start" });
    if (r.ok) { setDaten(r); setFehler(""); } else setFehler(r.fehler || t("allgemein.fehlerLaden"));
  }
  useEffect(() => { laden(); }, []);
  // Nachgesendete Einträge (z. B. nach Funkloch) → Stand neu laden; Zeiteintrag-ID zum laufenden Stempel merken
  useEffect(() => {
    let warte;
    const gesendet = (e) => {
      const { eintrag, antwort } = e.detail || {};
      if (eintrag?.aktion === "stempel_start" && antwort?.zeiteintragId) {
        setLaufend((l) => {
          if (!l || l.startCid !== eintrag.cid) return l;
          const neu = { ...l, zeiteintragId: antwort.zeiteintragId };
          localStorage.setItem(STEMPEL_KEY, JSON.stringify(neu));
          return neu;
        });
      }
      clearTimeout(warte); warte = setTimeout(laden, 800);
    };
    window.addEventListener("warteschlange-gesendet", gesendet);
    return () => { window.removeEventListener("warteschlange-gesendet", gesendet); clearTimeout(warte); };
  }, []);
  useEffect(() => {
    timer.current = setInterval(() => setTick((x) => x + 1), 30000);
    return () => clearInterval(timer.current);
  }, []);

  const statusLokal = (einsatzId, status) => einsatzId && setDaten((d) => (d ? { ...d, tagesplan: (d.tagesplan || []).map((e) => (e.id === einsatzId ? { ...e, Status: status } : e)) } : d));
  async function start(einsatz) {
    setBusy(true);
    const zeit = new Date().toISOString();
    const r = await einreihen("stempel_start", { einsatzId: einsatz?.id, baustelleId: einsatz?.Baustelle?.[0], zeit });
    setBusy(false);
    if (r.ok) {
      const l = { startCid: r.cid, zeiteintragId: r.zeiteintragId, einsatzId: einsatz?.id, name: einsatz?.Aufgabe || "", start: zeit };
      localStorage.setItem(STEMPEL_KEY, JSON.stringify(l)); setLaufend(l); statusLokal(einsatz?.id, "Vor Ort");
    } else setFehler(r.fehler);
  }
  async function ende() {
    if (!laufend) return;
    setBusy(true);
    const r = await einreihen("stempel_ende", { zeiteintragId: laufend.zeiteintragId, startCid: laufend.startCid, einsatzId: laufend.einsatzId, pauseMinuten: pause, zeit: new Date().toISOString() });
    setBusy(false);
    if (r.ok) { localStorage.removeItem(STEMPEL_KEY); setLaufend(null); setStempelAuf(false); statusLokal(laufend.einsatzId, "Beendet"); } else setFehler(r.fehler);
  }

  const dauer = laufend ? Math.floor((Date.now() - new Date(laufend.start)) / 60000) : 0;
  const plan = daten?.tagesplan || [];
  const offenesMaterial = (daten?.material || []).filter((m) => m.Status === "Offen").length;
  const berichtAn = (daten?.module || []).includes("tagesbericht");

  /* ---------- Menü (Startansicht) ---------- */
  const menue = (
    <>
      <PushHinweis />
      {fehler && <div className="fehler">{fehler}</div>}
      {daten?.offline && <div className="klein offline-stand">📵 {t("offline.stand", { zeit: `${datumSchoen(daten.stand)} ${zeitSchoen(daten.stand)}` })}</div>}
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
        {berichtAn && (
          <button className="gross-knopf breit" onClick={() => setBericht({})}>
            <span className="gk-ico" aria-hidden="true">✍️</span>
            <span className="gk-text">
              <span className="gk-titel">{t("bericht.titel")}</span>
              <span className="gk-sub">{t("bericht.sub")}</span>
            </span>
          </button>
        )}
      </div>

      {(daten?.mitteilungen || []).map((m) => (
        <div className="karte" key={m.id}>
          <h3 dir="auto">📢 {zeig(m, "Titel")}</h3>
          <div dir="auto" style={{ whiteSpace: "pre-line" }}>{zeig(m, "Nachricht")}</div>
          {uebKnopf(m)}
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
                <h3 dir="auto">{zeig(e, "Aufgabe") || t("heute.einsatz")}</h3>
                <span className={"chip " + (e.Status === "Vor Ort" ? "ok" : e.Status === "Beendet" ? "blau" : "")}>{wert(e.Status || "Geplant")}</span>
              </div>
              {/* Zielort: antippen öffnet die Karte mit dieser Baustelle */}
              {bstId
                ? <button className="adresse" onClick={() => zeigeKarte(bstId)}>{adresse ? `📍 ${adresse}` : "📍"}<span className="adresse-mehr">🗺️ {t("nav.karte")} ›</span></button>
                : adresse && <div className="klein" style={{ whiteSpace: "pre-line" }}>{adresse}</div>}
              <div style={{ marginTop: 6 }}>
                {e.Beginn && <span className="chip">{t("heute.beginn", { zeit: e.Beginn })}</span>}
                {fzgTyp && <span className="chip blau">🚚 {wert(fzgTyp)}{fzgAus ? ` · ${fzgAus}` : ""}</span>}
                {e.Ladung_Besonderes && <span className="chip warn">{t("heute.ladung", { text: zeig(e, "Ladung_Besonderes") })}</span>}
              </div>
              {e.Notiz && <div className="klein" dir="auto" style={{ marginTop: 6 }}>{zeig(e, "Notiz")}</div>}
              {uebKnopf(e)}
              <div className="btn-reihe">
                {nav && <a className="btn hell" style={{ display: "grid", placeItems: "center", textDecoration: "none" }} href={nav} target="_blank" rel="noreferrer">🧭 {t("heute.navigation")}</a>}
                {!laufend && <button className="btn ok" disabled={busy} onClick={() => start(e)}>{t("heute.start")}</button>}
                <button className="btn hell" onClick={() => setFoto({ einsatz: e })}>{t("heute.foto")}</button>
                {berichtAn && <button className="btn hell" onClick={() => setBericht({ einsatz: e })}>{t("bericht.knopf")}</button>}
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

      {/* Tagesbericht mit Unterschrift */}
      {bericht && <BerichtBlatt einsatz={bericht.einsatz} plan={plan} laufendEinsatzId={laufend?.einsatzId} schliessen={() => setBericht(null)} />}
    </>
  );
}
