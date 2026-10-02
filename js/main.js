// Starter: Die Seite (Text, Rahmen, Standbild der Flasche) erscheint sofort und ist bis zum Ende der Startsequenz gesperrt (CSS).
// Die Steuerung der zwei Gesten (js/sequenz.js, ohne Bibliothek) startet sofort; ihre Bilder lädt sie nach dem Startbild.
// Bei „Bewegung reduzieren“ (und ohne JavaScript) gibt es weder Sperre noch Animation: Standbild, darunter die normale Seite.
// Notausgang: kommt die Steuerung nicht in Gang, wird die Sperre aufgehoben, damit die Seite nie blockiert bleibt.

import './altersabfrage.js?v=1b2534ec';                         // Altersabfrage 16+ (richtet sich selbst ein)
import './etikett.js?v=1b2534ec';                              // Goldene Linien der Zutaten: zeichnen sich beim ersten Erscheinen
import './timeline.js?v=1b2534ec';                              // Geschichte am Handy: aktive Station hervorheben
import { ladeHerde } from './herde.js?v=1b2534ec';             // Schafe der Herde laden (ohne Sequenz nach dem Laden der Seite)

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

const root = document.documentElement;
const unlock = () => { root.classList.remove('seq'); root.classList.add('frei'); ladeHerde(); };
if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  if (document.readyState === 'complete') ladeHerde(); else window.addEventListener('load', ladeHerde, { once: true });
} else {
  import('./sequenz.js?v=1b2534ec').catch((e) => {
    console.warn('Startsequenz konnte nicht geladen werden, das Standbild bleibt stehen', e);
    unlock();
  });
  const guard = () => setTimeout(() => { if (!window.__sequenz) unlock(); }, 8000);
  if (document.readyState === 'complete') guard(); else window.addEventListener('load', guard, { once: true });
}
