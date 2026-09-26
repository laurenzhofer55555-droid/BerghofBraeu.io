// Starter: Die Seite (Text, Rahmen, Standbild der Flasche) erscheint sofort.
// Die 3D-Szene ist Zugabe und wird erst geladen, wenn die Seite fertig ist:
// bei der ersten Interaktion (Maus, Scrollen, Tippen) oder nach einer kurzen Ruhephase.
// So bleibt die Seite beim Laden schnell und bedienbar – auch auf älteren Handys.

const START_DELAY = 3500;   // ms nach dem Laden, falls der Besucher nichts tut

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
    await Promise.all([loadScript('vendor/gsap.min.js'), loadScript('vendor/lenis.min.js')]);
    await loadScript('vendor/ScrollTrigger.min.js');
    await import('./scene.js');
  } catch (e) {
    console.warn('3D-Szene konnte nicht geladen werden – das Standbild bleibt stehen', e);
    document.documentElement.classList.add('no-webgl');
  }
}

const events = ['pointerdown', 'pointermove', 'wheel', 'touchstart', 'keydown', 'scroll'];
events.forEach((type) => window.addEventListener(type, start, { passive: true }));

const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1));
const afterLoad = () => setTimeout(() => idle(start, { timeout: 2000 }), START_DELAY);
if (document.readyState === 'complete') afterLoad();
else window.addEventListener('load', afterLoad, { once: true });
