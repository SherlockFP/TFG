# Wave26 — liminal runtime and native admission

The existing Backrooms content is real: a yellow/pool/pipe/party facility,
four native entities and sounds, a secret Manila room, the purchasable `br_level0`
moon and a separate noclip pocket. It was not connected correctly to the normal
depth lift. `brlevels` only rebound on `mapLoaded`, whereas the lift emits
`facilityWillChange` / `facilityChanged`; the deep resident pool also omitted
the Backrooms entities.

## Changed native contracts

- The facility lifecycle rebinds existing baked lighting, sublevel atmosphere,
  captions and audio. It stops old loops, releases the old facility reference and
  clears only grain owned by the caption effect. A repeated caption formerly
  discarded that ownership and could leave `0.34` grain on the next floor; a
  native positive-control regression reproduced this before the correction.
- Deep Backrooms floors use the native regular loot population. They do not
  inject a second Manila bonus or landing-local pack. Surface return does not
  replay `moonPopulated`. Legacy `br_level0` and surface wrong doors remain.
- A valid deep token suppresses nested noclip entry and delayed pocket builds.
  Facility streaming explicitly clears the old glitch/pocket. Yesterday's stale
  depth state cannot suppress a new landing's surface wrong door.
- Deep threat admission uses the actual saved/certified facility choice. Curated
  liminal ambient admission waits25 native seconds after arrival and respects
  the shared core count/power/stat limits. First Backrooms visits select native
  Data Hoarders, Smilers and Pale Hounds, with at most one Backrooms rule entity;
  Partygoers and moths enter the finite pool from depth11. Null Reception uses
  native Data Hoarders, Web Crawlers and Listeners. Moon-table requests map to
  these actual residents and charge the species actually spawned.
- Existing scripted ownership, migration restore IDs, bosses, hazards and outdoor
  actors retain their prior exemptions. The arrival grace is an ambient admission
  contract, not invulnerability or a replacement for every authored event.

## Null Reception: obsolete sound receipts

`installLiminal26` listens to existing authoritative noise and native replicated
crew noise/voice. A loud crew action records its current position. Three native
seconds later a weak acoustic receipt plays **at that old position**, so ordinary
hearing/occlusion can draw a listening enemy away while the crew crouches and
changes route. Walking quietly avoids the extra trail; sustained rushing keeps
leaving it. This is an original dead-network maintenance rule, with no new meter,
wallet or mandatory puzzle.

The host owns receipts: delay3s, cooldown8s per crew member, maximum8 pending,
one replay per update, replay loudness1.1. Ownerless legacy tool/impact events are
accepted only within8m of living native crew; distant noise and explicitly
creature-owned events are excluded. Nearby ownerless world impacts can be stored.
The positional `fx` sound uses the existing spatial audio path. Hearing rows use
the existing native shape and do not recursively capture or charge the Threat
meter a second time. Streaming, phase changes, role/epoch changes, host migration
and disposal discard queued old-map/old-clock receipts. Replicas create none.

## Evidence and limits

`NATIVE_INTEGRATION`: `tools/harness/liminal26.test.mjs` builds actual furnished
Backrooms and Null Reception facilities with Rapier, installs the actual runtime
modules and `CreatureManager`, and exercises their event callbacks. Controlled
player/time/noise fixtures check baking/rebinding, native25s admission, two-body
and first-rule caps, deep prize suppression, stale token/packet rejection,
caption ownership, actual hearing at the obsolete position, bounded/once-charged
receipts and rebuild/migration/replica cleanup.

Eight explicitly seeded fresh-wave fixtures run the real `hostMethods.hostSpawnWave`
and native position selection/creature constructor. They produce actual Backrooms
species and verify exact mapped power accounting; they are not a playthrough.
The focused liminal runtime, existing descent threats, Backrooms translations and
pocket tests passed together. Initial fixture setup failures were corrected; the
caption-grain assertion was an actual reproduced runtime failure and remains
described above. The test uses a headless DOM/audio/network recording fixture;
it does not establish rendered readability, audible quality, blind player pacing,
Internet co-op, retention or representative hardware performance. Root owns the
separate frozen browser and publication evidence.
