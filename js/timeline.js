// Geschichte am Handy: die Timeline wischt man seitlich (CSS scroll-snap). Dieses Skript hebt nur die Station
// hervor, die gerade in der Mitte steht, und füllt den passenden Punkt der Anzeige darunter.
// Auf dem Desktop bleibt die Timeline senkrecht, hier passiert dann nichts sichtbar.

const list = document.querySelector('.timeline');
const dots = [...document.querySelectorAll('.timeline__hint i')];

if (list && 'IntersectionObserver' in window) {
  const items = [...list.children];
  list.classList.add('timeline--live');
  const activate = (index) => {
    items.forEach((li, i) => li.classList.toggle('is-active', i === index));
    dots.forEach((dot, i) => dot.classList.toggle('is-active', i === index));
  };
  activate(0);
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) activate(items.indexOf(entry.target));
    });
  }, { root: list, threshold: 0.6 });
  items.forEach((li) => observer.observe(li));
}
