# Wave27 — real helper boundaries

The source audit found that existing partner help trusted distance and advertised
`noLos:true`; it did not check living/downed actors, active cargo, occupied hands or
beam custody. A new actual Rapier wall/door + native WorldItem + synchronous Session
fixture reproduced the through-wall acceptance before the correction.

Host requests and continuing grips now validate actual active carried identity,
living/not-downed carrier and helper, start versus continuing reach, no occupied
two hands/body/beam, one helper job, and native STATIC/DOOR line of sight. A helper
can retain a one-hand flashlight. Native remote state names active type, so ambiguous
same-type inventory fails safely. The client target uses the same physical check;
its LOS exemption is gone. `carry2.helperFor(id)` supplies currently valid host
helper identity for the Reply Drum, including TTL, without trusting a stale list.

Facility streaming, map load and migration clear transient grips. Co packets carry
a floor/epoch scope, so a delayed old-floor list cannot restore a benefit. Focused
native checks pass alive/dead/downed, real wall/door, bag/beam/occupied/reach, TTL,
actual Session self-delivery and stale-floor/migration cleanup. Existing carry
speed, fragility loss and throw/catch values remain their native contracts.
