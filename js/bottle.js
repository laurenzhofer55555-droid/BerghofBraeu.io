// Prozedurale Bierflasche (LatheGeometry) nach dem Foto vermessen.
// Später austauschbar gegen ein GLB: CONFIG.bottle.glbUrl setzen.
import * as THREE from 'three';
import { CONFIG } from './config.js';

// Maßstab: 1 Einheit = 10 cm → 1 mm = 0,01
const MM = 0.01;

// Außenprofil der Flasche [Radius, Höhe] in Millimetern, von der Bodenmitte nach oben.
// Standard-0,5-l-Euroflasche (Mehrweg, Mündung CC 26 / DIN 6094-1): Höhe 228 mm, Körper Ø 70,5 mm, Hals Ø ≈ 26 mm.
// Boden, Ferse und Schulterbogen nach der Herstellerzeichnung „500 ml Eurobier CCA-26“ (Hillebrandt Glas, Art. 00181):
// Körper zylindrisch bis 16,5 mm über dem Boden, Ferse mit R 57 und R 5, Standring Ø 56–62 mit Rändelung, Bodenwölbung 3 mm,
// Schulter: R 50 tangential in den geraden Kegel. Hals und Kegel aus dem Referenzfoto (IMG_6256).
const PROFILE_MM = [
  [0, 3], [7, 2.81], [13, 2.36], [18, 1.77], [22.5, 1.07], [25.5, 0.52], [27.3, 0.15],   // Bodenwölbung 3 mm (Kugelkappe)
  [28.2, 0], [29.5, 0], [30.8, 0],                                                     // Standring (Rändelung, siehe stippling)
  [31.15, 0.25], [31.5, 0.55], [31.95, 1], [32.4, 1.5], [32.9, 2], [33.3, 2.5],         // Ferse: enger Radius (R 5) …
  [33.6, 3], [33.85, 3.5], [34.05, 4], [34.25, 5], [34.45, 6], [34.8, 8],               // … in flachen Bogen (R 57)
  [35, 10], [35.15, 12], [35.25, 14], [35.25, 16.5],
  [35.25, 60], [35.25, 100], [35.25, 136.5],                                           // Körper Ø 70,5, überall gleich
  [35.11, 140.26], [34.68, 144], [33.97, 147.71], [32.99, 151.35], [31.73, 154.9],     // Schulter: Bogen R 50, ohne Knick
  [31.3, 156],                                                                         // ab hier gerader Kegel (Foto)
  [29.2, 161.3], [27.1, 166.6], [25, 171.9], [22.9, 177.2], [20.7, 182.5],
  [18.5, 187.7], [16.5, 193], [15.3, 196.6], [14.6, 199],
  [13.9, 202], [13.35, 205], [13.3, 208],                                              // Hals Ø ≈ 26,5
  [13.8, 210.2], [14.6, 211.5], [14.75, 214], [14.6, 217.5], [13.6, 219.2],            // Halsring
  [12.55, 220.6], [12.7, 221.6], [13.15, 222.8], [13.2, 225.8],                        // Rille + Mündungswulst Ø 26,3
  [12.85, 227.3], [12.1, 228], [9.5, 228], [8.3, 227.6],                               // Mündungsrand
  [8, 226.5], [8, 214], [0, 214],                                                      // Bohrung Ø 16
];
const CAP_BASE_MM = 222.9;        // Unterkante Kronkorken
const CAP_HEIGHT_MM = 6.3;
export const BOTTLE_HEIGHT = (CAP_BASE_MM + CAP_HEIGHT_MM) * MM;
export const SHADOW_LAYER = 1; // nur diese Objekte werfen den Kontaktschatten

