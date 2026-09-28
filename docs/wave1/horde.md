# Wave 1 — HORDE (new creature families)

Owner request: *"yaratıklar çok güçlü — başlangıçta güçsüz ve yavaş olsun… maplerde random zombi gibi şeyler olabilir,
hafif vampire survivors kafası… NPC'ler saldırabilsin, bazı maplerde silahlı olabilirler, bıçaklı, asker gibi, başka
gemiler seni basabilir… The Mimic"*. MASTERPLAN §5.7.

## Files
| File | Role |
|---|---|
| `src/game/horde.js` | `installHorde(game)` → `game.horde`. Host directors (swarm waves, ambient groups, invasions, death hooks), client FX (banner, dock, tracers, barks, shove, mop, dropship beam), Doppel disguise, pistol use |
| `src/game/creatures_wave1.js` | `registerCreature` defs + host behaviours, spawn weights (`EXTRA_SPAWNS`), state sounds, items, TR strings |
| `src/models/creatures_wave1.js` | models: instanced `SwarmRenderer`, soldiers + Doppel (avatar based), Collector, Janitor, nest, bin, items |
| `src/game/camera_item.js` | Instant Camera: photo render → polaroid HUD, mimic reveal/stun (`hcam` host request) |
| `tools/harness/wave1_horde.js` | headless feature check (see Testing) |
| `src/game/game.js` | **only** the two placeholder lines: `import { installHorde }` + `this.useModule('horde', installHorde)` |

No other shared file is edited. Everything registers through `registerCreature`, `registerItem`, `EXTRA_SPAWNS`,
`STATE_SOUNDS`/`LOOPS`, `window.__kefalMods.creatureModels/itemModels` and mod events.

## Creatures (all host-authoritative, run inside `CreatureManager.hostUpdate`)
| id | Name | HP / dmg / speed | Behaviour & telegraphs |
|---|---|---|---|
| `zombot` | Zombie Account | 18 / 5 / walk 1.0, run 1.55 | Shambling fodder with glitching default-avatar screen faces. Ambient ones aggro within ~18 m (sight / hearing), wave ones always hunt. Indoors: shared **flow field** per hunted player (one `nav.distanceField` per player per ~1 s), bodies descend the gradient, separation keeps them spread. Closed doors: they pound on them (~2.2 s) until the door gives. Attack wind-up 0.38 s. Death: glitch + spark burst, de-rez flicker, body removed after 2.6 s. XP 7, 10 % component drop |
| `hs_enforcer` | *Faction* Enforcer | 80 / 20 / run 4.6 | Knife. **Wind-up 0.6 s** (crouch, blade back, growl) → 8.5 m/s lunge in a *locked* direction (sidestep) → 0.7 s recover |
| `hs_gunner` | *Faction* Gunner | 65 / 12 / run 3.8 | Pistol. Keeps 5–14 m, **laser sight 0.8 s** on the target before every shot (world-space beam + dot, clipped by walls). Accuracy 32 % early (+6 %/sector, +10 % leader alive, − target speed / distance / crouch). 6-round mag → reload 2.2 s, searches cover (nav cell without LOS) first. After a hit 40 % seeks cover |
| `hs_leader` | *Faction* Squad Leader | 130 / 10 / run 3.6 | Slower pistol (1.0 s aim, 7–17 m). **Barks orders** (floating radio text + static). Alive = squad aims (0.65 s) and moves 15 % faster. Death → "LEADER DOWN!", squad breaks and scatters 2.5 s |
| `doppel` | The Doppel | 110 / 26 / walk 1.6, run 5.0 | Copies a **real crew member**: suit, hat, name tag + title, footsteps, recorded voice clips (`voice.js` skinwalker clips via `fx hdvoice`), opens doors, follows the crew in/out of the facility. Tags along with groups; stalks a lone target from behind; **strikes only when ≤1.6 m, the target is alone and nobody is looking** (0.32 s wind-up), then hunts 6 s. Photographed → revealed (red outline shell, red eyes, name tag `???`) + stunned 3 s, then permanently hostile |
| `collector` | Collector | 55 / 8 / run 5.6 | Skittish pack-rat bot. Picks a **nest** in a far room (spawns the `hoardnest` prop + seeds 1–3 scrap), steals loose scrap (nobody within 2.5 m), grabs a second item if one is right there, runs home and drops the pile. Backs off from anyone within 4.2 m. **Hit → drops everything** and bolts; hit 3× in a row while cornered → bites |
| `janitor` | Janitor Bot | 140 / 18 / walk 1.5 | Spawns a `janitorbin` (LOST+FOUND). Priorities: bin dropped tools/weapons/consumables/components → **close open doors** (never on a player, leaves a door alone for 45 s once re-opened) → **mop blood trails** (collapses the set-piece decal quads) → patrol. **Shoves** players blocking it (0.6 s) with a bark. Hostile only when hit (25 s, mop swing 0.45 s wind-up) |
| `hoardnest`, `janitorbin` | props | — | hazard creatures (like webs): replicated, late-join safe, scannable |

