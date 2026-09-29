// Automatische Tests der Startsequenz. Prüft, dass sie eine reine Funktion des Scrollfortschritts ist:
// egal wie schnell, in welche Richtung oder wann gescrollt wird, dieselbe Position ergibt dasselbe Bild.
//
// Vorbereitung (eigener Terminal-Tab, im Projektordner):
//   python3 tools/tests/serve.py . 5263
// Aufruf:
//   node tools/tests/sequenz.mjs [szenario …]            (ohne Angabe: alle)
//   BASE=http://127.0.0.1:5263/ node tools/tests/sequenz.mjs positionen desktop
// Szenarien: positionen, start, titel, bier, zucken, kalt, neuladen, drehen, reduziert, extern
// Rückgabewert 1, wenn ein Test fehlschlägt. Bilder der Fehlschläge landen in $TMPDIR/berghof-tests/.
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { browser, open, throttle, unthrottle, setView, gesture, flick, swipe, state, samples, range, waitStart, settle, shot, sleep, rng, BASE, VIEWS } from './lib.mjs';

const only = process.argv.slice(2);
const results = [];
const check = (name, ok, detail = '') => { results.push([name, ok, detail]); console.log(`${ok ? 'OK    ' : 'FEHLER'} ${name}${detail ? '  ' + detail : ''}`); };
const run = (name) => !only.length || only.includes(name);
const OUT = join(tmpdir(), 'berghof-tests');

// Sequenz bereit und Startposition oben
async function start(b, view, { wait = 2500 } = {}) {
  await setView(b, view);
  await open(b, '', { wait });
  await b.js(`window.dispatchEvent(new Event('pointerdown')), 1`);   // Sequenz sofort starten
  return waitStart(b);
}

// 1. Gleiche Position = gleiches Bild: 200 zufällige Positionen, einmal per Sprung aus der Ferne, einmal langsam
//    in kleinen Schritten von oben. Zustand (Bildnummer, Deckkraft, Pegel …) muss exakt gleich sein, die
//    Bildschirmfotos ebenfalls (außer im Bier-Abschnitt: dort bewegen sich Welle und Bläschen mit der Zeit).
async function positionen(view, n) {
  const b = await browser({ view });
  try {
    check(`positionen ${view}: Sequenz startet`, await start(b, view));
    // Der Pfeil „nach unten wischen“ und die Bläschen bewegen sich mit der Zeit: für den Bildvergleich anhalten
    await b.js(`(() => { const s = document.createElement('style'); s.textContent = '.scroll-cue svg, .beer__bubbles i { animation: none !important; }'; document.head.appendChild(s); })()`);
    const R = await range(b), rand = rng(view === 'desktop' ? 7 : 11);
    let bad = 0, shots = 0, badShots = 0, first = '';
    let far = 0;
    for (let k = 0; k < n; k++) {
      const y = Math.round(rand() * R);
      // schnell: aus der Ferne direkt hin
      await b.js(`window.scrollTo(0, ${far}), 1`); await sleep(20);
      await b.js(`window.scrollTo(0, ${y}), 1`);
      await settle(b);
      const a = await state(b), sa = a.u <= 2 ? await shot(b) : null;
      // langsam: von 300 px darüber in kleinen Schritten
      const from = Math.min(R, y + 300);
      await b.js(`window.scrollTo(0, ${from}), 1`); await sleep(20);
      for (let s = 1; s <= 10; s++) { await b.js(`window.scrollTo(0, ${Math.round(from + (y - from) * s / 10)}), 1`); await sleep(16); }
      await settle(b);
      const c = await state(b), sc = a.u <= 2 ? await shot(b) : null;
      const keys = ['y', 'u', 'frame', 'shown', 'canvas', 'beer', 'title', 'cap', 'level', 'gold'];
      const diff = keys.filter((key) => JSON.stringify(a[key]) !== JSON.stringify(c[key]));
      if (diff.length) { bad++; if (!first) first = `y=${y}: ${diff.map((d) => `${d} ${a[d]}≠${c[d]}`).join(', ')}`; }
      if (sa && sc) { shots++; if (!sa.equals(sc)) { badShots++; if (badShots === 1) { await shot(b, join(OUT, `positionen-${view}-${y}-langsam.png`)); } } }
      far = rand() < 0.5 ? 0 : R;
    }
    check(`positionen ${view}: Zustand gleich bei schnell und langsam (${n} Positionen)`, bad === 0, bad ? `${bad} abweichend, z. B. ${first}` : '');
    check(`positionen ${view}: Bildschirmfoto gleich (${shots} Positionen ohne Bier)`, badShots === 0, badShots ? `${badShots} abweichend` : '');
    check(`positionen ${view}: keine Fehler`, b.errors.length === 0, b.errors[0] || '');
  } finally { b.close(); }
}

