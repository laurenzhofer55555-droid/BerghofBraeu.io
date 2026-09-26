# Berghof Hell

Markenwebseite für das Berghof Hell aus Agatharied: 3D-Flasche mit Three.js, GSAP ScrollTrigger und Lenis.

Live: https://laurenzhofer55555-droid.github.io/

## Lokal starten

```bash
python3 -m http.server 5173
```

Dann http://localhost:5173 öffnen.

## Anpassen

Kamera, Licht, Material und Effekte stellst du in `js/config.js` ein.

## Inhalte pflegen

- Standorte: `data/standorte.json` (weitere Standorte als neuer Eintrag im Array)
- Geschichte: `data/geschichte.json` (Einträge mit `"entwurf": true` werden nicht angezeigt)
- Impressum / Datenschutz: `impressum.html`, `datenschutz.html`

Alle Schriften und Bibliotheken liegen lokal in `vendor/`, es werden keine externen Dienste geladen.
