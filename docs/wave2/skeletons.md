# Wave 2 - DELETED USERS skeletons + tier looks for every creature (module `skeletons`)

Owner: "add skeleton creatures, and give EVERY creature different coloured / armoured looks per tier". Module `skeletons` (`this.useModule('skeletons', installSkeletons)`), dev port 5262.
Flavour: skeletons of banned accounts, glitchy username tags floating over the skulls (`xX_Kefal_Xx [BANNED]`, 3-frame RGB-split / scrambled glitch, deterministic from the creature id).

## Files
| File | Role |
|---|---|
| `src/game/skeleton_data.js` | PURE data + rules (node-tested): defs, spawn tables, night window, `TUNING`, shield arc, Walker collapse / smash, archer wind-up / aim / projectile step, tag names, Turkish strings, identification rows |
| `src/game/skeletons.js` | install: `registerCreature` + host behaviours, damage wrapper (Walker / Knight rules), Archer projectiles, night director, client fx (projectiles, block sparks, collapse dust), username tags, soft identify.js rows |
| `src/models/skeletons.js` | procedural rigs (Walker, Archer, Knight, Bone Swarm hand) + `tierRig` (bespoke per-tier gear on bones) + projectile meshes |
| `src/render/tierlooks.js` | GENERIC tier look layer for every creature: spec, gear builders, bbox sizing, per-frame update |
| `tools/harness/skeletons.test.mjs`, `tools/harness/wave2_skeletons.js` | node test (all pure rules + gear on all 21 built-in creature models x 6 tiers) / browser proof + lineup screenshot |

The downloaded GLB `mon_skeleton` (the existing `skeleton` creature in `extcontent.js`) is left as is: `extAnimated` exposes no head / arm bones and no heap / rise states, so the family is procedural.

## Creatures (all host-authoritative, registered with `registerCreature`; HP / damage / speed go through `game.balance.scale('creature')` in the generic paths, tiers multiply on top)
| id | Name | base HP / dmg / speed | Behaviour |
|---|---|---|---|
| `skel_walker` | Bone Walker | 40 / 9 / walk 1.5 run 3.3 | Melee (0.42 s wind-up), rattles while moving. A lethal hit does NOT kill it the first time: it collapses to 1 HP and lies in a heap (state `collapsed`, skull blinks, tag says SMASH THE SKULL). Any hit within 4 s smashes the skull = real death (XP, drops). Otherwise it rebuilds (state `rise`, 1.3 s, comes back at 45 % HP, `data.rebuilt`) and dies normally afterwards. |
| `skel_archer` | Bone Archer | 30 / 9 / 1.6 - 3.6 | Keeps 5.5 - 15 m (backs away, melee flail only when cornered), needs line of sight. Wind-up `draw` 1.15 s early (0.6 s min later): arm back, held shard / CD (by creature seed) grows and glows red, eyes blink; the aim tracks until 65 % then LOCKS (dodge window). Throw = host-simulated projectile (12.5 m/s, light gravity, world + player hit test, works after the shooter died), lead 30 % early. Client draws the same trajectory from `fx skshot`. |
| `skel_knight` | Bone Knight | 95 / 15 / 1.3 - 2.9 | Shield blocks hits from the front +-62 deg (only 15 % goes through, spark fx). Turns at 2.1 rad/s (walking too): flank it. A heavy hit (crit / stun weapon / >= 28 dmg) knocks the shield aside: 50 % damage, stunned 1.6 s with the guard down (full damage). Piercing damage and non-player sources ignore the shield. |
| `skel_swarm` | Bone Swarm | 7 / 3 / 2.6 - 4.4 | Tiny skull-headed hands on their fingertips; one spawn calls 2 - 4 more (cap 14), weave around the straight line, pounce. |

Spawn: `EXTRA_SPAWNS` weights per moon tier (Walker / Swarm from tier 1, Archer / Knight from tier 2) x interior multipliers (mansion / hospital / backrooms / mineshaft >= 1.0..1.8, office / server farm / sewer / factory 0.2..0.8).
NIGHT outdoors (host director, 18:30 - 23:30, only while someone is outside): every 55 - 90 s / `balance spawn` a group (Walker pack, Swarm, or Archer + Walker (+ Knight from sector 2)), 38 - 58 m from a player, capped at `(4 + sector) x spawn mul`.
Drops: existing kill hooks only - forge shards by tier, crafting `def.compDrop` (arcane / metal components), item drop `skull` (Walker 16 %, Knight 30 %).

## Tier looks (generic, `src/render/tierlooks.js`)
Applied on the CLIENT `CreatureView` whenever `view.tier` is set: `creature_tiers.js` calls `attachTierLook(view)` once (right after it creates the aura) and `tierLooksUpdate(dt, game)` every frame. The aura ring, nameplate and Epic+ body tint stay in `creature_tiers.js`; this layer only adds gear (and the Uncommon / Rare tint).

