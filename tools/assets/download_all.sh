#!/usr/bin/env bash
# Re-runnable batch download of every pack used by KEFAL COMPANY (skips files already present).
# All packs are free / name-your-own-price; licenses verified on each itch.io page (see CREDITS.md).
# Usage: bash tools/assets/download_all.sh [group]   (group: textures|sounds|models|big; default = all)
set -u
cd "$(dirname "$0")"
export PYTHONIOENCODING=utf-8
G="${1:-default}"
dl() { echo; echo ">>> $*"; python itch.py download "$@" || echo "!!! FAILED: $1"; }

if [[ "$G" == "default" || "$G" == "textures" ]]; then
  dl https://screamingbrainstudios.itch.io/tiny-texture-pack --match '128x128\.zip$'
  dl https://screamingbrainstudios.itch.io/tiny-texture-pack-2 --match '128x128\.zip$'
  dl https://screamingbrainstudios.itch.io/tiny-texture-pack-3 --match 'Small\.zip$'
  dl https://screamingbrainstudios.itch.io/horror-texture-pack --match '128x128\.rar$'
  dl https://screamingbrainstudios.itch.io/mini-texture-pack-1 --match '128x128\.rar$'
  dl https://flakdeau19.itch.io/pixel-art-texture-pack-256x256 --match '^PNG'
fi

if [[ "$G" == "default" || "$G" == "sounds" ]]; then
  dl https://obsydianx.itch.io/horror-sfx-volume-1 --match '^\(OGG\).*(Free Pack|Drones 1|Stingers 2)\.zip$' --exclude 'Glitch'
  dl https://obsydianx.itch.io/interface-sfx-pack-1 --match 'OGG$'
  dl https://liminal-space-dev.itch.io/free-horror-sfx-sounds
  dl https://phlegmlee.itch.io/horror-sound-pack
  dl https://stormyman.itch.io/goofy-sounds-for-scary-monsters
  dl https://cluckfox.itch.io/rain-and-thunder
  dl https://kronbits.itch.io/freesfx
  dl https://loadless.itch.io/scifi-sfx-1 --match 'mp3_mono\.zip$'
fi

if [[ "$G" == "default" || "$G" == "models" ]]; then
  dl https://quaternius.itch.io/lowpoly-animated-monsters
  dl https://quaternius.itch.io/animated-easy-enemies
  dl https://quaternius.itch.io/lowpoly-robot
  dl https://quaternius.itch.io/lowpoly-animated-fish
  dl https://quaternius.itch.io/textured-lowpoly-trees
  dl https://quaternius.itch.io/150-lowpoly-nature-models
  dl https://kenney-assets.itch.io/survival-kit
  dl https://kenney-assets.itch.io/space-station-kit
  dl https://kenney-assets.itch.io/conveyor-kit
  dl https://daniel-jurys.itch.io/psx-derelict-furniture --match 'Standard'
  dl https://daniel-jurys.itch.io/psx-waste
  dl https://chilly-durango.itch.io/3d-retro-plumbing-wiring
  dl https://valsekamerplant.itch.io/psx-style-modular-vents
  dl https://valsekamerplant.itch.io/psx-style-barriers
  dl https://kkryy.itch.io/retro-interior-pack
  dl https://godgoldfear.itch.io/psx-industrial-environment-asset-pack --match '\.glb$'
  dl https://styloo.itch.io/random --match 'RandomObjects\.zip'
  dl https://kaylousberg.itch.io/space-base-bits --match '^Free$'
  dl https://kaylousberg.itch.io/resource-bits --match '^Free$'
fi

if [[ "$G" == "default" || "$G" == "big" || "$G" == "sounds" ]]; then
  dl https://nihil-existentia.itch.io/free-audio-asset-collection --match 'Underground Facility' --max-mb 600
fi

# round 2 (new interior themes) - then: python tfg_textures.py && python tfg_audio.py && python models_r2.py && python manifest.py
if [[ "$G" == "r2" ]]; then
  dl https://eclair-assets.itch.io/furniture-kit-glb-pack-140-free-cc0-3d-models
  dl https://ggbot.itch.io/psx-style-cars
  dl https://gibbongl.itch.io/backrooms-low-res-textures --match 'png'
  dl https://tiltamoose.itch.io/psx-boxes --match 'psx_boxes\.zip'
  dl https://kaylousberg.itch.io/halloween-bits --match '^Free$'
  dl https://naivegoblin.itch.io/cc0-backrooms-asset-pack --max-mb 150
  dl https://gregor-quendel.itch.io/free-water-stream-sounds --max-mb 250
fi
