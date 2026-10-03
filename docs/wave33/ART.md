# Wave33 — original archive worker presentation

2026-10-03. Authoring baseline: `bf4f577ab2fde624b0cfd02bf5c5cd098353b5df`.
This report covers the model/audio providers and their focused native resource
test. It does not establish first-person readability, fun, network reliability
or representative hardware performance. The owner's experience baseline stays
**1/10**. Root owns the combined registry, boot, protocol, browser and Git work.

## Authored design and file ownership

- `src/models/creatures32.js`: `createCreature32(id)`, original procedural worker
  geometry, owned pivot animation, hit flash and once-only resource disposal.
- `src/game/creatures32_audio.js`: `creature32Cue(id, sampleRate)` and
  `ensureCreature32Audio(game)`, original short mono buffers in the native cache.
- `tools/harness/creatures32_model.test.mjs`: model/audio boundary verification.
- This report: resource measurements, integration contract and evidence limits.

Both types use faceted clothed worker proportions, practical gloves/boots,
maintenance masks and harnesses. The four flat Lambert materials use faded
workwear, charcoal, dirty ivory and worn ochre. There are no textures, downloads,
borrowed franchise shapes, recordings, broad green glow, PBR materials or real
lights. Small ochre labels identify equipment. Damage flash is transient and
returns every owned emissive color to zero.

Sessiz İşçi (`c32_dormant`) sits in a bent-knee crouch with a lowered mask and
folded arms. Its 1.5-second wake raises the torso/head and opens the arms; its
swipe preparation holds a raised right arm. Chase uses a limited worker stride,
and rest returns to the crouch over the native four seconds. Hat Kırıcı
(`c32_ram`) has two normal worker arms, a left shoulder plate and an opposite
mechanical support. Windup visibly plants the legs, lowers the mask and braces
the shoulder; charge holds that silhouette, and rest folds the upper body.
Warnings have held shapes and remain readable without an audio cue or moving
idle breath. This is authored intent, pending the root-owned first-person check.

## Actual native animation and integration contract

The inspected `CreatureView.update` caller passes
`{state, speed, t: stateT, time: game.time, progress, aim}`. The model reads
`state`, `speed`, `t` and `time`; it does not create an AI clock or listener.
`dt` advances only cosmetic walking phase. Model animation touches internal
worker pivots and leaves the native root position/yaw unchanged. Animation never
allocates geometry or material. Native death presentation owns root toppling;
the model only slackens its limbs.

The native owner confirmed dormant states `idle/wake/chase/windup/rest` and ram
states `idle/windup/charge/rest`, with native `stunned/dead`. The provider returns
the native `{root,height,radius,parts,update,setTint,setElite,setHitFlash,dispose}`
surface. Authored capsule metadata remains dormant **1.65 m / 0.40 m** and ram
**1.90 m / 0.50 m**. Presentation dimensions do not replace native collision.
Prototype admission forbids elite/variant/affix changes, so `setElite` preserves
the worker dimensions; tint blends a small amount into the cloth only.

Root registry work routes these two IDs to `createCreature32`. Root added only
these two IDs to `creature_read.NO_POSE` and `NO_TELL`:
the generic windup/charge pose would layer a second animation over the authored
warning, and automatic bright eye meshes would add a fifth material and change
the masked matte design. Complete-view resource counts require those opt-outs;
the focused integration test now verifies the native factory and both actual
reader layers retain the authored four-material budget.

Audio cache registration must occur after native AudioContext creation, with
the same existing boot retry pattern used for C20. Dormant `wake` can map to
`c32_dormant_wake`; ram `windup` can map to `c32_ram_brake` through the existing
view state transition table. Repeated snapshots must not replay them. Ram impact
must use a confirmed physical collision/hit event, because entering `rest` also
means cancellation, join or migration and is not proof of impact. The native
owner and root received this distinction before final wiring.

## Measured resources

