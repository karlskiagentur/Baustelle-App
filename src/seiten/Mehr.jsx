import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { pushAktivieren, pushStatus } from "../push.js";
import { api } from "../api.js";
import SprachWahl from "../teile/SprachWahl.jsx";

const VERSION = "1.3.1";

export default function Mehr({ sitzung, abmelden, oeffne }) {
  const { t } = useTranslation();
  const [push, setPush] = useState("laden");
  const [meldung, setMeldung] = useState(null); // { text, ok }
  useEffect(() => { pushStatus().then(setPush); }, []);

  async function an() { const r = await pushAktivieren(); if (r.ok) setPush("an"); setMeldung(r.ok ? { text: t("mehr.eingeschaltet"), ok: true } : { text: r.fehler, ok: false }); }
  async function aus() {
    const reg = await navigator.serviceWorker.ready; const abo = await reg.pushManager.getSubscription();
    if (abo) await abo.unsubscribe();
    await api("aktion", { aktion: "push_abo_loeschen" }); setPush("aus"); setMeldung({ text: t("mehr.ausgeschaltet"), ok: false });
  }
  // Sprachwahl: Gerät (SprachWahl) + Airtable-Profil (damit das nächste Handy direkt richtig startet)
  const spracheGewaehlt = (code) => { api("aktion", { aktion: "sprache_setzen", daten: { sprache: code } }); };

  const statusText = push === "an" ? t("mehr.an") : push === "unmoeglich" ? t("mehr.unmoeglich") : t("mehr.aus");

  return (
    <>
      <div className="karte">
        <h2>{sitzung.name}</h2>
        <div className="klein">{sitzung.kolonne || ""}</div>
        <button className="btn hell" onClick={() => oeffne("urlaub")}>{t("mehr.urlaubKnopf")}</button>
      </div>
      <div className="karte">
        <h2>🌐 {t("sprache.titel")}</h2>
        <SprachWahl onWahl={spracheGewaehlt} kompakt />
        <div className="klein" style={{ marginTop: 6 }}>{t("sprache.hinweis")}</div>
      </div>
      <div className="karte">
        <h2>{t("mehr.mitteilungen")}</h2>
        <div className="klein">{t("mehr.status", { status: statusText })}</div>
        {meldung && <div className={meldung.ok ? "erfolg" : "hinweis"}>{meldung.text}</div>}
        <div className="btn-reihe">
          {push !== "an" && push !== "unmoeglich" && <button className="btn" onClick={an}>{t("mehr.einschalten")}</button>}
          {push === "an" && <button className="btn hell" onClick={aus}>{t("mehr.ausschalten")}</button>}
        </div>
      </div>
      <div className="karte">
        <h2>{t("mehr.datenschutz")}</h2>
        <div className="klein">{t("mehr.datenschutzText")}</div>
      </div>
      <button className="btn hell" onClick={abmelden}>{t("mehr.abmelden")}</button>
      <div className="klein" style={{ textAlign: "center", marginTop: 14 }}>{t("app.version", { v: VERSION })}</div>
    </>
  );
}
