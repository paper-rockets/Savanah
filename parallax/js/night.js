// Night (with the Sleep button): the whole scene fades to cool moonlight under a dark blue sky,
// the sun gives way to a moon high up, and stars come out. Made with colour only, over the finished picture:
// a screen-wide layer multiplies everything by a night colour (darker up in the sky, lighter on the ground
// so the sleepers still read), a second one adds a faint blue moonlight, then the moon and stars are drawn on top.
import * as THREE from 'three';
import { HORIZON } from './depth.js';

const FADE = 1.5;   // seconds to fade between day and night
const SKY_NIGHT = new THREE.Color(0.16, 0.2, 0.42);
const GROUND_NIGHT = new THREE.Color(0.26, 0.33, 0.7);
const MOONLIGHT = new THREE.Color(0.04, 0.06, 0.12);   // added on top: takes the yellow out of the grass
const LAYER_ORDER = 30000;   // after everything else in the scene (birds are 20000)
const STARS = 220;

const quadVertex = /* glsl */`
  varying vec2 vUv;
  varying float vY;
  void main() {
    vUv = uv;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vY = w.y;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

// view = { left, right } of the screen; sun = the painted sun card (it fades out);
// viewH = scene height (720).
export function makeNight(scene, view, sun, viewH) {
  const k = { value: 0 };   // 0 = day, 1 = night

  // the night layer: result = picture x night colour
  const layer = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
    uniforms: { k, sky: { value: SKY_NIGHT }, ground: { value: GROUND_NIGHT }, horizon: { value: HORIZON } },
    vertexShader: quadVertex,
    fragmentShader: /* glsl */`
      uniform float k, horizon;
      uniform vec3 sky, ground;
      varying float vY;
      void main() {
        vec3 night = mix(ground, sky, smoothstep(horizon - 40.0, horizon + 220.0, vY));
        gl_FragColor = vec4(mix(vec3(1.0), night, k), 1.0);
      }
    `,
    transparent: true, depthTest: false, depthWrite: false,
    blending: THREE.CustomBlending, blendSrc: THREE.DstColorFactor, blendDst: THREE.ZeroFactor,
  }));
  layer.renderOrder = LAYER_ORDER;
  layer.frustumCulled = false;
  const wash = new THREE.Mesh(layer.geometry, new THREE.ShaderMaterial({
    uniforms: { k, light: { value: MOONLIGHT } },
    vertexShader: quadVertex,
    fragmentShader: /* glsl */`
      uniform float k;
      uniform vec3 light;
      void main() { gl_FragColor = vec4(light * k, 1.0); }
    `,
    transparent: true, depthTest: false, depthWrite: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
  }));
  wash.renderOrder = LAYER_ORDER + 1;
  wash.frustumCulled = false;

  // stars: small soft dots across the sky, each twinkling at its own pace, thinner towards the horizon
  const pos = [], size = [], phase = [];
  for (let i = 0; i < STARS; i++) {
    pos.push((Math.random() * 2 - 1) * 1700, HORIZON + 120 + Math.sqrt(Math.random()) * (viewH / 2 - HORIZON - 110), 0);
    size.push(1.2 + Math.random() ** 3 * 2.6);
    phase.push(Math.random() * 6.28);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  starGeo.setAttribute('size', new THREE.Float32BufferAttribute(size, 1));
  starGeo.setAttribute('phase', new THREE.Float32BufferAttribute(phase, 1));
  const time = { value: 0 };
  const stars = new THREE.Points(starGeo, new THREE.ShaderMaterial({
    uniforms: { k, time, ratio: { value: Math.min(devicePixelRatio, 3) } },
    vertexShader: /* glsl */`
      attribute float size, phase;
      uniform float time, ratio;
      varying float vTwinkle;
      void main() {
        vTwinkle = 0.65 + 0.35 * sin(time * (0.8 + fract(phase * 7.0)) + phase);
        gl_PointSize = size * ratio * 1.6;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform float k;
      varying float vTwinkle;
      void main() {
        float a = (1.0 - smoothstep(0.1, 0.5, length(gl_PointCoord - 0.5))) * vTwinkle * k;
        gl_FragColor = vec4(vec3(1.0, 0.97, 0.88) * a, a);
      }
    `,
    transparent: true, depthTest: false, depthWrite: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  }));
  stars.renderOrder = LAYER_ORDER + 2;
  stars.frustumCulled = false;

  // the moon: a pale disc with a few soft grey seas and a wide faint glow
  const MOON_R = 34;
  const moon = new THREE.Mesh(new THREE.PlaneGeometry(MOON_R * 8, MOON_R * 8), new THREE.ShaderMaterial({
    uniforms: { k },
    vertexShader: quadVertex,
    fragmentShader: /* glsl */`
      uniform float k;
      varying vec2 vUv;
      float spot(vec2 p, vec2 c, float r) { return 1.0 - smoothstep(r * 0.4, r, length(p - c)); }
      void main() {
        vec2 p = (vUv - 0.5) * 8.0;   // moon radius = 1
        float r = length(p);
        float disc = 1.0 - smoothstep(0.96, 1.0, r);
        float seas = 0.16 * (spot(p, vec2(-0.3, 0.25), 0.45) + spot(p, vec2(0.25, -0.2), 0.35) + spot(p, vec2(0.35, 0.45), 0.25));
        vec3 face = vec3(0.98, 0.96, 0.86) * (1.0 - seas);
        float glow = 0.35 * exp(-(r - 1.0) * 1.3) * step(1.0, r);
        vec3 c = face * disc + vec3(0.75, 0.82, 1.0) * glow * (1.0 - disc);
        float a = disc;
        gl_FragColor = vec4(c, a) * k;
      }
    `,
    transparent: true, depthTest: false, depthWrite: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  }));
  moon.renderOrder = LAYER_ORDER + 3;
  moon.frustumCulled = false;

  const group = new THREE.Group();
  group.add(layer, wash, stars, moon);
  group.visible = false;
  scene.add(group);

  let target = 0;
  return {
    get k() { return k.value; },   // 0 = day, 1 = night
    set(on) { target = on ? 1 : 0; },
    update(dt) {
      time.value += dt;
      k.value += Math.sign(target - k.value) * Math.min(Math.abs(target - k.value), dt / FADE);
      sun.material.uniforms.opacity.value = 1 - k.value;
      group.visible = k.value > 0;
      if (!group.visible) return;
      // cover the whole screen, whatever its shape; the moon sits up on the right, clear of the hills
      layer.scale.set(view.right - view.left + 20, viewH + 20, 1);
      layer.position.set((view.left + view.right) / 2, 0, 0);
      wash.scale.copy(layer.scale);
      wash.position.copy(layer.position);
      moon.position.set(view.right * 0.55, viewH / 2 - 95, 0);
    },
  };
}
