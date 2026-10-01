# Moon routing and dispatch directory — Wave30

Owner: encounters27. Start: root main `1ac10f8`; root owns combined publication.
Read AGENTS, THEME, Wave29's incomplete first-shift evidence and GAUNTLET. This
task improves route selection; it does not claim completion of the ordinary
surface/facility/cargo loop or an increased human experience score.

## Observed problem and accepted change

The previous terminal joins name, ID, short name and full name into one search
string, then accepts the first prefix/substring result. Many full names and
numeric prefixes already work. Ambiguous abbreviations silently choose a route;
diacritics are not folded, and separate keys can match across joined fields.
MOONS is intercepted by Routeboard's three daily cards, while its all-routes
fallback offers a short text list rather than an informative selection menu.

`moonroute30.js` resolves independent keys, folds case/diacritics/spaces/hyphens,
and prioritizes canonical exact IDs, then exact keys, prefixes and partial names.
Equally good matches produce choices without a request, pending confirmation or
wallet change. A displayed short command is checked against the same live list.
For example, `ROUTE dia`, `ROUTE 56K Dial` and `ROUTE hamsi` identify Dialup;
shared generated/authored code prefixes require a more specific choice.

Explicit `#n` is exclusively a positive existing current-sector slot. `#0`,
`#12`, missing slots and malformed explicit slots never fall through to numbered
moon names. The existing bare 1–9 sector shortcuts remain supported. If the last
displayed sector changes, numbered INFO/ROUTE asks the player to refresh MOONS.
Generated pending confirmations include the sector key; the native host rejects
a delayed confirmation for a different sector before spending. Directory buttons
submit canonical route IDs, never a saved slot number.

MOONS / MOONS ALL / ROUTES and the first orbit terminal visit open a searchable
directory with availability/free/charted/current-sector filters, current route,
actual native Shipyard fee, forecast, native danger label and a selected native
INFO view. It teaches the short command and distinguishes the canonical route
ID. Ordinary facilities show native count/value estimates clearly labelled as
before room capacity, bonus loot and daily events. Special destinations retain
their own installed INFO wrapper. Hidden Dead Letter trial maps are omitted.
`BOARD` retains the original daily three-card menu; `MOONS TEXT` provides a
readable text fallback, and SECTOR retains its map with actual routing fees.

A route button opens the existing terminal confirmation. CONFIRM sends the
existing Session request; the host's ladder, orbit, stale map, deadline, credits,
cycle and onboarding guards still own admission and the single credits balance.
No map, item, quota, cargo, physical access or reward outcome is created here.

## Ownership and integration

- `terminal.js`: resolver callers, choices, directory entry, fee consistency,
  sector-number identity and native delayed-focus guards.
- `moonroute30.js`: pure matching/usable alias logic.
- `terminalmoons30.js`: DOM menu, local restrained CRT CSS, EN/TR/RU labels and
  native data access. Its update/language listeners exist only while visible;
  close/hide remove them. DOM and local style are children of the native terminal,
  so game teardown removes them. It creates no renderer, model, audio or lights.
- `routeboard.js`: narrow directory delegation, explicit legacy BOARD and the
  legacy hide timer's directory-aware focus guard. Host ladder logic is retained.
- `src/ui/escape27.js`: native window capture hides the directory first. A second
  Escape closes the terminal. Existing popup/minigame priority is retained.

Independent review exposed invalid explicit slot fallback and legacy open/mouse/
board timers stealing focus from search. These were corrected before freeze.
The native window capture issue required the named Escape owner above; a local
section key listener alone would not have fixed the real input order.

## Evidence and limits

One focused file, `tools/harness/moonroute30.test.mjs`, uses actual Terminal,
two native Sessions with deterministic in-process wire delivery, installed
Routeboard/Shipyard/Voyage and native ModManager command dispatch on a labelled
command-registry fixture. A pre-existing installed module/profile state supplies
the real Shipyard route fee; the DOM fixture records native callback/focus
behavior. It verifies route confirmation before spend, host/peer balance and
destination agreement, consumed confirmation, authoritative denial, native INFO,
live aliases, diacritics, ambiguity, explicit slots, stale displayed numbers,
delayed sector confirmation, menu search, focus timers/mousedown, EN/TR/RU labels,
legacy BOARD/TEXT dispatch, visible-listener removal and real Escape capture with
native Input state. No browser, world landing or network service is involved.

Retained first-run failure `/tmp/tfg-moonroute30-native-first.log`: an assertion
incorrectly assumed the live numeric prefix 12 was unique; the generated sector
shares it and correctly produces choices. The corrected fixture tests both a
unique numbered prefix and actual competing live codes. The fourth log retains a
cleanup fixture error calling a nonexistent Input.destroy after successful
assertions; native Input registers no listeners with this fixture's inert global
target. The fixture cleanup was corrected; game input was not changed for it.

Focused result: **PASS**, `/tmp/tfg-moonroute30-native-final.log` (about 0.36 s
local native process, not a hardware performance profile). Adjacent native
Routeboard passes 145 checks in `/tmp/tfg-moonroute30-routeboard.log`; existing
Escape passes in `/tmp/tfg-moonroute30-escape.log`. The final combined suite,
production build and fresh small-screen directory/browser input remain root/QA
responsibilities. This owner performed no browser or Git mutation.
The same focused file also verifies that MOONS TEXT reveals text from an open
directory and a true DOM-free MOONS command uses native text output.
