// Letzte Scroll-Stufe: das Bier leert sich. Grafisch statt realistisch:
// flache Goldfläche (--gold-beer, Farbe des Kronkorkens), flache cremeweiße Schaumkrone, wenige aufsteigende Bläschen.
// Die Oberfläche ist eine Welle aus drei überlagerten Sinuswellen (SVG-Pfad, per requestAnimationFrame),
// die sich dauerhaft sanft bewegt. Beim Scrollen schwappt das Bier: die Scrollgeschwindigkeit kippt die
// Oberfläche, eine gedämpfte Feder lässt sie danach ruhig ausschwingen. Der Schaum folgt leicht verzögert.
// Der Pegel selbst wird nur per transform verschoben (level() aus js/sequenz.js, allein aus dem Scrollfortschritt).
// Das Bier füllt auf allen Geräten den ganzen Bildschirm von Rand zu Rand (Höhe 100lvh, siehe .beer in css/style.css).
// Zustand B: Pegel 0 = der Spiegel steht 70 px über dem Bildrand, das Bild ist ganz Bier. Beim Leeren sinkt er ins Bild, dabei erscheint die Schaumkrone.
// Die Wellenamplitude ist in Pixeln fest; die Wellenlänge wächst mit der Bildschirmbreite (2 bis 3 Wellenberge). Die Bläschen
// werden nach Fläche gezählt und gleichmäßig über die Breite verteilt.

const TAU = Math.PI * 2;
const PAD = 170;                     // Platz oberhalb der Oberfläche für Schaum und Wellenberge (px)
const BELOW = 100;                   // Überstand unten: am Handy startet der Pegel 70 px über dem Rand, das Gold muss trotzdem bis unten reichen
const STEP = 8;                      // Punktabstand des Pfads (px)
const REF_W = 393;                   // Breite, für die die Wellenform ursprünglich gezeichnet wurde (Handy)

// Bläschen: Anzahl nach Fläche (Handy 12), gleichmäßig über die Breite verteilt, wiederholbar (feste Zufallsfolge)
function random(seed) {
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
}
function fillBubbles(container, W, H) {
  const n = Math.min(60, Math.max(12, Math.round((W * H) / 28000)));
  if (container.childElementCount === n) return;
  container.textContent = '';
  const rnd = random(7);
  const slots = Array.from({ length: n }, (_, i) => i).sort(() => rnd() - 0.5);   // Reihenfolge mischen, Plätze bleiben gleichmäßig
  for (let k = 0; k < n; k++) {
    const i = document.createElement('i');
    const x = ((slots[k] + 0.5 + (rnd() - 0.5) * 0.7) / n) * 100;                   // Platz in der Reihe + leichte Streuung
    i.style.left = x.toFixed(1) + '%';
    i.style.setProperty('--s', (5 + Math.round(rnd() * 5)) + 'px');
    i.style.setProperty('--d', (7.2 + rnd() * 4.2).toFixed(1) + 's');
    i.style.setProperty('--w', '-' + (rnd() * 10).toFixed(1) + 's');
    container.appendChild(i);
  }
}

