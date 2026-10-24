// Endless savanna: painted cut-outs standing on a flat plain, each sliding at its own speed.
import * as THREE from 'three';
import { CATALOG, BIRD, allPieceNames } from './catalog.js';
import { MODELS, KINDS, HERDS, STAND_HERDS, MIXES, loadModels, addLights, makeAnimal, settle } from './models3d.js';
import { TREE_MODELS, loadTrees, makeTree, turnTrees } from './trees3d.js';
import { makeSleep } from './sleep.js';
import { makeNight } from './night.js';
import { loadPieces, makeCard, piece, addShadow, warmUp } from './sprites.js';
import { Lane, makeRng } from './lanes.js';
import { makeBackdrop } from './backdrop.js';
import { HORIZON, FRONT_D, UNITS_PER_METRE_PER_D, yAt, depthOf, unitsPerMetre, hazeAt, shadowSquash, LAYER, standingOrder } from './depth.js';
import { THEME, TIME } from './theme.js';

THREE.ColorManagement.enabled = false;   // colours exactly as painted

const params = new URLSearchParams(location.search);
const VIEW_H = 720;                      // scene is always 720 units tall; width follows the window
const SKY_LOW = THEME.skyLow;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const BASE_SPEED = Number(params.get('speed') ?? 70);   // units a second at the bottom of the screen
const seed = Number(params.get('seed') ?? 7);
const ONLY_KIND = params.get('kind');    // test: every herd is two of this kind (e.g. ?kind=zebra)
const ANIMAL_MAX_UNITS = 90;            // no animal stands taller than this on screen (about an eighth), so giraffes and elephants stay far back
const MAX_STRETCH = 0.85;                // other pictures: at most this x their own pixels, so they stay sharp on a tablet
const FAST_FORWARD = Number(params.get('ff') ?? 0);    // test: skip ahead this many seconds
const TREES = (params.get('trees') ?? '').split(',');   // test: 'only' = only trees that have a 3D model, 'flat' = no 3D trees; 'only,flat' = the same trees flat

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.setPixelRatio(Math.min(devicePixelRatio, 3));   // full sharpness on phones (most screens are 1-2)

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-640, 640, VIEW_H / 2, -VIEW_H / 2, -40000, 40000);   // deep enough for the 3D animals
const view = { left: -640, right: 640 };

let backdrop = null;   // sky + painted ground, made once the grass picture has loaded

const hazeColor = new THREE.Color(SKY_LOW);
const FRONT_GREEN = new THREE.Color('#4f5a1c');   // dark grass along the bottom edge, from the target picture

// How a thing standing at screen height y is coloured: [haze amount, haze colour] for makeCard.
// Day: far things fade to the sky (tint = shade towards FRONT_GREEN instead). Sunset: near-silhouettes, redder far off.
const SIL = THEME.standing && [new THREE.Color(THEME.standing.near), new THREE.Color(THEME.standing.far)];
function look(y, tint = 0) {
  if (SIL) return [THEME.standing.amount, SIL[0].clone().lerp(SIL[1], Math.max(0, 1 - depthOf(y) / THEME.standing.farD) ** 1.5)];
  return tint ? [tint, FRONT_GREEN] : [hazeAt(y), hazeColor];
}
// Sky pieces, sun, birds and lakes: their sunset colour, or as painted ([haze amount, haze colour, ramp]).
function skyLook(key, haze) {
  const s = THEME.sky[key];
  if (!s) return [haze, hazeColor];
  return s.ramp ? [haze, hazeColor, s.ramp.map((c) => new THREE.Color(c))] : [s.mix[0], new THREE.Color(s.mix[1])];
}

// Stand one picture on the ground at (x = its left edge, y = its base line).
// metres = [shortest, tallest] real height; shadow = shadow width as a share of the picture width.
// tint = how much to shade it towards FRONT_GREEN instead of the sky (the grass at our feet).
function stand(lane, name, x, y, metres, shadow, tint = 0) {
  let h = lane.rng.range(metres[0], metres[1]) * unitsPerMetre(y);
  h = Math.min(h, piece(name).tex.image.height * MAX_STRETCH);   // small pictures stay sharp
  if (TREE_MODELS[name] && !TREES.includes('flat')) {   // this painting has a 3D model: stand that instead
    const tree = makeTree(name, h, ...look(y, tint), shadowSquash(y), shadow);
    lane.place(tree, x + tree.userData.halfWidth, y, standingOrder(y));
    settle(tree, depthOf(y));
    return tree;
  }
  const mesh = makeCard(name, h, ...look(y, tint));
  lane.place(mesh, x + mesh.scale.x / 2, y, standingOrder(y));
  if (shadow) addShadow(mesh, shadow, shadowSquash(y), LAYER.shadows);
  return mesh;
}

