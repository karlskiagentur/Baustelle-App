import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { pushAktivieren, pushStatus, istIosOhneInstallation } from "../push.js";

export default function PushHinweis() {
  const { t } = useTranslation();
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
      <b>{t("push.hinweisTitel")}</b> {t("push.hinweisText")}
      {istIosOhneInstallation() && <div className="klein" style={{ marginTop: 6 }}>{t("push.iphone")}</div>}
      {status === "unmoeglich" && <div className="klein" style={{ marginTop: 6 }}>{t("push.browserNein")}</div>}
      {meldung && <div className="klein" style={{ marginTop: 6, color: "#a02b2b" }}>{meldung}</div>}
      <div className="btn-reihe">
        {/* Unwählbar statt versteckt, wenn Push hier nicht funktionieren kann (Browser ohne Push bzw. iPhone ohne Installation) */}
        <button className="btn klein-btn" disabled={status === "unmoeglich" || istIosOhneInstallation()} onClick={aktivieren}>{t("push.jetzt")}</button>
        <button className="btn hell klein-btn" onClick={() => { sessionStorage.setItem("push_hinweis_weg", "1"); setWeg(true); }}>{t("push.spaeter")}</button>
      </div>
    </div>
  );
}
