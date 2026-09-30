// Geschichte am Handy: die Timeline wischt man seitlich (CSS scroll-snap). Dieses Skript hebt die Station hervor,
// die gerade vorne steht, füllt den passenden Punkt der Anzeige und steuert den Hinweis „Wischen“: er verschwindet nach dem
// ersten Wischen bzw. an der letzten Station. Sobald die Timeline ins Bild kommt, stupst sie einmal kurz an (Karten gleiten ca. 30 px
// nach links und zurück; bei „Bewegung reduzieren“ aus, das regelt das CSS). Auf Tablet und Desktop ist die Timeline waagerecht
// komplett sichtbar, hier passiert nichts Sichtbares.

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
