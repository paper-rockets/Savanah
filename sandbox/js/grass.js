// Wind-blown grass tufts near the camera. One instanced draw call; positions are rebuilt
// a slice per frame when the camera has moved, then swapped in.
import * as THREE from 'three';
import { sample, pathX, WATER_Y } from './world.js';
import { ihash, snoise } from './noise.js';
import { shaderMat } from './shaderlib.js';

function tuftGeometry() {
  const pos = [], hgt = [];
  const blades = 9;
  for (let b = 0; b < blades; b++) {
    const a = (b / blades) * Math.PI * 2 + ihash(b, 3) * 0.7;
    const r = 0.05 + ihash(b, 5) * 0.16;
    const h = 0.55 + ihash(b, 7) * 0.65;
    const lean = 0.18 + ihash(b, 9) * 0.35;
    const w = 0.045 + ihash(b, 11) * 0.03;
    const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
    const tx = Math.cos(a + 1.57), tz = Math.sin(a + 1.57);          // blade width direction
    const ox = Math.cos(a) * lean, oz = Math.sin(a) * lean;           // leans outward
    const seg = [[0, 1], [0.5, 0.62], [1, 0]];
    for (let s = 0; s < 2; s++) {
      const [y0, w0] = seg[s], [y1, w1] = seg[s + 1];
      const p0 = [cx + ox * y0 * y0 - tx * w * w0, h * y0, cz + oz * y0 * y0 - tz * w * w0];
      const p1 = [cx + ox * y0 * y0 + tx * w * w0, h * y0, cz + oz * y0 * y0 + tz * w * w0];
      const p2 = [cx + ox * y1 * y1 - tx * w * w1, h * y1, cz + oz * y1 * y1 - tz * w * w1];
      const p3 = [cx + ox * y1 * y1 + tx * w * w1, h * y1, cz + oz * y1 * y1 + tz * w * w1];
      pos.push(...p0, ...p1, ...p2, ...p2, ...p1, ...p3);
      hgt.push(y0, y0, y1, y1, y0, y1);
    }
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aH', new THREE.Float32BufferAttribute(hgt, 1));
  return g;
}

export class Grass {
  constructor(scene, { count = 14000, radius = 70 } = {}) {
    this.max = count; this.radius = radius;
    this.cell = Math.sqrt((Math.PI * radius * radius) / count) * 0.92;
    const g = tuftGeometry();
    this.front = new Float32Array(count * 4);
    this.back = new Float32Array(count * 4);
    this.attr = new THREE.InstancedBufferAttribute(this.front, 4);
    this.attr.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iData', this.attr);
    g.instanceCount = 0;
    this.geo = g;
    this.mat = shaderMat({
      side: THREE.DoubleSide,
      uniforms: { uRadius: { value: radius - 12 } },   // fade ends before the rebuild edge
      vertexShader: /* glsl */`
        uniform float uTime, uRadius;
        attribute float aH; attribute vec4 iData;
        varying float vH; varying float vTint; varying vec3 vWorld; varying float vNear;
        void main() {
          float seed = fract(iData.w * 7.31);
          float rot = iData.w * 6.2831;
          float d = distance(iData.xz, cameraPosition.xz);
          float s = (0.75 + seed * 0.7) * smoothstep(uRadius, uRadius * 0.55, d);
          s *= mix(1.35, 1.0, smoothstep(8.0, 28.0, d));   // taller, denser-looking band right in front
          vNear = 1.0 - smoothstep(6.0, 26.0, d);
          vec3 p = position;
          float c = cos(rot), sn = sin(rot);
          p.xz = vec2(c * p.x - sn * p.z, sn * p.x + c * p.z) * s;
          p.y *= s * (0.8 + 0.5 * fract(seed * 13.7));
          float gust = sin(uTime * 0.7 + iData.x * 0.05 + iData.z * 0.03) * 0.5 + 0.5;
          float wind = (sin(uTime * 1.9 + iData.x * 0.4 + iData.z * 0.3) * 0.18 + 0.12) * (0.4 + gust);
          float bend = aH * aH;
          p.x += wind * bend * s; p.z += wind * 0.4 * bend * s; p.y -= abs(wind) * bend * 0.15 * s;
          vWorld = iData.xyz + p;
          vH = aH; vTint = seed;
          gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
        }`,
      fragmentShader: /* glsl */`
        varying float vH; varying float vTint; varying vec3 vWorld; varying float vNear;
        void main() {
          // soft olive-gold, matched to the ground; only a hint of warm tips
          vec3 root = vec3(0.40, 0.34, 0.14), tip = vec3(0.86, 0.78, 0.44);
          tip = mix(tip, vec3(0.60, 0.63, 0.30), smoothstep(0.30, 0.0, vTint));
          tip = mix(tip, vec3(0.90, 0.74, 0.42), smoothstep(0.85, 1.0, vTint));
          float dryPatch = vnoise(vWorld.xz * 0.02);
          tip = mix(tip, tip * vec3(1.0, 0.92, 0.80), smoothstep(0.55, 0.8, dryPatch) * 0.5);
          vec3 col = mix(root, tip, smoothstep(0.0, 0.9, vH));
          col *= mix(1.0, 0.72, vNear);   // darker foreground band, as in the paintings
          vec3 N = vec3(0.0, 1.0, 0.0);
          vec3 l = lightAt(N, 0.9);
          // light shining through the blades when looking toward the sun
          vec3 V = normalize(vWorld - cameraPosition);
          l += uSunColor * pow(max(dot(V, uSunDir), 0.0), 4.0) * vH * 0.6 * uTint;
          col *= l * cloudShade(vWorld.xz);
          gl_FragColor = vec4(toLinearOut(applyFog(col, vWorld)), 1.0);
        }`,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.center = null;
    this.job = null;
    this.s = { h: 0, rock: 0, basin: 0 };
  }

  *rebuild(cx, cz) {
    const c = this.cell, R = this.radius, n = Math.ceil(R / c);
    const ix0 = Math.floor(cx / c), iz0 = Math.floor(cz / c);
    let k = 0;
    const s = this.s, out = this.back;
    for (let j = -n; j <= n; j++) {
      for (let i = -n; i <= n; i++) {
        if (k >= this.max) break;
        const gx = ix0 + i, gz = iz0 + j;
        const x = (gx + ihash(gx, gz, 1)) * c, z = (gz + ihash(gx, gz, 2)) * c;
        const dx = x - cx, dz = z - cz;
        if (dx * dx + dz * dz > R * R) continue;
        sample(x, z, s);
        if (s.rock > 0.25 || s.h < WATER_Y + 0.15) continue;
        if (Math.abs(x - pathX(z)) < 2.6 + ihash(gx, gz, 4) * 1.5) continue;
        // uneven clumps with bare gaps instead of even rows (always full right in front)
        const near = Math.hypot(dx, dz) < 14;
        if (!near && ihash(gx, gz, 5) > 0.25 + 0.9 * (snoise(x * 0.06, z * 0.06) * 0.5 + 0.5)) continue;
        out[k * 4] = x; out[k * 4 + 1] = s.h - 0.05; out[k * 4 + 2] = z; out[k * 4 + 3] = ihash(gx, gz, 3);
        k++;
      }
      yield;
    }
    return k;
  }

  update(cam, budgetMs, force = false) {
    const x = cam.position.x, z = cam.position.z;
    if (!this.job && (force || !this.center || Math.hypot(x - this.center[0], z - this.center[1]) > 10)) {
      this.job = this.rebuild(x, z); this.jobCenter = [x, z];
    }
    if (!this.job) return;
    const t0 = performance.now();
    while (performance.now() - t0 < budgetMs) {
      const r = this.job.next();
      if (r.done) {
        const tmp = this.front; this.front = this.back; this.back = tmp;
        this.attr.array = this.front;
        this.attr.needsUpdate = true;
        this.geo.instanceCount = r.value;
        this.center = this.jobCenter; this.job = null;
        break;
      }
    }
  }
}
