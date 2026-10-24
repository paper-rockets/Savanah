// One animal at night (starry sky, moonlight, its own realistic materials), filling its box on screen.
// Used by the big screen (elephant.html) and by the live mirror on the phone remote (remote.html).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const ANIMALS = [
  { id: 'elephant_b', label: 'Elephant B' },
  { id: 'elephant_african', label: 'Elephant A' },
  { id: 'giraffe_rigged', label: 'Giraffe A' },
  { id: 'giraffe_motions', label: 'Giraffe B' },
  { id: 'rhino_walk', label: 'Rhino A' },
  { id: 'rhino_rebuilt', label: 'Rhino B' },
  { id: 'lion_a', label: 'Lion A' },
  { id: 'lion_b', label: 'Lion B' },
  { id: 'lion_lowpoly', label: 'Lion C' },
  { id: 'lion_baby', label: 'Lion cub' },
  { id: 'zebra', label: 'Zebra' },
];

export const clipName = n => n.replace(/^.*\|/, '');   // "TRS|walk" -> "walk"

const SIZE = 4;        // every animal scaled to this longest side
const MARGIN = 1.12;   // a little room around it when framing (walks swing legs and heads)
const VIEW_DIR = new THREE.Vector3(0.75, 0.22, 1).normalize();   // three-quarter front view

const loader = new GLTFLoader();
const cache = new Map();
const loadGltf = id => {
  if (!cache.has(id)) cache.set(id, new Promise((res, rej) => loader.load('models/' + id + '.glb', res, undefined, rej)));
  return cache.get(id);
};

// points on the animal's skin in its current pose (up to ~5000 is plenty for framing)
function skinPoints(root) {
  const pts = [];
  root.updateMatrixWorld(true);
  root.traverse(o => {
    if (!o.isMesh) return;
    if (o.isSkinnedMesh) o.skeleton.update();   // bone matrices are only filled on render otherwise
    const n = o.geometry.attributes.position.count;
    const step = Math.max(1, Math.floor(n / 5000));
    for (let i = 0; i < n; i += step) {
      const v = new THREE.Vector3();
      o.getVertexPosition(i, v);   // already includes the bone pose for a skinned mesh
      pts.push(o.localToWorld(v));
    }
  });
  return pts;
}

// head and neck bones, head first: the jaw's parent when there is a jaw, else the bone called "head";
// then up to 3 parents that are neck (or head) bones
function headChain(root) {
  const bones = [];
  root.traverse(o => { if (o.isBone) bones.push(o); });
  const jaw = bones.find(b => /jaw/i.test(b.name));
  let head = jaw && jaw.parent && jaw.parent.isBone ? jaw.parent : null;
  if (!head) head = bones.find(b => /head/i.test(b.name) && !/neck|nub|end|top|jaw/i.test(b.name));
  if (!head) return [];
  const chain = [head];
  let b = head.parent;
  while (b && b.isBone && /neck|head/i.test(b.name) && chain.length < 4) { chain.push(b); b = b.parent; }
  return chain;
}

const LOOK_HOLD = 3;          // seconds the head stays turned after a tap
const LOOK_YAW = THREE.MathUtils.degToRad(75), LOOK_PITCH = THREE.MathUtils.degToRad(30);
const LOOK_SHARE = [0.4, 0.3, 0.2, 0.1];   // how much of the turn each bone takes, head first

