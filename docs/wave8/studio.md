# Wave 8: studio (authorship polish)

Owner: "the game feels too AI-made; make it feel like a real studio shipped it." This pass hunts the tells that give a
generated game away and fixes the ones that are cheap and safe. Rules live in `docs/wave8/studio_style.md`.

## What changed

1. **Style guide + glossary** (`studio_style.md`): three voices (Algorithm / Company / UI), one name per thing, casing, number
   format, key-hint format, handmade checklist.
2. **Item copy**: `src/game/studio.js` + `studio_text.js` give 95 items a one-line tip (EN/TR/RU) that had none: all scrap,
   big valuables, fish, creature drops and the starter gear the store showed with an empty description. Only empty tips are
   filled, so anything a module wrote itself wins. Shows in the inventory tooltip and on the store card.
3. **Em-dash purge**: 152 player-facing English strings (and their TR/RU dictionary keys) used " — "; now " - " or a colon. Cyrillic
   values keep their own punctuation.
4. **Naming fixes** (EN, TR/RU in sync where the meaning moved): "profit quota" -> "quota" (terminal, fired screen, achievements),
   "fired" -> "deplatformed" (six strings + dossier label), "fishing rod" -> "Phishing Rod", "teammate" -> "crewmate",
   "UPLINK VAN" -> "Uplink Van", "Your credits" -> "Credits", "player(s)" / "item(s)" / "day(s)" removed.
5. **Exclamation and stock-phrase cuts**: about 25 toasts and announcements (Connected, Vault unlocked, Table meal, Cake Day,
   Bounty complete, the deadline messages, "Yippee!", "Hop in!") lost the decorative "!"; the two near-duplicate deadline
   messages now say different things (one names the moon the autopilot switched to). Alarms keep theirs.
6. **HOW TO PLAY was half untranslated**: the CONTROLS, THE JOB and PROGRESSION paragraphs had been edited in `ui.js` without their
   TR/RU dictionary entries. All five changed paragraphs were rewritten (sharper EN) and translated (TR, RU).
7. **Numbers**: the day summary, sale, quota-met, save-slot and terminal quota/credits lines now use one format (`▮1,240`);
   before, half showed `▮1240` and the count-up switched format at the end.
8. **Key hints**: Hiring Day objectives and world signs used `(E)` next to `[E]` prompts; all are `[E]` now.
9. **Emoji leftovers**: achievement cards and banners rendered colour emoji; they use the pictogram set now (10 new glyphs in
   `ui/glyphs.js`, emoji lookup also tolerates the variation selector). Sound-hint and VOICE CHAT header lost their emoji.
10. **Handmade touches**: six new pixel posters (`poster_delete`, `poster_grave`, `poster_noref`, `poster_hr`, `poster_wash`,
    `poster_lost`; faction slogans from LORE.md plus HR/janitorial in-jokes) added to the office, server farm, backrooms, sewer,
    hospital and default facility poster pools (previously 3 to 6 posters repeated per interior). First-run nicknames are a job
    title plus a number (`Janitor482`, `Lurker117`) instead of `Employee482`. `humanizeId()` replaces raw data ids as the
    fallback name in `itemDef()`, the crafting and repair panels. A duplicated phone line in the menu cell was replaced.
11. **Score/grade quip**: "The Algorithm is aroused." -> "The Algorithm is delighted. Be worried."

Net messages: none. Shared-file edits: `game.js` (1 import + 1 `useModule('studio', ...)`), tiny literal edits elsewhere.

## Tests / checks

- `node tools/sim/studio.test.mjs`: tips are real items, short, no "!" or em dash, translated; apply is idempotent and
  never overwrites; TR dictionary has no em-dash keys or retired wording; default handles pass the nickname rules; id fallback.
- `npm run build` OK; `node tools/i18n_audit.mjs`: MISSING TR/RU and dict gaps unchanged (373 / 370 / 450 / 166).
- Existing suites re-run: onboard, profile, ui2_glyphs, ui3, guide, cycle2_i18n, br_i18n, polish4, wallet, cycle3, story_host,
  mapart_art, links, eggs_install, daily_svc, homeworld_decor, a11y: all pass.
- **Not verified in a browser** (shared lock; QA to batch): the six posters' pixel layout at 64x96 (text was measured by
  character count, not seen), pictogram legibility on the achievement cards, the `[E]` objective wording on the HUD.

## Placeholder / primitive models for a later art pass

Found by reading code, not by looking at them (no browser run):

- `tool_axe`, `tool_pickaxe` (`game/harvest.js` `toolModel()`): a cylinder handle and one box blade. Flagged in CRITIQUE already.
- `unknownItem()` in `models/items.js`: a 0.2 m grey box for any id without a builder (should never show; base items all have one).
- `lockpick2`: the titanium lockpick reuses the plain `lockpick` model.
- Module-made item models built from primitives and never given a hand-made pass: forge shards (`createForgeItemModel`),
  crafting components (`createComponentModel`), deployable kits, Voyage relics (`vy_*`), survival potions (`svItemModels`).
- Pixel decal posters are 64x96 and read as flat stickers up close; a hand-painted set would sell the workplace better.

## Known gaps / next

- Other writing tells not touched: Algorithm lines repeat "content / engagement / trend" in almost every sentence (running
  gag, but tiring over a long run); several `guide_data.js` hints explain the joke after making it.
- TR/RU: the unchanged long tail (about 370 keys per language, mostly a11y and cycle3 strings) is still English in the audit.
- The lore and Hiring Day copy already followed the voice split and was left alone on purpose.
- `Employee` is still the fallback nick in dozens of `playerName?.(id) || 'Employee'` call sites (rarely visible).
