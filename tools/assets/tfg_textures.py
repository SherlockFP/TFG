#!/usr/bin/env python3
"""
TFG custom textures (round 2): hand-authored procedural pixel textures for the new interior themes
(office / backrooms / serverfarm / sewer / hospital) plus the CC0 GibbonGL backrooms atlas cut into tiles.

  * level textures  -> public/assets/ext/textures/tfg-custom/<id>.png   (listed in the manifest)
  * atlas tiles     -> public/assets/ext/textures/gibbongl-backrooms/<id>.png
  * model textures  -> tools/raw/tfg_model_tex/<name>.png  (embedded into the custom GLBs by
                       tools/blender/tfg_props.py, NOT listed in the manifest)
  * writes tools/assets/_frag_textures_tfg.json (merged by manifest.py)

Everything is deterministic (fixed seeds). 8-bit palette PNGs, 64-128 px, meant for nearest filtering.
Usage: python tfg_textures.py
"""
import json
import os

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
PUB = os.path.join(ROOT, "public")
OUT_LVL = os.path.join(PUB, "assets", "ext", "textures", "tfg-custom")
OUT_ATLAS = os.path.join(PUB, "assets", "ext", "textures", "gibbongl-backrooms")
OUT_MODEL = os.path.join(ROOT, "tools", "raw", "tfg_model_tex")
ATLAS_SRC = os.path.join(ROOT, "tools", "raw", "gibbongl__backrooms-low-res-textures", "lowres textures.png")
FRAG = os.path.join(HERE, "_frag_textures_tfg.json")

CUSTOM_PACK = "TFG Custom (made for this game)"
GIBBON_PACK = "Low-res Backrooms and Poolrooms textures"


# ------------------------------------------------------------------------------------ helpers
def rng(seed):
    return np.random.default_rng(seed)


