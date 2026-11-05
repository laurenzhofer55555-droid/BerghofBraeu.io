// Schafe der Winter-Szene, einzeln gezeichnet: Wolle aus vielen Büscheln (jedes mit eigenem Licht und Schatten), dunkles Gesicht mit Augen, Wangen und Lächeln,
// Mütze und Schal in bunten Farben. Seitenansicht nach rechts, Ursprung unter dem Körper (y = 0 ist der Boden, nach oben negativ).
// Posen: 'geht' (steigt auf, Beine schwingen mit phase), 'sitzt' (am Feuer, mit Kakaotasse), 'ski' (fährt ab, mit Skibrille).
// Die Verläufe stehen einmal im Dokument (schafDefs).
const BEIN = '#3b322d', HUF = '#241d1a', GESICHT = '#4d4039', SCHNAUZE = '#6d5b50', NASE = '#2a211e', OHR_INNEN = '#a47a70';
const BACKE = '#e0806f', LACHEN = '#f3e2cc', MUND_AUF = '#7b2a30', ZUNGE = '#d9737a';

export const FARBEN = { rot: '#C2452D', senf: '#E0A93A', gold: '#D1A445', tanne: '#2F6B40', creme: '#F6F1E4', blaugruen: '#5F8F9A', orange: '#E27B3A', rosa: '#CF6A88' };
// Kleidung: Mütze, ihre Farben, Schalfarben (gestreift)
export const OUTFITS = {
  bommel:  { hut: 'bommel', hf: [FARBEN.rot, FARBEN.creme], pom: FARBEN.senf, schal: [FARBEN.senf, FARBEN.tanne] },
  zipfel:  { hut: 'zipfel', hf: [FARBEN.blaugruen, FARBEN.creme], pom: FARBEN.creme, schal: [FARBEN.orange, FARBEN.creme] },
  klappen: { hut: 'klappen', hf: [FARBEN.tanne, FARBEN.rot], schal: [FARBEN.rot, FARBEN.creme] },
  gams:    { hut: 'gams', hf: [FARBEN.tanne, FARBEN.gold], schal: [FARBEN.rot, FARBEN.rot] },
  muff:    { hut: 'muff', hf: [FARBEN.rosa, FARBEN.creme], schal: [FARBEN.blaugruen, FARBEN.senf] },
  brille:  { hut: 'band', hf: [FARBEN.orange, FARBEN.creme], schal: [FARBEN.senf, FARBEN.rot] },
};

const kreise = (liste, f) => liste.map(([x, y, r]) => f(x, y, r)).join('');

export function schafDefs() {
  return `<filter id="w-farbe" x="-8%" y="-8%" width="116%" height="116%" color-interpolation-filters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency=".05 .12" numOctaves="3" seed="7" result="rauschen"/>
      <feDisplacementMap in="SourceGraphic" in2="rauschen" scale="2.6" xChannelSelector="R" yChannelSelector="G" result="verzogen"/>
      <feColorMatrix in="rauschen" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  .9 0 0 0 0" result="hoehe"/>
      <feDiffuseLighting in="hoehe" surfaceScale="2" diffuseConstant="1.15" lighting-color="#fff" result="licht"><feDistantLight azimuth="235" elevation="58"/></feDiffuseLighting>
      <feBlend in="verzogen" in2="licht" mode="multiply" result="gemalt"/>
      <feComposite in="gemalt" in2="verzogen" operator="in"/>
    </filter>
    <radialGradient id="w-boden"><stop offset="0" stop-color="#4b6772" stop-opacity=".5"/><stop offset=".6" stop-color="#6f8c96" stop-opacity=".22"/><stop offset="1" stop-color="#6f8c96" stop-opacity="0"/></radialGradient>
    <radialGradient id="w-klumpen" cx=".4" cy=".25" r=".9"><stop offset="0" stop-color="#ffffff"/><stop offset=".6" stop-color="#f1f3f1"/><stop offset="1" stop-color="#c7d3d7"/></radialGradient>
    <radialGradient id="w-wolle" cx=".38" cy=".3" r=".8"><stop offset="0" stop-color="#FFFDF7"/><stop offset=".55" stop-color="#F1EBDD"/><stop offset="1" stop-color="#D3CEC0"/></radialGradient>
    <radialGradient id="w-wolle-dunkel" cx=".38" cy=".3" r=".85"><stop offset="0" stop-color="#EDE6D6"/><stop offset=".6" stop-color="#CFC8B8"/><stop offset="1" stop-color="#9FA8A8"/></radialGradient>
    <radialGradient id="w-wolle-braun" cx=".38" cy=".3" r=".8"><stop offset="0" stop-color="#E7C9A0"/><stop offset=".55" stop-color="#C79A68"/><stop offset="1" stop-color="#8E6340"/></radialGradient>
    <radialGradient id="w-wolle-grau" cx=".38" cy=".3" r=".8"><stop offset="0" stop-color="#E4E4DF"/><stop offset=".55" stop-color="#BDBFBB"/><stop offset="1" stop-color="#868C8E"/></radialGradient>
    <linearGradient id="w-bein" x1="0" x2="1"><stop offset="0" stop-color="#4a3f38"/><stop offset="1" stop-color="#2a221e"/></linearGradient>
    <linearGradient id="w-glas" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#bfe3ea"/><stop offset=".5" stop-color="#5F8F9A"/><stop offset="1" stop-color="#2d5560"/></linearGradient>`;
}

