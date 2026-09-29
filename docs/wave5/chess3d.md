# Wave 5 - CHESS3D: the real 3D board (MASTERPLAN 25.2)

Chess and Turkish draughts at the arcade tables (ship / HQ pier / homeworld) are now played on the physical table instead of the 2D overlay. Rules code (`chess_rules.js`, `draughts_rules.js`, `arcade_core.js`) and the host/net layer are unchanged: same `ar` snapshots, same `arreq` `move` payloads.

## Files
- `src/game/chess3d_map.js` - pure: square <-> table-local mapping (`sqToLocal`, `localToSq`, `rayToSq`), snapshot -> piece list (`piecesOf`), instance counts, check square, move diff for animation (`diffMoves`), camera pose (`viewPose`), and `createPicker()` (select / targets / drag-drop / draughts multi-jump steps / promotion -> `arreq move` payload).
- `src/models/chess3d.js` - `createPieceSet()`: lathe-geometry pieces, one InstancedMesh per (type, colour) = 12 draw calls for chess, 2 for dama, plus 3 tiny additive overlay InstancedMeshes (last-move squares + selection, legal-target discs, capture / check rings). Animation (hop + slide, castling moves both), drag hold, settle. No lights added (Lambert + emissive, additive MeshBasic).
- `src/game/chess3d.js` - view controller: camera ease (top-down-ish, ~46 deg fov, arcs to Black's side when seated as Black), raycast mouse (click piece then square, or drag and drop), HUD bar (status, seats, AI, resign, new game, kind switch, promotion picker, Classic view), ESC / Stand up returns. EN/TR/RU strings (`TR3`, `RU3`).
- `src/game/arcade.js` (small edits): 3D view is the default `open(id)`; `api.chess3d`, `api.setClassic(bool)`; every peer's table model now gets `update(kind, pos, {last, check, turn, animate})` so spectators and the opponent see animated 3D moves and the last-move / check marks.
- `src/models/arcade.js`: old per-mesh pieces replaced by the piece set; board texture parity fixed (a1 is a dark square).
- `src/ui/panels/arcade.js`: one extra "3D view" button in the Classic overlay.

## Use
E at a table opens the 3D view (spectators too). Drag a piece or click it, green discs = legal squares, red ring = capture, yellow = last move, pulsing red ring under the king = check. Promotion: HUD buttons Queen / Rook / Bishop / Knight. "Classic view" (HUD) / "3D view" (overlay) toggles; the choice is saved in localStorage `tfg_arcade_classic`.

## Tests
`node tools/harness/arcade.test.mjs` - added: square <-> local round trip, a1/h8 corners, camera ray -> e4, piece / instance counts (12 meshes chess, 2 dama, <= 12 piece draw calls, <= 15 with marks), move diffs (push, capture, castling, promotion), check ring square, pick -> move for e4, wrong turn / spectator, promotion picker, dama multi-jump path accepted by the host.
Browser: `tools/harness/wave5_chess3d.js` (sit, open, click e2/e4 via synthetic mouse events). A first run showed the view active, blend 1, camera at 1.6 m and 12 instanced meshes; it hit a bug in `onDown` (`contains` on a non-Node event target), fixed afterwards, but the container restarted before a clean re-run. NOT re-verified in a browser after the fix.

## Known gaps
- No visual check of piece shapes / camera framing / HUD layout at 1280x720 yet (lathe profiles are hand-tuned blind).
- Drag uses a fixed plane at piece height; very shallow angles are not tuned. No touch support.
- Captured pieces just vanish (no fade / tray). Dama partial jump steps show no path preview.
- The held-item viewmodel / own body can still show in the top-down view.
