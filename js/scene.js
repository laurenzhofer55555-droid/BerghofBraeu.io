// 3D-Szene: Renderer, Flasche, Licht, Loop.
// Wird vom Starter (main.js) erst nach dem ersten Rendern der Seite nachgeladen.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { createBottle, loadBottleGLB, BOTTLE_HEIGHT } from './bottle.js';
import { createStudioEnvironment, createLights, createBackdrop, ContactShadow } from './stage.js';

const root = document.documentElement;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isMobile = window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 768;

// lange Aufgaben in kleine Häppchen teilen → die Seite bleibt beim Laden bedienbar
const nextTask = () => new Promise((resolve) => setTimeout(resolve, 0));

// ── WebGL-Check → sonst statisches Fallback-Bild ─────────────
function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch { return false; }
}
if (!hasWebGL()) {
  root.classList.add('no-webgl');
  throw new Error('WebGL nicht verfügbar – Fallback aktiv');
}

// ── Renderer ─────────────────────────────────────────────────
// Kein Post-Processing: echtes Multisample-Antialiasing ist auf hellem Grund wichtiger
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
let maxDpr = isMobile ? CONFIG.perf.maxDprMobile : CONFIG.perf.maxDprDesktop;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxDpr));
renderer.toneMapping = THREE.NeutralToneMapping;   // farbtreu: Etikett und Creme bleiben, wie sie sind
renderer.toneMappingExposure = CONFIG.lights.exposure;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(CONFIG.colors.background);
await nextTask();
scene.environment = createStudioEnvironment(renderer);
scene.environmentIntensity = CONFIG.lights.envIntensity;
await nextTask();

// ── Kamera ───────────────────────────────────────────────────
const cam = CONFIG.camera;
const camera = new THREE.PerspectiveCamera(cam.fov, canvas.clientWidth / canvas.clientHeight, 0.1, 60);
const camTarget = new THREE.Vector3(...cam.target);
const camBase = new THREE.Vector3(...cam.position);

// ── Szene aufbauen ───────────────────────────────────────────
const manager = new THREE.LoadingManager();
const assetsLoaded = new Promise((resolve) => { manager.onLoad = resolve; });
scene.add(createBackdrop());
const lights = createLights(scene);

let bottle = createBottle(renderer, manager, { radialSegments: isMobile ? 96 : 128 });
scene.add(bottle.pivot);
bottle.pivot.rotation.y = CONFIG.bottle.startRotation;

const shadow = new ContactShadow(renderer, scene, -BOTTLE_HEIGHT / 2);

if (CONFIG.bottle.glbUrl) {
  loadBottleGLB(CONFIG.bottle.glbUrl).then((glb) => {
    scene.remove(bottle.pivot);
    glb.pivot.rotation.copy(bottle.pivot.rotation);
    bottle = glb;
    scene.add(bottle.pivot);
    shadow.update();
  }).catch((e) => console.warn('GLB konnte nicht geladen werden, nutze prozedurale Flasche', e));
}

// ── Resize (Hochformat → Kamera weiter weg, damit die Flasche passt) ─
let needsRender = true;   // bei „reduzierter Bewegung“ nur rendern, wenn sich etwas ändert
function resize() {
  needsRender = true;
  // Größe kommt aus dem CSS (gleicher Rahmen wie das Standbild)
  const w = canvas.clientWidth, h = canvas.clientHeight;
  camera.aspect = w / h;
  const portrait = w / h < 0.8;
  camBase.z = portrait ? cam.portraitDistance : cam.position[2];
  camTarget.y = portrait ? cam.portraitTargetY : cam.target[1];
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}
window.addEventListener('resize', resize);
resize();

// ── Nur rendern, solange der Startbereich sichtbar ist (spart Akku) ─
let heroVisible = true;
const hero = document.getElementById('start');
if (hero && 'IntersectionObserver' in window) {
  new IntersectionObserver(([entry]) => {
    heroVisible = entry.isIntersecting;
    if (heroVisible) needsRender = true;
  }).observe(hero);
}

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
  lenis = new Lenis({ lerp: 0.09, smoothWheel: true, anchors: true });
  lenis.on('scroll', ScrollTrigger.update);
}
gsap.ticker.lagSmoothing(0);

// ── Adaptive Qualität: bei schwacher FPS Auflösung reduzieren ─
let fpsFrames = 0, fpsTime = 0, downgrades = 0;
document.addEventListener('visibilitychange', () => { fpsFrames = 0; fpsTime = 0; });
function checkPerf(dt) {
  // nicht messen, wenn der Tab im Hintergrund liegt oder ein einzelner Frame hängt (Laden, Tabwechsel)
  if (downgrades >= 2 || document.hidden || dt > 0.25) return;
  fpsFrames++; fpsTime += dt;
  if (fpsTime > 2.5) {
    const fps = fpsFrames / fpsTime;
    if (fps < CONFIG.perf.autoDowngradeFps && maxDpr > 1) {
      downgrades++;
      maxDpr = Math.max(1, maxDpr - 0.5);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxDpr));
      resize();
      console.info(`[perf] ${fps.toFixed(0)} fps → Pixelratio ${maxDpr}`);
    }
    fpsFrames = 0; fpsTime = 0;
  }
}

// ── Render-Loop ──────────────────────────────────────────────
let last = performance.now();
let readyAt = 0;
function frame() {
  const now = performance.now();
  const rawDt = (now - last) / 1000;
  const dt = Math.min(rawDt, 0.1);
  last = now;
  lenis?.raf(now);
  if (!heroVisible) return;

  // Idle-Rotation um die Y-Achse; ohne Bewegung wird nur bei Änderungen gerendert (spart Akku)
  if (reducedMotion) {
    if (!needsRender) return;
    needsRender = false;
  } else {
    // Drehung läuft nach dem Einblenden sanft an (Standbild → 3D ohne sichtbaren Sprung)
    const spin = readyAt ? Math.min(1, (now - readyAt) / 2500) : 0;
    bottle.pivot.rotation.y += CONFIG.bottle.idleSpeed * dt * spin * spin;
  }

  // Kamera + sanfte Parallaxe
  pointerSmooth.lerp(pointer, 1 - Math.pow(0.002, dt));
  camera.position.set(
    camBase.x + pointerSmooth.x * cam.parallax,
    camBase.y - pointerSmooth.y * cam.parallax * 0.6,
    camBase.z
  );
  camera.lookAt(camTarget);

  renderer.render(scene, camera);
  checkPerf(rawDt);
}

// Start erst, wenn Etiketten + Kronkorken-Druck geladen sind → kein „Aufploppen“
await assetsLoaded;
await nextTask();
shadow.update();
await nextTask();
// Shader parallel kompilieren, ohne die Seite zu blockieren – höchstens 2 s warten
// (manche Browser melden nie „fertig“; dann kompiliert der erste Frame einfach selbst)
await Promise.race([renderer.compileAsync(scene, camera), new Promise((resolve) => setTimeout(resolve, 2000))]);
gsap.ticker.add(frame);
// erst wenn das erste 3D-Bild gezeichnet ist, das Standbild ausblenden
requestAnimationFrame(() => requestAnimationFrame(() => {
  root.classList.add('is-ready');
  readyAt = performance.now() + 900;   // nach der Überblendung losdrehen
}));

// Für Feintuning in der Konsole: window.__bh.lights.key.intensity = 3 …
window.__bh = { scene, camera, renderer, bottle, lights, shadow, lenis, CONFIG };
