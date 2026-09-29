# Wave 8: mining (module `mining`, prefix `mn`)

Owner: "Minecraft gibi maden kazma mantigi koy." Identity fit (MASTERPLAN 21): the Company strip-mines dead planets, the Algorithm hides data crystals in the rock. Risk -> loot: digging is slow, loud (stealth) and can bring the roof down.

## What
- **Volumes** (`src/game/mining_core.js`, pure): 0.5 m cells, 16^3 chunks, `Vol` = Uint8Array of material ids. Kinds: `mound` (dome, 60 % with a 3-wide cave pocket whose back wall holds ore), `cliff` (long seam, more ore), `slab` (mineshaft room corner, 3x3 m, ore-vein / cavern rooms first, away from doors). Generated deterministically from `(run seed, terrain, layout)`, so all peers build the same rock; only edits travel.
- **Placement**: outdoor `planOutdoor` 2-4 per moon (near landmark sites, `outdoor.avoid` keeps them off the ship, entrance, path, fires, ponds, landmarks; flat sites only). Mineshaft: 1-2 slabs (`planIndoor`).
- **Render**: greedy mesh per chunk (lit Lambert + unlit glowing buffer for data crystals / torch blocks), vertex colours, one static trimesh collider per chunk, rebuilt (max 3 chunks / frame) on edit. Collider handles live in `outdoor.colliders` / `facility.colliders`, so map unload cleans them.
- **Digging**: LMB swing (wraps `resolveMelee` like harvest2) -> voxel DDA -> `mnhit`. Host derives the tool from the sender's HELD item (not from the client), multiplier x hardness. Cell HP: dirt 12, stone 34, deep rock 80, copper 44, iron 50, quartzite 60, data crystal 90, beam 25, torch 6, bedrock unbreakable. Tools (swing dmg x mult): hands x0.3, weapons x0.5, axe x0.7, Pickaxe (45) x2 (stone 2 hits), Steel Pickaxe (140) x3.2, Mining Drill (380, cd 0.25) x5. `harvest2_core` pick regex now includes steel + drill (rocks).
- **Feedback**: crack overlay pool (3 stages), sparks / dust, `hit_wall` / `hit_metal` sounds, prompt with material + damage %.
- **Ores**: new `ore_copper` [9-15], `ore_iron` [7-12], `ore_quartz` [16-26]; data crystal reuses `comp_crystal` (forge shard alias). Workbench recipes: iron -> 3 scrap metal, copper -> 2 cables, 2 quartz -> sensor (so ore feeds crafting / forge / homeworld factory through existing component ids).
- **Persistence**: host + clients log packed edits `idx*16+mat` (mat 15 = dug by a player, 0 = collapse) in memory keyed `seed|moon|day`; replayed on the same landing and sent to late joiners via `mnsync`. Volumes reset with a new day / seed.
- **Noise**: every validated hit calls `game.stealth.hostNoiseAt` (hands 0.15, pick 0.5, steel 0.6, drill 1.1; max one per 0.45 s per player) -> Listeners come.
- **Cave-in**: `stress` = player-dug air cells in a 7x5x7 box minus 40 per support beam. > 72 (a 3-wide tunnel; a 2x4 crawl tunnel is ~56) -> `warn` (creak, dust for 2.6 s, toast), then if still unstable the roof (<= 14 cells) falls: rock removed, 8 damage to players under it. A beam placed in time cancels it. Natural caves never count.
- **Placeables**: Support Beam (12), Torch Block (8), shop category Tools; LMB on rock places into the aimed air cell (must touch rock, not inside a player). Torch = emissive cell, no THREE light.
- **Balance** (MASTERPLAN 19): host ore value cap 240 credits / 30 ore items per moon and day (`MN.valueCap`), beyond that ores crumble to dust. Full mining of a moon is well under one good scrap haul and costs minutes of loud digging.

## Net (all prefixed `mn`)
requests `mnhit {s,v,c,d}`, `mnput {s,v,c,id}`, `mnsync {s}`; host->all `mnd {k:'hp'|'ed'|'warn'|'ok'|'sync', s, ...}` (HOST_ONLY). Host validates: phase moon, seed, reach 4.6 m from the sender's eye, 0.1 s per player, held item ownership for `mnput`.

## Test
`node tools/harness/mining.test.mjs` (8 checks: plan / gen determinism, ore cap, greedy mesh + chunk borders, DDA + edits, hardness / tool tiers, cave-in stress + beams, ore value gate, indoor plan). `npm run build`.
Manual: buy a Pickaxe (Tools), walk to a rock outcrop 50-110 m out, LMB the face; dig into a cave pocket back wall for ore; undermine a wide area to see the warning; place beams / torches; a Steel Pickaxe / Drill from the shop is faster and louder.

## Known gaps
NOT browser-verified (lead skipped the headless run): visuals, collider feel (0.5 m steps need a jump), indoor slab vs props / loot overlap, zone-core overlap (outdoor spots do not know zone cores) are unchecked. Collapse leaves no rubble bodies. Damaged cells do not heal. Dig log is in-memory only (not saved with the run). No pickaxe-specific held animation. Homeworld customMap moons get no rock.
