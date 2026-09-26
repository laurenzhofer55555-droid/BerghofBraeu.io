// Prozedurale Texturen (Canvas) für den Kronkorken.
import * as THREE from 'three';
import { CONFIG } from './config.js';

const SIZE = 2048;
const TAU = Math.PI * 2;

// Kronkorken-Oberseite: goldenes Metall mit grünem Aufdruck (Ring-Schrift + Berghof-Zeichnung).
// Liefert drei Texturen:
//  map  – Farbe (Gold bzw. Druckfarbe)
//  orm  – G = Rauheit, B = Metall (Druckfarbe ist matt und nicht metallisch)
//  bump – leicht erhabener Rand
export function createCapTopTextures(drawing) {
  const m = SIZE / 2;
  const color = canvas(), orm = canvas(), bump = canvas();
  const c = color.getContext('2d'), o = orm.getContext('2d'), b = bump.getContext('2d');

  // ── Grundmetall ──────────────────────────────
  const gold = CONFIG.cap.color;
  c.fillStyle = gold;
  c.fillRect(0, 0, SIZE, SIZE);
  // feine konzentrische Drehrillen (Stanzteil) – nur in der Rauheit sichtbar
  o.fillStyle = `rgb(255, ${Math.round((CONFIG.cap.roughness + 0.08) * 255)}, 255)`;   // Deckfläche minimal matter als der Rand
  o.fillRect(0, 0, SIZE, SIZE);
  for (let r = 8; r < m; r += 5) {
    o.strokeStyle = `rgba(255, ${Math.round((CONFIG.cap.roughness + (Math.random() - 0.5) * 0.12) * 255)}, 255, 0.5)`;
    o.lineWidth = 2;
    o.beginPath(); o.arc(m, m, r, 0, TAU); o.stroke();
  }
  // Bump: flache Mitte, erhabener Wulst am Rand
  b.fillStyle = '#808080';
  b.fillRect(0, 0, SIZE, SIZE);
  const rim = b.createRadialGradient(m, m, m * 0.86, m, m, m);
  rim.addColorStop(0, '#808080');
  rim.addColorStop(0.45, '#d0d0d0');
  rim.addColorStop(1, '#707070');
  b.fillStyle = rim;
  b.beginPath(); b.arc(m, m, m, 0, TAU); b.fill();

  // ── Aufdruck (in color = Grün, in orm = matt/nicht metallisch) ───
  const ink = CONFIG.cap.printColor;
  const inkOrm = `rgb(255, ${Math.round(0.55 * 255)}, 0)`;
  const print = (fn) => { fn(c, ink); fn(o, inkOrm); };

  // doppelte Ringlinie
  print((g, col) => {
    g.strokeStyle = col;
    g.lineWidth = SIZE * 0.006;
    g.beginPath(); g.arc(m, m, m * 0.8, 0, TAU); g.stroke();
    g.lineWidth = SIZE * 0.0025;
    g.beginPath(); g.arc(m, m, m * 0.76, 0, TAU); g.stroke();
    g.beginPath(); g.arc(m, m, m * 0.5, 0, TAU); g.stroke();
  });

  // Ring-Schriftzug zwischen den Linien
  const ringText = 'BERGHOF HELL ◆ VOLLBIER ◆ AGATHARIED ◆ ';
  print((g, col) => {
    g.fillStyle = col;
    g.font = `600 ${SIZE * 0.05}px "Playfair Display", Georgia, serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const chars = [...ringText];
    const step = TAU / chars.length;
    chars.forEach((ch, i) => {
      const a = i * step - Math.PI / 2;
      g.save();
      g.translate(m + Math.cos(a) * m * 0.63, m + Math.sin(a) * m * 0.63);
      g.rotate(a + Math.PI / 2);
      g.fillText(ch, 0, 0);
      g.restore();
    });
  });

  // Mitte: Berghof-Zeichnung (nur die Gebäude) + Schriftzug
  if (drawing) {
    const sx = drawing.width * 0.27, sw = drawing.width * 0.6;   // Ausschnitt Gebäude
    const sh = drawing.height;
    const dw = m * 0.84, dh = dw * (sh / sw);
    const tinted = tintImage(drawing, sx, 0, sw, sh, dw, dh);
    c.drawImage(tinted.color(ink), m - dw / 2, m - dh * 0.78);
    o.drawImage(tinted.color(inkOrm), m - dw / 2, m - dh * 0.78);
  }
  print((g, col) => {
    g.fillStyle = col;
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.font = `italic 600 ${SIZE * 0.07}px "Playfair Display", Georgia, serif`;
    g.fillText('Berghof', m, m + m * 0.3);
  });

  const map = toTexture(color, THREE.SRGBColorSpace);
  const ormTex = toTexture(orm, THREE.NoColorSpace);
  const bumpTex = toTexture(bump, THREE.NoColorSpace);
  return { map, orm: ormTex, bump: bumpTex };
}

function canvas() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = SIZE;
  return cv;
}

function toTexture(cv, colorSpace) {
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = colorSpace;
  t.anisotropy = 8;
  return t;
}

// Schwarz-transparente Zeichnung in eine Farbe umfärben (für den Druck)
function tintImage(img, sx, sy, sw, sh, dw, dh) {
  return {
    color(col) {
      const cv = document.createElement('canvas');
      cv.width = Math.ceil(dw); cv.height = Math.ceil(dh);
      const g = cv.getContext('2d');
      g.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh);
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = col;
      g.fillRect(0, 0, dw, dh);
      return cv;
    },
  };
}
