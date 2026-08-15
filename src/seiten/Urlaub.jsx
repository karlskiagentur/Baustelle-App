import React, { useEffect, useState } from "react";
import { api, datumSchoen } from "../api.js";

export default function Urlaub() {
  const [liste, setListe] = useState(null);
  const [fehler, setFehler] = useState("");
  const [f, setF] = useState({ von: "", bis: "", art: "Urlaub", kommentar: "" });
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState("");

  async function laden() { const r = await api("daten", { bereich: "urlaub" }); r.ok ? setListe(r.urlaub) : setFehler(r.fehler); }
  useEffect(() => { laden(); }, []);

  async function absenden(e) {
    e.preventDefault(); setBusy(true); setOk("");
    const r = await api("aktion", { aktion: "urlaub_antrag", daten: f });
    setBusy(false);
    if (r.ok) { setOk("Antrag eingereicht – du bekommst Bescheid."); setF({ von: "", bis: "", art: "Urlaub", kommentar: "" }); laden(); } else setFehler(r.fehler);
  }

  const genehmigtTage = (liste || []).filter((u) => u.Status === "Genehmigt" && u.Art === "Urlaub").reduce((s, u) => {
    if (!u.Von || !u.Bis) return s;
    let n = 0; for (let d = new Date(u.Von); d <= new Date(u.Bis); d.setDate(d.getDate() + 1)) { const w = d.getDay(); if (w >= 1 && w <= 5) n++; }
    return s + n;
  }, 0);

  return (
    <>
      {fehler && <div className="fehler">{fehler}</div>}
      <div className="karte">
        <h2>Urlaub beantragen</h2>
        <form onSubmit={absenden}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div><label>Von</label><input type="date" value={f.von} onChange={(e) => setF({ ...f, von: e.target.value })} required /></div>
            <div><label>Bis</label><input type="date" value={f.bis} onChange={(e) => setF({ ...f, bis: e.target.value })} required /></div>
          </div>
          <label>Art</label>
          <select value={f.art} onChange={(e) => setF({ ...f, art: e.target.value })}>
            {["Urlaub", "Überstundenausgleich", "Unbezahlt", "Lehrgang"].map((a) => <option key={a}>{a}</option>)}
          </select>
          <label>Kommentar (optional, z. B. Vertretung)</label>
          <input value={f.kommentar} onChange={(e) => setF({ ...f, kommentar: e.target.value })} />
          {ok && <div className="erfolg">{ok}</div>}
          <button className="btn" disabled={busy || !f.von || !f.bis}>Antrag senden</button>
        </form>
      </div>
      <div className="karte">
        <h2>Meine Anträge</h2>
        <div className="klein">Genehmigte Urlaubstage dieses Jahr (Mo–Fr): {genehmigtTage}</div>
        {!liste && <div className="laden">Lade…</div>}
        {liste && liste.length === 0 && <div className="leer">Noch keine Anträge.</div>}
        {(liste || []).map((u) => (
          <div className="dok" key={u.id}>
            <div>
              <div style={{ fontWeight: 600 }}>{u.Art} · {datumSchoen(u.Von)} – {datumSchoen(u.Bis)}</div>
              {u.Kommentar && <div className="klein">{u.Kommentar}</div>}
            </div>
            <span className={"chip " + (u.Status === "Genehmigt" ? "ok" : u.Status === "Abgelehnt" ? "bad" : "warn")}>{u.Status || "Offen"}</span>
          </div>
        ))}
      </div>
    </>
  );
}
