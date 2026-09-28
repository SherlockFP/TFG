"""
Blender (5.x) headless batch converter: fbx/obj/gltf/glb/blend -> game-ready .glb for three.js.

Run:
  blender.exe -b --factory-startup -P tools/assets/blender_convert.py -- jobs.json results.json

jobs.json: [ { "src": "abs path", "out": "abs path.glb",
               "height": 1.0 | "max_dim": 2.0 | "scale": 0.01,   (optional sizing; default keep)
               "rot_z": 0,            (extra yaw in degrees, to make the model face +Z in three.js)
               "anim": false,         (keep animations)
               "max_tris": 5000, "tex_max": 256,
               "split": false,        (one .glb per top-level object; out is then a directory)
               "only": "regex"        (with split: keep only objects whose name matches)
             }, ... ]

For every output it records: tris, size [w,h,d] (three.js axes, meters), animations.
Conventions: +Y up, origin at bottom-center, front facing +Z (Blender -Y), meters.
Static meshes get all transforms applied. Animated (skinned) models keep their armature
transform (scale baked into the root node) so keyframes stay valid.
"""
import bpy
import json
import math
import os
import re
import sys

import numpy as np
from mathutils import Matrix, Vector


def log(*a):
    print("[conv]", *a, flush=True)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_file(src):
    ext = os.path.splitext(src)[1].lower()
    if ext == ".fbx":
        bpy.ops.import_scene.fbx(filepath=src, use_anim=True, automatic_bone_orientation=False)
    elif ext == ".obj":
        bpy.ops.wm.obj_import(filepath=src)
    elif ext in (".gltf", ".glb"):
        bpy.ops.import_scene.gltf(filepath=src)
    elif ext == ".blend":
        with bpy.data.libraries.load(src, link=False) as (data_from, data_to):
            data_to.objects = list(data_from.objects)
        for ob in data_to.objects:
            if ob is not None:
                bpy.context.scene.collection.objects.link(ob)
    elif ext == ".dae":
        bpy.ops.wm.collada_import(filepath=src)
    else:
        raise RuntimeError("unsupported " + ext)


def relink_images(src):
    """Point images with missing files at a same-named file next to / below the source model."""
    base = os.path.dirname(src)
    roots = [base, os.path.dirname(base), os.path.dirname(os.path.dirname(base))]
    index = {}
    for r in roots:
        for dp, dn, fn in os.walk(r):
            for f in fn:
                if f.lower().endswith((".png", ".jpg", ".jpeg", ".tga", ".bmp")):
                    index.setdefault(f.lower(), os.path.join(dp, f))
    for img in bpy.data.images:
        if img.source != "FILE" or img.packed_file is not None:
            continue
        p = bpy.path.abspath(img.filepath)
        if p and os.path.exists(p):
            continue
        cand = index.get(os.path.basename(p.replace("\\", "/")).lower())
        if cand:
            img.filepath = cand
            try:
                img.reload()
            except Exception:
                pass
            log("  relinked", img.name, "->", cand)


def assign_texture(path, meshes, force=False):
    """Give every material of `meshes` a base-colour image (for FBX files that lost the link).
    force=True also replaces images already wired into the material (broken / other-variant links)."""
    img = bpy.data.images.load(path)
    for o in meshes:
        if not o.data.materials:
            m = bpy.data.materials.new(o.name + "_mat")
            o.data.materials.append(m)
        for m in o.data.materials:
            if m is None:
                continue
            m.use_nodes = True
            nt = m.node_tree
            bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
            if bsdf is None:
                continue
            existing = [n for n in nt.nodes if n.type == "TEX_IMAGE"]
            if existing:
                if force:
                    for n in existing:
                        n.image = img
                        n.interpolation = "Closest"
                continue
            t = nt.nodes.new("ShaderNodeTexImage")
            t.image = img
            t.interpolation = "Closest"
            nt.links.new(t.outputs["Color"], bsdf.inputs["Base Color"])
            bsdf.inputs["Base Color"].default_value = (1, 1, 1, 1)
    log("  assigned texture", path)


