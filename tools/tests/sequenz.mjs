// Automatische Tests der Startsequenz mit zwei Gesten (Zustände A Start, B Bier, C Inhalt), echte Ereignisse im Headless Chrome.
//
// Vorbereitung (eigener Terminal-Tab, im Projektordner):
//   python3 tools/tests/serve.py . 5263
// Aufruf:
//   node tools/tests/sequenz.mjs [szenario …]            (ohne Angabe: alle)
// Szenarien: gesten, flick, sperre, hinundher, laden, kalt, uebergang, zustandB, geste2, titel, herde, pfeil, timeline, einmalig, replay, neuladen, drehen, tasten, skip, reduziert, extern, leisten, rahmen, lade, phasen, alter
// Rückgabewert 1, wenn ein Test fehlschlägt. Bilder landen in $TMPDIR/berghof-tests/.
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { browser, open, throttle, setView, flick, touchSwipe, keyPress, wheelNotch, gesture, state, samples, log, waitReady, idle, waitZustand,
  shot, edgeGold, goldShare, sleep, BASE, VIEWS, DEVICES } from './lib.mjs';

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
// Pfeil blendet nach der Animation in 200 ms ein: vor dem Vergleich abwarten
const snap = async (b) => { await sleep(260); const s = await state(b); return JSON.stringify({ z: s.z, P: s.P, cv: s.cv, frameO: s.frameO, beer: s.beer, title: s.title, cue: s.cue, level: s.level, gold: s.gold, frei: s.frei }); };

// 1. Genau 2 Gesten von A bis C; der Rückweg gilt nur innerhalb des Intros (B → A), in C ist das Intro vorbei (Mausrad, Touch, Tastatur)
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
        await g(b, -1);
        check(`gesten ${label}/${art}: Geste nach oben in B spielt Übergang 1 rückwärts → A`, await waitZustand(b, 'A') && await idle(b));
        await g(b, 1);
        check(`gesten ${label}/${art}: erneut Geste 1 → B`, await waitZustand(b, 'B') && await idle(b));
        const sB2 = await state(b);
        await g(b, 1);
        check(`gesten ${label}/${art}: Geste 2 führt nach C (Seite frei)`, await waitZustand(b, 'C') && await idle(b) && (await state(b)).frei === true && (await state(b)).overflow !== 'hidden');
        await b.js(`window.scrollTo(0, 500)`); await sleep(300);
        const y500 = (await state(b)).y;
        await b.js(`window.scrollTo(0, 0)`); await sleep(700);
        check(`gesten ${label}/${art}: in C normal scrollbar`, y500 >= 400, `y ${y500}`);
        const n0 = await starts(b);
        for (let k = 0; k < 3; k++) { await g(b, -1); await sleep(150); }
        check(`gesten ${label}/${art}: Geste nach oben in C löst nichts mehr aus (Intro ist einmalig)`, (await starts(b)) === n0 && (await state(b)).z === 'C' && (await state(b)).y === 0);
        const n = await starts(b);
        check(`gesten ${label}/${art}: genau 4 Übergänge (A→B, B→A, A→B, B→C)`, n === 4, `${n} Übergänge`);
        check(`gesten ${label}/${art}: Zustand B beim zweiten Mal wie beim ersten`, JSON.stringify([sB.P, sB.frameO, sB.level, sB.beer, sB.title]) === JSON.stringify([sB2.P, sB2.frameO, sB2.level, sB2.beer, sB2.title]));
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

