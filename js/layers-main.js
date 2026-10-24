// Second version for comparing: the "layers" art. Each full-width strip
// (sky, clouds, hills, ground, front grass) repeats endlessly and slides at
// its own speed; single trees, rocks and animals are scattered on top.
// Laid out like the composite.png the art came with.
import * as THREE from 'three';
import { loadPieces, makeCard } from './sprites.js';
import { Lane, makeRng } from './lanes.js';

THREE.ColorManagement.enabled = false;   // colours exactly as painted

const params = new URLSearchParams(location.search);
const VIEW_H = 720;                      // the strips are 724 px tall and fill the screen height
const SCALE = VIEW_H / 724;
const BASE_SPEED = Number(params.get('speed') ?? 70);
const seed = Number(params.get('seed') ?? 7);
const FAST_FORWARD = Number(params.get('ff') ?? 0);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const rowToY = (row) => VIEW_H / 2 - row * SCALE;   // a pixel row of the strips -> scene height

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-640, 640, VIEW_H / 2, -VIEW_H / 2, -10, 10);
const view = { left: -640, right: 640 };

// back to front; share = part of the front speed, drift = own speed (clouds)
const STRIPS = [
  { name: '01_sky', share: 0, order: 0 },
  { name: '03_clouds_far', share: 0.02, drift: 4, order: 20 },
  { name: '04_clouds_near', share: 0.05, drift: 8, order: 30 },
  { name: '05_hills_far', share: 0.1, order: 40 },
  { name: '06_trees_distant', share: 0.2, order: 50 },
  { name: '08_ground_mid', share: 0.45, order: 60 },
  { name: '09_foreground', share: 1.15, order: 100 },
];
const ORDER = { sun: 10, midProps: 70, nearProps: 80, birds: 110 };

const P = (n) => `layers_props/${n}`;
const strips = [];

function makeStrip(tex, s) {
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  const material = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  mesh.renderOrder = s.order;
  scene.add(mesh);
  // the strip's own width in scene units: one copy before it repeats
  strips.push({ ...s, mesh, tex, width: tex.image.width * SCALE, offset: 0 });
}

function fitStrips() {
  const w = view.right - view.left;
  for (const s of strips) {
    s.mesh.scale.set(w, VIEW_H, 1);
    s.tex.repeat.x = w / s.width;
  }
}

// --- single pieces scattered on the ground strips ---
const lanes = [];
const addLane = (opts) => { const l = new Lane(scene, makeRng(seed * 31 + lanes.length), opts); lanes.push(l); return l; };

function prop(lane, name, x, height, order) {
  const y = lane.randomY();
  const m = makeCard(name, height * lane.rng.range(0.9, 1.1), 0, new THREE.Color(0, 0, 0));
  lane.place(m, x + m.scale.x / 2, y, order + Math.round(-y));   // lower on screen = in front
  return m.scale.x;
}

// middle ground: small acacias, termite mounds, giraffes (moves with the middle ground strip)
addLane({
  factor: 0.45, yTop: rowToY(560), yBottom: rowToY(590), firstGap: 200,
  make: ({ lane, rng, x }) => {
    const pick = rng.weighted([
      { weight: 3, name: P('12_tree_acacia_small'), h: 150 },
      { weight: 2, name: P('13_rock_terracotta_mound'), h: 45 },
      { weight: 1.5, name: P('14_animal_giraffe'), h: 120 },
      { weight: 1, name: P('13_rock_boulder'), h: 28 },
    ]);
    return { width: prop(lane, pick.name, x, pick.h, ORDER.midProps) };
  },
  gap: (r) => r.range(120, 520),
});

// near: the big baobab and acacia, elephants, boulders (between middle ground and front grass)
addLane({
  factor: 0.75, yTop: rowToY(600), yBottom: rowToY(650), firstGap: 300,
  make: ({ lane, rng, x }) => {
    const pick = rng.weighted([
      { weight: 2, name: P('10_tree_baobab'), h: 430 },
      { weight: 2, name: P('11_tree_acacia_big'), h: 300 },
      { weight: 1, make: elephants },
      { weight: 2, name: P('13_rock_boulder'), h: 55 },
      { weight: 1, name: P('13_rock_terracotta_mound'), h: 75 },
    ]);
    if (pick.make) return pick.make(lane, rng, x);
    return { width: prop(lane, pick.name, x, pick.h, ORDER.nearProps) };
  },
  gap: (r) => r.range(150, 600),
});

// mother and baby together (the pictures face us, so they stand rather than walk)
function elephants(lane, rng, x) {
  const w1 = prop(lane, P('14_animal_elephant'), x, 180, ORDER.nearProps);
  const w2 = prop(lane, P('14_animal_baby_elephant'), x + w1 * 0.55, 115, ORDER.nearProps + 60);
  return { width: w1 * 0.55 + w2 };
}

// birds cross the sky on their own
addLane({
  factor: 0, drift: 80, yTop: 330, yBottom: 220, firstGap: 400,
  make: ({ lane, rng, x }) => {
    let cx = x;
    const n = 2 + Math.floor(rng() * 4);
    for (let i = 0; i < n; i++) {
      const m = makeCard(P(`15_bird_${Math.floor(rng() * 5)}`), rng.range(24, 34), 0, new THREE.Color(0, 0, 0));
      lane.place(m, cx, lane.randomY(), ORDER.birds);
      m.userData.vx = rng.range(-6, 6);
      cx += rng.range(30, 70);
    }
    return { width: cx - x };
  },
  gap: (r) => r.range(900, 2000),
});

function addSun() {
  const sun = makeCard(P('02_sun'), 118, 0, new THREE.Color(0, 0, 0));
  sun.position.set(0, rowToY(442), 0);
  sun.renderOrder = ORDER.sun;
  scene.add(sun);
}

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  const halfW = (VIEW_H * w / h) / 2;
  camera.left = -halfW; camera.right = halfW;
  camera.updateProjectionMatrix();
  view.left = -halfW; view.right = halfW;
  fitStrips();
}

const loading = document.getElementById('loading');
const clock = new THREE.Clock();

async function start() {
  const loader = new THREE.TextureLoader();
  const props = ['02_sun', '10_tree_baobab', '11_tree_acacia_big', '12_tree_acacia_small', '13_rock_boulder',
    '13_rock_terracotta_mound', '14_animal_baby_elephant', '14_animal_elephant', '14_animal_giraffe',
    '15_bird_0', '15_bird_1', '15_bird_2', '15_bird_3', '15_bird_4'].map(P);
  const [textures] = await Promise.all([
    Promise.all(STRIPS.map((s) => loader.loadAsync(`art/layers/${s.name}.png`))),
    loadPieces(props),
  ]);
  STRIPS.forEach((s, i) => makeStrip(textures[i], s));
  addSun();
  loading.remove();
  resize();
  addEventListener('resize', resize);
  const step = (dt) => {
    const speed = BASE_SPEED * (reduceMotion.matches ? 0.25 : 1);
    for (const s of strips) {
      s.offset += (speed * s.share + (s.drift || 0)) * dt;
      const u = s.offset / s.width;
      s.tex.offset.x = u - Math.floor(u);
    }
    for (const lane of lanes) lane.update(dt, speed, view);
  };
  for (let t = 0; t < FAST_FORWARD; t += 1 / 30) step(1 / 30);
  renderer.setAnimationLoop(() => {
    step(Math.min(clock.getDelta(), 0.1));
    renderer.render(scene, camera);
  });
}

start().catch((err) => { loading.textContent = err.message; console.error(err); });
window.__savanna = { lanes, renderer };
