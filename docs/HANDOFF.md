# TFG — HANDOFF FOR THE NEXT AI / DEVELOPER (read this first)

> **Latest cloud state — wave 17, 2026-09-30.** Wave 16 is published on main as `0aad5fa`. The owner requested content and quality work toward 8–8.5, with the earlier multi-agent/main-push authorization still active. Read [wave17/README.md](wave17/README.md), [PLAYTEST.md](wave17/PLAYTEST.md), [REVIEW.md](wave17/REVIEW.md) and current critique. Use `/workspace/TFG` with `/workspace/.tfg-tools/activate.sh`. Root owns final Git publication; check history/remote for the exact SHA. Historical Windows/model/branch directions below remain historical.

Wave 17 adds ordinary-expedition drone repair and quiet uplink jobs, a real city parcel that crew can pass between moving NPCs, and two short physical workshop calibration games. All reuse existing custody and reward ledgers. Drone help trades 35 credits for slower autonomous active-field work; it cannot collect the reward. Courier pay replaces the existing daily survey reward. Workshop failure preserves the commissioned batch; host-validated steps alone can prepare it. Bagged salvage now explains recovery in its immediate native feed, with real release/re-pickup and danger behavior. Escape shelters and marked routes validate floor/body clearance, and Warden capsule sweeps prevent slipping through thin panels. Planning is spread across updates and unchanged route batches are reused. Full **211/211 regression suites passed in 331s**; relevant inventory/readability/center-card checks and the final build passed after a last stylesheet correction keeping calibration above case cards. Current browser evidence records actual inputs separately from labelled setup; human enjoyment, Internet latency, headphone combat feedback and hardware frame times remain unmeasured.

> **Latest cloud state — wave 16, 2026-09-30.** Wave 15 is published on main as `8231122`. The owner's subsequent **devam** continues the authorized multi-agent development and main publication. Use `/workspace/TFG`, activate `/workspace/.tfg-tools/activate.sh`, and start with [wave16/README.md](wave16/README.md), [PLAYTEST.md](wave16/PLAYTEST.md) and [REVIEW.md](wave16/REVIEW.md). Root handles Git after validation; inspect history/remote for the exact final publication SHA. Historical Windows/model/branch directions below remain historical.

Wave 16 addresses observed first-session friction: the descent card reserves health space through its real fade and yields to danger; confirmed salvage explains bag versus hotbar and actual bindings; beginner loaners cover missing charged lights; the intake tray is brighter and its receipt fits beside the counter. Focused actual keyboard/mouse QA reproduced a native Warden missed strike leaving the pursuit active in rest/watch. Misses now resume legitimate chase, with a failing-before/passing-after actual HostCreature/Rapier regression. The optional Warden now participates in shared HUD attention on host/peers, and routine intercom captions defer without blocking urgent danger captions behind teaching lines. The final build and relevant regressions pass. Browser fixtures, ordinary inputs, genuine AI results and remaining human/hardware gaps are distinguished in current wave docs.

> **Latest cloud state — wave 15, 2026-09-30.** Use `/workspace/TFG` and `/workspace/.tfg-tools/activate.sh`. The old Windows path, Claude branch/model choices and assumed publication below are historical. At the end of wave14, waves13–14 were local only. The user now explicitly requested another proper gauntlet and **commit/push to main**, including those earlier changes. Root owns publication after checks; use Git history/remote for its exact state. Start with [wave15/README.md](wave15/README.md), [wave15/PLAYTEST.md](wave15/PLAYTEST.md) and [wave15/REVIEW.md](wave15/REVIEW.md).

Wave15 fixes actual delivery placement/Tools tab/replayed orders; fleet role/cost clarity, distributed crew spawn and room cargo loss during hull swaps; archive intake/receipt processing; actual reachable Warden starts and reacquisition; arrival/route cards/chat during danger; remote-lamp false tutorial completion; and saved extraction-credit omission. Automatic orbit GPU cleanup budgets tree traversal and disposal across frames, retaining live/shared resources and cancelling on a new map. Module docs describe actual generated-map/Rapier and host-event evidence. Coordinated browser QA owns natural first-shift movement and labels any funded/teleported encounter fixtures separately. Keep current single ledgers, gradual unlocks and installer order.

