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
};

export const THEME = TIME === 'sunset' ? SUNSET : DAY;