def auto_texture(job, meshes):
    if job.get("texture"):
        assign_texture(job["texture"], meshes, force=job.get("force_texture", False))
        return
    has_img = any(n.type == "TEX_IMAGE" and n.image is not None
                  for o in meshes for m in o.data.materials if m and m.use_nodes for n in m.node_tree.nodes)
    if has_img:
        return
    stem = os.path.splitext(job["src"])[0]
    for ext in (".png", ".jpg"):
        if os.path.exists(stem + ext) and job.get("auto_texture", True):
            assign_texture(stem + ext, meshes)
            return


def apply_mat_tex(job):
    """job["mat_tex"] = {material-name regex: image path}: wire textures the source file lost.
    Images with transparency get an alpha-clip setup (exported as glTF alphaMode MASK)."""
    mt = job.get("mat_tex")
    if not mt:
        return
    cache = {}
    for mat in bpy.data.materials:
        for rx, path in mt.items():
            if not re.search(rx, mat.name):
                continue
            if path not in cache:
                img = bpy.data.images.load(path)
                px = np.empty(img.size[0] * img.size[1] * 4, dtype=np.float32)
                img.pixels.foreach_get(px)
                cache[path] = (img, bool((px[3::4] < 0.5).any()))
            img, has_alpha = cache[path]
            mat.use_nodes = True
            nt = mat.node_tree
            bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
            if bsdf is None:
                continue
            for n in [n for n in nt.nodes if n.type in ("TEX_IMAGE", "NORMAL_MAP")]:
                nt.nodes.remove(n)
            t = nt.nodes.new("ShaderNodeTexImage")
            t.image = img
            t.interpolation = "Closest"
            nt.links.new(t.outputs["Color"], bsdf.inputs["Base Color"])
            if has_alpha:
                rnd = nt.nodes.new("ShaderNodeMath")
                rnd.operation = "ROUND"
                nt.links.new(t.outputs["Alpha"], rnd.inputs[0])
                nt.links.new(rnd.outputs[0], bsdf.inputs["Alpha"])
            log("  mat_tex", mat.name, "->", os.path.basename(path), "alpha" if has_alpha else "")
            break


def exclude_objects(job):
    if not job.get("exclude"):
        return
    rx = re.compile(job["exclude"], re.I)
    for o in list(bpy.context.scene.objects):
        if rx.search(o.name):
            bpy.data.objects.remove(o, do_unlink=True)


def remove_junk():
    for ob in list(bpy.data.objects):
        if ob.type in ("CAMERA", "LIGHT", "LIGHT_PROBE", "SPEAKER"):
            bpy.data.objects.remove(ob, do_unlink=True)


def mesh_objects(objs=None):
    objs = objs if objs is not None else bpy.context.scene.objects
    return [o for o in objs if o.type == "MESH"]


def tri_count(obs):
    dg = bpy.context.evaluated_depsgraph_get()
    n = 0
    for o in obs:
        ev = o.evaluated_get(dg)
        me = ev.to_mesh()
        me.calc_loop_triangles()
        n += len(me.loop_triangles)
        ev.to_mesh_clear()
    return n


def world_bbox(obs):
    dg = bpy.context.evaluated_depsgraph_get()
    mn = Vector((1e18, 1e18, 1e18))
    mx = Vector((-1e18, -1e18, -1e18))
    any_ = False
    for o in obs:
        ev = o.evaluated_get(dg)
        me = ev.to_mesh()
        mw = ev.matrix_world
        if len(me.vertices):
            co = np.empty(len(me.vertices) * 3, dtype=np.float32)
            me.vertices.foreach_get("co", co)
            co = co.reshape(-1, 3)
            m = np.array(mw)
            w = co @ m[:3, :3].T + m[:3, 3]
            mn = Vector(np.minimum(np.array(mn), w.min(0)))
            mx = Vector(np.maximum(np.array(mx), w.max(0)))
            any_ = True
        ev.to_mesh_clear()
    if not any_:
        return Vector((0, 0, 0)), Vector((0, 0, 0))
    return mn, mx


