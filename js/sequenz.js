// Startsequenz als Zustandsautomat mit genau zwei Gesten (gleich auf Handy, iPad und Desktop):
//
//   A  Start: Flasche frontal auf Augenhöhe, Rahmen mit „Hofer Bräu“
//   ── Geste 1: EINE durchgehende Animation (Zeit statt Scrollen, ca. 2,8 s): Kamera fährt nach oben in die Vogelperspektive und in
//      den Kronkorken; während des Zooms geht der Kronkorken von der Mitte aus in die Bierfarbe über (kein Goldbildschirm), daraus
//      entsteht die Bierfläche mit Bläschen, der Rahmen blendet aus, die Schaumkrone senkt sich, der Titel erscheint.
//   B  Bier: Bild voll Bier von Rand zu Rand, Schwappen aktiv, kein Rahmen
//   ── Geste 2: das Bier leert sich (ca. 2,7 s), der Titel rutscht mit dem Bierspiegel nach oben, Einleitung und Schafe erscheinen
//   C  Inhalt: normal scrollbare Seite, Titel oben, darunter Einleitung und Herde
//
// Rückweg: nur innerhalb des Intros (Geste nach oben in B spielt Übergang 1 rückwärts: B → A). Das Intro läuft EINMAL: in C sind alle
// Gesten-Listener entfernt, die Seitensperre ist aufgehoben, Canvas und Bilder sind aus dem Speicher (teardown). Nichts wird im Browser
// gespeichert. Der Link „Bier Animation erneut anzeigen“ im Fuß scrollt nach oben und spielt das Intro ab A erneut ab (replay), danach wieder einmalig.
//
// Grundsätze
//   · Die Seite ist in A und B gesperrt (CSS .seq ohne .frei, ab dem ersten Pixel). Die Gesten erkennt dieses Skript selbst.
//   · Alles hängt an EINEM Fortschrittswert P (0 = A, 1 = B, 2 = C), der per Zeit animiert wird. Jeder Zustand ist eine reine Funktion
//     von P (render): nichts summiert sich aus Ereignissen auf, am Ende jeder Animation wird der Zielzustand ausdrücklich gesetzt.
//   · Eingabesperre: während einer Animation, danach 400 ms und bis das Trackpad-Nachlaufen (Mausrad-Ereignisse) abgeklungen ist
//     werden Gesten ignoriert, sonst löste ein einziger Flick beide Übergänge aus.
//   · Bilder: alle Dateien werden nach dem Startbild geladen; dekodiert (createImageBitmap) wird ein Fenster um die Position.
//     Fehlt ein Bild noch, hält die Zeit an (nie ein fehlender Frame). Ist Geste 1 zu früh, pulsiert der Pfeil und die Animation
//     startet von selbst, sobald alles da ist.
//   · Neu laden mit Position über 0 und Direktlinks (#…) landen ohne Animation direkt in C.

import { createBeer } from './bier-leeren.js?v=36fccb05';
import { ladeHerde } from './herde.js?v=36fccb05';

const BASE = 'assets/sequenz/';
const root = document.documentElement;
const canvas = document.getElementById('sequenz');
const ctx = canvas.getContext('2d', { alpha: false });
const hero = document.getElementById('start');
const PHONE = '(max-aspect-ratio: 4/5)';   // Hochformat: Handy-Bildfolge und Handy-Start (ohne Titel)
const portrait = window.matchMedia(PHONE);

const V = new URL(import.meta.url).search;                      // ?v=… der Code-Version (tools/stempeln.py): neue Version = neue Dateien, kein Mischen mit altem Cache
const manifest = await (await fetch(BASE + 'manifest.json' + V)).json();
const AV = manifest.v ? '?v=' + manifest.v : '';              // Version der Bilder

