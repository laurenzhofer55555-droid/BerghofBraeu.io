// Start der Seite als Zustandsautomat mit genau EINER Geste (gleich auf Handy, iPad und Desktop), ohne 3D-Flasche:
//
//   B  Bier: der Bildschirm ist voll Bier (Rand zu Rand, Bläschen), unten stehen Titel und Untertitel mit der wackelnden Flasche darüber, unten mittig der Weiter-Pfeil
//   ── Geste (Scrollen, Wischen, Taste, Tipp/Klick irgendwo): eine wellige Kante mit Schaumband wischt das Bier in ca. 3 s von unten nach oben weg; Titel und Flasche steigen
//      vor ihr her nach oben (immer über dem Schaum), die Kante gibt den Inhalt darunter frei (er liegt in seiner Endposition unter dem Bier)
//   C  Inhalt: normal scrollbare Seite, Titel oben, darunter Einleitung und Herde
//
// Das Intro läuft EINMAL: in C sind alle Gesten-Listener entfernt und die Seitensperre aufgehoben (teardown). Nichts wird im Browser
// gespeichert. Der Link „Bier Animation erneut anzeigen“ im Fuß scrollt nach oben und zeigt das Bier erneut (replay), danach wieder einmalig.
// Die früheren Varianten mit der 3D-Flasche (Kamerafahrt in den Kronkorken) liegen in den Branches archiv/… (siehe README).
//
// Grundsätze
//   · Die Seite ist in B gesperrt (CSS .seq ohne .frei, ab dem ersten Pixel). Die Geste erkennt dieses Skript selbst.
//   · Alles hängt an EINEM Fortschrittswert P (1 = B, 2 = C), der per Zeit animiert wird. Jeder Zustand ist eine reine Funktion
//     von P (render): nichts summiert sich aus Ereignissen auf, am Ende der Animation wird der Zielzustand ausdrücklich gesetzt.
//   · Eingabesperre: während der Animation und danach 400 ms werden Gesten ignoriert.
//   · Neu laden mit Position über 0 und Direktlinks (#…) landen ohne Animation direkt in C.

import { createBeer } from './bier-leeren.js?v=b1f6e578';
import { ladeHerde } from './herde.js?v=b1f6e578';

const root = document.documentElement;
const hero = document.getElementById('start');

// ── Einstellungen ───────────────────────────────
// Die Geste ist EINE Fahrt (P läuft linear von 1 nach 2 in T2 ms). Die Kante des Biers (js/bier-leeren.js) steigt sinus-in-out von unter dem unteren Bildrand bis über den oberen Rand.
// Der Titelblock (mit der Flasche) sitzt GAP px über der Kante: er wird von ihr nach oben geschoben und kommt weich (softplus, SOFT) an seinem Platz oben an; danach läuft die Kante über ihn hinweg.
// Inhalt (Einleitung, Schafe, Gemälde, Seitenrahmen) liegt in seiner Endposition unter dem Bier und wird von der Kante freigegeben.
const T2 = 3000;                                             // ms für die ganze Geste
const GAP = 64;                                              // px zwischen Unterkante des Titelblocks und der Kante (das Schaumband liegt unter der Kante)
const SOFT = 60;                                             // px Weichheit beim Anschieben und Ankommen des Titels; GAP ≥ 0,7 · SOFT, damit der Titel den Schaum nie berührt
const LOCK_AFTER = 400;       // ms Sperre nach der Animation
const WHEEL_IDLE = 150;       // ms ohne Mausrad-Ereignis = neue Geste (davor: Nachlaufen der vorigen)
const WHEEL_WINDOW = 50, WHEEL_MIN = 30, WHEEL_TOTAL = 120;   // Summe über 50 ms ≥ 30 oder ganze Geste ≥ 120
const TOUCH_MIN = 40;         // px senkrecht

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const ramp = (g, a, b) => clamp01((g - a) / (b - a));         // 0 vor a, 1 nach b, dazwischen linear
const linear = (t) => t;

const el = {
  cue: hero.querySelector('.scroll-cue'),
  frame: hero.querySelector(':scope > .frame'),
  text: hero.querySelector('.hero__text'),
  flasche: hero.querySelector('.hero__flasche'),
  beer: hero.querySelector('.beer'),
  header: document.querySelector('.site-header'),
  skip: document.querySelector('[data-skip]'),
  content: [...document.querySelectorAll('main > :not(#start), body > footer')],   // in B unerreichbar (inert)
};
const beer = createBeer(hero);
const themeColor = document.querySelector('meta[name="theme-color"]');
const CREAM = themeColor.content;
const CREAM_RGB = [247, 244, 236], GOLD_RGB_N = [197, 161, 73];     // #F7F4EC (Papier) und #C5A149 (Bier), exakt wie --cream und --gold-beer

