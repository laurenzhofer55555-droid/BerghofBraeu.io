// Seiteneinstieg als Bildsequenz („Canvas-Scrollytelling“ wie bei Apple-Produktseiten).
// Die Bilder werden vorab aus der 3D-Szene gerendert (tools/sequenz-rendern.html + tools/sequenz.py);
// hier wird beim Scrollen nur noch das passende Bild auf ein <canvas> gezeichnet → flüssig auch auf alten Handys.
//
// Desktop und Handy haben eigene Bildfolgen (assets/sequenz/manifest.json → sets), gleich viele Scroll-Stufen:
//   Desktop: Blick von oben · Vogelperspektive · Zoom auf den Kronkorken, Titel steht am Start und blendet beim Zoom aus,
//            „Berghof Hell“ erscheint auf dem goldenen Kronkorken.
//   Handy:   Flasche frontal (ohne Titel, Pfeil nach unten) · Vogelperspektive · Zoom, danach erscheint der Titel.
//   Zuletzt leert sich das Bier (js/bier-leeren.js) → danach folgen die Inhalte.
// Im DOM werden nur transform und opacity animiert. Zum Einstellen lokal kurz `markers: true` setzen – nicht so veröffentlichen.

import { createBeer } from './bier-leeren.js';

const BASE = 'assets/sequenz/';
const { gsap, ScrollTrigger } = window;
gsap.registerPlugin(ScrollTrigger);

const root = document.documentElement;
const canvas = document.getElementById('sequenz');
const ctx = canvas.getContext('2d', { alpha: false });
const hero = document.getElementById('start');
const PHONE = '(max-aspect-ratio: 4/5)';   // Hochformat: Handy-Bildfolge, Handy-Standbild und Handy-Ablauf
const portrait = window.matchMedia(PHONE);
const saveData = navigator.connection?.saveData === true;

const manifest = await (await fetch(BASE + 'manifest.json')).json();
let set = portrait.matches ? 'mobil' : 'desktop';
let ST = manifest.sets[set].stations;      // Bildnummer je Station, z. B. [0, 18, 42]
const UNITS = ST.length - 1;               // Scroll-Stufen mit Renderbildern (bei beiden Formaten gleich)
const DRAIN = 1;                           // + letzte Stufe „das Bier leert sich“ (js/bier-leeren.js, kein Bild)
const TOTAL = UNITS + DRAIN;

let frames = [], stills = [], current = 0, lastDrawn = null, loadRun = 0;

