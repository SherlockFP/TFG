#!/usr/bin/env python3
"""
Round-2 model pipeline (new interior themes: office / backrooms / serverfarm / sewer / hospital + outdoor extras).

  1. custom props authored in Blender by tools/blender/tfg_props.py  -> models/tfg-custom/*.glb
  2. downloaded CC0 packs converted by blender_convert.py (same PSX processing as models.py):
       Kenney Furniture Kit (Eclair GLB repack), GGBot PSX cars, Tiltamoose PSX boxes, KayKit Halloween Bits
  3. writes tools/assets/_frag_models_tfg.json and _frag_models_r2.json (merged by manifest.py)

Usage: python models_r2.py [custom|packs]      (default: both)
Needs tools/raw/tfg_model_tex (python tfg_textures.py) and the raw packs (see download_all.sh, group r2).
"""
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, HERE)
from packs import PACKS  # noqa: E402

RAW = os.path.join(ROOT, "tools", "raw")
OUTROOT = os.path.join(ROOT, "public", "assets", "ext", "models")
BLENDER = r"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe"
TMP = os.path.join(RAW, "_blender_jobs")
FRAG_TFG = os.path.join(HERE, "_frag_models_tfg.json")
FRAG_R2 = os.path.join(HERE, "_frag_models_r2.json")

KF = "_x/models_glb"
HB = "_x/KayKit_HalloweenBits_1.0_FREE/Assets/gltf"
HB_TEX = HB + "/halloweenbits_texture.png"
BX = "_x/psx_boxes/source"
BXT = "_x/psx_boxes/textures/"

# Kenney desk-top items read too big at the kit-wide x2 scale
KF_SCALE = {"computer_screen": "s=1.3", "laptop": "s=1.25", "computer_mouse": "s=1.3", "radio": "s=1.0"}

