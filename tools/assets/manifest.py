#!/usr/bin/env python3
"""
Merge the per-pipeline fragments (_frag_textures/_frag_sounds/_frag_models.json) into
public/assets/ext/manifest.json and regenerate CREDITS.md from packs.py.

Usage: python manifest.py
"""
import datetime
import glob
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, HERE)
from packs import PACKS  # noqa: E402

OUT = os.path.join(ROOT, "public", "assets", "ext", "manifest.json")
CREDITS = os.path.join(ROOT, "CREDITS.md")

# Hand-picked "best fit" ids for common game needs (checked visually / by name).
FEATURED = {
    "textures": {
        "facility_wall": "px_concrete_02_grey_horlines_1", "facility_wall_grimy": "hr_wall_09",
        "facility_wall_corrugated": "hr_metal_05", "facility_floor": "hr_floor_12",
        "facility_floor_metal": "hr_floor_09", "catwalk_grating": "t3_grating_11",
        "ship_wall": "px_metal_04_blue_09", "ship_wall_dark": "px_metal_07_blue_1",
        "ship_floor": "px_metal_06_studs_1", "metal_door": "px_metal_07_blue_2",
        "hazard_stripes": "px_metal_04_blue_16", "rusty_metal": "hr_metal_07", "crate_cardboard": "t3_box_01",
        "grass": "t1_grass_05", "grass_pixel": "px_grass_02_green_1", "rock": "t2_stone_13",
        "rock_pixel": "px_rock_grey_01", "snow": "px_snow_02_white_1", "snow_soft": "t2_elements_11",
        "dirt": "t2_dirt_03", "red_desert": "t3_terrain_05", "mud_swamp": "t3_terrain_13",
        "chainlink_fence": "hr_misc_07", "blood_decal": "hr_stain_01", "wood_planks": "t1_wood_13",
        "sky_storm": "t3_elements_07", "sky_night": "t3_elements_23",
    },
    "sounds": {
        "footstep_concrete": "step_concrete_1", "footstep_metal": "step_metal_1", "footstep_wood": "step_wood_1",
        "footstep_gravel": "step_gravel_1", "footstep_grass": "step_leaves_1", "footstep_snow": "step_snow_1",
        "footstep_mud": "step_mud_1", "footstep_carpet": "step_carpet_1", "footstep_monster": "step_heavy_1",
        "door_creak": "door_creak_1", "door_creak_long": "door_creak_3", "metal_hit": "impact_metal_1",
        "monster_growl": "mon_growl_1", "monster_growl_deep": "mon_deep_growl", "monster_roar": "mon_roar_1",
        "monster_scream": "mon_scream", "jumpscare": "jumpscare_1", "stinger": "sting_violin",
        "amb_facility": "amb_facility_hallway", "amb_facility_alt": "amb_facility_research",
        "amb_drone": "amb_drone_1", "amb_ship_interior": "scifi_ship_hum", "amb_machinery": "scifi_big_fan",
        "amb_generator": "scifi_generator", "amb_outdoor_wind": "amb_wind_1", "amb_rain": "amb_rain_porch_1",
        "amb_alien_moon": "scifi_strange_planet", "alarm": "scifi_alarm", "siren": "siren",
        "power_off": "power_off", "electric_zap": "electric_1", "radio_static": "radio_static_1",
        "ui_confirm": "ui_confirm_1", "ui_back": "ui_back_1", "ui_error": "ui_error_1", "ui_hover": "ui_cursor_1",
        "pickup": "pickup_1", "explosion": "explosion_1", "shotgun": "gun_shot", "swing": "swoosh_1",
        "quota_met": "jingle_success_1", "fired": "jingle_fail_1",
    },
    "models": {
        "monster_spider": "mon_spider", "monster_slime": "mon_slime", "monster_rat": "mon_rat",
        "monster_skeleton": "mon_skeleton", "monster_robot": "mon_robot", "monster_bat": "mon_bat",
        "fish": "fish_1", "shark": "fish_shark", "barrel": "psx_barrel", "crate": "ind_box_wood",
        "locker": "retro_locker", "fuse_box": "psx_fuse_box", "generator": "psx_generator",
        "dumpster": "psx_dumpster", "vase": "psx_vase", "tv": "retro_tv", "dead_tree": "tree_deadtree_1",
        "pine_snow": "nat_pinetree_snow_1", "rock": "nat_rock_1", "catwalk": "ind_bridges_2",
        "pipes": "ind_pipes_horizontal_short", "terminal": "kst_computer", "ship_lander": "kk_lander_a",
    },
}
# Round 2: new interior themes (office / backrooms / serverfarm / sewer / hospital / poolrooms).
# Same keys are exposed to levelTexture() through TEXTURE_OVERRIDES in src/audio/extassets.js.
FEATURED["textures"].update({
    "office_wall": "tfg_office_wall", "office_floor": "tfg_office_carpet", "office_ceiling": "tfg_office_ceiling",
    "office_cubicle": "tfg_cubicle_fabric",
    "backrooms_wall": "nb_backrooms_wallpaper", "backrooms_wall_alt": "gbr_backrooms_wall",
    "backrooms_floor": "nb_backrooms_carpet", "backrooms_floor_alt": "gbr_backrooms_carpet",
    "backrooms_ceiling": "nb_office_ceiling", "backrooms_ceiling_alt": "gbr_backrooms_ceiling",
    "backrooms_light": "gbr_backrooms_light",
    "serverfarm_wall": "tfg_server_wall", "serverfarm_floor": "tfg_server_floor", "serverfarm_ceiling": "px_metal_05_panel_4",
    "serverfarm_grating": "t3_grating_11",
    "sewer_wall": "tfg_sewer_brick", "sewer_wall_alt": "tfg_sewer_stone", "sewer_floor": "tfg_sewer_floor",
    "sewer_ceiling": "tfg_sewer_stone", "sewer_water": "px_water_01_green_1", "sewer_moss": "t1_bricks_20",
    "hospital_wall": "tfg_hospital_wall", "hospital_tiles": "tfg_hospital_tiles", "hospital_floor": "tfg_hospital_floor",
    "hospital_ceiling": "tfg_hospital_ceiling", "hospital_floor_alt": "px_tiles_rectangle_white_damaged_1",
    "poolrooms_tile": "gbr_poolrooms_tile", "poolrooms_tile_color": "gbr_poolrooms_tile_color",
    "poolrooms_light": "gbr_poolrooms_light", "poolrooms_water": "px_water_01_blue_1",
})
FEATURED["sounds"].update({
    "amb_office": "amb_office_hvac", "amb_backrooms": "amb_backrooms_hum", "amb_serverfarm": "amb_server_room",
    "amb_sewer": "amb_sewer_tunnel", "amb_sewer_water": "amb_sewer_water_1", "amb_hospital": "amb_hospital_ward",
    "heart_monitor_beep": "sfx_heart_beep", "flatline": "sfx_flatline", "phone_ring": "sfx_phone_ring",
    "dialup_modem": "sfx_dialup_modem", "hdd_click": "sfx_hdd_click", "drip": "sfx_drip_1",
    "pipe_groan": "sfx_pipe_groan_1", "crt_on": "sfx_crt_on", "crt_off": "sfx_crt_off",
    "light_flicker": "sfx_fluoro_flicker", "elevator_ding": "sfx_elevator_ding", "printer_jam": "sfx_printer_jam",
    "typing": "sfx_typing", "bios_beep": "sfx_bios_beep",
})
FEATURED["models"].update({
    "office_desk": "tfg_cubicle_desk", "office_partition": "tfg_cubicle_wall", "office_chair": "kf_office_chair",
    "office_copier": "tfg_copier", "crt_monitor": "tfg_crt_monitor", "crt_shrine": "tfg_crt_stack",
    "server_rack": "tfg_server_rack", "server_rack_open": "tfg_server_rack_open", "cooling_unit": "tfg_crac_unit",
    "sewer_pipe": "tfg_sewer_pipe", "sewer_valve": "tfg_sewer_valve", "sewer_outflow": "tfg_sewer_outflow",
    "sewer_ladder": "tfg_sewer_ladder", "hospital_bed": "tfg_hospital_bed", "gurney": "tfg_gurney",
    "iv_stand": "tfg_iv_stand", "wheelchair": "tfg_wheelchair", "heart_monitor": "tfg_heart_monitor",
    "backrooms_light": "tfg_troffer_light", "backrooms_pillar": "tfg_backrooms_pillar", "almond_water": "tfg_almond_water",
    "car_wreck": "car_sedan", "gravestone": "hb_gravestone", "crypt": "hb_crypt",
})


