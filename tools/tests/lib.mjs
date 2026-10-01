// Gemeinsame Helfer für die Sequenz-Tests: Chrome headless über das DevTools-Protokoll, echte Gesten,
// Drosselung (kalter Cache, Fast 3G, CPU 4x) und ein Messfühler, der pro Bildschirmbild den Zustand aufzeichnet.
// Nur für Tests (tools/ wird nicht veröffentlicht). Benötigt Node ≥ 22 (WebSocket) und Google Chrome.
import { spawn } from 'node:child_process';
import { rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const BASE = process.env.BASE || 'http://127.0.0.1:5263/';
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const WORK = join(tmpdir(), 'berghof-tests');
let nextPort = 9400 + Math.floor(Math.random() * 400);

export const VIEWS = {
  desktop: { w: 1440, h: 900, mobile: false },
  handy: { w: 390, h: 844, mobile: true },
};
// Geräte für die Endsequenz (Bier über die ganze Fläche)
export const DEVICES = {
  'iphone15': { w: 393, h: 852, mobile: true },
  'ipad-air-hoch': { w: 820, h: 1180, mobile: true },
  'ipad-air-quer': { w: 1180, h: 820, mobile: true },
  'ipad-pro-quer': { w: 1366, h: 1024, mobile: true },
  'desktop-1440': { w: 1440, h: 900, mobile: false },
  'desktop-2560': { w: 2560, h: 1440, mobile: false },
};

// Messfühler (läuft in der Seite): pro Bildschirmbild ein Eintrag, dazu Layoutverschiebungen und leeres Canvas
const PROBE = `
try { localStorage.setItem('berghof-ab16', String(Date.now() + 864e5)); } catch (e) {}
window.__S = []; window.__cls = 0; window.__blank = 0; window.__lastInput = 0;
try { new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (!e.hadRecentInput) window.__cls += e.value; })).observe({ type: 'layout-shift', buffered: true }); } catch (e) {}
['wheel', 'touchstart', 'touchmove', 'keydown', 'pointerdown'].forEach((t) => addEventListener(t, () => { window.__lastInput = performance.now(); }, { passive: true, capture: true }));
const num = (v) => (v === '' || v == null ? 0 : +v);
function ty(node) { const m = node && getComputedStyle(node).transform; if (!m || m === 'none') return 0; const v = m.slice(m.indexOf('(') + 1, -1).split(',').map(Number); return m.startsWith('matrix3d') ? v[13] : v[5]; }
window.__state = () => {
  const q = window.__sequenz, c = document.getElementById('sequenz');
  const cs = (s) => { const e = document.querySelector(s); return e ? getComputedStyle(e) : null; };
  const rc = (s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; };
  return {
    y: Math.round(scrollY), z: q ? q.zustand : null, P: q ? +q.P.toFixed(4) : null, busy: q ? q.busy : null, bereit: q ? q.bereit : null,
    wartet: q ? q.wartet : null, frame: q ? q.frame : null, stalls: q ? q.stalls : 0, geladen: q ? q.geladen : 0,
    cv: c ? getComputedStyle(c).visibility : null, beer: num(cs('.beer')?.opacity), title: num(cs('.hero__text')?.opacity), cue: num(cs('.scroll-cue')?.opacity),
    frameO: num(cs('#start > .frame')?.opacity), level: Math.round(ty(document.querySelector('.beer__liquid'))), textY: Math.round(ty(document.querySelector('.hero__text')) * 10) / 10, more: num(cs('.hero__more')?.opacity),
    ops: { flock: num(cs('.flock')?.opacity), herd: num(cs('.herd')?.opacity), lead: num(cs('.hero__lead')?.opacity), art: num(cs('.painting')?.opacity), pf: num(cs('.frame--page')?.opacity) },
    tys: { flock: Math.round(ty(document.querySelector('.flock')) * 10) / 10, herd: Math.round(ty(document.querySelector('.herd')) * 10) / 10, lead: Math.round(ty(document.querySelector('.hero__lead')) * 10) / 10, art: Math.round(ty(document.querySelector('.painting')) * 10) / 10 },
    anim: document.documentElement.classList.contains('anim'), wc: cs('.hero__text')?.willChange, cw: c ? c.width : null,
    gold: document.documentElement.classList.contains('gold-page'), frei: document.documentElement.classList.contains('frei'),
    overflow: getComputedStyle(document.documentElement).overflow, height: document.documentElement.scrollHeight,
  };
};
// Messung nach allen Zeichenschritten des Bildes (rAF, dann setTimeout): so sieht der Fühler genau, was gezeigt wird
(function loop() {
  requestAnimationFrame(() => { setTimeout(record, 0); loop(); });
})();
function record() {
  if (!document.documentElement || !document.body) return;
  const c = document.getElementById('sequenz'), st = window.__state();
  if (c && c.width && st.cv === 'visible' && getComputedStyle(c).opacity > 0.05) { const d = c.getContext('2d').getImageData(c.width >> 1, c.height >> 2, 1, 1).data; if (d[0] + d[1] + d[2] < 12) window.__blank++; }
  st.t = Math.round(performance.now()); st.input = performance.now() - window.__lastInput < 200 ? 1 : 0;
  window.__S.push(st);
}
`;

export async function browser({ view = 'desktop', reducedMotion = false } = {}) {
  const port = nextPort++;
  const dir = join(WORK, 'chrome-' + port);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(WORK, { recursive: true });
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, '--no-first-run',
    '--hide-scrollbars', ...(process.env.NOGPU ? ['--disable-gpu'] : ['--use-angle=metal', '--enable-gpu']), 'about:blank'], { stdio: 'ignore' });
  let t = [];
  for (let i = 0; i < 100 && !t.some((x) => x.type === 'page'); i++) { try { t = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); } catch { await sleep(200); } }
  const ws = new WebSocket(t.find((x) => x.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => { ws.onopen = r; });
  let id = 0; const pending = new Map(); const errors = [], external = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errors.push((m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text || '').slice(0, 200));
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('Konsole: ' + m.params.args.map((a) => a.value || a.description).join(' ').slice(0, 200));
    if (m.method === 'Network.requestWillBeSent') {
      const u = m.params.request.url;
      if (!u.startsWith(BASE) && !u.startsWith('data:') && !u.startsWith('blob:') && !u.startsWith('about:')) external.push(u);
    }
    if (m.method && b.onEvent) b.onEvent(m);
  };
  // Jeder DevTools-Aufruf hat ein Zeitlimit: ein hängender Aufruf soll den Test mit Fehlermeldung beenden, nicht ewig blockieren
  const send = (method, params = {}, ms = 60000) => new Promise((res, rej) => {
    const i = ++id;
    const timer = setTimeout(() => { pending.delete(i); rej(new Error(`Zeitüberschreitung bei ${method}`)); }, ms);
    pending.set(i, (m) => { clearTimeout(timer); res(m); });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  const js = async (e) => (await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value;
  const b = { send, js, errors, external, chrome, view, ws, onEvent: null };
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: PROBE });
  await setView(b, view);
  if (reducedMotion) await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  b.close = () => { try { ws.close(); } catch {} chrome.kill(); };
  return b;
}

