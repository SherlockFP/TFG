# Wave 4 - runtime checkup (QA pass)

I ran the headless browser against the current branch (swiftshader, 1280x720, dev server on :5190). The lead cut the pass
short because the owner's quota was running low: 3 browser runs were made (smoke_land, orbit panels, core loop + special
moons). Steps `04_owner` (pointer lock with real input, emote cam, regen, cooldowns, TR/RU role panel, menu after leave)
and the `mp` 60 s stability run are written but **were not run**.

## How to re-run
```
npx vite --host 127.0.0.1 --port 5190 --strictPort &
flock /tmp/tfg-browser.lock node tools/harness/wave4_checkup_run.mjs --port 5190 --shotdir /tmp/ck \
  --steps tools/harness/wave4_checkup_01_orbit.js,tools/harness/wave4_checkup_02_loop.js,tools/harness/wave4_checkup_03_worlds.js,tools/harness/wave4_checkup_04_owner.js
flock /tmp/tfg-browser.lock node tools/harness/wave4_checkup_mp.mjs --port 5190 --secs 60
```
`wave4_checkup_run.mjs` keeps a single browser session open for all steps. It freezes the rAF loop, because a single
swiftshader frame takes seconds and made `page.screenshot` time out in `headless.mjs`. It prepends `wave4_checkup_lib.js`
(helpers such as land / takeoff / stats / nanScan / textOverlaps / panelInfo) and exposes `__shot`, `__click` and `__press`
(real input). Steps 02 and 03 take about 160 s each; run them separately if the lock is busy. Step 03 must run BEFORE the
quota step of 02, or reset `run.cycle` first (see "test artifact" below).