def load(name):
    p = os.path.join(HERE, name)
    return json.load(open(p, encoding="utf-8")) if os.path.exists(p) else []


def fsize(rel):
    return os.path.getsize(os.path.join(ROOT, "public", *rel.split("/")))


def main():
    # round 1 fragments + any later ones (_frag_textures_tfg.json, _frag_models_r2.json, ...), stable order
    def load_all(kind):
        out = load(f"_frag_{kind}.json")
        for extra in sorted(glob.glob(os.path.join(HERE, f"_frag_{kind}_*.json"))):
            out += load(os.path.basename(extra))
        return out

    tex, snd, mdl = load_all("textures"), load_all("sounds"), load_all("models")
    # paths in the manifest are relative to /public (i.e. fetch("/" + path) or import.meta.env.BASE_URL + path)
    for lst in (tex, snd, mdl):
        ids = [e["id"] for e in lst]
        dup = {i for i in ids if ids.count(i) > 1}
        assert not dup, dup
        for e in lst:
            assert re.fullmatch(r"[a-z0-9_]+", e["id"]), e["id"]
            assert os.path.exists(os.path.join(ROOT, "public", *e["path"].split("/"))), e["path"]
    all_ids = {"textures": {e["id"] for e in tex}, "sounds": {e["id"] for e in snd}, "models": {e["id"] for e in mdl}}
    for k, m in FEATURED.items():
        for role, i in m.items():
            assert i in all_ids[k], (k, role, i)
    used_packs = sorted({e["pack"] for e in tex + snd + mdl})
    packs = []
    for key, p in PACKS.items():
        if p["name"] in used_packs:
            packs.append({"id": key, "name": p["name"], "author": p["author"], "url": p["url"],
                          "license": p["license"], **({"credit": p["credit"]} if p.get("credit") else {})})
    manifest = {
        "version": 1,
        "generated": datetime.date.today().isoformat(),
        "note": "Paths are relative to /public. Models: +Y up, meters, origin bottom-center, front faces +Z. "
                "Textures: nearest-filter pixel art, 8-bit palette PNG. Sounds: mono OGG Vorbis. "
                "See CREDITS.md for licenses (CC-BY packs need visible credit).",
        "featured": FEATURED,
        "packs": packs,
        "models": mdl,
        "textures": tex,
        "sounds": snd,
    }
    # compact but diff-friendly: one asset per line
    chunks = []
    for k, v in manifest.items():
        if isinstance(v, list):
            body = ",\n".join("  " + json.dumps(e, ensure_ascii=False, separators=(",", ":")) for e in v)
            chunks.append(f'"{k}":[\n{body}\n]')
        else:
            chunks.append(f'"{k}":' + json.dumps(v, ensure_ascii=False, separators=(",", ":")))
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("{\n" + ",\n".join(chunks) + "\n}\n")
    json.load(open(OUT, encoding="utf-8"))  # sanity
    tot = {k: sum(fsize(e["path"]) for e in v) for k, v in (("models", mdl), ("textures", tex), ("sounds", snd))}
    print(f"manifest: {len(mdl)} models ({tot['models']/1e6:.1f} MB), {len(tex)} textures "
          f"({tot['textures']/1e6:.1f} MB), {len(snd)} sounds ({tot['sounds']/1e6:.1f} MB)")
    write_credits(tex, snd, mdl)