Native Three.js traversal counts one merged mesh/material batch as a draw and
uses index/position count divided by three for triangles. All measurements below
come from the actual provider, rather than the budget targets.

| Model | Draw batches | Materials | Triangles | Textures | Lights |
| --- | ---: | ---: | ---: | ---: | ---: |
| Sessiz İşçi | 18 | 4 | 528 | 0 | 0 |
| Hat Kırıcı | 18 | 4 | 564 | 0 | 0 |
| Allowed maximum | 20 | 4 | 1,400 | — | 0 |

Each view owns all merged geometries and the four instance materials. Temporary
construction shapes are disposed after merging. Independent views share no
geometry/material ownership. Two consecutive model disposal calls emit one
disposal per owned geometry/material. Update and flash methods ignore disposed
views. No texture or loop cleanup obligation is introduced by the model.

Visible hands and shoulder equipment can extend outside the capsule, including
dormant raised-arm preparation; the visible mesh is not the physical access
oracle. An added focused floor-origin check caught the ram warning rotating a
boot under the floor by about 0.026 m. Keeping ankle pitch opposite the composed
leg pitch repaired this; stationary idle/wake/windup/rest meshes now stay above
the native feet-origin floor within the 0.005 m numerical tolerance.

## Original procedural audio

The dormant cue combines synthesized paper friction, a mask latch and a muffled
tonal breath. The brake cue contains three original mechanical ticks at 0.08,
0.48 and 0.88 seconds with low pressure noise. The impact is a damped metal/body
thud. Local seeded noise is reproducible and uses no shared-generation randomness.
Fade edges avoid an abrupt sample discontinuity.

| Cue | Duration | Mono samples at 48 kHz | Float32 bytes | Measured peak | RMS |
| --- | ---: | ---: | ---: | ---: | ---: |
| `c32_dormant_wake` | 1.50 s | 72,000 | 288,000 | 0.185335 | 0.035466 |
| `c32_ram_brake` | 1.40 s | 67,200 | 268,800 | 0.189258 | 0.024949 |
| `c32_ram_impact` | 0.75 s | 36,000 | 144,000 | 0.208329 | 0.025224 |

Total generated channel storage at 48 kHz is **700,800 bytes**, excluding native
WebAudio object overhead. `ensureCreature32Audio` follows the C20 manager-cache
contract: it waits for a context, caches each ID once, allocates mono buffers and
starts no sources. There are exactly three one-shots and **zero persistent loops**
in this delivery. The optional dormant loop is omitted; no model/scene/session
audio owner or recurring buffer allocation was added. Buffers remain owned by
the existing AudioManager cache, not by the model dispose function.

## RED/GREEN and evidence limits

Focused command (bundled Node **24.19.0**):

```powershell
& 'C:/Users/Sher/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' tools/harness/creatures32_model.test.mjs
```

Initial RED: the absent model provider produced `ERR_MODULE_NOT_FOUND` before
implementation, as specified by Task4. Initial provider resource/audio GREEN
passed. A subsequent actual native floor-origin assertion failed on the ram
warning pose; after the ankle correction, the focused command passed again,
exit **0**, with the 18/4/528 and 18/4/564 measurements above.

The focused checks exercise actual procedural geometry and native AudioManager
playback. Only the unavailable Node WebAudio platform graph is stubbed. The test
checks finite vertices/matrices, model budgets, held host yaw, resource identities
through all states, independent view ownership, twice-dispose events, matte flash
reset, native floor origin, finite bounded deterministic cues at 16/48 kHz, faded
edges, cached mono allocation, registration without live sources and explicit
`AudioManager.play(...,{volume:0})` gain remaining zero. It does not test audible
mix quality, master-volume UI behavior, first-person render quality or human
recognition. No appearance snapshot is treated as an acceptance test.

The provider owner ran a scoped whitespace check; root must run the combined
production build, fresh native lifecycle tests, full required shared suite and
frozen-source first-person check after integration. Natural spawning remains
subject to the plan's native and guided acceptance gate. No acceptance, fun
improvement or hardware FPS claim follows from these model/audio counts.

