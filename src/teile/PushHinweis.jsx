import React, { useEffect, useState } from "react";
import { pushAktivieren, pushStatus, istIosOhneInstallation } from "../push.js";

export default function PushHinweis() {
  const [status, setStatus] = useState("laden");
  const [meldung, setMeldung] = useState("");
  const [weg, setWeg] = useState(() => sessionStorage.getItem("push_hinweis_weg") === "1");

  useEffect(() => { pushStatus().then(setStatus); }, []);
  if (weg || status === "an" || status === "laden") return null;

  async function aktivieren() {
    const r = await pushAktivieren();
    if (r.ok) { setStatus("an"); setMeldung(""); } else setMeldung(r.fehler);
  }

  return (
    <div className="hinweis">
      <b>Mitteilungen einschalten</b> – dann bekommst du Einsätze, Materiallisten und Dokumente direkt aufs Handy.
      {istIosOhneInstallation() && <div className="klein" style={{ marginTop: 6 }}>iPhone: zuerst unten „Teilen“ → „Zum Home-Bildschirm“ und die App von dort öffnen.</div>}
      {status === "unmoeglich" && <div className="klein" style={{ marginTop: 6 }}>Dieser Browser unterstützt keine Push-Nachrichten.</div>}
      {meldung && <div className="klein" style={{ marginTop: 6, color: "#a02b2b" }}>{meldung}</div>}
      <div className="btn-reihe">
        {status !== "unmoeglich" && <button className="btn klein-btn" onClick={aktivieren}>Jetzt einschalten</button>}
        <button className="btn hell klein-btn" onClick={() => { sessionStorage.setItem("push_hinweis_weg", "1"); setWeg(true); }}>Später</button>
      </div>
    </div>
  );
}
