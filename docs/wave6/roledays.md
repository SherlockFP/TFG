# Wave 6 - roledays: role constraint days (MASTERPLAN 23.8)

Module `roledays` (`src/game/roledays.js` glue, `roledays_core.js` pure rules, `roledays_i18n.js` EN/TR/RU). Installed at `[import:roledays]` / `[slot:roledays]` right after algo1 in `game.js`.

## What it does
Some days the Algorithm hands the crew ONE constraint card that forces talking to each other.
- **When (host, orbit, ~8 s after the morning vote opens):** quota index >= 2, roll < 25% (seeded from run seed + day), never the day after a role day, never `game.config.difficulty === 'casual'`, never the Company / home moon. Config `game.config.roledays = false` turns it off. State: `run.rd = { lastDay, lastCard }`.
- **Cards (8):** team cards need 2+ players, solo cards apply to the WHOLE crew and only appear with 1-2 players.
  | card | holder gets / loses | everyone else |
  |---|---|---|
  | navigator | cannot hold weapons | only the Navigator sees the compass |
  | carrier | night vision (green tint + gamma), voice + chat muted (ping / emotes only) | - |
  | scout | +25% speed, cannot pick up scrap (`scrap` / `big`) | - |
  | mechanic | opens doors / locks / keypads | cannot open doors, unlock or crack vaults (closing is allowed) |
  | medic | half-blind (dark vignette overlay) | - |
  | pacifist (solo) | nobody holds weapons, +12% speed | - |
  | foggy (solo) | half-blind, +12% speed | - |
  | lightfoot (solo) | +25% speed, no two-handed scrap | - |
- **Assignment** (`assign`): the card's preferred roles (`game.rpg.roleOf`: navigator occultist > scout, carrier hauler > enforcer, scout scout, mechanic technician, medic medic) else round-robin by day over the sorted peer ids. If the holder leaves before landing, it is re-assigned.
- **Announce:** intercom line in orbit (`Tomorrow, casting call: ...`), reminder after landing, HUD card (`hudDock('right')`, ui2 `tfg-card` / `tfg-tag`) with the name, one-line explanation, who holds it and the bonus.
- **Pay:** at takeoff / orbit with someone alive: each surviving peer gets `payFor` Clout (`progress.addCoins`, holder or solo = full, others half) + a hype spike (`game.algo1.bump('escape')` -> `tfg:viewers`). Fired = nothing.

## Enforcement (predicates in `roledays_core.js`, hooks in `roledays.js`)
`useItem` hook (weapons), `game.pickup` wrap, `game.doorInteraction` wrap + `interactables` filter (vault keypad), `game.sendChat` wrap + `voice.muted` forced, `hud.drawCompass` wrap, `stats` hook (`speedMul`), overlay div. Host validators wrap the `door` (opening), `unlock`, `vault` and `pick` handlers (same pattern as cycle.js). Enforcement only in phases `landing` / `moon`, derived on every peer, so late joiners get it.

## Net (prefix `rd`)
`rds` host -> everyone: `{k:'set', cur:{card,holder,all}|null}` (also re-sent every 10 s), `{k:'pay', cur, alive:[ids]}`, `{k:'say', s, v}`.

## How to test
- `node tools/harness/roledays.test.mjs` (eligibility incl. casual / quota / cooldown / ~20% frequency, cards per crew size, assignment for 1-4 players, every predicate, pay, TR + RU coverage).
- `tools/harness/wave6_roledays.js` (headless body: forces carrier, lands, checks chat blocked + voice muted + HUD, forces pacifist, takes off, checks bonus + viewers). Debug: `game.roledays.debug.force('medic')`, `.clear()`, `.roll()`.

## Known gaps
- No real minimap exists: "navigator sees the map" = only they have the compass (outdoors only, the compass is not drawn indoors by the HUD).
- The medic card has no revive boon (only the half-blind limit); revive stays with the medic role skill / defib.
- Pings and emotes stay allowed for the muted Carrier by design; walkie text radio is not blocked.
- Weapon ban blocks use + pickup, not an already-held weapon in the hotbar. Host validates door / unlock / vault / pick only; weapon use and chat are client-enforced.
- Peers that only join mid-orbit see the HUD card within 10 s (periodic re-send).
