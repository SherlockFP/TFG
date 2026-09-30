# Kefal Homestead ("KEFAL YURDU"): plot tycoon on the homeworld (wave 8)

Owner request: "I am building a house on my own planet, put a Roblox-tycoon-style system there; if it exists, improve it, otherwise build it in that style."
There was no such system: the homeworld has the factory (H buildings + h2 machines) and the Alien Diner (resto). This is a new, small, deliberately hard-capped plot tycoon next to them.
Module slot `homestead` (`this.useModule('homestead', installHomestead)`, `// [slot:tycoon]` in game.js). Net prefix `hs`. Not seen in a browser (see Unverified).

## Loop
1. First landing on the homeworld after the unlock: toast "A gold pad is blinking in the south" plus a chevron trail (one merged mesh) from the BUILD console down the south lane to the claim pad. It fades out after the claim.
2. Stand on a glowing pad for 0.7 s (radius 0.95 m, 1.6 s retry, not while a panel is open) to buy it. At most 3 pads show, in catalogue order; green = affordable, amber = not.
3. Line: dropper, belt, recolour gates (Smelter orange, Press cyan, Polish gold), collector. Cubes ride the belt about 8 s and recolour at each gate. Cosmetic, one InstancedMesh (max 48), computed per client.
4. Stand on the gold collector pad: first collect after 0.7 s, then every 1.5 s. The pot pays floor(pile) credits into `run.credits`, plus Clout once per game day.
5. The money builds the lodge (house) piece by piece: foundation, bunk room, hearth, workshop, porch, roof. Finishing the roof fires the banner "KEFAL YURDU TAMAM" and lights the neon "HOME" sign.
6. Re-Claim (credit sink, needs Polish Gate + Roof): resets the line, keeps the lodge, gives a star (cube skin chrome / neon / prism, cosmetic belt speed x(1 + 0.12 rb)). Never raises the cap.

## Layout (world metres, `homestead_core.js`)
- `PLOT = {x0:-44, x1:-20, z0:48.6, z1:56.4}`: south band, 24 x 7.8 m, outside the build square (z0 >= 45 + 3), off the south lane (|x| >= 20), 2.7 m east of the SW memorial, plateau margin 1.6 m.
  Nearest corner 52.55 m from the origin > `RAID.spawnR` + 0.4, so raiders never spawn inside. The plot is not part of the raid system.
- Belt row z = 49.6 (x -42.5..-23.5), pad row z = 51.4, lodge z 52.4..56.4 (three 5.5 m rooms, each with a 1.6 m door gap on the walkway), porch x -26.5..-24, booth + tally board (-21.5, 48.9), collector pad (-21.5, 49.8), claim pad (-21, 52.6), Re-Claim pad (-21.2, 54.9).
- Colliders: lodge walls (after `found`), booth, machine posts only. `collidersFor(id)` is the single source for the module and the tests.

## Numbers (all in `TY` / `PIECES`)
| Piece | Cost | Needs | Day cap |
|---|---|---|---|
| claim | 0 | | |
| drop1 Scrap Dropper I | 40 | claim | |
| belt | 30 | drop1 | 16 |
| gate1 Smelter | 80 | belt | 24 |
| drop2 | 90 | gate1 | 30 |
| gate2 Press | 180 | drop2 | 38 |
| drop3 | 260 | gate2 | 44 |
| gate3 Polish | 450 | drop3 | 50 |
| auto Sweeper Arm | 400 | drop2 | |
| found / bunk / hearth / shop / porch / roof | 120 / 150 / 260 / 380 / 180 / 600 | chain from claim | |

