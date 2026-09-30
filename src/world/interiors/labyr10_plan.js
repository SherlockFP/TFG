// LABYR10 layout planners (wave 10): pure, no three.js. facility.js generateLayout calls planLabArch (lab_themes.js) which forwards here for arch 'mall' / 'fun'.
//   mall  "The Dead Mall": a cross of wide halls. Entrance foyer -> atrium (hero, fountain + escalator) at the crossing, an E-W promenade (3 cells = 12 m wide)
//         through it, a N-S concourse (3 cells wide) up to the anchor store. Shop rooms line both halls, every shop opens onto its hall through ONE arch
//         (the shopfront: sign + roll-down grille are decorate()). Everything else (staff corridors, back-of-house shops) is the ordinary generator.
//   fun   "Mirror Funhouse": foyer -> midway hall -> a 1-cell-wide spinning-tunnel room (8 cells) -> a mirror MAZE room at the far end (carved by the
//         facility's maze code because we push it into ctx.mazeRooms). Crooked rooms, mirror halls, prize rooms and backstage come from the room table.
// ctx: { arch, W, H, ent, cells, idx, addRoom, line, spines, open, edgeKey, size, mazeRooms }. Returns true when the plan was drawn.
export const MALL_TYPES = ['mall_promenade', 'mall_concourse', 'mall_atrium', 'mall_anchor'];
export const FUN_TYPES = ['fun_midway', 'fun_spin', 'fun_maze', 'fun_hall', 'fun_crooked'];

export function planLab10(ctx) {
  if (ctx.arch === 'mall') return planMall(ctx);
  if (ctx.arch === 'fun') return planFun(ctx);
  return false;
}

function freeRect(cells, idx, W, H, x, z, w, h) {
  if (x < 1 || z < 1 || x + w > W - 1 || z + h > H - 1) return false;
  for (let zz = z; zz < z + h; zz++) for (let xx = x; xx < x + w; xx++) if (cells[idx(xx, zz)]) return false;
  return true;
}

function planMall(ctx) {
  const { W, H, ent, cells, idx, addRoom, line, spines, open, edgeKey, size } = ctx;
  if (H < 28) return false;
  const cx = ent.cx, aw = size >= 1.4 ? 7 : 5, ah = 5;
  const aZ1 = H - 7, aZ0 = aZ1 - ah + 1, zc = aZ0 + 2, xA = cx - (aw >> 1);
  const wW = xA - 3, eX = xA + aw, wE = W - 3 - eX;                    // west / east promenade widths in cells
  const cZ0 = 7, cRows = aZ0 - cZ0;
  if (wW < 4 || wE < 4 || cRows < 4 || cx - 4 < 2 || cx + 5 > W - 2) return false;
  const tag = (r, k) => { r.hub = true; r.mall = k; return r; };
  // atrium at the crossing + foyer link
  tag(addRoom(xA, aZ0, aw, ah, 'mall_atrium'), 'atrium');
  line(ent.cx, ent.cz, ent.cx, aZ1);
  // promenade wings (3 rows) + colonnade openings into the atrium
  tag(addRoom(3, zc - 1, wW, 3, 'mall_promenade'), 'promenade');
  tag(addRoom(eX, zc - 1, wE, 3, 'mall_promenade'), 'promenade');
  for (let z = zc - 1; z <= zc + 1; z++) { open.add(edgeKey(xA - 1, z, 0)); open.add(edgeKey(eX - 1, z, 0)); }
  // N-S concourse (3 columns) up to the anchor store
  tag(addRoom(cx - 1, cZ0, 3, cRows, 'mall_concourse'), 'concourse');
  for (let x = cx - 1; x <= cx + 1; x++) open.add(edgeKey(x, aZ0 - 1, 1));
  tag(addRoom(cx - 4, 2, 9, 5, 'mall_anchor'), 'anchor');
  for (let x = cx - 1; x <= cx + 1; x++) open.add(edgeKey(x, 6, 1));
  // shops: 3x3 rooms shoulder to shoulder, each with ONE arch onto its hall (tryAdd skips anything that would overlap)
  const shops = [];
  const shop = (x, z, w, h, fx, fz, ox, oz) => {                       // (fx, fz) = shop cell that faces the hall, (ox, oz) = hall cell it opens onto
    if (!freeRect(cells, idx, W, H, x, z, w, h)) return;
    const r = addRoom(x, z, w, h, 'small'); r.shop = true; shops.push(r);
    open.add(fx === ox ? edgeKey(fx, Math.min(fz, oz), 1) : edgeKey(Math.min(fx, ox), fz, 0));
  };
  for (let x = 3; x + 3 <= xA; x += 3) { shop(x, zc - 4, 3, 3, x + 1, zc - 2, x + 1, zc - 1); shop(x, zc + 2, 3, 3, x + 1, zc + 2, x + 1, zc + 1); }
  for (let x = eX; x + 3 <= W - 3; x += 3) { shop(x, zc - 4, 3, 3, x + 1, zc - 2, x + 1, zc - 1); shop(x, zc + 2, 3, 3, x + 1, zc + 2, x + 1, zc + 1); }
  for (let z = cZ0 + 1; z + 3 <= aZ0 - 1; z += 3) {
    shop(cx - 4, z, 3, 3, cx - 2, z + 1, cx - 1, z + 1);              // west side, faces +x
    shop(cx + 2, z, 3, 3, cx + 2, z + 1, cx + 1, z + 1);              // east side, faces -x
  }
  spines.push({ axis: 'x', c: zc, a: 3, b: W - 4 }, { axis: 'z', c: cx, a: cZ0, b: aZ1 });
  ctx.mall = { cx, zc, xA, aw, aZ0, aZ1, shops: shops.length };
  return true;
}