| Tier | Look |
|---|---|
| Common | base look |
| Uncommon | subtle green tint + small scrap-metal plates (mismatched patches + rivets) |
| Rare | blue tint + iron breastplate / back plate / pauldrons / gorget + small helmet (only where a head part exists) + buckler |
| Epic | purple emissive runes / cracks on the plates, spiked pauldrons, tassets, belt, horned helmet, glowing eyes (eyes of the model, or glow dots) |
| Legendary | gold armour + gold trim rims, crested helmet, tattered swaying cape (banner over the back of low creatures), orange embers |
| Mythic | red / black glitch armour with ONE shared animated scanline shader (vertex slice jitter + scanlines + flicker, fog aware), crown spikes, spinning halo, glitch particles |

Cost: gear = <= 3 merged meshes per piece from CACHED, 2.5 cm-quantised geometry (same size + tier = same geometry), shared materials per tier (marked `noTint`, so `Tinter` never clones them), no lights, no per-frame allocations (constant particle option objects, one shader clock), animation only within 60 m, particles within 26 m.
Sizing: `localBounds(root)` = mesh bounding boxes in the root's own frame -> torso frame (`humanoid` for upright bodies, `beast` = dorsal plates for wide / low ones); head frame from `model.parts.head` (skipped when it is the whole model or scaled to 0). A model may supply `tierRig(spec)` (bones to attach to) - the skeletons do, so plates / shield / cape follow the animation.
Skeleton bespoke tiers: rusty helmet + scrap -> iron armour + buckler (Knight: steel shield / helm recoloured) -> purple rune bones (glowing bone material, rune plates, glowing sockets) -> gold armour + cape + embers -> red glitch crown + halo. Bones are recoloured per tier (green / blue / violet glow / gold-white / charred red).
Excluded: `zombot` (instanced body, no per-view mesh), hazards, `mimicdoor`, `web`, `sandkefal`, nests / bins. Everything else, including creatures registered later, gets a look for free.

## Shared-file hooks (all marked `[skeletons]`)
`game/game.js`: the two placeholder lines (import + `useModule`). `game/creature_tiers.js`: import, `attachTierLook(v)` after `makeFx`, `tierLooksUpdate(dt, game)` at the end of `clientUpdate`, `clearTierLooks()` in `dispose`. Nothing else.
Instance wrapper (restored in `dispose`): `game.creatures.damage` (Walker collapse / smash, Knight shield). Soft: rows are added to `identify.js`'s `IDENT` table when that module exists (Predator / Predator / Territorial / Swarm + weakness hints).

## Net
No new message types. `fx` (host -> all): `skshot {id,a,v,ty}`, `skhit {id,p,h,ty}`, `skblock {id,h}`, `skcollapse`, `sksmash`, `skrise {id}`. States `collapsed` / `rise` / `draw` / `throw` / `flee` ride the normal creature snapshot.

## Test
```
node tools/harness/skeletons.test.mjs            # defs, spawn tables, TR, rules, spec of all 6 tiers, gear triangle budget, models, attachTierLook on every built-in creature x 6 tiers
npm run build
flock /tmp/tfg-browser.lock node tools/harness/headless.mjs --port 5262 --script tools/harness/wave2_skeletons.js --shot /tmp/skeletons.png
```
Console: `kefal.game.skeletons.spawn('skel_knight', pos, { tier: 'epic', zone: 'out' })`, `kefal.game.skeletons.stats()`.

## Verified / NOT verified
Ran ONCE headless (moon `palamut`, host path + lineup): Walker collapse -> rebuild (hp 15 / 32, once) and smash, Knight front 3 / flank 20 / heavy staggers (10, stun 1.6 s) / staggered 20, Archer wind-up 1.2 s -> projectile -> 1 hit at 12 m, Swarm group of 3, night director spawned 2 outdoor Walkers, 30-creature lineup: 26 tiered views ALL got gear (all 4 skeletons x 6 tiers + scuttler / crawler / moderator / support / hound at higher tiers), no page errors. One screenshot: tier colours and gear read clearly (green / blue / violet / gold / red), Mythic glitch visible.
NOT verified: the screenshot camera hid the nameplates and my username tags (distance uses the real player), so tag glitch frames were never seen (tags were created without errors); collapse / rise poses, the Knight guard jolt / stagger pose and the Archer wind-up pose were only exercised for NaN in node, not looked at; hit feel / balance numbers are design values; night pacing untested over a whole day; 2-peer play untested; Common skeletons looked dark against the snow fog (base lighting of that moon).
Known limits: `zombot` gets no gear (instanced); very large / oddly proportioned creatures (Influencer 8 m) get bbox-proportional plates only; cape on beasts is a simple back drape; projectiles in flight are not replayed for late joiners.