// 3. Gesten nach oben und andere ungültige Gesten während der Animation und in der Sperre danach werden ignoriert; kein Zustand dazwischen.
//    (Eine zweite Geste nach unten wird dagegen gemerkt, siehe „puffer“.)
async function sperre() {
  for (const view of ['desktop', 'handy']) {
    const b = await browser({ view });
    try {
      await start(b, view);
      await keyPress(b, 'ArrowDown');
      await sleep(400);
      // mitten in der Animation: viele Gesten nach oben
      for (let k = 0; k < 3; k++) { await keyPress(b, 'ArrowUp'); await sleep(100); }
      await wheelNotch(b, -300); await sleep(200); await wheelNotch(b, -300);
      if (view === 'handy') { await touchSwipe(b, -220, { ms: 80 }); }
      await keyPress(b, 'ArrowUp'); await keyPress(b, ' ', 8);
      const n1 = await starts(b), busyNow = (await state(b)).busy;
      check(`sperre ${view}: Gesten nach oben während der Animation werden ignoriert`, n1 === 1 && busyNow === true, `${n1} Übergang, busy ${busyNow}`);
      // Ende der Animation, dann sofort eine Geste nach oben: noch in der Sperre (400 ms)
      for (let k = 0; k < 200 && (await state(b)).busy; k++) await sleep(30);
      await keyPress(b, 'ArrowUp'); await sleep(150);
      const n2 = await starts(b);
      check(`sperre ${view}: direkt nach der Animation (400 ms Sperre) löst eine Geste nach oben nichts aus`, n2 === 1, `${n2} Übergänge`);
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

// 3b. Viel wischen: eine zweite Geste nach unten während Geste 1 (oder in der kurzen Sperre danach) wird gemerkt, Geste 2 folgt sofort. Eine dritte wird ignoriert, ohne zweite Geste bleibt es in B.
async function puffer() {
  const gap = async (b) => { const L = await log(b), e1 = L.find((e) => e.art === 'ende'), s2 = L.filter((e) => e.art === 'start')[1]; return e1 && s2 ? s2.t - e1.t : null; };
  for (const view of ['desktop', 'handy']) {
    const wisch = (b) => (view === 'desktop' ? wheelNotch(b, 300) : touchSwipe(b, 220, { ms: 60 }));       // kurze Eingabe: die Geste löst sofort aus, nichts läuft nach
    let b = await browser({ view });
    try {
      await start(b, view);
      await wisch(b); await sleep(1500);                        // Geste 1 läuft, zweite Wischgeste mittendrin (Mausrad: erst nach 1,2 s und Ruhe)
      await wisch(b); await sleep(500); await wisch(b);        // und eine dritte: wird ignoriert
      const L0 = await log(b);
      check(`puffer ${view}: zweite Geste nach unten während Geste 1 wird gemerkt (${L0.filter((e) => e.art === 'gemerkt').length}), die dritte ignoriert (${L0.filter((e) => e.art === 'ignoriert' && e.grund === 'läuft').length})`,
        L0.filter((e) => e.art === 'gemerkt').length === 1 && L0.filter((e) => e.art === 'ignoriert' && e.grund === 'läuft').length >= 1);
      check(`puffer ${view}: Geste 2 folgt direkt auf Geste 1 und endet in C`, await waitZustand(b, 'C', 15000) && await idle(b, 15000));
      const g = await gap(b);
      check(`puffer ${view}: Abstand zwischen Ende von Geste 1 und Start von Geste 2 ${g} ms (≤ 120, keine Sperre)`, g != null && g >= 0 && g <= 120, String(g));
      const S = (await samples(b)).filter((x) => x.P != null); let rueck = 0; for (let i = 1; i < S.length; i++) if (S[i].P < S[i - 1].P - 1e-6) rueck++;
      check(`puffer ${view}: P wächst monoton (${S.length} Bilder), genau zwei Übergänge (${await starts(b)})`, rueck === 0 && (await starts(b)) === 2);
      check(`puffer ${view}: keine Fehler`, b.errors.length === 0, b.errors[0] || '');
    } finally { b.close(); }
    b = await browser({ view });
    try {                                                       // zweite Geste in der kurzen Sperre nach Geste 1: wird nach der Sperre ausgeführt
      await start(b, view);
      await wisch(b); await waitZustand(b, 'B', 8000); await sleep(40);
      await wisch(b);
      check(`puffer ${view}: Geste in der Sperre nach Geste 1 wird gemerkt und läuft nach der Sperre nach C`, await waitZustand(b, 'C', 15000), '');
      const L = await log(b), e1 = L.find((e) => e.art === 'ende'), s2 = L.filter((e) => e.art === 'start')[1], g = L.find((e) => e.art === 'gemerkt');
      const dt = e1 && s2 ? s2.t - e1.t : null;
      check(`puffer ${view}: gemerkt (${g ? 'ja' : 'nein'}), Geste 2 startet erst nach der Sperre (${dt} ms nach dem Ende von Geste 1, Soll 380 bis 800)`, !!g && dt != null && dt >= 380 && dt <= 800, JSON.stringify({ dt }));
    } finally { b.close(); }
    if (view === 'desktop') {
      b = await browser({ view });
      try {                                                     // Nachläufer eines Trackpad-Schwungs nach einer Lücke (400 ms nach dem Start von Geste 1) ist keine zweite Geste
        await start(b, view);
        await wheelNotch(b, 300); await sleep(400); await wheelNotch(b, 300); await sleep(300); await wheelNotch(b, 300);
        await waitZustand(b, 'B', 8000); await idle(b); await sleep(1800);
        const L = await log(b);
        check(`puffer ${view}: Mausrad-Nachläufer früh nach Geste 1 wird nicht gemerkt (${L.filter((e) => e.art === 'gemerkt').length}), es bleibt in B (${(await state(b)).z})`, !L.some((e) => e.art === 'gemerkt') && (await state(b)).z === 'B' && (await starts(b)) === 1);
      } finally { b.close(); }
    }
    b = await browser({ view });
    try {                                                       // nur eine Geste: es bleibt in B
      await start(b, view);
      await wisch(b); await waitZustand(b, 'B', 8000); await idle(b); await sleep(1800);
      const z = (await state(b)).z;
      check(`puffer ${view}: ohne zweite Geste bleibt es in B (${z})`, z === 'B' && (await starts(b)) === 1);
    } finally { b.close(); }
  }
}

// 4. Hin und her über die Zustände: die Endzustände sind jedes Mal exakt gleich (nichts summiert sich auf)
async function hinundher() {
  const b = await browser({ view: 'desktop' });
  try {
    await start(b, 'desktop');
    const wege = [['B', 1], ['A', -1], ['B', 1], ['A', -1], ['B', 1], ['A', -1], ['B', 1], ['A', -1], ['B', 1], ['C', 1]];   // [Ziel, Richtung]: nur A ↔ B, am Ende nach C
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
      check(`kalt ${view}: startet von selbst, sobald die erste Hälfte der Bilder geladen ist`, await waitZustand(b, 'B', 120000) && await idle(b));
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
      const oben = await goldShare(b, buf, 0.06, 0.4), ganz = await goldShare(b, buf, 0.06, 0.86);
      check(`zustandB ${name}: ganze Fläche Bier, keine Schaumkrone, kein Beige (oben ${oben.toFixed(2)}, gesamt ${ganz.toFixed(2)})`, oben >= 0.95 && ganz >= 0.9);
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

// Geste 2: Bier leeren. Zustand B ist volle Bierfläche (Spiegel über dem Bildrand), der Spiegel sinkt ins Bild, erst dabei kommt die Schaumkrone.
// Dauer 2,5 bis 3 s, gleichmäßig ohne Sprung. Bilder bei 0, 10, 50, 90 und 100 % der Zeit (sine.inOut).
const easeSine = (t) => (1 - Math.cos(Math.PI * t)) / 2;
// Geste 2: zwei Phasen nacheinander (gleiche Zahlen wie in js/sequenz.js, window.__sequenz.phasen wird in „phasen“ gegengeprüft)
const PH = { PH_IN: 450, PH1: 2800, PAUSE: 150, RIDE: 1000, FADE: 550, T2: 3950, DRINK: { tau: 150, half: 0.25 } };
const Pg2 = (T) => 1 + T / PH.T2;                                  // P zur Zeit T (ms) seit Beginn von Geste 2
const tOf = (P) => (P - 1) * PH.T2;
const easeOutT = (t) => 1 - (1 - t) ** 3;
const rampT = (x, a, b) => Math.min(1, Math.max(0, (x - a) / (b - a)));
const rideT = (T) => easeOutT(rampT(T, PH.PH1 + PH.PAUSE, PH.PH1 + PH.PAUSE + PH.RIDE));          // gemeinsame Fahrt 0 … 1
const einT = (T) => easeOutT(rampT(T, PH.PH1 + PH.PAUSE, PH.PH1 + PH.PAUSE + PH.FADE));           // gemeinsames Einblenden 0 … 1
// Bierpegel 0 … 1 zur Zeit T (ms seit Beginn von Geste 2) bei Bier-Layer-Höhe H (px): schneller Abstieg bis zur Bildschirmmitte (PH_IN), danach gleichmäßig (js/sequenz.js: levelOf)
const lvlT = (T, H) => { const foamH = Math.min(100, Math.max(56, H * 0.09)), q = Math.min(0.9, Math.max(0.05, (H * PH.DRINK.half + 16) / (H + foamH + 126))), tau = PH.DRINK.tau, g1 = 1 - Math.exp(-PH.PH1 / tau), g2 = 1 - Math.exp(-PH.PH_IN / tau), r = PH.PH_IN / PH.PH1, A = Math.max(0, (q - r) / (g2 - g1 * r)), B = 1 - A * g1; return T >= PH.PH1 ? 1 : A * (1 - Math.exp(-T / tau)) + B * (T / PH.PH1); };
async function geste2() {
  for (const [name, view] of Object.entries(DEVICES)) {
    if (name === 'desktop-2560' && !only.length) continue;   // gleiche Logik wie 1440, spart Zeit im Gesamtlauf
    const b = await browser({ view });
    try {
      await start(b, view);
      await b.js(`(() => { const s = document.createElement('style'); s.textContent = '.scroll-cue svg, .beer__bubbles i { animation-play-state: paused !important; }'; document.head.appendChild(s); })()`);
      await gesture(b, 1); await waitZustand(b, 'B'); await idle(b); await sleep(300);
      // Bilder zu festen Zeitpunkten (Zustand als Funktion von P)
      const anteile = {};
      for (const pct of [0, 10, 50, 90, 100]) {
        await b.js(`window.__sequenz.zeige(${Pg2(pct / 100 * PH.PH1)})`); await sleep(500);        // Prozent der Phase 1 (nur das Bier)
        const buf = await shot(b, join(OUT, 'geste2', `${name}-${pct}.png`));
        anteile[pct] = { oben: await goldShare(b, buf, 0.06, 0.3), gesamt: await goldShare(b, buf, 0.06, 0.9), alles: await goldShare(b, buf, 0.0, 0.3, 40) };       // oben (unten steht in C das Gemälde)
      }
      check(`geste2 ${name}: 0 % (Zustand B) komplett Bier ohne Lücke oben, nach 10 % (0,28 s) ist die Schaumkrone schon im Bild und der Spiegel sinkt schnell (steht im oberen Drittel, unten noch Bier)`,
        anteile[0].oben >= 0.95 && anteile[0].gesamt >= 0.9 && anteile[10].oben < 0.97 && anteile[10].gesamt >= 0.5 && anteile[10].gesamt <= 0.9,
        `0 %: ${anteile[0].oben.toFixed(2)}/${anteile[0].gesamt.toFixed(2)}, 10 %: ${anteile[10].oben.toFixed(2)}/${anteile[10].gesamt.toFixed(2)}`);
      check(`geste2 ${name}: 50 % Schaumkrone im Bild, 90 % fast leer, 100 % leer`, anteile[50].oben < 0.9 && anteile[50].gesamt < 0.75 && anteile[90].gesamt < 0.3 && anteile[100].alles < 0.02,
        `50 %: ${anteile[50].oben.toFixed(2)}/${anteile[50].gesamt.toFixed(2)}, 90 %: ${anteile[90].gesamt.toFixed(2)}, 100 %: ${anteile[100].alles.toFixed(3)}`);
    } finally { b.close(); }
    // echte Animation: Dauer, kein Sprung
    const b2 = await browser({ view });
    try {
      await start(b2, view);
      await gesture(b2, 1); await waitZustand(b2, 'B'); await idle(b2); await sleep(300);
      const vorher = (await state(b2)).level;
      const n0 = (await log(b2)).length, ns0 = (await samples(b2)).length;
      await gesture(b2, 1);
      check(`geste2 ${name}: Geste 2 führt nach C`, await waitZustand(b2, 'C', 12000) && await idle(b2, 12000));
      let ev = (await log(b2)).slice(n0).filter((e) => e.art === 'start' || e.art === 'ende');
      const dauer = ev.find((e) => e.art === 'ende').t - ev.find((e) => e.art === 'start').t;
      check(`geste2 ${name}: Dauer ≈ 3,95 s = Phase 1 (2,8 s) + Pause + Phase 2 (1 s) (${dauer} ms)`, dauer >= 3750 && dauer <= 4300);
      const S = (await samples(b2)).filter((x) => x.P > 1 && x.P < Pg2(PH.PH1) && x.z !== 'C');   // Phase 1
      let rueck = 0, maxStep = 0;
      for (let i = 1; i < S.length; i++) { const d = S[i].level - S[i - 1].level; if (d < -0.5) rueck++; maxStep = Math.max(maxStep, d); }
      check(`geste2 ${name}: Pegel sinkt nie zurück (größter Schritt ${maxStep.toFixed(1)} px, Start ${vorher} px)`, S.length > 20 && rueck === 0 && maxStep < view.h * 0.07, `${S.length} Messpunkte`);
      // Schaumkrone gleitet sofort ein (Wartezeit vom ersten Rad-/Touch-Ereignis bis der Schaum im Bild ist), danach trinkt „jemand“: Schlucke mit Pausen dazwischen
      const alle = (await samples(b2)).slice(ns0).filter((x) => x.P != null), ein = alle.find((x) => x.input === 1 && x.P >= 1 && x.P < 1.01), sicht = alle.find((x) => x.P > 1 && x.level + 170 > 0);
      const wartezeit = ein && sicht ? sicht.t - ein.t : null;
      check(`geste2 ${name}: erste sichtbare Bewegung (Schaumkrone) ${wartezeit} ms nach der Geste (≤ 120)`, wartezeit != null && wartezeit <= 120, JSON.stringify({ ein: ein && ein.t, sicht: sicht && sicht.t }));
      // zügig bis ins obere Viertel (PH_IN), danach gleichmäßig bis zum Ende ohne Beschleunigen
      const mitte = S.find((x) => tOf(x.P) >= PH.PH_IN), Sm = mitte ? mitte.level + 170 : null;
      check(`geste2 ${name}: nach ${PH.PH_IN} ms steht der Spiegel bei 25 % der Höhe (${Sm != null ? Math.round(Sm) : '–'} px bei ${view.h} px Höhe, Soll 25 % ± 8 %)`, Sm != null && Math.abs(Sm - view.h * PH.DRINK.half) <= view.h * 0.08);
      const D = S.filter((x) => tOf(x.P) >= PH.PH_IN + 150 && tOf(x.P) <= PH.PH1 - 100);
      const v = []; for (let i = 0, j = 1; j < D.length; j++) { if (D[j].t - D[i].t >= 90) { v.push({ t: tOf(D[j].P), v: (D[j].level - D[i].level) / (D[j].t - D[i].t) }); i = j; } }
      const vm = v.reduce((a, x) => a + x.v, 0) / v.length, vlo = Math.min(...v.map((x) => x.v)), vhi = Math.max(...v.map((x) => x.v));
      const vAnf = (S.find((x) => tOf(x.P) >= 150).level - S[0].level) / (S.find((x) => tOf(x.P) >= 150).t - S[0].t);
      check(`geste2 ${name}: danach gleichmäßig: Tempo ${(vlo * 1000).toFixed(0)}–${(vhi * 1000).toFixed(0)} px/s (Mittel ${(vm * 1000).toFixed(0)}; schnellster ≤ 1,25 × langsamster), kein Beschleunigen am Ende, Anfang zügiger (${(vAnf * 1000).toFixed(0)} px/s ≥ 1,6 × Mittel)`,
        v.length > 10 && vhi <= 1.25 * vlo && v.at(-1).v <= v[0].v * 1.1 && vAnf >= 1.6 * vm, JSON.stringify(v.map((x) => [Math.round(x.t), +(x.v * 1000).toFixed(0)])));
      check(`geste2 ${name}: keine Fehler`, b2.errors.length === 0, b2.errors[0] || '');
    } finally { b2.close(); }
  }
}

// Geräte für die Inhalts-Tests in Zustand C
const GERAETE = { 'iphone-se': { w: 375, h: 667, mobile: true }, iphone15: DEVICES.iphone15, 'ipad-hoch': DEVICES['ipad-air-hoch'], 'ipad-quer': DEVICES['ipad-air-quer'],
  'desktop-1440': DEVICES['desktop-1440'], 'desktop-2560': DEVICES['desktop-2560'] };
// Bis Zustand C mit genau zwei Gesten (Standardweg der Nutzer), danach Ruhe
async function nachC(b, view) {
  await start(b, view);
  await gesture(b, 1); await waitZustand(b, 'B'); await idle(b);
  await gesture(b, 1); await waitZustand(b, 'C', 12000); await idle(b, 12000);
  await sleep(1200);                                            // Schafe und Einblenden fertig
}
const textRects = `(() => { const R = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; };
  const G = (sel) => { const rg = document.createRange(); rg.selectNodeContents(document.querySelector(sel)); return R(rg); };
  return { titel: G('.hero__title'), claim: G('.hero__claim'), lead: R(document.querySelector('.hero__lead')), vw: innerWidth, vh: innerHeight }; })()`;

// Nach genau 2 Gesten: Titel oben, Einleitung und Herde im ersten Bildschirm; der Titel rutscht flüssig, ohne Sprung
async function titel() {
  for (const [name, view] of Object.entries(GERAETE)) {
    const b = await browser({ view });
    try {
      await start(b, view);
      await gesture(b, 1); await waitZustand(b, 'B'); await idle(b);
      const sB = await state(b);
      const n0 = (await samples(b)).length;
      await gesture(b, 1);
      check(`titel ${name}: genau 2 Gesten führen nach C`, await waitZustand(b, 'C', 12000) && await idle(b, 12000) && (await starts(b)) === 2);
      await sleep(1200);
      const r = await b.js(textRects);
      const l = await b.js(`(() => { const e = document.querySelector('.hero__lead'), c = getComputedStyle(e); return { op: +getComputedStyle(document.querySelector('.hero__more')).opacity, vis: c.visibility, fs: parseFloat(c.fontSize), w: e.getBoundingClientRect().width, text: e.textContent.trim().length }; })()`);
      check(`titel ${name}: Titel oben (${Math.round(r.titel.t)} px), Einleitungstext ganz im ersten Bildschirm (Ende ${Math.round(r.lead.b)} von ${r.vh} px)`, r.titel.t < r.vh * 0.22 && r.lead.t > r.titel.b && r.lead.b <= r.vh - 8 && l.op === 1 && l.vis === 'visible', JSON.stringify({ titelTop: Math.round(r.titel.t), leadEnde: Math.round(r.lead.b) }));
      const zeichen = Math.round(l.w / (l.fs * 0.5));          // grob: Breite / halbe Schriftgröße = Zeichen je Zeile
      check(`titel ${name}: Einleitung wortgetreu, Zeilenbreite begrenzt (Handy ≈ 38, Tablet/Desktop breiter als das Gemälde, grob ≤ 100 bzw. ≤ 120 Zeichen ab 1800 px)`, l.text === 'Hoch oben über dem bayerischen Oberland, wo die Uhren ein wenig langsamer ticken, liegt der historische Berghof von Agatharied. Ein Haus, das seit Generationen als Ort der Zuflucht, der Gemeinschaft und der echten Auszeit bekannt ist. Genau dieses Gefühl haben wir in unserem Berghof Hell.'.length && zeichen <= (view.w < 768 ? 46 : view.w < 1800 ? 100 : 120), `${zeichen} Zeichen`);
      const lay = JSON.parse(await b.js(`JSON.stringify((() => { const R = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width }; };
        const tg = (sel) => { const rg = document.createRange(); rg.selectNodeContents(document.querySelector(sel)); return R(rg); };
        const i = document.querySelector('.painting img'), cap = document.querySelector('.painting figcaption');
        return { title: tg('.hero__title'), claim: tg('.hero__claim'), lead: R(document.querySelector('.hero__lead')), fig: R(document.querySelector('.painting')), cols: R(document.querySelector('.hero__cols')),
          align: getComputedStyle(document.querySelector('.hero__lead')).textAlign, img: { ok: i.complete && i.naturalWidth > 0, alt: i.alt.length > 30, border: getComputedStyle(i).borderTopWidth }, cap: cap.textContent.trim(),
          vw: innerWidth, vh: innerHeight, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }; })())`));
      const breit = view.w >= 768, mid = (x) => (x.l + x.r) / 2;
      check(`titel ${name}: Titel, Text und Gemälde als ein zentrierter Block untereinander (Mitten ${[lay.title, lay.lead, lay.fig].map((x) => Math.round(mid(x))).join('/')} von ${lay.vw / 2}), Text zentriert`,
        [lay.title, lay.lead, lay.fig].every((x) => Math.abs(mid(x) - lay.vw / 2) <= 3) && lay.align === 'center' && lay.lead.b <= lay.fig.t - 8 && lay.claim.b <= lay.lead.t, JSON.stringify({ title: lay.title, lead: lay.lead, fig: lay.fig }));
      check(`titel ${name}: Gemälde geladen, mit Beschreibung, Rahmen ${lay.img.border} und Bildunterschrift „${lay.cap}“, Breite ${Math.round(lay.fig.w / lay.cols.w * 100)} % der Inhaltsbreite (${breit ? '45–85 %' : 'voll'}), kein horizontaler Scroll`,
        lay.img.ok && lay.img.alt && parseFloat(lay.img.border) >= 1 && /Stallhofer/.test(lay.cap) && lay.sw === lay.cw && (breit ? lay.fig.w / lay.cols.w >= 0.45 && lay.fig.w / lay.cols.w <= 0.85 : lay.fig.w / lay.cols.w >= 0.98));
      if (breit) {
        const g1 = lay.lead.t - lay.claim.b, g2 = lay.fig.t - lay.lead.b, lueck = lay.vh - lay.fig.b, top = lay.title.t;
        check(`titel ${name}: gleichmäßige Abstände Untertitel → Text ${Math.round(g1)} px, Text → Gemälde ${Math.round(g2)} px (8-px-Raster, Unterschied ≤ 8 px)`, Math.abs(g1 - g2) <= 8 && [28, 40].some((x) => Math.abs(x - g2) <= 1.5), JSON.stringify({ g1, g2 }));
        check(`titel ${name}: erster Bildschirm zeigt Titel, Text und ${lay.fig.b <= lay.vh ? 'das ganze Gemälde, Block oben ' + Math.round(top) + ' px / unten ' + Math.round(lueck) + ' px (ausgewogen, Unterschied ≤ 12 % der Höhe)' : 'den oberen Teil des Gemäldes (' + Math.round((lay.vh - lay.fig.t) / lay.fig.w * 1.5 * 100) + ' % sichtbar)'}`,
          lay.fig.b <= lay.vh ? Math.abs(top - lueck) <= lay.vh * 0.12 : lay.fig.t < lay.vh - 80, JSON.stringify({ top, lueck, figT: lay.fig.t, vh: lay.vh }));
      } else {
        const H = JSON.parse(await b.js(`JSON.stringify([...document.querySelectorAll('.herd .sheep')].filter((e) => getComputedStyle(e).display !== 'none').map((e) => { const x = e.getBoundingClientRect(); return [Math.round(x.top), Math.round(x.bottom), Math.round(x.left), Math.round(x.right)]; }))`));
        check(`titel ${name}: Handy: Gemälde beginnt unter dem ersten Bildschirm (${Math.round(lay.fig.t)} ≥ ${lay.vh} px), Titel und Text im ersten Bildschirm`, lay.fig.t >= lay.vh - 2 && lay.lead.b <= lay.vh - 8, JSON.stringify({ figT: lay.fig.t, vh: lay.vh }));
        check(`titel ${name}: Herde (${H.length} Schafe) im ersten Bildschirm, innerhalb des Rahmens`, H.length === 5 && H.every(([t, bo, le, ri]) => bo <= r.vh + 1 && t >= 0 && le >= -1 && ri <= lay.vw + 1), JSON.stringify(H.slice(0, 2)));
      }
      // Flüssigkeit: Titelposition während Geste 2
      const S = (await samples(b)).slice(n0).filter((x) => x.P > 1 && x.P < 2 && x.z !== 'C');
      let auf = 0, maxStep = 0, dy = 0;
      for (let i = 1; i < S.length; i++) { const d = S[i].textY - S[i - 1].textY; if (d > 0.6) auf++; maxStep = Math.max(maxStep, -d); }
      dy = S.length ? S[0].textY : 0;
      const ende = await state(b);
      const letzter = S.length ? S.at(-1).textY : 0;
      check(`titel ${name}: Titel bleibt in Phase 1 ruhig unten und gleitet danach von unten (${Math.round(sB.textY)} px) nach oben, nie zurück, größter Schritt ${maxStep.toFixed(1)} px`, S.length > 20 && auf === 0 && dy > 0 && maxStep < Math.max(dy, 100) * 0.14, `${S.length} Messpunkte, Start ${dy}`);
      check(`titel ${name}: kein Sprung am Ende von Geste 2 (letzter Wert ${letzter} px, danach ${ende.textY} px)`, Math.abs(letzter - ende.textY) <= Math.max(maxStep, 2) + 0.5 && Math.abs(ende.textY) < 0.5, `Ende ${ende.textY}`);
      // „Hofer Bräu“ oben und Titel dürfen sich nie überlappen, auch nicht beim Scrollen in C (die Kopfzeile scrollt mit)
      const ueberl = [];
      for (const y of [0, 30, 60, 90, 130, 180]) {
        await b.js(`window.scrollTo(0, ${y})`); await sleep(120);
        const o = JSON.parse(await b.js(`JSON.stringify((() => { const rg = document.createRange(); rg.selectNodeContents(document.querySelector('.hero__title')); const t = rg.getBoundingClientRect(), br = document.querySelector('.site-header__brand span').getBoundingClientRect(); return { hit: !(t.bottom <= br.top || t.top >= br.bottom || t.right <= br.left || t.left >= br.right), tt: Math.round(t.top), bb: Math.round(br.bottom) }; })())`));
        if (o.hit) ueberl.push(`${y}px: Titel ${o.tt} / Kopf ${o.bb}`);
      }
      await b.js('window.scrollTo(0, 0)');
      check(`titel ${name}: Titel überlappt „Hofer Bräu“ nie (auch nicht beim Scrollen)`, ueberl.length === 0, ueberl.join('; '));
      check(`titel ${name}: keine Fehler, CLS 0`, b.errors.length === 0 && (await b.js('window.__cls')) === 0, b.errors[0] || String(await b.js('window.__cls')));
    } finally { b.close(); }
  }
}

// Schafe: Handy = fünf einzeln freigestellte Schafe unten auf dem Hintergrund (ohne Gemälde);
// Tablet und Desktop = vier kleine Schafe links und rechts neben dem Titel, dazu das Gemälde neben dem Text.
// Auf allen Geräten erscheinen die Schafe zusammen mit dem Einleitungstext („Hoch oben über dem bayerischen …“), ohne eigene Animation
async function herde() {
  for (const [name, view] of Object.entries(GERAETE)) {
    const b = await browser({ view });
    const breit = view.w >= 768;
    try {
      await start(b, view);
      const sel = breit ? '.painting__herde' : '.herd', art = '.painting';
      const A = JSON.parse(await b.js(`JSON.stringify({ op: +getComputedStyle(document.querySelector('${breit ? art : '.herd'}')).opacity })`));
      const Dz = () => b.js(`JSON.stringify({ op: +getComputedStyle(document.querySelector('${breit ? art : '.herd'}')).opacity })`);
      await gesture(b, 1); await waitZustand(b, 'B'); await idle(b); await sleep(1200);
      const Bz = JSON.parse(await Dz());
      await gesture(b, 1); await waitZustand(b, 'C', 12000); await idle(b, 12000); await sleep(1200);
      const Cz = JSON.parse(await Dz());
      const t = await b.js(textRects);
      const info = JSON.parse(await b.js(`JSON.stringify((() => {
        const M = 16, R = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; };
        const T = ${JSON.stringify(t)}; const cap = R(document.querySelector('.painting figcaption')); const texts = [['Titel', T.titel], ['Untertitel', T.claim], ['Einleitung', T.lead], ['Bildunterschrift', cap]];
        const herd = [...document.querySelectorAll('.herd .sheep')], stage = [...document.querySelectorAll('.painting__herde .sheep')];
        const mine = ${breit} ? stage : herd, sheep = mine.filter((e) => getComputedStyle(e.parentElement).display !== 'none'), bad = [];
        for (const e of sheep) { const r = R(e); for (const [n, x] of texts) if (!(r.b + (${breit} ? 4 : M) <= x.t || r.t >= x.b + (${breit} ? 4 : M) || r.r + (${breit} ? 4 : M) <= x.l || r.l >= x.r + (${breit} ? 4 : M))) bad.push(e.getAttribute('style') + ' × ' + n); }
        const gr = document.querySelector('${sel}');
        const dauer = sheep.map((e) => { const c = getComputedStyle(e); return c.animationName === 'none' ? 0 : parseFloat(c.animationDelay) + parseFloat(c.animationDuration); });
        const hoch = sheep.map((e) => R(e).b - R(e).t), pr = R(document.querySelector('.painting__bild > img')), W = pr.r - pr.l;
        const mid = (e) => (R(e).l + R(e).r) / 2, links = sheep.filter((e) => mid(e) < pr.l), rechts = sheep.filter((e) => mid(e) > pr.r), unten = sheep.filter((e) => mid(e) >= pr.l && mid(e) <= pr.r);
        const fuss = sheep.map((e) => R(e).b - pr.b);
        const ext = (a) => (a.length ? Math.max(...a.map((e) => Math.max(R(e).r - pr.r, pr.l - R(e).l))) : 0);
        return { n: sheep.length, bad, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
          geladen: sheep.every((e) => e.complete && e.naturalWidth > 0), attr: mine.every((e) => e.getAttribute('alt') === '' && e.width > 0 && e.height > 0 && (e.getAttribute('srcset') || e.dataset.srcset)),
          gruppe: gr.getAttribute('role') === 'img' && gr.getAttribute('aria-label').length > 20, dauer: Math.max(0, ...dauer), name: getComputedStyle(sheep[0]).animationName,
          links: links.length, rechts: rechts.length, unten: unten.length, innen: sheep.every((e) => R(e).l >= 0 && R(e).r <= innerWidth), hMin: Math.min(...hoch), hMax: Math.max(...hoch), W: Math.round(W),
          fussMin: Math.round(Math.min(...fuss)), fussMax: Math.round(Math.max(...fuss)), extL: Math.round(pr.l - Math.min(...sheep.map((e) => R(e).l))), extR: Math.round(Math.max(...sheep.map((e) => R(e).r)) - pr.r),
          andere: { anzeige: getComputedStyle(${breit} ? document.querySelector('.herd') : document.querySelector('.painting__herde')).display, geladen: (${breit} ? herd : stage).filter((e) => !e.dataset.src).length },
          farben: { weiss: sheep.filter((e) => /lamm|hell|grast/.test(e.src)).length, braun: sheep.filter((e) => /braun|kalb|gefleckt/.test(e.src)).length } }; })())`));
      const soll = breit ? 9 : 5;
      check(`herde ${name}: ${info.n} Schafe sichtbar (Soll ${soll}), weiße und braune gemischt (${info.farben.weiss} hell, ${info.farben.braun} braun)`, info.n === soll && info.farben.weiss >= 2 && info.farben.braun >= 2 && info.hMin >= 12, JSON.stringify(info.farben));
      check(`herde ${name}: kein Schaf überdeckt Titel, Untertitel, Text oder Bildunterschrift (am Handy stehen zwei absichtlich am Rand und ragen etwas hinaus), kein horizontaler Scroll`, info.bad.length === 0 && (!breit || info.innen) && info.sw === info.cw, `${info.bad.join(', ') || 'ok'}, Breite ${info.sw}/${info.cw}`);
      check(`herde ${name}: WebP mit srcset, feste Maße, alt="" je Schaf, Gruppen-Beschreibung`, info.geladen && info.attr && info.gruppe);
      check(`herde ${name}: die Schafe der anderen Größe sind weder sichtbar noch geladen (${info.andere.geladen} geladen, Anzeige ${info.andere.anzeige})`, info.andere.anzeige === 'none' && info.andere.geladen === 0);
      if (breit) {
        check(`herde ${name}: Schafe stehen rund um das Gemälde (${info.W} px breit): ${info.links} links, ${info.unten} vor der Unterkante, ${info.rechts} rechts; Füße ${info.fussMin} bis ${info.fussMax} px an der Unterkante; links ragen sie ${info.extL} px hinaus, rechts ${info.extR} px (Unterschied ≤ 15 % der Bildbreite)`,
          info.links >= 2 && info.rechts >= 2 && Math.abs(info.links - info.rechts) <= 2 && info.unten >= 1 && info.fussMin >= -4 && info.fussMax <= 28 && Math.abs(info.extL - info.extR) <= info.W * 0.15 && info.hMax <= info.W * 0.16 + 4, JSON.stringify(info));
        check(`herde ${name}: mit dem Gemälde in A unsichtbar (Deckkraft ${A.op}), in B nur zum Vorbereiten fast unsichtbar (${Bz.op}), in C sichtbar (${Cz.op})`, A.op === 0 && Bz.op <= 0.011 && Cz.op === 1);
      }
      check(`herde ${name}: keine eigene Animation (${info.name}, ${info.dauer} s)`, info.name === 'none' && info.dauer === 0);
      check(`herde ${name}: keine externen Anfragen, keine Fehler, CLS 0`, b.external.length === 0 && b.errors.length === 0 && (await b.js('window.__cls')) === 0, b.external[0] || b.errors[0] || '');
    } finally { b.close(); }
  }
  // Geste 2, Phase 2: die Schafe (am Handy die Herde, sonst die Schafe rund um das Gemälde) fahren gemeinsam mit Titel, Text und Gemälde nach oben und blenden gemeinsam ein; am Ende springen sie nicht
  for (const [name, view] of Object.entries(GERAETE)) {
    const breit = view.w >= 768;
    const b = await browser({ view });
    try {
      await start(b, view);
      await gesture(b, 1); await waitZustand(b, 'B'); await idle(b); await sleep(600);
      const Q = (T) => b.js(`(async () => { window.__sequenz.zeige(${Pg2(T)}); await new Promise((r) => setTimeout(r, 450));
        const g = document.querySelector('${breit ? '.painting' : '.herd'}'), sh = [...g.querySelectorAll('.sheep')], m = (e) => { const t = getComputedStyle(e).transform; return t === 'none' ? 0 : +t.slice(t.indexOf('(') + 1, -1).split(',')[5]; };
        return JSON.stringify({ op: +getComputedStyle(g).opacity, y: m(g), titel: m(document.querySelector('.hero__text')), lead: +getComputedStyle(document.querySelector('.hero__lead')).opacity, vis: getComputedStyle(sh[0]).visibility, anim: sh.some((e) => getComputedStyle(e).animationName !== 'none'),
          pos: sh.map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top + scrollY - (${breit} ? document.querySelector('.painting').getBoundingClientRect().top + scrollY : 0))]; }) }); })()`).then(JSON.parse);
      const S0 = PH.PH1 + PH.PAUSE, Tm = S0 + 250;
      const q0 = await Q(PH.PH1), q1 = await Q(Tm), q4 = await Q(PH.T2 - 2);
      await b.js('window.__sequenz.skip()'); await sleep(900);
      const qc = await b.js(`JSON.stringify([...document.querySelectorAll('${breit ? '.painting' : '.herd'} .sheep')].map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top + scrollY - (${breit} ? document.querySelector('.painting').getBoundingClientRect().top + scrollY : 0))]; }))`).then(JSON.parse);
      const e1 = einT(Tm), r1 = rideT(Tm);
      check(`herde ${name}: nach Phase 1 noch unsichtbar (${q0.op}), mitten in Phase 2 gleich weit wie Titel und Text (Deckkraft ${q1.op.toFixed(2)}, Soll ${e1.toFixed(2)}; Weg ${q1.y.toFixed(0)} px, Titel ${q1.titel.toFixed(0)} px), am Ende ${q4.op} und ${q4.y} px, keine CSS-Animation`,
        q0.op <= 0.011 && Math.abs(q1.op - e1) <= 0.04 && Math.abs(q1.lead - e1) <= 0.04 && Math.abs(q1.y - q1.titel) <= 1.5 && q4.op === 1 && q4.y === 0 && !q1.anim && q1.vis === 'visible', JSON.stringify({ q0, q1, q4: q4.op, r1 }));
      check(`herde ${name}: die Schafe springen am Ende nicht (Lage am Ende von Geste 2 gegen Zustand C, am Titel gemessen, höchstens 3 px)`, q4.pos.length === qc.length && q4.pos.every(([x, y], i) => Math.abs(x - qc[i][0]) <= 3 && Math.abs(y - qc[i][1]) <= 3), JSON.stringify({ q4: q4.pos.slice(0, 2), qc: qc.slice(0, 2) }));
    } finally { b.close(); }
  }
  // „Bewegung reduzieren“ und Neuladen in C: Schafe (und am Tablet/Desktop das Gemälde) sofort da, ohne Einblenden
  for (const [vn, breit] of [['desktop-1440', true], ['iphone15', false]]) {
    for (const reduced of [true, false]) {
      const view = GERAETE[vn];
      const b = await browser({ view, reducedMotion: reduced });
      try {
        await setView(b, view);
        if (!reduced) { await b.send('Page.navigate', { url: BASE }); await waitReady(b); await b.js('window.__sequenz.skip()'); await sleep(600); await b.js('window.scrollTo(0, 700)'); await sleep(400); await b.send('Page.reload'); }
        else await b.send('Page.navigate', { url: BASE });
        await sleep(3500);
        if (!reduced) await b.js('window.scrollTo(0, 0)');
        const r = JSON.parse(await b.js(`JSON.stringify({ n: [...document.querySelectorAll('${breit ? '.painting__herde' : '.herd'} .sheep')].filter((e) => { const c = getComputedStyle(e); return c.display !== 'none' && c.visibility === 'visible' && +c.opacity === 1 && e.complete && e.naturalWidth > 0; }).length,
          an: [...document.querySelectorAll('.sheep')].some((e) => getComputedStyle(e).animationName !== 'none'), bild: (() => { const i = document.querySelector('.painting img'); return i.complete && i.naturalWidth > 0; })() })`));
        check(`herde ${reduced ? 'Bewegung reduzieren' : 'Neuladen in C'} (${vn}): ${breit ? 'alle 9 Schafe' : 'alle 5 Schafe'} und das Gemälde sofort sichtbar, ohne Einblenden`, r.n === (breit ? 9 : 5) && !r.an && r.bild, JSON.stringify(r));
      } finally { b.close(); }
    }
  }
}

// Timeline: Tablet und Desktop komplett sichtbar in einer Reihe (kein Scrollen, Bild „Stallhofer“ weg); Handy mit Peek, Punkten, Hinweis „Wischen“ und Anstupsen
async function timeline() {
  for (const [name, view] of Object.entries(GERAETE)) {
    const b = await browser({ view });
    try {
      await start(b, view);
      await b.js(`window.__sequenz.skip()`); await sleep(500);
      await b.js(`document.querySelector('#berghof .berghof').scrollIntoView({ block: 'center' })`); await sleep(1800);
      const handy = view.w <= 768;
      const m = JSON.parse(await b.js(`JSON.stringify((() => {
        const ol = document.querySelector('.timeline'), li = [...ol.children], R = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; };
        const cs = (e, p) => getComputedStyle(e, p);
        const yr = li.map((e) => R(e.querySelector('.timeline__year'))), tx = li.map((e) => R(e.querySelector('p'))), rows = new Set(li.map((e) => Math.round(R(e).t)));
        const dot = cs(li[0], '::after'), line = cs(li[1], '::before'), hint = document.querySelector('.timeline__swipe');
        return { n: li.length, kein: !document.querySelector('#berghof .painting') && !document.querySelector('#berghof .berghof img'), sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, tsw: ol.scrollWidth, tcw: ol.clientWidth,
          innen: li.every((e) => R(e).l >= -1 && R(e).r <= innerWidth + 1), eineReihe: rows.size === 1, ordnung: yr.every((y, i) => y.b <= tx[i].t), jahre: li.map((e) => e.querySelector('.timeline__year').textContent.trim()).join(','),
          linie: line.backgroundColor, linieH: line.height, punkt: dot.borderRadius, punktBreite: dot.width, l2: R(li[1]).l, l1: R(li[0]).l, l2r: R(li[1]).r,
          hintSichtbar: hint && cs(hint.parentElement).display !== 'none', dots: document.querySelectorAll('.timeline__dots i').length, aktiv: document.querySelectorAll('.timeline__dots i.is-active').length,
          hintText: hint ? hint.textContent.trim() : '', hintFs: hint ? parseFloat(cs(hint).fontSize) : 0, nudge: li[0].className, anim: cs(li[0]).animationName }; })())`));
      check(`timeline ${name}: vier Stationen mit Jahreszahlen, Bild „Stallhofer“ entfernt`, m.n === 4 && m.kein && m.jahre === '1556,1909,1935,Heute', m.jahre);
      if (!handy) {
        check(`timeline ${name}: komplett sichtbar in einer Reihe, kein horizontaler Scroll (Seite ${m.sw}/${m.cw}, Timeline ${m.tsw}/${m.tcw})`, m.innen && m.eineReihe && m.sw === m.cw && m.tsw <= m.tcw + 1);
        check(`timeline ${name}: Jahreszahl über der goldenen Linie, Text darunter, Punkt je Station`, m.ordnung && m.linie === 'rgb(184, 145, 58)' && m.linieH === '1px' && m.punkt.includes('50%') || m.punkt === '50%', JSON.stringify({ linie: m.linie, h: m.linieH, punkt: m.punkt }));
        check(`timeline ${name}: Handy-Hinweis (Punkte, „Wischen“) ist hier aus`, !m.hintSichtbar);
      } else {
        const peek = (view.w - m.l2) / view.w;
        check(`timeline ${name}: nächste Karte ragt sichtbar herein (Peek ${(peek * 100).toFixed(0)} %)`, peek >= 0.12 && peek <= 0.24, `Peek ${peek.toFixed(2)}`);
        check(`timeline ${name}: Punkte-Anzeige (4, erster aktiv) und Hinweis „Wischen“ (${m.hintFs} px)`, m.hintSichtbar && m.dots === 4 && m.aktiv === 1 && /wischen/i.test(m.hintText) && m.hintFs >= 13, JSON.stringify({ dots: m.dots, aktiv: m.aktiv, text: m.hintText }));
        check(`timeline ${name}: Seite ohne horizontalen Scroll`, m.sw === m.cw, `${m.sw}/${m.cw}`);
        // Anstupsen: einmal, sobald die Timeline ins Bild kommt; Hinweis verschwindet nach dem ersten Wischen
        await b.js(`document.querySelector('.timeline').scrollBy({ left: 220, behavior: 'instant' })`); await sleep(900);
        const nach = JSON.parse(await b.js(`JSON.stringify({ weg: +getComputedStyle(document.querySelector('.timeline__swipe')).opacity, aktiv: [...document.querySelectorAll('.timeline__dots i')].findIndex((i) => i.classList.contains('is-active')), hell: document.querySelectorAll('.timeline li.is-active').length })`));
        check(`timeline ${name}: nach dem ersten Wischen verschwindet „Wischen“, der aktive Punkt wandert`, nach.weg === 0 && nach.aktiv >= 1 && nach.hell === 1, JSON.stringify(nach));
      }
      check(`timeline ${name}: keine Fehler, CLS 0`, b.errors.length === 0 && (await b.js('window.__cls')) === 0, b.errors[0] || String(await b.js('window.__cls')));
    } finally { b.close(); }
  }
  // Anstupsen genau messen (Handy): die Karten verschieben sich auf ca. 30 px nach links und zurück; bei „Bewegung reduzieren“ nicht
  for (const reduced of [false, true]) {
    const view = GERAETE.iphone15;
    const b = await browser({ view, reducedMotion: reduced });
    try {
      await setView(b, view); await b.send('Page.navigate', { url: BASE });
      if (!reduced) { await waitReady(b); await b.js('window.__sequenz.skip()'); } else await sleep(2500);
      await sleep(500);
      await b.js(`window.__liTx = []; (function m() { const t = getComputedStyle(document.querySelector('.timeline li')).transform; window.__liTx.push(t === 'none' ? 0 : +t.split(',')[4]); requestAnimationFrame(m); })();`);
      await b.js(`document.querySelector('#berghof .berghof').scrollIntoView({ block: 'center' })`); await sleep(2600);
      const tx = await b.js('window.__liTx');
      const min = Math.min(0, ...tx), ende = tx.at(-1);
      if (!reduced) check('timeline iphone15: Anstupsen gleitet ca. 30 px nach links und zurück (einmal)', min <= -24 && min >= -36 && Math.abs(ende) < 0.5, `kleinster Wert ${min.toFixed(1)} px, Ende ${ende}`);
      else check('timeline iphone15: bei „Bewegung reduzieren“ keine Anstupsbewegung', min > -0.5, `kleinster Wert ${min.toFixed(1)} px`);
    } finally { b.close(); }
  }
}

// Intro ist einmalig: in C ist die Steuerung weg (keine Listener, keine Sperre, Canvas und Bilder aus dem Speicher), Gesten nach oben lösen nichts aus
async function einmalig() {
  for (const name of ['desktop-1440', 'iphone15', 'ipad-quer']) {
    const view = GERAETE[name];
    const b = await browser({ view });
    try {
      await start(b, view);
      const vorher = await b.send('Runtime.evaluate', { expression: 'window', returnByValue: false });
      const listen = async () => {
        const l = (await b.send('DOMDebugger.getEventListeners', { objectId: vorher.result.result.objectId })).result.listeners;
        // die Messfühler-Listener des Tests sind Capture-Listener; die der Sequenz nicht
        return l.filter((x) => !x.useCapture && ['wheel', 'touchstart', 'touchmove', 'keydown', 'scroll'].includes(x.type)).map((x) => x.type);
      };
      const inA = await listen();
      check(`einmalig ${name}: in A sind die Gesten-Listener aktiv (${inA.join(', ')})`, ['wheel', 'touchstart', 'touchmove', 'keydown'].every((t) => inA.includes(t)) && (await b.js('window.__sequenz.aktiv')) === true);
      await gesture(b, 1); await waitZustand(b, 'B'); await idle(b);
      await gesture(b, 1); await waitZustand(b, 'C', 12000); await idle(b, 12000); await sleep(800);
      const inC = await listen();
      const sp = await b.js(`JSON.stringify({ sp: window.__sequenz.speicher, aktiv: window.__sequenz.aktiv, cv: getComputedStyle(document.getElementById('sequenz')).display, cw: document.getElementById('sequenz').width })`);
      const r = JSON.parse(sp);
      check(`einmalig ${name}: in C keine Gesten-Listener der Sequenz mehr (wheel, touch, keydown, scroll)`, inC.length === 0 && r.aktiv === false, inC.join(', ') || 'keine');
      check(`einmalig ${name}: Canvas (${r.cv}, ${r.cw} px) und Bilder aus dem Speicher (Bitmaps ${r.sp.bitmaps}, Dateien ${r.sp.dateien}, Standbild ${r.sp.standbild})`, r.cv === 'none' && r.cw === 0 && r.sp.bitmaps === 0 && r.sp.dateien === 0 && r.sp.standbild === false);
      const s = await state(b);
      check(`einmalig ${name}: Seitensperre aufgehoben, Inhalt nicht mehr inert`, s.overflow !== 'hidden' && s.frei === true && (await b.js(`document.querySelectorAll('[inert]').length`)) === 0, JSON.stringify({ ov: s.overflow }));
      await b.js('window.scrollTo(0, 0)'); await sleep(500);
      const n0 = await starts(b), l0 = (await log(b)).length;
      for (let k = 0; k < 10; k++) {
        const art = k % 4;
        if (art === 0) await flick(b, -900);
        else if (art === 1) await keyPress(b, 'ArrowUp');
        else if (art === 2) await keyPress(b, 'PageUp');
        else if (view.mobile) await touchSwipe(b, -220, { ms: 90 }); else await wheelNotch(b, -400);
        await sleep(80);
      }
      await sleep(700);
      const e = await state(b);
      check(`einmalig ${name}: 10 schnelle Gesten nach oben in C: keine Animation, keine Sperre, Seite bleibt oben`, (await starts(b)) === n0 && (await log(b)).length === l0 && e.z === 'C' && e.overflow !== 'hidden' && e.y === 0 && e.busy === false, JSON.stringify({ z: e.z, y: e.y, ov: e.overflow, log: (await log(b)).length - l0 }));
      await b.js('window.scrollTo(0, 400)'); await sleep(300);
      check(`einmalig ${name}: Seite scrollt danach ganz normal`, (await state(b)).y === 400);
      check(`einmalig ${name}: nichts im Browser gespeichert (Intro-Zustand), keine Fehler`, (await b.js(`(() => { const k = Object.keys(localStorage).filter((x) => x !== 'berghof-ab16'); return k.length + sessionStorage.length + document.cookie.length; })()`)) === 0 && b.errors.length === 0, b.errors[0] || '');
    } finally { b.close(); }
  }
}

// „Bier Animation erneut anzeigen“ im Fuß: scrollt nach oben und spielt A → B → C erneut ab, danach wieder einmalig
async function replay() {
  for (const name of ['desktop-1440', 'iphone15']) {
    const view = GERAETE[name];
    const b = await browser({ view });
    try {
      await nachC(b, view);
      await b.js('window.scrollTo(0, document.documentElement.scrollHeight)'); await sleep(600);
      const link = JSON.parse(await b.js(`JSON.stringify((() => { const a = document.querySelector('[data-intro]'), r = a.getBoundingClientRect(), c = getComputedStyle(a); return { text: a.textContent.trim(), up: c.textTransform, fs: parseFloat(c.fontSize), color: c.color, h: r.height, x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2, sichtbar: r.top >= 0 && r.bottom <= innerHeight }; })())`));
      check(`replay ${name}: Link „${link.text}“ im Fuß: kleine Versalien (${link.fs} px), dunkelgrün, Tippfläche ≥ 44 px`, /Bier Animation erneut anzeigen/i.test(link.text) && link.up === 'uppercase' && link.fs <= 13 && link.color === 'rgb(31, 77, 43)' && link.h >= 44 && link.sichtbar, JSON.stringify(link));
      await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: link.x, y: link.y, button: 'left', clickCount: 1 });
      await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: link.x, y: link.y, button: 'left', clickCount: 1 });
      check(`replay ${name}: Klick scrollt nach oben und startet das Intro in Zustand A (gesperrt)`, await waitZustand(b, 'A', 15000) && (await state(b)).y === 0 && (await state(b)).overflow === 'hidden');
      await waitReady(b); await sleep(500);
      check(`replay ${name}: Steuerung wieder aktiv, Bilder neu geladen`, (await b.js('window.__sequenz.aktiv')) === true && (await b.js('window.__sequenz.bereit')) === true);
      await gesture(b, 1);
      check(`replay ${name}: Geste 1 → B`, await waitZustand(b, 'B', 12000) && await idle(b));
      await gesture(b, 1);
      check(`replay ${name}: Geste 2 → C`, await waitZustand(b, 'C', 12000) && await idle(b, 12000));
      await sleep(800);
      const r = JSON.parse(await b.js(`JSON.stringify({ aktiv: window.__sequenz.aktiv, sp: window.__sequenz.speicher, ov: getComputedStyle(document.documentElement).overflow, herde: document.documentElement.classList.contains('herde-an') })`));
      check(`replay ${name}: danach wieder einmalig (Listener weg, Speicher frei, Seite frei)`, r.aktiv === false && r.sp.bitmaps === 0 && r.sp.dateien === 0 && r.ov !== 'hidden');
      check(`replay ${name}: nie ein leeres Canvas, keine Fehler`, (await b.js('window.__blank')) === 0 && b.errors.length === 0, b.errors[0] || '');
    } finally { b.close(); }
  }
}

// Weiter-Pfeil: ein einzelner dunkelgrüner Linienpfeil ↓ (Schaft mit offener V-Spitze) mit „Wischen“/„Scrollen“ rechts
// daneben; sichtbar in A und B, aus während der Animation und in C, Klick löst die Geste aus
async function pfeil() {
  for (const name of ['se', 'iphone15', 'ipad-air-hoch', 'ipad-air-quer', 'desktop-1440', 'desktop-2560']) {
    const view = name === 'se' ? { w: 375, h: 667, mobile: true } : DEVICES[name];
    const b = await browser({ view });
    try {
      await start(b, view);
      const info = () => b.js(`(() => { const c = document.querySelector('.scroll-cue'), cs = getComputedStyle(c), r = c.getBoundingClientRect(), svg = c.querySelector('svg'), sv = svg.getBoundingClientRect(), tx = c.querySelector('.scroll-cue__text');
        const p1 = getComputedStyle(svg.querySelector('path')), tcs = getComputedStyle(tx), tr = tx.getBoundingClientRect();
        const q = (s) => { const e = document.querySelector(s); const x = e.getBoundingClientRect(); return { t: x.top, b: x.bottom, l: x.left, r: x.right }; };
        const G = (sel) => { const rg = document.createRange(); rg.selectNodeContents(document.querySelector(sel)); const x = rg.getBoundingClientRect(); return { t: x.top, b: x.bottom, l: x.left, r: x.right }; };
        const title = G('.hero__title'), claim = G('.hero__claim'), titleOp = +getComputedStyle(document.querySelector('.hero__text')).opacity;
        const hit = (x) => titleOp > 0.05 && !(r.bottom <= x.t || r.top >= x.b || r.right <= x.l || r.left >= x.r);
        const mid = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
        return { tag: c.tagName, label: c.getAttribute('aria-label'), type: c.type, op: +cs.opacity, vis: cs.visibility, disp: cs.display, w: r.width, h: r.height, svgW: sv.width, svgH: sv.height,
          fill: p1.fill, stroke: p1.stroke, sw: parseFloat(p1.strokeWidth) * sv.width / 64, cap: p1.strokeLinecap, join: p1.strokeLinejoin, shapes: svg.querySelectorAll('path').length, rects: svg.querySelectorAll('rect, polygon').length,
          mitte: Math.abs((r.left + r.right) / 2 - innerWidth / 2), unten: innerHeight - r.bottom, ueber: hit(title) || hit(claim), treffer: c.contains(mid), anim: getComputedStyle(svg).animationDuration,
          text: c.innerText.trim(), fs: parseFloat(tcs.fontSize), ls: parseFloat(tcs.letterSpacing), tcolor: tcs.color, tup: tcs.textTransform,
          rechts: tr.left >= sv.right - 1, vz: Math.abs((svg.offsetTop + svg.offsetHeight / 2) - (tx.offsetTop + tx.offsetHeight / 2)), cx: (r.left + r.right) / 2, cy: (r.top + r.bottom) / 2 }; })()`);
      await sleep(400);                                            // Einblenden (200 ms) abwarten
      const a = await info();
      const breit = view.w / view.h > 0.8, soll = breit ? Math.min(46, Math.max(34, view.h * 0.05)) : 40;
      const gruen = 'rgb(31, 77, 43)';
      check(`pfeil ${name}: Knopf „Weiter“ mit einem einzelnen Pfeil, ${Math.round(soll)} px breit, Tippfläche ≥ 44 px`, a.tag === 'BUTTON' && a.label === 'Weiter' && a.type === 'button' && a.shapes === 2 && a.rects === 0 && Math.abs(a.svgW - soll) <= 1 && a.w >= 44 && a.h >= 44 && Math.abs(a.svgH / a.svgW - 1) < 0.05, JSON.stringify({ w: a.w, h: a.h, svgW: a.svgW, shapes: a.shapes }));
      check(`pfeil ${name}: Linienpfeil wie „→“ nach unten: Schaft mit offener V-Spitze (kein Dreieck), dunkelgrün, kräftig (${a.sw.toFixed(1)} px), runde Enden`, a.fill === 'none' && a.stroke === gruen && a.sw >= 3.5 && a.sw <= 6 && a.cap === 'round' && a.join === 'round', JSON.stringify({ fill: a.fill, stroke: a.stroke, sw: a.sw, cap: a.cap }));
      check(`pfeil ${name}: „${a.text}“ rechts neben dem Pfeil, Versalien, weite Laufweite, dunkelgrün, ${a.fs} px, vertikal mittig`, /^(wischen|scrollen)$/i.test(a.text) && a.rechts && a.tup === 'uppercase' && a.fs >= 13 && a.ls >= 3 && a.tcolor === gruen && a.vz <= 2, JSON.stringify({ fs: a.fs, ls: a.ls, color: a.tcolor, vz: a.vz, rechts: a.rechts }));
      check(`pfeil ${name}: Zustand A sichtbar, unten mittig, Schleife 1,6 s`, a.vis === 'visible' && Math.abs(a.op - 0.9) < 0.03 && a.mitte < 2 && a.unten >= 8 && a.anim === '1.6s', JSON.stringify({ op: a.op, unten: a.unten, mitte: a.mitte, anim: a.anim }));
      check(`pfeil ${name}: liegt oben auf (klickbar)`, a.treffer);
      const start0 = await starts(b);
      await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a.cx, y: a.cy });
      await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: a.cx, y: a.cy, button: 'left', clickCount: 1 });
      await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: a.cx, y: a.cy, button: 'left', clickCount: 1 });
      await sleep(450);
      const w = await info();
      check(`pfeil ${name}: Klick startet Geste 1, Pfeil während der Animation aus (Deckkraft 0, unsichtbar)`, (await starts(b)) === start0 + 1 && w.op === 0 && w.vis === 'hidden', JSON.stringify({ op: w.op, vis: w.vis }));
      check(`pfeil ${name}: Klick führt nach B`, await waitZustand(b, 'B') && await idle(b));
      await sleep(500);
      const bb = await info();
      check(`pfeil ${name}: Zustand B sichtbar, ohne Überlappung mit Titel und Untertitel`, bb.vis === 'visible' && Math.abs(bb.op - 0.9) < 0.03 && !bb.ueber, JSON.stringify({ op: bb.op, ueber: bb.ueber }));
      await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: bb.cx, y: bb.cy, button: 'left', clickCount: 1 });
      await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: bb.cx, y: bb.cy, button: 'left', clickCount: 1 });
      await sleep(450);
      const w2 = await info();
      check(`pfeil ${name}: Klick in B startet Geste 2, Pfeil aus`, (await starts(b)) === start0 + 2 && w2.op === 0 && w2.vis === 'hidden');
      check(`pfeil ${name}: Geste 2 führt nach C`, await waitZustand(b, 'C', 12000) && await idle(b, 12000));
      await sleep(500);
      const c = await info();
      check(`pfeil ${name}: in Zustand C nicht sichtbar`, c.disp === 'none' || c.vis === 'hidden' || c.op === 0, JSON.stringify({ disp: c.disp, vis: c.vis, op: c.op }));
      check(`pfeil ${name}: keine Fehler`, b.errors.length === 0, b.errors[0] || '');
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
    const blitz = await b.js(`window.__S.filter((s) => s.frei && s.more !== 0).length`);
    check('neuladen: Neuladen oben zeigt nie das Endlayout über dem Standbild (kein Aufblitzen vor A)', blitz === 0, `${blitz} Bilder mit Endlayout`);
    await b.send('Page.navigate', { url: BASE + 'impressum.html' }); await sleep(1200);
    const h = (await b.send('Page.getNavigationHistory')).result;
    await b.send('Page.navigateToHistoryEntry', { entryId: h.entries[h.currentIndex - 1].id }); await sleep(3500); await waitReady(b);
    const z = await state(b), blitz2 = await b.js(`window.__S.filter((s) => s.frei && s.more !== 0).length`);
    check('neuladen: Zurück zur Startseite (Position oben) startet in A, ohne Aufblitzen', z.z === 'A' && z.y === 0 && blitz2 === 0, JSON.stringify({ z: z.z, y: z.y, blitz: blitz2 }));
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

