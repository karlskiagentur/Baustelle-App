import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, dokumentUrl, monatSchoen } from "../api.js";
import { wert } from "../i18n.js";

export default function Dokumente() {
  const { t } = useTranslation();
  const [liste, setListe] = useState(null);
  const [fehler, setFehler] = useState("");
  useEffect(() => { api("daten", { bereich: "dokumente" }).then((r) => (r.ok ? setListe(r.dokumente) : setFehler(r.fehler))); }, []);

  const monat = (iso) => (iso ? monatSchoen(new Date(iso + "T00:00:00")) : "");
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
        <h2>{t("dokumente.titel")} {neue > 0 && <span className="chip bad">{t("dokumente.neu", { count: neue })}</span>}</h2>
        <div className="klein">{t("dokumente.info")}</div>
        {!liste && <div className="laden">{t("allgemein.laden")}</div>}
        {liste && liste.length === 0 && <div className="leer">{t("dokumente.keine")}</div>}
        <div style={{ marginTop: 8 }}>
          {(liste || []).map((d) => {
            const hatDatei = Array.isArray(d.Datei) && d.Datei.length > 0;
            const link = hatDatei ? dokumentUrl(d.id) : d.Drive_Link || null;
            return (
              <div className="dok" key={d.id}>
                <div>
                  <div style={{ fontWeight: d.Vom_Mitarbeiter_Gesehen ? 600 : 800 }}>{!d.Vom_Mitarbeiter_Gesehen && link ? "● " : ""}{d.Titel || wert(d.Typ)}</div>
                  <div className="klein">{wert(d.Typ)}{d.Monat ? ` · ${monat(d.Monat)}` : ""}</div>
                </div>
                {link
                  ? <a className="btn hell klein-btn" style={{ display: "grid", placeItems: "center" }} href={link} target="_blank" rel="noreferrer" onClick={() => gesehen(d)}>{t("dokumente.oeffnen")}</a>
                  : <span className="chip">{t("dokumente.inVorbereitung")}</span>}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