// Etiketten: Höhe von/bis (mm über dem Boden), Breite als Bogenlänge (mm)
const LABELS = {
  front: { url: 'assets/textures/label-front.webp', y0: 18.1, y1: 121.9, width: 93.4, phi: 0 },       // Etikett 631 × 701 px: blauer Rahmen = 9 × 10 cm, dazu der cremefarbene Rand des Etiketts
  back:  { url: 'assets/textures/label-back.webp',  y0: 25.75, y1: 114.25, width: 72.8, phi: Math.PI },   // Rahmen 69,9 mm breit, dazu Rand
  neck:  { url: 'assets/textures/label-neck.webp',  y0: 149.6, y1: 186.4, width: 68.6, phi: 0, cutout: true },   // blaue Randlinie 66 mm breit, dazu der cremefarbene Rand
};

export function createBottle(renderer, manager, { radialSegments = 128, plainCap = false, dew = false, bubbles = false } = {}) {
  // pivot = Drehpunkt in Flaschenmitte (für Schritt 2: auf den Kopf drehen)
  const pivot = new THREE.Group();
  pivot.name = 'BottlePivot';
  const body = new THREE.Group();
  body.position.y = -BOTTLE_HEIGHT / 2;
  pivot.add(body);

  // glattes Profil über Catmull-Rom (centripetal = kein Überschwingen an Kanten)
  const curve = new THREE.CatmullRomCurve3(
    PROFILE_MM.map(([r, y]) => new THREE.Vector3(r * MM, y * MM, 0)), false, 'centripetal'
  );
  const outer = curve.getPoints((PROFILE_MM.length - 1) * 5).map((p) => new THREE.Vector2(Math.max(p.x, 0), p.y));
  outer[0].x = 0;
  outer[outer.length - 1].x = 0;
  const radiusAt = makeRadiusLookup(outer);

  // ── Glas: unten mit Bier gefüllt, oben (Hals) leer ─────────────
  const g = CONFIG.glass;
  const fillY = g.fillLevelMm * MM;
  const fillR = radiusAt(fillY);
  const lower = outer.filter((p) => p.y < fillY);
  lower.push(new THREE.Vector2(fillR, fillY));
  const upper = [new THREE.Vector2(fillR, fillY), ...outer.filter((p) => p.y > fillY)];

  const filledMat = createGlassMaterial(g.filled);
  const emptyMat = createGlassMaterial(g.empty);
  // Rändelung am Standring braucht viele Spalten (88 Noppen à 12): nur in der hohen Auflösung fürs Rendern
  const rändeln = radialSegments >= 256;
  const filledGeo = new THREE.LatheGeometry(lower, rändeln ? STIPPLING.count * 12 : radialSegments);
  if (rändeln) addStippling(filledGeo, lower.length);
  const glassFilled = new THREE.Mesh(filledGeo, filledMat);
  const glassEmpty = new THREE.Mesh(new THREE.LatheGeometry(upper, radialSegments), emptyMat);
  glassFilled.name = 'GlassFilled';
  glassEmpty.name = 'GlassEmpty';
  body.add(glassFilled, glassEmpty);

  // ── Etiketten ───────────────────────────────────────
  const loader = new THREE.TextureLoader(manager);
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const labels = {};
  for (const [key, L] of Object.entries(LABELS)) {
    const map = loader.load(L.url);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = maxAniso;
    const mat = new THREE.MeshStandardMaterial({
      map,
      color: '#ebe4d6',           // leicht cremiges Papier, macht Grün satter (wie gedruckt)
      roughness: 0.72,            // mattes Etikettenpapier
      // „transparent“ nimmt die Etiketten aus dem Transmissions-Durchgang: sonst erscheint
      // durch die Lichtbrechung eine dunkle Geisterkopie des Etiketts im Glas daneben
      transparent: true,
      alphaTest: L.cutout ? 0.5 : 0,
      envMapIntensity: 0.38,
    });
    const geo = createWrapGeometry(radiusAt, L.y0 * MM, L.y1 * MM, L.width * MM, 0.0022);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.y = L.phi;
    mesh.name = `Label_${key}`;
    body.add(mesh);
    labels[key] = mesh;
  }

  // ── Kronkorken ──────────────────────────────────────
  const cap = createCap(loader, plainCap);
  cap.position.y = CAP_BASE_MM * MM;
  body.add(cap);

  // alle Teile werfen den Kontaktschatten
  pivot.traverse((o) => { if (o.isMesh) o.layers.enable(SHADOW_LAYER); });

  // Kondenswasser (nur fürs Rendern der Standbilder und der Sequenz, kein Kontaktschatten): Tropfen auf Glas und Etiketten wie auf dem Produktfoto
  if (dew) body.add(createDew(outer, radiusAt));
  // Kohlensäurebläschen im Bier (nur fürs Rendern): Ketten aufsteigender Bläschen, nach oben größer, dazu feine Bläschen im Bier und an der Glasinnenwand
  if (bubbles) body.add(createBubbles(radiusAt));

  return { pivot, body, glass: [glassFilled, glassEmpty], cap, labels, materials: { filledMat, emptyMat } };
}

