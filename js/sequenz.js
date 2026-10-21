// Start der Seite als Zustandsautomat mit genau EINER Geste (gleich auf Handy, iPad und Desktop), ohne 3D-Flasche:
//
//   B  Bier: der Bildschirm ist voll Bier (Rand zu Rand, Bläschen, Schwappen aktiv), unten stehen Titel und Untertitel, unten mittig der Weiter-Pfeil
//   ── Geste: das Bier leert sich (ca. 4 s), der Titel rutscht mit dem Bierspiegel nach oben, Einleitung, Schafe und Gemälde erscheinen
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

import { createBeer } from './bier-leeren.js?v=08bec591';
import { ladeHerde } from './herde.js?v=08bec591';

const root = document.documentElement;
const hero = document.getElementById('start');

// ── Einstellungen ───────────────────────────────
// Die Geste in zwei klar getrennten Phasen nacheinander (eine Zeitleiste, P läuft linear von 1 nach 2): erst nur das Bier (PH1), kurze Pause, dann fährt der ganze Block gleichzeitig
// nach oben (RIDE): Titel „Berghof Hell“, Schafe, Einleitung und Gemälde gleiten gemeinsam an ihren Platz (alle um denselben Weg, der Block bleibt starr) und blenden dabei gemeinsam
// ein (FADE), dazu der Seitenrahmen.
// Phase 1 (Bier): eine einzige glatte Kurve ohne Knick. Das Bier sinkt sofort mit der Geste zügig bis ins obere Viertel des Bildschirms (PH_IN, die Schaumkrone gleitet dabei von oben ein) und läuft
// ab dort gleichmäßig und ruhig weiter aus (konstantes Tempo bis zum Ende, kein Beschleunigen, kein Auf und Ab). Das Schwappen (js/bier-leeren.js) ist stark gedämpft.
const PH_IN = 450, PH1 = 2800, PAUSE = 150, RIDE = 1000, FADE = 550;
const T2 = PH1 + PAUSE + RIDE;                               // 3950 ms insgesamt (Phase 2 = 1 s)
const FOAM_GAP = 12;                                         // px: nach dem Einblenden steht die Schaumkrone ganz im Bild, der Spiegel (mittlere Oberfläche) FOAM_GAP px darunter
// Auslaufen: p(T) = A·(1 − e^(−T/τ)) + B·T/PH1. Der Term mit A ist der schnelle Abstieg (klingt mit der Zeitkonstante τ ab), der Term mit B das gleichmäßige Auslaufen. A und B ergeben sich so,
// dass der Spiegel nach PH_IN ms bei 25 % der Höhe von oben steht (drei Viertel der Seite sind noch Bier) und nach PH1 ms ganz leer ist; das Tempo fällt stetig vom schnellen Anfang auf das gleichmäßige Tempo.
const DRINK = { tau: 150, half: 0.25 };      // half = Lage des Spiegels nach PH_IN, Anteil der Bildhöhe von oben (0,25 = drei Viertel der Seite sind noch Bier)
const B_LEVEL = 0;            // Pegel im Zustand B (0 = Bierfläche über den ganzen Bildschirm, Spiegel über dem Bildrand, keine Schaumkrone; 1 = leer)
const LOCK_AFTER = 400;       // ms Sperre nach der Animation
const WHEEL_IDLE = 150;       // ms ohne Mausrad-Ereignis = neue Geste (davor: Nachlaufen der vorigen)
const WHEEL_WINDOW = 50, WHEEL_MIN = 30, WHEEL_TOTAL = 120;   // Summe über 50 ms ≥ 30 oder ganze Geste ≥ 120
const TOUCH_MIN = 40;         // px senkrecht

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const ramp = (g, a, b) => clamp01((g - a) / (b - a));         // 0 vor a, 1 nach b, dazwischen linear
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
// Titel: in C steht er oben (normales Layout), in B unten im Bild. textDy ist der Weg dazwischen in px (gemessen);
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
  // Das wirkt nur auf das Layout in C; in B bleibt der Titel unten verankert (textDy wird danach mit dem neuen Platz gemessen), nichts springt.
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
// Bierpegel 0 … 1 (Phase 1 der Geste: schnell bis zur Bildschirmmitte, dann gleichmäßig leer; danach 1). Start und Ende des Weges kommen aus der echten Höhe des Bier-Layers (beer.levelAt, 100lvh).
function levelOf(p) {
  if (p <= 1) return B_LEVEL;
  const T = (p - 1) * T2;                                      // ms seit Beginn der Geste
  if (T >= PH1) return 1;
  const q = Math.min(0.9, Math.max(0.05, beer.levelAt(innerHeight * DRINK.half)));    // Pegel, bei dem die Oberfläche bei half der Bildhöhe steht
  const g1 = 1 - Math.exp(-PH1 / DRINK.tau), g2 = 1 - Math.exp(-PH_IN / DRINK.tau), r = PH_IN / PH1;
  const A = Math.max(0, (q - r) / (g2 - g1 * r)), B = 1 - A * g1;       // p(PH_IN) = q und p(PH1) = 1
  return B_LEVEL + (1 - B_LEVEL) * (A * (1 - Math.exp(-T / DRINK.tau)) + B * (T / PH1));
}

