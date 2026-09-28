#!/usr/bin/env python3
"""
Make labelled contact sheets of textures for quick visual review.
Usage: python contact_sheet.py OUT.png DIR_OR_GLOB [--cell 96] [--cols 10] [--max 100]
"""
import argparse
import glob
import os

from PIL import Image, ImageDraw


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out")
    ap.add_argument("src", nargs="+")
    ap.add_argument("--cell", type=int, default=96)
    ap.add_argument("--cols", type=int, default=10)
    ap.add_argument("--max", type=int, default=100)
    ap.add_argument("--offset", type=int, default=0)
    a = ap.parse_args()
    files = []
    for s in a.src:
        if os.path.isdir(s):
            for dp, dn, fn in os.walk(s):
                files += [os.path.join(dp, f) for f in fn if f.lower().endswith((".png", ".jpg", ".jpeg", ".tga", ".bmp"))]
        else:
            files += glob.glob(s)
    files = sorted(files)[a.offset:a.offset + a.max]
    c = a.cell
    rows = (len(files) + a.cols - 1) // a.cols
    sheet = Image.new("RGB", (a.cols * c, rows * (c + 14)), (30, 30, 30))
    d = ImageDraw.Draw(sheet)
    for i, f in enumerate(files):
        try:
            im = Image.open(f).convert("RGB").resize((c, c), Image.NEAREST)
        except Exception:
            continue
        x, y = (i % a.cols) * c, (i // a.cols) * (c + 14)
        sheet.paste(im, (x, y))
        label = os.path.splitext(os.path.basename(f))[0]
        label = label.replace("-128x128", "").replace("_128x128", "")[-16:]
        d.text((x + 2, y + c + 1), label, fill=(255, 255, 0))
    sheet.save(a.out)
    print(a.out, len(files))


if __name__ == "__main__":
    main()