// Rändelung (Stippling) auf der Unterseite des Standrings, wie bei Mehrwegflaschen: 88 schräg stehende Noppen,
// dazwischen 0,45 mm tiefe Rillen (Herstellerzeichnung: Ring Ø 56–64 mm, Noppen gegen die Radialrichtung geneigt)
const STIPPLING = { count: 88, depthMm: 0.45, slantDeg: 35, rIn: 28.2, rOut: 30.8, share: 0.6 };

function addStippling(geo, rows) {
  const S = STIPPLING;
  const pos = geo.attributes.position;
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const perMm = (S.count * Math.tan((S.slantDeg * Math.PI) / 180)) / (2 * Math.PI * ((S.rIn + S.rOut) / 2));   // Phasenversatz je mm Radius
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const r = Math.hypot(x, z) / MM;
    if (y > 0.0005 || r < S.rIn - 0.01 || r > S.rOut + 0.01) continue;       // nur die ebene Aufstandsfläche
    const w = smooth(S.rIn, S.rIn + 0.7, r) * (1 - smooth(S.rOut - 0.8, S.rOut, r));   // an den Rändern glatt auslaufen
    const u = ((S.count * Math.atan2(x, z)) / (2 * Math.PI) + perMm * (r - (S.rIn + S.rOut) / 2)) % 1;
    const c = Math.abs((u < 0 ? u + 1 : u) - 0.5) * 2;                          // 0 = Noppenmitte, 1 = Rillenmitte
    pos.setY(i, y + S.depthMm * MM * w * smooth(S.share - 0.1, S.share + 0.15, c));
  }
  geo.computeVertexNormals();
  smoothLatheSeam(geo, rows);
}

// Bernsteinglas: echte Transmission + dunklere Ränder
// (Three.js rechnet mit konstanter Dicke; am Rand ist der Lichtweg real länger → dunkler)
function createGlassMaterial(v) {
  const g = CONFIG.glass;
  const mat = new THREE.MeshPhysicalMaterial({
    color: '#ffffff',
    metalness: 0,
    roughness: g.roughness,
    transmission: 1,
    ior: g.ior,
    thickness: v.thickness,
    attenuationColor: new THREE.Color(v.attenuationColor),
    attenuationDistance: v.attenuationDistance,
    specularIntensity: 1,
    envMapIntensity: g.envMapIntensity,
  });
  const T = g.tint;
  mat.userData.edge = { uEdgeDarken: { value: g.edgeDarken }, uEdgePower: { value: g.edgePower },
    uBase: { value: new THREE.Vector3(T.base.from, T.base.to, T.base.k) }, uNeck: { value: new THREE.Vector3(T.neck.from, T.neck.to, T.neck.k) } };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, mat.userData.edge);   // live anpassbar über material.userData.edge
    shader.vertexShader = 'varying float vGlassY;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n         vGlassY = position.y * 100.0;');   // Höhe in mm
    shader.fragmentShader = 'uniform float uEdgeDarken; uniform float uEdgePower; uniform vec3 uBase; uniform vec3 uNeck; varying float vGlassY;\n' +
      shader.fragmentShader.replace(
        '#include <transmission_fragment>',
        `#include <transmission_fragment>
         float gFacing = abs(dot(normal, normalize(vViewPosition)));
         totalDiffuse *= mix(uEdgeDarken, 1.0, pow(gFacing, uEdgePower));
         float gBase = smoothstep(uBase.x, uBase.y, vGlassY), gNeck = smoothstep(uNeck.x, uNeck.y, vGlassY);
         totalDiffuse *= mix(1.0, uBase.z, gBase) * mix(1.0, uNeck.z, gNeck);`
      );
  };
  return mat;
}