## Integrated native presentation resource check

Root added `src/game/creatures32_presentation.js`, native factory early selection
and the two reader opt-outs. The provider owner then independently extended the
same focused test against the actual `Emitter`, `CreatureManager` registration,
`createCreatureModel`, `creature_read` and `installWarmSet` implementations. No
app source was changed by this follow-up; only the focused test and this report
were edited.

The extended command passed, exit **0**. Both registered native definitions now
select their respective worker factory, including the direct native fallback
path with no mod model override. Actual `ensureTell` returns exempt, adds no
mesh/material, and actual `dress/apply` leaves the authored root pose untouched.
This resolves the prior integration checkpoint; it is not a first-person render.

The test emits native `warm` twice with actual `WarmSet.hold` and cleanup between
landings. It observes the same **two roots, 36 geometries and eight materials**
reused across both emits. All geometries carry the expected shared mark.
Consecutive `WarmSet.cleanup` calls remove the hidden group and emit **zero**
geometry/material disposal events. Presentation dispose, called twice after the
second cleanup, emits exactly **one** disposal event for each of those 36/eight
resources. A subsequent warm emit registers no new root.

Listener state is checked using the actual emitter handler sets: one WarmSet
update listener plus one presentation warm listener plus one deferred audio
retry initially; successful native buffer registration removes the retry;
presentation disposal removes its warm listener; WarmSet disposal restores the
total count to **zero**. A separate pre-context shutdown also removes both
presentation listeners without leaving a deferred retry. The emitter error log
does not gain a swallowed callback error. Existing native View repeated-state
one-shot tests belong to the native owner and are not duplicated here.

This evidence covers factory selection, no duplicate generic animation/tell,
warm allocation bounds and final owned resource/listener cleanup. Shader
compilation, audible mix, reduced-motion first-person warning recognition,
hardware profiling and human acceptance remain outside this test.

## Captured warning-frame inspection before bounded tuning

Read-only inspection of [dormant warning](dormant-warning.png),
[ram warning replay](ram-warning.png) and the actual
[raw ram frame](ram-warning-frame.png) used the root-owned seed1235 factory1.3
fixture. The root labels these as actual App RAF/render captures from synthetic
native input: dormant flashlight on at about 0.5 seconds into wake, ram flashlight
off at about 0.5 seconds into windup. The composite screenshots include a smaller
warning replay while the live view has progressed. The raw ram artifact is named
`ram-warning-frame.png`; the requested `rawram-warning-frame.png` did not exist.

The raw ram frame shows a clothed, matte faceted worker with harness, boots and
an arm braced forward. Its charcoal/workwear body fits the industrial room.
However, the shoulder lock has low contrast against the dark wall with the
flashlight off; a single static frame does not clearly communicate the committed
charge line or distinguish preparation from a generic worker stance. Small replay
presentation further reduces the equipment and limb detail. This is a concrete
silent-warning readability risk, not a claim that a player failed to dodge.

The dormant replay shows the rising worker/head against flashlight-lit floor and
wall. The mask front is washed pale under that illumination, obscuring its filter
detail, while the small replay weakens the open-hand/arm cue. A single 0.5-second
wake frame cannot demonstrate that the change from the idle crouch is noticeable.
The captures do not supply matched same-camera idle frames, sound, peer callouts
or reduced-motion human reactions. Different lighting/capture sizes also prevent
a fair claim that the two silhouettes are reliably distinguishable.

Next art acceptance should compare the same-camera idle→wake and idle→windup
sequences at real encounter distances, with matched flashlight on/off lighting,
silent audio and reduced motion. Observe whether an unprompted player describes
the shoulder commitment and a teammate can call the retreat/side-step rule. If
the shoulder or mask stays lost, tune local pose separation and matte value
contrast within the current budgets before adding content or global glow.
Natural spawning stays subject to the existing acceptance gate. These early
captures precede the final fresh browser repeat after the shared native attack
wrapper repair; they earn no human acceptance or changed **1/10** fun rating.

