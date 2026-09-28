#!/usr/bin/env python3
"""
Texture pipeline: raw pack PNGs -> public/assets/ext/textures/<pack>/<id>.png
  * nearest-neighbour downscale to <= MAX (128 default, 256 for native pixel-art packs)
  * 8-bit palette (PSX-style CLUT, no dithering) + optimized PNG
  * writes tools/assets/_frag_textures.json (merged into manifest.json by manifest.py)

Usage: python textures.py
"""
import json
import os
import re
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from packs import PACKS  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
RAW = os.path.join(ROOT, "tools", "raw")
OUT = os.path.join(ROOT, "public", "assets", "ext", "textures")
FRAG = os.path.join(os.path.dirname(__file__), "_frag_textures.json")

# category-folder -> tags
CAT_TAGS = {
    "bricks": ["brick", "wall"], "brick": ["brick", "wall"], "grass": ["grass", "ground", "outdoor"],
    "roofs": ["roof"], "tile": ["tile", "floor"], "wood": ["wood"], "dirt": ["dirt", "ground", "outdoor"],
    "metal": ["metal"], "plaster": ["plaster", "wall"], "stone": ["stone", "rock"],
    "animal": ["fur", "skin", "organic"], "box": ["cardboard", "box", "crate"], "cloth": ["fabric", "cloth"],
    "grating": ["grating", "metal", "floor", "industrial"], "terrain": ["terrain", "ground", "outdoor"],
    "floor": ["floor"], "misc": ["misc"], "stains": ["stain", "decal", "alpha"], "wall": ["wall"],
    "checker tiles": ["tile", "floor", "checker"], "diamond tiles": ["tile", "floor"],
    "rectangle tiles": ["tile", "floor"],
    # flakdeau
    "concrete": ["concrete", "wall"], "painted wall": ["wall", "painted"], "doors": ["door"],
    "door wood 01": ["door", "wood"], "windows": ["window"], "window 01": ["window"], "window 02": ["window"],
    "window 03": ["window"], "gravel": ["gravel", "ground", "outdoor"], "rockface": ["rock", "cliff", "outdoor"],
    "sandstone": ["rock", "sand", "cliff"], "sand": ["sand", "ground", "outdoor"], "snow": ["snow", "ground", "outdoor"],
    "debris": ["debris", "junk", "ground"], "stones": ["stone", "rock", "ground"], "pebbles": ["pebbles", "ground"],
    "water": ["water"], "tiles small": ["tile", "floor"], "tiles rectangle": ["tile", "floor", "wall"],
    "tiles rotated": ["tile", "floor"], "tiles pattern": ["tile", "floor"], "cobble stone": ["cobblestone", "floor", "outdoor"],
    "foliage": ["foliage", "leaves", "alpha"], "elements": [],
}
WORD_TAGS = {
    "rust": ["rust"], "blue": ["blue"], "green": ["green"], "grey": ["grey"], "gray": ["grey"], "orange": ["orange"],
    "yellow": ["yellow"], "red": ["red"], "white": ["white"], "black": ["black"], "brown": ["brown"],
    "hazard": ["hazard"], "corrugated": ["corrugated", "metal"], "rebar": ["rebar", "concrete"],
    "graffiti": ["graffiti", "decal"], "panel": ["panel"], "pipe": ["pipe"], "girders": ["girder"],
    "sheet": ["sheet"], "wallpaper": ["wallpaper", "wall"], "stucco": ["stucco", "wall"], "damaged": ["damaged"],
    "boulder": ["rock"], "skulls": ["bones", "horror"], "trash": ["trash", "junk"], "coins": ["coins"],
    "studded": ["studded", "floor"], "brushed": ["brushed"], "diagonal": ["diamond_plate"],
}
# per-pack specific tag overrides by (category, number)
ELEMENTS_TTP2 = {1: "lava", 2: "lava", 3: "lava", 4: "lava", 5: "lava", 6: "lava", 7: "snow", 8: "snow",
                 9: "ice", 10: "ice", 11: "snow", 12: "snow", 13: "slime", 14: "slime", 15: "ice", 16: "ice",
                 17: "water", 18: "water", 19: "water", 20: "water"}
ELEMENTS_TTP3 = {1: "sky", 2: "sky", 3: "sky", 4: "sky", 5: "sky", 6: "sky", 7: "storm_sky", 8: "storm_sky",
                 9: "fire", 10: "fire", 11: "fire", 12: "fire", 13: "toxic_gas", 14: "toxic_gas", 15: "fog",
                 16: "fog", 17: "void", 18: "void", 19: "void", 20: "void", 21: "lightning_sky",
                 22: "lightning_sky", 23: "night_sky", 24: "night_sky"}
RUSTY_HORROR_METAL = {1, 2, 3, 4, 6, 9, 10, 13, 14}

