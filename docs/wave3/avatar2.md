# avatar2 — "TFG Employee" character redesign (MASTERPLAN §15)

**Status:** built + node-tested (`node tools/harness/avatar2.test.mjs`), `npm run build` ok. NOT hand-played in a browser.

## What
- `src/models/avatar2.js` — `createAvatar2(opts)`: bean/hoodie-overall body, stubby legs, small round arms with light-grey mitten
  gloves, rounded retro CRT helmet fused to the body (pixel face on a dark bezel with rounded corners), antenna + headphone cups,
  battery pack on the back. Chibi proportions (about 1.65 m body, 1.96 m with antenna). ~2.4k tris (classic: ~0.9k).
- `src/models/avatar.js` — `createAvatar(opts)` now dispatches: new body by default, `createAvatarClassic` = the old hazmat body.
  `setClassicAvatar(bool)` / `isClassicAvatar()`; setting `classicAvatar` (save.js default false; Settings > Video > Character,
  main.js calls `setClassicAvatar` on load + on apply; applies to newly built models). `opts.classic` overrides.
  Creature models decorating the old body (`faceStyle:'mimic'`, `visorColor` = hit squad) always stay classic. The Doppel copies the crewmate, so it follows the new body.
- First-person view-model arms get round light-grey gloves (`round = !CLASSIC` in `createViewModel`).
- `src/models/cosmetics.js` — small `[avatar2]` hooks: `rig.attach` (see below), `rig.defaults` (glove/boot/belt colours), `rig.dims.coat`,
  `rig.faceHead` for face accessories.

## API / anchors (same as classic)
`update / setMouth / setExpression / setLook / getLook / setHat / getHat / setSuitColor / setEyeColor / setHitFlash / setVisible / dispose`,
`parts.{head, torso, handR, handL, backpack, face, neck, hips, hatSlot}` (+ `parts.chest`, `parts.instr`), `height 1.8`, `radius 0.35`, mesh
named `visor` (the screen). `root.userData.avatarStyle = 'tfg2'`, `api.style = 'tfg2'`.

## How suits / hats / accessories re-attach
Suits, hats and back/face accessories were authored for the classic ~0.16 m torso / 0.17 m helmet. `createLookController` receives
`attach` frames — scaled child pivots of the real skeleton pivots (`chestFrame`, helmet frame, per-limb `hip/knee/ankle`, `sh/el`) —
and hands *those* to outfit builders (`ctx.rig`), so all outfits incl. Venom and the 12 wave-3 suits land on the new body without
per-suit changes. Animation only touches the real pivots, so fpbody / emotes / instruments keep working on `parts.torso/neck`.

## Animation
Squash and stretch on the `rig` pivot (feet origin): footfall squash, jump stretch, landing + crouch squash, breathing, waddle sway.
Gait (short quick steps), climb, carry, hold, sit/dance/wave/point, melee swing kept. Death: topples onto the battery pack and the
screen shows animated "NO SIGNAL" static. Screen keeps blink, wandering pupils, rare CRT flicker, talk nod.

## Test
`tools/harness/avatar2.test.mjs`: dispatch (setting, `classic`, mimic/visor stay classic), API + `parts` parity with the classic avatar,
triangle budget (< 9000), animation states finite, hands/head in sane places, every OUTFIT (24) / hat / face / back builds with no
`console.warn`, Venom applied.

## Known / TODO
Not eyeballed: proportions vs. classic hand grips (held items use `parts.handR/handL`), charpreview framing, emote camera, first-person
body (spine y-scale trick from fpbody_grip). Tune `A2`/`HEAD_SCALE` in avatar2.js if it looks off.
