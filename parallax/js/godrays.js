// Sun rays (god rays): the shadows of the hills, clouds, trees and animals standing in front of the sun,
// drawn in the air as streaks running out from it. Ported to plain three.js from VolumetricLightPass in
// https://github.com/cortiz2894/stylized-components (MIT, src/components/volumetricLight).
//
// The scene is drawn into a picture first, then three cheap steps:
//   1. mask (small picture): where light gets through. The original finds open sky with the depth buffer; here almost
//      everything is drawn in layer order without depth, so open sky = a pixel that still shows the sky's own colour
//      at that height (anything standing in front of it has another colour). Only the sky round the sun gives light.
//   2. rays (small picture): each pixel walks towards the sun and averages the mask on the way. A line to the sun that
//      crosses a hill collects nothing; one through a gap collects light. Soft, so the small size does not show.
//   3. on screen: the scene plus the rays, added like light.
// ?rays=off switches them off, ?rays=0.6 sets the strength, ?rays=mask shows step 1 (for checking).
import * as THREE from 'three';

const SMALL_H = 360;   // height of the mask and rays pictures in pixels (the rays are soft, so this is plenty)
const SAMPLES = 40;    // steps from each pixel towards the sun

const quadVertex = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

// The same sky as backdrop.js draws, worked out again for each pixel and compared with what is there.
const maskFragment = /* glsl */`
  uniform sampler2D scene;
  uniform vec2 texel;          // a quarter of one mask pixel
  uniform vec4 viewBox;        // left, right, bottom, top of the screen in scene units
  uniform vec3 top, low, glow;
  uniform float horizon, skyTop, glowStrength, glowRadius;
  uniform vec2 sun;
  uniform float sunR, source;
  varying vec2 vUv;
  vec3 skyAt(vec2 p) {
    float t = clamp((p.y - horizon) / (skyTop - horizon), 0.0, 1.0);
    vec3 c = mix(low, top, pow(t, 0.7));
    return mix(c, glow, (1.0 - smoothstep(40.0, glowRadius, distance(p, sun))) * glowStrength);
  }
  void main() {
    // 4 samples spread over the small pixel, so thin branches and far animals still count a little
    vec2 o = texel;
    vec3 c = 0.25 * (texture2D(scene, vUv + vec2(-o.x, -o.y)).rgb + texture2D(scene, vUv + vec2(o.x, -o.y)).rgb
                   + texture2D(scene, vUv + vec2(-o.x, o.y)).rgb + texture2D(scene, vUv + vec2(o.x, o.y)).rgb);
    vec2 p = mix(viewBox.xz, viewBox.yw, vUv);
    float open = 1.0 - smoothstep(0.04, 0.12, distance(c, skyAt(p)));
    float r = distance(p, sun);
    float lum = dot(c, vec3(0.3, 0.59, 0.11));
    float disc = (1.0 - smoothstep(sunR * 0.8, sunR, r)) * smoothstep(0.72, 0.82, lum);
    open = max(open, disc);                                     // the painted sun itself shines too (not what stands in front of it)
    open *= step(horizon + 2.0, p.y);                           // nothing on the ground gives light
    float near = pow(clamp(1.0 - r / source, 0.0, 1.0), 2.0);   // brightest round the sun
    gl_FragColor = vec4(c * open * near, 1.0);
  }
`;

const raysFragment = /* glsl */`
  #define SAMPLES ${SAMPLES}
  uniform sampler2D mask;
  uniform vec2 sunUv;
  uniform float aspect, strength, len, decay, reach, tintMix, time;
  uniform float core;   // the painted sun's radius in screen heights
  uniform vec3 tint;
  varying vec2 vUv;
  float hash(vec2 p) {
    p = fract(p * vec2(127.1, 311.7));
    p += dot(p, p + 19.19);
    return fract(p.x * p.y);
  }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  void main() {
    vec2 d = vUv - sunUv;
    float dist = length(d * vec2(aspect, 1.0));                  // in screen heights
    float fade = pow(clamp(1.0 - dist / reach, 0.0, 1.0), 1.4);
    if (fade <= 0.001 || strength <= 0.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
    // every pixel takes the same number of steps to cover its own line, so the fan stays even across the screen
    vec2 stepUv = d * (len / float(SAMPLES));
    vec2 uv = vUv - stepUv * hash(gl_FragCoord.xy);              // a different start per pixel: grain instead of rings
    vec3 acc = vec3(0.0);
    float w = 1.0, wsum = 0.0;
    for (int i = 0; i < SAMPLES; i++) {
      uv -= stepUv;
      acc += texture2D(mask, clamp(uv, 0.0, 1.0)).rgb * w;
      wsum += w;
      w *= decay;
    }
    acc /= wsum;
    // dust in the air: splits the fan into separate beams that drift slowly (it moves light around, never adds)
    float ang = atan(d.y, d.x * aspect + 1e-6);
    float n = noise(vec2(ang * 7.0, dist * 3.0 + time * 0.05));
    float strands = mix(1.0, 0.3 + 1.4 * smoothstep(0.25, 0.75, n), 0.4);
    vec3 shaft = mix(acc, tint * max(max(acc.r, acc.g), acc.b), tintMix);
    float overSun = mix(0.3, 1.0, smoothstep(core * 0.6, core * 1.4, dist));   // the painted sun stays a sun, not a white blot
    gl_FragColor = vec4(shaft * strength * fade * strands * overSun, 1.0);
  }
`;

