# geomfix (wave 8) - geometry audit + placement guards

Owner: "some objects are geometrically bad, in wrong places, broken".

## Checker
`node tools/harness/geomfix.test.mjs [--seeds 5] [--verbose]` (about 25 s, no browser). It builds, with the real builders and stub physics / lights:
- outdoor: every regular moon + 10 generated-sector moons (`buildMoonOutdoor`: terrain, landmarks, outposts, biome decor incl. worlds2 / maps5 / voyage set pieces, trees / rocks, POI props), then installs mapart / eggs / worldx (chests + harvest) / survival / worlds2 on a stub game and audits what each added, plus survival wild plants;
- facilities: all 8 themes x 2 seeds x 2 sizes (`generateLayout` + `buildFacility`: rooms2, stealth variety, set pieces, hazards, facility systems), plus cycle3 / secureloot / maps2 / stealth installers.

Flags: floating (bottom > ground + 0.15), buried, slopeGap / slopeSunk (footprint samples), NaN transform, zero scale, outside the map, prop-prop and prop-wall / rock / tree overlap (collider AABB, pen > 0.35 m), blocking (solid on the ship path, entrance / fire-exit spawn, in a door lane, or a door unreachable on the nav flood that is reachable on the bare layout). Exit code 1 only on NaN / zero scale / build errors; the rest is printed per category and per module.

## Before -> after (5 seeds, 8 base moons + 32 facilities)
| category | before | after | module / fix |
|---|---|---|---|
| propOverlap (facility) | 13 | 0 | `facility.js` wall-prop pass skipped corner slots that stood a second bed / cabinet inside the first (`propBoxes` footprints); `rooms2.js` furniture + `S.clear` use the exact footprints (`boxFree`), the 1 m nav grid alone misses small props |
| wallOverlap (outdoor) | 15 | 0 | `terrain.js` POI junk (radio tower, containers, car wrecks) no longer spawns inside a rock / trunk nor on another POI; `outposts.js` first site pass uses the full footprint and rocks / trees keep their real radius |
| blocking (ship path) | 3 rocks | 0 | `terrain.js` big rocks keep 0.9 + 1.8 x scale from the path centre |
| survival plants inside rock / prop | 11 | 0 | `survival_data.plantAvoid` (map avoid + `out.solidAt` + rock / trunk radius); `terrain.js` now returns `solidAt(x, z, r, y)` over every solid box of the map |
| floating / buried / slope / NaN / zero scale / outside map | 0 | 0 | props already snap to `terrain.heightAt`; hovering panels / drones (mapart) and landmark-ledge chests are intended and filtered |

Note: `terrain.js` now tags prop colliders `{kind:'prop', id}` (was anonymous) so tools can attribute them; nothing reads the id at runtime.

## Knobs / gaps
- POI spacing 4.2 m, rock radius `1.2 + 3 x scale` (POI), plant guard `1.8 x scale + 0.3`.
- Not covered in node: maps5 hedge / stacks interiors and horror pockets (own tests), items dropped at runtime, animated / opening props. Headless screenshots cover 2 moons + 1 facility only.
