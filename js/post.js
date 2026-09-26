// Post-Processing: Tiefenunschärfe → Bloom → Tonemapping → Filmkorn/Vignette
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { CONFIG } from './config.js';

const GrainShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uGrain: { value: CONFIG.post.grain },
    uVignette: { value: CONFIG.post.vignette },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uTime, uGrain, uVignette;
    varying vec2 vUv;
    float hash(vec2 p){ p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      // Filmkorn: stärker in den Mitteltönen, schwächer in Lichtern
      float n = hash(vUv * 1000.0 + fract(uTime * 7.13) * 100.0) - 0.5;
      float lum = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      c.rgb += n * uGrain * (1.0 - lum * 0.6);
      // Vignette
      vec2 v = vUv - 0.5;
      c.rgb *= mix(1.0, smoothstep(0.85, 0.2, length(v * vec2(1.1, 1.0))), uVignette * 0.55);
      gl_FragColor = c;
    }`,
};

export function createComposer(renderer, scene, camera, { lowPower }) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const p = CONFIG.post;
  const dof = new BokehPass(scene, camera, {
    focus: p.dof.focus, aperture: p.dof.aperture, maxblur: p.dof.maxblur,
  });
  dof.enabled = p.dof.enabled && !lowPower;
  composer.addPass(dof);

  const size = renderer.getSize(new THREE.Vector2());
  const bloom = new UnrealBloomPass(
    size.multiplyScalar(0.5), p.bloom.strength, p.bloom.radius, p.bloom.threshold
  );
  composer.addPass(bloom);

  composer.addPass(new OutputPass());
  const grain = new ShaderPass(GrainShader);
  composer.addPass(grain);

  return { composer, dof, bloom, grain };
}
