# Baustellen-App

Eigene Mitarbeiter-App (React-PWA) + Backend als Vercel Functions + Airtable als Datenzentrale + kostenlose Web-Push-Nachrichten.
**Kein n8n, kein WhatsApp, kein App Store.** Aufbau und Sicherheitskonventionen identisch zum Wunschlos-Pflege-Portal
(Login mit 5-stelliger ID + PIN, Session-Token, IDOR-Schutz, generische Fehler + Alarm-Mail). Projektwissen für Claude Code: `CLAUDE.md`.
**Mehrsprachig (11 Sprachen):** Deutsch · Türkçe · Polski · Română · Hrvatski · العربية · Русский · Shqip · Italiano · Français · Español – Sprachwahl im Login, siehe Abschnitt „Mehrsprachigkeit".

## Was drin ist

| Ordner / Datei | Zweck |
|---|---|
| `src/` | Die App: Login (mit Sprachwahl), Heute (Menü mit 4 großen Knöpfen: Stempeluhr, Einsätze, Fotos, Material + breiter Knopf Tagesbericht), Material, Karte mit Fahrzeug-Symbolen, Zeitkonto, Dokumente, Urlaub, Mehr |
| `src/warteschlange.js`, `public/sw.js` | **Offline:** App startet ohne Netz (Service Worker), Stempel/Fotos/Material/Berichte warten auf dem Handy (IndexedDB) und gehen automatisch raus – mit der Uhrzeit der Erfassung |
| `src/teile/BerichtBlatt.jsx`, `Unterschrift.jsx` | **Tagesbericht/Regiebericht** mit Unterschrift des Auftraggebers auf dem Handy (Modul `tagesbericht`) |
| `src/i18n.js`, `src/locales/*.json` | Mehrsprachigkeit (react-i18next): eine JSON-Datei je Sprache, `de.json` ist die Quelle |
| `api/_lib/sprachen.js` | Sprachcode ↔ Airtable-Feld „Sprache" + Push-Texte in allen Sprachen |
| `api/login.js` | Login (ID + PIN → Session-Token; Sperre nach 5 Fehlversuchen) |
| `api/daten.js` | Liest Daten für die App (Feld-Whitelist, jeder sieht nur Eigenes) |
| `api/aktion.js` | Schreibt: Stempeln, Material abhaken/anfordern, Urlaub, Foto, Tagesbericht (PDF), Push-Abo, Dokument gesehen, Sprache ins Profil. Offline Erfasstes: Client-ID gegen Doppelte, Handy-Uhrzeit (max. 31 Tage alt) |
| `api/export.js`, `api/_lib/export.js` | **Lohn-Export** (Modul `export`): Zeiten + Summen als Excel-CSV, DATEV-LODAS-Datei wenn eingerichtet |
| `api/_lib/pdf.js`, `api/_lib/schriften/` | Unicode-Schrift (DejaVu Sans) für PDFs – Namen wie „Şahin", „Łukasz", „Đorđe" |
| `api/dokument-download.js` | Sicherer Download eigener Dokumente (Airtable-URLs laufen nach 2 h ab) |
| `api/setup.js` | **Legt die komplette Airtable-Basis an** (12 Tabellen, Felder, Beispieldaten; ergänzt fehlende Felder in bestehenden Bases) |
| `api/health.js` | Health-Check für Uptime-Monitoring |
| `api/cron/einsatz-push.js` | Täglich 17:30: Push „Dein Einsatz morgen" |
| `api/cron/stundenzettel.js` | Am 1. des Monats: Monats-Stundenzettel als PDF je Mitarbeiter → Dokumente; mit Modul `export` zusätzlich Lohn-Export → Tabelle „Exporte" |
| `api/cron/dokument-push.js` | Push bei Dokumenten/Mitteilungen mit `Push_senden = Senden` (per Airtable-Automation/Aufruf; auf Pro alle 10 Min) |
| `api/cron/stempel-erinnerung.js` | Werktags 06:45: „noch nicht eingestempelt" (Pro-Plan) |
| `vercel.json` / `vercel.pro.json` | Crons + Sicherheits-Header für Hobby (Demo) bzw. Pro (Produktion) |
| `test/` | 81 Backend-Tests + Sprachdatei-Prüfung + Screenshot-Durchlauf inkl. Tastatur-, Offline- und Unterschrift-Test (mit Mock-Airtable, ohne echte Konten) |