// What each kind of thing is: real height in metres, and how wide its shadow is.
const KIND = {
  distantTree: { list: CATALOG.distantTrees, metres: [5, 8], shadow: 0 },
  distantBush: { list: CATALOG.distantBushes, metres: [1.6, 2.6], shadow: 0 },
  tree:        { list: CATALOG.midTrees, metres: [5, 7.5], shadow: 0.7 },
  bigTree:     { list: CATALOG.bigTrees, metres: [7, 9], shadow: 0.7 },
  treePair:    { list: CATALOG.treePairs, metres: [5, 8], shadow: 0.7 },
  termite:     { list: CATALOG.termiteMounds, metres: [1.5, 3], shadow: 0.9 },
  rock:        { list: CATALOG.rocks, metres: [0.9, 2.4], shadow: 1.0 },
  greyRock:    { list: CATALOG.greyRocks, metres: [0.6, 2.2], shadow: 1.0 },
  reed:        { list: CATALOG.reeds, metres: [0.6, 1.0], shadow: 0.6 },
  bush:        { list: CATALOG.bushes, metres: [0.8, 1.5], shadow: 0.9 },
  patch:       { list: CATALOG.grassPatches, metres: [0.5, 0.9], shadow: 0.8 },
  mound:       { list: CATALOG.grassMounds, metres: [0.35, 0.6], shadow: 0 },
  tuft:        { list: [...CATALOG.grassMounds, ...CATALOG.grassMounds, ...CATALOG.grassPatches], metres: [0.4, 0.8], shadow: 0 },   // mostly golden grass
};

const widthOf = (m) => (m.userData.isTree3D ? m.userData.halfWidth * 2 : m.scale.x);
if (TREES.includes('only')) {   // each kind keeps only its paintings that have a 3D model
  for (const k of [KIND.tree, KIND.bigTree, KIND.treePair, KIND.bush]) k.list = k.list.filter((n) => TREE_MODELS[n]);
}

// A band of ground that drops one random kind of thing at a time.
function scatter(choices) {
  return ({ lane, rng, x }) => {
    const c = rng.weighted(choices);
    if (c.make) return c.make(lane, rng, x);
    const k = KIND[c.kind];
    const m = stand(lane, rng.pick(k.list), x, lane.randomY(), k.metres, k.shadow, c.tint);
    return { width: widthOf(m) };
  };
}

const lanes = [];
const addLane = (opts) => { const l = new Lane(scene, makeRng(seed * 97 + lanes.length), opts); lanes.push(l); return l; };

// sky things: fixed share of the speed
function skyCard(lane, name, x, y, height, haze, order, key) {
  const m = makeCard(name, height, ...skyLook(key, haze));
  lane.place(m, x + m.scale.x / 2, y, order);
  return { width: m.scale.x };
}

// clouds barely move with us, and drift on their own
addLane({
  factor: 0.03, drift: 5, yTop: 300, yBottom: 40, firstGap: 300,
  make: ({ lane, rng, x }) => skyCard(lane, rng.pick(CATALOG.clouds), x, lane.randomY(), rng.range(70, 120), 0, LAYER.clouds, 'clouds'),
  gap: (r) => r.range(40, 220),   // about twice as many clouds as the drawn-animals version
});

// far mountains, pale and blue
addLane({
  factor: 0.04, yTop: HORIZON - 1, yBottom: HORIZON - 3,
  make: ({ lane, rng, x }) => skyCard(lane, rng.pick(CATALOG.farMountains), x, lane.randomY(), rng.range(70, 95), 0.34, LAYER.farHills, 'farHills'),
  gap: (r, w) => -w * r.range(0.3, 0.55),
});

// nearer mountains
addLane({
  factor: 0.08, yTop: HORIZON - 1, yBottom: HORIZON - 4,
  make: ({ lane, rng, x }) => skyCard(lane, rng.pick(CATALOG.nearMountains), x, lane.randomY(), rng.range(55, 85), 0.18, LAYER.nearHills, 'nearHills'),
  gap: (r, w) => -w * r.range(0.2, 0.45),
});

