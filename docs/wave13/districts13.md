# Districts 13 — expedition identity and crew activities

Two playable routes are registered in the actual moon list and progression ladder, rather than debug-only maps:

| Route | Opens | Fare | Interior and activity |
| --- | --- | --- | --- |
| Echo Registry | 1 quota completed | 120 | Looped records archive, teal numbered overhead terminals; recover three erased packets in numerical order. Permanent shared progress lets a crew spread out and call numbers, while a solo player can work sequentially. |
| Ember Cache | 2 quotas completed | 240 | Tall ceramic foundry with three cooling wings, suspended clay memory kilns and orange apertures; match a three-position dial to four successive pressure targets, confirming each choice with the adjacent seal control. Crew can split the wings, and no simultaneous teammate requirement blocks solo play. |

Both routes keep ordinary scrap collection and quota delivery. Restoration is optional: 20 credits per completed station, plus 45 credits once on full completion (105 maximum per expedition). Restoration makes a small deliberate creature-heard noise. Mistakes never remove completed work or instantly spawn enemies. Reach, alive state, indoor zone, integer station index, map token and per-player cooldown are validated by the host. Requests from a previous map cannot award money. All players read the shared `run.district13` state, including late joiners. Map rebuilds in the same expedition preserve completion; orbit clears it.

The original facility generator remains responsible for walls, doors, exits, scrap and creatures. New themes use genuinely different room plans (looped rooms versus wings), floor surfaces, fog, room silhouettes and overhead landmarks. Objective rooms are filtered to the entrance-connected component and are never placed in a sealed vault. Visual station numbering uses one, two or three illuminated bars, so it survives language changes.

A reusable deterministic dressing hook adds at most 72 subdued mint chevrons to older and new interiors. A breadth-first traversal follows open, unlocked ordinary edges back to reception; marks do not misleadingly point through vault/containment doors. From reception players use the existing entrance exit signage. Decoration has no collider, no renderer lights, and one merged material. New landmark decoration is also merged and uses no added lights. All user-facing new strings are registered in EN/TR/RU.

## Integration

`src/world/interiors/index.js` imports and registers `LABYRINTH13_THEMES`. In `game.js` import `installDistricts13` from `./districts13.js`, then call `this.useModule('districts13', installDistricts13)` with the other feature modules. Runtime import registers both moons and route unlocks automatically.

## Validation and honest critique

`node tools/harness/districts13.test.mjs`: PASS. Eight complete real facility builds over four seeds per theme verify three stations, entrance connectivity, actual navigation paths and bounded return marks. The same harness exercises the real host request handler to verify distance, death, zone and stale-map rejection, wrong-order packets, incorrect cooling choices, local indoor interaction without a zone field, one-time 105-credit reward, orbit reset and listener disposal. Existing `labyrinths.test.mjs`: PASS, 96 facilities, zero failures.

This is a first playable expedition pass. Packet order is a crew navigation task; cooling calibration is a short shared dial-choice puzzle, not a deep standalone minigame. Neither should be described as a major puzzle campaign. Creature composition and fixed rewards start conservatively; sustained human playtesting should tune travel time, first-threat timing and optional activity value. Browser visual review and remote multiplayer playtesting remain separate checks. Future improvements: an audible valve pressure beat, archive clues tied to recovered identities, differentiated outdoor approach landmarks, and physical completed-state indicators on each station.
