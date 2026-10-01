# Wave26 — liminal descent browser Gauntlet

2026-10-01. Starting main: `6907b9a9c074a6a4ab5a6212aba5e0433122d210`.
Normal `descent21` is the target; optional Dead Letter combat is outside this
scenario. Root finalized this report from the browser agent's captured evidence
and the later root-owned visual replay.

## Genuine local two-peer input — passed

**GUIDED_INPUT / TWOPEER / LOCAL / controlled native clock**, 315.9 seconds,
13 checks passed. Actual keyboard/mouse/E travel completed
**0→1→2→3→0→4→5→6→7→0**. Both first liminal destinations and both direct
surface returns succeeded. The source freeze for this run and the preceding
248/248 native regression is
`6bcce081ffcc949e2496101b37cc8261c0c6acce4e33f1fe6d099d6d13d6751e`.
See [evidence.json](evidence.json) and the four `native-*.png` images in
[qa_shots](qa_shots).

| Boundary | Actual observation |
| --- | --- |
| Lift access | Safely placed standing approach setup, then native keyboard boarding, mouse aim and selected E call/descend/return. No `hostReq`, `noLos`, forced stage or transit outcome. |
| Backrooms | Both peers agreed on actual depth3/theme/seed and baked sublevel/light hashes. Native Backrooms atmosphere was active. |
| Original destination | Both peers reached depth7 Null Reception. Actual airhorn pickup/slot selection/LMB captured one receipt; three native seconds later its hearing row used the old position after physical walking away. |
| Custody | Exact world bolt and held airhorn IDs/type/value/custody were retained across the tested transfers and returns on both peers. |
| Clock | The quota clock remained held while the native simulation advanced on deep floors. |
| Lifecycle | The prior facility detached and the tracked old native indoor actor IDs were removed. Return cleared the original-floor receipt owner. |
| Escape | Crew physically reboarded, aimed and pressed E to return; original surface generation/doors and checkpoint cargo were preserved. |
| Errors | No page error or captured game runtime/feedback error. External relay/bootstrap failures and browser capability warnings remain in the evidence. |

Setup was explicit: native hamsi seed17/day1/quota0 landing, native bolt/airhorn
spawn, safe room-body placement to drive **actual native visitation**, and safe
standing cabin approaches. No visited/readiness state was written. The surface
layout had ten eligible discovery rooms; later layouts use the available-room
limit up to fifteen. This establishes visitation integration and physical cabin
access, not fully walking fifteen rooms or unaided exploration.

The browser's native beginner world-size adjustment produced depth3 size **.77**
and depth7 **.815**, seeds1179496989 and3171011355. QA did not alter moon size.
The separate scheduled native map-matrix cases use the normal .89/.935 sizes;
these are distinct actual geometry cases, not identical screenshot layouts.

The labelled fixture gates `Game.update` and `Input.endFrame` only within the
unchanged `kefal.tick` pipeline, avoiding double simulation from RAF/hidden tabs
and operator ticks. Physics, AI and host/module timers advance together; RAF
rendering and network/wall callbacks continue. Native wrappers, input and browser
contexts were restored/closed and the flock released in `finally`. One owner
held `/tmp/tfg-browser.lock`; no CPU-heavy suite overlapped browser QA.

An extra wide-room camera attempt was **PARTIAL/setup-only**: it refused before
action because less than its required50s remained in the original eight-minute
operator budget. No depth8→11 continuation ran. The original four gameplay
shots principally show cabin/return boundaries, not a complete room-art survey.

## Final HUD revision — fresh visual replay passed

The real Backrooms gameplay screenshot exposed old PLAY/date and zone-caption
text over the live inventory. The final small UI correction moves the short,
wrapping zone caption into the existing managed right dock and hides redundant
PLAY/date metadata. It changes no transit, clock, custody or enemy rules.

After that correction, the focused actual `liminal26` native check passed and the
production build passed in **3.14s**. Final JavaScript freeze:
`da409e4e35b20cb2b39f220491f7f7b5b1f534f8b46129d05fd94530136919a1`.
Final all-src digest, including CSS:
`92381f362de85873237ede8b6b7b9a0a20c317d46deb67f062e31ab92e57bddb`.
Digests use sorted per-file `sha256sum` output, then `sha256sum`. The completed
248-file regression and actual two-peer E proof retain the preceding source
freeze; they are not claimed as a repeated full suite on this UI-only revision.

**VISUAL_REPLAY / SOLO**, fresh browser at the final source, passed all four
frames: Backrooms and Null Reception at **960×540 and1280×720**. Recorded genuine
depth3/7 run state was loaded through native `descent21.onState` preflight/rebuild.
Safe floor/capsule-validated standing/camera fixtures show an actual yellow room
and the authored eye-height receipt sign. Native caption activation was positive
in Level0; its DOM rectangle did not overlap inventory. PLAY/date were hidden;
Null Reception had no stale visible Backrooms caption. Root inspected the
rendered images. Page/game runtime errors: zero; external relay errors are retained.
See [visual-evidence.json](visual-evidence.json) and `replay-*.png` in qa_shots.
This is fresh layout/render proof, not another genuine E/cargo or AI outcome run.

Two initial visual-helper failures remain recorded:

- [visual-setup-refused.json](visual-setup-refused.json): the owned Vite server
  had ended, so navigation refused before game action. Root restarted it and
  confirmed HTTP200.
- [visual-initial-pose-failure.json](visual-initial-pose-failure.json): the helper
  guessed a zero Level0 index; zero means no floor. Reading the actual
  `LEVEL_BY_ID.l0.index` fixed pose selection without changing game source or
  bypassing physical validation.

## Limits and quality assessment

The native fixture separately proves actual `CreatureManager.hear` consuming the
old-position receipt and eight actual host-wave admissions. The browser proves
real tool input and delayed replay, **not a completed live-enemy lure maneuver**.
Controlled-clock guided input and software Chromium do not establish natural
threat pacing, blind-player return discovery, whole-shift fun, Internet co-op or
hardware frame-time performance. External public relay503/404/proxy bootstrap
errors and hub join/capability warnings were captured; the local test completed.
No `BLIND_HUMAN` or `HARDWARE_PROFILE` evidence is claimed. Independent qualified
score remains **8.0/10**; see [REVIEW.md](REVIEW.md).
