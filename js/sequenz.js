// Seiteneinstieg als Bildsequenz („Canvas-Scrollytelling“ wie bei Apple-Produktseiten).
// Die Bilder werden vorab aus der 3D-Szene gerendert (tools/sequenz-rendern.html + tools/sequenz.py);
// hier wird beim Scrollen nur noch das passende Bild auf ein <canvas> gezeichnet → flüssig auch auf alten Handys.
//
// Desktop und Handy haben eigene Bildfolgen (assets/sequenz/manifest.json → sets), gleich viele Scroll-Stufen:
//   Flasche frontal · Vogelperspektive · Zoom auf den Kronkorken. Am Desktop steht der Titel am Start und ist weg,
//   bevor die Flasche in seinen Bereich kommt; am Handy gibt es am Start keinen Titel, dafür einen Pfeil nach unten.
//   Ab dem bildfüllenden Kronkorken ist der Ablauf auf ALLEN Geräten gleich (eine Logik, kein Gerätezweig): der Rahmen
//   blendet aus, die Seite taucht ins Gold, der Titel erscheint unten, dann leert sich das Bier (js/bier-leeren.js)
//   → danach folgen die Inhalte.
//
// Grundsatz: Die Sequenz ist eine reine Funktion des Scrollfortschritts (0 bis 1). Egal wie schnell, in welche
// Richtung oder wann gescrollt wird: dieselbe Position ergibt immer dasselbe Bild. Es gibt kein Einrasten, keine
// Zeitleiste, die starten oder neu starten kann, und keine Bibliothek.
//   · Das Layout steht allein im CSS (.intro ist hoch, .hero klebt per sticky) → die Seite hat ab dem ersten Pixel
//     ihre endgültige Höhe, egal wann dieses Skript geladen wird. Die Scrollposition gehört dem Browser.
//   · Fortschritt = Scrollposition im .intro. Ein requestAnimationFrame-Durchlauf berechnet daraus ALLES: Bildnummer,
//     Titel, Rahmen, Pfeil, Goldphase und Bierpegel. Er läuft nur, solange sich etwas bewegt.
//   · Der Fortschritt wird leicht nachgeführt (0,2 pro Bild, höchstens 2 Bilder Rückstand): weich bei Trackpad-
//     Schwung, aber nie hinterher. Im Ruhezustand ist er exakt die Scrollposition.
//   · Bilder: Zuerst winzige Ersatzbilder (mini/) für die ganze Strecke, dazu die scharfen Bilder rund um die
//     Position. Gezeichnet wird das passendste geladene Bild, nie ein leeres Canvas. Bilder werden vor der
//     Benutzung dekodiert (createImageBitmap); nur ein Fenster um die Position bleibt im Speicher (Handy-Safari).
// Zum Einstellen der Abläufe siehe apply(): alle Übergänge stehen dort als Funktion der Stufe u (0 bis 3).

import { createBeer } from './bier-leeren.js';

const BASE = 'assets/sequenz/';
const root = document.documentElement;
const canvas = document.getElementById('sequenz');
const ctx = canvas.getContext('2d', { alpha: false });
const intro = document.querySelector('.intro');
const hero = document.getElementById('start');
const PHONE = '(max-aspect-ratio: 4/5)';   // Hochformat: Handy-Bildfolge, Handy-Standbild und Handy-Ablauf
const portrait = window.matchMedia(PHONE);

const manifest = await (await fetch(BASE + 'manifest.json')).json();
const UNITS = manifest.sets.desktop.stations.length - 1;   // Scroll-Stufen mit Renderbildern (bei beiden Formaten gleich)
const DRAIN = 1;                                           // + letzte Stufe „das Bier leert sich“ (js/bier-leeren.js, kein Bild)
const TOTAL = UNITS + DRAIN;
if (manifest.sets.mobil.stations.length - 1 !== UNITS) console.warn('Desktop und Handy brauchen gleich viele Stationen');
// Die Höhe des Startbereichs steht im CSS (--steps): muss zu den Stufen hier passen
if (parseInt(getComputedStyle(root).getPropertyValue('--steps'), 10) !== TOTAL) {
  console.warn(`--steps in css/style.css muss ${TOTAL} sein (Stufen in js/sequenz.js)`);
}

