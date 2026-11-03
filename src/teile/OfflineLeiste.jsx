import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { zustand, senden, fehlerQuittieren } from "../warteschlange.js";

const ART = { stempel_start: "stempel", stempel_ende: "stempel", foto_doku: "foto", material_status: "material", material_anfordern: "material", tagesbericht: "bericht" };

/**
 * Hinweisleiste oben: kein Netz / Einträge warten / etwas konnte nicht gesendet werden.
 * Bewusst einfach: ein Satz, ein Symbol – die App sendet von selbst weiter.
 */
export default function OfflineLeiste() {
  const { t } = useTranslation();
  const [online, setOnline] = useState(navigator.onLine !== false);
  const [z, setZ] = useState({ anzahl: 0, fehlgeschlagen: [] });

  useEffect(() => {
    const an = () => setOnline(true), aus = () => setOnline(false);
    const neu = (e) => setZ(e.detail || { anzahl: 0, fehlgeschlagen: [] });
    window.addEventListener("online", an); window.addEventListener("offline", aus);
    window.addEventListener("warteschlange", neu);
    zustand().then(setZ);
    return () => { window.removeEventListener("online", an); window.removeEventListener("offline", aus); window.removeEventListener("warteschlange", neu); };
  }, []);

  const fehl = z.fehlgeschlagen[0];
  return (
    <>
      {(!online || z.anzahl > 0) && (
        <div className={"offline-leiste" + (online ? "" : " aus")} role="status">
          <span className="ol-ico" aria-hidden="true">{online ? "⏳" : "📵"}</span>
          <span className="ol-text">
            {!online && <>{t("offline.keinNetz")} </>}
            {z.anzahl > 0 && t("offline.wartet", { count: z.anzahl })}
          </span>
          {online && z.anzahl > 0 && <button className="mini" onClick={() => senden()}>{t("offline.jetztSenden")}</button>}
        </div>
      )}
      {fehl && (
        <div className="fehler" role="alert">
          ⚠️ {t(`offline.${ART[fehl.aktion] || "eintrag"}`)}: {t("offline.fehlgeschlagen", { text: fehl.fehler })}
          <button className="mini" style={{ marginInlineStart: 8 }} onClick={() => fehlerQuittieren(fehl.cid)}>{t("offline.ok")}</button>
        </div>
      )}
    </>
  );
}
