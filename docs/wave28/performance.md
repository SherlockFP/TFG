# Wave 28: repeated-work audit

Baseline: `053ed66`. The audit below selected two focused presentation fixes. Implementation followed root's source-unfreeze GO after the baseline browser closed; the final native component results are recorded below. This is not a measured frame-rate improvement. The normal fresh-start browser baseline and subsequent browser/full-suite integration are owned by root and the play-test agent.

## Actual loop and existing safeguards

`App.loop` runs `Game.update`, ship-screen refresh, the active minigame, then scene/post rendering. `Game.updateFrame` runs native physics/items, remote avatars, host creature simulation, creature presentation, ship/map/environment, module update hooks, HUD and objectives. `netSend` is guarded exactly once in `finally`.

Existing work already avoids several tempting duplicate optimizations: AI player rows are cached per game time; avatar look/expression setters compare their previous values; the ship mirror requires a living player inside the ship and within its range; distant creature animation uses LOD; scene resource scans and cleanup have a per-update budget. Normal landings spread map-build listeners over the descent and prewarm shaders. A facility build is still one atomic landing job; `game.landQ.last`/`report()` should identify its actual cost before changing the build pipeline. Resumes/late joins intentionally use the synchronous path.

## 1. Unchanged ship-screen canvas redraws

`src/game/screens.js:59` refreshes at approximately 5 Hz near the ship. `drawStatus`, `drawQuota`, and `drawExtra` each clear/draw their whole canvas and increment `CanvasTexture.version` via `needsUpdate`, even when all displayed fields are unchanged. This is confirmed redundant drawing/upload scheduling; its device-dependent frame cost is not established by this audit.

Proposed ownership: `src/game/screens.js` and a focused native component harness. Initially cache the status and quota screens at the refresh caller, using the exact displayed text/colours, locale and font readiness. Preserve direct draw methods so external callers can redraw explicitly. Preserve the live radar, arcade, and `drawExtra` call: lore replaces `drawExtra` with the animated Algorithm face and must restore vitals immediately when speaking ends. If vitals are also cached, the actual installed method/override state and external texture writes must invalidate that cache; a field-only cache would leave a stale talking face.

Status acceptance: cargo-value, credits, phase, moon short name, crew count and displayed clock changes redraw on the next existing refresh. Fractional clock changes inside the same displayed second do not redraw. Quota acceptance: sold value, target, deadline and day changes redraw. Locale changes and delayed credit-font readiness repaint unchanged data. Going beyond 20 m preserves the current suspension; returning displays current values.

Counters/reproduction: in a real `ShipScreens` instance with recording canvas contexts, call `update(0.2)` 20 times on an unchanged orbit state within range. Count each canvas clear and texture-version delta. Status/quota currently redraw 20 times each; the proposed result is one each, with live radar/arcade/vitals retaining their refreshes. Change each displayed field independently; prove one repaint and then stable suppression. Wrap the real `drawExtra` with a recording animated override and prove calls continue while active and vitals return after it ends. This is a deterministic work-count test, not a renderer/FPS benchmark.

## 2. Unchanged inventory DOM replacement

`src/ui/hud.js:254` always assigns the final hotbar HTML. The battery refresh at `:661` invokes it every 0.5 s even for empty pockets or unchanged tools, replacing the same slot subtree. Inventory events and bag-tag updates also use that method.

Proposed ownership: `src/ui/hud.js` and the same focused native harness. Compare the final HTML, including bag tag, before assigning it. Update `invItems` and `invActive` before the equality guard so same-looking replacement objects remain the active data source. Keep the existing battery refresh cadence and all native item/economy callbacks.

Acceptance: repeated identical calls perform one HTML write; active slot, type/name/icon, label, rarity/affix, battery, durability, ammo/charges, item-on state and bag-tag changes still write exactly when their final HTML changes. Swapping in a same-looking item must update the stored item reference even when the DOM is retained. Existing localization output must remain identical; this patch does not add a new naming/translation scheme.

Counters/reproduction: call the actual `HUD.setInventory` against a recording DOM element with real item definitions/icons/durability functions. Twenty unchanged calls currently perform 20 writes; proposed result is one. Mutate each displayed state and compare generated HTML to an uncached/direct rendering reference. Preserve a child listener/sentinel across unchanged calls to verify that caching actually retains the subtree.

## Browser validation after the baseline

Use the same quality/resolution/seed and a quiet ship view, then repeat a normal landing/facility entry. Record actual frame durations and long-frame timestamps alongside screen texture-version changes, hotbar mutations and `game.landQ.last`. Use `engine.sceneStats` for the scene draw count; `renderer.info.render` is reset by the later post-processing render. Report counters separately from frame timings, acknowledge software rendering/host variance, and do not infer smoothness from the size of the native test suite.

## Implemented result and focused verification

