// Prozedurale Bierflasche (LatheGeometry) nach dem Foto vermessen.
// Später austauschbar gegen ein GLB: CONFIG.bottle.glbUrl setzen.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from './config.js';
import { createCapTopTextures } from './textures.js';

// Umrechnung Foto-Pixel → Szene-Einheiten (Bauchdurchmesser 470 px = 0,7)
const K = 0.7 / 470;

// Außenprofil der Flasche [Radius, Höhe] in Foto-Pixeln, von unten nach oben
const PROFILE_PX = [
  [0, 0], [200, 0], [224, 5], [233, 16], [235, 40],
  [235, 829], [231, 889], [224, 929], [213, 969], [198, 1009],        // Schulter
  [183, 1049], [167, 1089], [151, 1129], [135, 1169], [118, 1209],
  [105, 1249], [97, 1280], [92, 1320], [90, 1350],                    // Hals
  [96, 1358], [96, 1372], [90, 1380], [90, 1418], [95, 1426],         // Halsring + Mündung
  [95, 1440], [90, 1452], [0, 1456],
];
const CAP_BASE_PX = 1432;   // Unterkante Kronkorken
export const BOTTLE_HEIGHT = 1486 * K;
export const SHADOW_LAYER = 1; // nur diese Objekte werfen den Kontaktschatten

// Etiketten: Höhe von/bis (px), Breite als Bogenlänge (px)
const LABELS = {
  front: { url: 'assets/textures/label-front.webp', y0: 150, y1: 767, width: 555, phi: 0 },
  back:  { url: 'assets/textures/label-back.webp',  y0: 198, y1: 718, width: 433, phi: Math.PI },
  neck:  { url: 'assets/textures/label-neck.webp',  y0: 995, y1: 1197, width: 440, phi: 0, cutout: true },
};

export function createBottle(renderer, manager) {
  // pivot = Drehpunkt in Flaschenmitte (für Schritt 2: auf den Kopf drehen)
  const pivot = new THREE.Group();
  pivot.name = 'BottlePivot';
  const body = new THREE.Group();
  body.position.y = -BOTTLE_HEIGHT / 2;
  pivot.add(body);

  // glattes Profil über Catmull-Rom (centripetal = kein Überschwingen an Kanten)
  const curve = new THREE.CatmullRomCurve3(
    PROFILE_PX.map(([r, y]) => new THREE.Vector3(r * K, y * K, 0)), false, 'centripetal'
  );
  const outer = curve.getPoints(260).map((p) => new THREE.Vector2(Math.max(p.x, 0), p.y));
  outer[0].set(0, 0);
  outer[outer.length - 1].x = 0;
  const radiusAt = makeRadiusLookup(outer);

  // ── Glas: unten mit Bier gefüllt, oben (Hals) leer ─────────────
  const g = CONFIG.glass;
  const fillY = PROFILE_PX.at(-1)[1] * K * g.fillHeight;
  const fillR = radiusAt(fillY);
  const lower = outer.filter((p) => p.y < fillY);
  lower.push(new THREE.Vector2(fillR, fillY));
  const upper = [new THREE.Vector2(fillR, fillY), ...outer.filter((p) => p.y > fillY)];

  const filledMat = createGlassMaterial(g.filled);
  const emptyMat = createGlassMaterial(g.empty);
  const glassFilled = new THREE.Mesh(new THREE.LatheGeometry(lower, 128), filledMat);
  const glassEmpty = new THREE.Mesh(new THREE.LatheGeometry(upper, 128), emptyMat);
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
    const geo = createWrapGeometry(radiusAt, L.y0 * K, L.y1 * K, L.width * K, 0.0022);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.y = L.phi;
    mesh.name = `Label_${key}`;
    body.add(mesh);
    labels[key] = mesh;
  }

  // ── Kronkorken ──────────────────────────────────────
  const cap = createCap(manager);
  cap.position.y = CAP_BASE_PX * K;
  body.add(cap);

  // alle Teile werfen den Kontaktschatten
  pivot.traverse((o) => { if (o.isMesh) o.layers.enable(SHADOW_LAYER); });

  return { pivot, body, glass: [glassFilled, glassEmpty], cap, labels, materials: { filledMat, emptyMat } };
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
  mat.userData.edge = { uEdgeDarken: { value: g.edgeDarken }, uEdgePower: { value: g.edgePower } };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, mat.userData.edge);   // live anpassbar über material.userData.edge
    shader.fragmentShader = 'uniform float uEdgeDarken; uniform float uEdgePower;\n' +
      shader.fragmentShader.replace(
        '#include <transmission_fragment>',
        `#include <transmission_fragment>
         float gFacing = abs(dot(normal, normalize(vViewPosition)));
         totalDiffuse *= mix(uEdgeDarken, 1.0, pow(gFacing, uEdgePower));`
      );
  };
  return mat;
}

