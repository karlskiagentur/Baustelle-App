import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, sitzung } from "../api.js";
import { einreihen } from "../warteschlange.js";
import Unterschrift from "./Unterschrift.jsx";

const stundenText = (h) => (h ? String(h).replace(".", ",") : "");

/**
 * Tagesbericht / Regiebericht mit Unterschrift des Auftraggebers – zwei Schritte:
 *  1) Was wurde gemacht? Wer war da (Stunden)? Material?
 *  2) Auftraggeber unterschreibt auf dem Handy (oder „ohne Unterschrift speichern“)
 * Wird wie Stempel/Fotos zuerst auf dem Handy gespeichert → funktioniert auch im Funkloch.
 */
export default function BerichtBlatt({ einsatz, plan = [], laufendEinsatzId, schliessen }) {
  const { t } = useTranslation();
  const ich = sitzung()?.name || "";
  const vorschlagEinsatz = einsatz || plan.find((e) => e.id === laufendEinsatzId) || plan[0] || null;
  const [schritt, setSchritt] = useState(1);
  const [art, setArt] = useState("Tagesbericht");
  const [baustelleId, setBaustelleId] = useState((vorschlagEinsatz?.Baustelle || [])[0] || "");
  const [baustellen, setBaustellen] = useState(null);
  const [arbeiten, setArbeiten] = useState("");
  const [leute, setLeute] = useState([{ name: ich, stunden: "" }]);
  const [material, setMaterial] = useState("");
  const [unterzeichner, setUnterzeichner] = useState("");
  const [sig, setSig] = useState(null);
  const [meldung, setMeldung] = useState(null);
  const [busy, setBusy] = useState(false);
  const loeschenRef = useRef(null);

  useEffect(() => {
    api("daten", { bereich: "baustellen" }).then((r) => setBaustellen(r.ok ? r.baustellen : []));
    if (vorschlagEinsatz) {
      // Team + heutige Stunden vorschlagen (ohne Netz bleibt der eigene Name stehen)
      api("daten", { bereich: "bericht_vorschlag", einsatzId: vorschlagEinsatz.id }).then((r) => {
        if (r.ok && Array.isArray(r.leute) && r.leute.length) setLeute(r.leute.map((l) => ({ name: l.name, stunden: stundenText(l.stunden) })));
      });
    }
  }, []);

  const einsatzZu = (bid) => {
    if (!bid) return undefined;
    if (vorschlagEinsatz && (vorschlagEinsatz.Baustelle || [])[0] === bid) return vorschlagEinsatz.id;
    return plan.find((e) => (e.Baustelle || [])[0] === bid)?.id;
  };
  const auswahl = useMemo(() => {
    const liste = baustellen || [];
    if (!baustelleId || liste.some((b) => b.id === baustelleId)) return liste;
    const name = ((vorschlagEinsatz?.Adresse_Auto || [])[0] || vorschlagEinsatz?.Aufgabe || "…").split("\n")[0];
    return [{ id: baustelleId, Name: name }, ...liste];
  }, [baustellen, baustelleId]);

  const leuteOk = leute.filter((l) => l.name.trim());
  const summe = leuteOk.reduce((s, l) => s + (Number(String(l.stunden).replace(",", ".")) || 0), 0);
  const zeile = (i, feld, wert) => setLeute((ls) => ls.map((l, j) => (j === i ? { ...l, [feld]: wert } : l)));

  async function speichern(mitUnterschrift) {
    setBusy(true); setMeldung(null);
    const r = await einreihen("tagesbericht", {
      art, einsatzId: einsatzZu(baustelleId), baustelleId: baustelleId || undefined,
      arbeiten: arbeiten.trim(), material: material.trim(),
      leute: leuteOk.map((l) => ({ name: l.name.trim(), stunden: String(l.stunden).replace(",", ".") })),
      ...(mitUnterschrift ? { unterzeichner: unterzeichner.trim(), unterschrift: sig } : {}),
    });
    setBusy(false);
    if (r.ok) {
      setMeldung({ ok: true, text: navigator.onLine === false ? t("offline.gespeichertOffline") : t("bericht.gespeichert") });
      setTimeout(schliessen, 1200);
    } else setMeldung({ ok: false, text: r.fehler || t("allgemein.fehler") });
  }

  return (
    <div className="overlay">{/* kein Schließen per Tipp daneben – sonst wäre der halbe Bericht weg */}
      <div className="blatt">
        <h2>✍️ {t("bericht.titel")}</h2>
        {schritt === 1 ? (
          <>
            <div className="wahl-reihe" role="radiogroup" aria-label={t("bericht.art")}>
              {["Tagesbericht", "Regiebericht"].map((a) => (
                <button key={a} type="button" role="radio" aria-checked={art === a} className={"wahl" + (art === a ? " an" : "")} onClick={() => setArt(a)}>
                  {a === "Tagesbericht" ? t("bericht.tagesbericht") : t("bericht.regiebericht")}
                </button>
              ))}
            </div>
            <label>🏗️ {t("foto.baustelleLabel")}</label>
            {baustellen === null
              ? <div className="klein">{t("allgemein.laden")}</div>
              : (
                <select value={baustelleId} onChange={(e) => setBaustelleId(e.target.value)}>
                  {auswahl.map((b) => <option key={b.id} value={b.id}>{b.Name}</option>)}
                  <option value="">{t("foto.keineBaustelle")}</option>
                </select>
              )}
            <label>{t("bericht.arbeiten")}</label>
            <textarea value={arbeiten} onChange={(e) => setArbeiten(e.target.value)} placeholder={t("bericht.arbeitenBeispiel")} rows={4} />
            <label>{t("bericht.leute")}</label>
            {leute.map((l, i) => (
              <div className="person-zeile" key={i}>
                <input value={l.name} onChange={(e) => zeile(i, "name", e.target.value)} placeholder={t("bericht.name")} aria-label={t("bericht.name")} />
                <input className="std" value={l.stunden} onChange={(e) => zeile(i, "stunden", e.target.value.replace(/[^0-9.,]/g, ""))} inputMode="decimal" placeholder={t("bericht.stunden")} aria-label={t("bericht.stunden")} />
                <button type="button" className="mini" aria-label="✕" onClick={() => setLeute((ls) => (ls.length > 1 ? ls.filter((_, j) => j !== i) : [{ name: "", stunden: "" }]))}>✕</button>
              </div>
            ))}
            <div className="zeile" style={{ marginTop: 6 }}>
              <button type="button" className="mini" onClick={() => setLeute((ls) => [...ls, { name: "", stunden: "" }])}>{t("bericht.person")}</button>
              {summe > 0 && <span className="klein"><b>Σ {stundenText(Math.round(summe * 100) / 100)} {t("allgemein.stundenKurz")}</b></span>}
            </div>
            <label>{t("bericht.material")}</label>
            <textarea value={material} onChange={(e) => setMaterial(e.target.value)} rows={2} />
            <div className="btn-reihe">
              <button className="btn hell" onClick={schliessen}>{t("allgemein.abbrechen")}</button>
              <button className="btn" disabled={!arbeiten.trim()} onClick={() => setSchritt(2)}>{t("bericht.weiter")}</button>
            </div>
          </>
        ) : (
          <>
            <div className="klein" style={{ fontWeight: 700 }}>{t("bericht.unterschriftTitel")}</div>
            <label>{t("bericht.unterzeichner")}</label>
            <input value={unterzeichner} onChange={(e) => setUnterzeichner(e.target.value)} autoComplete="off" />
            <div className="klein" style={{ marginTop: 10 }}>{t("bericht.unterschriftHinweis")}</div>
            <Unterschrift onChange={setSig} loeschenRef={loeschenRef} beschriftung={t("bericht.unterschriftTitel")} />
            <div className="zeile">
              <button type="button" className="mini" onClick={() => loeschenRef.current && loeschenRef.current()}>{t("bericht.loeschen")}</button>
            </div>
            {meldung && <div className={meldung.ok ? "erfolg" : "fehler"}>{meldung.text}</div>}
            <button className="btn ok" disabled={busy || !sig || !unterzeichner.trim()} onClick={() => speichern(true)}>✍️ {t("bericht.unterschreiben")}</button>
            <div className="btn-reihe">
              <button className="btn hell" disabled={busy} onClick={() => setSchritt(1)}>← {t("allgemein.zurueck")}</button>
              <button className="btn hell" disabled={busy} onClick={() => speichern(false)}>{t("bericht.ohne")}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
