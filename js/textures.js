// Prozedurale Texturen (Canvas) – keine externen Dateien nötig.
import * as THREE from 'three';

// Kondenswassertropfen als kachelbare Normal Map.
// Jeder Tropfen = kleine Halbkugel, leicht nach unten gezogen (Schwerkraft).
export function createDropletNormalMap(count = 2600, size = 1024) {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 128; data[i + 1] = 128; data[i + 2] = 255; data[i + 3] = 255;
  }
  const rand = mulberry32(7);

  for (let n = 0; n < count; n++) {
    // viele kleine, wenige große Tropfen
    const t = rand();
    const r = t < 0.85 ? 1.2 + rand() * 3.5 : 5 + rand() * 9;
    const rx = r, ry = r * (1.05 + rand() * 0.35);
    const cx = rand() * size, cy = rand() * size;
    const x0 = Math.floor(cx - rx - 1), x1 = Math.ceil(cx + rx + 1);
    const y0 = Math.floor(cy - ry - 1), y1 = Math.ceil(cy + ry + 1);

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = (x - cx) / rx;
        // Unterseite etwas bauchiger → Tropfen "hängt"
        let dy = (y - cy) / ry;
        dy = dy > 0 ? dy * 0.85 : dy * 1.1;
        const d2 = dx * dx + dy * dy;
        if (d2 >= 1) continue;
        const nz = Math.sqrt(1 - d2);
        const px = ((x % size) + size) % size;
        const py = ((y % size) + size) % size;
        const idx = (py * size + px) * 4;
        data[idx] = (dx * 0.5 + 0.5) * 255;
        data[idx + 1] = (-dy * 0.5 + 0.5) * 255; // Canvas-Y zeigt nach unten
        data[idx + 2] = (nz * 0.5 + 0.5) * 255;
      }
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  canvas.getContext('2d').putImageData(new ImageData(data, size, size), 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Kronkorken-Oberseite: Bump Map mit geprägtem Ring-Schriftzug.
// Wird in Schritt 3 zur "Bühne" für die Inhalte.
export function createCapBumpMap(size = 1024) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const m = size / 2;
  g.fillStyle = '#808080';
  g.fillRect(0, 0, size, size);

  // leicht gewölbte Mitte
  const grad = g.createRadialGradient(m, m, 0, m, m, m);
  grad.addColorStop(0, '#9a9a9a');
  grad.addColorStop(0.85, '#808080');
  grad.addColorStop(1, '#6a6a6a');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);

  // geprägte Ringe
  g.strokeStyle = '#c8c8c8';
  g.lineWidth = size * 0.012;
  g.beginPath(); g.arc(m, m, size * 0.43, 0, Math.PI * 2); g.stroke();
  g.lineWidth = size * 0.005;
  g.beginPath(); g.arc(m, m, size * 0.30, 0, Math.PI * 2); g.stroke();

  // Ring-Schriftzug
  g.fillStyle = '#d0d0d0';
  g.font = `600 ${size * 0.062}px Oswald, "Arial Narrow", sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const text = 'BERGHOF · HELL · AGATHARIED · ';
  const chars = [...text];
  const step = (Math.PI * 2) / chars.length;
  chars.forEach((ch, i) => {
    const a = i * step - Math.PI / 2;
    g.save();
    g.translate(m + Math.cos(a) * size * 0.365, m + Math.sin(a) * size * 0.365);
    g.rotate(a + Math.PI / 2);
    g.fillText(ch, 0, 0);
    g.restore();
  });

  // Monogramm Mitte
  g.font = `700 ${size * 0.2}px Oswald, "Arial Narrow", sans-serif`;
  g.fillText('BH', m, m + size * 0.01);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// Weicher Kontaktschatten unter der Flasche
export function createShadowTexture(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(0,0,0,0.85)');
  grad.addColorStop(0.35, 'rgba(0,0,0,0.45)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

// deterministischer Zufall → Tropfenbild bei jedem Laden gleich
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
