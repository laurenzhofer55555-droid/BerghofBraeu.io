// Geschichte am Handy: die Timeline wischt man seitlich (CSS scroll-snap). Dieses Skript hebt die Station hervor,
// die gerade vorne steht, füllt den passenden Punkt der Anzeige und steuert den Hinweis „Wischen“: er verschwindet nach dem
// ersten Wischen bzw. an der letzten Station. Sobald die Timeline ins Bild kommt, stupst sie einmal kurz an (Karten gleiten ca. 30 px
// nach links und zurück; bei „Bewegung reduzieren“ aus, das regelt das CSS). Auf Tablet und Desktop ist die Timeline waagerecht
// komplett sichtbar (unten: nur ihre Mitte wird gemessen und ausgerichtet).

const list = document.querySelector('.timeline');
const dots = [...document.querySelectorAll('.timeline__dots i')];
const hint = document.querySelector('.timeline__swipe');

if (list && 'IntersectionObserver' in window) {
  const items = [...list.children];
  list.classList.add('timeline--live');
  const activate = (index) => {
    items.forEach((li, i) => li.classList.toggle('is-active', i === index));
    dots.forEach((dot, i) => dot.classList.toggle('is-active', i === index));
    if (index === items.length - 1) hint?.classList.add('is-gone');
  };
  activate(0);
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) activate(items.indexOf(entry.target));
    });
  }, { root: list, threshold: 0.6 });
  items.forEach((li) => observer.observe(li));

  list.addEventListener('scroll', () => {
    if (list.scrollLeft > 12) hint?.classList.add('is-gone');
  }, { passive: true });
  const seen = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) return;
    seen.disconnect();
    list.classList.add('timeline--nudge');
    list.addEventListener('animationend', () => list.classList.remove('timeline--nudge'), { once: true });
  }, { threshold: 0.8 });
  seen.observe(list);
}

// Tablet und Desktop: die Timeline steht optisch mittig unter der Überschrift. Die letzte Spalte füllt ihre Breite meist nicht ganz (Zeilenumbruch),
// dadurch läge der sichtbare Block (1556 … Heute) einige Pixel zu weit links. Hier wird die tatsächliche Schriftbreite gemessen und die Timeline
// per transform um die halbe Lücke verschoben (höchstens 40 px, nur ab 769 px, ändert kein Layout und keine Seitenhöhe).
if (list) {
  const mitte = () => {
    list.style.setProperty('--tl-shift', '0px');
    if (window.innerWidth <= 768 || getComputedStyle(list).display !== 'grid') return;
    const box = list.getBoundingClientRect();
    let links = Infinity, rechts = -Infinity;
    for (const e of list.querySelectorAll('.timeline__year, p')) {
      const r = document.createRange();
      r.selectNodeContents(e);
      for (const q of r.getClientRects()) { links = Math.min(links, q.left); rechts = Math.max(rechts, q.right); }
    }
    if (!isFinite(links)) return;
    const shift = (box.left + box.width / 2) - (links + rechts) / 2;
    list.style.setProperty('--tl-shift', Math.max(-40, Math.min(40, Math.round(shift))) + 'px');
  };
  mitte();
  window.addEventListener('resize', mitte, { passive: true });
  document.fonts?.ready.then(mitte);
}