def nearest_resize_image(img, tex_max):
    try:
        w, h = img.size
    except Exception:
        return
    if w == 0 or h == 0 or max(w, h) <= tex_max:
        return
    f = tex_max / max(w, h)
    nw, nh = max(1, int(round(w * f))), max(1, int(round(h * f)))
    # power of two for WebGL mip friendliness
    nw = 1 << max(0, int(round(math.log2(nw))))
    nh = 1 << max(0, int(round(math.log2(nh))))
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape(h, w, 4)
    ys = (np.arange(nh) * h / nh).astype(int)
    xs = (np.arange(nw) * w / nw).astype(int)
    small = px[ys][:, xs]
    has_alpha = bool((small[..., 3] < 0.999).any())
    new = bpy.data.images.new(img.name + "_lo", nw, nh, alpha=has_alpha)
    new.pixels.foreach_set(small.ravel())
    new.file_format = "PNG"
    new.pack()
    img.user_remap(new)
    new.name = img.name
    log("  tex", img.name, (w, h), "->", (nw, nh))


def downscale_textures(tex_max):
    for img in list(bpy.data.images):
        if img.type == "IMAGE" and img.has_data is False:
            try:
                img.reload()
            except Exception:
                pass
        if img.users and img.type == "IMAGE":
            nearest_resize_image(img, tex_max)
    # force nearest sampling in materials (exported as glTF sampler NEAREST) and fix FBX materials
    # that come in with alpha 0 (glTF would export baseColorFactor.a = 0)
    for mat in bpy.data.materials:
        if mat.node_tree:
            for n in mat.node_tree.nodes:
                if n.type == "TEX_IMAGE":
                    n.interpolation = "Closest"
                if n.type == "BSDF_PRINCIPLED":
                    a = n.inputs.get("Alpha")
                    if a is not None and not a.is_linked:
                        a.default_value = 1.0
                    bc = n.inputs.get("Base Color")
                    if bc is not None and not bc.is_linked:
                        c = list(bc.default_value)
                        bc.default_value = (c[0], c[1], c[2], 1.0)
        mat.blend_method = "OPAQUE" if not any(
            n.type == "TEX_IMAGE" and n.image is not None and n.image.alpha_mode != "NONE" and
            any(l.to_socket.name == "Alpha" for l in n.outputs["Alpha"].links)
            for n in (mat.node_tree.nodes if mat.node_tree else [])) else mat.blend_method


