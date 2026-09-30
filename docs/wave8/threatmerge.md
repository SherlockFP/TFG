# Threat merge (wave 8 night, backlog 9 + 11)

## What
- **One gate.** `game.crdirector.canSpawn(type, pos, kind)` (pure part: `crdirector_core.gateOk`).
  - kinds `horde` / `siege` / `mirror` (and loose zombies `zombie`): allowed only from quota index 3, director on or off (same answer on every peer, so the mirror portal plan stays deterministic).
  - every other kind (`lcm`, `backrooms`, `crypt`, `night`, `squad`, feedcams): active threat + cost must fit `capOf x GATE_SHARE[phase]` (calm .5, build 1, peak 1.3, relax .7); an empty field always admits one creature (cost <= limit + 1.5). Off-host, director off or between landings: allowed.
  - callers: horde `startWaves` + ambient zombies + `spawnHitSquad`, siege `eligible`, mirror `planPortal`, skeletons night raid + swarm group, creatures_backrooms `spawnAt`, backrooms `hostSpawnHunter`, lcmonsters `veto`, feedcams (already).
- **Curated pool.** `threatpool.js`: `poolFor(run, moon)` seeded by runId + moon + quota index (sector); 3 of the 11 headline creatures (minQ respected: Masked / Followers / Dimmer / Auditor / Rift Stalker from quota 1, Zombie Accounts from 3) + the moon's theme creature (heaviest non-baseline table entry, e.g. the Worm). Non-pool headliners: table weight x0.12 (Hard x0.24), lcmonsters plan + director new-rule pick skip them (Hard allows). Everything outside the 11 is untouched. Terminal `MOON <name>` / route confirm: `KNOWN RESIDENTS: A, B, C`. First-encounter captions unchanged.
- **Polish (item 11):** `hud.setPrompt` strips `[E]` from labels (a11y.js CSS adds the key badge -> was `[E] X [E]`); `public/mods/employee-assignments.js` ignores downed players; `hubgate.coverTick` hides locked ship fixtures (arcade cabinet, chess table, stove, brew, planter; SYSTEMS[id].cover) and shows a grey tarp box of the same footprint, restored on unlock.

## Test
`node tools/harness/threatmerge.test.mjs` (+ crdirector, lcmonsters, hubgate, onegoal, balance_rules, mirror, horror*, br_pocket, wave2_siege_core), `npm run build`.

## Knobs
`GATE_SHARE`, `WAVE_KINDS` (crdirector_core.js); `HEADLINE`, `POOL_SIZE`, `RARE_MUL` (threatpool.js).

## Known gaps
Not browser-run. Tarp finds fixture roots by position (< 6 cm from the SPOT); the pets incubator is not tarped (no DIMS entry). Extra `spawnTable` callers without a `run` see no pool. Zombie loose groups now need Zombie Accounts in the pool (rarer than before). Budget vetoes are silent; spawners retry on their own schedule.
