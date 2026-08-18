import React from "react";
import { useTranslation } from "react-i18next";
import { SPRACHEN, spracheSetzen } from "../i18n.js";

/**
 * Sprachwahl als Buttons mit dem Sprachnamen in der jeweiligen Sprache
 * („Deutsch · Türkçe · Polski …“) – eindeutiger als Flaggen.
 * onWahl(code) wird zusätzlich aufgerufen (z. B. um die Wahl ins Airtable-Profil zu schreiben).
 */
export default function SprachWahl({ onWahl, kompakt = false }) {
  const { i18n } = useTranslation();
  return (
    <div className={"sprachen" + (kompakt ? " kompakt" : "")} role="group" aria-label="Sprache / Language">
      {SPRACHEN.map((s) => (
        <button
          key={s.code}
          type="button"
          lang={s.code}
          dir={s.rtl ? "rtl" : "ltr"}
          className={"sprache" + (i18n.language === s.code ? " aktiv" : "")}
          aria-pressed={i18n.language === s.code}
          onClick={() => { spracheSetzen(s.code); onWahl && onWahl(s.code); }}
        >
          {s.name}
        </button>
      ))}
    </div>
  );
}