// ── Einstellungen ───────────────────────────────
const DUR1 = 2800;            // ms, Geste 1 (Kamerafahrt bis zum Bier)
// Geste 2 in zwei klar getrennten Phasen nacheinander (eine Zeitleiste, P läuft linear von 1 nach 2): erst nur das Bier (PH1), kurze Pause, dann fährt der ganze Block gleichzeitig
// nach oben (RIDE): Titel „Berghof Hell“, Schafe, Einleitung und Gemälde gleiten gemeinsam an ihren Platz (alle um denselben Weg, der Block bleibt starr) und blenden dabei gemeinsam
// ein (FADE), dazu der Seitenrahmen.
// Phase 1 (Bier): sofort mit der Geste gleitet die Schaumkrone in 0,3 s von oben ins Bild (PH_IN, ease-out, der Spiegel steht danach direkt unter der Oberkante), danach trinkt „jemand“
// das Glas leer: drei Schlucke mit kleinen Pausen dazwischen (DRINK), der letzte ist der lange Zug bis unter die Unterkante.
const PH_IN = 300, PH1 = 2600, PAUSE = 150, RIDE = 1000, FADE = 550;
const T2 = PH1 + PAUSE + RIDE;                               // 3750 ms insgesamt (Phase 2 = 1 s)
const FOAM_GAP = 12;                                         // px: nach dem Einblenden steht die Schaumkrone ganz im Bild, der Spiegel (mittlere Oberfläche) FOAM_GAP px darunter
// Schlucke: [Ende in ms ab Beginn des Trinkens, Anteil des Weges am Ende, Verlauf]. 'io' = sine.inOut (Zug mit sanftem Anfang und Ende), 'in' = beschleunigt bis zum Schluss (der letzte Zug).
// Kleine Anstiege (0,03) sind die Pausen zum Schlucken, in denen das Bier nur nachsackt und schwappt.
const DRINK = [[420, 0.20, 'io'], [640, 0.23, 'io'], [1120, 0.54, 'io'], [1330, 0.57, 'io'], [1700, 0.77, 'io'], [1860, 0.79, 'io'], [PH1 - PH_IN, 1, 'in']];
const B_LEVEL = 0;            // Pegel im Zustand B (0 = Bierfläche über den ganzen Bildschirm, Spiegel über dem Bildrand, keine Schaumkrone; 1 = leer)
const LOCK_AFTER = 400;       // ms Sperre nach jeder Animation
const WHEEL_IDLE = 150;       // ms ohne Mausrad-Ereignis = neue Geste (davor: Nachlaufen der vorigen)
const WHEEL_WINDOW = 50, WHEEL_MIN = 30, WHEEL_TOTAL = 120;   // Summe über 50 ms ≥ 30 oder ganze Geste ≥ 120
const QUEUE_QUIET = 300, QUEUE_AGE = 1200;   // Mausrad/Trackpad: eine zweite Geste wird nur gemerkt, wenn davor 300 ms Ruhe war und Geste 1 seit 1,2 s läuft (ein Nachläufer nach einem Hänger zählt nicht)
const TOUCH_MIN = 40;         // px senkrecht
const LOAD_TIMEOUT = 30000;   // ms: dauert das Laden so lange, springt Geste 1 direkt zum Inhalt
const LOAD_PARALLEL = 14;     // gleichzeitige Abrufe der Bildfolge (HTTP/2 teilt sich eine Verbindung; vorher 6)
const READY_AT = 0.5;         // Anteil der Bilder (von vorn gezählt), ab dem die Sequenz spielbereit ist und das Ladesymbol weicht; der Rest lädt weiter (Geste 1 braucht die hinteren Bilder erst nach ca. 1,4 s, reicht die Leitung nicht, hält die Zeit kurz an)
const AHEAD = 22, BEHIND = 6; // dekodierte Bilder um die Position (Speicher am Handy schonen)
const GOLD = '#C5A149', GOLD_RGB = '197,161,73';   // = --gold-beer

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const ramp = (g, a, b) => clamp01((g - a) / (b - a));         // 0 vor a, 1 nach b, dazwischen linear
const smooth = (x) => x * x * (3 - 2 * x);
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2);   // power2.inOut (Geste 1)
const easeSine = (t) => (1 - Math.cos(Math.PI * t)) / 2;                    // sine.inOut (ein Schluck: sanfter Anfang, sanftes Ende)
const easeInSine = (t) => 1 - Math.cos(Math.PI * t / 2);                    // sine.in (der letzte Zug beschleunigt)
const easeOut = (t) => 1 - (1 - t) ** 3;                                     // cubic.out (Titel und Einblenden in Phase 2)
const linear = (t) => t;

const el = {
  cue: hero.querySelector('.scroll-cue'),
  frame: hero.querySelector(':scope > .frame'),
  pageFrame: document.querySelector('.frame--page'),
  text: hero.querySelector('.hero__text'),
  more: hero.querySelector('.hero__more'),
  lead: hero.querySelector('.hero__lead'),
  art: hero.querySelector('.painting'),
  herd: hero.querySelector('.herd'),
  beer: hero.querySelector('.beer'),
  header: document.querySelector('.site-header'),
  skip: document.querySelector('[data-skip]'),
  poster: document.querySelector('.poster'),
  content: [...document.querySelectorAll('main > :not(#start), body > footer')],   // in A und B unerreichbar (inert)
};
const beer = createBeer(hero);
const themeColor = document.querySelector('meta[name="theme-color"]');
const CREAM = themeColor.content;
const CREAM_RGB = [247, 244, 236], GOLD_RGB_N = [197, 161, 73];     // #F7F4EC (Papier) und #C5A149 (Bier), exakt wie --cream und --gold-beer

// ── Format (Handy/Desktop) ──────────────────────
let isPhone = portrait.matches, set, spec, ST, N;
function useSet() {
  isPhone = portrait.matches;
  set = isPhone ? 'mobil' : 'desktop';
  spec = manifest.sets[set];
  ST = spec.stations;
  N = spec.frames;
}
useSet();

// ── Zustand ─────────────────────────────────────
let P = 0, state = 'A', busy = false, lockUntil = 0, pending = null, animId = 0, stalls = 0;
let animTo = null, queued = false, tBegin = 0;                            // Ziel der laufenden Animation; eine zweite Wischgeste dazwischen wird gemerkt (Geste 2 folgt sofort auf Geste 1)
const log = [];                                                // für tools/tests: Übergänge

// ── Bilder ──────────────────────────────────────
let blobs = [], bmp = [], still = null, ready = false, run = 0, loadedCount = 0, loadStarted = false, tLoad = performance.now();
const decoding = new Map();
const pad = (n) => String(n).padStart(3, '0');
const urlOf = (i) => `${BASE}${set}/${pad(i + 1)}.webp${AV}`;

async function fetchBlob(url, priority) {
  for (let k = 0; k < 2; k++) {
    try { const r = await fetch(url, { priority }); if (r.ok) return await r.blob(); } catch (e) { /* zweiter Versuch */ }
  }
  return null;
}
const toBitmap = (blob) => (window.createImageBitmap ? createImageBitmap(blob) : new Promise((ok, no) => {
  const img = new Image(); img.onload = () => ok(img); img.onerror = no; img.src = URL.createObjectURL(blob);
}));

