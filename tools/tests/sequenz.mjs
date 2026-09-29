// Automatische Tests der Startsequenz mit zwei Gesten (Zustände A Start, B Bier, C Inhalt), echte Ereignisse im Headless Chrome.
//
// Vorbereitung (eigener Terminal-Tab, im Projektordner):
//   python3 tools/tests/serve.py . 5263
// Aufruf:
//   node tools/tests/sequenz.mjs [szenario …]            (ohne Angabe: alle)
// Szenarien: gesten, flick, sperre, hinundher, laden, kalt, uebergang, zustandB, neuladen, drehen, tasten, skip, reduziert, extern
// Rückgabewert 1, wenn ein Test fehlschlägt. Bilder landen in $TMPDIR/berghof-tests/.
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { browser, open, throttle, setView, flick, touchSwipe, keyPress, wheelNotch, gesture, state, samples, log, waitReady, idle, waitZustand,
  shot, edgeGold, sleep, BASE, VIEWS, DEVICES } from './lib.mjs';

const only = process.argv.slice(2);
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'OK    ' : 'FEHLER'} ${name}${detail ? '  ' + detail : ''}`); };
const run = (name) => !only.length || only.includes(name);
const OUT = join(tmpdir(), 'berghof-tests');
const starts = async (b) => (await log(b)).filter((e) => e.art === 'start').length;

// Seite öffnen, bis Zustand A steht (alle Bilder geladen, Standbild ausgeblendet)
async function start(b, view, { throttled = false, path = '' } = {}) {
  await setView(b, view);
  if (throttled) await throttle(b);
  await b.send('Page.navigate', { url: BASE + path });
  return waitReady(b, throttled ? 90000 : 30000);
}
// Geste je Eingabeart. dir +1 weiter, −1 zurück
const EINGABEN = {
  wheel: (b, dir) => flick(b, dir * 900),
  touch: (b, dir) => touchSwipe(b, dir * 220),
  tasten: (b, dir) => keyPress(b, dir > 0 ? 'ArrowDown' : 'ArrowUp'),
};
const snap = async (b) => { const s = await state(b); return JSON.stringify({ z: s.z, P: s.P, cv: s.cv, frameO: s.frameO, beer: s.beer, title: s.title, cue: s.cue, level: s.level, gold: s.gold, frei: s.frei }); };

// 1. Genau 2 Gesten von A bis C, genau 2 Gesten von C zurück bis A (Mausrad, Touch, Tastatur)
async function gesten() {
  for (const [label, view, arten] of [['desktop', 'desktop', ['wheel', 'tasten']], ['handy', 'handy', ['touch']]]) {
    for (const art of arten) {
      const b = await browser({ view });
      try {
        check(`gesten ${label}/${art}: Start in Zustand A, Seite gesperrt`, await start(b, view) && (await state(b)).z === 'A' && (await state(b)).overflow === 'hidden', JSON.stringify(await state(b)).slice(0, 90));
        const g = EINGABEN[art];
        await g(b, 1);
        check(`gesten ${label}/${art}: Geste 1 führt nach B`, await waitZustand(b, 'B') && await idle(b));
        const sB = await state(b);
        await g(b, 1);
        check(`gesten ${label}/${art}: Geste 2 führt nach C (Seite frei)`, await waitZustand(b, 'C') && await idle(b) && (await state(b)).frei === true && (await state(b)).overflow !== 'hidden');
        await b.js(`window.scrollTo(0, 500)`); await sleep(300);
        const y500 = (await state(b)).y;
        await b.js(`window.scrollTo(0, 0)`); await sleep(700);
        check(`gesten ${label}/${art}: in C normal scrollbar`, y500 >= 400, `y ${y500}`);
        await g(b, -1);
        check(`gesten ${label}/${art}: Geste nach oben in C ganz oben → B (Bier füllt sich)`, await waitZustand(b, 'B') && await idle(b) && (await state(b)).frei === false);
        const sB2 = await state(b);
        await g(b, -1);
        check(`gesten ${label}/${art}: noch eine Geste nach oben → A`, await waitZustand(b, 'A') && await idle(b));
        const n = await starts(b);
        check(`gesten ${label}/${art}: genau 4 Übergänge (2 hin, 2 zurück)`, n === 4, `${n} Übergänge`);
        check(`gesten ${label}/${art}: Zustand B beim Rückweg wie beim Hinweg`, JSON.stringify([sB.P, sB.frameO, sB.level, sB.beer, sB.title]) === JSON.stringify([sB2.P, sB2.frameO, sB2.level, sB2.beer, sB2.title]));
        check(`gesten ${label}/${art}: keine Fehler`, b.errors.length === 0, b.errors[0] || '');
      } finally { b.close(); }
    }
  }
}

// 2. Ein einzelner starker Trackpad-Flick (langer Nachlauf) löst nur Übergang 1 aus, nicht beide
async function flickTest() {
  for (const [view, label] of [['desktop', 'desktop Trackpad-Flick'], ['handy', 'handy schneller langer Wisch']]) {
    const b = await browser({ view });
    try {
      await start(b, view);
      const f = view === 'desktop' ? flick(b, 5000, { decay: 0.97 }) : touchSwipe(b, 700, { ms: 500 });
      const zs = new Set();
      for (let k = 0; k < 90; k++) { const s = await state(b); zs.add(s.z); await sleep(100); }   // 9 s
      await f;
      const s = await state(b), n = await starts(b);
      check(`flick ${label}: löst nur Übergang 1 aus`, n === 1 && s.z === 'B' && !zs.has('C'), `Übergänge ${n}, Zustand ${s.z}, gesehen ${[...zs].join('')}`);
      // danach ein zweiter Flick (neue Geste nach Pause) gehört zu Übergang 2
      await sleep(700);
      view === 'desktop' ? await flick(b, 900) : await touchSwipe(b, 220);
      check(`flick ${label}: eine neue Geste danach löst Übergang 2 aus`, await waitZustand(b, 'C'));
    } finally { b.close(); }
  }
}

// 3. Gesten während der Animation und in der Sperre danach werden ignoriert; kein Zustand dazwischen
async function sperre() {
  for (const view of ['desktop', 'handy']) {
    const b = await browser({ view });
    try {
      await start(b, view);
      await keyPress(b, 'ArrowDown');
      await sleep(400);
      // mitten in der Animation: viele Gesten aller Arten
      for (let k = 0; k < 3; k++) { await keyPress(b, 'ArrowDown'); await sleep(100); }
      await wheelNotch(b, 300); await sleep(200); await wheelNotch(b, -300);
      if (view === 'handy') { await touchSwipe(b, 220, { ms: 80 }); await touchSwipe(b, -220, { ms: 80 }); }
      await keyPress(b, 'ArrowUp'); await keyPress(b, ' ');
      const n1 = await starts(b), busyNow = (await state(b)).busy;
      check(`sperre ${view}: Gesten während der Animation werden ignoriert`, n1 === 1 && busyNow === true, `${n1} Übergang, busy ${busyNow}`);
      // Ende der Animation, dann sofort eine Geste: noch in der Sperre (400 ms)
      for (let k = 0; k < 200 && (await state(b)).busy; k++) await sleep(30);
      await keyPress(b, 'ArrowDown'); await sleep(150);
      const n2 = await starts(b);
      check(`sperre ${view}: direkt nach der Animation (400 ms Sperre) wird nichts ausgelöst`, n2 === 1, `${n2} Übergänge`);
      // nach der Sperre wird die nächste Geste angenommen
      await idle(b); await sleep(150);
      await keyPress(b, 'ArrowDown');
      check(`sperre ${view}: nach der Sperre wird die nächste Geste angenommen`, await waitZustand(b, 'C') && (await starts(b)) === 2);
      // nie ein Zwischenzustand: P wächst monoton
      const S = (await samples(b)).filter((s) => s.P != null);
      let rueck = 0; for (let i = 1; i < S.length; i++) if (S[i].P < S[i - 1].P - 1e-6) rueck++;
      check(`sperre ${view}: P wächst monoton, nie ein Rückschritt (${S.length} Bilder)`, rueck === 0, `${rueck} Rückschritte`);
    } finally { b.close(); }
  }
}

// 4. Hin und her über die Zustände: die Endzustände sind jedes Mal exakt gleich (nichts summiert sich auf)
async function hinundher() {
  const b = await browser({ view: 'desktop' });
  try {
    await start(b, 'desktop');
    const wege = [['B', 1], ['C', 1], ['B', -1], ['A', -1], ['B', 1], ['C', 1], ['B', -1], ['C', 1], ['B', -1], ['A', -1]];   // [Ziel, Richtung]
    const ref = {}, bad = [];
    ref.A = await snap(b);
    for (const [ziel, dir] of wege) {
      if ((await state(b)).z === 'C') { await b.js(`window.scrollTo(0, 0)`); await sleep(700); }
      await flick(b, dir * 900);
      if (!(await waitZustand(b, ziel)) || !(await idle(b))) { bad.push(`→ ${ziel} nicht erreicht`); break; }
      const s = await snap(b);
      if (ref[ziel] === undefined) ref[ziel] = s; else if (ref[ziel] !== s) bad.push(`${ziel}: ${s} ≠ ${ref[ziel]}`);
    }
    check(`hinundher: ${wege.length} Übergänge, Endzustände jedes Mal exakt gleich`, bad.length === 0, bad[0] || `A/B/C je gleich (${Object.keys(ref).join('')})`);
    check('hinundher: keine Fehler', b.errors.length === 0, b.errors[0] || '');
  } finally { b.close(); }
}

// 5. Scrollen direkt nach dem Laden (auch bevor irgendein Skript da ist): kein Zurückziehen, die Seite bleibt oben
async function laden() {
  for (const [view, gedrosselt] of [['desktop', false], ['handy', false], ['desktop', true], ['handy', true]]) {
    const b = await browser({ view });
    try {
      await setView(b, view);
      if (gedrosselt) await throttle(b);
      await b.send('Page.navigate', { url: BASE });
      for (let k = 0; k < 40; k++) {                             // 4 Sekunden lang wischen/rollen/tippen, ab dem ersten Moment
        if (view === 'handy') await touchSwipe(b, 260, { ms: 80 }); else await wheelNotch(b, 200);
        await keyPress(b, 'PageDown');
        await sleep(100);
      }
      await sleep(gedrosselt ? 8000 : 1500);
      const S = await samples(b);
      // in A und B (und bevor die Steuerung da ist) darf die Seite nie wandern; erst in C ist normales Scrollen erlaubt
      const maxY = Math.max(0, ...S.filter((s) => s.z !== 'C').map((s) => s.y || 0));
      const offen = S.filter((s) => s.overflow && s.overflow !== 'hidden' && s.z !== 'C' && s.frei === false);
      const label = `laden ${view}${gedrosselt ? ' (kalt, Fast 3G, CPU 4x)' : ''}`;
      check(`${label}: Seite bewegt sich nie (${S.length} Bilder)`, maxY === 0 && offen.length === 0, `größte Position ${maxY}, ohne Sperre ${offen.length}`);
      check(`${label}: CLS 0`, (await b.js('window.__cls')) === 0, String(await b.js('window.__cls')));
    } finally { b.close(); }
  }
}

// 6. Geste 1 bei kaltem Cache, Fast 3G und CPU 4x: früh ausgelöst wartet sie (Pfeil pulsiert), startet von selbst, nie ein fehlender Frame
async function kalt() {
  for (const view of ['desktop', 'handy']) {
    const b = await browser({ view });
    try {
      await setView(b, view); await throttle(b);
      await b.send('Page.navigate', { url: BASE });
      for (let k = 0; k < 300 && !(await b.js('!!window.__sequenz')); k++) await sleep(100);
      await keyPress(b, 'ArrowDown');                           // so früh wie möglich
      await sleep(300);
      const früh = await state(b);
      check(`kalt ${view}: zu frühe Geste wartet (Pfeil pulsiert), Seite bleibt oben`, früh.wartet === true && früh.z === 'A' && früh.y === 0, `wartet ${früh.wartet}, geladen ${früh.geladen}, Zustand ${früh.z}`);
      check(`kalt ${view}: wartende Geste ist sichtbar (Klasse „wartet“)`, await b.js(`document.documentElement.classList.contains('wartet')`) === true);
      check(`kalt ${view}: startet von selbst, sobald alles geladen ist`, await waitZustand(b, 'B', 120000) && await idle(b));
      const l = await log(b), s = await state(b);
      check(`kalt ${view}: nie ein leeres Canvas, CLS 0, Ende in B`, (await b.js('window.__blank')) === 0 && (await b.js('window.__cls')) === 0 && s.z === 'B', `leer ${await b.js('window.__blank')}, CLS ${await b.js('window.__cls')}, Stillstände ${s.stalls}`);
      check(`kalt ${view}: Übergang lief genau einmal, Seite blieb oben`, l.filter((e) => e.art === 'start').length === 1 && s.y === 0, `${l.filter((e) => e.art === 'start').length} Übergänge`);
      check(`kalt ${view}: keine Fehler`, b.errors.length === 0, b.errors[0] || '');
    } finally { b.close(); }
  }
}

// 7. Übergang Kronkorken → Bier: Bilder bei 50, 70, 80, 90 und 100 % von Geste 1, Farbwechsel prüfen
async function uebergang() {
  for (const [name, view] of Object.entries({ 'desktop-1440': DEVICES['desktop-1440'], 'iphone15': DEVICES.iphone15, 'ipad-air-quer': DEVICES['ipad-air-quer'] })) {
    const b = await browser({ view });
    try {
      await start(b, view);
      const werte = [];
      for (const p of [0.5, 0.7, 0.8, 0.9, 1]) {
        await b.js(`window.__sequenz.zeige(${p})`); await sleep(400);
        const buf = await shot(b, join(OUT, 'uebergang', `${name}-${String(p).replace('.', '_')}.png`));
        // Mitte des Bildes: Mittelwert und Streuung der Farbe (flaches Bier-Gold = geringe Streuung, Kronkorken-Verlauf = große)
        const m = await b.js(`(async () => { const img = new Image(); img.src = 'data:image/${buf[0] === 0xff ? 'jpeg' : 'png'};base64,${buf.toString('base64')}'; await img.decode();
          const c = new OffscreenCanvas(img.naturalWidth, img.naturalHeight), g = c.getContext('2d'); g.drawImage(img, 0, 0);
          const w = c.width, h = c.height, x0 = Math.round(w * 0.3), y0 = Math.round(h * 0.3), cw = Math.round(w * 0.4), ch = Math.round(h * 0.25);
          const d = g.getImageData(x0, y0, cw, ch).data; let r = 0, gg = 0, bb = 0; const n = d.length / 4;
          for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; bb += d[i + 2]; }
          r /= n; gg /= n; bb /= n; let v = 0;
          for (let i = 0; i < d.length; i += 4) v += (d[i] - r) ** 2 + (d[i + 1] - gg) ** 2 + (d[i + 2] - bb) ** 2;
          return { r: Math.round(r), g: Math.round(gg), b: Math.round(bb), std: Math.round(Math.sqrt(v / n / 3)) }; })()`);
        werte.push([p, m]);
      }
      const gold = (m) => Math.abs(m.r - 197) < 30 && Math.abs(m.g - 161) < 30 && Math.abs(m.b - 73) < 30;
      const w = Object.fromEntries(werte);
      check(`uebergang ${name}: Kronkorken hat bei 50 % noch Struktur (Verlauf), ab 70 % ist die Mitte Bierfarbe`, w[0.5].std > 12 && [0.7, 0.8, 0.9, 1].every((p) => gold(w[p])), werte.map(([p, m]) => `${p}: rgb(${m.r},${m.g},${m.b}) ±${m.std}`).join(' | '));
      check(`uebergang ${name}: bei 100 % deckt die Bierfläche (Canvas ausgeblendet), der Rahmen ist weg`, (await b.js(`getComputedStyle(document.getElementById('sequenz')).visibility`)) === 'hidden' && (await state(b)).frameO === 0);
    } finally { b.close(); }
  }
}

// 8. Zustand B auf allen Geräten: Bier von Rand zu Rand, kein Rahmen, „Hofer Bräu“ frei, Titel unten mittig, Bläschen verteilt, Seite gesperrt
async function zustandB() {
  for (const [name, view] of Object.entries(DEVICES)) {
    const b = await browser({ view });
    try {
      check(`zustandB ${name}: Start in A`, await start(b, view) && (await state(b)).z === 'A');
      await b.js(`(() => { const s = document.createElement('style'); s.textContent = '.scroll-cue svg, .beer__bubbles i { animation-play-state: paused !important; }'; document.head.appendChild(s); })()`);
      await gesture(b, 1);
      check(`zustandB ${name}: eine Geste führt nach B`, await waitZustand(b, 'B') && await idle(b));
      await sleep(300);
      const s = await state(b);
      const buf = await shot(b, join(OUT, 'zustandB', `${name}.png`));
      const eg = await edgeGold(b, buf);
      check(`zustandB ${name}: Bier berührt links, rechts und unten den Rand`, eg.left >= 0.98 && eg.right >= 0.98 && eg.bottom >= 0.98, `links ${eg.left.toFixed(2)}, rechts ${eg.right.toFixed(2)}, unten ${eg.bottom.toFixed(2)}`);
      const geo = JSON.parse(await b.js(`JSON.stringify((() => {
        const r = (q) => { const e = document.querySelector(q); if (!e) return null; const x = e.getBoundingClientRect(); return { l: x.left, t: x.top, r: x.right, b: x.bottom }; };
        const brand = document.querySelector('.site-header__brand'), bb = brand.getBoundingClientRect();
        return { beer: r('.beer'), text: r('.hero__text'), vw: innerWidth, vh: innerHeight, fs: parseFloat(getComputedStyle(document.querySelector('.hero__title')).fontSize),
          brandFade: getComputedStyle(brand, '::before').opacity, brandCx: (bb.left + bb.right) / 2, brandTop: bb.top, brandVis: getComputedStyle(brand).visibility,
          x: [...document.querySelectorAll('.beer__bubbles i')].map((i) => parseFloat(i.style.left)) };
      })())`));
      check(`zustandB ${name}: Bier-Ebene deckt den ganzen Bildschirm, kein Rahmen`, geo.beer.l <= 0 && geo.beer.t <= 0 && geo.beer.r >= geo.vw && geo.beer.b >= geo.vh && s.frameO === 0, `Rahmen ${s.frameO}`);
      check(`zustandB ${name}: „Hofer Bräu“ oben mittig frei stehend`, Number(geo.brandFade) === 0 && Math.abs(geo.brandCx - geo.vw / 2) < 3 && geo.brandTop < 30 && geo.brandVis === 'visible');
      const tx = (geo.text.l + geo.text.r) / 2, ty = (geo.text.t + geo.text.b) / 2;
      check(`zustandB ${name}: Titel mit Trennlinie und Untertitel unten mittig`, s.title === 1 && Math.abs(tx - geo.vw / 2) < 3 && ty > geo.vh * 0.6 && ty < geo.vh * 0.97 && geo.fs >= 46 && geo.fs <= 137, `Mitte ${Math.round(tx)}/${Math.round(ty)} von ${geo.vw}×${geo.vh}, Schrift ${geo.fs}px`);
      const n = geo.x.length, xs = [...geo.x].sort((p, q) => p - q), expected = Math.min(60, Math.max(12, Math.round((geo.vw * geo.vh) / 28000)));
      let gap = xs[0]; for (let i = 1; i < xs.length; i++) gap = Math.max(gap, xs[i] - xs[i - 1]); gap = Math.max(gap, 100 - xs.at(-1));
      check(`zustandB ${name}: ${n} Bläschen (Soll ${expected}), gleichmäßig verteilt`, n === expected && gap <= 3.5 * (100 / n), `größte Lücke ${gap.toFixed(1)} %`);
      check(`zustandB ${name}: Seite gesperrt, Seite ins Gold, Schwappen aktiv (Bläschen laufen)`, s.overflow === 'hidden' && s.gold === true && (await b.js(`document.documentElement.classList.contains('is-draining')`)) === true);
      check(`zustandB ${name}: keine Fehler`, b.errors.length === 0, b.errors[0] || '');
    } finally { b.close(); }
  }
}

// 9. Neuladen in C landet in C (ohne Animation), Direktlink (#zutaten) ebenso; Neuladen in A bleibt A
async function neuladen() {
  const b = await browser({ view: 'desktop' });
  try {
    await start(b, 'desktop');
    await flick(b, 900); await waitZustand(b, 'B'); await idle(b);
    await flick(b, 900); await waitZustand(b, 'C'); await idle(b);
    await b.js(`window.scrollTo(0, 700)`); await sleep(500);
    await b.send('Page.reload'); await sleep(3500);
    const r = await state(b), l = await log(b);
    check('neuladen: Neuladen in C landet in C, Position bleibt, keine Animation', r.z === 'C' && r.frei === true && r.y > 300 && l.length === 0, JSON.stringify({ z: r.z, y: r.y, frei: r.frei, log: l.length }));
    await b.send('Page.navigate', { url: BASE + '#zutaten' }); await sleep(3500);
    const d = await state(b), top = await b.js(`Math.round(document.getElementById('zutaten').getBoundingClientRect().top)`);
    check('neuladen: Direktlink #zutaten landet in C an der Stelle, ohne Animation', d.z === 'C' && d.frei === true && Math.abs(top) < 5 && (await log(b)).length === 0, `Zustand ${d.z}, Abstand ${top}`);
    await b.send('Page.navigate', { url: BASE }); await sleep(500);
    await waitReady(b);
    await b.send('Page.reload'); await sleep(3500); await waitReady(b);
    const a = await state(b);
    check('neuladen: Neuladen oben bleibt in A (gesperrt)', a.z === 'A' && a.overflow === 'hidden' && a.y === 0);
    check('neuladen: keine Fehler', b.errors.length === 0, b.errors[0] || '');
  } finally { b.close(); }
}

// 10. Gerät drehen: in A bleibt A, in B bleibt B (kein Absturz, kein leeres Canvas)
async function drehen() {
  const b = await browser({ view: 'handy' });
  try {
    await start(b, 'handy');
    await setView(b, { w: 844, h: 390, mobile: true }); await sleep(900);
    let s = await state(b);
    check('drehen: in A gedreht bleibt in A, Seite gesperrt', s.z === 'A' && s.overflow === 'hidden' && s.y === 0, `Zustand ${s.z}`);
    await setView(b, VIEWS.handy); await sleep(900); await waitReady(b);
    await touchSwipe(b, 220);
    await waitZustand(b, 'B'); await idle(b);
    const vorher = await snap(b);
    await setView(b, { w: 844, h: 390, mobile: true }); await sleep(900);
    s = await state(b);
    check('drehen: in B gedreht bleibt in B (Rahmen weg, Seite gesperrt)', s.z === 'B' && s.frameO === 0 && s.overflow === 'hidden', `Zustand ${s.z}`);
    await setView(b, VIEWS.handy); await sleep(900);
    check('drehen: zurück gedreht ist B unverändert', await snap(b) === vorher);
    check('drehen: nie ein leeres Canvas, keine Fehler', (await b.js('window.__blank')) === 0 && b.errors.length === 0, b.errors[0] || '');
  } finally { b.close(); }
}

// 11. Tastatur: Pfeil, Bild, Leertaste (auch mit Umschalttaste zurück)
async function tasten() {
  const b = await browser({ view: 'desktop' });
  try {
    await start(b, 'desktop');
    const folge = [['PageDown', 'B'], ['ArrowDown', 'C'], ['ArrowUp', 'B'], ['PageUp', 'A'], [' ', 'B'], [' ', 'C']];
    let ok = true, detail = '';
    for (const [taste, ziel] of folge) {
      if ((await state(b)).z === 'C') { await b.js(`window.scrollTo(0, 0)`); await sleep(500); }
      await keyPress(b, taste);
      if (!(await waitZustand(b, ziel)) || !(await idle(b))) { ok = false; detail = `${taste} → ${ziel} nicht erreicht`; break; }
    }
    check('tasten: Bild ab/auf, Pfeil, Leertaste bewegen A ↔ B ↔ C', ok, detail);
    await b.js(`window.scrollTo(0, 0)`); await sleep(500);
    await keyPress(b, ' ', 8);   // Umschalt + Leertaste = zurück
    check('tasten: Umschalt + Leertaste geht zurück', await waitZustand(b, 'B'));
  } finally { b.close(); }
}

// 12. Überspringen: fokussierbarer Knopf springt direkt zu C; sichtbarer Hinweis unten
async function skip() {
  const b = await browser({ view: 'desktop' });
  try {
    await start(b, 'desktop');
    const cue = await b.js(`(() => { const c = document.querySelector('.scroll-cue'); const r = c.getBoundingClientRect(); return { sichtbar: getComputedStyle(c).display !== 'none' && +getComputedStyle(c).opacity > 0.9, unten: r.top > innerHeight * 0.85, text: c.innerText.trim() }; })()`);
    check('skip: Hinweis unten sichtbar (Desktop: „Scrollen“)', cue.sichtbar && cue.unten && /scrollen/i.test(cue.text), JSON.stringify(cue));
    await keyPress(b, 'Tab'); await sleep(200); // echte Tastatur: erst dann gilt :focus-visible
    const focus = await b.js(`(() => { const r = document.querySelector('[data-skip]').getBoundingClientRect(); return { sichtbar: r.top >= 0 && r.bottom > 0, focus: document.activeElement === document.querySelector('[data-skip]') }; })()`);
    check('skip: Knopf „Überspringen“ ist fokussierbar und bei Fokus sichtbar', focus.focus && focus.sichtbar, JSON.stringify(focus));
    check('skip: in A und B ist der Inhalt unter dem Start nicht per Tastatur erreichbar (inert)', (await b.js(`document.querySelector('#zutaten').inert`)) === true);
    await b.js(`document.querySelector('[data-skip]').click()`);
    await sleep(400);
    const s = await state(b);
    check('skip: springt direkt zu Zustand C (frei, Inhalt erreichbar)', s.z === 'C' && s.frei === true && (await b.js(`document.querySelector('#zutaten').inert`)) === false, JSON.stringify({ z: s.z, frei: s.frei }));
  } finally { b.close(); }
}

// 13. „Bewegung reduzieren“: keine Sperre, keine Animation, nur das Startbild, darunter die normale Seite
async function reduziert() {
  for (const view of ['desktop', 'handy']) {
    const b = await browser({ view, reducedMotion: true });
    try {
      await open(b, '', { wait: 3500 });
      const r = JSON.parse(await b.js(`JSON.stringify({ seq: document.documentElement.classList.contains('seq'), q: !!window.__sequenz, ov: getComputedStyle(document.documentElement).overflow, poster: getComputedStyle(document.querySelector('.poster')).opacity, skip: getComputedStyle(document.querySelector('[data-skip]')).display, cue: getComputedStyle(document.querySelector('.scroll-cue')).display })`));
      check(`reduziert ${view}: nur Startbild, keine Sperre, keine Sequenz, kein Überspringen-Knopf`, !r.seq && !r.q && r.ov !== 'hidden' && r.poster === '1' && r.skip === 'none' && r.cue === 'none', JSON.stringify(r));
      await b.js(`window.scrollTo(0, 900)`); await sleep(500);
      check(`reduziert ${view}: darunter normal scrollbar`, (await b.js('scrollY')) >= 800);
    } finally { b.close(); }
  }
}

// 14. Keine externen Anfragen, keine Cookies, CLS 0 (ganzer Ablauf A → C)
async function extern() {
  const b = await browser({ view: 'desktop' });
  try {
    await start(b, 'desktop');
    await flick(b, 900); await waitZustand(b, 'B'); await idle(b);
    await flick(b, 900); await waitZustand(b, 'C'); await idle(b);
    await b.js(`window.scrollTo(0, 3000)`); await sleep(800);
    const c = await b.send('Network.getAllCookies');
    check('extern: keine Anfragen an Fremde', b.external.length === 0, b.external[0] || '');
    check('extern: keine Cookies', (c.result?.cookies || []).length === 0);
    check('extern: CLS 0 im ganzen Ablauf', (await b.js('window.__cls')) === 0, String(await b.js('window.__cls')));
  } finally { b.close(); }
}

const RUNS = [['gesten', gesten], ['flick', flickTest], ['sperre', sperre], ['hinundher', hinundher], ['laden', laden], ['kalt', kalt], ['uebergang', uebergang],
  ['zustandB', zustandB], ['neuladen', neuladen], ['drehen', drehen], ['tasten', tasten], ['skip', skip], ['reduziert', reduziert], ['extern', extern]];
for (const [name, fn] of RUNS) {
  if (!run(name)) continue;
  console.log(`\n── ${name}`);
  try { await fn(); } catch (e) { check(`${name}: ohne Absturz`, false, e.stack?.split('\n').slice(0, 3).join(' | ')); }
}
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed} von ${results.length} Prüfungen bestanden${failed ? `, ${failed} FEHLER` : ' ✓'}`);
process.exit(failed ? 1 : 0);