---

## Phase 1 – Demo aufsetzen (kostenlos, ca. 30 Minuten)

Ziel: eine laufende App auf `…vercel.app`, mit der du dem Chef alles zeigen kannst. Alles läuft auf kostenlosen Plänen (Vercel Hobby, Airtable Free), nichts davon muss später neu gebaut werden – für die Produktion werden nur die Pläne hochgestuft.

### Schritt 1 – Code auf GitHub (5 Min)

Der Ordner ist bereits ein Git-Repo mit erstem Commit.

```bash
cd baustelle-app
gh repo create karlskiagentur/Baustelle-App --private --source=. --push
# ohne GitHub-CLI: auf github.com leeres privates Repo anlegen, dann
git remote add origin git@github.com:karlskiagentur/Baustelle-App.git && git push -u origin main
```

### Schritt 2 – Airtable (5 Min)

1. Base **„Baustelle App"** ist angelegt → Base öffnen, ID aus der URL kopieren (`app…`).
2. Token erzeugen: https://airtable.com/create/tokens
   Scopes: `data.records:read`, `data.records:write`, `schema.bases:read`, `schema.bases:write` · Zugriff: nur diese Base.

### Schritt 3 – Push-Schlüssel (1 Min)

```bash
npx web-push generate-vapid-keys
```

### Schritt 4 – Vercel (10 Min)

1. vercel.com → **Add New Project** → das GitHub-Repo importieren. Framework „Vite" wird erkannt (Build `npm run build`, Output `dist`). **Root Directory leer lassen.**
2. **Environment Variables** (alle Environments) – Vorlage `.env.example`:

   | Variable | Wert |
   |---|---|
   | `AIRTABLE_TOKEN` | Token aus Schritt 2 |
   | `AIRTABLE_BASE_ID` | `app…` |
   | `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | aus Schritt 3 |
   | `VITE_VAPID_PUBLIC_KEY` | = `VAPID_PUBLIC_KEY` (nochmal, für die App) |
   | `VAPID_MAIL` | z. B. `denis@sprach-ki.live` |
   | `SETUP_SECRET` | eigenes langes Geheimnis (schützt Setup, Crons, Hooks) |
   | `CRON_SECRET` | eigenes Geheimnis (Vercel schickt es automatisch bei Cron-Aufrufen) |
   | `HOOK_SECRET` | eigenes Geheimnis für die Airtable-Automation (darf nur Pushes auslösen, nicht das Setup) |
   | `FIRMA_NAME` | z. B. `Muster Bau GmbH` (Kopfzeile Stundenzettel und Tagesberichte) |
   | optional `MODULE` | freigeschaltete Zusatzmodule je Paket, z. B. `tagesbericht,export,uebersetzung` – leer = Tagesbericht + Export (Übersetzung nur ausdrücklich) |
   | optional `AI_GATEWAY_API_KEY`, `UEBERSETZUNG_MODELL` | nur falls nötig: eigener AI-Gateway-Schlüssel (sonst Vercel-OIDC automatisch) bzw. anderes Modell (Standard `anthropic/claude-haiku-5.5`) |
   | optional `DATEV_BERATERNR`, `DATEV_MANDANTENNR`, `DATEV_LA_ARBEIT` (+ `DATEV_LA_FAHRZEIT`, `DATEV_LA_RUESTZEIT`, `DATEV_BS_STUNDEN`) | nur für die DATEV-Datei im Lohn-Export – Nummern vom Steuerbüro; erster Import immer als Test mit dem Steuerbüro |
   | optional `RESEND_API_KEY`, `ALERT_EMAIL`, `ALERT_FROM` | Alarm-Mails bei Fehlern (wie Wunschlos) |

3. **Deploy** → URL notieren, z. B. `https://baustelle-app.vercel.app`.

