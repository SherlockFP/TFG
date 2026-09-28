# Wave 1 — module `fun` (cosmetics · football · crew tasks · echo mode)

Installed by `this.useModule('fun', installFun)` in `game.js`; every sub-system is failure-isolated.
`game.fun = { cosmetics, football, tasks, echo, openWardrobe }`, `game.cosmetics = { unlocked(), equip(slot, id), current(), owns, unlock, buy, catalog, open }`.

## Cosmetics / wardrobe (appearance only, no stats)
* Slots: `suit` (outfits share the id space of `profile.suit`), `hat`, `face`, `back`. 12 outfits (Construction, Scientist, Security, Hazmat, Firefighter, Chicken, Diver, Clown,
  Fish Head, Astronaut, Gold Employee, **Venom Symbiote** mythic), 4 new hats (Beanie, Bucket, Headlamp, Wizard), 5 face (Moustache, Gas Mask, Shades, Cyber Visor, LED Face), 4 back
  (Antenna, Twin O2 Tanks, Plush Bear, Tiny Monster). Models: `src/models/cosmetics.js` + `avatar.js` (`setLook({suit,hat,face,back})`, viewmodel sleeves too).
* Venom: glossy black + sheen, white spider emblem chest/back, white angular eyes + toothy grin on the visor canvas, wobbling tendrils, claws. Unlock: bring the new mythic
  **Symbiote Sample** (strange scrap, weight 0.35 in every scrap table) onto the ship, or 50 creature kills. Other unlocks (level / tasks / stats / achievements / secrets) and ◈ prices:
  `src/game/cosmetics.js` (RULES, PRICES; priced suits/hats are also listed in the old Black Market via `MARKET.cosmetics` with `shop:'suits'`).
* Wardrobe panel (`src/ui/panels/wardrobe.js`, CRT style, live 3D preview): E at the ship mirror / suit rack, or the WARDROBE button injected into the character sheet.
* Sync: `helloData()` carries `face` / `back` (old clients ignore them); pinfo re-sent on equip / join. Remote avatars, ship mirror, emote cam and preview call `setLook`.

## Football (`src/game/football.js`)
Host-owned Rapier sphere (own collision bit), 15 Hz snapshots, dead reckoning on clients. Lives in the ship (confined to the hull in orbit / flight, respawn if lost) and on a marked
pitch with 2 goals at HQ. Kick: LMB on the ball (captured before the melee swing), E, or walk/sprint into it. Goal = whistle + crowd cheer + banner + confetti; juggle counter
(5/10/25/50/100), `/ball` fetches it back. Sounds are synthesised in `funfx.js`.

## Crew tasks (`src/game/tasks.js`, `src/minigames/swipe.js`)
Per landing the host places 5-8 stations (seeded RNG) and gives each player 2-3: Fix Wiring (fuse minigame), Upload Data (hold E 6 s), Calibrate (lockpick), Clean Vent (hold E 4 s),
Swipe Card (new timing-bar minigame). Objectives line + screen-edge markers; host validates completion; all living crew done → team bonus (credits + XP) at takeoff, shown in the
day summary. 3+ players: one secret saboteur pranks 2 stations (glitch 25 s, +Clout, revealed in the summary).

## Echo mode (`src/game/echo.js`)
Dead players get an Echo energy bar (100, +3.2/s, cooldowns, host-validated): 1 flicker lights near a crewmate, 2 knock, 3 whisper (3D sound where you look), 4 reveal nearest creature
(6 s marker), 5 toggle the unlocked door you look at. `E` use, `1-5` / wheel / RMB choose (LMB / Space still cycle the spectated player).

## Integration
* New host-only message types (`HOST_ONLY`): `ball`, `task`, `echo`. Profile additions: `face`, `back`, `cosmetics.faces/backs`, `fun{}` (all lazily defaulted).
* Shared-file edits (1-2 lines each): `game.js` (import + slot lines, `face`/`back` in `helloData`), `entities/remote.js`, `game/shipfeatures.js` (mirror `setLook`), `game/emotes.js`,
  `ui/charpreview.js`. `models/avatar.js` is the fun module's file.

## Tests
`npm run build`; `flock /tmp/tfg-browser.lock node tools/harness/headless.mjs --port 5191 --script tools/harness/smoke_land.js` (errs: []);
`... --script tools/harness/wave1_fun.js` (add `&verbose=1` to `--url` for numbers). Last full run: 16/16 steps ok (equip Venom, remote sync incl. an old-client payload, Symbiote unlock,
ball kick/bump/bounds/juggle, HQ pitch + goal, tasks + objectives + saboteur + team bonus, echo abilities, wardrobe DOM), no page errors.

## Known issues
* Screenshots checked: Venom (front/back/face/chest), outfit sheet, wardrobe panel (one CSS scroll fix applied after). Football, goals, station props, echo dock were verified numerically only.
* Single-peer test only; client-side paths (snapshots, `task set/done`, echo cues) share the host handlers but need a real 2-tab session. Pointer-lock inputs (LMB kick, hold-E, echo keys) not runnable headless.
* Stations have no collider and may overlap furniture. The saboteur prank replaces the floodlight example (no floodlight toggle exists).