// 11. Tastatur: Pfeil, Bild, Leertaste (auch mit Umschalttaste zurück); der Rückweg gilt nur in B
async function tasten() {
  const b = await browser({ view: 'desktop' });
  try {
    await start(b, 'desktop');
    const folge = [['PageDown', 'B'], ['PageUp', 'A'], [' ', 'B'], ['ArrowUp', 'A'], ['ArrowDown', 'B'], ['ArrowDown', 'C']];
    let ok = true, detail = '';
    for (const [taste, ziel] of folge) {
      await keyPress(b, taste);
      if (!(await waitZustand(b, ziel)) || !(await idle(b))) { ok = false; detail = `${taste} → ${ziel} nicht erreicht`; break; }
    }
    check('tasten: Bild ab/auf, Pfeil, Leertaste bewegen A ↔ B → C', ok, detail);
  } finally { b.close(); }
  const b2 = await browser({ view: 'desktop' });
  try {
    await start(b2, 'desktop');
    await keyPress(b2, 'ArrowDown'); await waitZustand(b2, 'B'); await idle(b2);
    await keyPress(b2, ' ', 8);   // Umschalt + Leertaste = zurück
    check('tasten: Umschalt + Leertaste geht in B zurück nach A', await waitZustand(b2, 'A'));
  } finally { b2.close(); }
}

