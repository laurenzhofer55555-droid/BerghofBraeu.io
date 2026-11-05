// Tannen der Winter-Szenen: Stufen mit gezackter Kante, Schneehauben, optional geschmückt (goldene Lichter, Kugeln, Stern).
// tanne() liefert eine SVG-Gruppe mit dem Fuß des Stammes bei (x, y); Höhe h. Die Verläufe stehen einmal im Dokument (tannenDefs).
const r1 = (v) => v.toFixed(1);

export function tannenDefs() {
  return `<linearGradient id="w-tanne" x1="0" x2="1"><stop offset="0" stop-color="#3f8052"/><stop offset=".5" stop-color="#2F6B40"/><stop offset="1" stop-color="#1c4a2b"/></linearGradient>
    <linearGradient id="w-tanne-nacht" x1="0" x2="1"><stop offset="0" stop-color="#5a9a6c"/><stop offset=".5" stop-color="#3b7a4d"/><stop offset="1" stop-color="#255a37"/></linearGradient>
    <radialGradient id="w-licht-halo"><stop offset="0" stop-color="#F8E4A0" stop-opacity=".95"/><stop offset=".4" stop-color="#E8C766" stop-opacity=".35"/><stop offset="1" stop-color="#C5A149" stop-opacity="0"/></radialGradient>`;
}

const KUGEL = ['#C2452D', '#D1A445', '#F6F1E4', '#5F8F9A', '#E27B3A'];

export function tanne({ x, y, h, stufen = 4, schmuck = false, nacht = false }) {
  const n = stufen;
  const th = (h * .92) / (1 + (n - 1) * .55), step = th * .55;
  const stamm = h * .08;
  const grad = nacht ? 'url(#w-tanne-nacht)' : 'url(#w-tanne)';
  const sx = h * .62, sy = h * .1;
  let s = `<g class="w-tanne"><g filter="url(#w-farbe)">`;
  s += `<path d="M${r1(x - h * .05)} ${r1(y + 1)}L${r1(x + h * .06)} ${r1(y + 3)}L${r1(x + sx + h * .1)} ${r1(y + sy + h * .045)}Q${r1(x + sx * .85)} ${r1(y + sy * .5)} ${r1(x + sx * .42)} ${r1(y + sy * .34)}Z" fill="${nacht ? '#0b2314' : '#3d8c95'}" opacity="${nacht ? .5 : .55}"/>`;
  s += `<rect x="${r1(x - stamm / 2)}" y="${r1(y - h * .12)}" width="${r1(stamm)}" height="${r1(h * .12)}" fill="#6b4a35"/>`;
  let lichter = '', kugeln = '';
  for (let i = 0; i < n; i++) {
    const top = y - h + i * step + h * .0, bot = top + th;
    const w = h * .62 * (.4 + .6 * i / Math.max(1, n - 1));
    const zack = 6, ZH = th * .1;
    let kante = '';
    for (let k = 0; k <= zack; k++) {
      const px = x - w / 2 + (w * k) / zack, py = bot + (k % 2 ? -ZH : ZH * .5);
      kante += `L${r1(px)} ${r1(py)}`;
    }
    s += `<path d="M${r1(x)} ${r1(top)}Q${r1(x - w * .3)} ${r1(top + th * .5)} ${r1(x - w / 2)} ${r1(bot)}${kante}Q${r1(x + w * .3)} ${r1(top + th * .5)} ${r1(x)} ${r1(top)}Z" fill="${grad}"/>`;
    // Schneehaube: oberes Viertel jeder Stufe, symmetrisch, unten gewellt
    const sh = th * .3, sw = (w / 2) * (sh / th) * 1.04;
    let welle = '';
    for (let j = 1; j <= 4; j++) {
      const px = x - sw + (sw * 2 * j) / 4, py = top + sh + (j % 2 ? sh * .16 : -sh * .06);
      welle += `Q${r1(px - sw * .25)} ${r1(top + sh + sh * .36)} ${r1(px)} ${r1(py)}`;
    }
    s += `<path d="M${r1(x)} ${r1(top)}Q${r1(x - sw * .5)} ${r1(top + sh * .45)} ${r1(x - sw)} ${r1(top + sh)}${welle}Q${r1(x + sw * .5)} ${r1(top + sh * .45)} ${r1(x)} ${r1(top)}Z" fill="#F6F3EA"/>`;
    s += `<path d="M${r1(x - sw * .8)} ${r1(top + sh * .9)}Q${r1(x)} ${r1(top + sh * 1.12)} ${r1(x + sw * .8)} ${r1(top + sh * .9)}" fill="none" stroke="#bccace" stroke-width="${r1(Math.max(.8, h * .006))}" opacity=".6"/>`;
    if (schmuck) {
      for (let k = 1; k < 5; k++) {
        const t = k / 5, px = x - w * .42 + w * .84 * t, py = top + th * (.62 + .22 * Math.sin(t * Math.PI * 2 + i)) ;
        lichter += `<g class="w-licht" style="--d:${((i * 5 + k * 3) % 11 * .27).toFixed(2)}s"><circle cx="${r1(px)}" cy="${r1(py)}" r="${r1(h * .05)}" fill="url(#w-licht-halo)"/><circle cx="${r1(px)}" cy="${r1(py)}" r="${r1(h * .011)}" fill="#FFF1C2"/></g>`;
      }
      for (let k = 0; k < 2; k++) {
        const t = .3 + k * .42 + (i % 2) * .08;
        kugeln += `<circle cx="${r1(x - w * .4 + w * .8 * t)}" cy="${r1(bot - th * (.18 + (k + i) % 2 * .12))}" r="${r1(h * .02)}" fill="${KUGEL[(i * 2 + k) % KUGEL.length]}"/>`;
      }
    }
  }
  s += `</g>` + kugeln + lichter;
  if (schmuck) {
    const sx = x, sy = y - h - h * .01, R = h * .06, rr = R * .44;
    let pts = '';
    for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rad = k % 2 ? rr : R; pts += `${r1(sx + Math.cos(a) * rad)},${r1(sy - R * .1 + Math.sin(a) * rad)} `; }
    s += `<circle cx="${r1(sx)}" cy="${r1(sy)}" r="${r1(R * 2.2)}" fill="url(#w-licht-halo)" class="w-licht"/><polygon points="${pts}" fill="#F1CF6B" stroke="#C5A149" stroke-width="${r1(h * .004)}"/>`;
  }
  return s + '</g>';
}
