// The savanna shape: gentle plains, rocky kopjes (outcrops), waterholes, one dirt road.
// Everything is a pure function of x,z so chunks, grass and trees all agree.
import { snoise, fbm, smoothstep } from './noise.js';

export const WATER_Y = -1.6;

// Winding dirt road (same formula lives in the ground shader)
export function pathX(z) {
  return Math.sin(z * 0.006) * 55 + Math.sin(z * 0.017 + 1.0) * 14;
}

// the lake in the opening view: close enough to fill the middle of the picture
const LAKE_X = 25, LAKE_Z = -215, LAKE_R = 115;

// out.h = height, out.rock = 0..1 outcrop amount, out.basin = 0..1 waterhole amount
export function sample(x, z, out) {
  let basin = smoothstep(0.40, 0.56, fbm(x * 0.0016 + 31.7, z * 0.0016 - 12.3, 2));
  const home = smoothstep(90, 200, Math.hypot(x, z));   // keep the start dry
  basin *= home;
  const dl = Math.hypot(x - LAKE_X, (z - LAKE_Z) * 1.3);
  basin = Math.max(basin, smoothstep(LAKE_R, LAKE_R * 0.35, dl));

  let h = 4.5
    + fbm(x * 0.0035, z * 0.0035, 3) * 7.5
    + snoise(x * 0.0009, z * 0.0009) * 10
    + fbm(x * 0.013 + 50, z * 0.013, 2) * 1.1;

  // soft floor: plains never dip under the water by themselves, only waterholes do
  const floor = WATER_Y + 1.8;
  h = floor + Math.log(1 + Math.exp((h - floor) / 2.5)) * 2.5;

  // kopjes: smooth rounded boulder domes
  let rock = smoothstep(0.62, 0.84, snoise(x * 0.0042 + 7.7, z * 0.0042 + 2.1)) * (1 - basin);
  h += Math.pow(rock, 0.7) * (11 + 5 * fbm(x * 0.012, z * 0.012, 2)) + rock * 1.2 * snoise(x * 0.04, z * 0.04);

  h += (WATER_Y - 2.6 - h) * basin;   // pull the basin down under the water line
  out.h = h; out.rock = rock; out.basin = basin;
  return out;
}

const tmp = { h: 0, rock: 0, basin: 0 };
export function height(x, z) { return sample(x, z, tmp).h; }
// name used by clouds.js (copied from the flight game)
export const getWorldHeight = height;
