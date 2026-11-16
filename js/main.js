// Starter: statische Seite ohne Intro. Altersabfrage, Linien, Geschichte, Herde und (in der Saison) die Winterausgabe.

import './altersabfrage.js?v=d95a26e7';                         // Altersabfrage 16+ (richtet sich selbst ein)
import './etikett.js?v=d95a26e7';                              // Goldene Linien der Zutaten: zeichnen sich beim ersten Erscheinen
import './timeline.js?v=d95a26e7';                              // Geschichte am Handy: aktive Station hervorheben
import { ladeHerde } from './herde.js?v=d95a26e7';             // Schafe der Herde laden (nach dem Laden der Seite)
import { winterZeit } from './winter-zeit.js?v=d95a26e7';     // Wintersaison (1. November bis 6. Januar) oder ?winter=1

// Restliches CSS: index.html bindet css/style.css als print-Stylesheet ein (blockiert den ersten Bildaufbau nicht),
// hier wird es für alle Medien aktiviert. So braucht die Seite keinen Inline-Handler (strenge Content-Security-Policy).
// Aufruf mit Sprungmarke (#…): der Inhalt bleibt bis dahin unsichtbar (Klasse css-wait aus dem Head-Skript),
// danach wird genau an die Stelle gesprungen – so verrutscht nichts, wenn das Stylesheet greift.
const css = document.getElementById('css-main');
if (css) {
  const activate = () => {
    css.media = 'all';
    startMaße();
    const root = document.documentElement;
    if (!root.classList.contains('css-wait')) return;
    root.classList.remove('css-wait');
    try { document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView(); } catch (e) { /* ungültige Marke */ }
  };
  if (css.sheet) activate();
  else {
    css.addEventListener('load', activate, { once: true });
    css.addEventListener('error', activate, { once: true });
  }
}

// Die Seite steht sofort da (kein Start mit Bier): die Herde lädt nach dem Laden der Seite.
if (document.readyState === 'complete') ladeHerde(); else window.addEventListener('load', ladeHerde, { once: true });

// Layout-Maße des Starts: --lift stellt den Block aus Titel, Einleitung und Gemälde auf Tablet/Desktop mittig in den ersten Bildschirm,
// --zone ist am Handy der Platz für die Herde unter der Einleitung (16 px Abstand zum Text), --fold die Höhe des ersten Bildschirms: das Gemälde beginnt darunter.
function startMaße() {
  const hero = document.getElementById('start');
  const text = hero && hero.querySelector('.hero__text');
  if (!text) return;
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;left:0;top:0;width:0;height:100svh;pointer-events:none;visibility:hidden';
  hero.append(probe);
  const H = probe.getBoundingClientRect().height;
  probe.remove();
  hero.style.setProperty('--lift', '0px');
  const heroTop = hero.getBoundingClientRect().top, unten = (e) => e.getBoundingClientRect().bottom - heroTop;
  const lead = hero.querySelector('.hero__lead'), fig = hero.querySelector('.painting'), top0 = text.offsetTop;
  const block = Math.max(lead ? unten(lead) : 0, fig ? unten(fig) : 0);      // unterste Kante des Blocks aus Titel, Gemälde und Einleitung
  const lift = window.innerWidth >= 768 ? Math.max(0, Math.min(200, Math.round((H - 80 - (block - top0)) / 2 - top0))) : 0;      // 80 px: feste Knöpfe unten
  hero.style.setProperty('--lift', lift + 'px');
  if (lead) {
    const bottom = lead.offsetTop + lead.offsetHeight;
    hero.style.setProperty('--zone', Math.max(0, H - bottom - 16 - 76) + 'px');
    hero.style.setProperty('--fold', Math.max(0, H - bottom) + 'px');
  }
}
let startBreite = window.innerWidth;
startMaße();
(document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(startMaße);
window.addEventListener('load', startMaße, { once: true });
// am Handy ändert sich die Höhe beim Ein-/Ausfahren der Adressleiste ständig: nur bei echter Breitenänderung (Drehen, Fenstergröße) neu messen
window.addEventListener('resize', () => { if (Math.abs(window.innerWidth - startBreite) > 40) { startBreite = window.innerWidth; startMaße(); } });

// Winterausgabe: nur in der Saison (oder mit ?winter=1) nachladen, sonst kostet sie nichts.
const winter = winterZeit();
if (winter.saison) {
  import('./winter.js?v=d95a26e7').then((m) => m.start(winter)).catch((e) => console.warn('Winterausgabe konnte nicht geladen werden', e));
}
