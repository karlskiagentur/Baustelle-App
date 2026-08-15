import React, { useEffect, useState } from "react";
import { pushAktivieren, pushStatus } from "../push.js";
import { api } from "../api.js";

export default function Mehr({ sitzung, abmelden, oeffne }) {
  const [push, setPush] = useState("laden");
  const [meldung, setMeldung] = useState("");
  useEffect(() => { pushStatus().then(setPush); }, []);

  async function an() { const r = await pushAktivieren(); if (r.ok) setPush("an"); setMeldung(r.ok ? "Mitteilungen sind eingeschaltet ✓" : r.fehler); }
  async function aus() {
    const reg = await navigator.serviceWorker.ready; const abo = await reg.pushManager.getSubscription();
    if (abo) await abo.unsubscribe();
    await api("aktion", { aktion: "push_abo_loeschen" }); setPush("aus"); setMeldung("Mitteilungen ausgeschaltet.");
  }

  return (
    <>
      <div className="karte">
        <h2>{sitzung.name}</h2>
        <div className="klein">{sitzung.kolonne || ""}</div>
        <button className="btn hell" onClick={() => oeffne("urlaub")}>🏖️ Urlaub beantragen / meine Anträge</button>
      </div>
      <div className="karte">
        <h2>Mitteilungen (Push)</h2>
        <div className="klein">Status: {push === "an" ? "eingeschaltet" : push === "unmoeglich" ? "nicht unterstützt" : "aus"}</div>
        {meldung && <div className={meldung.includes("✓") ? "erfolg" : "hinweis"}>{meldung}</div>}
        <div className="btn-reihe">
          {push !== "an" && push !== "unmoeglich" && <button className="btn" onClick={an}>Einschalten</button>}
          {push === "an" && <button className="btn hell" onClick={aus}>Ausschalten</button>}
        </div>
      </div>
      <div className="karte">
        <h2>Datenschutz kurz</h2>
        <div className="klein">
          Die App speichert deine Stempelzeiten, Materialstatus, Fotos zur Baustelle und Urlaubsanträge. Es findet keine Standortverfolgung statt.
          Dokumente sieht nur du. Fragen: Büro.
        </div>
      </div>
      <button className="btn hell" onClick={abmelden}>Abmelden</button>
      <div className="klein" style={{ textAlign: "center", marginTop: 14 }}>Baustellen-App · Version 1.0</div>
    </>
  );
}
