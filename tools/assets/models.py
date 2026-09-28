#!/usr/bin/env python3
"""
Model pipeline driver: builds a Blender job list from the table below, runs
blender_convert.py headless (in a few batches), and writes tools/assets/_frag_models.json.

  python models.py            (all)
  python models.py mon_ fish_ (only ids starting with these prefixes)

Sizing per entry: h=<height m> | d=<max dimension m> | s=<uniform scale> | none (keep native meters).
"""
import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, HERE)
from packs import PACKS  # noqa: E402

RAW = os.path.join(ROOT, "tools", "raw")
OUTROOT = os.path.join(ROOT, "public", "assets", "ext", "models")
FRAG = os.path.join(HERE, "_frag_models.json")
BLENDER = r"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe"
TMP = os.path.join(RAW, "_blender_jobs")

# pack-relative source dirs
D = {
    "q_monsters": "_x/Monster Pack Animated by Quaternius/FBX",
    "q_enemies": "_x/Easy Animated Enemy Pack - Jan 2019/Easy Animated Enemy Pack - Jan 2019/FBX",
    "q_robot": "_x/Animated Robot by Quaternius/FBX",
    "q_fish": "_x/Fish Pack Animated by Quaternius/FBX",
    "q_trees": "_x/Textured Stylized Trees - May 2020/Textured Stylized Trees - May 2020/FBX",
    "q_nature": "_x/Ultimate Nature Pack by Quaternius/FBX",
    "k_survival": "_x/kenney_survival-kit/Models/GLB format",
    "k_station": "_x/kenney_space-station-kit/Models/GLB format",
    "k_conveyor": "_x/kenney_conveyor-kit/Models/GLB format",
    "kk_spacebase": "_x/Free/KayKit_Space_Base_Bits_1.0_FREE/Assets/gltf",
    "kk_resource": "_x/Free/KayKit_ResourceBits_1.0_FREE/Assets/gltf",
    "dj_furniture": "_x/PSX-Derelict-Furniture-Standard/PSX-Derelict-Furniture-Standard/glb",
    "dj_waste": "_x/PSX-Waste/PSX-Waste/glb",
    "cd_plumbing": "_x/3D Retro Plumbing & Wiring",
    "vk_vents": "_x/vents_modular_v1.1/vents_modular",
    "vk_barriers": "_x/Cones & Barriers/Cones & Barriers",
    "kkryy_interior": "_x/RetroModelPack/Models",
    "ggf_industrial": "",
    "styloo_random": "_x/RandomObjects/RandomObjects",
}

_TT = "_x/Textured Stylized Trees - May 2020/Textured Stylized Trees - May 2020/Textures/"
TREE_TEX = {"^Bark": _TT + "Tree_Bark.jpg", "^Tree_Leaves": _TT + "Tree_Leaves.png",
            "^Pine_Leaves": _TT + "Pine_Leaves.png", "^Birch_Bark": _TT + "Birch_Bark.png",
            "^Birch_Leaves": _TT + "Birch_Leaves_Green.png"}

# per-model size overrides for the kit packs (keys = source file stem)
SZ = {
    "door-single": "h=2.1", "door-double": "h=2.1", "robot-arm-a": "h=2.6", "robot-arm-b": "h=2.6",
    "cover-hopper": "h=2.4", "bottle": "h=0.3", "bottle-large": "h=0.35", "chest": "h=0.6",
    "PineTree_Snow_1": "h=8.0", "PineTree_Snow_2": "h=9.0", "CommonTree_Dead_1": "h=6.0",
    "CommonTree_Dead_2": "h=7.0", "CommonTree_Dead_Snow_1": "h=6.0", "Willow_Dead_1": "h=6.0",
    "Willow_1": "h=6.5", "BirchTree_Dead_1": "h=6.5", "Grass": "h=0.5", "Grass_Short": "h=0.25",
    "Cactus_1": "h=1.8", "Cactus_3": "h=2.2", "Bush_1": "h=1.0", "Bush_2": "h=0.9", "Bush_Snow_1": "h=1.0",
    "Plant_1": "h=0.5", "Plant_3": "h=0.7",
}

