#!/usr/bin/env bash
# Full asset pipeline: download (skips existing) -> extract -> textures -> audio -> models (Blender)
# -> manifest.json + CREDITS.md -> three.js load check.
# Usage: bash tools/assets/build_all.sh [--no-download]
# Needs: Python 3.11 (+ Pillow, numpy, httpx), Blender 5.x (path in models.py), Node (for the check).
# python-soundfile (OGG Vorbis encoder) is installed locally into tools/raw/.pydeps on first run.
set -eu
cd "$(dirname "$0")"
export PYTHONIOENCODING=utf-8
if [[ ! -d ../raw/.pydeps/soundfile_data && ! -f ../raw/.pydeps/soundfile.py ]]; then
  python -m pip install --target ../raw/.pydeps soundfile
fi
[[ "${1:-}" == "--no-download" ]] || bash download_all.sh
python extract.py
python textures.py
python audio.py
python models.py
python manifest.py
(cd ../.. && node tools/assets/validate_glb.mjs)
