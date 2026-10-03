# Wave31 controls — observed Escape and Ctrl failures

The local checkout started on `main` at
`2718d35c4f373cb4aa251544471892493783e058`, with historical untracked files
already present. Root identified the game source as the published `2e50c8b`
baseline. This agent preserved those files and did not stage, commit, push or
launch a browser.

The existing controls13, escape27 and controls28 checks initially passed. Their
expectations explicitly retained Ctrl interception and the browser-unlock-first
pause. New expectations reproduced three actual failures before production edits:
an involuntary pointer unlock opened pause; an already open pause ignored its
first Escape within the old 250ms guard; and a v4 save with the spell-wheel/C and
custom Backslash conflict retained `ControlLeft` crouch. A separate red check
reproduced Ctrl+W recapturing the mouse. Another reproduced Ctrl+Tab opening the
native Full Status card.

`App.bindKeys` now changes only the resume hint on pointer lock notifications.
Explicit unhandled Escape still opens pause; an existing panel always closes on
its first Escape. The former unlock timestamp exemption is removed. Existing
native panel disposal, terminal handoff, pending minigame results and held-Escape
suppression remain in their original owners.

Input leaves Ctrl/Meta browser shortcuts alone and does not turn them into native
movement. Main's recapture/chat listener and HUDcalm's status listener also ignore
those modifiers. The obsolete fullscreen keyboard lock for browser shortcuts is
removed. Fullscreen is still attempted once on first capture, so recapture does
not force a browser-exited fullscreen view back on.

C crouch and Backslash spell-wheel defaults were already implemented; this round
does not claim to introduce them. Settings v5 specifically repairs remaining
left/right Ctrl crouch saves, moves crouch to C and relocates displaced actions to
an unused non-Ctrl binding. It first prefers the displaced action's default, then
Backslash, unused defaults or a free function/letter key. An unrelated custom
Backslash binding and non-Ctrl custom crouch survive. Drone control help now says
C down in EN/TR/RU, matching its existing native crouch action.

Fresh verification on bundled Node **24.14.0**:

```powershell
& 'C:/Users/Sher/AppData/Local/OpenAI/Codex/bin/node.exe' tools/harness/run_all.mjs -j 2 controls13 controls28 escape27 moonroute30 a11y network27 gear11
```

All **8/8** checks passed in 1s. Syntax checks for input/save/main/escape27/hudcalm
and the scoped `git diff --check` passed. Initial default Node26.7.0 runs passed
the three controls files; moonroute30's final zero-warning assertion failed on
Node26 WebStorage/loader warnings. It passed unchanged under Node24. These runtime
attempts are retained here rather than reported as a game regression.

Evidence is **NATIVE_INTEGRATION** using actual Input, extracted actual
App.bindKeys, UI.closePanel/closeChat, Terminal.close, HUDcalm, native route board,
moon directory and native createMinigame capture/outcome handlers. DOM nodes and
browser lock notifications are fixtures. Generic panel coverage uses the real
shared close lifecycle, but does not construct each inventory/map/codex/wardrobe/
settings/passive-tree/shop content screen separately. Spell/emote/build/vault
branches use API fixtures rather than full world modules. Native menu-room piano,
facility popup variants, cinematic/report/landing overlays, every individual
minigame, real browser fullscreen/F11/Alt-Tab ordering and trusted pointer-lock
cooldowns were not exercised by this agent. Root owns the frozen browser pass,
combined build/full suite and publication; no hardware, human fun or full-menu
browser acceptance claim follows from these checks.
