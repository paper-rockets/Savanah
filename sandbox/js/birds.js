// A small flock of dark V-shaped birds circling high up, flapping.
import * as THREE from 'three';
import { shaderMat } from './shaderlib.js';

export function makeBirds(count = 9) {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0.5, -1, 0, -0.15, 0, 0, -0.25,
    0, 0, 0.5, 0, 0, -0.25, 1, 0, -0.15,
  ], 3));
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    seeds[i * 4] = (i % 3) * 5 - 5 + Math.random() * 3;     // spread in the flock
    seeds[i * 4 + 1] = Math.floor(i / 3) * 4 + Math.random() * 2;
    seeds[i * 4 + 2] = Math.random() * 6.28;               // flap phase
    seeds[i * 4 + 3] = 0.8 + Math.random() * 0.5;           // size
  }
  g.setAttribute('iSeed', new THREE.InstancedBufferAttribute(seeds, 4));
  g.instanceCount = count;
  const mat = shaderMat({
    side: THREE.DoubleSide,
    uniforms: { uCenter: { value: new THREE.Vector3() } },
    vertexShader: /* glsl */`
      uniform float uTime; uniform vec3 uCenter;
      attribute vec4 iSeed;
      varying vec3 vWorld;
      void main() {
        vec3 p = position * iSeed.w * 1.4;
        p.y += sin(uTime * 7.0 + iSeed.z) * 0.7 * abs(position.x) * iSeed.w;
        float a = uTime * 0.05;
        vec3 fwd = vec3(-sin(a), 0.0, cos(a));
        vec3 side = vec3(fwd.z, 0.0, -fwd.x);
        vec3 base = uCenter + vec3(cos(a), 0.0, sin(a)) * 260.0;
        vec3 w = base + side * iSeed.x + fwd * -iSeed.y + vec3(0.0, sin(uTime * 0.3 + iSeed.z) * 2.0, 0.0);
        w += side * p.x + vec3(0.0, p.y, 0.0) + fwd * p.z;
        vWorld = w;
        gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vWorld;
      void main() {
        vec3 col = mix(vec3(0.08, 0.06, 0.08), uZenith * 0.25, 0.3);
        gl_FragColor = vec4(toLinearOut(applyFog(col, vWorld) * 0.6 + col * 0.4), 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.userData.follow = (cam) => {
    mat.uniforms.uCenter.value.set(Math.round(cam.position.x / 400) * 400, cam.position.y + 70, Math.round(cam.position.z / 400) * 400 - 150);
  };
  return mesh;
}
