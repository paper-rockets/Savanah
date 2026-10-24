// Loading the cut-out pictures and turning them into flat painted cards.
import * as THREE from 'three';

const PIECES_URL = 'art/pieces/';
const textures = new Map();   // name -> { tex, aspect }

// One shared card shape: 1 x 1, with its origin at the bottom middle,
// so every piece stands on its own base line.
const CARD = new THREE.PlaneGeometry(1, 1);
CARD.translate(0, 0.5, 0);

// Some hill pictures were cut so that a hill runs on to the picture's edge and ends in a tall straight wall.
// Slope such an end down to the ground over a gentle length (the hill keeps its own picture, only the end changes).
function slopeHillEnds(image) {
  const W = image.width, H = image.height;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  const img = ctx.getImageData(0, 0, W, H), px = img.data;
  const solid = (x, y) => px[(y * W + x) * 4 + 3] > 128;
  const colRange = (x) => {   // first and last solid row of a column, or null
    let top = -1, bottom = -1;
    for (let y = 0; y < H; y++) if (solid(x, y)) { if (top < 0) top = y; bottom = y; }
    return top < 0 ? null : [top, bottom];
  };
  let first = 0, last = W - 1;
  while (first < W && !colRange(first)) first++;
  while (last > first && !colRange(last)) last--;
  let changed = false;
  for (const dir of [1, -1]) {
    const end = dir === 1 ? first : last;
    const r = colRange(end + dir * 2);
    if (!r || (r[1] - r[0]) < 0.12 * H) continue;   // the hill already comes down to nothing
    const len = Math.min(Math.max((r[1] - r[0]) * 3, 0.1 * W), 0.4 * W);
    for (let i = 0; i < len; i++) {
      const x = end + dir * i, c = colRange(x);
      if (!c) continue;
      const t = i / len, keep = t * t * (3 - 2 * t);   // share of this column's height that stays
      const newTop = c[1] - (c[1] - c[0]) * keep;
      for (let y = c[0]; y <= c[1]; y++) {
        if (y < newTop - 0.5) px[(y * W + x) * 4 + 3] = 0;
        else if (y < newTop + 0.5) px[(y * W + x) * 4 + 3] *= newTop + 0.5 - y;
      }
    }
    changed = true;
  }
  if (!changed) return image;
  ctx.putImageData(img, 0, 0);
  return canvas;
}

export async function loadPieces(names, onProgress) {
  const loader = new THREE.TextureLoader();
  let done = 0;
  await Promise.all(names.map((name) => new Promise((resolve, reject) => {
    loader.load(`${PIECES_URL}${name}.png`, (tex) => {
      if (/mountain/.test(name)) { tex.image = slopeHillEnds(tex.image); tex.needsUpdate = true; }
      tex.premultiplyAlpha = true;           // clean edges when the picture is shrunk
      tex.anisotropy = 4;
      textures.set(name, { tex, aspect: tex.image.width / tex.image.height });
      onProgress?.(++done, names.length);
      resolve();
    }, undefined, () => reject(new Error(`Missing picture: ${name}`)));
  })));
}

export function piece(name) {
  const p = textures.get(name);
  if (!p) throw new Error(`Picture not loaded: ${name}`);
  return p;
}

const vertexShader = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// haze = how much the picture fades towards the sky colour (far things are paler)
const fragmentShader = /* glsl */`
  uniform sampler2D map;
  uniform sampler2D map2;
  uniform float blend;
  uniform vec3 hazeColor;
  uniform float haze;
  uniform vec3 rampDark;
  uniform vec3 rampLight;
  uniform float ramp;
  uniform float opacity;
  varying vec2 vUv;
  void main() {
    // -0.5 = read a sharper copy of the picture when it is shrunk (the standard one is a bit soft:
    // zebra stripes turned to grey mush). Colour is already multiplied by alpha; blend = fade to the next pose.
    vec4 c = mix(texture2D(map, vUv, -0.5), texture2D(map2, vUv, -0.5), blend);
    if (c.a < 0.004) discard;
    // recolour by lightness, keeping the painted shading: dark parts -> rampDark, light parts -> rampLight (sunset clouds)
    float lum = dot(c.rgb / c.a, vec3(0.3, 0.55, 0.15));
    c.rgb = mix(c.rgb, mix(rampDark, rampLight, lum) * c.a, ramp);
    c.rgb = mix(c.rgb, hazeColor * c.a, haze);
    gl_FragColor = c * opacity;
  }
`;