// Kronkorken: gerippter Rand (21 Zacken wie beim echten Kronkorken) + gewölbte Deckfläche mit Aufdruck
function createCap(loader, plain = false) {
  const group = new THREE.Group();
  group.name = 'Cap';
  const c = CONFIG.cap;

  // Profil der Kappe (mm, relativ zur Unterkante): Kronkorken Ø 32,1 mm, Höhe 6,3 mm
  const capCurve = new THREE.CatmullRomCurve3([
    [14.4, 0], [15.3, 0.2], [15.9, 0.8], [15.8, 1.6], [15.4, 2.8], [15.25, 4.2],
    [15.1, 5], [14.6, 5.7], [13.7, 6.15], [13.1, 6.3],
  ].map(([r, y]) => new THREE.Vector3(r * MM, y * MM, 0)), false, 'centripetal');
  const pts = capCurve.getPoints(48).map((p) => new THREE.Vector2(p.x, p.y));
  const geo = new THREE.LatheGeometry(pts, 21 * 14);

  // Riffelung: Radius wellt sich um 21 Falten, unten am stärksten, zur Kante hin abgerundet
  const pos = geo.attributes.position;
  const skirtTop = 5 * MM;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (y >= skirtTop) continue;
    const phi = Math.atan2(x, z);
    const f = Math.pow(1 - y / skirtTop, 0.7);
    const w = Math.cos(21 * phi);
    const fold = Math.sign(w) * Math.pow(Math.abs(w), 0.55);
    const s = 1 + 0.042 * f * fold;
    pos.setX(i, x * s);
    pos.setZ(i, z * s);
  }
  geo.computeVertexNormals();
  smoothLatheSeam(geo, pts.length);   // Naht bei 0°/360° glätten

  const metal = new THREE.MeshPhysicalMaterial({
    color: c.color, metalness: 1, roughness: c.roughness, side: THREE.DoubleSide,
    clearcoat: 0.4, clearcoatRoughness: 0.2,   // Schutzlack wie beim echten Kronkorken
    envMapIntensity: 1.5,
  });
  group.add(new THREE.Mesh(geo, metal));

  // Deckfläche: leicht gewölbt, trägt den Aufdruck (wird in Schritt 3 die Inhalts-Bühne)
  const R = 13.1 * MM;
  const topGeo = new THREE.RingGeometry(0.0001, R, 160, 16);
  const tp = topGeo.attributes.position;
  for (let i = 0; i < tp.count; i++) {
    const r = Math.hypot(tp.getX(i), tp.getY(i)) / R;
    tp.setZ(i, (1 - r * r) * 0.25 * MM);
  }
  topGeo.computeVertexNormals();
  const topMat = new THREE.MeshPhysicalMaterial({
    color: '#ffffff', metalness: 1, roughness: 1,
    clearcoat: 0.4, clearcoatRoughness: 0.2,
    envMapIntensity: 1.9,        // flache Deckfläche braucht mehr Umgebungslicht, sonst wirkt sie dunkel
  });
  const top = new THREE.Mesh(topGeo, topMat);
  top.rotation.x = -Math.PI / 2;
  top.position.y = CAP_HEIGHT_MM * MM;
  top.name = 'CapTop';
  group.add(top);
  group.userData.top = top;

  // schlichter goldener Kronkorken ohne Aufdruck (Scroll-Sequenz)
  if (plain) {
    topMat.color.set(c.color);
    topMat.roughness = 0.34;          // etwas matter → sattes Gold statt Spiegelung der Softbox
    topMat.envMapIntensity = 1.1;
    return group;
  }

  // Aufdruck: fertig gebackene Texturen (erzeugt mit tools/kronkorken-backen.html)
  const tex = (url, colorSpace) => {
    const t = loader.load(url);
    t.colorSpace = colorSpace;
    t.anisotropy = 8;
    return t;
  };
  topMat.map = tex('assets/textures/kronkorken-farbe.webp', THREE.SRGBColorSpace);
  topMat.roughnessMap = topMat.metalnessMap = tex('assets/textures/kronkorken-material.webp', THREE.NoColorSpace);
  topMat.bumpMap = tex('assets/textures/kronkorken-relief.webp', THREE.NoColorSpace);
  topMat.bumpScale = 2.5;
  return group;
}

