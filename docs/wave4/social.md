# Wave 4 - SOCIAL (module `social`, hub service `src/net/hub.js`)

Owner request: a place where all players can gather, form crews, make friends, invite each other, send private messages, and a radio / phone during runs.
Constraint: P2P only, no server. This is the lightweight version: a global presence room + hub panel + DMs + invites + a walkie text radio + a ship "phone" notice.

## What exists
| Piece | File | Notes |
|---|---|---|
| Pure logic (node-tested) | `src/net/hub_core.js` | presence table + expiry, beacon / DM / invite validation, text sanitiser, rate limiter, friends, DM history, `/w` nick resolution |
| Hub service (lives on the App: `kefal.hub`) | `src/net/hub.js` | separate Trystero room `tfg-hub-v1` (same app id, same strategy as Settings > network), beacons, DM, invite, friends, blocks, history |
| Hub panel + menu-side notifier | `src/ui/panels/hub.js` | CRT panel: tabs ONLINE / LOBBIES / FRIENDS, player card (avatar), DM window, privacy switches; toasts with Join / Decline |
| In-run module | `src/game/social.js` | ship phone HUD notice, walkie text radio, chat commands |
| Strings (EN / TR / RU) | `src/net/hub_i18n.js` | registered on import |
| Tests | `tools/harness/social.test.mjs` (node), `tools/harness/wave4_social.mjs` (2-3 headless pages) | |

The hub is on the App, not on `Game`, because it must work in the main menu where no game exists. It follows the app state: `ctx = 'menu'` when there is no game, `'run'` while the
`social` module is installed (module install -> `hub.setContext('run', game)`, dispose -> `'menu'`).

Shared-file edits (all marked `[social]`): `main.js` (import, `installHub` after boot, `hub.sync()` in `applySettings`), `game.js` (import + `useModule('social', installSocial)`),
`crtmenu.js` (menu item `HUB`), `ui.js` (import, `screen_hub`, screen label, Settings > Gameplay "Social hub" checkboxes).

## How to use it (player view)
- Main menu -> **HUB** (CRT item between PROFILE and CHARACTER). ONLINE lists everybody whose beacon arrived in the last 30 s, LOBBIES lists public lobbies shared through the hub (Join = the
  normal join flow, password dialog included), FRIENDS lists saved friends (online first). Pick a player: ADD FRIEND / REMOVE FRIEND, INVITE (while you are in a lobby), JOIN LOBBY, BLOCK, and a DM box.
- **Invite**: sends `{lobby code, lobby name, locked?, network}` (never the password). The receiver gets a toast with Join / Decline (menu) or a phone notice (in a run: `/accept`, `/decline`).
  Accepting from inside a run asks to leave the current lobby first.
- **Phone** (in a run): a small fading notice in the left HUD dock for incoming DMs (`/r <text>` replies), invites (`/accept` / `/decline`) and radio lines, plus a dim "PHONE: n unread" line.
  Chat commands: `/w <name> <text>`, `/r <text>`, `/invite <name>`, `/accept`, `/decline`, `/hub` (opens the panel in the pause overlay).
