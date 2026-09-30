# Wave 11 - FACILITY CRISES (module `events11`)

Owner complaint: "soulless, AI-made". Mid-run events that change what the crew must DO, each with a different rule. At most one crisis per landing, rolled by the host (about 1 landing in 3 from quota 1; a first-day crew is never hit). Each has a telegraph (big banner + Algorithm line + siren / rumble / blackout flicker), a HUD objective line (warn slot), a reward or a cost, host authority and late-join sync.

## Files
- `events11_core.js` pure rules (roll, sector map, terminal planner, flood curve + basin, breaker order, payouts). Node-safe.
- `events11_text.js` all text EN/TR/RU. `events11_fx.js` terminal, breaker panel, water volume, door straps, trending tag, tints, 7 procedural sounds.
- `events11.js` module (host logic, net, client visuals, interactables, objectives, debug API).
- Shared-file hook: `game.js` import + slot only. Test: `node tools/harness/events11.test.mjs` (core + a mock-game run of all four host flows + client visuals build/dispose).

## The four crises
| id | rule | telegraph | counterplay | reward / cost |
|----|------|-----------|-------------|---------------|
| lockdown "SECURITY BREACH" | every ordinary door seals (closed + locked, red straps, prompt says SEALED). Hold E 3.5 s on 3 security terminals. A terminal opens every door on the edge of ITS sector, so the chain always leads to the next one; a sector without a terminal is released after 40 s; 300 s backup override. | klaxon + banner + terminal screens blink red | split up: hackers make noise (creatures hear every second of a hold), someone guards | pays credits + XP (time bonus). Cost: creatures +25 % speed until lifted. |
| flood "RISING WATER" | the deep 30 % of the floor plan floods: warn 10 s, rise 90 s to 1.75 m, hold 40 s, drain 30 s. Wading slows (existing set-piece water zones). Head under water: 7 s of air, then 8 dmg/s. Loose loot floats up and drifts to the sink room. | rumble + banner + the water sheet appears at your feet before it matters; HUD shows a depth word + air bar | catwalks (3.4 m decks), stairs, crates, or leave the wet sectors (the entrance stays dry) | 4 pieces of debris scrap spawn floating in the wet sectors (grab early). No cash payout, XP when it ends. |
| power "POWER REROUTE" | brown-out (facility emitters flicker + dim). 3 breaker panels, each shows 1-3 load bars. Flip them from LOWEST to HIGHEST load (or HIGHEST to LOWEST: the HUD says which). Wrong order = surge, all reset, loud noise. Live panels buzz and call creatures every 2.2 s; a panel that is up goes quiet. | lamps get steadier with every correct breaker; a surge flares them | do the quiet panels first, cover the buzzers | lights back + the vault door (else a treasure room, else an iron crate) opens; credits + XP. |
| viral "VIRAL MOMENT" | the Algorithm picks one living player: for 60 s every creature sees only them (`creatures.playersFor` + a noise ping every 1.6 s). Anything they secure in the ship is worth x3 (item value tripled once). | 3 s "choosing" reveal, ping, TRENDING billboard over their head (everyone), magenta screen edge for them | crew covers the runner; run loot to the ship inside the minute | XP to the trending player if they last. Cost: being hunted. |

## Extends / avoids duplicates
- `facilitysys` already has a blackout, a blast-door "lockdown" (during extraction pulses / random set piece) and power chains (BUS A/B/C, breaker order, code): `events11` never starts while `run.fac` has an event / lock / extraction / alarm and never touches `run.fac` or `run.powerOn`. Its lockdown seals ordinary doors + hack terminals (a different rule), its brown-out uses the light-pool emitter flicker, not `globalDim`.
- Uses `game.hostSetDoor` / the `door` message, `creatures.speedMul` (like algo1), `creatures.playersFor`, `creatures.noise`, the set-piece water zones, `fallbackChestLoot`, the `objectives` hook, `game.lore.say`.

## State + net (prefix `ev11`)
`game.run.ev11 = { key, plan:{id,at,done}, live: null | { id, rev, st, el, ... } }` (host writes, `broadcastRun` syncs, late joiners read it; clients rebuild visuals from it once the facility exists). `ev11req` client -> host `{op: hb|he|hp|hd|flip, i, k}`; `ev11fx` host -> all (`end|free|rescue|surge|ok|x3|snd`); `ev11t` host -> all once a second `{key, el}` (flood clock).

## Knobs
`ROLL`, `LOCK`, `FLOOD`, `POWER`, `VIRAL` in `events11_core.js`.

## Test in the game (console, host, on a moon)
`kefal.game.events11.debug.trigger('lockdown' | 'flood' | 'power' | 'viral')`, `.end(true|false)`, `.seek(60)` (flood clock), `.hack(0)`, `.solve()`, `.state()`, `.plan()`. A facility crisis needs a moon with a facility and you inside it.

## Known gaps / not verified in a browser
Terminal / breaker / water look, straps on door frames, klaxon + buzz loudness, the wet tint, brown-out lamp flicker on real emitters, hold-E feel (`interactTarget` tagging), buoyancy of real item bodies, catwalk refuge in the flooded room, the trending tag size. Blast doors are left as they are (not sealed). TR / RU text not proof-read by a native speaker.
