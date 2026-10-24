import * as THREE from 'three';
import { U } from './shaderlib.js';
import { skyUniforms, makeSky } from './sky.js';
import { Terrain } from './terrain.js';
import { makeWater } from './water.js';
import { Grass } from './grass.js';
import { Trees } from './trees.js';
import { makeBirds } from './birds.js';
import { makeFlightClouds } from './flight-clouds.js';
import { makeGodRays } from './godrays.js';
import { makePaperPass } from './paper.js';
import { height, WATER_Y } from './world.js';
import { PRESETS, cloneState, blendState } from './presets.js';

const qs = new URLSearchParams(location.search);
const LOW = qs.get('q') === 'low';
const MAX_PR = Math.min(devicePixelRatio, LOW ? 1 : 1.5);

const renderer = new THREE.WebGLRenderer({ antialias: !LOW, powerPreference: 'high-performance' });
let pixelRatio = MAX_PR;
renderer.setPixelRatio(pixelRatio);
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.5, 16000);   // far enough for the flight clouds
camera.rotation.order = 'YXZ';

scene.add(makeSky());
const water = makeWater(); scene.add(water);
const birds = makeBirds(); scene.add(birds);
const terrain = new Terrain(scene, LOW ? 6 : 8);
const grass = new Grass(scene, LOW ? { count: 6000, radius: 50 } : { count: 16000, radius: 72 });
const trees = new Trees(scene, LOW ? { radius: 400, maxScale: 0.5 } : {});
scene.fog = new THREE.FogExp2(0xffffff, 0.0025);
const hemi = new THREE.HemisphereLight(0xffffff, 0x886644, 1.5); scene.add(hemi);
const sunLight = new THREE.DirectionalLight(0xffffff, 2.5); scene.add(sunLight);
window.savanna = { scene, renderer, camera };   // handy for checking things from the browser console

// ---- lighting mood ----
let moodName = qs.get('mood') in PRESETS ? qs.get('mood') : 'day';
const cur = cloneState(PRESETS[moodName]);
const lin = (dst, src) => dst.copy(src).convertSRGBToLinear();   // for three's own colour pipeline
const moodLin = { sunDir: U.uSunDir.value, fogLin: new THREE.Color(), cloudColLin: new THREE.Color(), litLin: new THREE.Color(), shadeLin: new THREE.Color() };
function pushState() {
  U.uZenith.value.copy(cur.zenith); U.uHorizon.value.copy(cur.horizon); U.uFogColor.value.copy(cur.fog);
  U.uSunColor.value.copy(cur.sunColor); U.uAmbSky.value.copy(cur.ambSky); U.uAmbGnd.value.copy(cur.ambGnd);
  U.uTint.value.copy(cur.tint); U.uWaterCol.value.copy(cur.water);
  U.uSunGlow.value = cur.glow; U.uNearDark.value = cur.nearDark; U.uFogDensity.value = cur.fogDensity; U.uCloudShadow.value = cur.cloudShadow;
  const el = cur.elev, az = cur.az;
  U.uSunDir.value.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
  const S = skyUniforms;
  lin(S.uZenith.value, cur.zenith); lin(S.uMid.value, cur.skyMid); lin(S.uHorizon.value, cur.horizon);
  S.uHorizonGlow.value = cur.horizonGlow;
  S.uSunPosition.value.copy(U.uSunDir.value);
  S.uDiscDir.value.set(Math.sin(cur.discAz) * Math.cos(cur.discEl), Math.sin(cur.discEl), -Math.cos(cur.discAz) * Math.cos(cur.discEl));
  lin(S.uSunColor.value, cur.sunColor); lin(S.uDiscColor.value, cur.discColor);
  S.uDiscLo.value = Math.cos(cur.disc * 1.06); S.uDiscHi.value = Math.cos(cur.disc * 0.94);
  lin(S.uCloudColor.value, cur.domeCloud); lin(S.uCloudShadowColor.value, cur.skyMid);
  S.uCloudCoverage.value = cur.coverage; S.uDuskFactor.value = cur.dusk; S.uNightFactor.value = cur.night;
  lin(S.uMtn0.value, cur.mtn0); lin(S.uMtn1.value, cur.mtn1); lin(S.uMtn2.value, cur.mtn2); lin(S.uFogLin.value, cur.fog);
  S.uStreak.value = cur.streak; S.uPeaks.value = cur.peaks; S.uTreeLine.value = cur.treeLine;
  moodLin.towers = cur.towers; moodLin.banks = cur.banks; moodLin.lowAlt = cur.lowAlt; moodLin.highs = cur.highs;
  moodLin.lows = cur.lows; moodLin.lowSize = cur.lowSize; moodLin.grade = cur.grade;
  // clouds melt into the sky's horizon colour, as in the flight game
  lin(moodLin.fogLin, cur.horizon); lin(moodLin.cloudColLin, cur.domeCloud); lin(moodLin.litLin, cur.cloudLit); lin(moodLin.shadeLin, cur.cloudShade);
  lin(scene.fog.color, cur.fog); scene.fog.density = cur.fogDensity;
  lin(hemi.color, cur.ambSky); lin(hemi.groundColor, cur.ambGnd); hemi.intensity = cur.hemiI;
  lin(sunLight.color, cur.sunColor); sunLight.intensity = cur.sunI;
  sunLight.position.copy(U.uSunDir.value).multiplyScalar(100);
}
pushState();

