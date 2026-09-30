# Wave 11 - SHIFT11: the RECYCLE BIN labyrinth (layout changes while you are inside)

Module `shift11`. Identity: the facility is the Algorithm's storage, and the storage is full. A janitor PA announces "EMPTYING RECYCLE BIN IN 10"; ten seconds later a room is permanently deleted and the corridors re-route.

## The rules a player learns
1. Every ~60-90 s (host clock; it only runs while somebody is indoors) the PA chimes and says `EMPTYING RECYCLE BIN IN 10`. A red HUD strip counts down and points at the marked sector (arrow + grid label like `C4` + metres).
2. **Marked sector** (a room): its floor cells flash red, red strips pulse along its walls (floor and ceiling line), its doorway shutters blink. At zero it is DELETED: the doors seal (black `DELETED` steel shutters drop on the outside face), the floor turns into a dead-signal tile. Anyone still inside is ejected to the nearest doorway (30 dmg on 404, 22 on Chatroom, **never lethal**, only local player is moved by his own client), every scrap / big / trinket lying in it is shredded (host `it rm`), creatures inside are shoved out. Tools and worn gear are safe (sealed, come back). Two shifts later it is RESTORED (green flash, "Sector C4 restored", host spawns fresh loot = ~60 % of what was shredded, plus a 50 % chance of one extra).
3. **Junk towers** (corridor shutters): 1-2 towers drop from the ceiling and close a corridor, 1-2 others retract and open one. Amber blink = will close, cyan blink = will open, floor mark under each. A shutter never closes on the local player: it waits half-raised until he steps out.
4. Fair: 10 s telegraph, sound (`s11_pa`, 5 countdown ticks `s11_tick`, `s11_rail` at the three nearest moving shutters, `s11_purge` heard across the map), every change visible before it happens (warn previews `plan.stepAt(n)`).

## How it works
- `shift11_core.js` (pure): `planShift(layout, {exclude})`. Gates = shutters on layout edges: **rail** (corridor-corridor plain opening, >=3 cells from entrance / fire exits, spaced) or **seal** (each open doorway leaving a sector, placed 0.62 m into the OUTER cell so the door frame is untouched). Sectors = ordinary rooms of 1-16 cells that are reachable, not entrance / vault / core / generator / containment / hero / story / treasure / arena / system rooms (`busyRooms(fac)` reads `fac.sys`, fire exits, vault chests) and hold no entry cell. State = `{closed[rail], del[sector], queue}`; step n -> n+1: restore the oldest deleted sector once two are deleted, open 1-2 rails, close 1-2 rails, delete a new sector; each accepted change is verified by a BFS from `entrySources` (every originally reachable, not deleted cell stays reachable), else it is dropped. Steps are generated lazily from `hash(layout seed, n)` and cached, so all peers get the same sequence. A layout where fewer than 4 of the first 8 steps can change anything (tree-like small maps) makes `plan.ok = false` and the module stays off. `planShift().signature(n)` = digest for tests.
- `shift11.js` (runtime): built from `mapLoaded` on every peer (moon in `SHIFT_MOONS` / `moon.shift11` / `debug.force()`): one Rapier static box per gate toggled with `collider.setEnabled` (no create / destroy at runtime, like the maps5 stacks), instanced meshes for rails (`s11_junk`), seals (`s11_bin`), glow strips, floor marks, sector flash / void cells / perimeter strips (no THREE lights). Nav: rails use `nav.blockedEdges`, a deleted sector zeroes its sub-cells in `nav.walk` (and restores exactly the ones it cleared). Timing is host only; the messages carry only the completed step count `n` so a missed message heals; `set` (late joiner, via `s11sync`) applies the state instantly and resumes an in-flight warning.
- Reuse: the maps5 stack-shift approach (planner + collider toggle + `hold` for the local player), facility nav, `hostSpawn` / `it rm` item events, `hudDock`, `algoVoice` speech setting (PA is read out when the owner enabled it).

## Net
`s11` (HOST_ONLY, host -> all): `{k:'warn', n}` (preview of step n-1), `{k:'go', n}`, `{k:'set', n, w?, wn?}`. Request `s11sync`. No other traffic: ejection / damage are applied by each client to itself.

## Files
`src/game/shift11.js`, `shift11_core.js`, `shift11_text.js` (TR + RU, PA lines), `src/render/shift11_textures.js` (`s11_junk`, `s11_bin`, `s11_void`), `src/audio/sfxlib_s11.js` (+2 lines in `sfxlib.js`), `game.js` (own import + slot), `tools/harness/shift11.test.mjs`.

## Knobs
`SHIFT_MOONS` (dmg, first delay, gap range), `WARN` (10 s), `THICK`, `CLOSE_T` / `OPEN_T`, `LOSE_KINDS`, core `S11` (rail spacing, entrance gap, sector size 1-16, seal offset), restore loot factor 0.6 in `hostRestore`, rail count (`maxRails`, 4-16).

## Debug (console)
`kefal.game.shift11.debug.force()` (enable on any facility), `.status()`, `.warnNow()` (host: warning now, shift in 10 s), `.shiftNow()` (host: warn + go at once), `.tpToSector()` (stand at the door of the next marked sector), `.tpInto()` (stand inside it to test the ejection), `.tpToRail(i)`.

## Test
`node tools/harness/shift11.test.mjs`: 5 themes x 3 sizes x 3 seeds planner (legal edges, 30 states x independent BFS, <= 2 deleted, restore age, determinism), TR/RU tables, sounds render, runtime on a stub game (colliders + nav + sector cells follow warn / go / set, host timing 40 s / 50 s, ejection + non-lethal damage, shutter holds for the player, skip-ahead, client has no director, sync answer, dispose removes colliders). Neighbours green: `sfx`, `maps5_install`; `vite build` ok.

## Not verified (no browser)
Look of the junk-tower texture and void tiles, red strips at wall base (may z-fight with baseboards), HUD strip position above the hotbar, PA volume, whether 10 s is enough on the biggest maps to leave a far sector, eject landing spot in cramped doorways, shutter / prop overlap in corridors that carry hazards, creature reaction when a rail closes on their path (they re-path on the next tick), item physics if a loose item is under a closing shutter.
