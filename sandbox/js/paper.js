// Painted finish: a still paper grain with faint brush fibres, plus a gentle colour grade
// (slightly softer colour, warm shadows, light vignette). Runs last, on screen colours.
import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

export function makePaperPass() {
  const pass = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      uGrain: { value: 1.0 },   // paper grain, every mood
      uGrade: { value: 0.0 },   // colour grade amount, per mood (presets.js "grade")
    },
    vertexShader: `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform float uGrain, uGrade;
      varying vec2 vUv;
      float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float vnoise(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      void main() {
        vec3 col = texture2D(tDiffuse, vUv).rgb;
        vec2 px = gl_FragCoord.xy;
        // paper: fine tooth, soft blotches, and long faint fibres (fixed to the screen, like the canvas)
        float tooth = vnoise(px * 0.55);
        float blotch = vnoise(px * 0.012 + 3.0);
        float fibre = vnoise(vec2(px.x * 0.9 + px.y * 0.25, px.y * 0.05));
        float paper = tooth * 0.45 + blotch * 0.35 + fibre * 0.20 - 0.5;
        col *= 1.0 + paper * 0.075 * uGrain;
        // grade: a touch less saturated, warm lifted shadows, light vignette
        float lum = dot(col, vec3(0.299, 0.587, 0.114));
        col = mix(col, vec3(lum), 0.08 * uGrade);
        col += (1.0 - lum) * vec3(0.035, 0.022, 0.0) * uGrade;
        col *= 1.0 - 0.14 * uGrade * pow(length(vUv - 0.5) * 1.35, 2.5);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  return pass;
}
