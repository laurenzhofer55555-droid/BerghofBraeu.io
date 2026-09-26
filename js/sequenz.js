// Seiteneinstieg als Bildsequenz („Canvas-Scrollytelling“ wie bei Apple-Produktseiten).
// Die Bilder werden vorab aus der 3D-Szene gerendert (tools/sequenz-rendern.html + tools/sequenz.py);
// hier wird beim Scrollen nur noch das passende Bild auf ein <canvas> gezeichnet → flüssig auch auf alten Handys.
//
// Ablauf in 6 Scroll-Stufen (Einrastpunkte = Stationen aus assets/sequenz/manifest.json):
//   1–2 Flasche dreht sich (Rückseite, wieder Vorderseite) · 3 Blick hebt sich · 4–5 Vogelperspektive
//   6 Zoom auf den goldenen Kronkorken, darauf erscheint „Berghof Hell“ → danach folgen die Inhalte.
// Im DOM werden nur transform und opacity animiert. Zum Einstellen lokal kurz `markers: true` setzen – nicht so veröffentlichen.

const BASE = 'assets/sequenz/';
const { gsap, ScrollTrigger } = window;
gsap.registerPlugin(ScrollTrigger);

const root = document.documentElement;
const canvas = document.getElementById('sequenz');
const ctx = canvas.getContext('2d', { alpha: false });
const hero = document.getElementById('start');
const portrait = window.matchMedia('(max-aspect-ratio: 4/5)');
const saveData = navigator.connection?.saveData === true;

const manifest = await (await fetch(BASE + 'manifest.json')).json();
const ST = manifest.stations;              // Bildnummer je Station, z. B. [0, 24, 48, 68, 86, 104, 128]
const UNITS = ST.length - 1;               // Scroll-Stufen

let set, frames = [], stills = [], current = 0, lastDrawn = null, loadRun = 0;

// ── Laden: erst das Ruhebild der Startstation, dann jedes 8., 4., 2. Bild, dann alle ──
function loadOrder() {
  const n = manifest.frames, order = [], seen = new Set();
  const add = (job) => { const key = job.join(); if (!seen.has(key)) { seen.add(key); order.push(job); } };
  add(['still', 0]);
  for (const step of [8, 4]) for (let i = 0; i < n; i += step) add(['frame', i]);
  add(['frame', n - 1]);
  if (!saveData) for (let s = 1; s <= UNITS; s++) add(['still', s]);
  for (const step of [2, 1]) for (let i = 0; i < n; i += step) add(['frame', i]);
  return order;
}

function loadImage(src) {
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  return img.decode().then(() => img);
}

