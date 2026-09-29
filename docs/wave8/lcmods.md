# lcmods - six new built-in mods + 31 cosmetics (wave 8)

Owner: "Lethal Company modlari var, onlardan kurabilirsin, yeni modlar yapabilirsin, kozmetikleri arttir."
Identity check (MASTERPLAN 21): every mod serves "being watched" (Algorithm), "panic together" (co-op) or "risk -> loot".

## 1. Picks (and what was skipped, checked against the code first)

| Mod (id) | LC idea | Scope / default | Pillar | What it does |
|---|---|---|---|---|
| The Algorithm Quotes You (`algorithm-quotes`) | Skinwalkers / Mirage, text edition | host, **off** (opt-in) | watched | Host keeps the last 6 chat lines per crewmate in memory only; every ~150 s on a moon the intercom reads one back with a snide caption (4 templates). Peers only, nothing saved. Being quoted 8x unlocks the Chosen suit. |
| Loot Appraiser (`loot-appraiser`) | ShipLoot / scan tweaks | personal, on | risk -> loot | `/appraise` or terminal `APPRAISE`: count + rough value of loose scrap left on the moon, +-15% Algorithm blur (config: exact), 20 s cooldown. |
| Quick Change (`quick-change`) | TooManySuits / More Suits menu | personal, on | QoL | `/suit /hat /back [next\|prev\|name\|none]` cycle owned cosmetics, `/outfit save 1..3` + `/outfit 1..3` presets (browser storage). |
| Office Party (`dance-party`) | TooManyEmotes group dances | host, on | panic together | 2+ crewmates dancing within 9 m earn +8 XP / +5 Clout every 20 s, max 6 payouts per player per day; host counts (aiPlayers positions + `emoteNet`), pays with `api.reward`, broadcasts `lcm-party`. 5 payouts unlock the Rave emote. |
| Ship Radio (`ship-radio`) | Signal Translator / walkie text | personal, on | panic together | `/radio <text>` or terminal `RADIO`: every crewmate gets a `[RADIO]` line and (optional) text-to-speech at low pitch. 3 s send cooldown, 1.5 s receive flood guard. Unlike the terminal `SIGNAL` it works from anywhere and speaks. |
| Shift Awards (`shift-awards`) | Coroner / end-of-day report, for the living | host, on | watched | Host tracks walked metres, dance seconds, chat lines, ship seconds; at orbit names Marathoner / Life of the Party / Chatterbox / Homebody (2+ players), 10 Clout each. |

Skipped because already in the game (checked): voice mimic (`skinwalker-echoes` + the Mimic creature), daily events (`brutal-events` mod + base-game morning rules / daily events), coilhead "don't look away" (weeping-angel style creatures in `entities/creatures.js` ~1700, `creatures_wave1.js`), cruiser / vehicle (`entities/cruiser.js`, terminal `CRUISER`), pings (`game/pings.js`), BetterStamina (`infinite-sprint` boosted mode), emotes / late join / more players / hotbar / loot tracker / bodycam (existing features), signal transmitter text (terminal `SIGNAL`, superseded by Ship Radio only for reach + voice).

## 2. Plumbing (tiny shared edits)
- `src/mods/modapi.js`: `KefalAPI.t / tf` (mods localise their own strings), installs `lcmods_i18n.js`.
- `src/mods/modscreen.js`: mod name, description and setting labels now go through `t()` (also helps every old mod once translated).
- `public/mods/index.json`: +6 files. All are `builtin: true`, so they appear under TFG FEATURES with CREW / PERSONAL badges; `algorithm-quotes` is `enabledByDefault: false`.
- Net: only the existing `modmsg` relay with keys `lcm-quote`, `lcm-party`, `lcm-awards`, `lcm-radio` (no new handler types).
- `game.cosm5.bump(flag)` (new, cosm5.js): mods increment `profile.cosm5.flags.<name>`; RULES read them.

## 3. Cosmetics (+31 through the cosm5 pipeline, docs/wave4/cosm5.md)
Rows in `src/game/cosm8_data.js` (appended to `C5`, so shop rotation, crates, wardrobe tabs, sync code and tests pick them up), models in `src/models/cosm8_models.js` (merged into the cosm5 builder tables), skins = 4 GLSL patterns appended to `render/weaponskins.js`, emotes in `EMOTE_DEFS` (cosm5.js), strings `cosm8_i18n.js` (TR + RU).

- Suits (8): Mailroom Courier, HR Compliance Officer, Lost & Found Box, Streamer Rig, Red Tape Mummy, Quota Suit (animated progress bar), Deadline Reaper (secret), The Algorithm's Chosen (mod unlock, spinning halo).
- Hats (8): Support Headset, Traffic Cone, Signal Antenna, Overtime Nightcap, LIVE Sign, Overhead Spotlight, Watching Eye (eye follows nothing), Trending Crown (secret).
- Back (6): Loot Sack, Field Radio, Streaming Camera Arm (REC light), Battery Backpack (charging cells), Emergency Parachute, Holo Ad Panel.
- Weapon skins (4): Hazard Stripes, Dead Channel (TV static), Neon Grid, Void Starfield (mod unlock).
- Emotes / dances (5): Daily Stand-Up, Spreadsheet Shuffle, Feed Scroll, Pink Slip Shimmy, Server Room Rave (mod unlock). All in the emote wheel; the four non-trivial ones count as dances for Office Party.
- Sources: 16 in the rotating shop (`src: 'shop'`), 10 crate-only (`crate`, also weekly feature pool for epic+), 5 secrets: Reaper (8 quotas), Trending Crown (level 30), Chosen (quoted 8x), Void Starfield (40 appraisals), Rave (5 party payouts).
- ID_TABLE stays append-only (suits 22, hats 27, backs 16, skins 14; all fit one base-36 char).

## 4. Tests / knobs
- `node tools/harness/lcmods.test.mjs` (new): six mods against a stub game (quotes flow, dance payouts + daily cap + distance, awards, appraisal math, quick-change cycle + presets, radio sanitising) and TR/RU coverage of every string. `node tools/harness/cosm5.test.mjs` updated (counts, rich-profile flags): 90 cosmetics ok (FP clip check, triangle budget, emote fx on both bodies, sync roundtrip).
- Config per mod is in the MODS screen (intervals, radius, exact appraisal, TTS on/off + volume, award Clout).

## 5. Known gaps
- Quote / radio text is not filtered for profanity (same as normal chat). TTS depends on the browser voice.
- Quick Change presets are per browser; equipping an unowned item is silently skipped.
- Office Party counts any of 16 emote ids; the emote id for remotes comes from `emoteNet` (1 s latency of the state packet).
- Weapon skins still do not show on inventory icons (cosm5 gap).
- Browser check: one headless run, see the report (multiplayer / WebRTC paths untested).