// Kronkorken: gerippter Rand (21 Zacken wie beim echten Kronkorken) + gewölbte Deckfläche mit Aufdruck
function createCap(manager) {
  const group = new THREE.Group();
  group.name = 'Cap';
  const c = CONFIG.cap;

  // Profil der Kappe (px, relativ zur Unterkante), fein interpoliert
  const capCurve = new THREE.CatmullRomCurve3([
    [97, 0], [101.5, 1.2], [102.5, 4], [100, 9], [99, 20], [98.5, 34],
    [97.8, 43], [96.5, 48], [93.5, 51.6], [89, 53.6], [86, 54],
  ].map(([r, y]) => new THREE.Vector3(r * K, y * K, 0)), false, 'centripetal');
  const pts = capCurve.getPoints(48).map((p) => new THREE.Vector2(p.x, p.y));
  let geo = new THREE.LatheGeometry(pts, 21 * 14);

  // Riffelung: Radius wellt sich um 21 Falten, unten am stärksten, zur Kante hin abgerundet
  const pos = geo.attributes.position;
  const skirtTop = 44 * K;
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
  // Naht schließen, damit die Normalen rundum glatt sind
  geo.deleteAttribute('uv');
  geo.deleteAttribute('normal');
  geo = mergeVertices(geo, 1e-6);
  geo.computeVertexNormals();

  const metal = new THREE.MeshPhysicalMaterial({
    color: c.color, metalness: 1, roughness: c.roughness, side: THREE.DoubleSide,
    clearcoat: 0.4, clearcoatRoughness: 0.2,   // Schutzlack wie beim echten Kronkorken
    envMapIntensity: 1.5,
  });
  group.add(new THREE.Mesh(geo, metal));

  // Deckfläche: leicht gewölbt, trägt den Aufdruck (wird in Schritt 3 die Inhalts-Bühne)
  const R = 86 * K;
  const topGeo = new THREE.RingGeometry(0.0001, R, 160, 16);
  const tp = topGeo.attributes.position;
  for (let i = 0; i < tp.count; i++) {
    const r = Math.hypot(tp.getX(i), tp.getY(i)) / R;
    tp.setZ(i, (1 - r * r) * 1.6 * K);
  }
  topGeo.computeVertexNormals();
  const topMat = new THREE.MeshPhysicalMaterial({
    color: '#ffffff', metalness: 1, roughness: 1,
    clearcoat: 0.4, clearcoatRoughness: 0.2,
    envMapIntensity: 1.9,        // flache Deckfläche braucht mehr Umgebungslicht, sonst wirkt sie dunkel
  });
  const top = new THREE.Mesh(topGeo, topMat);
  top.rotation.x = -Math.PI / 2;
  top.position.y = 54 * K;
  top.name = 'CapTop';
  group.add(top);
  group.userData.top = top;

  // Aufdruck erst zeichnen, wenn Zeichnung + Schrift geladen sind
  manager?.itemStart('cap-print');
  const img = new Image();
  img.onload = img.onerror = async () => {
    try { await document.fonts.load('600 64px "Playfair Display"'); } catch { /* Fallback-Schrift */ }
    const t = createCapTopTextures(img.naturalWidth ? img : null);
    topMat.map = t.map;
    topMat.roughnessMap = t.orm;
    topMat.metalnessMap = t.orm;
    topMat.bumpMap = t.bump;
    topMat.bumpScale = 2.5;
    topMat.needsUpdate = true;
    manager?.itemEnd('cap-print');
  };
  img.src = 'assets/textures/berghof-zeichnung-mask.webp';
  return group;
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
