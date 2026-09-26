# Berghof Hell

Markenwebseite für das Berghof Hell aus Agatharied. Einstieg als Scroll-Sequenz (Canvas + GSAP ScrollTrigger):
Flasche dreht sich, Blick geht nach oben in die Vogelperspektive, Zoom auf den goldenen Kronkorken.

Live: https://berghof-hell.de

## Lokal starten

```bash
python3 -m http.server 5173
```

Dann http://localhost:5173 öffnen.

## Aufbau

- `index.html` – alle Inhalte als echter HTML-Text (für Google lesbar), Meta-Tags, strukturierte Daten (JSON-LD)
- `js/main.js` – kleiner Starter: lädt die Scroll-Sequenz erst nach dem ersten Rendern (bei Interaktion oder nach kurzer Ruhephase);
  bei „Bewegung reduzieren“ bleibt das Standbild
- `js/sequenz.js` – Scroll-Sequenz: zeichnet die vorgerenderten Bilder aus `assets/sequenz/` auf ein Canvas,
  7 Scroll-Stufen mit Einrasten; Stufe 7 („das Bier wird leer“: Schaumkrone, Perlen, Schaumränder) sind
  HTML-Ebenen über dem letzten Bild (`.beer` in `index.html`) (zum Einstellen lokal kurz `markers: true` setzen, so nicht veröffentlichen).
- `assets/img/flasche-berghof-hell*.webp` – Standbild der Flasche, sofort sichtbar und pixelgenau unter dem ersten Sequenzbild
- Nur für das Rendern (werden nicht ausgeliefert): `js/bottle.js` – Flasche, Etiketten, Kronkorken ·
  `js/stage.js` – Studio, Boden, Schatten · `js/config.js` – Licht, Glas, Farben · `js/scene.js` – frühere Live-3D-Szene

## Sequenz neu rendern

Kamerafahrt und Stationen stehen in `tools/sequenz.json` (je Station: Bildnummer, Drehung, Kamera quer/hoch),
Licht und Material in `js/config.js`.

1. Lokalen Aufnahme-Server starten, der `POST /__shot?dir=…&name=…` als PNG speichert, und
   `tools/sequenz-rendern.html` darüber öffnen, „Rendern“ klicken (dauert einige Minuten).
2. `python3 tools/sequenz.py <Ordner mit sequenz-roh-*>` → WebP-Bilder in `assets/sequenz/`, `manifest.json`
   und neue Standbilder `assets/img/flasche-berghof-hell*.webp`.
3. Die ausgegebenen Werte (top, height, aspect-ratio) bei `.poster picture` in `index.html` und `css/style.css`
   eintragen, sonst springt die Flasche beim Übergang vom Standbild zur Sequenz.

Schaum-Texturen für Stufe 7 (`assets/sequenz/schaum.webp`, `schaumrand.webp`, `perlen.webp`): `tools/schaum-rendern.html`
über denselben Server öffnen, „Rendern“ klicken, dann wieder `python3 tools/sequenz.py …`. Die Bieroberfläche liegt in
der Schaumtextur bei 75 % der Höhe (`SURFACE` in `js/sequenz.js`).

Das CSS für den Startbereich steht zusätzlich direkt in `index.html` (schnellerer Seitenaufbau).
Änderungen am Startbereich also an beiden Stellen machen.

## Inhalte pflegen

- **Standorte:** in `data/standorte.json` eintragen, dann `python3 tools/standorte.py` ausführen –
  das schreibt die Standorte als statisches HTML in `index.html`.
- **Kronkorken-Aufdruck:** `tools/kronkorken-backen.html` über den lokalen Server öffnen, Bilder erzeugen,
  mit `cwebp` nach `assets/textures/kronkorken-*.webp` umwandeln.
- **Impressum / Datenschutz:** `impressum.html`, `datenschutz.html`
- **Neue Seite:** in `sitemap.xml` eintragen.

## Google

- `robots.txt` erlaubt alles und verweist auf `sitemap.xml`.
- Strukturierte Daten: Website, Brauerei (Adresse, Koordinaten, Ansprechpartner, Logo) und Produkt.
- Vorschaubild für WhatsApp & Co.: `assets/img/og.jpg` (1200 × 630).

Alle Schriften und Bibliotheken liegen lokal in `vendor/`. Es werden keine externen Dienste eingebunden; die Karte ist ein eigenes Bild mit Link zu Google Maps.