// ── Wolle ──
const WOLLE = {
  geht: [[-20, -38, 15], [-4, -37, 17], [12, -37, 17], [26, -36, 13], [-24, -48, 10], [-12, -54, 11], [1, -56, 12], [14, -54, 11], [25, -48, 10],
    [-22, -27, 9], [-9, -24, 9], [5, -24, 9], [18, -26, 9], [-31, -38, 10], [32, -39, 10]],
  sitzt: [[-12, -25, 17], [4, -27, 19], [19, -31, 15], [-20, -37, 11], [-8, -45, 12], [7, -47, 12], [20, -43, 11],
    [-16, -13, 10], [-1, -9, 10], [13, -13, 10], [-25, -24, 11], [27, -31, 10]],
};
WOLLE.ski = WOLLE.geht;
// kleine Locken: Bögen in jedem Büschel, geben der Wolle Struktur
function locken(liste) {
  return liste.map(([x, y, r], i) => {
    const w = r * .55, a = (i * 47) % 360;
    return `<path d="M${(x - w).toFixed(1)} ${(y + w * .2).toFixed(1)}a${w.toFixed(1)} ${(w * .9).toFixed(1)} 0 1 1 ${(w * 1.7).toFixed(1)} ${(w * .5).toFixed(1)}" transform="rotate(${a} ${x} ${y})"/>`;
  }).join('');
}

// ── Kopf (Koordinaten wie 'geht', danach verschoben/gedreht) ──
function kopf(laune) {
  const auge = laune === 'lacht'
    ? `<path d="M50.2 -46.4q3-3.6 6 0" fill="none" stroke="#f3e2cc" stroke-width="1.7" stroke-linecap="round"/>`
    : `<ellipse cx="53.2" cy="-47" rx="2.6" ry="2.9" fill="#fff"/><circle cx="53.9" cy="-46.8" r="1.7" fill="#17110f"/><circle cx="54.5" cy="-47.6" r=".7" fill="#fff"/><path d="M50 -51.4q3.4-2.4 6.6-.2" fill="none" stroke="#2a211e" stroke-width="1.1" stroke-linecap="round"/>`;
  const mund = laune === 'lacht'
    ? `<path d="M55.4 -38.2Q60.4 -29.6 64.8 -38.6Z" fill="${MUND_AUF}"/><path d="M57.6 -34.6q2.4-2.2 5 .1q-2.6 2.5-5-.1z" fill="${ZUNGE}"/>`
    : `<path d="M56 -37.6q4.4 3.4 8.2 0" fill="none" stroke="${LACHEN}" stroke-width="1.3" stroke-linecap="round"/>`;
  return `<g class="w-kopf">
    <ellipse cx="41.6" cy="-45.5" rx="7" ry="3" transform="rotate(16 41.6 -45.5)" fill="#2f2723"/>
    <path d="M40 -52C46 -57.6 58.6 -56 62.6 -47.6C65.6 -42 64.4 -36 58.4 -33.6C51 -31.6 43 -34 39.6 -40Z" fill="${GESICHT}"/>
    <ellipse cx="59.6" cy="-39.4" rx="6.2" ry="5.2" fill="${SCHNAUZE}"/>
    <ellipse cx="64.4" cy="-41.2" rx="2.3" ry="1.8" fill="${NASE}"/>
    <circle cx="55.6" cy="-41.6" r="2.6" fill="${BACKE}" opacity=".5"/>
    ${auge}${mund}
    <circle cx="45.8" cy="-57" r="5.4" fill="url(#w-wolle)"/><circle cx="52.4" cy="-58.2" r="4.8" fill="url(#w-wolle)"/>
    <ellipse cx="43.6" cy="-52" rx="8.8" ry="3.3" transform="rotate(-30 43.6 -52)" fill="${GESICHT}"/>
    <ellipse cx="43.2" cy="-52" rx="5.8" ry="1.7" transform="rotate(-30 43.2 -52)" fill="${OHR_INNEN}"/>
  </g>`;
}

