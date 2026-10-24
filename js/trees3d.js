// 3D trees: painted trees rebuilt in Blender (tools/build_trees.py). From the front each one matches its
// painting exactly; the painting is laid on a rounded body, so the toon light shapes it like the animals.
// The camera is flat, so on their own they would never show their sides: each tree turns a little with
// its place on screen (left of the middle we see a bit of its right side, and the other way round),
// as if we looked at it through a real camera.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { TILT, hazed, rawColours } from './models3d.js';
import { groundShadow } from './sprites.js';

// painting (art/pieces) -> model file in models/trees
export const TREE_MODELS = {
  '23_trees_b/r00_c01': 'baobab_wide',
  '22_trees_a/r00_c01': 'acacia_two',
};
// the rest of the trees (CATALOG.bigTrees, midTrees, treePairs) and the round bushes: the model is named after
// the painting ('22_trees_a/r01_c00' -> '22_trees_a_r01_c00'). Same lists as MORE and BUSHES in build_trees.py.
[
  '22_trees_a/r00_c00', '22_trees_a/r01_c00', '22_trees_a/r01_c01', '23_trees_b/r00_c00',
  '25_trees_d/r00_c00', '25_trees_d/r00_c01', '25_trees_d/r01_c00', '25_trees_d/r01_c01',
  '24_trees_c/r00_c00', '24_trees_c/r00_c01', '24_trees_c/r01_c00', '24_trees_c/r01_c01',
  'layers_props/10_tree_baobab', 'layers_props/11_tree_acacia_big', 'layers_props/12_tree_acacia_small',
  '02_acacia_trees/r00_c00', '02_acacia_trees/r01_c00', '02_acacia_trees/r01_c01', '02_acacia_trees/r01_c02',
  '02_acacia_trees/r01_c03', '02_acacia_trees/r02_c00', '02_acacia_trees/r02_c01', '02_acacia_trees/r02_c02',
  '02_acacia_trees/r02_c03', '02_acacia_trees/r02_c04', '03_baobab_trees/r00_c01', '03_baobab_trees/r01_c00',
  '03_baobab_trees/r01_c01', '03_baobab_trees/r02_c00', '03_baobab_trees/r02_c01', '03_baobab_trees/r02_c02',
  '03_baobab_trees/r02_c03', '03_baobab_trees/r02_c04',
  '02_acacia_trees/r00_c01', '03_baobab_trees/r00_c00', '03_baobab_trees/r01_c02',   // tree pairs
  '01_rocks_and_bushes/r02_c00', '01_rocks_and_bushes/r02_c01', '01_rocks_and_bushes/r02_c02',   // bushes
  '01_rocks_and_bushes/r02_c04', '01_rocks_and_bushes/r02_c06', '01_rocks_and_bushes/r02_c07',
  '01_rocks_and_bushes/r02_c08', '01_rocks_and_bushes/r03_c08', '01_rocks_and_bushes/r03_c09',
  '01_rocks_and_bushes/r03_c16',
].forEach((p) => { TREE_MODELS[p] = p.replace('/', '_'); });
const LOOK_DISTANCE = 1800;   // how far off the pretend camera stands, in screen units: smaller = trees turn more
const SOFTEN = null;          // the painting is used as it is: no colour bands, only the toon light
// Toon light for trees: lit only where a surface faces the sun well (the animals' step is at side-on), so the right
// side of a trunk and the underside of the leaf pads fall into shade; the front stays as painted.
// The step is a short soft ramp, not a hard line: a hard line follows every large triangle of the thinned mesh
// and reads as lumpy, shiny patches on a trunk.
const TREE_STEPS = (() => {
  const ramp = [150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 154, 170, 195, 225, 248, 255, 255, 255, 255, 255];
  const t = new THREE.DataTexture(new Uint8Array(ramp), ramp.length, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
})();
// The painting is laid on the front and back only, so a surface turned away from us (the side of a trunk, the
// top of a leaf pad) shows one row of the painting stretched into a strip. There the colour fades to a blurred
// copy of the painting (a coarse mip level), which reads as plain bark or leaf instead of a streak.
const SIDE_BLUR = /* glsl */`
#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D( map, vMapUv );
  float facing = abs( normalize( vNormal ).z );
  float sideways = 1.0 - smoothstep( 0.06, 0.32, facing );
  sampledDiffuseColor.rgb = mix( sampledDiffuseColor.rgb, texture2D( map, vMapUv, 7.0 ).rgb, sideways );
  diffuseColor *= sampledDiffuseColor;
#endif
`;
// The scene lights (addLights) add up to about (1.07, 0.99, 0.84) on a sunlit face; this undoes it,
// so the lit side shows the painting's own colours.
const AS_PAINTED = new THREE.Color(0.94, 1.01, 1.19);

const protos = {};   // painting -> { scene, cx, cz, minY, w, h }

export async function loadTrees() {
  const loader = new GLTFLoader();
  await Promise.all(Object.entries(TREE_MODELS).map(async ([name, file]) => {
    const gltf = await loader.loadAsync(`models/trees/${file}.glb`);
    gltf.scene.traverse((o) => { if (o.isMesh) rawColours(o.material); });
    const front = new THREE.Box3().setFromObject(gltf.scene).getSize(new THREE.Vector3());   // = the painting's size
    const tilt = new THREE.Group();
    tilt.rotation.x = TILT;
    tilt.add(gltf.scene);
    tilt.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(tilt);
    // where the tree meets the ground: the sideways spread of its lowest vertices (trunk foot, or a whole bush)
    // (the box above is made from boxes of the tilted parts, so a bit looser than the real lowest vertex: measure that)
    let foot0 = Infinity, foot1 = -Infinity, lowest = Infinity;
    const v = new THREE.Vector3();
    const eachVertex = (fn) => gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      const pos = o.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) fn(v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld));
    });
    eachVertex((p) => { lowest = Math.min(lowest, p.y); });
    const lowLine = lowest + 0.04 * (box.max.y - lowest);
    eachVertex((p) => { if (p.y <= lowLine) { foot0 = Math.min(foot0, p.x); foot1 = Math.max(foot1, p.x); } });
    tilt.remove(gltf.scene);
    const c = box.getCenter(new THREE.Vector3());
    protos[name] = { scene: gltf.scene, cx: c.x, cz: c.z, minY: box.min.y, w: front.x, h: front.y, footX: (foot0 + foot1) / 2 - c.x, footW: foot1 - foot0 };
  }));
}