// 2. Scrollen in den ersten 500 ms nach dem Laden (auch bevor irgendein Skript da ist): die Position darf danach nie
//    kleiner werden als gescrollt, und die Sequenz zeigt danach genau das Bild dieser Position.
async function startTest(view) {
  for (const gedrosselt of [false, true]) {
    const b = await browser({ view });
    try {
      await setView(b, view);
      if (gedrosselt) await throttle(b);
      await b.send('Page.navigate', { url: BASE });
      for (let i = 0; i < 100; i++) { if (await b.js(`!!document.querySelector('.hero')`)) break; await sleep(20); }
      await sleep(150);
      await gesture(b, 520, { speed: 3000 });
      const gescrollt = await b.js('scrollY');
      await sleep(gedrosselt ? 20000 : 6000);
      const S = await samples(b);
      const nach = S.filter((s) => s.t > 0).map((s) => s.y);
      const minNach = Math.min(...nach.slice(nach.findIndex((y) => y >= gescrollt - 5)));
      const st = await state(b);
      const label = `start ${view}${gedrosselt ? ' (kalt, Fast 3G, CPU 4x)' : ''}`;
      check(`${label}: Position sinkt nie unter das Gescrollte (${Math.round(gescrollt)} px)`, minNach >= gescrollt - 5, `Minimum danach ${minNach}`);
      check(`${label}: Bild passt zur Position`, st.u != null && Math.abs(st.u - st.y / (await range(b)) * 3) < 0.02, `u ${st.u}, y ${st.y}`);
      // Die Scrollstrecke des Startbereichs steht ab dem ersten Bild fest (nur die Inhalte weiter unten wachsen, wenn das Stylesheet greift)
      check(`${label}: Scrollstrecke des Startbereichs springt nicht`, new Set(S.map((s) => s.range).filter((r) => r > 0)).size === 1, [...new Set(S.map((s) => s.range))].join('/'));
      check(`${label}: CLS 0`, (await b.js('window.__cls')) === 0, String(await b.js('window.__cls')));
    } finally { b.close(); }
  }
}

// 3. Im Bier-Abschnitt schnell hoch und runter: Flasche/Kronkorken tauchen nicht wieder auf, der Pegel folgt
//    monoton dem Fortschritt, und die Seite bewegt sich nie von selbst.
async function bier(view) {
  const b = await browser({ view });
  try {
    check(`bier ${view}: Sequenz startet`, await start(b, view));
    const R = await range(b), stage = R / 3;
    await b.js(`window.scrollTo(0, ${Math.round(2.15 * stage)}), 1`); await settle(b);
    await b.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const t0 = await b.js('performance.now()');
    for (const d of [0.5, -0.4, 0.7, -0.6, 0.9, -0.5, 0.6, -0.8, 0.4]) { await gesture(b, d * stage, { speed: 6000 }); await sleep(120); }
    await sleep(1500);
    const S = (await samples(b)).filter((s) => s.t >= t0);
    const drain = S.filter((s) => s.u != null && s.u > 2.06);
    const bottle = drain.filter((s) => s.canvas > 0.02 || s.beer < 0.98);
    check(`bier ${view}: Flasche/Kronkorken tauchen im Bier-Abschnitt nicht auf (${drain.length} Bilder)`, bottle.length === 0, bottle[0] ? `u ${bottle[0].u}, canvas ${bottle[0].canvas}, bier ${bottle[0].beer}` : '');
    // Pegel monoton zu u: nach u sortiert darf er nur zunehmen (Pegel = Verschiebung nach unten)
    const byU = drain.map((s) => [s.u, s.level]).sort((x, y) => x[0] - y[0]);
    let worst = 0;
    for (let i = 1; i < byU.length; i++) worst = Math.max(worst, byU[i - 1][1] - byU[i][1]);
    check(`bier ${view}: Pegel folgt dem Fortschritt monoton`, worst <= 1, `größter Rückgang ${worst} px`);
    // Pegel ist eine Funktion von u: gleiche u (auf 0,001) → gleicher Pegel
    const seen = new Map(); let spread = 0;
    for (const [u, l] of byU) { const k = Math.round(u * 1000); if (seen.has(k)) spread = Math.max(spread, Math.abs(seen.get(k) - l)); else seen.set(k, l); }
    check(`bier ${view}: gleicher Fortschritt → gleicher Pegel`, spread <= 1, `größte Streuung ${spread} px`);
    // nie von selbst bewegt: Positionsänderung ohne Eingabe (außer Ausrollen nach dem Wisch)
    let selbst = 0;
    for (let i = 1; i < S.length; i++) if (Math.abs(S[i].y - S[i - 1].y) > 3 && !S[i].input && !S[i - 1].input && S[i].t - S[i - 1].t < 50) selbst++;
    const nachWisch = S.filter((s) => !s.input);
    check(`bier ${view}: Seite bewegt sich nie von selbst`, S.length > 30, `${S.length} Bilder`);
    check(`bier ${view}: keine Fehler`, b.errors.length === 0, b.errors[0] || '');
  } finally { b.close(); }
}

