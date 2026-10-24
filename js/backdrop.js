// Sky and the painted ground behind all the cut-out pieces.
// The sky never moves (it is endlessly far away). The ground is the Codex
// grass strip laid flat in perspective: its texture gets smaller towards the
// horizon and slides by the same distance rule as everything standing on it.
import * as THREE from 'three';

const vertexShader = /* glsl */`
  varying vec2 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xy;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const skyFragment = /* glsl */`
  uniform vec3 top;
  uniform vec3 low;
  uniform float horizon;
  uniform float skyTop;
  uniform vec2 sun;
  uniform vec3 glow;
  uniform float glowStrength;
  uniform float glowRadius;
  varying vec2 vWorld;
  void main() {
    float t = clamp((vWorld.y - horizon) / (skyTop - horizon), 0.0, 1.0);
    vec3 c = mix(low, top, pow(t, 0.7));
    // soft glow round the painted sun
    float d = distance(vWorld, sun);
    c = mix(c, glow, (1.0 - smoothstep(40.0, glowRadius, d)) * glowStrength);
    gl_FragColor = vec4(c, 1.0);
  }
`;

// TILE_U: across, one copy of the strip covers this many units at the bottom of the screen.
// TILE_V: down, one copy is this many units tall at the bottom of the screen.
const groundFragment = /* glsl */`
  uniform sampler2D grass;
  uniform vec3 far;
  uniform vec3 mid;
  uniform vec3 near;
  uniform vec3 front;
  uniform vec3 haze;
  uniform float horizon;
  uniform float frontD;
  uniform float scrollU;
  uniform float tileU;
  uniform float tileV;
  uniform float paint;
  varying vec2 vWorld;
  void main() {
    float d = max(horizon - vWorld.y, 0.5);
    float t = clamp(d / frontD, 0.0, 1.0);
    // pale far off, bright in the middle, deep gold close up
    vec3 c = mix(mix(far, mid, smoothstep(0.0, 0.35, t)), near, smoothstep(0.35, 0.8, t));

    // flat ground seen from above the grass: across = x / d, into the distance = 1 / d
    vec2 uv = vec2(vWorld.x / d * frontD / tileU + scrollU, frontD * frontD / (tileV * d));
    vec3 g = texture2D(grass, uv).rgb;
    float shade = dot(g, vec3(0.3, 0.55, 0.15)) / 0.7;     // how light or dark the painted grass is here
    float show = smoothstep(3.0, 45.0, d);                 // fades out into flat colour at the horizon
    c = mix(c, c * shade, show);
    c = mix(c, g, paint * smoothstep(80.0, frontD, d));    // close up, the painted colours come through
    c = mix(c, front * (0.6 + 0.6 * shade), 0.9 * smoothstep(0.7, 0.92, t));   // green grass along the bottom edge

    c = mix(mix(haze, far, 0.6), c, smoothstep(0.0, 0.02, t));   // soft line where ground meets sky
    gl_FragColor = vec4(c, 1.0);
  }
`;

export function makeBackdrop(scene, cfg) {
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
    uniforms: {
      top: { value: new THREE.Color(cfg.skyTop) },
      low: { value: new THREE.Color(cfg.skyLow) },
      horizon: { value: cfg.horizon },
      skyTop: { value: cfg.viewHeight / 2 },
      sun: { value: new THREE.Vector2(cfg.sunX, cfg.sunY) },
      glow: { value: cfg.glow },
      glowStrength: { value: cfg.glowStrength },
      glowRadius: { value: cfg.glowRadius },
    },
    vertexShader,
    fragmentShader: skyFragment,
    depthTest: false,
    depthWrite: false,
  }));
  sky.renderOrder = -1;
  scene.add(sky);

  const uniforms = {
    grass: { value: cfg.grassTexture },
    far: { value: new THREE.Color(cfg.groundFar) },
    mid: { value: new THREE.Color(cfg.groundMid) },
    near: { value: new THREE.Color(cfg.groundNear) },
    front: { value: new THREE.Color(cfg.groundFront) },
    haze: { value: new THREE.Color(cfg.skyLow) },
    horizon: { value: cfg.horizon },
    frontD: { value: cfg.frontD },
    scrollU: { value: 0 },
    tileU: { value: 1100 },
    tileV: { value: 150 },
    paint: { value: cfg.groundPaint },
  };
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader: groundFragment,
    depthTest: false,
    depthWrite: false,
  }));
  ground.renderOrder = cfg.groundOrder;
  scene.add(ground);

  return {
    // stretch both to the current screen width
    fit(view) {
      const w = view.right - view.left + 20;
      const h = cfg.viewHeight;
      sky.scale.set(w, h, 1);
      const gh = cfg.horizon + h / 2;
      ground.scale.set(w, gh, 1);
      ground.position.set(0, -h / 2 + gh / 2, 0);
    },
    // distance travelled at the bottom of the screen, in units
    setTravel(units) {
      const u = units / uniforms.tileU.value;
      uniforms.scrollU.value = u - Math.floor(u);   // keep it small so it stays sharp after hours
    },
  };
}
