// Studio: Umgebungs-Reflexionen, Lichter, Hintergrund, Kontaktschatten.
import * as THREE from 'three';
import { HorizontalBlurShader } from 'three/addons/shaders/HorizontalBlurShader.js';
import { VerticalBlurShader } from 'three/addons/shaders/VerticalBlurShader.js';
import { CONFIG } from './config.js';
import { SHADOW_LAYER } from './bottle.js';

// Virtuelles Fotostudio nur für Spiegelungen im Glas:
// dunkle Wände (geben dem Glas Kontur) + helle Softboxen (lange, weiche Glanzstreifen)
export function createStudioEnvironment(renderer) {
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(
    new THREE.SphereGeometry(20, 32, 16),
    new THREE.MeshBasicMaterial({ color: 0x3a3631, side: THREE.BackSide })
  ));

  const softbox = (w, h, color, intensity, pos) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide })
    );
    m.position.set(...pos);
    m.lookAt(0, 0, 0);
    env.add(m);
  };
  softbox(3.2, 10, '#fffaf0', 3.2, [-3.2, 1.5, 6]); // breites Fensterlicht vorne links → weicher Glanz
  softbox(1.2, 9, '#fffaf0', 7, [-5, 1.5, 4.5]);   // Streifen vorne links → heller Glanzstreifen
  softbox(1.0, 9, '#fff4e2', 4, [5.5, 1, 3]);      // Streifen vorne rechts
  softbox(0.6, 9, '#ffffff', 5, [-5, 1, -4]);      // Kantenlicht hinten links
  softbox(0.6, 9, '#ffffff', 5, [5, 1, -4]);       // Kantenlicht hinten rechts
  softbox(7, 5, '#fffdf8', 5, [0, 9, 1]);          // große Decke → Glanzlicht auf der Schulter
  softbox(8, 4, '#fffaf2', 2.2, [0, 5, 9]);        // Aufheller hinter der Kamera (Kronkorken-Oberseite)
  softbox(14, 8, '#f7f4ec', 0.9, [0, -6, 3]);      // cremefarbener Boden/Hintergrund (Aufhellung von unten)

  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(env, 0.02);
  pmrem.dispose();
  return rt.texture;
}

export function createLights(scene) {
  const L = CONFIG.lights;
  scene.add(new THREE.AmbientLight(0xffffff, L.ambient));
  const key = new THREE.DirectionalLight(L.key.color, L.key.intensity);
  key.position.set(...L.key.position);
  const fill = new THREE.DirectionalLight(L.fill.color, L.fill.intensity);
  fill.position.set(...L.fill.position);
  scene.add(key, fill);
  return { key, fill };
}

