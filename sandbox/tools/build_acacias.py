# Builds painted-style flat-topped acacias (umbrella thorn) as compressed .glb (run headless):
#   blender -b --factory-startup -P build_acacias.py -- <output folder>
# Majestic version, matched to the owner's target paintings: a thick reddish-brown trunk that
# splits into a few strong limbs, each limb splitting again, every tip carrying a flat lumpy
# leaf plate. The plates sit at slightly different heights and together make one wide, layered
# umbrella crown, much wider than the tree is tall. Colours are painted into the vertices.
import bpy, bmesh, sys, os, math, random
from mathutils import Vector, Matrix, noise
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from painted_lib import new_tube_curve, add_branch, curve_to_bm, plate, bm_to_object, export_glb, mix

OUT = sys.argv[sys.argv.index('--') + 1:][0]

BARK = (0.58, 0.32, 0.21)       # reddish brown, like the day painting's acacias
LEAF_LO = (0.22, 0.32, 0.11)    # shaded underside
LEAF_HI = (0.60, 0.68, 0.25)    # sunlit yellow-green top


def arc(rnd, a, b, lift, n=4, wob=0.05):
    """points from a to b, bowed upward by lift, with a little wobble"""
    pts, L = [], (b - a).length
    for k in range(n + 1):
        t = k / n
        p = a.lerp(b, t)
        p.z += lift * math.sin(math.pi * t) * (1 - t * 0.5)
        if 0 < k < n:
            p += Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-0.4, 0.4))) * L * wob
        pts.append(p)
    return pts


def build(name, H, R, seed, fork=0.38, limbs=4, twigs=3, trunk_r=0.5, lean=0.08,
          dome=0.16, plate_r=(0.30, 0.38), thick=0.42, layers=1):
    """H = top of the crown, R = crown radius, dome = how much the crown edge drops (share of H),
    layers = 2 gives a second, lower and wider ring of plates (the tiered look)"""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    rnd = random.Random(seed)
    crv = new_tube_curve('branches', bevel_res=3, res_u=6)

    lean_dir = Vector((math.cos(seed), math.sin(seed), 0))
    fork_p = Vector((0, 0, H * fork)) + lean_dir * H * lean
    add_branch(crv, arc(rnd, Vector((0, 0, -0.6)), fork_p, 0.0, 3, 0.03), trunk_r * 1.15, trunk_r * 0.8)

    def crown_z(rr, layer):
        base = H - R * thick * 0.25 - layer * H * 0.13
        return base - H * dome * (rr / R) ** 2

    bm_leaf = bmesh.new()
    pi = 0
    # centre plate on top
    plate(bm_leaf, rnd, Vector((fork_p.x * 0.4, fork_p.y * 0.4, crown_z(0, 0))), R * 0.42, thick * 0.7, seed)
    for k in range(limbs):
        a = k / limbs * math.tau + rnd.uniform(-0.35, 0.35)
        rr1 = R * rnd.uniform(0.28, 0.4)
        p1 = Vector((math.cos(a) * rr1, math.sin(a) * rr1, H * rnd.uniform(0.62, 0.72)))
        add_branch(crv, arc(rnd, fork_p, p1, H * 0.04, 4, 0.04), trunk_r * 0.62, trunk_r * 0.38)
        for t in range(twigs):
            layer = (t % 2) if layers > 1 else 0
            spread = (t - (twigs - 1) / 2) * rnd.uniform(0.38, 0.55)
            a2 = a + spread
            rr = R * rnd.uniform(0.62, 0.86) * (1.12 if layer else 1.0)
            tip = Vector((math.cos(a2) * rr, math.sin(a2) * rr, crown_z(rr, layer)))
            under = tip - Vector((0, 0, R * thick * 0.12))
            add_branch(crv, arc(rnd, p1, under, H * 0.05, 4, 0.05), trunk_r * 0.36, trunk_r * 0.1)
            pr = R * rnd.uniform(*plate_r)
            plate(bm_leaf, rnd, tip, pr, thick, seed + 10 + pi * 3.3)
            pi += 1
        # a plate between the limb's twigs fills the crown toward the middle
        mid = Vector((math.cos(a) * R * 0.5, math.sin(a) * R * 0.5, 0))
        mid.z = crown_z(R * 0.5, 0) + R * thick * 0.08
        plate(bm_leaf, rnd, mid, R * rnd.uniform(0.3, 0.36), thick * 0.9, seed + 50 + k)

    bm = bmesh.new()
    curve_to_bm(bm, crv)
    tone = rnd.uniform(-0.03, 0.03)

    def bark_col(co, n):
        streak = noise.noise(Vector((co.x * 1.2, co.y * 1.2, co.z * 0.25)))
        f = 0.8 + 0.2 * min(1.0, max(0.0, co.z / H)) + 0.08 * streak
        return ((BARK[0] + tone) * f, (BARK[1] + tone * 0.5) * f, BARK[2] * f)
    bm_to_object(bm, name + '_bark', 'Bark', bark_col)

    def leaf_col(co, n):
        up_k = max(0.0, n.z) ** 0.7
        spot = noise.noise(co * 0.35 + Vector((seed, 0, 0)))
        return mix(LEAF_LO, LEAF_HI, 0.05 + 0.9 * up_k + 0.12 * spot)
    bm_to_object(bm_leaf, name + '_leaves', 'Leaves', leaf_col)

    export_glb(OUT, name)


# 1. grand umbrella: the big framing tree of the paintings, crown about twice as wide as tall
build('acacia_umbrella', H=11, R=10, seed=5, fork=0.36, limbs=4, twigs=3, trunk_r=0.55)
# 2. tiered: plates alternate between two heights, the lower ring wider
build('acacia_tiered', H=12, R=9, seed=13, fork=0.33, limbs=4, twigs=3, trunk_r=0.5, layers=2, dome=0.1)
# 3. very wide and low, leaning: the lone tree on the plain
build('acacia_wide', H=9, R=11, seed=27, fork=0.34, limbs=5, twigs=2, trunk_r=0.55, lean=0.12,
      dome=0.12, thick=0.36)
# 4. young tree: smaller, fewer limbs, a rounder crown
build('acacia_young', H=6, R=4, seed=39, fork=0.42, limbs=3, twigs=2, trunk_r=0.26, lean=0.05,
      dome=0.22, plate_r=(0.34, 0.42), thick=0.46)
