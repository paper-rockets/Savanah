# Builds the painted-style candelabra tree (Euphorbia) and fig cactus (Opuntia) as compressed .glb:
#   blender -b --factory-startup -P build_succulents.py -- <output folder>
# Same style as the baobabs: smooth rounded shapes, colours painted into the vertices.
import bpy, bmesh, sys, os, math, random
from mathutils import Vector, Matrix, noise
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from painted_lib import (trunk_bm, new_tube_curve, add_branch, curve_to_bm, blob_bm,
                         bm_to_object, export_glb, mix)

OUT = sys.argv[sys.argv.index('--') + 1:][0]


def rib_profile(lobes=5, depth=0.14, n=20):
    """cross-section with rounded ribs, used as the bevel shape of the arms"""
    crv = bpy.data.curves.new('rib', 'CURVE')
    crv.dimensions = '2D'
    sp = crv.splines.new('POLY')
    sp.points.add(n - 1)
    for i, p in enumerate(sp.points):
        a = i / n * math.tau
        r = 1 + depth * math.cos(lobes * a)
        p.co = (math.cos(a) * r, math.sin(a) * r, 0, 1)
    sp.use_cyclic_u = True
    obj = bpy.data.objects.new('rib', crv)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def candelabra(name='candelabra', seed=5):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    rnd = random.Random(seed)
    HT = 2.0                                     # bare trunk height before the arms split off
    rib = rib_profile()
    crv = new_tube_curve('arms', res_u=4, bevel_object=rib)
    tips = []

    def arm(p_from, out, reach, top, r0, r1):
        p1 = p_from + out * reach * 0.45 + Vector((0, 0, 0.35))
        p2 = p_from + out * reach + Vector((0, 0, 0.9))
        p3 = p_from + out * reach * 1.04 + Vector((0, 0, (top - p_from.z) * 0.55))
        p4 = Vector((p3.x + out.x * 0.03, p3.y + out.y * 0.03, top))
        add_branch(crv, [p_from, p1, p2, p3, p4], r0, r1)
        tips.append((p4, r1))
        return p2

    # many arms fanning out wide like a bowl, most of them forking again at the elbow
    n = 10
    for k in range(n):
        a = k / n * math.tau + rnd.uniform(-0.25, 0.25)
        out = Vector((math.cos(a), math.sin(a), 0))
        top = rnd.uniform(4.6, 6.4)
        elbow = arm(Vector((0, 0, HT - 0.3)), out, rnd.uniform(1.0, 2.1), top, 0.24, 0.2)
        for side in (-1, 1):
            if rnd.random() < 0.55:
                a2 = a + side * rnd.uniform(0.35, 0.65)
                out2 = Vector((math.cos(a2), math.sin(a2), 0))
                arm(elbow, out2, rnd.uniform(0.6, 1.1), top - rnd.uniform(0.2, 1.0), 0.19, 0.17)
    arm(Vector((0, 0, HT - 0.3)), Vector((0.1, 0.05, 0)), 0.05, 7.0, 0.27, 0.23)   # centre leader

    bm = bmesh.new()
    trunk_bm(bm, HT, [(0, 0.52), (0.15, 0.42), (1, 0.38)], seed, 6, 0.08, segs=24, rings=10)
    curve_to_bm(bm, crv)
    for tip, r in tips:                         # rounded tips instead of flat caps
        blob_bm(bm, Matrix.Translation(tip) @ Matrix.Diagonal((r * 1.05, r * 1.05, r * 0.9, 1)), subdiv=2)
    bpy.data.objects.remove(rib, do_unlink=True)

    bark, dark, light = (0.46, 0.40, 0.30), (0.22, 0.38, 0.17), (0.44, 0.60, 0.27)

    def col(co, nrm):
        green = mix(dark, light, (co.z - HT) / 5.0 + 0.1 * noise.noise(co * 1.5))
        return mix(bark, green, (co.z - (HT - 0.6)) / 0.9)
    bm_to_object(bm, name, 'Plant', col)
    export_glb(OUT, name)


def fig_cactus(name='barbary_fig', seed=9):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    rnd = random.Random(seed)
    pads_old, pads_young, fruit, flowers = bmesh.new(), bmesh.new(), bmesh.new(), bmesh.new()

    def frame(base, yaw, tilt, roll):
        # roll turns the pad inside its own flat plane, so children fan out sideways
        return (Matrix.Translation(base) @ Matrix.Rotation(yaw, 4, 'Z')
                @ Matrix.Rotation(tilt, 4, 'X') @ Matrix.Rotation(roll, 4, 'Y'))

    def pad(base, yaw, tilt, roll, depth):
        w = 0.44 * (0.92 ** depth) * rnd.uniform(0.9, 1.1)
        h = 0.56 * (0.92 ** depth) * rnd.uniform(0.9, 1.1)
        F = frame(base, yaw, tilt, roll)
        target = pads_old if depth == 0 else pads_young
        blob_bm(target, F @ Matrix.Translation((0, 0, h * 0.95)) @ Matrix.Diagonal((w, 0.085, h, 1)),
                subdiv=3, lump=0.05, seed=seed + depth * 1.7 + yaw)
        kids = {0: 2, 1: rnd.choice((1, 2)), 2: rnd.choice((0, 1, 2))}.get(depth, 0)
        sides = [-1, 1] if kids == 2 else [rnd.choice((-1, 1))] * kids
        for side in sides:                          # children grow from the top corners and lean out
            top = F @ Vector((side * 0.55 * w, 0, h * 1.72))
            child_roll = max(-1.3, min(1.3, roll + side * rnd.uniform(0.35, 0.75)))
            pad(top, yaw + rnd.uniform(-0.6, 0.6), rnd.uniform(-0.35, 0.35), child_roll, depth + 1)
        if kids == 0:                               # fruit and flowers on the top rim of end pads
            for i in range(rnd.randint(2, 4)):
                x = (i / 3 - 0.5) * w * 1.3
                p = F @ Vector((x, 0, h * 1.86))
                blob_bm(fruit, Matrix.Translation(p) @ Matrix.Diagonal((0.055, 0.055, 0.075, 1)), subdiv=2)
            if rnd.random() < 0.5:
                p = F @ Vector((rnd.uniform(-0.3, 0.3) * w, 0, h * 1.9))
                blob_bm(flowers, Matrix.Translation(p + Vector((0, 0, 0.03))) @ Matrix.Diagonal((0.09, 0.09, 0.04, 1)), subdiv=2)

    for k in range(4):
        a = k / 4 * math.tau + rnd.uniform(-0.3, 0.3)
        pad(Vector((math.cos(a) * 0.15, math.sin(a) * 0.15, -0.1)), a + 1.57, rnd.uniform(-0.3, 0.3),
            rnd.choice((-1, 1)) * rnd.uniform(0.2, 0.5), 0)

    def pad_col(lo, hi):
        return lambda co, n: mix(lo, hi, 0.35 + co.z * 0.25 + 0.15 * noise.noise(co * 4.0))
    bm_to_object(pads_old, name + '_old', 'OldPads', pad_col((0.40, 0.42, 0.26), (0.50, 0.52, 0.32)))
    bm_to_object(pads_young, name + '_pads', 'Pads', pad_col((0.27, 0.43, 0.22), (0.46, 0.62, 0.32)))
    bm_to_object(fruit, name + '_fruit', 'Fruit', lambda co, n: (0.80, 0.22, 0.32))
    bm_to_object(flowers, name + '_flowers', 'Flowers', lambda co, n: (1.0, 0.82, 0.26))
    export_glb(OUT, name)


candelabra()
fig_cactus()