// grass at every distance: thick near us, fine and thin far away
addLane({
  yTop: yAt(12), yBottom: yAt(215),
  make: ({ lane, rng, x }) => {
    for (let i = 0; i < 3; i++) {
      const y = yAt(12 + Math.pow(rng(), 0.8) * 203);
      const d = depthOf(y);   // the nearest tufts turn green like the grass at our feet
      stand(lane, rng.pick(KIND.tuft.list), x + rng.range(-20, 20), y, KIND.tuft.metres, 0, 0.6 * Math.min(1, Math.max(0, (d - 165) / 45)));
    }
    return { width: 0 };
  },
  gap: (r) => r.range(18, 45),
});

// along the horizon: tiny trees and bushes
addLane({
  yTop: yAt(1.5), yBottom: yAt(22),
  make: scatter([
    { weight: 3, kind: 'distantTree' },
    { weight: 3, kind: 'distantBush' },
    { weight: 1, kind: 'rock' },
  ]),
  gap: (r, w) => -w * r.range(0, 0.5) + r.range(0, 12),
});

// middle distance: trees, rocks, bushes, far herds, now and then a village
addLane({
  yTop: yAt(22), yBottom: yAt(80),
  make: scatter([
    { weight: 4, kind: 'tree' },
    { weight: 1.5, kind: 'treePair' },
    { weight: 1, kind: 'termite' },
    { weight: 2, kind: 'rock' },
    { weight: 2, kind: 'greyRock' },
    { weight: 0.5, make: lake },
    { weight: 3, kind: 'bush' },
    { weight: 3, kind: 'patch' },
    { weight: 3, make: herd },
    { weight: 3, make: grazeHerd },
    { weight: 0.5, make: village },
  ]),
  gap: (r) => r.range(10, 90),
});

// far herds: two bands of small herds so the middle of the plain is never empty
addLane({
  yTop: yAt(24), yBottom: yAt(60),
  make: ({ lane, rng, x }) => (rng() < 0.5 ? herd : grazeHerd)(lane, rng, x),
  gap: (r) => r.range(40, 160),
});
addLane({
  yTop: yAt(16), yBottom: yAt(34),   // nearer than 16 an animal is a few pixels: just a speck
  make: ({ lane, rng, x }) => (rng() < 0.5 ? herd : grazeHerd)(lane, rng, x),
  gap: (r) => r.range(60, 220),
});

// near: big trees, rocks, bushes, herds
addLane({
  yTop: yAt(80), yBottom: yAt(150),
  make: scatter([
    { weight: 2, kind: 'bigTree' },
    { weight: 1, kind: 'tree' },
    { weight: 1, kind: 'treePair' },
    { weight: 1, kind: 'termite' },
    { weight: 1, kind: 'rock' },
    { weight: 1.5, kind: 'greyRock' },
    { weight: 3, kind: 'bush' },
    { weight: 3, kind: 'patch' },
    { weight: 0.4, make: lake },
    { weight: 4, make: herd },
    { weight: 4, make: grazeHerd },
  ]),
  gap: (r) => r.range(40, 240),
});

// close: animals walking right past us, bushes and grass (no trees, they would not fit)
addLane({
  yTop: yAt(150), yBottom: yAt(212),
  make: scatter([
    { weight: 4, make: herd },
    { weight: 3, make: grazeHerd },
    { weight: 2, kind: 'bush' },
    { weight: 3, kind: 'patch' },
    { weight: 1, kind: 'greyRock' },
  ]),
  gap: (r) => r.range(80, 320),
});

// front grass along the bottom edge
addLane({
  yTop: yAt(218), yBottom: yAt(262),
  make: scatter([
    { weight: 4, kind: 'mound', tint: 0.6 },
    { weight: 2, kind: 'patch', tint: 0.5 },
    { weight: 1, kind: 'bush' },
  ]),
  gap: (r, w) => -w * r.range(0.35, 0.6),
});

