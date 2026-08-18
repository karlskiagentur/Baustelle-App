import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, datumSchoen } from "../api.js";
import { wert } from "../i18n.js";

export default function Material() {
  const { t } = useTranslation();
  const [liste, setListe] = useState(null);
  const [fehler, setFehler] = useState("");
  const [neu, setNeu] = useState({ position: "", menge: "" });
  const [busy, setBusy] = useState(false);

  async function laden() {
    const r = await api("daten", { bereich: "material" });
    if (r.ok) setListe(r.material); else setFehler(r.fehler);
  }
  useEffect(() => { laden(); }, []);

  async function status(m, s) {
    setListe((l) => l.map((x) => (x.id === m.id ? { ...x, Status: s } : x)));
    const r = await api("aktion", { aktion: "material_status", daten: { materialId: m.id, status: s } });
    if (!r.ok) { setFehler(r.fehler); laden(); }
    else if (s === "Besorgt") setTimeout(laden, 600);
  }
  async function anfordern(e) {
    e.preventDefault();
    if (!neu.position.trim()) return;
    setBusy(true);
    const r = await api("aktion", { aktion: "material_anfordern", daten: { position: neu.position.trim(), menge: neu.menge.trim() } });
    setBusy(false);
    if (r.ok) { setNeu({ position: "", menge: "" }); laden(); } else setFehler(r.fehler);
  }

  const einkauf = (liste || []).filter((m) => m.Quelle !== "Baustelle" || m.Status === "Offen");
  const anfragen = (liste || []).filter((m) => m.Quelle === "Baustelle" && m.Status !== "Offen");

  // gruppieren nach Markt
  const OHNE = "__ohne__"; // interner Schlüssel für „ohne Markt“ (wird übersetzt angezeigt)
  const gruppen = {};
  for (const m of einkauf) (gruppen[m.Markt_Lieferant || OHNE] = gruppen[m.Markt_Lieferant || OHNE] || []).push(m);

  return (
    <>
      {fehler && <div className="fehler">{fehler}</div>}
      <div className="karte">
        <h2>{t("material.einkaufsliste")}</h2>
        {!liste && <div className="laden">{t("allgemein.laden")}</div>}
        {liste && einkauf.length === 0 && <div className="leer">{t("material.allesErledigt")}</div>}
        {Object.entries(gruppen).map(([markt, ms]) => (
          <div key={markt} style={{ marginTop: 8 }}>
            <div className="klein" style={{ fontWeight: 700, margin: "8px 0 2px" }}>🏬 {markt === OHNE ? t("material.ohneMarkt") : markt}</div>
            {ms.map((m) => (
              <div key={m.id} className={"mat " + (m.Status === "Besorgt" ? "besorgt" : "")}>
                <button className="kasten" onClick={() => status(m, m.Status === "Besorgt" ? "Offen" : "Besorgt")} aria-label={t("material.abhaken")}>
                  {m.Status === "Besorgt" ? "✓" : ""}
                </button>
                <div style={{ flex: 1 }}>
                  <div className="name">{m.Position} {m.Menge && <span className="klein">· {m.Menge}</span>}</div>
                  <div className="klein">
                    {m.Für_Datum && <>{t("material.fuerDatum", { datum: datumSchoen(m.Für_Datum) })} · </>}
                    {m.Status === "Nicht verfügbar" && <span className="chip bad">{t("material.nichtVerfuegbarInfo")}</span>}
                    {m.Notiz && <> {m.Notiz}</>}
                  </div>
                  {m.Status !== "Besorgt" && (
                    <div className="aktionen">
                      {m.Status !== "Nicht verfügbar"
                        ? <button className="mini bad" onClick={() => status(m, "Nicht verfügbar")}>{t("material.nichtVerfuegbar")}</button>
                        : <button className="mini" onClick={() => status(m, "Offen")}>{t("material.dochVerfuegbar")}</button>}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="karte">
        <h2>{t("material.anfordern")}</h2>
        <div className="klein">{t("material.anfordernInfo")}</div>
        <form onSubmit={anfordern}>
          <label>{t("material.wasGebraucht")}</label>
          <input value={neu.position} onChange={(e) => setNeu({ ...neu, position: e.target.value })} placeholder={t("material.wasBeispiel")} />
          <label>{t("material.menge")}</label>
          <input value={neu.menge} onChange={(e) => setNeu({ ...neu, menge: e.target.value })} placeholder={t("material.mengeBeispiel")} />
          <button className="btn" disabled={busy || !neu.position.trim()}>{t("material.anfordernKnopf")}</button>
        </form>
        {anfragen.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div className="klein" style={{ fontWeight: 700 }}>{t("material.meineAnfragen")}</div>
            {anfragen.map((m) => (
              <div key={m.id} className="mat">
                <div style={{ flex: 1 }}>
                  <div className="name">{m.Position} {m.Menge && <span className="klein">· {m.Menge}</span>}</div>
                  <span className={"chip " + (m.Status === "Geliefert" ? "ok" : m.Status === "Bestellt" ? "blau" : "warn")}>{wert(m.Status)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
