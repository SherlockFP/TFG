"""
Render quick thumbnails of converted .glb files (front view = looking at the model's +Z face in
three.js terms, i.e. from Blender -Y), for visual QA of orientation / scale / textures.
  blender.exe -b --factory-startup -P tools/assets/blender_preview.py -- OUT_DIR file1.glb [file2.glb ...]
Writes OUT_DIR/<name>.png (256x256) with a 1 m reference cube placed to the right of the model.
"""
import math
import os
import sys

import bpy
from mathutils import Vector


def setup():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_WORKBENCH"
    sc.display.shading.light = "STUDIO"
    sc.display.shading.color_type = "TEXTURE"
    sc.render.resolution_x = 256
    sc.render.resolution_y = 256
    sc.render.film_transparent = False
    world = bpy.data.worlds.new("w")
    sc.world = world
    return sc


TOP = "--top" in sys.argv


def main():
    argv = [a for a in sys.argv[sys.argv.index("--") + 1:] if a != "--top"]
    out_dir, files = argv[0], argv[1:]
    os.makedirs(out_dir, exist_ok=True)
    for f in files:
        sc = setup()
        bpy.ops.import_scene.gltf(filepath=f)
        meshes = [o for o in sc.objects if o.type == "MESH"]
        dg = bpy.context.evaluated_depsgraph_get()
        mn = Vector((1e9, 1e9, 1e9))
        mx = -mn
        for o in meshes:
            for c in o.bound_box:
                w = o.matrix_world @ Vector(c)
                mn = Vector(map(min, mn, w))
                mx = Vector(map(max, mx, w))
        size = max((mx - mn).length, 0.05)
        # 1 m reference cube to the right (+X) of the model
        bpy.ops.mesh.primitive_cube_add(size=1, location=(mx.x + 0.6 + 0.2 * size, 0, 0.5))
        cam_data = bpy.data.cameras.new("c")
        cam_data.type = "ORTHO"
        cam_data.ortho_scale = max(size * 1.3, 1.6 + (mx.x - mn.x))
        cam = bpy.data.objects.new("c", cam_data)
        sc.collection.objects.link(cam)
        center = (mn + mx) / 2
        center.x += 0.4
        # three.js front (+Z) == Blender -Y; view slightly from the right and above
        d = Vector((0.0, -0.05, 1.0)).normalized() if TOP else Vector((0.35, -1.0, 0.35)).normalized()
        if TOP:  # red marker in front (+Z three.js == -Y blender)
            bpy.ops.mesh.primitive_uv_sphere_add(radius=0.08 * size + 0.02, location=(center.x - 0.4, mn.y - 0.3 * size, 0))
        cam.location = center + d * size * 3
        cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()
        sc.camera = cam
        sc.render.filepath = os.path.join(out_dir, os.path.splitext(os.path.basename(f))[0] + ".png")
        bpy.ops.render.render(write_still=True)


main()