function planFun(ctx) {
  const { W, H, ent, cells, idx, addRoom, line, spines, mazeRooms } = ctx;
  if (H < 30) return false;
  const cx = ent.cx, mw = 7, mh = 5;
  const mZ1 = H - 7, mZ0 = mZ1 - mh + 1;                              // midway rows
  const tLen = 8, tZ1 = mZ0 - 2, tZ0 = tZ1 - tLen + 1;                 // one corridor cell between the midway and the tunnel
  const kw = 7, kh = 5, kZ0 = 2, kZ1 = kZ0 + kh - 1;                   // mirror maze at the far end
  if (tZ0 - 2 < kZ1 + 1 || cx - 3 < 2 || cx + 4 > W - 2) return false;
  const mid = addRoom(cx - (mw >> 1), mZ0, mw, mh, 'fun_midway'); mid.hub = true; mid.fun = 'midway';
  line(ent.cx, ent.cz, ent.cx, mZ1);
  const tun = addRoom(cx, tZ0, 1, tLen, 'fun_spin'); tun.hub = true; tun.fun = 'spin';
  line(cx, mZ0, cx, tZ1);
  const maze = addRoom(cx - (kw >> 1), kZ0, kw, kh, 'fun_maze'); maze.fun = 'maze'; maze.hub = true;
  // a theme-variety maze (like the stealth variety mazes): flagged varMaze, and left out in campaign / cycle layouts,
  // which place their own single labyrinth (opts.labyrinth / arena / wings) and count mazes exactly
  if (!ctx.cycleMode) { maze.maze = true; maze.varMaze = true; maze.mazeStyle = 'braid'; mazeRooms.push(maze); }
  line(cx, tZ0, cx, kZ1);
  // side rooms that are always there: one crooked room each side of the midway, joined by a straight stub through the hall's middle row
  const cz = mZ0 + 2, hw = mw >> 1;
  const side = (x, sx) => {
    if (!freeRect(cells, idx, W, H, x, mZ0 + 1, 4, 3)) return;
    const r = addRoom(x, mZ0 + 1, 4, 3, 'fun_crooked'); r.fun = 'crooked';
    line(sx < 0 ? x + 3 : x, cz, cx + sx * hw, cz);
  };
  side(cx - hw - 5, -1);
  side(cx + hw + 2, 1);
  spines.push({ axis: 'z', c: cx, a: kZ1, b: mZ1 });
  ctx.fun = { cx, mZ0, mZ1, tZ0, tZ1 };
  return true;
}
