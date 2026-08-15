import React, { useEffect, useState } from "react";
import { api, datumSchoen, zeitSchoen, minutenSchoen } from "../api.js";

export default function Zeitkonto() {
  const [d, setD] = useState(null);
  const [fehler, setFehler] = useState("");
  useEffect(() => { api("daten", { bereich: "zeitkonto" }).then((r) => (r.ok ? setD(r) : setFehler(r.fehler))); }, []);

  const eintraege = d?.zeit || [];
  const min = (z) => z.Dauer_Minuten ?? (z.Start && z.Ende ? Math.round((new Date(z.Ende) - new Date(z.Start)) / 60000) - (z.Pause_Minuten || 0) : null);
  const ist = eintraege.reduce((s, z) => s + (min(z) || 0), 0);

  // Soll: Wochenstunden / 5 × Arbeitstage bis heute im Monat
  const heute = new Date();
  let arbeitstage = 0;
  for (let t = 1; t <= heute.getDate(); t++) { const w = new Date(heute.getFullYear(), heute.getMonth(), t).getDay(); if (w >= 1 && w <= 5) arbeitstage++; }
  const soll = d?.sollWochenstunden ? Math.round((d.sollWochenstunden / 5) * arbeitstage * 60) : null;

  return (
    <>
      {fehler && <div className="fehler">{fehler}</div>}
      <div className="karte">
        <h2>Zeitkonto {heute.toLocaleDateString("de-DE", { month: "long", year: "numeric" })}</h2>
        <div className="stat-reihe">
          <div className="stat"><div className="wert">{minutenSchoen(ist)}</div><div className="lbl">Ist bis heute</div></div>
          <div className="stat"><div className="wert">{soll != null ? minutenSchoen(soll) : "–"}</div><div className="lbl">Soll bis heute</div></div>
          <div className="stat"><div className="wert" style={{ color: soll != null && ist - soll < 0 ? "#a02b2b" : "#187a45" }}>{soll != null ? (ist - soll >= 0 ? "+" : "−") + minutenSchoen(Math.abs(ist - soll)) : "–"}</div><div className="lbl">Saldo</div></div>
        </div>
        <div className="klein" style={{ marginTop: 8 }}>Urlaubsanspruch: {d?.urlaubsanspruch ?? "–"} Tage/Jahr · Genehmigte Tage siehe „Mehr → Urlaub“. Verbindlich ist die Lohnabrechnung.</div>
      </div>
      <div className="karte">
        <h2>Meine Zeiten</h2>
        {!d && <div className="laden">Lade…</div>}
        {d && eintraege.length === 0 && <div className="leer">Noch keine Zeiten in diesem Monat.</div>}
        {eintraege.length > 0 && (
          <table className="zeit"><tbody>
            {eintraege.map((z) => (
              <tr key={z.id}>
                <td>{datumSchoen(z.Start)}<div className="klein">{zeitSchoen(z.Start)}–{z.Ende ? zeitSchoen(z.Ende) : "läuft"}{z.Pause_Minuten ? ` · Pause ${z.Pause_Minuten} min` : ""}{z.Art && z.Art !== "Arbeit" ? ` · ${z.Art}` : ""}</div></td>
                <td>{z.Ende ? minutenSchoen(min(z)) : "…"}</td>
              </tr>
            ))}
          </tbody></table>
        )}
        <div className="klein" style={{ marginTop: 8 }}>Fehlt etwas? Bitte im Büro melden – Nachträge werden dort mit Vermerk eingetragen.</div>
      </div>
    </>
  );
}
