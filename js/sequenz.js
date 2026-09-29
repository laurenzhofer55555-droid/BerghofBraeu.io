// Seiteneinstieg als Bildsequenz („Canvas-Scrollytelling“ wie bei Apple-Produktseiten).
// Die Bilder werden vorab aus der 3D-Szene gerendert (tools/sequenz-rendern.html + tools/sequenz.py);
// hier wird beim Scrollen nur noch das passende Bild auf ein <canvas> gezeichnet → flüssig auch auf alten Handys.
//
// Desktop und Handy haben eigene Bildfolgen (assets/sequenz/manifest.json → sets), gleich viele Scroll-Stufen:
//   Desktop: Flasche frontal · Vogelperspektive · Zoom auf den Kronkorken, Titel steht am Start und blendet beim Zoom aus,
//            „Berghof Hell“ erscheint auf dem goldenen Kronkorken.
//   Handy:   Flasche frontal (ohne Titel, Pfeil nach unten) · Vogelperspektive · Zoom, danach erscheint der Titel.
//   Zuletzt leert sich das Bier (js/bier-leeren.js) → danach folgen die Inhalte.
//
// Robust nach dem Apple-Prinzip:
//   · Das Layout steht allein im CSS (.intro ist hoch, .hero klebt per sticky) → kein Pin, kein Höhensprung,
//     egal wann dieses Skript geladen wird.
//   · Scrollposition → Fortschritt → Bildnummer; gezeichnet wird höchstens einmal pro Bildschirmbild (requestAnimationFrame).
//   · Fehlt ein Bild, wird das nächstliegende geladene gezeichnet, im Zweifel bleibt das letzte stehen → nie ein leeres Canvas.
//   · Geladen wird zuerst rund um die aktuelle Position, dann jedes 8. Bild, dann wird aufgefüllt.
// Im DOM werden nur transform und opacity animiert. Zum Einstellen lokal kurz `markers: true` setzen – nicht so veröffentlichen.

import { createBeer } from './bier-leeren.js';

const BASE = 'assets/sequenz/';
const { gsap, ScrollTrigger } = window;
gsap.registerPlugin(ScrollTrigger);
// Ein- und Ausblenden der Adressleiste am Handy löst kein Neuberechnen aus (Layout und Canvas hängen nicht daran)
ScrollTrigger.config({ ignoreMobileResize: true });

const root = document.documentElement;
const canvas = document.getElementById('sequenz');
const ctx = canvas.getContext('2d', { alpha: false });
const intro = document.querySelector('.intro');
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
// Die Höhe des Startbereichs steht im CSS (--steps): muss zu den Stufen hier passen
if (parseInt(getComputedStyle(root).getPropertyValue('--steps'), 10) !== TOTAL) {
  console.warn(`--steps in css/style.css muss ${TOTAL} sein (Stufen in js/sequenz.js)`);
}

let frames = [], stills = [], current = 0, loadRun = 0;

// ── Laden ───────────────────────────────────────
// Jeder freie Lader holt sich das jeweils wichtigste Bild: zuerst das Ruhebild bzw. die Bilder rund um die
// aktuelle Position (auch nach schnellem Scrollen oder Neuladen mitten in der Sequenz), dann jedes 8. Bild
// als Gerüst über die ganze Strecke, die übrigen Ruhebilder, dann jedes 4., 2. und schließlich alle.
const NEAR = 6;                            // so viele Bilder vor und hinter der Position haben Vorrang
let queue = [], busy = new Set();

function baseOrder() {
  const n = manifest.sets[set].frames, order = [];
  for (let i = 0; i < n; i += 8) order.push(['frame', i]);
  order.push(['frame', n - 1]);
  if (!saveData) for (let s = 0; s <= UNITS; s++) order.push(['still', s]);
  for (const step of [4, 2, 1]) for (let i = 0; i < n; i += step) order.push(['frame', i]);
  return order;
}

const have = (kind, i) => (kind === 'still' ? stills : frames)[i] || busy.has(kind + i);