// LatheGeometry hat an der Naht (0°/360°) doppelte Punkte mit leicht verschiedenen Normalen →
// Mittelwert setzen, damit keine Kante sichtbar ist (schneller als mergeVertices)
function smoothLatheSeam(geo, rows) {
  const n = geo.attributes.normal;
  const cols = n.count / rows;
  const v = new THREE.Vector3();
  for (let j = 0; j < rows; j++) {
    const a = j, b = (cols - 1) * rows + j;   // erste und letzte Spalte
    v.set(n.getX(a) + n.getX(b), n.getY(a) + n.getY(b), n.getZ(a) + n.getZ(b)).normalize();
    n.setXYZ(a, v.x, v.y, v.z);
    n.setXYZ(b, v.x, v.y, v.z);
  }
  n.needsUpdate = true;
}

// Etikett auf beliebige Rotationsfläche wickeln (Papierbreite bleibt konstant,
// funktioniert daher auch auf dem konischen Hals).
function createWrapGeometry(radiusAt, y0, y1, width, offset, rows = 48, cols = 96) {
  const positions = [], uvs = [], index = [];
  const rs = [], ys = [], s = [0];
  for (let j = 0; j <= rows; j++) {
    const y = y0 + ((y1 - y0) * j) / rows;
    ys.push(y);
    rs.push(radiusAt(y) + offset);
    if (j > 0) s.push(s[j - 1] + Math.hypot(rs[j] - rs[j - 1], y - ys[j - 1]));
  }
  const total = s[rows];
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= cols; i++) {
      const u = i / cols;
      const phi = ((u - 0.5) * width) / rs[j];
      positions.push(rs[j] * Math.sin(phi), ys[j], rs[j] * Math.cos(phi));
      uvs.push(u, s[j] / total);
    }
  }
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = j * (cols + 1) + i, b = a + 1, c = a + cols + 1, d = c + 1;
      index.push(a, b, d, a, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return geo;
}

// r(y) aus dem gesampelten Profil (nur im Bereich mit eindeutigem Radius)
function makeRadiusLookup(points) {
  const pts = points.filter((p) => p.x > 0.01).sort((a, b) => a.y - b.y);
  return (y) => {
    for (let i = 1; i < pts.length; i++) {
      if (pts[i].y >= y) {
        const a = pts[i - 1], b = pts[i];
        const t = (y - a.y) / Math.max(b.y - a.y, 1e-6);
        return a.x + (b.x - a.x) * t;
      }
    }
    return pts.at(-1).x;
  };
}


