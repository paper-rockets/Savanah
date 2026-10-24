// Two looks for the same scene, made with colour only: day (as painted) and sunset (?time=sunset).
// Sunset colours were picked from the owner's sunset target picture.
import * as THREE from 'three';

export const TIME = new URLSearchParams(location.search).get('time') === 'sunset' ? 'sunset' : 'day';

const DAY = {
  skyTop: '#2f9ef4', skyLow: '#a6dcf8',
  glow: new THREE.Color(1, 0.97, 0.86), glowStrength: 0.4, glowRadius: 190,   // soft light round the sun
  // pale lemon far off, bright yellow, deep gold, green grass at our feet; paint = how much the grass picture's own colours show close up
  ground: { far: '#ecd54c', mid: '#ffd640', near: '#f2aa18', front: '#5c6222', paint: 0.35 },
  sunSize: 112,
  sky: {},   // sky pieces keep their painted colours
  // light from the sun on the 3D animals and trees (sunlight.js): front = the front light's strength (models3d.js addLights),
  // rim = the edge facing the sun: colour, strength, edge (higher = thinner), haze (how fast it fades with distance)
  sunlight: { front: 2.0, rim: { color: '#fff0c8', strength: 0.3, edge: 0.45, haze: 2 } },
  // sun rays (godrays.js): strength, tint (+ how much of it), length = share of the way to the sun the rays reach back,
  // decay = fade along a ray, reach = how far from the sun they show (screen heights), source = how far round the sun the sky gives light
  rays: { strength: 0.45, tint: '#fff2cc', tintMix: 0.3, length: 0.95, decay: 0.97, reach: 1.3, source: 330 },
};

const SUNSET = {
  skyTop: '#cf3a2e', skyLow: '#fc7a18',
  glow: new THREE.Color('#ffd860'), glowStrength: 0.75, glowRadius: 260,
  ground: { far: '#c2401a', mid: '#a82a08', near: '#701508', front: '#3a0e06', paint: 0 },
  sunSize: 150,
  // mix = [how much, colour] to fade towards; ramp = [dark, light] recolour by lightness (keeps the painted shading)
  sky: {
    clouds: { ramp: ['#c2321c', '#ffc246'] },
    farHills: { mix: [0.8, '#c73826'] },
    nearHills: { mix: [0.8, '#9e322b'] },
    sun: { mix: [0.6, '#fee37a'] },
    birds: { mix: [0.9, '#3c0f08'] },
    lake: { mix: [0.75, '#f8892a'] },
  },
  // everything standing on the ground turns almost to a silhouette: dark red-brown close, redder far off
  standing: { amount: 0.86, near: '#3c0f08', far: '#9a2c18', farD: 120 },
  // full back light: no front light, a wide gold edge on every body, near and far
  sunlight: { front: 0, rim: { color: '#ffa73a', strength: 1.0, edge: 0.05, haze: 0 } },
  rays: { strength: 0.9, tint: '#ffc24a', tintMix: 0.45, length: 0.95, decay: 0.975, reach: 1.6, source: 420 },
};

export const THEME = TIME === 'sunset' ? SUNSET : DAY;
