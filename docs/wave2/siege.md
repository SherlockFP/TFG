# Wave 2 - Tech deployables + SIEGE (module `siege`)

`game.siege` (event) owns `game.deployables` (kits). Files: `src/game/siege_core.js` (pure numbers, wave planning, flow field, node test
`tools/harness/wave2_siege_core.mjs`), `src/game/siege.js` (event, hull, door, creatures, rewards, terminal), `src/game/deployables.js`
(14 kits: items, recipes, blueprints, placement, sim, net), `src/models/deployables.js` (procedural models, instanced barricades / spikes / mines),
`src/ui/siegehud.js` (banner, SIEGE panel, placement hint). Shared edits: `game.js` (2 slot lines), `src/ui/panels/crafting.js` (`tech` in `CAT_LABEL`).
Proof: `tools/harness/wave2_siege.js` (smoke_land + place turret / barricade, siege start, waves, hull, rewards, cleanup: all checks true, `errs: []`).

## Triggers (host, `TUNE` in siege_core.js)
| trigger | rule |
|---|---|
| extraction aftermath | `tfg:extraction {phase:'end'}` -> 70 % chance, siege starts 20 s later |
| night | Threat >= 50 (HUNTED) and 18:00-22:30: 1.2 % per 10 s check (~25 % per night while hunted) |
| BREACH NIGHT | last quota day (`daysLeft === 1`), from 18:00, certain (power x1.2, +1 wave). Own banner; `run.dailyEvent` is not touched |
| contract | `game.mods.emit('tfg:siege', { reason: 'contract', waves?, power?, prep? }, game)` (Moderation Bureau "Hold the Line") |
Rules: never before quota 2 (`quotaIndex >= 1`), max 1 per day (`run.siegeDay`), needs a living player and an outdoor map, prep is always given (60 s siren + banner).
Debug: `game.siege.start({prep, waves, power})` (host), `game.siege.skipPrep()`, `game.siege.stop()`. Terminal `SIEGE` = status + next risk.

## Flow
prep 60 s -> 3-5 waves (`waveCount`: 3, +1 at power >= 1.6, +1 at >= 2.4, +1 on breach night, cut to what fits before midnight) -> lull 18 s between waves
(+6 hull) -> `SIEGE HELD`. Wave cap 75 s (non-final waves move on, final wave: 45 s grace then stragglers retreat). The day clock runs at 35 % during
a siege and is held below 23:56. Normal spawn timers are pushed back. Takeoff aborts (creatures + deployables removed, no rewards).

## Numbers
Power `P = sector x crew x threat x reason` (clamped 0.75-3.4): sector `1 + 0.1 x quotaIndex` (max 14), crew 1 / 1 / 1.35 / 1.7 / 2.0, threat `0.85 + 0.6 x threat/100`, reason extraction 1.0, night 0.95, contract 1.1, breach 1.2.
Wave `w`: swarm `round(P x (5 + 2.5w))` (max 40), tank `floor(P x 0.55 x (w-1)^0.8 + 0.3)` from wave 2, runner `round(P x (0.8 + 0.5w))` from wave 2, boss on every 3rd wave, +1 tank on the last wave at P >= 1.4.

| creature (`sg_*`, model) | HP | dmg | run m/s | hull /s | vs deployable | notes |
|---|---|---|---|---|---|---|
| Spam Swarmer (scuttler) | 26 | 6 | 5.0 | 0.14 | 6 | fodder, drips in at 3/s (max 40 alive) |
| Doomscroller (troll) | 70 | 14 | 8.8 | 0.30 | 12 | hunts players within 28 m |
| Buffering Blob (sludge) | 330 | 30 | 2.4 | 1.10 | 40 | prefers barricades / turrets, 12 m aggro |
| Viral Behemoth (crawler x2.4) | 2200 | 55 | 3.4 | 3.00 | 90 | boss, level = crew (HP x1.18 per level) |
(all further scaled by `game.balance` sector HP / dmg / speed and its speed cap; siege creatures never drop components: `noCompDrop`.)

| P (quota, crew, threat) | waves | contents (swarm/tank/runner/boss) |
|---|---|---|
| 1.0 (q1, 1, 10) | 3 | 8/0/0/0  10/0/2/0  13/1/2/1 |
| 1.5 (q1, 2, 30) | 3 | 11/0/0/0  15/1/3/0  19/1/4/1 |
| 2.35 (q2, 3, 50) | 4 | 18/0/0/0  23/1/4/0  29/2/5/1  35/4/7/0 |
| 3.4 (q4+, 4, 60+) | 5 | 25/0/0/0  34/2/6/0  40/3/8/1  40/4/10/0  40/6/11/0 |

