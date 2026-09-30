# TFG — "devam" yazılınca ne yapılacak (next AI, read this first)

Last updated: 2026-09-29, end of wave 8. Main = `6c29324` or later. Written by the lead AI (game director).

## 0. 60-second context
- Game: **TFG** — browser co-op horror/extraction (Vite + three.js + Rapier + Trystero P2P). Identity: a company crew surviving inside the live stream of **The Algorithm** (an AI that watches, learns, rewrites the game).
- Owner writes **Turkish** → answer in Turkish, short and concrete. Wants fast iterations, a premium feel, "not an LC clone", "not AI-made/soulless". Current owner score: **4/10 → target 7/10**. Director critique scored 4.5/10 (`docs/CRITIQUE_W8.md`).
- Full owner ↔ lead conversation: **`docs/session/conversation_log.md`** (all 90 owner requests, in order). Read the last ~30 owner messages to feel the tone and priorities.
- Architecture, rules, testing, workflow: **`docs/HANDOFF.md`** (§4-§6, §7.2) + `AGENTS.md` §0, §7. Lead tooling: `tools/lead/` (README).

## 1. Owner rules (binding)
- Push everything to **main** too: `git push origin claude/focused-hawking-32j4um && git push origin claude/focused-hawking-32j4um:main` (Render auto-deploys main). No PRs unless asked.
- Use **Sonnet sub-agents** (`tfg-builder` high effort for features, `tfg-fixer` medium for small fixes); Opus only for lead work / final review. **Quota-sensitive**: each agent max **1 new test file** and **1 headless browser run**; skip browser runs when the lock queue is busy (`flock /tmp/tfg-browser.lock`, 4 cores, swiftshader = slow).
- Never `rm -rf node_modules`; never `pkill` by a pattern (kill by PID).
- No anti-cheat. Algorithm subtitles already exist.
- Commit trailers: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` + the session trailer your harness gives you.

## 2. Owner decisions made in wave 8 (do not re-ask)
| Topic | Decision |
|---|---|
| Core verb | **Dodge the camera / cut the feed** (`src/game/feedcams.js`) — everything should tie into it |
| Death | **Downed + revive** (`downed.js`); instant death only in Hard |
| Side systems | **Gradual unlock** via ship Hub door (`hubgate.js`, quota 1-5 ladder, "Unlock everything" toggle) |
| Session length | Campaign default + **Quick Shift** 15-min mode button (lead's call) |
| Death spectating | Dead players only spectate (echo ghost mode disabled in `fun.js`) |
| Morning Rules vote | Rare (~20 %, never day 1-2 / Quick Shift) |
| Loot | Indoor scrap count ×0.6 (`progression.js`) |
| Theme | Doesn't have to be Lethal Company themed — adventure, other places, different goals per map are welcome |

## 3. Progress stages (where we are)
- **Waves 1-7:** ~70 modules (see HANDOFF §7, §7.1).
- **Wave 8 (done, merged, node-tested + build; almost NOT seen in a browser):** balance_rules, loot ×0.6, lcmods (+31 cosmetics, 6 mods), nvgear (night vision + battery + ship charger), chess seats/captures, geomfix, movefix (bobbing root cause + mantle/vault), mapmods (PoE affixes, `ATLAS`), mining, arcade2 (4 arcade games), facjobs (8 facility jobs + 3 layouts), studio (text/voice pass), declutter (HUD density, hold-Tab status), atmos (sound mix + ambience), menufix (menu look — verified), worlds3 (wrong door → Backrooms + 6 worlds), repomaps (4 R.E.P.O.-style themed interiors), lcmonsters (Blood Witch, Lantern Keeper, Trick-or-Treat, cursed scrap, Rift Stalker, Loot Mimic, Masked), crdirector (L4D-style director + telegraphs + caps on swarms/siege/horror), resto (homeworld alien diner tycoon), downed, hubgate + Quick Shift, feedcams, labyrinths (metro, greenhouse, prison, tower + hero rooms), perf3, uifix (Algorithm ticker, chess HUD), soul (per-moon palettes, story beats, ship details, moments). Each has `docs/wave8/<name>.md` with "not verified" lists.
- **Plan toward 7/10** (`docs/CRITIQUE_W8.md` §4): 8A "Clear the screen" (mostly done) → 8B "Fill the space, give it colour" (soul/labyrinths/repomaps started) → 8C "The verb" + real 2-player playtest (feedcams built, untuned).

## 4. When the owner types "devam" — do this, in order
1. **Landing hitch (biggest stutter):** landing blocks 3-5 s (`hostLever` + `hostFinishLanding`), first ticks spike 60-230 ms. Spread the build over frames and pre-warm shaders with `renderer.compile`. See `docs/wave8/perf3.md`. Also find the `Oscillator.frequency.value 21096` warning spam (out-of-range frequency set somewhere in audio).
2. **Fall-out-of-map check:** does the player fall into the Backrooms within ~10 s of landing? (seen once by the declutter agent; `/tmp/qa/fall.js` may be gone — rewrite: land, stand still 10 s, assert y > -5). Fix if real.
3. **geomfix:** 2 blocked doors in the `museum` theme (`node tools/harness/geomfix.test.mjs`).
4. **One batched browser pass** of wave 8 (screenshots at 1280×720): HUD docks not overlapping, Algorithm ticker, feedcams cones, downed pose/revive ring, hub door + unlock card, Quick Shift end card, resto plot, new labyrinths (metro/greenhouse/prison/tower), themed interiors, lcmonsters models, soul palettes (Dialup may be too orange, 404 too dark), night-vision look. Fix what's broken with small `tfg-fixer` agents.
5. **Economy/balance pass:** new income from resto, mining, arcade, facjobs, feedcams tax, mapmods → run `node tools/sim/economy.mjs --modes-only --runs 100`, tune quota/prices/items; keep early game comfortable.
6. **feedcams polish:** junction-box cable cut, outdoor patrol drones, tune lock time/tax with a real 2-player session.
7. **Known gaps to pick from** (all in `docs/wave8/*.md`): downed — creatures don't drag, Medic has no faster revive, heal items don't revive; resto — only stove minigame, boulders may poke through the diner floor; labyrinths — prison gate may close on a doorway player, elevator late-join state; mapmods — Flooded/Barricaded not implemented; key conflicts Y (RPS vs role skill) and B/M (vote vs emote vs trade) in `docs/wave8/declutter.md`; placeholder models listed in `docs/wave8/studio.md`.
8. After each chunk: update `AGENTS.md` §5/§6, `docs/CRITIQUE.md`, this file (§3/§4) and `docs/HANDOFF.md` §7.x; push to both branches.

## 5. How to work (what worked)
- Add `// [import:X]` / `// [slot:X]` placeholders in `src/game/game.js`, commit + push, **then** spawn worktree agents (`isolation: worktree`) with a prompt that says: read `tools/lead/agent_rules.txt` + `agent_test_rules.txt`, commit but don't push.
- Merge with `tools/lead/merge_agent.sh <branch> <name> <tests…>` (tests relative to `tools/harness`, e.g. `../sim/a11y.test.mjs`). On `CODE CONFLICT`, fix by hand, `git add`, re-run with branch `""`.
- Tell agents to skip the browser if more than ~2 are waiting on the lock; batch browser checks in one QA agent.

## 6. Update after the night loop (2026-09-30 morning)
- Everything from the night is in `docs/session/NIGHT_LOG.md` (Turkish morning summary on top) and `docs/wave8/*.md`. Latest creative-director review: `docs/REVIEW_W8_NIGHT.md` (5.0 paper / 4.5 screen); QA night 2 scored **5.5/10** (`docs/wave8/qa_night2.md`).
- Rule in force (director, owner default): **no new systems** for now — polish, merge, fill, fix.
- Done since §4 was written: landing hitch (landQ + prewarm + warm set), fall check passed, museum doors, browser pass ×2, economy pass, MP audit (141 checks) + two-tab MP script 17/17, one-goal HUD, route board + 3 hero moons, curated creature pools, camera verb on the path, carry comedy, highlights clip, expeditions (3 adventure moons), themed bosses/loot, glove/torch viewmodel, 64 sounds.
- **Next, in order:** (1) owner's answers in `docs/session/QUESTIONS.md`; (2) a real 2-person WebRTC session (nothing replaces it); (3) expedition moons on a real GPU (barge/roof still read weakly); (4) creature eye tells + bulky carry look + tarp look in a browser; (5) keep trimming: `docs/REVIEW_W8_NIGHT.md` §3 lists what to cut/merge/hide.
- Tooling gotchas learned tonight: vite ignores edits under `.claude/` (restart it after edits); use `tools/harness/qa_night2_lib.js` (throttled renders, `gl.finish()`) or headless tabs OOM; never `cd` into agent worktrees from the lead shell (it changes the session cwd) — use `git -C`; prune merged worktrees when agents stop starting ("Could not read the repository git config").
