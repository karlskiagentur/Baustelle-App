import React, { useState } from "react";
import { api } from "../api.js";

export default function Login({ onLogin }) {
  const [id, setId] = useState("");
  const [pin, setPin] = useState("");
  const [fehler, setFehler] = useState("");
  const [laedt, setLaedt] = useState(false);

  async function absenden(e) {
    e.preventDefault();
    setFehler(""); setLaedt(true);
    const r = await api("login", { anmelde_id: id.trim(), pin: pin.trim() });
    setLaedt(false);
    if (r.ok) onLogin({ token: r.token, name: r.name, kolonne: r.kolonne, mitarbeiterId: r.mitarbeiterId });
    else setFehler(r.fehler || "Anmeldung fehlgeschlagen");
  }

  return (
    <div className="login">
      <div className="logo">🏗️</div>
      <h1>Baustellen-App</h1>
      <p>Anmelden mit deiner Anmelde-ID und PIN</p>
      <form onSubmit={absenden}>
        <label>Anmelde-ID (5-stellig)</label>
        <input inputMode="numeric" pattern="[0-9]*" placeholder="9 0 0 0 1" value={id} onChange={(e) => setId(e.target.value.replace(/\D/g, ""))} autoFocus />
        <label>PIN</label>
        <input inputMode="numeric" pattern="[0-9]*" type="password" placeholder="• • • •" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
        {fehler && <div className="fehler">{fehler}</div>}
        <button className="btn" disabled={laedt || !id || !pin}>{laedt ? "Bitte warten…" : "Anmelden"}</button>
      </form>
      <p className="klein" style={{ marginTop: 20 }}>Anmelde-ID und PIN bekommst du vom Büro.</p>
    </div>
  );
}