// ramp = optional [dark colour, light colour] to recolour the picture by its lightness
export function makeCard(name, height, haze, hazeColor, ramp = null) {
  const { tex, aspect } = piece(name);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: tex },
      map2: { value: tex },
      blend: { value: 0 },
      haze: { value: haze },
      opacity: { value: 1 },
      hazeColor: { value: hazeColor },
      rampDark: { value: ramp ? ramp[0] : hazeColor },
      rampLight: { value: ramp ? ramp[1] : hazeColor },
      ramp: { value: ramp ? 1 : 0 },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    premultipliedAlpha: true,
    depthTest: false,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(CARD, material);
  mesh.scale.set(height * aspect, height, 1);
  mesh.userData.height = height;
  return mesh;
}

// Soft round shadow on the ground under a standing card. One look for all of them.
const SHADOW = new THREE.PlaneGeometry(1, 1);
const makeShadowMaterial = (strength) => new THREE.ShaderMaterial({
  vertexShader,
  fragmentShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      float r = length((vUv - 0.5) * 2.0);
      float a = (1.0 - smoothstep(0.25, 1.0, r)) * ${strength.toFixed(2)};
      gl_FragColor = vec4(vec3(0.45, 0.27, 0.05) * a, a);   // warm brown, not grey
    }
  `,
  transparent: true,
  premultipliedAlpha: true,
  blending: THREE.CustomBlending,
  blendSrc: THREE.OneFactor,
  blendDst: THREE.OneMinusSrcAlphaFactor,
  depthTest: false,
  depthWrite: false,
});
const shadowMaterial = makeShadowMaterial(0.3);
const darkShadowMaterial = makeShadowMaterial(0.55);   // 3D trees: their painted contact shadow is cut away with the background

// spread = shadow width as a share of the card width, squash = shadow height / width
export function addShadow(card, spread, squash, order) {
  const w = cardWidth(card) * spread;
  const h = w * squash;
  const s = new THREE.Mesh(SHADOW, shadowMaterial);
  s.scale.set(spread, h / card.scale.y, 1);
  s.position.y = (-0.15 * h) / card.scale.y;   // sun is behind, so the shadow falls a little towards us
  s.renderOrder = order;
  card.add(s);
}

// The same shadow on its own, for the 3D animals: width in the owner's units, squash = height / width.
export function groundShadow(width, squash, dark = false) {
  const s = new THREE.Mesh(SHADOW, dark ? darkShadowMaterial : shadowMaterial);
  s.scale.set(width, width * squash, 1);
  s.position.y = -0.15 * width * squash;
  return s;
}

// Show pose A fading into pose B (t = 0..1). Both poses of an animal share one box, so they line up.
export function setCardPose(mesh, nameA, nameB, t) {
  const u = mesh.material.uniforms;
  if (mesh.userData.poseA !== nameA) {
    const { tex, aspect } = piece(nameA);
    u.map.value = tex;
    mesh.scale.x = mesh.userData.height * aspect;
    mesh.userData.poseA = nameA;
  }
  if (mesh.userData.poseB !== nameB) { u.map2.value = piece(nameB).tex; mesh.userData.poseB = nameB; }
  u.blend.value = t;
}

// Send every picture to the graphics card now, so nothing hitches the first time an animal shows a new pose.
export function warmUp(renderer) {
  for (const { tex } of textures.values()) renderer.initTexture(tex);
}

export function cardWidth(mesh) {
  return Math.abs(mesh.scale.x);
}
