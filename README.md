# Berghof Hell

Markenwebseite für das Berghof Hell aus Agatharied. Eine statische Seite ohne Start-Animation: Titel „Berghof Hell“, Einleitung und das Stallhofer-Gemälde stehen
sofort da, darunter Zutaten, Geschichte, Berghof und Standorte. Früher begann die Seite mit auslaufendem Bier (eine Geste, Bier von oben nach unten weg); dieser Start ist
entfernt. Er liegt im Verlauf von `main` (Commit `2e02a18` und davor).

**Varianten mit der 3D-Flasche** (Start mit Flasche auf Augenhöhe, Kamerafahrt in den Kronkorken, dann das Bier) liegen als Branches im Repository, nicht auf der Webseite:
`archiv/start-3d-blender-mix` (zuletzt live: Blender-Flasche mit blauem Etikett, danach das 3D-Modell), `archiv/start-3d-modell-gruen` (3D-Modell mit grünem Etikett, davor live),
`archiv/start-3d-modell-blau` (3D-Modell mit blauem Etikett, three.js), `archiv/3d-blender-szene` (die Blender-Szene samt `.blend`-Dateien und Render-Skripten) und `archiv/flasche-alt`.
Zum Ausprobieren: `git checkout archiv/start-3d-blender-mix`.

Live: https://berghof-hell.de

## Lokal starten

```bash
python3 -m http.server 5173
```

Dann http://localhost:5173 öffnen.

## Aufbau

- `index.html` – alle Inhalte als echter HTML-Text (für Google lesbar), Meta-Tags, strukturierte Daten (JSON-LD)
- `js/main.js` – kleiner Starter: aktiviert das restliche CSS, misst die Layout-Maße des Starts (`--lift`, `--zone`, `--fold`), lädt die Herde und in der Saison die Winterausgabe
- Der Hero ist das Grundlayout der Startseite (`.hero` in `css/style.css` und im Start-CSS der `index.html`): Titel, Zierlinie, Untertitel, Einleitung (`.hero__lead`, zentriert, höchstens 60 Zeichen je Zeile)
  und Stallhofer-Gemälde (`.painting` mit Bildunterschrift) stehen als **ein zentrierter Block untereinander**, Abstände im 8-px-Raster (`--g2`: 28 px, am sehr großen Fenster 40 px). Ist der Block
  niedriger als der Bildschirm (iPad hoch, sehr große Fenster), stellt `js/main.js` ihn mit `--lift` mittig. Zwei Gestaltungen:
  - **Handy (unter 768 px), Variante „Editorial“:** Leadtext größer (17 px am iPhone SE, 19 px am iPhone 15, wächst mit der Bildschirmhöhe), erster Buchstabe als Initiale in Tannengrün; das Gemälde
    steht in voller Inhaltsbreite unter dem ersten Bildschirm (`--fold`) mit Passepartout (heller Innenrand), feinem goldenem Rahmen, weichem Schatten und kursiver Bildunterschrift. Im ersten
    Bildschirm steht unten die Herde (`.herd`, fünf Schafe im Bereich unter der Einleitung, `--zone`, innerhalb des Seitenrahmens).
  - **Tablet und Desktop (ab 768 px), Variante „Bühne“:** Text kompakt (18 px, max. 52 Zeichen), das Gemälde breit und so hoch, dass der Block samt Schafen in den ersten Bildschirm passt
    (`min(80 %, max(520 px, (100svh − 520 px) · 1,5))`), ringsum steht eine Herde aus 9 freigestellten Schafen (`.painting__herde`): vier links, vier rechts und ein braunes rechts an der Unterkante (sonst steht nichts vor dem Bild, das Gemälde bleibt ruhig), Füße auf
    der Kante (Anordnung über `--x`/`--y`/`--k` je Schaf, Größe in `cqw` der Bildbreite, gespiegelt über `--f`; am Tablet enger gestellt, damit nichts den Seitenrahmen berührt). Die Schafe liegen im
    Gemälde und fahren mit ihm. Keine Schafe mehr neben dem Titel.
  Die Bilder tragen `data-src` (und `data-nur="schmal|breit"`), `js/herde.js` setzt die Quellen kurz nach dem Start und lädt nur, was im aktuellen Layout sichtbar ist (beim Drehen oder Ändern
  der Fenstergröße kommt der Rest nach).
- Altersabfrage (`.age`, nur `index.html`): kleine Karte (max. 420 px, abgerundet, beiger Grund, feiner goldener Doppelrand) mittig am Desktop/iPad, Bottom Sheet am Handy (≈ 36 % der Höhe, Safe Area unten);
  dahinter bleibt die Seite sichtbar, abgedunkelt und weichgezeichnet (`backdrop-filter`, ohne Unterstützung nur dunkler). Frage, „Ja, ich bin 16“ (primär) und „Nein“, kurzer Jugendschutz-Hinweis, Schrift
  ≥ 15 px, Schaltflächen ≥ 48 px. Fade plus Hochgleiten (bei „Bewegung reduzieren“ ohne Animation), Fokusfalle (Tab/Umschalt + Tab bleiben in der Abfrage, Escape schließt nicht), Seite `inert` und Intro
  gesperrt bis „Ja“, Speicherung 30 Tage wie bisher.

