import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, dokumentUrl, monatSchoen } from "../api.js";
import { wert } from "../i18n.js";

/** Rendert alle Seiten des PDFs als Canvas – iframes zeigen auf iOS nur die erste Seite. */
function PdfAnsicht({ url }) {
  const { t } = useTranslation();
  const behRef = useRef(null);
  const [status, setStatus] = useState("laedt"); // laedt | ok | fehler
  useEffect(() => {
    let aktiv = true;
    const beh = behRef.current;
    beh.innerHTML = "";
    (async () => {
      try {
        // pdf.js erst hier nachladen (~450 KB) – nicht jeder App-Start braucht den Viewer
        const [pdfjs, worker] = await Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]);
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        const pdf = await pdfjs.getDocument({ url }).promise;
        const breite = beh.clientWidth || 360;
        const dpr = Math.min(window.devicePixelRatio || 1, 3);
        for (let n = 1; n <= pdf.numPages; n++) {
          if (!aktiv) return;
          const seite = await pdf.getPage(n);
          const roh = seite.getViewport({ scale: 1 });
          const vp = seite.getViewport({ scale: (breite / roh.width) * dpr });
          const canvas = document.createElement("canvas");
          canvas.width = vp.width; canvas.height = vp.height;
          canvas.className = "pdf-seite";
          beh.appendChild(canvas);
          await seite.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
        }
        if (aktiv) setStatus("ok");
      } catch { if (aktiv) setStatus("fehler"); }
    })();
    return () => { aktiv = false; };
  }, [url]);
  return (
    <div className="dok-viewer-inhalt">
      {status === "laedt" && <div className="laden">{t("allgemein.laden")}</div>}
      {status === "fehler" && <div className="fehler">{t("server.serverfehler")}</div>}
      <div ref={behRef} />
    </div>
  );
}

export default function Dokumente() {
  const { t } = useTranslation();
  const [liste, setListe] = useState(null);
  const [fehler, setFehler] = useState("");
  const [offen, setOffen] = useState(null); // { link, titel } – Dokument im In-App-Viewer
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
            const titel = d.Titel || wert(d.Typ);
            return (
              <div className="dok" key={d.id}>
                <div>
                  <div style={{ fontWeight: d.Vom_Mitarbeiter_Gesehen ? 600 : 800 }}>{!d.Vom_Mitarbeiter_Gesehen && (hatDatei || d.Drive_Link) ? "● " : ""}{titel}</div>
                  <div className="klein">{wert(d.Typ)}{d.Monat ? ` · ${monat(d.Monat)}` : ""}</div>
                </div>
                {hatDatei
                  ? <button className="btn hell klein-btn" onClick={() => { setOffen({ link: dokumentUrl(d.id), titel }); gesehen(d); }}>{t("dokumente.oeffnen")}</button>
                  : d.Drive_Link
                    ? <a className="btn hell klein-btn" style={{ display: "grid", placeItems: "center" }} href={d.Drive_Link} target="_blank" rel="noreferrer" onClick={() => gesehen(d)}>{t("dokumente.oeffnen")}</a>
                    : <span className="chip">{t("dokumente.inVorbereitung")}</span>}
              </div>
            );
          })}
        </div>
      </div>
      {/* Eigene Dateien im Vollbild-Viewer: Zurück-Pfeil führt zur Dokumente-Seite,
          rechts lädt ⬇ die Datei herunter. Drive-Links bleiben extern (Google blockt Einbetten). */}
      {offen && (
        <div className="dok-viewer">
          <div className="dok-viewer-kopf">
            <button className="kopf-zurueck" aria-label={t("allgemein.zurueck")} onClick={() => setOffen(null)}>←</button>
            <div className="dok-viewer-titel">{offen.titel}</div>
            <a className="kopf-zurueck dok-laden" href={offen.link} download aria-label={t("dokumente.herunterladen")} title={t("dokumente.herunterladen")}>⬇</a>
          </div>
          <PdfAnsicht url={offen.link} />
        </div>
      )}
    </>
  );
}
