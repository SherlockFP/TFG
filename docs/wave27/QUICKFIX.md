# Escape and connection follow-up — separate publication

2026-10-01. The owner requested a quick separate main commit while the salvage
content round continued. This commit contains only input/UI/connection changes
and the existing facility popup's open/close API. Its protocol remains0.12.2;
it does not depend on the pending Wave27 content installers.

Escape closes the foremost dialog, focused panel, chat, terminal board/prompt or
selection before pause. Native minigame cancellation and pending results retain
their existing owner. Browser fullscreen/pointer-lock release is still controlled
by the browser. See [controls](controls.md).

Settings → Network exposes matching lobby strategy, credential-free connection
diagnostics, optional browser-local TURN configuration and an isolated-session
retry. Bad stored relay entries no longer break configuration. A working link is
preserved, and signalling restart is reported separately from peer admission.
See [network](network.md). No live external TURN credentials were available;
strict NAT access and real Internet reliability remain unverified.

Root verification used a fresh archive of main plus the exact staged quick-fix
patch, with the existing dependency installation linked into that private
snapshot. Eight focused native files passed in16s, including actual Session,
Trystero configuration, UI routing/relay cleanup, join links, ordinary facility
jobs and the Turkish casing guard. Production build passed in2.26s. Staged diff
checks passed. Logs: `/tmp/tfg-quick27-exact-tests.log` and
`/tmp/tfg-quick27-exact-build.log`.

The separate combined content-tree suite first passed251/252 in254s. Its sole
failure was the newly introduced raw mode-label uppercase call, corrected to
explicit English casing for transport identifiers. That guard and related
checks passed afterward. This initial failure is retained; it is not described
as a full green run. The exact quick-fix snapshot above already includes the fix.

Browser evidence is recorded separately in the later Wave27 PLAYTEST. Native
fixtures do not establish browser fullscreen behavior or Internet co-op.
