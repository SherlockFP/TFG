# Wave 2 - GRENADES (module `grenades`)

Owner ask: "add bombs - flashbang, smoke etc. - things that can temporarily stop creatures, or rare bombs."
Installed with `this.useModule('grenades', installGrenades)` in `game.js` (the only shared-file edit: the two slot lines).
Files: `src/game/grenades_core.js` (pure rules, node-tested), `src/game/grenades.js` (install: items, throw controller, host effects, visuals),
`src/models/grenades.js` (item + ball models), `tools/harness/grenades.test.mjs`, `tools/harness/wave2_grenades.js`.

## Throwing (all grenades, old and new)
Hold **LMB** with a grenade in hand: a dotted arc with the **predicted bounces** (colour fades white -> orange per bounce) and a landing ring shows
where it will be when the fuse ends. Release = throw. Power `0.42 + 0.58 * hold / 1 s` (tap ~10 m, full ~23 m); holding past 1 s **cooks** it
(each extra second, up to 1.5 s, shortens the fuse by 1 s, never below 0.45 s; beeps in your hand). The throw key (default Q-throw) does a quick 0.35 s throw.
The ball is one small simulation (`stepBall`, gravity 13, restitution 0.42, rolls with drag, sticky charges stick) that **every peer runs identically**;
the fuse LED blinks and it **beeps faster** as it burns. Stacks: one item holds N bombs (`charges`), LMB throws one and decrements (host confirms with `itst`).
Old grenades now use the same path: **stungrenade, craft_cryo (Freeze), craft_molotov, craft_emp, craft_decoy (unified with the Decoy Beacon)**.
Bear trap and other crafted tools are untouched.

