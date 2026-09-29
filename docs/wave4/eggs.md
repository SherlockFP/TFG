# Wave 4 - EASTER EGGS (module `eggs`)

Owner asks: "ana menudeki yere icerikler easter egg ekle, normal maplara da" + "ana menude viewmodel/eller gorunmesin".

## What
1. **No hands in the menu.** `CRTMenu.stripViewModel()` (ux wave 3) already removes every camera child and disables the FP-body layer each frame;
   the only thing that could still show up was the strapped-forearms rig `MenuRoom.buildArms()`. It is now built but never attached to the camera
   (`menuroom.js`, tagged `[eggs]`). Checked in the browser: `camera.children.length === 0`, `layers.isEnabled(2) === false`.
2. **Main menu Content Review Cell: 10 new props** (`src/ui/menueggs.js`, installed by `MenuRoom` with `new MenuEggs(this)`; everything hooks in through
   instance wrappers, `menuroom.js` only got 3 lines). Progress = `profile.eggs`, a subtle "Secrets x/19" (bottom-left, only while you walk around) and a
   gold banner on discovery.

   | egg | where | what happens |
   |---|---|---|
   | `cassette` | floor by the server rack (back aisle) | the Janitor's tape: he hid a diary, a frozen man and three ducks; "channel 7 knows the knock" |
   | `crt` | small CRT on a cart, back wall | E changes channel; **CH 7** shows the knock rhythm (`● ● ●   ● ●`) |
   | `drawer` | table front | sticky note: hints at ducks, the shrine, payphones, the piano tune, the statue |
   | `mug` | table | sip counter (persisted); 10 / 25 lines, **50 sips** = "World's Okayest Moderator" |
   | `knock` | back wall (aisle) | knock the rhythm tap-tap-tap ... tap-tap with E: the wall answers, a **hatch** swings open (cosmetic flag `flags.panel` stays open forever) |
   | `poster` | front wall | rotates every 5 s; on the WANTED frame press E (u/throwaway_janitor) |
   | `phone` | the existing phone | 3rd answered call ever (then 1 in 8) is the Algorithm's private line (hint about the statue) |
   | `piano` | the existing piano | play the Algorithm's tune **D E F G A G F E** (keys `S D F G H G F D`) |
   | `duck0` | alcove behind the (unlocked) door | rubber duck, counts as duck #1 |
   | `lamp` | the desk lamp | toggle it 5x in 4 s: Morse SOS |
3. **Moon / facility secrets** (`src/game/eggs.js`, models `eggs_models.js`). Rare: about 1.3 eggs per map (78% of maps have at least one, measured over 2000 seeds), ~30% duck chance, never two of one kind:
   `graffiti` (dev wall, 8 lines), `shrine` (hold scrap + E: 90/150/240 s blessing by the scrap value: speed + damage reduction + max HP),
   `vending` (facility: one free weird item), `diary` (previous-crew corpse + diary, 6 entries), `duck` (rubber duck, per-player counter across runs),
   `statue` (frozen employee: its head turns to you only while you do not look; harmless), `payphone` (XP + clout once per player), `stash` (dead-drop bag: tools + a scrap).
4. **Meta-secret THE LAST APPEAL** = cassette + CRT ch 7 (menu) + diary + statue (maps) + 3 ducks (menu duck + moon ducks), then **look inside the hatch**
   (opened by the knock). Reward: title **Cell 07 Alumnus** (`profile.titles` / auto-equips if no title) + hat **Retired CRT** (`hat:crthead`, mythic; new model in
   `models/cosmetics.js`, unlock rule in `game/cosmetics.js`). Until then the hatch lists what is missing.

## How it works
- `eggs_core.js`: pure rules (no THREE/DOM): `planEggs` (seeded from `moonId|seed`, same on every peer; caller supplies a ground sampler and facility spots),
  `ensureEggs` (profile repair), `discover/bump/flag`, `claimMeta`, `KnockMatcher`, `ClickBurst`, `posterFrame`, `phoneSpecial`, `shrineTier`.