def value_noise(r, w, h, cell, amp=1.0):
    """Tileable value noise (bilinear) in [-amp, amp]."""
    gw, gh = max(1, w // cell), max(1, h // cell)
    g = r.uniform(-1, 1, (gh, gw))
    ys = np.arange(h) / cell
    xs = np.arange(w) / cell
    y0 = np.floor(ys).astype(int) % gh
    x0 = np.floor(xs).astype(int) % gw
    y1, x1 = (y0 + 1) % gh, (x0 + 1) % gw
    fy = (ys - np.floor(ys))[:, None]
    fx = (xs - np.floor(xs))[None, :]
    fy = fy * fy * (3 - 2 * fy)
    fx = fx * fx * (3 - 2 * fx)
    a = g[y0][:, x0]; b = g[y0][:, x1]; c = g[y1][:, x0]; d = g[y1][:, x1]
    return amp * (a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy)


def fbm(r, w, h, cells=(32, 16, 8, 4), amps=(1, 0.5, 0.25, 0.12)):
    out = np.zeros((h, w))
    for c, a in zip(cells, amps):
        out += value_noise(r, w, h, c, a)
    return out / sum(amps)


def canvas(w, h, rgb):
    return np.ones((h, w, 3)) * np.array(rgb, dtype=float)


def shade(img, amount):
    """amount: HxW array, multiplies brightness by (1 + amount)."""
    return img * (1 + amount)[:, :, None]


def speckle(img, r, n, rgb, alpha=1.0, size=1):
    h, w, _ = img.shape
    for _ in range(n):
        x, y = r.integers(0, w), r.integers(0, h)
        for dy in range(size):
            for dx in range(size):
                yy, xx = (y + dy) % h, (x + dx) % w
                img[yy, xx] = img[yy, xx] * (1 - alpha) + np.array(rgb) * alpha
    return img


def stain(img, r, cx, cy, rad, rgb, strength=0.5):
    h, w, _ = img.shape
    yy, xx = np.mgrid[0:h, 0:w]
    dx = np.minimum(abs(xx - cx), w - abs(xx - cx))
    dy = np.minimum(abs(yy - cy), h - abs(yy - cy))
    d = np.sqrt(dx * dx + dy * dy) / rad
    wob = value_noise(r, w, h, 8, 0.35)
    m = np.clip(1 - (d + wob), 0, 1) * strength
    ring = np.clip(1 - abs(d + wob - 0.95) * 6, 0, 1) * strength * 0.8  # darker tide line
    m = np.clip(m + ring, 0, 1)[:, :, None]
    return img * (1 - m) + np.array(rgb) * m


def rect(img, x0, y0, x1, y1, rgb, alpha=1.0):
    img[y0:y1, x0:x1] = img[y0:y1, x0:x1] * (1 - alpha) + np.array(rgb) * alpha
    return img


def save(img, path, colors=48):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), "RGB")
    im = im.quantize(colors=colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    im.save(path, optimize=True)
    return im.size


# ------------------------------------------------------------------------------------ level textures
def tex_ceiling_tiles(seed, base, grid, stains=2, stain_rgb=(150, 120, 60)):
    """Acoustic drop-ceiling: 2x2 tiles per 128 px with metal T-bar grid and pinholes."""
    r = rng(seed)
    w = h = 128
    img = canvas(w, h, base)
    img = shade(img, fbm(r, w, h, (16, 8, 4, 2)) * 0.06)
    # fissured pinholes
    for _ in range(900):
        x, y = r.integers(0, w), r.integers(0, h)
        img[y, x] *= r.uniform(0.72, 0.9)
    # per-tile tint + sagging edge shadow
    for ty in range(2):
        for tx in range(2):
            k = r.uniform(-0.05, 0.04)
            img[ty * 64:(ty + 1) * 64, tx * 64:(tx + 1) * 64] *= 1 + k
            img[ty * 64 + 2:ty * 64 + 5, tx * 64 + 2:(tx + 1) * 64 - 2] *= 0.9
    for _ in range(stains):
        img = stain(img, r, r.integers(0, w), r.integers(0, h), r.uniform(10, 22), stain_rgb, 0.35)
    for g in (0, 63, 64, 127):
        img[:, g] = grid
        img[g, :] = grid
    img[:, 1] = np.array(grid) * 1.25
    img[1, :] = np.array(grid) * 1.25
    img[:, 65] = np.array(grid) * 1.25
    img[65, :] = np.array(grid) * 1.25
    return img


def tex_carpet_tiles(seed, base, fleck, seam, stains=1, stain_rgb=(70, 50, 30)):
    r = rng(seed)
    w = h = 128
    img = canvas(w, h, base)
    n = r.uniform(-1, 1, (h, w))
    img = shade(img, n * 0.10 + fbm(r, w, h, (32, 16, 8)) * 0.08)
    img = speckle(img, r, 700, fleck, 0.55)
    # carpet tiles alternate pile direction -> slight brightness checker
    for ty in range(2):
        for tx in range(2):
            img[ty * 64:(ty + 1) * 64, tx * 64:(tx + 1) * 64] *= 1.04 if (tx + ty) % 2 else 0.96
    for g in (0, 64):
        img[:, g] = img[:, g] * 0.5 + np.array(seam) * 0.5
        img[g, :] = img[g, :] * 0.5 + np.array(seam) * 0.5
    for _ in range(stains):
        img = stain(img, r, r.integers(0, w), r.integers(0, h), r.uniform(8, 16), stain_rgb, 0.45)
    return img


def tex_paint_wall(seed, base, scuffs=6, scuff_rgb=(90, 90, 90), size=64):
    r = rng(seed)
    w = h = size
    img = canvas(w, h, base)
    img = shade(img, fbm(r, w, h, (16, 8, 4, 2)) * 0.07 + r.uniform(-1, 1, (h, w)) * 0.025)
    for _ in range(scuffs):
        x, y = r.integers(0, w), r.integers(0, h)
        ln = r.integers(3, 9)
        for i in range(ln):
            img[y % h, (x + i) % w] = img[y % h, (x + i) % w] * 0.6 + np.array(scuff_rgb) * 0.4
    return img


def tex_raised_floor(seed):
    """Datacenter raised floor: 2x2 grey tiles, two of them perforated, dark gaps."""
    r = rng(seed)
    w = h = 128
    img = canvas(w, h, (158, 162, 166))
    img = shade(img, fbm(r, w, h, (16, 8, 4)) * 0.05)
    perf = [(0, 0), (1, 1)] if r.random() < 0.5 else [(1, 0), (0, 1)]
    for tx, ty in perf:
        for yy in range(ty * 64 + 8, ty * 64 + 58, 4):
            for xx in range(tx * 64 + 8, tx * 64 + 58, 4):
                img[yy:yy + 2, xx:xx + 2] = (44, 48, 52)
    for ty in range(2):
        for tx in range(2):
            img[ty * 64 + 1, tx * 64 + 1:(tx + 1) * 64 - 1] *= 1.18   # bevel light
            img[ty * 64 + 62, tx * 64 + 1:(tx + 1) * 64 - 1] *= 0.75
            img[ty * 64 + 1:(ty + 1) * 64 - 1, tx * 64 + 1] *= 1.12
            img[ty * 64 + 1:(ty + 1) * 64 - 1, tx * 64 + 62] *= 0.8
            # suction-cup lift marks
            for cx in (tx * 64 + 10, tx * 64 + 54):
                img = speckle(img, r, 3, (120, 120, 124), 0.6)
    for g in (0, 63, 64, 127):
        img[:, g] = (30, 32, 34)
        img[g, :] = (30, 32, 34)
    return img


def tex_server_wall(seed):
    """White-grey steel wall panels with seams, rivets and a cable-guide strip."""
    r = rng(seed)
    w = h = 128
    img = canvas(w, h, (178, 184, 188))
    img = shade(img, fbm(r, w, h, (32, 16, 8)) * 0.05 + r.uniform(-1, 1, (h, w)) * 0.015)
    for x in (0, 64):
        img[:, x] = (96, 100, 104)
        img[:, x + 1] = (214, 218, 222)
    for x in (0, 64):
        for y in range(6, 128, 30):
            for dx in (4, 60):
                img[y:y + 2, x + dx:x + dx + 2] = (110, 114, 118)
    img[100:104, :] = (120, 124, 128)
    img[101, :] = (150, 154, 158)
    for _ in range(4):
        img = stain(img, r, r.integers(0, w), r.integers(0, h), r.uniform(5, 10), (120, 110, 90), 0.2)
    return img


def tex_bricks(seed, mortar, brick_cols, bw=16, bh=8, grime=(40, 55, 35), streaks=10):
    r = rng(seed)
    w = h = 128
    img = canvas(w, h, mortar)
    for row in range(h // bh):
        off = (bw // 2) * (row % 2)
        for col in range(-1, w // bw + 1):
            x0 = col * bw + off + 1
            y0 = row * bh + 1
            c = np.array(brick_cols[r.integers(0, len(brick_cols))], dtype=float) * r.uniform(0.85, 1.1)
            xs = [x % w for x in range(x0, x0 + bw - 1)]
            for x in xs:
                img[y0:y0 + bh - 1, x] = c
    img = shade(img, fbm(r, w, h, (16, 8, 4, 2)) * 0.12 + r.uniform(-1, 1, (h, w)) * 0.05)
    # wet grime + drip streaks running down (tileable vertically)
    g = np.clip(fbm(r, w, h, (32, 16, 8)) * 1.4 + 0.1, 0, 1)[:, :, None] * 0.45
    img = img * (1 - g) + np.array(grime) * g
    for _ in range(streaks):
        x = r.integers(0, w)
        wdt = r.integers(1, 3)
        a = r.uniform(0.2, 0.45)
        img[:, x:x + wdt] = img[:, x:x + wdt] * (1 - a) + np.array(grime) * 0.6 * a
    return img


def tex_wet_concrete(seed):
    r = rng(seed)
    w = h = 128
    img = canvas(w, h, (88, 90, 82))
    img = shade(img, fbm(r, w, h, (32, 16, 8, 4)) * 0.18 + r.uniform(-1, 1, (h, w)) * 0.06)
    puddle = fbm(r, w, h, (64, 32, 16)) > 0.22
    img[puddle] = img[puddle] * 0.55 + np.array([40, 58, 52]) * 0.45
    edge = np.zeros_like(puddle)
    edge[1:, :] |= puddle[1:, :] ^ puddle[:-1, :]
    edge[:, 1:] |= puddle[:, 1:] ^ puddle[:, :-1]
    img[edge] = img[edge] * 0.7 + np.array([150, 160, 150]) * 0.3
    img = speckle(img, r, 160, (60, 62, 56), 0.7)
    # drainage channel line
    img[60:68, :] *= 0.72
    img[60, :] *= 0.8
    img[67, :] = img[67, :] * 0.8 + np.array([70, 90, 60]) * 0.2
    return img


def tex_vct_floor(seed):
    """Hospital vinyl composition tiles: 4x4 tiles per 128, off-white speckled, a few grey ones."""
    r = rng(seed)
    w = h = 128
    img = canvas(w, h, (206, 204, 194))
    for ty in range(4):
        for tx in range(4):
            c = np.array((206, 204, 194)) if r.random() > 0.2 else np.array((170, 176, 172))
            img[ty * 32:(ty + 1) * 32, tx * 32:(tx + 1) * 32] = c * r.uniform(0.95, 1.03)
    img = shade(img, fbm(r, w, h, (16, 8, 4)) * 0.05)
    img = speckle(img, r, 900, (140, 140, 132), 0.55)
    img = speckle(img, r, 250, (100, 110, 108), 0.6)
    for g in range(0, 128, 32):
        img[:, g] = img[:, g] * 0.78
        img[g, :] = img[g, :] * 0.78
    # gurney wheel scuffs
    for _ in range(3):
        y = r.integers(0, h)
        x = r.integers(0, w)
        for i in range(r.integers(10, 30)):
            img[(y + i // 6) % h, (x + i) % w] *= 0.7
    img = stain(img, r, r.integers(0, w), r.integers(0, h), r.uniform(6, 10), (120, 40, 30), 0.35)
    return img


def tex_wall_tiles(seed, tile, grout, size=8, cracks=6, blood=True):
    r = rng(seed)
    w = h = 128
    img = canvas(w, h, grout)
    for ty in range(h // size):
        for tx in range(w // size):
            c = np.array(tile) * r.uniform(0.94, 1.05)
            img[ty * size + 1:(ty + 1) * size, tx * size + 1:(tx + 1) * size] = c
            img[ty * size + 1, tx * size + 1:(tx + 1) * size] = c * 1.08
    img = shade(img, fbm(r, w, h, (32, 16, 8)) * 0.05)
    for _ in range(cracks):
        x, y = r.integers(0, w), r.integers(0, h)
        for i in range(r.integers(4, 12)):
            x = (x + r.integers(-1, 2)) % w
            y = (y + 1) % h
            img[y, x] *= 0.55
    if blood:
        img = stain(img, r, r.integers(0, w), r.integers(0, h), r.uniform(5, 9), (100, 20, 18), 0.4)
    return img


def tex_fabric(seed, base, size=64):
    r = rng(seed)
    w = h = size
    img = canvas(w, h, base)
    yy, xx = np.mgrid[0:h, 0:w]
    weave = ((xx + yy) % 2) * 0.05 - 0.025
    img = shade(img, weave + r.uniform(-1, 1, (h, w)) * 0.06 + fbm(r, w, h, (16, 8)) * 0.05)
    return img


# ------------------------------------------------------------------------------------ model textures
def tex_crt_screen(seed, fg=(90, 255, 120), bg=(8, 26, 12), lines=True):
    r = rng(seed)
    w, h = 64, 48
    img = canvas(w, h, bg)
    y = 4
    while y < h - 6:
        x = 4
        ln = r.integers(10, 52)
        while x < 4 + ln and x < w - 4:
            wd = r.integers(1, 5)
            img[y:y + 2, x:x + wd] = fg
            x += wd + 1
        y += 4
    img[h - 7:h - 5, 4:7] = fg   # cursor
    if lines:
        img[::2] *= 0.72
    yy, xx = np.mgrid[0:h, 0:w]
    vig = 1 - (((xx - w / 2) / (w / 2)) ** 2 + ((yy - h / 2) / (h / 2)) ** 2) * 0.28
    return img * vig[:, :, None]


def tex_static(seed):
    r = rng(seed)
    w, h = 64, 48
    v = r.uniform(30, 235, (h, w))
    img = np.stack([v * 0.92, v * 0.96, v * 1.0], -1)
    img[::2] *= 0.75
    img[20:24] = img[20:24] * 0.4 + 140
    return img


def tex_ecg(seed):
    w, h = 64, 48
    img = canvas(w, h, (4, 14, 10))
    img[::6] = (10, 34, 24)
    img[:, ::8] = (10, 34, 24)
    base = 22
    pts = []
    for x in range(w):
        p = x % 32
        y = base
        if p == 12: y = base - 3
        elif p == 14: y = base + 2
        elif p == 15: y = base - 14
        elif p == 16: y = base + 6
        elif p in (20, 21, 22): y = base - 2
        pts.append(y)
    for x in range(w - 1):
        a, b = pts[x], pts[x + 1]
        for y in range(min(a, b), max(a, b) + 1):
            img[y, x] = (90, 255, 120)
    img[36:40, 4:18] = (255, 210, 60)   # "72" readout block
    img[36:40, 22:30] = (90, 200, 255)
    return img


def tex_rack_front(seed):
    """Server rack front: dark blade slots with green/amber/blue LEDs (emissive)."""
    r = rng(seed)
    w, h = 64, 128
    img = canvas(w, h, (16, 17, 20))
    for y in range(4, h - 4, 6):
        img[y:y + 5, 3:61] = (30, 32, 36)
        img[y, 3:61] = (46, 48, 54)
        img[y + 2, 6:40] = (22, 23, 26)   # vent slit
        for k in range(r.integers(2, 6)):
            x = 44 + k * 3
            c = [(40, 255, 90), (40, 255, 90), (255, 170, 30), (60, 150, 255)][r.integers(0, 4)]
            if r.random() < 0.8:
                img[y + 2:y + 3, x:x + 2] = c
    return img


def tex_metal(seed, base, noise=0.08, size=32):
    r = rng(seed)
    img = canvas(size, size, base)
    img = shade(img, r.uniform(-1, 1, (size, size)) * noise * 0.4 + fbm(r, size, size, (8, 4, 2)) * noise)
    return img


def tex_rust(seed):
    r = rng(seed)
    w = h = 64
    img = canvas(w, h, (92, 84, 76))
    rust = np.clip(fbm(r, w, h, (16, 8, 4, 2)) * 1.6 + 0.2, 0, 1)[:, :, None]
    img = img * (1 - rust) + np.array((120, 62, 30)) * rust
    img = shade(img, r.uniform(-1, 1, (h, w)) * 0.08)
    img[:, ::16] *= 0.7   # pipe weld seams
    return img


def tex_slime(seed):
    r = rng(seed)
    w = h = 32
    img = canvas(w, h, (80, 150, 40))
    img = shade(img, fbm(r, w, h, (8, 4, 2)) * 0.35)
    return img


def tex_mattress(seed):
    r = rng(seed)
    w = h = 64
    img = canvas(w, h, (208, 212, 206))
    img = shade(img, fbm(r, w, h, (16, 8, 4)) * 0.06)
    for g in range(0, 64, 16):
        img[:, g] *= 0.86
        img[g, :] *= 0.86
    img = stain(img, r, 40, 22, 11, (150, 130, 80), 0.45)
    img = stain(img, r, 18, 44, 6, (110, 24, 20), 0.5)
    return img


def tex_keyboard(seed):
    w, h = 64, 24
    img = canvas(w, h, (178, 170, 150))
    for row in range(4):
        for col in range(14):
            x = 2 + col * 4 + (row % 2)
            img[2 + row * 5:6 + row * 5, x:x + 3] = (206, 200, 184)
            img[5 + row * 5, x:x + 3] = (130, 124, 110)
    img[20:23, 14:44] = (206, 200, 184)
    return img


def tex_label(seed, text_rgb=(30, 30, 30), bg=(220, 214, 196)):
    r = rng(seed)
    w, h = 32, 32
    img = canvas(w, h, bg)
    for y in range(4, 28, 4):
        ln = r.integers(8, 26)
        img[y, 3:3 + ln] = text_rgb
    return img


def tex_bottle_label(seed):
    """'Almond Water' bottle label: pale label band with a blue stripe."""
    w, h = 32, 32
    img = canvas(w, h, (205, 225, 235))
    img[10:22] = (240, 236, 222)
    img[12:14, 2:30] = (70, 110, 170)
    img[16:18, 6:26] = (150, 120, 70)
    img[19, 4:28] = (120, 120, 120)
    return img


MODEL_TEX = {
    "beige_plastic": lambda: tex_metal(11, (196, 186, 160), 0.10),
    "black_plastic": lambda: tex_metal(12, (34, 34, 38), 0.18),
    "dark_metal": lambda: tex_metal(13, (46, 50, 56), 0.2),
    "alu": lambda: tex_metal(14, (176, 180, 184), 0.10),
    "chrome": lambda: tex_metal(15, (200, 206, 212), 0.14),
    "white_metal": lambda: tex_metal(16, (212, 214, 210), 0.08),
    "white_plastic": lambda: tex_metal(17, (228, 228, 222), 0.06),
    "mint_metal": lambda: tex_metal(18, (150, 196, 180), 0.10),
    "laminate": lambda: tex_paint_wall(19, (170, 146, 110), scuffs=10, scuff_rgb=(100, 80, 60), size=64),
    "rubber": lambda: tex_metal(20, (26, 26, 26), 0.2),
    "glass_dark": lambda: tex_metal(21, (40, 60, 66), 0.12),
    "paper": lambda: tex_label(22),
    "keyboard": lambda: tex_keyboard(23),
    "crt_screen": lambda: tex_crt_screen(24),
    "crt_screen_amber": lambda: tex_crt_screen(25, fg=(255, 176, 40), bg=(28, 14, 4)),
    "crt_screen_blue": lambda: tex_crt_screen(26, fg=(220, 230, 255), bg=(10, 30, 140), lines=True),
    "static": lambda: tex_static(27),
    "ecg": lambda: tex_ecg(28),
    "rack_front": lambda: tex_rack_front(29),
    "rust": lambda: tex_rust(30),
    "slime": lambda: tex_slime(31),
    "mattress": lambda: tex_mattress(32),
    "sheet_mint": lambda: tex_fabric(33, (160, 205, 190)),
    "curtain": lambda: tex_fabric(34, (130, 190, 176)),
    "fabric_cubicle": lambda: tex_fabric(35, (92, 104, 124)),
    "fabric_chair": lambda: tex_fabric(36, (60, 62, 70)),
    "wallpaper_yellow": lambda: tex_paint_wall(37, (196, 182, 104), scuffs=4, scuff_rgb=(140, 120, 60)),
    "concrete": lambda: tex_paint_wall(38, (120, 120, 114), scuffs=8, scuff_rgb=(70, 70, 70)),
    "grille": lambda: tex_grille(39),
    "iv_bag": lambda: tex_metal(40, (200, 225, 215), 0.06),
    "label_bottle": lambda: tex_bottle_label(41),
    "led_panel": lambda: tex_led_panel(42),
    "copier_panel": lambda: tex_copier_panel(43),
    "cable": lambda: tex_metal(44, (30, 60, 150), 0.2),
    "blood": lambda: tex_metal(45, (110, 16, 14), 0.3),
    "cardboard": lambda: tex_paint_wall(46, (170, 132, 86), scuffs=6, scuff_rgb=(120, 90, 60), size=32),
}


def tex_grille(seed):
    w = h = 32
    img = canvas(w, h, (60, 64, 68))
    img[::3] = (22, 24, 26)
    img[:, 0] = (90, 94, 98)
    return img


def tex_led_panel(seed):
    """Fluorescent troffer diffuser: bright prismatic panel (emissive)."""
    r = rng(seed)
    w = h = 32
    img = canvas(w, h, (255, 250, 222))
    yy, xx = np.mgrid[0:h, 0:w]
    img = shade(img, ((xx // 2 + yy // 2) % 2) * -0.06)
    img[0], img[-1], img[:, 0], img[:, -1] = (180, 176, 160), (180, 176, 160), (180, 176, 160), (180, 176, 160)
    return img


def tex_copier_panel(seed):
    w, h = 32, 16
    img = canvas(w, h, (70, 72, 76))
    img[3:9, 3:15] = (90, 200, 120)
    for i in range(4):
        img[11:14, 3 + i * 4:6 + i * 4] = (200, 200, 190)
    img[4:7, 20:23] = (40, 220, 60)
    img[4:7, 25:28] = (230, 60, 40)
    return img


# (id, generator, tags)
LEVEL = [
    ("tfg_office_ceiling", lambda: tex_ceiling_tiles(101, (214, 210, 196), (150, 150, 146), stains=2), ["ceiling", "office", "tiles"]),
    ("tfg_office_carpet", lambda: tex_carpet_tiles(102, (86, 92, 104), (130, 136, 150), (56, 60, 70)), ["floor", "office", "carpet"]),
    ("tfg_office_wall", lambda: tex_paint_wall(103, (196, 190, 172), scuffs=8), ["wall", "office", "painted"]),
    ("tfg_cubicle_fabric", lambda: tex_fabric(104, (92, 104, 124)), ["fabric", "office", "cubicle"]),
    ("tfg_server_floor", lambda: tex_raised_floor(105), ["floor", "serverfarm", "raised_floor", "metal"]),
    ("tfg_server_wall", lambda: tex_server_wall(106), ["wall", "serverfarm", "metal", "panel"]),
    ("tfg_sewer_brick", lambda: tex_bricks(107, (50, 46, 40), [(96, 60, 44), (84, 54, 42), (104, 70, 50), (70, 64, 58)]), ["wall", "sewer", "brick", "wet"]),
    ("tfg_sewer_stone", lambda: tex_bricks(108, (40, 42, 40), [(88, 90, 86), (76, 80, 78), (96, 96, 90)], bw=32, bh=16, grime=(34, 50, 32), streaks=6), ["wall", "ceiling", "sewer", "stone"]),
    ("tfg_sewer_floor", lambda: tex_wet_concrete(109), ["floor", "sewer", "concrete", "wet"]),
    ("tfg_hospital_floor", lambda: tex_vct_floor(110), ["floor", "hospital", "vinyl", "tiles"]),
    ("tfg_hospital_wall", lambda: tex_paint_wall(111, (176, 206, 194), scuffs=10, scuff_rgb=(90, 100, 96)), ["wall", "hospital", "painted"]),
    ("tfg_hospital_tiles", lambda: tex_wall_tiles(112, (196, 222, 216), (140, 150, 146)), ["wall", "hospital", "tiles"]),
    ("tfg_hospital_ceiling", lambda: tex_ceiling_tiles(113, (222, 224, 220), (160, 164, 166), stains=1, stain_rgb=(140, 130, 90)), ["ceiling", "hospital", "tiles"]),
    ("tfg_backrooms_wallpaper", lambda: tex_backrooms_wallpaper(114), ["wall", "backrooms", "wallpaper", "yellow"]),
    ("tfg_backrooms_carpet", lambda: tex_carpet_tiles(115, (150, 132, 78), (176, 160, 100), (130, 114, 64), stains=3, stain_rgb=(96, 78, 40)), ["floor", "backrooms", "carpet", "wet"]),
]


def tex_backrooms_wallpaper(seed):
    """Mono-yellow wallpaper: faint vertical stripes with a repeating chevron motif, damp patches."""
    r = rng(seed)
    w = h = 128
    img = canvas(w, h, (198, 184, 106))
    yy, xx = np.mgrid[0:h, 0:w]
    img = shade(img, ((xx % 16) < 2) * -0.07)
    motif = ((abs((xx % 16) - 8) + (yy % 16)) % 16 == 0) & ((xx % 16) > 3) & ((xx % 16) < 13)
    img[motif] *= 0.9
    img = shade(img, fbm(r, w, h, (32, 16, 8)) * 0.06)
    for _ in range(2):
        img = stain(img, r, r.integers(0, w), r.integers(0, h), r.uniform(12, 20), (140, 120, 60), 0.35)
    return img


def cut_atlas():
    """GibbonGL CC0 atlas (256x176): 64 px tiles on row 1 / row 2, 32 px light panels."""
    if not os.path.exists(ATLAS_SRC):
        print("!! atlas missing", ATLAS_SRC)
        return []
    im = Image.open(ATLAS_SRC).convert("RGB")
    cuts = [
        ("gbr_backrooms_carpet", (16, 16, 80, 80), ["floor", "backrooms", "carpet", "yellow"]),
        ("gbr_backrooms_wall", (96, 16, 160, 74), ["wall", "backrooms", "wallpaper", "yellow"]),   # baseboard cut off
        ("gbr_backrooms_wall_base", (96, 16, 160, 80), ["wall", "backrooms", "wallpaper", "baseboard"]),
        ("gbr_backrooms_ceiling", (176, 16, 240, 80), ["ceiling", "backrooms", "tiles"]),
        ("gbr_poolrooms_tile", (16, 96, 80, 160), ["floor", "wall", "poolrooms", "tiles", "white"]),
        ("gbr_poolrooms_tile_color", (96, 96, 160, 160), ["floor", "wall", "poolrooms", "tiles"]),
        ("gbr_backrooms_light", (176, 96, 208, 128), ["light", "backrooms", "emissive", "ceiling"]),
        ("gbr_poolrooms_light", (208, 96, 240, 128), ["light", "poolrooms", "emissive", "ceiling"]),
    ]
    out = []
    os.makedirs(OUT_ATLAS, exist_ok=True)
    for tid, box, tags in cuts:
        t = im.crop(box)
        if t.size[1] != t.size[0]:
            t = t.resize((t.size[0], t.size[0]), Image.NEAREST)   # square it (drops baseboard stripe)
        p = os.path.join(OUT_ATLAS, tid + ".png")
        t.quantize(colors=32, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(p, optimize=True)
        out.append(dict(id=tid, path=os.path.relpath(p, PUB).replace("\\", "/"), pack=GIBBON_PACK, license="CC0",
                        size=list(t.size), tags=tags))
    return out


NB_DIR = os.path.join(ROOT, "tools", "raw", "naivegoblin__cc0-backrooms-asset-pack", "_x")
OUT_NB = os.path.join(PUB, "assets", "ext", "textures", "naivegoblin-backrooms")
NB_PACK = "Backrooms Asset Pack"


def extract_nb_images():
    """Pull the embedded colour maps out of the pack's single 103 MB GLB (no Blender needed)."""
    import io
    import struct
    src = os.path.join(os.path.dirname(NB_DIR), "Backrooms Asset Pack.glb")
    if not os.path.exists(src):
        return
    data = open(src, "rb").read()
    off, js, binc = 12, None, None
    while off < len(data):
        clen, ctype = struct.unpack_from("<II", data, off)
        chunk = data[off + 8:off + 8 + clen]
        if ctype == 0x4E4F534A:
            js = json.loads(chunk)
        else:
            binc = chunk
        off += 8 + clen
    os.makedirs(NB_DIR, exist_ok=True)
    for im in js.get("images", []):
        if not any(k in im["name"] for k in ("Color", "Loopable")):
            continue
        bv = js["bufferViews"][im["bufferView"]]
        b = binc[bv.get("byteOffset", 0):bv.get("byteOffset", 0) + bv["byteLength"]]
        Image.open(io.BytesIO(b)).convert("RGB").save(os.path.join(NB_DIR, im["name"].replace(" ", "_") + ".png"))


def cut_naivegoblin():
    """NaiveGoblin Backrooms pack (CC-BY 4.0): colour maps from the GLB -> 128 px PSX palette textures.
    (The 104 MB GLB is not kept; _x holds 512 px copies of the colour maps, enough to rebuild the outputs.)"""
    if not os.path.isdir(NB_DIR):
        extract_nb_images()
    items = [
        ("nb_backrooms_wallpaper", "Backroom_Wallpaper_Texture_-_Yellowed_Loopable.png", 2, ["wall", "backrooms", "wallpaper", "yellow"]),
        ("nb_backrooms_carpet", "Carpet016_2K-PNG_Color_Yellowed.png", 1, ["floor", "backrooms", "carpet", "yellow"]),
        ("nb_office_ceiling", "OfficeCeiling003_2K-PNG_Color.png", 1, ["ceiling", "backrooms", "office", "tiles", "light"]),
    ]
    out = []
    os.makedirs(OUT_NB, exist_ok=True)
    for tid, fn, vtile, tags in items:
        src = os.path.join(NB_DIR, fn)
        if not os.path.exists(src):
            print("!! missing", src)
            continue
        im = Image.open(src).convert("RGB")
        if vtile > 1:   # loopable strip -> stack it so the tile is ~square before downscaling
            w, h = im.size
            big = Image.new("RGB", (w, h * vtile))
            for k in range(vtile):
                big.paste(im, (0, h * k))
            im = big
        im = im.resize((128, 128), Image.LANCZOS)
        p = os.path.join(OUT_NB, tid + ".png")
        im.quantize(colors=48, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(p, optimize=True)
        out.append(dict(id=tid, path=os.path.relpath(p, PUB).replace("\\", "/"), pack=NB_PACK,
                        license="CC-BY 4.0", credit="Backrooms Asset Pack by NaiveGoblin (CC-BY 4.0)",
                        size=[128, 128], tags=tags))
    return out


def main():
    entries = []
    for tid, fn, tags in LEVEL:
        p = os.path.join(OUT_LVL, tid + ".png")
        size = save(fn(), p)
        entries.append(dict(id=tid, path=os.path.relpath(p, PUB).replace("\\", "/"), pack=CUSTOM_PACK,
                            license="CC0", size=list(size), tags=tags + ["tfg"]))
    entries += cut_atlas()
    entries += cut_naivegoblin()
    os.makedirs(OUT_MODEL, exist_ok=True)
    for name, fn in MODEL_TEX.items():
        save(fn(), os.path.join(OUT_MODEL, name + ".png"), colors=32)
    json.dump(entries, open(FRAG, "w", encoding="utf-8"), indent=1)
    print(f"level textures: {len(entries)}, model textures: {len(MODEL_TEX)}")


if __name__ == "__main__":
    main()
