#!/usr/bin/env python3
"""Print a compact summary of .glb files (nodes, meshes, skins, animations, images, bounds).
Usage: python glb_info.py file.glb [...]"""
import json
import struct
import sys


def read_glb(path):
    with open(path, "rb") as f:
        data = f.read()
    magic, ver, length = struct.unpack_from("<III", data, 0)
    assert magic == 0x46546C67, "not a glb"
    off = 12
    js, binchunk = None, None
    while off < length:
        clen, ctype = struct.unpack_from("<II", data, off)
        chunk = data[off + 8: off + 8 + clen]
        if ctype == 0x4E4F534A:
            js = json.loads(chunk)
        elif ctype == 0x004E4942:
            binchunk = chunk
        off += 8 + clen
    return js, binchunk


def main():
    for p in sys.argv[1:]:
        js, _ = read_glb(p)
        print("==", p)
        for i, n in enumerate(js.get("nodes", [])):
            print("  node", i, n.get("name"), {k: v for k, v in n.items() if k in ("mesh", "skin", "translation", "rotation", "scale", "children")})
        for m in js.get("meshes", []):
            for pr in m["primitives"]:
                acc = js["accessors"][pr["attributes"]["POSITION"]]
                print("  mesh", m.get("name"), "min", [round(x, 3) for x in acc["min"]], "max", [round(x, 3) for x in acc["max"]], "mat", pr.get("material"))
        print("  skins", len(js.get("skins", [])), "anims", [a.get("name") for a in js.get("animations", [])])
        print("  images", [(im.get("name"), im.get("mimeType")) for im in js.get("images", [])])
        for mt in js.get("materials", []):
            print("  material", mt.get("name"), json.dumps(mt.get("pbrMetallicRoughness", {}))[:200], "emissive" if "emissiveTexture" in mt else "")


if __name__ == "__main__":
    main()
