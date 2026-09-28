# Wave 2 - gameplay2 (identification, Spambomb, ship faults, auto roles)

Module `gameplay2` (`game.gameplay2 = { aptitudes, identify, creeper, faults, status() }`), installed by
`this.useModule('gameplay2', installGameplay2)`. Each part is failure-isolated. One net type: **`g2`** (host-only
broadcasts + one host request handler): `ident, known, faults, clear, fixed, hit, bad, role, kb`.

| File | What |
|---|---|
| `src/game/gameplay2.js` | installer, `g2` dispatcher, Spambomb knockback (re-applied 0.35 s through a `player.update` wrap) |
| `src/game/identify.js` | class table `IDENT` (every registered creature + foreman / legacybot / skeleton / robot), fallbacks, scan relabel, aim + progress, card, codex |
| `src/game/creeper.js` + `src/models/creeper.js` | Spambomb creature, behaviour, blast, procedural model, Hull Patch model |
| `src/game/shipfaults.js` + `src/models/shipfaults.js` + `src/minigames/shipfix.js` | pre-flight faults, station panels, 3 new minigames (`g2valve`, `g2needle`, `g2code`) |
| `src/game/aptitudes.js` | Trader / Engineer roles, aptitude lines, new bonus keys, auto assignment, reroll, sell / store hooks |
| `tools/harness/gameplay2.test.mjs`, `wave2_gameplay2.js` | node test (341 checks) and the ONE headless feature run |

## 1. Creature identification
Non-hazard creatures show **??? UNKNOWN ENTITY** on scan and on the aim read-out until identified (hazards keep their labels: the turret
code; mimics / Doppel keep their disguise). Aim at one and keep the scanner on it (RMB held, or within 2.6 s of a scan) for
**1.5 s / (1 + identifySpeed)** -> the host validates (type, alive, <= 36 m) and broadcasts; every peer gets the card
**ENTITY IDENTIFIED - name - CLASS - threat stars - WEAKNESS**. First time per profile: +25..65 XP (identifier only). Saved in
`profile.bestiary[type].id`; crew members receive it too and a joiner is told what the host knows (`known`). An Instant Camera photo
(horde) identifies everything in frame, mimics included. Identified creatures scan as `Name Lv.N` + `CLASS  ★★☆☆☆` in the class colour.
Classes: Predator, Scavenger, Mimic, Territorial, Parasite, Stalker, Janitor, Collector, Anomaly, Swarm, Explosive. Unlisted ids
(future modules) fall back by def flags (boss -> Territorial 5*, hazard / unkillable -> Anomaly, cheap -> Swarm, else Predator);
add a row to `IDENT` for a proper hint. Turkish strings are registered (test checks every hint).

## 2. SPAMBOMB (class Explosive)
34 HP, walk 1.9 / run 4.6, hisses (pitched static loop), no footsteps. Sees you (13 m) -> chases -> stops at 2.6 m -> **primed** (client
telegraph: flashing + rising `mine_beep`, model inflates) for **1.5 s** -> pops: `M.blast` (r 4.4, LOS + falloff, dmg 34 + 2.5/level, then
balance scaling) + knockback + **fragile scrap breaks** + closed / locked **doors blast open** (not vaults) + **treasure crates**
(worldx `openChest`) + other creatures hurt / stunned + **other Spambombs are primed (chain reaction)**. Counterplay: kill it first (no
blast), stun it (defuses), **flashlight in its face -> hesitate** (fuse paused, max 1.4 s per bomb). Spawns: indoors via
`EXTRA_SPAWNS` (weights 3/4/5/6 by tier, office / serverfarm favoured), outdoors via a host timer (52-100 s / balance spawn mult, max 2
alive, 36-60 m from an outdoor player); **never in quota 0** (`def.noSpawn` getter, read by `canSpawnMore`). HP / damage / speed are scaled
by `game.balance` through the generic paths. Debug: `kefal.game.gameplay2.creeper.spawn(pos, {zone:'out'})`.

## 3. Ship faults before takeoff
`hostBeginTakeoff` is instance-wrapped (like rpg wraps `hostSell`): lever or the midnight autopilot start a **PRE-FLIGHT CHECK** instead of
leaving (`alldead` skips it). **1-3 faults**: quota 0 = 1 (easy types only), quota 1-2 = 1-2, quota 3+ = 2-3; Threat >= 60 (70 in quota 0)
or hull damage >= 40 % (50 %) adds one (soft reads: `game.balance.threat()`, `run.hullDamage`, `game.siege.hull`).

