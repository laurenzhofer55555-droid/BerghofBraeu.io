// Winterausgabe „Volle Stube“ (nur in der Saison, js/winter-zeit.js): Tannenzweige mit Christbaumkugeln in den oberen Ecken, Schneefall, im Abschnitt „Der Berghof“
// das Spachtel-Gemälde (statt der Zeichnung des Berghofs).
// (Die Berghof-Zeichnung als Nachtbild mit leuchtenden Fenstern steht jetzt auf Impressum und Datenschutz: css/nacht.css, ohne Skript.)
// Aufgebaut wird im Leerlauf, noch während das Bier auf die Geste wartet; sichtbar wird es, sobald das Bier ausgelaufen ist (Klasse w-bier-weg, bierWegMelden):
// dann fahren die Äste ein und der Schnee beginnt zu fallen, während Titel und Gemälde noch einfliegen. Die Sequenz (js/sequenz.js) bleibt unangetastet (nur lesend).
// Im Fuß gibt es einen Schalter „Winterschmuck ausblenden“. Die Kugeln hängen still und schwingen nur, wenn Zeiger oder Finger sie berühren.
// Bei „Bewegung reduzieren“ steht alles still (kein Schnee, kein Schwingen, kein Funkeln).
import { schneeStart } from './winter-schnee.js?v=fc069a9e';
import { gipfel } from './winter-gipfel.js?v=fc069a9e';

const root = document.documentElement;
const stillstand = matchMedia('(prefers-reduced-motion: reduce)').matches;
const el = (tag, klasse, html) => { const e = document.createElement(tag); if (klasse) e.className = klasse; if (html) e.innerHTML = html; return e; };

