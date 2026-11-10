// Winterausgabe „Volle Stube“ (nur in der Saison, js/winter-zeit.js): Christbaumkugeln, die in den oberen Ecken von der Oberkante hängen (keine Äste), Schneefall, im Abschnitt „Der Berghof“
// das Spachtel-Gemälde (statt der Zeichnung des Berghofs).
// (Die Berghof-Zeichnung als Nachtbild mit leuchtenden Fenstern steht jetzt auf Impressum und Datenschutz: css/nacht.css, ohne Skript.)
// Aufgebaut wird im Leerlauf, noch während das Bier auf die Geste wartet; sichtbar wird es, sobald das Bier ausgelaufen ist (Klasse w-bier-weg, bierWegMelden):
// dann senken sich die Kugeln und der Schnee beginnt zu fallen, während Titel und Gemälde noch einfliegen. Die Sequenz (js/sequenz.js) bleibt unangetastet (nur lesend).
// Im Fuß gibt es einen Schalter „Winterschmuck ausblenden“. Die Kugeln hängen still und schwingen nur, wenn Zeiger oder Finger sie berühren.
// Bei „Bewegung reduzieren“ steht alles still (kein Schnee, kein Schwingen, kein Funkeln).
import { schneeStart } from './winter-schnee.js?v=4be74cf6';
import { gipfel } from './winter-gipfel.js?v=4be74cf6';

const root = document.documentElement;
const stillstand = matchMedia('(prefers-reduced-motion: reduce)').matches;
const el = (tag, klasse, html) => { const e = document.createElement(tag); if (klasse) e.className = klasse; if (html) e.innerHTML = html; return e; };

// ── Christbaumkugel: von Hand im Spachtelstil gemalt wie das Gemälde (dicke Farbstriche mit Lichtkante, Perlen, Flocke, Berge). Kleine WebP-Bilder in assets/img/kugel-*.webp,
//    erzeugt von tools/kugeln/ (node tools/kugeln/bauen.mjs); KUGEL_MASS = Bildgröße in Pixeln (mit gebackenem Schatten); Bezugsbreite 182 = Kugel samt Rand, daher Breite = s * w / 182 ──
const KUGEL_MASS = {'creme-flocke': [200, 243], 'eis-berge': [200, 245], 'eis-stern': [200, 242], 'gold-punkte': [198, 242], 'gold-wirbel': [200, 243], 'rot-streifen': [200, 243], 'tropfen-creme': [169, 285], 'tropfen-rot': [169, 284]};
function kugelSvg(name) {
  const [w, h] = KUGEL_MASS[name];
  const url = new URL(`../assets/img/kugel-${name}.webp`, import.meta.url).href;
  return `<img class="w-kugel__svg" src="${url}" width="${w}" height="${h}" style="width:calc(var(--s) * ${(w / 182).toFixed(3)})" alt="" decoding="async" draggable="false">`;
}

