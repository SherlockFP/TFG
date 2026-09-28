# Wave 2 - MIRROR DIMENSION (module `mirror`, MASTERPLAN §16)

`game.mirror` (`this.useModule('mirror', installMirror)`). Status: **node-tested + builds; NOT run in a browser** (the browser lock queue was frozen for this
session). Everything visual, the shader, net paths and feel are unverified. Debug: `kefal.game.mirror.forcePortal(x, z)`, `.enter()`, `.exit()`, `.debug()`,
`.combat.grantXp(n)`, `.combat.give('shards')`.

## Files
| File | Role |
|---|---|
| `src/game/mirror.js` | install: portal placement + interaction, host-owned membership, wave director, meter / chests / loot flags, death rules, all net + shared-code wraps |
| `src/game/mirror_waves.js` | PURE: countdown, overtime, wave scaling, roster weights, membership filter, respawn / wipe / rescue rules, portal roll |
| `src/game/mirror_upgrades.js` | PURE: 8 upgrades, rolls, dimension level curve, Reflection Meter thresholds + rewards, tier-luck bump |
| `src/game/mirror_creatures.js` | Reflection Wraith / Flame Fiend / Mirror Copy (registerCreature + host AI); fodder = horde `zombot` flagged `data.mirror` |
| `src/game/mirror_combat.js` | local Vampire-Survivors kit: auto-bolt, shards, fire aura, dash (`N`), XP crystals, level-up 3-card choice, batched `hit` requests |
| `src/render/mirrorfx.js` | GLSL for the dimension look + `installMirrorFx` (eases `uMir`) + instanced visuals (crystals, bolts, shards, fire, rings, aura) |
| `src/models/mirror.js` | portal mirror (black + silver frame, rippling surface shader), 3 creature models (shared geo / materials), other-dimension silhouette |
| `src/ui/mirror_ui.js`, `src/game/mirror_i18n.js` | timer / meter / cards / cracked / SHATTERED DOM; EN + TR + RU strings |
| `tools/harness/mirror.test.mjs`, `tools/harness/wave2_mirror.js` | node test (PASS) / headless script (written, NOT run) |

## Shared-code hooks (all tagged `[mirror]`)
- `src/game/game.js`: the two slot lines only (`import { installMirror }`, `this.useModule('mirror', installMirror)`).
- `src/core/engine.js` (6 small spots): import of the GLSL snippets; `POST_FS` became `postFS(MIR)` (base = byte-identical shader, `MIR` = the dimension variant with 3 snippets spliced in);
  `uMir` uniform; a second `ShaderMaterial` `postMatMirror` sharing the uniforms + `postQuad`; `this.mirrorHook?.(u, dt)`; the per-frame material switch.
  The dimension look is a **separate program**: if it fails to compile (`onShaderError` in `installMirrorFx`) the normal game is untouched, `engine.mirrorBroken` disables the flip and the mirrored controls.
- No `localplayer.js` change: mirrored A/D and mouse X are instance wraps of `input.isDown` / `input.consumeMouse` while inside.
- Instance-level wraps (restored in `dispose`): `creatures.playersFor` + `hear`, `game.hostOnCreatureKilled`, `hostOnPlayerDied`, `die`, `deathText`, `pickup`, `ui.blocksInput`, `input.isDown`, `input.consumeMouse`.
- Net (prefix `mr`): request `mr {op: go|hit|chest|crack}`; host->all `mrfx {k: mem|mobs|items|kill|chest|chestopen|fire|burst|crack|respawn|pu|reward|shatter|lost|rescue|clear|sync}` (HOST_ONLY).

## Portal
~25% of outdoor maps (`hasPortal`: seeded roll `RNG(run.seed ^ hash('mirror:'+moon))`), **never before sector 1** (`run.quotaIndex >= 1`) and never at HQ. Deterministic on every peer: 40..~110 m from the ship,
`outdoor.avoid` (path, entrance, fires, ponds, landmarks) + >= 24 m from the ship <-> facility path, slope < 0.9 m over 3 m, a downward ray must hit terrain (no tree / rock). Frame has 3 static colliders.
Whisper (`whisper_1..3`) plays within 30 m every 5-11 s. Prompt `Step into the mirror [E]` (reach 3.8 m); host accepts within 7 m.

