# Berghof Hell

Markenwebseite für das Berghof Hell aus Agatharied. Einstieg als Bildsequenz mit genau zwei Gesten (Canvas, ohne Bibliothek):
Geste 1: Kamera fährt von der Flasche auf Augenhöhe in die Vogelperspektive und in den Kronkorken, der Kronkorken wird zu Bier.
Geste 2 läuft in zwei klar getrennten Phasen nacheinander (3,75 s, eine Zeitleiste): Phase 1 (2,6 s) nur das Bier, der Titel bleibt ruhig: sofort gleitet die Schaumkrone in 0,3 s ins Bild, danach trinkt „jemand“ das Glas in drei Schlucken mit kleinen Pausen leer (unregelmäßig, keine gleichmäßige Fahrt); 150 ms Pause; Phase 2 (1 s) Titel, Schafe, Einleitung und Gemälde fahren gleichzeitig nach oben und blenden gemeinsam ein. Danach ist kein Bier mehr auf der Seite (Layer `display: none`). Wer mehrmals wischt, löst Geste 1 und Geste 2 direkt hintereinander aus.
Das Intro läuft einmal: in Zustand C ist die Steuerung entfernt, die Seite ist eine ganz normale Webseite („Bier Animation erneut anzeigen“ im Fuß).

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
  A Start (Flasche auf Augenhöhe, Rahmen) → Geste 1 (2,8 s) → B Bier (ganzer Bildschirm Bier, Spiegel über dem Bildrand, keine Schaumkrone,
  kein Rahmen) → Geste 2 (2,7 s, sine.inOut: der Spiegel sinkt ins Bild, erst dabei kommt die Schaumkrone; der Titel rutscht im selben
  Takt von unten nach oben, die Einleitung blendet erst ein, wenn er oben angekommen ist) → C Inhalt (Titel, Einleitung; Tablet/Desktop: Schafe neben dem Titel und Gemälde neben dem Text, Handy: Herde unten; normal scrollbar). Rückweg nur innerhalb des
  Intros: Geste nach oben in B spielt Übergang 1 rückwärts (B → A). In C gibt es keinen Rückweg mehr.
  Alles hängt an einem Wert P (0 bis 2), der per Zeit animiert wird; jeder Zustand ist eine reine Funktion von P (`render`), am Ende
  jeder Animation wird der Zielzustand ausdrücklich gesetzt. Kein Einrasten, kein Scroll-Fortschritt, keine Bibliothek.
  Die Seite ist in A und B per CSS gesperrt (`.seq` ohne `.frei`, ab dem ersten Pixel, kein `scrollTo`); die Gesten erkennt das Skript
  selbst: Mausrad (Summe über 50 ms ≥ 30), Touch (ab 40 px senkrecht), Tastatur (Pfeil, Bild, Leertaste). Eingabesperre während der
  Animation, danach 400 ms und bis das Trackpad-Nachlaufen (Mausrad-Ereignisse ohne 150 ms Pause) abgeklungen ist. Reload oder
  Direktlink (#…) mit Position über 0 landen ohne Animation in C (ein neuer Aufruf ganz oben zeigt das Intro wieder, nichts wird im Browser gespeichert). Knopf „Überspringen“ (Tastatur) springt direkt zu C, der Inhalt ist
  in A und B `inert`. Unten mittig steht der Knopf „Weiter“ (`.scroll-cue`: ein dunkelgrüner Linienpfeil ↓ als Inline-SVG (Schaft mit offener V-Spitze), rechts daneben „Wischen“ bzw.
  „Scrollen“): sichtbar in A und B, während einer Animation und in C aus (Klasse `.aus`, 200 ms), Klick oder Tippen löst dieselbe Geste aus.
  **Aufräumen in C (`teardown`)**: alle Gesten-Listener (wheel, touch, keydown, scroll) werden entfernt, Bitmaps, Dateien und Standbild
  freigegeben, das Canvas ausgeblendet und auf 0 px verkleinert (die Seite läuft danach am Handy flüssiger). `replay()` (Link „Bier Animation erneut
  ansehen“ im Fuß) scrollt nach oben, baut A neu auf (Bilder kommen aus dem Browser-Cache) und räumt in C wieder auf.
  Bilder: alle Dateien werden nach dem Startbild mit 14 gleichzeitigen Abrufen (`LOAD_PARALLEL`, HTTP/2) von vorn nach hinten geladen; **spielbereit** (Ladesymbol aus, Pfeil an) ist die Sequenz, sobald die erste Hälfte lückenlos da ist (`READY_AT` 0,5), der Rest lädt weiter (Geste 1 braucht die hinteren Bilder erst nach ca. 1,4 s; fehlt eines, hält die Zeit kurz an). Gemessen (Chrome, HTTP/2, 60 ms, 4 MB/s): Ladesymbol 2,0 s → 1,0 s (−52 %), bei Fast 3G (nur Bandbreite) 9,3 → 6,2 s. Dekodiert (`createImageBitmap`) wird ein Fenster um die Position und nach
  jeder Animation wieder freigegeben (Speicher am Handy). Fehlt ein Bild, hält die Zeit an (nie ein fehlender Frame); Geste zu früh:
  der Pfeil pulsiert und die Animation startet von selbst. Der Kronkorken geht während des Zooms von der Mitte aus in Bierfarbe über.
  `js/bier-leeren.js` zeichnet die Bierfläche als SVG (`.beer`, Höhe 100lvh, Rand zu Rand): Welle (Amplitude fest in Pixeln, Wellenlänge
  wächst mit der Breite), Schaumkrone, Bläschen (nach Fläche gezählt, gleichmäßig verteilt). Pegel nur aus P, das Schwappen verformt nur
  die Welle. Nur der Start unterscheidet sich: Handy ohne Titel und mit Pfeil, Desktop mit Titel, der ausblendet, bevor die Flasche in
  seinen Bereich kommt (`titleClear`).
- Zustand C ist das Grundlayout des Hero (`.hero` in `css/style.css` und im Start-CSS der `index.html`): Titel, Zierlinie, Untertitel, Einleitung (`.hero__lead`, zentriert, höchstens 60 Zeichen je Zeile)
  und Stallhofer-Gemälde (`.painting` mit Bildunterschrift) stehen als **ein zentrierter Block untereinander**, Abstände im 8-px-Raster (`--g2`: 28 px, am sehr großen Fenster 40 px). Ist der Block
  niedriger als der Bildschirm (iPad hoch, sehr große Fenster), stellt `js/sequenz.js` ihn mit `--lift` mittig; der Titel bleibt in A/B unten verankert (nichts springt). Zwei Gestaltungen:
  - **Handy (unter 768 px), Variante „Editorial“:** Leadtext größer (17 px am iPhone SE, 19 px am iPhone 15, wächst mit der Bildschirmhöhe), erster Buchstabe als Initiale in Tannengrün; das Gemälde
    steht in voller Inhaltsbreite unter dem ersten Bildschirm (`--fold`) mit Passepartout (heller Innenrand), feinem goldenem Rahmen, weichem Schatten und kursiver Bildunterschrift. Im ersten
    Bildschirm steht unten die Herde (`.herd`, fünf Schafe im Bereich unter der Einleitung, `--zone`, innerhalb des Seitenrahmens); sie fährt in Geste 2 gemeinsam mit dem Block hoch.
  - **Tablet und Desktop (ab 768 px), Variante „Bühne“:** Text kompakt (18 px, max. 52 Zeichen), das Gemälde breit und so hoch, dass der Block samt Schafen in den ersten Bildschirm passt
    (`min(80 %, max(520 px, (100svh − 520 px) · 1,5))`), ringsum steht eine Herde aus 16 freigestellten Schafen (`.painting__herde`): vier links, vier rechts und acht vor der Unterkante, Füße auf
    der Kante (Anordnung über `--x`/`--y`/`--k` je Schaf, Größe in `cqw` der Bildbreite, gespiegelt über `--f`; am Tablet enger gestellt, damit nichts den Seitenrahmen berührt). Die Schafe liegen im
    Gemälde und fahren mit ihm. Keine Schafe mehr neben dem Titel.
  Die Bilder tragen `data-src` (und `data-nur="schmal|breit"`), `js/herde.js` setzt die Quellen nach den Sequenzbildern und lädt nur, was im aktuellen Layout sichtbar ist (beim Drehen oder Ändern
  der Fenstergröße kommt der Rest nach).
- Geste 2 in zwei Phasen (`PH_IN`, `PH1`, `PAUSE`, `RIDE`, `FADE`, `T2`, `DRINK` in `js/sequenz.js`; `P` läuft linear von 1 nach 2, `T = (P − 1) · T2`, insgesamt 3,75 s): **Phase 1** (2,6 s) leert nur das Bier:
  0 bis 0,3 s gleitet die Schaumkrone (ease-out) ins Bild, der Spiegel steht dann `FOAM_GAP` px unter ihr direkt unter der Oberkante; danach 2,3 s „Trinken“: sieben Abschnitte (`DRINK`: Schluck, Pause, Schluck, Pause,
  Schluck, Pause, langer letzter Zug; sine.inOut bzw. sine.in) mit kleinen Pausen, in denen das Bier nur nachsackt und schwappt. Start und Ende des Weges kommen aus der echten Höhe des Layers (100lvh):
  `beer.levelAt()` – der Spiegel startet 16 px über der Oberkante (kein unsichtbarer Vorlauf), das Ende liegt 110 px unter der Schaumkrone (auch kräftiges Schwappen bleibt unter dem Rand). Der Pegel wird nur per `transform`
  verschoben. Der Titel bleibt ruhig unten; **Pause** 150 ms; **Phase 2** (1 s): der ganze Block fährt **gleichzeitig** nach oben und blendet gleichzeitig ein: Titel „Berghof Hell“ (mit den Schafen
  daneben), Einleitung, Gemälde und die Herde am Handy gleiten um denselben Weg `textDy` (der Block bleibt starr, FLIP: der Weg wird vorher gemessen, bewegt wird nur `translate3d`), der Seitenrahmen
  blendet mit (cubic.out). Pfeil und „Wischen“ sind in beiden Phasen aus. Es werden nur `transform` und `opacity` animiert (Test `phasen` prüft das per MutationObserver). Am Ende von Geste 2 wird **nicht neu gemessen** (`--lift`, `--fold`, `--zone` bleiben, die Fahrt endet genau an der vorher gemessenen Stelle; Test `sprung`); die Bildfläche des Gemäldes (`.painting__bild`) hat per `aspect-ratio` schon vor dem Laden die richtige Höhe (WebKit misst ein `<img>` ohne `src` nur mit der Alt-Text-Zeile, 18 px, das ergab einen Sprung von ca. 100–160 px am Ende). Geste während Geste 1 (oder in der kurzen Sperre danach) nach unten: `queued`, Geste 2 beginnt sofort (Test `puffer`); `will-change` steht nur
  während einer Animation (`html.anim`); die Bildfolge und das Canvas werden vor Phase 1 freigegeben (`freeFrames()`); die Welle wird nur gezeichnet, solange Oberfläche oder Schaum im Bild sind,
  Bläschen stehen still, sobald kein Bier mehr zu sehen ist; Einleitung, Gemälde, Schafe und Seitenrahmen sind ab B mit 1 % Deckkraft schon gezeichnet (kein Dekodieren mitten im Einblenden),
  `js/herde.js` dekodiert früh. Das Schwere am Ende (Messen, Speicher freigeben) läuft erst 350 ms nach dem letzten Bild. Messung (Chrome, CPU 4 × gedrosselt, iPhone-15-Profil): 60 Bilder/s vorher
  und nachher, Hauptfaden je Bild Median 1,1 → 0,6 ms, größter Bildaufwand 11,1 → 7,9 ms, Hauptfaden 10 → 8 % ausgelastet, keine Aufgabe ≥ 50 ms.
- Altersabfrage (`.age`, nur `index.html`): kleine Karte (max. 420 px, abgerundet, beiger Grund, feiner goldener Doppelrand) mittig am Desktop/iPad, Bottom Sheet am Handy (≈ 36 % der Höhe, Safe Area unten);
  dahinter bleibt die Seite sichtbar, abgedunkelt und weichgezeichnet (`backdrop-filter`, ohne Unterstützung nur dunkler). Frage, „Ja, ich bin 16“ (primär) und „Nein“, kurzer Jugendschutz-Hinweis, Schrift
  ≥ 15 px, Schaltflächen ≥ 48 px. Fade plus Hochgleiten (bei „Bewegung reduzieren“ ohne Animation), Fokusfalle (Tab/Umschalt + Tab bleiben in der Abfrage, Escape schließt nicht), Seite `inert` und Intro
  gesperrt bis „Ja“, Speicherung 30 Tage wie bisher.

- Seitenrahmen (`.frame--page`, erstes Kind von `main`): derselbe feine Doppelrahmen mit Eckverzierungen wie im Startbild, um den ganzen Hauptinhalt, `position: absolute` mit `inset: --frame-inset`
  (Handy 10 px, Desktop 22 px), also ohne feste Höhe: er wächst mit der Seite, scrollt mit und endet direkt vor dem Fuß (der liegt außerhalb). „Hofer Bräu“ (`.site-header__brand`) sitzt mittig in
  der oberen Linie. Er blendet am Ende von Geste 2 in ca. 0,6 s ein (`ramp(h, .88, 1)` in `js/sequenz.js`, aus dem Fortschritt); der Startrahmen im Hero (`.hero > .frame`) blendet in Geste 1 aus und
  ist in C aus. Bei „Bewegung reduzieren“, ohne JavaScript und nach Neuladen in C ist er sofort da. Abschnitte (`.section`) haben `margin-inline: --frame-gap`, Inhalt des Starts `--gutter`: nichts
  berührt die Linie (Trennlinien enden innerhalb, die Timeline am Handy wird an der Rahmeninnenkante abgeschnitten).
  Ohne Sequenz (Bewegung reduzieren, ohne JavaScript) zeigt der erste Bildschirm nur das Standbild.
- Farben der Browserleisten (Statusleiste oben, Leiste unten am iPhone): A beige, B bierfarben (#C5A149); in Geste 2 wird **oben** beige, sobald die Schaumkrone
  ins Bild kommt, **unten** bleibt es bierfarben, solange unten Bier zu sehen ist, und blendet erst danach weich auf beige (`setGold` in `js/sequenz.js`, berechnet aus der
  Lage der Bieroberfläche, `beer.surfaceY`, kein Zeitgeber); in C beide beige. Safari 26 ignoriert `theme-color` und nimmt beide Leisten sonst vom Seitenhintergrund (dann
  wäre nur eine Farbe für oben und unten möglich). Darum erzeugt `js/sequenz.js` am Touch-WebKit (iPhone/iPad, `-webkit-touch-callout` + `(hover: none)`) während der Sequenz
  zwei 6 px hohe, deckende, feste Streifen (`.edge--top`, `.edge--bottom`, z-index 60, über dem Papierkorn z-index 50): Safari liest einen Streifen nur beim Erzeugen und nur, wenn
  er sichtbar und oberstes Element am Rand ist (durchsichtig, `opacity: 0`, `clip-path` oder unter dem Korn/Canvas/Standbild zählt nicht). Bei jeder neuen Farbstufe (1/16)
  kommt deshalb ein neuer Streifen obenauf, der alte wird entfernt; in C werden beide entfernt (Seitenhintergrund beige). Die Beschriftung „Hofer Bräu“ (z-index 61) und die
  Altersabfrage (z-index 70) liegen darüber. `theme-color` folgt der oberen Farbe stufenlos (Chrome Android, iOS bis 25). Desktop und Android Chrome bekommen keine Streifen.
- Geschichte: `.timeline` ist auf Tablet und Desktop eine waagerechte Timeline über die ganze Inhaltsbreite (goldene Linie, Punkte, Jahreszahl
  darüber, Text darunter); am Handy seitlich wischbar mit Peek der nächsten Karte, Punkten, Hinweis „Wischen“ und einmaligem Anstupsen (`js/timeline.js`)
- `assets/img/flasche-berghof-hell*.webp` – Standbild der Flasche, sofort sichtbar und pixelgenau unter dem ersten Sequenzbild
- `tools/tests/` – automatische Tests der Sequenz (siehe unten), werden nicht ausgeliefert
- Nur für das Rendern (werden nicht ausgeliefert): `js/bottle.js` – Flasche, Etiketten, Kronkorken ·
  `js/stage.js` – Studio, Boden, Schatten · `js/config.js` – Licht, Glas, Farben · `js/scene.js` – frühere Live-3D-Szene

## Sequenz testen

Prüft in Headless Chrome (Node ≥ 22, Google Chrome) mit echten Mausrad-, Touch- und Tastaturereignissen: genau 2 Gesten von A bis C,
der Rückweg nur in B, in C keine Animation mehr (10 schnelle Gesten nach oben; keine Listener, Canvas und Bilder aus dem Speicher),
„Bier Animation erneut anzeigen“ spielt A → B → C erneut ab, Titel oben und Einleitung im ersten Bildschirm nach 2 Gesten, der Titel gleitet
ohne Sprung, Schafe je nach Gerät (Handy: Herde unten ohne Gemälde, Tablet/Desktop: vier neben dem Titel, Gemälde neben dem Text), Timeline komplett sichtbar (Tablet/Desktop) bzw. mit Peek, Punkten und Hinweis (Handy), Pfeil gefüllt, ein starker Trackpad-Flick löst nur Übergang 1 aus, Gesten nach oben während der Animation und in der Sperre werden ignoriert (eine zweite Geste nach unten wird gemerkt), nach dem Intro ist kein Bier mehr auf der Seite (auch nicht in kleinen Fenstern) und nach „Bier Animation erneut anzeigen“ wieder da, nach der Fahrt springt nichts,
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

**Cache-Stempel (vor jedem Veröffentlichen):** `python3 tools/stempeln.py` hängt an CSS, JS, Sequenzbilder und Standbild eine Versionsnummer
(`?v=…`). GitHub Pages cached alles 10 Minuten; ohne Stempel bekämen Besucher kurz nach einem Deploy neues HTML mit altem CSS/JS (zerschossene
Darstellung). `python3 tools/stempeln.py --pruefen` prüft nur, ob die Stempel aktuell sind.

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

Alle Schriften und Bibliotheken liegen lokal in `vendor/`. Es werden keine externen Dienste eingebunden; die Anfahrtsskizze (`assets/img/karte-*.webp`) ist ein eigenes Bild mit Link zu Google Maps.