# (id, pack, file (relative to pack raw dir), category, sizing, tags, extra)
M = [
    # ---------------------------------------------------------------- Kenney furniture (flat colour, s=2 -> metres)
    *[(f"kf_{i}", "kenney_furniture", f"{KF}/{f}.glb", cat, KF_SCALE.get(i, "s=2.0"), tags, {}) for i, f, cat, tags in [
        ("office_chair", "chairDesk", "furniture", ["office", "chair"]),
        ("desk_corner", "deskCorner", "furniture", ["office", "desk"]),
        ("desk", "desk", "furniture", ["office", "desk"]),
        ("computer_screen", "computerScreen", "machinery", ["office", "computer", "monitor"]),
        ("laptop", "laptop", "scrap", ["office", "laptop", "computer"]),
        ("computer_mouse", "computerMouse", "scrap", ["office", "mouse", "computer"]),
        ("bookcase_doors", "bookcaseClosedDoors", "furniture", ["office", "bookcase", "cabinet"]),
        ("coat_rack", "coatRackStanding", "furniture", ["office", "coat_rack"]),
        ("trashcan", "trashcan", "prop", ["office", "trash", "bin"]),
        ("potted_plant", "pottedPlant", "prop", ["office", "plant"]),
        ("plant_small", "plantSmall1", "prop", ["office", "plant"]),
        ("coffee_machine", "kitchenCoffeeMachine", "machinery", ["office", "breakroom", "coffee"]),
        ("microwave", "kitchenMicrowave", "machinery", ["office", "breakroom", "microwave"]),
        ("fridge_large", "kitchenFridgeLarge", "furniture", ["office", "breakroom", "fridge"]),
        ("tv_vintage", "televisionVintage", "machinery", ["tv", "crt", "retro"]),
        ("radio", "radio", "scrap", ["radio", "retro"]),
        ("speaker", "speaker", "machinery", ["speaker", "audio"]),
        ("washer", "washer", "machinery", ["laundry", "washer", "hospital"]),
        ("bathroom_sink", "bathroomSink", "furniture", ["bathroom", "sink", "hospital"]),
        ("toilet", "toilet", "furniture", ["bathroom", "toilet"]),
        ("mirror", "bathroomMirror", "furniture", ["bathroom", "mirror", "wall"]),
        ("sofa", "loungeSofa", "furniture", ["office", "lobby", "sofa"]),
        ("lounge_chair", "loungeChair", "furniture", ["office", "lobby", "chair"]),
        ("coffee_table", "tableCoffee", "furniture", ["office", "lobby", "table"]),
        ("ceiling_fan", "ceilingFan", "prop", ["ceiling", "fan"]),
        ("floor_lamp", "lampSquareFloor", "furniture", ["lamp", "light"]),
        ("side_drawers", "sideTableDrawers", "furniture", ["cabinet", "drawers", "hospital"]),
        ("box_closed", "cardboardBoxClosed", "prop", ["box", "cardboard", "office"]),
        ("box_open", "cardboardBoxOpen", "prop", ["box", "cardboard", "office"]),
        ("bench_cushion", "benchCushion", "furniture", ["bench", "waiting_room", "hospital"]),
    ]],
    # ---------------------------------------------------------------- GGBot PSX cars (textured OBJ, ~4.3 m long)
    *[(f"car_{i}", "ggbot_cars", f"_x/{d}/{f}", "vehicle", "d=4.4", ["car", "vehicle", "outdoor", "wreck"] + t, x)
      for i, d, f, t, x in [
          ("sedan", "Car 01", "Car.obj", [], {}),
          ("sedan_snow", "Car 01", "Car.obj", ["snow"], {"texture": "_x/Car 01/car_snowcovered.png"}),
          ("hatch", "Car 02", "Car2.obj", [], {}),
          ("coupe", "Car 03", "Car3.obj", [], {}),
          ("van", "Car 04", "Car4.obj", [], {}),
          ("wagon", "Car 05", "Car5.obj", [], {}),
          ("police", "Car 05", "Car5_Police.obj", ["police"], {}),
          ("taxi", "Car 05", "Car5_Taxi.obj", ["taxi"], {}),
          ("pickup", "Car 06", "Car6.obj", [], {}),
          ("compact", "Car 07", "Car7.obj", [], {}),
      ]],
    # ---------------------------------------------------------------- Tiltamoose PSX boxes (FBX + separate textures)
    *[(f"tb_{i}", "tilt_boxes", f"{BX}/{f}", cat, size, tags, {"texture": BXT + tex}) for i, f, tex, cat, size, tags in [
        ("box_large", "box_large_00.fbx", "box_large_00.png", "prop", "h=0.6", ["box", "cardboard", "psx"]),
        ("box_small", "box_small_00.fbx", "box_small_00.png", "prop", "h=0.3", ["box", "cardboard", "psx"]),
        ("box_wrapped", "box_wrapped_00.fbx", "box_wrapped_00.png", "prop", "h=0.45", ["box", "package", "psx"]),
        ("box_ammo", "box_ammo_00.fbx", "box_ammo_00.png", "prop", "h=0.3", ["box", "ammo", "military", "psx"]),
        ("crate", "crate_00.fbx", "crate_00.png", "prop", "h=0.8", ["crate", "wood", "psx"]),
        ("crate_b", "crate_01.fbx", "crate_00.png", "prop", "h=0.8", ["crate", "wood", "psx"]),
        ("milk_crate", "crate_milk_00.fbx", "crate_milk_00.png", "prop", "h=0.3", ["crate", "plastic", "psx"]),
        ("locker", "locker_00.FBX", "locker_00.PNG", "furniture", "h=1.9", ["locker", "metal", "psx"]),
        ("container", "shiping_container_00.fbx", "shipping_container_00.png", "structure", "h=2.6", ["container", "shipping", "outdoor", "psx"]),
    ]],
    # ---------------------------------------------------------------- KayKit Halloween (graveyard moon dressing)
    *[(f"hb_{i}", "kk_halloween", f"{HB}/{f}.gltf", cat, size, tags + ["graveyard", "outdoor", "spooky"], {})
      for i, f, cat, size, tags in [
          ("gravestone", "gravestone", "prop", "h=1.1", ["grave"]),
          ("gravemarker_a", "gravemarker_A", "prop", "h=1.0", ["grave", "cross"]),
          ("gravemarker_b", "gravemarker_B", "prop", "h=0.9", ["grave"]),
          ("grave_a", "grave_A", "prop", "h=1.1", ["grave"]),
          ("grave_destroyed", "grave_A_destroyed", "prop", "h=1.1", ["grave", "open"]),
          ("coffin", "coffin", "prop", "d=2.0", ["coffin"]),
          ("coffin_decorated", "coffin_decorated", "prop", "d=2.0", ["coffin"]),
          ("crypt", "crypt", "structure", "h=3.6", ["crypt", "building", "landmark"]),
          ("arch_gate", "arch_gate", "structure", "h=3.2", ["gate", "arch", "landmark"]),
          ("fence", "fence", "structure", "d=2.0", ["fence"]),
          ("fence_broken", "fence_broken", "structure", "d=2.0", ["fence", "broken"]),
          ("fence_pillar", "fence_pillar", "structure", "h=1.4", ["fence", "pillar"]),
          ("lantern_standing", "lantern_standing", "prop", "h=1.7", ["lantern", "light"]),
          ("post_lantern", "post_lantern", "prop", "h=2.4", ["lantern", "light", "post"]),
          ("post_skull", "post_skull", "prop", "h=2.0", ["post", "skull"]),
          ("shrine_candles", "shrine_candles", "prop", "h=1.6", ["shrine", "candles", "landmark"]),
          ("bench", "bench_decorated", "furniture", "d=1.6", ["bench"]),
          ("pillar", "pillar", "structure", "h=2.4", ["pillar"]),
          ("tree_dead_large", "tree_dead_large", "nature", "h=6.0", ["tree", "dead"]),
          ("tree_dead_medium", "tree_dead_medium", "nature", "h=4.5", ["tree", "dead"]),
          ("skull", "skull", "scrap", "d=0.24", ["skull", "bones"]),
          ("skull_candle", "skull_candle", "scrap", "h=0.35", ["skull", "candle"]),
          ("ribcage", "ribcage", "prop", "d=0.7", ["bones", "ribcage"]),
          ("bone", "bone_A", "scrap", "d=0.4", ["bones"]),
          ("candle_triple", "candle_triple", "scrap", "h=0.35", ["candle"]),
      ]],
]