## Bombs
| kind (item id) | fuse | radius | effect | noise | source |
|---|---|---|---|---|---|
| Stun Grenade (`stungrenade`) | 2.2 | 12 (LOS) | creatures stunned 5 s (stock `stunbang` fx also whites you out) | 3 | store / chests (old) |
| **Flashbang** (`flashbang`, pack of 3, 60) | 1.6 | 14 (LOS) | creatures stunned 3-4 s (closer = longer), **blind for stun + 2.5 s and drop their target**; each player gets a white-out scaled by distance and facing (looking at it = up to 5 s + ringing + 1.4 s stun), yourself included | 3.5 | store, craft |
| **Smoke** (`smokegrenade`, pack of 2, 55) | 1.2 | 5.5 | 20 s cloud (grows 1.5 s, thins last 2.5 s). Creatures cannot see through it (`creatures.canSee`), chasers lose their target twice as fast; targets < 2.5 m are still seen. Visual: ONE InstancedMesh of 40 soft billboard puffs per cloud, no lights | 0.8 | store, craft |
| **Decoy Beacon** (`decoybeacon`, pack of 2, 45; also the crafted `craft_decoy`) | 1.0 | - | 10 s: every 1.2 s host noise 2.6 (pulls sound hunters) + fake footsteps / mimic voice / whisper at the beacon | 2.6 x8 | store, craft |
| **Sticky Charge** (`stickycharge`, pack of 2, 110) | 2.5 **after it sticks** | 4.2 | sticks to walls, floor and creatures (follows the creature), 100 dmg (x1.25 on the host creature), stun 1.2 s, crew take up to 32 % (max 35) | 4 | store, craft |
| Freeze (`craft_cryo`) | 1.5 | 5 | stun 5 s, silent (reuses crafting's `crfx cryo` visual) | 0 | craft / chests |
| Molotov / EMP | 1.4 / 1.5 | 3.2 / 10 | same numbers as before (fire zone 9 dmg per 0.5 s for 6 s; EMP disables machines 20 s) | 2 / 1.5 | craft / chests |
| **Gravity Well** (`bomb_gravity`, legendary) | 1.8 | 9 | 4 s: pulls movable creatures (<= 6.5 m/s, stuns them) and loose items (<= 6 m/s, impact damage muted) to the point; collapse deals 30 to whatever is within 3.2 m. Throw it at your feet to reel loot in | 2.5 | RARE |
| **Blackout Bomb** (`bomb_blackout`, rare) | 1.6 | 16 | 20 s: every light in the radius is killed through `LightPool.groupFactor` (intensity only, never the light count) + dark dome + screen vignette inside. Dark lovers (lurker, stalker, screamer, mimic, spider) get x1.3 speed, x1.25 damage, x1.4 sight; every other creature only sees you within 3.5 m | 1 | RARE |
| **Confetti Bomb** (`bomb_confetti`, uncommon) | 1.5 | 9 | harmless party blast: partygoer types (jester, clickbait, reply guy, tamagotchi, troll) stunned 5 s, other creatures 1.5 s; every player inside dances 2 s (stock `dance` emote, movement rooted) | 3 | RARE |
| **Glitch Bomb** (`bomb_glitch`, MYTHIC) | 2.0 | 8 (LOS) | non-boss creatures freeze 6 s (paused animation, jitter / stretch / flicker / cyan-magenta slices on every peer), then take 140 (bosses skip the freeze and take 220) | 2.5 | RARE |
| **Cluster Bomb** (`bomb_cluster`, epic) | 1.6 | - | splits into 5 mini bombs (seeded velocities, fuse 1.1-1.5 s, R 3.4, 38 dmg, crew 12 max) | 3.5 | RARE |

Loud ones go through `game.balance?.noise` (feeds the Threat meter). Prices are credits in the Company Store **Consumables** tab; the
four craftable ones have Workbench recipes (`flashbang`, `smokegrenade`, `decoybeacon`, `stickycharge`, pushed into `RECIPES`). **Rare bombs are never sold.**

## Rare drops (host, `RARE_SOURCES` in the core)
Chest opened (`tfg:chestOpened`): iron 7 % (confetti / blackout), gold 40 %, void 80 % (glitch 15 % of those); bosses (`hostOnCreatureKilled`) always one
(cluster 20 / gravity 35 / glitch 25 / blackout 20); legendary creature tier 30 %, mythic 50 %; world: 28 % per landing, one bomb on a random scrap spot.

## Net (all `gr*`)
* request `grth {id, o, v, ck}` client -> host: host checks holder, item type, 0.3 s rate limit, origin <= 5 m from the thrower, clamps speed, consumes one charge, spawns the ball.
* broadcast `grfx` (added to `HOST_ONLY` at runtime): `th` thrown, `sk` stuck (wall pos + normal, or creature id + offset), `bm` boom (+ zone info), `gl` glitch (frozen creature ids),
  `dz` decoy pulse, `ge` gravity / glitch end. Clients only accept it from the host. The host alone runs fuses, effects and zones.

## Hooks outside the module (all instance wraps, restored in `dispose()`)
`game.useHeldPress` + `game.dropHeld` (LMB / throw key), `game.hostOnCreatureKilled` (rare drops), `creatures.canSee` / `speedMul` / `attack` (smoke, blackout, blind),
`lights.groupFactor` (blackout), `player.update` (dance root), `HOST_ONLY.add('grfx')`. Item defs / recipes / translations (EN + TR) are registered at import.

## Verification and what is NOT verified
* `node tools/harness/grenades.test.mjs`: 136 checks (arc prediction vs the analytic parabola, bounce / roll / rest / sticky, 30 vs 60 fps determinism, fuse + cook table, beep curve,
  effect radii / durations table, smoke chords, flash exposure, rare tables). `npm run build`, `node --check` all clean.
* Headless (`tools/harness/wave2_grenades.js`, host only, no screenshots): throw path + stack 3 -> 2, flashbang (stun 3.6 s, blind 6 s, target dropped, screen flash 0.73),
  decoy zone + noise, sticky stuck to a creature (128 -> 3 hp), gravity pulled a creature 2.7 -> 0.3 m and a Big Bolt 1.9 m, blackout light factor 1 -> 0.03 and lurker speed 8 -> 10.4,
  confetti dance + 4.7 s / 1.2 s stuns, glitch freeze then kill, cluster -> 5 minis, void chests -> 20 rare items of 25, no page errors or warnings. (First run found a bug: the
  fell-out-of-the-world check was absolute but the facility sits at y = -300; it is relative to the throw now.)
* **Not verified:** the aim preview / cook bar (needs a real held mouse button), smoke blocking in the headless check (the test creature wandered next to the player, so the < 2.5 m
  near-see rule applied; the chord math itself is node-tested), everything with 2+ real players, how the visuals look (no screenshots), the ringing / flash feel, balance numbers
  (all design numbers), inventory icons of the new models, Turkish strings read by a human.
