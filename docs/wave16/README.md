# Wave 16 — clarity at arrival, pickup and sale

Wave15 was published to main as `8231122`. The owner then asked to continue.
This round addresses concrete findings from that gauntlet instead of adding another compulsory system.

- The existing descent briefing reserves the health rail and keeps its layout through the visible fade.
  Routine objectives yield until it is hidden; warnings remain. Danger also removes a fading briefing.
- Confirmed salvage acquisition distinguishes bag storage from a non-selected hotbar item and uses
  current bindings. Ordinary drop behavior remains; bounded guidance explains bagged salvage.
- Beginner loaner lights cover actual crew shortfall rather than duplicating usable carried/deck lights.
  Daily role kits remain intentional rewards. Temporary loaners still return at departure.
- The archive tray/body are lighter, and a smaller receipt sits beside the usable center of the counter.
  Physical routes, sale accounting and pooled light count retain their contracts.
- A native missed Warden strike resumes pursuit instead of leaving the encounter active in rest/watch.
  The actual HostCreature/Rapier regression fails before this correction and passes afterward.
- Native host/peer Warden pressure reaches shared HUD pacing. Ordinary intercom captions defer;
  an urgent threat can bypass a deferred teaching line in the existing bounded queue.

Individual implementation/evidence: readability.md, cargo.md, world.md. Pursuit.md records the precise
setup/input boundaries for the shared browser test. PLAYTEST.md and REVIEW.md own the final observed
results and independent assessment. Fixture setup, real gameplay input, native AI evidence and human
fun/hardware performance are separate claims.

Root verification: 12 relevant test files passed, covering inventory feedback/core, onboarding,
first-run, readability, landing, HUD overlap, actual company/hub collision and sale, Algorithm queue/context,
shared goal pacing, and native pursuit. The final production build passed in 3.06 seconds.
Wave 15's 206-suite baseline and later focused checks remain historical; the whole suite was not repeated
for this narrow round. Browser results and the independent score are maintained in PLAYTEST/REVIEW.

Final focused browser evidence establishes actual inventory recovery and sale, descent-card geometry/fade,
native pursuit activation/movement, shared threat attention and finite timeout cleanup. Successful browser
escape and the single 85-value recording remain unverified; native completion is regression evidence.
The independent assessment remains 7/10, with human co-op, audio and hardware performance still open.
