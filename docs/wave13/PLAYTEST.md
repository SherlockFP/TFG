# Wave 13 playtest — evidence ledger

Status: baseline gauntlet, expanded integration and final targeted regressions complete (2026-09-30).

## Method

One shared-lock Chromium/Playwright session, software WebGL, two local BroadcastChannel tabs. Screenshots go to `/tmp/tfg-qa13/`. Keyboard and panel clicks are distinguished from debug teleports/phase advances. The latter check wiring and authority; they do not establish natural route discovery or human combat balance. Real internet peers, headphones, mobile and privileged browser shortcuts remain outside this session.

## Planned gauntlet

1. Capture title/menu, boot new host at hub, read first goal, select and board starter ship.
2. Late join from second tab; compare phase, selected hull, position and crew sync.
3. Real keyboard C hold/release and Escape repeat; pointer capture/resume where supported. Fullscreen and Ctrl+W require separate physical desktop confirmation.
4. Route to company; inspect freight/counter access and enclosed casino. Cashier purchase → wager → redemption, crew credit/individual chip reconciliation.
5. Broker commission and robot dispatch; advance completed field shifts and collect/sell, check peer state and quota exclusion.
6. New district optional station recovery, creature model/state replication. No claimed perceptual audio or played combat balance.
7. Capture defects, send prioritized fixes, rerun only relevant failures.

## Results

First run: `/tmp/tfg-qa13/results.json`, `/tmp/tfg-qa13/run.log`.

- Fresh host spawned outside the ship at Relay Dock. One visible goal asked for ship selection. Courier selection through the actual fleet panel succeeded for 0 Credits; host boarding moved the crew to orbit and the chosen ship.
- A second local tab joined after departure: selected courier, room layout, phase and crew membership matched; friend spawned onboard.
- Real keyboard: C held → crouched; released → standing. Escape opened pause once; repeated held Escape did not toggle it. A subsequent Escape closed pause and recovered pointer capture.
- HQ route constructed both service NPCs, rear sale dropZone, four physical casino stations and field broker.
- Echo Registry local station prompts appeared; all three recovery requests completed `[1,1,1]`, paid 105 once and replicated to friend. Both new creature models spawned and replicated as `idle` / `seek`. This was a debug position/interaction check, not played combat.
- Casino buying and spinning worked; redemption hit a pending pointer-capture race during immediate panel switches. Coordinator fixed cancellation of late pointer capture.
- Scout button correctly stayed disabled when earlier casino failure left too little currency. This was a fixture problem, not a game bug.
- Industry completion assumed synchronous takeoff, missing the existing damaged-hull deferred finish. Coordinator replaced this with actual departure + orbit/day completion tracking.
- Runtime errors: zero JavaScript page errors. Console contained unavailable Nostr discovery relays/resources through environment proxy, even during local transport. Software WebGL also logged framebuffer-feedback warnings; these are not clean rendering evidence or measured hardware performance.

Confirmed fixes from focused rerun so far: late capture remains cancelled while panel is open; cashier buy25 → spin5 → redeem reconciles 60→35→55 Credits and 25→20→0 chips with friend ledger matching, sold remains0; funded60 Credits permits cells12 + scout45, leaving3 Credits.

Screenshots inspected: 03 hub, 06 ship/exchange approach, 07 cashier, 10 Echo Registry, 13 workshop. 01/02 and 11/12 captured boot intro and are not menu-polish evidence. Corrected menu capture remains pending.


## Completed fix reruns

Evidence: `/tmp/tfg-qa13/follow-results.json` and `/tmp/tfg-qa13/final-results.json`.

- Actual scheduled field takeoffs completed day1→2 and day2→3. Industry counted exactly one shift each. Cells matured after shift1; scout returned salvage67/weather rainy after shift2. Sell23 + collect67 raised crew Credits3→93 while quota sold stayed0.
- Pointer-capture close/open race fixed and rerun: open panel remained pointer=false/input locked=false.
- Real cashier/reel/redemption loop reconciled chips and Credits on both peers; no free money or quota progress.
- Cargo load preserved original item `idx`: both peers showed custody `c:cargo13`. Real W movement moved cart z7.45→4.9595 with item aboard. Unload cleared ids, restored holdernull and scale[1,1,1]; exactly one original item existed on each peer. No duplicate spawn.
- Company ambient life module had all five routes/actors active. Survey reward chain, city dialogue and human animation quality were not played.
- No JavaScript page errors on either rerun. Console relay/proxy and software WebGL warning limitations persist.

## Harness corrections, not product defects

- Shop starts at Weapons. Tools category accessible label is `Tools`, even though CSS renders uppercase. Selecting `TOOLS` exactly failed; vendor delivery is therefore still pending browser evidence.
- `items.hostSpawn()` returns an id string, not an item object. First cargo fixture used `.id` and loaded nothing; final corrected fixture passes.
- An open failed shop panel prevented W movement in one intermediate run; final corrected silent closure validates real walking/cart movement.
- Boot intro starts on the first menu frame. Skipping before `room.updateBoot(0)` did not suppress its later start. Existing screenshots named menu-corrected still show intro; do not count them as menu review.

