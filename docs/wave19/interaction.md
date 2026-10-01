# Wave19 hidden point-label selection

`actionMethods.findInteraction` previously selected the closest eligible point before resolving its label. When that winning label function returned null, the selector returned no prompt and discarded the next valid point. The same failure occurred for empty/invalid labels even when a usable station was in reach and line of sight.

Selection now resolves a label only when the point can beat the current score and passes the existing geometric/LOS rules. A nonempty string is required before the candidate becomes the winner. The resolved winning label is cached rather than called again; detail/sub functions remain lazy and run only for the final winner. There is no extra list allocation or candidate re-sort, no change to distance/perpendicular scoring or tie order, and no general preference between food/RPS/other stations. Native physics item and door priority and deliberate `noLos` points retain their existing behavior.

The regression `tools/harness/interaction19.test.mjs` installs the actual Food and Incubator modules and captures their authored positions/radii/reaches/actions. An explicitly labelled dynamic-hide fixture changes the real Incubator point's supported function label to null while the real mess table remains behind it. The actual selector fails before the fix (`/tmp/tfg-interaction19-before.txt`: expected table prompt, got no prompt) and passes afterward. Tests also cover static/function empty or invalid labels, contender order, once-only label evaluation, lazy details, LOS/noLos and item/door priority.

Audit limit: Voyage's internal recorder/log/relic and inactive mission label functions can return null, but its current emission hook already resolves and filters them. This is a proven core interaction-contract defect, not a claim that current Voyage stations reproduce it during native play. The station fixture is source-guided selector evidence, not a browser interaction claim.

Validation: `source /workspace/.tfg-tools/activate.sh; node tools/harness/interaction19.test.mjs` passes. No food, RPS, wallet or station gameplay module was edited for this fix.
