import React, { useEffect, useState } from "react";
import { api, dokumentUrl } from "../api.js";

export default function Dokumente() {
  const [liste, setListe] = useState(null);
  const [fehler, setFehler] = useState("");
  useEffect(() => { api("daten", { bereich: "dokumente" }).then((r) => (r.ok ? setListe(r.dokumente) : setFehler(r.fehler))); }, []);

  const monat = (iso) => (iso ? new Date(iso + "T00:00:00").toLocaleDateString("de-DE", { month: "long", year: "numeric" }) : "");
  const gesehen = (d) => {
    if (d.Vom_Mitarbeiter_Gesehen) return;
    setListe((l) => l.map((x) => (x.id === d.id ? { ...x, Vom_Mitarbeiter_Gesehen: true } : x)));
    api("aktion", { aktion: "dokument_gesehen", daten: { dokumentId: d.id } });
  };
  const neue = (liste || []).filter((d) => !d.Vom_Mitarbeiter_Gesehen && (d.Datei || d.Drive_Link)).length;

  return (
    <>
      {fehler && <div className="fehler">{fehler}</div>}
      <div className="karte">
        <h2>Meine Dokumente {neue > 0 && <span className="chip bad">{neue} neu</span>}</h2>
        <div className="klein">Lohnabrechnungen und Stundenzettel – nur du siehst diese Dateien.</div>
        {!liste && <div className="laden">Lade…</div>}
        {liste && liste.length === 0 && <div className="leer">Noch keine Dokumente.</div>}
        <div style={{ marginTop: 8 }}>
          {(liste || []).map((d) => {
            const hatDatei = Array.isArray(d.Datei) && d.Datei.length > 0;
            const link = hatDatei ? dokumentUrl(d.id) : d.Drive_Link || null;
            return (
              <div className="dok" key={d.id}>
                <div>
                  <div style={{ fontWeight: d.Vom_Mitarbeiter_Gesehen ? 600 : 800 }}>{!d.Vom_Mitarbeiter_Gesehen && link ? "● " : ""}{d.Titel || d.Typ}</div>
                  <div className="klein">{d.Typ}{d.Monat ? ` · ${monat(d.Monat)}` : ""}</div>
                </div>
                {link
                  ? <a className="btn hell klein-btn" style={{ display: "grid", placeItems: "center" }} href={link} target="_blank" rel="noreferrer" onClick={() => gesehen(d)}>Öffnen</a>
                  : <span className="chip">in Vorbereitung</span>}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
