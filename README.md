# Berghof Hell

Markenwebseite für das Berghof Hell aus Agatharied: 3D-Flasche mit Three.js, GSAP ScrollTrigger und Lenis.

Live: https://berghof-hell.de

## Lokal starten

```bash
python3 -m http.server 5173
```

Dann http://localhost:5173 öffnen.

## Aufbau

- `index.html` – alle Inhalte als echter HTML-Text (für Google lesbar), Meta-Tags, strukturierte Daten (JSON-LD)
- `js/main.js` – kleiner Starter: lädt die 3D-Szene erst nach dem ersten Rendern (bei Interaktion oder nach kurzer Ruhephase)
- `js/scene.js` – Renderer, Licht, Loop · `js/bottle.js` – Flasche, Etiketten, Kronkorken · `js/stage.js` – Studio, Schatten
- `js/config.js` – Kamera, Licht, Glas, Farben
- `assets/img/flasche-berghof-hell*.webp` – Standbild der Flasche, sofort sichtbar und pixelgenau unter der 3D-Flasche

## Anpassen

Kamera, Licht, Material stellst du in `js/config.js` ein.
**Wichtig:** Änderst du Kamera oder Flaschenposition, müssen die Standbilder neu gerendert und ihre Position
(`.poster picture` in `index.html` und `css/style.css`) angepasst werden, sonst springt die Flasche beim Übergang ins 3D.

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
