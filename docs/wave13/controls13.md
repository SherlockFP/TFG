# Wave 13 — browser controls

Default crouch is **C**; spell wheel moves from C to **Backslash (\\)**. Movement/gamepad actions continue using saved bindings. Settings schema 4 migrates the former Ctrl/C defaults only when destination keys do not conflict; custom bindings remain intact. A legacy conflict leaves the old pair intact so the player can resolve it in Controls.

Escape repeats are consumed during a game outside text fields. A pointer-lock loss opens pause once; its following Escape key event cannot immediately close that newly opened pause. Intentional pointer unlocks (panels/chat/minigames) do not open a second pause panel. The normal subsequent Escape closes an open panel. Resume uses the existing click-to-resume fallback when the browser refuses pointer lock during Escape's cooldown.

Fullscreen is attempted once per Input session. Exiting fullscreen with Escape and resuming no longer forces fullscreen back on. Browser-owned Escape and privileged shortcuts cannot reliably be suppressed by page JavaScript. C avoids the Ctrl+W crouch/forward collision; cancellable Ctrl/Meta shortcuts are prevented only while pointer is captured and no text field is focused. Existing optional fullscreen Keyboard Lock and leave confirmation remain available.

Validation: `node tools/harness/controls13.test.mjs` passes defaults, migration (custom and occupied destinations), captured Ctrl, text focus, repeated Escape, one fullscreen attempt and intentional unlock. Syntax checked the changed modules. Browser QA still required: hold Escape, release pointer lock using browser Escape, resume click, Ctrl+W protections in target browsers, edited keybinds, and crouch/spell wheel under multiplayer.

QA follow-up: guide EN/TR/RU crouch and spell-wheel hints and Russian manual now match C/Backslash. Late pointer-lock capture after a new panel opens is immediately released; obsolete rejected requests cannot retry after cancellation. The focused controls test also checks late-capture cancellation. Browser privileged Escape remains browser-owned.
