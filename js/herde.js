// Schafe und Gemälde laden erst, wenn sie gebraucht werden: die Bilder tragen nur data-src/data-srcset, dieses Skript setzt die Quellen.
// js/main.js ruft es nach dem Laden der Seite auf. Kein loading="lazy": Safari lädt solche Bilder nicht zuverlässig, wenn ihr Container erst später angezeigt wird.
// data-nur="schmal" (Herde am Handy) bzw. "breit" (Schafe neben dem Titel und Gemälde ab 768 px) lädt nur, was im aktuellen Layout sichtbar ist;
// wechselt das Layout (Drehen, Fenstergröße), kommt der Rest nach.
const breit = window.matchMedia('(min-width: 768px)');
let gerufen = false;

export function ladeHerde() {
  gerufen = true;
  document.querySelectorAll('img[data-src]').forEach((img) => {
    const nur = img.dataset.nur;
    if ((nur === 'breit' && !breit.matches) || (nur === 'schmal' && breit.matches)) return;
    img.decoding = 'async';
    img.srcset = img.dataset.srcset;
    img.src = img.dataset.src;
    if (img.decode) img.decode().catch(() => {});                // früh dekodieren: beim Einblenden steht das Bild schon bereit
    img.removeAttribute('data-src');
    img.removeAttribute('data-srcset');
  });
}

breit.addEventListener('change', () => { if (gerufen) ladeHerde(); });
