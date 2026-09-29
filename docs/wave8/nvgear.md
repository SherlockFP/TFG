# Wave 8 - nvgear: buyable Night Vision + ship charger ("gece görüşü satın alınmalı, pilli, süreli")

Module `src/game/nvgear.js` (+ pure `nvgear_core.js`), slot `nvgear`. Net messages added: none (prefix `nv` reserved). Test: `node tools/harness/nvgear.test.mjs`, headless `tools/harness/nvgear_body.js`.

## Audit (5 lines)
1. Flashlight (15 cr, 150 s) and Pro Flashlight (25 cr, 300 s) were already in `STORE_ITEMS` and buyable in the shop kiosk / terminal; `walkie`, `boombox`, `jetpack`, `ringlight` also carry `battery`. Nothing forces you to own a flashlight (dark interiors just hurt); the tutorial hints to buy one.
2. Battery = per-item `it.battery` seconds, drained by `actions.updateBatteries` while `it.on` (flashlight 1/s, walkie 0.3, boombox 0.5), owner-side, synced via `itst`; refilled by host `charge` (`host.js`).
3. A charger fixture DID exist (`SPOTS.charger`, wall unit in the galley, `ship.points.charger`) with an instant "Charge X [E]" prompt shown only while holding a battery item - so it was invisible when you had nothing in hand, silent, instant. That is why it felt like "nothing to charge with".
4. Free night vision: `mutations.js` m_nv (random timed good mutation), `pets_net.js` pet perk (night stat), `roledays_core.js` carrier role-day flag, survival potion prop 'night'. All are timed/earned perks, so they stay; goggles are the only permanent, buyable source.
5. No purchasable night vision existed.

## What was built
- **Night Vision Goggles Mk I** (85 cr, 90 s battery) and **Mk II** (220 cr, 240 s, brighter, halves glare). **Spare Battery Cell** (30 cr): LMB refills the emptiest carried battery item by 60%.
- LMB (existing `useItem` flow) toggles. Effect only while the goggles are held and on; swapping/dropping switches them off (no pocket drain). Look: multiplies `uGamma` x1.45/1.6, `uVignette` x0.5, `uSat` x0.35 on the transition (pets_net idiom) + green scanline overlay + slight noise; no THREE lights. Below 15% battery the picture flickers. If the `m_nv` mutation runs, it owns the look.
- Counter-play: `engine.flash()` (stun grenades, camera flash, lightning...) and remote flashlights aimed at you within 16 m white out the goggles for 0.6-3.2 s (Mk II x0.5); `reduceFlash` caps the white-out at 50%.
- Cold: drains 1.5x when warmth < 45 (`game.survival.warmth`).
- **Charger**: same fixture (shiplayout untouched, overlap test stays 0 problems). Interaction now takes 3 s with a progress bar, beeps, cancels if you walk away / swap item; on completion the host `charge` refills (+ spark). A hint prompt ("Ship charger: hold a battery item") shows when you look at it empty-handed.
- HUD: existing hotbar battery bar plus a small held-only readout "NV Mk I - 74 s - ON" (hidden otherwise); progress bar only while charging.
- i18n EN + TR + RU.

## Knobs
`nvgear_core.js`: prices, battery, `CHARGE_SECONDS`, `CELL_FRACTION`, `LOW_BATTERY`, `dazzleSeconds`, `drainMul`.

## Known gaps
Algorithm-glitch extra drain not wired (`drainMul` has the `glitch` input, no reliable signal found); goggles are not visible on the avatar / to other players; cell and goggles battery are owner-authoritative like every other item battery; the store icon uses the generic model render.