export function createBeer(hero) {
  const liquid = hero.querySelector('.beer__liquid');
  const svg = hero.querySelector('.beer__svg');
  const gold = hero.querySelector('.beer__gold');
  const foam = hero.querySelector('.beer__foam');
  const edge = hero.querySelector('.beer__edge');
  const box = hero.querySelector('.beer');
  const bubbles = hero.querySelector('.beer__bubbles');
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let W = 0, H = 0, foamH = 0, level = 0, running = false, last = 0, t = 0;
  let scrollV = 0, smoothV = 0;      // Scrollgeschwindigkeit (px/s), geglättet
  let tilt = 0, tiltV = 0;           // Schwappen: Neigung der Oberfläche (px) und ihre Geschwindigkeit
  let foamTilt = 0, foamAmp = 9;     // Schaum folgt verzögert
  let cycles = 1;                    // Wellenberge relativ zur Breite (wächst mit breiteren Bildschirmen, siehe measure)

  function measure() {
    if (box.clientWidth === W && box.clientHeight === H) return;   // nur bei echter Größenänderung (nicht bei der Adressleiste)
    W = box.clientWidth;
    H = box.clientHeight;
    cycles = Math.min(2.6, Math.max(1, Math.sqrt(W / REF_W)));      // Handy 1×, Tablet ca. 1,5×, Desktop ca. 2× bis 2,6×: 2 bis 3 Wellenberge
    fillBubbles(bubbles, W, H);
    foamH = Math.min(100, Math.max(56, H * 0.09));          // Schaumkrone ca. zwei Finger breit
    svg.setAttribute('viewBox', `0 0 ${W} ${H + PAD + BELOW}`);
    svg.setAttribute('width', W);
    svg.setAttribute('height', H + PAD + BELOW);
    setLevel(level);
    draw();
  }

  // Pegel 0 (voll) … 1 (leer, alles unter dem unteren Rand)
  function setLevel(p) {
    level = p;
    const from = -70, to = H + foamH + 70;                     // reines Gold am Start, die Schaumkrone kommt von oben
    liquid.style.transform = `translate3d(0, ${from + (to - from) * p - PAD}px, 0)`;
  }

  // Oberfläche: drei Sinuswellen + Neigung durch Schwappen
  function wave(x, amp, time, tiltPx) {
    const u = x / W;
    const k = TAU * u * cycles;
    return amp * (0.55 * Math.sin(k * 1.1 + time * 1.3)
      + 0.3 * Math.sin(k * 2.3 - time * 1.9 + 1.1)
      + 0.15 * Math.sin(k * 4.1 + time * 2.7 + 2.3))
      + tiltPx * (2 * u - 1);
  }

  function draw() {
    if (!W) return;
    const amp = still ? 0 : 10 + Math.min(46, Math.abs(tilt) * 0.5 + Math.abs(tiltV) * 0.04);
    foamAmp += (amp - foamAmp) * 0.12;
    const surf = [], top = [];
    for (let x = 0; x <= W + STEP; x += STEP) {
      const X = Math.min(x, W);
      surf.push([X, PAD + wave(X, amp, t, tilt)]);
      // Schaum: folgt der Welle leicht verzögert, weiche Kuppen an der Oberkante
      const bumps = 4 * Math.sin(X / 37 + t * 0.4) + 3 * Math.sin(X / 23 + 1.7 - t * 0.3);
      top.push([X, PAD - foamH + wave(X, foamAmp * 0.85, t - 0.12, foamTilt) + bumps]);
    }
    const line = (pts) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
    const bottom = H + PAD + BELOW;
    gold.setAttribute('d', `${line(surf)}L${W} ${bottom}L0 ${bottom}Z`);
    const under = surf.slice().reverse().map(([x, y]) => `L${x.toFixed(1)} ${(y + 3).toFixed(1)}`).join('');
    foam.setAttribute('d', `${line(top)}${under}Z`);
    edge.setAttribute('d', line(top));                           // feine Kante: Schaum hebt sich vom Beige ab
  }

  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    t += dt;
    scrollV *= Math.exp(-dt * 10);                               // ohne Scrollen klingt die Anregung ab
    smoothV += (scrollV - smoothV) * Math.min(1, dt * 6);
    // gedämpfte Feder: Ruhelage kippt mit der Scrollgeschwindigkeit, danach ruhiges Ausschwingen
    const target = Math.max(-90, Math.min(90, smoothV * 0.032));
    const omega = TAU * 0.8, zeta = 0.16;
    tiltV += (omega * omega * (target - tilt) - 2 * zeta * omega * tiltV) * dt;
    tilt += tiltV * dt;
    foamTilt += (tilt - foamTilt) * Math.min(1, dt / 0.12);
    draw();
    requestAnimationFrame(frame);
  }

  function run(on) {
    if (still || on === running) return;
    running = on;
    if (on) { last = performance.now(); requestAnimationFrame(frame); }
  }

  // Ruhestellung: außerhalb des Bier-Abschnitts steht die Welle immer gleich, egal wie man dorthin gekommen ist
  // (gleiche Scrollposition = gleiches Bild)
  let calm = false;
  function rest() {
    t = 0; scrollV = 0; smoothV = 0; tilt = 0; tiltV = 0; foamTilt = 0; foamAmp = 10;
    draw();
    calm = true;
  }

  window.addEventListener('resize', () => requestAnimationFrame(measure), { passive: true });
  measure();

  return {
    // p: Pegel; visible: Bierfläche ist im Bild (in B steht der Spiegel über dem Bildrand: dann nichts zeichnen, Welle in Ruhe)
    level(p, visible = true) {
      setLevel(p);
      const on = visible && p > 0 && p < 1;
      run(on);                                                    // Welle läuft nur, solange die Oberfläche ins Bild kommen kann
      if (on) calm = false;
      else if (!calm) rest();
      if (still) draw();
    },
    velocity(v) { scrollV = v; },
    foamIn() { return H ? 70 / (H + foamH + 140) : 0.06; },     // Pegel, ab dem die Schaumkrone oben ins Bild sinkt (Spiegel bei −70 px im Zustand B)
    surfaceY(p) { return H ? -70 + (H + foamH + 140) * p : -70 + 1000 * p; },   // Lage der mittleren Bieroberfläche (px von oben) beim Pegel p, gleiche Rechnung wie setLevel
  };
}
