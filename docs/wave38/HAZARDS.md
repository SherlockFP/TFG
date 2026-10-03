# Wave38 bounded deep-floor hazards

Depth two and below can contain one original ceiling leech and one gravitational fissure in a single-door optional side room. Admission uses the native standing-capsule reachable flood. Entrance, lift, power-panel and existing server-core rooms are excluded. Ceiling attachment requires an actual native upward ray hit. A floor with no valid sites receives no hazard.

The visible dangling tongue warns before a 0.65 second catch. Pulls use the existing native host hold message and its balance escape rules. Every upward increment is capped at 0.08m and checked by a native standing-capsule shape sweep against static geometry and doors. Existing 3.2 second hold limits, jump escape and immunity remain effective. Catches cause bounded 6 damage every two seconds, and dead/downed/aboard/lost players are excluded. This is a stationary environmental creature presentation, not a new damageable CreatureManager species.

The optional fissure gives six seconds of warning after 35 seconds on the floor, then remains active for twelve seconds. It slows and applies bounded damage close to its center, and may swallow at most three loose scrap items through the real native `it/rm` broadcast. Held cargo and main server cores are excluded. It does not delete room geometry, sever navigation, or destroy the return route. Full-room collapse is intentionally not claimed.

All presentation is original matte geometry with no new lights. Module and model resources dispose once when the facility changes or unloads. Native host state publishes warning/active/spent stages.

Evidence: `hazard38.test.mjs` verifies real native ceiling attachment, swept-capsule pull acceptance and obstruction rejection, actual Session self-delivery of the existing host hold/hurt messages, dead-player rejection, warning and active stages, native scrap-removal receipt with core preservation, and once-only model geometry/material disposal. Browser playability and visual judgment remain root-owned.