// ---- camera: tour (default) or free fly ----
const pos = new THREE.Vector3(0, 0, 0);
let yaw = 0, pitch = -0.06, tour = !qs.has('free'), tourT = 0;
pos.y = Math.max(height(0, 0), WATER_Y) + 6;
const keys = {};
addEventListener('keydown', e => { keys[e.code] = true; if (/Key[WASDQE]|Arrow/.test(e.code)) setTour(false); });
addEventListener('keyup', e => { keys[e.code] = false; });
let drag = null;
renderer.domElement.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY }; renderer.domElement.setPointerCapture(e.pointerId); });
renderer.domElement.addEventListener('pointermove', e => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (tour && Math.hypot(dx, dy) > 3) setTour(false);
  yaw -= dx * 0.004; pitch = Math.max(-1.2, Math.min(1.0, pitch - dy * 0.004));
  drag = { x: e.clientX, y: e.clientY };
});
renderer.domElement.addEventListener('pointerup', () => { drag = null; });

function updateCamera(dt) {
  if (tour) {
    tourT += dt;
    yaw = 0.55 * Math.sin(tourT * 0.035) + 0.2 * Math.sin(tourT * 0.11);
    pitch += (-0.07 + 0.03 * Math.sin(tourT * 0.21) - pitch) * Math.min(1, dt * 2);
    const sp = 10;
    pos.x += -Math.sin(yaw) * sp * dt; pos.z += -Math.cos(yaw) * sp * dt;
    // look ahead so the camera rises before hills, not into them
    let ground = Math.max(height(pos.x, pos.z), WATER_Y);
    for (const ahead of [12, 30]) ground = Math.max(ground, height(pos.x - Math.sin(yaw) * ahead, pos.z - Math.cos(yaw) * ahead) - 1.5);
    const want = ground + 5.5 + 2.5 * Math.sin(tourT * 0.17);
    pos.y += (want - pos.y) * Math.min(1, dt * 1.2);
  } else {
    const sp = (keys.ShiftLeft || keys.ShiftRight ? 60 : 16) * dt;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const f = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
    const r = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
    pos.x += (fx * f - fz * r) * sp; pos.z += (fz * f + fx * r) * sp;
    pos.y += ((keys.KeyE ? 1 : 0) - (keys.KeyQ ? 1 : 0)) * sp;
  }
  pos.y = Math.max(pos.y, Math.max(height(pos.x, pos.z), WATER_Y) + 1.7);
  camera.position.copy(pos);
  camera.rotation.set(pitch, yaw, 0);
}

