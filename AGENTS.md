# TFG — current agent map

Updated 2026-10-03, Wave32 asset intake/plan (runtime baseline Wave31). This is the current entry point; historical Windows,
Claude branch/model, no-test and automatic merge/push instructions are retired.
Their full prior text is preserved in [the historical snapshot](docs/history/AGENTS-pre-wave25.md).
Current user/session instructions take precedence. Inspect Git for the publication SHA.

## Start here

1. Read [current assets and creature plan](docs/wave32/README.md),
   [runtime work and evidence](docs/wave31/README.md), then
   [Gauntlet procedure](docs/GAUNTLET.md) and [current critique](docs/CRITIQUE.md).
2. Read [identity/art direction](docs/THEME.md) and the relevant module report.
   [Research](docs/wave25/RESEARCH.md) connects genre design and current agent engineering.
3. Check `git status`, current branch/SHA and existing user changes before editing.
   Workspace: `/workspace/TFG`; use `rg`/`rg --files` to find real owners and callers.
4. For a continuation, consult [CONTINUE](docs/session/CONTINUE.md).
   Wave reports are historical evidence, not today's passing result.

## Product and owner

TFG / TOTALLY FUCKED GAME is a browser co-op PSX horror scavenging game: a maintenance
crew recovers lost content for The Algorithm's Engagement Quota. Its dead-internet
identity should change crew decisions, routes and consequences. Normal horror is the priority. Dead Letter development is cancelled; new entries
are retired while active legacy sessions retain safe checkpoint return.

The owner writes Turkish, wants autonomous implementation, multi-agent work and
main commit/push in this session. Root handles combined Git after verification.
Continue already-authorized work without redundant confirmation. Reassess scope
when future user instructions change it; do not infer authority for unrelated actions.
Prefer a few observed quality improvements over another mandatory meter/catalogue.
Give concise progress updates and keep scores/evidence honest.
The owner's current experience baseline is **1/10**. Historical source-review
scores do not override it; native test counts alone do not raise the fun rating.

Art: faceted, matte PSX industrial workers/CRT/archive props. Dirty ivory, charcoal,
steel, faded workwear and restrained ochre/amber details. Avoid broad green emissive
surfaces and glossy PBR toys. Read naming/art details in THEME before modelling.
Internal IDs, `kefal.*` saves and `window.KefalAPI` remain stable.

## Run and verify

```bash
source /workspace/.tfg-tools/activate.sh   # Node22
npm run dev -- --port 5174               # first inspect the existing owned server
npm test -- -j 4 deadletter lab24         # filename-substring filters; adapt to change
npm run build
git diff --check
```

HMR is off; browser checks require fresh pages. Install dependencies only if missing.
Use focused native checks, then a final full suite for shared lifecycle/host contracts.
One browser owner holds `/tmp/tfg-browser.lock`; do not share CPU-heavy suites with QA.
Setup, native integration, guided input, human play and hardware profiling are
different evidence. See GAUNTLET for single simulation clock, source freeze,
normal range/LOS input, failure capture and exact first-floor acceptance.

## Runtime map

| Path | Owner / responsibility |
| --- | --- |
| `src/main.js`, `src/game/game.js` | Boot, input/render clocks, orchestration, map lifecycle. |
| `src/game/host.js`, `src/game/actions.js` | Authoritative requests and native player actions. |
| `src/net/session.js`, `lobby.js`, `transport.js` | Host/peer delivery, protocol and transport. |
| `src/world/facility.js`, `interiors/`, `nav.js` | Seeded layout, furniture, Rapier geometry and paths. |
| `src/physics/physics.js`, `src/entities/` | Native bodies, controller, custody and creature simulation. |
| `src/game/deadletter24*.js` | Optional temporary combat, cards, checkpoint and owned actors. |
| `src/game/descent21*.js`, `brlevels.js`, `liminal26.js` | Normal certified depth travel, Backrooms lifecycle and bounded stale-sound receipts. |
| `src/ui/`, `src/models/`, `src/audio/` | Presentation, faceted models and audio; follow actual callers. |
| `src/core/save.js`, `rng.js`, `i18n.js` | Save compatibility, deterministic RNG and EN/TR/RU. |
| `tools/harness/`, `tools/sim/` | Native behavior/boundary regressions and labelled simulations. |

## Invariants

- Keep one native cargo/wallet/quota/clock/profile identity; preserve old saves.
- Host owns world, economy, creatures and admission. Peers own native player state.
  `net.broadcast` self-delivers synchronously; `send` does not. Test real callbacks.
- Mutate native run state through its existing lifecycle. Check map unload/rebuild,
  host migration, delayed/stale messages and once-only resource disposal.
- World agreement uses `src/core/rng.js`; no `Math.random` for shared generation.
  Host timers use `game.later` so they stop with the session.
- Keep constant light counts and do not toggle `light.visible`; use LightPool.
- Physical access needs native floor/capsule/range/LOS proof after query refresh.
  Never fix a broken route with arbitrary teleport, `noLos` or injected outcomes.
- Assign file/function ownership in the shared checkout. Root alone stages/commits/
  pushes; no automatic Markdown union or retired `tools/lead/merge_agent.sh`.
- Main tracks `origin`; pushes trigger the configured Render deployment. Never push
  historical `master`/raw downloads. Only processed/licensed assets belong in Git.

## Additional references

[Handoff](docs/HANDOFF.md), [bugs](docs/BUGS.md), [text style](docs/wave8/studio_style.md),
[audio audit](docs/AUDIO_AUDIT.md), [mods](docs/LC_MODS.md), [asset credits](CREDITS.md).
Current PLAYTEST/REVIEW documents own result limits; test or feature counts do not
establish fun, retention, Internet reliability or representative hardware FPS.
