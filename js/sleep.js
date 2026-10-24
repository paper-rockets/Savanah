// Sleep button: the whole scene stands still and a small herd of elephants lies down to sleep right at
// the front of the screen, much closer than any herd ever walks. Pressed again, they go and the scene plays on.
import * as THREE from 'three';
import { KINDS, makeAnimal, settle } from './models3d.js';
import { yAt, unitsPerMetre, shadowSquash, standingOrder } from './depth.js';
import { makeRng } from './lanes.js';

// x = where on screen, as a share of half the screen width (-1 left edge, 1 right edge);
// d = how near (the bottom of the screen is 250); the calf lies nearest, in front of the grown-ups.
const SLEEPERS = [
  { kind: 'elephant', x: -0.5, d: 200 },
  { kind: 'elephant', x: 0.45, d: 210 },
  { kind: 'elephantCalf', x: -0.02, d: 238 },
];

// look(y) -> [haze, hazeColor], the same colouring as everything else at that distance.
export function makeSleep(scene, view, look) {
  const group = new THREE.Group();
  scene.add(group);
  let naps = 0;
  const sleep = {
    on: false,
    toggle() {
      sleep.on = !sleep.on;
      if (sleep.on) {
        const rng = makeRng(++naps);
        for (const s of SLEEPERS) {
          const y = yAt(s.d);
          const metres = KINDS[s.kind].metres * rng.range(0.95, 1.05);
          const m = makeAnimal(s.kind, 'sleep', { metres, height: metres * unitsPerMetre(y), ...lookOf(y), squash: shadowSquash(y), speed: 0 }, rng);
          m.position.set(s.x * view.right, y, 0);
          m.renderOrder = standingOrder(y);
          group.add(m);
          settle(m, s.d);
        }
      } else {
        for (const m of [...group.children]) { group.remove(m); m.userData.dispose(); }
      }
      return sleep.on;
    },
    update(dt) {
      for (const m of group.children) m.userData.mixer.update(dt);
    },
  };
  const lookOf = (y) => { const [haze, hazeColor] = look(y); return { haze, hazeColor }; };
  return sleep;
}
