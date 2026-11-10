// Starter: Die Seite (Bier, Titel) erscheint sofort und ist bis zum Ende des Auslaufens gesperrt (CSS).
// Die Steuerung der einen Geste (js/sequenz.js, ohne Bibliothek) startet sofort.
// Bei „Bewegung reduzieren“ (und ohne JavaScript) gibt es weder Sperre noch Animation: die normale Seite.
// Notausgang: kommt die Steuerung nicht in Gang, wird die Sperre aufgehoben, damit die Seite nie blockiert bleibt.

import './altersabfrage.js?v=7c686182';                         // Altersabfrage 16+ (richtet sich selbst ein)
import './etikett.js?v=7c686182';                              // Goldene Linien der Zutaten: zeichnen sich beim ersten Erscheinen
import './timeline.js?v=7c686182';                              // Geschichte am Handy: aktive Station hervorheben
import { ladeHerde } from './herde.js?v=7c686182';             // Schafe der Herde laden (ohne Sequenz nach dem Laden der Seite)
import { winterZeit } from './winter-zeit.js?v=7c686182';     // Wintersaison (1. November bis 6. Januar) oder ?winter=1

// Restliches CSS: index.html bindet css/style.css als print-Stylesheet ein (blockiert den ersten Bildaufbau nicht),
// hier wird es für alle Medien aktiviert. So braucht die Seite keinen Inline-Handler (strenge Content-Security-Policy).
// Aufruf mit Sprungmarke (#…): der Inhalt bleibt bis dahin unsichtbar (Klasse css-wait aus dem Head-Skript),
// danach wird genau an die Stelle gesprungen – so verrutscht nichts, wenn das Stylesheet greift.
const css = document.getElementById('css-main');
if (css) {
  const activate = () => {
    css.media = 'all';
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

// Der Start mit dem auslaufenden Bier ist in dieser Ausgabe entfernt (js/sequenz.js wird nicht mehr geladen): die Seite steht sofort da, die Herde lädt nach dem Laden.
document.documentElement.classList.add('frei');      // ohne Bier-Intro gilt die Seite sofort als frei (js/etikett.js zeichnet damit die goldenen Linien zur Flasche)
if (document.readyState === 'complete') ladeHerde(); else window.addEventListener('load', ladeHerde, { once: true });

// Layout-Maße des Starts (früher von js/sequenz.js gemessen): --lift stellt den Block aus Titel, Einleitung und Gemälde auf Tablet/Desktop mittig in den ersten Bildschirm,
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
  const fig = hero.querySelector('.painting'), top0 = text.offsetTop;
  const lift = fig && window.innerWidth >= 768 ? Math.max(0, Math.min(200, Math.round((H - (fig.offsetTop + fig.offsetHeight - top0)) / 2 - top0))) : 0;
  hero.style.setProperty('--lift', lift + 'px');
  const lead = hero.querySelector('.hero__lead');
  if (lead) {
    const bottom = lead.offsetTop + lead.offsetHeight;
    hero.style.setProperty('--zone', Math.max(0, H - bottom - 16 - 28) + 'px');
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
  import('./winter.js?v=7c686182').then((m) => m.start(winter)).catch((e) => console.warn('Winterausgabe konnte nicht geladen werden', e));
}
