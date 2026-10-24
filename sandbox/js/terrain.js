// Endless terrain in 96 m chunks around the camera, 3 detail levels, skirts hide the seams.
import * as THREE from 'three';
import { sample } from './world.js';
import { shaderMat } from './shaderlib.js';

export const CHUNK = 96;
const LOD_N = [49, 25, 13];          // vertices per side -> 2 m, 4 m, 8 m spacing
const SKIRT = 4;
const indexCache = {};

function gridIndex(m) {             // m = vertices per side incl. skirt ring
  if (indexCache[m]) return indexCache[m];
  const idx = new Uint32Array((m - 1) * (m - 1) * 6);
  let k = 0;
  for (let j = 0; j < m - 1; j++) for (let i = 0; i < m - 1; i++) {
    const a = i + j * m, b = a + 1, c = a + m, d = c + 1;
    idx[k++] = a; idx[k++] = c; idx[k++] = b;
    idx[k++] = b; idx[k++] = c; idx[k++] = d;
  }
  return (indexCache[m] = new THREE.BufferAttribute(idx, 1));
}

const groundMat = shaderMat({
  vertexShader: /* glsl */`
    attribute vec2 aInfo;
    varying vec3 vWorld; varying vec3 vNormal; varying vec2 vInfo;
    void main() {
      vWorld = position; vNormal = normal; vInfo = aInfo;
      gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */`
    varying vec3 vWorld; varying vec3 vNormal; varying vec2 vInfo;
    void main() {
      vec3 N = normalize(vNormal);
      vec2 p = vWorld.xz;
      float dist = distance(vWorld, cameraPosition);
      float det = 1.0 - smoothstep(30.0, 150.0, dist);   // strokes up close, a smooth painted middle ground

      float big = fbm2(p * 0.0045);
      float mid = fbm2(p * 0.03 + 7.3);
      vec2 q = mat2(0.85, -0.52, 0.52, 0.85) * p;
      float strokes = vnoise(vec2(q.x * 0.45, q.y * 3.0)) * 0.6 + vnoise(vec2(q.x * 1.6, q.y * 9.0)) * 0.4;
      strokes = mix(0.5, strokes, det);

      // softer olive-gold than before (was a strong yellow-orange)
      vec3 gold = vec3(0.84, 0.72, 0.36), straw = vec3(0.92, 0.83, 0.52);
      vec3 dry = vec3(0.80, 0.56, 0.30), lush = vec3(0.50, 0.58, 0.26);
      vec3 col = mix(gold, straw, smoothstep(0.35, 0.75, mid) * mix(0.5, 1.0, det));
      col = mix(col, dry, smoothstep(0.55, 0.80, big) * 0.55);
      col = mix(col, lush, smoothstep(0.40, 0.20, big) * 0.5);
      col *= 0.82 + 0.32 * strokes;

      // waterhole edge: green ring, then mud
      float sh = smoothstep(WATER_Y + 1.2, WATER_Y - 0.3, vWorld.y);
      float ring = smoothstep(0.0, 0.25, vInfo.y) * smoothstep(WATER_Y + 7.0, WATER_Y + 2.5, vWorld.y) * (1.0 - sh);
      col = mix(col, lush * (0.85 + 0.3 * strokes), ring * 0.75);
      col = mix(col, vec3(0.48, 0.34, 0.22), sh * 0.9);

      // rock outcrops, red-orange with lavender, layered bands
      float rk = max(smoothstep(0.10, 0.40, vInfo.x), smoothstep(0.78, 0.55, N.y));
      vec3 rc = mix(vec3(0.82, 0.38, 0.18), vec3(0.58, 0.32, 0.38), smoothstep(0.35, 0.7, fbm2(p * 0.05)));
      rc *= 0.86 + 0.16 * sin(vWorld.y * 2.4 + fbm2(p * 0.15) * 5.0);
      rc = mix(rc, rc * vec3(1.1, 1.05, 0.9), smoothstep(0.6, 1.0, N.y));
      col = mix(col, rc, rk);

      // dirt road
      float px = sin(vWorld.z * 0.006) * 55.0 + sin(vWorld.z * 0.017 + 1.0) * 14.0;
      float d = abs(vWorld.x - px);
      float w = 3.0 + 1.6 * vnoise(vec2(p.y * 0.08, 3.0));
      float pm = smoothstep(w, w - 1.6, d + (vnoise(p * 0.6) - 0.5) * 1.3) * (1.0 - rk) * (1.0 - sh);
      vec3 sand = vec3(0.96, 0.80, 0.53) * (0.92 + 0.12 * strokes);
      sand *= 1.0 - 0.16 * smoothstep(0.35, 0.0, abs(d - 1.1));
      col = mix(col, sand, pm);

      col *= lightAt(N, 1.0) * cloudShade(p);
      gl_FragColor = vec4(toLinearOut(applyFog(col, vWorld)), 1.0);
    }`,
});

export class Terrain {
  constructor(scene, radius = 8) {
    this.scene = scene;
    this.radius = radius;
    this.chunks = new Map();
    this.queue = [];
    this.s = { h: 0, rock: 0, basin: 0 };
  }

  lodFor(dc) { return dc <= 1 ? 0 : dc <= 3 ? 1 : 2; }

  build(cx, cz, lod) {
    const n = LOD_N[lod], m = n + 2, step = CHUNK / (n - 1);
    const x0 = cx * CHUNK, z0 = cz * CHUNK;
    const H = new Float32Array(m * m), R = new Float32Array(m * m), B = new Float32Array(m * m);
    const s = this.s;
    for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) {
      sample(x0 + (i - 1) * step, z0 + (j - 1) * step, s);
      const k = i + j * m; H[k] = s.h; R[k] = s.rock; B[k] = s.basin;
    }
    const pos = new Float32Array(m * m * 3), nor = new Float32Array(m * m * 3), info = new Float32Array(m * m * 2);
    for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) {
      const gi = Math.min(Math.max(i, 1), n), gj = Math.min(Math.max(j, 1), n);   // grid point inside 1..n
      const k = gi + gj * m, v = i + j * m;
      const skirt = (i === 0 || j === 0 || i === m - 1 || j === m - 1);
      pos[v * 3] = x0 + (gi - 1) * step;
      pos[v * 3 + 1] = H[k] - (skirt ? SKIRT : 0);
      pos[v * 3 + 2] = z0 + (gj - 1) * step;
      const dx = H[k + 1] - H[k - 1], dz = H[k + m] - H[k - m];
      const nx = -dx, ny = 2 * step, nz = -dz, l = Math.hypot(nx, ny, nz);
      nor[v * 3] = nx / l; nor[v * 3 + 1] = ny / l; nor[v * 3 + 2] = nz / l;
      info[v * 2] = R[k]; info[v * 2 + 1] = B[k];
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('aInfo', new THREE.BufferAttribute(info, 2));
    g.setIndex(gridIndex(m));
    g.computeBoundingSphere();
    return g;
  }

  update(camX, camZ, budgetMs) {
    const ccx = Math.floor(camX / CHUNK), ccz = Math.floor(camZ / CHUNK), R = this.radius;
    const want = new Map();
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      if (dx * dx + dz * dz > (R + 0.5) * (R + 0.5)) continue;
      want.set((ccx + dx) + ',' + (ccz + dz), { cx: ccx + dx, cz: ccz + dz, lod: this.lodFor(Math.max(Math.abs(dx), Math.abs(dz))), d: dx * dx + dz * dz });
    }
    for (const [key, c] of this.chunks) {
      if (!want.has(key)) { this.scene.remove(c.mesh); c.mesh.geometry.dispose(); this.chunks.delete(key); }
    }
    const todo = [];
    for (const [key, w] of want) {
      const c = this.chunks.get(key);
      if (!c || c.lod !== w.lod) todo.push([key, w]);
    }
    todo.sort((a, b) => a[1].d - b[1].d);
    const t0 = performance.now();
    for (const [key, w] of todo) {
      if (performance.now() - t0 > budgetMs) break;
      const g = this.build(w.cx, w.cz, w.lod);
      const old = this.chunks.get(key);
      if (old) { old.mesh.geometry.dispose(); old.mesh.geometry = g; old.lod = w.lod; }
      else {
        const mesh = new THREE.Mesh(g, groundMat);
        this.scene.add(mesh);
        this.chunks.set(key, { mesh, lod: w.lod });
      }
    }
    return todo.length;   // how many were waiting at the start of this call
  }
}
