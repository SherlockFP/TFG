# Wave 12 - MOONS12 (module `moons12`): two moons with their own goal

Owner decision: maps may have different goals and places. Both moons are ordinary facility moons (outdoor + interior) whose outdoor half has a goal that is not "collect scrap".
Identity: a company crew inside the live stream of The Algorithm; each moon has one rule you can learn in one landing.

| | CLOUD-9 (`c9sky`) | DEEP CABLE (`dcable`) |
|---|---|---|
| route board | tier 3, cost 420, x1.5 scrap (sparse: 8-11 items), quota-3 rung (`ladderAdd(3)`) | tier 4, cost 780, x1.7 scrap, quota-4 rung (`ladderAdd(4)`) |
| place | 6 rocky islands over an endless white void, a cloud sea below (the plane follows the camera and takes the fog colour), rope bridges, hover pads, ruined server kiosks, drifting rocks | flooded seabed (fog 0x0a4c5b), 4 air domes (glass + green pole = the tell), glass tunnels (long ones have a breach without air), 3 dead server hulks with a lit bay, kelp made of cables, bubbles + marine snow |
| interior | `tower` | `serverfarm` |
| creatures | facility pool only; outdoor `{}` and `outdoorPower 0` (ground creatures cannot path over a void) | facility pool (+ sludge, leech), outdoor Worm 8 / Troll 8 / mimic 3 |
| GOAL | re-align 3 relay dishes: **hold E at a console**, the dish turns 26 deg/s and slows to 7 deg/s near the target (that is the tell), it locks within 2.5 deg and its beam links to the next dish (chain: d0 -> d1 -> d2 -> the uplink mast on the ship island) | carry 3 **data cores** (`dc_core`, bulky two-hand, carry2: one carrier crawls, two walk near-normal) from the hulk bays to the ship |
| HUD | objective line "Re-align the relay dishes: n / 3", dock chip RELAYS, GUST warning line | objective "Deliver the data cores: n / 3", dock bar AIR (s) + CORES, BEACON countdown bar while a pulse is charging |
| payout | credits: step per dish `0.06*quota+20`, final `0.34*quota+90` (uplink bonus), paid by the host, toast on every peer; a row on the performance report ("CLOUD-9 UPLINK: n / 3 relays aligned +▮X UPLINK BONUS") | step per core `0.05*quota+20`, final `0.30*quota+100`; the core itself is scrap (`0.07*quota+90`, 110-340) and counts for the quota; report row "DEEP CABLE: n / 3 data cores delivered" |

## The rules (and their counterplay)
**Cloud-9**
- *Wind*: gusts every ~21 game minutes, direction from the seed. The **telegraph comes first** (2.4 game min = ~1.8 s): white streaks stream along the wind + a HUD line "GUST INCOMING: crouch to brace"; then the push (3.6 m/s, ramped). **Crouch = 30 % push**. A bridge is 2.6 m wide.
- *Fall* (y < -14 outside the ship): teleported to the ship (`game.spawnInShip`) + `damageLocal(999, 'fall')` = downed at the ship (downed.js: the crew revives), 6 s of dizziness (x0.6 speed), the host bills a retrieval fee (`min(credits, 40)`).
- *Hover pad*: step on the glowing pad and hold still 0.9 s (a light column shrinks in = the telegraph), you are thrown along an arc to the paired pad on the other island. Links with a gap > 24 m are always pads, ~30 % of the long bridges become pads.
- *Dish console*: label "Hold E: turn the dish", "Relay n: d deg to go". Wrong start angles are 110-250 deg from the target; the whole job is ~10 s per dish once you are there. The dish lamp / ring is amber until locked, then green + a beam.

**Deep Cable**
- *Water*: outside domes / tunnels / ship / interior the crew is "in the water": x0.8 speed, 90 s of air (x1.7 sprinting, x1.6 carrying a core), 7 dmg/s at 0. Dome refills 45 s/s, an intact tunnel 12 s/s. Fog thickens (0.011 in air, 0.022 in water), a teal vignette, muffled audio + bubbles (sound2).
- *Beacon*: while a core is carried outdoors the host counts 8 s; 1.6 s before the pulse the carrier's HUD shows a red BEACON bar and everybody hears a beep (telegraph); the pulse rings out (visible ring), `creatures.noise(pos, 3.4)` makes every hearing creature come, every 2nd pulse a hunter (Troll 60 % / Worm 40 %, max 3 alive) is sent. **Counterplay**: a dome shields it (the timer resets, "The dome shields the beacon."), setting the core down silences it, two carriers walk faster so fewer pulses per trip. The hulk's dome is a 24 m dash from the bay mouth: about one pulse if you hurry.
- *Tell*: every bay has a tall cyan light column (hidden once the core has left), the domes have a green pole, breach ends spark orange with amber hazard posts.

