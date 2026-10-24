// One flat water sheet at WATER_Y that follows the camera; the terrain hides it
// everywhere except the waterholes.
import * as THREE from 'three';
import { WATER_Y } from './world.js';
import { shaderMat } from './shaderlib.js';

export function makeWater() {
  const mat = shaderMat({
    transparent: true,
    vertexShader: /* glsl */`
      varying vec3 vWorld;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vWorld;
      void main() {
        vec2 p = vWorld.xz;
        vec3 V = normalize(cameraPosition - vWorld);
        float n1 = vnoise(p * 0.35 + uTime * vec2(0.3, 0.12));
        float n2 = vnoise(p * 0.9 - uTime * vec2(0.18, 0.35));
        vec3 N = normalize(vec3((n1 - 0.5) * 0.25 + (n2 - 0.5) * 0.12, 1.0, (n2 - 0.5) * 0.25));
        float fres = pow(1.0 - max(dot(V, N), 0.0), 3.0);
        vec3 R = reflect(-V, N);
        vec3 sky = mix(uHorizon, uZenith, smoothstep(0.0, 0.6, R.y));
        vec3 col = mix(uWaterCol, sky, 0.25 + 0.6 * fres);
        // painted ripple streaks
        float streak = smoothstep(0.62, 0.7, vnoise(vec2(p.x * 0.08, p.y * 0.9) + uTime * 0.05));
        col = mix(col, sky * 1.08, streak * 0.35);
        // low sun: a tighter, softer glint so the lake in the opening view doesn't blow out white
        float lowSun = smoothstep(0.45, 0.12, uSunDir.y);
        float spec = pow(max(dot(R, uSunDir), 0.0), mix(120.0, 600.0, lowSun));
        col += uSunColor * spec * mix(1.5, 0.45, lowSun);
        col *= cloudShade(p) * uTint;
        gl_FragColor = vec4(toLinearOut(applyFog(col, vWorld)), 0.93);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400).rotateX(-Math.PI / 2), mat);
  mesh.position.y = WATER_Y;
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  mesh.userData.follow = (cam) => {
    mesh.position.x = Math.round(cam.position.x / 50) * 50;
    mesh.position.z = Math.round(cam.position.z / 50) * 50;
  };
  return mesh;
}
