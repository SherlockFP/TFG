#!/usr/bin/env python3
"""
Audio pipeline: raw pack audio (wav/flac/mp3/ogg) -> public/assets/ext/sounds/<pack>/<id>.ogg
  * mono, resampled (22.05 kHz SFX / 32 kHz music+drones), peak-normalised to -1 dBFS
  * leading/trailing silence trimmed, one-shots capped in length
  * "split" rules cut a recorded walking sequence into single footstep one-shots
  * "loop" rules are cut to <= N seconds with a crossfade so they loop seamlessly
  * OGG Vorbis via libsndfile (python-soundfile, installed into tools/raw/.pydeps)
  * writes tools/assets/_frag_sounds.json (merged by manifest.py)

Usage: python audio.py
"""
import glob
import json
import os
import re
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "tools", "raw", ".pydeps"))
sys.path.insert(0, HERE)
import soundfile as sf  # noqa: E402
from packs import PACKS  # noqa: E402

RAW = os.path.join(ROOT, "tools", "raw")
FRAG = os.path.join(HERE, "_frag_sounds.json")

# (pack, glob relative to <raw>/_x, id prefix, tags, options)
#   options: loop=seconds (seamless loop), max=seconds (one-shot cap), split=N (max one-shots per file),
#            sr=target rate, pick=[indices] (1-based, after sorting), names={stem_regex: suffix}
RULES = [
    # ------------------------------------------------------------------ footsteps
    ("liminal_horror", "*/*/Concrete Footsteps/*.mp3", "step_concrete", ["footstep", "concrete"], dict(split=4)),
    ("liminal_horror", "*/*/Metal Footsteps/*.mp3", "step_metal", ["footstep", "metal"], dict(split=4)),
    ("liminal_horror", "*/*/Carpet Footstep/*.mp3", "step_carpet", ["footstep", "carpet"], dict(split=4)),
    ("liminal_horror", "*/*/Leaves Footsteps/*.mp3", "step_leaves", ["footstep", "leaves", "grass", "outdoor"], dict(split=4)),
    ("liminal_horror", "*/*/Wind Footsteps/*.mp3", "step_snow", ["footstep", "snow", "outdoor"], dict(split=4)),
    ("liminal_horror", "*/Gravel Footsteps/*.mp3", "step_gravel", ["footstep", "gravel", "dirt", "outdoor"], dict(split=3)),
    ("liminal_horror", "*/Mud foosteps/*.mp3", "step_mud", ["footstep", "mud", "outdoor"], dict(split=3)),
    ("liminal_horror", "*/Stairs Footsteps/*.mp3", "step_stairs", ["footstep", "stairs", "wood"], dict(split=3)),
    ("liminal_horror", "*/Wooden Foosteps/*.mp3", "step_wood", ["footstep", "wood"], dict(split=3)),
    ("phlegm_horror", "*/*/SFX/Footsteps - Slow.wav", "step_heavy", ["footstep", "heavy", "monster", "concrete"], dict(split=8)),
    ("phlegm_horror", "*/*/SFX/Footsteps - Fast.wav", "run_heavy_loop", ["footstep", "running", "loop"], dict(max=6)),
    ("kronbits_sfx", "*/*/GameSFX/FootStep/*.wav", "step_retro", ["footstep", "retro"], dict(max=2)),
    # ------------------------------------------------------------------ doors
    ("liminal_horror", "*/*/Creaking Door/*.mp3", "door_creak", ["door", "creak", "wood"], dict(max=6)),
    # ------------------------------------------------------------------ monsters / creatures
    ("liminal_horror", "*/*/Monster Growl/*.mp3", "mon_growl", ["monster", "growl", "creature"], dict(max=8)),
    ("phlegm_horror", "*/*/SFX/Deep Growl.wav", "mon_deep_growl", ["monster", "growl", "giant", "creature"], dict(max=8)),
    ("kronbits_sfx", "*/*/GameSFX/Roar/*.wav", "mon_roar", ["monster", "roar", "retro", "creature"], dict(max=5)),
    ("kronbits_sfx", "*/*/GameSFX/z_Various/Retro Scream 01.wav", "mon_scream", ["monster", "scream", "screamer"], dict(max=5)),
    ("kronbits_sfx", "*/*/GameSFX/Animal Insects/*.wav", "animal", ["animal", "outdoor", "creature"],
     dict(max=6, names={"Birds": "birds", "Crow": "crow", "Fly": "fly", "Owl": "owl", "Wolf": "wolf"})),
] + [
    ("goofy_monsters", f"*/{c}/{c}_{e}_*.flac", f"voice_{c.lower()}_{e.lower().replace('dyeing', 'die')}",
     ["monster", "voice", c.lower(), e.lower().replace("dyeing", "die"), "goofy"], dict(max=5, single=True))
    for c in ("Zombie", "Slime", "Rat", "Bat", "Skeleton", "Dragon", "Clown")
    for e in ("Anger", "Attack", "Hurt", "Dyeing", "Grunt", "Eating", "Laughing", "Scared")
] + [
    # ------------------------------------------------------------------ horror stingers / jumpscares
    ("obx_horror", "*/stingers/*.ogg", "sting", ["stinger", "horror"],
     dict(max=10, names={"drum_1_01": "drum", "drum_1_glitch": "drum_glitch", "impact_01": "impact",
                         "impact_glitch": "impact_glitch", "piano_01": "piano", "piano_ring": "piano_ringmod",
                         "synth_1_01": "synth", "synth_1_glitch": "synth_glitch", "violin_01": "violin",
                         "violin_glitch": "violin_glitch"})),
    ("obx_horror", "(OGG) Horror SFX Volume 1 - Stingers 2/*.ogg", "sting2", ["stinger", "horror"],
     dict(max=10, names={r"drum_1_0(\d)": r"drum_\1", r"impact_0(\d)": r"impact_\1", r"synth_1_0(\d)": r"synth_\1",
                         r"violin_0(\d)": r"violin_\1"})),
    ("phlegm_horror", "*/*/SFX/Jumpscare - *.wav", "jumpscare", ["stinger", "jumpscare", "horror"], dict(max=8)),
    ("phlegm_horror", "*/*/SFX/Eerie Sound.wav", "eerie", ["stinger", "eerie", "horror"], dict(max=9)),
    ("phlegm_horror", "*/*/SFX/Acceleration Into Cutoff.wav", "power_down_whoosh", ["stinger", "power", "horror"], dict(max=16)),
    # ------------------------------------------------------------------ ambience
    ("nihilex_facility", "*/**/Ambience_*.ogg", "amb_facility", ["ambience", "facility", "interior", "loop"],
     dict(loop=60, names={"Armory": "armory", "Cell": "cell", "Hallway": "hallway", "Janitory": "janitor",
                          "Lockers": "lockers", "Office": "office", "Research": "research"})),
    ("obx_horror", "*/Horror Pack 1/Drones/*.ogg", "amb_drone", ["ambience", "drone", "horror", "loop"],
     dict(loop=30, sr=32000, pick=[1, 3, 5, 7, 9, 12, 15, 18])),
    ("liminal_horror", "*/*/Ambient Wind/*.mp3", "amb_wind", ["ambience", "wind", "outdoor", "loop"], dict(loop=20, pick=[1, 2, 6, 7])),
    ("cluck_rain", "*/*/*.flac", "amb_rain", ["ambience", "rain", "thunder", "weather", "outdoor", "loop"],
     dict(loop=40, names={"Porch 1": "porch_1", "Porch 2": "porch_2", "Porch 3": "porch_3",
                          "Chimney 1": "indoor_1", "Chimney 2": "indoor_2"})),
    ("phlegm_horror", "*/*/Music/*.wav", "music", ["music", "horror", "loop"],
     dict(loop=60, sr=32000, names={"Dark Ambient Music": "dark_ambient", "Dark Pluck": "dark_pluck",
                                    "Eerie Loop - Long": "eerie_long", "Eerie Loop$": "eerie",
                                    "Less Dark Ambient": "less_dark"})),
    ("kronbits_sfx", "*/*/GameSFX/Ambience/*.wav", "amb_retro", ["ambience", "retro", "loop"], dict(loop=30)),
    # ------------------------------------------------------------------ sci-fi machinery / ship / alarms
    ("loadless_scifi", "*/*/Mono AMBIENT *.mp3", "scifi", ["ambience", "scifi", "machinery", "loop"],
     dict(loop=30, names={"Big Fan": "big_fan", "Big Dock": "big_dock", "Big Ship": "ship_hum", "Machina": "machina",
                          "Rotator": "rotator", "Rotor Triad": "rotor", "Gengine": "generator", "Feedback Engine$": "engine",
                          "Splutter Engine": "engine_splutter", "Sub Rumble": "sub_rumble", "Crush Converter": "converter",
                          "Alien Ship": "alien_ship", "Strange Planet": "strange_planet", "Maelstrom": "maelstrom",
                          "Scifi Alarm": "alarm", "Soft Alarm": "alarm_soft", "Sirens$": "sirens",
                          "System Alert 3": "system_alert", "Vector Low Alarm": "alarm_low", "Spark Drone": "spark_drone",
                          "Grain Drone": "grain_drone", "Shimmer Drone$": "shimmer_drone", "Drone$": "drone",
                          "Offworld Traffic": "offworld_traffic", "Planetarium": "planetarium", "Wake Up": "wake_up"})),
    # ------------------------------------------------------------------ misc SFX (kronbits CC0)
    ("kronbits_sfx", "*/*/GameSFX/Impact/*.wav", "impact", ["impact", "hit"],
     dict(max=3, names={"Impact 20": "generic", "Impact LoFi": "lofi", "Metal 05": "metal_1", "Metal 36": "metal_2",
                        "Punch 07": "punch", "Punch Hurt": "punch_hurt", "Water": "water"})),
    ("kronbits_sfx", "*/*/GameSFX/Electric/*.wav", "electric", ["electric", "zap", "machinery"], dict(max=4)),
    ("kronbits_sfx", "*/*/GameSFX/Alarms Blip Beeps/*.wav", "beep", ["ui", "alarm", "beep", "terminal"], dict(max=5)),
    ("kronbits_sfx", "*/*/GameSFX/Explosion/*.wav", "explosion", ["explosion", "impact"], dict(max=5)),
    ("kronbits_sfx", "*/*/GameSFX/PickUp/*.wav", "pickup", ["pickup", "item", "ui"], dict(max=2)),
    ("kronbits_sfx", "*/*/GameSFX/Swoosh/*.wav", "swoosh", ["swoosh", "swing", "melee"], dict(max=2)),
    ("kronbits_sfx", "*/*/GameSFX/Weapon/Retro Gun SingleShot 04.wav", "gun_shot", ["weapon", "gun", "shotgun"], dict(max=3)),
    ("kronbits_sfx", "*/*/GameSFX/Weapon/reload/Retro Weapon Reload Best A 03.wav", "gun_reload", ["weapon", "reload"], dict(max=3)),
    ("kronbits_sfx", "*/*/GameSFX/Weapon/various/Retro Weapon Electric 05.wav", "taser", ["weapon", "taser", "electric"], dict(max=3)),
    ("kronbits_sfx", "*/*/GameSFX/Water/*.wav", "water", ["water", "splash", "drip"], dict(max=4)),
    ("kronbits_sfx", "*/*/GameSFX/Interferences/*.wav", "radio_static", ["radio", "static", "walkie", "interference"], dict(max=8)),
    ("kronbits_sfx", "*/*/GameSFX/HiTech/*.wav", "hitech", ["scifi", "terminal", "ui"], dict(max=4)),
    ("kronbits_sfx", "*/*/GameSFX/Vehicles/Retro Vehicle Sirens 03.wav", "siren", ["alarm", "siren"], dict(max=6)),
    ("kronbits_sfx", "*/*/GameSFX/Vehicles/Retro Vehicle Motor 02.wav", "motor", ["machinery", "motor", "engine"], dict(max=6)),
    ("kronbits_sfx", "*/*/GameSFX/z_Various/Retro Turn Off 12.wav", "power_off", ["power", "turn_off", "machinery"], dict(max=4)),
    ("kronbits_sfx", "*/*/GameSFX/z_Various/Retro Computer 02.wav", "computer", ["terminal", "computer", "ui"], dict(max=4)),
    ("kronbits_sfx", "*/*/GameSFX/z_Various/Retro Alien Transmission 02.wav", "transmission", ["radio", "scifi"], dict(max=6)),
    ("kronbits_sfx", "*/*/GameSFX/Events/Negative/*.wav", "neg", ["ui", "fail", "negative"], dict(max=4)),
    ("kronbits_sfx", "*/*/Voices/*.wav", "vo", ["voice", "announcer", "ui"],
     dict(max=4, names={"Deactivated": "deactivated", "Game Over": "game_over", "Malfunction": "malfunction",
                        "Mission Completed": "mission_completed", "Nightmare Mode": "nightmare_mode",
                        "Time Out": "time_out", "Level Completed": "level_completed"})),
    ("kronbits_sfx", "*/*/GameSFX/Music/Success/*.wav", "jingle_success", ["music", "jingle", "success", "ui"], dict(max=8)),
    ("kronbits_sfx", "*/*/GameSFX/Music/Negative/*.wav", "jingle_fail", ["music", "jingle", "fail", "ui"], dict(max=8)),
    # ------------------------------------------------------------------ UI (ObsydianX CC0)
    ("obx_ui", "*/Ogg/Confirm_tones/style1/*.ogg", "ui_confirm", ["ui", "confirm"], dict(max=2, pick=[1, 3, 5, 7])),
    ("obx_ui", "*/Ogg/Confirm_tones/style3/*.ogg", "ui_confirm_b", ["ui", "confirm"], dict(max=2, pick=[1, 4, 8])),
    ("obx_ui", "*/Ogg/Back_tones/style1/*.ogg", "ui_back", ["ui", "back", "cancel"], dict(max=2, pick=[1, 3, 5])),
    ("obx_ui", "*/Ogg/Error_tones/style1/*.ogg", "ui_error", ["ui", "error"], dict(max=2, pick=[1, 3, 5])),
    ("obx_ui", "*/Ogg/Cursor_tones/*.ogg", "ui_cursor", ["ui", "cursor", "hover"], dict(max=1)),
]


