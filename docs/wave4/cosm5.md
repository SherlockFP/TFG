# cosm5 - the big cosmetics drop (wave 4)

Owner: "yeni kozmetikler, yeni modeller, bir sürü şey". 59 cosmetics, all procedural three.js, all appearance only (no stats).

| slot | count | where the code is |
|---|---|---|
| suits | 14 | `src/models/cosm5_models.js` `C5_SUIT_BUILDERS` |
| hats / head items | 19 | `HAT_BUILD` -> `buildC5Hat(id)` |
| back items | 10 | `C5_BACK_BUILDERS` (attach to `rig.backpack`) |
| weapon skins | 10 | `src/render/weaponskins.js` |
| emotes | 6 | `src/game/cosm5.js` (`EMOTE_DEFS`) |

Data table (ids, tiers, prices, sources, boss mapping, compact sync code, shop rotation, `cosmeticPool`): `src/game/cosm5_data.js` (pure, Node-safe).
Module: `src/game/cosm5.js` (`this.useModule('cosm5', installCosm5)` -> `game.cosm5`). Strings EN + TR + RU: `src/game/cosm5_i18n.js`.

## The content
- **Suits** (tier): Night-Shift Janitor (common), Root Access Hoodie, Hazmat Intern, Beekeeper (uncommon, with three orbiting bees), Retro Astronaut,
  Neon Rider, Brass Deep-Sea Diver, Spam Mascot (rare), Samurai Salaryman, Knight of the Help Desk, Plague Accountant, Algorithm Cultist Robe (epic, two red orbs),
  **Glitch** (legendary; an additive hue-shifting shader shell with block-shifted scanlines over every limb), Employee of the Year (mythic, orbiting sparkles + emissive pulse).
  The stock Samurai / Astronaut / Diver / Gold Employee / Knight suits from earlier waves stay; these are different designs.
- **Hats**: Mop Head Wig, Paper Boat, Giant Coffee Cup (steam), Rubber Duck, Cowboy, Cable Turban, Toaster (toast pops), Jester, Torrent Captain Tricorn, Giant Cursor, Wi-Fi Halo (pulsing bars),
  Buffering Ring, Tiny CRT (static screen), Personal Storm Cloud (rain + lightning), Drone Buddy (orbits the head), Foreman's Halo Hardhat, Laurel Wreath, Firewall Crown (flames), Event Horizon (black hole).
- **Back**: Lunch Box, Manager's Cape (2 sections, flows with speed), Company Banner, Plush Frog, Balloon Cluster, Satellite Dish (rotates), Server Rack (blinking LEDs), Void Cape (3 sections, stars), Jetpack (flames scale with speed), Mecha Wings (flap).
- **Weapon skins**: Woodland Camo, Rusted, Bone, Bubblegum, Carbon Weave, Damascus Steel, Frostbite (sparkles), Live Circuit (pulsing traces), Magma Core (molten cracks), Holographic (rainbow film).
- **Emotes**: Clock Out, Corporate Clap, Praise the Algorithm, Buffering, Ctrl+Z, Lag Spike. They are pushed into `emotes.js` `EMOTES` (+ `LOCKED_EMOTES`), so the wheel (hold B), the
  `x:<id>` network id, the third-person camera behind the player and the wardrobe turntable all just work. Ownership = `profile.emotes` (same as the Codex emotes).

## How the pieces plug in (no shared-file rewrites)
- Registries: `models/cosmetics.js` imports the cosm5 rows / builders at import time (same pattern as wave 3) and pushes them into `OUTFITS`, `BACK_ACCS`, `HATS_EXTRA` (-> `HATS` in avatar.js) and
  `BUILDERS` / `BACK_BUILDERS`. Because of that, equip, `pinfo` sync, the ship mirror, the FP body and the emote avatar work with the old code paths.
- Rig sockets: suits use the avatar2 `attach` frames (`spine`, `arm.sh/el`, `leg.hip/knee`, `headgear`), hats hang on `hatSlot`, back items on `backpack`. Nothing here is attached to the camera.
- **First person**: `fpbody_grip.poseFpBody` hides head / neck / hat, the backpack (all back items) and both arms; suit parts sit at or below the collar line. The node test builds the FP body for every suit and
  checks that nothing visible comes within 0.16 m of the eye.
- **Weapon skins follow the holder.** Whatever weapon you hold (`def.kind === 'weapon'`) gets your equipped skin, on every peer: `game.cosm5` scans held weapons every 0.25 s and applies / clears the skin on
  `item.obj.userData.inner`. World items keep their last skin. The shader is an object-space procedural pattern injected into a *clone* of each mesh's own material (`onBeforeCompile`, one program per skin), so lit / unlit
  parts keep their character; additive halo shells (plasma blade) are re-tinted to the skin accent. **Forge +N**: the forge shell (+3/+5) is a separate mesh and still shows; at +7 and above the forge camo shader owns the
  materials, so the skin loop leaves those items alone (both ways).
- **Wardrobe**: the existing panel (`ui/panels/wardrobe.js`) got `WARDROBE_EXT` + exported `TABS`. cosm5 adds three tabs (Rotation shop, Weapon skins, Emotes); suits / hats / back appear in the classic tabs. The
  turntable is the existing `charpreview.js` (drag to rotate); it got `setProp(obj)` so the skin tab shows a spinning weapon (cycle Katana / Plasma Blade / Bat / Pistol / Crowbar / Blaster), and the emote tab plays the emote.
  Owned / locked, progress bars for rule-based unlocks, tier colours from `game/tiers.js` (`tierColor`), names / descs / how-to-get translated with `t()`.