async function loadSet() {
  const run = ++loadRun;
  set = portrait.matches ? 'mobil' : 'desktop';
  frames = new Array(manifest.frames);
  stills = new Array(ST.length);
  lastDrawn = null;
  const queue = loadOrder();
  const worker = async () => {
    while (queue.length && run === loadRun) {
      const [kind, i] = queue.shift();
      const file = kind === 'still' ? `still-${String(ST[i] + 1).padStart(3, '0')}` : String(i + 1).padStart(3, '0');
      try {
        const img = await loadImage(`${BASE}${set}/${file}.webp`);
        if (run !== loadRun) return;
        (kind === 'still' ? stills : frames)[i] = img;
        draw();
      } catch (e) { /* einzelnes Bild fehlt → nächstliegendes wird gezeichnet */ }
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
}

// ── Zeichnen ────────────────────────────────────
// Stufe (0…6) → Bildnummer, stückweise linear zwischen den Stationen
function frameAt(u) {
  const i = Math.min(UNITS - 1, Math.floor(u));
  return ST[i] + (ST[i + 1] - ST[i]) * (u - i);
}

function nearestFrame(f) {
  for (let d = 0; d < manifest.frames; d++) {
    if (frames[f - d]) return frames[f - d];
    if (frames[f + d]) return frames[f + d];
  }
  return null;
}

function draw() {
  const station = Math.round(current);
  const atRest = Math.abs(current - station) < 0.002;
  const img = (atRest && stills[station]) || nearestFrame(Math.round(frameAt(current))) || (current < 0.5 && stills[0]);
  if (!img || img === lastDrawn) return;
  lastDrawn = img;

  // Bildhöhe = Fensterhöhe (Flasche liegt so exakt wie das Standbild), waagrecht zentriert.
  // Ist das Fenster breiter als das Bild, wird der Randstreifen des Bildes seitlich gestreckt (nahtlos).
  const W = canvas.width, H = canvas.height, s = H / img.naturalHeight;
  const dw = img.naturalWidth * s, dx = (W - dw) / 2;
  ctx.drawImage(img, dx, 0, dw, H);
  if (dx > 0) {
    const bar = Math.ceil(dx) + 1;
    ctx.drawImage(img, 0, 0, 1, img.naturalHeight, 0, 0, bar, H);
    ctx.drawImage(img, img.naturalWidth - 1, 0, 1, img.naturalHeight, W - bar, 0, bar, H);
  }
  if (!root.classList.contains('is-ready')) {
    root.classList.add('is-ready');                                          // Standbild blendet aus …
    setTimeout(() => { document.querySelector('.poster').hidden = true; }, 1200);   // … und verschwindet ganz
  }
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
  if (w === canvas.width && h === canvas.height) return;
  canvas.width = w;
  canvas.height = h;
  lastDrawn = null;
  draw();
}

loadSet();

// ── Scroll-Steuerung ────────────────────────────
// Markenname auf der oberen Rahmenlinie bleibt mit dem Rahmen stehen: während der Sequenz fest,
// danach an der Stelle, an der der Startbereich weiterscrollt
const header = document.querySelector('.site-header');
let headerPast = null;
function placeHeader(self) {
  const past = self.progress >= 1;
  if (past === headerPast && !past) return;
  headerPast = past;
  header.style.position = past ? 'absolute' : 'fixed';
  header.style.top = past ? self.end + 'px' : '0px';
}

// Stufenlos: das Bild folgt dem Scrollen (scrub), bei Stillstand rastet es an der nächsten Station ein.
const state = { u: 0 };
const tl = gsap.timeline({
  defaults: { ease: 'none' },
  scrollTrigger: {
    trigger: hero,
    start: 'top top',
    end: () => '+=' + window.innerHeight * UNITS,
    pin: true,
    scrub: 0.6,
    // inertia aus: sonst rechnet der Schwung eine Station zu weit (0,9 Stufen gescrollt → Station 2 statt 1)
    snap: { snapTo: 'labelsDirectional', inertia: false, duration: { min: 0.25, max: 0.7 }, delay: 0.08, ease: 'power2.inOut' },
    invalidateOnRefresh: true,
    onUpdate: placeHeader,
    onRefresh: placeHeader,
    // Inhaltsabschnitte danach rasten per CSS-Scroll-Snap ein (nur außerhalb der Sequenz)
    onLeave: () => root.classList.add('snap-sections'),
    onEnterBack: () => root.classList.remove('snap-sections'),
  },
});
for (let i = 0; i <= UNITS; i++) tl.addLabel('station-' + i, i);
tl.to(state, { u: UNITS, duration: UNITS, onUpdate: () => { current = state.u; draw(); } }, 0);
// Titel unten blendet beim Zoom aus, Schriftzug erscheint auf dem goldenen Kronkorken
tl.to('.hero__text', { opacity: 0, y: -24, duration: 0.45 }, UNITS - 1);
tl.fromTo('.cap-title', { opacity: 0, scale: 0.94 }, { opacity: 1, scale: 1, duration: 0.5 }, UNITS - 0.5);


window.addEventListener('resize', () => requestAnimationFrame(resize), { passive: true });
portrait.addEventListener('change', () => { loadSet(); });
resize();