export function createView(container, { maxPixelRatio = 2 } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, maxPixelRatio));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 200);

  // night sky: dark blue gradient with stars, redrawn at the box size so stars stay round
  function drawSky(w, h) {
    // a new canvas + texture each time: a texture cannot change size once it is on the GPU (old stars smeared on phones)
    if (scene.background) scene.background.dispose();
    const sky = document.createElement('canvas');
    sky.width = w; sky.height = h;
    const g = sky.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#03050d');
    grad.addColorStop(0.6, '#0b1428');
    grad.addColorStop(1, '#1a2742');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const count = Math.round(w * h / 2500);
    for (let i = 0; i < count; i++) {
      const y = Math.pow(rnd(), 1.6) * h * 0.85;   // more stars near the top
      g.globalAlpha = 0.3 + rnd() * 0.7;
      g.fillStyle = '#ffffff';
      g.beginPath(); g.arc(rnd() * w, y, 0.4 + rnd() * 1.1, 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
    const tex = new THREE.CanvasTexture(sky);
    tex.colorSpace = THREE.SRGBColorSpace;
    scene.background = tex;
  }

  // moonlight: cool key from above, soft blue fill, pale rim from behind so the outline reads
  scene.add(new THREE.HemisphereLight(0x8fa6d6, 0x1a1c24, 0.9));
  const s = SIZE;
  const moon = new THREE.DirectionalLight(0xc8d6ff, 2.6);
  moon.position.set(s * 1.2, s * 2.5, s * 1.6);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  Object.assign(moon.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 0.1, far: s * 8 });
  moon.shadow.camera.updateProjectionMatrix();
  const rim = new THREE.DirectionalLight(0x9fb8ff, 1.8);
  rim.position.set(-s * 1.5, s * 1.2, -s * 2);
  scene.add(moon, moon.target, rim, rim.target);

  // invisible ground that only shows the shadow
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity: 0.45 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const pivot = new THREE.Group();   // the animal sits centred in this, so turning it spins it in place
  scene.add(pivot);

  let box = null, points = [], loadToken = 0;
  // tap to look: the head (and neck) turn toward the camera for a few seconds, on top of the animation
  let chain = [], base = [], forward = new THREE.Vector3(0, 0, 1), lookTime = Infinity, lookWeight = 0;
  const headFacing = new THREE.Vector3(0, 0, 1);   // which way the face points, in the head bone's own frame
  const raycaster = new THREE.Raycaster();
  const q = new THREE.Quaternion(), qp = new THREE.Quaternion(), delta = new THREE.Quaternion(), part = new THREE.Quaternion();
  const headPos = new THREE.Vector3(), toCam = new THREE.Vector3(), fwd = new THREE.Vector3(), side = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);

  function applyLook(dt) {
    lookTime += dt;
    const goal = lookTime < LOOK_HOLD ? 1 : 0;
    lookWeight = goal > lookWeight ? Math.min(1, lookWeight + dt / 0.6) : Math.max(0, lookWeight - dt / 0.8);
    if (!lookWeight || !chain.length) return;
    const w = lookWeight * lookWeight * (3 - 2 * lookWeight);   // ease in and out
    pivot.updateMatrixWorld(true);
    chain[0].getWorldPosition(headPos);
    toCam.subVectors(camera.position, headPos).normalize();
    fwd.copy(forward).applyQuaternion(pivot.quaternion);
    side.crossVectors(UP, fwd);
    // where the camera is, seen from the animal: sideways angle and up/down angle, limited to what a neck can do
    const yaw = THREE.MathUtils.clamp(Math.atan2(toCam.dot(side), toCam.dot(fwd)), -LOOK_YAW, LOOK_YAW);
    const pitch = THREE.MathUtils.clamp(Math.asin(THREE.MathUtils.clamp(toCam.y, -1, 1)), -LOOK_PITCH, LOOK_PITCH);
    const goalDir = fwd.clone().applyAxisAngle(UP, yaw);
    goalDir.applyAxisAngle(new THREE.Vector3().crossVectors(goalDir, UP).normalize(), pitch);
    // turn from where the face points right now (the animation moves the head too) to the goal
    chain[0].getWorldQuaternion(q);
    delta.setFromUnitVectors(headPos.copy(headFacing).applyQuaternion(q), goalDir);
    delta.slerp(new THREE.Quaternion(), 1 - w);
    // share the turn out from the top neck bone down to the head; each one carries the ones below it
    for (let i = chain.length - 1; i >= 0; i--) {
      const bone = chain[i];
      part.identity().slerp(delta, LOOK_SHARE[i] / LOOK_SHARE.slice(0, chain.length).reduce((a, b) => a + b));
      bone.parent.getWorldQuaternion(qp);
      q.copy(qp).multiply(bone.quaternion);
      q.premultiply(part);
      bone.quaternion.copy(qp.invert().multiply(q));
      bone.updateMatrixWorld(true);
    }
  }
  const v = {
    renderer, scene, camera, pivot,
    target: new THREE.Vector3(),   // what the camera looks at
    fitDistance: 10,               // camera distance that fills the box
    animal: null, mixer: null, clips: [], action: null, current: null, speed: 1,

    // camera at its starting angle, as close as it can be with the whole animal in view
    frame() {
      if (!box) return;
      const c = box.getCenter(new THREE.Vector3());
      const back = VIEW_DIR;
      const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), back).normalize();
      const camUp = new THREE.Vector3().crossVectors(back, right);
      const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / MARGIN;
      const tanH = tanV * camera.aspect;
      const p = new THREE.Vector3();
      // closest camera distance that still has every skin point inside the picture, looking at c
      const fitDistance = () => {
        let d = 0;
        for (const q of points) {
          p.copy(q).sub(c);
          const z = p.dot(back);
          d = Math.max(d, Math.abs(p.dot(right)) / tanH + z, Math.abs(p.dot(camUp)) / tanV + z);
        }
        return d;
      };
      // fit, then slide the aim point so the animal sits in the middle, and fit again
      let d = fitDistance();
      for (let k = 0; k < 4; k++) {
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        for (const q of points) {
          p.copy(q).sub(c);
          const depth = d - p.dot(back);   // always in front of the camera at a fitted distance
          const x = p.dot(right) / (depth * tanH), y = p.dot(camUp) / (depth * tanV);
          x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        }
        c.addScaledVector(right, (x0 + x1) / 2 * tanH * d).addScaledVector(camUp, (y0 + y1) / 2 * tanV * d);
        d = fitDistance();
      }
      camera.position.copy(c).addScaledVector(back, d);
      camera.lookAt(c);
      v.target.copy(c);
      v.fitDistance = d;
    },

    resize() {
      const w = container.clientWidth, h = container.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      drawSky(Math.round(w * renderer.getPixelRatio()), Math.round(h * renderer.getPixelRatio()));
    },

    play(name) {
      const clip = v.clips.find(c => clipName(c.name) === name);
      if (!clip) return;
      const first = !v.action;   // the first clip starts at full strength, so framing measures its real pose
      if (v.action) v.action.fadeOut(0.3);
      v.action = v.mixer.clipAction(clip).reset();
      if (!first) v.action.fadeIn(0.3);
      v.action.play();
      v.current = name;
    },

    setSpeed(x) { v.speed = x; if (v.mixer) v.mixer.timeScale = x; },

    // swap in another animal; resolves false if a newer load started meanwhile
    async load(id) {
      const token = ++loadToken;
      const gltf = await loadGltf(id);
      if (token !== loadToken) return false;
      const root = gltf.scene;
      if (!root.userData.fitted) {
        const b = new THREE.Box3().setFromObject(root);
        const size = b.getSize(new THREE.Vector3());
        root.scale.setScalar(SIZE / Math.max(size.x, size.y, size.z));
        b.setFromObject(root);
        const c = b.getCenter(new THREE.Vector3());
        root.position.set(-c.x, -b.min.y, -c.z);
        root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
        root.userData.fitted = true;
      }
      if (v.mixer) { v.mixer.stopAllAction(); v.mixer.uncacheRoot(v.mixer.getRoot()); }
      pivot.clear();
      pivot.rotation.y = 0;
      pivot.add(root);
      v.mixer = new THREE.AnimationMixer(root);
      v.mixer.timeScale = v.speed;
      v.clips = gltf.animations;
      v.animal = id; v.action = null; v.current = null;
      const start = v.clips.find(c => /walk/i.test(c.name)) || v.clips.find(c => /idle/i.test(c.name)) || v.clips[0];
      if (start) { v.play(clipName(start.name)); v.mixer.update(0); }
      box = new THREE.Box3().setFromObject(root);
      points = skinPoints(root);
      chain = headChain(root);
      base = chain.map(b => b.quaternion.clone());
      lookTime = Infinity; lookWeight = 0;
      // which way the animal faces: from the middle of its body toward its head, kept level
      if (chain.length) {
        chain[0].getWorldPosition(headPos);
        forward.subVectors(headPos, box.getCenter(new THREE.Vector3())).setY(0).normalize();
        headFacing.copy(forward).applyQuaternion(chain[0].getWorldQuaternion(q).invert());
      }
      v.frame();
      return true;
    },

    lookAtCamera() { lookTime = 0; },

    // is the animal under this point of the box? x, y from -1 to 1, y up
    hit(x, y) {
      raycaster.setFromCamera({ x, y }, camera);
      return raycaster.intersectObject(pivot, true).length > 0;
    },

    render(dt) {
      // put the look bones back first: bones the clip does not move would otherwise keep last frame's turn
      chain.forEach((b, i) => b.quaternion.copy(base[i]));
      if (v.mixer) v.mixer.update(dt);
      chain.forEach((b, i) => base[i].copy(b.quaternion));
      applyLook(dt);
      renderer.render(scene, camera);
    },
  };
  return v;
}
