# Wave 8: declutter (calm HUD)

Owner: "the screen feels too full, it should not feel complicated in game; things overlap".

## 1. Audit: every in-run HUD element

Legend: **A** = always on (Standard), **C** = contextual (shows on change for 6 s, then fades; Minimal 3 s), **H** = Tab card only in Minimal, **X** = shows only while its own condition holds (module already gates it), **Tab** = always reachable with hold Tab.

### Core HUD (src/ui/hud.js, objectives.js)
| element | owner | Standard |
|---|---|---|
| health body + stamina bar | hud.js `.hud-tl` | A |
| weight (`0 lb`) | hud.js `.hud-weight` | A (hidden in Minimal, in Tab) |
| hotbar | hud.js `.hud-inv` | A |
| compass tape + clock | hud.js `.hud-compass`, `.hud-clock` | A |
| objective tracker (was 7 lines) | game/objectives.js | A, 2 lines (Minimal 1, Full 7); all lines in Tab |
| level / xp / coins | hud.js `.hud-tr` | C (H) |
| daily-event / favor / streak chips | hud.js `.hud-chips` | C (H) |
| quota / ship loot | hud.js `.hud-quota` | C, always in orbit + company |
| toasts, xp feed, big banner, prompt, crosshair | hud.js | X (already transient) |
| landing briefing, death card | hud.js | X |
| fake stream chat, "LIVE" pill | game/algo2.js dock `a2feed` | **off by default** (Settings > HUD > Live stream chat feed) |
| intercom banner (Algorithm PA) | game/algorithm.js `.algo-sub` | X, stacked by the layout manager |
| chat log | ui.js `.chat` | X (lines fade); left dock lifts over it |

### Dock chips (src/ui/dock.js `hudDock(side, id, order)`), 37 call sites
| side / id | owner | Standard |
|---|---|---|
| right `threat` | game/balance.js | A (one block with noise) |
| right `stealth` (noise) | game/stealth.js | C: only a thin bar, only while noise > 0.35 |
| right `siege`, `sgplace` | ui/siegehud.js | X (siege only) |
| right `horde` | game/horde.js | X (raid only) |
| right `facility` | ui/facilityhud.js | C |
| right `contract` | game/contracts.js | C (H); progress is also an objective line |
| right `story` (allegiance chip) | game/story_ui.js | C (H) |
| right `roledays`, `rdmap` (role card + map) | game/roledays.js | C (H) |
| right `w2clock` | game/worlds2.js | C (H) |
| right `h2`, `h2g` | game/homeworld2*.js | C (H) |
| right `s2-hull` | game/ship2.js | C |
| right `mu_jam` | game/music.js | X |
| left `static` (anomaly meter), `buffs` | ui/buffbar.js | C |
| left `survival` (hunger / warmth) | game/survival.js | X: only when hungry, starving or cold |
| left `daily` | game/daily.js | C (H) |
| left `a2feed` | game/algo2.js | C (H), off by default |
| left `tfg-inv-feed` (pickup feed) | game/inventory.js | C |
| left `social-phone` | game/social.js | C (H) |
| left `br_level0`, `br-entity` | backrooms / creatures_backrooms | X (Backrooms only) |
| bottom `roleskills` (Y / U tiles) | game/role_skills.js | C (flashes when a skill is used) |
| bottom `cbammo`, `cbmelee`, `grenade`, `mana`, `pry`, `secureloot`, `hm_lock`, `vyprompt`, `br-hug`, `fun-*`, `arcade`, `deck`, `g2-hold`, `s2-ring`, `sgplace`, `mu_hint` | combat, weapons, spellbook, ... | X (interaction prompts / minigame HUDs, only exist while used) |

### Free-floating `position:fixed` overlays (not docks)
`.a1-vote` (algo1 vote), `.ob-pa` / `.ob-skip` (onboarding PA + skip), `.sg-banner` (siege), `.hban` (horde), `.g2-card` (identify), `.zn-bar` (zones capture bar), `#p4-hint` (polish4 hint), zones2 hint, `.algo-sub`, mirror-dimension `.mr-timer` / `.mr-meter`, VHS captions. Full-screen tints (`#sv-cold`, night vision, chase vignette, anomaly overlay) are not HUD and untouched.

## 2. What changed

