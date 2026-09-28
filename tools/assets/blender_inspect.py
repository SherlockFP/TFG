"""
Print objects, dimensions, tris, armatures and actions of model files (headless Blender).
  blender.exe -b --factory-startup -P tools/assets/blender_inspect.py -- file1 [file2 ...]
"""
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from blender_convert import import_file, reset, world_bbox, tri_count, mesh_objects  # noqa: E402


def main():
    files = sys.argv[sys.argv.index("--") + 1:]
    for f in files:
        reset()
        try:
            import_file(f)
        except Exception as e:
            print("INSPECT", f, "ERROR", e)
            continue
        meshes = mesh_objects()
        mn, mx = world_bbox(meshes)
        d = mx - mn
        tops = [o for o in bpy.context.scene.objects if o.parent is None]
        print("INSPECT %s | dims(x,y,z)=%.3f %.3f %.3f | tris=%d | tops=%d | actions=%s | images=%s" % (
            os.path.basename(f), d.x, d.y, d.z, tri_count(meshes), len(tops),
            [a.name for a in bpy.data.actions][:20],
            [(i.name, tuple(i.size)) for i in bpy.data.images][:6]))
        if len(tops) > 1 and "--tops" in sys.argv:
            for o in tops:
                mn2, mx2 = world_bbox(mesh_objects([o] + list(o.children_recursive)))
                dd = mx2 - mn2
                c = (mn2 + mx2) / 2
                print("   TOP %-30s %s dims=%.2f %.2f %.2f center=%.1f %.1f %.1f" % (o.name, o.type, dd.x, dd.y, dd.z, c.x, c.y, c.z))


main()