export async function setView(b, view) {
  const v = typeof view === 'string' ? VIEWS[view] : view;
  b.view = v;
  await b.send('Emulation.setDeviceMetricsOverride', { width: v.w, height: v.h, deviceScaleFactor: v.mobile ? 2 : 1, mobile: v.mobile,
    screenOrientation: v.w > v.h ? { type: 'landscapePrimary', angle: 90 } : { type: 'portraitPrimary', angle: 0 } });
  await b.send('Emulation.setTouchEmulationEnabled', { enabled: v.mobile, maxTouchPoints: 5 });
}

export async function throttle(b, { cold = true, net = true, cpu = 4 } = {}) {
  if (cold) await b.send('Network.clearBrowserCache');
  if (net) await b.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 });
  await b.send('Emulation.setCPUThrottlingRate', { rate: cpu });
}
export async function unthrottle(b) {
  await b.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await b.send('Emulation.setCPUThrottlingRate', { rate: 1 });
}

export async function open(b, path = '', { wait = 2500 } = {}) {
  await b.send('Page.navigate', { url: BASE + path });
  await sleep(wait);
}

// ── Gesten ──────────────────────────────────────
// Trackpad-Schwung: Rad-Ereignisse mit abklingender Stärke (wie macOS-Momentum). total in px, Vorzeichen = Richtung (positiv = nach unten),
// decay = Abklingen je Schritt (0,92 ≈ 1,2 s, 0,97 ≈ 2,5 s Nachlauf)
export async function flick(b, total, { decay = 0.92, jitter = 0 } = {}) {
  const { w, h } = b.view;
  let v = total * 0.12;
  for (let k = 0; k < 400 && Math.abs(v) > 1; k++) {
    await b.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: w / 2, y: h / 2, deltaX: 0, deltaY: v });
    await sleep(16); v *= decay;
  }
  if (jitter) await b.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: w / 2, y: h / 2, deltaX: 0, deltaY: -Math.sign(total) * jitter });
  await sleep(300);   // ein Mensch beginnt die nächste Geste erst nach einer Pause (die Seite wertet Ereignisse ohne 150 ms Pause als Nachlauf)
}
// Ein einzelner Mausrad-Schritt (klassisches Mausrad)
export const wheelNotch = (b, dy = 100) => b.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: b.view.w / 2, y: b.view.h / 2, deltaX: 0, deltaY: dy });
// Wisch mit dem Finger: dy > 0 = Finger nach oben (Seite geht weiter), in `ms` Millisekunden
export async function touchSwipe(b, dy, { ms = 160, x = null } = {}) {
  const { w, h } = b.view, X = x ?? w / 2, Y0 = h * 0.7, steps = Math.max(4, Math.round(ms / 16));
  await b.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: X, y: Y0 }] });
  for (let k = 1; k <= steps; k++) { await b.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: X, y: Y0 - (dy * k) / steps }] }); await sleep(ms / steps); }
  await b.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
