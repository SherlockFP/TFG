# HUD 6 + torch (wave 8 night review, backlog item 4 + the torch part of item 1)

## What changed
**Standard HUD = six always-on areas**: (1) health / stamina, (2) hotbar (+ bag tag), (3) compass + clock, (4) the ONE objective line (spot reserved; the resolver is onegoal's), (5) threat / noise, (6) crosshair + interact prompt. Everything else fades in on change and out after about 6 s, or lives on the hold-Tab FULL STATUS card. Full density is unchanged (everything always on).

| widget | Standard now |
|---|---|
| THREAT box | only above CALM (`balance.js` sets `.tfg-threat.up` for level >= 1; hudcalm rule `c: '.tfg-threat.up'`). Noise keeps its own "when loud" rule |
| ability bar (`roleskills`) | only while a skill is on cooldown (+ 6 s linger) |
| mana bar + spell slots (`mana`) | only while mana is spent or a spell cools down |
| weight | only >= 30 lb (`HEAVY_LB`); Minimal never |
| ASSIGNMENT card (`.tfg-asg`) | flashes on change (progress digits count), always on the Tab card |
| level / XP / coins block | flashes on change (already) |
| currency | ONE: credits. Clout is appended for ~6 s when it changes, always in Full, and always in the Tab card RUN list |

Files: `src/game/hudcalm.js` (rules), `src/ui/hud.js` (`setCoins`), `src/game/balance.js` (one class). `docklayout.js` needed no change (hidden items already collapse).

## Torch
* **White blob** was lighting, not the model: the pooled torch spot started at the camera (0.18 m right, 0.12 m down), so the Lambert hand and torch model 0.5 m away sat inside a 38 cd spot and blew out. The spot now starts `FLASH_AHEAD = 0.62` m in front of the camera (`actions.js`), i.e. beyond the hand and torch model; they are lit only by the normal scene light. The QA shots that showed the blob were also brightened x2.8; the fix is checked at gamma 1.0.
* **Grey slab** was the fake cone volume seen from its own apex. Your own torch (priority < 1) has no cone any more (the lit pool is the beam). Other players' torches keep a faint haze: additive, depthWrite off, opacity 0.032 x a distance fade (0 beyond ~42 m).
* flashlight, pro flashlight and the company loaner torch share this code path (`type` flashlight / proflash).

## Test
`node tools/harness/hud6.test.mjs` (source contracts: rules, one currency, spot offset, beam), plus hudcalm / ui3 / a11y / artpass / nvgear and `npm run build`. The hudcalm test now also scans `src/ui/panels/` for dock ids (`mana`).
Shots: `tools/harness/hud6_shots.js` (greenhouse, lit torch, gamma 1.0): `hud6_full.jpg` (Full = the old always-on layout, the "before" of the HUD), `hud6_standard.jpg`, `hud6_tab.jpg`, `hud6_torch.jpg`.

## Not verified / left
* No true "before" torch shot (the old code was not re-run); the QA shots `greenhouse.jpg` / `academy.jpg` are the before.
* The Lantern Keeper cone (lcmonsters_fx) is untouched.
* Standing with the camera closer than ~0.6 m to a wall, the wall is dimmer than before (the lamp is behind the surface); the scene ambient still lights it.
