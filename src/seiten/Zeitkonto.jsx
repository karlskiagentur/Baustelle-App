import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, datumSchoen, zeitSchoen, minutenSchoen, monatSchoen } from "../api.js";
import { wert } from "../i18n.js";

export default function Zeitkonto() {
  const { t } = useTranslation();
  const [d, setD] = useState(null);
  const [fehler, setFehler] = useState("");
  useEffect(() => { api("daten", { bereich: "zeitkonto" }).then((r) => (r.ok ? setD(r) : setFehler(r.fehler))); }, []);

  const eintraege = d?.zeit || [];
  const min = (z) => z.Dauer_Minuten ?? (z.Start && z.Ende ? Math.round((new Date(z.Ende) - new Date(z.Start)) / 60000) - (z.Pause_Minuten || 0) : null);
  const ist = eintraege.reduce((s, z) => s + (min(z) || 0), 0);

  // Soll: Wochenstunden / 5 × Arbeitstage bis heute im Monat
  const heute = new Date();
  let arbeitstage = 0;
  for (let tag = 1; tag <= heute.getDate(); tag++) { const w = new Date(heute.getFullYear(), heute.getMonth(), tag).getDay(); if (w >= 1 && w <= 5) arbeitstage++; }
  const soll = d?.sollWochenstunden ? Math.round((d.sollWochenstunden / 5) * arbeitstage * 60) : null;
  const kein = t("allgemein.keinWert");

  return (
    <>
      {fehler && <div className="fehler">{fehler}</div>}
      <div className="karte">
        <h2>{t("zeit.titel", { monat: monatSchoen(heute) })}</h2>
        <div className="stat-reihe">
          <div className="stat"><div className="wert">{minutenSchoen(ist)}</div><div className="lbl">{t("zeit.istBisHeute")}</div></div>
          <div className="stat"><div className="wert">{soll != null ? minutenSchoen(soll) : kein}</div><div className="lbl">{t("zeit.sollBisHeute")}</div></div>
          <div className="stat"><div className="wert" style={{ color: soll != null && ist - soll < 0 ? "#a02b2b" : "#187a45" }}>{soll != null ? (ist - soll >= 0 ? "+" : "−") + minutenSchoen(Math.abs(ist - soll)) : kein}</div><div className="lbl">{t("zeit.saldo")}</div></div>
        </div>
        <div className="klein" style={{ marginTop: 8 }}>{t("zeit.urlaubInfo", { tage: d?.urlaubsanspruch ?? kein })}</div>
      </div>
      <div className="karte">
        <h2>{t("zeit.meineZeiten")}</h2>
        {!d && <div className="laden">{t("allgemein.laden")}</div>}
        {d && eintraege.length === 0 && <div className="leer">{t("zeit.keineZeiten")}</div>}
        {eintraege.length > 0 && (
          <table className="zeit"><tbody>
            {eintraege.map((z) => (
              <tr key={z.id}>
                <td>{datumSchoen(z.Start)}<div className="klein">{zeitSchoen(z.Start)}–{z.Ende ? zeitSchoen(z.Ende) : t("zeit.laeuft")}{z.Pause_Minuten ? ` · ${t("zeit.pause", { min: z.Pause_Minuten })}` : ""}{z.Art && z.Art !== "Arbeit" ? ` · ${wert(z.Art)}` : ""}</div></td>
                <td>{z.Ende ? minutenSchoen(min(z)) : "…"}</td>
              </tr>
            ))}
          </tbody></table>
        )}
        <div className="klein" style={{ marginTop: 8 }}>{t("zeit.fehltEtwas")}</div>
      </div>
    </>
  );
}
