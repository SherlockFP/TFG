# Wave 11 - LOOP11: "THE LOOP" (Employee Re-Onboarding)

An Exit-8 style observation labyrinth. No combat, no loot hunt: the crew stands in an office hall and has to notice whether anything changed.
Identity: a company crew inside the live stream of The Algorithm; HR runs an "onboarding" that never ends and is legally unaccountable.

## The rule (posted once on the poster next to the start)
> If you notice anything different, turn back. If nothing is different, keep going. Reach exit 8.

Every **pass** the hall is either the hall you know or has exactly ONE anomaly. Walk out of the **far** end = "nothing is different"; walk out of the **near** end
(it arms once you have been past u = 12) = "turn back". Right call = exit counter +1 (shown on the green EXIT sign hanging over the hall), wrong call = counter back
to 0 and a strike. Both ends drop you back at the start of a fresh pass (black blink + `loop_warp`).

The crew is **one employee**: the hall state is shared, the host judges the FIRST player who crosses an end and everybody inside is reset to the start (a toast says who made the call and what the anomaly was).
Discussion is the counterplay. Late entrants walk into the current pass; a player who is outside just sees the door light (green / red = sealed / gold = done).

| Strikes | What happens |
|---|---|
| 3 | "HR: Your performance is being reviewed." Anomaly chance 55 % -> 68 %, tier-3 (scary) anomalies x1.8 |
| 4 | Customer Support is spawned at the door outside (existing creature `support`) |
| 6 | TERMINATED: everyone inside is thrown out to the door, the door is sealed for the landing, The Moderator (existing `moderator`) waits outside |
| exit 8 | everyone inside goes to the BREAK ROOM: host spawns the **Perfect Attendance Badge** (new scrap `lp_badge`, 230-330) + 2 rare scraps (+1 if no strike was taken) from goldbar / playbutton / ring / trophy / figurine / perfume / liketrophy at x1.35 value; profile gets the handbook appendix. The door reads "Re-onboarding complete" afterwards |

Pass 0 is always normal (learn the hall), pass 1 is always an obvious anomaly (EASY: breathing lights / stained carpet / lowered ceiling / red cooler), then random with a streak guard
(never 4 normal or 4 anomalous in a row) and no anomaly repeated within 3 passes. A perfect player needs exactly 8 passes.