- `eggs_text.js`: one table id -> `[en, tr, ru]`, registered into the i18n tables at import (`x(id)` / `xf(id, vars)`).
- `eggs_models.js`: one merged vertex-coloured Lambert mesh (+ one merged self-lit mesh) per egg, shared materials, **no THREE lights**. Graffiti = one 256x160 canvas.
- `eggs.js`: `mapLoaded` builds the plan (outdoor sampler = the chest sampler rules + no slopes / lava / ice; facility = far `scrapSpots`, offset 0.7 m), `interactables`
  adds prompts, `update` ticks duck bob / shrine flames / statue head.
- Persistence: `profile.eggs = { v, found:{id:1}, n:{mug,duck,call}, flags:{panel,...}, meta }` saved with `saveProfile` (localStorage). Repaired on every read.

## Net (all host-authoritative, HOST_ONLY where noted)
- `eggreq` (request client -> host) `{op:'use', id, s, item?}`: host checks phase, seed, reach (5.5 m), one-shot state, held-item ownership, then acts.
- `eggst` (HOST_ONLY, host -> all) `{s, id, k:'gone'}` / `{s, list:[ids]}` (late-join sync, requested with `eggsync`).
- `eggfx` (HOST_ONLY, host -> the user) `{s, id, k:'duck'|'bless'|'vend'|'stash'|'phone'|'used'|'gone', b?, sec?}`: the client writes its own profile / gets its buff.
- Buffs are `egg_bless1..3` injected into `game.anomaly.DEFS` (the one buff system). XP for the payphone goes through the existing `xp` message.

## Test
- `node tools/harness/eggs.test.mjs` (4.6k checks: seeded placement over 600 seeds, rarity numbers, profile JSON round trip + garbage repair, the whole meta chain, knock / lamp / poster / phone rules, i18n rows).
- `node tools/harness/eggs_install.test.mjs` (124 checks: installs the module on a stub game and drives plan -> build -> prompts -> host handlers -> client effects -> profile -> statue head -> late-join sync -> dispose).
- Browser: `flock /tmp/tfg-browser.lock node tools/harness/headless_menu.mjs --port P --script tools/harness/wave4_eggs_menu.js --shot out.png`
  and `node tools/harness/headless.mjs --port P --script tools/harness/wave4_eggs.js --shot out.png`.
- By hand: main menu -> mash A / D to break free -> walk: aim at the cassette (floor by the rack), the small CRT (E x7), the table drawer, the mug, the back wall...
  Terminal command in game: `EGGS` (counts and found names only, no spoilers).

## Knobs
`eggs_core.js`: `KINDS` (weights / where), `planEggs` slot chances `[0.4, 0.12]` outdoor / `[0.35, 0.1]` facility (+4 % per moon tier, max +12 %), `DUCK_CHANCE`,
`SHRINE_TIERS`, `DUCKS_NEEDED`, `MUG_UNLOCK`, `KNOCK_PATTERN`, `POSTER_*`, `PIANO_TUNE`, `VENDING_POOL` / `STASH_POOL` (ids missing from `ITEMS` are skipped).

## Known gaps
- Node + build + ONE headless menu run (all 10 menu eggs + meta chain + screenshot, ok, 0 errors; the mug / cone tweak after it was not re-run). The moon headless run crashed in my own harness script (fixed) and was not repeated because the browser queue was full; the moon secrets were placed by `debugSpawn` in the browser run, natural spawns are proven by the seeded-plan test (real terrain rejection rates not measured).
- Facility spot offsets can put a prop against a wall on tiny rooms; props are small and non-blocking except vending / statue / payphone / shrine (static boxes).
- Egg text on the menu CRT / poster canvases is English only (like the existing menu canvases); all prompts / notes / toasts are EN + TR + RU.
- 2-player sync (`eggst` / `eggfx`, late join) is code-reviewed, not tested over WebRTC.
- The hat `crthead` has no wardrobe preview thumbnail check; the `Cell 07 Alumnus` title string is not translated (like the achievement titles).
