# Wave41 independent authority/UI review

Read-only medium review by the UI/atmosphere owner, with root retaining authority files and publication. Inspected actual callers in `main.js`, `game.js`, `host.js`, `endless41.js`, `endless41_core.js`, native items, shipyard/food modifiers and host migration. Source continued changing during review; this is bounded evidence, not a frozen full-suite or browser result.

Two P2 findings were corrected by root:

- Endless stats replaced native modified HP/speed/damage/armor, erasing Bunk Rested and food effects. The final mode stats now add/multiply the existing native base, preserving temporary effects without mutating it.
- Console cargo cashout omitted the fitted Cargo Bay sale bonus because its path bypasses the native company-bell `hostSell` wrapper. The final receipt includes `effects(sanitize(run.sy)).sellBonus` in the same authoritative credits/removal commit.

Verified prefit cargo/engine/medbay rank1 of3 agrees with the actual tier1 layout, avoiding a paid rank that cannot improve a tier3 room. Root also guarded native progress `addXp`/`addCoins` in Endless so ordinary rewards cannot create a second personal-level progression beside the run build; normal calls and disposal restoration remain intact.

A proposed numeric-eye P1 was retracted after tracing the real boundary: `Game.aiPlayerById` uses `aiPlayers`, which converts local scalar eye height into a Vector3 snapshot. Root added a robust fallback and a native scalar fixture, but the original accusation did not describe the actual gameplay caller. The ignored `ammo:6` starter option was removed; the native two-round shotgun plus automatic pulse is the intended kit. Ship HP reaching0 now ends the authoritative run. An initial sale expectation flake was traced to randomized profile identity selecting the real salvage bonus; the fixture now fixes identity and checks the actual room/perk receipt.

Focused bundled Node24 checks after corrections:

```
tools/harness/run_all.mjs -j 2 endless41.test endless41_core endless41_ui food_install shipyard_install profile
6/6 passed
```

A separate in-memory installed-API probe passed inherited HP/speed/melee/ranged/armor effects, unchanged base stats, all three prefit ranks, ordinary XP/coins suppression, normal-mode pass-through and disposal restoration. Earlier focused `hostmig` also passed. These probes cover actual callbacks/native ship geometry and labelled stock; they do not prove a full multiplayer mode boot or Internet continuity.

Inspected profile copying/reset before mode initialization, normal unknown-join promotion, `_noSave`/host-save guards, connected living station access, floor/range/LOS validation, kit-once admission, offer replay/stale/unknown guards, one-wallet sales and UI API compatibility. No unresolved material finding remained in those reviewed paths. Root's later emergency fuel/planet changes require separate review. Waves/robots integration, rendered960px/TR/RU panels, pointer-lock discovery, full lifecycle browser play, full regression/build and publication remain assembly evidence owned by root. No browser, Git or full suite was run by this reviewer.

## Emergency fuel/route follow-up

Inspected the final added service against native Reactor38: emergency charge uses the same host/living standing/range/LOS console admission, requires orbit and an existing unready reactor, debits45 from the same finite wallet, advances revision and sets one ready zero-value installed identity. It creates no sellable world core. Reactor38's existing landing event consumes readiness; native removal returns a spent zero-value identity. Current revision/ready checks reject a replay or an already charged purchase. These conclusions are source review; the focused native reactor fixture covers the existing reactor owner, not a complete mode purchase/flight trip.

Seeded routes exclude the current moon, initially allowing hamsi/lufer, then palamut at4 completed waves and levrek/cipura at8. The wrapper calls native takeoff completion first, preserving native phase/unload/summary custody. A follow-up lifecycle finding was sent to root: postwork must gate on an actual takeoff→orbit completion, since native `hostFinishTakeoff` returns early outside takeoff and an unconditional wrapper could otherwise reroute on a repeated callback. Root owns that corrective guard and its final evidence.

The UI owner added local EN/TR/RU service copy and globally registered only distinctive mode objective/console/end/template keys for root's `t`/`sysMsg` callers. A TR/RU installed-text probe passed. Final focused checks after the translation additions:

```
tools/harness/run_all.mjs -j 2 endless41.test endless41_core endless41_ui reactor38 extraction39
6/6 passed (includes extraction39_wrappers)
```

UI/text files are frozen for root assembly. No change to authority files in this follow-up; final route/service gameplay evidence and full-suite source freeze remain root-owned.

Final root source now captures `finishing` only during takeoff and runs route postwork only after native completion actually reaches orbit. Repeated finish calls in orbit therefore leave the route/revision unchanged. Root reports its native repeated-callback assertion passed; this reviewer inspected the final guard without rerunning that owner test. All distinctive objective/console/end/template callers now use `t`/`sysMsg`, and console interaction replacement avoids duplicate entries.

The final shared preparation control honors authoritative `available:false` alongside credits/max rank, covering unowned robot upgrades and orbit-only refuel. Its actual-button fixture failed red on an affordable unavailable catalog option, then passed after the guard (`endless41_ui`,1/1). No authority files changed. UI, translations and this report are now frozen.

## Observed full-boot presentation correction

