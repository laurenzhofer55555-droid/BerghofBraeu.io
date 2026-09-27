// Letzte Scroll-Stufe: das Bier leert sich. Grafisch statt realistisch:
// flache Goldfläche (--gold-beer, Farbe des Kronkorkens), flache cremeweiße Schaumkrone, wenige aufsteigende Bläschen.
// Die Oberfläche ist eine Welle aus drei überlagerten Sinuswellen (SVG-Pfad, per requestAnimationFrame),
// die sich dauerhaft sanft bewegt. Beim Scrollen schwappt das Bier: die Scrollgeschwindigkeit kippt die
// Oberfläche, eine gedämpfte Feder lässt sie danach ruhig ausschwingen. Der Schaum folgt leicht verzögert.
// Der Pegel selbst wird nur per transform verschoben (level() aus js/sequenz.js, scrub).

const TAU = Math.PI * 2;
const PAD = 170;                     // Platz oberhalb der Oberfläche für Schaum und Wellenberge (px)
const BELOW = 100;                   // Überstand unten: am Handy startet der Pegel 70 px über dem Rand, das Gold muss trotzdem bis unten reichen
const STEP = 8;                      // Punktabstand des Pfads (px)

export function createBeer(hero) {
  const liquid = hero.querySelector('.beer__liquid');
  const svg = hero.querySelector('.beer__svg');
  const gold = hero.querySelector('.beer__gold');
  const foam = hero.querySelector('.beer__foam');
  const edge = hero.querySelector('.beer__edge');
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let W = 0, H = 0, foamH = 0, level = 0, running = false, last = 0, t = 0;
  let scrollV = 0, smoothV = 0;      // Scrollgeschwindigkeit (px/s), geglättet
  let tilt = 0, tiltV = 0;           // Schwappen: Neigung der Oberfläche (px) und ihre Geschwindigkeit
  let foamTilt = 0, foamAmp = 9;     // Schaum folgt verzögert
  let foamFirst = true;              // Desktop: Schaum ist beim Start oben zu sehen; Handy: reines Gold, Schaum kommt von oben

  function measure() {
    W = hero.clientWidth;
    H = hero.clientHeight;
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
    const from = foamFirst ? foamH + 24 : -70, to = H + foamH + 70;
    liquid.style.transform = `translate3d(0, ${from + (to - from) * p - PAD}px, 0)`;
  }

  // Oberfläche: drei Sinuswellen + Neigung durch Schwappen
  function wave(x, amp, time, tiltPx) {
    const u = x / W;
    return amp * (0.55 * Math.sin(TAU * u * 1.1 + time * 1.3)
      + 0.3 * Math.sin(TAU * u * 2.3 - time * 1.9 + 1.1)
      + 0.15 * Math.sin(TAU * u * 4.1 + time * 2.7 + 2.3))
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

  window.addEventListener('resize', () => requestAnimationFrame(measure), { passive: true });
  measure();

  return {
    level(p) {
      setLevel(p);
      run(p > 0 && p < 1);                                        // Welle läuft nur, solange Bier zu sehen ist
      if (still) draw();
    },
    velocity(v) { scrollV = v; },
    // false: beim Start ist nur Gold zu sehen, die Schaumkrone kommt beim Scrollen von oben ins Bild (Handy)
    foamAtStart(on) { foamFirst = on; setLevel(level); draw(); },
  };
}