def ensure_extracted(pack):
    """Flat-extract the pack's zip(s) into <raw>/_x (media only; never anything executable)."""
    import glob
    import zipfile
    base = os.path.join(RAW, PACKS[pack]["raw"])
    out = os.path.join(base, "_x")
    if os.path.isdir(out):
        return
    for z in glob.glob(os.path.join(base, "*.zip")):
        with zipfile.ZipFile(z) as zf:
            names = [n for n in zf.namelist() if not n.lower().endswith((".exe", ".bat", ".cmd", ".ps1", ".sh", ".dll", ".js", ".py"))
                     and not n.startswith("/") and ".." not in n.split("/")]
            zf.extractall(out, names)


def sizing(spec):
    if not spec:
        return {}
    k, v = spec.split("=")
    return {"h": {"height": float(v)}, "d": {"max_dim": float(v)}, "s": {"scale": float(v)}}[k]


def run_custom():
    out_dir = os.path.join(OUTROOT, PACKS["tfg_custom"]["slug"])
    res = os.path.join(TMP, "tfg_res.json")
    os.makedirs(TMP, exist_ok=True)
    r = subprocess.run([BLENDER, "-b", "--factory-startup", "--python", os.path.join(ROOT, "tools", "blender", "tfg_props.py"),
                        "--", out_dir, os.path.join(RAW, "tfg_model_tex"), res],
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    open(os.path.join(TMP, "log_tfg.txt"), "w", encoding="utf-8").write(r.stdout + "\n" + r.stderr)
    p = PACKS["tfg_custom"]
    entries = []
    for e in json.load(open(res, encoding="utf-8")):
        if "error" in e:
            print("!! ERROR", e["id"], e["error"])
            continue
        rel = os.path.relpath(e["out"], os.path.join(ROOT, "public")).replace("\\", "/")
        entries.append(dict(id=e["id"], path=rel, category=e["category"], pack=p["name"], license=p["license"],
                            tris=e["tris"], size=e["size"], animations=[], tags=e["tags"] + ["tfg", "psx"]))
    json.dump(entries, open(FRAG_TFG, "w", encoding="utf-8"), indent=1)
    print(f"custom models: {len(entries)}")


def run_packs():
    jobs, meta = [], {}
    for pack in {m[1] for m in M}:
        ensure_extracted(pack)
    for mid, pack, f, cat, size, tags, extra in M:
        p = PACKS[pack]
        base = os.path.join(RAW, p["raw"])
        src = os.path.join(base, *f.split("/"))
        if not os.path.exists(src):
            print("!! missing", src)
            continue
        j = dict(id=mid, src=src, out=os.path.join(OUTROOT, p["slug"], mid + ".glb"), max_tris=3000, tex_max=128)
        j.update(sizing(size))
        for k, v in extra.items():
            j[k] = os.path.join(base, *v.split("/")) if k == "texture" else v
            if k == "texture":
                j["force_texture"] = True
        jobs.append(j)
        meta[mid] = (pack, cat, tags)
    os.makedirs(TMP, exist_ok=True)
    results = []
    for i in range(0, len(jobs), 25):
        chunk = jobs[i:i + 25]
        jf, rf = os.path.join(TMP, f"r2_jobs_{i}.json"), os.path.join(TMP, f"r2_res_{i}.json")
        json.dump(chunk, open(jf, "w", encoding="utf-8"), indent=1)
        print(f"blender batch {i}..{i + len(chunk) - 1}", flush=True)
        r = subprocess.run([BLENDER, "-b", "--factory-startup", "-P", os.path.join(HERE, "blender_convert.py"), "--", jf, rf],
                           capture_output=True, text=True, encoding="utf-8", errors="replace")
        open(os.path.join(TMP, f"r2_log_{i}.txt"), "w", encoding="utf-8").write(r.stdout + "\n" + r.stderr)
        if os.path.exists(rf):
            results += json.load(open(rf, encoding="utf-8"))
        else:
            print("!! batch failed", i)
    entries = []
    for r in results:
        if "error" in r:
            print("!! ERROR", r.get("job"), r["error"])
            continue
        pack, cat, tags = meta[r["job"]]
        p = PACKS[pack]
        rel = os.path.relpath(r["out"], os.path.join(ROOT, "public")).replace("\\", "/")
        e = dict(id=r["job"], path=rel, category=cat, pack=p["name"], license=p["license"], tris=r["tris"],
                 size=r["size"], animations=r["animations"], tags=tags)
        if p.get("credit"):
            e["credit"] = p["credit"]
        entries.append(e)
    json.dump(entries, open(FRAG_R2, "w", encoding="utf-8"), indent=1)
    print(f"pack models: {len(entries)} / {len(jobs)}")


if __name__ == "__main__":
    what = sys.argv[1] if len(sys.argv) > 1 else "all"
    if what in ("all", "custom"):
        run_custom()
    if what in ("all", "packs"):
        run_packs()
