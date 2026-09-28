#!/usr/bin/env python3
"""
Extract every archive in tools/raw/<pack>/ into tools/raw/<pack>/_x/<archive-stem>/ (recursively
for nested archives). zip via zipfile, rar/7z via Windows' bundled bsdtar (tar.exe / libarchive).
Never executes anything from the archives.

Usage: python extract.py [pack_dir_name ...]      (default: all packs)
"""
import os
import subprocess
import sys
import zipfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
RAW = os.path.join(ROOT, "tools", "raw")
TAR = r"C:\Windows\System32\tar.exe"
ARCH = (".zip", ".rar", ".7z")


def safe_zip_extract(zpath, out):
    with zipfile.ZipFile(zpath) as z:
        for info in z.infolist():
            name = info.filename
            try:  # zip names without the UTF-8 flag are cp437-decoded by python
                if not (info.flag_bits & 0x800):
                    name = name.encode("cp437").decode("utf-8")
            except Exception:
                pass
            name = name.replace("\\", "/")
            if name.startswith("/") or ".." in name.split("/"):
                continue
            if "__MACOSX" in name or name.endswith(".DS_Store"):
                continue
            dest = os.path.join(out, *name.split("/"))
            if name.endswith("/"):
                os.makedirs(dest, exist_ok=True)
                continue
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            with z.open(info) as src, open(dest, "wb") as dst:
                while True:
                    b = src.read(1 << 20)
                    if not b:
                        break
                    dst.write(b)


def extract(path, out):
    os.makedirs(out, exist_ok=True)
    low = path.lower()
    if low.endswith(".zip"):
        try:
            safe_zip_extract(path, out)
            return True
        except Exception as e:
            print("   zipfile failed (%s), trying bsdtar" % e)
    r = subprocess.run([TAR, "-xf", path, "-C", out], capture_output=True, text=True)
    if r.returncode != 0:
        print("   bsdtar error:", r.stderr[:300])
    return r.returncode == 0


def process_dir(d):
    xroot = os.path.join(d, "_x")
    todo = [os.path.join(d, f) for f in os.listdir(d) if f.lower().endswith(ARCH)]
    done = set()
    while todo:
        a = todo.pop(0)
        if a in done:
            continue
        done.add(a)
        stem = os.path.splitext(os.path.basename(a))[0]
        if a.startswith(xroot):
            out = os.path.join(os.path.dirname(a), stem + "_x")
        else:
            out = os.path.join(xroot, stem)
        if os.path.isdir(out) and os.listdir(out):
            pass
        else:
            print("  extracting", os.path.relpath(a, RAW))
            extract(a, out)
        for dp, dn, fn in os.walk(out):
            for f in fn:
                if f.lower().endswith(ARCH):
                    todo.append(os.path.join(dp, f))


def main():
    names = sys.argv[1:] or sorted(n for n in os.listdir(RAW)
                                   if os.path.isdir(os.path.join(RAW, n)) and not n.startswith("."))
    for n in names:
        d = os.path.join(RAW, n)
        print("==", n)
        process_dir(d)


if __name__ == "__main__":
    main()