function nextJob() {
  const station = Math.round(current);
  if (Math.abs(current - station) < 0.002 && (!saveData || station === 0) && !have('still', station)) return ['still', station, 'high'];
  const f = Math.round(frameAt(current)), n = frames.length;
  for (let d = 0; d <= NEAR; d++) {
    for (const i of d ? [f + d, f - d] : [f]) if (i >= 0 && i < n && !have('frame', i)) return ['frame', i, 'high'];
  }
  while (queue.length) {
    const [kind, i] = queue.shift();
    if (!have(kind, i)) return [kind, i, 'low'];
  }
  return null;
}

function loadImage(src, priority) {
  const img = new Image();
  img.decoding = 'async';
  img.fetchPriority = priority;
  img.src = src;
  return img.decode().then(() => img);     // erst fertig dekodiert verwenden → kein Ruckeln beim ersten Zeichnen
}

async function loadSet() {
  const run = ++loadRun;
  set = portrait.matches ? 'mobil' : 'desktop';
  ST = manifest.sets[set].stations;
  frames = new Array(manifest.sets[set].frames);
  stills = new Array(ST.length);
  queue = baseOrder();
  busy = new Set();
  const worker = async () => {
    for (let job = nextJob(); job && run === loadRun; job = nextJob()) {
      const [kind, i, priority] = job, key = kind + i;
      busy.add(key);
      const file = kind === 'still' ? `still-${String(ST[i] + 1).padStart(3, '0')}` : String(i + 1).padStart(3, '0');
      try {
        const img = await loadImage(`${BASE}${set}/${file}.webp`, priority);
        if (run !== loadRun) return;
        (kind === 'still' ? stills : frames)[i] = img;
        requestDraw();
      } catch (e) { /* einzelnes Bild fehlt → nächstliegendes wird gezeichnet */ }
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
}

// ── Zeichnen ────────────────────────────────────
// Stufe (0…UNITS) → Bildnummer, stückweise linear zwischen den Stationen
function frameAt(u) {
  const i = Math.max(0, Math.min(UNITS - 1, Math.floor(u)));
  return ST[i] + (ST[i + 1] - ST[i]) * (Math.min(UNITS, Math.max(0, u)) - i);
}

function nearestFrame(f) {
  for (let d = 0; d < frames.length; d++) {
    if (frames[f - d]) return frames[f - d];
    if (frames[f + d]) return frames[f + d];
  }
  return null;
}

let shown = null;      // zuletzt gezeichnetes Bild: bleibt stehen, bis ein passenderes geladen ist (nie leeres Canvas)
let stale = true;      // Canvas neu angelegt (Größe geändert) → muss neu gezeichnet werden
let queued = false;

function requestDraw() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; draw(); });
}

function draw() {
  const station = Math.round(current);
  const atRest = Math.abs(current - station) < 0.002;
  const img = (atRest && stills[station]) || nearestFrame(Math.round(frameAt(current))) || stills[station] || shown;
  if (!img || (img === shown && !stale)) return;
  shown = img;
  stale = false;

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

// Canvas nur bei echter Größenänderung neu anlegen (Höhe = 100lvh, die Adressleiste ändert sie nicht)
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
  if (w === canvas.width && h === canvas.height) return;
  canvas.width = w;
  canvas.height = h;
  stale = true;
  draw();
}

// ── Scroll-Steuerung ────────────────────────────
// Stufenlos: das Bild folgt dem Scrollen (leicht geglättet), erst wenn das Scrollen ruht, rastet es an der
// nächsten Station in Scrollrichtung ein (nie zurück gegen die Bewegung).
// Das Leeren des Biers am Ende rastet nicht ein: der Pegel folgt direkt der Scrollposition.
const state = { u: 0 };
const beer = createBeer(hero);
const imageStations = Array.from({ length: UNITS + 1 }, (_, i) => i / TOTAL);
const snapImages = ScrollTrigger.snapDirectional(imageStations);
const snapTo = (v, self) => (v > UNITS / TOTAL + 0.002 ? v : snapImages(v, self.direction));
const drain = { p: 0 };
const gold = { v: 0 };
const beerLayer = hero.querySelector('.beer');

