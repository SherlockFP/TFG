# Wave 17 — field jobs, city deliveries and hands-on production

The owner requested more playable content and continued quality work toward 8–8.5.
Baseline main is `0aad5fa` (wave 16). This round connects new actions to existing places,
custody and ledgers rather than adding another mandatory progression system.

- Ordinary quota 1+ expeditions can offer survey-drone recovery or a quiet uplink, alongside
  existing signal/vault jobs. A real carried fuse, active-field repair or quiet crew presence
  earns one physical salvage parcel. A paid helper repairs autonomously while the crew explores.
- Moving city citizens dispatch and receive a real sealed parcel after the first field day.
  Crew handoff and bag custody work; the 12-credit delivery shares the existing daily survey budget.
- Existing workshop bays offer short pressure-timing and signal-sequence calibrations. The host
  validates each action; failed/cancelled attempts preserve the commissioned batch.
- Confirmed bagged salvage explains its actual inventory/drop bindings in the existing pickup feed.
  Replay remains quiet, genuine re-pickup works, and danger suppresses the instructional line.
- Screening alcoves and marked escape routes use actual body-volume/floor checks. Warden movement
  uses its true capsule to avoid slipping through thin panels. Planning is bounded and measured.

Implementation and evidence: [field.md](field.md), [city.md](city.md), [workshop.md](workshop.md),
[readability.md](readability.md) and [escape.md](escape.md). [PLAYTEST.md](PLAYTEST.md) records
real inputs, setup boundaries and failures; [REVIEW.md](REVIEW.md) owns the independent assessment.
Full regression after the field-placement fix: **211/211 passed in 331 seconds** (`-j 2`).
After the final workshop-overlay stylesheet correction, inventory/readability/center-card checks
and the production build passed (2.61 seconds). Vite reports ineffective dynamic-import warnings.
Actual two-peer browser outcomes and the independent **7.5/10** assessment belong to PLAYTEST/REVIEW.
The round is published as one combined main commit; Git history and the remote identify its exact SHA.

No new installer or Game hook is required: the existing expedition13, life13, workshop14 and inventory
modules own these extensions. Preserve one wallet/quota/field-shift ledger, native item IDs and finite
rewards. Software rendering is not representative hardware performance or human playtesting.
