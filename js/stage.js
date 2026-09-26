// Studio: Umgebungs-Reflexionen, Lichter, Hintergrund, Kontaktschatten.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { createShadowTexture } from './textures.js';
import { BOTTLE_HEIGHT } from './bottle.js';

// Virtuelles Fotostudio nur für Spiegelungen (Softboxen → lange Glanzstreifen im Glas)
export function createStudioEnvironment(renderer) {
  const env = new THREE.Scene();
  const room = new THREE.Mesh(
    new THREE.SphereGeometry(20, 32, 16),
    new THREE.MeshBasicMaterial({ color: 0x0a0605, side: THREE.BackSide })
  );
  env.add(room);

  const softbox = (w, h, color, intensity, pos, lookAt = [0, 0, 0]) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide })
    );
    m.position.set(...pos);
    m.lookAt(...lookAt);
    env.add(m);
  };
  softbox(4, 6, '#fff4e6', 6, [-5, 5, 5]);        // Key-Softbox schräg oben links
  softbox(0.8, 9, '#ffc68a', 5, [6, 1, -2]);      // Streifenlicht rechts (Rim)
  softbox(0.8, 9, '#ffb070', 4, [-6, 1, -3]);     // Streifenlicht links (Rim)
  softbox(6, 2, '#ffe0b8', 1.2, [0, 8, 0]);       // Decke
  softbox(10, 3, '#3a1e0c', 1, [0, -6, 2]);       // warmer Bodenreflex

  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(env, 0.035);
  pmrem.dispose();
  return rt.texture;
}

export function createLights(scene) {
  const L = CONFIG.lights;
  scene.add(new THREE.AmbientLight(0xfff0e0, L.ambient));

  const key = new THREE.DirectionalLight(L.key.color, L.key.intensity);
  key.position.set(...L.key.position);
  scene.add(key);

  const fill = new THREE.DirectionalLight(L.fill.color, L.fill.intensity);
  fill.position.set(...L.fill.position);
  scene.add(fill);

  const mkRim = (cfg) => {
    const s = new THREE.SpotLight(cfg.color, cfg.intensity, 12, Math.PI / 7, 0.7, 1.6);
    s.position.set(...cfg.position);
    s.target.position.set(0, 0.2, 0);
    scene.add(s, s.target);
    return s;
  };
  return { key, fill, rimL: mkRim(L.rimL), rimR: mkRim(L.rimR) };
}

// Hintergrund: großer Shader-Plane mit warmem Lichtfleck hinter der Flasche
export function createBackdrop() {
  const mat = new THREE.ShaderMaterial({
    depthWrite: false,
    uniforms: {
      uCenter: { value: new THREE.Color(CONFIG.colors.bgCenter) },
      uEdge: { value: new THREE.Color(CONFIG.colors.bgEdge) },
      uSpot: { value: new THREE.Vector2(0.5, 0.58) },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */`
      uniform vec3 uCenter; uniform vec3 uEdge; uniform vec2 uSpot;
      varying vec2 vUv;
      void main(){
        vec2 d = (vUv - uSpot) * vec2(1.6, 1.0);
        float g = smoothstep(0.75, 0.0, length(d));
        vec3 col = mix(uEdge, uCenter, g * g);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(26, 16), mat);
  plane.position.set(0, 0.6, -5);
  plane.renderOrder = -1;
  return plane;
}

export function createContactShadow() {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, 1.6),
    new THREE.MeshBasicMaterial({ map: createShadowTexture(), transparent: true, depthWrite: false, opacity: 0.9 })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = -BOTTLE_HEIGHT / 2 + 0.002;
  return m;
}