// A waterhole lying flat on the ground, with reeds standing round its edge.
function lake(lane, rng, x) {
  const y = lane.randomY();
  const name = rng.pick(CATALOG.lakes);
  const { aspect, tex } = piece(name);
  const w = Math.min(rng.range(28, 48) * unitsPerMetre(y), tex.image.width * MAX_STRETCH);
  const m = makeCard(name, w / aspect, ...skyLook('lake', hazeAt(y)));
  // the picture's base is its near edge, so it reaches back towards the horizon
  lane.place(m, x + w / 2, y, LAYER.groundMarks + Math.round(depthOf(y)));
  m.userData.isLake = true;
  m.userData.keep = true;
  const back = y + m.scale.y * 0.75;
  for (let i = 0, n = 2 + Math.floor(rng() * 3); i < n; i++) {
    const ry = rng() < 0.5 ? y + rng.range(0, 3) : back;
    stand(lane, rng.pick(KIND.reed.list), x + rng.range(0, w * 0.9), ry, KIND.reed.metres, KIND.reed.shadow).userData.keep = true;
  }
  // most waterholes have animals drinking along the near shore (just in front of the water)
  if (rng() < 0.7) placeAnimals(lane, rng, x + rng.range(0, w * 0.4), herdList(rng, STAND_HERDS, 'drink'), y - depthOf(y) * 0.1 - 3);
  return { width: w };
}

function village(lane, rng, x) {
  const y = lane.randomY();
  let cx = x;
  const parts = [rng.pick(CATALOG.fences), rng.pick(CATALOG.huts), rng.pick(CATALOG.hutGroups), rng.pick(CATALOG.huts), rng.pick(CATALOG.fences)];
  parts.forEach((name, i) => {
    const isFence = CATALOG.fences.includes(name);
    const m = stand(lane, name, cx, y - (i % 2) * depthOf(y) * 0.05, isFence ? [1.2, 1.4] : [3.4, 4], isFence ? 0 : 0.9);
    cx += m.scale.x * 0.92;
  });
  return { width: cx - x };
}

// A random mix of 1-8 animals, so no two herds look alike.
function mixedHerd(rng) {
  const pool = rng.pick(MIXES);
  const n = 1 + Math.floor(rng() * rng() * 8) + (pool.length > 2 ? 1 : 0);
  return Array.from({ length: n }, () => rng.pick(pool));
}

// A herd as a list of { kind, mode }. mode: 'walk', 'stand' (eating, resting) or 'drink'.
function herdList(rng, herds, mode) {
  const kinds = ONLY_KIND ? [ONLY_KIND, ONLY_KIND] : rng() < 0.4 ? mixedHerd(rng) : rng.weighted(herds).members;
  const still = kinds.some((kind) => !MODELS[KINDS[kind].model].walk);   // lions have no walk clip: their herd stands
  return kinds.map((kind) => ({ kind, mode: still && mode === 'walk' ? 'stand' : mode }));
}

// Tall animals are held back to the same ground line, so herds from different lanes can land on top of each other,
// and same-kind animals there walk at the same speed and stay overlapped all the way across.
// Returns the left edge cx moved right until an animal of width 2 * hw at ground line y no longer sits on one already standing.
function clearOfAnimals(cx, hw, y) {
  const band = depthOf(y) * 0.1;
  for (let pass = 0; pass < 8; pass++) {
    let moved = false;
    for (const l of lanes) for (const o of l.group.children) {
      const u = o.userData;
      if (!u.isAnimal3D || Math.abs(o.position.y - y) > band) continue;
      const need = (u.halfWidth + hw) * 0.8;   // a little overlap is fine, a pile-up is not
      const dx = cx + hw - o.position.x;
      if (Math.abs(dx) < need) { cx = o.position.x + need - hw; moved = true; }
    }
    if (!moved) break;
  }
  return cx;
}