- **Radio** (in a run, uses the existing walkie-talkie item): with your walkie turned ON, press **`** (Backquote) or type `/rad <text>`; the line goes ONLY to the tuned crewmate
  (direct WebRTC send, never broadcast, never relayed) and shows in their phone notice + chat log as `[RADIO]`. `/tune <name>` picks the crewmate (with exactly one other player it is automatic; a
  caller is auto-tuned when you have nobody). The receiver also needs an ON walkie, otherwise they only hear static. The Backrooms have no signal (`game.hasActiveWalkie` is already patched there).
  Voice over the walkie is the existing walkie voice path in `net/voice.js` (nothing new).

## Privacy: what leaves your machine
Hub room `tfg-hub-v1` (everybody in it is connected to everybody, like the lobby-discovery room; WebRTC reveals your IP to those peers, the same as when you join any lobby):
- **Presence beacon `sop`**, every 10 s and when a peer joins (~0.4 KB): stable profile id (`profile.id`, random, created on first launch), nickname, 258-char avatar string (16x16 thumbnail, no snapshot PNG),
  level, status (`menu` / `lobby` / `run`), game version, and - only if you HOST a lobby that is announced publicly AND "Share my public lobby" is on - `{code, lobby name, players, max, locked, network}`.
- **DM `sodm`** / **invite `soinv`**: sent only to the one peer you chose. Text is sanitised and capped at 240 chars. No password, no save data, no run chat, no position, no inventory.
- **`sobye`** when you leave the hub. Peers also drop you 30 s after your last beacon.
- Nothing is sent when Settings > Gameplay > "Join the hub network" is off (default ON). "Stay in the hub during a run" (default ON) keeps DMs / invites / phone working in a run; turn it off and the hub
  is only connected in the menu. In the panel: "DMs: everyone / friends only / off" (default everyone) and "Share my public lobby".
- Stored locally: `profile.friends` `[{id, nick, added}]` (max 100), `profile.socialBlocked` (ids, max 200), `localStorage['tfg.social.dm.v1']` = last 50 DM lines per FRIEND only (non-friend chats live in memory
  only, 100 lines). Blocked ids are hidden and their messages / invites dropped.

## Safety limits
- Beacons faster than 2.5 s per peer are dropped; presence table capped at 120 peers; beacon fields are validated (id charset, nickname through `cleanName` + slur filter, avatar format, lobby code `[A-Z0-9]{4,8}`).
- DM out 4 / 8 s, DM in 5 / 8 s per peer, invites out 3 / 20 s, invites in 2 / 30 s per peer, radio 5 / 8 s each way. Excess is dropped silently.
- All incoming text is written with `textContent` (panel, toasts, phone, chat line); the sanitiser also strips control / zero-width / bidi-override characters and clamps length without cutting a surrogate pair.
- Every hub failure (relay down, join throws, peer garbage) is caught; `install` / `sync` / `start` never throw into the game. Failed joins retry 3 times slowly (45 s, 90 s, 135 s).

## Extension point (for other modules, e.g. arcade "play with a friend")
`app.hub.registerAction({ id, label, enabled?(entry), run(entry, app) })` adds a button to the selected online player's card (returns an unregister fn); mods can instead push into the list
of the `socialAction` event (`mods.on('socialAction', (list, entry, app) => list.push({...}))`, fired each time the card is drawn). `entry` = `{ id (stable), n, peerId, st, lv, friend, lb? }`.
`hub.sendDm(entry.id, text)` / `hub.transport.send({t:'so...', d}, entry.peerId)` are available for the action's own signalling (send a unique `so`-prefixed type; unknown `so*` messages from a peer that has a beacon arrive as `hub.on('msg', (m, fromPeerId) => ...)`, after which nothing is validated for you: sanitise yourself).

## Knobs
`HUB` in `hub_core.js` (beacon period, stale time, limits), settings keys `hubEnabled`, `hubInRun`, `hubShareLobby`, `hubDm` (`all|friends|off`), `RADIO_MAX` / `RADIO_KEY` in `social.js`.

## Tests
- `node tools/harness/social.test.mjs` - presence expiry / eviction / flood drop, DM + invite rate limits, sanitising, validation, friends, history trimming, `/w` resolution, translations.
- `node tools/harness/wave4_social.mjs --port <vite port>` - Alice + Bob in one browser (BroadcastChannel `local` network): presence, friend, DM, rate limit, XSS text, invite toast -> Join into a real
  hosted lobby, phone notice, walkie radio, chat commands, and a third page on the default online strategy (no relay reachable in a sandbox) proving the hub degrades silently and the game still starts.

## Verification status
Node test passes (`social.test.mjs`, 76 checks), `npm run build` passes. `wave4_social.mjs` ran once in full on the local transport: presence, friend + DM + rate limit, invite toast -> Join into a hosted lobby, phone notice, walkie radio, all 8 chat
commands, and a page on the default (unreachable) online strategy started a game with no page errors (WebSocket relay failures are only browser console noise). A second run showed the panel layout; the fixes made after it (tab row wrapping, toasts moved to the
left, wider panel) and the later `registerAction` extension point were NOT re-run in a browser: re-run `node tools/harness/wave4_social.mjs --port <p> --out <dir>` (about 60 s once it holds the browser lock) and look at `social_alice_hub.png`.

## Known gaps / not done
- **Identity is not proven.** `profile.id` is self-declared; a hostile client can claim a friend's id (friend badge = same id, nick is shown from its beacon). Only the DM / invite you receive is trustworthy as "someone claiming to be X".
  A real fix needs signatures (per-profile keypair, sign beacons) - easy next step with WebCrypto.
- **Full mesh.** A Trystero room connects everybody to everybody; the hub is fine for a few dozen concurrent players, not hundreds. Sharding by hash or a rendezvous "region" room would be next.
- No offline DMs (there is no server to store them); no friend requests / accept flow (add = local bookmark; the other side does not know); no groups / party chat; no 3D hub scene; hub players are
  avatar cards only. The lobby list only contains hosts who share through the hub (the JOIN GAME browser still lists all public lobbies).
- Radio is text only (voice over a walkie already exists); the walkie must be ON on both ends; a crewmate without a direct WebRTC link does not receive radio (it is not relayed on purpose).
- The phone is a HUD notice, not a physical prop in the ship; no gamepad shortcut for the radio key.
- Not verified on real WebRTC between two machines (headless runs use the local BroadcastChannel transport).

## Net message types added (all prefixed `so`)
Hub room (transport messages `{t, d}`): `sop`, `sobye`, `sodm`, `soinv`. Game session: `sorad` (direct `net.sendTo`, not in `relayTypes`, not host-only).