const addFragment = /* glsl */`
  uniform sampler2D scene, rays;
  uniform float showMask;
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(scene, vUv).rgb + texture2D(rays, vUv).rgb;
    gl_FragColor = vec4(mix(c, texture2D(rays, vUv).rgb, showMask), 1.0);
  }
`;

// cfg: { rays (THEME.rays), viewHeight, horizon, skyTop, skyLow, glow, glowStrength, glowRadius, sunX, sunY, sunSize }
export function makeGodRays(renderer, cfg) {
  const setting = new URLSearchParams(location.search).get('rays');
  let base = setting === null || setting === 'mask' ? cfg.rays.strength : Number(setting) || 0;
  const showMask = setting === 'mask';

  const sceneRT = new THREE.WebGLRenderTarget(1, 1, { samples: 4 });   // keeps the smooth edges the screen has
  const maskRT = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
  const raysRT = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });

  const shared = { depthTest: false, depthWrite: false, vertexShader: quadVertex };
  const maskMat = new THREE.ShaderMaterial({
    ...shared,
    fragmentShader: maskFragment,
    uniforms: {
      scene: { value: sceneRT.texture }, texel: { value: new THREE.Vector2() }, viewBox: { value: new THREE.Vector4() },
      top: { value: new THREE.Color(cfg.skyTop) }, low: { value: new THREE.Color(cfg.skyLow) }, glow: { value: cfg.glow },
      horizon: { value: cfg.horizon }, skyTop: { value: cfg.viewHeight / 2 },
      glowStrength: { value: cfg.glowStrength }, glowRadius: { value: cfg.glowRadius },
      sun: { value: new THREE.Vector2(cfg.sunX, cfg.sunY) }, sunR: { value: cfg.sunSize * 0.42 }, source: { value: cfg.rays.source },
    },
  });
  const raysMat = new THREE.ShaderMaterial({
    ...shared,
    fragmentShader: raysFragment,
    uniforms: {
      mask: { value: maskRT.texture }, sunUv: { value: new THREE.Vector2() }, aspect: { value: 1 },
      strength: { value: base }, len: { value: cfg.rays.length }, decay: { value: cfg.rays.decay }, reach: { value: cfg.rays.reach },
      tint: { value: new THREE.Color(cfg.rays.tint) }, tintMix: { value: cfg.rays.tintMix }, time: { value: 0 },
      core: { value: cfg.sunSize * 0.42 / cfg.viewHeight },
    },
  });
  const addMat = new THREE.ShaderMaterial({
    ...shared,
    fragmentShader: addFragment,
    uniforms: { scene: { value: sceneRT.texture }, rays: { value: (showMask ? maskRT : raysRT).texture }, showMask: { value: showMask ? 1 : 0 } },
  });

  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), maskMat);
  quad.frustumCulled = false;
  const quadScene = new THREE.Scene();
  quadScene.add(quad);
  const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const pass = (material, target) => {
    quad.material = material;
    renderer.setRenderTarget(target);
    renderer.render(quadScene, quadCamera);
  };

  const size = new THREE.Vector2();
  let up = 1;   // 1 by day, 0 at night
  return {
    // for trying values in the browser (window.__savanna.rays): strength, and uniforms (len, decay, reach, tint, tintMix)
    uniforms: raysMat.uniforms,
    maskUniforms: maskMat.uniforms,   // source = how far round the sun the sky gives light
    get strength() { return base; },
    set strength(v) { base = v; },
    // after every resize: view = { left, right } of the screen in scene units
    fit(view) {
      renderer.getDrawingBufferSize(size);
      sceneRT.setSize(size.x, size.y);
      const h = Math.min(SMALL_H, size.y), w = Math.max(1, Math.round(h * size.x / size.y));
      maskRT.setSize(w, h);
      raysRT.setSize(w, h);
      maskMat.uniforms.texel.value.set(0.25 / w, 0.25 / h);
      const half = cfg.viewHeight / 2;
      maskMat.uniforms.viewBox.value.set(view.left, view.right, -half, half);
      raysMat.uniforms.aspect.value = size.x / size.y;
      raysMat.uniforms.sunUv.value.set((cfg.sunX - view.left) / (view.right - view.left), (cfg.sunY + half) / cfg.viewHeight);
    },
    setSunUp(k) { up = k; },
    render(scene, camera, time) {
      raysMat.uniforms.time.value = time;
      if (base * up <= 0) {   // off, or night: the scene straight to the screen as before
        renderer.setRenderTarget(null);
        renderer.render(scene, camera);
        return;
      }
      raysMat.uniforms.strength.value = base * up;
      renderer.setRenderTarget(sceneRT);
      renderer.render(scene, camera);
      pass(maskMat, maskRT);
      if (!showMask) pass(raysMat, raysRT);
      pass(addMat, null);
    },
  };
}