const KEYS = { ArrowDown: [40, 'ArrowDown'], ArrowUp: [38, 'ArrowUp'], PageDown: [34, 'PageDown'], PageUp: [33, 'PageUp'], ' ': [32, 'Space'], Tab: [9, 'Tab'], Escape: [27, 'Escape'] };
export async function keyPress(b, key, modifiers = 0) {
  const [vk, code] = KEYS[key];
  await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, modifiers, text: key === ' ' ? ' ' : undefined });
  await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, modifiers });
}
// Eine Geste je nach Gerät: Handy = Wisch, Desktop = Mausrad-Schwung; dir +1 weiter, −1 zurück
export const gesture = (b, dir = 1) => (b.view.mobile ? touchSwipe(b, dir * 220) : flick(b, dir * 900));

// ── Zustand ─────────────────────────────────────
export const state = (b) => b.js('window.__state()');
export const samples = async (b) => JSON.parse(await b.js('JSON.stringify(window.__S)'));
export const log = async (b) => JSON.parse(await b.js('JSON.stringify(window.__sequenz ? window.__sequenz.log : [])'));
// Sequenz ist bereit: alle Bilder geladen, Standbild ausgeblendet (Startzustand A)
export const waitReady = async (b, ms = 30000) => {
  for (let t = 0; t < ms; t += 100) { if (await b.js(`!!(window.__sequenz && window.__sequenz.bereit && document.documentElement.classList.contains('is-ready'))`)) return true; await sleep(100); }
  return false;
};
// Wartet, bis keine Animation läuft und die Eingabesperre vorbei ist (Zustand steht fest)
export async function idle(b, ms = 8000) {
  for (let t = 0; t < ms; t += 50) { if (await b.js(`!!(window.__sequenz && window.__sequenz.gestenbereit)`)) { await sleep(50); return true; } await sleep(50); }
  return false;
}
export async function waitZustand(b, z, ms = 8000) {
  for (let t = 0; t < ms; t += 50) { if ((await b.js(`window.__sequenz ? window.__sequenz.zustand + (window.__sequenz.busy ? '*' : '') : ''`)) === z) return true; await sleep(50); }
  return false;
}
export async function shot(b, file) {
  // Headless Chrome hängt bei PNG-Aufnahmen großer Mobil-Fenster (z. B. iPad 820×1180) und weiteren Aufrufen danach:
  // dort JPEG (Qualität 92) aufnehmen; die Datei bekommt dann die Endung .jpg
  const jpeg = b.view.mobile && b.view.w >= 600;
  const r = await b.send('Page.captureScreenshot', jpeg ? { format: 'jpeg', quality: 92 } : { format: 'png' });
  const buf = Buffer.from(r.result.data, 'base64');
  if (file) { file = jpeg ? file.replace(/\.png$/, '.jpg') : file; mkdirSync(join(file, '..'), { recursive: true }); writeFileSync(file, buf); }
  return buf;
}

