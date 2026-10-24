// 3D animals: rigged, animated models standing in the flat painted scene.
// The flat (orthographic) camera sees them from the side; they are sized and slid by the same
// distance rule as the cut-outs (depth.js), and fade or darken with distance like them.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneRigged } from 'three/addons/utils/SkeletonUtils.js';
import { groundShadow } from './sprites.js';

export const TILT = 0.2;   // tip the animal towards us a little, so we see some of its back (we look down on the plain)
const TURN_TO_US = 0.35;   // and turn its head a little towards us, so it reads as round, not a flat profile
const Z_PER_D = 150;       // nearer animals sit nearer the camera, so their bodies hide the ones behind
const Z_MID = 20000;

// One entry per model file.
//   turn = how far to turn it so it faces left (radians), metres = real height of the adult in the measured pose,
//   steps = how many full leg cycles the walk clip holds (measured from the leg bones; some clips repeat the walk many times),
//   stride = metres walked in one leg cycle (legs speed up or slow down to match, so feet do not skate),
//   stand / drink = clips for standing still, one picked at random,
//   (stride measured 2026-10-24 with tools/look.html: slide('kind') reads it from the feet on the ground),
//   no walk = it has no walking clip, so herds with it always stand (lions: none of the lion files has a real walk),
//   cut = optional, one clip holding several moves cut into named clips, { name: [from, to] } in seconds (zebra),
//   soften = how much the model's picture is smoothed (0 = sharp; higher wipes out photo wrinkles),
//   contrast = optional, pulls light and dark parts of the picture apart,
//   crisp = optional, two-tone picture: darker than this is the dark tone, lighter the light one, with clean edges
//           (zebra stripes, giraffe patches); stripes too fine for the screen fade to their even mix instead of flickering,
//   tones = optional [dark, light] colours for crisp (default black and off-white),
//   smooth = optional, soft toon light and no colour bands (elephant: no hard line across the body),
//   tint = optional red/green/blue multiplier on the model's colours (giraffe: grey-beige photo pushed to yellow),
//   lieDown + sleep = clip for lying down, then lying clips (one picked at random); only models that have them (Sleep button).
export const MODELS = {
  elephant: { file: 'elephant_african', turn: -Math.PI / 2, metres: 3.2, walk: 'Loco_WalkSlow', steps: 1, stride: 1.74, stand: ['Stand_01', 'Stand_00'], soften: 5.5, smooth: true, lieDown: 'Trans_Stand_To_Lying', sleep: ['Lying_01', 'Lying_02'] },
  giraffe:  { file: 'giraffe_motions', turn: -Math.PI / 2, metres: 5.0, walk: 'loopWalk', steps: 1, stride: 2.26, stand: ['loopEating', 'loopIdle01'], drink: ['loopDrinking'], soften: 0, crisp: 0.55, tones: ['#b0632a', '#f7da86'], smooth: true },
  lion:     { file: 'lion_lowpoly', turn: -Math.PI / 2, metres: 1.2, stand: ['Animation_Armature'], soften: 3 },
  lionCub:  { file: 'lion_baby', turn: -Math.PI / 2, metres: 0.6, stand: ['Animation'], soften: 3 },
  zebra:    { file: 'zebra', turn: -Math.PI / 2, metres: 1.7, cut: { walk: [0, 7.29], stand: [8.9, 13.33] }, walk: 'walk', steps: 5, stride: 1.6, stand: ['stand'], soften: 0, crisp: 0.45, smooth: true },
  rhino:    { file: 'rhino_rebuilt', turn: -Math.PI / 2, metres: 1.7, walk: 'walking', steps: 1, stride: 1.65, stand: ['idle'], soften: 5.5 },
};

// What appears in the scene: which model, real height in metres, walking speed in metres a second,
// maxUnits = tallest it may be drawn on screen (default ANIMAL_MAX_UNITS in main.js; elephants may come right up close).
export const KINDS = {
  elephant:     { model: 'elephant', metres: 3.2, speed: 1.5, maxUnits: 240 },
  elephantCalf: { model: 'elephant', metres: 1.7, speed: 1.5, maxUnits: 240 },
  giraffe:      { model: 'giraffe', metres: 5.0, speed: 1.8 },
  giraffeCalf:  { model: 'giraffe', metres: 3.0, speed: 1.8 },
  lion:         { model: 'lion', metres: 1.2, speed: 1.3 },
  lionCub:      { model: 'lionCub', metres: 0.6, speed: 1.3 },
  zebra:        { model: 'zebra', metres: 1.7, speed: 0.9 },
  zebraFoal:    { model: 'zebra', metres: 1.2, speed: 0.9 },
  rhino:        { model: 'rhino', metres: 1.7, speed: 1.3 },
  rhinoCalf:    { model: 'rhino', metres: 1.0, speed: 1.3 },
};