function want(i) {                                            // Bild i dekodieren (falls noch nicht)
  if (i < 0 || i >= N || bmp[i] || decoding.has(i) || !blobs[i]) return decoding.get(i);
  const my = run;
  const p = toBitmap(blobs[i]).then((b) => { if (my === run) bmp[i] = b; else b.close?.(); decoding.delete(i); }).catch(() => decoding.delete(i));
  decoding.set(i, p);
  return p;
}
function keep(f, dir) {                                       // Fenster um Bild f, in Fahrtrichtung weiter voraus
  if (framesFreed) return;
  const lo = f - (dir >= 0 ? BEHIND : AHEAD), hi = f + (dir >= 0 ? AHEAD : BEHIND);
  for (let i = Math.max(0, lo); i <= Math.min(N - 1, hi); i++) want(i);
  for (let i = 0; i < N; i++) if (bmp[i] && (i < lo - 2 || i > hi + 2)) { bmp[i].close?.(); bmp[i] = undefined; }
}
let framesFreed = false;
function freeFrames() {                                        // Geste 2 braucht die Bildfolge nicht mehr (die Bierfläche deckt alles, es gibt keinen Rückweg aus C): vor Phase 1 Speicher und Canvas freigeben
  if (framesFreed) return;
  framesFreed = true;
  run++;                                                       // laufende Ladevorgänge verwerfen
  for (let i = 0; i < N; i++) if (bmp[i]) bmp[i].close?.();
  still?.close?.(); still = null;
  blobs = []; bmp = []; decoding.clear();
  shown = null; stale = false;
  canvas.style.display = 'none'; canvas.width = 0; canvas.height = 0;
}
function release() {                                           // nach jeder Animation: Speicher freigeben (das Ruhebild bleibt)
  for (let i = 0; i < N; i++) if (bmp[i]) { bmp[i].close?.(); bmp[i] = undefined; }
}
async function prepare(f, dir) {                              // vor dem Start: die ersten Bilder der Fahrt bereit
  keep(f, dir);
  const first = [];
  for (let k = 0; k < 10; k++) first.push(want(Math.min(N - 1, Math.max(0, f + k * (dir >= 0 ? 1 : -1)))));
  await Promise.all(first);
}

async function loadAll() {
  loadStarted = true; tLoad = performance.now();
  const my = ++run;
  bmp.forEach((b) => b?.close?.());
  blobs = new Array(N); bmp = new Array(N); ready = false; loadedCount = 0; decoding.clear();
  const sb = await fetchBlob(`${BASE}${set}/still-${pad(ST[0] + 1)}.webp${AV}`, 'high');
  if (my !== run) return;
  if (sb) {                                                    // altes Ruhebild bleibt stehen, bis das neue da ist (Drehen: nie schwarz)
    const fresh = await toBitmap(sb);
    if (my !== run) { fresh.close?.(); return; }
    const old = still; still = fresh; if (old && old !== fresh) old.close?.();
    stale = true; render(P);
  }
  let next = 0, prefix = 0;
  const K = Math.ceil(N * READY_AT);
  const freigeben = () => {                                    // die erste Hälfte (lückenlos von vorn) ist da: spielbereit
    if (ready || my !== run) return;
    ready = true;
    root.classList.add('bereit');                              // Ladesymbol aus, Weiter-Pfeil an (CSS)
    setTimeout(ladeHerde, 300);
    if (pending) { const to = pending; pending = null; root.classList.remove('wartet'); begin(to); }
  };
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= N || my !== run) return;
      blobs[i] = await fetchBlob(urlOf(i), i < 8 ? 'high' : 'auto');
      loadedCount++;
      while (prefix < N && blobs[prefix] !== undefined) prefix++;
      if (prefix >= K) freigeben();
    }
  };
  await Promise.all(Array.from({ length: LOAD_PARALLEL }, worker));
  if (my !== run) return;
  for (let i = 0; i < N; i++) {                                // fehlgeschlagene Bilder durch das nächstliegende ersetzen: nie ein fehlender Frame
    if (blobs[i]) continue;
    for (let d = 1; d < N && !blobs[i]; d++) blobs[i] = blobs[i - d] || blobs[i + d] || null;
  }
  if (!blobs.some(Boolean)) { skipToContent(); return; }
  freigeben();
}
function ensureLoaded() { if (!loadStarted) loadAll(); }

