import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

// Offline-Start: Liste aller gebauten Dateien + Version in den Service Worker schreiben
// (ersetzt "__SW_DATEIEN__"/"__SW_VERSION__" in dist/sw.js – ohne Zusatzpaket wie Workbox).
function swDateien() {
  let outDir = "dist";
  let dateien = [];
  return {
    name: "sw-dateien",
    apply: "build",
    configResolved(c) { outDir = c.build.outDir; },
    generateBundle(_, bundle) {
      dateien = Object.keys(bundle).filter((f) => !f.endsWith(".map") && !f.endsWith(".html")).map((f) => "/" + f);
    },
    closeBundle() {
      const swPfad = path.join(outDir, "sw.js");
      if (!fs.existsSync(swPfad)) { this.warn("dist/sw.js fehlt – Offline-Start nicht eingerichtet"); return; }
      const liste = [...new Set([...dateien, "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"])].sort();
      const version = crypto.createHash("sha256").update(liste.join("|")).digest("hex").slice(0, 12);
      const sw = fs.readFileSync(swPfad, "utf8").replace('"__SW_DATEIEN__"', JSON.stringify(liste)).replace("__SW_VERSION__", version);
      fs.writeFileSync(swPfad, sw);
    },
  };
}

export default defineConfig({
  plugins: [react(), swDateien()],
  server: {
    proxy: {
      // lokale Entwicklung: `vercel dev` auf Port 3000 übernimmt /api
      "/api": "http://localhost:3000",
    },
  },
});