// ── Mützen: Ursprung = Scheitel des Kopfes (50, -57) ──
function rippen(x0, x1, y0, y1, n, farbe) {
  let d = '';
  for (let i = 1; i < n; i++) { const x = x0 + (x1 - x0) * i / n; d += `M${x.toFixed(1)} ${y0}V${y1}`; }
  return `<path d="${d}" stroke="${farbe}" stroke-opacity=".35" stroke-width=".9" fill="none"/>`;
}
function bommelchen(x, y, r, farbe) {
  let s = `<circle cx="${x}" cy="${y}" r="${r}" fill="${farbe}"/>`;
  for (let k = 0; k < 9; k++) { const a = k * .7; s += `<circle cx="${(x + Math.cos(a) * r * .8).toFixed(1)}" cy="${(y + Math.sin(a) * r * .8).toFixed(1)}" r="${(r * .42).toFixed(1)}" fill="${farbe}"/>`; }
  return s + `<circle cx="${x - r * .3}" cy="${y - r * .3}" r="${r * .35}" fill="#fff" opacity=".28"/>`;
}
function hut(o) {
  const [a, b] = o.hf;
  switch (o.hut) {
    case 'bommel':
      return `<g transform="rotate(-8)">
        <path d="M-12 0C-13 -15 13 -15 12 0Z" fill="${a}"/>
        <path d="M-12.4 -5Q0 -9 12.4 -5L12.2 -8.2Q0 -12 -12.2 -8.2Z" fill="${b}"/>
        <path d="M-9 -12.4C-3 -17 4 -17 9 -12.4" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width="1.4" stroke-linecap="round"/>
        <rect x="-13.4" y="-3.4" width="26.8" height="6.4" rx="3" fill="${b}"/>${rippen(-12, 12, -3, 3, 9, '#6a5a4a')}
        ${bommelchen(0, -17.5, 5.6, o.pom)}</g>`;
    case 'zipfel':
      return `<g transform="rotate(-6)">
        <path d="M-11.5 0C-12 -9 -9 -18 -16 -25C-20 -29 -27 -28 -31 -22C-24 -23.4 -19 -19.6 -17 -12.6C-15 -6 4 -8 11.8 0Z" fill="${a}"/>
        <path d="M-12.2 -5.6Q-1 -9.2 11.6 -5.2L11.8 -2.4Q-1 -6.4 -12.2 -2.6Z" fill="${b}"/>
        <path d="M-10 -11.4Q-8 -13.6 -2 -13.8L-3 -10.6Q-8 -10.4 -10 -8.6Z" fill="${b}" opacity=".9"/>
        <rect x="-13" y="-3.2" width="26" height="6" rx="3" fill="${b}"/>${rippen(-12, 12, -3, 3, 9, '#6a5a4a')}
        ${bommelchen(-31.5, -21.5, 5, o.pom)}</g>`;
    case 'klappen':
      return `<g transform="rotate(-4)">
        <path d="M-12 1C-13 -14 13 -14 12 1Z" fill="${a}"/>
        <path d="M-9 -11C-3 -15.6 5 -15.6 9 -11" fill="none" stroke="#fff" stroke-opacity=".25" stroke-width="1.3" stroke-linecap="round"/>
        <path d="M-12 -1C-15.4 6 -13.4 15 -8 15.6C-4.4 15 -4.4 4 -5 0Z" fill="${b}"/>
        <path d="M-12.6 1C-13.4 6 -12.6 11.6 -9 13" fill="none" stroke="${a}" stroke-width="1.4"/>
        <path d="M-14 1.4a2.6 2.6 0 1 1 5.2 0a2.6 2.6 0 1 1 5.2 0a2.6 2.6 0 1 1 5.2 0a2.6 2.6 0 1 1 5.2 0a2.6 2.6 0 1 1 5.2 0" fill="url(#w-wolle)" transform="translate(1 -1.2)"/>
        <path d="M-9 15.4Q-8 22 -10 26" fill="none" stroke="${b}" stroke-width="1.5" stroke-linecap="round"/><circle cx="-10" cy="26.4" r="1.8" fill="${b}"/>
        ${bommelchen(0, -15, 3.6, FARBEN.creme)}</g>`;
    case 'gams': {
      let bart = '';
      for (let k = 0; k < 15; k++) { const w = -1.05 + k * .13; bart += `<path d="M5.5 -12L${(5.5 + Math.sin(w) * 22).toFixed(1)} ${(-12 - Math.cos(w) * (18 + (k % 3) * 2.4)).toFixed(1)}" stroke="${k % 2 ? '#e8dcc6' : '#9a8062'}" stroke-width="1.1" stroke-linecap="round"/>`; }
      return `<g transform="rotate(-6)">${bart}
        <path d="M-9.4 -1L-7.6 -14.2Q0 -16.6 7.6 -14.2L9.4 -1Z" fill="${a}"/>
        <path d="M-9.1 -4.4H9.1V-7.6H-9.2Z" fill="${b}"/>
        <ellipse cx="0" cy="-.6" rx="16.6" ry="3.8" fill="${a}"/><path d="M-16 -.4Q0 3.6 16 -.4" fill="none" stroke="#000" stroke-opacity=".18" stroke-width="1.2"/></g>`;
    }
    case 'muff':
      return `<g transform="rotate(-4)">
        <path d="M-7.6 .6C-8.6 -11 6 -12.4 6.6 -.6" fill="none" stroke="${a}" stroke-width="2.6" stroke-linecap="round"/>
        <path d="M-7 -.6C-7.6 -8.6 3 -10.4 5.2 -4" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width="1" stroke-linecap="round"/>
        ${bommelchen(-7.4, 7.6, 6.6, a)}</g>`;
    case 'band':
      return `<g transform="rotate(-6)">
        <path d="M-12 1C-13 -12 13 -12 12 1Z" fill="${a}"/><rect x="-12.8" y="-3.2" width="25.6" height="6" rx="3" fill="${b}"/>
        <rect x="-12.8" y="-.4" width="25.6" height="2.4" rx="1.2" fill="${a}" opacity=".9"/>${bommelchen(0, -13.6, 3.6, b)}</g>`;
    default: return '';
  }
}