### Schritt 5 – Airtable-Basis anlegen lassen (1 Min)

Im Browser:

```
https://DEINE-APP.vercel.app/api/setup?secret=SETUP_SECRET&demo=1
```

Legt 10 Tabellen mit Feldern, Beschreibungen und Farben an, dazu Beispieldaten
(Logins **90001 / 1234**, **90002 / 2345** – Profil-Sprache Türkisch, **90003 / 3456**). Wiederholbar – Vorhandenes wird übersprungen,
neue Felder werden nachgerüstet (z. B. `Mitarbeiter.Sprache`, wenn die Base noch aus V1.0 stammt).

Falls die Antwort unter `manuellNachtragen` Felder listet (Formel/Lookup), diese in Airtable von Hand anlegen – die App läuft auch ohne:
`Mitarbeiter.Anmelde_ID` (Formel `90000 + {Personal_Nr}`), `Einsätze.Adresse_Auto` (Lookup Baustelle → Adresse), `Einsätze.Fahrzeug_Typ_Auto` (Lookup Fahrzeug → Typ),
`Einsätze.Fahrzeug_Ausstattung_Auto` (Lookup Fahrzeug → Standard_Ausstattung), `Zeiteinträge.Dauer_Minuten`.
Tipp: `Personal_Nr` auf **Auto Number** umstellen. Feldrechte für API-Felder auf „Ersteller und höher" lassen (nie „Niemand").

### Schritt 6 – Auf dem Handy testen (5 Min)

