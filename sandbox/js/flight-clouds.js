// Runs the flight game's 3D toon clouds (clouds.js, copied unchanged) in the savanna.
// Settings and the per-frame colour feeding are taken from the flight game's main.js.
import * as THREE from 'three';
import { setupToonCloudShader, initClouds } from './clouds.js';

export function makeFlightClouds(scene, camera, LOW_GFX) {
  // same values as the flight game's params block, except the low clouds: the flight game
  // looks at them from the air; from the ground 45 of them fill the sky, so fewer and higher
  const params = {
    showClouds: true,
    cloudsLow: true, cloudsHigh: true, cloudsLowTower: true, cloudsGiant: true, cloudsLowBank: true, cloudsBillboard: true,
    cloudsLowCount: LOW_GFX ? 8 : 16, cloudsHighCount: LOW_GFX ? 0 : 10, cloudsLowTowerCount: LOW_GFX ? 0 : 5,
    cloudsGiantCount: LOW_GFX ? 0 : 10, cloudsLowBankCount: LOW_GFX ? 0 : 6, cloudsLowBankDensity: 0.55, cloudsBillboardCount: 10,
    cloudsLowSize: 1.0, cloudsHighSize: 3.0, cloudsLowTowerSize: 1.1, cloudsGiantSize: 3.0, cloudsLowBankSize: 1.1, cloudsBillboardSize: 1.0,
    cloudsLowOpacity: 1.0, cloudsHighOpacity: 0.98, cloudsLowTowerOpacity: 1.0, cloudsGiantOpacity: 1.0, cloudsLowBankOpacity: 1.0, cloudsBillboardOpacity: 1.0,
    cloudsNearSolid: 2000, cloudsFarHaze: 14000,
    cloudsLowBottomBlur: 0.45, cloudsHighBottomBlur: 0.55, cloudsLowTowerBottomBlur: 0.35, cloudsGiantBottomBlur: 0.64,
    cloudsLowBankBottomBlur: 0.40, cloudsBillboardBottomBlur: 0.40,
    cloudsLowAltitude: 320, cloudsLowDistance: 2200, cloudsHighAltitude: 250, cloudsHighDistance: 5650,
    cloudsLowTowerAltitude: -35, cloudsLowTowerDistance: 2375, cloudsGiantAltitude: 500, cloudsGiantDistance: 6600,
    cloudsLowBankAltitude: -5, cloudsLowBankDistance: 2325, cloudsBillboardAltitude: 1400, cloudsBillboardDistance: 5200,
    cloudWindBaseSpeed: 18.0, cloudWindReferenceDistance: 1200.0, cloudWindAttenuation: 0.60, cloudParallaxStrength: 0.35,
    cloudTerrainClearance: 120.0, cloudAvoidanceHeadingThreshold: 0.65, cloudAvoidanceStrength: 0.90, cloudAvoidanceRestoreTau: 2.5,
    cloudsLowColor: '#ffffff', cloudsHighColor: '#ffffff', cloudsLowTowerColor: '#ffffff', cloudsGiantColor: '#ffffff',
    cloudsLowBankColor: '#ffffff', cloudsBillboardColor: '#ffffff',
    cloudsMinDistance: 0, showCloudDebug: false, cloudDebugTargetMode: 'visible', debugCloudTint: false, godMode: false,
    cloudsBillowSpeed: 0.35, cloudsBillowAmount: 1.0,
  };
  window.params = params;   // setupToonCloudShader reads the global, as in the flight game

  // toon gradient map from the flight game's renderer.js
  const gradientColors = new Uint8Array([160, 160, 165, 255, 195, 195, 200, 255, 235, 235, 240, 255, 255, 255, 255, 255]);
  const gradientMap = new THREE.DataTexture(gradientColors, 4, 1, THREE.RGBAFormat);
  gradientMap.needsUpdate = true;
  gradientMap.minFilter = THREE.LinearFilter;
  gradientMap.magFilter = THREE.LinearFilter;
  gradientMap.generateMipmaps = false;

  // materials from the flight game's terrain.js
  const matCloud = new THREE.MeshToonMaterial({
    color: 0xffffff, transparent: false, opacity: params.cloudsLowOpacity,
    depthWrite: true, depthTest: true, side: THREE.FrontSide,
  });
  setupToonCloudShader(matCloud, params.cloudsLowBottomBlur);
  const matWispyCloud = new THREE.MeshToonMaterial({ color: 0xffffff, transparent: true, opacity: 0.42, gradientMap, dithering: true });

  const c = initClouds(scene, params, LOW_GFX, camera.position.x, camera.position.z, camera, null, matCloud, matWispyCloud);
  const tinted = [matCloud, c.highCloudMat, c.lowTowerCloudMat, c.megaCloudMat];

  const toLight = new THREE.Vector3(), col = new THREE.Color();
  let time = 0, first = true;

  // mood: { sunDir, fogLin, cloudColLin, litLin, shadeLin, towers } (linear colours)
  // big = false hides the massive clouds (towers, high towers, giant clouds, banks); small ones stay
  function update(dt, cam, yaw, mood, big = true) {
    time += dt;
    // horizon towers and banks hide the sun and hills at sunset
    params.cloudsLowTowerCount = LOW_GFX ? 0 : Math.round(mood.towers);
    params.cloudsHighCount = LOW_GFX ? 0 : Math.round(mood.highs);
    c.instMegaClouds.visible = c.instLowBankClouds.visible = big && mood.banks > 0.5;
    c.instLowTowerClouds.visible = c.instHighClouds.visible = big;
    // day: fewer, smaller low clouds; resize the ones already in the sky as well as new ones
    params.cloudsLowCount = Math.round(mood.lows * (LOW_GFX ? 0.5 : 1));
    if (Math.abs(params.cloudsLowSize - mood.lowSize) > 0.02) {
      const r = mood.lowSize / params.cloudsLowSize, m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
      for (let i = 0; i < c.instClouds.instanceMatrix.count; i++) {
        c.instClouds.getMatrixAt(i, m); m.decompose(p, q, s);
        c.instClouds.setMatrixAt(i, m.compose(p, q, s.multiplyScalar(r)));
      }
      c.instClouds.instanceMatrix.needsUpdate = true;
      params.cloudsLowSize = mood.lowSize;
    }
    // lift the low clouds at sunset so the sky just above the hills stays clear for the sun
    if (Math.abs(params.cloudsLowAltitude - mood.lowAlt) > 1) {
      params.cloudsLowAltitude = mood.lowAlt;
      c.updateLowCloudAltitude(mood.lowAlt);
    }
    // keep the cloud light at least ~20 deg up, like the flight game does
    toLight.copy(mood.sunDir);
    const minLightY = 0.34;
    if (toLight.y < minLightY) {
      const flat = Math.hypot(toLight.x, toLight.z) || 1;
      const k = Math.sqrt(1 - minLightY * minLightY) / flat;
      toLight.set(toLight.x * k, minLightY, toLight.z * k);
    }
    const k = first ? 1 : Math.min(1, dt * 2);
    first = false;
    (window.cloudShaderUniformsList || []).forEach(u => {
      if (!u) return;
      // shaders compile on first draw; give each new one the mood colour straight away
      const kk = u.__moodSet ? k : 1;
      u.__moodSet = true;
      if (u.uTime) u.uTime.value = time;
      if (u.uBillowSpeed) u.uBillowSpeed.value = params.cloudsBillowSpeed;
      if (u.uBillowAmount) u.uBillowAmount.value = params.cloudsBillowAmount;
      if (u.uSunDir) u.uSunDir.value.copy(toLight);
      if (u.uHorizonColor) u.uHorizonColor.value.copy(mood.fogLin);
      if (u.uSunLitColor) u.uSunLitColor.value.lerp(mood.litLin, kk);
      if (u.uSkyShadowColor) u.uSkyShadowColor.value.lerp(mood.shadeLin, kk);
    });
    tinted.forEach(m => { if (m) m.color.lerp(col.copy(mood.cloudColLin), k); });
    matWispyCloud.color.lerp(mood.cloudColLin, k);
    c.updateClouds(cam.position.x, cam.position.y, cam.position.z, dt, yaw);
  }
  return { update };
}
