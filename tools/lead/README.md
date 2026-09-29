# Lead tools (multi-agent merge workflow)

- `merge_agent.sh <branch> <module> [test files...]` — merge a finished agent worktree branch, auto-resolve `.md` conflicts (union) and `src/game/game.js` slot conflicts, drop leftover placeholders, `node --check` changed files, run the given `tools/harness/<test>` files, `npm run build`, then push to the work branch AND `main`. Stops (exit 1) on any real code conflict or failure — resolve by hand, `git add`, then re-run with an empty branch: `merge_agent.sh "" <module> tests...`.
  - NOTE: pushes to `main` (the owner's rule: everything goes to main; Render deploys main). The commit trailer inside is this session's; update it for a new session.
- `union_md.py <file>` — resolve git conflict markers in a Markdown file by keeping both sides.
- `resolve_gamejs.py` — resolve `game.js` conflicts: keep HEAD, put the agent's `import { installX }` / `this.useModule('X', ...)` lines into their `// [import:X]` / `// [slot:X]` placeholders.
- `agent_rules.txt` + `agent_test_rules.txt` — the shared rules given to every Sonnet sub-agent (module pattern, net prefixes, i18n, UI, budget, docs, commit-don't-push; short batched browser tests). Point each agent at them in its prompt.
See `docs/HANDOFF.md` §6 for the whole workflow.
