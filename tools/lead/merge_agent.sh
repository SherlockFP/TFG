#!/bin/bash
# usage: m.sh <branch> <name> <test files...>
cd "$(git rev-parse --show-toplevel)"
S=$(dirname $0)/union_md.py
B=$1; N=$2; shift 2
[ -n "$B" ] && git merge --no-edit $B >/dev/null 2>&1
bad=0
for f in $(git diff --name-only --diff-filter=U); do case $f in *.md) python3 $S $f;; src/game/game.js) python3 $(dirname $0)/resolve_gamejs.py || bad=1;; *) echo "CODE CONFLICT $f"; bad=1;; esac; done
[ $bad = 1 ] && exit 1
# drop leftover empty placeholders for this module if the module is wired
if grep -q "useModule('$N'" src/game/game.js; then sed -i "/^\/\/ \[import:$N\]\$/d; /^    \/\/ \[slot:$N\]\$/d" src/game/game.js; fi
git add -A
git diff --cached --quiet || git commit -qm "Merge $N (wave 4)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AFt3mbxtTU1FfiT1N1A1YL"
for f in $(git diff --name-only HEAD~1 HEAD -- 'src/*.js'); do [ -f $f ] && { node --check $f || { echo FAIL $f; bad=1; }; }; done
for t in "$@"; do timeout 300 node tools/harness/$t >/tmp/tfg_merge_test.log 2>&1 && echo "ok $t" || { echo "TESTFAIL $t"; tail -5 /tmp/tfg_merge_test.log; bad=1; }; done
npm run build 2>&1 | grep -qE "✓ built" && echo BUILD_OK || { echo BUILD_FAIL; bad=1; }
[ $bad = 0 ] && git push -q && git push -q origin claude/focused-hawking-32j4um:main && echo PUSHED $(git log --oneline -1)
