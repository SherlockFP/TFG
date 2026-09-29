# Wave 4 - GUIDE (module `guide`): the Algorithm as advisor + a light first-landing tutorial

Owner ask (TR): "the terminal has many commands; the Algorithm link should occasionally say 'you can do this, have you tried that, here is how' - and put a small, not mandatory tutorial at the start."

`this.useModule('guide', installGuide)` (last slot in `game.js`) -> `game.guide`. Everything is local and per profile: **no net message types were added** (the `gd` prefix is unused).

## Files
| File | Role |
|---|---|
| `src/game/guide_data.js` | PURE DATA: 44 hand-written features (8 of them gated by `needs`: modules that may not exist in a branch, e.g. missions / survival / traps / stealth / ship2 / sfx / daily) (EN/TR/RU name, how-to, 1-2 Algorithm tips, context `when`, `cmds` / `panel` / `evt` / `keys` that mark the feature used), 7 tutorial steps, every UI string. Texts are `[en, tr, ru]` triples picked with `pick(arr, lang)` |
| `src/game/guide_core.js` | PURE LOGIC (node-tested): profile state, `markUsed`, `selectTip` (cooldown / grace / repeat gap / max shows / context / urgent), `untried`, tutorial engine (`tutEvent` ...), `findFeature`, `suggestCommand` ("did you mean"), `classifyPanel` |
| `src/game/guide.js` | install: usage tracking hooks, context flags, advisor loop, terminal commands, objectives hook, `game.guide` API |
| `tools/harness/guide.test.mjs` | node test (1900+ checks) |
| `tools/harness/wave4_guide.js` | headless script (module installed, terminal, tutorial from real events, advisor box, objectives) |

Shared edits (tiny): `game.js` import + slot (2 lines); `ui.js` Settings > Gameplay: checkbox "Algorithm tips" (`settings.guideTips`, default on) + button "Replay tutorial" + 2 import lines.

## What the player sees
* **Advisor.** Short creepy-corporate lines in the existing Algorithm intercom box (`game.lore.say`, typewriter + glitch + sfx), about things NOT tried yet, chosen by context:
  credits >= 120 in orbit -> `STORE`; unspent skill points -> `K`; skillbook in hand -> spells (hold C / hold V and say it); HP < 40% -> food / medkit; dark facility and no flashlight -> `STORE` / `F`;
  no role -> `ROLE`; full slots -> `I`; grenade in hand -> hold LMB; big mirror -> Mirror Dimension; quota met -> `CYCLE` / `CORE` / `KEYSTONE` / `RAID`; HQ + Clout -> Phish Dayi; found a log -> `LOGS`, ...
  Cooldown 150 s + 0-60 s jitter, nothing in the first 90 s of a session, never the same tip within 25 min, a tip is shown at most 3 times per profile, at most 14 tips per session (urgent = prio >= 9 ones may cut the cooldown after 45 s),
  never while a panel / terminal / minigame is open or the intercom is busy, off while the tutorial runs. Mute: Settings > Gameplay > Algorithm tips, or `GUIDE MUTE`.
* **Terminal.** `GUIDE` (alias `TIPS`, `ALGO TIPS`) lists "things you haven't tried" (relevant-now first, `<-` marks them) with a one-line how-to; `GUIDE <name|key|command>` gives the full how-to (`GUIDE K`, `GUIDE store`, `GUIDE Envanter`);
  `GUIDE ALL` is the full index with [x] for tried features, plus every other terminal command found at runtime (`mods.commands`, so future commands appear by themselves);
  `GUIDE MUTE|UNMUTE`; `TUTORIAL [STATUS|SKIP|RESTART]`; unknown words get "Did you mean STORE?"; `HELP` ends with "N things you have not tried. Type GUIDE."
  The lore module's own `ALGO` command still works (`ALGO`, `ALGO VOICE`), `ALGO TIPS|GUIDE|HELP` is added on top.
* **Tutorial** (7 objectives via the `objectives` hook, one shown at a time as `TUTORIAL n/7: ...` with a progress bar and a skip hint for the first 5 min): move + sprint + crouch, flashlight (buy at STORE, F), pick up scrap, open inventory (I), scan (RMB), bring scrap to the ship, sell at HQ.
  Steps complete by themselves in ANY order when the player does the thing (polled: distance / sprint / crouch, flashlight on, scrap in hands / in the ship, inventory panel, `game.scan` wrap, `run.sold` up). Each step becomes the current one with an Algorithm line.
  Never blocks anything. Finishing gives +60 XP +25 Clout. Veterans (days / quotas / sold / scrap / level >= 4) skip it silently on first load. Replay: Settings button or `TUTORIAL RESTART`. State: `profile.guide.tut`.
* **Usage tracking** (`profile.guide.used[id] = timestamp`): terminal words (`Terminal.exec` wrap), panels (`ui.openPanel` wrap + `classifyPanel`: inventory, forge, shop, shipyard, homeworld, trade, wardrobe, roles, contracts, record, crafting, tree, pets, daily), keys (P, MMB, Z/X/B, V, Enter/T while playing),
  `game.scan` / `game.startArcade` wraps, mods bus (`tfg:spell`, `tfg:role`, `tfg:musicStart`, `tfg:brlevel`, `useItem`, `itemState`), polling (flashlight, Black Market open, Mirror Dimension). Existing profiles are seeded from what they already did (passive nodes, role, pets, logs, kills, owned gear).

## Knobs
`guide_core.js`: `COOLDOWN_S` 150, `RELAX_GAP_S` 45, `START_GRACE_S` 90, `REPEAT_GAP_MS` 25 min, `MAX_SHOWN` 3, `MAX_PER_SESSION` 14. `guide_data.js`: add a feature = one `F(...)` call (+ a `when` flag from `CTX_FLAGS`; new flags are computed in `guide.js computeCtx`).
Debug: `kefal.game.guide.debug()`, `.tip()` (advise now), `.forceTip('store')`, `.untried()`, `.ctx()`, `.tutorial()`, `.tutEvent('scrap')`, `.restartTutorial()`, `.setMuted(true)`.

## How to test
`node tools/harness/guide.test.mjs` (registry vs the real terminal commands in the source, EN/TR/RU completeness + placeholders, cooldown / used / repeat / context / 3 h simulation, tutorial any-order completion, alias sharing, lookup, "did you mean", panel classification).
Headless: `flock /tmp/tfg-browser.lock node tools/harness/headless.mjs --port PORT --script tools/harness/wave4_guide.js --shot out.png --wait 4000`.

## Known gaps
* The `daily` tip only shows when a `game.daily` module exists, and it is marked used by any panel whose class matches /daily|drw/ (the daily-rewards UI was not merged when this was written): call `game.guide.markUsed('daily')` there if the heuristic misses.
* Tips are local only (they do not appear on crewmates' screens); tip texts are one-liners, longer how-tos live behind `GUIDE <name>`.
* The tutorial's "sell" step needs the HQ trip (ROUTE HQ); on a run that never visits HQ it stays as the last open objective (skip any time).
* Detection of chat / emotes / voice is key-based (pointer locked), so remapped keys are not tracked.
