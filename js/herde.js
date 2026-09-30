// Schafe der Herde (Zustand C) laden erst, wenn sie gebraucht werden: die Bilder tragen nur data-src/data-srcset, dieses Skript setzt die Quellen.
// js/sequenz.js ruft es auf, sobald alle Sequenzbilder da sind (sonst konkurrieren sie am Handy mit dem Start), js/main.js nach dem Laden der Seite,
// wenn es keine Sequenz gibt (Bewegung reduzieren). Kein loading="lazy": Safari lädt solche Bilder nicht zuverlässig, wenn ihr Container erst später angezeigt wird.
export function ladeHerde() {
  document.querySelectorAll('.sheep[data-src]').forEach((img) => {
    img.decoding = 'async';
    img.srcset = img.dataset.srcset;
    img.src = img.dataset.src;
    img.removeAttribute('data-src');
    img.removeAttribute('data-srcset');
  });
}
