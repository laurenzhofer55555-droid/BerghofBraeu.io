// Schneefall: eine fixierte Zeichenfläche (Canvas) über der Seite, wenige Flocken, vorgerenderte Bildchen (drawImage) statt Verläufe pro Bild.
// Jede Flocke hat einen hellen Kern und einen weichen dunkelgrünen Hof: auf der Cremeseite bleibt sie sichtbar, auf Tannengrün verschwindet der Hof.
// Läuft nur, wenn der Tab sichtbar ist und kein Bier läuft (html.seq ohne .frei); bei „Bewegung reduzieren“ gibt es keinen Schnee.

const STUFEN = 6;
const KRISTALL = 4;                                  // ab dieser Stufe sechsarmige Kristalle, darunter weiche Punkte

function flockenBild(stufe, variante, dpr) {
  const radius = 1.3 + stufe * .62;
  const rand = Math.ceil(radius + 3);
  const c = document.createElement('canvas');
  c.width = c.height = Math.ceil(rand * 2 * dpr);
  const g = c.getContext('2d');
  g.scale(dpr, dpr); g.translate(rand, rand);
  if (stufe < KRISTALL) {
    const hof = g.createRadialGradient(0, 0, radius * .8, 0, 0, radius + 2.4);
    hof.addColorStop(0, 'rgba(31, 77, 43, .26)');
    hof.addColorStop(1, 'rgba(31, 77, 43, 0)');
    g.fillStyle = hof;
    g.beginPath(); g.arc(0, 0, radius + 2.4, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fdfcf8';
    g.beginPath(); g.arc(0, 0, radius, 0, Math.PI * 2); g.fill();
  } else {
    // Kristall: erst eine dunkelgrüne Kontur (auf Creme sichtbar), darüber weiß; auf Tannengrün bleibt nur das Weiß
    const R = radius + 1.2;
    const arme = (breite, farbe) => {
      g.lineWidth = breite; g.strokeStyle = farbe; g.lineCap = 'round';
      g.beginPath();
      for (let k = 0; k < 6; k++) {
        const w = variante * .35 + k * Math.PI / 3, dx = Math.cos(w), dy = Math.sin(w);
        g.moveTo(0, 0); g.lineTo(dx * R, dy * R);
        for (const s of [-1, 1]) {                    // zwei Widerhaken je Arm
          const bx = dx * R * .62, by = dy * R * .62, ww = w + s * .9;
          g.moveTo(bx, by); g.lineTo(bx + Math.cos(ww) * R * .34, by + Math.sin(ww) * R * .34);
        }
      }
      g.stroke();
    };
    arme(2.5, 'rgba(31, 77, 43, .28)');
    arme(1.15, '#ffffff');
  }
  return { c, rand };
}

export function schneeStart() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {};
  const root = document.documentElement;
  const canvas = document.createElement('canvas');
  canvas.className = 'w-schnee';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);
  const g = canvas.getContext('2d');
  let w = 0, h = 0, dpr = 1, bilder = [], flocken = [], lauf = 0, zuletzt = 0, t = 0, los = false, leer = false;

  // Oben schneit es dichter als unten: jede Flocke löst sich auf ihrem Weg in einer eigenen Höhe (zwischen 50 % und 100 % der Feldhöhe; am unteren Feldrand ist jede Flocke schon verblasst, es gibt dort keine harte Kante) langsam auf und fängt oben neu an;
  // je tiefer, desto weniger Flocken sind noch da.
  const ziel = () => .5 + Math.random() * .5;

  function messen() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    w = innerWidth; h = innerHeight;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    canvas.style.height = h + 'px';
    bilder = Array.from({ length: STUFEN }, (_, i) => [0, 1, 2].map((v) => flockenBild(i, v, dpr)));
    const anzahl = Math.round(Math.min(150, Math.max(44, (w * h) / 12000)));       // unten wird es dünn (siehe ende), darum etwas mehr Flocken
    flocken = Array.from({ length: anzahl }, () => {
      const s = Math.random() ** 1.6;                         // viele kleine, wenige große Flocken
      return { x: Math.random() * w, y: Math.random() * h, s: Math.min(STUFEN - 1, Math.floor(s * STUFEN)), v: Math.floor(Math.random() * 3), ph: Math.random() * 6.28, fr: .4 + Math.random() * .7, amp: 8 + Math.random() * 16, ende: ziel() };
    });
  }

  function bild(jetzt) {
    lauf = requestAnimationFrame(bild);
    const dt = Math.min(.05, (jetzt - zuletzt) / 1000 || .016); zuletzt = jetzt; t += dt;
    if (document.hidden || (root.classList.contains('seq') && !root.classList.contains('frei') && !root.classList.contains('w-bier-weg'))) return;   // erst, wenn das Bier weg ist
    // Das Schneefeld hängt am oberen Seitenrand (absolut, nicht am Bildschirm): es ist so hoch wie der erste Bildschirm und scrollt mit der Seite nach oben weg, als schneite es dort
    // weiter. Ist es ganz aus dem Bild, wird nichts mehr gezeichnet (kostet nichts); beim Zurückscrollen schneit es einfach weiter.
    if (scrollY > h + 24) { if (!leer) { leer = true; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, canvas.width, canvas.height); } return; }
    leer = false;
    if (!los) { los = true; for (const f of flocken) f.y = -Math.random() * h * 1.05; }          // der erste Schnee kommt von oben herein
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.scale(dpr, dpr);
    const wind = Math.sin(t * .23) * 14 + 8;                   // sanfte Böen, im Mittel leicht nach rechts
    for (const f of flocken) {
      const tief = (f.s + 1) / STUFEN;                         // große Flocken liegen näher: fallen schneller, wirken kräftiger
      f.y += (26 + tief * 54) * dt;
      f.x += (Math.sin(t * f.fr + f.ph) * f.amp * .35 + wind * tief) * dt;
      if (f.y > f.ende * h + 4) { f.y = -8; f.x = Math.random() * w; f.ende = ziel(); }
      if (f.x > w + 8) f.x = -8; else if (f.x < -8) f.x = w + 8;
      const b = bilder[f.s][f.v];
      g.globalAlpha = (.55 + tief * .45) * Math.max(0, Math.min(1, (f.ende * h - f.y) / (h * .22)));
      g.drawImage(b.c, f.x - b.rand, f.y - b.rand, b.rand * 2, b.rand * 2);
    }
  }

  let breite = innerWidth, hoehe = innerHeight;
  const umbruch = () => {
    // am Handy ändert sich die Höhe beim Ein-/Ausfahren der Adressleiste ständig: nur bei echtem Wechsel neu messen
    if (Math.abs(innerWidth - breite) < 40 && Math.abs(innerHeight - hoehe) < 160) return;
    breite = innerWidth; hoehe = innerHeight; messen();
  };
  messen();
  addEventListener('resize', umbruch);
  lauf = requestAnimationFrame(bild);
  return () => { cancelAnimationFrame(lauf); removeEventListener('resize', umbruch); canvas.remove(); };
}
