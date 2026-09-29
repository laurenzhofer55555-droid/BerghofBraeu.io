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
  return {
    y: Math.round(scrollY), u: q ? +q.u.toFixed(4) : null, target: q ? +q.target.toFixed(6) : null, p: q ? +q.progress.toFixed(6) : null,
    frame: q ? q.frame : null, shown: q ? q.shown : null, minis: q ? q.loaded.mini : 0,
    canvas: num(cs('#sequenz')?.opacity), beer: num(cs('.beer')?.opacity), title: num(cs('.hero__text')?.opacity), cap: num(cs('.cap-title')?.opacity),
    level: Math.round(ty(document.querySelector('.beer__liquid'))), gold: document.documentElement.classList.contains('gold-page'),
    height: document.documentElement.scrollHeight,
    range: (() => { const i = document.querySelector('.intro'), h = document.getElementById('start'); return i && h ? i.offsetHeight - h.offsetHeight : 0; })(),
  };
};
// Messung nach allen Zeichenschritten des Bildes (rAF, dann setTimeout): so sieht der Fühler genau, was gezeigt wird
(function loop() {
  requestAnimationFrame(() => { setTimeout(record, 0); loop(); });
})();
function record() {
  if (!document.documentElement || !document.body) return;
  const c = document.getElementById('sequenz'), st = window.__state();
  if (c && c.width && st.canvas > 0.05) { const d = c.getContext('2d').getImageData(c.width >> 1, c.height >> 2, 1, 1).data; if (d[0] + d[1] + d[2] < 12) window.__blank++; }
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
    '--hide-scrollbars', '--use-angle=metal', '--enable-gpu', 'about:blank'], { stdio: 'ignore' });
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
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
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
// Trackpad-Schwung: Rad-Ereignisse mit abklingender Stärke (wie macOS-Momentum); total in px, Vorzeichen = Richtung
export async function flick(b, total, { jitter = 0 } = {}) {
  const { w, h } = b.view;
  let v = total * 0.12;
  for (let k = 0; k < 80 && Math.abs(v) > 1; k++) {
    await b.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: w / 2, y: h / 2, deltaX: 0, deltaY: v });
    await sleep(16); v *= 0.92;
  }
  // Loslassen mit winziger Gegenbewegung (Trackpad-Nachlauf, Daumen): früher rastete die Seite dadurch zurück
  if (jitter) { await b.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: w / 2, y: h / 2, deltaX: 0, deltaY: -Math.sign(total) * jitter }); }
}
export const swipe = (b, dy, speed = 4000, fling = true) => {
  const { w, h } = b.view;
  return b.send('Input.synthesizeScrollGesture', { x: w / 2, y: h * 0.6, yDistance: -dy, speed, gestureSourceType: 'touch', preventFling: !fling });
};
export const gesture = (b, dy, opts) => (b.view.mobile ? swipe(b, dy, opts?.speed) : flick(b, dy, opts));

// ── Zustand ─────────────────────────────────────
export const state = (b) => b.js('window.__state()');
export const samples = async (b) => JSON.parse(await b.js('JSON.stringify(window.__S)'));
export const range = (b) => b.js('(() => { const i = document.querySelector(".intro"), h = document.getElementById("start"); return i.offsetHeight - h.offsetHeight; })()');
export const waitStart = async (b, ms = 30000) => {   // Sequenz ist bereit: Standbild ausgeblendet
  for (let t = 0; t < ms; t += 100) { if (await b.js(`document.documentElement.classList.contains('is-ready')`)) return true; await sleep(100); }
  return false;
};
// Wartet, bis Glättung und Bilder angekommen sind (scharfes Bild oder Ruhebild gezeichnet)
export async function settle(b, ms = 5000) {
  for (let t = 0; t < ms; t += 40) {
    // fertig, wenn der Fortschritt zur aktuellen Scrollposition passt (nicht nur zum letzten Durchlauf), Glättung
    // angekommen ist und das scharfe Bild (oder Ruhebild) gezeichnet wurde
    const s = await b.js(`(() => { const q = window.__sequenz; if (!q) return null; const R = document.querySelector('.intro').offsetHeight - document.getElementById('start').offsetHeight;
      return [q.progress, q.target, q.shown, q.u, Math.min(1, Math.max(0, scrollY / R))]; })()`);
    if (s && Math.abs(s[0] - s[1]) < 1e-9 && Math.abs(s[1] - s[4]) < 1e-4 && (s[3] > 2.02 || /^(still|full)/.test(s[2] || ''))) { await sleep(60); return true; }
    await sleep(40);
  }
  return false;
}
export async function shot(b, file) {
  const r = await b.send('Page.captureScreenshot', { format: 'png' });
  const buf = Buffer.from(r.result.data, 'base64');
  if (file) { mkdirSync(join(file, '..'), { recursive: true }); writeFileSync(file, buf); }
  return buf;
}

// Seeded Zufall (wiederholbare Positionen)
export function rng(seed) {
  return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
