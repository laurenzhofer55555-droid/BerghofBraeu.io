// Geschichte am Handy: die Timeline wischt man seitlich (CSS scroll-snap). Dieses Skript hebt die Station hervor,
// die gerade vorne steht, füllt den passenden Punkt der Anzeige und steuert den feinen Pfeil rechts:
// er stupst beim ersten Sichtbarwerden einmal nach rechts und verschwindet nach dem ersten Wischen
// bzw. an der letzten Station. Auf dem Desktop bleibt die Timeline senkrecht, hier passiert dann nichts sichtbar.

const list = document.querySelector('.timeline');
const dots = [...document.querySelectorAll('.timeline__hint i')];
const arrow = document.querySelector('.timeline__next');

if (list && 'IntersectionObserver' in window) {
  const items = [...list.children];
  list.classList.add('timeline--live');
  const activate = (index) => {
    items.forEach((li, i) => li.classList.toggle('is-active', i === index));
    dots.forEach((dot, i) => dot.classList.toggle('is-active', i === index));
    if (index === items.length - 1) arrow?.classList.add('is-gone');
  };
  activate(0);
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) activate(items.indexOf(entry.target));
    });
  }, { root: list, threshold: 0.6 });
  items.forEach((li) => observer.observe(li));

  if (arrow) {
    list.addEventListener('scroll', () => {
      if (list.scrollLeft > 12) arrow.classList.add('is-gone');
    }, { passive: true });
    const seen = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      arrow.classList.add('is-nudging');
      seen.disconnect();
    }, { threshold: 0.8 });
    seen.observe(list);
  }
}