// Who walks together, and who stands together eating or drinking.
export const HERDS = [
  { weight: 3, members: ['elephant', 'elephantCalf', 'elephant'] },
  { weight: 2, members: ['elephant', 'elephantCalf'] },
  { weight: 3, members: ['giraffe', 'giraffeCalf'] },
  { weight: 2, members: ['giraffe'] },
  { weight: 3, members: ['zebra', 'zebraFoal', 'zebra', 'zebra'] },
  { weight: 2, members: ['zebra', 'zebraFoal'] },
  { weight: 2, members: ['rhino', 'rhinoCalf'] },
  { weight: 1, members: ['rhino'] },
  { weight: 1, members: ['lion', 'lion'] },
];
export const STAND_HERDS = [
  { weight: 3, members: ['elephant', 'elephantCalf', 'elephant'] },
  { weight: 2, members: ['giraffe', 'giraffeCalf'] },
  { weight: 1, members: ['giraffe'] },
  { weight: 3, members: ['zebra', 'zebraFoal', 'zebra'] },
  { weight: 2, members: ['rhino', 'rhinoCalf'] },
  { weight: 1, members: ['lion', 'lionCub', 'lionCub'] },
];
// Random mixes, so no two herds look alike. Walkers keep one pace, so only similar kinds mix.
export const MIXES = [['zebra', 'zebra', 'zebraFoal'], ['giraffe', 'giraffe', 'giraffeCalf'], ['elephant', 'elephant', 'elephantCalf'], ['rhino', 'rhinoCalf'], ['lion', 'lion']];

const protos = {};   // model key -> { gltf, cx, cz, minY, w, h }

// Colours used exactly as painted (the scene has colour management off).
export function rawColours(m) {
  for (const key of ['map', 'emissiveMap']) if (m[key]) m[key].colorSpace = THREE.NoColorSpace;
}

