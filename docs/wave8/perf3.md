# wave8 perf3 - hitch hunt (no new module: fixes in place)

Owner: "the game stutters/hitches a lot now and then". Method: static audit of the update loops + ONE headless profile
(`tools/harness/wave8_perf3.js`: wraps every `mods.on('update')` handler with a timer, lands on hamsi, 40 steady ticks, then times
`layoutDocks`, checks the objective and the report z-order). Software WebGL on a shared box, so absolute ms are pessimistic; use the ratios.

## Measured (headless, before fixes, single run)
- `hostLever + hostFinishLanding` blocks the main thread **3.2 - 5.0 s** (world gen + mesh build + first shader compile). Not fixed here (see remaining).
- worst single tick 60-230 ms (first ticks after landing), steady median 7.8 ms, all 75+ `update` handlers together 8.8 ms/tick avg.
- Costliest handlers (avg / max ms): lore update 1.34 / 21.7 (ship board canvas redraw every 0.25 s), **gpusweep 1.32 / 92.3** (full scene
  traverse every 1.5 s), two modapi `featureOn` wrappers 0.86 / 17.9 and 0.77 / 63.6, fauna 0.50 / 25.8, kit updaters 0.26 / 10.
- `layoutDocks` (4 Hz): 0.4-0.5 ms median on a fresh HUD; the cost is forced layouts, which grow with a busy HUD.

## Fixes
| what | why |
|---|---|
| `src/game/gpusweep.js` SCAN_S 1.5 -> 5 | the whole-scene traverse was the biggest single spike (92 ms); the `onBeforeRender` hook already remembers everything drawn |
| `src/core/events.js` | `emit` copied the handler Set (`[...set]`) on every call, i.e. 60x/s for 'update' + every event; snapshot array now cached per event, invalidated on on/off |
| `src/ui/docklayout.js` | rewritten as one read phase + one write phase (was ~20 write-then-read forced layouts per 250 ms); the priority clip no longer strips + re-measures every item (natural heights are cached, only class changes are written) |
| `src/game/objectives.js` `fitAboveDock` | cached dock ref; skipped when rows + limit unchanged (was unhide-all/measure/hide every 0.5 s) |
| `src/game/lore.js` | idle ship-board redraw 0.25 -> 0.4 s (canvas draw + texture upload) |

## Bugs (docs/CRITIQUE_W8.md P14)
- **Objective "Bring scrap 51/44" checked at 0 scrap**: scrap already lying in the ship when the day starts (unsold from before / bought / dev-spawned)
  was booked by the 1 Hz collect pass as "collected today". `host.js` lever now marks in-ship scrap as already collected (no credit to today's haul).
  Probe: 0 / 44, not done, at landing.
- **Credits 60 -> 51 with nothing bought**: it is the casualty / left-behind fine (15 % of 60 = 9; 5 % when the body is recovered), shown only in the
  end-of-day report row "Fines" - which never appeared (next bullet). Now also a chat/sys line `Crew casualty fines: -N` (EN/TR/RU in `facjobs_i18n.js`).
  The facjobs "no progress" fee already had its own toast; nothing else deducts silently.
- **Day report not on screen**: the Morning-Rules vote (`.a1-vote`, z 60) sat on top of the report (`.report`, z 16) in the same top area. `style.css`:
  `#ui.cine-open .a1-vote { z-index: 15 }` (keys 1/2/3 still vote). Probe: `elementFromPoint` on the report returns the report (weak: the probe's fake vote
  div had no algo1 CSS). A harness takeoff is randomly gated by `shipfaults.js` (faults, quota 1), which is why it often produced no summary - not a bug.

## Not verified / remaining
- Before/after spike numbers for gpusweep/docklayout are inferred from the per-handler table, not from two matching runs (the first "before" runs
  timed out on the shared browser lock; the final run has no matching baseline).
- 3-5 s synchronous landing (world gen + shader compile): pre-warm with `renderer.compile` / spread `hostPopulateMoon` over frames - biggest remaining hitch.
- modapi `featureOn` wrappers (63 ms max) and fauna (26 ms max) spikes: identify the wrapped module (probably first-use mesh/material creation).
- Console spam `Oscillator.frequency.value 21096/25087 outside nominal range` (audio node created with a note ~3 octaves too high; the browser clamps it,
  but a console.warn per node is slow). The caller was not caught in 40 ticks; the hook in the script prints the stack if it fires.
- Not audited: net full-state bursts, physics collider rebuilds, GPU memory per landing (gpusweep exists), setInterval pile-up in panels.
