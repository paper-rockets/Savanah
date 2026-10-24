# Builds painted-style baobab trees and saves them as compressed .glb (run headless):
#   blender -b --factory-startup -P build_baobabs.py -- <output folder>
# Smooth rounded shapes only (no flat facets): a lathed bottle trunk with soft fluting,
# round tapered branches, and puffy flat-bottomed canopy pads. Colours are painted into the
# vertices (red-brown bark, olive leaves lighter on top), like the reference paintings.
import bpy, bmesh, sys, os, math, random
from mathutils import Vector, Matrix, noise
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from painted_lib import (smooth_profile, trunk_bm, new_tube_curve, add_branch, curve_to_bm,
                         plate, bm_to_object, export_glb, mix)

OUT = sys.argv[sys.argv.index('--') + 1:][0]

RED_BARK = (0.84, 0.40, 0.19)   # orange-red, like the target painting
GREY_BARK = (0.62, 0.58, 0.54)


def bend(rnd, p, d, length, up_curve, wide=1.0):
    """points along a gently crooked branch from p in direction d; wide stretches it sideways only"""
    pts, cur = [p.copy()], p.copy()
    for k in range(1, 4):
        step = d * (length / 3)
        step.z += up_curve * (length / 3) * (1 - k / 4)
        step += Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-0.3, 0.3))) * length * 0.07
        step.x *= wide; step.y *= wide
        cur = cur + step
        pts.append(cur.copy())
    return pts


def build(name, H, profile, n_main, main_len, up, leaves, seed, flutes=7, flute_amt=0.07,
          pad_r=(1.8, 2.6), pad_flat=0.55, subs=2, start_band=(0.82, 0.97),
          bark=RED_BARK, extra_pads=1.0, leaf_lo=(0.22, 0.33, 0.11), leaf_hi=(0.60, 0.68, 0.25), wide=2.5, fat=1.0):
    # fat: trunk thickness multiplier (majestic pass: barrel trunks like the target paintings)
    profile = [(t, r * fat) for t, r in profile]
    # wide: how many times wider the crown spreads than the first version (Round 2: 2-3x)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    rnd = random.Random(seed)

    crv = new_tube_curve('branches')
    r_top = smooth_profile(profile, 1.0)
    tips = []
    for k in range(n_main):
        a = k / n_main * math.tau + rnd.uniform(-0.35, 0.35)
        h = H * rnd.uniform(*start_band)
        start = Vector((math.cos(a) * r_top * 0.35, math.sin(a) * r_top * 0.35, h))
        d = Vector((math.cos(a), math.sin(a), rnd.uniform(0.35, 0.8))).normalized()
        L = main_len * rnd.uniform(0.8, 1.15)
        pts = bend(rnd, start, d, L, up, wide)
        base_r = r_top * rnd.uniform(0.32, 0.42)
        add_branch(crv, pts, base_r, base_r * 0.28)
        tips.append((pts[-1], 1.0))
        for s in range(subs):
            side = 1 if s % 2 == 0 else -1
            ang = a + side * rnd.uniform(0.5, 0.9)
            d2 = Vector((math.cos(ang), math.sin(ang), rnd.uniform(0.5, 1.0))).normalized()
            pts2 = bend(rnd, pts[2], d2, L * rnd.uniform(0.45, 0.6), up * 0.6, wide)
            add_branch(crv, pts2, base_r * 0.45, base_r * 0.12)
            tips.append((pts2[-1], 0.7))

    bm = bmesh.new()
    trunk_bm(bm, H, profile, seed, flutes, flute_amt)
    curve_to_bm(bm, crv)
    tone = rnd.uniform(-0.04, 0.04)

    def bark_col(co, n):
        k = min(1.0, max(0.0, (co.z + 0.8) / (H * 0.6)))
        streak = noise.noise(Vector((co.x * 0.9, co.y * 0.9, co.z * 0.15)))
        f = (0.72 + 0.28 * k) * (0.92 + 0.10 * streak)
        return ((bark[0] + tone) * f, (bark[1] + tone * 0.5) * f, bark[2] * f)
    bm_to_object(bm, name + '_bark', 'Bark', bark_col)

    if leaves:
        bm = bmesh.new()
        for i, (tip, size) in enumerate(tips):
            # chunky leaf plates like the paintings: a wide flat clump on every branch tip,
            # spread sideways with the crown (wide), plus an extra clump beside the big ones
            r = rnd.uniform(*pad_r) * size * wide ** 0.6 * 1.35
            plate(bm, rnd, tip + Vector((0, 0, r * 0.12)), r, pad_flat * 0.85, seed + i * 3.1)
            if size >= 1.0 and rnd.random() < extra_pads:
                off = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), 0)).normalized() * r * 0.9
                plate(bm, rnd, tip + off + Vector((0, 0, -r * 0.08)), r * 0.7, pad_flat * 0.85, seed + i * 7.7)

        def leaf_col(co, n):
            up_k = max(0.0, n.z) ** 0.8
            spot = noise.noise(co * 0.5 + Vector((seed, 0, 0)))
            return mix(leaf_lo, leaf_hi, 0.15 + 0.85 * up_k + 0.12 * spot)
        bm_to_object(bm, name + '_leaves', 'Leaves', leaf_col)

    export_glb(OUT, name)