const el = {
  cue: hero.querySelector('.scroll-cue'),
  frame: hero.querySelector(':scope > .frame'),
  text: hero.querySelector('.hero__text'),
  header: document.querySelector('.site-header'),
  beer: hero.querySelector('.beer'),
};
const beer = createBeer(hero);
const themeColor = document.querySelector('meta[name="theme-color"]');
const CREAM = themeColor.content, GOLD = '#C5A149';           // GOLD = --gold-beer

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const ramp = (u, a, b) => clamp01((u - a) / (b - a));         // 0 vor a, 1 nach b, dazwischen linear
const size = (img) => [img.naturalWidth || img.width, img.naturalHeight || img.height];

// ── Format (Handy/Desktop) ──────────────────────
let isPhone = portrait.matches, set, spec, ST, N;

function useSet() {
  isPhone = portrait.matches;
  set = isPhone ? 'mobil' : 'desktop';
  spec = manifest.sets[set];
  ST = spec.stations;                                         // Bildnummer je Station, z. B. [0, 36, 84]
  N = spec.frames;
}
useSet();

// Bildnummer zur Stufe u (0…UNITS), stückweise linear zwischen den Stationen
function frameAt(u) {
  const c = Math.min(UNITS, Math.max(0, u)), i = Math.min(UNITS - 1, Math.floor(c));
  return ST[i] + (ST[i + 1] - ST[i]) * (c - i);
}

// ── Laden ───────────────────────────────────────
// mini = winziges Ersatzbild (alle, sofort), full = scharfes Bild (nur ein Fenster um die Position),
// still = Ruhebild der Startstation in voller Schärfe (passt pixelgenau zum Standbild der Seite).
const AHEAD = 20, BEHIND = 8;          // Fenster der scharfen Bilder in/gegen die Scrollrichtung (Speicher: Handy-Safari)
const MAX_LOADS = 6;
let full, mini, still, inflight, failed, run = 0;
let frameNow = 0, dirSign = 1, wantStill = false;

const pad = (n) => String(n).padStart(3, '0');
const urlOf = (kind, i) => (kind === 'still' ? `${BASE}${set}/still-${pad(ST[0] + 1)}.webp`
  : kind === 'mini' ? `${BASE}${set}/mini/${pad(i + 1)}.webp` : `${BASE}${set}/${pad(i + 1)}.webp`);
const busy = (kind, i) => inflight.has(kind + i) || failed.has(kind + i);
const inWindow = (i) => i >= frameNow - (dirSign >= 0 ? BEHIND : AHEAD) && i <= frameNow + (dirSign >= 0 ? AHEAD : BEHIND);

async function fetchBitmap(url, priority) {
  const res = await fetch(url, { priority });                 // priority: high/auto (wo unterstützt)
  if (!res.ok) throw new Error(res.status);
  const blob = await res.blob();
  return window.createImageBitmap ? createImageBitmap(blob) : new Promise((ok, no) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = no;
    img.src = URL.createObjectURL(blob);
  });
}

// Bilder nach Abstand zur aktuellen Bildnummer, in Scrollrichtung zuerst
let orderKey = '', orderList = [];
function order() {
  const key = frameNow + ':' + dirSign;
  if (key === orderKey) return orderList;
  orderKey = key;
  orderList = [];
  for (let d = 0; d < N; d++) {
    const a = frameNow + d * dirSign, b = frameNow - d * dirSign;
    if (a >= 0 && a < N) orderList.push(a);
    if (d && b >= 0 && b < N) orderList.push(b);
  }
  return orderList;
}

function nextJob() {
  if (wantStill && !still && !busy('still', 0)) return ['still', 0, 'high'];
  const c = order();
  for (const i of c.slice(0, 3)) if (!full[i] && !busy('full', i)) return ['full', i, 'high'];   // genau dieses Bild + Nachbarn
  for (const i of c) if (!mini[i] && !busy('mini', i)) return ['mini', i, i === c[0] ? 'high' : 'auto'];
  for (const i of c) if (inWindow(i) && !full[i] && !busy('full', i)) return ['full', i, 'auto'];
  return null;
}