## Bounded art tuning before final source freeze

The root authorized a correction to the observed low-contrast shoulder and
washed dormant mask before the final browser source freeze. Only model
construction values and owned pivot animation changed; native timings, damage,
capsules, root yaw, audio and the three-cue cache contract did not change.

Ram's existing ivory material is now dirty enamel `#c2bca8`. Its existing shoulder
plate is slightly wider/deeper, and the existing yoke and mechanical support
pieces move to the visible front. No shape, mesh or material was added. The held
windup uses a 0.53-radian forward body lean and wider outward arm brace; the pose
does not track a target or turn the native root. Dormant's shared ivory is now
darker `#8e8878`. Its arms spread and rise over the first 0.45 seconds of wake,
then hold alert while the full native 1.5-second warning/rise completes. The idle
crouch remains lowered. These are visibility hypotheses, pending the root's
fresh matched-camera render captures.

The existing resource/animation/integrated lifecycle command passes after tuning,
exit **0**. Exact geometry counts remain **18 draws / four materials / 528
triangles** dormant and **18 / four / 564** ram; zero lights/textures/loops were
added. Two cached warm roots still own 36 geometries/eight materials, dispose
each once and leave zero listeners. No frame geometry/material allocation or
appearance snapshot test was introduced.

An actual Three.js bounds measurement at zero movement gives dormant idle width
**0.944 m**, widening to **1.605 m** at wake 0.5 s, and ram idle width **1.074 m**,
widening to **1.557 m** at windup 0.5 s. The ram warning boot minimum stays
**+0.0068 m** above the feet origin; dormant is numerical zero. These visible
mesh extents demonstrate the authored pose separation and do not change the
native capsules or establish player recognition.

Model source SHA256 for the tuned handoff:
`ec26258811ae91eb95a9f911b9d37042cd53fb36874cf470006a6eb0bae08026`.
Fresh browser frames must use this tuned source plus the root's final native
wrapper fix. Earlier linked frames above document the reason for tuning and
must not be credited as a successful check of this source. Natural spawning
remains disabled by default; silent/reduced-motion human acceptance and fun are
still unearned.

## Final matched-frame pose-contrast verdict

Read-only inspection of the tuned source's matched captures compares
[dormant idle](dormant-idle-frame-final.png) with
[dormant wake](dormant-warning-frame-final.png), both at the same camera position
with flashlight on at 3 m; and [ram idle](ram-idle-frame-final.png) with
[ram windup](ram-warning-frame-final.png), both with flashlight off at 6 m.
The root captured these through the actual Game render after loading the final
source and root-relative asset paths. Original pre-tuning artifacts remain
unchanged. No model/source edits followed this inspection.

The dormant pair shows a clear change from lowered arms/lower head to a broad
raised and spread-arm alert. The left arm visibly extends outside the idle body
silhouette; part of the right arm overlaps the player's foreground flashlight.
The mask front still washes pale under the flashlight, especially in idle, so
fine filter detail is not a dependable cue in this lighting. The broad arm/head
pose change carries the observed contrast.

The ram pair shows hanging arms becoming a forward/outward brace, with the yoke
and shoulder line visible. The braced glove and arm silhouette separate from the
idle outline at the actual 6 m capture distance. The torso remains dim against
the wall; paired inspection now exposes the warning shape, but it does not
demonstrate an unprompted player's recognition of the locked charge direction.
There is no new glow or scene light in these frames.

Verdict: the matched actual frames establish visible idle→warning pose
separation for both authored workers under these two lighting/distance setups.
They do not establish attention capture in moving play, human reaction time,
reduced-motion recognition, audio mix, alternate camera angles or all facilities.
Root's native withdrawal/dodge/positive-control outcomes belong to PLAYTEST;
they are not inferred from still images. Human acceptance and a changed **1/10**
fun score remain unearned, and default natural spawning remains disabled.
