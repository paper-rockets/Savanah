// Shared uniforms + GLSL helpers. Every custom material spreads U into its uniforms,
// so changing U.x.value updates the whole world at once.
import * as THREE from 'three';
import { WATER_Y } from './world.js';

export const U = {
  uTime: { value: 0 },
  uSunDir: { value: new THREE.Vector3(0, 0.5, -1).normalize() },
  uSunColor: { value: new THREE.Color(1, 1, 1) },
  uSunGlow: { value: 0.3 },
  uAmbSky: { value: new THREE.Color(0.6, 0.65, 0.75) },
  uAmbGnd: { value: new THREE.Color(0.5, 0.4, 0.3) },
  uFogColor: { value: new THREE.Color(0.75, 0.85, 0.95) },
  uFogDensity: { value: 0.0026 },
  uZenith: { value: new THREE.Color(0.2, 0.5, 0.9) },
  uHorizon: { value: new THREE.Color(0.75, 0.85, 0.95) },
  uTint: { value: new THREE.Color(1, 1, 1) },
  uCloudShadow: { value: 0.2 },
  uWaterCol: { value: new THREE.Color(0.1, 0.45, 0.65) },
  uNearDark: { value: 0 },
};

export const COMMON = /* glsl */`
uniform float uTime;
uniform vec3 uSunDir, uSunColor, uAmbSky, uAmbGnd, uFogColor, uZenith, uHorizon, uTint, uWaterCol;
uniform float uSunGlow, uFogDensity, uCloudShadow, uNearDark;
#define WATER_Y ${WATER_Y.toFixed(2)}

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = hash(i), b = hash(i + vec2(1.0, 0.0)), c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm2(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s / 0.9375; }
float fbm3o(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 3; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s / 0.875; }

vec3 lightAt(vec3 N, float sunAmt) {
  float d = max(dot(N, uSunDir), 0.0);
  return (uAmbSky * (0.55 + 0.45 * N.y) + uAmbGnd * (0.45 - 0.45 * N.y) + uSunColor * d * sunAmt) * uTint;
}
float cloudShade(vec2 p) {
  float c = smoothstep(0.52, 0.7, fbm3o(p * 0.0028 + uTime * vec2(0.010, 0.004)));
  return 1.0 - uCloudShadow * c;
}
// our colours are written as screen colours; the scene is drawn into an off-screen picture
// (for the god rays) that OutputPass turns back into screen colours, so hand it linear values
vec3 toLinearOut(vec3 c) { return pow(max(c, vec3(0.0)), vec3(2.2)); }
vec3 applyFog(vec3 col, vec3 wpos) {
  vec3 d = wpos - cameraPosition; float dist = length(d); vec3 V = d / max(dist, 1e-4);
  // sunset paintings: the foreground goes dark, almost a silhouette
  col *= mix(1.0, 0.22, uNearDark * (1.0 - smoothstep(6.0, 110.0, dist)));
  float f = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
  vec3 fc = mix(uFogColor, uSunColor, pow(max(dot(V, uSunDir), 0.0), 6.0) * uSunGlow);
  return mix(col, fc, f);
}
`;

export function shaderMat(opts) {
  return new THREE.ShaderMaterial({
    ...opts,
    uniforms: { ...U, ...(opts.uniforms || {}) },
    vertexShader: opts.vertexShader,
    fragmentShader: COMMON + opts.fragmentShader,
  });
}