// ── Kondenswasser ──────────────────────────────────────
// Dünne Hülle knapp über Glas und Etiketten (Lathe mit demselben Profil, +0,5 mm) mit einer Tropfentextur (Canvas, feste Zufallsfolge: jedes Rendern gleich).
// u = Winkel (nahtlos, Tropfen an der Naht doppelt gezeichnet), v = Höhe in mm: Tropfen sind überall gleich groß (Textur 4096², 0,054 mm je Pixel).
function createDew(outer, radiusAt) {
  const D = CONFIG.dew, N = 4096, mmPerPx = (2 * Math.PI * 35.25) / N;
  const c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d');
  let seed = 20261014;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const yTop = D.topMm / mmPerPx, yBot = D.bottomMm / mmPerPx;           // Texturzeilen: v = Höhe / (N · mmPerPx)
  const drop = (x, y, r) => {
    const body = g.createRadialGradient(x + r * 0.18, y + r * 0.2, r * 0.1, x, y, r);
    body.addColorStop(0, 'rgba(255,232,190,0.10)'); body.addColorStop(0.62, 'rgba(160,100,40,0.08)');
    body.addColorStop(0.84, 'rgba(30,14,0,0.42)'); body.addColorStop(1, 'rgba(30,14,0,0)');
    g.fillStyle = body; g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill();
    const spec = g.createRadialGradient(x - r * 0.36, y - r * 0.4, 0, x - r * 0.36, y - r * 0.4, r * 0.3);
    spec.addColorStop(0, 'rgba(255,255,255,0.72)'); spec.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = spec; g.beginPath(); g.arc(x - r * 0.36, y - r * 0.4, r * 0.3, 0, 6.2832); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.32)'; g.lineWidth = Math.max(1, r * 0.1);
    g.beginPath(); g.arc(x, y, r * 0.86, Math.PI * 0.95, Math.PI * 1.55); g.stroke();
  };
  for (const [count, r0, r1, dens] of D.sizes) {
    for (let i = 0; i < count; i++) {
      const x = rnd() * N, y = yBot + rnd() * (yTop - yBot), r = (r0 + (r1 - r0) * rnd() * rnd()) / mmPerPx / 2;   // Durchmesser in mm, kleine häufiger
      if (rnd() > dens) continue;
      drop(x, y, r);
      if (x < r * 1.5) drop(x + N, y, r); else if (x > N - r * 1.5) drop(x - N, y, r);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = THREE.RepeatWrapping; tex.anisotropy = 8;
  const pts = [];
  for (let y = D.bottomMm; y <= D.topMm; y += 1) pts.push(new THREE.Vector2((radiusAt(y * MM) / MM + D.offsetMm) * MM, y * MM));
  const geo = new THREE.LatheGeometry(pts, 256);
  const uv = geo.attributes.uv, pos = geo.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - (pos.getY(i) / MM) / (N * mmPerPx) * 1);                   // Höhe → v (Canvas-y läuft nach unten)
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: D.opacity });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'Dew'; mesh.renderOrder = 5;
  return mesh;
}

