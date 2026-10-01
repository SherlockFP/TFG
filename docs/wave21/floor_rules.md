# Descent21 deterministic floor planning

The pure planner exposes floorSpec(moon, baseSeed, depth=0), descentDepth and discoveryThreshold. Depth zero is the first floor, with the destination's native interior, a quiet rule, two living-threat slots and no new-rule slot. Later floors change among existing native interior themes, including Thread Archive and Buffer Foundry. A seeded rule describes archive distribution, acoustic attention, inspection or heavy processing; these are integration hints, not mandatory minigames, invented rewards or claims that mechanics already execute themselves.

The spec uses logarithmic progress and fixed upper bounds: size1.35, tier6, loot24, value multiplier1.8, living threats6, threat power1.8, HP1.6, damage1.3 and speed1.1. Absolute planned combat caps are40 damage and6.8m/s; native host integration must enforce these after all sector/difficulty scaling while retaining native damage gates and windups. These numbers are a bounded depth plan, not a long-session human balance rating.

New-rule eligibility expands from zero to one at depth3 and two at depth6. Tracking Pixel and Buffer Brute never share a spec. Existing native quota, headline, power and active-encounter gates still apply: descending must not impersonate earned run quota or bypass species restrictions. The first deep candidates are only eligibility lists; they are not extra scripted spawn commands.

Discovery uses the smaller of15 and the actual ordinary-room count. Zero means the lift is unavailable, not an automatic completed threshold. Every real floor has its own hash seed; depth is clamped to a safe integer while still supporting trillion-scale floor indices. Loot planning only provides finite counts and value multipliers: native physical salvage, identity, sale and floor-completion ledgers own grants and duplicate prevention.

The text module exports descentRuleText(rule, language) for EN/TR/RU without browser or global translation side effects. The native integration owns when to show the one floor instruction.

Validation: three actual native moon definitions over650 floors each plus10000,1e9,1e12 and MAX_SAFE_INTEGER verify deterministic seeds/specs, native sectorScale/capHit compatibility, retained player sprint advantage, monotonic bounded curves, theme/rule coverage, family exclusion, safe discovery and translated text. Pure tests cannot prove live floor streaming, carried-item persistence, physical lift access or reward-ledger correctness; those belong to root's integration tests and shared QA.