## Files
- `src/game/moons12_core.js` - pure: biomes `cloud9` / `dcable` (+ `terrainHook`), the two `registerMoon` calls (at import), palettes, route-board data, rules (`WIND`, `DISH`, `AIR`, `BEACON`, `payout`, `windAt`, `dishStep`, `airAt`), seeded layouts `planCloud` / `planCable`.
- `src/game/moons12_text.js` - EN / TR / RU (`TX`; a key is an id or the English string itself).
- `src/world/moons12_decor.js` - decor kinds `cloud9` / `dcable` (voyage `Kit`: merged solids + glow; a few standalone meshes the runtime animates: dishes, beams, pad columns, hulk columns; pooled emitters only).
- `src/game/moons12.js` - runtime: wind / fall / pads / dish hold (client), air / beacon (client + host), goal + payout (host), HUD, objectives, performance-report rows, landing-card rows.
- `tools/harness/moons12.test.mjs` - 12 800 checks (registration, ladder, TR/RU, wind telegraph, dish turning, 16 seeds of both layouts incl. connectivity + rim heights + air maths, both decor builders on a stub terrain).

## Shared-file hooks (all one-liners)
`world/terrain.js`: `this.hook = biome.terrainHook(...)` in the constructor, `if (this.hook) h = this.hook.shape(x, z, h)` at the end of `rawHeight`, `if (this.hook?.off?.(x, z, m)) return true` at the top of `blocked()` (every scatter / landmark / outpost pass already asks `avoid` -> `blocked`, so nothing is placed over the void). `routeboard_core` is only used through the existing `ladderAdd`. `game.js`: import + slot.

## Net (prefix `m12`)
`m12req` client -> host `{op:'turn', i, dt}` (every 0.2 s while holding, the host validates reach 5.2 m and clamps dt to 0.35 s) | `{op:'fall'}`. `m12fx` host -> everyone (HOST_ONLY) `{k:'ang'|'lock'|'pay'|'fee'|'banner'|'say'|'tele'|'pulse'|'core'|'shield'}`.
State `game.run.m12 = { m, d, st:'go'|'won', a:[deg x3], l:[0|1 x3], n, of:3, p:paid }` (broadcastRun, late joiners read it; dish angles are synced on lock and 0.7 s after the last turn packet). Cores are ordinary synced items.

## Knobs
`WIND`, `DISH`, `PAD`, `FALL`, `AIR`, `BEACON`, `payout` (moons12_core.js); island sizes / gaps in `planCloud`; wreck / dome / tunnel numbers in `planCable`; moon defs (tier / cost / scrapMul / pools).

## How to see it (console)
`kefal.game.moons12.debug.state()`; Cloud-9: `.tp('dish0')`, `.lock(0)` (host), `.windAt()`, `.fall()`; Deep Cable: `.tp('wreck0')` / `.tp('dome1')`, `.air(10)`, `.cores()`, `.pulse()` (host).

## Not verified (no browser in this pass)
Every look and feel: island silhouette at the 3.2 m height-field resolution (cliffs are one cell wide), bridge deck vs terrain step at the anchors (measured +-0.2 m in node), the white-void fog at day / dusk / night (`sea` plane colour follows `scene.fog`), streak readability, dish bowl orientation, pad arc feel and the teleport ride on remote avatars, wind strength vs bridge width, deep-cable fog cap (`env.fogCap = 0.03` set on mapLoaded), air numbers, beacon spawn balance, carry2 with `bulky` at 46 weight plus the water slow (about 1.4 m/s solo), the terminal moon-info card (not customised), the minimap (`mapart`) on a height range of 130 m. Items thrown over an island edge fall to the cliff base and are lost (part of the penalty). Ground creatures are absent outside on Cloud-9 by design.