// 12. Überspringen: fokussierbarer Knopf springt direkt zu C; sichtbarer Hinweis unten
async function skip() {
  const b = await browser({ view: 'desktop' });
  try {
    await start(b, 'desktop'); await sleep(450);                 // der Pfeil blendet nach „bereit“ in 0,2 s ein
    const cue = await b.js(`(() => { const c = document.querySelector('.scroll-cue'); const r = c.getBoundingClientRect(); return { sichtbar: getComputedStyle(c).display !== 'none' && getComputedStyle(c).visibility === 'visible' && +getComputedStyle(c).opacity >= 0.75, unten: r.top > innerHeight * 0.85, text: c.innerText.trim() }; })()`);
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

// 15. Browserleisten (Safari 26 am Handy/Tablet: Statusleiste oben, Leiste unten; theme-color für Chrome Android und ältere iOS): folgen dem Bierstand
//     oben beige, sobald die Schaumkrone kommt; unten bierfarben, solange unten Bier zu sehen ist, danach weich beige. Desktop unverändert.
const WEBKIT_FAKE = `(() => { const o = CSS.supports.bind(CSS); CSS.supports = (...a) => (a[0] === '-webkit-touch-callout' ? true : o(...a)); })();`;   // Chrome gibt sich als Touch-WebKit aus
async function leisten() {
  const gold = (c) => (c ? Math.max(0, Math.min(1, (247 - Number(c.match(/\d+/g)[0])) / 50)) : null);        // 0 beige … 1 Bierfarbe (rot: 247 → 197)
  const messen = (b) => async (p) => {
    await b.js(`window.__sequenz.zeige(${p})`); await sleep(380);
    return JSON.parse(await b.js(`JSON.stringify((() => { const c = (e) => (e ? getComputedStyle(e).backgroundColor : null), t = document.querySelectorAll('.edge--top'), u = document.querySelectorAll('.edge--bottom');
      const beer = document.querySelector('.beer'), H = beer.clientHeight, foamH = Math.min(100, Math.max(56, H * 0.09));
      return { top: c(t[0]), bottom: c(u[0]), n: [t.length, u.length], meta: document.querySelector('meta[name=theme-color]').content, page: document.documentElement.classList.contains('gold-page'),
        surf: new DOMMatrix(getComputedStyle(document.querySelector('.beer__liquid')).transform).m42 + 170, lt: foamH + 22, vh: innerHeight, root: getComputedStyle(document.documentElement).backgroundColor }; })())`));
  };
  for (const [name, view] of Object.entries(GERAETE)) {
    const touch = !!view.mobile;
    const b = await browser({ view });
    try {
      await b.send('Page.addScriptToEvaluateOnNewDocument', { source: WEBKIT_FAKE });
      await start(b, view);
      const M = messen(b);
      const a = await M(0), B = await M(1), m = await M(Pg2(PH.PH1 * 0.5)), e = await M(2);
      if (touch) {
        check(`leisten ${name}: A beide Streifen beige, B beide bierfarben (${gold(a.top).toFixed(2)}/${gold(a.bottom).toFixed(2)} → ${gold(B.top).toFixed(2)}/${gold(B.bottom).toFixed(2)}), je ein Streifen oben und unten`,
          gold(a.top) < 0.05 && gold(a.bottom) < 0.05 && gold(B.top) > 0.95 && gold(B.bottom) > 0.95 && a.n.join() === '1,1' && B.n.join() === '1,1', JSON.stringify({ a, B }));
        check(`leisten ${name}: bei 50 % von Phase 1 oben beige (${gold(m.top).toFixed(2)}), unten bierfarben (${gold(m.bottom).toFixed(2)}); am Ende beide beige`,
          gold(m.top) < 0.07 && gold(m.bottom) > 0.95 && gold(e.top) < 0.07 && gold(e.bottom) < 0.07, JSON.stringify({ m, e }));
        // lückenlos: oben nie Gold unter Schaum, unten nie beige, solange unten Bier zu sehen ist, kein Sprung
        let ok = true, fehler = '', prevT = 1, prevB = 1, maxStep = 0;
        for (let T = 0; T <= PH.PH1 + 60; T += 30) {
          const p = Pg2(T), x = await M(+p.toFixed(4)), gt = gold(x.top), gb = gold(x.bottom);
          if (x.surf >= -16 + x.lt + 2 && gt > 0.07) { ok = false; fehler += ` oben ${gt.toFixed(2)} bei P ${p.toFixed(2)};`; }
          if (x.surf - 12 < x.vh - 4 && gb < 0.95) { ok = false; fehler += ` unten ${gb.toFixed(2)} bei P ${p.toFixed(2)};`; }
          if (gt > prevT + 0.001 || gb > prevB + 0.001) { ok = false; fehler += ` steigt bei P ${p.toFixed(2)};`; }
          maxStep = Math.max(maxStep, prevT - gt, prevB - gb); prevT = gt; prevB = gb;
        }
        check(`leisten ${name}: oben nie Gold unter dem Schaum, unten nie beige bei sichtbarem Bier, nur fallend, größter Schritt ${maxStep.toFixed(2)} (≤ 0,45)`, ok && maxStep <= 0.45, fehler.slice(0, 200));
        const geo = JSON.parse(await b.js(`JSON.stringify((() => { const s = document.querySelector('.edge--top'), u = document.querySelector('.edge--bottom'), c = getComputedStyle(s), r = s.getBoundingClientRect(), r2 = u.getBoundingClientRect(), br = getComputedStyle(document.querySelector('.site-header__brand')), h = getComputedStyle(document.querySelector('.site-header'));
          return { pos: c.position, z: c.zIndex, h: r.height, top: r.top, w: r.width, vw: innerWidth, bottom: Math.round(innerHeight - r2.bottom), brandZ: br.zIndex, headerZ: h.zIndex, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }; })())`));
        check(`leisten ${name}: Streifen 6 px hoch, fest, ganze Breite, über dem Papierkorn (z 60), Beschriftung „Hofer Bräu“ darüber (z ${geo.brandZ}), kein horizontaler Scroll`,
          geo.pos === 'fixed' && geo.h === 6 && geo.top === 0 && geo.bottom === 0 && geo.w === geo.vw && +geo.z === 60 && +geo.brandZ === 61 && geo.headerZ === 'auto' && geo.sw === geo.cw, JSON.stringify(geo));
      } else {
        check(`leisten ${name}: Desktop ohne Streifen, Seitenhintergrund wie bisher (B gold ${B.page}, 50 % gold ${m.page}, Ende ${e.page})`,
          [a, B, m, e].every((x) => x.n.join() === '0,0') && B.page && m.page && e.page === false, JSON.stringify({ a: a.page, B: B.page, m: m.page, e: e.page }));
      }
      check(`leisten ${name}: theme-color (Chrome Android, iOS bis 25): B gold ${B.meta}, 50 % beige ${m.meta}, A/Ende beige ${a.meta}/${e.meta}`,
        B.meta === '#c5a149' && m.meta === '#f7f4ec' && a.meta === '#f7f4ec' && e.meta === '#f7f4ec');
    } finally { try { b.close(); } catch (x) { /* schon zu */ } }
  }
  // Ohne Touch-WebKit (Chrome Android, Desktop-Chrome): keine Streifen, nur theme-color
  { const view = GERAETE.iphone15, b = await browser({ view });
    try {
      await start(b, view);
      const M = messen(b); const B = await M(1), m = await M(1.5);
      check('leisten Chrome Android: keine Streifen, theme-color folgt (B gold, 50 % beige)', B.n.join() === '0,0' && m.n.join() === '0,0' && B.meta === '#c5a149' && m.meta === '#f7f4ec', JSON.stringify({ B: B.meta, m: m.meta, n: m.n }));
    } finally { b.close(); } }
  // Echter Ablauf mit Streifen: in C sind sie weg, Seitenhintergrund und theme-color beige
  { const view = GERAETE.iphone15, b = await browser({ view });
    try {
      await b.send('Page.addScriptToEvaluateOnNewDocument', { source: WEBKIT_FAKE });
      await start(b, view);
      const vorher = await b.js(`document.querySelectorAll('.edge').length`);
      await gesture(b, 1); await waitZustand(b, 'B'); await idle(b);
      const inB = await b.js(`JSON.stringify([document.querySelectorAll('.edge').length, getComputedStyle(document.querySelector('.edge--top')).backgroundColor])`);
      await gesture(b, 1); await waitZustand(b, 'C', 12000); await idle(b, 12000); await sleep(600);
      const c = JSON.parse(await b.js(`JSON.stringify({ n: document.querySelectorAll('.edge').length, meta: document.querySelector('meta[name=theme-color]').content, root: getComputedStyle(document.documentElement).backgroundColor, body: getComputedStyle(document.body).backgroundColor })`));
      check(`leisten echter Ablauf (iPhone 15): in A ${vorher} Streifen (beige), in B ${inB}, in C ${c.n}, Seite und theme-color beige`,
        vorher === 2 && JSON.parse(inB)[0] === 2 && gold(JSON.parse(inB)[1]) > 0.95 && c.n === 0 && c.meta === '#f7f4ec' && c.root === 'rgb(247, 244, 236)' && c.body === 'rgb(247, 244, 236)', JSON.stringify(c));
      check('leisten echter Ablauf: keine Fehler, CLS 0', b.errors.length === 0 && (await b.js('window.__cls')) === 0, b.errors[0] || '');
    } finally { b.close(); } }
}

// 16. Seitenrahmen (Zustand C): feiner Doppelrahmen um den ganzen Hauptinhalt, blendet am Ende von Geste 2 ein, scrollt mit, endet vor dem Fuß, nichts überlappt die Linie
async function rahmen() {
  for (const [name, view] of Object.entries(GERAETE)) {
    const phone = view.w < 768;
    let b = await browser({ view });
    try {
      await start(b, view);
      const op = async (p) => { await b.js(`window.__sequenz.zeige(${p})`); await sleep(300); return JSON.parse(await b.js(`JSON.stringify({ page: +getComputedStyle(document.querySelector('.frame--page')).opacity, hero: +getComputedStyle(document.querySelector('.hero > .frame')).opacity, fo: parseFloat(getComputedStyle(document.querySelector('.site-header')).getPropertyValue('--frame-o')) })`)); };
      const F0 = PH.PH1 + PH.PAUSE;                                              // Beginn von Phase 2: der Rahmen blendet gleichzeitig mit dem Block ein
      const A = await op(0), B = await op(1), m1 = await op(Pg2(F0)), m2 = await op(Pg2(F0 + 160)), m3 = await op(Pg2(F0 + 300)), E = await op(2);
      check(`rahmen ${name}: Startrahmen in A sichtbar (${A.hero}), in B weg (${B.hero}); Seitenrahmen in A unsichtbar, in B und bis zu seinem Einsatz nur zum Vorbereiten fast unsichtbar (${A.page}/${B.page}/${m1.page}), dann weicher Fade gleichzeitig mit dem Block (${m2.page.toFixed(2)} → ${m3.page.toFixed(2)}), am Ende ${E.page}`,
        A.hero === 1 && B.hero === 0 && A.page === 0 && B.page <= 0.011 && m1.page <= 0.011 && Math.abs(m2.page - einT(F0 + 160)) <= 0.02 && Math.abs(m3.page - einT(F0 + 300)) <= 0.02 && E.page === 1, JSON.stringify({ A, B, m1, m2, m3, E }));
      check(`rahmen ${name}: Creme-Fläche hinter „Hofer Bräu“ folgt dem sichtbaren Rahmen (A ${A.fo}, B ${B.fo}, Ende ${E.fo})`, A.fo === 1 && B.fo === 0 && E.fo === 1 && Math.abs(m2.fo - einT(F0 + 160)) <= 0.02);
    } finally { b.close(); }
    b = await browser({ view });
    try {
      await nachC(b, view);
      const geo = JSON.parse(await b.js(`JSON.stringify((() => {
        const R = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top + scrollY, r: r.right, b: r.bottom + scrollY, w: r.width, h: r.height }; };
        const f = document.querySelector('.frame--page'), main = document.querySelector('main'), foot = document.querySelector('.site-footer'), F = R(f), M = R(main), T = R(foot), vw = document.documentElement.clientWidth;
        const gold = F.l + 1.5 + 5 + 1, goldR = F.r - 1.5 - 5 - 1, bad = [];
        for (const e of main.querySelectorAll('*')) {
          if (e.closest('.frame--page, .beer, .site-header, svg:not(:scope)') || (e.matches('.sheep') && e.closest('.herd')) || e.tagName === 'SECTION' || e.classList.contains('hero') || (${phone} && e.closest('.timeline') && !e.matches('.timeline'))) continue;
          if (e.ownerSVGElement) continue;
          const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') continue;
          const r = R(e); if (r.w < 2 || r.h < 2) continue;
          if (r.l < gold + 8 || r.r > goldR - 8) bad.push((e.className && e.className.baseVal === undefined ? e.className : e.tagName) + ' ' + Math.round(r.l) + '–' + Math.round(r.r));
        }
        const secs = [...document.querySelectorAll('.section')].map((e) => R(e)).filter((r) => r.w > 0), rb = document.querySelector('.site-header__brand').getBoundingClientRect(), fo = parseFloat(getComputedStyle(document.querySelector('.site-header')).getPropertyValue('--frame-o'));
        const cor = [...f.querySelectorAll('.frame__corner')].map((c, k) => { const r = R(c); return [Math.round(k % 2 ? F.r - r.r : r.l - F.l), Math.round(k < 2 ? r.t - F.t : F.b - r.b)]; });   // tl, tr, bl, br: Abstand zur jeweiligen Ecke
        return { F, M, T, vw, inset: F.l, op: +getComputedStyle(f).opacity, pos: getComputedStyle(f).position, par: f.offsetParent === main, bad: bad.slice(0, 8), nbad: bad.length, secs: secs.every((r) => r.l >= gold + 8 && r.r <= goldR - 8), nsec: secs.length,
          brandY: (rb.top + rb.bottom) / 2 + scrollY, fo, cor, sw: document.documentElement.scrollWidth, cw: vw, hero: getComputedStyle(document.querySelector('.hero > .frame')).display }; })())`));
      const ok1 = phone ? geo.inset >= 10 && geo.inset <= 12 : view.w >= 1400 ? geo.inset >= 20 && geo.inset <= 24 : geo.inset >= 10 && geo.inset <= 24;
      check(`rahmen ${name}: nach Geste 2 sichtbar (${geo.op}), Abstand zum Bildschirmrand ${geo.inset.toFixed(1)} px (${phone ? '10–12' : view.w >= 1400 ? '20–24' : '10–24'}), eine Fläche um den Hauptinhalt (absolut in main), Startrahmen aus`, geo.op === 1 && ok1 && geo.pos === 'absolute' && geo.par && geo.hero === 'none', JSON.stringify({ op: geo.op, inset: geo.inset, pos: geo.pos, par: geo.par, hero: geo.hero }));
      check(`rahmen ${name}: oben wie im Startbild (${geo.F.t.toFixed(1)} px), unten direkt vor dem Fuß (Rahmen endet ${Math.round(geo.F.b)}, Fuß beginnt ${Math.round(geo.T.t)}; Lücke ${Math.round(geo.T.t - geo.F.b)} px ≤ Abstand ${geo.inset.toFixed(0)} + 2), Höhe = Hauptinhalt − 2 × Abstand, Fuß außerhalb`,
        Math.abs(geo.F.t - geo.inset) <= 1 && geo.F.b <= geo.T.t + 0.5 && geo.T.t - geo.F.b <= geo.inset + 2 && Math.abs(geo.F.h - (geo.M.h - 2 * geo.inset)) <= 1.5, JSON.stringify({ F: geo.F, M: geo.M, T: geo.T }));
      check(`rahmen ${name}: Eckverzierungen an den vier Enden (Abstände ${geo.cor.map((c) => c.join('/')).join(' · ')}), „Hofer Bräu“ mittig in der oberen Linie (Mitte ${Math.round(geo.brandY)} px, Linie ${Math.round(geo.F.t)}), Creme dahinter ${geo.fo}`,
        geo.cor.length === 4 && geo.cor.every((c) => c.every((v) => v >= 0 && v <= 4)) && Math.abs(geo.brandY - (geo.F.t + 0.75)) <= 5 && geo.fo === 1, JSON.stringify(geo.cor));
      check(`rahmen ${name}: nichts berührt oder überlappt die Linie (${geo.nbad} Elemente zu nah, alle ${geo.nsec} Abschnitte samt Trennlinien innerhalb), kein horizontaler Scroll (${geo.sw}/${geo.cw})`, geo.nbad === 0 && geo.secs && geo.sw === geo.cw, geo.bad.join('; '));
      // scrollt mit der Seite
      const ft = () => b.js(`document.querySelector('.frame--page').getBoundingClientRect().top`), sy = () => b.js('scrollY');
      const y0 = await ft(), s0 = await sy();
      await b.js('window.scrollTo(0, 900)'); await sleep(300);
      const y1 = await ft(), s1 = await sy();
      check(`rahmen ${name}: scrollt mit der Seite (nicht fixiert): Oberkante ${Math.round(y0)} → ${Math.round(y1)} px bei ${Math.round(s1 - s0)} px Scroll`, s1 - s0 > 800 && Math.abs((y0 - y1) - (s1 - s0)) <= 1.5);
      check(`rahmen ${name}: keine Fehler, CLS 0, keine externen Anfragen`, b.errors.length === 0 && (await b.js('window.__cls')) === 0 && b.external.length === 0, b.errors[0] || '');
    } finally { b.close(); }
  }
  // Bewegung reduzieren und Neuladen mitten auf der Seite: Rahmen sofort sichtbar
  for (const reduced of [true, false]) {
    const view = GERAETE['iphone15'];
    const b = await browser({ view, reducedMotion: reduced });
    try {
      await setView(b, view);
      if (!reduced) { await b.send('Page.navigate', { url: BASE }); await waitReady(b); await b.js('window.__sequenz.skip()'); await sleep(600); await b.js('window.scrollTo(0, 900)'); await sleep(400); await b.send('Page.reload'); }
      else await b.send('Page.navigate', { url: BASE });
      await sleep(3500);
      const r = JSON.parse(await b.js(`JSON.stringify((() => { const f = document.querySelector('.frame--page'), r = f.getBoundingClientRect(); return { op: +getComputedStyle(f).opacity, h: Math.round(r.height), main: Math.round(document.querySelector('main').getBoundingClientRect().height), hero: getComputedStyle(document.querySelector('.hero > .frame')).display }; })())`));
      check(`rahmen ${reduced ? 'Bewegung reduzieren' : 'Neuladen mitten auf der Seite'}: Seitenrahmen sofort sichtbar (${r.op}), ganze Seitenhöhe (${r.h} von ${r.main} px), Startrahmen aus`, r.op === 1 && r.h >= r.main - 60 && r.hero === 'none', JSON.stringify(r));
    } finally { b.close(); }
  }
}

// 17. Ladesymbol am Start: das HB-Logo dreht sich auf einer runden Scheibe mitten auf der Seite und dreht sich so lange, bis die Sequenz spielbereit ist; dann aus, Weiter-Pfeil an
async function lade() {
  for (const name of ['iphone-se', 'iphone15', 'ipad-hoch', 'desktop-1440']) {
    const view = GERAETE[name];
    const b = await browser({ view });
    try {
      await setView(b, view); await throttle(b);
      await b.send('Page.navigate', { url: BASE + '?lade=' + Date.now() });
      const st = () => b.js(`JSON.stringify((() => { const q = (s) => document.querySelector(s), l = q('.lade'), mi = q('.lade__mitte'), c = q('.lade__muenze'), r = mi ? mi.getBoundingClientRect() : null, p = q('.poster img');
        const mid = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
        return { cls: document.documentElement.className, disp: l ? getComputedStyle(l).display : null, role: l && l.getAttribute('role'), nosnip: l && l.hasAttribute('data-nosnippet'), box: l ? +getComputedStyle(l).opacity : null, mitte: mi ? +getComputedStyle(mi).opacity : null,
          cx: r ? Math.round(r.left + r.width / 2 - innerWidth / 2) : null, cy: r ? Math.round(r.top + r.height / 2 - innerHeight / 2) : null, w: r ? Math.round(r.width) : 0, rund: mi ? getComputedStyle(mi).borderRadius : '',
          anim: c ? getComputedStyle(c).animationName + ' ' + getComputedStyle(c).animationIterationCount : '', m: c ? getComputedStyle(c).transform : '', hit: !!(mid && mid.closest('.lade')), cue: +getComputedStyle(q('.scroll-cue')).opacity,
          poster: !!(p && p.complete && p.naturalWidth > 0), text: q('.lade__text') && q('.lade__text').textContent.trim(), bild: getComputedStyle(q('.lade__muenze i')).backgroundImage.startsWith('url("data:image/webp') }; })())`).then(JSON.parse);
      let a = null; for (let i = 0; i < 40 && !(a && a.disp === 'block'); i++) { a = await st().catch(() => null); await sleep(100); }
      await sleep(900);
      const x1 = await st(); await sleep(300); const x2 = await st();
      check(`lade ${name}: Ladesymbol mitten auf der Seite (Abweichung von der Mitte ${x1.cx}/${x1.cy} px, ${x1.w} px große runde Scheibe), „${x1.text}“, Logo dreht sich ohne Ende (${x1.anim}, Lage ändert sich), sichtbar (${x1.mitte}), fängt keine Eingaben`,
        x1.disp === 'block' && x1.role === 'status' && x1.nosnip && Math.abs(x1.cx) <= 2 && Math.abs(x1.cy) <= 2 && x1.w >= 150 && /50%|%/.test(x1.rund) && /lade-dreh infinite/.test(x1.anim) && x1.m !== x2.m && x1.mitte === 1 && !x1.hit && x1.bild && /Lädt/i.test(x1.text), JSON.stringify({ x1, x2: x2.m }));
      // Standbild da, Bilder der Sequenz noch nicht: Symbol bleibt in der Mitte und dreht sich weiter
      let pz = null; for (let i = 0; i < 300 && !(pz && pz.poster); i++) { pz = await st().catch(() => null); await sleep(100); }
      await sleep(600);
      const y1 = await st(); await sleep(400); const y2 = await st();
      check(`lade ${name}: auch mit dem Standbild bleibt es mitten auf der Seite und dreht sich weiter (${y1.cx}/${y1.cy} px, sichtbar ${y1.box}, ${y1.cls.includes('bereit') ? 'schon bereit' : 'noch nicht bereit'})`,
        y1.cls.includes('bereit') || (Math.abs(y1.cx) <= 2 && Math.abs(y1.cy) <= 2 && y1.box === 1 && y1.m !== y2.m && y1.cue === 0), JSON.stringify({ y1, y2: y2.m }));
      await waitReady(b, 120000); await sleep(900);
      const z = await st();
      check(`lade ${name}: spielbereit: Ladesymbol aus (${z.box}), Weiter-Pfeil an (${z.cue})`, z.cls.includes('bereit') && z.box === 0 && z.cue > 0.8, JSON.stringify(z));
      const Sm = await samples(b), erst = Sm.find((x) => x.bereit), n = erst ? await b.js('window.__sequenz.anzahl') : 0;
      check(`lade ${name}: spielbereit schon nach der ersten Hälfte der Bilder (${erst && erst.geladen} von ${n} geladen, Soll ≥ ${Math.ceil(n / 2)} und bei Fast 3G noch nicht alle), danach lädt der Rest weiter (${await b.js('window.__sequenz.geladen')})`,
        !!erst && erst.geladen >= Math.ceil(n / 2) && erst.geladen < n && (await b.js('window.__sequenz.geladen')) >= erst.geladen, JSON.stringify({ geladen: erst && erst.geladen, n }));
      check(`lade ${name}: keine Fehler, keine externen Anfragen, CLS 0`, b.errors.length === 0 && b.external.length === 0 && (await b.js('window.__cls')) === 0, b.errors[0] || b.external[0] || '');
    } finally { b.close(); }
  }
  // Ohne Intro (Bewegung reduzieren, Neuladen mitten auf der Seite): kein Ladesymbol
  for (const reduced of [true, false]) {
    const view = GERAETE.iphone15, b = await browser({ view, reducedMotion: reduced });
    try {
      await setView(b, view);
      if (!reduced) { await b.send('Page.navigate', { url: BASE }); await waitReady(b); await b.js('window.__sequenz.skip()'); await sleep(600); await b.js('window.scrollTo(0, 900)'); await sleep(400); await b.send('Page.reload'); }
      else await b.send('Page.navigate', { url: BASE });
      await sleep(1500);
      const d = await b.js(`getComputedStyle(document.querySelector('.lade')).display`);
      check(`lade ${reduced ? 'Bewegung reduzieren' : 'Neuladen mitten auf der Seite'}: kein Ladesymbol (${d})`, d === 'none');
    } finally { b.close(); }
  }
}

// 18. Geste 2 in zwei klar getrennten Phasen nacheinander: Phase 1 nur das Bier (Titel ruhig), Pause, Phase 2 Titel gleitet, dann gestaffelt Schafe → Text → Gemälde → Rahmen
async function phasen() {
  for (const name of ['iphone-se', 'iphone15', 'ipad-hoch', 'desktop-1440']) {
    const view = GERAETE[name], breit = view.w >= 768;
    const b = await browser({ view });
    try {
      await start(b, view);
      const pz = JSON.parse(await b.js('JSON.stringify(window.__sequenz.phasen)'));
      check(`phasen ${name}: Zahlen der Zeitleiste wie im Test (zügiger Abstieg ${pz.PH_IN} ms, Phase 1 ${pz.PH1} ms gleichmäßig, Pause ${pz.PAUSE} ms, Fahrt ${pz.RIDE} ms, Einblenden ${pz.FADE} ms, gesamt ${pz.T2} ms)`, JSON.stringify(pz) === JSON.stringify(PH));
      await gesture(b, 1); await waitZustand(b, 'B'); await idle(b); await sleep(700);
      // Mitschnitt: welche Stileigenschaften ändern sich während Geste 2 (nur transform, opacity, visibility und --frame-o erlaubt) und Aufgaben über 50 ms (CPU 4 × langsamer)
      await b.js(`(() => { window.__chg = {}; window.__lt = [];
        const namen = (t) => (t || '').split(';').map((x) => x.split(':')[0].trim()).filter(Boolean);
        const val = (t, k) => { const m = (t || '').split(';').find((x) => x.split(':')[0].trim() === k); return m ? m.slice(m.indexOf(':') + 1).trim() : ''; };
        const mo = new MutationObserver((ms) => ms.forEach((m) => { const neu = m.target.getAttribute('style') || ''; for (const k of new Set([...namen(m.oldValue), ...namen(neu)])) if (val(m.oldValue, k) !== val(neu, k)) window.__chg[k] = (window.__chg[k] || 0) + 1; }));
        document.querySelectorAll('.hero__text, .hero__more, .hero__lead, .painting, .herd, .frame--page, .site-header, .beer, .beer__liquid, .hero > .frame').forEach((n) => mo.observe(n, { attributes: true, attributeFilter: ['style'], attributeOldValue: true }));
        try { new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lt.push(Math.round(e.duration)))).observe({ entryTypes: ['longtask'] }); } catch (e) {} })()`);
      await b.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      const n0 = (await samples(b)).length;
      await gesture(b, 1);
      check(`phasen ${name}: Geste 2 führt nach C`, await waitZustand(b, 'C', 20000) && await idle(b, 20000));
      await sleep(900);
      await b.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      const S = (await samples(b)).slice(n0).filter((x) => x.P > 1);
      const T = (x) => tOf(x.P);
      const sheep = (x) => (breit ? x.ops.art : x.ops.herd), ph1 = S.filter((x) => T(x) < PH.PH1), pause = S.filter((x) => T(x) >= PH.PH1 + 20 && T(x) < PH.PH1 + PH.PAUSE - 20);
      const y0 = S[0].textY, allHidden = (x) => sheep(x) <= 0.011 && x.ops.lead <= 0.011 && x.ops.art <= 0.011 && x.ops.pf <= 0.011;
      let rueck = 0; for (let i = 1; i < ph1.length; i++) if (ph1[i].level - ph1[i - 1].level < -0.5) rueck++;
      check(`phasen ${name}: Phase 1 (${PH.PH1} ms, ${ph1.length} Bilder): nur das Bier läuft aus (Pegel ${ph1[0].level} → ${ph1.at(-1).level} px, sinkt gleichmäßig), Titel ruhig an seiner Stelle (${y0} px, Abweichung ${Math.max(...ph1.map((x) => Math.abs(x.textY - y0))).toFixed(1)}), Schafe, Text, Gemälde, Rahmen unsichtbar, Pfeil aus (nach 0,25 s)`,
        ph1.length > 20 && rueck === 0 && ph1.every((x) => Math.abs(x.textY - y0) <= 0.6 && allHidden(x) && (T(x) < 250 || x.cue <= 0.02)), JSON.stringify({ n: ph1.length, rueck }));
      check(`phasen ${name}: Pause (${pause.length} Bilder): nichts bewegt sich (Titel ${y0} px), nichts eingeblendet`, pause.length >= 3 && pause.every((x) => Math.abs(x.textY - y0) <= 0.6 && allHidden(x)), JSON.stringify({ n: pause.length }));
      const tStart = T(S.find((x) => x.textY < y0 - 1)), tEnde = T(S.find((x) => T(x) > PH.PH1 && Math.abs(x.textY) < 0.6));
      let auf = 0; { const g = S.filter((x) => T(x) >= PH.PH1); for (let i = 1; i < g.length; i++) if (g[i].textY - g[i - 1].textY > 0.6) auf++; }
      check(`phasen ${name}: Phase 2: der Titel fährt nach der Pause (ab ${Math.round(tStart)} ms, Soll ${PH.PH1 + PH.PAUSE}) in ${Math.round(tEnde - tStart)} ms nach oben (Soll ${PH.RIDE}), nie zurück`,
        tStart >= PH.PH1 + PH.PAUSE - 40 && tStart <= PH.PH1 + PH.PAUSE + 90 && tEnde - tStart >= PH.RIDE * 0.75 && tEnde - tStart <= PH.RIDE + 120 && auf === 0, JSON.stringify({ tStart, tEnde, auf }));
      const first = (f, lim) => { const x = S.find((y) => f(y) >= lim); return x ? T(x) : null; };
      const ops = [(x) => sheep(x), (x) => x.ops.lead, (x) => x.ops.art, (x) => x.ops.pf];
      const t05 = ops.map((f) => first(f, 0.05)), t50 = ops.map((f) => first(f, 0.5));
      const spanne = (a) => Math.max(...a) - Math.min(...a);
      check(`phasen ${name}: alles gleichzeitig: Schafe, Text, Gemälde und Rahmen beginnen bei ${t05.map(Math.round).join(' / ')} ms (Streuung ${Math.round(spanne(t05))} ms ≤ 50, Soll ab ${PH.PH1 + PH.PAUSE}) und sind bei ${t50.map(Math.round).join(' / ')} ms halb da (Streuung ≤ 50)`,
        t05.every((v) => v != null) && t50.every((v) => v != null) && spanne(t05) <= 50 && spanne(t50) <= 50 && Math.min(...t05) >= PH.PH1 + PH.PAUSE - 40, JSON.stringify({ t05, t50 }));
      const P2 = S.filter((x) => T(x) > PH.PH1 + PH.PAUSE + 40 && T(x) < PH.PH1 + PH.PAUSE + PH.RIDE - 120);
      const starr = P2.every((x) => Math.abs(x.tys.lead - x.textY) <= 1.5 && Math.abs(x.tys.art - x.textY) <= 1.5 && (breit || Math.abs(x.tys.herd - x.textY) <= 1.5));
      const m = P2[Math.floor(P2.length / 2)];
      check(`phasen ${name}: Titel, Text, Gemälde${breit ? ' (mit den Schafen ringsum)' : ' und Herde'} fahren gemeinsam um denselben Weg nach oben (${P2.length} Bilder, mitten in Phase 2: Titel ${m.textY} px, Text ${m.tys.lead} px, Gemälde ${m.tys.art} px${breit ? '' : ', Herde ' + m.tys.herd + ' px'}), am Ende 0`,
        P2.length > 15 && starr && S.at(-1).textY === 0 && S.at(-1).tys.lead === 0 && S.at(-1).tys.art === 0 && S.at(-1).tys.herd === 0, JSON.stringify({ n: P2.length, m }));
      const fin = S.at(-1), anim = S.filter((x) => x.anim);
      check(`phasen ${name}: will-change nur während der Animation (währenddessen „${anim[0] && anim[0].wc}“, danach „${fin.wc}“), Canvas schon vor Phase 1 freigegeben (Breite ${S[0].cw}, ${S.every((x) => x.cw === 0) ? 'durchgehend 0' : 'nicht 0'})`,
        anim.length > 20 && /transform/.test(anim[0].wc) && !fin.anim && fin.wc === 'auto' && S.every((x) => x.cw === 0), JSON.stringify({ anim: anim.length, wc: fin.wc, cw: S[0].cw }));
      const chg = await b.js('JSON.stringify(window.__chg)').then(JSON.parse), erlaubt = new Set(['opacity', 'transform', 'visibility', '--frame-o']), fremd = Object.keys(chg).filter((k) => !erlaubt.has(k));
      check(`phasen ${name}: nur transform und opacity werden animiert (geändert: ${Object.keys(chg).join(', ')})`, Object.keys(chg).length > 0 && fremd.length === 0, fremd.join(', '));
      const lt = await b.js('JSON.stringify(window.__lt)').then(JSON.parse), luecken = S.slice(1).map((x, i) => x.t - S[i].t).filter((d) => d > 0);
      check(`phasen ${name}: bei 4 × gedrosselter CPU keine langen Aufgaben (≥ 50 ms: ${lt.filter((d) => d >= 50).length}), größter Bildabstand ${Math.max(...luecken)} ms (≤ 50)`, lt.filter((d) => d >= 50).length === 0 && Math.max(...luecken) <= 50, JSON.stringify(lt));
      check(`phasen ${name}: keine Fehler, CLS 0`, b.errors.length === 0 && (await b.js('window.__cls')) === 0, b.errors[0] || '');
    } finally { b.close(); }
  }
}

// 19. Altersabfrage 16+: kompakte Karte (Desktop/iPad) bzw. Bottom Sheet (Handy), Seite dahinter sichtbar und abgedunkelt, Fokusfalle, Speicherung 30 Tage
async function alter() {
  for (const name of ['iphone-se', 'iphone15', 'ipad-hoch', 'ipad-quer', 'desktop-1440', 'desktop-2560']) {
    const view = GERAETE[name], phone = view.w < 768;
    const b = await browser({ view });
    try {
      await setView(b, view);
      await b.send('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.removeItem('berghof-ab16'); } catch (e) {}` });     // nach dem Messfühler: Abfrage erscheint
      await b.send('Page.navigate', { url: BASE + '?alter=' + Date.now() });
      await waitReady(b); await sleep(900);
      const g = JSON.parse(await b.js(`JSON.stringify((() => { const q = (x) => document.querySelector(x), cs = (x) => getComputedStyle(q(x)), c = q('.age__card').getBoundingClientRect(), vh = innerHeight, vw = innerWidth;
        const txt = [...document.querySelectorAll('.age__title, .age__note, .age__privacy, .age__links, .age__links a, .age__btn')].map((e) => parseFloat(getComputedStyle(e).fontSize));
        return { gate: document.documentElement.classList.contains('age-gate'), disp: cs('.age').display, w: Math.round(c.width), h: Math.round(c.height), cx: Math.round(c.left + c.width / 2 - vw / 2), cy: Math.round(c.top + c.height / 2 - vh / 2), bottom: Math.round(vh - c.bottom), anteil: +(c.height / vh).toFixed(2),
          radius: cs('.age__card').borderTopLeftRadius, radiusU: cs('.age__card').borderBottomLeftRadius, rand: cs('.age__card').borderTopColor, rw: cs('.age__card').borderTopWidth, bg: cs('.age__card').backgroundColor, dim: cs('.age').backgroundColor, blur: cs('.age').backdropFilter || cs('.age').webkitBackdropFilter,
          min: Math.min(...txt), btn: [...document.querySelectorAll('.age__btn')].map((e) => Math.round(e.getBoundingClientRect().height)), poster: getComputedStyle(q('.poster')).visibility, cv: getComputedStyle(q('#sequenz')).visibility, anim: cs('.age__card').animationName,
          inert: [...document.body.children].filter((e) => e.id !== 'altersabfrage').every((e) => e.inert), focus: document.activeElement.id || document.activeElement.className, vine: !!q('.age__vine'), sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, ja: q('.age__btn--ja').textContent.trim(), nein: q('[data-age="nein"]').textContent.trim() }; })())`));
      const alpha = +(g.dim.match(/[\d.]+/g)[3] ?? 1);
      if (phone) {
        check(`alter ${name}: Handy: Bottom Sheet unten (Breite ${g.w}/${view.w}, Abstand unten ${g.bottom} px), ${Math.round(g.anteil * 100)} % der Höhe (44–68 %), obere Ecken rund (${g.radius}), untere eckig`, g.w === view.w && Math.abs(g.bottom) <= 1 && g.anteil >= 0.44 && g.anteil <= 0.68 && parseFloat(g.radius) >= 16 && parseFloat(g.radiusU) === 0, JSON.stringify(g));
      } else {
        check(`alter ${name}: Karte mittig (Abweichung ${g.cx}/${g.cy} px), ${g.w} px breit (520–560), ${g.h} px hoch, Rahmen wie die Seite: tannengrün (${g.rw} ${g.rand}), innen feine goldene Linie, beiger Hintergrund (${g.bg})`,
          Math.abs(g.cx) <= 1 && Math.abs(g.cy) <= 2 && g.w <= 560 && g.w >= 520 && parseFloat(g.radius) >= 4 && g.rand === 'rgb(31, 77, 43)' && parseFloat(g.rw) >= 1 && g.bg === 'rgb(247, 244, 236)', JSON.stringify(g));
      }
      check(`alter ${name}: Seite dahinter sichtbar (Standbild ${g.poster}, Bildfolge ${g.cv}), abgedunkelt (Deckkraft ${alpha}) und weichgezeichnet („${g.blur}“), keine Ranken mehr, kein horizontaler Scroll`, (g.poster === 'visible' || g.cv === 'visible') && alpha > 0.2 && alpha < 0.7 && /blur/.test(g.blur || '') && !g.vine && g.sw === g.cw, JSON.stringify({ alpha, blur: g.blur }));
      check(`alter ${name}: Schrift mindestens 14 px (kleinste ${g.min} px), Schaltflächen mindestens 44 px hoch (${g.btn.join('/')} px), „${g.ja}“ und „${g.nein}“`, g.min >= 14 && g.btn.every((h) => h >= 44) && g.ja === 'Ja, ich bin 16' && g.nein === 'Nein', JSON.stringify({ min: g.min, btn: g.btn }));
      // Beide Antworten gleichwertig, Reihenfolge, Hinweis zu Cookies, Kontrast (WCAG AA), Fokus
      const gl = JSON.parse(await b.js(`JSON.stringify((() => { const ja = document.querySelector('[data-age="ja"]'), nein = document.querySelector('[data-age="nein"]'), st = (e) => { const c = getComputedStyle(e), r = e.getBoundingClientRect(); return { w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, bg: c.backgroundColor, bd: c.borderTopColor, bw: c.borderTopWidth, fg: c.color, fs: c.fontSize, fw: c.fontWeight, x: r.left, y: r.top }; };
        const priv = document.querySelector('.age__privacy'), c = (e) => getComputedStyle(e).color, bgOf = (e) => getComputedStyle(e).backgroundColor, hint = document.querySelector('.age__hint'), links = [...document.querySelectorAll('.age__links a')];
        return { ja: st(ja), nein: st(nein), priv: priv.textContent.trim(), privFarbe: c(priv), hintFarbe: c(hint), linkFarbe: links.map(c), card: bgOf(document.querySelector('.age__card')), titel: c(document.querySelector('.age__title')), privSize: getComputedStyle(priv).fontSize, reihenfolge: [...document.querySelectorAll('.age__btn')].map((e) => e.dataset.age).join(','), links: links.map((a) => a.textContent.trim() + '>' + a.getAttribute('href')).join(' · ') }; })())`));
      const lum = (c) => { const [r, g2, b2] = c.match(/[\d.]+/g).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g2 + 0.0722 * b2; };
      const over = (fg, bg) => { const m = fg.match(/[\d.]+/g).map(Number), a = m.length > 3 ? m[3] : 1, f = m.slice(0, 3), bb = bg.match(/[\d.]+/g).map(Number).slice(0, 3); return `rgb(${f.map((v, i) => v * a + bb[i] * (1 - a)).join(',')})`; };
      const kontrast = (fg, bg) => { const a = lum(fg), b3 = lum(bg); return (Math.max(a, b3) + 0.05) / (Math.min(a, b3) + 0.05); };
      const gleich = gl.ja.w === gl.nein.w && gl.ja.h === gl.nein.h && gl.ja.bg === gl.nein.bg && gl.ja.bd === gl.nein.bd && gl.ja.bw === gl.nein.bw && gl.ja.fg === gl.nein.fg && gl.ja.fs === gl.nein.fs && gl.ja.fw === gl.nein.fw;
      check(`alter ${name}: beide Antworten gleichwertig (${gl.ja.w}×${gl.ja.h} und ${gl.nein.w}×${gl.nein.h} px, Hintergrund ${gl.ja.bg}, Rahmen ${gl.ja.bw} ${gl.ja.bd}, Schrift ${gl.ja.fg}), nichts grün gefüllt`,
        gleich && gl.ja.bd === 'rgb(31, 77, 43)' && parseFloat(gl.ja.bw) >= 1 && gl.ja.fg === 'rgb(31, 77, 43)' && gl.ja.bg !== 'rgb(31, 77, 43)', JSON.stringify(gl));
      check(`alter ${name}: „Ja, ich bin 16“ links, „Nein“ rechts (${gl.reihenfolge}, x ${Math.round(gl.ja.x)} / ${Math.round(gl.nein.x)}), gleiche Zeile`, gl.reihenfolge === 'ja,nein' && gl.ja.x < gl.nein.x && Math.abs(gl.ja.y - gl.nein.y) <= 1, JSON.stringify(gl));
      const kJa = kontrast(gl.ja.fg, gl.ja.bg), kPriv = kontrast(over(gl.privFarbe, gl.card), gl.card), kHint = kontrast(gl.hintFarbe, gl.card), kTitel = kontrast(gl.titel, gl.card), kLink = Math.min(...gl.linkFarbe.map((f) => kontrast(f, gl.card)));
      check(`alter ${name}: Kontrast WCAG AA: Knöpfe ${kJa.toFixed(1)}, Hinweis ${kHint.toFixed(1)}, Cookie-Absatz (14 px) ${kPriv.toFixed(1)}, Links ${kLink.toFixed(1)}, Überschrift ${kTitel.toFixed(1)} (alle ≥ 4,5)`, [kJa, kPriv, kHint, kLink].every((k) => k >= 4.5) && kTitel >= 3, JSON.stringify({ kJa, kPriv, kHint, kLink, kTitel }));
      check(`alter ${name}: Hinweis zu Cookies und Speicherung unter dem Jugendschutz-Satz (${gl.privSize}), Links „${gl.links}“ darunter`,
        gl.priv === 'Wir verwenden keine Cookies und kein Tracking. Deine Antwort wird nur lokal in deinem Browser gespeichert.' && parseFloat(gl.privSize) === 14 && gl.links === 'Impressum>impressum.html · Datenschutz>datenschutz.html', JSON.stringify(gl));
      // Tastatur: Tab geht über beide Knöpfe und beide Links, der Fokus ist deutlich sichtbar und für beide Knöpfe gleich
      const fokusStil = async () => JSON.parse(await b.js(`JSON.stringify((() => { const e = document.activeElement, c = getComputedStyle(e); return { id: e.dataset.age || e.textContent.trim(), ow: c.outlineWidth, os: c.outlineStyle, oc: c.outlineColor, oo: c.outlineOffset, sh: c.boxShadow, bg: c.backgroundColor, inAge: !!e.closest('#altersabfrage') }; })())`));
      await b.js('document.querySelector("#altersabfrage").focus()'); const reihe = [];
      for (let i = 0; i < 4; i++) { await keyPress(b, 'Tab'); reihe.push(await fokusStil()); }
      const stiel = (x) => `${x.ow} ${x.os} ${x.oc} | ${x.sh}`;
      check(`alter ${name}: Tab wechselt „${reihe.map((x) => x.id).join('“ → „')}“, Fokus sichtbar (Gold-Rahmen ${reihe[0].ow} ${reihe[0].oc} plus dunkelgrüner Ring), beide Knöpfe gleich`,
        reihe.map((x) => x.id).join() === 'ja,nein,Impressum,Datenschutz' && reihe.every((x) => x.inAge && parseFloat(x.ow) >= 2 && x.os === 'solid' && x.oc === 'rgb(184, 145, 58)' && /rgb\(31, 77, 43\)/.test(x.sh)) && stiel(reihe[0]) === stiel(reihe[1]) && reihe[0].bg === reihe[1].bg, JSON.stringify(reihe));
      // Funktion: Seite gesperrt, Fokus in der Abfrage, Tab bleibt drin, Escape schließt nicht, Gesten ignoriert
      const innen = async () => b.js(`!!document.activeElement.closest('#altersabfrage')`);
      let bleibt = await innen();
      for (let i = 0; i < 7; i++) { await keyPress(b, 'Tab'); bleibt = bleibt && await innen(); }
      await keyPress(b, 'Escape'); await sleep(200);
      await keyPress(b, 'Tab', 8); bleibt = bleibt && await innen();
      const st1 = await state(b);
      await touchSwipe(b, 220); await flick(b, 900); await keyPress(b, 'ArrowDown'); await sleep(900);
      const st2 = await state(b), ig = (await log(b)).filter((e) => e.art === 'ignoriert' && e.grund === 'altersabfrage').length;
      check(`alter ${name}: Seite gesperrt (inert ${g.inert}), Fokus in der Abfrage (${g.focus}), Tab und Umschalt + Tab bleiben darin, Escape schließt nicht (${st1.z !== undefined ? 'Abfrage offen' : ''}), Intro startet nicht (${st2.z}, ${ig} Gesten ignoriert)`,
        g.inert && bleibt && (await b.js(`document.documentElement.classList.contains('age-gate')`)) && st2.z === 'A' && ig >= 1, JSON.stringify({ bleibt, z: st2.z, ig }));
      // „Nein“: freundlicher Hinweis, nichts gespeichert
      await b.js(`document.querySelector('[data-age="nein"]').click()`); await sleep(400);
      const nein = JSON.parse(await b.js(`JSON.stringify({ no: getComputedStyle(document.querySelector('.age__no')).display, ask: getComputedStyle(document.querySelector('.age__ask')).display, fokus: document.activeElement.className, gespeichert: (() => { try { return localStorage.getItem('berghof-ab16'); } catch (e) { return 'x'; } })() })`));
      check(`alter ${name}: „Nein“ zeigt den Hinweis (${nein.no}), blendet die Frage aus, Fokus im Hinweis, nichts gespeichert (${nein.gespeichert})`, nein.no === 'block' && nein.ask === 'none' && /age__no/.test(nein.fokus) && nein.gespeichert === null);
      // „Ja“ (nach Neuladen): 30 Tage gespeichert, Abfrage weicher Ausgang, Seite frei, Intro bedienbar
      await b.send('Page.navigate', { url: BASE + '?alter=' + Date.now() }); await waitReady(b); await sleep(700);
      const t0 = Date.now();
      await b.js(`document.querySelector('[data-age="ja"]').click()`); await sleep(1000);
      const ja = JSON.parse(await b.js(`JSON.stringify({ gate: document.documentElement.classList.contains('age-gate'), disp: getComputedStyle(document.querySelector('.age')).display, inert: [...document.body.children].some((e) => e.inert), ab: (() => { try { return Number(localStorage.getItem('berghof-ab16')); } catch (e) { return 0; } })() })`));
      const tage = (ja.ab - t0) / 864e5;
      await gesture(b, 1);
      check(`alter ${name}: „Ja“ speichert ${tage.toFixed(2)} Tage, blendet die Abfrage aus (Anzeige ${ja.disp}), gibt die Seite frei (inert ${ja.inert}) und das Intro läuft (Zustand ${await b.js('window.__sequenz.zustand')} nach Geste)`,
        !ja.gate && ja.disp === 'none' && !ja.inert && tage > 29.9 && tage < 30.1 && (await waitZustand(b, 'B')), JSON.stringify(ja));
      check(`alter ${name}: keine Fehler, CLS 0, keine externen Anfragen`, b.errors.length === 0 && (await b.js('window.__cls')) === 0 && b.external.length === 0, b.errors[0] || '');
    } finally { b.close(); }
  }
  // Bewegung reduzieren: ohne Animation; Neuladen nach „Ja“ (gespeichert): keine Abfrage
  { const view = GERAETE.iphone15, b = await browser({ view, reducedMotion: true });
    try {
      await setView(b, view);
      await b.send('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.removeItem('berghof-ab16'); } catch (e) {}` });
      await b.send('Page.navigate', { url: BASE + '?alter=' + Date.now() }); await sleep(1500);
      const r = JSON.parse(await b.js(`JSON.stringify({ a: getComputedStyle(document.querySelector('.age')).animationName, k: getComputedStyle(document.querySelector('.age__card')).animationName, t: getComputedStyle(document.querySelector('.age')).transitionDuration })`));
      check(`alter Bewegung reduzieren: Abfrage ohne Animation (${r.a}/${r.k}, Übergang ${r.t})`, r.a === 'none' && r.k === 'none' && parseFloat(r.t) < 0.001, JSON.stringify(r));
    } finally { b.close(); } }
  { const view = GERAETE.iphone15, b = await browser({ view });
    try {
      await start(b, view);                                                      // Messfühler hat die Bestätigung gesetzt: keine Abfrage
      const d = await b.js(`getComputedStyle(document.querySelector('.age')).display`);
      check(`alter mit gespeicherter Bestätigung: keine Abfrage (${d})`, d === 'none');
    } finally { b.close(); } }
}

// 20. Nach dem Intro ist kein Bier mehr auf der Seite (Layer abgeschaltet, nichts schaut unten aus dem Hero), auch nicht in kleinen Fenstern; „Bier Animation erneut anzeigen“ bringt es zurück und danach wieder weg
const FENSTER = { ...GERAETE, 'fenster-1000x650': { w: 1000, h: 650, mobile: false }, 'fenster-1710x1000': { w: 1710, h: 1000, mobile: false }, 'fenster-1280x720': { w: 1280, h: 720, mobile: false } };
const bierReste = (b) => b.js(`JSON.stringify((() => { const q = (s) => document.querySelector(s), beer = q('.beer'), cs = getComputedStyle(beer), cv = q('#sequenz');
  return { disp: cs.display, rects: beer.getClientRects().length, cvDisp: cv ? getComputedStyle(cv).display : 'weg', poster: getComputedStyle(q('.poster')).visibility, edges: document.querySelectorAll('.edge').length,
    lade: getComputedStyle(q('.lade')).display, age: getComputedStyle(q('.age')).display, gold: document.documentElement.classList.contains('gold-page'), frei: document.documentElement.classList.contains('frei') }; })())`).then(JSON.parse);
async function reste() {
  for (const [name, view] of Object.entries(FENSTER)) {
    if (name === 'desktop-2560' && !only.length) continue;
    const b = await browser({ view });
    try {
      await start(b, view);
      await gesture(b, 1); await waitZustand(b, 'B'); await idle(b); await sleep(400);
      await gesture(b, 1); await waitZustand(b, 'C', 15000); await idle(b, 15000); await sleep(900);
      const r = await bierReste(b);
      check(`reste ${name}: nach dem Intro ist das Bier weg (Layer ${r.disp}, ${r.rects} Flächen), Canvas ${r.cvDisp}, Standbild ${r.poster}, keine Leisten (${r.edges}), Ladesymbol ${r.lade}, Altersabfrage ${r.age}, Seitenhintergrund nicht gold (${r.gold})`,
        r.disp === 'none' && r.rects === 0 && r.cvDisp === 'none' && r.poster === 'hidden' && r.edges === 0 && r.lade === 'none' && r.age === 'none' && !r.gold && r.frei, JSON.stringify(r));
      // Pixel: unten am ersten Bildschirm und am Ende des Heros nirgends die Bierfarbe (197, 161, 73)
      const y = await b.js(`Math.round(document.querySelector('.hero').getBoundingClientRect().bottom + scrollY)`);
      await b.js(`window.scrollTo(0, ${Math.max(0, y - Math.round(view.h * 0.55))})`); await sleep(500);
      const buf = await shot(b), px = await goldShare(b, buf, 0, 1, 7);
      check(`reste ${name}: im Bild am Ende des Heros fast kein Pixel in Bierfarbe (${(px * 100).toFixed(3)} %, Grenze 0,3 %)`, px < 0.003, String(px));
      check(`reste ${name}: keine Fehler, kein horizontaler Scroll`, b.errors.length === 0 && (await b.js('document.documentElement.scrollWidth <= document.documentElement.clientWidth')), b.errors[0] || '');
      if (name === 'desktop-1440' || name === 'iphone15') {
        await b.js('window.scrollTo(0, 0)'); await sleep(300);
        await b.js(`window.scrollTo(0, document.documentElement.scrollHeight)`); await sleep(500);
        await b.js(`document.querySelector('[data-intro]').click()`); await sleep(1500); await waitReady(b);
        const w = await b.js(`(() => { const e = document.querySelector('.beer'); return [getComputedStyle(e).display, e.clientWidth, e.clientHeight, window.__sequenz.zustand]; })()`);
        check(`reste ${name}: nach „Bier Animation erneut anzeigen“ ist der Layer wieder da und gemessen (${w.join(' / ')})`, w[0] === 'block' && w[1] > 0 && w[2] > 0 && w[3] === 'A', JSON.stringify(w));
        await gesture(b, 1); await waitZustand(b, 'B'); await idle(b); await sleep(400); await gesture(b, 1); await waitZustand(b, 'C', 15000); await idle(b, 15000); await sleep(900);
        const r2 = await bierReste(b);
        const S = (await samples(b)).filter((x) => x.z === 'B' && x.P > 1 && x.P < 1.5 && x.level + 170 > 0);
        check(`reste ${name}: beim zweiten Mal läuft das Bier wieder ein (${S.length} Bilder mit Schaum im Bild) und danach ist es wieder weg (${r2.disp})`, S.length > 10 && r2.disp === 'none', JSON.stringify(r2));
      }
    } finally { b.close(); }
  }
}

// 21. Kein Sprung am Ende von Geste 2: Titel, Text und Gemälde stehen nach der Fahrt still (kein Neumessen, --lift unverändert); das Gemälde hat schon vor dem Laden die richtige Höhe (WebKit hat es ohne aspect-ratio mit 18 px gemessen)
async function sprung() {
  for (const [name, view] of Object.entries(FENSTER)) {
    if (name === 'desktop-2560' && !only.length) continue;
    const b = await browser({ view });
    try {
      await start(b, view);
      const ratio = await b.js(`(() => { const f = document.querySelector('.painting'), w = document.createElement('div'), t = document.createElement('img'); w.className = 'painting__bild'; t.setAttribute('width', '1030'); t.setAttribute('height', '687'); t.alt = 'Platzhalter ohne Quelle'; w.appendChild(t); f.insertBefore(w, f.firstChild);
        const r = w.getBoundingClientRect(), ar = getComputedStyle(w).aspectRatio, res = [Math.round(r.width), Math.round(r.height), ar]; w.remove(); return res; })()`);
      check(`sprung ${name}: Bildfläche des Gemäldes hat schon vor dem Laden die richtige Höhe (${ratio[0]} × ${ratio[1]} px, aspect-ratio „${ratio[2]}“, Soll Verhältnis 1,5)`,
        /1030 \/ 687/.test(ratio[2]) && Math.abs(ratio[0] / ratio[1] - 1030 / 687) < 0.03, JSON.stringify(ratio));
      await gesture(b, 1); await waitZustand(b, 'B'); await idle(b); await sleep(500);
      const lift0 = await b.js(`document.querySelector('.hero').style.getPropertyValue('--lift') + '|' + document.querySelector('.hero').style.getPropertyValue('--fold') + '|' + document.querySelector('.hero').style.getPropertyValue('--zone')`);
      await b.js(`window.__R = []; (function loop() { requestAnimationFrame(() => { setTimeout(() => { const q = (s) => document.querySelector(s), r = (s) => Math.round(q(s).getBoundingClientRect().top * 10) / 10;
        window.__R.push([Math.round(performance.now()), window.__sequenz.zustand, +window.__sequenz.P.toFixed(4), r('.hero__title'), r('.hero__lead'), r('.painting')]); }, 0); loop(); }); })()`);
      await gesture(b, 1); await waitZustand(b, 'C', 15000); await idle(b, 15000); await sleep(1500);
      const R = JSON.parse(await b.js('JSON.stringify(window.__R)')), lift1 = await b.js(`document.querySelector('.hero').style.getPropertyValue('--lift') + '|' + document.querySelector('.hero').style.getPropertyValue('--fold') + '|' + document.querySelector('.hero').style.getPropertyValue('--zone')`);
      // ab 100 ms vor dem Ende der Fahrt bis 1,5 s danach: kein Bild weicht um mehr als 2 px vom vorigen ab, insgesamt höchstens 3 px Drift
      const tEnd = PH.T2, G = R.filter((x) => x[2] >= 1 + (tEnd - 120) / PH.T2);
      let maxd = 0; for (let i = 1; i < G.length; i++) maxd = Math.max(maxd, Math.abs(G[i][3] - G[i - 1][3]), Math.abs(G[i][5] - G[i - 1][5]));
      const drift = Math.max(Math.abs(G.at(-1)[3] - G[0][3]), Math.abs(G.at(-1)[5] - G[0][5]));
      check(`sprung ${name}: nach der Fahrt springt nichts (größter Bildsprung ${maxd.toFixed(1)} px ≤ 2, Drift bis zum Ruhezustand ${drift.toFixed(1)} px ≤ 3, ${G.length} Bilder)`, G.length > 40 && maxd <= 2 && drift <= 3, JSON.stringify(G.filter((_, i) => i % 12 === 0)));
      check(`sprung ${name}: Layoutwerte --lift|--fold|--zone vor Geste 2 „${lift0}“ = nach dem Intro „${lift1}“`, lift0 === lift1);
      check(`sprung ${name}: keine Fehler, CLS 0`, b.errors.length === 0 && (await b.js('window.__cls')) === 0, b.errors[0] || '');
    } finally { b.close(); }
  }
}

const RUNS = [['gesten', gesten], ['flick', flickTest], ['sperre', sperre], ['hinundher', hinundher], ['laden', laden], ['kalt', kalt], ['uebergang', uebergang],
  ['zustandB', zustandB], ['geste2', geste2], ['titel', titel], ['herde', herde], ['pfeil', pfeil], ['timeline', timeline], ['einmalig', einmalig], ['replay', replay], ['neuladen', neuladen], ['drehen', drehen], ['tasten', tasten], ['skip', skip], ['reduziert', reduziert], ['extern', extern], ['leisten', leisten], ['rahmen', rahmen], ['lade', lade], ['phasen', phasen], ['alter', alter], ['puffer', puffer], ['reste', reste], ['sprung', sprung]];
for (const [name, fn] of RUNS) {
  if (!run(name)) continue;
  console.log(`\n── ${name}`);
  try { await fn(); } catch (e) { check(`${name}: ohne Absturz`, false, e.stack?.split('\n').slice(0, 3).join(' | ')); }
}
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed} von ${results.length} Prüfungen bestanden${failed ? `, ${failed} FEHLER` : ' ✓'}`);
process.exit(failed ? 1 : 0);
