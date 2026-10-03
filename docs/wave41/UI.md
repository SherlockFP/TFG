# Wave41 Endless entry and build console

The separate title ENDLESS action opens the native Host form with Endless preselected. Host START passes explicit `mode:'endless'`, `slot:0`, `runData:null` and `quick:false`; campaign save cards disappear and the note explains the ready ship and separate run. The native art-menu GAME column and selected-entry hint include Endless. Normal PLAY still opens the crew browser.

Root owns mode/session/save/profile authority. Passing slot0 alone is not isolation: the old hostInit defaults slot0 to1. This UI assumes root's explicit save/profile boundaries and authoritative mode validation.

## Presentation

`createEndless41UI(game)` returns `openDraft`, `openPreparation`, `openInventory`, `update` and idempotent `dispose`. Root installs it after `game.endless41` exists and calls update from the native lifecycle. It creates one scoped style and small mode-only status, and uses the existing native panel/navigation system. No new renderer, clock, resource ledger or native item owner.

The maintenance-console design uses ink green `#18231d`, worn green `#223329`, ivory `#dedcc7`, olive edges `#7d8b69` and restrained rarity accents. Three wide horizontal cards show branch, rarity, explicit current→after statistics and upgrade/ban actions. The fixed three-column composition stays at960px; narrower than700px becomes a vertical list. Panels scroll within86vh; labels/descriptions wrap. Shared native pixel/condensed font variables preserve TR/RU fonts.

The actual remaining native pool may offer only one or two upgrades after caps/bans. Those remain selectable without fabricated alternatives. Reroll/skip/ban call the current mode API; disabled limits are display hints, with host validation remaining authoritative. Stale token/revision/nonce panels cannot submit. Submission locks before calling the API because a host request may synchronously deliver its next offer; a replacement panel must remain usable. Rejected local calls restore original control limits. Accepted asynchronous submissions remain pending until the authoritative offer changes.

Preparation displays catalog prices/ranks and disabled unaffordable/maxed options. It opens during grace/preparation/break or when root supplies native `status.canShop:true`; root's purchase authority additionally proves actual console access. Combat closes a field preparation panel when access is gone, while native aboard-console availability survives grace expiry. There is no anywhere-purchase shortcut.

Inventory reads the existing native `inventory.entries()` for weapons/items and `build.perks` for temporary modules/branches, with real shared perk names. It does not move/equip/drop native stock. Root must route the native inventory key to the mode panel for pointer-locked play; stable Inventory/Upgrade launch controls also exist on the status strip when a cursor is available.

Core skill names/descriptions/branches and new shop copy are locally translated EN/TR/RU. Generic labels stay in the local text table to avoid overriding normal-mode dictionary strings. Only unique Endless title/note/hint keys register globally. Processed CC0 ViNk art supplies the weapon/armor/health branch icons at36px with nearest sampling, and frame/panel borders use CSS nine-slice without filling their centers. Inventory uses existing glyphs. Asset provenance and intake are root-owned; this UI references only frame, panel, weapon, armor and health PNGs.

## Native verification

`tools/harness/endless41_ui.test.mjs` runs actual CRTMenu.setItems/activate, UI.screen_host/START, drawArtMenu item rectangles and the installed panel API against explicit DOM/canvas fixtures. Red probes reproduced missing mode entry/preselection, wrong art-menu column, synchronous next-offer locking and maxed-pool refusal before their corrections.

Coverage includes three-card before→after presentation, remaining choices produced by the actual native capped pool, stale clicks, repeated pending submission, synchronous next-offer self-delivery, rejection restoration, reroll/skip/ban controls, local affordability, combat/console shop access, actual native item/build display, TR/RU skill names, normal-mode status absence and resource/panel disposal. Native camera/world/cargo/network state is outside this UI fixture.

Focused bundled Node24 checks:

```
tools/harness/run_all.mjs -j 2 endless41_ui fleet30 fastmenu ui3
4/4 passed
```

The canvas fixture verifies menu interaction rectangles, not actual pixels. The CSS deliberately fits960px and supportsTR/RU, but rendered width, focus appearance, reference resemblance, pointer-lock inventory discovery and human usability require root's fresh silent browser evidence. No browser/Git/full suite run by this owner; final combined build/full regression/publication belongs to root.

## Cost and ownership

Files: narrow `src/ui/ui.js`, `crtmenu.js`, `artdir_menu.js`; new `endless41.js`, `endless41_style.js`, `endless41_text.js`; focused `endless41_ui.test.mjs` and this report. One style/status per UI instance; existing panel nodes are replaced only for changed authoritative offers/shop state. No intervals, async icon renderer, listeners on native transport, extra lights or geometry. All owned style/status/panel nodes are released by disposal. Status text changes only when displayed rounded values/language change; inventory/upgrade controls remain stable across clock updates.
