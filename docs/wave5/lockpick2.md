# Wave 5 - LOCKPICK 2 (module `lockpick2`, MASTERPLAN 25.3)

Status: node test (95 checks) + `npm run build` green; one short headless run (module installs, real `'lockpick'` registry entry plays an Algorithm lock with the drill, XP lands in `profile.lockpick2`, no page errors, screenshot checked). NOT hand-played, NOT tested with 2 real players.

## What changed
Lockpicking is now one **timing click per pin**: a marker sweeps a bar, click while it is inside the green window. The old dial minigame is replaced through the registry: `MINIGAMES.lockpick` is a wrapper around `src/minigames/lockpick2.js`, so every caller (doors `actions.js`, treasure chests `chests.js`, secureloot cages, tasks) keeps calling `game.openMinigame('lockpick', {difficulty})`; the tier comes from `opts.tier` or from the difficulty.

| Tier | Pins | Window (L1) | Marker speed | Timer | Extra | Wrong clicks to snap | XP |
|---|---|---|---|---|---|---|---|
| Simple | 1 | 30 % | 0.90 | - | - | 4 | 8 |
| Standard | 2 | 23 % | 1.05 | - | - | 3 | 14 |
| Security | 3 | 17 % | 1.20 | - | - | 3 | 24 |
| Vault | 4 | 14 % | 1.35 | 11 s | - | 3 | 42 |
| Algorithm | 4 | 12 % | 1.50 | 13 s | pin order + window reshuffle every 2.4 s and on a miss, glitch visuals | 3 | 70 |

Simple lock played well: ~1.4 s at level 1 (`idealTime`), under 1 s with the one-click perk.
**Mapping** (`lockpick2_core.js`): difficulty < .35 simple, < .55 standard, < .72 security, < .88 vault, else algorithm. Iron chest (.45) Standard, gold (.62) Security, void (.8) Vault, a crowbar pry is +0.2 (harder). Cages / lockers by sector: `0.2 + 0.1 x quota` -> Simple q0-1, Standard q2-3, Security q4-5, Vault q6, Algorithm q7+. Doors: `0.2 + 0.08 x danger` -> Simple on tier-1 moons, Standard after (early game stays easy, MASTERPLAN 19).

**Wrong click**: drops only the LAST pin you seated (first pin: nothing drops), 0.28 s lock-out (no click spam), the allowance (`maxWrong`) shrinks the pick; when used up the pick SNAPS (attempt fails; callers still take their 1 charge per attempt: lockpick 3 charges, titanium 9). Tools use item `charges` (the durability module only tracks weapons / armor).

## Skill (per profile, `profile.lockpick2 = { xp, opened }`, saved via `saveProfile`)
Level 1-10, XP thresholds 0, 12, 39, 78, 127 ... 503. Every level: window +5 %. Level 3: 1 pin auto-seated. Level 5: silent picking (no pick noise). Level 7: Simple locks open on any click. +1 wrong-click allowance per 4 levels. Drill / bypasser give 50 % / 60 % XP. Toast on each XP gain and on level-ups (names the perk). `noXp: true` in the minigame opts skips XP (tasks / debug).

## Tools (Company Store `tools`)
| Item | Price | Uses | Effect |
|---|---|---|---|
| Lockpicker (`lockpick`, existing) | 20 | 3 | baseline, quiet (0.2 per pin, below the Threat threshold but audible close by) |
| Titanium Pick (`lp2_titanium`) | 55 | 9 | window x1.15, +1 wrong allowance, half the noise |
| Electronic Bypasser (`lp2_bypass`) | 140 | 4 | ignores the Vault / Algorithm timer, window x1.5, +2 wrong; **loud** burst 1.3 (skill 5 does not hide it) |
| Breaching Drill (`sl_drill`, reused, held) | 240 | 3 | auto-plays: 0.45 s per pin (vault lock ~2.4 s), no timing, noise burst 2.8 + 1.6 per pin through `game.stealth.emit` -> Listener / Crawler come |
Held tool decides (`isPickType`); chests, doors and secureloot cages accept the new picks (cages: lockpick / titanium / bypasser; the drill keeps its own safe method there).

## Co-op (host-authoritative, prefix `lp`)
Picker opens a lock: `lpReq {op:'start', p:[x,y,z], tier}` (host checks p within 3 m of him) ... `{op:'end'}`. A teammate within 4.2 m gets the prompt **Hold the pins [hold E]** and sends `lpReq {op:'help', id}` every 0.45 s (expires after 1.3 s, max 2 helpers, not on your own lock). Host broadcasts `lpSt {list:[{id,by,x,y,z,tier,h}]}` (HOST_ONLY); the picker's minigame reads `h` live: each helper holds one pin (never the last) and widens the window +15 %. `Coop` class in the core is pure and node-tested.

## Files
`src/game/lockpick2_core.js` (all numbers, `LockState`, `Coop`) - `src/minigames/lockpick2.js` (view) - `src/game/lockpick2.js` (install: registry swap, items, skill, noise, net, prompt) - `src/game/lockpick2_i18n.js` (TR + RU) - `tools/harness/lockpick2.test.mjs` - `tools/harness/wave5_lockpick2.js` (headless smoke).
Shared edits: `game.js` (import + `useModule('lockpick2', ...)` after secureloot), `chests.js` (3x `isPickType`), `actions.js` (door pick tool + `doorDifficulty`), `secureloot_core.js` (`CAGE_PICKS`), `secureloot.js` (cage difficulty), `tasks.js` (`noXp`).

## Test / knobs
`node tools/harness/lockpick2.test.mjs` (tier mapping, window per level, XP curve, perks, wrong / break, lock-out, timers, algorithm shuffle, drill / bypasser, co-op speed-up with a bot, host book). Knobs: `TIERS`, `TOOLS`, `perksAt`, `xpForLevel`, `COOP` in the core. Harness: `game.lockpick2.open('vault', 'lp2_bypass')`.

## Known gaps
No shop icon / model of its own for the two new picks (they reuse the lockpick / hack-tool models). Drill-on-lock uses a drill charge per attempt (3 runs). The Algorithm lock appears only on cages q7+ and pried void chests (no dedicated vault-door use yet). Co-op needs a second real client to verify; the prompt position is where the picker stood. Headless frame rate made the timing bot meaningless, so play feel (speed 0.9-1.5 bar/s) is tuned by numbers only.