async function startJob([kind, i, priority]) {
  const my = run, key = kind + i;
  inflight.add(key);
  try {
    const bmp = await fetchBitmap(urlOf(kind, i), priority);
    if (my !== run || (kind === 'full' && !inWindow(i))) { bmp.close?.(); return; }
    if (kind === 'still') still = bmp; else (kind === 'mini' ? mini : full)[i] = bmp;
  } catch (e) {
    if (my === run) failed.add(key);                          // einzelnes Bild fehlt → nächstliegendes wird gezeichnet
  } finally {
    if (my === run) { inflight.delete(key); schedule(); }
  }
}

function pump() {
  while (inflight.size < MAX_LOADS) {
    const job = nextJob();
    if (!job) break;
    startJob(job);
  }
}

// Scharfe Bilder außerhalb des Fensters wieder freigeben (das gerade gezeichnete bleibt, bis ein anderes gezeichnet ist)
function evict() {
  for (let i = 0; i < N; i++) {
    if (full[i] && full[i] !== shown && !inWindow(i)) { full[i].close?.(); full[i] = undefined; }
  }
}

// Neues Format (Drehen): alle Bilder freigeben, außer dem gerade gezeigten. Es bleibt stehen, bis das erste
// Bild des neuen Formats gezeichnet ist → beim Drehen nie ein leeres (schwarzes) Canvas.
function reset() {
  run++;
  [...(full || []), ...(mini || []), still].forEach((b) => { if (b && b !== shown) b.close?.(); });
  full = new Array(N); mini = new Array(N); still = undefined;
  inflight = new Set(); failed = new Set();
  orderKey = '';
}
const current = (img) => full.includes(img) || mini.includes(img) || img === still;

// ── Zeichnen ────────────────────────────────────
// Passendstes geladenes Bild: scharf (bis 2 Bilder daneben), sonst das Ersatzbild genau dieser Nummer,
// sonst das nächstliegende überhaupt. Nie leer.
function pick(f) {
  for (let d = 0; d <= 2; d++) {
    if (full[f - d]) return full[f - d];
    if (d && full[f + d]) return full[f + d];
  }
  if (mini[f]) return mini[f];
  for (let d = 1; d < N; d++) {
    for (const i of [f - d, f + d]) if (full[i] || mini[i]) return full[i] || mini[i];
  }
  return null;
}

let shown = null;      // zuletzt gezeichnetes Bild: bleibt stehen, bis ein passenderes geladen ist (nie leeres Canvas)
let stale = true;      // Canvas neu angelegt (Größe geändert) → muss neu gezeichnet werden
let ready = false;

function draw(u) {
  const img = (wantStill && still) || pick(frameNow) || shown;
  if (!img || (img === shown && !stale)) return;
  const previous = shown;
  shown = img;
  stale = false;
  if (previous && previous !== img && !current(previous)) previous.close?.();   // Bild des vorigen Formats jetzt freigeben

  // Bildhöhe = Fensterhöhe (Flasche liegt so exakt wie das Standbild), waagrecht zentriert.
  // Ist das Fenster breiter als das Bild, wird der Randstreifen des Bildes seitlich gestreckt (nahtlos).
  const [iw, ih] = size(img);
  const W = canvas.width, H = canvas.height, s = H / ih;
  const dw = iw * s, dx = (W - dw) / 2;
  ctx.drawImage(img, dx, 0, dw, H);
  if (dx > 0) {
    const bar = Math.ceil(dx) + 1;
    ctx.drawImage(img, 0, 0, 1, ih, 0, 0, bar, H);
    ctx.drawImage(img, iw - 1, 0, 1, ih, W - bar, 0, bar, H);
  }
  // Standbild blendet erst aus, wenn das scharfe Ruhebild der Startstation steht (oder man mitten in der Sequenz ist)
  if (!ready && (img === still || u >= 0.02)) {
    ready = true;
    root.classList.add('is-ready');
    setTimeout(() => { document.querySelector('.poster').style.visibility = 'hidden'; }, 1200);   // … und verschwindet ganz
  }
}