* **Density setting** Settings > HUD > "HUD density": Minimal / **Standard (default, the calm layout)** / Full (old behaviour). Saved as `settings.hudDensity`, applied as `html[data-hud]` (ui.js `applyUiPrefs`, and every 0.3 s by the module).
* **Contextual widgets** `src/game/hudcalm.js`: a rule table maps dock ids and HUD blocks to a policy. A widget's text signature (digits ignored, so ticking timers do not retrigger) changing shows it; after 6 s it collapses with a 0.6 s fade (`.hc-off`). No module was edited for this, so Full = the old screen.
* **Hold Tab: FULL STATUS** (`menu` action, rebindable; it was listed as "Character sheet" but bound to nothing). Card with the full objective list, crew (hp / dead), run info (day, moon, quota, days left, clock, level, coins, weight) and a live copy of every contextual widget (buffs, hunger, daily, contract, allegiance, facility...). Nothing is lost, it is one key away.
* **Objectives** 2 lines (Minimal 1). `objectives.js` keeps `full` for the Tab card.
* **Fake chat** now opt-in (`a2Feed === true`, default off).
* **Layout manager** `src/ui/docklayout.js`, started by `hudDock()`; 4 Hz, no per-frame cost:
  * right dock: under level/coins + toast stack, ends above the hotbar
  * left dock: bottom = above the visible chat lines (was fixed at 170 px, on top of the chat), top = under the objective tracker
  * bottom dock: above the hotbar row, capped at 34 % of the viewport
  * items that do not fit are clipped **lowest priority first** (highest `order`), never overlapped
  * bottom-centre banners (`.zn-bar`, `#p4-hint`, `.ob-skip`, `.algo-sub`) stack above the bottom dock instead of sharing `bottom:118px .. 230px`
  * top-centre banners (`.a1-vote`, `.ob-pa`, `.sg-banner`, `.hban`, `.g2-card`, `.hud-big`) stack under clock + compass + quota (they used to start at 8-9 vh, on the compass tape)
  * `.hud-quota` moves under the compass tape (they overlapped at top 58 / 64 px)
  * `window.__hcLayout = false` turns the pass off (before/after screenshots)

## 3. Key / UI conflicts found

| conflict | status |
|---|---|
| `Tab` bound to "Character sheet" (`menu`) but no code used it, while the level-up toast said "[TAB] skill point" | Tab is now "Full status (hold)". The toast still says TAB (skill tree is K): **left, wording fix for the RPG owner** |
| `N`: pets panel (pets.js) + trade request (trade.js) + mirror-combat dash + RPS accept fired together next to a crewmate | pets.js now ignores an already handled key (`e.defaultPrevented`), so one of pets/trade wins instead of both. Mirror dash / RPS still share N (their contexts are exclusive) |
| `Y` / `U`: role skills vs RPS wager accept (`Y`) and homeworld upgrade (`U`) | listed, not changed (contexts exclusive except RPS prompt, which also casts Y: needs a `blocksInput`-style flag from arcade_rps_ui) |
| `B` / `M`: distress vote (voyage.js) vs emote wheel (`B` hold) and trade decline (`M`) | listed; only active while the vote prompt is up |
| `H`: homeworld build panel, cruiser horn, food (`H` eat) | listed, unchanged (different places) |
| `R`: reload / rotate deployables / homeworld rotate / deck | contextual, unchanged |
| several modules bind raw `KeyX` and bypass the rebinding screen (see `HARDCODED_KEYS` in a11y_core.js) | unchanged |
| same screen spot: left dock vs chat log, right dock vs toasts + hotbar, quota vs compass, top banners vs clock / compass, bottom banners vs each other, objective list vs left dock | fixed by the layout manager |

## 4. Test

* `node tools/harness/hudcalm.test.mjs` (density parsing, TR/RU coverage, rule ids exist, fake chat opt-in, Tab label)
* `node tools/harness/ui3.test.mjs`, `node tools/harness/ui2_glyphs.test.mjs`, `node tools/sim/a11y.test.mjs`, `npm run build`
* screenshots: `tools/harness/headless_shots.mjs` now also exposes `__view(w, h)`. Run = land, fill every dock + chat + toasts + banners, then before (Full, layout off), Full + layout manager, Standard, Standard + hold Tab, and the same at 1920x1080.

## 5. Knobs / known gaps

* `DOCK_RULES` / `HUD_RULES` in hudcalm.js: add a dock id to make a new widget contextual (unknown ids stay always-on).
* Contextual state is per element; a widget that rewrites its text every frame with words (not digits) stays visible.
* Mirror-dimension and VHS captions are still positioned by ui3.css (not the manager).
* Standard hides the threat foot line (value / trend arrow); Full keeps it.

## 6. Verification status

* Verified: node tests + `npm run build`.
* One headless run reached shots 1-4 at 1280x720 (layout manager + hold-Tab card rendered correctly; the Tab card lists objectives, crew, run info and the contextual widgets). It exposed a real bug (dock items flex-shrinking onto each other inside the height-capped docks; fixed with `flex:none` + a bottom-dock lift above the hotbar) and the 1920x1080 / Standard-after shots were lost (the player fell into the Backrooms during the 8 s fade wait, and the 1080p screenshot timed out). The lead cancelled the re-run because of the shared browser queue: **Standard fade-out, the flex fix and 1920x1080 are NOT browser-verified**. Script: see section 4 (fill every dock, chat, toasts, banners; drop the player from y=6 so it does not clip through the terrain; hide `#game` for the 1080p shots).