// ── Zustand ─────────────────────────────────────
let P = 1, state = 'B', busy = false, lockUntil = 0, animId = 0, stalls = 0;
const log = [];                                                // für tools/tests: Übergänge

// ── Zustand aus P ───────────────────────────────
// P: 1 = B (Bier), 2 = C (leer, Inhalt). h = Anteil der Geste.
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
// Titel: in C steht er oben (normales Layout, Unterkante des Blocks bei textC), in B unten im Bild. textDy ist der Weg dazwischen in px (gemessen);
// beim Wegwischen schiebt die Kante den Titel nach oben (titleDy).
let textDy = 0, textC = 0;
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
  // Das wirkt nur auf das Layout in C; in B bleibt der Titel unten verankert (textDy wird danach mit dem neuen Platz gemessen), nichts springt.
  hero.style.setProperty('--lift', '0px');
  const fig = hero.querySelector('.painting'), top0 = el.text.offsetTop;
  const lift = fig && window.innerWidth >= 768 ? Math.max(0, Math.min(200, Math.round((H - (fig.offsetTop + fig.offsetHeight - top0)) / 2 - top0))) : 0;
  hero.style.setProperty('--lift', lift + 'px');
  textDy = H - bPad - el.text.offsetHeight - el.text.offsetTop;
  textC = el.text.offsetTop + el.text.offsetHeight;
  const lead = hero.querySelector('.hero__lead');   // Handy: Herde im Bereich unter der Einleitung (--zone, 16 px Abstand zum Text) und das Gemälde darunter, unter dem ersten Bildschirm (--fold)
  if (lead) {
    const bottom = lead.offsetTop + lead.offsetHeight;
    hero.style.setProperty('--zone', Math.max(0, H - bottom - 16 - 28) + 'px');
    hero.style.setProperty('--fold', Math.max(0, H - bottom) + 'px');
  }
}
// Weg der Kante 0 … 1 (sinus-in-out): langsames Anfahren, schnelle Mitte, weiches Ausklingen
const wipe = (h) => (1 - Math.cos(Math.PI * clamp01(h))) / 2;
const levelOf = (p) => wipe(p - 1);

// Titel über der Kante. Der Titelblock soll mit der Unterkante bei x = Kante − GAP stehen, aber nie unter seiner Ausgangslage (B) und nie über seiner Endlage (C):
// y(x) = yC + soft(x − yC) − soft(x − yB) ist diese Begrenzung ohne Knick (soft = softplus), also ohne Ruck beim Anschieben und Ankommen. Ergebnis: Weg über der Endlage in px,
// auf textDy normiert (in B genau die gemessene Ausgangslage, in C genau 0).
const soft = (z) => { const a = z / SOFT; return a > 30 ? z : SOFT * Math.log1p(Math.exp(a)); };
function titleDy(surf) {
  const yC = textC, yB = textC + textDy;
  const y = (x) => yC + soft(x - yC) - soft(x - yB);
  return textDy * (y(surf - GAP) - yC) / Math.max(1, y(beer.surfaceY(0) - GAP) - yC);
}

