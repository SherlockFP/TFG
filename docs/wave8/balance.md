# Wave 8 - creature balance ("bazi yaratiklar cok OP, direkt oldurUyor")

Owner complaint: some creatures kill outright. Fix: ONE rule module (`src/game/balance_rules.js`), applied where damage is dealt (not in 80 files), plus 5 number outliers.
Node test: `node tools/harness/balance_rules.test.mjs` (23 checks). Table generator: `node tools/sim/creature_table.mjs` (regenerates the table below from the real tables, all registerCreature modules loaded). Sims: `tools/sim/balance.mjs`, `tools/sim/economy.mjs`.

## Rules (all in balance_rules.js, shared with the sims through balance_core.capHit)
1. **Hit cap.** One non-boss hit takes at most 45 % (quota 0-1), 60 % (quota 2-3), 85 % (quota 4+) of a 100 HP bar. Applied in `balance.hitDamage` (runs inside `hostHurtPlayer` for EVERY creature/trap hit, any module). Only `INSTAKILL_OK` may kill in one hit, and only from quota 4: Pop-up (jingle), Worm (ground rumble), Fake Exit (breathing sign), Closet Thing (knock + creak), Clickbait Mine (click). Bosses are exempt (their hits are <= 63 anyway; specials are telegraphed).
2. **Wind-up >= 0.4 s.** `CreatureManager.attack()` asks `balRules.gate()`: damage lands `0.4 s - time already spent in the attack state` after the call. A target that steps away (> +1.3 m) or a creature that gets stunned in that window dodges the hit. Repeat calls inside 0.45 s are dropped (fixes the Influencer eat state hitting every tick). DoT ticks (slop, leech, swarm, tongue drag, explosions), bosses and hazards are not delayed. Clickbait tongue wind-up 0.3 -> 0.5 s. Legacy `attack(..., 999)` calls of non-allowlisted creatures (Lurker x2, Closet Thing) now deal the creature's own `dmg`.
3. **Grabs are escapable.** Any hold (`hostHoldPlayer`) ends after 3.2 s and grants 4 s grab immunity; the victim can mash JUMP x5 (toast "MASH JUMP TO BREAK FREE!") to break free at once (`balfree` request, EN/TR/RU strings). A freed player takes no Influencer / Clickbait damage. The Influencer grab is 1.8 s (was 1.4), then it eats 0.6 s later only if the victim is still within 6 m (before: it ate you anywhere 1.4 s after letting go). A leech latched for 6 s lets go.
4. **Gentle scaling.** Sector/threat scaling unchanged (x0.6 dmg at quota 0 -> x1.0 at quota 4 -> x1.5 cap). New `dmgMul` in the difficulty table: Casual 1.0, Standard 1.0, Hard 1.1, only from quota 3 (FROM_QUOTA), so early game is identical in every mode. Late-game scaling cannot exceed the 85 % hit cap.
5. **Registration.** `registerCreature()` (and the core table) run `normalizeDef()`: any non-allowlisted, non-boss def with dmg > 90 (the old 999) is clamped to 90 and remembers `dmgWas`.

## Outliers fixed (dmg per hit, base numbers before level/sector scaling)
| creature | before | after | why |
|---|---|---|---|
| Lurker | 999 (instakill from behind) | 70, hits then retreats | stalker with no tell to react to |
| Influencer (giant) | 999 | 85, mash to escape | grab now escapable, eat needs range |
| Parasocial (stalker) | 999 | 70 | invisible to the crew, cannot be a one-shot |
| NPC (mannequin) | 90 | 70 | 2 hits at 100 HP with 13 m/s speed |
| The Editor | 80 | 60 | beat-based but 80 left 20 HP |
| Pop-up / Worm / Fake Exit / Closet Thing / Mine | 999 / 999 / 999 / 999 / 110 at every quota | same numbers, but capped 45/60 % before quota 4 | allowlisted telegraphed hazards |
Unchanged on purpose: bosses (36-55), Moderator 45 (aim laser 0.8-1.4 s + lock), Tamagotchi adult 55, Support 50, Crawler/Troll 40-45 (burst-limited by chase_tuning: 9.4 m/s for 2.2 s, sustained 7.0 < sprint 8.2).

