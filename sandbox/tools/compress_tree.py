# Shrink a downloaded tree .glb for the savanna (run headless):
#   blender -b --factory-startup -P compress_tree.py -- <in.glb> <out.glb> <ratio> <max_texture_px>
# - drops the skeleton/animation (the app places trees as still, instanced copies)
# - cuts triangles on the big meshes with Decimate (small parts like petals stay as they are)
# - scales textures down, saves Draco-compressed geometry and WebP textures
import bpy, sys, os

argv = sys.argv[sys.argv.index('--') + 1:]
src, dst, ratio, max_tex = argv[0], argv[1], float(argv[2]), int(argv[3])

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)

def tri_count(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)

meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
before = sum(tri_count(o) for o in meshes)

for o in meshes:
    for m in list(o.modifiers):
        if m.type == 'ARMATURE':
            o.modifiers.remove(m)
    if o.data.shape_keys:
        o.shape_key_clear()
    mw = o.matrix_world.copy()
    o.parent = None
    o.matrix_world = mw
    o.vertex_groups.clear()

for o in list(bpy.context.scene.objects):
    if o.type in ('ARMATURE', 'EMPTY'):
        bpy.data.objects.remove(o, do_unlink=True)

if ratio < 0.999:
    for o in meshes:
        if tri_count(o) < 3000:
            continue
        bpy.ops.object.select_all(action='DESELECT')
        bpy.context.view_layer.objects.active = o
        o.select_set(True)
        d = o.modifiers.new('shrink', 'DECIMATE')
        d.decimate_type = 'COLLAPSE'
        d.ratio = ratio
        bpy.ops.object.modifier_apply(modifier=d.name)

for img in bpy.data.images:
    w, h = img.size
    if max(w, h) > max_tex:
        k = max_tex / max(w, h)
        img.scale(max(1, int(w * k)), max(1, int(h * k)))

after = sum(tri_count(o) for o in meshes)

opts = dict(filepath=dst, export_format='GLB', export_apply=True,
            export_animations=False, export_skins=False, export_morph=False,
            export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6)
try:
    bpy.ops.export_scene.gltf(**opts, export_image_format='WEBP')
except TypeError:
    bpy.ops.export_scene.gltf(**opts)

print('TREE_RESULT %s: triangles %d -> %d, file %.1f MB -> %.1f MB' % (
    os.path.basename(dst), before, after, os.path.getsize(src) / 1048576, os.path.getsize(dst) / 1048576))