## The 18 anomalies (tier 1 subtle, 2 noticeable, 3 scary; text + TR/RU in `loop11_text.js`)
eyes (Kip the Kefal's pupils follow you, t2) - doornum (one office plaque wrong, t1) - coworker (a colleague with a blank face at the end who turns when you look away, t3) - breath (the lights swell and fade, t2) -
notice (the notice board says something else, t2) - wetsign (the sign moved, t1) - extinguisher (upside down, t1) - clock (second hand runs backwards, t1) - steps (something walks when you walk, waits when you wait, audio only, t3) -
lowceil (part of the ceiling 45 cm lower, t2) - carpet (dark stain, t2) - shadow (an unowned silhouette on the wall that creeps closer while unwatched, t3) - posters (one of three safety posters gone, a paler patch remains, t1) -
cooler (red water + gurgle, t2) - ajar (a door open a hand-width, red light, murmuring, t2) - ceileyes (missing ceiling tile, two eyes blink in the dark, t3) - mirror (everything on the walls swapped to the opposite wall, writing reversed, t2) - exitred (the far EXIT sign is red, t1).
Every anomaly is a reversible mutation (`IMPL[id].on / off / tick` in `loop11_anom.js`); the node test proves `off()` restores the baseline exactly for 3 variants each. Identified anomalies fill the personal **Handbook** codex tab (J -> Handbook n/18).

## Where it lives
- **Door**: `loop11_core.doorSite(L, run, tier)` reuses horror's `closetCandidates` / `closetFrame` (plain closed wall of an ordinary room, never a room that has a horror closet or the fake closet, not a maze, area >= 4, prefers dist >= 2). Tier 2-3 moons always, tier 4 50 %, tier 1 25 %, others 35 %, HQ never. Deterministic from the layout seed. A decal-like door (frame, leaf, plaque "EMPLOYEE RE-ONBOARDING", status light, mat) stands 0.26 m proud of the wall; E opens it.
- **Space**: `loop11_build.buildSpace`: hall 32 x 3.6 x 2.7 m + a dark stub behind each end + the break room (12 x 8 m, x = 50-62 in local space) at world x = 14000, z = -3000 on the facility floor plane (`L.y`, so `p.indoor` stays true). Merged static geometry (`GeoBuilder`, 97 meshes total incl. dynamic props), 28 colliders, 11 pooled emitters (8 hall + 3 room, group `loop11`, so a facility blackout does not darken it), NO THREE lights. Built lazily on the first entry (and on the host at the win), disposed on `orbit` / `fired`.
- **Look**: cream plaster over sage wainscot, grey-blue carpet, drop ceiling (`render/loop11_textures.js`, `lp_*`), fog `0xb6c2b2` d 0.013 with `hemi` / `ambient` set through `env.interiorFog` (no light hacks), hum-only audio `ambience_loop11` (no music).
- **Sounds** (`audio/sfxlib_l11.js`): `ambience_loop11`, `loop_ok` (elevator ding), `loop_bad` (buzzer), `loop_warp`, `loop_win`, `loop_pa`, `loop_step`, `loop_tick`, `loop_gurgle`, `loop_murmur`.
- **Extended, not duplicated**: pocket-space pattern of `horror_pocket` / `backrooms` (far-away space, `p.teleport`, `env.interiorFog`, creature `playersFor` patch), horror's `closetCandidates` / `closetFrame`, the wave-10 codex extension hook (`window.__tfgCodexExt`), existing creatures `support` / `moderator` and existing scrap. Nothing else in the repo has an observation / anomaly mechanic.

## Net (prefix `loop`)
`loopq` (client -> host request): `{op:'end', side:'f'|'b', pass}` | `{op:'sync'}`. The host validates (pass matches, sender inside the hall, >= 0.7 s since the last call, run not over), runs `advance()` and broadcasts
`loops` (HOST_ONLY): `{t:'pass'|'win'|'fired'|'all', p, n, w, an, vs, won, sealed, ok, sd, pa, by}`. Every peer renders pass content from `(an, vs)`; variants come from `variantOf(an, vs)` so they agree.
Late joiners: the client sends `sync` when its door is built, the host also sends `all` on `playerJoin`. If the host ignores a crossing (stale / rate limit) the client is put back at the start after 2.5 s.

## Console (lead)
```js
const L = kefal.game.loop11.debug;
L.spawnDoor();            // door on the wall in front of you (any moon; solo / host)  -> walk to it, press E, or:
L.enter();                // straight into the hall
L.show('eyes');           // look at one anomaly locally (ids: L.ids()); L.show(null) = the normal hall
L.force('clock');         // host: make the NEXT state that anomaly, broadcast
L.end('f');               // end the pass as if you had walked out of the far end ('b' = near end)
L.win(); L.fire(); L.reward(); L.state(); kefal.game.loop11.stats()
```

## Test
`node tools/harness/loop11.test.mjs` (~10 s, 20 k checks): pass content deterministic, pass 0 / 1 rules, streak + repeat guards over 400 simulated runs, judge + counter + strikes, perfect player = exactly 8 passes,
door site over 120 generated facilities (deterministic, plain closed wall, never in a horror closet room), TR + RU for every string, a canvas stub so every poster / sign / texture draw runs, the space builds (mesh / collider / emitter counts, no lights),
each anomaly on / tick / off restores the baseline (3 variants), dispose removes every collider + emitter, all 10 sounds render at 8 kHz, and a stub-game run of the whole flow: door prompt -> enter -> pass -> arming -> stale request -> rate limit -> peer outside -> late-joiner sync ->
perfect run to exit 8 (reward spawned in the break room, handbook granted, return door, finished door refuses) -> second landing always wrong -> Support at 4, Moderator at 6, sealed door, ejection -> orbit tears everything down.
Neighbours re-run: `sound2` (sfxlib touched).

## Knobs
`loop11_core.LP` (GOAL 8, LIMIT 6, WARN 3, SUPPORT_AT 4, P_ANOM 0.55 / 0.68, STREAK 3, RECENT 3), `GEO` (hall size, SPAWN_U, ARM_U, TRIG, origin), `ANOMS[].w / tier`, `EASY`, `doorChance`, `REWARD_POOL`, `REWARD_SPOTS`; fog `FOG` and door offset `Z` in `loop11.js`; light `intensity 0.85 / distance 9.5` in `loop11_build.js`.

## Known gaps / NOT verified
- Never seen in a browser: hall proportions and light level, poster text legibility at 6 m (canvas 12-16 px fonts), the subtle anomalies' readability at distance (eyes, clock hand, extinguisher), mascot fish drawing, mirror anomaly (`decor.scale.z = -1`) shading, the door decal against real facility walls (0.26 m offset is a guess; it can clip a wall prop), audio mix (`ambience_loop11` under the facility bed which `atmos.quietFor` only mutes the events of), footstep-behind pacing, blink duration.
- The facility's own atmos bed keeps playing quietly under the hall; `hemi` / `ambient` come from `interiorFog`.
- Pass content is host-decided but every peer's visual mutation is local: a peer whose space was built later gets the current pass via `applyState`, but animated state (coworker yaw, shadow creep) restarts at its base pose.
- A player who dies inside the hall stays there (the space is disposed at orbit like every pocket). No damage exists inside the loop; the stake is the strike counter and what HR sends to the door.
- One shared door per landing: the crew that finishes (or is fired) closes it for everyone. No difficulty scaling by day yet.
- Support / Moderator are existing creatures with their normal AI; they are not tied to the hall.