- Seitenrahmen (`.frame--page`, erstes Kind von `main`): derselbe feine Doppelrahmen mit Eckverzierungen wie im Startbild, um den ganzen Hauptinhalt, `position: absolute` mit `inset: --frame-inset`
  (Handy 10 px, Desktop 22 px), also ohne feste Höhe: er wächst mit der Seite, scrollt mit und endet direkt vor dem Fuß (der liegt außerhalb). „Hofer Bräu“ (`.site-header__brand`) sitzt mittig in
  der oberen Linie. Er ist sofort da. Abschnitte (`.section`) haben `margin-inline: --frame-gap`, Inhalt des Starts `--gutter`: nichts
  berührt die Linie (Trennlinien enden innerhalb, die Timeline am Handy wird an der Rahmeninnenkante abgeschnitten).
  Der erste Bildschirm zeigt Titel, Einleitung und Gemälde.
- Geschichte: `.timeline` ist auf Tablet und Desktop eine waagerechte Timeline über die ganze Inhaltsbreite (goldene Linie, Punkte, Jahreszahl
  darüber, Text darunter); am Handy seitlich wischbar mit Peek der nächsten Karte, Punkten, Hinweis „Wischen“ und einmaligem Anstupsen (`js/timeline.js`)
- Winterausgabe „Volle Stube“ (`js/winter-zeit.js`, `js/winter.js`, `js/winter-schnee.js`, `css/winter.css`): läuft vom 1. November bis 6. Januar (Beginn und Ende stehen in `js/winter-zeit.js`). `js/main.js` lädt nur das kleine `winter-zeit.js`;
  alles andere kommt erst in der Saison. Zum Ansehen außerhalb der Saison `?winter=1` an die Adresse hängen, `?winter=0` schaltet ab. Im Fuß steht „Winterschmuck ausblenden“ (merkt sich der Browser).
  Sie entsteht im Leerlauf nach dem Laden der Seite und liegt in eigenen Ebenen: Schneefall (Canvas, fixiert, z-index 40), Tannenzweige mit Christbaumkugeln in den oberen Ecken
  (sie gleiten aus der Ecke herein, die Kugeln senken sich an den Fäden; danach hängen die Kugeln still und schwingen als Pendel nur, wenn Zeiger oder Fingertipp sie anstößt) und im Abschnitt „Der Berghof“ das Spachtel-Gemälde statt der Zeichnung.
  Dazu: Auf Impressum und Datenschutz steht, immer und ohne Schrift, ein Nachtbild (Berghof-Zeichnung in Creme auf Tannengrün mit Mond, Sternen und leuchtenden Fenstern; reines CSS in `css/nacht.css`, weil die Rechtsseiten keine Skripte erlauben). Schluss-Szene mit einem Spachtel-Gemälde (Schafe am Lagerfeuer, `js/winter-gipfel.js`, Bild `assets/img/winter-szene-*.webp`) und Oswald (lokal in `vendor/fonts`, nur für die Winterteile) als Schrift. Die gezeichneten Schafe und Tannen als Vektorgrafik (`js/winter-schafe.js`, `js/winter-tannen.js`, Vergleichsbogen `tools/schafe.html`) werden derzeit nicht eingebunden.
  Bei „Bewegung reduzieren“ steht alles still. Die Fensterpositionen der Zeichnung stehen in `FENSTER` (`js/winter.js`, Koordinaten der 1400 × 333 Punkte großen Zeichnung).
- `tools/tests/` – `serve.py` (Testserver, gzip, Cache wie GitHub Pages) und `lib.mjs` (Headless-Chrome-Helfer für eigene Messungen), werden nicht ausgeliefert

## Prüfen

**Cache-Stempel (vor jedem Veröffentlichen):** `python3 tools/stempeln.py` hängt an CSS und JS eine Versionsnummer
(`?v=…`; Bilder tragen ihre Version von Hand, z. B. `flasche-360.webp?v=6`). GitHub Pages cached alles 10 Minuten; ohne Stempel bekämen Besucher kurz nach einem Deploy neues HTML mit altem CSS/JS (zerschossene
Darstellung). `python3 tools/stempeln.py --pruefen` prüft nur, ob die Stempel aktuell sind.

Zusätzlich vor dem Veröffentlichen: `python3 .github/scripts/check-site.py`, Lighthouse (Handy und Desktop) und ein Blick im echten Safari
(iPhone-Simulator oder echtes Gerät: Darstellung der ersten Bildschirme, Gemälde, Altersabfrage).

## Altersabfrage 16+

Beim ersten Besuch fragt `index.html` „Bist du 16 Jahre oder älter?“ (Markup ganz oben im `<body>`, Stil im Start-CSS,
Verhalten in `js/altersabfrage.js`). „Ja“ wird 30 Tage im Browser gespeichert (`localStorage`, Schlüssel `berghof-ab16`),
Impressum und Datenschutz sind ohne Abfrage erreichbar.

## Inhalte pflegen

- **Standorte:** in `data/standorte.json` eintragen, dann `python3 tools/standorte.py` ausführen –
  das schreibt die Standorte als statisches HTML in `index.html`.
- **Impressum / Datenschutz:** `impressum.html`, `datenschutz.html`
- **Neue Seite:** in `sitemap.xml` eintragen.

## Google

- `robots.txt` erlaubt alles und verweist auf `sitemap.xml`.
- Strukturierte Daten: Website, Brauerei (Adresse, Koordinaten, Ansprechpartner, Logo) und Produkt.
- Vorschaubild für WhatsApp & Co.: `assets/img/og.jpg` (1200 × 630).

Alle Schriften und Bibliotheken liegen lokal in `vendor/`. Es werden keine externen Dienste eingebunden; die Anfahrtsskizze (`assets/img/karte-*.webp`) ist ein eigenes Bild mit Link zu Google Maps.
