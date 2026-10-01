# Wave27 — Escape closes the active UI first

The reported issue was reproducible from source routing: the game-level Escape
listener skipped focused inputs, while skill-tree/record forms stopped bubbling.
Ordinary panels therefore behaved differently depending on focus. Spell/build
capture handlers could cancel their selection and still let the same event open
pause. The input listener also saw ordinary panel Escape before the game router.

`src/ui/escape27.js` owns capture for dialogs, rebind capture, chat and native
panels, including focused forms. It invokes existing close/cancel APIs and consumes
the gesture before gameplay input. A store close callback may restore the terminal
without the same Escape closing that terminal. The terminal route board closes to
the prompt first. Spell/emote/build selection cancels without casting/playing or
opening pause. The native vault-code popup exposes its open/close API so browser
pointer unlock cannot open pause over it; Escape invokes its existing cancellation.
Pause is only the unhandled bubble fallback.

Native minigame and capture-popup handlers remain responsible for their outcome.
In particular Escape flushes a finished minigame's pending result rather than
discarding it, and live cancellation follows the original native callback. IME
composition is not interrupted by the router. Held Escape does not cascade.

The browser can still release pointer lock or fullscreen with Escape. Application
code cannot guarantee suppressing that privileged browser action. The existing
unlock-first pause guard remains, and unlock does not open pause over registered
dialogs or wheel/build selection. Pointer recapture uses existing close APIs and
the click-to-resume fallback.

Focused verification executes actual Input, UI.closePanel/closeChat, Terminal.close
and native createMinigame handlers using a labelled DOM/event fixture with capture
ordering. This is NATIVE_INTEGRATION; it is not a browser/fullscreen gesture proof.
Final current-source `escape27.test.mjs` and existing `controls13.test.mjs` both
passed on Node22; syntax and scoped diff checks passed. First current-UI attempts
were setup-blocked while the concurrently authored network27 import target did not
exist. A temporary baseline-UI replay then found a fixture mistake (`mg.destroy`
instead of the native `mg.api.destroy`); that fixture was corrected. The final
committed harness imports the real current UI and retains the native minigame
pending-result/cancellation checks. No browser was launched by this agent; root
owns the final combined build, publication and any browser evidence.

The final review made route-board visibility explicit in the shared layer predicate.
The native board already requires an active terminal, so it was protected by that
terminal gate. The focused regression now mounts the actual installRouteboard DOM,
checks that the visible board blocks unlock pause, closes it to the still-active
prompt with one Escape, then closes that prompt with the next. This replaces the
earlier board stub and proves the native visibility/close callback contract.
