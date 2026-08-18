# Baustellen-App — Projektwissen

Diese Datei: alles, was ein Modell ohne Vorwissen braucht, um in diesem Repo sicher zu arbeiten. Aufbau und Konventionen sind bewusst identisch zum Schwesterprojekt „Wunschlos Pflege-Portal" (`~/wunschlos-pflege-portal/src/Pflege-app`).

## Was das ist

PWA für einen Baubetrieb (Kalkulation 25 Mitarbeiter): Mitarbeiter sehen Tagesplan (Einsatz, Adresse, Fahrzeug, Ladung), Stempeluhr, Materialliste, Karte mit Fahrzeug-Symbolen, Zeitkonto, Dokumente (Lohn/Stundenzettel), Urlaub. Der Chef arbeitet ausschließlich in Airtable. Benachrichtigungen = Web-Push (kein WhatsApp, kein n8n). Die App ist **mehrsprachig** (Deutsch, Türkisch, Polnisch, Rumänisch, Kroatisch, Arabisch, Russisch, Albanisch) – der Chef schreibt weiter deutsch.

Frontend Vite + React 18 (JS, `src/`), Backend Vercel Serverless Functions (`/api`, ESM), Daten in Airtable, Karte Leaflet/OpenStreetMap, PDFs pdf-lib. Deploy: GitHub → Vercel.

## Architektur-Fakten

- **`api/_lib/airtable.js` ist die zentrale Helfer-Datei** – vor jedem neuen Endpoint lesen. Exporte: `suchen(tabelle, formel, {sortFeld, maxRecords, felder})`, `lesen`, `anlegen`, `aendern` (typecast), `anhangHochladen`, `f()`/`esc()` (Pflicht für JEDEN String in filterByFormula), `recIdOk`, `handledPreflight`, `jsonAntwort`, `bodyLesen`, `sendError` (429→503, sonst generischer 500 + Alarm-Mail), `fehlerMelden`, `alarm` (Resend), `TABELLEN` (Tabellen-NAMEN – die Base wird von `/api/setup` mit genau diesen Namen angelegt).
- **`api/_lib/auth.js`**: `tokenLesen(req, body)` (Header `Authorization: Bearer` bevorzugt, sonst Body/Query), `mitarbeiterAusToken(token)` (nur `Aktiv === true`), `cronErlaubt(req)` (Vercel `CRON_SECRET` Bearer ODER `?secret=SETUP_SECRET` ODER Header `X-Hook-Secret`; fail closed).
- **`api/_lib/push.js`**: `pushAnMitarbeiter(ma, {titel, text, url})` (leert abgelaufene Abos 404/410), `mitarbeiterMitAbo()`.
- **Auth:** `Session_Token` (base64url, 40 Zeichen) am Mitarbeiter-Datensatz. Login = `Anmelde_ID` (90000 + `Personal_Nr`) + `Login_Code` (PIN); 5 Fehlversuche → 15 Min Sperre (`Failed_Attempts`, `Locked_Until`). Login antwortet generisch „Anmeldung fehlgeschlagen" (keine Enumeration).
- **IDOR-Schutz:** jede schreibende Aktion lädt den Datensatz und prüft `Mitarbeiter`/`Zuständig` enthält `ma.id` (`api/aktion.js`). Record-IDs immer mit `recIdOk()` prüfen.
- **Antwortformat:** `{ ok: true, ... }` bzw. `{ ok: false, fehler }`; HTTP 401 = App loggt automatisch aus (`src/api.js`).
- **Push-Freigabe:** Dokumente/Mitteilungen gehen nur raus, wenn `Push_senden = "Senden"` (System stellt auf „Gesendet"). Dokument-Push ist immer neutral („Ein neues Dokument liegt bereit").
- **Airtable-Attachment-URLs laufen nach ~2 h ab** → Downloads laufen über `/api/dokument-download` (Eigentumsprüfung + Host-Allowlist), nie die rohe URL an den Client.
- **Crons (`vercel.json`):** Hobby-Plan = max. 1×/Tag, ±59 Min Genauigkeit → nur `einsatz-push` (17:30) + `stundenzettel` (1. des Monats). `vercel.pro.json` = Variante für Pro (Stempel-Erinnerung, Dokument-Push alle 10 Min). Auf Hobby: `dokument-push` per Airtable-Automation (Webhook mit `?secret=`) oder von Hand auslösen.
- **`/api/setup?secret=…&demo=1`** legt die komplette Base an (10 Tabellen) – idempotent. Feldnamen sind die Schnittstelle: Umbenennen ⇒ Code anpassen. Bei einer bestehenden Base rüstet ein erneuter Aufruf neue Felder nach (aktuell `Mitarbeiter.Sprache`).
- **Mehrsprachigkeit (react-i18next):** `src/i18n.js` initialisiert i18next mit `src/locales/{de,tr,pl,ro,hr,ar,ru,sq}.json` (eine Datei je Sprache, `de.json` ist die Quelle). Komponenten holen Texte mit `const { t } = useTranslation()`; außerhalb von React `i18n.t(...)`. Sprachwahl = `src/teile/SprachWahl.jsx` (Sprachname in Eigenschreibweise, keine Flaggen) im Login und unter „Mehr“. Gespeichert wird in `localStorage` (`baustelle_sprache`) **und** im Airtable-Profil (Feld `Sprache`, deutsche Auswahlwerte „Türkisch“ …, Aktion `sprache_setzen`); Login liefert `sprache`. Regel: Wahl auf dem Login-Screen gewinnt und wandert ins Profil; sonst wird die Profil-Sprache übernommen (neues Handy, Büro-Vorbelegung); sonst bleibt Geräte-/Browser-Sprache (Fallback Deutsch). Unter „Mehr“ gewählte Sprache wird immer ins Profil geschrieben. Arabisch schaltet `<html dir="rtl">` (CSS nutzt logische Eigenschaften `margin-inline-*`, `text-align: end`). Datum/Uhrzeit über `locale()` aus `i18n.js`, Uhrzeit immer 24 h.
- **Airtable-Werte übersetzen, nicht ändern:** Auswahlwerte (Status „Vor Ort“, Material „Besorgt“, Urlaubsart …) bleiben in Airtable und in den Server-Whitelists deutsch; die App zeigt sie über `wert(v)` (`werte.*` in den JSONs, unbekannte Werte unverändert). Freitext des Büros (Aufgabe, Ladung, Mitteilungen) wird nicht übersetzt (Ausbaustufe: DeepL-API).
- **Server-Fehler mehrsprachig:** Fehlerantworten tragen zusätzlich `code` (`login_fehlgeschlagen`, `gesperrt`, `sitzung_abgelaufen`, `kein_zugriff`, `foto_zu_gross`, `bereits_beendet`, `zeitraum_ungueltig`, `push_abo_ungueltig`, `ungueltig`, `kurz_erneut`, `intern`); `src/api.js` übersetzt sie (`server.*`), der deutsche `fehler`-Text bleibt Fallback. Neue Fehler ⇒ Code vergeben + in alle 8 JSONs eintragen.
- **Push-Texte** kommen in der Sprache des Empfängers: `api/_lib/sprachen.js` (`pushText(ma, "einsatz.beginn", { zeit })`, `spracheVon(ma)`, `sprachName(code)`, `SPRACHEN`). Neue Push-Texte dort in allen Sprachen ergänzen (Test prüft Vollständigkeit).

