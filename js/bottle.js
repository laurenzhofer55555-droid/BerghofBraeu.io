// Prozedurale Bierflasche (LatheGeometry) nach dem Foto vermessen.
// Später austauschbar gegen ein GLB: CONFIG.bottle.glbUrl setzen.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { createDropletNormalMap, createCapBumpMap } from './textures.js';

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

// Etiketten: Höhe von/bis (px), Breite als Bogenlänge (px)
const LABELS = {
  front: { url: 'assets/textures/label-front.webp', y0: 150, y1: 767, width: 555, phi: 0 },
  back:  { url: 'assets/textures/label-back.webp',  y0: 198, y1: 718, width: 433, phi: Math.PI },
  neck:  { url: 'assets/textures/label-neck.webp',  y0: 995, y1: 1197, width: 440, phi: 0, cutout: true },
};

export function createBottle(renderer) {
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
  const outer = curve.getPoints(220).map((p) => new THREE.Vector2(Math.max(p.x, 0), p.y));
  outer[0].set(0, 0);
  outer[outer.length - 1].x = 0;
  const radiusAt = makeRadiusLookup(outer);

  // ── Glas ────────────────────────────────────────────
  const droplets = createDropletNormalMap(CONFIG.glass.dropletCount);
  droplets.repeat.set(3, 3);
  const g = CONFIG.glass;
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: g.color,
    metalness: 0,
    roughness: g.roughness,
    transmission: 1,
    ior: g.ior,
    thickness: g.thickness,
    attenuationColor: new THREE.Color(g.attenuationColor),
    attenuationDistance: g.attenuationDistance,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    normalMap: droplets,
    normalScale: new THREE.Vector2(g.dropletStrength, g.dropletStrength),
    envMapIntensity: g.envMapIntensity,
    specularIntensity: 1,
  });
  // Randabdunklung: längerer Lichtweg durchs Glas am Rand → dunkler (Three.js rechnet mit konstanter Dicke)
  glassMat.onBeforeCompile = (shader) => {
    shader.uniforms.uEdgeDarken = { value: g.edgeDarken };
    shader.uniforms.uEdgePower = { value: g.edgePower };
    shader.fragmentShader = 'uniform float uEdgeDarken; uniform float uEdgePower;\n' +
      shader.fragmentShader.replace(
        '#include <transmission_fragment>',
        `#include <transmission_fragment>
         float gFacing = abs(dot(normal, normalize(vViewPosition)));
         totalDiffuse *= mix(uEdgeDarken, 1.0, pow(gFacing, uEdgePower));`
      );
  };
  const glass = new THREE.Mesh(new THREE.LatheGeometry(outer, 96), glassMat);
  glass.name = 'Glass';
  body.add(glass);

  // ── Bier (opak, mit Eigenleuchten → wird durchs Glas gebrochen) ─────
  const fillY = PROFILE_PX.at(-1)[1] * K * CONFIG.beer.fillHeight;
  const liquidPts = outer
    .filter((p) => p.y > 10 * K && p.y < fillY)
    .map((p) => new THREE.Vector2(Math.max(p.x * 0.93 - 3 * K, 0), p.y));
  liquidPts.unshift(new THREE.Vector2(0, 10 * K));
  liquidPts.push(new THREE.Vector2(0, fillY));
  const bc = CONFIG.beer;
  const beerMat = new THREE.MeshStandardMaterial({
    color: bc.color,
    roughness: 0.6,
    emissive: 0xffffff,
    emissiveIntensity: bc.glowIntensity,
  });
  // Fake-Volumen: Mitte (Blick frontal) leuchtet warm, Ränder dunkelbraun
  beerMat.onBeforeCompile = (shader) => {
    shader.uniforms.uCore = { value: new THREE.Color(bc.core) };
    shader.uniforms.uEdge = { value: new THREE.Color(bc.edge) };
    shader.uniforms.uFalloff = { value: bc.falloff };
    shader.fragmentShader = 'uniform vec3 uCore; uniform vec3 uEdge; uniform float uFalloff;\n' +
      shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
         float facing = abs(dot(normal, normalize(vViewPosition)));
         totalEmissiveRadiance *= mix(uEdge, uCore, pow(facing, uFalloff));`
      );
  };
  const beer = new THREE.Mesh(new THREE.LatheGeometry(liquidPts, 64), beerMat);
  beer.name = 'Beer';
  body.add(beer);

  // ── Etiketten ───────────────────────────────────────
  const loader = new THREE.TextureLoader();
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const labels = {};
  for (const [key, L] of Object.entries(LABELS)) {
    const map = loader.load(L.url);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = maxAniso;
    const mat = new THREE.MeshPhysicalMaterial({
      map,
      roughness: 0.55,
      clearcoat: 0.25,
      clearcoatRoughness: 0.45,
      transparent: !!L.cutout,
      alphaTest: L.cutout ? 0.5 : 0,
      envMapIntensity: 0.6,
    });
    const geo = createWrapGeometry(radiusAt, L.y0 * K, L.y1 * K, L.width * K, 0.0025);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.y = L.phi;
    mesh.name = `Label_${key}`;
    body.add(mesh);
    labels[key] = mesh;
  }

  // ── Kronkorken ──────────────────────────────────────
  const cap = createCap();
  cap.position.y = CAP_BASE_PX * K;
  body.add(cap);

  return { pivot, body, glass, beer, cap, labels, materials: { glassMat, beerMat } };
}

// Kronkorken: Lathe + 21 Zacken (Krone) + separate Deckfläche mit Prägung
function createCap() {
  const group = new THREE.Group();
  group.name = 'Cap';
  const c = CONFIG.cap;

  const pts = [
    [92, 0], [101, 1], [102, 4], [99, 8], [98, 30], [97, 42],
    [95, 48], [91, 52], [86, 54],
  ].map(([r, y]) => new THREE.Vector2(r * K, y * K));
  const geo = new THREE.LatheGeometry(pts, 168);

  // Zacken: Radius wellt sich um cos(21·φ), nach unten stärker
  const pos = geo.attributes.position;
  const skirtTop = 44 * K;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (y >= skirtTop) continue;
    const phi = Math.atan2(x, z);
    const f = Math.pow(1 - y / skirtTop, 0.6);
    const s = 1 + 0.045 * f * Math.cos(21 * phi);
    pos.setX(i, x * s);
    pos.setZ(i, z * s);
  }
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    color: c.color, metalness: c.metalness, roughness: c.roughness, side: THREE.DoubleSide,
  });
  group.add(new THREE.Mesh(geo, mat));

  // Deckfläche (wird in Schritt 3 die Inhalts-Bühne)
  const bump = createCapBumpMap();
  const topMat = new THREE.MeshStandardMaterial({
    color: c.color, metalness: c.metalness, roughness: c.roughness,
    bumpMap: bump, bumpScale: 1.4,
  });
  const top = new THREE.Mesh(new THREE.CircleGeometry(86 * K, 96), topMat);
  top.rotation.x = -Math.PI / 2;
  top.position.y = 54 * K;
  top.name = 'CapTop';
  group.add(top);
  group.userData.top = top;
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
  model.traverse((o) => { if (!cap && /cap|korken/i.test(o.name)) cap = o; });
  return { pivot, body: model, cap, labels: {}, materials: {} };
}