// Handy: in der Gold-Phase taucht die ganze Seite ins Gold, auch hinter Statusleiste und Adressleiste
// (Seitenhintergrund + Browserfarbe). Oben wird es wieder beige, sobald die Schaumkrone von oben kommt,
// unten erst, wenn das Bier den unteren Rand verlassen hat.
const themeColor = document.querySelector('meta[name="theme-color"]');
const CREAM = themeColor.content, GOLD = '#C5A149';           // GOLD = --gold-beer
function setGold(top, page) {
  themeColor.content = top ? GOLD : CREAM;
  root.classList.toggle('gold-page', page);
}

// Nach dem Anlegen und nach jedem Neuberechnen (Drehen, Fenstergröße) steht die Zeitleiste sofort auf der
// Scrollposition, ohne erst von vorn hinterherzulaufen (z. B. wenn schon vor dem Laden gescrollt wurde).
// Inhaltsabschnitte danach rasten per CSS-Scroll-Snap ein (nur außerhalb der Sequenz).
function settle(self) {
  self.getTween()?.progress(1);
  // ScrollTrigger setzt die Zeitleiste beim Anlegen ohne Callbacks: einmal still auf 0, dann mit Callbacks auf die
  // Position → Canvas, Bier, Gold und Titel passen immer zum Fortschritt (auch bei Sprungmarke oder spätem Laden)
  self.animation.progress(0, true).progress(self.progress);
  root.classList.toggle('snap-sections', self.progress >= 1);
}

// Drehen oder Fenstergröße ändern: dieselbe Stelle der Sequenz bleibt stehen. Der Browser behält sonst nur die
// Pixelposition, die Stufen sind danach aber anders hoch (man landete eine Station weiter).
// Das resize-Ereignis kommt vor den Scroll-Ereignissen der neuen Größe → der gemerkte Fortschritt ist noch der alte.
let trigger = null, saved = 0, restore = null, width = window.innerWidth;
window.addEventListener('resize', () => {
  if (window.innerWidth === width) return;             // nur die Höhe (Adressleiste am Handy): nichts zu tun
  width = window.innerWidth;
  if (restore === null && saved > 0 && saved < 1) restore = saved;
}, { passive: true });
ScrollTrigger.addEventListener('refresh', () => {
  if (restore === null || !trigger) return;
  const p = restore;
  restore = null;
  window.scrollTo(0, trigger.start + p * (trigger.end - trigger.start));
  trigger.update();
  settle(trigger);
});