Wave15 browser findings also include exit targets occluded by their own solid portal panel and populated terminal commands intercepted by the route board. Approach-side exit targets preserve unrelated-wall checks; routeboard capture now lets the original terminal input submit nonempty commands. **206/206 suites passed in 344 seconds**, followed by 24 portal approaches with negative controls and 145 routeboard checks. Final production build passed. See wave15 PLAYTEST/REVIEW for browser outcomes and the limits of the quality assessment.

Physical workshop bays now calibrate and hand over parcels using the existing production ledger. Casino outcomes appear on shared dealer boards. Dock/company landmarks and localized service routes strengthen navigation. An optional archive cell/guardian/cache mission uses the existing boss and carry/sell systems. Signal Warden pursuit adds screening alcoves and free look while hiding. Danger-aware rewards/tutorial polish reduce competing HUD text. Bugs found by the browser gauntlet include hidden-map workshop transforms, stale Rapier shelter queries and absent dock radar exits; each has an actual-module regression. The explicit `--relay` economy simulation models actual new ledgers and costs with disclosed participation assumptions. Full regression: 205/205 passed; later edits receive targeted checks and a final build. Real human combat/audio, Internet multiplayer and representative GPU frame times remain separate work.

Last updated: 2026-09-29 (end of wave 4 + ship interior fix). Written by the lead AI session.

---

> **Next AI: when the owner types "devam", start with `docs/session/CONTINUE.md`.** Full conversation: `docs/session/conversation_log.md`.

## 1. What this game is (60 seconds)

**TFG ("TOTALLY FUCKED GAME")** is a browser, co-op (1-4 players, P2P) first-person horror / extraction game with RPG progression.
Identity (binding, see `docs/MASTERPLAN.md` §21):

> A company crew tries to survive inside the live stream of **The Algorithm** — an AI that watches you, learns your habits and rewrites the game against you every day.

- Core loop: land on a moon → explore a procedural facility/outdoors → loot scrap → survive creatures (sound, light, traps) → get back to the ship → sell at HQ → meet the quota → upgrade → sector bosses.
- Pillars: **being watched** (The Algorithm), **panic together** (co-op), **risk → loot**.
- Tone: corporate horror + dark humour. Look: PSX low-poly + "company-issued equipment" UI (hard edges, hazard tape, condensed font; no emoji, no soft glass cards).
- Started as a Lethal Company-like; the owner explicitly wants it to become **original** (not a clone).
- Planned next core direction (wave 6, `MASTERPLAN §26`): **Zone capture** — claim moon zones with beacons, fortify them with traps/turrets, earn capped passive income, defend them co-op against Algorithm counter-attacks (tycoon/strategy layer on top of extraction).

## 2. The owner