Faction ids / colours (armband, visor glow, laser, name prefix): `algorithm` red, `archive` cyan, `bureau` white/blue,
`darkweb` green. The soldier creature **seed encodes the faction** (`seed % 4` = index into `FACTIONS`), so the model
factory needs no extra net field.

## Spawning
- **Spawn tables** (`EXTRA_SPAWNS`, tier 1..4 weights, interior multipliers): `collector` in [4,5,5,6] (max 2),
  `janitor` in [3,4,4,5] (max 1), `doppel` in [0,3,5,6] (tier 2+, max 1), `zombot` out [4,5,6,7] (a single generic
  spawn calls a pack of 2–4). Soldiers are `noSpawn` → only invasions / `spawnHitSquad`. The generic path keeps the
  existing caps, power budget and the 90 s early-safe window.
- **Ambient groups** (seeded from `run.seed`): tier + (sector≥3) groups of 3–5 zombies, 55–105 m from the ship and
  ≥35 m from the main entrance.
- **Swarm waves** (host): night (18:30, second at 21:30 from sector 1 or threat ≥ 60, only while someone is outside),
  facility alarm (`tfg:facility` payload mentioning alarm/lockdown, max once per 90 s), extraction (`tfg:extraction`).
  3–5 waves over 60–90 s; wave size `6 + 1.5·sector + threat/12 + 1.6·(wave−1)` × balance spawn multiplier, clamped
  6–20, total alive ≤ 40. Outdoors they rise from the ground 42–56 m around the crew centroid (2–3 entry points),
  indoors at vents / scrap spots 14–55 m away. Banner `WAVE n/N`, dock widget, objectives line, `SWARM CLEARED`
  + XP bonus when the last wave dies.
- **Invasions**: `tfg:war {faction, on}` → 60 % per landed day (100–210 s in) a dropship beam + `⚠ <FACTION> SQUAD HAS
  INVADED THIS SECTOR` + banner, squad of 3–5 lands 55–75 m from the ship. **Contested moons**: deterministic 22 % of
  tier ≥ 2 moons per run (hash of runId + moon id) get a random-faction squad and a landing warning. Squads sweep rooms
  near the crew, react to noise, share contacts, follow the crew through the main entrance.
- Loot: Enforcer machete 35 %, Gunner **Squad Pistol** 40 % + **Pistol Magazine** 50 %, Leader pistol 65 % / mag 60 %
  / scrap 50 %, components via `game.crafting?.dropComponents(pos, kind, n)` (kinds `swarm|soldier|collector|janitor|doppel`;
  falls back to spawning `comp_*` items). Squad wiped → XP bonus.

## Items
- `instacam` Instant Camera (store ▮45, 8 film). LMB: flash (reuses the `itool` flash fx: pooled light + crewmate
  dazzle), renders the actual camera view to a 208² target, develops it (warm instant-film grade, vignette, grain) and
  slides a **polaroid** onto the HUD for ~5.5 s. Mimics in frame (Doppel **and** the built-in Deepfake) are rendered in
  their true form (black stretched silhouette) + glitch slices / RGB split / `???`; caption `IT'S NOT <NAME>`. Host
  request `hcam {ids, daze}` validates type + range, reveals + stuns 3 s (+40 XP); other non-boss creatures within 8 m
  are dazzled 0.7 s.