1. URL öffnen → **iPhone:** Teilen → „Zum Home-Bildschirm"; **Android:** „Installieren".
2. Sprache antippen (z. B. „Türkçe"), anmelden (90001 / 1234) → „Mitteilungen einschalten" → erlauben. Tipp: 90002 / 2345 startet ohne Sprachwahl direkt auf Türkisch (Profil-Sprache aus Airtable).
3. In Airtable: Dokument dem Mitarbeiter zuordnen, `Push_senden = Senden`, dann
   `https://DEINE-APP.vercel.app/api/cron/dokument-push?secret=SETUP_SECRET` aufrufen → Push kommt an.
4. Einsatz für **morgen** anlegen und `https://DEINE-APP.vercel.app/api/cron/einsatz-push?secret=SETUP_SECRET` aufrufen → Einsatz-Push kommt an.
5. Stundenzettel testen: `https://DEINE-APP.vercel.app/api/cron/stundenzettel?secret=SETUP_SECRET&monat=2026-08` → PDF erscheint unter „Dokumente".

**Push ohne Cron auslösen (Hobby-Plan):** In Airtable eine Automation „Wenn `Push_senden` = Senden → Skript-Aktion `await fetch("https://DEINE-APP.vercel.app/api/cron/dokument-push", { headers: { "X-Hook-Secret": "HOOK_SECRET" } })`" – dann kommt der Push sofort, ohne Zeitplan. (`HOOK_SECRET` statt `SETUP_SECRET`, damit das Base-Team das Setup-Geheimnis nie sieht.)

---

## Phase 2 – Demo beim Chef (Ablauf, 15 Minuten)

1. **Sein Alltag in Airtable** (Laptop): Einsatz für morgen anlegen – Mitarbeiter, Baustelle, **Fahrzeug**, Beginn. Materialposition mit Markt und Zuständigem.
2. **Handy klingelt** (Push per Link ausgelöst): „Dein Einsatz morgen: … · Sprinter HH-BA 200 · Beginn 07:00" → Antippen öffnet die App.
3. **App durchgehen**: Navigation, Fahrzeug + Ladung, Start (Stempeluhr) → auf der **Karte** springt der Pin auf „Vor Ort", Fahrzeug-Symbol + Ausstattung sichtbar, Fahrzeug-Liste „wo steht welches Auto".
4. **Material** abhaken → im Büro sofort sichtbar; „nicht verfügbar" tippen. Von der Baustelle Material **anfordern**.
5. **Foto** vom Zwischenstand → landet in der Doku-Tabelle mit Baustelle, Kategorie, Zeit.
6. **Feierabend** → Zeitkonto zeigt Ist/Soll/Saldo. **Dokumente**: Stundenzettel-PDF öffnen (nur er sieht es). **Urlaub** beantragen → in Airtable auf „Genehmigt" → Status in der App.
7. **Sprache**: unter „Mehr" auf „Türkçe" oder „العربية" tippen – die ganze App wechselt sofort (Arabisch von rechts nach links); in Airtable steht danach „Türkisch" im Feld `Sprache`, der nächste Push kommt in dieser Sprache.

Argumente, die im Konzept stehen: alle sechs Anforderungen erfüllt, ~3 € pro Mitarbeiter/Monat statt 370–900 € bei Marktlösungen, Zeiterfassung prüfungssicher (§ 17 MiLoG), keine Ortung von Personen, jeder Mitarbeiter bedient die App in seiner Sprache.

---

## Phase 3 – Nach dem Go: Produktion (Bezahlpläne, ca. 1 Stunde)

| Schritt | Was | Warum |
|---|---|---|
| 1 | **Vercel Pro** (20 $/Monat) aktivieren; `vercel.pro.json` → `vercel.json` kopieren, Deploy | Hobby ist nur für nicht-kommerzielle Nutzung und Crons laufen nur 1×/Tag mit ±59 Min – Pro: minutengenau, Stempel-Erinnerung + Dokument-Push automatisch |
| 2 | **Airtable Team** (2–3 Lizenzen, ~20 $/Lizenz/Monat jährlich) im Workspace des Kunden; Base dorthin verschieben oder dort neu per `/api/setup` anlegen | 50.000 Datensätze/Base, 20 GB Anhänge, Automationen, Interface für den Chef |
| 3 | Eigene Domain `app.firma.de` (CNAME auf Vercel, wie bei `app.wunschlos-pflege.de`) + `VAPID_MAIL`/`FIRMA_NAME` auf den Kunden | Vertrauen, QR-Code auf dem Infoblatt, Push-Absender |
| 4 | Airtable-**Interface „Büro"** für den Chef (Einsatzplan-Kalender, Materialliste, Urlaubs-Genehmigung, Dokumente-Upload) | Der Chef klickt nur im Interface, nie in den Tabellen |
| 5 | Resend (Alarm-Mails) mit verifizierter Domain; Uptime-Monitor auf `/api/health` | „Error darf nie entstehen" – Fehler kommen per Mail, bevor der Kunde sie merkt |
| 6 | Echte Mitarbeiter anlegen (Name, Personal_Nr, PIN), Fahrzeuge + Baustellen mit Koordinaten; Demo-Datensätze löschen | Ein Infoblatt je Mitarbeiter: URL/QR, Anmelde-ID, PIN, „Zum Home-Bildschirm" |
| 7 | AVV/Datenschutz aus dem Wunschlos-Paket anpassen (Vercel, Airtable, Resend als Subprozessoren; Push-Einwilligung am Gerät) | Rechtsrahmen, siehe Konzept Abschnitt 9 |
| 8 | Pilot mit einer Kolonne (2 Wochen), dann Rollout | Akzeptanz zuerst, Technik zweitens |

Laufende Kosten Produktion: Vercel Pro ~20 $ + Airtable Team 2–3 × ~20 $ + Domain ≈ **60–85 €/Monat**; Push, Karte, PDFs 0 €.

---

## Mehrsprachigkeit

Mehrsprachigkeit ist in React ein gelöstes Standardproblem – **react-i18next** (Open Source, 0 €) ist der De-facto-Standard, keine bezahlten Extras nötig.

- **Sprachen:** Deutsch, Türkisch, Polnisch, Rumänisch, Kroatisch, Arabisch (rechts-nach-links), Russisch, Albanisch, Italienisch, Französisch, Spanisch. Pro Sprache eine JSON-Datei mit allen UI-Texten (`src/locales/de.json`, `tr.json`, …) – der Code bleibt einer, nur die Texte werden ausgetauscht.
- **Sprachwahl** auf dem Login-Screen (und unter „Mehr") als Buttons mit dem Sprachnamen in der jeweiligen Sprache – „Deutsch · Türkçe · Polski · Română · Hrvatski · العربية · Русский · Shqip · Italiano · Français". Eindeutiger als Flaggen, denn Flaggen und Sprachen decken sich nicht sauber.
- **Einmal wählen, dann gemerkt:** Die Wahl landet im `localStorage` des Geräts (bei einer PWA ideal) und zusätzlich im Airtable-Profil (Feld `Sprache`). Ab dem zweiten Öffnen startet die App direkt in der Sprache des Mitarbeiters – auch auf einem neuen Handy, sobald er sich anmeldet. Das Büro kann die Sprache in Airtable auch vorbelegen.
- **Was übersetzt wird:** die gesamte Oberfläche (Buttons, Labels, Meldungen, Fehlertexte), Airtable-Auswahlwerte wie „Vor Ort"/„Besorgt"/„Genehmigt", Datum/Uhrzeit sowie die Push-Nachrichten (Einsatz morgen, neues Dokument, Stempel-Erinnerung) in der Sprache des Empfängers.
- **Büro-Texte übersetzen (Modul `uebersetzung`, seit V1.6):** Mitteilungen und Einsatz-Texte (Aufgabe, Notiz, Ladung) erscheinen in der Sprache des Mitarbeiters, ebenso in den Pushes; mit „Original zeigen“ sieht er den deutschen Text. Übersetzt wird über **Claude im Vercel AI Gateway** (kein weiterer Anbieter, kein eigener Schlüssel – das Deployment meldet sich per Vercel-OIDC an; Anbieter speichert die Texte nicht – Zero Data Retention). Jeder Text wird je Sprache nur einmal übersetzt und am Datensatz gemerkt (Feld `Übersetzungen`); ändert das Büro den Text, wird neu übersetzt. Kosten mit Claude Haiku: Bruchteile eines Cents je Mitteilung. Fehlt Guthaben oder Netz, bleibt es einfach deutsch. Einschalten: in Vercel → AI Gateway einmal Guthaben aufladen (Budget setzen) und `MODULE` um `uebersetzung` ergänzen.
- **Design-Regel für die Zielgruppe:** möglichst icon-lastig – weniger Text heißt weniger Übersetzung und weniger Fehlbedienung auf der Baustelle.
- **Neue Sprache ergänzen:** `src/locales/xx.json` von `de.json` kopieren und übersetzen, Eintrag in `SPRACHEN` (`src/i18n.js`) und `SPRACHEN`/`PUSH_TEXTE` (`api/_lib/sprachen.js`), `/api/setup` einmal aufrufen (neuer Auswahlwert), `node test/sprachen-pruefen.mjs` grün.

## Offline, Tagesbericht, Lohn-Export (seit V1.5)

- **Offline (Grundfunktion):** Die App öffnet auch ohne Netz (Service Worker hält App-Dateien vor) und zeigt den letzten Stand. Stempeln, Feierabend, Fotos, Material und Tagesberichte werden zuerst auf dem Handy gespeichert und automatisch gesendet, sobald Netz da ist (bei Rückkehr in die App, bei Netz-Rückkehr, minütlich). Es zählt die Uhrzeit der Erfassung; das Büro sieht nachgereichte Stempel an `Quelle = App (offline)` und `Gesendet_Am`. Doppelte Sendungen erkennt der Server an der `Client_ID`. Geht die Handy-Uhr vor, nimmt der Server die Eingangszeit und vermerkt das im `Korrektur_Log`.
- **Tagesbericht / Regiebericht (Modul `tagesbericht`):** Was gemacht wurde, wer da war (Stunden aus der Stempeluhr vorgeschlagen), Material – dann unterschreibt der Auftraggeber mit dem Finger. Ergebnis in der Tabelle „Tagesberichte" mit PDF (zum Weiterleiten an den Kunden) und Unterschrift als Bild. Ohne Kunde vor Ort: „Ohne Unterschrift speichern".
- **Lohn-Export (Modul `export`):** Am 1. legt der Stundenzettel-Cron „Zeiten_JJJJ-MM.csv" (jede Stempelung) und „Summen_JJJJ-MM.csv" (je Mitarbeiter: Arbeit/Fahrzeit/Rüstzeit, Arbeitstage, Urlaub/Krank-Tage) in der Tabelle „Exporte" ab; mit DATEV-Einstellungen zusätzlich `DATEV_LODAS_JJJJ-MM.txt` (Personalnummern im Feld `DATEV_PNr`). Jederzeit neu als Lesezeichen: `/api/export?secret=<HOOK_SECRET>&monat=2026-10&datei=zeiten|summen|datev`.
- **Pakete:** `MODULE` in Vercel steuert, was ein Kunde bekommt (z. B. nur `tagesbericht`). `/api/health` zeigt die aktiven Module und ob die PDF-Schrift mit ausgeliefert ist (`pdfSchrift: true`).

## Büro: Plantafel & Übersicht (seit V1.7)

Der Chef arbeitet im Airtable-Interface „Büro“ – 12 Seiten, nach Häufigkeit sortiert:

| Seite | Wofür |
|---|---|
| 📊 Übersicht | Heute auf einen Blick: wer ist wo, wer stempelt gerade, wer ist am nächsten Arbeitstag noch frei, offene Urlaubsanträge, Material, Regie zum Abrechnen, neue Fotos |
| 📅 Plantafel | Einsätze planen: je Baustelle eine Zeile, Balken mit Namen + Uhrzeit, Farbe = Status (geplant / vor Ort / beendet / ausgefallen). Mehrere Tage = ein Eintrag mit „Bis“ |
| 🏗️ Baustellen | Objekte; ein Klick öffnet die Projektmappe mit Einsätzen, Fotos, Berichten, Material und gestempelten Stunden |
| ⏱️ Stunden | Stempelzeiten prüfen/korrigieren (Tab „⚠ Prüfen“: vergessenes Ausstempeln, negative Zeiten) |
| ✍️ Berichte · 📦 Material · 🌴 Urlaub · 💬 Nachrichten · 📄 Lohnzettel · 💶 Lohn-Export · 👷 Mitarbeiter · 🚐 Fahrzeuge | nach Bedarf |

- **Mehrtägig planen:** Im Einsatz bei „Bis“ den letzten Tag eintragen (z. B. Mo–Fr). Die Plantafel zeigt sofort den Balken; spätestens am Vorabend (17:30-Lauf) legt das System die einzelnen Arbeitstage an – danach lässt sich jeder Tag einzeln ändern (z. B. Max ist Mittwoch krank). Wochenenden werden übersprungen; Samstagsarbeit als eigenen Einsatz eintragen.
- **Lohn-Export:** jeden Monat je Mitarbeiter eine Zeile mit seinem Stundenzettel und eine Zeile für das Lohnbüro (CSV, ggf. DATEV) – oben den Mitarbeiter auswählen.
- **Fahrzeug-Standort:** ergibt sich aus dem heutigen Einsatz; „Aktuelle_Baustelle“ nur setzen, wenn ein Fahrzeug ohne Einsatz woanders steht.

## Lokal entwickeln & prüfen

```bash
npm install
npm run build                    # muss grün sein
node test/mock-airtable.mjs &    # Mock auf :4010
node test/run.mjs                # 81 Backend-Tests
node test/sprachen-pruefen.mjs   # Sprachdateien: Schlüssel, Platzhalter, Pluralformen vollständig?
node test/screenshots.mjs        # Playwright-Durchlauf (Screenshots nach test/, inkl. Türkisch/Arabisch)
npx vercel dev                   # lokal mit echten Env-Variablen (.env nach .env.example)
```

## Ausbaustufen

Fahrzeug-Telematik auf der Karte · Bautagebuch mit Wetter · Bauherren-Zugang (wie Klienten-Teil der Pflege-App) · Inbox/Glocke für Push-Nachrichten · optional WhatsApp als Zusatzkanal.
