# Wave 2 - SECURED LOOT + BREACHING TOOLS (module `secureloot`)

Files: `src/game/secureloot_core.js` (pure rules, ALL numbers) - `src/game/secureloot.js` (install, host logic, prompts, net) - `src/models/secureloot.js` (containers, drill rig, tool models) -
`src/minigames/hack.js` (Hack Tool minigame, registered as `MINIGAMES.hack`) - `src/game/secureloot_i18n.js` (EN keys -> TR + RU) - `tools/harness/secureloot.test.mjs` (node: matrix, timings, jam odds, spawn counts, loot floors, balance table) -
`tools/harness/wave2_secureloot.js` (browser proof, written, NOT run: budget freeze). Shared edit: two lines in `game.js` (import + `useModule('secureloot', installSecureLoot)`).
Status: node test + build pass; NOT hand-played in a browser.

## What it does
The host places 0-5 containers per facility (seeded: same on every peer; wall spots for wall safes, deep scrap spots, vault / treasure rooms for vault crates). Each holds better-than-average loot
(tier floor Uncommon for cases / cages, Rare for safes / lockboxes, Epic for vault crates; cases + cages Rare from quota 3; shards, tools, gear sometimes). Scan (RMB) shows each container with the icon of the tool it needs.

| Container | Proper way | Crude fallback (any melee weapon, loud, may damage loot, may ring the alarm) |
|---|---|---|
| Glass display case | Glass Cutter 4 s, quiet | smash: instant, LOUD burst, 35 % alarm, 30 % per item loses half its value; bare hands 6 s |
| Wall / floor safe | Breaching Drill (place it, 70 s Common ... 40 s Mythic, loud pulses, 25 % jam -> hold E 1.4 s, creatures within 3 m may jam it) or Code Slip (found in the facility, 65 % of safes) -> safe minigame | bash 32 s (sledge faster) |
| Locked cage / chained locker | Bolt Cutters 3 s (medium noise) / Lockpick minigame (charges) / Crowbar pry 6 s | bash 14 s |
| Electronic lockbox | Hack Tool (timing minigame, fail = alarm) / EMP charge 1.5 s | bash 20 s, contents may be fried |
| Vault crate (quota 3+) | Plasma Torch 8 s + 1 Fuel Canister (bright sparks, emissive only) / Crowbar 25 s | bash 60 s, 50 % alarm |

Tool tier (found / crafted copies): hold time x 1/(1+0.12 tier) (cutter 4 -> 2.5 s Mythic), drill 70 - 6 x tier s, charges x tier statMul, jam odds 25 % -> 15 %. Tools are ordinary items: they live in the ship between days.
Sources: Company Store `tools`, crafting recipes (cat tools), 10 % of facilities have one lying around, rare bonus next to opened chests (wood 3 %, iron 8 %, gold 16 %, void 30 %), rolled inside cages / lockboxes / vaults.

## Numbers (from `node tools/harness/secureloot.test.mjs`)
Containers per facility: quota 0: 0-1 (avg 0.9, 73 % cases, no safes) - 1: 1-2 - 2: 2-3 - 3: 2-4 - 4+: 3-5 (+1 in big facilities, max 5); vault crates from quota 3 (12 % of facilities at q3, 52 % at q9).

| Tool | Price | Uses | Per use | Loot of its container (sell + utility EV, q2) | Noise |
|---|---|---|---|---|---|
| Glass Cutter | 45 | 6 | 8 | 106 + 25 | 2 quiet events (no Threat) |
| Bolt Cutters | 60 | 5 | 12 | 107 + 77 | 2 events (+0.8 Threat each) |
| Hack Tool | 85 | 5 | 17 | 45 + 139 | none (fail = alarm) |
| Breaching Drill | 240 | 3 | 80 | 155 + 143 | 36 pulses, ~+21 Threat while it runs |
| Plasma Torch | 195 | 4 | 60 (+ fuel) | 221 + 581 | 5 pulses, ~+7 Threat |
Average plain scrap item ~63. Noise goes through `game.balance.noise` (Threat spike = 1.4 x loud, decays in ~40 s) and `creatures.noise` (hunters walk to the container).

## Net (prefix `sl`)
client -> host `slAct {op: sync|begin|end|open|fail|drill|fix|pack, id, s(seed), m, tool, aux}`; host -> all `slSt` (HOST_ONLY): `{id, o (opened), w (work method), d {p,j,tr,dur} (drill), jam}` or `{list}` for late join.
The host validates the tool (held by the sender), distance (5 m) and elapsed time (>= 80 % of the hold, minigames >= 1 s) and owns timers, noise, jams, alarm (`game.facilitysys.force('alarm')` when present, else a loud noise + alarm sound), wear and loot.

## Not done / open
No browser run (see above); no durability-module hookup (tools use `charges`); a drill left running when the crew takes off is lost; wall-safe placement shares wall spots with mimic doors / lore logs (small overlap risk).
