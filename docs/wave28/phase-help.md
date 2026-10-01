# Wave28 — advice belongs to its current visit

The former `Game.tutorialHint` queued unowned global timers and still recommended
remote STORE/BUY purchases, although the native field broker now owns tool orders.
Returning/free-paced players could receive this advice; ordinary staged fresh
runs already suppress that teacher. Immediate feature access remains unchanged.

Game now calls `showPhaseHelp28`. Dock advice reflects whether a hull is already
selected. Ship advice names the route console and physical broker; company advice
uses the actual tools and personal-gear roles. EN/TR/RU text is translated before
adding the icon. Existing tutorial seen flags remain compatible, with a separate
dock flag and native `Game.later` cancellation/ownership.

Validity captures run and transport identity, phase, moon, seed, day, physical
facility/world identity, depth/revision and dock selection. Dead/downed players,
temporary combat, blocking UI and the active first-run teacher suppress delivery.
The callback also travels through actual UI/HUD held and overflow queues, warning
preemption and quiet-arrival/chase transitions. Final delivery checks it again;
native HUD refresh removes expired visible advice. Unscoped earned rewards and
warnings retain their existing delivery and three-field queue records.

Independent review found the downstream queue leak after the first correction,
then identified the quiet-transition branch and already-selected dock case. Those
findings drove a second correction rather than being waived by the earlier test.
`phasehelp28.test.mjs` reaches native Game.later and actual UI/HUD methods. Its
queue controls include held, overflow, warning preemption and visible → danger →
phase change → quiet. The controlled DOM/timers and deliberate stop just after
the native notification boundary are explicitly labelled; this is integration
evidence, not natural play or a complete renderer test.

The original timer-owner assertion failed (`undefined !== 3`); the corrected
native checks pass. An initial direct Game import hit CSS in Node; the harness
uses the established CSS-only loader, leaving game modules native. A queue fixture
initially delivered unrelated reward-expiry timers along with phase timers; it
was corrected to deliver only native Game-owned timers for that boundary.

The first combined regression was 255/256 because the old firstrun source check
expected its budget guard inline in Game. That check now follows the real helper
and verifies the native caller. The final combined result and browser evidence
belong to README/PLAYTEST rather than this focused report.
