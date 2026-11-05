// Schluss-Szene der Winterausgabe: ein Spachtel-Gemälde (assets/img/winter-szene-*.webp): Schafe in bunten Mützen und Schals sitzen am Lagerfeuer,
// andere steigen zum Grat, eines fährt auf Skiern ab, Tannen und ein Christbaum stehen am Rand. Es steht im Abschnitt „Der Berghof“ anstelle der Zeichnung
// (die Zeichnung mit „Wir schreiben Geschichte“ steht am Seitenende); das Feuer glimmt leise.
// Das Bild bleibt ruhig, es gibt keine Bewegung außer dem Glimmen (bei „Bewegung reduzieren“ nicht einmal das, css/winter.css).
export function gipfel(anker) {
  if (!anker) return null;
  const abschnitt = document.createElement('div');
  abschnitt.className = 'w-gipfel';
  abschnitt.innerHTML = `
      <figure class="w-gipfel__bild" role="img" aria-label="Gemaltes Winterbild: Schafe in bunten Mützen und Schals sitzen lachend mit Kakao am Lagerfeuer, andere steigen zum Gipfel, eines fährt auf Skiern ab">
        <div class="w-gipfel__flaeche">
          <img src="assets/img/winter-szene-1344.webp" srcset="assets/img/winter-szene-800.webp 800w, assets/img/winter-szene-1344.webp 1344w"
               sizes="(min-width: 1100px) 1080px, (min-width: 768px) 90vw, 225vw" width="1344" height="799" loading="lazy" decoding="async" alt="" />
          <i class="w-gipfel__glut" aria-hidden="true"></i>
        </div>
      </figure>`;
  anker.after(abschnitt);
  const io = new IntersectionObserver(([e]) => abschnitt.classList.toggle('w-aktiv', e.isIntersecting));
  io.observe(abschnitt);
  return () => { io.disconnect(); abschnitt.remove(); };
}
