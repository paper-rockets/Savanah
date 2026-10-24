# Render each .glb in a row (side view, textured) to one PNG, for checking trees by eye:
#   blender -b --factory-startup -P preview_trees.py -- <out.png> <a.glb> <b.glb> ...
import bpy, sys, math
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
color_type = 'TEXTURE'
if argv[0].startswith('mode='):          # mode=attribute shows painted vertex colours
    color_type = argv.pop(0)[5:].upper()
out, files = argv[0], argv[1:]

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
x = 0.0
for f in files:
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=f)
    new = [o for o in bpy.data.objects if o not in before]
    for o in new:
        if o.type == 'ARMATURE':
            o.data.pose_position = 'REST'
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ Vector(c) for o in new if o.type == 'MESH' for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    s = 10.0 / max(hi.z - lo.z, 1e-3)                      # every tree 10 units tall
    root = bpy.data.objects.new('root', None)
    scene.collection.objects.link(root)
    for o in new:
        if o.parent is None:
            o.parent = root
    root.scale = (s, s, s)
    w = max((hi.x - lo.x) * s, (hi.y - lo.y) * s, 6)
    root.location = (x + w / 2 - (lo.x + hi.x) / 2 * s, -(lo.y + hi.y) / 2 * s, -lo.z * s)
    x += w + 3

cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
scene.collection.objects.link(cam)
cam.data.type = 'ORTHO'
width = x
cam.data.ortho_scale = width
cam.location = (width / 2 - 1.5, -60, 5)
world = bpy.data.worlds.new('w'); scene.world = world
world.color = (0.8, 0.8, 0.8)
cam.rotation_euler = (math.radians(90), 0, 0)
scene.camera = cam
scene.render.engine = 'BLENDER_WORKBENCH'
scene.display.shading.color_type = color_type
scene.display.shading.light = 'STUDIO'
scene.render.resolution_x = 1600
scene.render.resolution_y = max(300, int(1600 * 12 / width))
scene.render.film_transparent = False
scene.render.filepath = out
bpy.ops.render.render(write_still=True)
print('PREVIEW_DONE', out)