def decimate(obs, max_tris):
    total = tri_count(obs)
    if total <= max_tris:
        return total
    ratio = max(0.05, max_tris / float(total))
    for o in obs:
        m = o.modifiers.new("dec", "DECIMATE")
        m.ratio = ratio
        m.use_collapse_triangulate = True
        skinned = any(md.type == "ARMATURE" for md in o.modifiers)
        if not skinned:
            dg = bpy.context.evaluated_depsgraph_get()
            me = bpy.data.meshes.new_from_object(o.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
            o.modifiers.clear()
            o.data = me
            continue
        # skinned: decimate must run before the armature modifier, applied via operator
        try:
            o.modifiers.move(len(o.modifiers) - 1, 0)
        except Exception:
            pass
        with bpy.context.temp_override(object=o, active_object=o, selected_objects=[o]):
            bpy.ops.object.modifier_apply(modifier=m.name)
    bpy.context.view_layer.update()
    t2 = tri_count(obs)
    log("  decimated", total, "->", t2)
    return t2


def select_only(obs):
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for o in obs:
        o.select_set(True)
    if obs:
        bpy.context.view_layer.objects.active = obs[0]


def descendants(o):
    out = [o]
    for c in o.children:
        out += descendants(c)
    return out


def clean_action_names():
    acts = list(bpy.data.actions)
    names = []
    for act in acts:
        nm = act.name.split("|")[-1]
        nm = re.sub(r"^(Armature|CharacterArmature|RootNode)[._]", "", nm)
        names.append(nm)
    if len(names) > 1:
        pre = os.path.commonprefix(names)
        pre = pre[:pre.rfind("_") + 1] if "_" in pre else ""
        if pre and all(len(n) > len(pre) for n in names):
            names = [n[len(pre):] for n in names]
    for act, nm in zip(acts, names):
        act.name = nm


def process_group(roots, job, out_path):
    """roots: top-level objects to export together."""
    objs = []
    for r in roots:
        objs += descendants(r)
    meshes = mesh_objects(objs)
    if not meshes:
        return None
    animated = job.get("anim", False) and any(o.type == "ARMATURE" for o in objs)
    if animated:
        # FBX takes often key the armature object itself, which would override any transform we
        # put on it -> wrap everything in an un-animated "Root" node that carries yaw/scale/offset.
        root = bpy.data.objects.new("Root", None)
        bpy.context.scene.collection.objects.link(root)
        for r in roots:
            mw = r.matrix_world.copy()
            r.parent = root
            r.matrix_world = mw
        roots = [root]
        objs = [root] + objs
        # measure in rest (bind) pose == what three.js shows before an animation plays
        for o in objs:
            if o.type == "ARMATURE":
                o.data.pose_position = "REST"

    # --- yaw + sizing via a temporary root transform
    rot = Matrix.Rotation(math.radians(job.get("rot_z", 0)), 4, "Z")
    for r in roots:
        r.matrix_world = rot @ r.matrix_world
    bpy.context.view_layer.update()

    mn, mx = world_bbox(meshes)
    dims = mx - mn
    s = 1.0
    if "scale" in job:
        s = job["scale"]
    elif "height" in job and dims.z > 1e-6:
        s = job["height"] / dims.z
    elif "max_dim" in job and max(dims) > 1e-6:
        s = job["max_dim"] / max(dims)
    S = Matrix.Scale(s, 4)
    for r in roots:
        r.matrix_world = S @ r.matrix_world
    bpy.context.view_layer.update()
    mn, mx = world_bbox(meshes)
    off = Vector((-(mn.x + mx.x) / 2, -(mn.y + mx.y) / 2, -mn.z))
    for r in roots:
        r.matrix_world = Matrix.Translation(off) @ r.matrix_world
    bpy.context.view_layer.update()

    if not animated:
        # static: bake modifiers + world transform into (single-user) mesh data, drop hierarchy
        dg = bpy.context.evaluated_depsgraph_get()
        baked = []
        for o in meshes:
            ev = o.evaluated_get(dg)
            me = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=True, depsgraph=dg)
            me.transform(o.matrix_world)
            baked.append((o, me))
        for o, me in baked:
            o.modifiers.clear()
            o.data = me
            o.parent = None
            o.matrix_world = Matrix.Identity(4)
        for o in objs:
            if o.type != "MESH":
                bpy.data.objects.remove(o, do_unlink=True)
        objs = meshes
        bpy.context.view_layer.update()
    else:
        clean_action_names()

    tris = decimate(meshes, job.get("max_tris", 5000))
    mn, mx = world_bbox(meshes)
    nla_mode = False
    if animated:
        arms = [o for o in objs if o.type == "ARMATURE"]
        for a in arms:
            a.data.pose_position = "POSE"
        if len(arms) > 1 and bpy.data.actions:
            # several armatures (e.g. body + eyes): the ACTIONS exporter mode only keeps the active
            # action, so push every action onto an NLA track of the armature that owns them.
            owner = next((a for a in arms if a.animation_data and a.animation_data.action), arms[0])
            ad = owner.animation_data or owner.animation_data_create()
            ad.action = None
            for act in bpy.data.actions:
                tr = ad.nla_tracks.new()
                tr.name = act.name
                st = tr.strips.new(act.name, int(act.frame_range[0]), act)
                if getattr(act, "slots", None) and hasattr(st, "action_slot"):
                    try:
                        st.action_slot = act.slots[0]
                    except Exception:
                        pass
            nla_mode = True
        bpy.context.view_layer.update()
    select_only(objs)
    kw = dict(filepath=out_path, export_format="GLB", use_selection=True, export_yup=True,
              export_apply=True, export_animations=bool(animated), export_texcoords=True,
              export_normals=True, export_materials="EXPORT", export_image_format="AUTO",
              export_cameras=False, export_lights=False, export_extras=False)
    if animated:
        kw.update(export_animation_mode="NLA_TRACKS" if nla_mode else "ACTIONS", export_skins=True, export_morph=False,
                  export_force_sampling=True, export_optimize_animation_size=True)
    try:
        bpy.ops.export_scene.gltf(**kw)
    except TypeError as e:
        log("export kw issue", e)
        for k in ("export_optimize_animation_size", "export_force_sampling", "export_extras"):
            kw.pop(k, None)
        bpy.ops.export_scene.gltf(**kw)
    anims = [a.name for a in bpy.data.actions] if animated else []
    d = mx - mn
    # blender (x,y,z) -> three (x, z, y) dims
    return {"out": out_path, "tris": tris, "size": [round(d.x, 3), round(d.z, 3), round(d.y, 3)],
            "animations": anims, "scale_applied": s}