## The table (generated; `spawn` = lowest moon tier that rolls it, `event` = hostile-event / module spawned, `hazard` = not a melee creature)
| id | hp | dmg/hit (was -> now) | attack cd s | speed walk/run (m/s) | spawn | one-shot at 100 HP (was -> now) | telegraph |
|---|---|---|---|---|---|---|---|
| scuttler | 30 | 8 | 1 | 2.2/5.4 | T1 | no -> no | chitter + gate 0.4 |
| yoinker | 60 | 15 | 0.9 | 2.6/6.2 | T1 | no -> no | snarl + gate 0.4 |
| crawler | 160 | 40 | 1.4 | 2.8/11 -> burst 9.4 2.2s, then 7 | T1 | no -> no | dash in a straight line, gate 0.4 |
| lurker | 220 | 999 -> 70 | 8 | 2.4/9.5 -> burst 9.4 2.2s, then 7 | T1 | YES -> no | growl; backs off when watched, gate 0.4 |
| mannequin | immortal | 90 -> 70 | 0.6 | 12/13 -> burst 9.4 2.2s, then 7 | T1 | no -> no | freezes when seen, gate 0.4 |
| sludge | immortal | 35 | 0.5 | 1.1/1.9 | T1 | no -> no | slow blob (DoT ticks 50 %) |
| jester | immortal | 999 | 3 | 1.3/13.5 -> burst 9.4 2.2s, then 7 | T1 | YES -> q4+ only | jingle 10+ s, then chase |
| spider | 140 | 30 | 1.3 | 2.6/7.2 -> burst 9.4 2.2s, then 7 | T1 | no -> no | web + skitter, gate 0.4 |
| leech | 25 | 10 | 1 | 1.5/3 | T1 | no -> no | drop (0.45 s fall); lets go after 6 s |
| screamer | 90 | 25 | 8 | 2/6 | T1 | no -> no | scream = stun, gate 0.4 |
| mimic | 120 | 30 | 1.1 | 3.2/7 | T1 | no -> no | gate 0.4 |
| hound | 180 | 45 | 1.5 | 3/11 -> burst 9.4 2.2s, then 7 | T1 | no -> no | lunge state, gate 0.4 |
| giant | 600 | 999 -> 85 | 3 | 3/6.3 | T1 | YES -> no | grab 1.8 s (mash JUMP), eat 0.6 s |
| sandkefal | immortal | 999 | 8 | 8/12 | T2 | YES -> q4+ only | ground rumble 3.2 s |
| turret | immortal | 12 | 0.5 | - | T1 | no -> no | red aim laser 0.8-1.4 s + lock 0.25 |
| mine | immortal | 110 | - | - | T1 | YES -> q4+ only | click |
| mimicdoor | 60 | 999 | - | - | hazard | YES -> q4+ only | breathing exit sign |
| web | 10 | 0 | 1.0-1.6 | - | hazard | no -> no | hazard (no melee) |
| moderator | 240 | 45 | 2.5 | 1.9/3.8 | T1 | no -> no | eye + red laser 0.8-1.4 s + lock 0.25 |
| support | 150 | 50 | 1.3 | 2.3/5.6 | T1 | no -> no | gate 0.4 |
| ticketswarm | 45 | 5 | 0.45 | 4.6/6.2 | event | no -> no | buzz (DoT) |
| editor | 260 | 80 -> 60 | 1.5 | - | T1 | no -> no | moves on the drum beat only |
| tamagotchi | 320 | 55 | 1.5 | 1.2/8.2 -> burst 9.4 2.2s, then 7 | T1 | no -> no | crouch tell (adult) |
| stalker | immortal | 999 -> 70 | - | 2.6/6.2 | T2 | YES -> no | static + giggle |
| clickbait | 170 | 12 | 1 | 2.4/7.4 -> burst 9.4 2.2s, then 7 | T1 | no -> no | ding + flash, tongue 0.5 s, drag <= 3.2 s |
| replyguy | 70 | 16 | 1.3 | 2.6/7.2 -> burst 9.4 2.2s, then 7 | T1 | no -> no | wing spread + screech, gate 0.4 |
| h2_sentry | 150 | 6 | 1.0-1.6 | - | event | no -> no | gate 0.4 |
| h2_guard | 85 | 11 | 1.0-1.6 | 3.4/5.6 | event | no -> no | gate 0.4 |
| sg_swarmer | 26 | 6 | 1.0-1.6 | 3/5 | event | no -> no | gate 0.4 |
| sg_runner | 70 | 14 | 1.0-1.6 | 5.28/8.8 -> burst 9.4 2.2s, then 7 | event | no -> no | gate 0.4 |
| sg_brute | 330 | 30 | 1.0-1.6 | 1.44/2.4 | event | no -> no | gate 0.4 |
| sg_boss | 2200 | 55 | 1.0-1.6 | 2.04/3.4 | event | no -> no | gate 0.4 |
| hr_zombie | 42 | 11 | 1.0-1.6 | 0.95/1.9 | event | no -> no | gate 0.4 |
| hr_forger | 70 | 20 | 1.0-1.6 | 2.1/4.6 | event | no -> no | gate 0.4 |
| hr_ambusher | 160 | 55 | - | 2.4/5.2 | event | no -> q4+ only | knock + creak (stir) before the burst |
| hr_warden | 95 | 24 | 1.0-1.6 | 2.5/5 | event | no -> no | gate 0.4 |
| m5warden | 260 | 32 | 1.0-1.6 | 2.4/5.2 | event | no -> no | gate 0.4 |
| m5sleeper | 170 | 26 | 1.0-1.6 | 1.4/4.4 | event | no -> no | gate 0.4 |
| mr_ghost | 22 | 9 | 1.3 | 1.8/2.7 | event | no -> no | 0.5 s |
| mr_fiend | 42 | 12 | 1.2 | 2.4/4 | event | no -> no | 0.45 s |
| mr_copy | 60 | 14 | 1.3 | 2.6/4.4 | event | no -> no | 0.55 s |
| dunemaw | 300 | 55 | 1.0-1.6 | 4.2/6.6 | T2 | no -> no | gate 0.4 |
| tuskbeast | 380 | 38 | 1.0-1.6 | 1.8/8 -> burst 9.4 2.2s, then 7 | T2 | no -> no | gate 0.4 |
| scavraider | 70 | 14 | 1.0-1.6 | 2.2/4.6 | T2 | no -> no | gate 0.4 |
| alien_npc | 80 | 12 | 1.0-1.6 | 1.5/4 | event | no -> no | gate 0.4 |
| prowler | 95 | 22 | 1.0-1.6 | 2.4/7.4 -> burst 9.4 2.2s, then 7 | event | no -> no | gate 0.4 |
| br_smiler | 70 | 14 | 2.8 | 1.4/3.1 | T1 | no -> no | lunge 0.4 s |
| br_hound | 60 | 12 | 1.8 | 1.6/5.3 | T1 | no -> no | lunge 0.35 s -> gate 0.4 |
| br_partygoer | 150 | 5 | 1.0-1.6 | 1.2/2.5 | T1 | no -> no | gate 0.4 |
| br_moth | 24 | 3 | 1.0-1.6 | 1.8/3.4 | T1 | no -> no | gate 0.4 |
| skel_walker | 40 | 9 | 1.0-1.6 | 1.5/3.3 | T1 | no -> no | gate 0.4 |
| skel_archer | 30 | 9 | 1.0-1.6 | 1.6/3.6 | T2 | no -> no | gate 0.4 |
| skel_knight | 95 | 15 | 1.0-1.6 | 1.3/2.9 | T2 | no -> no | gate 0.4 |
| skel_swarm | 7 | 3 | 1.0-1.6 | 2.6/4.4 | T1 | no -> no | gate 0.4 |
| listener | 170 | 55 | 1.0-1.6 | 1.5/7.6 -> burst 9.4 2.2s, then 7 | T2 | no -> no | gate 0.4 |
| spambomb | 34 | 34 | - | 1.9/4.6 | event | no -> no | swell 1.5 s before it pops |
| zombot | 18 | 5 | 1.0-1.6 | 1/1.55 | event | no -> no | gate 0.4 |
| hs_enforcer | 80 | 20 | 1.0-1.6 | 2/4.6 | event | no -> no | gate 0.4 |
| hs_gunner | 65 | 12 | 1.0-1.6 | 1.9/3.8 | event | no -> no | gate 0.4 |
| hs_leader | 130 | 10 | 1.0-1.6 | 1.8/3.6 | event | no -> no | gate 0.4 |
| doppel | 110 | 26 | 1.0-1.6 | 1.6/5 | event | no -> no | gate 0.4 |
| collector | 55 | 8 | 1.0-1.6 | 2.2/5.6 | event | no -> no | gate 0.4 |
| janitor | 140 | 18 | 1.0-1.6 | 1.5/3.4 | event | no -> no | gate 0.4 |
| hoardnest | immortal | 0 | 1.0-1.6 | 2/5 | hazard | no -> no | hazard (no melee) |
| janitorbin | immortal | 0 | 1.0-1.6 | 2/5 | hazard | no -> no | hazard (no melee) |
| foreman | 1100 | 50 | 1.0-1.6 | 1.8/3.4 | boss | no -> boss | boss: own telegraphed specials (dmg <= 63 per hit) |
| loadbalancer | 1300 | 42 | 1.0-1.6 | 1.8/3.4 | boss | no -> boss | boss: own telegraphed specials (dmg <= 63 per hit) |
| middlemanager | 1200 | 40 | 1.0-1.6 | 1.8/3.4 | boss | no -> boss | boss: own telegraphed specials (dmg <= 63 per hit) |
| hydra | 1400 | 38 | 1.0-1.6 | 1.8/3.4 | boss | no -> boss | boss: own telegraphed specials (dmg <= 63 per hit) |
| surgeon | 1300 | 46 | 1.0-1.6 | 1.8/3.4 | boss | no -> boss | boss: own telegraphed specials (dmg <= 63 per hit) |
| host | 1250 | 44 | 1.0-1.6 | 1.8/3.4 | boss | no -> boss | boss: own telegraphed specials (dmg <= 63 per hit) |
| excavator | 1500 | 48 | 1.0-1.6 | 1.8/3.4 | boss | no -> boss | boss: own telegraphed specials (dmg <= 63 per hit) |
| lobbymanager | 1350 | 45 | 1.0-1.6 | 1.8/3.4 | boss | no -> boss | boss: own telegraphed specials (dmg <= 63 per hit) |