| Fault | Fix |
|---|---|
| Fuel Line Leak | hold E (1.2 s), then the **valve** minigame (drag clockwise / D) |
| Nav Computer Reboot | type the 5-digit code shown on the **NAV DISPLAY** at the **NAV CONSOLE** (two stations >= 3.4 m apart; crew >= 2 aboard: one reads, one types; solo: the code is flashed for 3.5 s) |
| Coolant Overheat | **needle** minigame (hold SPACE to cool, keep it in the green) |
| Hull Breach | **Hull Patch** item in hand (hold E 1 s, consumed; spawned with the fault, buyable for 18) or hold E to weld (8 s) |
| Power Relay | the existing **fuse** wire minigame |
| Thruster Jam | hit it 3x with a melee weapon (fists do not count; `resolveMelee` is wrapped) |

Stations are wall panels at the first free spot: bounding boxes of the ship's meshes (props added by other modules included) are checked,
so nothing collides; the host sends the poses. HUD: objective checklist `PRE-FLIGHT FAULTS 1/3` + one line per fault + countdown, big
banner, alarm loop, red strobe (emissive lamp + one pooled light per station: **scene light count unchanged**, asserted in the run).
Host validation: distance <= 6.5 m, player aboard, `start` -> `fix` minimum time, nav code compare, patch item ownership. Lever mode: if
creatures are within 45 m of the ship a **75 s purge countdown** starts (cancelled after 12 s of calm). Midnight: **45 s**. On expiry every
unresolved fault costs a penalty (60 %: a scrap item is sucked out, else 14 dmg to everyone aboard; soft `game.siege.damageHull(0.06)`)
and the ship leaves. All fixed: "ignition in 3" then the original takeoff. Repair speed (Engineer +40 %, Technician +25 %) shortens holds.
`game.config.shipFaults = false` turns the whole thing off.

## 4. Auto roles + aptitudes
Roles are extended at import (no fork): **Trader** (`sellValue 0.15`, `shopDiscount 0.10`, kit Spray Paint, tree post = Hauler's) and
**Engineer** (`craftLuck 0.10`, `forgeLuck 0.10`, `repairSpeed 0.40`, kit Hull Patch, tree post = Technician's) via `home` in
`START_ID`. Every role card now has a **GOOD AT** line (en + tr): Scout +40 % identify, Technician +25 % repair, etc. New keys (all pct):
`sellValue, shopDiscount, forgeLuck, repairSpeed, identifySpeed` (`game.rpg.bonus`). Applied by us: `sellValue` = the bell ringer's bonus
on the host sell path (`run.favor`), `shopDiscount` = shown in `game.shop.stock()` and refunded in `game.shop.hostCart`, `repairSpeed` /
`identifySpeed` in shipfaults / identify. `craftLuck` is read by crafting.js already; the forge module should read
`game.rpg.bonus('forgeLuck')` (or `game.gameplay2.aptitudes.forgeLuck()`).
**Auto assignment** (host, at run start / on join / next orbit): everyone without a role gets one, preferring roles nobody holds; the client
applies it in orbit only (never overrides an existing role). **One free reroll per run** (`REROLL` in the terminal, or pick in the ROLE
panel): a new role that no crewmate holds, only while the tree is empty.

## Shared-file edits (all tiny)
`game.js` (2 slot lines), `passivetree.js` (`START_ID` honours `home`), `ui/panels/roles.js` (iterate all roles, GOOD AT line, 4 columns),
`rpg.js` (terminal ROLE list iterates all roles). No other shared file.

## Tests
`node tools/harness/gameplay2.test.mjs` (341 checks) and one headless run: `flock /tmp/tfg-browser.lock timeout 400 node
tools/harness/headless.mjs --port 5260 --script tools/harness/wave2_gameplay2.js`. Last run: 0 failures, no page errors. Measured:
identified in 1.3 s of aiming, fuse 1.5 s, knockback 1.7 m, fragile scrap / locked door / crate destroyed, lever -> 2 faults (nav + jam)
-> takeoff only after they were fixed, all 6 fault types fixed through the real host protocol (item patch, wrong nav code, a real melee
swing on the jam), midnight autopilot held the ship 43 s, 17 lights before / during / after.

## Known issues
- The purge penalty path (`expire`) was read-reviewed but not executed in the headless run (the midnight run fixed its only fault).
- Passive-tree panel: Trader / Engineer share a post, so "your post" highlighting shows the Hauler / Technician post.
- Photo identification uses the `lastInFrame` array of horde's camera (no hook): needs horde. Aim identification needs the scanner
  (RMB) - not tested with a real mouse (pointer lock is not available headless; the scan + aim path was driven through `game.scan()`).
- Knockback / faults / station visuals were not looked at in a screenshot (budget); minigame feel (valve drag, needle) is untested by hand.
- `shipfault` damage uses the generic death text ("died."); crew >= 2 nav flow only tested with one player.