# (id, pack, file, category, sizing, tags, extra-options)
A = dict(anim=True)
M = [
    # ------------------------------------------------------------ animated monsters / creatures
    ("mon_bat", "q_monsters", "Bat.fbx", "monster", "d=0.9", ["flying", "bat"], A),
    ("mon_dragon", "q_monsters", "Dragon.fbx", "monster", "h=2.4", ["dragon", "big"], A),
    ("mon_skeleton", "q_monsters", "Skeleton.fbx", "monster", "h=1.8", ["humanoid", "skeleton"], A),
    ("mon_slime", "q_monsters", "Slime.fbx", "monster", "h=0.9", ["slime", "blob", "sludge"], dict(anim=True, rot_z=-90)),
    ("mon_frog", "q_enemies", "Frog.fbx", "monster", "h=0.5", ["frog", "small"], A),
    ("mon_rat", "q_enemies", "Rat.fbx", "monster", "d=0.6", ["rat", "small", "scuttler"], A),
    ("mon_snake", "q_enemies", "Snake.fbx", "monster", "d=1.6", ["snake"], A),
    ("mon_snake_angry", "q_enemies", "Snake_angry.fbx", "monster", "d=1.6", ["snake"], A),
    ("mon_spider", "q_enemies", "Spider.fbx", "monster", "d=1.6", ["spider"], A),
    ("mon_wasp", "q_enemies", "Wasp.fbx", "monster", "d=0.6", ["flying", "insect"], dict(anim=True, rot_z=-90)),
    ("mon_robot", "q_robot", "Robot.fbx", "monster", "h=2.0", ["robot", "humanoid"], A),
    ("fish_1", "q_fish", "Fish1.fbx", "fish", "d=0.45", ["fish", "fishing"], A),
    ("fish_2", "q_fish", "Fish2.fbx", "fish", "d=0.5", ["fish", "fishing"], A),
    ("fish_3", "q_fish", "Fish3.fbx", "fish", "d=0.4", ["fish", "fishing"], A),
    ("fish_shark", "q_fish", "Shark.fbx", "fish", "d=3.5", ["fish", "shark"], A),
    ("fish_dolphin", "q_fish", "Dolphin.fbx", "fish", "d=2.4", ["fish", "dolphin"], A),
    ("fish_manta", "q_fish", "Manta ray.fbx", "fish", "d=2.5", ["fish", "manta"], A),
    # ------------------------------------------------------------ PSX props (native meters)
    ("psx_barrel", "dj_waste", "barrel.glb", "prop", "", ["barrel", "industrial", "psx"], {}),
    ("psx_cardboard_box", "dj_waste", "cardboard-box.glb", "prop", "", ["box", "crate", "psx"], {}),
    ("psx_crumpled_can", "dj_waste", "crumpled-can.glb", "scrap", "", ["can", "junk", "psx"], {}),
    ("psx_dumpster", "dj_waste", "dumpster.glb", "prop", "", ["dumpster", "outdoor", "psx"], {}),
    ("psx_glass_bottle", "dj_waste", "glass-bottle.glb", "scrap", "", ["bottle", "junk", "psx"], {}),
    ("psx_trash_bag", "dj_waste", "trash-bag.glb", "prop", "", ["trash", "junk", "psx"], {}),
    ("psx_chair", "dj_furniture", "chair.glb", "furniture", "", ["chair", "derelict", "psx"], {}),
    ("psx_couch", "dj_furniture", "couch.glb", "furniture", "", ["couch", "derelict", "psx"], {}),
    ("psx_fridge", "dj_furniture", "fridge.glb", "furniture", "", ["fridge", "derelict", "psx"], {}),
    ("psx_mattress", "dj_furniture", "mattress.glb", "furniture", "", ["mattress", "derelict", "psx"], {}),
    ("psx_shelf", "dj_furniture", "shelf.glb", "furniture", "", ["shelf", "derelict", "psx"], {}),
    ("psx_vase", "dj_furniture", "vase.glb", "scrap", "", ["vase", "valuable", "fragile", "psx"], {}),
    ("psx_fuse_box", "cd_plumbing", "Circuit Breaker.blend", "machinery", "", ["fuse_box", "breaker", "wall", "psx"], {}),
    ("psx_generator", "cd_plumbing", "Generator.blend", "machinery", "", ["generator", "psx"], {}),
    ("psx_pipe_valve", "cd_plumbing", "Pipe Valve.blend", "machinery", "", ["pipe", "valve", "psx"], {}),
    ("psx_pipes", "cd_plumbing", "Pipes.blend", "machinery", "", ["pipe", "psx"], {}),
    ("psx_pump", "cd_plumbing", "Pump.blend", "machinery", "", ["pump", "psx"], {}),
    ("psx_switch", "cd_plumbing", "Switch.blend", "machinery", "", ["switch", "lever", "wall", "psx"], {}),
    ("psx_transformer", "cd_plumbing", "Transformer.blend", "machinery", "", ["transformer", "electric", "psx"], {}),
    ("psx_turbine", "cd_plumbing", "Turbine.blend", "machinery", "", ["turbine", "psx"], {}),
    ("psx_wires", "cd_plumbing", "Wires.blend", "machinery", "", ["wires", "cable", "psx"], {}),
    ("vent_straight_double", "vk_vents", "straight_double.fbx", "structure", "", ["vent", "duct", "modular", "psx"], {}),
    ("vent_straight_single", "vk_vents", "straingt_single.fbx", "structure", "", ["vent", "duct", "modular", "psx"], {}),
    ("vent_connector", "vk_vents", "connector.fbx", "structure", "", ["vent", "duct", "modular", "psx"], {}),
    ("vent_connector_closed", "vk_vents", "connector_closed.fbx", "structure", "", ["vent", "duct", "modular", "psx"], {}),
    ("vent_end", "vk_vents", "end.fbx", "structure", "", ["vent", "duct", "modular", "psx"], {}),
    ("vent_end_closed", "vk_vents", "end_closed.fbx", "structure", "", ["vent", "duct", "modular", "psx"], {}),
    ("vent_cover", "vk_vents", "vent_cover.fbx", "structure", "", ["vent", "cover", "psx"], {}),
    ("cone_construction", "vk_barriers", "Cones/Construction_cone.glb", "prop", "", ["cone", "traffic", "psx"], {}),
    ("cone_traffic", "vk_barriers", "Cones/Traffic_cone_round.glb", "prop", "", ["cone", "traffic", "psx"], {}),
    ("cone_square", "vk_barriers", "Cones/Traffic_cone_square.glb", "prop", "", ["cone", "traffic", "psx"], {}),
    ("barrier_jersey", "vk_barriers", "Concrete Barriers/Jersey_barrier_dirty.glb", "prop", "", ["barrier", "concrete", "psx"], {}),
    ("barrier_jersey_broken", "vk_barriers", "Concrete Barriers/Jersey_barrier_broken_center_dirty.glb", "prop", "", ["barrier", "concrete", "psx"], {}),
    ("barrier_type2", "vk_barriers", "Type 2 Barriers/Type_2_barrier_top_bottom.glb", "prop", "", ["barrier", "psx"], {}),
    ("barrier_type3", "vk_barriers", "Type 3 Barriers/Type_3_barrier_3_planks.glb", "prop", "", ["barrier", "psx"], {}),
    ("barrier_type3_broken", "vk_barriers", "Type 3 Barriers/Type_3_barrier_broken_planks.glb", "prop", "", ["barrier", "psx"], {}),
    ("bollard_security", "vk_barriers", "Bollards/security_bollard.glb", "prop", "", ["bollard", "psx"], {}),
    ("bollard_concrete_light", "vk_barriers", "Bollards/concrete_retro_bollard_light.glb", "prop", "", ["bollard", "light", "psx"], {}),
    ("retro_bucket", "kkryy_interior", "Bucket/Bucket.fbx", "prop", "h=0.35", ["bucket", "psx"], {}),
    ("retro_burner", "kkryy_interior", "Burner/Burner.fbx", "prop", "", ["stove", "burner", "psx"], {}),
    ("retro_clock", "kkryy_interior", "Clock/Clock.fbx", "scrap", "d=0.3", ["clock", "psx"], {}),
    ("retro_concrete_pillar", "kkryy_interior", "ConcretePillar/ConcretePillar.fbx", "structure", "h=3.0", ["pillar", "concrete", "psx"], {}),
    ("retro_cutting_board", "kkryy_interior", "CuttingBoard/CuttingBoard.fbx", "scrap", "d=0.4", ["kitchen", "psx"], {}),
    ("retro_entrance_mat", "kkryy_interior", "EntranceMat/EntranceMat.fbx", "prop", "d=1.0", ["mat", "floor", "psx"], {}),
    ("retro_knife", "kkryy_interior", "Knife/Knife.fbx", "scrap", "d=0.3", ["knife", "weapon", "psx"], {}),
    ("retro_locker", "kkryy_interior", "MetalLockerStorage/MetalLockerStorage.fbx", "furniture", "h=1.9", ["locker", "metal", "psx"], {}),
    ("retro_plate", "kkryy_interior", "Plate/Plate.fbx", "scrap", "d=0.25", ["plate", "kitchen", "psx"], {}),
    ("retro_scythe", "kkryy_interior", "Scythe/Scythe.fbx", "scrap", "d=1.5", ["scythe", "tool", "weapon", "psx"], {}),
    ("retro_sheet_metal", "kkryy_interior", "SheetMetal/SheetMetal.fbx", "prop", "", ["sheet_metal", "junk", "psx"], {}),
    ("retro_shovel", "kkryy_interior", "Shovel/Shovel.fbx", "scrap", "d=1.2", ["shovel", "tool", "weapon", "psx"], {}),
    ("retro_slate", "kkryy_interior", "Slate/Slate.fbx", "prop", "", ["slate", "psx"], {}),
    ("retro_table", "kkryy_interior", "Tabel/Tabel.fbx", "furniture", "h=0.78", ["table", "psx"], dict(texture="Tabel/Tabel.png")),
    ("retro_tv", "kkryy_interior", "Tv/Tv.fbx", "scrap", "h=0.5", ["tv", "electronics", "psx"], {}),
    # ------------------------------------------------------------ scrap items (styloo, textured)
    ("scrap_baseball_bat", "styloo_random", "bat/bat_low.glb", "scrap", "d=0.85", ["bat", "weapon", "melee"], {}),
    ("scrap_briefcase", "styloo_random", "case/case_low.glb", "scrap", "d=0.45", ["case", "briefcase"], {}),
    ("scrap_floppy", "styloo_random", "floppydisk/floopydisk.glb", "scrap", "d=0.09", ["floppy", "electronics"], {}),
    ("scrap_multimeter", "styloo_random", "multimeter/multimeter.glb", "scrap", "d=0.18", ["multimeter", "tool", "electronics"], {}),
    ("scrap_key", "styloo_random", "padlockAndKeys/key_low.glb", "scrap", "d=0.07", ["key"], {}),
    ("scrap_keyring", "styloo_random", "padlockAndKeys/keyattach_low.glb", "scrap", "d=0.1", ["key"], {}),
    ("scrap_padlock", "styloo_random", "padlockAndKeys/padlock_low.glb", "scrap", "d=0.08", ["padlock", "lock"], {}),
    ("scrap_phone", "styloo_random", "phone/phone_low.glb", "scrap", "d=0.22", ["phone", "electronics"], {}),
    ("scrap_heater", "styloo_random", "portableHeater/portableheater.glb", "scrap", "h=0.6", ["heater", "electronics", "two_handed"], {}),
    ("scrap_wrench", "styloo_random", "wrench/wrench_low.glb", "scrap", "d=0.3", ["wrench", "tool"], {}),
    # ------------------------------------------------------------ KayKit resources (scrap / props)
    ("kk_gold_bar", "kk_resource", "Gold_Bar.gltf", "scrap", "d=0.25", ["gold", "goldbar", "valuable"], {}),
    ("kk_gold_bars", "kk_resource", "Gold_Bars.gltf", "scrap", "d=0.35", ["gold", "valuable"], {}),
    ("kk_silver_bar", "kk_resource", "Silver_Bar.gltf", "scrap", "d=0.25", ["silver", "valuable"], {}),
    ("kk_gold_nuggets", "kk_resource", "Gold_Nuggets.gltf", "scrap", "d=0.25", ["gold", "valuable"], {}),
    ("kk_copper_nugget", "kk_resource", "Copper_Nugget_Large.gltf", "scrap", "d=0.18", ["copper", "ore"], {}),
    ("kk_cog", "kk_resource", "Parts_Cog.gltf", "scrap", "d=0.35", ["cog", "gear", "metal"], {}),
    ("kk_parts_pile_small", "kk_resource", "Parts_Pile_Small.gltf", "scrap", "d=0.5", ["parts", "junk", "metal"], {}),
    ("kk_parts_pile_large", "kk_resource", "Parts_Pile_Large.gltf", "prop", "d=1.4", ["parts", "junk", "metal"], {}),
    ("kk_fuel_barrel", "kk_resource", "Fuel_A_Barrel.gltf", "prop", "h=0.9", ["barrel", "fuel"], {}),
    ("kk_fuel_barrel_dirty", "kk_resource", "Fuel_B_Barrel_Dirty.gltf", "prop", "h=0.9", ["barrel", "fuel"], {}),
    ("kk_fuel_barrels", "kk_resource", "Fuel_C_Barrels.gltf", "prop", "h=0.9", ["barrel", "fuel"], {}),
    ("kk_jerrycan", "kk_resource", "Fuel_A_Jerrycan.gltf", "scrap", "h=0.45", ["jerrycan", "fuel"], {}),
    ("kk_pallet", "kk_resource", "Pallet_Wood.gltf", "prop", "d=1.2", ["pallet", "wood"], {}),
    ("kk_pallet_covered", "kk_resource", "Pallet_Wood_Covered_A.gltf", "prop", "d=1.2", ["pallet", "crate"], {}),
    ("kk_iron_bars_stack", "kk_resource", "Iron_Bars_Stack_Small.gltf", "prop", "d=0.6", ["iron", "metal"], {}),
    ("kk_textiles", "kk_resource", "Textiles_Stack_Small.gltf", "prop", "d=0.6", ["textiles", "cloth"], {}),
    ("kk_log_stack", "kk_resource", "Wood_Log_Stack.gltf", "prop", "d=1.5", ["wood", "log"], {}),
    ("kk_stone_chunks", "kk_resource", "Stone_Chunks_Large.gltf", "prop", "d=0.8", ["stone", "rock"], {}),
    # ------------------------------------------------------------ KayKit space base (outdoor / landing site)
    ("kk_cargo_a", "kk_spacebase", "cargo_A.gltf", "prop", "h=1.2", ["crate", "cargo", "scifi"], {}),
    ("kk_cargo_a_stacked", "kk_spacebase", "cargo_A_stacked.gltf", "prop", "h=2.2", ["crate", "cargo", "scifi"], {}),
    ("kk_cargo_b", "kk_spacebase", "cargo_B.gltf", "prop", "h=1.0", ["crate", "cargo", "scifi"], {}),
    ("kk_containers_a", "kk_spacebase", "containers_A.gltf", "prop", "h=2.4", ["container", "scifi"], {}),
    ("kk_containers_b", "kk_spacebase", "containers_B.gltf", "prop", "h=2.4", ["container", "scifi"], {}),
    ("kk_containers_c", "kk_spacebase", "containers_C.gltf", "prop", "h=2.4", ["container", "scifi"], {}),
    ("kk_containers_d", "kk_spacebase", "containers_D.gltf", "prop", "h=2.4", ["container", "scifi"], {}),
    ("kk_lander_a", "kk_spacebase", "lander_A.gltf", "vehicle", "h=6.0", ["ship", "lander", "scifi"], {}),
    ("kk_lander_b", "kk_spacebase", "lander_B.gltf", "vehicle", "h=6.0", ["ship", "lander", "scifi"], {}),
    ("kk_landingpad", "kk_spacebase", "landingpad_small.gltf", "structure", "d=12.0", ["landing_pad", "scifi"], {}),
    ("kk_solarpanel", "kk_spacebase", "solarpanel.gltf", "prop", "h=2.2", ["solar", "scifi"], {}),
    ("kk_drill", "kk_spacebase", "drill_structure.gltf", "structure", "h=7.0", ["drill", "mining", "scifi"], {}),
    ("kk_spacetruck", "kk_spacebase", "spacetruck.gltf", "vehicle", "d=5.0", ["truck", "rover", "scifi"], {}),
    ("kk_windturbine", "kk_spacebase", "windturbine_low.gltf", "structure", "h=8.0", ["wind_turbine", "scifi"], {}),
    ("kk_lights", "kk_spacebase", "lights.gltf", "prop", "h=3.0", ["light", "floodlight", "scifi"], {}),
    ("kk_basemodule", "kk_spacebase", "basemodule_A.gltf", "structure", "h=4.0", ["building", "module", "scifi"], {}),
    ("kk_rocks_a", "kk_spacebase", "rocks_A.gltf", "nature", "d=3.0", ["rock", "moon"], {}),
    ("kk_rocks_b", "kk_spacebase", "rocks_B.gltf", "nature", "d=3.0", ["rock", "moon"], {}),
    # ------------------------------------------------------------ Kenney (flat-colour atlas; uniform per-pack scale)
] + [
    (f"ks_{n.replace('-', '_')}", "k_survival", f"{n}.glb", cat, SZ.get(n, "s=2.6"), tags, {})
    for n, cat, tags in [
        ("barrel", "prop", ["barrel", "wood"]), ("barrel-open", "prop", ["barrel", "wood"]),
        ("box", "prop", ["crate", "wood"]), ("box-large", "prop", ["crate", "wood"]), ("box-open", "prop", ["crate", "wood"]),
        ("bucket", "prop", ["bucket"]), ("bottle", "scrap", ["bottle"]), ("bottle-large", "scrap", ["bottle"]),
        ("chest", "scrap", ["chest", "valuable"]), ("fish", "fish", ["fish", "fishing"]), ("fish-large", "fish", ["fish", "fishing"]),
        ("rock-a", "nature", ["rock"]), ("rock-b", "nature", ["rock"]), ("rock-c", "nature", ["rock"]),
        ("rock-flat", "nature", ["rock"]), ("rock-sand-a", "nature", ["rock", "desert"]),
        ("tree", "nature", ["tree"]), ("tree-tall", "nature", ["tree"]), ("tree-autumn", "nature", ["tree"]),
        ("tree-trunk", "nature", ["stump"]), ("tree-log", "nature", ["log"]),
        ("tool-axe", "scrap", ["axe", "tool", "weapon"]), ("tool-hammer", "scrap", ["hammer", "tool", "weapon"]),
        ("tool-pickaxe", "scrap", ["pickaxe", "tool", "weapon"]), ("tool-shovel", "scrap", ["shovel", "tool", "weapon"]),
        ("workbench", "furniture", ["workbench"]), ("workbench-anvil", "furniture", ["anvil"]),
        ("signpost", "prop", ["sign"]), ("campfire-pit", "prop", ["campfire"]), ("tent-canvas", "structure", ["tent"]),
        ("fence", "structure", ["fence"]), ("grass-large", "nature", ["grass"]),
    ]
] + [
    (f"kst_{n.replace('-', '_')}", "k_station", f"{n}.glb", cat, SZ.get(n, "s=2.0"), tags + ["ship", "scifi"], {})
    for n, cat, tags in [
        ("bed-single", "furniture", ["bed"]), ("chair", "furniture", ["chair"]), ("chair-armrest-headrest", "furniture", ["chair"]),
        ("computer", "machinery", ["computer", "terminal"]), ("computer-screen", "machinery", ["computer", "terminal", "monitor"]),
        ("computer-system", "machinery", ["computer", "server"]), ("computer-wide", "machinery", ["computer", "terminal"]),
        ("container", "prop", ["crate", "container"]), ("container-tall", "prop", ["crate", "container"]),
        ("container-wide", "prop", ["crate", "container"]), ("container-flat", "prop", ["crate", "container"]),
        ("display-wall", "machinery", ["screen", "monitor", "wall"]), ("door-single", "structure", ["door"]),
        ("door-double", "structure", ["door"]), ("pipe", "structure", ["pipe"]), ("pipe-bend", "structure", ["pipe"]),
        ("pipe-ring", "structure", ["pipe"]), ("rail", "structure", ["rail"]), ("skip", "prop", ["skip", "dumpster"]),
        ("skip-rocks", "prop", ["skip", "rocks"]), ("table", "furniture", ["table"]), ("table-large", "furniture", ["table"]),
        ("wall-switch", "machinery", ["switch", "lever", "wall"]), ("rocks", "nature", ["rock"]),
    ]
] + [
    (f"kcv_{n.replace('-', '_')}", "k_conveyor", f"{n}.glb", cat, SZ.get(n, "s=2.0"), tags + ["factory", "industrial"], {})
    for n, cat, tags in [
        ("conveyor", "machinery", ["conveyor"]), ("conveyor-long", "machinery", ["conveyor"]),
        ("conveyor-stripe-sides", "machinery", ["conveyor"]), ("box-small", "prop", ["box", "crate"]),
        ("box-large", "prop", ["box", "crate"]), ("box-long", "prop", ["box", "crate"]),
        ("robot-arm-a", "machinery", ["robot_arm"]), ("robot-arm-b", "machinery", ["robot_arm"]),
        ("scanner-high", "machinery", ["scanner"]), ("cover-hopper", "machinery", ["hopper"]),
        ("door-wide-closed", "structure", ["door", "shutter"]),
    ]
] + [
    # ------------------------------------------------------------ nature (Quaternius, textured trees + low-poly nature)
    (f"tree_{n.lower()}", "q_trees", f"{n}.fbx", "nature", h, ["tree"] + t, dict(mat_tex=TREE_TEX))
    for n, h, t in [
        ("DeadTree_1", "h=6.0", ["dead", "spooky"]), ("DeadTree_2", "h=6.5", ["dead", "spooky"]),
        ("DeadTree_3", "h=5.5", ["dead", "spooky"]), ("DeadTree_4", "h=7.0", ["dead", "spooky"]),
        ("DeadBirch_1", "h=7.0", ["dead", "birch"]), ("DeadBirch_2", "h=6.0", ["dead", "birch"]),
        ("Pine_1", "h=9.0", ["pine"]), ("Pine_2", "h=8.0", ["pine"]), ("Pine_3", "h=7.0", ["pine"]),
        ("Tree_1", "h=6.5", ["leafy"]), ("Tree_2", "h=6.0", ["leafy"]), ("Birch_1", "h=7.5", ["birch"]),
    ]
] + [
    (f"nat_{n.lower()}", "q_nature", f"{n}.fbx", "nature", SZ.get(n, ""), t, {})
    for n, t in [
        ("Rock_1", ["rock"]), ("Rock_2", ["rock"]), ("Rock_3", ["rock"]), ("Rock_4", ["rock"]), ("Rock_5", ["rock"]),
        ("Rock_6", ["rock"]), ("Rock_7", ["rock"]), ("Rock_Moss_1", ["rock", "moss", "swamp"]), ("Rock_Moss_2", ["rock", "moss", "swamp"]),
        ("Rock_Snow_1", ["rock", "snow"]), ("Rock_Snow_2", ["rock", "snow"]), ("Rock_Snow_3", ["rock", "snow"]),
        ("PineTree_Snow_1", ["tree", "pine", "snow"]), ("PineTree_Snow_2", ["tree", "pine", "snow"]),
        ("CommonTree_Dead_1", ["tree", "dead"]), ("CommonTree_Dead_2", ["tree", "dead"]),
        ("CommonTree_Dead_Snow_1", ["tree", "dead", "snow"]), ("Willow_Dead_1", ["tree", "dead", "swamp"]),
        ("Willow_1", ["tree", "willow", "swamp"]), ("BirchTree_Dead_1", ["tree", "dead", "birch"]),
        ("TreeStump", ["stump"]), ("TreeStump_Snow", ["stump", "snow"]), ("TreeStump_Moss", ["stump", "moss"]),
        ("WoodLog", ["log"]), ("WoodLog_Moss", ["log", "moss"]), ("WoodLog_Snow", ["log", "snow"]),
        ("Bush_1", ["bush"]), ("Bush_2", ["bush"]), ("Bush_Snow_1", ["bush", "snow"]),
        ("Grass", ["grass"]), ("Grass_Short", ["grass"]), ("Plant_1", ["plant"]), ("Plant_3", ["plant"]),
        ("Cactus_1", ["cactus", "desert"]), ("Cactus_3", ["cactus", "desert"]), ("Lilypad", ["lilypad", "pond", "water"]),
    ]
]

