# Wave 14 gauntlet findings

Fixed in source and checked through the actual affected module:

| Finding | Correction | Evidence |
| --- | --- | --- |
| Dock chest handler assumed expedition terrain.distToPath | Social dock has no expedition chests | dockloot14 regression and fresh browser startup |
| Dock radar assumed outdoor.mainExit.pos | Radar tolerates absent exit and still draws ordinary moon exits | Actual ShipScreens.drawRadar regression; fresh browser zero runtime errors |
| Workshop controls cached hidden company group's y=-260 transform | Live world-position getters | Actual hidden→visible transform fixture; E-held calibration and parcel collection agree on two tabs |
| Initial shelter floor probes used stale Rapier queries at mapLoaded | Build after two moon physics updates, at most six retries; never rebuild an occupied shelter | Real factory1235/Rapier regression and three physical alcoves in browser |
| Fleet boarding console pointed into a collider | Office-facing console point | Natural keyboard/mouse/E purchase and boarding |
| Tutorial still instructed disabled terminal equipment purchase | Physical broker/TOOLS/collection directions, live price/remapped key and owned-lamp handling | guide 2158 checks and readability14; final browser copy capture in PLAYTEST |
| Four-line teaching objective competed with danger | Existing objective selector defers teaching rows while retaining warnings and return goals | readability14/onegoal regressions and QA capture |
| Workshop visible controls required tiny precise ray target | Target radius .28→.45 with unchanged reach/host validation; numbered bays | Actual module fixture |
| Pursuit recording could reward a target never seen, or briefly reacquired in search | Require genuine prior AI sight and six seconds continuously unseen | Actual AI failure/success regressions and genuine sight→physical E hide→single claim browser fixture |

Still unresolved: an intermittent feedback-loop warning was retained from an earlier software-WebGL feature run. Source audit found no concrete render-target sampling cycle. Narrow fresh mirror-framed orbit/moon traces covered 710/1285 draws without INVALID_OPERATION; those absences do not establish a global fix. Do not remove reflection or modify post rendering without a responsible draw/material.

Evidence limits: debug boss damage is not fair-combat validation; paced simulation and debug placement are not a natural full expedition. CPU fixture timings are not hardware FPS. Two local BroadcastChannel peers are not a long human Internet session. See PLAYTEST and REVIEW for the next checks.