// Alles eine reine Funktion von P
function render(pv) {
  const h = Math.max(0, pv - 1);

  // Titel: steht von Anfang an unten im Bier. In Phase 1 bleibt er ruhig (textDy ist der gemessene Weg, FLIP: nur translate3d). Nach der Pause fährt der ganze Block gleichzeitig nach oben:
  // Titel (mit den Schafen daneben), Einleitung, Gemälde und die Herde am Handy gleiten um denselben Weg und blenden gemeinsam ein (nur transform und opacity)
  put('text', el.text, 'opacity', '1');
  const T = h * T2;                                              // ms seit Beginn der Geste
  const ride = easeOut(ramp(T, PH1 + PAUSE, PH1 + PAUSE + RIDE));    // Fahrt 0 … 1
  const einblenden = easeOut(ramp(T, PH1 + PAUSE, PH1 + PAUSE + FADE));    // Einblenden 0 … 1
  const dy = textDy * (1 - ride);                                // noch zu fahrender Weg (px)
  put('textY', el.text, 'transform', `translate3d(0, ${dy.toFixed(1)}px, 0)`);
  // Einleitung, Gemälde, Schafe und Seitenrahmen unmerklich (1 %) schon gezeichnet: Dekodieren und Rastern passiert vor dem Einblenden und nicht mittendrin
  // (sonst ruckelt das Auftauchen am Ende der Geste)
  const prime = 0.01;
  put('more', el.more, 'opacity', '1');
  put('moreV', el.more, 'visibility', 'visible');
  const show = (key, node, move) => {
    put(key, node, 'opacity', Math.max(einblenden, prime).toFixed(3));
    if (move) put(key + 'Y', node, 'transform', ride >= 1 ? 'none' : `translate3d(0, ${dy.toFixed(1)}px, 0)`);
  };
  show('herd', el.herd, true);                                  // Herde unten (Handy)
  show('lead', el.lead, true);                                  // Einleitungstext
  show('art', el.art, true);                                    // Gemälde
  put('pageFrame', el.pageFrame, 'opacity', Math.max(einblenden, prime).toFixed(3));   // Seitenrahmen (C): blendet gleichzeitig ein

  // Der Startrahmen mit Eckverzierung ist nicht mehr da; „Hofer Bräu“ oben bleibt frei (Hintergrund folgt über --frame-o)
  put('frame', el.frame, 'opacity', '0');
  put('frameO', el.header, '--frame-o', String(einblenden));   // Creme-Fläche hinter „Hofer Bräu“ unterbricht die Rahmenlinie, solange ein Rahmen steht

  // Bierfläche (mit Bläschen) füllt von Anfang an alles
  put('beer', el.beer, 'opacity', '1');

  // Seite taucht ins Gold (Hintergrund + Browserfarbe); oben wieder beige, sobald die Schaumkrone ins Bild sinkt, unten erst beim leeren Glas
  const p = levelOf(pv);
  // Statusleiste oben: beige, sobald die Schaumkrone ins Bild kommt (ab da liegt unter ihr nie mehr Gold); Leiste unten: bierfarben, solange unten noch Bier zu sehen ist,
  // und erst dann weich zu beige, wenn die Oberfläche (mit Wellen) unter dem unteren Bildrand ist. Beides folgt direkt dem Pegel, kein Zeitgeber.
  const surf = beer.surfaceY(p), Lt = beer.foamHeight() + FOAM_GAP + 10, Lb = Math.max(96, innerHeight * 0.1);   // Übergangslängen in px Oberflächenweg: oben so lang wie das Einblenden der Schaumkrone, unten wächst mit dem Bildschirm (die Schlucke sind schnell)
  const fade = pv <= 1 ? 1 : null;                              // B: ganz Bierfarbe
  const goldTop = fade ?? 1 - ramp(surf, -16, -16 + Lt);               // -16 = Spiegel im Zustand B (bier-leeren.js START_SURF): der Wechsel beginnt erst mit der Bewegung
  const goldBottom = fade ?? 1 - ramp(surf - 12, innerHeight, innerHeight + Lb);
  setGold(goldTop, goldBottom, p < 0.9);                       // Seitenhintergrund (Gummiband, Desktop-Safari-Leisten): bierfarben, solange noch Bier im Bild ist

  const foamH = 80;                                            // grob: Höhe von Schaumkrone und Wellen (px)
  const wave = surf + 40 > -foamH && surf - foamH - 110 < innerHeight;   // Welle nur zeichnen, solange Oberfläche oder Schaum (auch beim kräftigen Schwappen, 110 px) im Bild sein können (sonst steht alles still, kein Pfad pro Bild)
  beer.level(p, wave);
  const draining = surf < innerHeight + 20;                    // Bläschen steigen, solange Bier zu sehen ist (auch in B); danach stehen sie
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
  get aktiv() { return attached; }, phasen: { PH_IN, PH1, PAUSE, RIDE, FADE, T2, DRINK },
  replay,
  get gestenbereit() { return !busy && performance.now() >= lockUntil; },   // Eingabesperre vorbei?
  async zeige(pv) {                                            // Zustand zu P ohne Animation zeigen (Screenshots)
    if (busy) return false;
    P = Math.max(1, pv); state = pv >= 2 ? 'C' : 'B';
    return render(P);
  },
  skip: skipToContent,
};