def write_credits(tex, snd, mdl):
    def used(pack_name, lst, kind):
        n = sum(1 for e in lst if e["pack"] == pack_name)
        return f"{n} {kind}" if n else None

    lines = [
        "# Credits — third-party assets",
        "",
        "TFG (TOTALLY FUCKED GAME) bundles the following free assets, downloaded from itch.io and processed for the game",
        "(PSX-style downscaling / palette reduction, format conversion to .glb/.png/.ogg, rescaling, trimming).",
        "Processed files live in `public/assets/ext/`; the catalog is `public/assets/ext/manifest.json`.",
        "Pipeline scripts: `tools/assets/` (download: `itch.py`, `download_all.sh`; processing: `extract.py`,",
        "`textures.py`, `audio.py`, `models.py` + `blender_convert.py`; catalog: `manifest.py`).",
        "",
        "Round 2 adds props / textures / sounds made for TFG itself (Blender + Python: `tools/blender/tfg_props.py`,",
        "`tools/assets/tfg_textures.py`, `tfg_audio.py`; driver `models_r2.py`) — released as CC0 like the rest.",
        "",
        "Most packs are CC0 (public domain) — credit is not required but given anyway.",
        "**Packs marked CC-BY 4.0 or \"credit required\" must stay credited in the game's credits screen.**",
        "",
        "## Attribution required",
        "",
    ]
    req, cc0, other = [], [], []
    for key, p in PACKS.items():
        parts = [used(p["name"], mdl, "models"), used(p["name"], tex, "textures"), used(p["name"], snd, "sounds")]
        parts = [x for x in parts if x]
        if not parts:
            continue
        row = f"- **{p['name']}** by {p['author']} — <{p['url']}> — License: {p['license']}. Used: {', '.join(parts)}."
        if p.get("credit"):
            row += f"  \n  Credit line: _{p['credit']}_"
        if p.get("credit"):
            req.append(row)
        elif p["license"].startswith("CC0"):
            cc0.append(row)
        else:
            other.append(row)
    lines += req or ["- (none)"]
    lines += ["", "## CC0 / public domain", ""] + cc0
    if other:
        lines += ["", "## Other free licenses", ""] + other
    lines += [
        "",
        "## Notes",
        "",
        "- Liminal Games asks that the horror SFX pack itself is not re-sold or re-uploaded as a pack (CC0 otherwise).",
        "- KayKit (Kay Lousberg) asks not to resell unmodified copies of the assets as your own.",
        "- Packs downloaded but NOT used because their terms forbid redistributing the files or give no license:",
        "  JDSherbert Footstep Foley SFX (no redistribution of raw files), Polarsound Household Interior Foley",
        "  (no redistribution as standalone files), Hove Audio Horror Ambiences (no license stated),",
        "  Quaternius Bestiary Standard (free models ship without animations).",
        "",
    ]
    open(CREDITS, "w", encoding="utf-8").write("\n".join(lines))
    print("wrote", CREDITS)


if __name__ == "__main__":
    main()
