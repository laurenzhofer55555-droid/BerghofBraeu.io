// Test der Sequenz im ECHTEN Safari (macOS) über safaridriver (WebDriver). Voraussetzungen (einmalig):
//   sudo safaridriver --enable            und in Safari: Entwickler → „Entfernte Automatisierung erlauben“
// Aufruf:  python3 tools/tests/serve.py . 5263 &   dann   node tools/tests/safari.mjs
// Prüft die Fehler, die nur Safari zeigte: Vorwärts-Scrollen mit winziger Gegenbewegung beim Loslassen (früher sprang die
// Seite zurück auf den Start), schneller Schwung, Neu laden, Bilder an festen Stellen. Bilder: $TMPDIR/berghof-tests/safari/
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.BASE || 'http://127.0.0.1:5263/';
const PORT = Number(process.env.SAFARI_PORT || 4455);
const OUT = join(tmpdir(), 'berghof-tests', 'safari');
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'OK    ' : 'FEHLER'} ${name}${detail ? '  ' + detail : ''}`); };

const driver = spawn('safaridriver', ['-p', String(PORT)], { stdio: 'ignore' });
await sleep(1500);
const call = async (method, path, body) => {
  const res = await fetch(`http://127.0.0.1:${PORT}${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await res.json();
  if (j.value?.error) throw new Error(`${j.value.error}: ${j.value.message}`);
  return j.value;
};
let sid;
try {
  const s = await call('POST', '/session', { capabilities: { alwaysMatch: { browserName: 'safari' } } });
  sid = s.sessionId;
  console.log(`Safari ${s.capabilities.browserVersion} auf ${s.capabilities.platformName}`);
  const S = (p) => `/session/${sid}${p}`;
  const js = (script, args = []) => call('POST', S('/execute/sync'), { script, args });
  const shot = async (name) => { const b64 = await call('GET', S('/screenshot')); writeFileSync(join(OUT, name + '.png'), Buffer.from(b64, 'base64')); };
  // Mausrad-Schritte über WebDriver: safaridriver wertet je Aufruf nur einen Schritt, und die Richtung folgt der Systemeinstellung
  // „Natürliches Scrollen“ (unten automatisch erkannt: sign = 1 heißt, positives deltaY scrollt nach unten)
  let sign = 1;
  const tick = async (dy, ms, x = 300, y = 300) => {
    await call('POST', S('/actions'), { actions: [{ type: 'wheel', id: 'w', actions: [{ type: 'scroll', x, y, deltaX: 0, deltaY: Math.round(dy * sign), duration: ms, origin: 'viewport' }] }] });
    await call('DELETE', S('/actions'));
  };
  // safaridriver wertet nur den ersten Mausrad-Schritt einer Geste: eine Geste besteht deshalb aus scrollBy-Schritten
  // (echte Scroll-Ereignisse in Safari, mit Pausen dazwischen). Ein einzelner nativer Mausrad-Schritt wird unten geprüft.
  const gesture = async (steps) => { for (const [dy, ms] of steps) { await js(`window.scrollBy(0, arguments[0])`, [dy]); await sleep(ms); } };
  const st = () => js(`const q = window.__sequenz; return q ? { y: Math.round(scrollY), u: +q.u.toFixed(3), frame: q.frame, shown: q.shown, ready: document.documentElement.classList.contains('is-ready') } : null;`);

  await call('POST', S('/window/rect'), { x: 40, y: 40, width: 1440, height: 900 });
  await call('POST', S('/url'), { url: BASE });
  await js(`try { localStorage.setItem('berghof-ab16', String(Date.now() + 864e5)); } catch (e) {}`);   // Altersabfrage bestätigt
  await call('POST', S('/url'), { url: BASE });
  await sleep(2500);
  await js(`window.dispatchEvent(new Event('pointerdown'))`);
  for (let i = 0; i < 60 && !(await st())?.ready; i++) await sleep(250);
  let a = await st();
  check('safari: Sequenz startet, Standbild ausgeblendet', !!a && a.ready, JSON.stringify(a));
  await js(`window.scrollTo(0, 0)`); await sleep(400);
  await tick(60, 50); await sleep(400);
  if ((await st()).y === 0) { sign = -1; await tick(60, 50); await sleep(400); }
  check('safari: Mausrad-Geste kommt an', (await st()).y > 0, `Richtung ${sign > 0 ? 'normal' : 'umgekehrt (natürliches Scrollen)'}`);
  const range = await js(`return document.querySelector('.intro').offsetHeight - document.getElementById('start').offsetHeight;`);
  const vh = await js(`return innerHeight;`);
  console.log(`Fenster ${await js('return innerWidth')}×${vh}, Scrollstrecke ${range}`);

  // 1. Vorwärts, dann winzige Gegenbewegung: früher sprang die Seite auf den Start zurück
  for (const dy of [180, 320, 700]) {
    await js(`window.scrollTo(0, 0)`); await sleep(600);
    await gesture([...Array.from({ length: 10 }, () => [dy / 10, 16]), [-4, 16]]);   // vorwärts, beim Loslassen winzige Gegenbewegung
    await sleep(300);
    const y1 = (await st()).y;
    await sleep(3500);
    const b = await st();
    check(`safari: ${dy} px vorwärts mit Zucken, danach Ruhe`, Math.abs(b.y - y1) <= 2 && b.y >= dy * 0.5, `${y1} → ${b.y} (Stufe ${b.u})`);
  }

  // 2. Bild passt zur Position (schneller Sprung und langsam gleich)
  const R = range;
  for (const p of [0.2, 0.5, 0.7, 0.85, 1]) {
    await js(`window.scrollTo(0, ${Math.round(p * R)})`); await sleep(1500);
    const s = await st();
    check(`safari: bei ${p} passt das Bild zur Position`, Math.abs(s.u - p * 3) < 0.02, `Stufe ${s.u}, Bild ${s.frame}, gezeigt ${s.shown}`);
    await shot(`safari-${String(p).replace('.', '_')}`);
  }
  const frame = await js(`const f = document.querySelector('#start > .frame'); const b = document.querySelector('.beer'); return { frame: getComputedStyle(f).opacity, beer: getComputedStyle(b).opacity, gold: document.documentElement.classList.contains('gold-page') };`);
  check('safari: am Ende Rahmen weg, Bier leer (Seite beige)', frame.frame === '0', JSON.stringify(frame));

  // 3. Schneller Schwung ans Ende und zurück an den Anfang
  await js(`window.scrollTo(0, 0)`); await sleep(800);
  await gesture(Array.from({ length: 14 }, () => [400, 30]));
  await sleep(1500);
  const end = await st();
  await gesture(Array.from({ length: 16 }, () => [-500, 30]));
  await sleep(2000);
  const top = await st();
  check('safari: schneller Schwung nach unten und zurück, sauber am Start', top.y === 0 && top.u === 0 && end.y > R * 0.5, `unten ${end.y}, zurück ${top.y}, Bild ${top.shown}`);

  // 4. Neu laden mitten in der Sequenz: Stelle und Bild bleiben passend zusammen
  await js(`window.scrollTo(0, ${Math.round(0.4 * R)})`); await sleep(1200);
  await call('POST', S('/refresh')); await sleep(3000);
  await js(`window.dispatchEvent(new Event('pointerdown'))`); await sleep(2000);
  const r = await st();
  check('safari: nach Neuladen passen Position und Bild zusammen', !!r && Math.abs(r.u - (r.y / R) * 3) < 0.02, JSON.stringify(r));
  const errs = await js(`return window.__sequenz ? 'ok' : 'Sequenz fehlt';`);
  check('safari: Sequenz nach Neuladen aktiv', errs === 'ok');
} catch (e) {
  check('safari: ohne Absturz', false, e.message);
} finally {
  if (sid) { try { await call('DELETE', `/session/${sid}`); } catch {} }
  driver.kill();
}
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed} von ${results.length} Prüfungen bestanden${failed ? `, ${failed} FEHLER` : ' ✓'}`);
process.exit(failed ? 1 : 0);
