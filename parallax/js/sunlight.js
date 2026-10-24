// Light from the painted sun on the 3D animals and trees. The sun sits behind the scene, low in the middle of the
// screen, so it lights the edges of each body that face it: the top, and the side towards the sun (an animal left
// of the sun gets it on its right side). Day: a faint warm edge, the front light stays. Sunset: a wide gold back
// light over the near-silhouettes, no front light (THEME.sunlight).
// Added after the haze, so it still shows on the sunset silhouettes; it fades out with the night (setSunUp).
import * as THREE from 'three';
import { THEME } from './theme.js';

const S = THEME.sunlight;
const uniforms = {
  sunPos: { value: new THREE.Vector2() },   // the sun's middle on screen (scene units)
  rimColor: { value: new THREE.Color(S.rim.color) },
  rimStrength: { value: S.rim.strength },
  rimEdge: { value: S.rim.edge },           // how far a surface must face the sun to catch it: higher = thinner edge
  rimHaze: { value: S.rim.haze },           // how much the haze (distance) takes the light away
};

// The light arrives from behind (into the screen) and from the sun's side on screen.
// back = how much a surface faces it; only the part past rimEdge lights up, with a short soft step.
const RIM = /* glsl */`
  {
    vec2 toSun = sunPos + vViewPosition.xy;   // vViewPosition is minus the point's place (the camera sits at 0)
    vec3 lightDir = normalize( vec3( normalize( toSun + vec2( 0.0, 0.001 ) ) * 0.8, -0.6 ) );
    float back = dot( normal, lightDir );
    float rim = smoothstep( rimEdge, rimEdge + 0.15, back ) * rimStrength * clamp( 1.0 - haze * rimHaze, 0.0, 1.0 );
    gl_FragColor.rgb += rimColor * rim;
  }
`;

// For hazed() (models3d.js): call after the haze has been added to the shader.
export function addRim(shader) {
  Object.assign(shader.uniforms, uniforms);
  shader.fragmentShader = 'uniform vec2 sunPos;\nuniform vec3 rimColor;\nuniform float rimStrength;\nuniform float rimEdge;\nuniform float rimHaze;\n'
    + shader.fragmentShader.replace('gl_FragColor.rgb = mix(gl_FragColor.rgb, hazeColor, haze);', '$&' + RIM);
}

export const setSunPos = (x, y) => uniforms.sunPos.value.set(x, y);
// up = 1 by day, 0 at night (the sun has set)
export const setSunUp = (up) => { uniforms.rimStrength.value = S.rim.strength * up; };
