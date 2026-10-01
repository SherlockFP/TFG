# Wave27 — brace a rolling load

Player hypothesis: hauling becomes a crew job when the second person can stop a
rolling valuable before it reaches a wall. Existing cargo already includes the
Cargo13 trolley, Carry2 heavy partner grip and throw/catch, a single-owner grab
beam and Cargo20 manual shoves. This round extends the physical shove rather
than adding another trolley, inventory, currency or permanent progression meter.

When a loose big load moves horizontally toward the player at at least 0.7 m/s,
with a direction dot of at least 0.35, its existing interaction changes from
`Grab [LMB] · Push [E]` to `Grab [LMB] · Brace [E]`. Turkish uses `Frenle`, Russian
`затормозить`; the prompt uses the configured interaction key. Looking at a
stationary load retains the existing shove. No extra key or panel is introduced.

The existing `cg20n` channel accepts `op: 'brake'` or `op: 'push'`; an omitted op
retains the legacy push behavior, while unknown ops are rejected. The host
independently validates approach, crew life/downed state, free hands, native
2.8 m range, view direction, STATIC/DOOR LOS, run token, increasing nonce and
0.75 s crew/0.5 s body cooldowns. The existing loose-world filter rejects held,
cart, beam-owned, carried, bagged, sold and deployed objects, bodies and apparatus.

Bracing applies a Rapier impulse opposite the current horizontal velocity. It
hard-caps the horizontal change at 2.2 m/s and impulse at 120, does not reverse
motion, and deletes any previous shove burst for that object. Gravity, angular
motion, transforms, native custody, values and the single physics owner remain
unchanged. The native impact detector is retained: a calm stop does not itself
reach its 4.2 m/s threshold, while dangerous falls and collisions still cost value.
Bracing a beam-owned load is deliberately refused; the spotter acts on a released
physical load. It slows very fast cargo instead of granting an instant save.

Owned files: `src/game/cargo20.js`, `cargo20_core.js`, `cargo20_text.js`, and the
existing `tools/harness/cargo20.test.mjs`. This adds no actors, meshes, lights,
colliders, audio loops, timers, or new retained network state. Existing request
cooldown and lifecycle maps remain owned by Cargo20.

## Verification

`NATIVE_INTEGRATION`, Node22, actual WorldItem/Rapier bodies and ItemManager
snapshots; selection and recording network/audio are labelled fixtures. The
contextual action invokes the actual registered handler. The native
`actionMethods.onItemImpact`, `hostMethods.hostDamageItem` and ItemManager value
event callbacks prove that benign bracing preserves the pre-action value and
that a fast downward velocity still charges native damage. The load's initial
landing and rolling velocity are setup, not user input or gameplay outcomes.

Same-trajectory worlds, 3.5 m/s initial horizontal approach, 0.5 native seconds:

| Native load | Physics mass | Unbraced travel | Braced travel |
| --- | ---: | ---: | ---: |
| Vase | 8 | 0.5903 m | 0.0143 m |
| Server | 55 | 0.8504 m | 0.0182 m |

The native calm trajectories produce no impact/value/custody changes. Actual
braked snapshots place replica bodies within 0.002 m while preserving item
identity/value/custody. Negative cases cover replay, old token, forged crew,
wrong operation, LOS wall, range/view, dead/downed crew, full hands, cart/beam/bag/
sale/fixed-body states, sideways/away/slow motion, replica force rejection and
erasure of a queued shove. A violent fall retains its downward velocity and
causes real value loss. Oversized optional force inputs remain below the benign
impact threshold. EN/TR/RU prompts retain the remapped interaction key.

The first focused attempts stopped on harness setup: importing actual action
callbacks required the standard CSS loader, and the recording fixture lacked an
unrelated native noise request handler during its initial landing. Those fixture
errors were corrected before the native comparisons. A later check strengthened
the violent-fall assertion to compare against the actual pre-fall value, and
added braked replica snapshots plus an oversized-force negative control.

Final owned source: `npm test -- -j 2 cargo20 cargo13 carry2` passed **3/3 in 2s**.
`git diff --check` passed. Logs: `/tmp/tfg-wave27-haul-final.log`; the detailed
trajectory output is `/tmp/tfg-wave27-haul-native.log` (before the final hard-cap
negative control, with the same default impulse). Root owns combined build,
frozen-source browser checks and publication.

These results prove the native mechanics and boundary behavior. They do not
prove human reaction timing, blind discoverability, Internet peer timing,
representative hardware FPS or long-term fun. The short-lived prompt's visibility
and whether a real crew wants the spotter role remain playtest questions.
