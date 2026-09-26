// Starter: Die Seite (Text, Rahmen, Standbild der Flasche) erscheint sofort.
// Die Scroll-Sequenz ist Zugabe und wird geladen, sobald die Seite fertig ist:
// bei der ersten Interaktion (Maus, Scrollen, Tippen, Tastatur) oder nach einer kurzen Ruhephase.
// Bei „Bewegung reduzieren“ bleibt es beim Standbild – die Inhalte folgen direkt darunter.

const START_DELAY = 1200;   // ms nach dem Laden, falls der Besucher nichts tut

const loadScript = (src) => new Promise((resolve, reject) => {
  const s = document.createElement('script');
  s.src = src;
  s.onload = resolve;
  s.onerror = reject;
  document.head.appendChild(s);
});

let started = false;
async function start() {
  if (started) return;
  started = true;
  events.forEach((type) => window.removeEventListener(type, start));
  try {
    await loadScript('vendor/gsap.min.js');
    await loadScript('vendor/ScrollTrigger.min.js');
    await import('./sequenz.js');
  } catch (e) {
    console.warn('Scroll-Sequenz konnte nicht geladen werden – das Standbild bleibt stehen', e);
  }
}

const events = ['pointerdown', 'pointermove', 'wheel', 'touchstart', 'keydown', 'scroll'];
if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  events.forEach((type) => window.addEventListener(type, start, { passive: true }));
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1));
  const afterLoad = () => setTimeout(() => idle(start, { timeout: 1500 }), START_DELAY);
  if (document.readyState === 'complete') afterLoad();
  else window.addEventListener('load', afterLoad, { once: true });
}
