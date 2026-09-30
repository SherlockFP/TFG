# Company 13 — Content Clearing Exchange

A staffed content exchange district replaces the slot-machine corner: freight lanes lead to the preserved rear sales counter, archive stacks frame the skyline, contract services occupy a sheltered eastern annex, and the casino is an enclosed western venue. Procedural staff explain both the sale loop and Algorithm discipline. Physical signs register EN/TR/RU and repaint on language change. No THREE lights are added; static construction remains batched.

Casino owns interior fixtures; `company.casinoSpace` exposes bounds x[-40,-18], z[-34,-12], floor -1.25 and south entrance (-29,-1.25,-12), width 6m. Original casino machines are removed. `slots` remains an empty compatibility array. `dropZone`, sell bell, market, fishing and existing return contracts are preserved.

Coordinator integration: import `installCompany13` from `./company13.js` into game.js and call `this.useModule('company13', installCompany13)` after other hostSell wrappers. No host.js edit required. Requests use prefix `c13talk`; no reused generic net handler.

Bell discipline is authoritative, proximity checked and specific to the ringer. Successful delivery clears irritation. Four empty calls warn; six pause that ringer's bell for eight seconds. No damage, scrap loss, economy penalty or collective crew lockout. Time decays empty-ring count (one per eight seconds). State lives in run.company13 and migrates with the host; wall-clock deadlines cannot become permanent after migration. Off-company update clears it. NPC interactions also validate alive player + proximity.

Validation: focused Node discipline check covers warning, cooldown duration, decay and successful-sale reset; JS syntax checked. Browser geometry/access and multiplayer not yet verified; coordinator owns browser schedule. District currently lacks queue animations and delivery manifest UI, and architecture quality still needs visual review.

## Follow-up review

Real company builder verified under the existing harness canvas stubs: 104 static colliders, 17 pooled emitters; freight-to-bell, casino south entrance, service annex and industry stall routes pass sampled character-radius collision checks. Drop zone is (-0.15 y, -35.8 z), correctly 1.1m above the -1.25 floor. All registered colliders and emitters are removed on dispose. Service avatars now explicitly dispose their private appearance resources before freeTree.

Service NPCs breathe through avatar idle animation, turn toward nearby players, occasionally greet with a short wave, and change facial expression; the auditor visibly reacts to irritation. The clerk reads existing authoritative run.contract progress and completion instead of opening another UI or creating another contract system. Contract acceptance remains governed by the existing ship system.

Industry stall clear pad: x[17,23], z[9,14.5], ground -1.25. Decorative crates moved from (20,12) to (30,18). Suggested NPC/stall center (20,-1.25,12). Runtime moving NPCs outside their workstation is deferred: static collision-safe service stations are preferable until browser review.
