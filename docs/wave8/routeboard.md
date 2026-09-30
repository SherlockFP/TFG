# Route board + stream opening + 3 hero moons (wave 8 night, REVIEW_W8_NIGHT item 12, CRITIQUE_W8 P13)

The goal is that the first five minutes do not read like a Lethal Company clone. The game now opens on the Algorithm's stream, and the
most important daily decision (where to go) is made on a board of cards instead of a wall of text.

## 1. Hiring Day opens on the stream (`src/game/onboard.js`, `onboard_text.js`)
- A fresh host no longer starts in the Cell 07 orientation wing. The screen fades in on the ship under a **LIVE overlay** that lasts 12 s:
  - a red LIVE badge and a viewer counter that climbs from 0 to about 900-1,600;
  - the stream title ("NEW SERIES: THE NEW HIRES");
  - three Algorithm lower-third captions, one of which introduces the crew by name as its new content;
  - fake chat, with a MOD message that pins the controls (WASD, Shift, Ctrl, F, E, RMB).
- The player is held (frozen) during the overlay. SPACE or ENTER cuts to the ship after 1.5 s, and holding Backspace still skips the whole Hiring Day.
- When the overlay ends, the flow jumps to the ship's `terminal` step. The terminal opens on the route board with the Dialup route preselected. ENTER means
  "already routed, pull the lever". The flow then continues lever -> door -> field (the ▮50 goal, the tutorial camera) -> return remark. This path is unchanged.
- The teaching that was cut does not disappear. The loaner torch (loaner.js), the one-goal objective line (onegoal/firstrun) and the pinned controls cover
  movement, light and scrap. The guide still credits move / light / scrap once Hiring Day is done. Lockpicking is taught by the first real locked door.
- Time to the first landing is now about 12 s of stream plus the terminal and the lever, well under 90 s. The old wing is 45-120 s and is kept behind
  `?hiringday=wing` or `settings.hiringWing`. `?hiringday=1` / `?hiringday=stream` force the stream on a host.
- If a crewmate lands the ship during the stream, the overlay ends and the flow jumps to the door step, the same way the wing interruption works.

## 2. Route board (`src/game/routeboard.js` + `routeboard_core.js`, module `routeboard`)
- **When it opens:** on the first terminal visit of every orbit, and on `MOONS`, `MOON`, `ROUTES` or `BOARD`. `MOONS ALL` (or TAB on the board) prints the old text list,
  including voyage signals and the mapmods readout. Locked moons in that list are tagged `[LOCKED: QUOTA n]`.
