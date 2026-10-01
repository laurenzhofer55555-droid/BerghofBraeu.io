// Goldene Linien der Zutaten-Bühne (Hopfen, Malz, Wasser um die Flasche): sie zeichnen sich beim ersten Erscheinen (CSS stroke-dashoffset, .ist-da je Gruppe).
// „Erscheinen“ heißt: das Intro ist vorbei (html.frei) und die Gruppe ist zu mindestens 35 % im Bild. Bei „Bewegung reduzieren“ (und ohne IntersectionObserver)
// bleibt alles ohne Animation sichtbar (das CSS versteckt erst, wenn html.etikett-an gesetzt ist).
const gruppen = document.querySelectorAll('[data-etikett]');
const root = document.documentElement;
// Linienstärke: genau 1 Bildschirmpixel (die Zeichnung skaliert mit dem Gemälde, ihre Einheit ist 1 cqw)
if ('ResizeObserver' in window) {
  const ro = new ResizeObserver((eintraege) => {
    for (const e of eintraege) {
      const svg = e.target, w = svg.clientWidth, vb = svg.viewBox.baseVal.width;
      if (w > 0 && vb > 0) svg.style.setProperty('--sw', (vb / w).toFixed(4) + 'px');
    }
  });
  gruppen.forEach((g) => ro.observe(g.querySelector('.etikett__linie')));
}
if (gruppen.length && 'IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  root.classList.add('etikett-an');
  const io = new IntersectionObserver((eintraege) => {
    for (const e of eintraege) {
      if (!e.isIntersecting || !root.classList.contains('frei')) continue;       // vor dem Ende des Intros bleibt die Linie ungezeichnet
      e.target.classList.add('ist-da');
      io.unobserve(e.target);
    }
  }, { threshold: 0.35 });
  const beobachten = () => gruppen.forEach((g) => io.observe(g));
  if (root.classList.contains('frei')) beobachten();
  else new MutationObserver((_, mo) => { if (root.classList.contains('frei')) { mo.disconnect(); beobachten(); } }).observe(root, { attributes: true, attributeFilter: ['class'] });
}
