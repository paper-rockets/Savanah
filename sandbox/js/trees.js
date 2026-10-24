// Your trees: drop .glb files in trees/ and list them in trees/manifest.json, e.g.
// { "trees": [ { "file": "acacia.glb", "height": 9, "weight": 3 }, { "file": "baobab.glb", "height": 12, "weight": 1, "max": 20, "radius": 300 } ] }
// Every mesh inside a tree file becomes one instanced draw call, so hundreds of trees stay cheap.
// Spots are filled nearest-first; "max" caps how many copies of a tree exist and "radius" how far
// out it appears, so heavy, detailed trees stay near the camera and light ones fill the distance.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { sample, pathX, WATER_Y } from './world.js';
import { ihash, snoise } from './noise.js';

const MAX_PER_TYPE = 700;
const FLAT = 0.7;   // 0 = normal 3D shading, 1 = every side lit the same (flat painted look)

// Flat painted lighting: bend each surface's normal toward straight up, so the sun and sky
// light the whole tree almost evenly (still in the mood's colours) instead of hard light/shadow sides.
function flatten(m) {
  m.onBeforeCompile = sh => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
      normal = normalize(mix(normal, normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz), ${FLAT.toFixed(2)}));`);
  };
}

export class Trees {
  constructor(scene, { radius = 520, cell = 30, maxScale = 1 } = {}) {
    this.scene = scene; this.radius = radius; this.cell = cell; this.maxScale = maxScale;
    this.types = []; this.center = null;
    this.s = { h: 0, rock: 0, basin: 0 };
    this.status = 'no trees yet';
  }

  async load() {
    let list;
    try {
      const r = await fetch('trees/manifest.json', { cache: 'no-store' });
      if (!r.ok) return;
      list = (await r.json()).trees || [];
    } catch { return; }
    const loader = new GLTFLoader();
    const draco = new DRACOLoader();   // trees/ files are Draco-compressed by tools/compress_tree.py
    draco.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/draco/gltf/');
    loader.setDRACOLoader(draco);
    for (const t of list) {
      try {
        const gltf = await loader.loadAsync('trees/' + t.file);
        const root = gltf.scene;
        root.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(root);
        const base = new THREE.Matrix4().makeScale(1, 1, 1);
        const norm = (t.height || 9) / Math.max(0.001, box.max.y - box.min.y);
        const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
        base.makeTranslation(-cx * norm, -box.min.y * norm, -cz * norm).multiply(new THREE.Matrix4().makeScale(norm, norm, norm));
        const parts = [];
        const max = Math.max(1, Math.round(Math.min(t.max || MAX_PER_TYPE, MAX_PER_TYPE) * this.maxScale));
        root.traverse(o => {
          if (!o.isMesh) return;
          const local = base.clone().multiply(o.matrixWorld);
          const im = new THREE.InstancedMesh(o.geometry, o.material, max);
          im.count = 0; im.frustumCulled = false;
          // trees are never metal; metal shows black here because the scene has no reflection map
          [].concat(o.material).forEach(m => { m.fog = true; if ('metalness' in m) { m.metalness = 0; m.roughness = Math.max(m.roughness, 0.8); } flatten(m); });
          this.scene.add(im);
          parts.push({ im, local });
        });
        this.types.push({ parts, weight: t.weight || 1, sink: t.sink || 0.2, max, radius: t.radius || this.radius });
      } catch (err) { console.warn('tree failed', t.file, err); }
    }
    this.status = this.types.length + ' tree type(s)';
    this.center = null;
  }

  update(cam, force = false) {
    if (!this.types.length) return;
    const x = cam.position.x, z = cam.position.z;
    if (!force && this.center && Math.hypot(x - this.center[0], z - this.center[1]) < 45) return;
    this.center = [x, z];
    const c = this.cell, R = this.radius, n = Math.ceil(R / c);
    const ix0 = Math.floor(x / c), iz0 = Math.floor(z / c);
    const total = this.types.reduce((a, t) => a + t.weight, 0);
    const counts = this.types.map(() => 0);
    const s = this.s, m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    // collect every spot, nearest first
    const spots = [];
    for (let j = -n; j <= n; j++) for (let i = -n; i <= n; i++) {
      const gx = ix0 + i, gz = iz0 + j;
      const px = (gx + 0.15 + ihash(gx, gz, 21) * 0.7) * c, pz = (gz + 0.15 + ihash(gx, gz, 22) * 0.7) * c;
      const d2 = (px - x) ** 2 + (pz - z) ** 2;
      if (d2 > R * R) continue;
      const clump = snoise(px * 0.0045 - 20, pz * 0.0045 + 5);
      const chance = 0.12 + 0.55 * Math.max(0, clump);
      if (ihash(gx, gz, 23) > chance) continue;
      if (Math.abs(px - pathX(pz)) < 7) continue;
      spots.push({ gx, gz, px, pz, d2 });
    }
    spots.sort((a, b) => a.d2 - b.d2);
    for (const { gx, gz, px, pz, d2 } of spots) {
      sample(px, pz, s);
      if (s.rock > 0.35 || s.h < WATER_Y + 0.8) continue;
      let pick = ihash(gx, gz, 24) * total, ti = 0;
      while (ti < this.types.length - 1 && pick > this.types[ti].weight) { pick -= this.types[ti].weight; ti++; }
      const T = this.types[ti];
      if (counts[ti] >= T.max || d2 > T.radius * T.radius) continue;
      // about 1 tree in 7 is a grand old giant, half as big again (the framing trees of the paintings)
      const size = (0.75 + ihash(gx, gz, 25) * 0.55) * (ihash(gx, gz, 27) < 0.14 ? 1.5 : 1);
      q.setFromAxisAngle(up, ihash(gx, gz, 26) * 6.283);
      v.set(px, s.h - T.sink, pz); sc.set(size, size, size);
      m.compose(v, q, sc);
      for (const p of T.parts) p.im.setMatrixAt(counts[ti], new THREE.Matrix4().multiplyMatrices(m, p.local));
      counts[ti]++;
    }
    this.types.forEach((T, ti) => T.parts.forEach(p => { p.im.count = counts[ti]; p.im.instanceMatrix.needsUpdate = true; }));
  }
}