## Konventionen

- Kommentare, Commit-Messages, Schlüssel: **Deutsch**. Bezeichner im Code deutsch (Projektstil), Feldnamen exakt wie in Airtable (`Für_Datum`, `Zuständig`, `Push_senden`).
- **Kein UI-Text im JSX/JS hart codieren** – immer `t("bereich.schluessel")`; neuen Schlüssel zuerst in `src/locales/de.json`, dann in allen anderen 7 Dateien ergänzen (Pluralformen: `_one/_other`, plus `_few/_many` (pl, ru), `_few` (ro, hr), `_zero/_two/_few/_many` (ar) – `node test/sprachen-pruefen.mjs` meldet fehlende Formen). Möglichst icon-lastig und kurz formulieren (weniger Text = weniger Übersetzung, weniger Fehlbedienung).
- Neue Endpoints nach dem Muster in `api/aktion.js`: `handledPreflight` → Methode prüfen → `mitarbeiterAusToken` → Input validieren (Whitelist/Regex/Längen) → Eigentum prüfen → schreiben → `sendError` im Catch.
- Keine neuen npm-Dependencies, wenn Stdlib/vorhandene es können.
- Airtable-Schreibzugriffe mit `typecast: true`; Select-Werte nur aus definierten Whitelists.
- Fotos: App verkleinert auf 1600 px/JPEG 0.8, Server-Limit 4,5 MB Base64.
- Test-Gate vor jeder Auslieferung: `npm run build` grün **und** `node test/run.mjs` „Alle Tests bestanden" (Mock-Airtable in `test/mock-airtable.mjs`) **und** `node test/sprachen-pruefen.mjs` „Sprachdateien vollständig".

## No-Gos

- Keine Airtable-Fehlerdetails an den Client (immer `sendError`).
- Keine PIN/Token/Push-Abos in Antworten oder Logs; keine echten Mitarbeiterdaten in Chat/Prompts – Beispieldaten sind fiktiv („Max Beispiel").
- Kein Polling/Minuten-Scheduler auf Hobby; ereignisgesteuert (Airtable-Automation → HTTP → `/api/...`).
- `Aktiv`-Prüfung immer `!== true` (Airtable liefert leere Checkbox als `undefined`, nicht `false`).
- Vercel Root Directory leer lassen; Env-Variablen nur serverseitig (`VITE_VAPID_PUBLIC_KEY` ist der einzige öffentliche Wert).

## Nützliche Kommandos

```bash
npm install
npm run build                       # Vite-Build (dist/)
node test/mock-airtable.mjs &       # Mock auf :4010
node test/run.mjs                   # 32 Backend-Tests (inkl. Sprache/Push-Texte)
node test/sprachen-pruefen.mjs      # Sprachdateien: Schlüssel, Platzhalter, Pluralformen
node test/screenshots.mjs           # Playwright-Durchlauf (Screenshots nach test/, inkl. tr/ar-Login, RTL)
npx vercel dev                      # lokal mit echten Env (.env aus .env.example)
```