// zweites Ohrenwärmer-Polster, schaut hinter dem Kopf hervor (wird vor dem Kopf gezeichnet)
function hutHinten(o) {
  return o.hut === 'muff' ? `<g transform="translate(50 -57) rotate(-4)">${bommelchen(-1.4, 3.2, 6, '#b5516d')}</g>` : '';
}

// ── Skibrille (Ski-Pose) ──
const BRILLE = `<path d="M38.4 -48Q46 -53 53 -49" fill="none" stroke="#2b2420" stroke-width="2.6" stroke-linecap="round"/>
  <rect x="48.6" y="-53.4" width="13" height="9.4" rx="4.6" fill="#2b2420"/><rect x="50" y="-52.2" width="10.2" height="7" rx="3.4" fill="url(#w-glas)"/>
  <path d="M51.4 -50.6q2.2-1.4 4.4-.8" stroke="#fff" stroke-opacity=".7" stroke-width="1.2" fill="none" stroke-linecap="round"/>`;

// ── Schal: Wickel um den Hals, Zipfel hängt über die Brust oder weht nach hinten ──
function schal(farben, weht) {
  const [a, b] = farben;
  const kragen = `<path d="M33.4 -55Q44 -53 45.6 -42Q46.2 -35.4 42.6 -31.6L32.6 -33Q37.6 -43 33.4 -55Z" fill="${a}"/>
    <path d="M33.6 -50.4L45 -49M34.8 -44.6L46 -43.2M35.2 -38.4L45.4 -37.2" stroke="${b}" stroke-width="2.6" stroke-linecap="round" fill="none"/>
    <path d="M40 -53.6Q44 -50 44 -45" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width="1.4" stroke-linecap="round"/>`;
  const zipfel = weht
    ? `<path d="M36 -40C26 -46 16 -42 5 -48L3.6 -40.6C15 -35 26 -40 36 -33Z" fill="${a}"/>
       <path d="M27.4 -43.4L28.6 -35.6M19.4 -43.6L20.4 -36.6M11 -45.6L12 -38.4" stroke="${b}" stroke-width="3" stroke-linecap="round" fill="none"/>
       <path d="M4.6 -48.6l-3.8-.6M4.2 -45.4l-4 .4M3.8 -42.2l-3.8 1.4" stroke="${a}" stroke-width="1.4" stroke-linecap="round"/>`
    : `<path d="M34.6 -35L43.6 -34Q42 -24 43.6 -11L34 -10.6Q33 -23 34.6 -35Z" fill="${a}"/>
       <path d="M34.2 -29L43.4 -28.6M33.8 -22.4L43.2 -22M33.6 -16L43.4 -15.8" stroke="${b}" stroke-width="2.8" stroke-linecap="round" fill="none"/>
       <path d="M35.2 -10.2v4M38.2 -10.4v4.6M41 -10.6v4.4M43 -10.8v3.6" stroke="${a}" stroke-width="1.6" stroke-linecap="round"/>`;
  return `<g class="w-schal">${zipfel}${kragen}</g>`;
}

