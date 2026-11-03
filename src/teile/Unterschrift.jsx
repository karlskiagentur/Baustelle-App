import React, { useEffect, useRef } from "react";

// Unterschriftsfeld (Vorbild: Pflege-App): mit dem Finger zeichnen, scharf auf jedem Display
// (Pixeldichte berücksichtigt), liefert ein auf die Zeichnung zugeschnittenes PNG – oder null, wenn leer.
function zuschneiden(canvas) {
  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;
  const px = ctx.getImageData(0, 0, width, height).data;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (px[(y * width + x) * 4 + 3] > 10) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  const rand = 10;
  minX = Math.max(0, minX - rand); minY = Math.max(0, minY - rand);
  maxX = Math.min(width, maxX + rand); maxY = Math.min(height, maxY + rand);
  // auf max. 900 px Breite verkleinern (kleine Datei, reicht fürs PDF)
  const f = Math.min(1, 900 / (maxX - minX));
  const out = document.createElement("canvas");
  out.width = Math.round((maxX - minX) * f); out.height = Math.round((maxY - minY) * f);
  out.getContext("2d").drawImage(canvas, minX, minY, maxX - minX, maxY - minY, 0, 0, out.width, out.height);
  return out.toDataURL("image/png");
}

export default function Unterschrift({ onChange, loeschenRef, beschriftung }) {
  const ref = useRef(null);
  const zeichnet = useRef(false);
  const hatStrich = useRef(false);
  const letzter = useRef(null);

  useEffect(() => {
    const c = ref.current;
    const groesse = () => {
      const r = c.getBoundingClientRect();
      const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
      c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr);
      const ctx = c.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineWidth = 2.6; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#111";
      if (hatStrich.current) { hatStrich.current = false; onChange(null); } // Drehen löscht die Zeichnung
    };
    groesse();
    window.addEventListener("resize", groesse);
    return () => window.removeEventListener("resize", groesse);
  }, []);

  const punkt = (e) => { const r = ref.current.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const runter = (e) => {
    e.preventDefault();
    ref.current.setPointerCapture?.(e.pointerId);
    zeichnet.current = true;
    letzter.current = punkt(e);
    const ctx = ref.current.getContext("2d");
    ctx.beginPath(); ctx.arc(letzter.current.x, letzter.current.y, 1.2, 0, Math.PI * 2); ctx.fillStyle = "#111"; ctx.fill(); // Punkt
    hatStrich.current = true;
  };
  const ziehen = (e) => {
    if (!zeichnet.current) return;
    e.preventDefault();
    const p = punkt(e), ctx = ref.current.getContext("2d");
    ctx.beginPath(); ctx.moveTo(letzter.current.x, letzter.current.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    letzter.current = p;
  };
  const hoch = () => {
    if (!zeichnet.current) return;
    zeichnet.current = false;
    if (hatStrich.current) onChange(zuschneiden(ref.current));
  };
  const loeschen = () => {
    const c = ref.current;
    c.getContext("2d").clearRect(0, 0, c.width, c.height);
    hatStrich.current = false;
    onChange(null);
  };
  if (loeschenRef) loeschenRef.current = loeschen;

  return (
    <canvas ref={ref} className="unterschrift-feld" aria-label={beschriftung}
      onPointerDown={runter} onPointerMove={ziehen} onPointerUp={hoch} onPointerCancel={hoch} onPointerLeave={hoch} />
  );
}