Cooldown "1.0-1.6" = read from that module's behaviour (all of them between 1.0 and 1.6 s, none below the 0.45 s gate). Telegraph "gate 0.4" = the creature's own state change plus the central 0.4 s minimum. Creatures in mirror/backrooms declare 0.35-0.55 s themselves.

## Sim results (before -> after; same seeds)
`tools/sim/balance.mjs --runs 2000` section d (solo shovel player, whole day, NEW camper row; the sim has no healing and no dodge, so absolute P(die) is pessimistic, compare rows):

| moon / quota | P(die) before -> after | P(one hit >= 45) before -> after | one-shot (a 100+ hit) before -> after |
|---|---|---|---|
| hamsi q0 (day 1) | 1.4 % -> 1.4 % | 0.8 % -> 0.0 % | 0 -> 0 |
| lufer q0 | 7.0 % -> 6.9 % | 3.5 % -> 0.1 % | 0 -> 0 |
| palamut q0 (hardest) | 20.4 % -> 20.1 % | 10.8 % -> 0.1 % | 0 -> 0 |
| hamsi q4 | 44.0 % -> 43.6 % | 4.3 % -> 4.3 % | 0 -> 0 |
| palamut q4 | 67.0 % -> 66.2 % | 43.2 % -> 42.5 % | 2.4 % -> 0.6 % |
| hamsi q8 | 75.2 % -> 75.2 % | 21.6 % -> 21.6 % | 4.8 % -> 0.0 % |
| lufer q8 | 77.8 % -> 77.5 % | 42.1 % -> 42.1 % | 9.9 % -> 0.1 % |
| palamut q8 | 81.2 % -> 80.5 % | 65.0 % -> 64.5 % | 23.1 % -> 0.9 % |

Reading: day 1 was already gentle (45 % cap) and stays the same; the early "big hit" chance (Lurker) is gone, and the late one-shot chance drops from up to 23 % to under 1 % (the remainder is the allowlisted telegraphed hazards). Late-game deaths in this sim are attrition (many 45-85 hits from a player who never heals or dodges), not surprise kills; the 0.4 s wind-up dodge and grab escape are NOT modelled, so real mid-game survival is better than these rows. Hits of 60-85 remain possible from quota 2/4, by design: two mistakes kill, not one.

`tools/sim/economy.mjs` (600 runs/crew): unchanged within run-to-run noise (it does not use the hit cap; the new `dmgMul` is not in `sim`). Standard 4-competent: median 8 quotas, mean 7.0, run 5.2 h before and after; "early comfort check (q0-2 identical in all modes): OK". Hard's +10 % creature damage is applied only in the live game (`balance.hitDamage`) from quota 3.

Known gaps: not browser-tested; the wind-up gate treats the creature's own attack state as the visible tell (most behaviours set it; the Mannequin and a few legacy calls do not and only get the delay); mash prompt exists for holds only (leech has the 6 s timeout instead).