// One tree standing on its base line at (0, 0). height = on screen (the painting's height, as for the flat card);
// squash = shadow height / width; shadow = shadow width as a share of the painting's width.
export function makeTree(name, height, haze, hazeColor, squash, shadow = 0.7) {
  const p = protos[name];
  const root = p.scene.clone();
  const uniforms = { haze: { value: haze }, hazeColor: { value: hazeColor } };
  const mats = [];
  root.traverse((m) => {
    if (!m.isMesh) return;
    m.material = hazed(m.material, uniforms, SOFTEN);
    const addHazeToShader = m.material.onBeforeCompile;
    m.material.onBeforeCompile = (shader) => {
      addHazeToShader(shader);
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', SIDE_BLUR);
    };
    m.material.customProgramCacheKey = () => 'tree';
    m.material.alphaTest = 0.5;   // the painting's own outline
    m.material.side = THREE.FrontSide;
    m.material.gradientMap = TREE_STEPS;
    m.material.color.copy(AS_PAINTED);
    mats.push(m.material);
    m.frustumCulled = false;
  });
  const turn = new THREE.Group();   // turns round the trunk
  turn.add(root);
  const tilt = new THREE.Group();
  tilt.rotation.x = TILT;
  tilt.position.set(-p.cx, -p.minY, -p.cz);
  tilt.add(turn);
  const holder = new THREE.Group();
  holder.add(tilt);
  if (shadow) {   // under the trunk foot (not the middle of the painting), as wide as the foot plus some, never wider than the old share
    const s = groundShadow(Math.min(p.footW * (shadow > 0.8 ? 1.15 : 1.8), p.w * shadow), squash, true);
    s.position.x = p.footX;
    holder.add(s);
  }
  holder.scale.setScalar(height / p.h);
  Object.assign(holder.userData, {
    isTree3D: true, turn, halfWidth: p.w * holder.scale.x / 2,
    dispose: () => mats.forEach((m) => m.dispose()),
  });
  return holder;
}

// Every frame: turn each 3D tree by where it stands on screen.
export function turnTrees(lanes) {
  for (const lane of lanes) {
    for (const m of lane.group.children) {
      if (m.userData.isTree3D) m.userData.turn.rotation.y = Math.atan(m.position.x / LOOK_DISTANCE);
    }
  }
}