// ── Laden: erst das Ruhebild der Startstation, dann jedes 8., 4., 2. Bild, dann alle ──
function loadOrder() {
  const n = manifest.sets[set].frames, a = ST[0], order = [], seen = new Set();
  const add = (job) => { const key = job.join(); if (!seen.has(key)) { seen.add(key); order.push(job); } };
  add(['still', 0]);
  for (const step of [8, 4]) for (let i = a; i < n; i += step) add(['frame', i]);
  add(['frame', n - 1]);
  if (!saveData) for (let s = 1; s <= UNITS; s++) add(['still', s]);
  for (const step of [2, 1]) for (let i = a; i < n; i += step) add(['frame', i]);
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
  ST = manifest.sets[set].stations;
  frames = new Array(manifest.sets[set].frames);
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
  for (let d = 0; d < frames.length; d++) {
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
    setTimeout(() => { document.querySelector('.poster').style.visibility = 'hidden'; }, 1200);   // … und verschwindet ganz
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
// Das Leeren des Biers am Ende rastet nicht ein: der Pegel folgt direkt der Scrollposition.
const state = { u: 0 };
const beer = createBeer(hero);
const imageStations = Array.from({ length: UNITS + 1 }, (_, i) => i / TOTAL);
const snapImages = ScrollTrigger.snapDirectional(imageStations);
const snapTo = (v, self) => (v > UNITS / TOTAL + 0.002 ? v : snapImages(v, self.direction));
const drain = { p: 0 };
const beerLayer = hero.querySelector('.beer');

// Zeitleiste je Format (gsap.matchMedia): beim Drehen des Handys wird sie sauber zurückgesetzt und neu gebaut
gsap.matchMedia().add({ phone: PHONE, wide: `not all and ${PHONE}` }, (context) => {
  const { phone } = context.conditions;
  const tl = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: {
      trigger: hero,
      start: 'top top',
      end: () => '+=' + window.innerHeight * TOTAL,
      pin: true,
      scrub: 0.5,
      // inertia aus: sonst rechnet der Schwung eine Station zu weit (0,9 Stufen gescrollt → Station 2 statt 1)
      snap: { snapTo, inertia: false, duration: { min: 0.25, max: 0.7 }, delay: 0.08, ease: 'power2.inOut' },
      invalidateOnRefresh: true,
      onUpdate: (self) => {
        placeHeader(self);
        beer.velocity(self.getVelocity());                      // schnelles Scrollen lässt das Bier stärker schwappen
        // Bläschen steigen nur, solange das Bier zu sehen ist
        root.classList.toggle('is-draining', self.progress > UNITS / TOTAL + 1e-4 && self.progress < 1 - 1e-4);
      },
      onRefresh: placeHeader,
      // Inhaltsabschnitte danach rasten per CSS-Scroll-Snap ein (nur außerhalb der Sequenz)
      onLeave: () => root.classList.add('snap-sections'),
      onEnterBack: () => root.classList.remove('snap-sections'),
    },
  });
  for (let i = 0; i <= TOTAL; i++) tl.addLabel('station-' + i, i);
  tl.fromTo(state, { u: 0 }, { u: UNITS, duration: UNITS, onUpdate: () => { current = state.u; draw(); } }, 0);

  if (phone) {
    // Handy: Start ohne Titel, Pfeil nach unten blendet beim ersten Scrollen aus. Nach dem Zoom auf den Kronkorken
    // blendet der Rahmen aus und Titel, Trennstrich und „Helles aus Agatharied“ erscheinen. Rückwärts genau umgekehrt.
    // Startwerte immer ausdrücklich setzen (fromTo): nach dem Drehen des Handys dürfen keine Werte der anderen Ansicht bleiben
    tl.fromTo('.scroll-cue', { opacity: 1 }, { opacity: 0, duration: 0.15 }, 0);
    tl.fromTo('#start > .frame', { opacity: 1 }, { opacity: 0, duration: 0.3 }, UNITS - 0.3);
    tl.fromTo('.hero__text', { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.35 }, UNITS - 0.35);
  } else {
    // Desktop: Titel unten blendet beim Zoom aus, Schriftzug erscheint auf dem goldenen Kronkorken
    tl.fromTo('.hero__text', { opacity: 1, y: 0 }, { opacity: 0, y: -24, duration: 0.45 }, UNITS - 1);
    tl.set('#start > .frame', { opacity: 1 }, 0);
    tl.fromTo('.cap-title', { opacity: 0, scale: 0.94 }, { opacity: 1, scale: 1, duration: 0.5 }, UNITS - 0.5);
  }

  // ── Letzte Stufe: das Bier leert sich (js/bier-leeren.js) ──
  // Flache Goldfläche mit Welle und Schaumkrone ersetzt das Kronkorken-Bild, der Pegel sinkt mit dem Scrollen,
  // darüber wird der beige Hintergrund frei.
  tl.fromTo(drain, { p: 0 }, {
    p: 1, duration: DRAIN, onUpdate: () => {
      // Übergang Kronkorken-Bild → flaches Gold in den ersten 5 % der Stufe
      const fade = Math.min(1, drain.p / 0.05);
      beerLayer.style.opacity = fade;
      canvas.style.opacity = drain.p > 0 ? 1 - fade : '';
      beer.level(drain.p);
    },
  }, UNITS);
});

window.addEventListener('resize', () => requestAnimationFrame(resize), { passive: true });
portrait.addEventListener('change', () => { loadSet(); });
resize();