## Remaining test scope

Native desktop Ctrl+W/fullscreen Escape, real internet peers/voice, headphone mix, gamepad/mobile, full campaign economy, human creature fairness, paid hull layouts, long-run memory/leaks and every moon remain untested here. Expanded final gauntlet should add pending vendor-order delivery, corrected title/submenu visuals, live NPC survey and new cargo facility transfer/large-item behavior alongside the newly requested mechanics. Repeat the earlier passed loops only if their implementation changes.

## Expanded pass (before final focused regression)

Evidence: `/tmp/tfg-qa13/expanded-results.json`.

- Correct NPC Tools-tab purchase now tested: flashlight appeared 1.14 m from broker. Old inaccessible Company Store prompts were absent.
- Wardrobe showed 7 curated ready entries and 77 full suit entries. Actual Claim/Equip put Dock Rigger on host and remote peer. It revealed a real focus-restoration bug: the local stylesheet `CSS` string shadowed `CSS.escape`, throwing four page errors. Controls agent replaced selector interpolation with exact `dataset.nav` matching. Final reload regression is pending.
- Five company citizens were present; the first actor moved along its route and offered a talk interaction. This verifies activity wiring, not a complete survey reward playthrough.
- Cargo vase fixture retained original id/value123, transferred into the actual facility through `game.useExit` host gate with driver/custody retained, then unloaded once. Both peers showed the same value123 item and one copy.
- Generated Signal Run accepted and replicated, but only node1 completed. Wall-clock waits were insufficiently reliable for the 0.25 simulation-clock rate limit under heavily throttled software rendering. The final regression will advance explicit simulation frames between requests before assigning a product defect.
- CPU-only update sample on this software browser: 30 manual 1/60-second updates, median3.1 ms, p9538.6 ms, max39.1 ms; 15 host creatures, 86 items, 1005 renderer geometries. This is neither average player FPS nor a before/after optimization benchmark.
- Horn screenshots captured the correct held ids but the synthetic slot overwrite orphaned the previous pipe model and let useAge advance beyond the 0.38-second pose window. They are not valid horn-only animation evidence. Final regression uses normal pickup and stops automatic App updates for a 0.20-second snapshot.


## Final focused regression

Evidence: `/tmp/tfg-qa13/regression-results.json`.

- Fresh wardrobe filter/pick/Claim/Equip/Reset restored focus to `wd:reset`; zero JavaScript page errors after the CSS-shadow fix. Equipped Dock Rigger model is visible in screenshot21.
- Normal-pickup horn fixtures removed prior held objects. The actual viewmodel object existed and state useAge was0.212/0.200. Screenshots22 do not clearly demonstrate the intended hand/grip geometry, so visual assurance of the horn fix remains incomplete; offline grip checks and wiring are verified. Audio was not heard.
- Known Hamsi seed1235 generated the actual existing vaultd13. Acceptance succeeded, helper cost500→465 Credits, and45 simulation seconds completed[1,1,1]. Host and peer both showed dooropen=true/locked=false. This validates replicated helper completion; three humans holding relays were not played.
- This run found a second real defect during company unload: `life13.yAt()` read `world.company.groundY` after the company world was null, logged through the mod event bus. Zero page errors alone would have missed it. Coordinator added unload cleanup and an active-update guard; a final company→signal transition check follows.
- A later departure after the long simulated vault fixture timed out; no state snapshot was captured, so no particular fault/hull/campaign defect is asserted. It did not invalidate the earlier completed robot result.
- Settled screenshot12 now shows the complete host panel; screenshot21 shows the equipped wardrobe. Earlier intermediate screenshots with boot intro/clipped transition are superseded.

Coordinator-only final changes: persisted `industry13.departure` across actual takeoff/migration and stopped-cart unload before takeoff tally passed actual-module Node tests. No additional browser completion/migration claim is made for those late changes.


## Final signal and NPC lifecycle check — complete

Evidence: `/tmp/tfg-qa13/signal-results.json`, `/tmp/tfg-qa13/signal.log`.

- Company started with all5 citizens. Actual company takeoff reached orbit with `company=false` and `actors=0`; the next moon rebuilt its actors. Zero JavaScript page errors and zero mod-event/runtime console errors on the final fresh run. Unavailable discovery relays/proxy resource errors and software WebGL warnings remain separately recorded.
- Known Hamsi seed626583186 Signal Run completed all3 physically validated nodes: targetdials[3,1,2], values[1,1,1], done=true on host and peer. Explicit simulation-frame advances respected the0.25s rate limit, confirming the prior partial result was a harness timing issue.
- Parcel collection created one original Toy Robot salvage item, value65; repeated request did not create a second. Host/peer both showed parcel=true and sold remained0 until ordinary physical sale.
- Latest build/diff checks and additional actual-module Node regressions are coordinator results, not repeated browser evidence.

Final assessment stays scoped6/10. Remaining important verification: natural co-op full-shift combat/audio and latency, human menu/route discovery, normal-hardware FPS/leaks, all moons, native privileged browser shortcuts, and inconclusive horn hand/grip visuals. Do not describe this as a fully polished or universally bug-free release.