// ── Pendel: jede Kugel hängt still und schwingt nur, wenn Zeiger oder Finger sie anstoßen (Winkel θ, Dämpfung); danach kommt sie zur Ruhe ──
const kugeln = new Set();
let lauf = 0, zuletzt = 0, ruheBis = 0;      // ruheBis: kurz nach dem Einblenden schwingt nichts, auch wenn der Mauszeiger zufällig dort steht
function kugel(eltern, { x, y, s, L, f, i = 0, rechts = false }) {
  const wurzel = el('div', 'w-kugel' + (rechts ? ' w-kugel--r' : ''));
  wurzel.style.cssText = `${rechts ? 'right' : 'left'}:${x.toFixed(1)}px;top:${y.toFixed(1)}px;--s:${s}px;--i:${i}`;      // rechts: Abstand vom rechten Rand, damit Zweig und Kugeln auch bei anderer Breite zusammenbleiben
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

// ── Kugeln ohne Äste: sie hängen an ihren Fäden von der Oberkante, verteilt über die beiden oberen Ecken (t = Anteil der Eckenbreite, L = Fadenlänge, s = Breite der Kugel) ──
// Die Fäden sind verschieden lang und die Abstände unregelmäßig, damit es nicht wie eine Reihe aussieht; in der Mitte (Schild „Hofer Bräu“, Titel) bleibt es frei.
// Bewusst wenige und ruhige Farben: Gold, Weiß, Eisblau (wie der Rahmen), dazu ein tiefes Rot wie im Gemälde.
const PLAN = {
  breit: {
    l: [{ t: .07, L: 58, s: 58, f: 'gold-punkte' }, { t: .3, L: 150, s: 68, f: 'tropfen-rot' }, { t: .55, L: 64, s: 62, f: 'eis-berge' }, { t: .82, L: 122, s: 56, f: 'creme-flocke' }],
    r: [{ t: .07, L: 44, s: 56, f: 'eis-stern' }, { t: .3, L: 124, s: 66, f: 'rot-streifen' }, { t: .55, L: 66, s: 60, f: 'gold-wirbel' }, { t: .82, L: 154, s: 66, f: 'tropfen-creme' }],
  },
  // schmale Bilder (Handy, Tablet): der Titel steht dicht darunter, die Kugeln hängen ganz außen und kurz
  schmal: {
    l: [{ t: .12, L: 18, s: 30, f: 'gold-punkte' }, { t: .5, L: 42, s: 32, f: 'eis-berge' }, { t: .88, L: 10, s: 26, f: 'creme-flocke' }],
    r: [{ t: .12, L: 30, s: 30, f: 'rot-streifen' }, { t: .5, L: 8, s: 26, f: 'eis-stern' }, { t: .88, L: 36, s: 30, f: 'gold-wirbel' }],
  },
};
function ecken(behaelter, anteil) {
  const W = behaelter.clientWidth || innerWidth;
  const klein = W < 1000;
  // Handy: links und rechts vom Schild „Hofer Bräu“ bleibt nur etwa ein Drittel der Breite; die Kugeln hängen davor
  const marke = document.querySelector('.site-header__brand');
  const frei = (W - (marke ? marke.offsetWidth : 140)) / 2 - 8;
  const bw = Math.round(klein ? (W < 768 ? Math.max(70, Math.min(170, frei - 18)) : Math.min(W * .2, 170)) : Math.min(W * anteil, 400));
  const plan = klein ? PLAN.schmal : PLAN.breit;
  const mass = klein ? 1 : Math.max(.9, Math.min(1.3, W / 1280));
  let i = 0;
  for (const seite of ['l', 'r']) {
    for (const k of plan[seite]) {
      const s = Math.round(k.s * mass);
      kugel(behaelter, { x: Math.max(s / 2 + 8, k.t * bw), rechts: seite === 'r', y: 0, s, L: Math.round(k.L * mass), f: k.f, i: i++ });
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
    stopSchnee = schneeStart();
    const hero = document.getElementById('start');
    if (hero) { deko = el('div', 'w-deko'); deko.setAttribute('aria-hidden', 'true'); hero.appendChild(deko); }
    const bild = document.querySelector('#berghof .berghof__drawing');                    // das Gemälde steht, wo sonst die Zeichnung des Berghofs steht
    if (bild) { zeichnung = { bild, marke: document.createComment('winter') }; bild.replaceWith(zeichnung.marke); }
    schluss = gipfel(zeichnung ? zeichnung.marke : document.querySelector('#berghof .section__inner > :last-child'));
    const bauen = () => {
      if (deko) { pendelnEntfernen(deko); deko.textContent = ''; ecken(deko, .22); }
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
  const css = el('link'); css.rel = 'stylesheet'; css.href = new URL('../css/winter.css?v=4be74cf6', import.meta.url).href;
  const fertig = new Promise((res) => { css.onload = css.onerror = res; setTimeout(res, 3000); });
  document.head.appendChild(css);
  fertig.then(() => {
    if (an) aktiv = einschalten();
    schalter();
  });
}
