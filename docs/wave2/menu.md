# Main menu: the Content Review Cell (wave 2)

Owner ask: stand up out of the chair in the main menu and walk around ("Black Ops 1"), then "add ORIGINAL ideas" and "a piano behind you".
The CRT monitor stays the main UI; the room around it is now TFG's own place: **Content Review Cell 07**, where The Algorithm holds
flagged accounts. Everything is procedural three.js + DOM (no new assets).

## Flow
1. **Boot text** (first load only, skippable): BIOS lines over black, then the room fades in.
2. **Seated**: strapped into a moderation chair facing the big CRT. Idle micro-movement, breathing, mouse parallax. The menu works exactly as before
   (mouse, W/S/arrows + Enter, gamepad). After ~20 s idle (or 75 s total) an appeal-form hint flickers.
3. **File an appeal**: alternate **A / D** (or Left / Right, or gamepad left/right). A red form shows a glitching progress bar; the camera struggles.
   At 100 % the straps snap (sound + shake), you stand up (smooth camera rise 1.3 m to 1.68 m) and get first-person control.
4. **Free roam**: WASD + mouse (pointer lock; arrow keys also look), Shift sprint, head bob, footsteps, circle-vs-AABB collision, **E** to interact.
   **ESC**, **E on the chair**, or **E / click on the big CRT** sits you back down and returns to the menu (smooth glide). Once free, the seated view shows
   "[E] STAND UP" so you can get up again without struggling.

## The cell
| Thing | What it does |
|---|---|
| One-way mirror (left wall) | A dark booth; every ~40 s the light comes up and **your copy** (silhouette, red eyes) mimics you 1.3 s late. Sometimes it stops copying and stares. **E** knocks, the copy knocks back a second late. It turns toward the piano while you play. |
| Wall of CRTs (right wall) | 20 monitors sharing 4 feeds: sublevel corridor with a figure, static, CAM 07 overhead map of the cell (your dot), ship in orbit. |
| Filing cabinet | 9 readable notes (EN/TR, lore from `docs/LORE.md`). One holds the lullaby hint, one the appeal procedure, one the UNCLE password. Reading all = secret. |
| **Piano** (behind the chair) | **E** to sit. A S D F G H J K = C D E F G A B C, W E T Y U = black keys, Z/X octave (3..5), Space = sustain, ESC stands up. Synth: additive string wave, felt-hammer noise, damper release. |
| Locked door (front wall) | "CONTENT MODERATION IN PROGRESS". Opens when `menuSecrets.approved` or `.lullaby` is set; behind it an alcove with the APPROVED plaque. |
| ENGAGE-O-MAT (vending) | 5 joke items (LIKE, SHARE, SUBSCRIBE, RATIO, COMMENT); buying all five unlocks slot 6 VERIFIED (secret). |
| Ticket printer | Prints `REVIEW #n` slips with lore lines. |
| Phone | Rings every ~40-80 s (also while you are seated). Answer for an Algorithm voice line as text. |
| VHS + TV | Plays "ONBOARDING_v7.mpg" on the little CRT. |
| Lamp | Flickers; **E** toggles. Rain on the window (canvas + low `rain` loop), posters, dim flickering front light. |
| Old terminal (left wall) | Full-screen shell, see below. |

## Terminal
`HELP  DIR  CAT <file>  LOGIN <user> <pass>  ARCADE  LOST_ACCOUNT  APPEAL <code>  SECRETS  WHOAMI  DATE  CLEAR  EXIT` (plus a few jokes).
- `ARCADE PHISH` = existing FLAPPY PHISH (`src/minigames/arcade.js`); `ARCADE DEADFEED` = new **DEAD FEED** twin-stick shooter
  (`src/minigames/deadfeed.js`: WASD move, arrows/mouse shoot, spam bots / trolls / pop-ups, power-ups, an Influencer boss every 5th wave).
- `LOST_ACCOUNT` = text adventure (dark server room, phone flashlight, captcha gate, keycard, two endings, Lurker death).
- Logins: `admin admin`, `karma engagement`, `uncle hunter2`, `janitor 0314`. `APPEAL 0314` approves the appeal (opens the door).

## Secrets (profile.menuSecrets)
Object of `id: true` flags (+ `scores: {phish, deadfeed}`), saved with the profile via `saveProfile`. Ids: `verified approved lullaby cursed admin karma uncle janitor
lostaccount deadfeed notes`. They show as badge glyphs on the player-card CRT (and a check next to your name for `verified`). Tunes: lullaby = C C G G A A G
(keys A A G G H H G) opens the door; the tritone (C F# C F# C) is `cursed` (copy stares, lamp flickers); Fur Elise = applause.

## Files
`src/ui/menuroom.js` (room, state machine, camera, interactions, DOM HUD) · `menuroom.css` · `menuterminal.js` (shell + adventure + arcade launcher) ·
`menupiano.js` (model, synth, tune matcher) · `menulore.js` (EN/TR text + `addTranslations`) · `src/minigames/deadfeed.js` ·
`src/ui/crtmenu.js` (hooks: `room.frame` after the cinematic camera, input gating via `room.menuActive()`, walls moved into the room, exports `makeCRT/CRT_VS/CRT_FS`).
Harness: `tools/harness/headless_menu.mjs` + `menu_feature.js`.

## Known issues / notes
- If `MenuRoom` throws while building, `CRTMenu` falls back to the plain menu (`this.room = null`); individual props are built in try/catch.
- Pointer-lock exit by ESC is treated as "return to the menu" (or "stand up" at the piano); the resume prompt appears if the browser refuses re-locking.
- No gamepad walking (only the struggle + menu); no remote/multiplayer (menu is local).
- The copy is a puppet with a 1.3 s delay (position mapped into the booth), not a physical reflection.
- Menu scene now has 4 point lights (was 2) + ambient; lights are created once, never added or removed.