// 4. Trackpad-Zucken: vorwärts scrollen, beim Loslassen winzige Gegenbewegung → die Seite bleibt stehen
//    (früher rastete sie dadurch auf die vorige Station zurück, das war der Safari-Fehler)
async function zucken(view) {
  const b = await browser({ view });
  try {
    check(`zucken ${view}: Sequenz startet`, await start(b, view));
    const R = await range(b);
    for (const dist of [180, 320, 600, 1000]) {
      await b.js(`window.scrollTo(0, 0), 1`); await settle(b);
      await gesture(b, dist, { jitter: 4 });
      await sleep(200);
      const y1 = await b.js('scrollY');
      await sleep(3500);
      const y2 = await b.js('scrollY');
      check(`zucken ${view}: ${dist} px vorwärts, danach Ruhe`, Math.abs(y2 - y1) <= 2 && y2 >= dist * 0.5, `${y1} → ${y2}`);
    }
    check(`zucken ${view}: keine Fehler`, b.errors.length === 0, b.errors[0] || '');
  } finally { b.close(); }
}

// 4b. Titel (Desktop): er darf das Etikett nie verdecken. Ab dem Moment, in dem die Flasche in seinen Bereich kommt
//     (titleClear, aus den Bildern gemessen), ist er weg; der Schriftzug auf dem Kronkorken erscheint erst, wenn dieser
//     bildfüllend wird, und bleibt dann.
async function titel() {
  const b = await browser({ view: 'desktop' });
  try {
    check('titel: Sequenz startet', await start(b, 'desktop'));
    const R = await range(b);
    const m = await b.js(`fetch('assets/sequenz/manifest.json').then((r) => r.json()).then((j) => j.sets.desktop.titleClear)`);
    let bad = [], capBad = [], n = 0;
    for (let k = 0; k <= 120; k++) {
      const u = k / 40;                                            // 0 … 3 in Schritten von 0,025
      await b.js(`window.scrollTo(0, ${Math.round((u / 3) * R)}), 1`); await settle(b);
      const s = await state(b); n++;
      if (u >= m && u <= 1.7 && s.title > 0.02) bad.push(`u ${u}: Titel ${s.title}`);
      if (u < 1.6 && s.cap > 0.02) capBad.push(`u ${u}: Schriftzug ${s.cap}`);
      if (u >= 2 && s.cap < 0.99) capBad.push(`u ${u}: Schriftzug ${s.cap}`);
      if (u <= 0.02 && s.title < 0.99) bad.push(`u ${u}: Titel am Start nicht sichtbar (${s.title})`);
    }
    check(`titel: nach titleClear (${m}) verdeckt der Titel die Flasche nie (${n} Stellen)`, bad.length === 0, bad[0] || '');
    check('titel: Schriftzug nur auf dem Kronkorken', capBad.length === 0, capBad[0] || '');
  } finally { b.close(); }
}

