# Wave 2 - nickname + avatar (PROFILE)

Owner request: "let me change my username; in online lobbies people do not know each other; let me make an avatar / profile picture."

## What exists
- **PROFILE** entry on the CRT main menu (`crtmenu.js` items) and an "Edit profile" button in the CHARACTER sheet (works in game too).
  Panel: `src/ui/panels/profile.js` (`profilePanel`, `applyProfileName`, `applyProfileAvatar`, `capturePortrait`).
- **Nickname** (`src/core/profilename.js`, pure, node-tested): 2-16 chars, letters / digits / space / `. _ - '`, trimmed + spaces collapsed,
  small slur filter (EN / TR / RU: long roots as substrings, short ones whole-word only), reserved names (host, admin, system...), and no name that
  *looks like* a crewmate or lobby host (leet + Latin / Cyrillic lookalike + Turkish folding via `nameKey`). Live preview on the card while typing.
  The CHARACTER sheet name box uses the same validation.
- **Avatar** (`src/ui/avatarpic.js`): `AV = { m:'p'|'s', f:frame, px:256 hex chars (16 colours), png?:base64 64x64, bg? }`, stored as `profile.avatar`
  (`null` = default monster head generated from the name, so everybody has one). Modes: PIXEL EDITOR (pencil / fill / eraser / mirror / undo / clear,
  6 TFG screen-face templates) and SNAPSHOT (3D portrait of the current suit / hat / face / back, 3 angles, 16 backgrounds).
  Snapshot PNG is posterised (32 -> 3 levels) then downscaled until <= 6144 base64 chars (`capPng`); a 16x16 palette thumbnail is derived and kept in `px`.
  Frames: 4 basic (none / amber / CRT / hazard) + level 5 silver, 15 gold, 30 void, achievement `first_blood` blood.
- **Network** (`src/game/profilesync.js`, all fields optional, old clients ignore them):
  `helloData().av` = 258-char wire string (`p|s` + frame char + 256 hex) so hello / pinfo / welcome roster stay tiny;
  the snapshot PNG and live changes travel in the unique **`pf`** message `{ n, a, s? }` (`net.on_('pf')`, added to `relayTypes`).
  New peers get a direct `pf` on `playerJoin` / `peerHello` when a snapshot exists. A rename / new avatar while connected calls `syncProfile(game)`:
  refreshes `net.helloData` (next joiners), the local `net.players` row, sends `pinfo` (old clients) + `pf`, and re-announces the lobby.
  Receiving side sanitises everything (`sanitizeAvatar`, `isPng`, `cleanName`, slur-filtered names are ignored).
- **Shown in:** CRT player card (64 px, snapshot when set), lobby browser rows (host avatar from `announce.av`, +258 chars per announce),
  TAB crew list, chat lines (14 px icon), day-summary crew list, and a small sprite above remote name tags (`RemotePlayer.refreshAvatarTag`,
  setting `tagAvatars`, default on, Settings > Gameplay). Icons always use the 16x16 thumbnail; big views use the PNG.

## Marked edits (`// [profile]`)
`ui.js` (imports, `screen_profile`, chat / lobby / TAB / summary / settings), `crtmenu.js` (item + card), `save.js` (`avatar`, `tagAvatars`, name fallback),
`game.js` (`helloData.av`, `installProfileSync`, chat avatar), `host.js` (announce `av`), `remote.js` (avatar tag).

## Verified / not verified
- `node --check`, `npm run build`, `node tools/harness/profile.test.mjs` (61 assertions: names, encode / decode round trip, wire format, size caps, frames).
- NOT run in a browser (the browser lock queue was cancelled by the lead): panel layout, pointer drawing on the grid, the 3D snapshot framing
  (camera at y 1.56 / z 1.9, fov 28 - may need a nudge), CRT card layout with 8-9 menu items, name-tag sprite position, two-player `pf` sync.
- Scoreboard / case-file panel (`panels/casefile.js`) does not show avatars yet; no gamepad navigation on the pixel grid (mouse / touch only).
