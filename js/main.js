// Einstieg: Renderer, Szene, Loop. Schritt 1 = Hero-Szene mit Flasche.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { createBottle, loadBottleGLB } from './bottle.js';
import { createStudioEnvironment, createLights, createBackdrop, createContactShadow } from './stage.js';
import { createComposer } from './post.js';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isMobile = window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 768;

// ── WebGL-Check → sonst statisches Fallback-Bild ─────────────
function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch { return false; }
}
if (!hasWebGL()) {
  document.documentElement.classList.add('no-webgl');
  throw new Error('WebGL nicht verfügbar – Fallback aktiv');
}

await document.fonts.ready; // Oswald muss für die Kronkorken-Prägung geladen sein

// ── Renderer ─────────────────────────────────────────────────
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({
  canvas, antialias: false, powerPreference: 'high-performance', alpha: false,
});
let maxDpr = isMobile ? CONFIG.perf.maxDprMobile : CONFIG.perf.maxDprDesktop;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxDpr));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = CONFIG.post.exposure;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(CONFIG.colors.bgEdge);
scene.environment = createStudioEnvironment(renderer);
scene.environmentIntensity = CONFIG.lights.envIntensity;

// ── Kamera ───────────────────────────────────────────────────
const cam = CONFIG.camera;
const camera = new THREE.PerspectiveCamera(cam.fov, window.innerWidth / window.innerHeight, 0.1, 60);
const camTarget = new THREE.Vector3(...cam.target);
const camBase = new THREE.Vector3(...cam.position);

// ── Szene aufbauen ───────────────────────────────────────────
scene.add(createBackdrop());
scene.add(createContactShadow());
const lights = createLights(scene);

let bottle = createBottle(renderer);
scene.add(bottle.pivot);
bottle.pivot.rotation.y = CONFIG.bottle.startRotation;

if (CONFIG.bottle.glbUrl) {
  loadBottleGLB(CONFIG.bottle.glbUrl).then((glb) => {
    scene.remove(bottle.pivot);
    glb.pivot.rotation.copy(bottle.pivot.rotation);
    bottle = glb;
    scene.add(bottle.pivot);
  }).catch((e) => console.warn('GLB konnte nicht geladen werden, nutze prozedurale Flasche', e));
}

// ── Post-Processing ──────────────────────────────────────────
const post = createComposer(renderer, scene, camera, { lowPower: isMobile });

// ── Resize (Hochformat → Kamera weiter weg, damit Flasche passt) ─
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  const portrait = w / h < 0.8;
  camBase.z = portrait ? cam.portraitDistance : cam.position[2];
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  post.composer.setPixelRatio(renderer.getPixelRatio());
  post.composer.setSize(w, h);
  if (post.dof.enabled) post.dof.uniforms.focus.value = camBase.distanceTo(camTarget);
}
window.addEventListener('resize', resize);
resize();

// ── Maus-Parallaxe ───────────────────────────────────────────
const pointer = new THREE.Vector2();
const pointerSmooth = new THREE.Vector2();
if (!reducedMotion && !isMobile) {
  window.addEventListener('pointermove', (e) => {
    pointer.set((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
  });
}

// ── Lenis (weiches Scrollen) + GSAP-Ticker als einziger Loop ──
const { gsap, ScrollTrigger, Lenis } = window;
gsap.registerPlugin(ScrollTrigger);
let lenis = null;
if (!reducedMotion) {
  lenis = new Lenis({ lerp: 0.09, smoothWheel: true });
  lenis.on('scroll', ScrollTrigger.update);
}
gsap.ticker.lagSmoothing(0);

// ── Adaptive Qualität: bei schwacher FPS Effekte reduzieren ───
let fpsFrames = 0, fpsTime = 0, downgraded = false;
function checkPerf(dt) {
  if (downgraded) return;
  fpsFrames++; fpsTime += dt;
  if (fpsTime > 2.5) {
    const fps = fpsFrames / fpsTime;
    if (fps < CONFIG.perf.autoDowngradeFps) {
      downgraded = true;
      post.dof.enabled = false;
      maxDpr = Math.max(1, maxDpr - 0.5);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxDpr));
      resize();
      console.info(`[perf] ${fps.toFixed(0)} fps → Qualität reduziert`);
    }
    fpsFrames = 0; fpsTime = 0;
  }
}

// ── Render-Loop ──────────────────────────────────────────────
let last = performance.now();
gsap.ticker.add((time) => {
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  lenis?.raf(now);

  // Idle-Rotation um die Y-Achse
  if (!reducedMotion) bottle.pivot.rotation.y += CONFIG.bottle.idleSpeed * dt;

  // Kamera + sanfte Parallaxe
  pointerSmooth.lerp(pointer, 1 - Math.pow(0.001, dt));
  camera.position.set(
    camBase.x + pointerSmooth.x * cam.parallax,
    camBase.y - pointerSmooth.y * cam.parallax * 0.6,
    camBase.z
  );
  camera.lookAt(camTarget);

  post.grain.uniforms.uTime.value = time;
  post.composer.render(dt);
  checkPerf(dt);
});

document.documentElement.classList.add('is-ready');

// Für Feintuning in der Konsole: window.__bh.lights.key.intensity = 3 …
window.__bh = { scene, camera, renderer, bottle, lights, post, CONFIG };