Root's silent native boot exposed normal campaign payout/quota, Story ActI/daily docks and Guide welcome in Endless. The actual built-in `public/mods/ship-loot-tracker.js` now omits only quota projection, Company payout/deadline rows and quota-derived cargo color when `endless41.active()` is true. Native aboard value, count and item breakdown still use the original tally; no cargo/economy state changes. The actual installed-mod fixture preserves native31 value/count/Bolt breakdown, proves campaign rate/projection absent and normal rows restored when mode ends. Scoped body class hides only Story/Daily dock items, is removed for inactive mode and disposal; native dock owners and rewards are unchanged. Guide's existing separate-mode suppression now includes Endless for welcome/tutorial speech and objectives. Shotgun-shell catalog copy gained localTR/RU translations.

Focused `endless41_ui`1/1 passed with actual tracker callback and mode-scope restoration assertions. Source review confirms Guide normal-mode predicate remains false. These corrections respond to observed boot clutter; rendered confirmation and combined full checks remain root-owned. Source frozen again after this bounded correction.

## Actual co-op profile-reset follow-up

Root's real peer boot exposed the late full-profile reset deleting already installed controller fields. Final welcome calls the shape-preserving reset before run/map/join callbacks: the outer profile remains the same object, initialized extension references (codex, crew, weekly, login, achievements and others) survive, while native level/XP/coins/skills/stats/loadout and RPG/prestige/mastery are freshly reset. Client crew XP is cleared. Host reset still happens completely before controllers initialize. RPG `profileReset` recreates its native shape and clears static tree/flag caches plus dynamic bonuses immediately. The v1 onboard skip marker matches the real Hiring Day owner. These are source-reviewed corrections; root owns the shape/controller and nonDEV onboarding test results.

Deferred kit source review found a remaining admission mismatch to address: actual `RemotePlayer` exists immediately with position(0,-1000,0), `dead:false` and `lastUpdate:0`, and `aiPlayers` includes it. Checking only a missing/dead AI snapshot therefore does not prove the first living native state arrived. Root was advised to gate non-self starter admission on the native remote's first `lastUpdate` and finite position before marking the once-only starter receipt. The displayed native fixture initially modeled an absent AI snapshot, so that result alone does not prove the actual constructor boundary. No CPU tests, browser or authority edits were made during this follow-up; fresh co-op kit proof remains root-owned.

Root's final actual wave then earned2 kills, run level2/XP6 of45 and3 native offers, with player100HP/ship300HP and0 recorded errors. Its remaining presentation ambiguity was an ordinary Lv.1 and frozen8AM beside the run status. The existing mode scope now hides only `.hud-level` and `.hud-clock`, restoring them when inactive/disposed. The exact native `sysMsg` wave-warning template is globally registered TR/RU through the unique-mode text filter. Focused `endless41_ui`1/1 passed with scoped selectors, lifecycle removal and recipient-language template checks. This reviewer did not repeat combat or run a full suite; fresh rendered card/UI replay belongs to root. Presentation files frozen again.

The observed enabled HUD upgrade launcher then failed coordinate clicks. Root's actual blocker state was clear, and an added actual-launcher test using native `UI.openPanel`, `closePanel`, `fullscreenOpen` and input unlock passed. One production cause was CSS specificity: native `#ui .hud * {pointer-events:none}` outranked the new class-only button exception. A scoped `#ui .hud .e41-launch {pointer-events:auto}` now outranks that native rule. The native stylesheet-boundary check failed red and then the focused UI1/1 passed, including real launcher callback, native overlay/input opening, cinematic rejection and existing lifecycle/custody checks.

Root's next fresh page confirmed launcher pointer events restored, but real hit testing found full-screen cosmetic `.ev11-ov` variants and `.mg-vig` above it. Both owners declare pass-through, yet both append direct children to `#ui`, where the more specific native `#ui > * {pointer-events:auto}` defeats their class-only rules. The Endless-scoped `.e41-mode #ui > .ev11-ov,.e41-mode #ui > .mg-vig {pointer-events:none}` restores that intended contract without changing modal stacking or normal mode. The source-boundary assertion failed red before the rule; focused `endless41_ui`1/1 passed afterward. This is two proven selector conflicts, not evidence that the first rule alone resolved coordinate clicks. Fresh hardware-coordinate replay remains root-owned. No input/authority behavior changed; UI source frozen again.

Root's fresh orbit inventory coordinate click then passed. Outdoors, native hit testing exposed one further direct cosmetic child, `.cd-edge` and its directional glyphs. `crdirector` appends this full-screen edge to the same root with class-only pass-through; the same ID rule defeats it. Added only `.e41-mode #ui > .cd-edge{pointer-events:none}` after the owner requested the smallest final correction. Its exact owner declaration is checked by the boundary regression, which failed red and then passed focused UI1/1. Other cosmetic candidates were source-inspected but not changed. Root separately proved keyboard opening of three earned cards and an actual mouse health selection accepted once with the offer cleared and zero errors. A fresh outdoor launcher coordinate replay remains root-owned. Final UI source frozen.
