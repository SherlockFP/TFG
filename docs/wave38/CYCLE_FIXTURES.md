# Wave38 native departure timing in historical cycle fixtures

Full-suite failures reproduced directly: `cycle2_flow` stopped at undefined `MOONS.core0.interior`; `cycle3_flow` stopped at null facility layout. Both were downstream of the same stale fixture assumption. Their helper called the actual `hostBeginTakeoff('lever')` and advanced8 seconds, which previously covered the7-second takeoff. Wave38 now deliberately requires an8-second crew departure warning before that existing7-second flight. The old fixture asserted orbit/quota/core admission before native takeoff had finished.

Only the explicit lever-departure waits in those two fixtures now advance16 seconds (8-second warning +7-second flight +1-second timer-step tolerance). Native host methods, countdown callbacks, cycle wrappers, quota/instance registration, boss/grace/raid/endless outcomes and random-operation invariants remain in use. Wipe/recall/fired/landing timers are not shortened, skipped or replaced; unrelated9-second waits retain their original purpose. No production change was justified by these failures.

Focused `cycle2_flow` and `cycle3_flow` both pass (`-j2`,17s; cycle2 about17.2s, cycle3 about2.5s). These fixtures use real host/cycle glue and real layouts/NavGrid, with their historical fake engine/items/players/physics/net; they do not establish rendered controller play or browser quality.