// Canvas nur bei echter Größenänderung neu anlegen (Höhe = 100lvh, die Adressleiste ändert sie nicht)
function resizeCanvas() {
  const cw = canvas.clientWidth, ch = canvas.clientHeight;
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (cw * ch * dpr * dpr > 12e6) dpr = Math.sqrt(12e6 / (cw * ch));      // Safari: Canvas höchstens ca. 16 Mio. Pixel
  const w = Math.round(cw * dpr), h = Math.round(ch * dpr);
  if (w === canvas.width && h === canvas.height) return;
  canvas.width = w;
  canvas.height = h;
  stale = true;
}

// ── Alles aus der Stufe u ───────────────────────
// Stufe u = Fortschritt × 3: 0 bis 2 Kamerafahrt (Bilder), 2 bis 3 das Bier leert sich.
let last = {};
function put(key, node, prop, value) {                       // schreibt nur, was sich ändert
  if (!node || last[key] === value) return;
  last[key] = value;
  if (prop.startsWith('--')) node.style.setProperty(prop, value); else node.style[prop] = value;
}
function setGold(top, page) {
  if (last.goldTop !== top) { last.goldTop = top; themeColor.content = top ? GOLD : CREAM; }
  if (last.goldPage !== page) { last.goldPage = page; root.classList.toggle('gold-page', page); }
}

function apply(u) {
  const pd = clamp01(u - UNITS);                             // Bierpegel: 0 = voll … 1 = leer

  // Start (nur Handy: Pfeil nach unten blendet beim ersten Scrollen aus; am Desktop gibt es ihn nicht, siehe CSS)
  put('cue', el.cue, 'opacity', String(1 - ramp(u, 0, 0.15)));

  // Titel: am Handy erst am Ende; am Desktop steht er am Start und ist weg, bevor die Flasche in seinen Bereich kommt
  // (titleClear: aus den Bildern gemessen, tools/sequenz.py). Am Ende erscheint er auf allen Geräten unten, mit Trennlinie
  // und „Helles aus Agatharied“.
  const clear = spec.titleClear ?? 0.2;
  const late = u >= 1;
  const start = isPhone ? 0 : 1 - ramp(u, Math.max(0.02, clear - 0.17), Math.max(0.06, clear - 0.02));
  const end = ramp(u, UNITS - 0.35, UNITS);
  put('text', el.text, 'opacity', String(late ? end : start));
  put('textY', el.text, 'transform', `translate3d(0, ${(late ? 16 * (1 - end) : -24 * (1 - start)).toFixed(2)}px, 0)`);

  // Rahmen mit Eckverzierung blendet auf ALLEN Geräten aus, sobald der Kronkorken bildfüllend ist; „Hofer Bräu“ oben
  // bleibt frei stehen (sein Hintergrund folgt dem Rahmen über --frame-o)
  const frame = String(1 - ramp(u, UNITS - 0.3, UNITS));
  put('frame', el.frame, 'opacity', frame);
  put('frameO', el.header, '--frame-o', frame);

  // Kronkorken-Bild wird schon am Ende des Zooms zum flachen Bier-Gold (ohne dunklen Rand, nahtlos ins Bier)
  const v = ramp(u, UNITS - 0.25, UNITS - 0.05);
  put('beer', el.beer, 'opacity', String(v));
  put('canvas', canvas, 'opacity', v > 0 ? String(1 - v) : '');

  // Die ganze Seite taucht ins Gold, auch hinter Statusleiste und Adressleiste (Seitenhintergrund + Browserfarbe).
  // Oben wird es wieder beige, sobald die Schaumkrone von oben kommt, unten erst, wenn das Bier den unteren Rand verlassen hat.
  setGold(u >= UNITS - 0.08 && u < UNITS + 0.07, u >= UNITS - 0.08 && u < UNITS + 0.9);

  // Letzte Stufe: das Bier leert sich (js/bier-leeren.js). Der Pegel hängt nur an u; das Schwappen verformt nur die Welle.
  beer.level(pd);
  const draining = pd > 1e-3 && pd < 1;                      // Bläschen steigen nur, solange Bier zu sehen ist
  if (last.draining !== draining) { last.draining = draining; root.classList.toggle('is-draining', draining); }
}

