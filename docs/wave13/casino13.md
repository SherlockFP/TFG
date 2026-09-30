# Dead Signal Club

Install in game.js: `import { installCasino13 } from './casino13.js'`; `this.useModule('casino13', installCasino13)`.

The company builder owns the enclosed venue and exposes `company.casinoSpace` (`center`, `groundY`, `bounds`, `entrance`). This module installs four physical stations inside: cashier Mica, Signal Reels, Zero Wheel dealer and Packet Broker. Low-poly NPC clerks stand behind their counters. E opens a station-specific panel. EN/TR/RU labels and dialogue are module-owned.

Credits are the shared crew currency; chips are peer-specific and bought 1:1. Buying spends crew Credits; redemption returns them. No free chips, login gifts or local-only prize money. The previous `lethal-casino` built-in id stays compatible but its outdoor table and free 500-chip wallet are retired; the company agent removes the old scattered slot props.

All requests go to the host. Host validates living peer, company phase, matching physical station and <4m distance, then rate limits. Wallets and pending rounds travel in `run.casino13` for saves/migration. A monotonic per-wallet sequence rejects replay. Atomic mutations forbid invalid amounts, cross-table games, concurrent pending rounds and double redemption/cashout. Bet sizes 5/10/25; chip ceiling 100000.

Games:
- Signal Reels: six symbols. Triple ordinary pays 6x, triple SIGNAL pays 12x, matching first pair pays 2x.
- Zero Wheel: 37 pockets, 18 red/18 black/one zero; red/black pays 2x including stake.
- Packet Broker: risk the pot for doubling with visible sequential 65%/55%/45% chances, or bank now. Three pushes maximum. Pending packets survive closing the panel and can be banked by returning to the broker.

Verification: `node tools/harness/casino13.test.mjs` checks atomic ledger flow, replay, independent peers, active-round guard and double cashout. Node syntax checks passed. Browser placement and multiplayer interaction await lead's shared browser pass. Panels now use shared cp-head/cp-body/cp-foot spacing. Bounded reel/wheel/packet feedback animates while awaiting the host; authoritative results reveal after 450ms, with localized dealer reactions and UI sound. Motion reduction reveals immediately. Timers stop on timeout/disposal; outcomes remain exclusively server-set. Co-op spectating is future polish. Casino play spends real run Credits and does not advance extraction quota. The club is company-only, not at every moon or hub.