- `hs_pistol` Squad Pistol (loot only, sellable): LMB fires (tracer, 24 dmg, 6 rounds); empty + magazine in inventory
  → LMB reloads. `hs_mag` Pistol Magazine.

## Soft interfaces
`game.horde = { spawnHitSquad(factionId, pos, n=3), spawnSwarm(pos, n), waveActive(), startWaves(reason, zone), camera, stats() }`.
Reads `game.balance?.scale?.('creature').spawn` (only the spawn multiplier: hp/dmg/speed are left to the balance
module's generic path, which all horde creatures go through via `CreatureManager.hostSpawn`), `game.run.threat`,
`game.crafting?.dropComponents`. Listens to `tfg:facility`, `tfg:extraction`, `tfg:war`.

## Net messages (all `fx` broadcasts unless noted)
`hwave {s:start|wave|clear,i,n,c}`, `hbanner`, `hshot {a,b,h}` (tracer / muzzle sprite / impact sparks / near-miss
whizz), `hbark {id,t}`, `hshove {to,d,f}`, `hmop {p,r}`, `hdrop {p,f}`, `hdvoice {id,clip}`, `hreveal {id,nm}`;
request `hcam`. Creature `extra`: soldiers = laser target peer id while aiming; Doppel = victim peer id (`R:` prefix
once revealed); Deepfake = `'R'` once revealed.

## Performance
Swarm bodies are drawn by one shared `SwarmRenderer`: 3 InstancedMeshes (torso, head, limbs ×4 per body) + 4 face
frames = **≤ 7 draw calls for up to 48 bodies**; each `CreatureView` only owns an empty shell. AI: flow fields shared
per hunted player, target selection throttled (0.3–0.6 s), one groan voice at a time across the swarm. Headless
(SwiftShader) measurement: frame 6.2 ms → 7.2 ms with 40 bodies in view, host sim tick 1.9 ms with 40 bodies.

## Testing
```
npx vite --host 127.0.0.1 --port 5189 --strictPort &
flock /tmp/tfg-browser.lock node tools/harness/headless.mjs --port 5189 --script tools/harness/smoke_land.js
flock /tmp/tfg-browser.lock node tools/harness/headless.mjs --port 5189 --script tools/harness/wave1_horde.js --shot /tmp/horde.png
```
`wave1_horde.js` checks: collector steals a gold bar to its nest and drops the second bait when killed, janitor closes
an open door, a 3-wave swarm spawns / advances / clears, frame time with 40 bodies, a Bureau squad (leader / enforcer /
gunner) shows its laser and fires, the Doppel copies the host (UI type `mimic`, name tag, scan name) and the Instant
Camera (real item, LMB) reveals + stuns it and shows the polaroid. Debug: `kefal.game.horde.startWaves('night')`,
`kefal.game.horde.spawnHitSquad('darkweb', kefal.game.player.pos.clone().add(new THREE.Vector3(10,0,0)))`,
`kefal.game.creatures.hostSpawn('doppel', pos, { zone: 'in' })`.

## Known issues / limits
- The Doppel's client view **masquerades as `type = 'mimic'`** (original kept in `v.hType`) so scans, pings and the
  bestiary treat it as a crewmate decoy without editing actions.js / pings.js. Code keyed on the view type sees `mimic`.
- Outdoor movement is straight-line like the other outdoor creatures (bodies clip through rocks / outposts). Gunner
  cover search is indoor-only (nav); outdoors it backs off and reloads in place.
- Mopping only removes set-piece blood-trail decals; late joiners still see already-mopped blood.
- `tfg:facility` / `tfg:extraction` payload shapes were unknown when this was written: matched loosely.
- Contested zones are not shown on the terminal / moon info yet (moongen belongs to another module).
- Not yet played with 2+ real peers (host-only headless checks); no hand-tuning of wave difficulty beyond the formula.
- The polaroid never appeared in a headless screenshot (software-GL page clock far behind the sim); its animation now
  runs on `game.time` from the game loop instead of CSS transitions — verify once in a real browser. Photo pixels are
  verified headless via `game.horde.camera.lastPhoto` (PNG data URL).