def run_job(job):
    reset()
    import_file(job["src"])
    remove_junk()
    exclude_objects(job)
    relink_images(job["src"])
    apply_mat_tex(job)
    auto_texture(job, mesh_objects())
    downscale_textures(job.get("tex_max", 256))
    bpy.context.view_layer.update()
    tops = [o for o in bpy.context.scene.objects if o.parent is None]
    results = []
    if job.get("split"):
        os.makedirs(job["out"], exist_ok=True)
        rx = re.compile(job["only"], re.I) if job.get("only") else None
        # evaluate each top-level object in isolation: export one, then reload file
        names = [o.name for o in tops if mesh_objects(descendants(o))]
        if rx:
            names = [n for n in names if rx.search(n)]
        for nm in names:
            reset()
            import_file(job["src"])
            remove_junk()
            exclude_objects(job)
            relink_images(job["src"])
            auto_texture(job, mesh_objects())
            downscale_textures(job.get("tex_max", 256))
            ob = bpy.context.scene.objects.get(nm)
            if ob is None:
                continue
            # delete others
            keep = set(descendants(ob))
            for o in list(bpy.context.scene.objects):
                if o not in keep:
                    bpy.data.objects.remove(o, do_unlink=True)
            slug = re.sub(r"[^a-z0-9]+", "_", nm.lower()).strip("_")
            r = process_group([ob], job, os.path.join(job["out"], slug + ".glb"))
            if r:
                r["name"] = nm
                results.append(r)
    else:
        os.makedirs(os.path.dirname(job["out"]), exist_ok=True)
        r = process_group(tops, job, job["out"])
        if r:
            results.append(r)
    return results


def main():
    argv = sys.argv[sys.argv.index("--") + 1:]
    jobs = json.load(open(argv[0], encoding="utf-8"))
    out = []
    for j in jobs:
        log("JOB", j["src"])
        try:
            res = run_job(j)
            for r in res:
                r["src"] = j["src"]
                r["job"] = j.get("id")
            out += res
        except Exception as e:
            import traceback
            traceback.print_exc()
            out.append({"src": j["src"], "job": j.get("id"), "error": str(e)})
    json.dump(out, open(argv[1], "w", encoding="utf-8"), indent=1)
    log("done", len(out))


if __name__ == "__main__":
    main()