// Vergleicht zwei Bildschirmfotos pixelweise (im Browser dekodiert): Anzahl der Pixel mit mehr als `tol` Stufen Unterschied
// und größter Unterschied. Byte-Gleichheit wäre zu streng: an Kanten mit Bruchteil-Pixeln rastert Chrome je nach Verlauf
// anders. Die obersten `ignoreTop` CSS-Pixel (Kopf mit dem Kästchen „Hofer Bräu“) zählen nicht mit.
export function pixelDiff(b, bufA, bufB, tol = 4, ignoreTop = 40) {
  const mime = (buf) => (buf[0] === 0xff ? 'jpeg' : 'png');
  return b.js(`(async () => {
    const load = async (src) => { const img = new Image(); img.src = src; await img.decode(); const c = new OffscreenCanvas(img.naturalWidth, img.naturalHeight); const g = c.getContext('2d'); g.drawImage(img, 0, 0); return g.getImageData(0, 0, c.width, c.height).data; };
    const [x, y] = [await load('data:image/${mime(bufA)};base64,${bufA.toString('base64')}'), await load('data:image/${mime(bufB)};base64,${bufB.toString('base64')}')];
    let n = 0, max = 0;
    const skip = Math.round(${ignoreTop} * (x.length / 4 / innerWidth / innerHeight) ** 0.5) * Math.round(x.length / 4 / innerHeight) * 4;   // Kopfband (Kästchen „Hofer Bräu“ auf Bruchteil-Pixeln) auslassen
    for (let i = skip; i < x.length; i += 4) { const d = Math.max(Math.abs(x[i] - y[i]), Math.abs(x[i + 1] - y[i + 1]), Math.abs(x[i + 2] - y[i + 2])); if (d > max) max = d; if (d > ${tol}) n++; }
    return { n, max };
  })()`);
}

// Bierfläche berührt den linken, rechten und unteren Rand? Anteil der Randpixel in Bier-Gold (#C5A149, Toleranz `tol`)
// im Bereich unterhalb der Schaumkrone. Der Titel liegt mittig, berührt also keinen Rand.
export function edgeGold(b, buf, tol = 30) {
  const mime = buf[0] === 0xff ? 'jpeg' : 'png';
  return b.js(`(async () => {
    const img = new Image(); img.src = 'data:image/${mime};base64,${buf.toString('base64')}'; await img.decode();
    const w = img.naturalWidth, h = img.naturalHeight, c = new OffscreenCanvas(w, h), g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, w, h).data, s = Math.max(1, Math.round(w / innerWidth));
    const gold = (x, y) => { const i = (y * w + x) * 4; return Math.abs(d[i] - 197) <= ${tol} && Math.abs(d[i + 1] - 161) <= ${tol} && Math.abs(d[i + 2] - 73) <= ${tol}; };
    const frac = (pts) => pts.filter(([x, y]) => gold(x, y)).length / pts.length;
    const left = [], right = [], bottom = [];
    for (let y = Math.round(h * 0.6); y < h - 2 * s; y += s * 4) { left.push([s, y]); right.push([w - 1 - s, y]); }
    for (let x = Math.round(w * 0.05); x < w * 0.95; x += s * 8) bottom.push([x, h - 1 - s]);
    return { left: frac(left), right: frac(right), bottom: frac(bottom) };
  })()`);
}

// Anteil der Pixel in Bier-Gold (#C5A149, Toleranz `tol`) im Streifen von y0 bis y1 (Anteile der Bildhöhe), über die ganze Breite.
// Bläschen und Titel zählen nicht als Gold, deshalb liegt ein volles Bier bei etwa 0,95 bis 1.
export function goldShare(b, buf, y0 = 0, y1 = 1, tol = 30) {
  const mime = buf[0] === 0xff ? 'jpeg' : 'png';
  return b.js(`(async () => {
    const img = new Image(); img.src = 'data:image/${mime};base64,${buf.toString('base64')}'; await img.decode();
    const w = img.naturalWidth, h = img.naturalHeight, c = new OffscreenCanvas(w, h), g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, w, h).data;
    let n = 0, gold = 0;
    for (let y = Math.round(h * ${y0}); y < Math.round(h * ${y1}); y += 2) for (let x = 0; x < w; x += 2) {
      const i = (y * w + x) * 4; n++;
      if (Math.abs(d[i] - 197) <= ${tol} && Math.abs(d[i + 1] - 161) <= ${tol} && Math.abs(d[i + 2] - 73) <= ${tol}) gold++;
    }
    return n ? gold / n : 0;
  })()`);
}

// Seeded Zufall (wiederholbare Positionen)
export function rng(seed) {
  return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