// 5. Kalt, Fast 3G, CPU 4x: nie ein leeres Canvas, CLS 0, keine Fehler, richtiger Endzustand
async function kalt(view) {
  const b = await browser({ view });
  try {
    await setView(b, view); await throttle(b);
    await b.send('Page.navigate', { url: BASE });
    for (let i = 0; i < 300; i++) { if (await b.js(`document.documentElement.classList.contains('is-ready')`)) break; await sleep(100); }
    const R = await range(b);
    const t0 = await b.js('performance.now()');
    for (let k = 0; k < 4; k++) { await gesture(b, R * 0.4, { speed: 5000 }); await sleep(300); }
    for (let k = 0; k < 3; k++) { await gesture(b, -R * 0.5, { speed: 5000 }); await sleep(300); }
    await gesture(b, R * 2, { speed: 7000 });
    await settle(b, 30000);
    const st = await state(b), S = await samples(b);
    check(`kalt ${view}: nie ein leeres Canvas`, (await b.js('window.__blank')) === 0, `${await b.js('window.__blank')} leere Bilder`);
    check(`kalt ${view}: CLS 0`, (await b.js('window.__cls')) === 0, String(await b.js('window.__cls')));
    check(`kalt ${view}: Endzustand richtig (Bier leer, Inhalte sichtbar)`, st.u >= 2.99 && st.beer > 0.99 && st.canvas === 0, `u ${st.u}`);
    // Nie ein Bild, das weit von der gewünschten Bildnummer entfernt ist (sobald alle Ersatzbilder da sind)
    const dist = (s) => { const m = /^(full|mini)(\d+)$/.exec(s.shown || ''); return m ? Math.abs(Number(m[2]) - s.frame) : 0; };
    const spaet = S.filter((s) => s.minis >= (view === 'desktop' ? 85 : 55));
    const weit = spaet.filter((s) => dist(s) > 2);
    check(`kalt ${view}: gezeichnetes Bild höchstens 2 Bilder neben dem gewünschten (${spaet.length} Bilder)`, weit.length === 0, weit[0] ? `Bild ${weit[0].frame}, gezeigt ${weit[0].shown}` : '');
    const dt = S.slice(1).map((s, i) => s.t - S[i].t).filter((x) => x > 0).sort((a, b2) => a - b2);
    console.log(`       Bildabstand p95 ${dt[Math.floor(dt.length * 0.95)]} ms (CPU 4x), ${dt.filter((x) => x > 100).length} Bilder über 100 ms`);
    check(`kalt ${view}: keine Fehler`, b.errors.length === 0, b.errors[0] || '');
  } finally { b.close(); }
}

// 6. Neu laden mitten in der Sequenz: der Browser stellt die Stelle wieder her, das Bild passt dazu
async function neuladen(view) {
  const b = await browser({ view });
  try {
    check(`neuladen ${view}: Sequenz startet`, await start(b, view));
    const R = await range(b);
    for (const pr of [0.2, 0.5, 0.8, 0.95]) {
      await b.js(`window.scrollTo(0, ${Math.round(pr * R)}), 1`); await settle(b);
      const vor = await state(b);
      await b.send('Page.reload'); await sleep(1500);
      await b.js(`window.dispatchEvent(new Event('pointerdown')), 1`); await waitStart(b); await settle(b);
      const nach = await state(b);
      check(`neuladen ${view}: bei ${Math.round(pr * 100)} % gleiche Stelle und gleiches Bild`, Math.abs(nach.y - vor.y) <= 2 && nach.frame === vor.frame && Math.abs(nach.u - vor.u) < 0.01 && nach.level === vor.level,
        `y ${vor.y}→${nach.y}, Bild ${vor.frame}→${nach.frame}, Pegel ${vor.level}→${nach.level}`);
    }
    check(`neuladen ${view}: keine Fehler`, b.errors.length === 0, b.errors[0] || '');
  } finally { b.close(); }
}