// Alles eine reine Funktion von P
function render(pv) {
  const p = levelOf(pv);                                         // Weg der Kante 0 … 1
  const surf = beer.surfaceY(p), foamH = beer.foamHeight();      // mittlere Lage der Kante (px von oben) und Höhe des Schaumbands darunter

  // Titel (mit der Flasche darüber): steht von Anfang an unten im Bier und steigt vor der Kante her (nur translate3d, gemessener Weg textDy). Die Flasche blendet beim Aufsteigen weich aus.
  const dy = titleDy(surf);
  put('text', el.text, 'opacity', '1');
  put('textY', el.text, 'transform', `translate3d(0, ${dy.toFixed(1)}px, 0)`);
  put('flasche', el.flasche, 'opacity', (1 - ramp(textDy - dy, 40, 240)).toFixed(3));

  // Der Startrahmen mit Eckverzierung ist nicht mehr da; „Hofer Bräu“ oben bleibt frei: die Creme-Fläche dahinter (unterbricht die Rahmenlinie des Seitenrahmens) kommt,
  // sobald Kante und Schaumband über dem oberen Rand sind
  put('frame', el.frame, 'opacity', '0');
  put('frameO', el.header, '--frame-o', ramp(8 - (surf + foamH), 0, 40).toFixed(3));

  // Bierfläche (mit Bläschen) füllt von Anfang an alles; ab hier ist sie gezeichnet, der Inhalt darunter darf stehen (CSS .bier-an, vorher unsichtbar: kein Aufblitzen)
  put('beer', el.beer, 'opacity', '1');
  if (!last.bierAn) { last.bierAn = true; root.classList.add('bier-an'); }

  // Browserfarben: oben bierfarben, bis die Kante oben ist; unten beige, sobald die Kante die untere Leiste verlassen hat (das Bier-Layer deckt in B schon alles: der Seitenhintergrund ist beige)
  setGold(ramp(surf, -30, 30), ramp(surf, innerHeight - 60, innerHeight + 10), false);

  const wave = surf + foamH + 120 > 0 && surf - 120 < innerHeight;   // Welle nur zeichnen, solange Kante oder Schaumband (auch beim kräftigen Schwappen, 110 px) im Bild sein können (sonst steht alles still, kein Pfad pro Bild)
  beer.level(p, wave);
  const draining = surf > 0;                                   // Bläschen steigen, solange Bier zu sehen ist (auch in B); danach stehen sie
  if (last.draining !== draining) { last.draining = draining; root.classList.toggle('is-draining', draining); }
  return true;
}

// ── Animation ───────────────────────────────────
function go(to, dur, easing = linear) {
  const from = P, my = ++animId;
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
      render(pv);
      t = nt; P = pv;
      const lv = levelOf(pv);
      if (dt > 0 && lv !== prevLevel) beer.velocity(((lv - prevLevel) / dt) * 1000 * innerHeight * 1.15);   // Schwappen folgt dem Tempo
      prevLevel = lv;
      if (t >= dur) { finish(); return; }
      requestAnimationFrame(step);
    };
    const finish = () => {
      P = to;                                                  // Zielzustand ausdrücklich setzen
      render(to);
      busy = false; root.classList.remove('anim'); lockUntil = performance.now() + LOCK_AFTER;
      log.push({ t: Math.round(performance.now()), art: 'ende', nach: to });
      resolve(true);
    };
    requestAnimationFrame(step);
  });
}

// Weiter-Knopf (Pfeil): in B sichtbar, während der Animation und in C aus (Klasse .aus blendet in 200 ms)
let cueOn = null;
function setCue(on) {
  if (cueOn === on) return;
  cueOn = on;
  el.cue.classList.toggle('aus', !on);
}

async function begin() {                                       // B → C
  if (busy) return;
  setCue(false);
  ladeHerde();                                                 // Schafe und Gemälde (Zustand C) sicher geladen, bevor sie gebraucht werden
  const done = await go(2, T2, linear);
  if (!done) return;
  state = 'C';
  // Am Ende der Geste wird nichts neu gemessen: die Fahrt endet genau an der Stelle, die vor dem Start gemessen wurde (Layout-Variablen --lift, --fold, --zone ändern sich nicht mehr, nichts springt)
  unlock();
  await wheelQuiet();                                          // ein langes Trackpad-Nachlaufen der Geste darf die Seite nicht wegschieben: der Listener fängt es ab, bis es abgeklungen ist
  detach(); setTimeout(teardown, 350);                         // das Schwere (Aufräumen) erst kurz nach dem letzten Bild: kein Ruckler am Ende
}
const wheelQuiet = () => new Promise((ok) => {
  const t0 = performance.now();
  (function warte() { if (performance.now() - wheelLast > 400 || performance.now() - t0 > 6000) ok(); else setTimeout(warte, 50); })();
});
function lock(on) { el.content.forEach((n) => { n.inert = on; }); }
function unlock() { lock(false); root.classList.add('frei'); }

function skipToContent() {                                     // Überspringen, Notfall oder Direktlink: sofort Zustand C
  animId++; busy = false;
  root.classList.remove('anim');
  setCue(false);
  state = 'C'; P = 2;
  render(2);
  unlock();
  ladeHerde();
  measureDy();
  teardown();
}