# 1. classic bottle baobab (Adansonia digitata): fat belly, wide spreading crown
build('baobab_bottle', H=10, seed=3, n_main=7, main_len=6.0, up=0.25, leaves=True,
      profile=[(0, 2.4), (0.08, 2.1), (0.4, 2.4), (0.8, 1.7), (1, 1.1)], fat=1.15)
# 2. tall column (Adansonia grandidieri, the avenue kind): straight trunk, small crown at the top
build('baobab_column', H=17, seed=11, n_main=6, main_len=3.4, up=0.55, leaves=True,
      profile=[(0, 1.7), (0.07, 1.45), (0.5, 1.4), (0.88, 1.25), (1, 0.85)],
      pad_r=(1.3, 1.9), pad_flat=0.5, subs=2, start_band=(0.9, 0.99), flutes=5, flute_amt=0.05, fat=1.6)
# 3. squat fat one: short and very wide
build('baobab_squat', H=7, seed=21, n_main=6, main_len=5.0, up=0.2, leaves=True,
      profile=[(0, 3.0), (0.1, 2.75), (0.45, 3.1), (0.85, 2.1), (1, 1.4)], pad_r=(1.7, 2.4))
# 4. dry season: classic shape, no leaves, more branches
build('baobab_bare', H=11, seed=33, n_main=9, main_len=5.8, up=0.35, leaves=False, subs=3,
      profile=[(0, 2.3), (0.08, 2.0), (0.42, 2.25), (0.82, 1.55), (1, 1.0)])
# 5. giant (redo of the downloaded low-poly giant baobab): tall straight trunk, very wide flat crown
build('baobab_giant', H=15, seed=41, n_main=8, main_len=6.5, up=0.12, leaves=True,
      profile=[(0, 2.0), (0.06, 1.75), (0.5, 1.7), (0.9, 1.5), (1, 1.15)],
      pad_r=(2.0, 2.8), pad_flat=0.45, start_band=(0.9, 0.99), flutes=6, flute_amt=0.06, extra_pads=1.0, fat=1.5)
# 6. grey baobab (redo of the downloaded realistic baobab): silver-grey bark, compact bushy crown
build('baobab_grey', H=12, seed=57, n_main=6, main_len=2.6, up=0.7, leaves=True, subs=3,
      profile=[(0, 1.35), (0.06, 1.2), (0.45, 1.3), (0.85, 1.15), (1, 0.8)],
      pad_r=(1.1, 1.6), pad_flat=0.75, start_band=(0.92, 0.99), flutes=5, flute_amt=0.04,
      bark=GREY_BARK, extra_pads=1.0, leaf_lo=(0.20, 0.32, 0.14), leaf_hi=(0.50, 0.62, 0.30), fat=1.5)