// ── Zufall mit festem Startwert: der Zweig sieht bei jedem Besuch gleich aus ──
function zufall(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Tannenzweig: Stamm als Kurve von der Ecke, Nadeln als kurze Striche in drei Grüntönen (je Farbe ein Pfad), goldene Lichter ──
const NADELN = {
  hell: ['#173b21', '#1F4D2B', '#2f6b40', '#3f8052'],       // auf Creme
  nacht: ['#1F4D2B', '#2f6b40', '#4a8a5c', '#6aa57a'],      // auf dunklem Tannengrün (Nachtbild)
  dunkel: ['#3A7F50', '#4F9462', '#6DB07E', '#8FC99C'],     // auf dem grünen Seitengrund der dunklen Ausgabe: heller als der Grund, sonst verschwinden die Nadeln
};
function zweig(breite, farben, seed) {
  const r = zufall(seed);
  const W = breite, H = breite * .5;
  const lang = Math.max(14, Math.min(34, W * .085));
  const p = [[-8, 4], [W * .32, -4], [W * .68, H * .1], [W, H * .6]];
  const punkt = (t) => {
    const u = 1 - t;
    return [0, 1].map((k) => u * u * u * p[0][k] + 3 * u * u * t * p[1][k] + 3 * u * t * t * p[2][k] + t * t * t * p[3][k]);
  };
  const richtung = (t) => {
    const u = 1 - t;
    const d = [0, 1].map((k) => 3 * u * u * (p[1][k] - p[0][k]) + 6 * u * t * (p[2][k] - p[1][k]) + 3 * t * t * (p[3][k] - p[2][k]));
    return Math.atan2(d[1], d[0]);
  };
  const N = 64;
  const pfade = [[], [], [], []];
  const breiten = [2.9, 2.4, 1.9, 1.5];
  for (let ebene = 0; ebene < 4; ebene++) {
    for (let i = 0; i <= N; i++) {
      const t = i / N, [x, y] = punkt(t), a = richtung(t);
      for (const seite of [-1, 1]) {
        const winkel = a + seite * (ebene === 3 ? .25 + r() * .35 : .6 + r() * .7) + (r() - .5) * .3;
        let dx = Math.cos(winkel), dy = Math.sin(winkel) + .38;        // die Schwerkraft zieht die Nadeln nach unten
        const n = Math.hypot(dx, dy); dx /= n; dy /= n;
        const l = lang * (1 - t * .6) * (.55 + r() * .7) * (ebene === 3 ? .75 : 1 - ebene * .08);
        pfade[ebene].push(`M${x.toFixed(1)} ${y.toFixed(1)}l${(dx * l).toFixed(1)} ${(dy * l).toFixed(1)}`);
      }
    }
    const [ex, ey] = punkt(1);                                           // Spitze: kleiner Fächer
    for (let k = -2; k <= 2; k++) {
      const winkel = richtung(1) + k * .38;
      pfade[ebene].push(`M${ex.toFixed(1)} ${ey.toFixed(1)}l${(Math.cos(winkel) * lang * .5).toFixed(1)} ${(Math.sin(winkel) * lang * .5 + 2).toFixed(1)}`);
    }
  }
  let lichter = '';
  for (let k = 0; k < 5; k++) {
    const [x, y] = punkt(.14 + k * .17);
    lichter += `<g class="w-licht" style="--d:${(r() * 2.6).toFixed(2)}s"><circle cx="${x.toFixed(1)}" cy="${(y + 5).toFixed(1)}" r="8" fill="url(#w-halo)"/><circle cx="${x.toFixed(1)}" cy="${(y + 5).toFixed(1)}" r="2.3" fill="#F5DE96"/></g>`;
  }
  const pad = Math.ceil(lang + 6);
  const hoehe = Math.ceil(H + lang * 1.5 + 12);
  const stamm = Array.from({ length: 21 }, (_, i) => punkt(i / 20).map((v) => v.toFixed(1)).join(' ')).join('L');
  const svg = `<svg class="w-zweig" viewBox="${-pad} ${-pad} ${W + 2 * pad} ${hoehe + pad}" width="${W + 2 * pad}" height="${hoehe + pad}" style="--pad:${pad}px" focusable="false" aria-hidden="true">`
    + `<path d="M${stamm}" fill="none" stroke="#0f2a18" stroke-width="3.4" stroke-linecap="round"/>`
    + pfade.map((d, i) => `<path d="${d.join('')}" fill="none" stroke="${farben[i]}" stroke-width="${breiten[i]}" stroke-linecap="round"/>`).join('')
    + lichter + '</svg>';
  return { svg, punkt, pad };
}

// ── Christbaumkugel: Glas mit Fensterspiegelung, Goldkappe, Aufhänger. Farbverläufe stehen einmal im Dokument (defs) ──
const GLAS = {
  gruen: ['#6aa57a', '#2a6a3d', '#1F4D2B', '#0b2415'],
  gold: ['#f7e6ae', '#dcbc66', '#C5A149', '#7a5c1c'],
  creme: ['#ffffff', '#F7F4EC', '#ddd5bf', '#b3a47c'],
  nacht: ['#3f7c55', '#1d4a2c', '#12301c', '#06150b'],
  blau: ['#ecf6f9', '#a9d0de', '#7FB2C6', '#3d7388'],        // hellblau wie der Rahmen und das Etikett
  blau2: ['#b9d9e5', '#6fa3b8', '#3F7A90', '#1d4558'],
};
function defs() {
  const kugel = Object.entries(GLAS).map(([name, c]) =>
    `<radialGradient id="w-g-${name}" cx=".36" cy=".3" r=".85"><stop offset="0" stop-color="${c[0]}"/><stop offset=".32" stop-color="${c[1]}"/><stop offset=".72" stop-color="${c[2]}"/><stop offset="1" stop-color="${c[3]}"/></radialGradient>`).join('');
  return `<svg class="w-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs>${kugel}
    <radialGradient id="w-rim" cx=".7" cy=".86" r=".42"><stop offset="0" stop-color="#ffe7a3" stop-opacity=".6"/><stop offset="1" stop-color="#ffe7a3" stop-opacity="0"/></radialGradient>
    <radialGradient id="w-halo"><stop offset="0" stop-color="#F5DE96" stop-opacity=".95"/><stop offset=".4" stop-color="#E3BE5E" stop-opacity=".35"/><stop offset="1" stop-color="#C5A149" stop-opacity="0"/></radialGradient>
    <linearGradient id="w-kappe" x1="0" x2="1"><stop offset="0" stop-color="#8a6a22"/><stop offset=".3" stop-color="#E8CE86"/><stop offset=".55" stop-color="#B8913A"/><stop offset="1" stop-color="#6e5219"/></linearGradient>
    <radialGradient id="w-glanz"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    <clipPath id="w-clip"><circle cx="50" cy="86" r="39.5"/></clipPath></defs></svg>`;
}
const SCHMUCK = {
  blau: null,
  blau2: null,
  creme: `<g clip-path="url(#w-clip)" fill="none" stroke="#B8913A" stroke-width="1.5"><path d="M8 76Q50 98 92 76"/><path d="M8 87Q50 109 92 87"/>
    <g fill="#B8913A" stroke="none"><path d="M50 87.5l4 5-4 5-4-5z"/><path d="M30 84.7l3.4 4.2-3.4 4.2-3.4-4.2z"/><path d="M70 84.7l3.4 4.2-3.4 4.2-3.4-4.2z"/><path d="M17 80.4l2.8 3.5-2.8 3.5-2.8-3.5z"/><path d="M83 80.4l2.8 3.5-2.8 3.5-2.8-3.5z"/></g></g>`,
  nacht: `<g fill="#E8CE86"><path d="M52 66l3.4 13.6 13.6 3.4-13.6 3.4L52 100l-3.4-13.6L35 83l13.6-3.4z"/></g><g fill="#C5A149"><circle cx="30" cy="104" r="1.3"/><circle cx="72" cy="102" r="1.3"/><circle cx="76" cy="70" r="1.1"/></g>`,
  gruen: `<g clip-path="url(#w-clip)" fill="#F7F4EC">${Array.from({ length: 13 }, (_, i) => { const x = 14 + i * 6, y = 80 + 17 * Math.sin((i / 12) * Math.PI); return `<circle cx="${x}" cy="${y.toFixed(1)}" r="1.5"/>`; }).join('')}</g>`,
  gold: `<g fill="none" stroke="#fff3c4" stroke-opacity=".28" stroke-width="1"><path d="M50 46Q18 86 50 126"/><path d="M50 46Q82 86 50 126"/></g>`,
};
SCHMUCK.blau = SCHMUCK.gruen;     // Perlenkette
SCHMUCK.blau2 = SCHMUCK.nacht;    // goldener Stern
function kugelSvg(finish) {
  return `<svg class="w-kugel__svg" viewBox="0 20 100 112" focusable="false" aria-hidden="true">`
    + `<circle cx="50" cy="27" r="6.5" fill="none" stroke="#B8913A" stroke-width="2"/>`
    + `<circle cx="50" cy="86" r="40" fill="url(#w-g-${finish})"/>`
    + SCHMUCK[finish]
    + `<circle cx="50" cy="86" r="40" fill="url(#w-rim)"/>`
    + `<g clip-path="url(#w-clip)"><ellipse cx="38" cy="68" rx="19" ry="17" fill="url(#w-glanz)"/>`          // Spiegelung eines Fensters mit vier Scheiben
    + `<g fill="#fff" fill-opacity=".88" transform="rotate(-16 40 68)"><rect x="28.5" y="58" width="9" height="9.4" rx="1.4"/><rect x="39.5" y="58" width="9" height="9.4" rx="1.4"/><rect x="28.5" y="69.2" width="9" height="9.4" rx="1.4"/><rect x="39.5" y="69.2" width="9" height="9.4" rx="1.4"/></g></g>`
    + `<path d="M17 80A34 34 0 0 1 36 54" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width="1.6" stroke-linecap="round"/>`
    + `<rect x="38.5" y="34" width="23" height="15" rx="2.6" fill="url(#w-kappe)"/><path d="M41.5 38.5h17M41.5 42h17M41.5 45.5h17" stroke="#5b4313" stroke-opacity=".38" stroke-width=".8"/>`
    + `</svg>`;
}

// ── Pendel: jede Kugel hängt still und schwingt nur, wenn Zeiger oder Finger sie anstoßen (Winkel θ, Dämpfung); danach kommt sie zur Ruhe ──
const kugeln = new Set();
let lauf = 0, zuletzt = 0, ruheBis = 0;      // ruheBis: kurz nach dem Einblenden schwingt nichts, auch wenn der Mauszeiger zufällig dort steht
function kugel(eltern, { x, y, s, L, f, i = 0 }) {
  const wurzel = el('div', 'w-kugel');
  wurzel.style.cssText = `left:${x.toFixed(1)}px;top:${y.toFixed(1)}px;--s:${s}px;--i:${i}`;
  wurzel.innerHTML = `<div class="w-kugel__in"><i class="w-faden" style="height:${L}px"></i>${kugelSvg(f)}</div>`;
  eltern.appendChild(wurzel);
  const k = { wurzel, th: 0, om: 0, w: 2.1 * Math.sqrt(120 / (L + s * .5)), sichtbar: true, io: null };
  if (!stillstand) {
    wurzel.addEventListener('pointerenter', (e) => { if (performance.now() >= ruheBis) stossen(k, e, .5); });
    // Osterei: sechs Klicks oder Tipps hintereinander (jeweils höchstens 2 s Pause): die Kugel dreht sich zweimal um ihren Faden und hüpft dabei
    let klicks = 0, letzter = 0;
    wurzel.addEventListener('pointerdown', (e) => {
      const jetzt = performance.now();
      klicks = jetzt - letzter < 2000 ? klicks + 1 : 1; letzter = jetzt;
      if (klicks >= 6) { klicks = 0; flip(k); return; }
      stossen(k, e, .85);
    });
    k.io = new IntersectionObserver(([e]) => { k.sichtbar = e.isIntersecting; });
    k.io.observe(wurzel);
    kugeln.add(k);
  }
  return k;
}
function flip(k) {
  const sv = k.wurzel.querySelector('.w-kugel__svg');
  if (k.wurzel.classList.contains('w-flip')) return;
  k.wurzel.classList.add('w-flip');
  sv.addEventListener('animationend', () => { k.wurzel.classList.remove('w-flip'); k.om += (Math.random() < .5 ? 1 : -1) * .5; anstossen(); }, { once: true });     // nach der Landung wippt sie kurz nach
}
function stossen(k, e, kraft) {
  const r = k.wurzel.getBoundingClientRect();
  const seite = e.clientX < r.left + r.width / 2 ? 1 : -1;               // von links angestoßen → schwingt nach rechts
  k.om += seite * kraft * (.8 + Math.random() * .4);
  anstossen();
}
function anstossen() {
  if (lauf || stillstand) return;
  zuletzt = performance.now();
  lauf = requestAnimationFrame(schritt);
}
function schritt(jetzt) {
  const dt = Math.min(.05, (jetzt - zuletzt) / 1000 || .016); zuletzt = jetzt;
  let aktiv = false;
  if (!document.hidden && !(root.classList.contains('seq') && !root.classList.contains('frei'))) {
    for (const k of kugeln) {
      if (!k.th && !k.om) continue;
      k.om += (-k.w * k.w * Math.sin(k.th) - 2 * .38 * k.w * k.om) * dt;
      k.th += k.om * dt;
      if (Math.abs(k.th) < .002 && Math.abs(k.om) < .01) { k.th = k.om = 0; k.wurzel.style.transform = ''; continue; }   // ausgependelt: wieder ganz ruhig
      k.wurzel.style.transform = `rotate(${(k.th * 57.2958).toFixed(2)}deg)`;
      aktiv = true;
    }
  } else aktiv = [...kugeln].some((k) => k.th || k.om);
  lauf = aktiv ? requestAnimationFrame(schritt) : 0;
}
function pendelnEntfernen(eltern) {
  for (const k of [...kugeln]) if (eltern.contains(k.wurzel)) { k.io?.disconnect(); kugeln.delete(k); }
}

// ── Zweig mit Kugeln in beide Ecken eines Containers (Start-Bereich und Nachtbild) ──
const PLAN = {
  breit: {
    l: [{ t: .3, L: 52, s: 46, f: 'gold' }, { t: .58, L: 118, s: 64, f: 'blau' }, { t: .86, L: 58, s: 48, f: 'creme' }],
    r: [{ t: .27, L: 68, s: 50, f: 'creme' }, { t: .56, L: 132, s: 60, f: 'blau2' }, { t: .84, L: 54, s: 44, f: 'gold' }],
  },
  // schmale Bilder (Handy, Tablet): der Titel steht dicht unter den Zweigen, die Kugeln hängen ganz außen und kurz
  schmal: {
    l: [{ t: .24, L: 10, s: 26, f: 'gold' }, { t: .52, L: 4, s: 24, f: 'blau' }],       // kurze Fäden: der breite Titel (Oswald, Versalien) beginnt gleich darunter
    r: [{ t: .24, L: 8, s: 25, f: 'creme' }, { t: .52, L: 4, s: 23, f: 'blau2' }],
  },
};
function ecken(behaelter, farben, anteil) {
  const W = behaelter.clientWidth || innerWidth;
  const klein = W < 1000;
  const bw = Math.round(klein ? Math.min(W * (W < 768 ? .36 : .2), 170) : Math.min(W * anteil, 400));
  const plan = klein ? PLAN.schmal : PLAN.breit;
  const mass = klein ? 1 : Math.max(.9, Math.min(1.3, W / 1280));
  let i = 0;
  for (const seite of ['l', 'r']) {
    const z = zweig(bw, farben, seite === 'l' ? 7 : 19);
    const kasten = el('div', 'w-ast w-ast--' + seite, z.svg);
    behaelter.appendChild(kasten);
    for (const k of plan[seite]) {
      const [px, py] = z.punkt(k.t);
      kugel(behaelter, { x: seite === 'l' ? px : W - px, y: py + 3, s: Math.round(k.s * mass), L: Math.round(k.L * mass), f: k.f, i: i++ });
    }
  }
}

// ── Aufbau, Abbau, Schalter ──
let aktiv = null;
// Meldet „Bier weg“ als Klasse w-bier-weg an <html>, sobald das Bier ausgelaufen ist (nicht erst am Ende der ganzen Sequenz): ab dann kommen die Äste
// und der Schnee, während Titel und Gemälde noch einfliegen. Bei jedem neuen Lauf (Bier erneut anzeigen) wird sie zurückgenommen.
function bierWegMelden() {
  let rAF = 0;
  const pruefen = () => {
    rAF = 0;
    if (!(root.classList.contains('seq') && !root.classList.contains('frei')) || root.classList.contains('w-bier-weg')) return;
    const q = window.__sequenz;
    if (q && q.phasen && (q.P - 1) * q.phasen.T2 >= q.phasen.DRAIN * .95) { root.classList.add('w-bier-weg'); ruheBis = performance.now() + 1500; return; }
    rAF = requestAnimationFrame(pruefen);
  };
  const lauf = () => {
    const warten = root.classList.contains('seq') && !root.classList.contains('frei');
    if (warten && !rAF && !root.classList.contains('w-bier-weg')) rAF = requestAnimationFrame(pruefen);
    if (!warten && root.classList.contains('w-bier-weg')) root.classList.remove('w-bier-weg');       // nur wenn sie da ist: auch ein wirkungsloses remove() zählt als Änderung und löste den Beobachter endlos neu aus
  };
  const mo = new MutationObserver(lauf);
  mo.observe(root, { attributes: true, attributeFilter: ['class'] });
  lauf();
  return () => { mo.disconnect(); cancelAnimationFrame(rAF); root.classList.remove('w-bier-weg'); };
}
function einschalten() {
  let abgebrochen = false, stopSchnee = () => {}, zeichnung = null, schluss = null, deko = null, gruppeBreite = 0, timer = 0, ende = () => {}, leerlauf = 0, wacht = () => {};
  const los = () => {
    if (abgebrochen) return;
    root.classList.add('winter');
    document.body.appendChild(el('div', 'w-defs-halter', defs()));
    stopSchnee = schneeStart();
    const hero = document.getElementById('start');
    if (hero) { deko = el('div', 'w-deko'); deko.setAttribute('aria-hidden', 'true'); hero.appendChild(deko); }
    const bild = document.querySelector('#berghof .berghof__drawing');                    // das Gemälde steht, wo sonst die Zeichnung des Berghofs steht
    if (bild) { zeichnung = { bild, marke: document.createComment('winter') }; bild.replaceWith(zeichnung.marke); }
    schluss = gipfel(zeichnung ? zeichnung.marke : document.querySelector('#berghof .section__inner > :last-child'));
    const bauen = () => {
      if (deko) { pendelnEntfernen(deko); deko.textContent = ''; ecken(deko, NADELN.dunkel, .22); }
      gruppeBreite = innerWidth;
    };
    bauen();
    const umbruch = () => {
      clearTimeout(timer);
      timer = setTimeout(() => { if (Math.abs(innerWidth - gruppeBreite) > 40) bauen(); }, 250);
    };
    addEventListener('resize', umbruch);
    ende = () => removeEventListener('resize', umbruch);
  };
  // im Leerlauf aufbauen (das Bier wartet auf die Geste): die Teile sind per CSS verborgen, bis das Bier weg ist; so ruckelt nichts beim Auslaufen
  wacht = bierWegMelden();
  leerlauf = window.requestIdleCallback ? requestIdleCallback(los, { timeout: 1500 }) : setTimeout(los, 500);
  return () => {
    abgebrochen = true; wacht();
    if (window.cancelIdleCallback) cancelIdleCallback(leerlauf); else clearTimeout(leerlauf);
    clearTimeout(timer); ende(); stopSchnee();
    if (deko) { pendelnEntfernen(deko); deko.remove(); }
    schluss?.();
    if (zeichnung) zeichnung.marke.replaceWith(zeichnung.bild);
    document.querySelector('.w-defs-halter')?.remove();
    root.classList.remove('winter');
  };
}

function schalter() {
  const fuss = document.querySelector('.site-footer__intro');
  if (!fuss) return;
  const a = el('a', 'w-schalter'); a.href = '#'; a.setAttribute('role', 'button');
  const text = () => { a.textContent = aktiv ? 'Winterschmuck ausblenden' : 'Winterschmuck einblenden'; };
  a.addEventListener('click', (e) => {
    e.preventDefault();
    if (aktiv) { aktiv(); aktiv = null; try { localStorage.setItem('berghof-winter', 'aus'); } catch (err) { /* nur diese Sitzung */ } }
    else { aktiv = einschalten(); try { localStorage.removeItem('berghof-winter'); } catch (err) { /* nur diese Sitzung */ } }
    text();
  });
  text();
  const zeile = el('p', 'site-footer__intro w-schalter-zeile'); zeile.appendChild(a);
  fuss.after(zeile);
}

export function start({ an }) {
  const css = el('link'); css.rel = 'stylesheet'; css.href = new URL('../css/winter.css?v=fc069a9e', import.meta.url).href;
  const fertig = new Promise((res) => { css.onload = css.onerror = res; setTimeout(res, 3000); });
  document.head.appendChild(css);
  fertig.then(() => {
    if (an) aktiv = einschalten();
    schalter();
  });
}