// ── Aufräumen nach dem Intro (Zustand C) und Wiederholen ──
// In C ist das Intro vorbei: Gesten-Listener weg (die restliche Seite läuft flüssiger).
function teardown() {
  detach();
  dropStrips();
}
const scrollToTop = () => new Promise((ok) => {
  if (window.scrollY < 2) return ok();
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  const t = performance.now();
  (function wait() { if (window.scrollY < 2 || performance.now() - t > 2000) ok(); else requestAnimationFrame(wait); })();
});
async function replay() {                                      // „Bier Animation erneut anzeigen“: nach oben, dann das Bier erneut
  if (state !== 'C' || busy || replaying) return;
  replaying = true;
  await scrollToTop();
  window.scrollTo(0, 0);
  root.classList.remove('frei');
  lock(true);
  state = 'B'; P = 1; busy = false; lockUntil = performance.now() + LOCK_AFTER;
  beer.remeasure();                                             // das Bier ist wieder da (.frei ist weg): neu messen
  measureDy(); render(1); setCue(true);
  attach();
  replaying = false;
}
let replaying = false;

// ── Eingaben ────────────────────────────────────
function request(dir) {                                        // dir: +1 nach unten (weiter), −1 nach oben (zurück: gibt es nicht)
  const ignore = (grund) => log.push({ t: Math.round(performance.now()), art: 'ignoriert', grund, dir });   // für tools/tests
  if (busy) return ignore('läuft');
  if (performance.now() < lockUntil) return ignore('sperre');
  if (root.classList.contains('age-gate')) return ignore('altersabfrage');
  if (state !== 'B' || dir < 0) return ignore('kein Übergang');
  begin();
}

// Mausrad und Trackpad: Summe über 50 ms; das Nachlaufen (Ereignisse ohne 150 ms Pause) gehört zur alten Geste
let wheelLast = 0, wheelBuf = [], wheelGesture = null;
function onWheel(e) {
  if (e.ctrlKey || root.classList.contains('age-gate')) return;
  const now = performance.now();
  if (now - wheelLast > WHEEL_IDLE) {
    wheelBuf = [];
    wheelGesture = { sum: 0, done: false, valid: state !== 'C' || window.scrollY <= 0 };
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
    request((Math.abs(win) >= WHEEL_MIN ? win : wheelGesture.sum) > 0 ? 1 : -1);
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

// Ein Tipp oder Klick irgendwo auf die Seite löst dieselbe Geste aus wie Wischen oder Scrollen (einfacher für alle). Bedienelemente (Altersabfrage, Pfeil, Links, Überspringen) behalten ihre eigene Wirkung.
function onClick(e) {
  if (e.target.closest?.('.age, .skip, a, button, input, select, textarea, summary')) return;
  request(1);
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
  window.addEventListener('click', onClick);
  window.addEventListener('scroll', onScroll, { passive: true });
}
function detach() {
  attached = false;
  window.removeEventListener('wheel', onWheel);
  window.removeEventListener('touchstart', onTouchStart);
  window.removeEventListener('touchmove', onTouchMove);
  window.removeEventListener('keydown', onKey);
  window.removeEventListener('click', onClick);
  window.removeEventListener('scroll', onScroll);
}

// ── Start ───────────────────────────────────────
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
  root.classList.remove('frei');                               // Zustand B: gesperrt
  lock(true);
  render(1);
  setCue(true);
  attach();
  if (document.readyState === 'complete') setTimeout(ladeHerde, 300); else window.addEventListener('load', () => setTimeout(ladeHerde, 300), { once: true });
}

el.skip?.addEventListener('click', skipToContent);
el.cue.addEventListener('click', () => request(1));           // Tippen/Klick auf den Pfeil = dieselbe Geste wie Wischen nach unten
document.querySelector('[data-intro]')?.addEventListener('click', (e) => { e.preventDefault(); replay(); });   // Link im Fuß
window.addEventListener('resize', () => { measureDy(); if (state === 'C') return; if (!busy) render(P); }, { passive: true });

// Nur lesend bzw. für tools/tests/
window.__sequenz = {
  get zustand() { return state; }, get P() { return P; }, get busy() { return busy; }, get bereit() { return true; },
  get wartet() { return false; }, get stalls() { return stalls; }, get frame() { return 0; },
  get geladen() { return 0; }, get anzahl() { return 0; }, log,
  get kante() { return beer.surfaceY(levelOf(P)); },                    // Lage der Bierkante (px von oben)
  get aktiv() { return attached; }, phasen: { T2, GAP, SOFT },
  replay,
  get gestenbereit() { return !busy && performance.now() >= lockUntil; },   // Eingabesperre vorbei?
  async zeige(pv) {                                            // Zustand zu P ohne Animation zeigen (Screenshots)
    if (busy) return false;
    P = Math.max(1, pv); state = pv >= 2 ? 'C' : 'B';
    return render(P);
  },
  skip: skipToContent,
};