# ---------------------------------------------------------------------------- dsp helpers
def to_mono(x):
    return x.mean(axis=1) if x.ndim > 1 else x


def resample(x, sr, tsr):
    if sr == tsr:
        return x
    if tsr < sr:  # anti-alias low-pass (windowed sinc)
        fc = 0.45 * tsr / sr
        n = 63
        t = np.arange(n) - (n - 1) / 2
        h = np.sinc(2 * fc * t) * np.hamming(n)
        h /= h.sum()
        x = np.convolve(x, h, mode="same")
    n_out = int(round(len(x) * tsr / sr))
    xp = np.linspace(0, len(x) - 1, n_out)
    return np.interp(xp, np.arange(len(x)), x)


def env_db(x, sr, hop_s=0.01):
    hop = max(1, int(sr * hop_s))
    n = len(x) // hop
    e = np.sqrt(np.mean(x[:n * hop].reshape(n, hop) ** 2, axis=1) + 1e-12)
    return 20 * np.log10(e + 1e-9), hop


def trim(x, sr, thresh_db=-50, pad_s=0.01):
    db, hop = env_db(x, sr)
    peak = db.max() if len(db) else -100
    th = max(thresh_db, peak - 55)
    idx = np.where(db > th)[0]
    if not len(idx):
        return x
    a = max(0, idx[0] * hop - int(pad_s * sr))
    b = min(len(x), (idx[-1] + 1) * hop + int(0.05 * sr))
    return x[a:b]


