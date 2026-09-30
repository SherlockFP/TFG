# Wave 13 — menu polish

Small CSS-only pass in `src/ui/artdir.css`, scoped to `.menu-root .menu-frame` while art direction is enabled. Preserves the 3D CRT room, canvas menu, layout, amber equipment identity and all menu actions.

Main-menu forms now use quieter plain rectangular tabs, a consistent input height, simpler section rules, tighter label spacing and clearer selected/focused controls. Removed decorative list numbering and form watermark; the existing equipment stamp sits straight and recedes behind the page title. Muted text uses an opaque warm grey for readability; mobile tabs wrap and the accessory stamp hides on small screens.

No changes to gameplay/crew/vendor panels, game content, or navigation behavior. No additional automated tests for this reversible style change. Root's build and scheduled shared browser QA validate CSS parsing and appearance; screenshots are pending at implementation handoff.

Baseline UI glyph audit follow-up: map the Service Record's `★` card icon to the existing monochrome `star` pictogram in `src/ui/glyphs.js`. `ui2_glyphs.test.mjs` passes all 48 pictograms. Inline replacement is unchanged, so prestige totals retain their textual symbols and numeric counts. Inspected QA's `04-fleet-panel.png`; it contains the world HUD with the panel closed, so it cannot establish the visual quality of the main-menu form changes.