# godgoldfear industrial exterior: one scene split into objects (CC-BY 4.0)
GGF_ONLY = (r"^(Barrel_\d|Box_wide_wood|Box_wood|Cargo_\d_\w+|Liquid_reservoir_\d|Pipes_\w+|Bags_1|Generator|"
            r"Metal_cabinet_\d|Palet_\w+|Ventilation_\d|Concrete_stairs|Concrete_miniwall_\w+|Wall\w*|Fence|"
            r"Bridges_\w+|Cooling_tower|Building_5|Building_13)$")


def sizing(spec):
    if not spec:
        return {}
    k, v = spec.split("=")
    return {"h": {"height": float(v)}, "d": {"max_dim": float(v)}, "s": {"scale": float(v)}}[k]


def build_jobs(prefixes):
    jobs, meta = [], {}
    for mid, pack, f, cat, size, tags, extra in M:
        if prefixes and not mid.startswith(tuple(prefixes)):
            continue
        p = PACKS[pack]
        src = os.path.join(RAW, p["raw"], *D[pack].split("/"), *f.split("/"))
        if not os.path.exists(src):
            print("!! missing", src)
            continue
        out = os.path.join(OUTROOT, p["slug"], mid + ".glb")
        j = dict(id=mid, src=src, out=out, max_tris=5000, tex_max=256)
        j.update(sizing(size))
        for k, v in extra.items():
            if k == "texture":
                v = os.path.join(os.path.dirname(os.path.dirname(src)), *v.split("/"))
            elif k == "mat_tex":
                v = {rx: os.path.join(RAW, p["raw"], *rel.split("/")) for rx, rel in v.items()}
            j[k] = v
        jobs.append(j)
        meta[mid] = (pack, cat, tags)
    if not prefixes or any("ind_".startswith(x) or x.startswith("ind_") for x in prefixes):
        p = PACKS["ggf_industrial"]
        jobs.append(dict(id="ind_", src=os.path.join(RAW, p["raw"], "Industrial_exterior_v2.glb"),
                         out=os.path.join(OUTROOT, p["slug"]), split=True, only=GGF_ONLY, max_tris=5000, tex_max=128))
        meta["ind_"] = ("ggf_industrial", None, ["industrial", "outdoor", "psx"])
    return jobs, meta