// ---- UI ----
const bar = document.getElementById('bar');
const moodBtns = {};
for (const name of Object.keys(PRESETS)) {
  const b = document.createElement('button');
  b.textContent = name[0].toUpperCase() + name.slice(1);
  b.onclick = () => setMood(name);
  bar.appendChild(b); moodBtns[name] = b;
}
const tourBtn = document.createElement('button');
tourBtn.textContent = 'Tour'; tourBtn.onclick = () => setTour(!tour);
bar.appendChild(tourBtn);
// Big clouds on/off (remembered on this device; ?big=0 starts with them off)
let bigClouds = qs.get('big') !== '0';
try { if (!qs.has('big') && localStorage.getItem('savanna.bigClouds') === '0') bigClouds = false; } catch {}
const bigBtn = document.createElement('button');
bigBtn.textContent = 'Big clouds'; bigBtn.onclick = () => setBig(!bigClouds);
bar.appendChild(bigBtn);
function setBig(on) {
  bigClouds = on; bigBtn.classList.toggle('on', on);
  try { localStorage.setItem('savanna.bigClouds', on ? '1' : '0'); } catch {}
}
setBig(bigClouds);
function setMood(n) { moodName = n; for (const k in moodBtns) moodBtns[k].classList.toggle('on', k === n); }
function setTour(on) { tour = on; tourBtn.classList.toggle('on', on); }
setMood(moodName); setTour(tour);
const hud = document.getElementById('hud');
const loading = document.getElementById('loading');

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  godRays.composer.setSize(innerWidth, innerHeight);
});

// ---- first build, then the loop ----
updateCamera(0);
const flightClouds = makeFlightClouds(scene, camera, LOW);
const godRays = makeGodRays(renderer, scene, camera, LOW);
godRays.composer.setPixelRatio(pixelRatio);
window.savanna.godRays = godRays;
const paper = makePaperPass();   // last step: paper grain + colour grade on the finished picture
godRays.composer.addPass(paper);
window.savanna.paper = paper;
let ready = false;
trees.load().then(() => trees.update(camera, true));
grass.update(camera, 1e9, true);

const clock = new THREE.Clock();
let fpsT = 0, fpsN = 0, slow = 0, fast = 0;
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  U.uTime.value += dt; skyUniforms.uTime.value += dt;
  if (!ready) {
    const left = terrain.update(pos.x, pos.z, 60);
    loading.textContent = 'Building the savanna... ' + left;
    if (left === 0) { ready = true; loading.style.display = 'none'; }
    godRays.composer.render();
    return;
  }
  blendState(cur, PRESETS[moodName], 1 - Math.exp(-dt * 1.8));
  pushState();
  updateCamera(dt);
  terrain.update(pos.x, pos.z, 4);
  grass.update(camera, 3);
  trees.update(camera);
  water.userData.follow(camera);
  birds.userData.follow(camera);
  flightClouds.update(dt, camera, yaw, moodLin, bigClouds);
  camera.updateMatrixWorld();
  godRays.update(U.uSunDir.value, cur.night);
  paper.uniforms.uGrade.value = cur.grade;
  godRays.composer.render();

  // keep it smooth: lower the resolution a little if frames are slow
  fpsT += dt; fpsN++;
  if (dt > 1 / 40) slow += dt; else slow = Math.max(0, slow - dt * 0.5);
  if (dt < 1 / 70) fast += dt; else fast = 0;
  if (slow > 1.5 && pixelRatio > 0.6) { pixelRatio = Math.max(0.6, pixelRatio - 0.15); renderer.setPixelRatio(pixelRatio); godRays.composer.setPixelRatio(pixelRatio); slow = 0; }
  if (fast > 5 && pixelRatio < MAX_PR) { pixelRatio = Math.min(MAX_PR, pixelRatio + 0.1); renderer.setPixelRatio(pixelRatio); godRays.composer.setPixelRatio(pixelRatio); fast = 0; }
  if (fpsT > 0.5) {
    hud.textContent = Math.round(fpsN / fpsT) + ' fps  |  ' + renderer.info.render.calls + ' draws  |  res ' + pixelRatio.toFixed(2) + '  |  ' + trees.status;
    fpsT = 0; fpsN = 0;
  }
});