## The rules (owner + design)
| Rule | Number |
|---|---|
| Countdown after stepping in | **3:00** (`LIMIT_S 180`), per player. Last 30 s: screen cracks (SVG overlay grows) + `glass_break` at 30/15/10/5/4/3/2/1 s |
| Overtime | past 0:00: level +1 every **20 s** (`OT_STEP_S`); ASCII glitch ramps 0.35 -> 1; +2 creature levels per step, groups +1 per step, spawn interval -0.4 s per step (floor 0.9 s), elites from OT2 (10% per step, cap 50%), fiends / copies weighted up |
| Wave cycle ("round") | **38 s** (`ROUND_S`); wave size + level grow with time inside (per player, host clock) |
| Death inside | **cracked reflection**: you sit out **one round** (`RESPAWN_S 38`), respawn at the mirror with 75% HP **only while a crewmate inside is alive**; your dimension loot drops at the mirror (normal loot again). No fine, no body |
| Wipe | everyone inside dead at the same time -> **SHATTERED** splash, real death for all (`mirrorshatter`, normal death path, dimension loot consumed); if that is the whole crew the normal all-dead flow runs |
| Last living member walks out | cracked crewmates still inside are **pulled out alive** (`rescue`) instead of shattering |
| Day ends / ship takes off | anyone still inside dies "lost in the reflection" (`mirrorlost`) |
| Fall / void / left-behind causes | skip the cracked rules (real death) |

## Waves (host director, per player inside, `mirror_waves.js`)
- `round = floor(t/38)`, `ot = overtime level`. Spawn group every `max(0.9, 3.2 - 0.25*round - 0.4*ot)` s (+-15%), size `min(7, round((1 + floor(round/2) + ot) * balanceSpawnMul(0.5..2)))`.
- Live cap `min(50, round((10 + 3*round + 5*ot) * (1 + 0.35*(players-1))))` - **hard cap 50** dimension creatures. Creature level `1 + floor(sector/2) + floor(round/2) + 2*ot` (max 14; +18% hp / +10% dmg per level via `creatureLevelStats`, and the balance module scales hp / hit damage on top = "wave power x game.balance").
- Roster weights: Zombie Account fodder `max(14, 40-4r)`, Wraith `30+2r`, Flame Fiend `12+2r+3ot` from round 1, Mirror Copy `8+2r+3ot` from round 2.
- Spawn at 13-26 m around the player (outdoors terrain; in the facility on nav cells >= 7 m away, wraiths anywhere).

| Creature | HP / dmg / speed | Behaviour |
|---|---|---|
| Reflection Wraith (`mr_ghost`) | 22 / 9 / 2.7 | phases through walls and floats at the nearest player, touch after a 0.5 s wind-up, cd 1.3 s |
| Flame Fiend (`mr_fiend`) | 42 / 12 / 4.0 | chases, leaves a fire patch every 0.7 s (4.5 s life, 5+ dmg / 0.5 s while standing in it), 0.45 s wind-up, **bursts on death** (3.2 m, 1.6x dmg, 0.5 s delay) |
| Mirror Copy (`mr_copy`) | 60 / 14 / 4.4 | crew look-alike, 0.55 s telegraphed strike, reach 1.7 m |
| Zombie Account (horde) | 18 / 5 / ~1.5 | fodder, `data.wave = 90000` so it always hunts |

Kill value (crystal XP = meter value): fodder 4, wraith 7, fiend 12, copy 20, x2.2 elite.

