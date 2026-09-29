// Starter: Die Seite (Text, Rahmen, Standbild der Flasche) erscheint sofort.
// Die Scroll-Sequenz (js/sequenz.js, ohne Bibliothek) ist Zugabe und wird geladen, sobald die Seite fertig ist:
// bei der ersten Interaktion (Maus, Scrollen, Tippen, Tastatur) oder gleich nach dem Laden.
// Weil die Höhe des Startbereichs allein im CSS steht, spielt es keine Rolle, wann sie startet.
// Beim ersten Besuch wartet sie auf die Altersabfrage (js/altersabfrage.js) und startet direkt nach „Ja“.
// Bei „Bewegung reduzieren“ bleibt es beim Standbild, die Inhalte folgen direkt darunter.

import { gated, confirmed } from './altersabfrage.js';
import './timeline.js';                              // Geschichte am Handy: aktive Station hervorheben

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

const START_DELAY = 300;   // ms nach dem Laden, falls der Besucher nichts tut

let started = false;
async function start() {
  if (started) return;
  started = true;
  events.forEach((type) => window.removeEventListener(type, start));
  try {
    await import('./sequenz.js');
  } catch (e) {
    console.warn('Scroll-Sequenz konnte nicht geladen werden, das Standbild bleibt stehen', e);
    document.documentElement.classList.remove('seq');   // dann Titel wie gewohnt zeigen, Pfeil ausblenden
  }
}

const events = ['pointerdown', 'pointermove', 'wheel', 'touchstart', 'keydown', 'scroll'];
function arm() {
  events.forEach((type) => window.addEventListener(type, start, { passive: true }));
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1));
  const afterLoad = () => setTimeout(() => idle(start, { timeout: 1500 }), START_DELAY);
  if (document.readyState === 'complete') afterLoad();
  else window.addEventListener('load', afterLoad, { once: true });
}
if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  if (gated) confirmed.then(start);   // erster Besuch: Sequenz startet direkt nach „Ja“
  else arm();
}
