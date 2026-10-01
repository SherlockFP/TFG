# Wave27 — signature salvage

Baseline: main `1d5d7db`. Owned source: `src/game/salvage27.js`,
`salvage27_core.js`, `salvage27_text.js`, `src/models/salvage27.js`, and the
focused harness. Root owns Game integration, Carry2 hardening, combined checks,
browser evidence and publication.

The player problem is that many valuable objects differ mainly by price. The
design hypothesis is that three readable physical silhouettes and one optional
noise decision make recovery more memorable without adding chores, money or
another mandatory HUD meter. Physical salvage cooperation is informed by the
genre; these objects, models, names and dead-network fiction are original.

| Salvage | Native definition | Recovery decision |
| --- | --- | --- |
| Reply Drum / Yanıt Tamburu / Барабан ответов | Two-hand bulky scrap, 48 lb, fragile 0.5, base value 150–220 | Its loose reels rattle when hurried or shaken. Walk normally, obtain a valid native Carry2 helper, or load the existing trolley. |
| Indexed Glass / İndeks Camı / Индексное стекло | Native big valuable, mass 12, weight 38 lb, fragile 0.8, base value 145–205 | An archive pane hangs inside a steel suspension frame. Recover with the normal grab beam and existing brake/fragility mechanics. |
| Archive Sorter / Arşiv Ayırıcı / Архивный сортировщик | One-hand scrap, 14 lb, base value 85–135 | A compact robust mail sorter provides a simpler recovery option. No added fragility, upkeep or noise behaviour. |

These are existing item kinds, sold and serialized through native ItemManager
events. Stock tier/value rolls, impact loss, inventory, cargo and quota rules
still apply. No new saved property, wallet, payout multiplier, actor or floor
loot count is introduced.

## Loot and pace

Rare weighted additions go only into existing office, serverfarm, hospital and
mansion tables. Reply Drum weights are 1, 1, 0.6, 0.6; Archive Sorter weights
are 2, 2, 1, 1. Indexed Glass adds weight 1, 1, 0.6, 1 to the corresponding native
big tables. Registration is idempotent. Factory and mineshaft beginner tables,
and Backrooms/Null Reception table routing, are untouched by this module.
Because other installed content also adds weighted rows, these are weights,
not promises of an exact player-facing encounter probability.

## Noise authority and lifecycle

The host samples drums at roughly 10 Hz using the native simulation clock.
Held sound requires living, non-downed crew, native `held` custody, a visible
active item, no bag/equipment inventory and actual movement. Self uses the
actual `heldItem()` identity. RemotePlayer packets advertise a held **type**;
the runtime also requires matching native custody and fails quiet when two
same-type held items make the advertised ID ambiguous.

Measured speed at least 3.25 m/s, or real sprint input plus at least 1.4 m/s
movement, can rattle the drum. This catches the slower weighted sprint while
normal weighted walking remains quiet. A position jump of 2.5 m or more per
sample is rejected. Native loose Rapier bodies rattle above linear speed
2.8 m/s or angular speed 3.5 rad/s. Trolley custody `c:cargo13` always suppresses
the behaviour even when its visual is rendered in the basket.

Silencing from a helper calls `carry2.helperFor(itemId)` rather than trusting a
replicated list. That API verifies actual active custody, a living helper,
native range/physical LOS, free carrying capacity and unexpired keepalive.
Sound uses the existing spatial `vent_rattle` effect and
`CreatureManager.noise(position, 0.72, owner)`; existing hearing/occlusion and
Threat pressure consume it normally. It does not directly spawn an enemy or
damage a player. One drum can pulse at most every 1.8 seconds, with a shared
minimum 0.35-second gap and at most 64 tracked drum records.

Phase, map/facility streaming, map identity changes, clock rewind and host
role/epoch changes clear old temporal records. Replicas, Dead Letter combat,
company/home maps and a deep state bearing another run's token do not produce
campaign noise. A short existing toast teaches each object once per session.

## Models and cost

Original reproducible source is `src/models/salvage27.js`. Every model has one
merged vertex-colour Lambert mesh, fewer than 2,200 vertices, no glow, texture
or new light. Dirty ivory, charcoal, worn steel, muted ochre and opaque smoked
archive glass follow THEME. The three silhouettes are a twin-reel recorder
with an offset CRT, a suspended pane in a tall steel frame, and a low mail
sorter with an output paper stack.

Local dimensions in metres are approximately:

| Model | Width × height × depth |
| --- | --- |
| Reply Drum | 0.84 × 0.66 × 0.462 |
| Indexed Glass | 0.76 × 1.2125 × 0.36 |
| Archive Sorter | 0.58 × 0.33 × 0.505 |

Native WorldItem centres the real bounding box and builds its normal Rapier
cuboid from that size. Native instances own cloned geometry. Module leases
own at most three source templates and one shared material; the last release
disposes those resources once. Factory restoration skips retired session
owners and preserves unrelated overrides. Overlapping session teardown is
covered by the harness.

## Evidence and limits

`NATIVE_INTEGRATION`, `tools/harness/salvage27.test.mjs`:

- Actual LocalPlayer/Rapier movement proves ordinary weighted walking quiet
  and sprinting noisy; per-item frequency and one native pressure charge are
  checked. Actual CreatureManager hearing consumes the generated sound.
- Native Carry2 host request plus renewed nearby helper suppresses sound;
  a downed helper cannot grant that benefit.
- Real ItemManager held/inventory/drop/remove events prove bag, inactive
  hotbar, trolley, remote active-type and ambiguous duplicate cases.
- Actual Rapier angular velocity, replica ownership, host migration,
  facility stream/rebuild, Dead Letter and stale-run token checks pass.
- A 70-extra-drum fixture bounds global pulse frequency and temporal records.
- All three real WorldItem models have one matte draw batch, matching native
  cuboids; Indexed Glass has mass 12. Native impact damage affects fragile
  objects and leaves the robust sorter intact. Normal serialization retains
  type, value and custody.
- No caught emitter errors; repeated/overlapping disposal restores registries
  and leaves zero template/material leases.

Initial harness setup corrections were retained in the work log: direct
actions import needed the normal CSS loader; pool comparison needed to start
after the existing Carry2 install; model-local bounds needed to exclude stock
random spawn yaw; the sorter output paper measures 0.505 m deep, so the
compact-shape assertion uses 0.51 m. These were fixture/measurement corrections,
not hidden gameplay outcome overrides.

Final focused native run passed; raw log:
`/tmp/tfg-salvage27-final-test.log`. The flat floor, recording transport and
audio/DOM fixtures are labelled controls. This does not prove rendered art,
Internet co-op, player enjoyment, full enemy-luring tactics or hardware FPS.
Root's combined wave report owns final source freeze and browser evidence.