// Stand a row of 3D animals on the ground. No animal is drawn taller than ANIMAL_MAX_UNITS (size jitter included),
// so a herd of tall animals is pushed further back.
const SIZE_JITTER = 0.12;
// shoreY: stand them on this line instead (only ever nearer, never into the water); skipped if too near.
function placeAnimals(lane, rng, x, list, shoreY) {
  const maxD = Math.min(...list.map((a) => (KINDS[a.kind].maxUnits ?? ANIMAL_MAX_UNITS) / (KINDS[a.kind].metres * UNITS_PER_METRE_PER_D * (1 + SIZE_JITTER) * 1.06)));
  if (shoreY !== undefined && depthOf(shoreY) * 1.06 > maxD) return { width: 0 };
  const y0 = shoreY ?? Math.max(lane.randomY(), yAt(maxD));
  const herdSpeed = list[0].mode === 'walk' ? KINDS[list[0].kind].speed : 0;   // a herd keeps together, calves take quicker steps
  let cx = x;
  list.forEach((a) => {
    const y = y0 + (shoreY === undefined ? rng.range(-1, 1) : -rng()) * depthOf(y0) * 0.06;
    const metres = KINDS[a.kind].metres * rng.range(1 - SIZE_JITTER, 1 + SIZE_JITTER);
    const [haze, hazeColor] = look(y);
    const m = makeAnimal(a.kind, a.mode, { metres, height: metres * unitsPerMetre(y), haze, hazeColor, squash: shadowSquash(y), speed: herdSpeed }, rng);
    cx = clearOfAnimals(cx, m.userData.halfWidth, y);
    lane.place(m, cx + m.userData.halfWidth, y, standingOrder(y));
    settle(m, depthOf(y));
    m.userData.vx = herdSpeed * unitsPerMetre(y);
    cx += m.userData.halfWidth * 2 * rng.range(0.95, 1.3);   // a small gap between animals, so a calf never melts into its mother
  });
  return { width: cx - x };
}

// Animals face left and walk left. Their speed on screen comes from the same
// distance rule, so a far herd creeps and a close one strides past.
function herd(lane, rng, x) {
  return placeAnimals(lane, rng, x, herdList(rng, HERDS, 'walk'));
}

// Animals standing still, eating or resting.
function grazeHerd(lane, rng, x) {
  return placeAnimals(lane, rng, x, herdList(rng, STAND_HERDS, 'stand'));
}

// birds cross the sky on their own (the lane itself flies at bird speed)
addLane({
  factor: 0, drift: 90, yTop: 290, yBottom: 140, firstGap: 400,
  make: ({ lane, rng, x }) => {
    const n = rng() < 0.5 ? 1 : 3;
    let cx = x;
    const y0 = lane.randomY();
    for (let i = 0; i < n; i++) {
      const a = BIRD;
      const m = makeCard(a.frames[0], rng.range(18, 26), ...skyLook('birds', 0));
      lane.place(m, cx, y0 + rng.range(-25, 25), LAYER.birds);
      Object.assign(m.userData, { frames: a.frames, fps: 12, clock: rng() * 2, frame: 0, vx: rng.range(-8, 8) });
      cx += rng.range(30, 70);
    }
    return { width: cx - x + 40 };
  },
  gap: (r) => r.range(900, 2200),
});

// painted sun sitting just above the far hills (it never moves); its glow is in the sky
const SUN = { x: 0, base: HORIZON + 6, size: THEME.sunSize };
function addSun() {
  const sun = makeCard(CATALOG.suns[seed % CATALOG.suns.length], SUN.size, ...skyLook('sun', 0));
  sun.position.set(SUN.x, SUN.base, 0);
  sun.renderOrder = LAYER.sun;
  scene.add(sun);
  return sun;
}

function resize() {
  const w = innerWidth, h = innerHeight;
  if (!w || !h) return;   // window not laid out yet; the next resize fixes it
  renderer.setSize(w, h, false);
  const halfW = (VIEW_H * w / h) / 2;
  camera.left = -halfW; camera.right = halfW;
  camera.updateProjectionMatrix();
  view.left = -halfW; view.right = halfW;
  backdrop.fit(view);
}

// Nothing but reeds may stand in a waterhole: anything whose base slides into one fades out.
function clearWaterholes(dt) {
  const lakes = [];
  for (const lane of lanes) for (const m of lane.group.children) if (m.userData.isLake) lakes.push(m);
  if (!lakes.length) return;
  for (const lane of lanes) {
    for (const m of lane.group.children) {
      const u = m.userData;
      if (u.keep || u.isAnimal3D || lane.opts.factor !== undefined) continue;   // 3D animals never stand in the water anyway
      const base = m.position;
      // the water fills the middle 84% of a lake picture's width and its lower 4-62% (above that is the far bank)
      const inWater = lakes.some((l) => Math.abs(base.x - l.position.x) < l.scale.x * 0.42
        && base.y > l.position.y + l.scale.y * 0.04 && base.y < l.position.y + l.scale.y * 0.62);
      if (u.isTree3D) { m.visible = !inWater; continue; }   // 3D trees have no fade, they just go
      const o = m.material.uniforms.opacity;
      o.value = Math.max(0, Math.min(1, o.value + (inWater ? -1 : 1) * dt * 4));
      m.visible = o.value > 0.01;
    }
  }
}

