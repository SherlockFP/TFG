# Wave 5: harvest2 - hit things to harvest them (MASTERPLAN 25.8)

## What
Trees and rocks (module `harvest.js`, installed by `worldx`) are now gathered by HITTING them with the held item (LMB), not by holding E.
- Damage = swing melee damage x multiplier (host-side, `src/game/harvest2_core.js`):
  | held | tree | rock |
  |---|---|---|
  | Axe (`tool_axe`, also `x_axe`) | x2 | x0.6 |
  | Pickaxe (`tool_pickaxe`, `x_pickaxe`) | x0.6 | x2 |
  | any melee weapon | x0.6 | x0.6 |
  | bare hands / non-weapon / gun | x0.3 | x0.3 |
- HP: tree 50+30*scale, rock 90+50*scale (per landing; state clears on map load). Axe on an 80 HP tree = 3 hits, bat = 7, fists 50+.
- Every hit: existing `wxHp` broadcast -> sound + particles + a 0.35 s wobble on the instanced tree (sways about its base) / rock (squash). Last hit: tree falls, rock crumbles, `crafting.dropComponents` (or direct spawn) drops wood / scrap metal (+7% crystal).
- The hit uses the existing `resolveMelee` wrap: a swing whose ray hits a tree / rock (and no creature is closer) sends `wxHit {id, s, d: base dmg, c: tool class}`.
- Host validation (`validateHit`): sender within 6 m (xz) / 6 m (y), max 1 hit per 0.2 s per player+target and 0.08 s per player overall, base damage clamped 3..120, unknown tool class = hand, no double drops (`dying` flag).
- New shop tools (category Tools): **Axe** (40) and **Pickaxe** (45), melee weapons, so `durability.js` wears them per swing. Procedural held models (plain box/cylinder).
- E prompt on a tree / rock is now a hint only ("Hit it (LMB) - axe: x2", damage %); no hold bar.
- EN + TR + RU strings (in harvest.js TR table via addTranslations tr/ru).

## Audit of other "hold E" interactions
- survival plants (`survival.js` svh, sickle): small herbs, stay E by design.
- homeworld2 "nodes": factory-grid resource nodes for miners (no hold-E), untouched.
- chests (`chests.js` hold-E open), secureloot cases/safes: locks, not breakables; untouched (could get "smash with melee" later).
- Ore veins in mineshaft are static wall geometry, not harvestables yet.

## Net
No new message types: reuses `wxHit` (request; payload now `{s,id,d,c}`, host computes the multiplier) and `wxHp` (adds `a` = hit angle).

## Test
`node tools/harness/harvest2.test.mjs` (multipliers, HP -> drop flow through the real module with a mock game, range / rate / clamp validation). `npm run build`.
Manual: buy an Axe, walk to a tree, LMB x3 -> it falls and drops wood; bare hands still work, just slowly.

## Known gaps
No browser run (skipped). Tool models are simple; shop icon uses the same model. Fists take ~50 hits per tree by spec. Ore veins / breakable crates are not harvestables yet. The swing must also be off cooldown (normal melee rules); heavy (charged) swings do more damage.