def fade(x, sr, fin=0.003, fout=0.02):
    n1, n2 = min(len(x), int(fin * sr)), min(len(x), int(fout * sr))
    if n1:
        x[:n1] *= np.linspace(0, 1, n1)
    if n2:
        x[-n2:] *= np.linspace(1, 0, n2)
    return x


def normalize(x, peak_db=-1.0):
    p = np.max(np.abs(x)) if len(x) else 0
    if p > 1e-6:
        x = x * (10 ** (peak_db / 20) / p)
    return x


def loopify(x, sr, seconds, xfade=1.5):
    n = int(seconds * sr)
    f = int(xfade * sr)
    if len(x) < n + f:  # short file: crossfade tail into head
        n = len(x) - f
        if n <= f:
            return x
    y = x[:n].copy()
    t = np.linspace(0, 1, f)
    y[:f] = x[n:n + f] * np.cos(t * np.pi / 2) + x[:f] * np.sin(t * np.pi / 2)
    return y


def split_steps(x, sr, max_n):
    db, hop = env_db(x, sr)
    peak = db.max()
    th = max(-45, peak - 18)
    above = db > th
    segs = []
    i = 0
    while i < len(above):
        if above[i]:
            j = i
            gap = 0
            while j < len(above) and gap < 6:  # allow 60 ms dips
                gap = 0 if above[j] else gap + 1
                j += 1
            segs.append((i, j - gap))
            i = j
        else:
            i += 1
    out = []
    for k, (a, b) in enumerate(segs):
        start = max(0, a * hop - int(0.01 * sr))
        nxt = segs[k + 1][0] * hop if k + 1 < len(segs) else len(x)
        end = min(nxt - int(0.005 * sr), b * hop + int(0.25 * sr), start + int(0.7 * sr))
        if end - start < int(0.08 * sr):
            continue
        out.append(x[start:end].copy())
    # prefer the loudest, evenly spaced picks
    if len(out) > max_n:
        step = len(out) / max_n
        out = [out[int(i * step)] for i in range(max_n)]
    return out