- Writes **Turkish**; answer in Turkish, short and concrete. Wants fast iterations, a premium-feeling, *fun* game, lots of original ideas.
- Very **quota/cost sensitive**: use **Sonnet 5.5** sub-agents for all work; **Opus only for one final review** at the end of a wave (`MASTERPLAN §25.11`). Keep browser playtests short and batched.
- Wants everything **pushed to `main`** (Render auto-deploys main). Work branch: `claude/focused-hawking-32j4um`; push to both (`git push origin <branch>:main`). Never create PRs unless asked.
- Commit trailer lines (keep): `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01AFt3mbxtTU1FfiT1N1A1YL` (or the current session's trailer from the harness).

## 3. Reading order (don't read everything — the repo is huge)

1. **This file.**
2. `docs/MASTERPLAN.md` **§21–§26** (identity, honest state review, original ideas, **wave 5 detailed plan §25**, zone-capture direction §26). Earlier sections are history/design pool.
3. `AGENTS.md` §0 (start-here checklist), §5.16–§5.18 (wave 4 modules + handoff notes), §7 Gotchas.
4. The doc of the module you touch: `docs/wave1..wave5/<module>.md` (each has "what / how to test / knobs / known gaps / NOT verified").
5. `docs/CRITIQUE.md` (running critique log), `docs/LORE.md` (The Algorithm, factions, tone).

## 4. Tech & architecture

- Vite + three.js + Rapier (physics) + Trystero (WebRTC P2P). No backend. `npm run dev`, `npm run build`. **No `npm test` script** — tests are individual node files.
- Entry: `src/main.js` → `src/game/game.js` (`Game` class). ~55 feature modules are wired in `game.js` with:
  - `// [import:X]` / `// [slot:X]` placeholders, replaced by `import { installX } from './X.js'` and `this.useModule('X', installX)`.
  - `useModule(name, fn)` stores the module API at `game[name]` and disposes it on destroy. **Never use a module name that is already a Game method/field** (wave 4 bug: `sfx` shadowed `game.sfx()` and broke all sounds — the module now lives at `game.cvoice`).
- Mod event bus: `game.mods.on(event, fn)` — `netReady`, `registerHandlers(H,g)`, `phase`, `update`, `stats`, `interactables`, `useItem`, `objectives(add,g,phase)`, `chat`, `mapLoaded`, … plus custom `tfg:*` events.
- Networking: **host-authoritative**. `game.net.on_(type, fn)` keeps ONE handler per type → every module uses its own prefixed message types (`c3req`, `s2msg`, `hr*`, `sv*`, …). `broadcast` also delivers to the sender. Fields added to `game.run` auto-sync via `broadcastRun`. Host migration exists (`src/game/hostmig.js`).
- Determinism: seeded RNG `src/core/rng.js` for all world generation (clients rebuild from seeds). Host timers: `game.later`.
- Rendering rules: **constant scene light count** (emissive materials / LightPool, never add THREE lights per object); merge static geometry; PSX vertex snap causes z-fighting on large coplanar quads (use the `flatLayer`/no-snap trick from `src/world/homeworld_map.js`).
- i18n: every player-facing string through `t()` / `tf()` (`src/core/i18n.js`) with **EN + TR + RU**. Audit: `node tools/i18n_audit.mjs`.
- UI: shared theme `src/ui/theme.css` / `theme.js`, glyphs `src/ui/glyphs.js`; use base classes documented in `docs/wave4/ui2.md`. Right-side HUD dock: `src/ui/dock.js hudDock()`.
- Ship layout: **`src/world/shiplayout.js` is the single authority** for every in-ship fixture; `tools/harness/ship2_overlap.test.mjs` must stay at 0 problems.

## 5. Testing

- Node tests: `tools/harness/*.test.mjs` (≈80 files) — run the ones for the modules you touch: `node tools/harness/<name>.test.mjs`. Sims: `tools/sim/balance.mjs`, `tools/sim/economy.mjs`.
- Build: `npm run build` must print `✓ built`.
- Browser (headless Chromium, swiftshader — slow!):
  `npx vite --port <P> --strictPort &` then
  `flock /tmp/tfg-browser.lock node tools/harness/headless.mjs --port <P> --script <body.js> --shot out.png --wait 3000`
  (`headless_shots.mjs` adds `window.__shot(name)`; `headless_menu.mjs` for the main menu; `mp2.mjs` two-tab LocalTransport MP). Scripts get `kefal.game`, `kefal.tick(n, dt, render)`.
  - **One shared lock, 4 CPU cores**: batch runs, keep them short; `smoke_land.js` needs ~900 s timeout now.
  - Worktrees under `.claude/` are excluded from Vite's file watcher → restart vite after edits there.
  - Ready-made but mostly **never-run** feature scripts: `tools/harness/wave4_*.js`.
- **Never `rm -rf node_modules`** (worktrees symlink the shared one). Never `pkill` by a pattern that matches your own shell.

## 6. Multi-agent workflow that worked (scripts + sub-agent rules are in `tools/lead/`, see its README)

1. Lead adds `[import:X]`/`[slot:X]` placeholders to `game.js`, commits and pushes **before** spawning agents; agents must branch from the **current** HEAD.
2. Spawn Sonnet agents with `isolation: worktree`, one module each, a shared rules file (module pattern, net prefix, i18n, UI style, budget, doc + AGENTS/CRITIQUE entry, commit but don't push).
3. Merge each finished branch: `git merge --no-edit <branch>`; `.md` conflicts → union both sides; `game.js` slot conflicts → keep HEAD, drop the agent's import/useModule into its placeholder; then `node --check` changed files, the module's tests + neighbours, `npm run build`, push branch + main.
4. Lead does one batched browser check after merging.

## 7. Current state (honest)

- **Merged & on main:** waves 1–4 (≈55 modules): inventory/tiers, shop/weapons, crafting, magic, roles + skill tree, lore/Algorithm, horde, worldx, backrooms, combat, siege, anomaly, i18n, forge, menu room, music, durability, mirror, grenades, trade, profile, fpbody, maps2, food, homeworld + homeworld2 (factory/waves/rooms/ghost raids), pets, cycle/cycle2/cycle3 (sectors, bosses, gates, trophies, elevator), shipyard + ship2 (Mini-Skeld ship, hull repair, roof turrets), worlds2, net robustness + host migration, guide (Algorithm tips + tutorial), cosm5 (59 cosmetics), polish4, daily rewards + season, arcade (chess/dama/carnival/RPS), social hub/DMs, maps5 (2 moons, 3 labyrinths), stealth (sneak, noise, Listener), eggs (easter eggs), sfx (creature voices, sound packs), horror (traps, zombies, mansion, chalk, fake closet), survival (foraging, farming, cooking, storage, hunger), voyage (random moons, missions, warps), ui2 (theme), ship interior fix.
- **Verified:** all node suites + build; browser: boot + landing with all modules (0 page errors), core single-player loop (checkup), ship interior tour, viewmodel, chess overlay, UI screenshots.
- **NOT verified:** almost every wave-4 feature in a real browser; **nothing tested with 2 real players over WebRTC**; balance numbers are paper values.
- **Known issues:** see `MASTERPLAN §22` + `§25.12` (zombies invisible in some contexts), `AGENTS.md §5.17` (mirror timer/compass/LIVE banner/VHS overlaps, GPU geometry growth per landing), `docs/wave4/*.md` "not verified" lists.

### 7.1 Update — waves 5-6 (2026-09-29, later)
Merged to main (all node-tested + build; almost none seen in a browser yet — a QA agent is running `docs/wave6/qa_pass.md`):
harvest2 (hit-to-harvest), lockpick2 (tiered fast lockpicking), stairs (shared ramp stairs), algo1 (Algorithm learns you + morning vote + LIVE viewers), chess3d, zones v1 + zones2 (zone capture: interior trap wings, walls/gates, extractor, raider flow fields, ship CRT map), aimchase (telegraphed NPC aim + escapable chases), shipdeck (ship upper deck Mk I-III), hardmode (Casual/Standard/Hard), onboard (Hiring Day start + staged unlocks), ui3 (HUD overlaps + panel flattening), unify (defense_core, mazegen, consumables, wallet = Credits + Clout), fixes (flaky tests, hardmode gaps, algo1 sync), story (Company vs Algorithm allegiance, patron jobs, 3 acts + 3 endings, weekly trend creature).
In progress at time of writing: zfixperf (zombie visibility, leaks, draw calls), algo2 (hype rewards, ghost replays, glitch exploits), roledays (§23.8), home3 (original homeworld look), mapart (original moon signature layer), QA browser pass.
Tooling: `.claude/agents/tfg-fixer.md` (Sonnet, medium effort) for small fixes; `tfg-builder` is Sonnet high effort. rtk (token saver) may be installed as a Bash hook — if plain `git` is blocked in a worktree, use `/usr/bin/git`.

### 7.2 Update — wave 8 (2026-09-29, end of session)
Owner decisions (binding): core verb = **dodge the camera / cut the feed** (feedcams); **downed + revive** instead of instant death (instakills only in Hard); side systems **unlock gradually** via the ship Hub door (hubgate ladder q1-q5, "Unlock everything" toggle); campaign stays default + **Quick Shift** 15-min mode in the main menu; dead players only spectate (echo ghost mode off); morning vote rare (~20 %, never days 1-2).
Merged to main (node-tested + build; almost nothing seen in a browser): balance_rules, loot x0.6, lcmods (+31 cosmetics), nvgear, chess seats, geomfix, movefix (bobbing root cause + mantle/vault), mapmods (PoE affixes, ATLAS), mining, arcade2, facjobs (8 facility jobs + atrium/ring/catacomb), studio, declutter (HUD density, hold-Tab status, docklayout), atmos (mix policy + ambience beds), menufix (menu look verified in headless), worlds3 (wrong door → Backrooms + 6 worlds, facility size classes), repomaps (4 themed interiors), lcmonsters (witch, keeper, trick-or-treat, cursed scrap, rift stalker, loot mimic, Masked), crdirector (threat budget + telegraphs + caps on swarms/siege/horror), resto (homeworld diner tycoon), downed, hubgate, feedcams, labyrinths (metro, greenhouse, prison, tower + hero rooms), perf3, uifix, soul (palettes, story beats, ship details, moments). Critique: docs/CRITIQUE_W8.md (4.5/10 + plan 8A-8C).
**Next, in order:** (1) landing hitch 3-5 s (spread hostLever/hostFinishLanding over frames, renderer.compile pre-warm) — biggest stutter; (2) headless check: player falling out of the map after landing (/tmp/qa/fall.js was never finished); (3) geomfix: 2 blocked doors in the museum theme; (4) one batched browser pass of wave 8 (docs/wave8/*.md "not verified"); (5) economy/quota/item balance pass over all new income (resto, mining, arcade, facjobs, feedcams tax) with tools/sim/economy.mjs; (6) a real 2-player session.

## 8. What to do next

Follow **`MASTERPLAN §25` (wave 5)** in order — robustness before new content:
1. Batched browser test of all `wave4_*.js` scripts → bug list → small Sonnet fix agents.
2. Onboarding "hiring day" start (§25.1), 3D chess (§25.2), tiered fast lockpick (§25.3), harder mechanics with a casual toggle (§25.4), hit-to-harvest (§25.8), telegraphed NPC aiming (§25.9), shared stairs fix + ship upper deck (§25.10), zombie visibility (§25.12), escapable-but-tense creatures (§25.13).
3. Unify duplicate systems (one defense core, one maze generator, one food rule, two currencies), UI pass, performance/leaks.
4. One final Opus review. Then wave 6 = zone capture (§26).

Update `AGENTS.md` (§5/§6), `docs/CRITIQUE.md` and the relevant `docs/waveN/*.md` after every chunk of work.

### Wave 13 cloud continuation — 2026-09-30
Extension installers arsenal13 and expedition13 follow industry13. New optional field/vault jobs, paid delayed robot helper, two gated weapons, twelve cosmetic silhouettes/four finishes and improved wardrobe/viewmodels are documented individually. Final CPU fixes include incremental GPU scanning, trolley allocation/idle-collider reduction and strict enemy swarm budget accounting. Current director critique is docs/CRITIQUE.md; hardware FPS, listening and human campaign balance remain unverified.
The current owner's requested direction is implemented in `docs/wave13/README.md`: Relay Dock start/fleet, staffed original exchange, enclosed chip casino, physical supply NPCs, commissioned production/robot surveys, cargo trolley, wandering alien citizens, rival surveyors, two labyrinth objectives, two readable threats, contextual noise waves, C/Escape and menu polish. Start with `docs/wave13/PLAYTEST.md` and `REVIEW.md` for bounded browser evidence/known gaps. This supersedes earlier “no new systems” roadmap. Use existing checkout `/workspace/TFG`, activate `/workspace/.tfg-tools/activate.sh`, npm run dev (pinned Node22.12.0); no worktrees required. Keep fleet after onboarding/onegoal; run.phase orbit can mean dock. Industry must count actual completed day/orbit transitions, not synchronous takeoff return values. Future focus: physical casino feedback, tactile manufacturing, deeper trolley ergonomics, HUD/card restraint and real human WebRTC/audio/GPU validation.