// ── Zeichnen ────────────────────────────────────
let shown = null, stale = true, isReady = false;
function paint(img) {
  const W = canvas.width, H = canvas.height, iw = img.width || img.naturalWidth, ih = img.height || img.naturalHeight, s = H / ih;
  const dw = iw * s, dx = (W - dw) / 2;
  ctx.drawImage(img, dx, 0, dw, H);                           // Bildhöhe = Fensterhöhe (Flasche liegt wie im Standbild)
  if (dx > 0) {                                               // breiter als das Bild: Randstreifen seitlich strecken (nahtlos)
    const bar = Math.ceil(dx) + 1;
    ctx.drawImage(img, 0, 0, 1, ih, 0, 0, bar, H);
    ctx.drawImage(img, iw - 1, 0, 1, ih, W - bar, 0, bar, H);
  }
}
function flood(v, f, iw, ih) {                                // Bierfarbe breitet sich von der Mitte des Kronkorkens aus
  if (v <= 0) return;
  const W = canvas.width, H = canvas.height, r = Math.max(2, v * 0.9 * Math.hypot(W, H));
  const cap = spec.cap?.[f] || [0.5, 0.5], dw = iw * (H / ih);        // Kronkorken-Mitte im Bild (aus dem Renderer) → Canvas
  const cx = W / 2 + (cap[0] - 0.5) * dw, cy = cap[1] * H;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, `rgba(${GOLD_RGB},1)`); g.addColorStop(0.62, `rgba(${GOLD_RGB},1)`); g.addColorStop(1, `rgba(${GOLD_RGB},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}
function resizeCanvas() {                                     // nur bei echter Größenänderung (Höhe = 100lvh: Adressleiste ändert sie nicht)
  if (framesFreed) return;
  const cw = canvas.clientWidth, ch = canvas.clientHeight;
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (cw * ch * dpr * dpr > 12e6) dpr = Math.sqrt(12e6 / (cw * ch));      // Safari: Canvas höchstens ca. 16 Mio. Pixel
  const w = Math.round(cw * dpr), h = Math.round(ch * dpr);
  if (w === canvas.width && h === canvas.height) return;
  canvas.width = w; canvas.height = h; stale = true;
}

// ── Zustand aus P ───────────────────────────────
// P: 0 = A (Start), 1 = B (Bier), 2 = C (leer, Inhalt). g = Anteil von Geste 1, h = Anteil von Geste 2.
let last = {};
function put(key, node, prop, value) {                        // schreibt nur, was sich ändert
  if (!node || last[key] === value) return;
  last[key] = value;
  if (prop.startsWith('--')) node.style.setProperty(prop, value); else node.style[prop] = value;
}
// Farben der Browserleisten: Anteil Gold 0 … 1 → Hex (in 1/64-Schritten, schreibt nur bei Änderung).
// oben = Statusleiste (Safari 26: Streifen .edge--top; Chrome Android und iOS bis 25: theme-color), unten = Leiste unter der Seite (Streifen .edge--bottom).
const barHex = (gold) => '#' + [0, 1, 2].map((i) => Math.round(CREAM_RGB[i] + (GOLD_RGB_N[i] - CREAM_RGB[i]) * (Math.round(gold * 16) / 16)).toString(16).padStart(2, '0')).join('');
// iOS Safari 26 ignoriert theme-color und liest die Leistenfarben aus sichtbaren, deckenden, obersten fest positionierten Streifen am oberen bzw. unteren Rand
// (Körper-Hintergrund wäre für beide Leisten derselbe). Er liest einen Streifen nur beim Erzeugen und merkt sich dessen Farbe: bei jeder neuen Farbe kommt deshalb
// ein neuer Streifen obenauf, der alte wird danach entfernt. Nur dort (Touch + WebKit), Desktop und Android Chrome (theme-color) bleiben unberührt.
const stripsOn = window.matchMedia('(hover: none) and (pointer: coarse)').matches && window.CSS?.supports?.('-webkit-touch-callout', 'none');
const strips = { top: null, bottom: null };
function paintStrip(side, hex) {
  if (!stripsOn) return;
  const e = document.createElement('div');
  e.className = 'edge edge--' + side;
  e.setAttribute('aria-hidden', 'true');
  e.style.backgroundColor = hex;
  document.body.appendChild(e);
  const old = strips[side];
  strips[side] = e;
  if (old) requestAnimationFrame(() => old.remove());
}
function dropStrips() {                                         // in C (normale Seite) fallen die Leisten auf den Seitenhintergrund (beige) zurück
  for (const side of ['top', 'bottom']) { if (strips[side]) strips[side].remove(); strips[side] = null; }
  last.barTop = last.barBottom = undefined;
}
function setGold(top, bottom, page) {
  const ct = barHex(top), cb = barHex(bottom);
  if (last.barTop !== ct) { last.barTop = ct; themeColor.content = ct; paintStrip('top', ct); }
  if (last.barBottom !== cb) { last.barBottom = cb; paintStrip('bottom', cb); }
  if (last.goldPage !== page) { last.goldPage = page; root.classList.toggle('gold-page', page); }
}
// Titel: in C steht er oben (normales Layout), in A und B unten im Bild. textDy ist der Weg dazwischen in px (gemessen);
// beim Leeren rutscht der Titel mit demselben Fortschritt wie der Bierspiegel nach oben.
let textDy = 0;
function measureDy() {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;left:0;top:0;width:0;height:100svh;pointer-events:none;visibility:hidden';
  const pad = document.createElement('div');
  pad.style.cssText = 'position:absolute;left:0;width:0;height:0;bottom:var(--b-pad)';
  hero.append(probe, pad);
  const H = probe.getBoundingClientRect().height;
  const bPad = hero.getBoundingClientRect().bottom - pad.getBoundingClientRect().bottom;
  probe.remove(); pad.remove();
  // Block aus Titel, Einleitung und Gemälde mittig im ersten Bildschirm (Tablet/Desktop), wenn er niedriger ist als der Bildschirm: --lift schiebt ihn nach unten.
  // Das wirkt nur auf das Layout in C; in A und B bleibt der Titel unten verankert (textDy wird danach mit dem neuen Platz gemessen), nichts springt.
  hero.style.setProperty('--lift', '0px');
  const fig = hero.querySelector('.painting'), top0 = el.text.offsetTop;
  const lift = fig && window.innerWidth >= 768 ? Math.max(0, Math.min(200, Math.round((H - (fig.offsetTop + fig.offsetHeight - top0)) / 2 - top0))) : 0;
  hero.style.setProperty('--lift', lift + 'px');
  textDy = H - bPad - el.text.offsetHeight - el.text.offsetTop;
  const lead = hero.querySelector('.hero__lead');   // Handy: Herde im Bereich unter der Einleitung (--zone, 16 px Abstand zum Text) und das Gemälde darunter, unter dem ersten Bildschirm (--fold)
  if (lead) {
    const bottom = lead.offsetTop + lead.offsetHeight;
    hero.style.setProperty('--zone', Math.max(0, H - bottom - 16 - 28) + 'px');
    hero.style.setProperty('--fold', Math.max(0, H - bottom) + 'px');
  }
}
function drink(ms) {                                          // Anteil 0 … 1 des Weges nach dem Einblenden, ms ab Beginn des Trinkens
  let t0 = 0, d0 = 0;
  for (const [t1, d1, shape] of DRINK) {
    if (ms <= t1) { const u = (ms - t0) / (t1 - t0); return d0 + (d1 - d0) * (shape === 'in' ? easeInSine(u) : easeSine(u)); }
    t0 = t1; d0 = d1;
  }
  return 1;
}
// Bierpegel 0 … 1 (Phase 1 von Geste 2: erst Schaumkrone ein, dann die Schlucke; danach leer). Start und Ende des Weges kommen aus der echten Höhe des Bier-Layers (beer.levelAt, 100lvh).
function levelOf(p) {
  if (p <= 1) return B_LEVEL * smooth(ramp(p, 0.78, 1));
  const T = (p - 1) * T2;                                      // ms seit Beginn von Geste 2
  if (T >= PH1) return 1;
  const p1 = beer.levelAt(beer.foamHeight() + FOAM_GAP);       // Pegel mit der Schaumkrone ganz im Bild
  if (T <= PH_IN) return B_LEVEL + (p1 - B_LEVEL) * easeOut(T / PH_IN);
  return p1 + (1 - p1) * drink(T - PH_IN);
}
const frameOf = (p) => Math.round(ramp(Math.min(1, p), 0, 0.85) * (N - 1));   // Kamerafahrt über die ersten 85 % von Geste 1

// Zeichnet das Canvas zu P. false, wenn ein nötiges Bild noch nicht dekodiert ist.
function drawCanvas(pv) {
  const g = Math.min(1, pv), f = frameOf(pv);
  const canvasOn = g < 0.8;                                    // ab hier deckt die Bierfläche alles
  if (canvasOn) {
    const img = pv === 0 && still ? still : bmp[f];
    if (!img) return false;
    if (img !== shown || stale || g > 0) { paint(img); flood(smooth(ramp(g, 0.45, 0.72)), f, img.width || img.naturalWidth, img.height || img.naturalHeight); shown = img; stale = false; }
    if (!isReady) { isReady = true; root.classList.add('is-ready'); setTimeout(() => { el.poster.style.visibility = 'hidden'; }, 1200); }
  }
  put('canvas', canvas, 'visibility', canvasOn ? 'visible' : 'hidden');
  if (pv > 0) el.poster.style.visibility = 'hidden';            // Standbild sofort weg, sobald es losgeht (kein Durchscheinen beim Ausblenden)
  return true;
}

// Alles außer dem Canvas: eine reine Funktion von P
function overlays(pv) {
  const g = Math.min(1, pv), h = Math.max(0, pv - 1), f = frameOf(pv);

  // Titel: am Handy erst mit dem Bier; am Desktop steht er am Start und ist weg, bevor die Flasche in seinen Bereich kommt
  // (titleClear: aus den Bildern gemessen, tools/sequenz.py). Mit dem Bier erscheint er auf allen Geräten unten.
  const u1 = f / ST[1], clear = spec.titleClear ?? 0.3;
  const start = isPhone ? 0 : 1 - ramp(u1, Math.max(0.02, clear - 0.17), Math.max(0.06, clear - 0.02));
  const end = ramp(g, 0.85, 1);
  const late = g >= 0.5;
  put('text', el.text, 'opacity', String(late ? end : start));
  // Geste 2, Phase 2: der Titel bleibt in Phase 1 ruhig unten (textDy ist der gemessene Weg, FLIP: nur translate3d). Nach der Pause fährt der ganze Block gleichzeitig nach oben:
  // Titel (mit den Schafen daneben), Einleitung, Gemälde und die Herde am Handy gleiten um denselben Weg und blenden gemeinsam ein (nur transform und opacity)
  const T = h * T2;                                              // ms seit Beginn von Geste 2
  const ride = easeOut(ramp(T, PH1 + PAUSE, PH1 + PAUSE + RIDE));    // Fahrt 0 … 1
  const einblenden = easeOut(ramp(T, PH1 + PAUSE, PH1 + PAUSE + FADE));    // Einblenden 0 … 1
  const dy = textDy * (1 - ride);                                // noch zu fahrender Weg (px)
  put('textY', el.text, 'transform', `translate3d(0, ${((late ? 16 * (1 - end) : -24 * (1 - start)) + dy).toFixed(1)}px, 0)`);
  const prime = pv >= 1 ? 0.01 : 0;                            // ab B: Einleitung, Gemälde, Schafe und Seitenrahmen unmerklich (1 %) schon gezeichnet: Dekodieren und Rastern
                                                               // passiert vor dem Einblenden und nicht mittendrin (sonst ruckelt das Auftauchen am Ende von Geste 2)
  put('more', el.more, 'opacity', prime ? '1' : '0');
  put('moreV', el.more, 'visibility', prime ? 'visible' : 'hidden');
  const show = (key, node, move) => {
    put(key, node, 'opacity', Math.max(einblenden, prime).toFixed(3));
    if (move) put(key + 'Y', node, 'transform', ride >= 1 ? 'none' : `translate3d(0, ${dy.toFixed(1)}px, 0)`);
  };
  show('herd', el.herd, true);                                  // Herde unten (Handy)
  show('lead', el.lead, true);                                  // Einleitungstext
  show('art', el.art, true);                                    // Gemälde
  const frameC = einblenden;                                    // Seitenrahmen (C): blendet gleichzeitig ein
  put('pageFrame', el.pageFrame, 'opacity', Math.max(frameC, prime).toFixed(3));

  // Rahmen mit Eckverzierung blendet auf allen Geräten aus; „Hofer Bräu“ oben bleibt frei (Hintergrund folgt über --frame-o)
  const frameA = 1 - ramp(g, 0.5, 0.72);                       // Startrahmen: noch während des Zooms weg, vor dem flachen Bier-Gold
  put('frame', el.frame, 'opacity', String(frameA));
  put('frameO', el.header, '--frame-o', String(Math.max(frameA, frameC)));   // Creme-Fläche hinter „Hofer Bräu“ unterbricht die Rahmenlinie, solange ein Rahmen steht

  // Bierfläche (mit Bläschen) legt sich über den Farbwechsel des Kronkorkens
  put('beer', el.beer, 'opacity', String(ramp(g, 0.6, 0.8)));

  // Seite taucht ins Gold (Hintergrund + Browserfarbe); oben wieder beige, sobald die Schaumkrone ins Bild sinkt, unten erst beim leeren Glas
  const p = levelOf(pv);
  // Statusleiste oben: beige, sobald die Schaumkrone ins Bild kommt (ab da liegt unter ihr nie mehr Gold); Leiste unten: bierfarben, solange unten noch Bier zu sehen ist,
  // und erst dann weich zu beige, wenn die Oberfläche (mit Wellen) unter dem unteren Bildrand ist. Beides folgt direkt dem Pegel, kein Zeitgeber.
  const surf = beer.surfaceY(p), Lt = beer.foamHeight() + FOAM_GAP + 10, Lb = Math.max(96, innerHeight * 0.1);   // Übergangslängen in px Oberflächenweg: oben so lang wie das Einblenden der Schaumkrone, unten wächst mit dem Bildschirm (die Schlucke sind schnell)
  const fade = pv <= 1 ? ramp(g, 0.6, 0.8) : null;              // Geste 1: mit der Bierfläche (gleiche Rampe wie .beer) nach Gold
  const goldTop = fade ?? 1 - ramp(surf, -16, -16 + Lt);               // -16 = Spiegel im Zustand B (bier-leeren.js START_SURF): der Wechsel beginnt erst mit der Bewegung
  const goldBottom = fade ?? 1 - ramp(surf - 12, innerHeight, innerHeight + Lb);
  setGold(goldTop, goldBottom, g >= 0.7 && p < 0.9);           // Seitenhintergrund (Gummiband, Desktop-Safari-Leisten): bierfarben, solange noch Bier im Bild ist

  const shown = g >= 0.8;                                      // ab hier deckt die Bierfläche alles (Canvas aus)
  const foamH = 80;                                            // grob: Höhe von Schaumkrone und Wellen (px)
  const wave = shown && surf + 40 > -foamH && surf - foamH - 110 < innerHeight;   // Welle nur zeichnen, solange Oberfläche oder Schaum (auch beim kräftigen Schwappen, 110 px) im Bild sein können (sonst steht alles still, kein Pfad pro Bild)
  beer.level(p, wave);
  const draining = shown && surf < innerHeight + 20;           // Bläschen steigen, solange Bier zu sehen ist (auch in B); danach stehen sie
  if (last.draining !== draining) { last.draining = draining; root.classList.toggle('is-draining', draining); }
}

// Zustand zu P. false: ein Bild fehlt noch (dann ändert sich nichts, die Zeit hält an)
function render(pv) {
  if (!drawCanvas(pv)) return false;
  overlays(pv);
  return true;
}

// ── Animation ───────────────────────────────────
function go(to, dur, easing = ease) {
  const from = P, my = ++animId, dir = to > from ? 1 : -1;
  busy = true;
  stalls = 0;
  root.classList.add('anim');                                  // will-change nur während der Animation (CSS)
  log.push({ t: Math.round(performance.now()), art: 'start', von: from, nach: to });
  return new Promise((resolve) => {
    let t = 0, prev = performance.now(), prevLevel = levelOf(from);
    const step = (now) => {
      if (my !== animId) return resolve(false);                // abgebrochen (Überspringen)
      const dt = Math.min(64, now - prev); prev = now;
      const nt = Math.min(dur, t + dt), pv = from + (to - from) * easing(nt / dur);
      if (render(pv)) {                                        // sonst: Zeit hält an, bis das Bild dekodiert ist
        t = nt; P = pv;
        const lv = levelOf(pv);
        if (dt > 0 && lv !== prevLevel) beer.velocity(((lv - prevLevel) / dt) * 1000 * innerHeight * 1.15);   // Schwappen folgt dem Tempo
        prevLevel = lv;
      } else { stalls++; }
      keep(frameOf(P), dir);
      if (t >= dur) { finish(); return; }
      requestAnimationFrame(step);
    };
    const finish = () => {
      P = to;                                                  // Zielzustand ausdrücklich setzen
      const settle = () => {
        if (my !== animId) return resolve(false);
        if (render(to) || !ready) { busy = false; root.classList.remove('anim'); lockUntil = performance.now() + LOCK_AFTER; log.push({ t: Math.round(performance.now()), art: 'ende', nach: to }); resolve(true); }
        else requestAnimationFrame(settle);
      };
      settle();
    };
    requestAnimationFrame(step);
  });
}

// Weiter-Knopf (zwei Pfeile): in A und B sichtbar, während einer Animation und in C aus (Klasse .aus blendet in 200 ms)
let cueOn = null;
function setCue(on) {
  if (cueOn === on) return;
  cueOn = on;
  el.cue.classList.toggle('aus', !on);
}

async function begin(to) {                                     // 'A' | 'B' | 'C'
  if (busy) return;
  const from = state, usesFrames = from === 'A' || to === 'A';
  busy = true;
  animTo = to; tBegin = performance.now();
  setCue(false);
  ladeHerde();                                                 // Schafe und Gemälde (Zustand C) sicher geladen, bevor sie gebraucht werden
  if (usesFrames) await prepare(to === 'A' ? N - 1 : 0, to === 'A' ? -1 : 1);
  busy = false;
  if (to === 'C') freeFrames();                                // vor Phase 1: Canvas und Bilder weg, Geste 2 läuft nur noch mit Bierfläche und Seite
  const done = await go(to === 'A' ? 0 : to === 'B' ? 1 : 2, usesFrames ? DUR1 : T2, usesFrames ? ease : linear);
  if (!done) return;
  state = to;
  animTo = null;
  release();
  // Am Ende von Geste 2 wird nichts neu gemessen: die Fahrt endet genau an der Stelle, die vor dem Start gemessen wurde (Layout-Variablen --lift, --fold, --zone ändern sich nicht mehr, nichts springt)
  if (to === 'C') { unlock(); detach(); setTimeout(teardown, 350); }   // das Schwere (Speicher freigeben, Canvas verkleinern) erst kurz nach dem letzten Bild: kein Ruckler am Ende
  else if (queued) { queued = false; lockUntil = 0; begin('C'); }       // zweite Wischgeste kam schon während Geste 1: Geste 2 beginnt sofort
  else setCue(true);
}
function lock(on) { el.content.forEach((n) => { n.inert = on; }); }
function unlock() { lock(false); root.classList.add('frei'); }

function skipToContent() {                                     // Überspringen, Notfall oder Direktlink: sofort Zustand C
  animId++; busy = false; pending = null; animTo = null; queued = false;
  root.classList.remove('anim');
  root.classList.remove('wartet');
  setCue(false);
  state = 'C'; P = 2;
  render(2);
  release();
  unlock();
  el.poster.style.visibility = 'hidden';
  ladeHerde();
  measureDy();
  teardown();
}

// ── Aufräumen nach dem Intro (Zustand C) und Wiederholen ──
// In C ist das Intro vorbei: Gesten-Listener weg, Bilder und Canvas aus dem Speicher (die restliche Seite läuft flüssiger).
function teardown() {
  detach();
  run++;                                                       // laufende Ladevorgänge verwerfen
  release();
  still?.close?.(); still = null;
  blobs = []; bmp = []; decoding.clear();
  ready = false; loadStarted = false; loadedCount = 0; shown = null; stale = true; pending = null;
  canvas.style.display = 'none'; canvas.width = 0; canvas.height = 0;
  el.poster.style.visibility = 'hidden';
  dropStrips();
}
const scrollToTop = () => new Promise((ok) => {
  if (window.scrollY < 2) return ok();
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  const t = performance.now();
  (function wait() { if (window.scrollY < 2 || performance.now() - t > 2000) ok(); else requestAnimationFrame(wait); })();
});
async function replay() {                                      // „Bier Animation erneut anzeigen“: nach oben, dann das Intro ab A erneut
  if (state !== 'C' || busy || replaying) return;
  replaying = true;
  await scrollToTop();
  window.scrollTo(0, 0);
  framesFreed = false;
  root.classList.remove('frei', 'wartet', 'bereit');            // „bereit“ erst wieder, wenn die Bilder neu geladen sind (bis dahin zeigt das Ladesymbol unten „Lädt“)
  lock(true);
  state = 'A'; P = 0; busy = false; pending = null; animTo = null; queued = false; lockUntil = performance.now() + LOCK_AFTER;
  beer.remeasure();                                             // das Bier ist wieder da (.frei ist weg): neu messen
  canvas.style.display = ''; resizeCanvas(); useSet();
  isReady = false; root.classList.remove('is-ready'); el.poster.style.visibility = 'visible';
  measureDy(); overlays(0); setCue(true);
  attach();
  loadAll();
  replaying = false;
}
let replaying = false;

// ── Eingaben ────────────────────────────────────
function request(dir, wheel = null) {                          // dir: +1 nach unten (weiter), −1 nach oben (zurück); wheel: { quiet } = Ruhe vor einer Mausrad-/Trackpad-Geste (ms)
  const ignore = (grund) => log.push({ t: Math.round(performance.now()), art: 'ignoriert', grund, dir });   // für tools/tests
  const merken = () => log.push({ t: Math.round(performance.now()), art: 'gemerkt', dir });
  const echt = !wheel || (wheel.quiet >= QUEUE_QUIET && performance.now() - tBegin >= QUEUE_AGE);   // Touch und Tasten sind immer bewusst, beim Mausrad zählt nur eine Geste nach Ruhe
  if (busy) {
    if (dir > 0 && animTo === 'B' && !queued && echt) { queued = true; merken(); return; }   // viel wischen: die zweite Geste während Geste 1 löst Geste 2 gleich danach aus
    return ignore('läuft');
  }
  if (pending) return ignore('wartet');
  if (performance.now() < lockUntil) {
    if (dir > 0 && state === 'B' && !queued && echt) {         // neue Geste (nach Pause) in der kurzen Sperre nach Geste 1: wird nach der Sperre ausgeführt
      queued = true; merken();
      setTimeout(() => { if (queued) { queued = false; request(1); } }, Math.max(0, lockUntil - performance.now()) + 5);
      return;
    }
    return ignore('sperre');
  }
  if (root.classList.contains('age-gate')) return ignore('altersabfrage');
  let to = null;
  if (state === 'A' && dir > 0) to = 'B';
  else if (state === 'B') to = dir > 0 ? 'C' : 'A';
  if (!to) return ignore('kein Übergang');
  const usesFrames = state === 'A' || to === 'A';
  if (usesFrames && !ready) {                                 // Bilder laden noch: Pfeil pulsiert, Start von selbst danach
    pending = to;
    root.classList.add('wartet');
    ensureLoaded();
    setTimeout(() => { if (pending) skipToContent(); }, Math.max(0, LOAD_TIMEOUT - (performance.now() - tLoad)));
    return;
  }
  if (usesFrames) ensureLoaded();
  begin(to);
}

// Mausrad und Trackpad: Summe über 50 ms; das Nachlaufen (Ereignisse ohne 150 ms Pause) gehört zur alten Geste
let wheelLast = 0, wheelBuf = [], wheelGesture = null;
function onWheel(e) {
  if (e.ctrlKey || root.classList.contains('age-gate')) return;
  const now = performance.now();
  if (now - wheelLast > WHEEL_IDLE) {
    wheelBuf = [];
    wheelGesture = { sum: 0, done: false, valid: state !== 'C' || window.scrollY <= 0, quiet: now - wheelLast };
  }
  wheelLast = now;
  // gesperrt: kein Bildlauf. Auch das Nachlaufen einer Geste, die einen Übergang ausgelöst hat, darf die Seite danach nicht verschieben
  if (state !== 'C' || busy || wheelGesture?.done) e.preventDefault();
  if (!wheelGesture || wheelGesture.done || !wheelGesture.valid) return;
  const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1);
  wheelBuf.push([now, dy]);
  while (wheelBuf.length && now - wheelBuf[0][0] > WHEEL_WINDOW) wheelBuf.shift();
  wheelGesture.sum += dy;
  const win = wheelBuf.reduce((s, [, d]) => s + d, 0);
  if (Math.abs(win) >= WHEEL_MIN || Math.abs(wheelGesture.sum) >= WHEEL_TOTAL) {
    wheelGesture.done = true;
    request((Math.abs(win) >= WHEEL_MIN ? win : wheelGesture.sum) > 0 ? 1 : -1, { quiet: wheelGesture.quiet });
  }
}

// Touch: senkrechter Wisch ab 40 px, einmal je Berührung
let touch = null;
function onTouchStart(e) {
  if (e.touches.length !== 1) { touch = null; return; }
  const t = e.touches[0];
  touch = { x: t.clientX, y: t.clientY, done: false, valid: state !== 'C' || window.scrollY <= 0 };
}
function onTouchMove(e) {
  if (state !== 'C' || busy) e.preventDefault();               // gesperrt: kein Bildlauf, kein Überziehen
  if (!touch || touch.done || !touch.valid || e.touches.length !== 1) return;
  const t = e.touches[0], dy = t.clientY - touch.y, dx = t.clientX - touch.x;
  if (Math.abs(dy) >= TOUCH_MIN && Math.abs(dy) > Math.abs(dx) * 1.2) { touch.done = true; request(dy < 0 ? 1 : -1); }
}

// Tastatur: Pfeil, Bild, Leertaste
function onKey(e) {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target.closest?.('input, textarea, select, [contenteditable]')) return;
  const onControl = !!e.target.closest?.('button, a, summary');
  let dir = 0;
  if (e.key === 'ArrowDown' || e.key === 'PageDown') dir = 1;
  else if (e.key === 'ArrowUp' || e.key === 'PageUp') dir = -1;
  else if (e.key === ' ' && !onControl) dir = e.shiftKey ? -1 : 1;
  if (!dir) return;
  if (state !== 'C' || busy) e.preventDefault();
  else if (!(dir < 0 && window.scrollY <= 0)) return;          // in C normal scrollen
  if (!e.repeat) request(dir);
}

const onScroll = () => { if (state !== 'C' && window.scrollY !== 0) window.scrollTo(0, 0); };   // Fokus/Anker dürfen die gesperrte Seite nicht verschieben
let attached = false;
function attach() {
  if (attached) return;
  attached = true;
  window.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('touchstart', onTouchStart, { passive: true });
  window.addEventListener('touchmove', onTouchMove, { passive: false });
  window.addEventListener('keydown', onKey);
  window.addEventListener('scroll', onScroll, { passive: true });
}
function detach() {
  attached = false;
  window.removeEventListener('wheel', onWheel);
  window.removeEventListener('touchstart', onTouchStart);
  window.removeEventListener('touchmove', onTouchMove);
  window.removeEventListener('keydown', onKey);
  window.removeEventListener('scroll', onScroll);
}

// ── Start ───────────────────────────────────────
resizeCanvas();
measureDy();
if (document.fonts?.ready) document.fonts.ready.then(() => { measureDy(); if (!busy && state !== 'C') render(P); });
// Direktlink (#…) oder Neuladen/Zurück mit Position über 0: sofort Inhalt, ohne Animation. Der Browser stellt die Position
// beim Laden wieder her, deshalb erst danach entscheiden (die Seite ist bis dahin nicht gesperrt, .frei).
if (root.classList.contains('frei') && !location.hash && document.readyState !== 'complete') {
  await new Promise((ok) => window.addEventListener('load', ok, { once: true }));
  await new Promise((ok) => setTimeout(ok, 60));
}
if (location.hash || window.scrollY > 0) {
  skipToContent();
} else {
  root.classList.remove('frei');                               // Zustand A: gesperrt
  lock(true);
  overlays(0);
  setCue(true);
  attach();
  // Bilder laden nach dem Startbild (dessen Übertragung geht vor)
  if (document.readyState === 'complete') loadAll(); else window.addEventListener('load', () => { if (!loadStarted) loadAll(); }, { once: true });
}

el.skip?.addEventListener('click', skipToContent);
el.cue.addEventListener('click', () => request(1));           // Tippen/Klick auf die Pfeile = dieselbe Geste wie Wischen nach unten
document.querySelector('[data-intro]')?.addEventListener('click', (e) => { e.preventDefault(); replay(); });   // Link im Fuß
window.addEventListener('resize', () => { measureDy(); if (state === 'C') return; resizeCanvas(); stale = true; if (!busy) render(P); }, { passive: true });
portrait.addEventListener('change', () => { useSet(); if (state === 'C') return; if (loadStarted) loadAll(); if (!busy) { render(P); } });

// Nur lesend bzw. für tools/tests/
window.__sequenz = {
  get zustand() { return state; }, get P() { return P; }, get busy() { return busy; }, get bereit() { return ready; },
  get wartet() { return !!pending; }, get stalls() { return stalls; }, get frame() { return frameOf(P); },
  get geladen() { return loadedCount; }, get anzahl() { return N; }, log,
  get aktiv() { return attached; }, phasen: { PH_IN, PH1, PAUSE, RIDE, FADE, T2, DRINK }, get speicher() { return { bitmaps: bmp.filter(Boolean).length, dateien: blobs.filter(Boolean).length, standbild: !!still, canvas: canvas.style.display !== 'none' && canvas.width > 0 }; },
  replay,
  get gestenbereit() { return !busy && !pending && performance.now() >= lockUntil; },   // Eingabesperre vorbei?
  async zeige(pv) {                                            // Zustand zu P ohne Animation zeigen (Screenshots)
    if (busy) return false;
    ensureLoaded();
    for (let k = 0; k < 400 && !ready; k++) await new Promise((ok) => setTimeout(ok, 50));
    const f = frameOf(pv);
    keep(f, 1);
    await want(f);
    P = pv; state = pv >= 2 ? 'C' : pv >= 1 ? 'B' : 'A';
    stale = true;
    return render(pv);
  },
  skip: skipToContent,
};