Changed `src/game/screens.js`, `src/ui/hud.js` and added `tools/harness/presentation28.test.mjs`. Status/quota cache the exact rendered rows, including colour, plus locale and a shared font-readiness revision. The cache compares the live texture version, so external updates repaint on the next refresh. Direct draw methods still redraw explicitly. Radar, arcade and vitals/Algorithm `drawExtra` remain live. Missing optional anchors return before generating rows or walking cargo. The hotbar compares final HTML after updating the stored item references/active slot; its existing native refresh cadence remains intact.

| Work over 20 identical component refreshes | Baseline | Changed |
| --- | ---: | ---: |
| Status canvas clears / scheduled texture updates | 20 / 20 | 1 / 1 |
| Quota canvas clears / scheduled texture updates | 20 / 20 | 1 / 1 |
| Inventory HTML assignments | 20 | 1 |
| Radar / arcade / vitals canvas refreshes | 20 each | 20 each |

The new harness first failed against unchanged source with those baseline counts. Its initial DOM fixture lacked `getElementById`; that fixture error was corrected before recording the complete baseline. During implementation verification, a test expecting an invalid string affix to change a weapon with a custom label failed correctly: that input changed no displayed HTML. The test now uses a native-shaped visible `Sharp` affix on an unlabelled shovel.

Initial focused command: activate `/workspace/.tfg-tools/activate.sh`, then `node tools/harness/presentation28.test.mjs`. **9 component regressions passed**, about 0.14 seconds reported process time. They covered an independent expected text/colour/font/position oracle, missing anchors, stable work counts, displayed cargo/credits/phase/moon/crew/clock/quota changes, locale and delayed font events, direct redraw and externally incremented texture versions, live Algorithm override/restored HP/crew/event information, retained hotbar child callbacks and same-looking replacement item references, and native battery/ammo/charges/durability/rarity/affix/overclock/bag output.

These are actual `ShipScreens` and `HUD` component methods with real definitions/icons/durability/localization, controlled DOM/canvas fixtures and native Three.js `CanvasTexture` versions. They measure avoided canvas drawing/upload scheduling and DOM replacement. They do not perform WebGL rendering, establish GPU upload duration, Internet cooperation, hardware FPS, overall smoothness or a new human game rating. No broker/physics/custody/economy changes or Git operations were made by this agent.

## Browser-discovered wrapper integration regression

Root's corrected browser replay exposed a gap in the initial component fixture: the real `reserved-slots` and `hotbar-plus` boot wrappers assumed each native inventory call rebuilt all children. Preserving unchanged native HTML therefore accumulated LIGHT/value/total labels. Both wrappers also indexed all inventory children, so a prepended bag tag offset the actual slot decorations. The previous component pass and root-reported full-suite pass did not establish this integration contract.

The same harness now loads the actual public mod files through native `ModManager.loadAll`, scoped APIs, configure, boot and net-ready events, in both wrapper orders. Only the mod index response is controlled; source imports, initialization and wrappers are real. Before the public fix, 20 additional unchanged calls gave **21 LIGHT labels, 42 value labels, 21 totals and 300 decoration mutations**, with one native HTML assignment. Value changes also demonstrated the bag-index bug: the actual first item slot showed `▮20` instead of `▮47`.

Changed only the decoration blocks in `public/mods/reserved-slots.js` and `public/mods/hotbar-plus.js`. They select actual direct `.inv-slot` children, retain/update one owned decoration, remove duplicates or obsolete decorations, and guard class/text writes when presentation is unchanged. Filled reserved slots lose the empty label; changes/removal of host reservation config or a detached/new game remove stale marks. Hotbar feature/config changes remove values/totals and compact classes. Native configure/onAlways, pickup, handed-item and welcome logic remains unchanged.

Final focused command now passes **13 component/integration regressions**, about 0.24 seconds reported process time. Both installed wrapper orders give **one LIGHT label, two item-value labels, one total and zero unchanged child/attribute/text mutations**, while native HTML assignments remain one. Tests retain the prepended bag tag, change values and reserved kinds, fill/empty slots, remove config, toggle value/total/host feature switches, resize the hotbar and detach/attach a new game. Native configuration and the installed pickup/handed-item/welcome wrappers are also exercised against explicit original-game callback fixtures. This does not claim a full native Game simulation in the Node DOM fixture.

Final public-file SHA-256 values:

```text
3ab8480dfa2caca4cdb8f0bcf4c4743424b52982e970e20da7d7a235a1be8944  public/mods/reserved-slots.js
f85f651d86a1a901dba92c2bd1a07609b46d4cc5066e51a0aab70c7c7c8bfe1b  public/mods/hotbar-plus.js
```

Source ownership was released to root for the corrected browser replay and final publication checks. This follow-up adds no FPS or overall-stutter claim.
