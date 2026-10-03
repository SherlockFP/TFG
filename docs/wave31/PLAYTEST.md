# Wave31 guided browser evidence

2026-10-03, Codex in-app Chromium, localhost:5174, protocol 0.12.4.
Source frozen in `source-freeze.json`; HMR disabled and checks used fresh pages.
One root browser owner; browser sessions closed before the final CPU-heavy suite.

This is **GUIDED_INPUT with SETUP fixtures**, not a blind human playtest.
The committed dev-only `test/critical31.html` labels every setup. It autohosts
an isolated local room, uses native fleet purchase/boarding requests, native
landing/Company phases, places the actor near the real counter and supplies
level 50 / money 3000. It does not inject successful market outcomes, bypass LOS,
replace the payment service or drive a second simulation clock. Rewards and
starter equipment are fixtures, not a claimed naturally earned progression.

## Observed

- The normal fresh title lacks Dead Letter; actual Host options are Campaign
  and Quick Shift. Local network selection was available. No complete natural
  shift or human menu-discovery claim follows from this observation.
- With Company setup complete, the real market showed money 3000 and Shovel
  price 120. Clicking its actual BUY button showed "Bought and delivered."
  Money became 2880, ownership gained `shovel`, loadout became `shovel`, and
  native ItemManager held exactly one shovel (`icg`) for the host. A starter
  pipe (`ib6`) was also present after the existing loadout request.
- The first Escape closed the market. The native inspection showed
  `panel:false`, `locked:false`, crouch `KeyC`, unchanged paid balance 2880
  and the same held shovel. It did not open pause. The saved screenshot
  `market-browser.jpg` shows the successful receipt and deducted balance.
- A later attempt to press Escape after expanding the diagnostic JSON failed
  at the automation selector deadline. It is not counted as a second browser
  pause check. Native controls tests cover the pause/menu lifecycle separately.

## Failed setup and remaining limits

The first fixture skipped native boarding; its direct Company phase left the
dock world loaded. The next fixture boarded but still skipped the native
landing phase that constructs Company. Both were discarded setup attempts.
The final fixture uses landing then Company and produced the observations above.
These attempts do not establish a broken natural travel route.

The browser captured one unhandled `MutationObserver.observe` TypeError with no
source URL. Its origin is not established; it remains a browser diagnostic to
investigate in the next loading/profile wave. It did not prevent the verified
purchase and first-Escape actions. This report does not claim zero browser errors.

Host/peer replay, lost acknowledgement, delivery failure, full inventory, funds,
stale messages and successor promotion were native Session/Rapier integration
fixtures, documented in the module reports and independent review. No real
Internet reconnect/migration, voice permission/audio, browser fullscreen/Alt-Tab,
representative hardware FPS, full menu catalogue, bag-fallback playthrough or
new-player discovery was verified. The owner's **1/10** experience score remains.
