import React from "react";
import { createRoot } from "react-dom/client";
import "./i18n.js"; // vor App laden: setzt Sprache, <html lang> und Schreibrichtung
import App from "./App.jsx";
import "./styles.css";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js"));
}

createRoot(document.getElementById("root")).render(<App />);