Ship: Hull Integrity 100, door HP `260 x (0.8 + 0.2 x crew)`. Creature hull damage = `hull/s x cd` per hit; door hits count 2.6 door HP per hull point and take the hits
while the door is closed (open door: hull x1.4 and creatures in the doorway attack the crew inside, +1.7 m reach). Door at 0 = broken, forced open, cannot be closed until
repaired above 25 %. Hull 0: every 9 s a creature within 6 m steals / smashes one item inside the ship (never a game over). Patch: hold Scrap Metal, `E` at the hull (+10) / door (+60).
Flawless = hull never below 85 and door never broken.

Rewards: per wave `credits = (30 + 12q) x (1 + 0.15w) x (0.85 + 0.15 crew)`, components (metal 2 + w, electronic 1 + ceil(w/2), arcane from wave 3, +2 electronic final) dropped at the door, XP `40 + 8q + 10w`, Clout `4 + w`.
SIEGE HELD: `credits = (120 + 45q) x (0.8 + 0.2 crew) x (0.6 + 0.4 hull/100)`, XP `180 + 45q`, Clout `30 + 8q`, +2 Ectoplasm-grade arcane parts; flawless = each client unlocks its next missing siege blueprint.
Balance reasoning: first siege (q2, solo) is 8 / 10+2 / 13+1+2+boss creatures against 100 hull: an unattended ship loses ~35 hull per wave, so the crew has to fight or build, but a couple of MK1 turrets + a wall
hold it at 90+. Crew size scales counts, not HP (bosses scale HP with crew). Sector adds +10 % per quota. Held bonus (~150-970 credits) is roughly one day of surplus at the same quota (see wave1 balance economy table), so building is worth more than its store price (MK1 ▮180).

## Deployables (kit = held item `dep_<type>`, tier = `it.tier`, HP / damage / cell x `TIERS[tier].statMul`)
| kit | HP | function | power | source |
|---|---|---|---|---|
| Auto-Turret MK1 | 120 | 7 dmg x 4/s, 22 m, ammo 120 (scrap metal +30) | ammo | store ▮180, recipe |
| Auto-Turret MK2 / MK3 | 200 / 320 | 12 x 3/s, 26 m / 18 x 3.5/s, 30 m | 1.2 / 2 per shot | recipe, bp_siege_turret |
| Tesla Coil | 160 | 30 dmg chain x3 (x0.7), 12 m, every 1.6 s | 8 per zap | recipe, bp_siege_tesla |
| Barricade wood / metal | 200 / 520 | blocks nav (flow cost 25 / facility NavGrid block + restore) | - | store ▮40 / ▮95, recipe |
| Spike Strip | 90 | -50 % speed, 6 dps, wears out | - | store ▮55, recipe |
| Proximity Mine | 30 | arms 3 s, 90 dmg blast 4.2 m, creatures only | - | store ▮70, recipe |
| Floodlight Tower | 140 | LightPool emitter, repels + reveals dark-loving creatures within 22 m | 0.5/s | store ▮160, recipe |
| Repair Drone | 90 | 6 hp/s to deployables within 9 m, hull +0.5/s, door | 1.5/s | recipe, bp_siege_drone |
| Motion Sensor | 60 | HUD line: contacts within 40 m + nearest + compass | 0.3/s | store ▮120, recipe |
| Shield Dome | 200 | absorbs 350 dmg in 5.5 m (also hull / door hits, 12 dmg = 1 hull pt), regen 8/s after 4 s | 0.5/s | recipe, bp_siege_shield |
| Portable Generator | 180 | fuel 100 (0.3/s idle), powers everything in 14 m, no wires; fuel canister +50 | - | store ▮220, recipe |
| Battery Bank | 150 | 500 units, 10 m, generator in range charges 8/s; battery +60 | - | store ▮200, recipe |
Placement: green / red ghost, R rotates (22.5 deg), LMB places, host validates (slope 0.72, static overlap, circles, ship + door path, players in the way, caps per type / 48 total, 8.5 m reach); `E` = feed / repair (1 scrap metal = 35 %) / pack up (refund kit, damaged < 25 % gives 2 scrap).
Non-siege creatures also chew deployables they touch. Blueprints (`bp_siege_*`) come from Turret Firmware Log / Resonator Coil / Drone Chip / Dome Prism (strange items, ANALYZE) or a flawless siege. Recipes live in the workbench tab TECH, store tab Tech.

## Net
`sgplace`, `sgact`, `sgpatch` (client -> host requests); host -> all: `sgd {add|rm|all|zap|boom|shield|err}`, `sgs` delta rows (hp, resource, aim, flags, shots, target), `sgx {banner|hull|bp}`; siege state rides `run.siege` (generic run sync).
`shipdoor` handler is wrapped (broken door cannot be closed). Handlers accept only host-sent messages.

## Known limits
Not tested with two real peers. `game.horde.spawnSwarm` is not used (module not merged yet): fodder is `sg_swarmer`. Facility-interior barricades block the NavGrid but the interior has no waves (indoor kits are for turrets / guard duty).
Motion Sensor is a text readout, not a radar. Deployables are not saved (they go with the takeoff). Turkish strings added for HUD / prompts / terminal; item names stay English.
