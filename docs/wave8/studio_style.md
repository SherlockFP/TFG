# TFG style guide (wave 8, "studio")

One page. If a string you write breaks a rule here, the owner will feel "an AI made this". English is the source language
(strings are keys, see `src/core/i18n.js`); TR and RU are written for the ear, never word for word.

## 1. Who is talking

| Voice | Where | Sounds like | Never |
|---|---|---|---|
| **The Algorithm** | intercom, cinematics, day summaries, terminal easter eggs, memo lines | Calm, amused, watching. Short sentences. Treats people as content ("Creators"). Says the awful thing politely. | Shouts. Explains its own joke. Uses "!" (a grade-S quip is the exception). |
| **The Company** (HR, dispatch, store, terminal shell, signage) | announcements, Company Store, hiring day PA, posters, HR notices | Cheerful, bureaucratic, clumsy euphemism ("restructuring", "fine", "deplatformed"). Calls the player "Employee". | Sounds like it knows more than it should. That is the Algorithm's job. |
| **UI / system** | HUD, prompts, toasts, settings, errors | Plain, terse, one fact. Verb first. Sentence case. | Jokes, lore, exclamation marks, apologies. |
| **Found text** (journals, notes, chalk, posters) | world props | Human, a bit off, lower-case allowed, one detail that does not add up. | A moral. A wink at the player. |

Rules of thumb: one idea per line. Cut the second sentence if it only restates the first. A joke is used once; if the same
punchline appears in three places ("great content, run it back"), keep the best one. No "Oops!", no "Whoops", no "Let's go".

## 2. Naming glossary (one name per thing)

| Thing | Use | Not |
|---|---|---|
| Team money (host pays, shown ▮) | **credits** (▮) | funds, cash, money, gold |
| Personal currency (◈) | **Clout** | coins (only in code ids: `profile.coins`), shards |
| Sales target | **quota** (long form: "engagement quota") | profit quota, "the numbers" |
| Run over | **deplatformed** (big word: DEPLATFORMED) | fired, terminated, kicked (TR: "kovuldun", RU: "забанен") |
| Your employer (AI) | **The Algorithm** | the AI, Feed Corp (only as a faction short name) |
| Corporate shell | **the Company** (Company Store, Company terminal, Company HQ) | the Corporation, "the firm" |
| HQ moon | **0-Algorithm HQ** (short: HQ) | Company HQ, the Company (as a place) |
| Shop on the ship | **Company Store** (screen: STORE) | shop, market |
| Black market NPC | **Phish Dayı** (place: Black Market) | Modem Dayı, Uncle (only in-fiction lore) |
| Other players | **crew**, **crewmate** | teammate, squad, party |
| Loot | **scrap** (physical), **content** (Algorithm's word for it) | junk, treasure |
| Fishing | **Phishing Rod**, "phishing" in flavour; the verb in prompts is "Cast" | fishing rod |
| Vehicle | **Uplink Van** | UPLINK VAN, the truck |
| Interiors | Data Center, Haunted Homepage, Deep Web Mine (THEME.md) | Factory, Mansion, Mine |
| Default handle | job title + 3 digits (Janitor482, Lurker117) | Employee123 |

Full item/moon/creature display names: `docs/THEME.md`. Internal ids never change and never reach the UI
(`humanizeId()` in `core/util.js` is the last-resort fallback; a data id on screen is a bug).

## 3. Casing and punctuation

- UI labels and buttons: ALL CAPS only for the menu spine (HOST GAME, SETTINGS), HUD tags (QUOTA, DANGER) and big cinematic words.
  Everything else is sentence case: "Apply and reload", not "Apply And Reload".
- Item, creature, moon, faction and NPC names are Title Case ("Notification Bell", "Web Crawler").
- No em dashes in player-facing text. Use a colon, a full stop, or " - " (spaced hyphen). Ellipsis "..." only for an actual trailing off.
- Exclamation marks: alarms and hostile events only ("ALARM TRIGGERED!", "Something is on your head! Hit it!"). Never on a reward,
  a greeting, a tooltip or a tip.
- No emoji in UI or world text. Use the pictogram set (`src/ui/glyphs.js`, `glyph('skull')`); symbols with a fixed meaning are allowed: ▮ credits, ◈ Clout, ★ rebirth.
- No "(s)" plurals ("item(s)", "day(s)"). Rewrite as a label + number ("Days left: 3").
- Avoid "please", "successfully", "simply", "just", "Note:".

## 4. Numbers

- Credits: `▮` + integer, thousands separator comma from 1,000 (`fmtMoney()` in `core/util.js`, `n0()` in the terminal). Never `▮ 120`, never `120 credits`.
- Clout: `◈` + integer, same separators. XP: `+120 XP`. Levels: `Lv.7`. Percent: `15%` (TR writes `%15`, handled in the TR string).
- Distances `12 m`, weights `8 lb`, durations `3 s`, `2:30` for clocks. Day counters: `Day 4`, deadline as `Days left: 2`.
- Big numbers are never abbreviated (no 12k) in the summary screens.

## 5. Key hints

- Interaction prompts and objectives: key in square brackets, at the end: `Open door [E]`, `Sprint to the hall [hold Shift]`.
- Prose (guide, tips, journals) may say "press E" but must use the same key names as the settings screen (Ctrl, Shift, LMB, RMB, MMB).
- Hold vs press: "hold [E]" for holds, plain `[E]` for taps. Never "(E)" or "Press the E key".

## 6. Handmade checklist (before you merge a text or content change)

1. Would the line survive being read aloud by someone who works there? If it explains itself, cut it.
2. Is there a second copy of this sign/poster/name in the same room? Add a variant (see `poster_*` in `render/textures.js`).
3. Does it leak an id, a debug word (TODO, placeholder, undefined, NaN), or a developer term (host, seed, RNG)?
4. Does TR read like a person wrote it? Does RU keep the deadpan?
5. `node tools/i18n_audit.mjs` must not grow the MISSING counts (baseline at wave 8: TR 373 / RU 370).
