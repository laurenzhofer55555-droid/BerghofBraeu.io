# Berghof Hell

Markenwebseite für das Berghof Hell aus Agatharied. Einstieg als Bildsequenz mit genau zwei Gesten (Canvas, ohne Bibliothek):
Geste 1: Kamera fährt von der Flasche auf Augenhöhe in die Vogelperspektive und in den Kronkorken, der Kronkorken wird zu Bier.
Geste 2: das Bier leert sich, danach normal scrollbare Seite.

Live: https://berghof-hell.de

## Lokal starten

```bash
python3 -m http.server 5173
```

Dann http://localhost:5173 öffnen.

## Aufbau

- `index.html` – alle Inhalte als echter HTML-Text (für Google lesbar), Meta-Tags, strukturierte Daten (JSON-LD)
- `js/main.js` – kleiner Starter: startet die Steuerung sofort; Notausgang: kommt sie nicht in Gang, wird die Sperre aufgehoben;
  bei „Bewegung reduzieren“ (und ohne JavaScript) gibt es weder Sperre noch Animation: Standbild, darunter die normale Seite
- `js/sequenz.js` – **Zustandsautomat mit drei Zuständen und zwei Übergängen**, gleich auf Handy, iPad und Desktop:
  A Start (Flasche auf Augenhöhe, Rahmen) → Geste 1 (2,8 s) → B Bier (Bild voll Bier, Schwappen aktiv, kein Rahmen) → Geste 2 (1,3 s,
  das Bier leert sich) → C Inhalt (normal scrollbar). Rückweg: Geste nach oben spielt rückwärts (B → A; in C ganz oben: C → B).
  Alles hängt an einem Wert P (0 bis 2), der per Zeit animiert wird; jeder Zustand ist eine reine Funktion von P (`render`), am Ende
  jeder Animation wird der Zielzustand ausdrücklich gesetzt. Kein Einrasten, kein Scroll-Fortschritt, keine Bibliothek.
  Die Seite ist in A und B per CSS gesperrt (`.seq` ohne `.frei`, ab dem ersten Pixel, kein `scrollTo`); die Gesten erkennt das Skript
  selbst: Mausrad (Summe über 50 ms ≥ 30), Touch (ab 40 px senkrecht), Tastatur (Pfeil, Bild, Leertaste). Eingabesperre während der
  Animation, danach 400 ms und bis das Trackpad-Nachlaufen (Mausrad-Ereignisse ohne 150 ms Pause) abgeklungen ist. Reload oder
  Direktlink (#…) mit Position über 0 landen ohne Animation in C. Knopf „Überspringen“ (Tastatur) springt direkt zu C, der Inhalt ist
  in A und B `inert`.
  Bilder: alle Dateien werden nach dem Startbild geladen, dekodiert (`createImageBitmap`) wird ein Fenster um die Position und nach
  jeder Animation wieder freigegeben (Speicher am Handy). Fehlt ein Bild, hält die Zeit an (nie ein fehlender Frame); Geste zu früh:
  der Pfeil pulsiert und die Animation startet von selbst. Der Kronkorken geht während des Zooms von der Mitte aus in Bierfarbe über.
  `js/bier-leeren.js` zeichnet die Bierfläche als SVG (`.beer`, Höhe 100lvh, Rand zu Rand): Welle (Amplitude fest in Pixeln, Wellenlänge
  wächst mit der Breite), Schaumkrone, Bläschen (nach Fläche gezählt, gleichmäßig verteilt). Pegel nur aus P, das Schwappen verformt nur
  die Welle. Nur der Start unterscheidet sich: Handy ohne Titel und mit Pfeil, Desktop mit Titel, der ausblendet, bevor die Flasche in
  seinen Bereich kommt (`titleClear`).
- `assets/img/flasche-berghof-hell*.webp` – Standbild der Flasche, sofort sichtbar und pixelgenau unter dem ersten Sequenzbild
- `tools/tests/` – automatische Tests der Sequenz (siehe unten), werden nicht ausgeliefert
- Nur für das Rendern (werden nicht ausgeliefert): `js/bottle.js` – Flasche, Etiketten, Kronkorken ·
  `js/stage.js` – Studio, Boden, Schatten · `js/config.js` – Licht, Glas, Farben · `js/scene.js` – frühere Live-3D-Szene

## Sequenz testen

Prüft in Headless Chrome (Node ≥ 22, Google Chrome) mit echten Mausrad-, Touch- und Tastaturereignissen: genau 2 Gesten von A bis C
und 2 zurück, ein starker Trackpad-Flick löst nur Übergang 1 aus, Gesten während der Animation und in der Sperre werden ignoriert,
Endzustände sind jedes Mal exakt gleich, Scrollen direkt nach dem Laden (auch kalt, Fast 3G, CPU 4x), zu frühe Geste wartet und startet
von selbst, Bilder von Geste 1 bei 50 bis 100 % (Farbwechsel Kronkorken → Bier), Zustand B auf iPhone, iPad und Desktop (Bier von Rand
zu Rand, kein Rahmen, Titel, Bläschen), Neu laden und Direktlink, Drehen, Tastatur, Überspringen, „Bewegung reduzieren“, keine externen
Anfragen und Cookies.

```bash
python3 tools/tests/serve.py . 5263 &          # Testserver (gzip, Cache wie GitHub Pages)
node tools/tests/sequenz.mjs                   # alle Tests; einzelne: node tools/tests/sequenz.mjs gesten flick
node tools/tests/gif.mjs                       # GIFs vom Ablauf auf Handy, iPad und Desktop
node tools/tests/safari.mjs                    # dieselben Kernprüfungen im ECHTEN Safari (macOS)
```

Für `safari.mjs` einmalig `sudo safaridriver --enable` ausführen und in Safari unter „Entwickler“ die „Entfernte Automatisierung“ erlauben.
Der WebDriver wertet je Geste nur einen Mausrad-Schritt; das genügt hier, denn ein Schritt löst eine Geste aus.

Zusätzlich vor dem Veröffentlichen: `python3 .github/scripts/check-site.py`, Lighthouse (Handy und Desktop) und ein Blick im echten Safari
(iPhone-Simulator: Wischen mit kleiner Gegenbewegung beim Loslassen, schneller Schwung, Neu laden).

## Sequenz neu rendern

Kamerafahrt und Stationen stehen in `tools/sequenz.json`, getrennt für Desktop (`sets.desktop`, Querformat) und Handy
(`sets.mobil`, Hochformat), je Station: Bildnummer, Drehung, Kamera, optional `shift` (Linsenverschiebung: Bild rückt
um diesen Anteil der Höhe nach oben, ohne die Kamera zu kippen), pro Format `tangent` und `zoomEase` (Feinabstimmung, damit das Tempo
an der mittleren Station nicht springt). Die Fahrt läuft als eine Animation ohne Halt (110 Bilder je Format).
Licht und Material in `js/config.js`.

1. Lokalen Aufnahme-Server starten, der `POST /__shot?dir=…&name=…` als PNG speichert, und
   `tools/sequenz-rendern.html` darüber öffnen, „Rendern“ klicken (dauert einige Minuten).
2. `python3 tools/sequenz.py <Ordner mit sequenz-roh-*> [desktop|mobil]` (ohne Angabe beide Formate) → WebP-Bilder in `assets/sequenz/`,
   `manifest.json` (mit `titleClear`: ab diesem Anteil der ersten Teilstrecke kommt die Flasche in den Titelbereich, der Titel ist dann weg)
   und neue Standbilder `assets/img/flasche-berghof-hell*.webp`. Nur `titleClear` neu berechnen: `python3 tools/sequenz.py --titel`.
3. Die ausgegebenen Werte (top, height, aspect-ratio) bei `.poster picture` in `index.html` und `css/style.css`
   eintragen, sonst springt die Flasche beim Übergang vom Standbild zur Sequenz.


Das CSS für den Startbereich steht zusätzlich direkt in `index.html` (schnellerer Seitenaufbau).
Änderungen am Startbereich also an beiden Stellen machen.

## Altersabfrage 16+

Beim ersten Besuch fragt `index.html` „Bist du 16 Jahre oder älter?“ (Markup ganz oben im `<body>`, Stil im Start-CSS,
Verhalten in `js/altersabfrage.js`). „Ja“ wird 30 Tage im Browser gespeichert (`localStorage`, Schlüssel `berghof-ab16`),
erst danach reagiert die Startsequenz auf Gesten (ihre Bilder laden schon währenddessen). Impressum und Datenschutz sind ohne Abfrage erreichbar.

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