def write_ogg(path, x, sr):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    data = np.clip(x, -1, 1).astype(np.float32)
    # libsndfile's vorbis encoder overflows the stack on huge single writes -> write in blocks
    with sf.SoundFile(path, "w", samplerate=sr, channels=1, format="OGG", subtype="VORBIS",
                      compression_level=0.6) as f:
        for i in range(0, len(data), 8192):
            f.write(data[i:i + 8192])


# ---------------------------------------------------------------------------- main
def natural_key(s):
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", s)]


def main():
    entries, ids, seen = [], set(), set()
    for pack, pattern, prefix, tags, opt in RULES:
        meta = PACKS[pack]
        base = os.path.join(RAW, meta["raw"], "_x")
        files = sorted(glob.glob(os.path.join(base, pattern), recursive=True), key=natural_key)
        files = [f for f in files if not re.search(r"\.(wav)$", f, re.I) or not os.path.exists(f[:-4] + ".ogg")]
        if opt.get("pick"):
            files = [files[i - 1] for i in opt["pick"] if i - 1 < len(files)]
        if not files:
            print("!! no files for", pack, pattern)
            continue
        tsr = opt.get("sr", 22050)
        k, n0 = 0, len(entries)
        for f in files:
            stem = os.path.splitext(os.path.basename(f))[0]
            x, sr = sf.read(f, always_2d=False)
            x = to_mono(np.asarray(x, dtype=np.float64))
            x = resample(x, sr, tsr)
            name_sfx = None
            for rx, suf in (opt.get("names") or {}).items():
                m = re.search(rx, stem)
                if m:
                    name_sfx = m.expand(suf) if "\\" in suf else suf
                    break
            if opt.get("names") and name_sfx is None:
                continue  # names acts as a whitelist
            pieces = []
            if opt.get("split"):
                pieces = split_steps(trim(x, tsr), tsr, opt["split"])
            elif opt.get("loop"):
                pieces = [loopify(x, tsr, opt["loop"])]
            else:
                y = trim(x, tsr)
                if opt.get("max") and len(y) > opt["max"] * tsr:
                    y = y[:int(opt["max"] * tsr)]
                    y = fade(y, tsr, fout=0.3)
                pieces = [y]
            for p in pieces:
                if not opt.get("loop"):
                    p = fade(p, tsr)
                p = normalize(p)
                h = hash(np.round(p[:4000] * 1000).astype(np.int16).tobytes())
                if h in seen:  # some packs ship duplicate files under different names
                    continue
                seen.add(h)
                if name_sfx and len(pieces) == 1:
                    sid = f"{prefix}_{name_sfx}"
                elif len(files) == 1 and len(pieces) == 1:
                    sid = prefix
                else:
                    k += 1
                    sid = f"{prefix}_{name_sfx + '_' if name_sfx else ''}{k}"
                sid = re.sub(r"[^a-z0-9_]+", "_", sid.lower()).strip("_")
                n = 2
                base_sid = sid
                while sid in ids:
                    sid = f"{base_sid}_{n}"
                    n += 1
                ids.add(sid)
                rel = f"assets/ext/sounds/{meta['slug']}/{sid}.ogg"
                write_ogg(os.path.join(ROOT, "public", *rel.split("/")), p, tsr)
                e = dict(id=sid, path=rel, pack=meta["name"], license=meta["license"],
                         duration=round(len(p) / tsr, 2), tags=list(tags) + (["loop"] if opt.get("loop") and "loop" not in tags else []))
                if meta.get("credit"):
                    e["credit"] = meta["credit"]
                entries.append(e)
        print(f"{pack:16s} {prefix:22s} -> {len(entries) - n0}")
    json.dump(entries, open(FRAG, "w", encoding="utf-8"), indent=1)
    total = sum(os.path.getsize(os.path.join(ROOT, "public", *e["path"].split("/"))) for e in entries)
    print(f"total {len(entries)} sounds, {total/1e6:.1f} MB")


if __name__ == "__main__":
    main()
