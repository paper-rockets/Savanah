// Lighting moods. Colours are display colours (what you see on screen).
// Day, Dusk and Night sky colours are the flight game's (Trees Terrains sky.js / main.js);
// Sunset is matched to the owner's red-orange target paintings.
import * as THREE from 'three';
const c = (r, g, b) => new THREE.Color(r, g, b);
const h = (hex) => new THREE.Color().setHex(hex, THREE.NoColorSpace);

export const PRESETS = {
  day: {
    // target painting: far plain fades to muted gold (not cream) and ends in a clean line under
    // low rounded blue hills, a huge pale sun sitting on them (painted disc in front;
    // the light itself stays behind the camera so trees are not back-lit); small flat-bottomed clouds and thin streaks, no horizon towers
    zenith: h(0x3a88d6), skyMid: h(0x72b2e8), horizon: h(0xb8daf2), fog: c(0.80, 0.76, 0.56),
    sunColor: c(1.0, 0.93, 0.76), ambSky: c(0.55, 0.62, 0.74), ambGnd: c(0.45, 0.36, 0.22), tint: c(1, 1, 1),
    mtn0: c(0.58, 0.70, 0.92), mtn1: c(0.42, 0.57, 0.86), mtn2: c(0.30, 0.45, 0.80),
    discColor: h(0xfff3c8), domeCloud: h(0xfffcf5), cloudLit: h(0xfffdf6), cloudShade: h(0x9cb8db), water: c(0.12, 0.52, 0.74),
    elev: 0.62, az: 2.5, disc: 0.13, nearDark: 0, glow: 0.25, horizonGlow: 0.15, dusk: 0, night: 0, coverage: 0.36, towers: 0, banks: 0, lowAlt: 420, highs: 0, discEl: 0.07, discAz: 0.0,
    lows: 9, lowSize: 0.55, streak: 1, peaks: 1, treeLine: 1, grade: 1,
    fogDensity: 0.0019, cloudShadow: 0.22, sunI: 2.6, hemiI: 2.6,
  },
  golden: {
    zenith: c(0.30, 0.55, 0.86), skyMid: c(0.78, 0.70, 0.70), horizon: c(1.0, 0.82, 0.56), fog: c(1.0, 0.80, 0.56),
    sunColor: c(1.0, 0.74, 0.42), ambSky: c(0.70, 0.60, 0.56), ambGnd: c(0.50, 0.33, 0.20), tint: c(1.05, 0.93, 0.80),
    mtn0: c(0.80, 0.63, 0.64), mtn1: c(0.64, 0.51, 0.61), mtn2: c(0.51, 0.41, 0.54),
    discColor: c(1.0, 0.93, 0.66), domeCloud: c(1.0, 0.92, 0.80), cloudLit: c(1.0, 0.88, 0.70), cloudShade: c(0.72, 0.60, 0.68), water: c(0.24, 0.40, 0.56),
    elev: 0.16, az: 0.35, disc: 0.10, nearDark: 0.1, glow: 0.7, horizonGlow: 0.35, dusk: 0.5, night: 0, coverage: 0.42, towers: 3, banks: 1, lowAlt: 380, highs: 10, discEl: 0.16, discAz: 0.35,
    lows: 16, lowSize: 1, streak: 0, peaks: 0, treeLine: 0.8, grade: 0.6,
    fogDensity: 0.0026, cloudShadow: 0.12, sunI: 2.4, hemiI: 2.3,
  },
  sunset: {
    zenith: c(0.86, 0.24, 0.12), skyMid: c(0.96, 0.42, 0.17), horizon: c(1.0, 0.68, 0.30), fog: c(1.0, 0.56, 0.24),
    sunColor: c(1.0, 0.62, 0.30), ambSky: c(0.95, 0.50, 0.30), ambGnd: c(0.55, 0.20, 0.10), tint: c(1.0, 0.68, 0.46),
    mtn0: c(0.93, 0.55, 0.38), mtn1: c(0.85, 0.43, 0.31), mtn2: c(0.74, 0.32, 0.24),
    discColor: c(1.0, 0.93, 0.62), domeCloud: c(1.0, 0.76, 0.46), cloudLit: c(1.0, 0.72, 0.40), cloudShade: c(0.90, 0.42, 0.28), water: c(0.70, 0.38, 0.18),
    elev: 0.10, az: 0.25, disc: 0.14, nearDark: 0.8, glow: 1.0, horizonGlow: 0.45, dusk: 1, night: 0, coverage: 0.40, towers: 0, banks: 0, lowAlt: 700, highs: 0, discEl: 0.10, discAz: 0.25,
    lows: 16, lowSize: 1, streak: 0, peaks: 0, treeLine: 0, grade: 0,
    fogDensity: 0.0030, cloudShadow: 0, sunI: 1.4, hemiI: 2.0,
  },
  dusk: {
    zenith: h(0x2a5090), skyMid: h(0xc85078), horizon: h(0xffa07a), fog: c(0.95, 0.56, 0.46),
    sunColor: c(1.0, 0.60, 0.40), ambSky: c(0.64, 0.47, 0.64), ambGnd: c(0.40, 0.22, 0.25), tint: c(0.95, 0.74, 0.76),
    mtn0: c(0.73, 0.42, 0.53), mtn1: c(0.56, 0.33, 0.51), mtn2: c(0.43, 0.27, 0.46),
    discColor: h(0xffaa00), domeCloud: h(0xfffaec), cloudLit: h(0xffd5a0), cloudShade: h(0x8a7098), water: c(0.36, 0.29, 0.46),
    elev: 0.09, az: -0.2, disc: 0.07, nearDark: 0.35, glow: 0.8, horizonGlow: 0.45, dusk: 1, night: 0, coverage: 0.45, towers: 2, banks: 1, lowAlt: 450, highs: 10, discEl: 0.09, discAz: -0.2,
    lows: 16, lowSize: 1, streak: 0, peaks: 0, treeLine: 0, grade: 0,
    fogDensity: 0.0029, cloudShadow: 0, sunI: 1.2, hemiI: 1.9,
  },
  night: {
    zenith: h(0x162d5a), skyMid: h(0x1d3a6e), horizon: h(0x224888), fog: c(0.12, 0.17, 0.36),
    sunColor: c(0.55, 0.63, 0.86), ambSky: c(0.32, 0.38, 0.62), ambGnd: c(0.14, 0.14, 0.20), tint: c(0.66, 0.66, 0.80),
    mtn0: c(0.23, 0.23, 0.50), mtn1: c(0.19, 0.19, 0.43), mtn2: c(0.15, 0.15, 0.35),
    discColor: c(0.93, 0.91, 0.83), domeCloud: h(0x2e4a80), cloudLit: h(0x9ec7eb), cloudShade: h(0x1a3055), water: c(0.07, 0.14, 0.32),
    elev: 0.30, az: 0.1, disc: 0.05, nearDark: 0, glow: 0.35, horizonGlow: 0.10, dusk: 0, night: 1, coverage: 0.45, towers: 5, banks: 1, lowAlt: 320, highs: 10, discEl: 0.30, discAz: 0.1,
    lows: 16, lowSize: 1, streak: 0, peaks: 0, treeLine: 0, grade: 0,
    fogDensity: 0.0028, cloudShadow: 0.1, sunI: 0.9, hemiI: 1.4,
  },
};

export function cloneState(p) {
  const o = {};
  for (const k in p) o[k] = p[k].isColor ? p[k].clone() : p[k];
  return o;
}
export function blendState(cur, tgt, t) {
  for (const k in tgt) {
    if (cur[k].isColor) cur[k].lerp(tgt[k], t);
    else cur[k] += (tgt[k] - cur[k]) * t;
  }
}
