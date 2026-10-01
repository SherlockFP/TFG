# Wave30 — usable destinations, visible fleets and map loading

Opened from clean main `1ac10f8ba2de70489a86b3eba8dbaa2c0f231848` on
2026-10-01. Protocol0.12.3. Owner experience baseline remains5/10.

The owner cannot find the card mode after boarding, wants short moon names to
route correctly, a detailed moon menu, visible ships during selection and fewer
stalls when changing maps. This round addresses those specific interactions.

| Scope | Acceptance |
| --- | --- |
| Moon routing | Exact names/IDs and unique abbreviations work; equally good matches offer choices. Generated sector slots retain their identity and stale confirmations cannot spend credits. |
| Moon menu | Searchable available routes, real costs/forecast/risk/loot/details and ordinary native route confirmation. |
| Fleet | Clearly different faceted ship illustrations reflect native fitted sections and paint in the existing purchase/selection cards; no new WebGL renderer or animation loop. |
| Dead Letter | Visible title option and Host mode, plus an explicit pause-menu entry with current rejection reasons. Real native host admission, checkpoint and once-only auto-entry after fleet boarding. Existing campaign slots remain protected. |
| Transitions | The same deterministic outdoor and facility generators builds instantly or through queued chunks. Partial resources cancel on unload; full publication precedes mapLoaded, phase and prewarm. Measure actual unit costs and preserve synchronous/queued equality. |
| Evidence | Native regressions and production build, then bounded rendered/input checks at a frozen source. Label setup fixtures and retain failures. A hardware FPS improvement requires its own matched measurement. |

Root owns Game/host/UI/mode integration, combined checks and already-authorized
main publication. Encounters owns terminal/routing/directory; controls owns fleet
previews and ordinary outdoor staging; haul owns facility/geometry/queue staging; review owns independent
read-only review; play owns the sole browser and its artifacts.

Read [moons](moons.md), [fleet](fleet.md), [mode access](mode-access.md),
[performance](performance.md), [outdoor](outdoor.md), [playtest](PLAYTEST.md) and [review](REVIEW.md).
All263 native checks passed in254s and production build passed in2.99s at the
[recorded frozen source](checks/source-freeze.json). Actual Game integration proves
complete publication and partial outdoor/facility unload cleanup. Rendered/input
results now earn title preselection, fitted fleet choices, native claim/boarding,
functional directory/confirmation/DENY, normal lever first landing and actual
orbit pause admission. Setup, operator failures, fresh starter checkpoint and remaining
performance limits are disclosed in those reports; no full walked shift or
hardware smoothness is claimed. More features or passing
checks do not themselves raise the owner's fun rating.