## Flows checked
| Flow | Result | Notes |
|---|---|---|
| smoke_land (hamsi / levrek / palamut) | PASS | factory 10 creatures, mineshaft 34, mansion 17, `errs: []` (headless.mjs screenshot timed out: rAF starvation, not a game bug) |
| Boot, orbit HUD, module install | PASS | no pageerror / console.error. The only console noise is 4x "403 Forbidden" resource loads at boot (an ext asset behind the proxy?) |
| Panels in orbit: inventory, tree, roles, character, shop, workbench, shipyard, pets, contract board, Service Record (J) | PASS (minor) | all open and fit 1280x720, no junk strings. Roles: 6 cards, 2nd row needs scrolling inside the grid (SELECT buttons of row 1 sit at the fold). Shipyard + forge footers repeat hints ("ESC BACK · ESC BACK", "ENTER CONFIRM · E CONFIRM"). Forge/homeworld only open at HQ/home (by design) |
| Terminal MOONS / ROUTE / CONFIRM | PASS | route hq -> confirm -> land works |
| Land 56K-Dialup, walk (4.8 m/s), ship door open/closed from outside | PASS | [ux] door opening verified: open shows the interior, closed shows the leaf |
| Enter facility (main exit), pick up 3 scrap, HUD pockets | PASS (overlap bug, fixed) | see bug 1 |
| Drop in ship, take off, day summary / case file | FIXED | bug 2 ("Value extracted ▮0") |
| HQ: sell on the counter + bell | PASS | 4 items -> +▮269 after 2.6 s |
| Quota day at HQ -> QUOTA MET -> next quota 255, cycle stage 'gate' | PASS | the NEXT QUOTA number animates from 130 -> 255 (the screenshot caught the start) |
| Backrooms noclip pocket (`backrooms.enter('debug')`) | PASS | pocket at x=+5003, 68 draw calls; exit works. VHS overlay covers the corners (date over hotbar slot 3-5, REC over the body icon): intentional look, but it hides the hotbar |
| Mirror dimension (`forcePortal` + enter/exit) | PASS (overlap) | "THE MIRROR CLOSES IN 2:57" + reflection bar are drawn over the clock/compass (bug 5, not fixed: mirror_ui) |
| worlds2 Soviet / twin-sun, homeworld panel, Sector Core boss | NOT VERIFIED | test artifact: after QUOTA MET the cycle gate locks the autopilot on `core0`, so every later "landing" in step 03 reused the core map (same creatures and draw calls, `boss: []`). Re-run step 03 on a fresh run |
| Owner: ESC -> click recapture, emote cam behind, no passive regen, 5/10 min cooldowns, menu hands | NOT RUN | step 04 is written. Code audit: cooldowns are 300 s / revive 600 s in `role_skills.js`; no passive HP regen in code; emote cam starts behind (`camYaw = yaw`); `crtmenu.stripViewModel()` removes camera children every menu frame. The menu title screenshot (other agent's run) shows no hands |
| MP 2-tab 60 s | NOT RUN | `wave4_checkup_mp.mjs` is ready (samples every 10 s: conn, remotes, msg/s, KB/s, lost/stalls/reconnects/rejoins/graceExpired, per-type rates) |

## Bugs fixed
1. **Objective list ran into the left HUD dock** (pickup feed, buffs, Level 0 card) at 1280x720, so the text overlapped.
   `src/game/objectives.js` `fitAboveDock()` (called from `update`). The list grows down from ~y 285 while `hudDock('left')`
   grows up from `bottom:170px`. Now the lowest lines that would cross the dock top are hidden (the first line is always kept).
2. **Case file / day summary said "Value extracted ▮0"** when the scrap was dropped in the ship less than 1 s before takeoff,
   or was still in the hands of an aboard player. `src/game/host.js` `hostFinishTakeoff` (before `const summary`). Cause:
   `dayStats.collected` is only counted by the once-a-second collect pass in `hostUpdate`, but `shipValue` counted those items.
   Now a final tally runs at takeoff: uncollected sellable items in the ship, or held by an aboard player, are marked
   collected and added (including per-player loot). `cycle2_flow.test.mjs` (real host flow) still passes: 216 checks.
3. **Role-skill HUD tiles: a long name wrapped under the key letter** ("U" was drawn over "SONAR / PULS").
   `src/game/role_skills.js` CSS `.rs-c` / `.rs-c b`: 92 px tile with a left pad for the key letter, the name on one line
   (11 px, ellipsis).

## Bugs remaining (by severity)
1. (lead is on it) The held-item viewmodel is too big: the lead pipe fills the lower right, and a dark near-plane triangle
   appears at the top left of the ship view (probably the sleeve/arm).
2. worlds2 / homeworld / Sector Core boss spawn were not seen: re-run step 03 on a fresh run. The core showed `boss: []`
   after 9 s of sim, because the boss may be gated behind the arena.
3. Mirror HUD header overlaps the clock and compass (top centre). `src/game/mirror.js` / `src/ui/mirror_ui.js`: move it
   under the compass (top ~110 px) while inside.
4. The compass stacks "SHIP" and "ENTRANCE" labels when they share a bearing ("SHIP ENTRANCE 174m" overprinted). This is
   in the HUD compass.
5. The Algorithm "LIVE" banner draws over open panels (forge) and over the stamina bar. Its z-index should drop below
   `.overlay` while a panel is open.
6. The VHS found-footage overlay (Level 0 pocket) covers hotbar slots 3-5 and the top-left body icon.
7. The `▮` glyph renders as a white box in the big QUOTA MET font (known, roadmap §6.4).
8. Grammar: the toast reads "Tester is now a Enforcer" (a/an).
9. Hotbar slot 4 "LIGHT" label overprints the item name in that slot.
10. Boot: 4x "403 Forbidden" resource loads (probably an external asset request through the sandbox proxy; check on the
    real host).

## Perf numbers (swiftshader fps is meaningless)
| Scene | draw calls | triangles | geometries / textures / programs |
|---|---|---|---|
| Orbit (ship) | 195 | 6.0k | 139 / 49 / 50 |
| 56K-Dialup outdoor | 372 | 105k | 231 / 79 / 63 |
| 56K-Dialup facility | 251 | 38k | 564 / 119 / 74 |
| HQ | 343 | 9.6k | 538 / 139 / 70 |
| Sector Core outdoor (mineshaft) | 428-638 | 134-144k | 691+ / 170 / 84-86 |
| Sector Core facility | 167 | 105k | - |
| Backrooms pocket | 68 | 45k | - |
| Mirror dimension | 529 | 77k | - |

Geometries grow from 139 to over 730 across 6 landings (maps unloaded but geometry count keeps climbing). Worth a leak
check: `renderer.info.memory.geometries` after 10 land/takeoff cycles. Programs 50 -> 86 is expected (new materials).
Net message rates were not measured (the mp run was cancelled).