// Zeitleiste je Format (gsap.matchMedia): beim Drehen des Handys wird sie sauber zurückgesetzt und neu gebaut
gsap.matchMedia().add({ phone: PHONE, wide: `not all and ${PHONE}` }, (context) => {
  const { phone } = context.conditions;
  beer.foamAtStart(!phone);
  const tl = gsap.timeline({
    defaults: { ease: 'none' },
    // Handy: Gold-Phase nach der sichtbaren Zeitleiste (mit Glättung) steuern, nicht nach der Scrollposition
    onUpdate: phone ? function () {
      const u = this.time();
      setGold(u >= UNITS - 0.08 && u < UNITS + 0.07, u >= UNITS - 0.08 && u < UNITS + 0.9);
    } : undefined,
    scrollTrigger: {
      trigger: intro,
      start: 'top top',
      end: () => '+=' + (intro.offsetHeight - hero.offsetHeight),     // Strecke, auf der .hero klebt (aus dem CSS)
      scrub: 0.5,
      // inertia aus: sonst rechnet der Schwung eine Station zu weit (0,9 Stufen gescrollt → Station 2 statt 1).
      // delay: erst einrasten, wenn wirklich nicht mehr gescrollt wird (auch Trackpad-Nachlauf abwarten)
      snap: { snapTo, inertia: false, duration: { min: 0.3, max: 0.8 }, delay: 0.2, ease: 'power2.inOut' },
      invalidateOnRefresh: true,
      onUpdate: (self) => {
        beer.velocity(self.getVelocity());                      // schnelles Scrollen lässt das Bier stärker schwappen
        root.classList.toggle('snap-sections', self.progress >= 1);
        if (restore === null) saved = self.progress;
      },
      onRefresh: settle,
    },
  });
  trigger = tl.scrollTrigger;
  for (let i = 0; i <= TOTAL; i++) tl.addLabel('station-' + i, i);
  tl.fromTo(state, { u: 0 }, { u: UNITS, duration: UNITS, onUpdate: () => { current = state.u; requestDraw(); } }, 0);

  if (phone) {
    // Handy: Start ohne Titel, Pfeil nach unten blendet beim ersten Scrollen aus. Nach dem Zoom auf den Kronkorken
    // blendet der Rahmen aus und Titel, Trennstrich und „Helles aus Agatharied“ erscheinen. Rückwärts genau umgekehrt.
    // Startwerte immer ausdrücklich setzen (fromTo): nach dem Drehen des Handys dürfen keine Werte der anderen Ansicht bleiben
    tl.fromTo('.scroll-cue', { opacity: 1 }, { opacity: 0, duration: 0.15 }, 0);
    tl.fromTo('#start > .frame', { opacity: 1 }, { opacity: 0, duration: 0.3 }, UNITS - 0.3);
    tl.fromTo('.hero__text', { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.35 }, UNITS - 0.35);
    // Kronkorken-Bild wird schon am Ende des Zooms zum flachen Bier-Gold (ohne dunklen Rand, nahtlos ins Bier)
    tl.fromTo(gold, { v: 0 }, {
      v: 1, duration: 0.2, onUpdate: () => {
        beerLayer.style.opacity = gold.v;
        canvas.style.opacity = gold.v > 0 ? 1 - gold.v : '';
      },
    }, UNITS - 0.25);
  } else {
    // Desktop: Titel unten blendet beim Zoom aus, Schriftzug erscheint auf dem goldenen Kronkorken
    tl.fromTo('.hero__text', { opacity: 1, y: 0 }, { opacity: 0, y: -24, duration: 0.45 }, UNITS - 1);
    tl.set('#start > .frame', { opacity: 1 }, 0);
    tl.fromTo('.cap-title', { opacity: 0, scale: 0.94 }, { opacity: 1, scale: 1, duration: 0.5 }, UNITS - 0.5);
  }

  // ── Letzte Stufe: das Bier leert sich (js/bier-leeren.js) ──
  // Flache Goldfläche mit Welle und Schaumkrone ersetzt das Kronkorken-Bild, der Pegel sinkt mit dem Scrollen,
  // darüber wird der beige Hintergrund frei. Übergabe an bier-leeren.js allein über den Zustand der Zeitleiste
  // (drain.p 0…1): gleiches Ergebnis, egal ob langsam gescrollt, gesprungen oder neu geladen.
  tl.fromTo(drain, { p: 0 }, {
    p: 1, duration: DRAIN, onUpdate: () => {
      // Desktop: Übergang Kronkorken-Bild → flaches Gold in den ersten 5 % der Stufe (Handy: schon beim Zoom)
      if (!phone) {
        const fade = Math.min(1, drain.p / 0.05);
        beerLayer.style.opacity = fade;
        canvas.style.opacity = drain.p > 0 ? 1 - fade : '';
      }
      beer.level(drain.p);
      root.classList.toggle('is-draining', drain.p > 1e-3 && drain.p < 1);   // Bläschen steigen nur, solange Bier zu sehen ist
    },
  }, UNITS);

  // beim Drehen (Wechsel Handy ↔ Desktop) Gold-Phase und Übergänge zurücksetzen
  return () => {
    setGold(false, false);
    beerLayer.style.opacity = '';
    canvas.style.opacity = '';
    root.classList.remove('is-draining');
  };
});

window.addEventListener('resize', () => requestAnimationFrame(resize), { passive: true });
portrait.addEventListener('change', () => { loadSet(); });
resize();
loadSet();
