# Berghof Hell

Markenwebseite für das Berghof Hell aus Agatharied. Einstieg als Scroll-Sequenz (Canvas, ohne Bibliothek):
Flasche frontal auf Augenhöhe, Blick geht nach oben in die Vogelperspektive, Zoom auf den goldenen Kronkorken, dann leert sich das Bier.

Live: https://berghof-hell.de

## Lokal starten

```bash
python3 -m http.server 5173
```

Dann http://localhost:5173 öffnen.

## Aufbau

- `index.html` – alle Inhalte als echter HTML-Text (für Google lesbar), Meta-Tags, strukturierte Daten (JSON-LD)
- `js/main.js` – kleiner Starter: lädt die Scroll-Sequenz gleich nach dem Laden der Seite (oder bei der ersten Interaktion);
  bei „Bewegung reduzieren“ bleibt das Standbild
- `js/sequenz.js` – Scroll-Sequenz, eine **reine Funktion des Scrollfortschritts** (0 bis 1, aus der Scrollposition im `.intro`):
  Bildnummer, Titel, Rahmen, Pfeil, Goldphase und Bierpegel werden pro Bildschirmbild (requestAnimationFrame) daraus berechnet.
  Kein Einrasten, keine Zeitleiste, keine Bibliothek. Die Länge des Startbereichs steht allein im CSS (`.intro` mit `--steps`,
  `.hero` klebt per `sticky`, kein Pin): `--steps` muss zur Zahl der Stufen in `js/sequenz.js` passen; die Scrollposition gehört dem Browser.
  Bilder: winzige Ersatzbilder (`mini/`) für die ganze Strecke, scharfe Bilder in einem Fenster um die Position (dekodiert per
  `createImageBitmap`, danach wieder freigegeben – schont den Speicher am Handy), Ruhebild der Startstation pixelgleich zum Standbild.
  Die letzte Stufe (das Bier leert sich) zeichnet `js/bier-leeren.js` als SVG über dem letzten Bild (`.beer` in `index.html`): Welle,
  Schaumkrone, Bläschen. Der Pegel hängt nur am Fortschritt, das Schwappen verformt nur die Welle.
  Ab dem bildfüllenden Kronkorken ist der Ablauf auf **allen Geräten gleich** (eine Logik in `apply()`, kein Gerätezweig): der Rahmen
  blendet aus (Deckkraft, auch die Fläche hinter „Hofer Bräu“ über `--frame-o`), die Seite taucht ins Gold, der Titel erscheint unten,
  das Bier füllt den ganzen Bildschirm von Rand zu Rand (`.beer`: Höhe 100lvh). Wellenamplitude fest in Pixeln, Wellenlänge wächst mit
  der Breite (2 bis 3 Wellenberge), Bläschen nach Fläche gezählt und gleichmäßig verteilt. Nur der Start unterscheidet sich:
  Handy ohne Titel und mit Pfeil, Desktop mit Titel, der ausblendet, bevor die Flasche in seinen Bereich kommt (`titleClear`).
- `assets/img/flasche-berghof-hell*.webp` – Standbild der Flasche, sofort sichtbar und pixelgenau unter dem ersten Sequenzbild
- `tools/tests/` – automatische Tests der Sequenz (siehe unten), werden nicht ausgeliefert
- Nur für das Rendern (werden nicht ausgeliefert): `js/bottle.js` – Flasche, Etiketten, Kronkorken ·
  `js/stage.js` – Studio, Boden, Schatten · `js/config.js` – Licht, Glas, Farben · `js/scene.js` – frühere Live-3D-Szene

## Sequenz testen

Prüft in Headless Chrome (Node ≥ 22, Google Chrome), dass dieselbe Scrollposition immer dasselbe Bild ergibt:
200 zufällige Positionen (schnell und langsam angefahren), Scrollen in den ersten 500 ms, schnelles Hoch und Runter im Bier-Abschnitt,
Trackpad-Zucken beim Loslassen, kalter Cache mit Fast 3G und CPU 4x, Neu laden mitten in der Sequenz, Handy drehen,
„Bewegung reduzieren“, keine externen Anfragen und Cookies.

```bash
python3 tools/tests/serve.py . 5263 &          # Testserver (gzip, Cache wie GitHub Pages)
node tools/tests/sequenz.mjs                   # alle Tests; einzelne: node tools/tests/sequenz.mjs positionen titel
node tools/tests/schnell-scrollen-gif.mjs      # GIF vom schnellen Scrollen (desktop oder handy)
node tools/tests/safari.mjs                    # dieselben Kernprüfungen im ECHTEN Safari (macOS)
```

Für `safari.mjs` einmalig `sudo safaridriver --enable` ausführen und in Safari unter „Entwickler“ die „Entfernte Automatisierung“ erlauben.
Der WebDriver wertet je Geste nur einen Mausrad-Schritt; die Gesten bestehen deshalb aus `scrollBy`-Schritten (echte Scroll-Ereignisse in Safari).

Zusätzlich vor dem Veröffentlichen: `python3 .github/scripts/check-site.py`, Lighthouse (Handy und Desktop) und ein Blick im echten Safari
(iPhone-Simulator: Wischen mit kleiner Gegenbewegung beim Loslassen, schneller Schwung, Neu laden).

## Sequenz neu rendern

Kamerafahrt und Stationen stehen in `tools/sequenz.json`, getrennt für Desktop (`sets.desktop`, Querformat) und Handy
(`sets.mobil`, Hochformat), je Station: Bildnummer, Drehung, Kamera, optional `shift` (Linsenverschiebung: Bild rückt
um diesen Anteil der Höhe nach oben, ohne die Kamera zu kippen). Beide brauchen gleich viele Stationen.
Licht und Material in `js/config.js`.

1. Lokalen Aufnahme-Server starten, der `POST /__shot?dir=…&name=…` als PNG speichert, und
   `tools/sequenz-rendern.html` darüber öffnen, „Rendern“ klicken (dauert einige Minuten).
2. `python3 tools/sequenz.py <Ordner mit sequenz-roh-*> [desktop|mobil]` (ohne Angabe beide Formate) → WebP-Bilder in `assets/sequenz/`,
   Mini-Ersatzbilder (`mini/`), `manifest.json` (mit `titleClear`: ab dieser Stufe kommt die Flasche in den Titelbereich, der Titel ist dann weg)
   und neue Standbilder `assets/img/flasche-berghof-hell*.webp`. Nur Mini-Bilder und `titleClear` neu berechnen: `python3 tools/sequenz.py --minis`.
3. Die ausgegebenen Werte (top, height, aspect-ratio) bei `.poster picture` in `index.html` und `css/style.css`
   eintragen, sonst springt die Flasche beim Übergang vom Standbild zur Sequenz.


Das CSS für den Startbereich steht zusätzlich direkt in `index.html` (schnellerer Seitenaufbau).
Änderungen am Startbereich also an beiden Stellen machen.

## Altersabfrage 16+

Beim ersten Besuch fragt `index.html` „Bist du 16 Jahre oder älter?“ (Markup ganz oben im `<body>`, Stil im Start-CSS,
Verhalten in `js/altersabfrage.js`). „Ja“ wird 30 Tage im Browser gespeichert (`localStorage`, Schlüssel `berghof-ab16`),
erst danach startet die Scroll-Sequenz. Impressum und Datenschutz sind ohne Abfrage erreichbar.

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