// Toon light: the sun lights a body in 2 hard steps (shadow side, lit side), no smooth shading or shine.
const TOON_STEPS = (() => {
  const t = new THREE.DataTexture(new Uint8Array([120, 255]), 2, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
})();
// Same two shades, but blended smoothly from shadow side to lit side (no hard line across the body).
const TOON_SMOOTH = (() => {
  const t = new THREE.DataTexture(new Uint8Array([150, 255]), 2, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
})();

const clipOf = (gltf, name) => gltf.animations.find((c) => c.name === name) ?? gltf.animations[0];

// One clip holding several moves (walk, kick, stand): cut it into separate named clips.
function cutClips(gltf, cut) {
  const src = gltf.animations[0];
  for (const [name, [from, to]] of Object.entries(cut)) {
    const clip = src.clone();
    clip.name = name;
    clip.tracks.forEach((t) => t.trim(from, to).shift(-from));
    clip.duration = to - from;
    gltf.animations.push(clip);
  }
}

// Size of the model in its first walking (or standing) pose, as the camera sees it.
function measure(gltf, def) {
  const root = gltf.scene;
  root.rotation.y = def.turn + TURN_TO_US;
  const tilt = new THREE.Group();
  tilt.rotation.x = TILT;
  tilt.add(root);
  const mixer = new THREE.AnimationMixer(root);
  mixer.clipAction(clipOf(gltf, def.walk ?? def.stand[0])).play();
  mixer.update(0);
  tilt.updateMatrixWorld(true);
  root.traverse((o) => { if (o.isSkinnedMesh) o.boundingBox = null; });   // measure the posed body, not the rest pose
  const box = new THREE.Box3().setFromObject(tilt);
  mixer.stopAllAction();
  mixer.uncacheRoot(root);
  tilt.remove(root);
  const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  return { cx: c.x, cz: c.z, minY: box.min.y, w: size.x, h: size.y };
}

// The published site (tools/publish.py) holds the animals as .glb.gz, about 40% smaller to download over a phone's
// mobile data (the host does not compress model files itself). Here the plain .glb is used when there is no .gz.
async function loadGlb(loader, url) {
  if ('DecompressionStream' in window) {
    try {
      const res = await fetch(`${url}.gz`);
      if (res.ok) {
        const bytes = await new Response(res.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
        return await loader.parseAsync(bytes, url.slice(0, url.lastIndexOf('/') + 1));
      }
    } catch (err) { /* not compressed, or not understood: fall back to the plain file */ }
  }
  return loader.loadAsync(url);
}

export async function loadModels(onProgress) {
  const loader = new GLTFLoader();
  const keys = Object.keys(MODELS);
  let done = 0;
  await Promise.all(keys.map(async (key) => {
    const gltf = await loadGlb(loader, `models/${MODELS[key].file}.glb`);
    gltf.scene.traverse((o) => { if (o.isMesh) [o.material].flat().forEach(rawColours); });
    if (MODELS[key].cut) cutClips(gltf, MODELS[key].cut);
    protos[key] = { gltf, ...measure(gltf, MODELS[key]) };
    onProgress?.(++done, keys.length);
  }));
}

// Soft light from the front left, so the bodies read as round without fighting the painted light.
export function addLights(scene) {
  scene.add(new THREE.HemisphereLight('#fff6e0', '#9a7a44', 1.6));
  const sun = new THREE.DirectionalLight('#fff0d0', 2.0);
  sun.position.set(-1, 2, 3);
  scene.add(sun);
}

// Last step of every animal shader: fade towards hazeColor by haze, same as the cut-out cards.
const HAZE = '#include <dithering_fragment>\n  gl_FragColor.rgb = mix(gl_FragColor.rgb, hazeColor, haze);';
const addHaze = (shader, uniforms) => {
  shader.uniforms.haze = uniforms.haze;
  shader.uniforms.hazeColor = uniforms.hazeColor;
  shader.fragmentShader = 'uniform float haze;\nuniform vec3 hazeColor;\n' + shader.fragmentShader.replace('#include <dithering_fragment>', HAZE);
};

// Cartoon colours from the model's photo picture: read a smoothed copy (soften), flatten the lightness into
// 5 painted bands and make the colour a little richer.
const PAINT_MAP = /* glsl */`
#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D( map, vMapUv, soften );
  sampledDiffuseColor.rgb = clamp( ( sampledDiffuseColor.rgb - 0.5 ) * contrast + 0.5, 0.0, 1.0 );
  float lum = dot( sampledDiffuseColor.rgb, vec3( 0.3, 0.59, 0.11 ) );
  if ( crisp > 0.0 ) {
    float edge = max( fwidth( lum ), 0.02 );   // about one pixel of soft edge, never a hard jagged step
    vec3 twoTone = mix( darkTone, lightTone, smoothstep( crisp - edge, crisp + edge, lum ) );
    vec2 texels = fwidth( vMapUv ) * vec2( textureSize( map, 0 ) );
    float tooFine = smoothstep( 6.0, 14.0, max( texels.x, texels.y ) );   // many picture pixels per screen pixel: stripes thinner than a pixel
    vec3 blend = mix( darkTone, lightTone, smoothstep( crisp - 0.35, crisp + 0.35, lum ) );   // there: the even colour the two tones make together
    sampledDiffuseColor.rgb = mix( twoTone, blend, tooFine );
    lum = dot( sampledDiffuseColor.rgb, vec3( 0.3, 0.59, 0.11 ) );
  }
  vec3 paint = sampledDiffuseColor.rgb * mix( ( floor( lum * 5.0 ) + 0.6 ) / 5.0 / max( lum, 0.001 ), 1.0, smoothBands );
  paint = mix( vec3( dot( paint, vec3( 0.3, 0.59, 0.11 ) ) ), paint, 1.35 );
  diffuseColor *= vec4( clamp( paint, 0.0, 1.0 ), sampledDiffuseColor.a );
#endif
`;

// Each animal (and 3D tree, trees3d.js) gets its own toon materials (keeping the model's colours and picture).
// soften = null: use the picture as it is (already painted, so no colour bands; only the toon light).
// look: { contrast = how strongly light and dark parts of the picture are pulled apart (1 = as is), smooth = soft toon light,
//         crisp = two-tone picture split at this lightness (0 = off), tones = [dark, light] colours for it }
const TONES = ['#121212', '#f5f0e3'];   // zebra black and off-white
export function hazed(src, uniforms, soften, look = {}) {
  const m = new THREE.MeshToonMaterial({
    color: src.color, map: src.map, alphaMap: src.alphaMap, alphaTest: src.alphaTest, side: src.side,
    gradientMap: look.smooth ? TOON_SMOOTH : TOON_STEPS,
  });
  m.transparent = true;   // drawn in the same back-to-front order as the cards
  m.depthTest = true;
  m.depthWrite = true;    // its own legs and body still hide each other
  const bands = soften !== null;
  m.onBeforeCompile = (shader) => {
    addHaze(shader, uniforms);
    if (!bands) return;
    shader.uniforms.soften = { value: soften };
    shader.uniforms.contrast = { value: look.contrast ?? 1 };
    shader.uniforms.smoothBands = { value: look.smooth ? 1 : 0 };
    shader.uniforms.crisp = { value: look.crisp ?? 0 };
    const [dark, light] = (look.tones ?? TONES).map((c) => new THREE.Color(c));
    shader.uniforms.darkTone = { value: dark };
    shader.uniforms.lightTone = { value: light };
    shader.fragmentShader = 'uniform float soften;\nuniform float contrast;\nuniform float smoothBands;\nuniform float crisp;\nuniform vec3 darkTone;\nuniform vec3 lightTone;\n' + shader.fragmentShader.replace('#include <map_fragment>', PAINT_MAP);
  };
  m.customProgramCacheKey = () => (bands ? 'bands' : 'painted');   // the two kinds need separate shaders
  return m;
}

// One animal, standing on its base line at (0, 0), facing left.
// o: { metres = real height, height = height on screen, haze, hazeColor, squash = shadow height / width, speed = herd speed or 0 }
// mode: 'walk', 'stand', 'drink' or 'sleep' (lies down, then rests; only models with lieDown).
export function makeAnimal(kind, mode, o, rng) {
  const def = MODELS[KINDS[kind].model], p = protos[KINDS[kind].model];
  const root = cloneRigged(p.gltf.scene);
  const uniforms = { haze: { value: o.haze }, hazeColor: { value: o.hazeColor } };
  const mats = [];
  root.traverse((m) => {
    if (!m.isMesh) return;
    m.material = Array.isArray(m.material) ? m.material.map((x) => hazed(x, uniforms, def.soften, def)) : hazed(m.material, uniforms, def.soften, def);
    mats.push(...[m.material].flat());
    if (def.tint) [m.material].flat().forEach((x) => x.color.multiply(new THREE.Color().setRGB(...def.tint)));
    m.frustumCulled = false;
  });
  const tilt = new THREE.Group();
  tilt.rotation.x = TILT;
  tilt.position.set(-p.cx, -p.minY, -p.cz);
  tilt.add(root);
  const holder = new THREE.Group();
  holder.add(tilt);
  holder.add(groundShadow(p.w * 0.85, o.squash));
  holder.scale.setScalar(o.height / p.h);

  const mixer = new THREE.AnimationMixer(root);
  if (mode === 'sleep') lieDown(mixer, p.gltf, def, rng);
  else {
    const name = mode === 'walk' ? def.walk : rng.pick(mode === 'drink' && def.drink ? def.drink : def.stand);
    const clip = clipOf(p.gltf, name);
    const action = mixer.clipAction(clip);
    action.timeScale = mode === 'walk' ? o.speed * clip.duration / (def.steps * def.stride * o.metres / def.metres) : rng.range(0.85, 1.1);
    action.time = rng() * clip.duration;   // herd members out of step
    action.play();
  }
  Object.assign(holder.userData, {
    mixer, isAnimal3D: true, halfWidth: p.w * holder.scale.x / 2,
    dispose: () => { mixer.stopAllAction(); mixer.uncacheRoot(root); mats.forEach((m) => m.dispose()); },
  });
  return holder;
}

// Lie down once (not all at the same moment), then rest in a slow lying loop.
function lieDown(mixer, gltf, def, rng) {
  const down = mixer.clipAction(clipOf(gltf, def.lieDown));
  down.setLoop(THREE.LoopOnce);
  down.clampWhenFinished = true;
  down.timeScale = rng.range(1.2, 1.5);   // the clip is slow (8 s)
  down.startAt(rng.range(0, 1.2));
  down.play();
  const lying = mixer.clipAction(clipOf(gltf, rng.pick(def.sleep)));
  lying.timeScale = rng.range(0.7, 0.9);
  mixer.addEventListener('finished', (e) => {
    if (e.action !== down) return;
    lying.play();
    down.crossFadeTo(lying, 0.6, false);
  });
}

// After the lane has placed it: nearer animals sit nearer the camera, and all its parts draw in its turn.
export function settle(holder, d) {
  holder.position.z = d * Z_PER_D - Z_MID;
  const order = holder.renderOrder;
  holder.traverse((m) => { if (m.isMesh) m.renderOrder = m.material.isShaderMaterial ? order - 1 : order; });   // shadow first
  holder.renderOrder = 0;   // a group's own order would sort all its parts as one (shadows after every body); each part keeps its own
}