const loading = document.getElementById('loading');
const clock = new THREE.Clock();

async function start() {
  const names = allPieceNames();
  const [grass] = await Promise.all([
    new THREE.TextureLoader().loadAsync('art/ground/35_ground_strip.png'),
    loadPieces(names, (n, total) => { loading.textContent = `Loading ${n} / ${total}`; }),
    loadModels(),
    loadTrees(),
  ]);
  addLights(scene);
  grass.wrapS = THREE.RepeatWrapping;           // the strip repeats left to right with no seam
  grass.wrapT = THREE.MirroredRepeatWrapping;   // top and bottom do not match, so mirror them
  grass.anisotropy = renderer.capabilities.getMaxAnisotropy();
  backdrop = makeBackdrop(scene, {
    viewHeight: VIEW_H, horizon: HORIZON, frontD: FRONT_D, grassTexture: grass,
    skyTop: THEME.skyTop, skyLow: SKY_LOW, sunX: SUN.x, sunY: SUN.base + SUN.size / 2,
    glow: THEME.glow, glowStrength: THEME.glowStrength, glowRadius: THEME.glowRadius,
    groundFar: THEME.ground.far, groundMid: THEME.ground.mid, groundNear: THEME.ground.near, groundFront: THEME.ground.front,
    groundPaint: THEME.ground.paint, groundOrder: LAYER.ground,
  });
  const sun = addSun();
  warmUp(renderer);
  loading.remove();
  resize();
  addEventListener('resize', resize);
  if (!view.right || !isFinite(view.right)) { view.left = -640; view.right = 640; }
  // Pause button (or space bar): the ground stops scrolling, the animals keep walking and moving
  let paused = false;
  const pauseButton = document.getElementById('pause');
  const togglePause = () => {
    paused = !paused;
    pauseButton.textContent = paused ? 'Play' : 'Pause';
    pauseButton.classList.toggle('on', paused);
  };
  pauseButton.addEventListener('click', () => { togglePause(); pauseButton.blur(); });   // blur: space must not press it a second time
  addEventListener('keydown', (e) => { if (e.code === 'Space') { e.preventDefault(); togglePause(); } });
  // Sunset / Day button: the colours are fixed when the scene is built, so it reloads the same scene (same seed) in the other look
  const timeButton = document.getElementById('time');
  timeButton.textContent = TIME === 'sunset' ? 'Day' : 'Sunset';
  timeButton.classList.toggle('on', TIME === 'sunset');
  timeButton.addEventListener('click', () => {
    const next = new URLSearchParams(location.search);
    if (TIME === 'sunset') next.delete('time'); else next.set('time', 'sunset');
    location.search = next.toString();
  });
  // Sleep button: night falls, everything stands still and elephants lie down to sleep right at the front (sleep.js, night.js)
  const sleep = makeSleep(scene, view, look);
  const night = makeNight(scene, view, sun, VIEW_H);
  Object.assign(window.__savanna, { scene, sleep, night });   // for checking in the browser
  const sleepButton = document.getElementById('sleep');
  sleepButton.addEventListener('click', () => {
    const on = sleep.toggle();
    night.set(on);
    sleepButton.textContent = on ? 'Wake' : 'Sleep';
    sleepButton.classList.toggle('on', on);
    sleepButton.blur();
  });

  let travel = 0;
  const step = (dt) => {
    night.update(dt);
    if (sleep.on) { sleep.update(dt); return; }   // only the sleepers move
    const speed = paused ? 0 : BASE_SPEED * (reduceMotion.matches ? 0.25 : 1);
    travel += speed * dt;
    backdrop.setTravel(travel);
    for (const lane of lanes) lane.update(dt, speed, view);
    turnTrees(lanes);
    clearWaterholes(dt);
  };
  for (let t = 0; t < FAST_FORWARD; t += 1 / 30) step(1 / 30);
  renderer.setAnimationLoop(() => {
    step(Math.min(clock.getDelta(), 0.1));   // a long pause never makes things jump
    renderer.render(scene, camera);
  });
}

start().catch((err) => { loading.textContent = err.message; console.error(err); });
window.__savanna = { lanes, renderer, FRONT_D, camera };