// ── Bläschen im Bier ───────────────────────────────────
// Echte Kohlensäure steigt in Ketten von Keimstellen am Boden auf: unten klein und dicht, nach oben größer und mit größerem Abstand. Dazu feiner Dunst im Bier und einzelne Bläschen an der Glasinnenwand.
// Punkte mit eigener Größenberechnung (Weltmaß in mm → Pixel über die Projektion), undurchsichtig, damit sie durchs Glas in der Transmission mit Bernstein getönt erscheinen.
function createBubbles(radiusAt) {
  const B = CONFIG.bubbles;
  let seed = 7261014;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const pos = [], size = [];
  const inner = (y) => radiusAt(y * MM) / MM - B.wallMm;                          // Innenradius in mm
  const add = (x, y, z, d) => { pos.push(x * MM, y * MM, z * MM); size.push(d * MM); };
  for (let c = 0; c < B.chains; c++) {                                              // Ketten
    const a = rnd() * Math.PI * 2, rho = Math.sqrt(rnd()) * 0.8, x0 = Math.cos(a) * rho * inner(60), z0 = Math.sin(a) * rho * inner(60);
    let y = B.bottomMm + rnd() * 6, wob = rnd() * 6.28;
    while (y < B.topMm) {
      const t = (y - B.bottomMm) / (B.topMm - B.bottomMm), d = B.d0 + (B.d1 - B.d0) * t * (0.8 + 0.4 * rnd());
      const w = 0.5 + t * 1.4, ox = Math.sin(wob + y * 0.07) * w, oz = Math.cos(wob * 1.3 + y * 0.06) * w;
      const r = Math.hypot(x0 + ox, z0 + oz), lim = inner(y) - d, k = r > lim ? lim / r : 1;
      add((x0 + ox) * k, y, (z0 + oz) * k, d);
      y += d * (2.2 + 2.4 * rnd() + 3.5 * t);                                       // Abstand wächst nach oben
    }
  }
  for (let i = 0; i < B.mist; i++) {                                                // feine Bläschen im Bier
    const y = B.bottomMm + rnd() * (B.topMm - B.bottomMm), a = rnd() * Math.PI * 2, rho = Math.sqrt(rnd()), d = B.mistMin + (B.mistMax - B.mistMin) * rnd() * rnd();
    const R = inner(y) - d; add(Math.cos(a) * rho * R, y, Math.sin(a) * rho * R, d);
  }
  for (let i = 0; i < B.wall; i++) {                                                // an der Glasinnenwand haftend, unten häufiger
    const y = B.bottomMm + Math.pow(rnd(), 1.6) * (B.topMm - B.bottomMm), a = rnd() * Math.PI * 2, d = B.wallMin + (B.wallMax - B.wallMin) * rnd() * rnd();
    const R = inner(y) - d * 0.5; add(Math.cos(a) * R, y, Math.sin(a) * R, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('size', new THREE.Float32BufferAttribute(size, 1));
  // Bläschen-Textur: helle Perle (weiß im Kern, weich auslaufend); Ring und Glanzpunkt der Kondenstropfen gibt es hier bewusst nicht, damit man Gas im Bier und Wasser außen unterscheidet
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const body = g.createRadialGradient(30, 30, 2, 32, 32, 29);
  body.addColorStop(0, 'rgb(255,255,255)'); body.addColorStop(0.55, 'rgb(255,248,225)'); body.addColorStop(1, 'rgb(235,200,140)');
  g.fillStyle = body; g.beginPath(); g.arc(32, 32, 29, 0, 6.2832); g.fill();
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace;
  // Rand weich ausstanzen: Alpha aus der Scheibe
  const a = document.createElement('canvas'); a.width = a.height = 64; const ag = a.getContext('2d'); ag.clearRect(0, 0, 64, 64);
  ag.drawImage(c, 0, 0);
  const img = ag.getImageData(0, 0, 64, 64); for (let i = 0; i < img.data.length; i += 4) { const x = (i / 4) % 64 - 32, y = Math.floor(i / 4 / 64) - 32; img.data[i + 3] = Math.hypot(x, y) < 30 ? 255 : 0; } ag.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(a); tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: tex }, uScale: { value: 1 }, uMin: { value: B.minPx }, uShade: { value: B.brightness } },
    vertexShader: `attribute float size; uniform float uScale; uniform float uMin; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = max(uMin, size * uScale / max(gl_Position.w, 0.001)); }`,
    fragmentShader: `uniform sampler2D uMap;\nuniform float uShade;\nvoid main() {\n  vec4 t = texture2D(uMap, gl_PointCoord);\n  if (t.a < 0.5) discard;\n  gl_FragColor = vec4(t.rgb * uShade, 1.0);\n  #include <tonemapping_fragment>\n  #include <colorspace_fragment>\n}`,
    transparent: false, depthWrite: true,
  });
  const pts = new THREE.Points(geo, mat);
  pts.name = 'Bubbles'; pts.frustumCulled = false;
  pts.onBeforeRender = (renderer, scene, camera) => { const s = renderer.getSize(new THREE.Vector2()); mat.uniforms.uScale.value = camera.projectionMatrix.elements[5] * s.y / 2; };
  return pts;
}

// Optional: GLB statt prozeduraler Flasche.
// Erwartet einen Knoten mit "cap" im Namen für den Kronkorken.
export async function loadBottleGLB(url) {
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const gltf = await new GLTFLoader().loadAsync(url);
  const pivot = new THREE.Group();
  const model = gltf.scene;
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const scale = BOTTLE_HEIGHT / size.y;
  model.scale.setScalar(scale);
  model.position.sub(box.getCenter(new THREE.Vector3()).multiplyScalar(scale));
  pivot.add(model);
  let cap = null;
  model.traverse((o) => {
    if (o.isMesh) o.layers.enable(SHADOW_LAYER);
    if (!cap && /cap|korken/i.test(o.name)) cap = o;
  });
  return { pivot, body: model, cap, labels: {}, materials: {} };
}
