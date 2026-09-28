"""
TFG custom low-poly props, authored procedurally in Blender (round 2 content).

Run headless:
  "C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe" -b --factory-startup \
      --python tools/blender/tfg_props.py -- <out_dir> <tex_dir> <result.json> [id ...]

  out_dir   public/assets/ext/models/tfg-custom
  tex_dir   tools/raw/tfg_model_tex   (made by tools/assets/tfg_textures.py)
  result    JSON list [{id, out, tris, size}] consumed by tools/assets/tfg_models.py

Conventions (manifest note): +Y up, meters, origin bottom-centre, front faces +Z.
Geometry is written in GAME coordinates (x right, y up, z front) and rotated into Blender's
Z-up frame just before export, so the glTF comes out exactly in game space.
Every face gets UVs from a per-part projection: 'box' = world-space tiling (repeats per metre),
'fit' = the face's texture fills 0..1 (screens, panels, labels). Screens / LEDs / light panels use an
emissive texture (three.js: emissiveMap), everything else is plain Lambert in game.
"""
import json
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT_DIR, TEX_DIR, RESULT = argv[0], argv[1], argv[2]
ONLY = set(argv[3:])

EMISSIVE = {"crt_screen", "crt_screen_amber", "crt_screen_blue", "static", "ecg", "rack_front",
            "led_panel", "slime_glow", "led_green"}
TEX_ALIAS = {"slime_glow": "slime", "led_green": "slime"}


# ------------------------------------------------------------------------------------ materials
_mats = {}