// ── Beine: v = Schwungrichtung (±1), js/winter-gipfel.js dreht sie beim Gehen um die Hüfte ──
function bein(x, dx, hoehe = 24, v = 0, amp = 0) {
  return `<g class="w-bein" data-x="${x}" data-v="${v}" transform="rotate(${(v * amp).toFixed(1)} ${x} ${-hoehe})"><path d="M${x - 3} ${-hoehe}L${x - 2.4} -4Q${x + dx - 2.6} -2 ${x + dx - 3} 0H${x + dx + 3}Q${x + dx + 2.4} -2 ${x + 2.6} -4L${x + 3} ${-hoehe}Z" fill="url(#w-bein)"/><path d="M${x + dx - 3.1} -2.6H${x + dx + 3.1}V0H${x + dx - 3.1}Z" fill="${HUF}"/></g>`;
}

// Schnee um die Hufe: das Schaf steht im Schnee, nicht darauf
function klumpen(pose) {
  const e = (x, y, rx, ry) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="url(#w-klumpen)"/>`;
  if (pose === 'sitzt') return e(30, -1, 9, 4.6) + e(-8, 0, 11, 5) + e(41, -2, 6.4, 3.6) + e(14, 1, 8, 4);
  return e(-22, -.5, 7.4, 4) + e(-10, 0, 7, 3.6) + e(10, -.5, 7.4, 4) + e(22, 0, 7.8, 4.2) + e(0, 1.6, 12, 3.4);
}

// kleiner Rucksack mit Riemen (Wanderschaf)
function rucksack(farbe) {
  return `<g transform="rotate(-8 -22 -54)"><rect x="-31" y="-67" width="19" height="19" rx="5" fill="${farbe}"/><rect x="-29.5" y="-71.6" width="16" height="7" rx="3.4" fill="${farbe}"/>
    <path d="M-31 -58H-12M-22 -67V-48" stroke="#000" stroke-opacity=".16" stroke-width="1.4"/><rect x="-26" y="-60" width="9" height="6" rx="2" fill="#fff" opacity=".28"/>
    <path d="M-12 -62Q-4 -56 -2 -44" fill="none" stroke="${farbe}" stroke-width="2.4" stroke-linecap="round"/></g>`;
}

// Tasse mit Kakao, Dampf und Marshmallows (Dampf bewegt css/winter.css)
function tasse(x, y, farbe) {
  return `<g transform="translate(${x} ${y})">
    <path d="M12.4 -9.6q6 .4 5.4 5.4q-.6 4.4-5.8 4" fill="none" stroke="${farbe}" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M0 -10.6H13L11.8 0Q6.5 2 1.2 0Z" fill="${farbe}"/><path d="M1 -6H12.2" stroke="#fff" stroke-opacity=".5" stroke-width="2"/>
    <ellipse cx="6.5" cy="-10.6" rx="6.5" ry="2" fill="#6b3f2c"/>
    <circle cx="4" cy="-11.4" r="1.8" fill="#fdf8ee"/><circle cx="8.4" cy="-11.6" r="1.6" fill="#fdf8ee"/>
    <g class="w-dampf" fill="none" stroke="#fff" stroke-opacity=".75" stroke-width="1.3" stroke-linecap="round">
      <path d="M3 -14q-2.6-3 0-6t0-6"/><path d="M7.5 -15q2.6-3 0-6t0-6" style="animation-delay:.7s"/><path d="M11.4 -14q-2-3 0-5.4t0-5" style="animation-delay:1.4s"/></g></g>`;
}

// ── Schaf zusammensetzen ──
// opt: pose, outfit (Schlüssel aus OUTFITS), laune ('froh' | 'lacht'), fell ('weiss' | 'braun' | 'grau'), phase (Beinschwung −1…1),
//      weht (Schalzipfel flattert), rucksack (Farbe), tasseFarbe (Kakaotasse beim Sitzen)
export function schaf({ pose = 'geht', outfit = 'bommel', laune = 'froh', fell = 'weiss', phase = 0, weht = false, rucksackFarbe = null, tasseFarbe = FARBEN.rot, malen = true } = {}) {
  const o = OUTFITS[outfit];
  const w = WOLLE[pose];
  const sitzt = pose === 'sitzt', ski = pose === 'ski';
  const wolle = fell === 'braun' ? 'url(#w-wolle-braun)' : fell === 'grau' ? 'url(#w-wolle-grau)' : 'url(#w-wolle)';
  const rand = fell === 'braun' ? '#8a6a52' : '#8ea3a9';
  const kopfX = sitzt ? 'translate(-13 -14) rotate(-8 50 -44)' : ski ? 'translate(2 4) rotate(8 50 -44)' : '';
  const kopfTeil = `<g transform="${kopfX}">${hutHinten(o)}${kopf(laune)}${ski ? BRILLE : ''}<g transform="translate(50 -57)">${hut(o)}</g></g>`;
  const schalTeil = `<g transform="${sitzt ? 'translate(-13 -14)' : ski ? 'translate(2 4)' : ''}">${schal(o.schal, weht || ski)}</g>`;
  const wollTeil = `<g fill="${rand}" stroke="${rand}" stroke-width="3" stroke-linejoin="round">${kreise(w, (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r}"/>`)}</g>`
    + kreise(w, (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${wolle}"/>`)
    + `<g fill="none" stroke="${fell === 'braun' ? '#a88460' : '#b6b3a6'}" stroke-width="1" stroke-linecap="round" opacity=".7">${locken(w)}</g>`
    + `<ellipse cx="0" cy="${sitzt ? -6 : -21}" rx="${sitzt ? 24 : 27}" ry="5" fill="#7d8f95" opacity=".16"/>`;
  let beine = '', vorn = '', schwanz = `<circle cx="-36" cy="-42" r="5.4" fill="${wolle}"/>`;
  if (sitzt) {
    beine = `<path d="M-6 -15L27 -9L29 -3L-6 -6Z" fill="url(#w-bein)"/><path d="M26 -10.4L31.4 -9L31.4 -2L27 -3Z" fill="${HUF}"/>
      <path d="M-2 -10L31 -3.6L32 1L-2 -2Z" fill="url(#w-bein)" transform="translate(0 1.4)"/>`;
    vorn = `<path d="M22 -22Q34 -23 42 -28" fill="none" stroke="${BEIN}" stroke-width="6.4" stroke-linecap="round"/><circle cx="43" cy="-28" r="3.5" fill="${HUF}"/>
      <path d="M26 -14Q34 -10 40 -4" fill="none" stroke="${BEIN}" stroke-width="6" stroke-linecap="round"/><circle cx="41" cy="-3.4" r="3.4" fill="${HUF}"/>`;
    schwanz = `<circle cx="-33" cy="-22" r="5.4" fill="${wolle}"/>`;
  } else if (ski) {
    beine = `<path d="M-36 3.4L34 2Q42 1.8 46 -3" stroke="#2b2420" stroke-width="3.8" stroke-linecap="round" fill="none"/>
      ${bein(-14, 1)}${bein(-6, 1)}${bein(14, 1)}${bein(22, 1)}`;
  } else {
    const s = phase * 14;
    beine = bein(-22, 0, 24, -1, s) + bein(-10, 0, 24, 1, s) + bein(10, 0, 24, -1, s) + bein(22, 0, 24, 1, s);
  }
  const extra = (rucksackFarbe && !sitzt) ? rucksack(rucksackFarbe) : '';
  const tasseTeil = sitzt ? tasse(40, -34, tasseFarbe) : '';
  return `<g class="w-schaf-${pose}"${malen ? ' filter="url(#w-farbe)"' : ''}>${beine}${schwanz}${ski ? '' : klumpen(pose)}${wollTeil}${extra}${vorn}${schalTeil}${kopfTeil}${tasseTeil}</g>`;
}