## Dimension level + upgrades (local, gone on exit / death for real / day end)
XP crystals drop where a creature died (personal copy on every client inside), auto-magnet within **3 m** (Gravity Well +2 m per level). `xpToNext(L) = 20 + 12L + 1.5L^2` (34, 51, 71 ... 290 at L10), cap level 15.
Each level-up pauses input (world keeps running, incoming damage x0.15, auto-pick after 7 s) and shows 3 big cards: **1 / 2 / 3 or click**.
| Upgrade | Max | Effect per level |
|---|---|---|
| Sharpened Glass | 5 | +12% damage (bolts, shards, aura, and melee / ranged multipliers through the `stats` event) |
| Quicksilver | 5 | +7% move speed |
| Mirror Shards | 5 | level+1 shards orbit at 2.1 m, 9 dmg per touch (0.55 s per-target cooldown) |
| Burning Reflection | 5 | fire aura 2.4 + 0.4L m, (4 + 3L) dmg every 0.5 s |
| Twin Bolt | 4 | +1 bolt per volley (base kit already has 1 auto-bolt: 7 dmg, 16 m, 1.1 s cd x0.94^L, 26 m/s) |
| Vampiric Sliver | 4 | heal 4% of dealt damage (batched, max 12 HP per 0.4 s) |
| Gravity Well | 4 | crystal magnet 3 + 2L m |
| Shatter Step | 3 | dash `N`: 6 + 1.5L m in 0.18 s, 0.3 s i-frames, cooldown 5.4 - 0.7L s |
Damage goes to the host as batched `mr hit` requests (max 14 entries, 60 dmg each, 26 m reach, 1800 dmg / s per player budget); the existing weapons work against dimension creatures unchanged.

## Reflection Meter (crew-wide, host)
Fills with every dimension kill (values above). Threshold k needs `60 + 70k + 5k^2` (60, 135, 220, 315, 420 ...). Each threshold: a **Reflection Chest** near a random living player (iron for k0-1, gold k2-3, void k4+; open with **E**,
loot from `crafting.rollChestLoot` / `fallbackChestLoot`, item tier bumped one step with chance `min(0.8, 0.15 + 0.1k)` = tier luck, value x1.15) and a random **power-up** (powerups.js pool via `game.anomaly.grant`) for every living player inside.
Chest loot is flagged dimension loot: visible / pickable only inside; carried out it becomes normal loot; loot left on the ground is lost with the dimension.

## Visibility rules ("host filters targets")
Membership is host-owned and synced (`mem`). Dimension creatures / chests / loot: visible and hittable only to players inside (instance `hidden`/`audible` override on `CreatureView`, root detached for outsiders, item meshes hidden);
their AI targets only players inside; normal creatures do the reverse (they ignore players inside and are hidden from them). XP / coins for a dimension kill go only to the crew inside. Players in the other dimension show as
faint additive silhouettes (avatar hidden). Light count untouched (portal is shader-emissive, no lights).

## The look (`uMir`, post shader)
Screen-space horizontal flip (+ mirrored A/D and mouse X), dark palette ramp (black-violet -> plum -> silver, 22% of the original hue kept), red-purple depth fog (sky fully fogged), thick bright 2 px depth outlines with a low threshold,
ASCII: one texture read per 5x8 low-res-px cell, 5 procedural glyph levels (`. : + # block`) from cell luminance, 65% mixed over the graded image; overtime glitch tears rows and randomises glyphs.
Known limit: DOM labels projected from world space (scan labels, ping markers) sit at their un-flipped x while inside.

## Untested / risks (be honest)
Never run in a browser: shader compile (protected: falls back to the normal pass), portal placement on real maps, portal collider feel, model proportions, cards layout, all 2-player message paths, late-join `sync`, `hear` / `playersFor` wraps against every
behaviour (some behaviours read `aiPlayers()` directly and could still notice players in the other dimension), zombot fodder flag (`data.mirror`) surviving horde's own logic, dash feel (velocity reset each frame), lifesteal / dash numbers, whether item hiding
leaves a pickup prompt for outsiders (pickup itself is refused), spectating while cracked follows any living remote (also ones outside). Numbers are design values from `tools/harness/mirror.test.mjs`, not playtested.