- **Three route cards per day.** Each card shows:
  - art: palette bands taken from the moon's biome (sky / fog / ground) with an interior silhouette in inline SVG (factory stacks, a metro tunnel with a train,
    a mansion with a ring light, academy, museum, greenhouse, prison, panel blocks, mineshaft, backrooms, cold storage);
  - a key number;
  - a CURRENT or NEW tag;
  - the moon name and its one-line hook (EN/TR/RU);
  - danger pips and a danger name (`hud.dangerOf` with that moon's forecast);
  - SCRAP ON SITE ▮lo-hi (scrap count range × the theme table's mean value × scrapMul × quota value);
  - interior, weather, and a ROUTE button showing the fee.
  One HQ row sits below the cards (sell scrap, buying rate).
- **Today's affixes:** a strip above the cards shows TODAY (the daily event) and NEXT LANDING (mapmods affixes). Both respect the firstrun budget, so they are hidden
  before the first sale or before quota 1.
- **Controls:**
  - `1-3` select a card, `4` selects HQ, and the arrow keys move the selection;
  - `ENTER` routes, `TAB` shows ALL ROUTES, and `ESC` goes back to the prompt (a second ESC leaves the terminal);
  - typing any letter hides the board and the letter goes to the prompt, so veterans can type BUY straight away;
  - with the mouse, a click selects a card and a click on its ROUTE button routes.
- **Card choice:** the current route comes first, then the routes that just opened, then a seeded daily order (run seed + day). A card is never HQ, a generated
  server, an instance, a voyage moon or the homeworld.
- **Style:** the ui2 tokens and base classes (`tfg-plate`, `tfg-tag`, `tfg-kbd`, `tfg-num`, `tfg-hazard`), hard edges, amber on ink, and no emoji.

## 3. Campaign start = 3 hero moons, then +2 routes per quota
| quota | new routes |
|---|---|
| 0 | **56K-Dialup** (hills + Data Center factory), **88-Chatroom** (desert + ghost-train metro), **E9-Estate of the Departed** (influencer mansion) |
| 1 | 12-Forum (greenhouse), 33-Guestbook (academy) |
| 2 | A2-Binary Dunes (mineshaft), 666-Creepypasta (prison) |
| 3 | 1991-Panelka (tower), C0-Cold Storage (colddata); generated sector servers (UNCHARTED / SECTOR) |
| 4 | 404-Not Found (museum), ∅-Level 0 (backrooms) |
| 5 | anything else (mod moons, late content): the Deep Feed |

**Why these three.** They are the three most different places the game has: an outdoor moon with a factory, an underground train, and a luxury mansion.
- Dialup is the free tier-1 Hiring Day moon: outdoor terrain plus the basic factory.
- Chatroom's metro is the most distinct interior, and its hook is a single sentence: "a ghost train owns the main tunnel".
- The Estate is the influencer mansion, the game's own theme (content; loot that trends while you carry it). The creative director's review picked
  "factory / influencer mansion / metro", and this choice follows it.
- Each of the three has a different biome, interior and silhouette. The academy and museum open at quota 1 and quota 4.

**Rules:**
- The HOST enforces the ladder with a `terminal.hostExecute` wrap. Terminal ROUTE, the board and voyage job routing all go through it.
- A joiner's board reads the host's ladder from `run.hub` (hubgate).
- Nothing is gated for veterans (`unlocks.mode === 'all'`), for a host with Settings > Unlock everything, or in Quick Shift, which keeps its own seeded moon pool.
- HQ, the homeworld (onboard gates it at quota 3), cycle instances and voyage moons are ruled by their own modules.
- When the ladder moves, every peer gets a toast: "NEW ROUTES OPEN: ...". The board footer always names the next step ("Quota 1 opens: 12-Forum, 33-Guestbook").

## Net
Nothing new is sent over the network. Routing uses the existing `term {op:'route'}` request, and the ladder rides `run.hub`.

## Test
- `node tools/harness/routeboard.test.mjs` (137 checks) covers:
  - the ladder shape (+1..2 per quota) and the exemptions;
  - the cards of the day (heroes at quota 0, new routes first at quota 1, deterministic per day, rotating);
  - payout, art and hooks;
  - EN/TR/RU text;
  - the host ROUTE guard on a stub terminal (locked refused, hero and HQ pass, veteran and Quick Shift ungated, dispose restores).
- `node tools/harness/onboard.test.mjs` (619 checks) covers the stream opening (ends by itself at the terminal step, SPACE cuts it, Backspace skips, a landing
  during the stream jumps to the door) and the wing, which is still tested through `?hiringday=wing`.
- In the browser: `/?autohost=local&hiringday=1`. Watch the LIVE overlay, then E on the terminal to open the board, then ENTER, then the lever.

## Knobs
- `STREAM_LEN` (onboard.js).
- `HERO`, `LADDER`, `SECTOR_Q`, `LATE_Q` and `CARDS` (routeboard_core.js).
- `HOOKS`, one line per moon (routeboard_core.js).

## Known gaps
- Not browser-run in this pass (lean mode). The layout was budgeted for the 900×576 terminal screen at 1280×720 but not seen.
- The card art is a palette plus a silhouette, not a rendered thumbnail.
- The payout range is total scrap on site, not what a crew usually brings back.
- A joiner's board ignores the joiner's own Unlock everything setting, because the host decides. A host that has Unlock everything on while its profile is staged
  shows locked cards to joiners, but the host still accepts their routes.
- The metro, influencer and other themes without their own scrap table use the factory table's mean value for the payout estimate.
