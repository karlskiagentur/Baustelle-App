import React, { useEffect, useState } from "react";
import { api, datumSchoen } from "../api.js";

export default function Material() {
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
  const gruppen = {};
  for (const m of einkauf) (gruppen[m.Markt_Lieferant || "Ohne Markt"] = gruppen[m.Markt_Lieferant || "Ohne Markt"] || []).push(m);

  return (
    <>
      {fehler && <div className="fehler">{fehler}</div>}
      <div className="karte">
        <h2>Meine Einkaufsliste</h2>
        {!liste && <div className="laden">Lade…</div>}
        {liste && einkauf.length === 0 && <div className="leer">Alles erledigt – nichts offen. 👍</div>}
        {Object.entries(gruppen).map(([markt, ms]) => (
          <div key={markt} style={{ marginTop: 8 }}>
            <div className="klein" style={{ fontWeight: 700, margin: "8px 0 2px" }}>🏬 {markt}</div>
            {ms.map((m) => (
              <div key={m.id} className={"mat " + (m.Status === "Besorgt" ? "besorgt" : "")}>
                <button className="kasten" onClick={() => status(m, m.Status === "Besorgt" ? "Offen" : "Besorgt")} aria-label="abhaken">
                  {m.Status === "Besorgt" ? "✓" : ""}
                </button>
                <div style={{ flex: 1 }}>
                  <div className="name">{m.Position} {m.Menge && <span className="klein">· {m.Menge}</span>}</div>
                  <div className="klein">
                    {m.Für_Datum && <>für {datumSchoen(m.Für_Datum)} · </>}
                    {m.Status === "Nicht verfügbar" && <span className="chip bad">nicht verfügbar – Büro informiert</span>}
                    {m.Notiz && <> {m.Notiz}</>}
                  </div>
                  {m.Status !== "Besorgt" && (
                    <div className="aktionen">
                      {m.Status !== "Nicht verfügbar"
                        ? <button className="mini bad" onClick={() => status(m, "Nicht verfügbar")}>Nicht verfügbar</button>
                        : <button className="mini" onClick={() => status(m, "Offen")}>Doch verfügbar</button>}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="karte">
        <h2>Material anfordern</h2>
        <div className="klein">Von der Baustelle ans Büro – der Status kommt hier zurück.</div>
        <form onSubmit={anfordern}>
          <label>Was wird gebraucht?</label>
          <input value={neu.position} onChange={(e) => setNeu({ ...neu, position: e.target.value })} placeholder="z. B. Dachlatten 30×50" />
          <label>Menge</label>
          <input value={neu.menge} onChange={(e) => setNeu({ ...neu, menge: e.target.value })} placeholder="z. B. 40 Stück" />
          <button className="btn" disabled={busy || !neu.position.trim()}>Anfordern</button>
        </form>
        {anfragen.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div className="klein" style={{ fontWeight: 700 }}>Meine Anfragen</div>
            {anfragen.map((m) => (
              <div key={m.id} className="mat">
                <div style={{ flex: 1 }}>
                  <div className="name">{m.Position} {m.Menge && <span className="klein">· {m.Menge}</span>}</div>
                  <span className={"chip " + (m.Status === "Geliefert" ? "ok" : m.Status === "Bestellt" ? "blau" : "warn")}>{m.Status}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