// Hintergrund: exakt die CSS-Cremefarbe, ohne Tonemapping → nahtloser Übergang zur Seite.
// Muss ein opakes Objekt sein, damit das Glas ihn durchscheinen lässt (Transmission).
export function createBackdrop() {
  const mat = new THREE.ShaderMaterial({
    depthWrite: false,
    uniforms: { uColor: { value: new THREE.Color(CONFIG.colors.background) } },
    vertexShader: /* glsl */`
      void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor;
      void main(){
        gl_FragColor = vec4(uColor, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(60, 40), mat);
  plane.position.set(0, 0, -8);
  plane.renderOrder = -1;
  return plane;
}

// Weicher Kontaktschatten (Technik aus dem three.js-Beispiel „contact shadows“):
// Die Flasche wird von unten als Tiefenbild gerendert, weichgezeichnet und auf den Boden gelegt.
// Da die Flasche rotationssymmetrisch ist, reicht ein Neuberechnen bei Positionsänderung.
export class ContactShadow {
  constructor(renderer, scene, floorY) {
    const S = CONFIG.shadow;
    this.renderer = renderer;
    this.scene = scene;
    this.blur = S.blur;

    this.group = new THREE.Group();
    this.group.position.y = floorY;
    scene.add(this.group);

    const res = 512;
    this.rt = new THREE.WebGLRenderTarget(res, res);
    this.rtBlur = new THREE.WebGLRenderTarget(res, res);
    this.rt.texture.generateMipmaps = this.rtBlur.texture.generateMipmaps = false;

    const geo = new THREE.PlaneGeometry(S.size, S.size).rotateX(Math.PI / 2);

    // Schattenfarbe: Kern dunkelbraun, weicher Rand mit Bernstein-Schimmer
    this.plane = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        map: { value: this.rt.texture },
        uColor: { value: new THREE.Color(S.color) },
        uTint: { value: new THREE.Color(S.tint) },
        uOpacity: { value: S.opacity },
      },
      vertexShader: /* glsl */`
        varying vec2 vUv;
        void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`
        uniform sampler2D map; uniform vec3 uColor; uniform vec3 uTint; uniform float uOpacity;
        varying vec2 vUv;
        void main(){
          float a = texture2D(map, vUv).a;
          vec3 col = mix(uTint, uColor, smoothstep(0.05, 0.55, a));
          gl_FragColor = vec4(col, a * uOpacity);
          #include <colorspace_fragment>
        }`,
    }));
    this.plane.scale.y = -1;       // Textur ist vertikal gespiegelt
    this.plane.renderOrder = 1;
    this.group.add(this.plane);

    this.blurPlane = new THREE.Mesh(geo);
    this.blurPlane.visible = false;
    this.blurPlane.layers.set(SHADOW_LAYER);   // muss für die Schattenkamera sichtbar sein
    this.group.add(this.blurPlane);

    this.camera = new THREE.OrthographicCamera(-S.size / 2, S.size / 2, S.size / 2, -S.size / 2, 0, S.height);
    this.camera.rotation.x = Math.PI / 2;   // schaut von unten nach oben
    this.camera.layers.set(SHADOW_LAYER);
    this.group.add(this.camera);

    this.depthMat = new THREE.MeshDepthMaterial();
    this.depthMat.userData.darkness = { value: S.darkness };
    this.depthMat.onBeforeCompile = (shader) => {
      shader.uniforms.darkness = this.depthMat.userData.darkness;
      shader.fragmentShader = 'uniform float darkness;\n' + shader.fragmentShader.replace(
        'gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );',
        'gl_FragColor = vec4( vec3( 0.0 ), ( 1.0 - fragCoordZ ) * darkness );'
      );
    };
    this.depthMat.depthTest = this.depthMat.depthWrite = false;

    this.hBlur = new THREE.ShaderMaterial(HorizontalBlurShader);
    this.vBlur = new THREE.ShaderMaterial(VerticalBlurShader);
    this.hBlur.depthTest = this.vBlur.depthTest = false;
  }

  // neu berechnen (nach dem Laden bzw. wenn sich die Flasche bewegt)
  update() {
    const r = this.renderer, scene = this.scene;
    const prevBg = scene.background, prevTarget = r.getRenderTarget(), prevAlpha = r.getClearAlpha();
    const prevToneMapping = r.toneMapping;
    scene.background = null;
    scene.overrideMaterial = this.depthMat;
    r.toneMapping = THREE.NoToneMapping;
    r.setClearAlpha(0);
    this.plane.visible = false;

    r.setRenderTarget(this.rt);
    r.clear();
    r.render(scene, this.camera);
    scene.overrideMaterial = null;

    this.blurPass(this.blur);
    this.blurPass(this.blur * 0.4);

    this.plane.visible = true;
    r.setRenderTarget(prevTarget);
    r.setClearAlpha(prevAlpha);
    r.toneMapping = prevToneMapping;
    scene.background = prevBg;
  }

  blurPass(amount) {
    const r = this.renderer;
    this.blurPlane.visible = true;
    this.blurPlane.material = this.hBlur;
    this.hBlur.uniforms.tDiffuse.value = this.rt.texture;
    this.hBlur.uniforms.h.value = amount / 256;
    r.setRenderTarget(this.rtBlur);
    r.render(this.blurPlane, this.camera);

    this.blurPlane.material = this.vBlur;
    this.vBlur.uniforms.tDiffuse.value = this.rtBlur.texture;
    this.vBlur.uniforms.v.value = amount / 256;
    r.setRenderTarget(this.rt);
    r.render(this.blurPlane, this.camera);
    this.blurPlane.visible = false;
  }
}