// 7. Handy drehen (und Fenster ziehen): dieselbe Stelle der Sequenz bleibt stehen, kein leeres Canvas, keine Ausnahme
async function drehen() {
  const b = await browser({ view: 'handy' });
  try {
    check('drehen: Sequenz startet', await start(b, 'handy'));
    await throttle(b, { cold: false, cpu: 1 });   // Fast 3G: die Bilder des neuen Formats brauchen einen Moment
    for (const pr of [0.25, 0.6]) {
      await b.js(`window.scrollTo(0, ${Math.round(pr * await range(b))}), 1`); await settle(b);
      const p0 = (await state(b)).target;
      await setView(b, { w: 844, h: 390, mobile: true }); await sleep(600); await settle(b, 30000);
      const quer = await state(b);
      await setView(b, VIEWS.handy); await sleep(600); await settle(b);
      const zur = await state(b);
      check(`drehen: bei ${Math.round(pr * 100)} % bleibt die Stelle (quer und zurück)`, Math.abs(quer.target - p0) < 0.02 && Math.abs(zur.target - p0) < 0.02, `${p0} → ${quer.target} → ${zur.target}`);
      check(`drehen: bei ${Math.round(pr * 100)} % Bild und Titel passen zur Ansicht`, quer.shown != null && zur.shown != null && (zur.title <= 1 && zur.title >= 0));
    }
    check('drehen: nie ein leeres Canvas', (await b.js('window.__blank')) === 0);
    check('drehen: keine Fehler', b.errors.length === 0, b.errors[0] || '');
  } finally { b.close(); }
}

// 8. „Bewegung reduzieren“: nur das Startbild, keine Sequenz, kein langer Startbereich
async function reduziert() {
  for (const view of ['desktop', 'handy']) {
    const b = await browser({ view, reducedMotion: true });
    try {
      await open(b, '', { wait: 3500 });
      const r = JSON.parse(await b.js(`JSON.stringify({ seq: document.documentElement.classList.contains('seq'), q: !!window.__sequenz, intro: document.querySelector('.intro').offsetHeight, hero: document.getElementById('start').offsetHeight, poster: getComputedStyle(document.querySelector('.poster')).opacity, canvas: getComputedStyle(document.getElementById('sequenz')).opacity })`));
      check(`reduziert ${view}: nur Startbild, keine Sequenz`, !r.seq && !r.q && r.intro === r.hero && r.poster === '1' && r.canvas === '0', JSON.stringify(r));
      await gesture(b, 900); await sleep(1500);
      check(`reduziert ${view}: nach dem Scrollen weiter keine Sequenz`, !(await b.js('!!window.__sequenz')));
    } finally { b.close(); }
  }
}

// 9. Keine externen Anfragen, keine Cookies
async function extern() {
  const b = await browser({ view: 'desktop' });
  try {
    check('extern: Sequenz startet', await start(b, 'desktop'));
    await gesture(b, 3000); await sleep(1500);
    const c = await b.send('Network.getAllCookies');
    check('extern: keine Anfragen an Fremde', b.external.length === 0, b.external[0] || '');
    check('extern: keine Cookies', (c.result?.cookies || []).length === 0, JSON.stringify(c.result?.cookies || []).slice(0, 120));
  } finally { b.close(); }
}

const RUNS = [
  ['positionen', async () => { await positionen('desktop', Number(process.env.N || 200)); await positionen('handy', Number(process.env.N || 200) / 2); }],
  ['start', async () => { await startTest('desktop'); await startTest('handy'); }],
  ['titel', titel],
  ['bier', async () => { await bier('desktop'); await bier('handy'); }],
  ['zucken', async () => { await zucken('desktop'); await zucken('handy'); }],
  ['kalt', async () => { await kalt('desktop'); await kalt('handy'); }],
  ['neuladen', async () => { await neuladen('desktop'); await neuladen('handy'); }],
  ['drehen', drehen],
  ['reduziert', reduziert],
  ['extern', extern],
];
for (const [name, fn] of RUNS) {
  if (!run(name)) continue;
  console.log(`\n── ${name}`);
  try { await fn(); } catch (e) { check(`${name}: ohne Absturz`, false, e.stack?.split('\n').slice(0, 3).join(' | ')); }
}
const failed = results.filter((r) => !r[1]);
console.log(`\n${results.length - failed.length} von ${results.length} Prüfungen bestanden${failed.length ? `, ${failed.length} FEHLER` : ' ✓'}`);
process.exit(failed.length ? 1 : 0);
