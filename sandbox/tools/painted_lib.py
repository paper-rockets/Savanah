# Shared helpers for the painted-style plant builders (build_baobabs.py, build_succulents.py).
# Everything is smooth-shaded and painted with a vertex colour attribute called 'Col'.
import bpy, bmesh, os, math
from mathutils import Vector, Matrix, noise


def lin(c):  # display colour -> linear, for Blender colour attributes
    return tuple(x ** 2.2 for x in c)


def mix(a, b, k):
    k = min(1.0, max(0.0, k))
    return tuple(a[i] + (b[i] - a[i]) * k for i in range(3))


def smooth_profile(points, t):  # cosine-eased interpolation through (t, radius) points
    for (t0, r0), (t1, r1) in zip(points, points[1:]):
        if t <= t1:
            k = (t - t0) / max(t1 - t0, 1e-6)
            k = 0.5 - 0.5 * math.cos(math.pi * k)
            return r0 + (r1 - r0) * k
    return points[-1][1]


def make_mat(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    col = nt.nodes.new('ShaderNodeVertexColor')
    col.layer_name = 'Col'
    nt.links.new(col.outputs[0], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.9
    return m


def trunk_bm(bm, H, profile, seed, flutes, flute_amt, segs=32, rings=26):
    """lathed trunk from z=-0.8 to H, radius from profile, soft vertical fluting"""
    rows = []
    for j in range(rings + 1):
        t = j / rings
        z = -0.8 + t * (H + 0.8)
        base = smooth_profile(profile, t)
        row = []
        for i in range(segs):
            a = i / segs * math.tau
            lump = noise.noise(Vector((math.cos(a) * 1.3, math.sin(a) * 1.3, t * 2.5 + seed)))
            r = base * (1 + flute_amt * math.sin(flutes * a + seed) * (1 - 0.6 * t) + 0.07 * lump)
            row.append(bm.verts.new((math.cos(a) * r, math.sin(a) * r, z)))
        rows.append(row)
    for j in range(rings):
        for i in range(segs):
            bm.faces.new((rows[j][i], rows[j][(i + 1) % segs], rows[j + 1][(i + 1) % segs], rows[j + 1][i]))
    top = bm.verts.new((0, 0, H + 0.15))
    for i in range(segs):
        bm.faces.new((rows[-1][i], rows[-1][(i + 1) % segs], top))


def new_tube_curve(name, bevel_res=3, res_u=6, bevel_object=None):
    crv = bpy.data.curves.new(name, 'CURVE')
    crv.dimensions = '3D'
    crv.resolution_u = res_u
    crv.use_fill_caps = True
    if bevel_object:
        crv.bevel_mode = 'OBJECT'
        crv.bevel_object = bevel_object
    else:
        crv.bevel_depth = 1.0
        crv.bevel_resolution = bevel_res
    return crv


def add_branch(crv, pts, r0, r1):
    sp = crv.splines.new('BEZIER')
    sp.bezier_points.add(len(pts) - 1)
    for k, (bp, p) in enumerate(zip(sp.bezier_points, pts)):
        bp.co = p
        bp.handle_left_type = bp.handle_right_type = 'AUTO'
        bp.radius = r0 + (r1 - r0) * (k / (len(pts) - 1)) ** 0.8


def curve_to_bm(bm, crv):
    """turn a tube curve into mesh and add it to bm"""
    obj = bpy.data.objects.new('tmp_curve', crv)
    bpy.context.scene.collection.objects.link(obj)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(obj.evaluated_get(dg))
    bpy.data.objects.remove(obj, do_unlink=True)
    bm.from_mesh(me)
    bpy.data.meshes.remove(me)


def blob_bm(bm, matrix, subdiv=2, lump=0.0, seed=0.0, flat_below=1.0):
    """smooth icosphere (radius 1) moved by matrix; optional lumps and squashed underside"""
    tmp = bmesh.new()
    bmesh.ops.create_icosphere(tmp, subdivisions=subdiv, radius=1.0)
    for v in tmp.verts:
        n = v.co.normalized()
        v.co = n * (1 + lump * noise.noise(n * 2.2 + Vector((seed, seed * 0.7, 0))))
        if v.co.z < 0:
            v.co.z *= flat_below
        v.co = matrix @ v.co
    me = bpy.data.meshes.new('tmp')
    tmp.to_mesh(me)
    tmp.free()
    bm.from_mesh(me)
    bpy.data.meshes.remove(me)


def paint(me, fn):
    attr = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    for v in me.vertices:
        c = lin(fn(v.co, v.normal))
        attr.data[v.index].color = (c[0], c[1], c[2], 1.0)


def bm_to_object(bm, name, mat_name, color_fn):
    """smooth-shade, paint and add to the scene"""
    for f in bm.faces:
        f.smooth = True
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(make_mat(mat_name))
    paint(me, color_fn)
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def export_glb(out_dir, name):
    path = os.path.join(out_dir, name + '.glb')
    opts = dict(filepath=path, export_format='GLB', export_apply=True,
                export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6)
    try:
        bpy.ops.export_scene.gltf(**opts, export_vertex_color='ACTIVE')
    except TypeError:
        bpy.ops.export_scene.gltf(**opts)
    scene = bpy.context.scene
    tris = sum(len(p.vertices) - 2 for o in scene.objects if o.type == 'MESH' for p in o.data.polygons)
    print('PLANT_RESULT %s: %d triangles, %.2f MB' % (name, tris, os.path.getsize(path) / 1048576))


def plate(bm, rnd, centre, pr, thick, seed):
    """one flat leaf plate: a wide flat-bottomed lump plus two smaller lumps beside it
    (shared by the acacia and baobab crowns)"""
    m = Matrix.Translation(centre) @ Matrix.Diagonal((pr, pr * rnd.uniform(0.8, 1.0), pr * thick, 1))
    blob_bm(bm, m, subdiv=2, lump=0.14, seed=seed, flat_below=0.3)
    for j in range(2):
        a = rnd.uniform(0, math.tau)
        off = Vector((math.cos(a), math.sin(a), 0)) * pr * rnd.uniform(0.45, 0.7)
        r2 = pr * rnd.uniform(0.5, 0.65)
        m = Matrix.Translation(centre + off + Vector((0, 0, pr * thick * rnd.uniform(-0.3, 0.35))))             @ Matrix.Diagonal((r2, r2, r2 * thick * 1.2, 1))
        blob_bm(bm, m, subdiv=2, lump=0.16, seed=seed + 1.7 + j, flat_below=0.3)