// Beim Wechsel Handy ↔ Desktop (Drehen): nichts von der anderen Ansicht stehen lassen
function resetLook() {
  last = {};
  for (const node of [el.cue, el.frame, el.text, el.beer, canvas]) if (node) { node.style.opacity = ''; node.style.transform = ''; }
  el.header?.style.removeProperty('--frame-o');
  setGold(false, false);
  root.classList.remove('is-draining');
}

// ── Steuerung ───────────────────────────────────
let range = 0;                       // Scrollstrecke des Startbereichs (px), aus dem CSS
let target = 0, s = 0, u = 0;        // Fortschritt laut Scrollposition, nachgeführter Fortschritt, Stufe
let firstTick = true, raf = 0, lastTime = 0, lastY = 0, lastWidth = window.innerWidth;

const measure = () => { range = intro.offsetHeight - hero.offsetHeight; };
const introTop = () => intro.getBoundingClientRect().top;
function schedule() { if (!raf) raf = requestAnimationFrame(tick); }

function tick(now) {
  raf = 0;
  const dt = Math.min(64, Math.max(1, now - (lastTime || now - 16.7)));
  lastTime = now;
  const y = window.scrollY;
  if (y !== lastY) {
    dirSign = y > lastY ? 1 : -1;
    if (u > UNITS - 0.05) beer.velocity(((y - lastY) / dt) * 1000);   // schnelles Scrollen: Bier schwappt stärker (nur im Bier-Abschnitt)
  }
  lastY = y;

  target = range > 0 ? clamp01(-introTop() / range) : 0;
  if (firstTick) { s = target; firstTick = false; }         // nach Neuladen oder spätem Start sofort an der richtigen Stelle
  else {
    s += (target - s) * (1 - Math.pow(0.8, dt / 16.7));     // leichte Glättung, unabhängig von der Bildrate
    const lag = 2 / Math.max(1, ST[1] - ST[0]) / TOTAL;      // höchstens 2 Bilder Rückstand (in Fortschritt)
    s = Math.min(target + lag, Math.max(target - lag, s));
    if (Math.abs(target - s) < 0.0002) s = target;          // im Ruhezustand exakt die Scrollposition
  }
  u = s * TOTAL;

  frameNow = Math.round(frameAt(u));
  const st = Math.round(u);
  wantStill = st === 0 && Math.abs(u) < 0.002;
  apply(u);
  evict();
  pump();
  draw(u);
  if (s !== target) schedule();                              // läuft nur, bis die Glättung angekommen ist (Ladefortschritt ruft schedule() selbst)
}

// Dieselbe Stelle der Sequenz bleibt stehen, wenn sich die Breite ändert (Handy drehen, Fenster ziehen):
// Die Pixelposition allein würde nach dem Umbau zu einer anderen Stelle führen.
function onResize() {
  const p = target;
  const widthChanged = window.innerWidth !== lastWidth;
  lastWidth = window.innerWidth;
  measure();
  resizeCanvas();
  if (widthChanged && p > 0 && p < 1 && range > 0) {
    window.scrollTo(0, Math.round(window.scrollY + introTop() + p * range));
  }
  schedule();
}

function onFormatChange() {
  useSet();
  reset();
  resetLook();
  stale = true;
  firstTick = true;
  schedule();
}

measure();
resizeCanvas();
useSet();
reset();
resetLook();
window.addEventListener('scroll', schedule, { passive: true });
window.addEventListener('resize', onResize, { passive: true });
window.addEventListener('pageshow', schedule);
portrait.addEventListener('change', onFormatChange);
schedule();

// Nur lesend, für tools/tests/ (Bild, Fortschritt, Stufe)
window.__sequenz = {
  get u() { return u; }, get progress() { return s; }, get target() { return target; }, get frame() { return frameNow; },
  get shown() { return shown ? (shown === still ? 'still' : mini.includes(shown) ? 'mini' + mini.indexOf(shown) : 'full' + full.indexOf(shown)) : null; },
  get loaded() { return { full: full.filter(Boolean).length, mini: mini.filter(Boolean).length, still: !!still }; },
};