def material(name):
    if name in _mats:
        return _mats[name]
    tex = TEX_ALIAS.get(name, name)
    path = os.path.join(TEX_DIR, tex + ".png")
    m = bpy.data.materials.new("tfg_" + name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    img = bpy.data.images.load(path, check_existing=True)
    tn = nt.nodes.new("ShaderNodeTexImage")
    tn.image = img
    tn.interpolation = "Closest"
    nt.links.new(tn.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 1.0
    bsdf.inputs["Metallic"].default_value = 0.0
    if name in EMISSIVE:
        key = "Emission Color" if "Emission Color" in bsdf.inputs else "Emission"
        nt.links.new(tn.outputs["Color"], bsdf.inputs[key])
        bsdf.inputs["Emission Strength"].default_value = 1.0
    _mats[name] = m
    return m


# ------------------------------------------------------------------------------------ model builder
class Model:
    def __init__(self, mid):
        self.id = mid
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new("UVMap")
        self.mat_names = []

    def _mi(self, mat):
        if mat not in self.mat_names:
            self.mat_names.append(mat)
        return self.mat_names.index(mat)

    def _finish(self, faces, mat, uv, scale, smooth=False):
        mi = self._mi(mat)
        for f in faces:
            f.material_index = mi
            f.smooth = smooth
            n = f.normal
            ax = max(range(3), key=lambda i: abs(n[i]))
            s = 1 if n[ax] >= 0 else -1
            pts = []
            for lp in f.loops:
                p = lp.vert.co
                if ax == 0:
                    u, v = (-p.z * s), p.y
                elif ax == 1:
                    u, v = p.x, (-p.z * s)
                else:
                    u, v = (p.x * s), p.y
                pts.append((u, v))
            if uv == "fit":
                us = [q[0] for q in pts]; vs = [q[1] for q in pts]
                u0, u1, v0, v1 = min(us), max(us), min(vs), max(vs)
                du, dv = max(u1 - u0, 1e-6), max(v1 - v0, 1e-6)
                pts = [((q[0] - u0) / du, (q[1] - v0) / dv) for q in pts]
            else:
                pts = [(q[0] * scale, q[1] * scale) for q in pts]
            for lp, q in zip(f.loops, pts):
                lp[self.uv].uv = q

    def box(self, size, pos, mat, uv="box", scale=2.0, rot=(0, 0, 0), pivot=None):
        """Axis box of `size` centred at `pos` (game coords); rot = euler XYZ radians about its centre
        (or about `pivot` when given)."""
        before = set(self.bm.faces)
        m = Matrix.Translation(Vector(pos))
        R = _euler(rot)
        if pivot is not None:
            pv = Vector(pivot)
            m = Matrix.Translation(pv) @ R @ Matrix.Translation(Vector(pos) - pv)
        else:
            m = m @ R
        m = m @ Matrix.Diagonal(Vector((size[0], size[1], size[2], 1.0)))
        bmesh.ops.create_cube(self.bm, size=1.0, matrix=m)
        faces = [f for f in self.bm.faces if f not in before]
        self.bm.normal_update()
        self._finish(faces, mat, uv, scale)
        return faces

    def cyl(self, r, length, pos, mat, axis="y", segs=10, r2=None, uv="box", scale=2.0, caps=True, smooth=True, rot=(0, 0, 0)):
        """Cylinder (or cone when r2 given) centred at `pos`, along `axis`."""
        before = set(self.bm.faces)
        R = {"y": Matrix.Identity(4), "x": Matrix.Rotation(math.pi / 2, 4, "Z"), "z": Matrix.Rotation(math.pi / 2, 4, "X")}[axis]
        # create_cone builds along local Z; rotate Z->Y first
        base = Matrix.Rotation(-math.pi / 2, 4, "X")
        m = Matrix.Translation(Vector(pos)) @ _euler(rot) @ R @ base
        bmesh.ops.create_cone(self.bm, cap_ends=caps, cap_tris=False, segments=segs, radius1=r,
                              radius2=r if r2 is None else r2, depth=length, matrix=m)
        faces = [f for f in self.bm.faces if f not in before]
        self.bm.normal_update()
        side = [f for f in faces if len(f.verts) == 4]
        capf = [f for f in faces if len(f.verts) != 4]
        self._finish(side, mat, uv, scale, smooth=smooth)
        self._finish(capf, mat, "box" if uv == "box" else "fit", scale)
        return faces

    def build(self, recenter=True):
        # origin = bottom-centre of the bounding box (facility.js offsets wall props by depth / 2)
        if recenter and self.bm.verts:
            xs = [v.co.x for v in self.bm.verts]; ys = [v.co.y for v in self.bm.verts]; zs = [v.co.z for v in self.bm.verts]
            off = Vector((-(min(xs) + max(xs)) / 2, -min(ys), -(min(zs) + max(zs)) / 2))
            bmesh.ops.translate(self.bm, vec=off, verts=self.bm.verts)
        # game (x, y-up, z-front) -> blender (x, -z, y) == rotate +90 deg about X
        bmesh.ops.transform(self.bm, matrix=Matrix.Rotation(math.pi / 2, 4, "X"), verts=self.bm.verts)
        me = bpy.data.meshes.new(self.id)
        self.bm.to_mesh(me)
        self.bm.free()
        for n in self.mat_names:
            me.materials.append(material(n))
        ob = bpy.data.objects.new(self.id, me)
        bpy.context.scene.collection.objects.link(ob)
        return ob


def _euler(rot):
    rx, ry, rz = rot
    return (Matrix.Rotation(rz, 4, "Z") @ Matrix.Rotation(ry, 4, "Y") @ Matrix.Rotation(rx, 4, "X"))


# ------------------------------------------------------------------------------------ shared parts
def crt(M, x, y, z, screen="crt_screen", s=1.0, ry=0.0):
    """Beige CRT monitor, bottom-centre at (x,y,z), facing +Z (rotated by ry)."""
    def P(px, py, pz):
        c, sn = math.cos(ry), math.sin(ry)
        return (x + (px * c + pz * sn) * s, y + py * s, z + (-px * sn + pz * c) * s)
    r = (0, ry, 0)
    M.box((0.26 * s, 0.05 * s, 0.24 * s), P(0, 0.025, 0), "beige_plastic", rot=r)           # foot
    M.box((0.08 * s, 0.05 * s, 0.08 * s), P(0, 0.07, 0), "beige_plastic", rot=r)            # neck
    M.box((0.42 * s, 0.34 * s, 0.30 * s), P(0, 0.265, 0.03), "beige_plastic", rot=r)        # case
    M.box((0.30 * s, 0.25 * s, 0.16 * s), P(0, 0.25, -0.19), "beige_plastic", rot=r)        # tube back
    M.box((0.34 * s, 0.25 * s, 0.012 * s), P(0, 0.275, 0.186), screen, uv="fit", rot=r)     # glass
    M.box((0.03 * s, 0.015 * s, 0.01 * s), P(0.15, 0.11, 0.185), "led_green", uv="fit", rot=r)


def stand_base(M, y=0.0, r=0.26, mat="chrome"):
    """5-legged rolling base (IV stand / monitor stand)."""
    for k in range(5):
        a = k * 2 * math.pi / 5
        M.box((0.035, 0.03, r), (math.sin(a) * r / 2, y + 0.07, math.cos(a) * r / 2), mat, rot=(0, a, 0))
        M.cyl(0.03, 0.03, (math.sin(a) * r, y + 0.03, math.cos(a) * r), "rubber", axis="x", segs=6, rot=(0, a, 0))


def wheel(M, x, y, z, r=0.04, w=0.03):
    M.cyl(r, w, (x, y + r, z), "rubber", axis="x", segs=8)


# ------------------------------------------------------------------------------------ models
def m_crt_monitor(M):
    crt(M, 0, 0, 0)


def m_crt_stack(M):
    """Heap of dead CRTs on a pallet - 'shrine of the dead internet' landmark."""
    M.box((1.3, 0.12, 1.0), (0, 0.06, 0), "laminate", scale=1.5)
    for i, (x, y, z, scr, ry, s) in enumerate([
        (-0.36, 0.12, 0.12, "static", 0.1, 1.2), (0.34, 0.12, 0.1, "crt_screen_blue", -0.15, 1.15),
        (0.0, 0.12, -0.25, "crt_screen", 0.0, 1.1), (-0.25, 0.60, 0.05, "crt_screen_amber", -0.2, 1.05),
        (0.27, 0.58, 0.0, "static", 0.25, 1.0), (0.0, 1.03, -0.02, "crt_screen", 0.05, 0.95),
    ]):
        crt(M, x, y, z, scr, s, ry)
    # tangle of cables
    for k, (x0, x1) in enumerate([(-0.6, -0.2), (0.1, 0.62), (-0.3, 0.3)]):
        M.box((abs(x1 - x0), 0.025, 0.025), ((x0 + x1) / 2, 0.14 + k * 0.02, 0.48), "cable", rot=(0, 0.3 * (k - 1), 0))


def m_cubicle_wall(M):
    M.box((1.6, 1.38, 0.06), (0, 0.04 + 0.69, 0), "fabric_cubicle", scale=2.5)
    M.box((1.64, 0.035, 0.08), (0, 1.44, 0), "alu")
    for x in (-0.81, 0.81):
        M.box((0.04, 1.44, 0.08), (x, 0.72, 0), "alu")
        M.box((0.07, 0.035, 0.42), (x, 0.0175, 0), "dark_metal")


def m_cubicle_desk(M):
    # back partition + side partition
    M.box((1.7, 1.36, 0.06), (0, 0.72, -0.42), "fabric_cubicle", scale=2.5)
    M.box((1.74, 0.035, 0.08), (0, 1.41, -0.42), "alu")
    M.box((0.06, 1.2, 0.8), (-0.84, 0.64, -0.02), "fabric_cubicle", scale=2.5)
    M.box((0.08, 0.035, 0.84), (-0.84, 1.255, -0.02), "alu")
    # work surface on a pedestal + leg panel
    M.box((1.56, 0.04, 0.72), (0.02, 0.73, -0.04), "laminate")
    M.box((0.42, 0.7, 0.62), (0.54, 0.35, -0.08), "dark_metal")
    for dy in (0.18, 0.40, 0.60):
        M.box((0.36, 0.01, 0.01), (0.54, dy, 0.235), "alu")
    M.box((0.04, 0.71, 0.6), (-0.76, 0.355, -0.08), "dark_metal")
    # CRT + keyboard + paper + mug
    crt(M, -0.32, 0.75, -0.16, "crt_screen")
    M.box((0.44, 0.03, 0.15), (-0.30, 0.765, 0.18), "keyboard", uv="fit")
    M.box((0.24, 0.05, 0.31), (0.38, 0.775, -0.05), "paper", uv="fit")
    M.box((0.21, 0.03, 0.29), (0.40, 0.815, -0.02), "paper", uv="fit", rot=(0, 0.2, 0))
    M.cyl(0.04, 0.1, (0.16, 0.8, 0.12), "white_plastic", segs=8)
    M.cyl(0.032, 0.005, (0.16, 0.851, 0.12), "blood", segs=8)   # cold coffee


def m_copier(M):
    M.box((0.94, 0.08, 0.64), (0, 0.04, 0), "black_plastic")
    M.box((0.9, 0.8, 0.6), (0, 0.48, 0), "beige_plastic")
    for k in range(3):
        M.box((0.8, 0.012, 0.01), (0, 0.2 + k * 0.17, 0.302), "dark_metal")
        M.box((0.12, 0.03, 0.02), (0, 0.25 + k * 0.17, 0.31), "black_plastic")
    M.box((0.88, 0.05, 0.58), (0, 0.905, 0), "glass_dark")
    M.box((0.9, 0.04, 0.6), (0, 0.95, 0), "beige_plastic")
    M.box((0.34, 0.05, 0.18), (0.24, 0.99, 0.24), "copier_panel", uv="fit", rot=(-0.35, 0, 0))
    M.box((0.36, 0.02, 0.42), (0.6, 0.62, 0), "beige_plastic", rot=(0, 0, 0.12))
    M.box((0.24, 0.012, 0.32), (0.6, 0.65, 0), "paper", uv="fit", rot=(0, 0.1, 0.12))
    M.box((0.22, 0.004, 0.2), (0.0, 0.83, 0.33), "paper", uv="fit", rot=(-0.9, 0, 0))   # jammed page


def m_server_rack(M, open_=False):
    M.box((0.62, 0.06, 1.0), (0, 0.03, 0), "black_plastic")
    M.box((0.6, 1.92, 0.96), (0, 1.0, 0), "black_plastic", scale=1.5)
    M.box((0.62, 0.04, 1.0), (0, 1.98, 0), "grille", uv="fit")
    M.box((0.54, 1.84, 0.01), (0, 1.0, 0.482), "rack_front", uv="fit")
    if not open_:
        # glass door: frame + handle
        for x in (-0.295, 0.295):
            M.box((0.03, 1.9, 0.03), (x, 1.0, 0.495), "dark_metal")
        for y in (0.06, 1.95):
            M.box((0.62, 0.03, 0.03), (0, y, 0.495), "dark_metal")
        M.box((0.02, 0.24, 0.03), (0.26, 1.05, 0.52), "alu")
    else:
        # door swung open ~110 deg around the left hinge
        hinge = (-0.3, 1.0, 0.5)
        a = -1.9
        M.box((0.6, 1.9, 0.03), (0.0, 1.0, 0.5), "glass_dark", rot=(0, a, 0), pivot=hinge)
        M.box((0.62, 0.05, 0.04), (0.0, 1.95, 0.5), "dark_metal", rot=(0, a, 0), pivot=hinge)
        M.box((0.62, 0.05, 0.04), (0.0, 0.06, 0.5), "dark_metal", rot=(0, a, 0), pivot=hinge)
        # pulled blades + dangling cables
        for k, (y, out) in enumerate([(1.45, 0.22), (1.1, 0.4), (0.7, 0.15)]):
            M.box((0.46, 0.045, 0.5), (0, y, 0.48 + out - 0.25), "dark_metal")
            M.box((0.44, 0.04, 0.01), (0, y, 0.48 + out + 0.006), "rack_front", uv="fit")
            M.box((0.012, y - 0.02, 0.012), (-0.15 + k * 0.14, y / 2, 0.5 + out), "cable")


def m_server_rack_open(M):
    m_server_rack(M, open_=True)


def m_crac_unit(M):
    M.box((1.6, 0.1, 0.8), (0, 0.05, 0), "dark_metal")
    M.box((1.56, 1.8, 0.78), (0, 1.0, 0), "white_metal", scale=1.5)
    for x in (-0.52, 0.0, 0.52):
        M.box((0.46, 0.8, 0.01), (x, 1.4, 0.392), "grille", uv="fit")
        M.box((0.46, 0.6, 0.01), (x, 0.52, 0.392), "white_metal")
    M.box((0.16, 0.1, 0.012), (0.52, 0.93, 0.395), "crt_screen_blue", uv="fit")
    M.box((1.6, 0.04, 0.8), (0, 1.92, 0), "white_metal")


def m_ups_cabinet(M):
    M.box((0.6, 1.2, 0.8), (0, 0.6, 0), "black_plastic", scale=1.5)
    M.box((0.14, 0.08, 0.012), (0, 1.02, 0.402), "crt_screen_amber", uv="fit")
    M.box((0.5, 0.5, 0.01), (0, 0.4, 0.402), "grille", uv="fit")
    M.box((0.03, 0.015, 0.01), (0.15, 1.02, 0.405), "led_green", uv="fit")


def m_server_blade(M):
    M.box((0.44, 0.045, 0.56), (0, 0.0225, 0), "dark_metal")
    M.box((0.44, 0.042, 0.01), (0, 0.0225, 0.285), "rack_front", uv="fit")
    M.box((0.05, 0.02, 0.03), (0.18, 0.025, 0.3), "alu")


def m_router(M):
    M.box((0.22, 0.04, 0.15), (0, 0.02, 0), "black_plastic")
    for k in range(4):
        M.box((0.012, 0.008, 0.004), (-0.06 + k * 0.03, 0.03, 0.076), "led_green", uv="fit")
    for k, x in enumerate((-0.08, 0.0, 0.08)):
        M.cyl(0.007, 0.16, (x, 0.12, -0.065), "black_plastic", segs=6, rot=(0.15 * (k - 1), 0, 0.2 * (k - 1)))


def m_keyboard(M):
    M.box((0.44, 0.03, 0.15), (0, 0.015, 0), "keyboard", uv="fit")


def m_filing_boxes(M):
    for (x, y, z, ry) in [(-0.22, 0, 0, 0.05), (0.22, 0, 0.02, -0.08), (0.0, 0.3, 0.0, 0.18), (-0.18, 0.6, 0.02, -0.1)]:
        M.box((0.4, 0.3, 0.32), (x, y + 0.15, z), "cardboard", rot=(0, ry, 0))
        c, s = math.cos(ry), math.sin(ry)
        M.box((0.14, 0.09, 0.005), (x + s * 0.162, y + 0.17, z + c * 0.162), "paper", uv="fit", rot=(0, ry, 0))


def m_troffer_light(M):
    M.box((1.2, 0.08, 0.6), (0, 0.04, 0), "white_metal")
    M.box((1.12, 0.01, 0.52), (0, -0.004, 0), "led_panel", uv="fit")


def m_stack_chair(M):
    M.box((0.44, 0.03, 0.42), (0, 0.46, 0), "white_plastic")
    M.box((0.44, 0.3, 0.03), (0, 0.72, -0.22), "white_plastic", rot=(-0.12, 0, 0))
    for x in (-0.2, 0.2):
        for z in (-0.19, 0.19):
            M.cyl(0.013, 0.46, (x, 0.23, z), "chrome", segs=6)
        M.cyl(0.013, 0.45, (x, 0.68, -0.21), "chrome", segs=6, rot=(-0.12, 0, 0))


def m_almond_water(M):
    M.cyl(0.042, 0.19, (0, 0.095, 0), "label_bottle", segs=10, uv="box", scale=5.0)
    M.cyl(0.03, 0.03, (0, 0.205, 0), "white_plastic", segs=8, r2=0.018)
    M.cyl(0.017, 0.02, (0, 0.23, 0), "cable", segs=8)


# ---- sewer
def m_sewer_pipe(M):
    M.cyl(0.28, 2.2, (0, 0.95, 0.0), "rust", axis="x", segs=12, scale=1.5)
    for x in (-1.06, 0.0, 1.06):
        M.cyl(0.33, 0.08, (x, 0.95, 0.0), "rust", axis="x", segs=12)
    for x in (-0.7, 0.7):
        M.box((0.08, 0.66, 0.08), (x, 0.33, 0.0), "dark_metal")
        M.box((0.08, 0.08, 0.36), (x, 0.95, -0.2), "dark_metal")
        M.box((0.3, 0.02, 0.3), (x, 0.01, 0.0), "dark_metal")
    M.box((0.1, 0.25, 0.04), (0.0, 0.6, 0.24), "slime_glow", uv="fit")
    M.box((0.5, 0.012, 0.4), (0.05, 0.006, 0.12), "slime_glow")


def m_sewer_valve(M):
    M.cyl(0.14, 2.4, (0, 1.2, -0.12), "rust", segs=10, scale=1.5)
    for y in (0.2, 2.2):
        M.cyl(0.18, 0.06, (0, y, -0.12), "rust", segs=10)
    M.cyl(0.1, 0.3, (0, 1.1, 0.05), "rust", axis="z", segs=8)
    M.cyl(0.13, 0.05, (0, 1.1, 0.2), "rust", axis="z", segs=8)
    # red valve wheel facing +Z
    cz = 0.3
    M.cyl(0.03, 0.08, (0, 1.1, cz - 0.04), "dark_metal", axis="z", segs=6)
    for k in range(10):
        a = k * 2 * math.pi / 10
        M.box((0.08, 0.025, 0.025), (math.cos(a) * 0.22, 1.1 + math.sin(a) * 0.22, cz), "blood", rot=(0, 0, a + math.pi / 2))
    for k in range(3):
        a = k * 2 * math.pi / 3
        M.box((0.22, 0.018, 0.018), (math.cos(a) * 0.11, 1.1 + math.sin(a) * 0.11, cz), "blood", rot=(0, 0, a))
    # pressure gauge
    M.cyl(0.02, 0.1, (0.14, 1.5, -0.12), "rust", axis="x", segs=6)
    M.cyl(0.07, 0.03, (0.2, 1.5, -0.08), "white_plastic", axis="z", segs=10)


def m_sewer_outflow(M):
    M.box((1.2, 1.2, 0.14), (0, 0.9, -0.2), "concrete", scale=1.5)
    M.cyl(0.46, 0.5, (0, 0.95, 0.0), "rust", axis="z", segs=12, scale=1.5)
    M.cyl(0.4, 0.02, (0, 0.95, 0.24), "rubber", axis="z", segs=12)
    for x in (-0.24, -0.08, 0.08, 0.24):
        M.cyl(0.018, 0.8, (x, 0.95, 0.26), "dark_metal", segs=6)
    M.box((0.26, 0.3, 0.06), (0, 0.6, 0.3), "slime_glow", uv="fit", rot=(0.5, 0, 0))
    M.box((0.9, 0.015, 0.9), (0, 0.008, 0.45), "slime_glow")


def m_sewer_grate(M):
    M.box((1.0, 0.03, 1.0), (0, 0.015, 0), "dark_metal")
    M.box((0.9, 0.035, 0.9), (0, 0.02, 0), "grille", uv="fit")


def m_sewer_ladder(M):
    for x in (-0.22, 0.22):
        M.box((0.05, 2.8, 0.05), (x, 1.4, 0.0), "rust")
        for y in (0.4, 2.4):
            M.box((0.04, 0.04, 0.16), (x, y, -0.1), "rust")
    for k in range(9):
        M.cyl(0.018, 0.44, (0, 0.3 + k * 0.3, 0.0), "rust", axis="x", segs=6)


# ---- hospital
def m_hospital_bed(M):
    M.box((0.9, 0.1, 2.0), (0, 0.42, 0), "white_metal")
    M.box((0.86, 0.14, 1.9), (0, 0.54, 0), "mattress", uv="fit")
    M.box((0.58, 0.1, 0.34), (0, 0.66, -0.72), "white_plastic", rot=(0.12, 0, 0))
    M.box((0.92, 0.02, 1.15), (0, 0.62, 0.3), "sheet_mint", scale=2.5)
    for x in (-0.46, 0.46):
        M.box((0.02, 0.22, 1.15), (x, 0.52, 0.3), "sheet_mint", scale=2.5)
        M.box((0.03, 0.03, 0.9), (x + (0.02 if x > 0 else -0.02), 0.8, -0.35), "chrome")
        M.box((0.03, 0.03, 0.9), (x + (0.02 if x > 0 else -0.02), 0.66, -0.35), "chrome")
        for z in (-0.75, 0.05):
            M.box((0.03, 0.2, 0.03), (x + (0.02 if x > 0 else -0.02), 0.72, z), "chrome")
    M.box((0.96, 0.62, 0.05), (0, 0.72, -1.0), "white_plastic")
    M.box((0.96, 0.4, 0.05), (0, 0.6, 1.0), "white_plastic")
    for x in (-0.4, 0.4):
        for z in (-0.9, 0.9):
            M.cyl(0.02, 0.32, (x, 0.23, z), "chrome", segs=6)
            wheel(M, x, 0.0, z, 0.05, 0.035)


def m_gurney(M):
    M.box((0.62, 0.04, 1.95), (0, 0.8, 0), "chrome")
    M.box((0.56, 0.07, 1.88), (0, 0.855, 0), "mattress", uv="fit")
    for x in (-0.25, 0.25):
        for z in (-0.85, 0.85):
            M.cyl(0.018, 0.74, (x, 0.41, z), "chrome", segs=6)
            wheel(M, x, 0.0, z)
    M.box((0.5, 0.03, 1.6), (0, 0.44, 0), "chrome")
    # covered body
    M.box((0.44, 0.16, 1.2), (0, 0.97, 0.18), "sheet_mint", scale=2.5)
    M.box((0.36, 0.12, 0.36), (0, 0.95, -0.55), "sheet_mint", scale=2.5)
    M.cyl(0.11, 0.2, (0, 1.0, -0.8), "sheet_mint", axis="x", segs=8)
    M.box((0.1, 0.12, 0.1), (-0.12, 1.1, 0.78), "sheet_mint")
    M.box((0.1, 0.12, 0.1), (0.12, 1.1, 0.78), "sheet_mint")
    M.box((0.12, 0.01, 0.2), (0.05, 1.052, 0.1), "blood")
    M.box((0.62, 0.3, 0.01), (0.0, 0.64, 0.38), "sheet_mint")   # sheet hanging down one side
    M.box((0.08, 0.02, 0.08), (0.28, 0.5, 0.38), "paper", uv="fit")   # toe tag


def m_iv_stand(M):
    stand_base(M)
    M.cyl(0.015, 1.9, (0, 1.02, 0), "chrome", segs=6)
    M.box((0.3, 0.015, 0.015), (0, 1.95, 0), "chrome")
    M.box((0.14, 0.22, 0.04), (0.12, 1.78, 0), "iv_bag", uv="fit")
    M.box((0.14, 0.2, 0.04), (-0.12, 1.79, 0), "blood", uv="fit")
    M.cyl(0.004, 0.9, (0.12, 1.2, 0.0), "white_plastic", segs=4, smooth=False)


def m_wheelchair(M):
    M.box((0.44, 0.04, 0.44), (0, 0.5, 0.02), "fabric_chair")
    M.box((0.44, 0.42, 0.03), (0, 0.76, -0.22), "fabric_chair", rot=(-0.1, 0, 0))
    for x in (-0.24, 0.24):
        M.cyl(0.3, 0.03, (x * 1.18, 0.3, -0.06), "rubber", axis="x", segs=14)
        M.cyl(0.2, 0.035, (x * 1.18, 0.3, -0.06), "chrome", axis="x", segs=10)
        M.box((0.025, 0.025, 0.4), (x, 0.7, 0.0), "chrome")
        M.box((0.025, 0.5, 0.025), (x, 0.74, -0.24), "chrome")
        M.box((0.025, 0.35, 0.025), (x, 0.32, 0.22), "chrome")
        wheel(M, x, 0.0, 0.3, 0.05, 0.03)
    M.box((0.36, 0.02, 0.14), (0, 0.12, 0.34), "dark_metal")


def m_med_cabinet(M):
    M.box((0.9, 1.9, 0.42), (0, 0.95, 0), "white_metal", scale=1.5)
    for x in (-0.22, 0.22):
        M.box((0.38, 0.96, 0.012), (x, 1.36, 0.214), "glass_dark")
        M.box((0.38, 0.62, 0.012), (x, 0.4, 0.214), "white_metal")
        M.box((0.02, 0.12, 0.03), (x * 0.2, 0.62, 0.23), "chrome")
    for y in (1.05, 1.36, 1.66):
        M.box((0.8, 0.012, 0.01), (0, y, 0.222), "white_metal")
    M.box((0.2, 0.06, 0.01), (0, 1.8, 0.215), "blood", uv="fit")
    M.box((0.06, 0.2, 0.01), (0, 1.8, 0.216), "blood", uv="fit")
    for k, x in enumerate((-0.3, -0.18, 0.1, 0.28)):
        M.cyl(0.04, 0.12 + 0.04 * (k % 2), (x, 1.96 + 0.02 * (k % 2), 0), "glass_dark" if k % 2 else "iv_bag", segs=8)


def m_heart_monitor(M):
    stand_base(M, r=0.24)
    M.cyl(0.02, 1.0, (0, 0.58, 0), "chrome", segs=6)
    M.box((0.38, 0.3, 0.22), (0, 1.22, 0), "dark_metal")
    M.box((0.3, 0.22, 0.01), (0, 1.23, 0.112), "ecg", uv="fit")
    M.box((0.24, 0.04, 0.16), (0, 1.07, 0), "dark_metal")
    for k in range(3):
        M.box((0.01, 0.6, 0.01), (-0.12 + k * 0.1, 0.82, 0.08 + 0.02 * k), "cable" if k == 1 else "white_plastic",
              rot=(0.1 * k, 0, 0.08 * (k - 1)))


def m_privacy_curtain(M):
    for x in (-0.95, 0.95):
        stand_x = x
        M.cyl(0.018, 1.9, (stand_x, 0.98, -0.05), "chrome", segs=6)
        M.box((0.36, 0.03, 0.04), (stand_x, 0.03, -0.05), "chrome")
        wheel(M, stand_x - 0.15, 0.0, -0.05, 0.03, 0.02)
        wheel(M, stand_x + 0.15, 0.0, -0.05, 0.03, 0.02)
    M.box((1.94, 0.025, 0.025), (0, 1.92, -0.05), "chrome")
    n = 8
    wdt = 1.8 / n
    for k in range(n):
        x = -0.9 + wdt * (k + 0.5)
        a = 0.35 if k % 2 else -0.35
        M.box((wdt / math.cos(a) + 0.01, 1.62, 0.015), (x, 1.07, 0.0), "curtain", rot=(0, a, 0), scale=2.5)


# ---- backrooms
def m_backrooms_pillar(M):
    """Wallpapered square column with a baseboard; 3.4 m so it always meets the ceiling (backrooms rooms are
    2.9-3.3 m tall; the part above the ceiling is hidden)."""
    M.box((0.6, 3.4, 0.6), (0, 1.7, 0), "wallpaper_yellow", scale=1.2)
    M.box((0.64, 0.1, 0.64), (0, 0.05, 0), "laminate")


MODELS = {
    # office
    "tfg_crt_monitor": (m_crt_monitor, "machinery", ["office", "computer", "crt", "monitor", "emissive"]),
    "tfg_crt_stack": (m_crt_stack, "machinery", ["office", "crt", "landmark", "emissive", "internet"]),
    "tfg_cubicle_wall": (m_cubicle_wall, "furniture", ["office", "cubicle", "partition", "wall"]),
    "tfg_cubicle_desk": (m_cubicle_desk, "furniture", ["office", "cubicle", "desk", "computer", "emissive"]),
    "tfg_copier": (m_copier, "machinery", ["office", "copier", "printer"]),
    "tfg_filing_boxes": (m_filing_boxes, "prop", ["office", "boxes", "cardboard", "clutter"]),
    "tfg_keyboard": (m_keyboard, "scrap", ["office", "keyboard", "computer"]),
    "tfg_router": (m_router, "scrap", ["office", "router", "wifi", "internet", "emissive"]),
    # serverfarm
    "tfg_server_rack": (m_server_rack, "machinery", ["serverfarm", "server", "rack", "emissive"]),
    "tfg_server_rack_open": (m_server_rack_open, "machinery", ["serverfarm", "server", "rack", "emissive", "damaged"]),
    "tfg_crac_unit": (m_crac_unit, "machinery", ["serverfarm", "cooling", "hvac"]),
    "tfg_ups_cabinet": (m_ups_cabinet, "machinery", ["serverfarm", "ups", "battery", "emissive"]),
    "tfg_server_blade": (m_server_blade, "scrap", ["serverfarm", "server", "blade", "emissive"]),
    # backrooms
    "tfg_troffer_light": (m_troffer_light, "light", ["backrooms", "office", "ceiling", "light", "emissive"]),
    "tfg_stack_chair": (m_stack_chair, "furniture", ["backrooms", "office", "chair"]),
    "tfg_almond_water": (m_almond_water, "scrap", ["backrooms", "bottle", "drink"]),
    "tfg_backrooms_pillar": (m_backrooms_pillar, "structure", ["backrooms", "pillar", "column"]),
    # sewer
    "tfg_sewer_pipe": (m_sewer_pipe, "structure", ["sewer", "pipe", "wall", "slime"]),
    "tfg_sewer_valve": (m_sewer_valve, "machinery", ["sewer", "pipe", "valve", "wall"]),
    "tfg_sewer_outflow": (m_sewer_outflow, "structure", ["sewer", "pipe", "outflow", "wall", "slime", "emissive"]),
    "tfg_sewer_grate": (m_sewer_grate, "structure", ["sewer", "grate", "floor"]),
    "tfg_sewer_ladder": (m_sewer_ladder, "structure", ["sewer", "ladder", "wall"]),
    # hospital
    "tfg_hospital_bed": (m_hospital_bed, "furniture", ["hospital", "bed"]),
    "tfg_gurney": (m_gurney, "furniture", ["hospital", "gurney", "body", "horror"]),
    "tfg_iv_stand": (m_iv_stand, "prop", ["hospital", "iv", "drip"]),
    "tfg_wheelchair": (m_wheelchair, "furniture", ["hospital", "wheelchair"]),
    "tfg_med_cabinet": (m_med_cabinet, "furniture", ["hospital", "cabinet", "medicine"]),
    "tfg_heart_monitor": (m_heart_monitor, "machinery", ["hospital", "monitor", "ecg", "emissive"]),
    "tfg_privacy_curtain": (m_privacy_curtain, "furniture", ["hospital", "curtain", "divider"]),
}


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    results = []
    for mid, (fn, cat, tags) in MODELS.items():
        if ONLY and mid not in ONLY:
            continue
        for ob in list(bpy.context.scene.objects):
            bpy.data.objects.remove(ob, do_unlink=True)
        try:
            M = Model(mid)
            fn(M)
            ob = M.build()
            bpy.ops.object.select_all(action="DESELECT")
            ob.select_set(True)
            bpy.context.view_layer.objects.active = ob
            out = os.path.join(OUT_DIR, mid + ".glb")
            bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", use_selection=True, export_yup=True,
                                      export_apply=True, export_texcoords=True, export_normals=True,
                                      export_materials="EXPORT", export_image_format="AUTO",
                                      export_cameras=False, export_lights=False, export_animations=False)
            me = ob.data
            tris = sum(len(p.vertices) - 2 for p in me.polygons)
            xs = [v.co.x for v in me.vertices]; ys = [v.co.y for v in me.vertices]; zs = [v.co.z for v in me.vertices]
            # blender (x, y, z) -> game (x, z, -y)
            size = [round(max(xs) - min(xs), 3), round(max(zs) - min(zs), 3), round(max(ys) - min(ys), 3)]
            results.append(dict(id=mid, out=out, tris=tris, size=size, category=cat, tags=tags,
                                min_y=round(min(zs), 3)))
            print("TFG ok", mid, tris, size, flush=True)
        except Exception as e:  # keep going, report
            import traceback
            traceback.print_exc()
            results.append(dict(id=mid, error=str(e)))
    json.dump(results, open(RESULT, "w", encoding="utf-8"), indent=1)


main()
