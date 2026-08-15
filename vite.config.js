import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // lokale Entwicklung: `vercel dev` auf Port 3000 übernimmt /api
      "/api": "http://localhost:3000",
    },
  },
});
