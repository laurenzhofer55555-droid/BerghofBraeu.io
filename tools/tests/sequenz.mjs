// Automatische Tests der Startsequenz mit zwei Gesten (Zustände A Start, B Bier, C Inhalt), echte Ereignisse im Headless Chrome.
//
// Vorbereitung (eigener Terminal-Tab, im Projektordner):
//   python3 tools/tests/serve.py . 5263
// Aufruf:
//   node tools/tests/sequenz.mjs [szenario …]            (ohne Angabe: alle)
// Szenarien: gesten, flick, sperre, hinundher, laden, kalt, uebergang, zustandB, geste2, titel, herde, pfeil, timeline, einmalig, replay, neuladen, drehen, tasten, skip, reduziert, extern
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
        await b.js(`window.__sequenz.zeige(${1 + easeSine(pct / 100)})`); await sleep(500);
        const buf = await shot(b, join(OUT, 'geste2', `${name}-${pct}.png`));
        anteile[pct] = { oben: await goldShare(b, buf, 0.06, 0.3), gesamt: await goldShare(b, buf, 0.06, 0.9), alles: await goldShare(b, buf, 0.0, 0.3, 40) };       // oben (unten steht in C das Gemälde)
      }
      check(`geste2 ${name}: 0 % und 10 % ohne Lücke oben, Bild komplett Bier`, anteile[0].oben >= 0.95 && anteile[0].gesamt >= 0.9 && anteile[10].oben >= 0.95 && anteile[10].gesamt >= 0.8,
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
      const n0 = (await log(b2)).length;
      await gesture(b2, 1);
      check(`geste2 ${name}: Geste 2 führt nach C`, await waitZustand(b2, 'C', 12000) && await idle(b2, 12000));
      let ev = (await log(b2)).slice(n0).filter((e) => e.art === 'start' || e.art === 'ende');
      const dauer = ev.find((e) => e.art === 'ende').t - ev.find((e) => e.art === 'start').t;
      check(`geste2 ${name}: Dauer zwischen 2,5 und 3 s (${dauer} ms)`, dauer >= 2500 && dauer <= 3000);
      const S = (await samples(b2)).filter((x) => x.P > 1 && x.P < 2 && x.z !== 'C');
      let rueck = 0, maxStep = 0;
      for (let i = 1; i < S.length; i++) { const d = S[i].level - S[i - 1].level; if (d < -0.5) rueck++; maxStep = Math.max(maxStep, d); }
      check(`geste2 ${name}: Pegel sinkt gleichmäßig (kein Zurück, größter Schritt ${maxStep.toFixed(1)} px, Start ${vorher} px)`, S.length > 20 && rueck === 0 && maxStep < view.h * 0.06, `${S.length} Messpunkte`);
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
      check(`titel ${name}: Einleitung wortgetreu, Zeilenbreite begrenzt (Handy ≈ 38, sonst ≈ 60 Zeichen)`, l.text === 'Hoch oben über dem bayerischen Oberland, wo die Uhren ein wenig langsamer ticken, liegt der historische Berghof von Agatharied. Ein geschichtsträchtiges Haus, das seit Generationen als Ort der Zuflucht, der Gemeinschaft und der echten Auszeit bekannt ist. Genau dieses Gefühl haben wir in unserem Berghof Hell.'.length && zeichen <= (view.w < 768 ? 46 : 74), `${zeichen} Zeichen`);
      const lay = JSON.parse(await b.js(`JSON.stringify((() => { const R = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; }; const i = document.querySelector('.painting img');
        return { lead: R(document.querySelector('.hero__lead')), bild: R(document.querySelector('.painting')), img: { ok: i.complete && i.naturalWidth > 0, alt: i.alt.length > 30 }, vw: innerWidth, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }; })())`));
      const breit = view.w >= 768;
      check(`titel ${name}: Gemälde ${breit ? 'neben' : 'unter'} dem Text (${breit ? 'zwei Spalten' : 'untereinander'}), geladen, mit Beschreibung, kein horizontaler Scroll`,
        lay.img.ok && lay.img.alt && lay.sw === lay.cw && (breit ? (lay.bild.l >= lay.lead.r + 16 && lay.bild.t < lay.lead.b && lay.bild.b > lay.lead.t) : (lay.bild.t >= lay.lead.b + 8 && lay.bild.r <= lay.vw)), JSON.stringify({ lead: [lay.lead.l, lay.lead.r, lay.lead.t, lay.lead.b].map(Math.round), bild: [lay.bild.l, lay.bild.r, lay.bild.t, lay.bild.b].map(Math.round) }));
      // Flüssigkeit: Titelposition während Geste 2
      const S = (await samples(b)).slice(n0).filter((x) => x.P > 1 && x.P < 2 && x.z !== 'C');
      let auf = 0, maxStep = 0, dy = 0;
      for (let i = 1; i < S.length; i++) { const d = S[i].textY - S[i - 1].textY; if (d > 0.6) auf++; maxStep = Math.max(maxStep, -d); }
      dy = S.length ? S[0].textY : 0;
      const ende = await state(b);
      const letzter = S.length ? S.at(-1).textY : 0;
      check(`titel ${name}: Titel gleitet von unten (${Math.round(sB.textY)} px) nach oben, nie zurück, größter Schritt ${maxStep.toFixed(1)} px`, S.length > 20 && auf === 0 && dy > 0 && maxStep < r.vh * 0.06, `${S.length} Messpunkte, Start ${dy}`);
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

// Mini-Herde: einzeln freigestellte Schafe als kleines Zierelement über dem Titel (Handy 5, sonst 7), fliegt mit dem Titel nach oben, kein Text überdeckt
async function herde() {
  for (const [name, view] of Object.entries(GERAETE)) {
    const b = await browser({ view });
    try {
      await start(b, view);
      const A = JSON.parse(await b.js(`JSON.stringify({ op: +getComputedStyle(document.querySelector('.flock')).opacity })`));
      await gesture(b, 1); await waitZustand(b, 'B'); await idle(b); await sleep(1200);
      const Bz = JSON.parse(await b.js(`JSON.stringify((() => { const t = document.querySelector('.hero__title').getBoundingClientRect(), f = document.querySelector('.flock').getBoundingClientRect(); return { op: +getComputedStyle(document.querySelector('.flock')).opacity, d: Math.round(t.top - f.top) }; })())`));
      await gesture(b, 1); await waitZustand(b, 'C', 12000); await idle(b, 12000); await sleep(1200);
      const info = JSON.parse(await b.js(`JSON.stringify((() => {
        const R = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; };
        const G = (sel) => { const rg = document.createRange(); rg.selectNodeContents(document.querySelector(sel)); return R(rg); };
        const all = [...document.querySelectorAll('.flock .sheep')], sheep = all.filter((e) => getComputedStyle(e).display !== 'none'), M = 16;
        const brand = R(document.querySelector('.site-header__brand span')), titel = R(document.querySelector('.hero__title')), fl = R(document.querySelector('.flock'));   // Titelzeile (Elementbox), nicht die Glyphenbox
        const hoch = sheep.map((e) => e.getBoundingClientRect().height);
        return { n: sheep.length, alle: all.length, hMax: Math.max(...hoch), hMin: Math.min(...hoch), ueber: fl.b <= titel.t + 2, kopf: fl.t >= brand.b + 8, mitte: Math.abs((fl.l + fl.r) / 2 - innerWidth / 2) < 4, d: Math.round(titel.t - fl.t),
          geladen: sheep.every((e) => e.complete && e.naturalWidth > 0), attr: all.every((e) => e.getAttribute('alt') === '' && e.width > 0 && e.height > 0 && e.getAttribute('srcset')), gruppe: document.querySelector('.flock').getAttribute('role') === 'img' && document.querySelector('.flock').getAttribute('aria-label').length > 20,
          anim: sheep.map((e) => getComputedStyle(e).animationName).filter((x) => x !== 'none').length, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
          farben: { weiss: sheep.filter((e) => /lamm|hell|grast/.test(e.src)).length, braun: sheep.filter((e) => /braun|kalb|gefleckt/.test(e.src)).length } }; })())`));
      const soll = view.w < 768 ? 5 : 7;
      check(`herde ${name}: ${info.n} Schafe als Mini-Element (Soll ${soll}), weiß und braun gemischt (${info.farben.weiss} / ${info.farben.braun}), höchstens ${Math.round(info.hMax)} px hoch`, info.n === soll && info.farben.weiss >= 2 && info.farben.braun >= 2 && info.hMax <= 50 && info.hMin >= 12, JSON.stringify(info.farben));
      check(`herde ${name}: sitzen mittig über dem Titel, unter der Kopfzeile, kein Schaf überdeckt Text, kein horizontaler Scroll`, info.ueber && info.kopf && info.mitte && info.sw === info.cw, JSON.stringify({ ueber: info.ueber, kopf: info.kopf, mitte: info.mitte }));
      check(`herde ${name}: nicht in A sichtbar (Deckkraft ${A.op}), in B sichtbar (${Bz.op}), fliegen mit dem Titel (Abstand zum Titel in B ${Bz.d} px, in C ${info.d} px)`, A.op === 0 && Bz.op === 1 && Math.abs(Bz.d - info.d) <= 1);
      check(`herde ${name}: dieselbe Bewegung wie der Text, kein eigenes Einblenden („sonst ist es zu viel“)`, info.anim === 0);
      check(`herde ${name}: WebP mit srcset, feste Maße, alt="" je Schaf, Gruppen-Beschreibung`, info.geladen && info.attr && info.gruppe && info.alle === 7);
      check(`herde ${name}: keine externen Anfragen, keine Fehler, CLS 0`, b.external.length === 0 && b.errors.length === 0 && (await b.js('window.__cls')) === 0, b.external[0] || b.errors[0] || '');
    } finally { b.close(); }
  }
  // „Bewegung reduzieren“ und Neuladen in C: Mini-Herde und Gemälde sofort da
  for (const reduced of [true, false]) {
    const view = GERAETE['desktop-1440'];
    const b = await browser({ view, reducedMotion: reduced });
    try {
      await setView(b, view);
      if (!reduced) { await b.send('Page.navigate', { url: BASE }); await waitReady(b); await b.js('window.__sequenz.skip()'); await sleep(600); await b.js('window.scrollTo(0, 700)'); await sleep(400); await b.send('Page.reload'); }
      else await b.send('Page.navigate', { url: BASE });
      await sleep(3500);
      if (!reduced) await b.js('window.scrollTo(0, 0)');
      const r = JSON.parse(await b.js(`JSON.stringify({ n: [...document.querySelectorAll('.flock .sheep')].filter((e) => { const c = getComputedStyle(e); return c.display !== 'none' && c.visibility === 'visible' && e.complete && e.naturalWidth > 0; }).length, op: +getComputedStyle(document.querySelector('.flock')).opacity, bild: (() => { const i = document.querySelector('.painting img'); return i.complete && i.naturalWidth > 0; })() })`));
      check(`herde ${reduced ? 'Bewegung reduzieren' : 'Neuladen in C'}: alle 7 Schafe und das Gemälde sofort sichtbar`, r.n === 7 && r.bild && r.op === 1, JSON.stringify(r));
    } finally { b.close(); }
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

// „Intro nochmal ansehen“ im Fuß: scrollt nach oben und spielt A → B → C erneut ab, danach wieder einmalig
async function replay() {
  for (const name of ['desktop-1440', 'iphone15']) {
    const view = GERAETE[name];
    const b = await browser({ view });
    try {
      await nachC(b, view);
      await b.js('window.scrollTo(0, document.documentElement.scrollHeight)'); await sleep(600);
      const link = JSON.parse(await b.js(`JSON.stringify((() => { const a = document.querySelector('[data-intro]'), r = a.getBoundingClientRect(), c = getComputedStyle(a); return { text: a.textContent.trim(), up: c.textTransform, fs: parseFloat(c.fontSize), color: c.color, h: r.height, x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2, sichtbar: r.top >= 0 && r.bottom <= innerHeight }; })())`));
      check(`replay ${name}: Link „${link.text}“ im Fuß: kleine Versalien (${link.fs} px), dunkelgrün, Tippfläche ≥ 44 px`, /Intro nochmal ansehen/i.test(link.text) && link.up === 'uppercase' && link.fs <= 13 && link.color === 'rgb(31, 77, 43)' && link.h >= 44 && link.sichtbar, JSON.stringify(link));
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
    await start(b, 'desktop');
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

const RUNS = [['gesten', gesten], ['flick', flickTest], ['sperre', sperre], ['hinundher', hinundher], ['laden', laden], ['kalt', kalt], ['uebergang', uebergang],
  ['zustandB', zustandB], ['geste2', geste2], ['titel', titel], ['herde', herde], ['pfeil', pfeil], ['timeline', timeline], ['einmalig', einmalig], ['replay', replay], ['neuladen', neuladen], ['drehen', drehen], ['tasten', tasten], ['skip', skip], ['reduziert', reduziert], ['extern', extern]];
for (const [name, fn] of RUNS) {
  if (!run(name)) continue;
  console.log(`\n── ${name}`);
  try { await fn(); } catch (e) { check(`${name}: ohne Absturz`, false, e.stack?.split('\n').slice(0, 3).join(' | ')); }
}
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed} von ${results.length} Prüfungen bestanden${failed ? `, ${failed} FEHLER` : ' ✓'}`);
process.exit(failed ? 1 : 0);
