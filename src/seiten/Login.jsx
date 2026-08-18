import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api.js";
import { spracheSetzen, spracheOk } from "../i18n.js";
import SprachWahl from "../teile/SprachWahl.jsx";

export default function Login({ onLogin }) {
  const { t } = useTranslation();
  const [id, setId] = useState("");
  const [pin, setPin] = useState("");
  const [fehler, setFehler] = useState("");
  const [laedt, setLaedt] = useState(false);
  const [gewaehlt, setGewaehlt] = useState(null); // hier auf dem Login-Screen bewusst angetippt

  async function absenden(e) {
    e.preventDefault();
    setFehler(""); setLaedt(true);
    const r = await api("login", { anmelde_id: id.trim(), pin: pin.trim() });
    setLaedt(false);
    if (!r.ok) { setFehler(r.fehler || t("login.fehlgeschlagen")); return; }
    onLogin({ token: r.token, name: r.name, kolonne: r.kolonne, mitarbeiterId: r.mitarbeiterId, sprache: r.sprache });
    // Sprache abgleichen: Wahl auf dem Login-Screen gewinnt und wandert ins Profil (Feld „Sprache“);
    // sonst Profil-Sprache übernehmen (neues Handy, vom Büro vorbelegt); sonst bleibt die Geräte-/Browser-Sprache.
    // Bewusst nur die aktive Wahl speichern – ein geteiltes Handy soll nicht die Sprache des Vorgängers ins Profil schreiben.
    const profil = spracheOk(r.sprache) ? r.sprache : null;
    if (gewaehlt) { if (gewaehlt !== profil) api("aktion", { aktion: "sprache_setzen", daten: { sprache: gewaehlt } }); }
    else if (profil) spracheSetzen(profil);
  }

  return (
    <div className="login">
      <div className="logo">🏗️</div>
      <h1>{t("app.name")}</h1>
      <SprachWahl onWahl={setGewaehlt} />
      <p>{t("login.untertitel")}</p>
      <form onSubmit={absenden}>
        <label>{t("login.anmeldeId")}</label>
        <input inputMode="numeric" pattern="[0-9]*" placeholder="9 0 0 0 1" value={id} onChange={(e) => setId(e.target.value.replace(/\D/g, ""))} autoFocus dir="ltr" />
        <label>{t("login.pin")}</label>
        <input inputMode="numeric" pattern="[0-9]*" type="password" placeholder="• • • •" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} dir="ltr" />
        {fehler && <div className="fehler">{fehler}</div>}
        <button className="btn" disabled={laedt || !id || !pin}>{laedt ? t("allgemein.bitteWarten") : t("login.anmelden")}</button>
      </form>
      <p className="klein" style={{ marginTop: 20 }}>{t("login.hinweis")}</p>
    </div>
  );
}