# pack key -> (list of sub-folders relative to the extraction root to include, id prefix, max size)
JOBS = [
    ("sbs_tiny1", "SBS - Tiny Texture Pack - 128x128/128x128", None, "t1", 128),
    ("sbs_tiny2", "SBS - Tiny Texture Pack 2 - 128x128/128x128", None, "t2", 128),
    ("sbs_tiny3", "SBS - Tiny Texture Pack 3 - Small/128x128",
     ["Animal", "Box", "Cloth", "Elements", "Grating", "Metal", "Stone", "Terrain"], "t3", 128),
    ("sbs_horror", "SBS - Horror Texture Pack 128x128/128x128", None, "hr", 128),
    ("sbs_mini1", "SBS - Mini Texture Pack 1 - Floor Tiles 128x128/128x128", None, "mf", 128),
    ("flakdeau_px", "PNG - Pixel Art Textures/PNGs",
     ["Metal", "Concrete", "Painted Wall", "Wall", "Doors", "Windows", "Dirt", "Grass", "Gravel", "Rockface",
      "Sand", "Snow", "Debris", "Stones", "Pebbles", "Water", "Tiles/Tiles Small", "Tiles/Tiles Rectangle",
      "Cobble Stone", "Foliage", "Plaster Wall"], "px", 256),
]


def snake(s):
    s = re.sub(r"[-_ ]?\d+x\d+$", "", s)
    s = re.sub(r"[^A-Za-z0-9]+", "_", s).strip("_").lower()
    s = re.sub(r"_+", "_", s)
    return s


def convert(src, dst, max_size):
    im = Image.open(src)
    has_alpha = im.mode in ("RGBA", "LA", "P") and "A" in im.convert("RGBA").getbands()
    im = im.convert("RGBA")
    if has_alpha:
        a = im.getchannel("A")
        has_alpha = a.getextrema()[0] < 250
    w, h = im.size
    if max(w, h) > max_size:
        f = max_size / max(w, h)
        im = im.resize((max(1, int(w * f)), max(1, int(h * f))), Image.NEAREST)
    if has_alpha:
        q = im.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
    else:
        q = im.convert("RGB").quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    q.save(dst, optimize=True)
    return im.size, has_alpha


def tags_for(pack, cat_path, stem):
    tags = []
    parts = [p.lower() for p in cat_path.replace("\\", "/").split("/") if p]
    for p in parts:
        tags += CAT_TAGS.get(p, [p.replace(" ", "_")])
    words = re.split(r"[_\- ]+", stem.lower())
    for w in words:
        tags += WORD_TAGS.get(w, [])
    m = re.search(r"(\d+)$", re.sub(r"[-_]?\d+x\d+$", "", stem))
    num = int(m.group(1)) if m else None
    cat = parts[-1] if parts else ""
    if cat == "elements" and num:
        el = (ELEMENTS_TTP2 if pack == "sbs_tiny2" else ELEMENTS_TTP3).get(num)
        if el:
            tags.append(el)
            if el in ("snow", "ice"):
                tags += ["ground", "outdoor"]
            if el.endswith("sky") or el in ("sky", "fog"):
                tags.append("skybox")
    if pack == "sbs_horror":
        tags.append("horror")
        if cat == "metal" and num in RUSTY_HORROR_METAL:
            tags.append("rust")
    if pack == "flakdeau_px":
        tags.append("pixel_art")
        if cat == "metal" and ("04" in words or "07" in words or "05" in words):
            tags += ["panel", "scifi"]
    if cat in ("metal", "grating"):
        tags.append("industrial")
    out = []
    for t in tags:
        if t and t not in out:
            out.append(t)
    return out


def main():
    entries = []
    ids = set()
    for pack, sub, cats, prefix, max_size in JOBS:
        meta = PACKS[pack]
        base = os.path.join(RAW, meta["raw"], "_x", sub)
        if not os.path.isdir(base):
            print("!! missing", base)
            continue
        folders = cats if cats else sorted(d for d in os.listdir(base) if os.path.isdir(os.path.join(base, d)))
        n = 0
        for cat in folders:
            cdir = os.path.join(base, cat)
            for dp, dn, fn in os.walk(cdir):
                for f in sorted(fn):
                    if not f.lower().endswith(".png"):
                        continue
                    stem = os.path.splitext(f)[0]
                    rel_cat = os.path.relpath(dp, base)
                    sid = snake(stem)
                    sid = re.sub(r"^horror_", "", sid)
                    tid = f"{prefix}_{sid}"
                    k = 2
                    while tid in ids:
                        tid = f"{prefix}_{sid}_{k}"
                        k += 1
                    ids.add(tid)
                    dst_rel = f"assets/ext/textures/{meta['slug']}/{tid}.png"
                    size, alpha = convert(os.path.join(dp, f), os.path.join(ROOT, "public", *dst_rel.split("/")), max_size)
                    tags = tags_for(pack, rel_cat, stem)
                    if alpha and "alpha" not in tags:
                        tags.append("alpha")
                    entries.append(dict(id=tid, path=dst_rel, pack=meta["name"], license=meta["license"],
                                        size=list(size), tags=tags))
                    n += 1
        print(f"{pack}: {n} textures")
    json.dump(entries, open(FRAG, "w", encoding="utf-8"), indent=1)
    total = sum(os.path.getsize(os.path.join(ROOT, "public", *e["path"].split("/"))) for e in entries)
    print(f"total {len(entries)} textures, {total/1e6:.1f} MB")


if __name__ == "__main__":
    main()
