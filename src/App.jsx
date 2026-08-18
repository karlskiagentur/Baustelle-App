import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { sitzung, sitzungSetzen } from "./api.js";
import Login from "./seiten/Login.jsx";
import Heute from "./seiten/Heute.jsx";
import Material from "./seiten/Material.jsx";
import Karte from "./seiten/Karte.jsx";
import Zeitkonto from "./seiten/Zeitkonto.jsx";
import Dokumente from "./seiten/Dokumente.jsx";
import Urlaub from "./seiten/Urlaub.jsx";
import Mehr from "./seiten/Mehr.jsx";

// Icon-lastig: das Symbol ist auf der Baustelle schneller erfasst als der Text darunter.
const SEITEN = [
  { key: "heute", label: "nav.heute", ico: "🏗️", comp: Heute },
  { key: "material", label: "nav.material", ico: "🛒", comp: Material },
  { key: "karte", label: "nav.karte", ico: "🗺️", comp: Karte },
  { key: "zeit", label: "nav.zeit", ico: "⏱️", comp: Zeitkonto },
  { key: "dokumente", label: "nav.dokumente", ico: "📄", comp: Dokumente },
  { key: "mehr", label: "nav.mehr", ico: "☰", comp: Mehr },
];

export default function App() {
  const { t } = useTranslation();
  const [s, setS] = useState(sitzung());
  const [seite, setSeite] = useState("heute");
  const [unter, setUnter] = useState(null); // z. B. "urlaub" unter "mehr"

  useEffect(() => {
    const raus = () => setS(null);
    window.addEventListener("baustelle-abgemeldet", raus);
    return () => window.removeEventListener("baustelle-abgemeldet", raus);
  }, []);

  if (!s) return <Login onLogin={(neu) => { sitzungSetzen(neu); setS(neu); }} />;

  const abmelden = () => { sitzungSetzen(null); setS(null); };
  const aktiv = SEITEN.find((x) => x.key === seite) || SEITEN[0];
  const Comp = unter === "urlaub" ? Urlaub : aktiv.comp;

  return (
    <div className="app">
      <header className="kopf">
        <div>
          <h1>{unter === "urlaub" ? t("nav.urlaub") : t(aktiv.label)}</h1>
          <div className="sub">{s.name}{s.kolonne ? ` · ${s.kolonne}` : ""}</div>
        </div>
        {unter && <button className="btn hell klein-btn" onClick={() => setUnter(null)}>{t("allgemein.zurueck")}</button>}
      </header>
      <main className="inhalt">
        <Comp sitzung={s} abmelden={abmelden} oeffne={(k) => { setUnter(k); }} />
      </main>
      <nav className="nav">
        {SEITEN.map((x) => (
          <button key={x.key} className={seite === x.key && !unter ? "aktiv" : ""} onClick={() => { setSeite(x.key); setUnter(null); }}>
            <span className="ico">{x.ico}</span>{t(x.label)}
          </button>
        ))}
      </nav>
    </div>
  );
}