## Sources
| src | what | code |
|---|---|---|
| `shop` | rotating wardrobe shop (Clout). 8 daily offers (max 3 per slot) + 1 weekly feature (an epic+ crate item at 1.6x base price), same for everyone, seeded with `RNG('c5shop:<utc day>')`, rolls over at 00:00 UTC | `rotationFor`, `offersFor`, `buyOffer` |
| `crate` | daily crates / rewards (below) | `cosmeticPool` |
| `boss` | host broadcasts `c5drop {ty}` when a boss dies (`hostOnCreatureKilled` wrapper); **every** crew member gets the boss's cosmetic. Foreman -> Halo Hardhat, Load Balancer -> Server Rack, Middle Manager -> Help Desk Knight, Hydra -> Mecha Wings, Head Surgeon -> Plague Accountant, Host -> Lag Spike, Lobby Manager -> Employee of the Year, Legacy Bot -> Holographic skin. | `BOSS_DROPS`, `installCosm5.onDrop` |
| `secret` | `RULES` in cosm5.js, checked every 2 s: Cultist Robe (sell 20,000 credits), Glitch (play three *different* new emotes within 25 s), Firewall Crown (15 quotas), Event Horizon (level 40), Magma Core (300 kills), Ctrl+Z (level 15) | `RULES` |

### `cosmeticPool(tier)` - for the daily-reward / crate module
```js
import { cosmeticPool, rollCosmetic } from './cosm5.js';        // pure helpers also live in './cosm5_data.js' (no three.js)
cosmeticPool('rare')                                    // -> [{ key:'hat:jester', slot, id, name, tier }, ...]  crate-eligible items of exactly that tier
cosmeticPool('epic', { slot: 'back', owned: game.cosm5.ownedKeys() })   // filter by slot and/or hide what the player already owns
rollCosmetic(rng, 'epic', { owned })                    // rng = anything with next() (src/core/rng.js RNG); falls back to lower tiers when a tier is empty
game.cosm5.reward('hat:jester')                         // grant + toast; a duplicate pays Clout instead (common 30 ... mythic 900) -> { key, dup, coins }
game.cosm5.grant('suit:beekeeper', { quiet: true })     // plain grant, 'new' | 'dup' | 'bad'
```
Crate-eligible = `src: 'shop'` or `'crate'` (never boss / secret trophies). There are entries in every tier from common to epic, legendary has one (Laurel Wreath), mythic none (rolls fall back).
`game.cosm5.owns(key)`, `ownedKeys()`, `catalog()`, `entry(key)` and `offers()` are there for UI code. Keys are `slot:id` (`suit|hat|back|skin|emote`).

## Sync (compact ids, message types prefixed `c5`)
- `c5look` (peer -> all, relayed by the host for broken client links): `a.<suit>.<hat>.<back>.<skin>`, four base-36 indices into the append-only `ID_TABLE`, `0` = "not a cosm5 id". Example `a.3.0.7.a`
  (<= 12 chars). Sent when the look changes, every second if changed, after `netReady` / `playerJoin`. Receivers `decodeLook` (garbage -> null), keep it in `game.cosm5.peerLooks` and re-apply it to the remote avatar
  (suit / hat / back) - the skin field is what the weapon loop reads for other players' held weapons. Suits / hats / backs also ride the existing `pinfo` (`profile.suit/hat/back`), so old clients still show them
  (or the default) and nothing breaks.
- `c5drop` (host -> all): `{ ty: <boss type> }` boss trophy grant.
- Profile: `profile.cosm5 = { skins:[ids], skin:'none'|id, combo:[], flags:{glitch}, spent }` (unknown keys survive `loadProfile`). Suits / hats / backs use the wave-1 lists `profile.cosmetics.*`.

## Knobs
`cosm5_data.js` (`C5` rows: tier / price / minLevel / src / boss, `rotationFor` counts, `offerPrice`), `cosm5.js` (`RULES`, `DUPE_COINS`, `PREVIEW_WEAPONS`), `weaponskins.js` (GLSL patterns, `SKIN_ACCENT`), `cosm5_models.js` (geometry).

## Tests / how to check
- `node tools/harness/cosm5.test.mjs` (data integrity, every id -> builder / registry, encode/decode roundtrip incl. garbage, skins apply / clear / re-skin on real models incl. plasma blade + shader patch targets in three's
  lambert / basic, forge exclusion by level, rotation determinism + coverage, pool, grant / buy / rules, emote fx on both bodies, i18n TR + RU, FP clip check, triangle budget).
- `tools/harness/wave4_cosm5.js` (API + wardrobe tabs + skin loop on real items, screenshot of the wardrobe) and `wave4_cosm5_smoke.js` (smoke_land + emote look).

## Known gaps
- Weapon skins do not appear on inventory icons / HUD thumbnails (`icons.js`), only on the 3D item (world, first person, remote hands).
- One global skin per player (no per-weapon override yet); world items keep the last holder's skin.
- Glitch shell is a ShaderMaterial (no hit-flash tint); animated hats use `onBeforeRender` (cheap, but not driven by the avatar update).
- The shop rotation uses the local clock (UTC day), so a player with a wrong clock sees a different rotation; purchases are personal, so nothing desyncs.
- Boss trophies use the creature `type` ids seen in `cycle_bosses.js`; a boss killed while a crewmate is disconnected does not backfill.
- Daily-reward wiring is up to the other agent (only the helper + reward() are provided).
