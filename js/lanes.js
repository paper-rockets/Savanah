// A lane is one band of the scene (far hills, horizon trees, the middle ground...).
// It keeps adding new pieces just past the right edge of the screen and drops
// the ones that left on the left side, so it never runs out.
// Every piece slides at its own speed: ground pieces by how near they stand,
// sky pieces (clouds, hills, birds) by the lane's fixed share.
import * as THREE from 'three';
import { cardWidth, setCardPose } from './sprites.js';
import { speedShare } from './depth.js';

export function makeRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.range = (lo, hi) => lo + (hi - lo) * next();
  next.pick = (list) => list[Math.floor(next() * list.length)];
  next.weighted = (list) => {
    const total = list.reduce((s, it) => s + it.weight, 0);
    let r = next() * total;
    for (const it of list) { r -= it.weight; if (r <= 0) return it; }
    return list[list.length - 1];
  };
  return next;
}

const EDGE = 80;   // extra room past each screen edge before adding / dropping pieces

export class Lane {
  // opts: yTop / yBottom (base line range), factor (fixed share of the scroll speed,
  //       leave out for ground pieces), drift (own speed), make(ctx) -> { width },
  //       gap(rng, width) -> number, firstGap
  constructor(scene, rng, opts) {
    this.opts = opts;
    this.rng = rng;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.toNext = null;
    // how fast new pieces are needed: the speed of the middle of the band
    this.refShare = opts.factor ?? speedShare((opts.yTop + opts.yBottom) / 2);
  }

  randomY() {
    return this.rng.range(this.opts.yBottom, this.opts.yTop);
  }

  place(mesh, x, y, order) {
    mesh.position.set(x, y, 0);
    mesh.renderOrder = order;
    mesh.userData.share = this.opts.factor ?? speedShare(y);
    this.group.add(mesh);
  }

  spawn(x) {
    const { width } = this.opts.make({ lane: this, rng: this.rng, x });
    return width + this.opts.gap(this.rng, width);
  }

  update(dt, scroll, view) {
    const right = view.right + EDGE;
    if (this.toNext === null) {
      // first frame: fill the whole screen
      let x = view.left - EDGE - this.rng() * (this.opts.firstGap ?? 0);
      while (x < right) x += this.spawn(x);
      this.toNext = x - right;
    }
    const drift = this.opts.drift || 0;
    this.toNext -= (scroll * this.refShare + drift) * dt;
    while (this.toNext <= 0) this.toNext += this.spawn(right + this.toNext);

    const left = view.left - EDGE;
    for (let i = this.group.children.length - 1; i >= 0; i--) {
      const m = this.group.children[i];
      const u = m.userData;
      m.position.x -= (scroll * u.share + drift + (u.vx || 0)) * dt;
      if (u.mixer) u.mixer.update(dt);   // 3D animals play their own clips
      if (u.frames) {
        u.clock += dt;
        const n = u.frames.length;
        if (u.still) {
          // standing animals: ease back and forth between two poses
          setCardPose(m, u.frames[0], u.frames[1], 0.5 - 0.5 * Math.cos(u.clock * u.fps * 2 * Math.PI));
        } else {
          // walkers: hard step between poses (a fade between two leg positions ghosts and looks blurry)
          const f = u.clock * u.fps;
          const i = Math.floor(f) % n;
          setCardPose(m, u.frames[i], u.frames[i], 0);
        }
      }
      if (m.position.x + (u.halfWidth ?? cardWidth(m) / 2) < left) {
        this.group.remove(m);
        if (u.dispose) u.dispose();
        else m.material.dispose();
      }
    }
  }
}
