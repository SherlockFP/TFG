# Wave 25: reliable archive-card combat

## Demonstrated defect and scoped change

`deadletter24.attack()` previously consumed the selected special and local shot cadence before host acceptance. A wall-blocked muzzle or the existing four-second special cooldown silently discarded the selection. `special()` offered no readiness information.

The native host-only `dl24fx` channel now carries addressed throw receipts. The receiver checks the active token, floor revision, owner, exact pending sequence and kind. Only an accepted receipt consumes the selected slip and ordinary shot cadence. A newer R selection is preserved while an earlier request is in flight. Rejection keeps the selection, explains the blocked throw, and uses a separate 120 ms retry backoff; held input cannot flood rejection requests. Known special cooldown displays a compact localized wait and does not dispatch. Messages are throttled to 0.8 seconds. No added meter, attack, damage authority, healing or reward.

Floor/token changes reset transient selection and receipts; pending delivery is bounded to two seconds. Host admission still authenticates the peer and validates sequence, alive/downed state, direction, look alignment, true muzzle collision, projectile budget and attack cooldown. Duplicate accepted requests cannot replay.

## Boss arena admission

Room-centre `spawnSpots` could place the Warden in a service room. Filtering those points to the arena alone stalled a real native scheduler: all centre/±1.8 m points were inside the existing eight-metre crew exclusion.

The maps lane now supplies eight authored `fac.lab.bossSpots` on the full arena-radius ring. `safeSpot(true)` uses only those points, checks their arena room/radius, and retains real floor, capsule, nav-path, live-actor and crew-clearance checks. Ordinary wave spots/counts are unchanged. If crew occupies all candidates, the Warden waits for repositioning; no forced unsafe spawn or service-room fallback.

## Evidence

`tools/harness/deadletter24_mode.test.mjs` uses real installed Cargo13/Fleet13 callbacks, native HostCreature/CreatureManager, generated facilities and native Rapier. The legacy attack implementation failed the new rejected-special retry assertion (`/tmp/dl25-negative.log`); restored code passes (`/tmp/dl25-mode.log`). Tests cover wall rejection, retained selection, cooldown suppression/retry, foreign-owner receipt rejection and host sequence replay rejection.

The actual scheduler now leaves its Warden alive. Its native AI moves through the generated map, closes distance to a standing target, and naturally enters windup. A real KCC sprint retreat avoids that target's strike without teleporting during chase or forcing AI state. Downed crew is ignored. Genuine host-card trajectories then kill the Warden without injected boss damage. Ordinary waves remain a labelled accelerated native damage fixture. The hurt callback records attacks rather than simulating a human player's full health/liveness experience; this is behavioral evidence, not a human balance or browser-completion claim.

First floor remains 3/5/7 ordinary actors with 2.6-second opening stagger; later floor pacing is unchanged. First floor's 354 shared temporary XP reaches level 6 (five personal choices). Living players receive a health reset on descent, not an added pre-boss heal. No evidence justified changing that balance in this scope.

## Browser acceptance still required

Enter through physical E; use real R/LMB for an accepted special, then attempt another during cooldown and verify visible wait/retained selection. Ordinary aiming and a ready special must work after cooldown; host/peer requests must not duplicate shots. Navigate and defeat a naturally scheduled Warden, earn genuine kill XP/drafts, and physically descend/exit with campaign resources unchanged. No injected XP, boss HP, actor state or teleport during the fight. Native tests do not substitute for this browser proof.

### Native action-feedback priority correction

The real HUD intentionally defers `info` while `attentionHot` is true. This also deferred the newly added selected-slip, blocked-shot and cooldown cues during a Warden fight. Only these action responses now use native `warn` priority with 1200 ms duration; cooldown/blocked notices retain the 0.8-second throttle. Generic clear/end/progression notices retain their existing priority. No queue policy or extra overlay was added.

The actual installed mode handlers now feed `HUD.prototype.toast` under hot director attention in the existing mode regression. Selected R, rejected muzzle and cooldown responses reach `showToast` immediately as `warn`/1200; unrelated info remains in the deferred queue. The existing readability14 suite also passes. This is native admission evidence, not a new browser visual claim.

### Confirmed Auditor divider stall and bounded slide

The retained solo browser history ended after seven legitimate kills with an Auditor at `[-46.70568,-300,-31.09130]`, targeting the living operator at `[-0.78918,-299.98,-25.836]` from 46.22 m. The private helper also repeatedly selected a physically blocked arena-doorway segment; that separate helper limitation does not justify deleting the real jamb.

A labelled seed17/.8 reconstruction at the captured poses reproduced a genuine mode-AI stall. Its grid-smoothed path toward `[-46.5,-38.5]` skimmed the service divider at `[-46,-298.2,-32]`. The complete capsule rejected the tiny inward component, rolled back all movement, and retried the same path forever. The original step failed the added 60-second native regression with distance unchanged at 46.216 m (`/tmp/dl25-slide-negative.log`). The original browser's random mode seed was not retained; this is a matching authored-geometry reconstruction, not an exact RNG replay.

Only mode-owned actor movement changed. On a blocked full step, it tries at most two swept axis slides, starting with the larger component. A two-millimetre outward contact-normal component avoids numerical skin contact; the complete motion remains bounded by the original step length. Every slide retains the original capsule, .005 skin, collision groups and stop-at-penetration policy, validates the endpoint body against real static/door geometry, and requires a true nearby floor with matching height. Failed slides keep the original rollback/repath behavior. No teleport, collider removal, AI state forcing or speed increase.

Passing native results: 60 seconds, distance 46.216→minimum1.590 m, zero penetrating frames, maximum three casts per movement frame (one ordinary plus two fallback). Existing real Warden chase, KCC warned-strike retreat, downed-crew exclusion and genuine projectile kill remain green. All four mode definitions explicitly set `noScan` and `noIdentify`; campaign actors are untouched. The independent normal scanner/identification admission guard is owned by the controls lane. Full browser first-floor completion remains unproven until another genuine-input test.