Line total 1,530, lodge total 1,690, Re-Claim 1,200 + 600 per star (max 3). Line pieces re-cost 75 % after a Re-Claim.
- `capOf(s)` = cap of the highest built line piece x `TY.capScale` (default 1, clamped 0.5..1). Rate = cap / 180 s (a day's cap pours in about 3 minutes, then the belt stops and the dropper lamps go red). Pile holds 2 x cap.
- Real time while a run is live, any phase, no offline catch-up. `g.n` (earned today) resets only when `day` increases inside the same run id; a new run id only re-anchors the mark, a rewound day is ignored (resto `daysSince` semantics).
- Collect: credits floor(pile); Clout min(6, 1 + furnished rooms + stars) to every crew member, once per game day (`cl` flag, set to 1 on each day advance). The sweeper arm (every 30 s, HOME only, host) pays no Clout.
- Re-Claim pays the pile out first, then resets the line. Credits are never multiplied.
- Max income is 50/day (about 10 % of `ACTIVE_DAY_VALUE`); the full plot costs about 3,220, so it stays a net credit sink for roughly its first 40 game days.

## Net / state (host-authoritative)
- `profile.homestead` = `{v, b:[ids], rb, pile, g:{run,day,n}, cl, who:{piece:name}, by:{name:spent} (8), st:{earned,collects}}`, mirrored to `run.hs` (`broadcastRun(['hs'])` + save on buy / collect / reclaim / leaving HOME / landing on HOME; pile-only changes save at most every 15 s). Late joiners get it in `welcome`.
- `hsreq {op:'buy',id} | {op:'collect'} | {op:'reclaim'}` (client to host). Host checks in order: host, `onHome()`, no raid, homeworld unlocked (`onboard.locked`), 0.08 s per-peer rate limit, distance to that pad <= 2.4 m.
  Two players on one pad: the first buys, the second gets a silent err `owned`.
- `hsx {p,g,c,r,cl,rb}` host to all, 1 Hz, only on HOME (drives board, cubes, pile). `hsmsg {k:'built'|'col'|'reclaim'|'err'}` host to clients. `HOST_ONLY` has both.
- Host migration: `migHs` flag; the new host adopts `run.hs` and never writes its own profile (copy of resto's approach).
- Crew members' achievements: `profile.hsMark` (tiny monotone mark of claim / gates / roof / stars) written by the module on non-host peers, read together with `profile.homestead` by `hs_*` achievements.

## Reused / touched
- `world/resto_view.js`: exports `B`, `easeOutBack` (moved), `buildPad`, `labelSprite` reuse. `resto.js`: imports `easeOutBack`; fixed `case 'angry'` where `break;` sat inside a `//` comment and fell through into `swat`.
- `rewardviz`: `yard` ledger row ("Homestead"), listens to `hsmsg col`, arrival toast "The homestead piled up ▮n" (3.2 s after landing). `sfxlib`: `ui_buy_b` (+3 semitones) / `ui_buy_c` (+5), buys under 6 s apart climb `ui_buy` -> `_b` -> `_c`.
- Achievements `hs_claim`, `hs_line`, `hs_roof` (title Homeowner / Ev Sahibi), `hs_reclaim` (small Clout). Homeworld panel STATUS tab: one row "Homestead: ▮pile/cap". Panel: E at the booth (no new key, no HUD widget).
- i18n: EN keys + TR + RU in `homestead_i18n.js` (Yurt, Kasa, Damlatici, Eritici / Pres / Cila Kapisi, Temel, Ranza Odasi, Ocak, Atolye, Veranda, Cati).

## Economy sim gate (`node tools/sim/economy.mjs --modes-only --runs 60`)
`hsCycle(k)` next to `restoCycle`: a crew that buys about one piece per cycle and visits HOME once per cycle cashes min(3 cap, 2 cap) + the once-per-day Clout. 50 % of runs keep a plot (deterministic hash, no new `rand()` call, so old streams are identical).
- Result: hs share of all income 0.63-0.78 % (gate <= 3 %), medians unchanged (6 / 7 / 7), headline unchanged. Per cycle at k = 2 / 4 / 7: 33 / 61 / 101 credits.
- The spec asked for "combined side share <= 25 %". The baseline WITHOUT the plot is already 34.7 / 35.0 / 40.9 % (resto + ore + arcade + jobs + crate + pocket), so that ceiling was never met; the plot adds only +0.4..0.5 points (35.2 / 35.4 / 41.2 %).
  The gate as implemented checks the plot's own share and the medians. If it ever fails: lower `TY.capScale` only, never prices.

## Knobs
`TY.rampS`, `TY.capScale`, `TY.pileMul`, `TY.autoEvery`, `TY.cloutMax`, `TY.rebuildMul`, `TY.reclaimBase/Step`, per-piece `cost` / `cap`, view: `MAX_CUBES`, `CUBE_PERIOD`, `BELT_SECS`, `PLAQUE_MAX`.

## Tests
`node tools/harness/homestead.test.mjs` (one file, 10 checks): plot geometry vs decor / lanes / raid ring / ship / resto, catalogue (pads, colliders, totals), tryBuy + sanitize, 10k-sequence accrual fuzz, collect, reclaim, installer against a fake game (rejections, double buy, migration, sweeper, no leaks), view under node three (cube / pile counts, zero lights, dispose), i18n coverage.
Regression run: homeworld, homeworld2, homeworld2_install, homeworld_decor, homeworld_raid, resto, hubgate, netaudit_wave8, perf5, rewardviz, profile + `npm run build`.

## Unverified (no browser run, by rule)
Pad dwell feel and the 0.95 m radius; whether the 24 x 7.8 m plot and walkway read well; cube readability at distance; the tally board / neon sign text legibility; chevron trail visibility on the real ground layers; raiders' pathing past the lodge colliders (the plot is outside the raid ring, but a lane raider can walk along it);
the roof "drop" animation, sfx pitch steps by ear; TR / RU wording in context; a second client's view of the pile between 1 Hz snapshots (cubes/pile are cosmetic and per client).

## Out of scope (v1)
Blueprint pads that call homeworld `tryBuild` or stamp h2 kits, Shift Pay / debt, worker NPCs, per-player plots, raid damage to the plot, offline catch-up, credit multipliers, links to prestige, new currency / key / HUD widget / unlock id / THREE light.
Known gap noted from the audit: `hwact` / `h2act` have no distance check (not touched here).
