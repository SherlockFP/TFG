# Wave31 — critical normal-game repairs

2026-10-03. Published baseline `2e50c8b588343769fbc9e10cfada24be62bba189`.
Owner's latest experience assessment is **1/10**; earlier 5/10 source reports
are historical. This wave implements request section 1. Performance, art,
first-shift design and physical casino rebuilding remain subsequent waves.

Initial local HEAD was `2718d35`; the files matched published Wave30 apart
from 99 historical extra artifacts/file mode differences. A temporary-index
tree preserves the original snapshot. Root aligned main/index to origin/main
without changing working files. Historical screenshots, tool files and local
artifacts are excluded from the publication.

Implementation plan (existing flows, no new gameplay systems):

- Root: retire title/Host/pause/ship/automatic/direct Dead Letter admission.
  Preserve legacy active-session load, checkpoint return and migration.
  Replace start-dependent historical fixtures with explicit saved-session setup.
- Market agent: reproduce local follower-claim purchase; implement host decision,
  native payment and equipment delivery, correlated receipts and replay protection.
- Controls agent: reproduce unlock-first pause; make Esc the sole menu owner,
  migrate remaining Ctrl crouch to C and remove browser shortcut interception.
- Commerce agent: reproduce duplicate industry requests and repeated trade-in
  consumption; repair native preflight and existing order ledgers.
- Root: focused checks, frozen-source browser input, independent review, final
  shared-contract suite/build/diff check and authorized main commit/push.

Ownership is by the listed files/functions; only root stages and publishes.
Source changes are reviewed against origin/main, with CRLF noise excluded.
The default runtime is Node26.7.0; final verification uses bundled Node24.19.0
because Node26's WebStorage/loader warnings trip a zero-warning regression.
The Linux Node22 activation path is unavailable in this Windows checkout.
Root owns the dev server at localhost:5174 and the sole browser check.

Acceptance: no new mode admission; exact saved cargo/economy restore; successful
transactions debit/deliver once; rejected/disconnected requests give clear feedback;
first Esc closes the visible UI; lock/fullscreen events never open extra menus.
Native/fixture evidence, guided browser evidence, blind-human fun and hardware
profiling are reported separately. No improved experience score is claimed.

Independent review: [combined contracts](REVIEW.md), [controls](controls-review.md).
Implementation evidence: [market](market.md), [commerce](commerce.md),
[controls](controls.md). Frozen guided browser evidence is in [PLAYTEST](PLAYTEST.md).
The source freeze and final command outputs are retained alongside these reports.
Inspect Git for the publication SHA; pushes target `origin/main`.

## Final verification

- Frozen focused native contracts: **19/19** passed (Node24.19, 3s).
- Final full native suite: **263/265**, 135s, `-j 4`, exit 1. Exact output:
  [full-suite.txt](full-suite.txt). `carry2` passes its assertions then aborts
  in Windows libuv; `outdoor30_staged` fails its historical geometry oracle.
  Both failures reproduce on untouched published `2e50c8b` with the same
  Node24.19/dependencies: [baseline-failures.txt](baseline-failures.txt).
  This wave does **not** claim an entirely passing suite.
- Initial full run was 262/265. Its third failure was the historical blanket
  follower no-decrement source guard. The owner explicitly requested paid
  Phish purchases, so only the exact host market module is now exempt. Other
  milestone/pet/cosmetic guards remain, the focused test passed and the separate
  commerce reviewer accepted this narrow contract update. The repeat full
  run above includes it. [Initial output](full-suite-initial.txt) is retained.
- Production build passed (2.23s): [build.txt](build.txt). Existing ineffective
  dynamic-import and native-config warnings remain. Build success does not
  establish loading speed, atmosphere or hardware performance.
- Guided real market UI: 3000 -> 2880, one shovel, successful host receipt;
  first Escape closes the panel. [PLAYTEST](PLAYTEST.md) lists setup, discarded
  attempts, the unattributed observer diagnostic and unverified browser cases.
- Independent review found no outstanding scoped P1/P2 after fixes. No source
  file changed after the browser freeze; the later edit corrected only the
  historical follower test contract and reports. Staged diff whitespace check
  is required before commit. Only explicit Wave31 paths are staged.

Next wave: measure natural dock -> moon -> facility first/repeat loading before
changing performance behavior; investigate the browser observer diagnostic and
the two baseline native failures. Internet/voice testing and art recovery remain
open. The latest experience rating stays **1/10**.