def ggf_category(name):
    n = name.lower()
    if n.startswith(("barrel", "box", "cargo", "bags", "palet")):
        return "prop"
    if n.startswith(("generator", "ventilation", "metal_cabinet", "liquid", "pipes", "cooling")):
        return "machinery"
    return "structure"


def main():
    prefixes = sys.argv[1:]
    jobs, meta = build_jobs(prefixes)
    os.makedirs(TMP, exist_ok=True)
    results = []
    batch = 25
    for i in range(0, len(jobs), batch):
        chunk = jobs[i:i + batch]
        jf = os.path.join(TMP, f"jobs_{i}.json")
        rf = os.path.join(TMP, f"res_{i}.json")
        json.dump(chunk, open(jf, "w", encoding="utf-8"), indent=1)
        print(f"blender batch {i}..{i + len(chunk) - 1}", flush=True)
        r = subprocess.run([BLENDER, "-b", "--factory-startup", "-P", os.path.join(HERE, "blender_convert.py"),
                            "--", jf, rf], capture_output=True, text=True, encoding="utf-8", errors="replace")
        with open(os.path.join(TMP, f"log_{i}.txt"), "w", encoding="utf-8") as lf:
            lf.write(r.stdout + "\n" + r.stderr)
        if not os.path.exists(rf):
            print("!! batch failed, see", os.path.join(TMP, f"log_{i}.txt"))
            continue
        results += json.load(open(rf, encoding="utf-8"))

    old = []
    if prefixes and os.path.exists(FRAG):
        old = [e for e in json.load(open(FRAG, encoding="utf-8")) if not e["id"].startswith(tuple(prefixes))
               and os.path.exists(os.path.join(ROOT, "public", *e["path"].split("/")))]
    entries = []
    for r in results:
        if "error" in r:
            print("!! ERROR", r.get("job"), r["error"])
            continue
        job = r["job"]
        pack, cat, tags = meta[job]
        if job == "ind_":
            mid = "ind_" + re.sub(r"[^a-z0-9]+", "_", r["name"].lower()).strip("_")
            cat = ggf_category(r["name"])
            tags = tags + [re.sub(r"_\d+$", "", r["name"].lower())]
        else:
            mid = job
        p = PACKS[pack]
        rel = os.path.relpath(r["out"], os.path.join(ROOT, "public")).replace("\\", "/")
        e = dict(id=mid, path=rel, category=cat, pack=p["name"], license=p["license"], tris=r["tris"],
                 size=r["size"], animations=r["animations"], tags=tags)
        if p.get("credit"):
            e["credit"] = p["credit"]
        entries.append(e)
    entries = old + entries
    json.dump(entries, open(FRAG, "w", encoding="utf-8"), indent=1)
    total = sum(os.path.getsize(os.path.join(ROOT, "public", *e["path"].split("/"))) for e in entries)
    print(f"models: {len(entries)} ok, {total / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
