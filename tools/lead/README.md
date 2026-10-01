# TFG lead workflow — current cloud checkout

The authoritative process is [docs/GAUNTLET.md](../../docs/GAUNTLET.md), updated2026-10-01. Start with the current cloud preface in AGENTS.md/CLAUDE.md, not historical Windows or Claude worktree instructions.

Agents share /workspace/TFG. Assign file/function ownership before editing. One independent browser owner uses /tmp/tfg-browser.lock; root owns combined review, commit and the already-authorized main push. Scope work by player behavior and explicit acceptance, not by module count or a requested score.

- agent_rules.txt: current shared implementation boundaries.
- agent_test_rules.txt: current evidence, targeted checks and browser constraints.
- merge_agent.sh: retired fail-fast entry point. It performs no Git/build/test/network mutation. The old hardcoded branch/session auto-push is no longer valid.
- union_md.py / resolve_gamejs.py: retained historical helpers, not automatic conflict-resolution policy. Review real code and contradictory documentation manually.

Node22: source /workspace/.tfg-tools/activate.sh. Run relevant npm test -- -j 4 <filters> and npm run build; HMR is off, so browser checks use fresh pages. See the Gauntlet document for source freeze, evidence labels, short justified bug reruns, full-first-floor acceptance and publication verification.
