# Dead Link recovery cabinet

The dead network has receipts marked “delivered” for messages nobody received.
An abandoned recovery cabinet lets a crew recover part of an existing floor's
salvage quietly, or break the seal and accept a loud acoustic cue. The inspiration
is cooperative physical retrieval and route decisions; TFG keeps its own archive
fiction, matte PSX industrial model, ordinary cargo identity and horror director.

## Player behavior

- Eligible ordinary even depths start at depth 2. First depth, Backrooms, Null
  Reception, Dead Letter and special/mission/boss maps are excluded. Active
  missions or bosses prevent cabinet setup and pause use.
- One shallow wall-mounted cabinet can reserve 1–2 already populated native
  loose scrap items. At least six eligible loose items must exist. It never
  creates bonus loot, changes values/tiers, grants currency or adds an objective.
- **Quiet release [E]** starts four native seconds of work. A living crew member
  must keep a free hand, face the crank and retain normal range/LOS. Looking away,
  stepping away, being downed or starting a competing task pauses safely. Progress
  remains; E resumes. This is E-start/proximity work, not an unadvertised hold key.
- **Break seal [E]** immediately drops the same reserved IDs and emits one native
  hearing pulse. There is no scripted wave, extra enemy or mandatory timer.
- Recovered items use normal native pickup, carrying, trolley, selling and quota.
  The cabinet's two choices return the same contents.

## Ownership and access

`src/game/recovery27.js` owns host requests, bounded placement and lifecycle.
`src/game/recovery27_text.js` supplies EN/TR/RU text.
`src/models/recovery27.js` owns its model and atlas.
Root installs `installRecovery27` after the normal descent modules in `game.js`.

Floor identity is the existing descent token plus actual loaded depth/layout
seed. The lift's CALL/return nonce changes on the same floor and deliberately is
not part of that identity. Cabinet requests carry their own epoch, revision and
nonce. Host requests check living/indoor crew, downed state, actual aim, ≤2.7m
range, normal static/door LOS and hand/beam custody. Peers cannot claim loot or
advance quiet work.

Placement waits for the native step and populated loose items. A single lazy
standing-body route field is shared across at most 24 candidate wall sites and
12,000 expanded nodes; it does not restart a flood per candidate. Floor normals,
standing capsules, control LOS, clear native drop cuboids and locked route edges
are checked. Ordinary closed doors on a route are recorded as E-openable steps;
locked/special doors remain excluded. Unsafe or unreachable placements skip.
The lift room and surrounding five metres are excluded. The shallow wall model
adds **zero colliders and zero lights**, preserving certified lift geometry.

Reserved items use native `it held` custody `c:recovery27:<floor-key>`. IDs, types,
values, base values, tiers and native item count stay unchanged. Release uses
native `it drop` for those exact IDs; it never respawns/reselects missing contents.
Authoritative state is published before opening feedback so replica revision
checks admit valid feedback. Old epoch/revision/nonce requests and delayed
feedback during streaming are rejected.

`facilityWillChange` and the wrapped native `unloadMap` remove only unreleased
items still held by this exact cabinet custody. Released or unrelated crew
cargo survives. A valid saved/migrated cabinet retains its IDs/progress; migration
changes request epoch/revision/nonce and clears the operator. Disposal restores
unreleased contents if the module is removed while its world remains available.
Model geometry, materials, optional atlas and language listener dispose once.
The true DOM-free model fallback creates no CanvasTexture.

API for inspection: `recovery27.state()`, `.plan()`, `.stats()`, `.hostReq()`.
Stats identify placement diagnostics and local planning CPU time; they are not
hardware frame-time evidence.

## Native evidence

`node tools/harness/recovery27.test.mjs` passed on the module source after the
focused corrections. The harness uses real facility builders, Rapier controller,
ItemManager, CreatureManager hearing, Session request/broadcast/receive callbacks
and two serializing in-process transports. Initial native landing, floor-loot
placement and ordinary open-door prerequisites are explicitly setup fixtures.
The fixture loot is 16 existing native bolts; browser weighted loot is separate.

| Actual scheduled hamsi17 floor | Result | Route field | Local planning CPU |
| --- | --- | --- | --- |
| d2/serverfarm seed598252011 size0.871 |1 reserved ID;72-waypoint standing route and reverse walked |226 expanded nodes |11.00ms |
| d4/hospital seed3655156048 size0.904 | Safely skipped blocked/locked routes |126 expanded nodes |3.83ms |
| d6/mineshaft seed422184192 size0.926 | Safely skipped blocked/locked routes |157 expanded nodes |4.83ms |
| d2/serverfarm seed598252011 beginner size0.751 |2 reserved IDs;69-waypoint standing route and reverse walked |598 expanded nodes |16.94ms |

The native positive controls prove item-count/identity/value/tier preservation,
native interaction selector→Session request delivery, four-second quiet work,
look-away pause/resume, same-floor lift CALL identity, epoch/nonce rejection,
once-only loud native hearing, two-Session state-before-feedback ordering,
stale streaming feedback suppression, sealing/unload ownership and true headless
model/resource disposal. Real static LOS obstruction, dead operators, unknown
senders, active beam ownership and two-handed cargo reject opening. Intro,
liminal and insufficient-loot fixtures skip without modifying item counts.
Model cost: **5 batches, 122 triangles, 0 lights, 0 colliders**.

Retained failures: the first harness launch stopped before gameplay because its
static action import reached browser CSS. The established CSS-only native loader
fixed setup. An initial assertion wrongly required every even floor to place a
cabinet; actual d4/d6 unsafe route skips showed that requirement contradicted the
design. The harness now requires a positive actual d2 control and records those
skips. Earlier repeated-flood planning was replaced before final verification.
The retained native logs are `/tmp/tfg-recovery27-native-first.log`, `-second.log`,
`-third.log`, `-fourth.log`, `-final.log` and `-beginner.log`.

These results are **NATIVE_INTEGRATION**. They do not prove blind discovery, fun,
representative hardware FPS, live creature lure maneuvers or Internet co-op.
Root owns final source freeze, browser QA, combined regression and publication.
See the Wave27 PLAYTEST/REVIEW for final user-input and rendered evidence.

## Separate audited boundary

The initial read-only audit found that surface `facjobs` processing had no valid
depth suspension: its surface job props could attach to a streamed deep facility,
and surface core/rescue items removed during streaming could look like failed
jobs. Root assigned that existing-module fix to `jobs27`. This module does not
edit `facjobs.js` or create another jobs wallet/payout path.
