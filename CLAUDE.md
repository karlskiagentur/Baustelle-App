# Baustellen-App — Projektwissen

Diese Datei: alles, was ein Modell ohne Vorwissen braucht, um in diesem Repo sicher zu arbeiten. Aufbau und Konventionen sind bewusst identisch zum Schwesterprojekt „Wunschlos Pflege-Portal" (`~/wunschlos-pflege-portal/src/Pflege-app`).

## Was das ist

PWA für einen Baubetrieb (Kalkulation 25 Mitarbeiter): Mitarbeiter sehen Tagesplan (Einsatz, Adresse, Fahrzeug, Ladung), Stempeluhr, Materialliste, Karte mit Fahrzeug-Symbolen, Zeitkonto, Dokumente (Lohn/Stundenzettel), Urlaub. Der Chef arbeitet ausschließlich in Airtable. Benachrichtigungen = Web-Push (kein WhatsApp, kein n8n).

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
- **`/api/setup?secret=…&demo=1`** legt die komplette Base an (10 Tabellen) – idempotent. Feldnamen sind die Schnittstelle: Umbenennen ⇒ Code anpassen.

## Konventionen

- UI-Texte, Kommentare, Commit-Messages: **Deutsch**. Bezeichner im Code deutsch (Projektstil), Feldnamen exakt wie in Airtable (`Für_Datum`, `Zuständig`, `Push_senden`).
- Neue Endpoints nach dem Muster in `api/aktion.js`: `handledPreflight` → Methode prüfen → `mitarbeiterAusToken` → Input validieren (Whitelist/Regex/Längen) → Eigentum prüfen → schreiben → `sendError` im Catch.
- Keine neuen npm-Dependencies, wenn Stdlib/vorhandene es können.
- Airtable-Schreibzugriffe mit `typecast: true`; Select-Werte nur aus definierten Whitelists.
- Fotos: App verkleinert auf 1600 px/JPEG 0.8, Server-Limit 4,5 MB Base64.
- Test-Gate vor jeder Auslieferung: `npm run build` grün **und** `node test/run.mjs` „Alle Tests bestanden" (Mock-Airtable in `test/mock-airtable.mjs`).

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
node test/run.mjs                   # 26 Backend-Tests
node test/screenshots.mjs           # Playwright-Durchlauf (Screenshots nach test/)
npx vercel dev                      # lokal mit echten Env (.env aus .env.example)
```
