// Node test for the SHIPYARD models (src/models/shipyard.js): every module builds at every tier on every legal socket without throwing,
// stays inside its room, keeps the aisle to the next room clear, and never puts a collider across a core doorway.  node tools/harness/shipyard_models.test.mjs
import assert from 'node:assert/strict';
const cv = () => ({ width: 0, height: 0, getContext: () => new Proxy({}, { get: (t, k) => k === 'measureText' ? () => ({ width: 10 }) : (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop() {} }) : (k === 'getImageData' || k === 'createImageData') ? () => ({ data: new Uint8ClampedArray(1 << 22), width: 64, height: 64 }) : () => {}, set: () => true }), style: {}, addEventListener() {} });
globalThis.document = { createElement: () => cv(), body: { appendChild() {} }, addEventListener() {}, head: { appendChild() {} } };
globalThis.window = globalThis; globalThis.localStorage = { getItem: () => null, setItem() {} };
try { globalThis.navigator = { userAgent: 'node' }; } catch { /* read-only */ }
globalThis.OffscreenCanvas = class { constructor() { return cv(); } };
const M = await import('../../src/models/shipyard.js');
const Y = await import('../../src/game/shipyard_core.js');
const { SOCKETS, CORE_GAPS, ROOM_H } = await import('../../src/world/hardpoints.js');

let pass = 0;
const ok = (name, fn) => { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { console.log('  FAIL ' + name + '\n       ' + (e.stack || e.message).split('\n').slice(0, 4).join('\n       ')); process.exitCode = 1; } };
const ctx = (over = {}) => ({ paint: { c1: 'orange', c2: 'slate', pat: 'stripes' }, theme: 'steel', hasChild: false, trophies: [{ name: 'Lurker', kills: 3, hue: 0.1 }, { name: 'Web Crawler', kills: 1, hue: 0.5 }], name: 'TEST', ...over });
const legal = (id) => Y.MODULES[id].sockets.filter((k) => SOCKETS[k].kind !== 'roof');

// does a collider box [cx,cy,cz,hx,hy,hz] intersect a world AABB?
const hit = (b, x0, x1, y0, y1, z0, z1) => b[0] + b[3] > x0 && b[0] - b[3] < x1 && b[1] + b[4] > y0 && b[1] - b[4] < y1 && b[2] + b[5] > z0 && b[2] - b[5] < z1;

for (const id of Y.MODULE_IDS) {
  const socks = legal(id);
  if (!socks.length) continue;
  for (const sock of socks) for (const tier of [1, 2, 3]) for (const hasChild of SOCKETS[sock].kind === 'core' || sock === 'R1' || sock === 'N1' || sock === 'N2' ? [false, true] : [false]) {
    ok(`${id} Mk${tier} @${sock}${hasChild ? ' +child' : ''}`, () => {
      const b = M.buildRoomModule(sock, id, tier, ctx({ hasChild }));
      assert.ok(b.group.children.length >= 1); assert.ok(b.boxes.length > 4);
      for (const x of b.boxes) assert.ok(x.every(Number.isFinite), 'non-finite collider');
      // aisle: a 0.7 m wide capsule column from the room's near door to the far side must not hit anything
      const S = SOCKETS[sock], r = S.room, a = S.aisle, hw = 0.36;
      const lane = S.dir[0] ? [r.x0 + 0.4, r.x1 - 0.2, 0.15, 2.0, a - hw, a + hw] : [a - hw, a + hw, 0.15, 2.0, r.z0 + 0.2, r.z1 - 0.4];
      const [x0, x1, y0, y1, z0, z1] = lane;
      // the jamb / wall boxes at the chain doorway are allowed only outside the doorway width; props must not touch the lane at all
      for (const bx of b.boxes) {
        if (bx[4] < 0.05 && bx[1] < 0.1) continue;                     // floor collider
        assert.ok(!hit(bx, x0, x1, y0, y1, z0, z1) || (hasChild === false && (S.dir[0] ? bx[0] + bx[3] >= r.x1 - 0.01 : bx[2] - bx[5] <= r.z0 + 0.01)), `${id} blocks the aisle: ${bx.map((v) => v.toFixed(2))}`);
      }
      // inside the room footprint (+ wall thickness)
      for (const bx of b.boxes) { assert.ok(bx[0] - bx[3] > r.x0 - 0.5 && bx[0] + bx[3] < r.x1 + 0.6 && bx[2] - bx[5] > r.z0 - 0.6 && bx[2] + bx[5] < r.z1 + 0.5, `${id} collider outside room ${bx.map((v) => v.toFixed(2))}`); }
      assert.ok(b.emitters.length >= 1);
      b.dispose();
    });
  }
}
ok('core doorways stay open: no module collider fills them', () => {
  for (const [sock, S] of Object.entries(SOCKETS)) {
    if (S.kind !== 'core') continue;
    const g = CORE_GAPS[S.gap];
    for (const id of Y.MODULE_IDS) {
      if (!Y.MODULES[id].sockets.includes(sock)) continue;
      const b = M.buildRoomModule(sock, id, 3, ctx());
      const box = g.wall === '+x' ? [7.0, 7.3, 0.2, g.h - 0.1, g.c - g.w / 2 + 0.05, g.c + g.w / 2 - 0.05] : [g.c - g.w / 2 + 0.05, g.c + g.w / 2 - 0.05, 0.2, g.h - 0.1, -3.8, -3.45];
      for (const bx of b.boxes) assert.ok(!hit(bx, ...box), `${id}@${sock} fills doorway ${bx.map((v) => v.toFixed(2))}`);
    }
  }
});
ok('deck, turret, lift and paint build', () => {
  for (const t of [1, 2, 3]) { const d = M.buildDeck(t, ctx()), u = M.buildTurret(t, ctx()); assert.ok(d.boxes.length > 5 && u.boxes.length >= 2); assert.ok(u.state); d.dispose(); u.dispose(); }
  const l = M.buildLift(ctx()); assert.ok(l.points.up && l.points.down); l.dispose();
  for (const pat of Y.PATTERN_IDS) { const p = M.buildPaint({ c1: 'red', c2: 'bone', pat }, 'HELLO'); assert.ok(p.group.children.length >= 6); p.dispose(); }
});
ok('rooms are ROOM_H tall and ceiling emitters sit below the roof', () => {
  const b = M.buildRoomModule('N2', 'lab', 2, ctx());
  for (const e of b.emitters) assert.ok(e.pos.y < ROOM_H);
});
ok('interior faces point into the room, floors up, ceilings down (medbay: unique textures)', () => {
  for (const sock of ['R1', 'N1', 'N2', 'N3']) {
    const id = sock === 'R1' ? 'garage' : 'medbay';
    const b = M.buildRoomModule(sock, id, 1, ctx({ hasChild: true }));
    const r = SOCKETS[sock].room, cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    let checked = 0;
    b.group.traverse((o) => {
      if (!o.isMesh) return;
      const key = o.userData.levelKey, pos = o.geometry.attributes.position, nor = o.geometry.attributes.normal;
      if (id === 'medbay' && !['wall_hospital', 'tiles_white', 'ceiling_tiles'].includes(key)) return;
      if (id === 'garage' && !['ship_ceiling'].includes(key)) return;
      if (key === undefined) throw new Error('no levelKey');
      for (let i = 0; i < pos.count; i += 4) {
        const px = (pos.getX(i) + pos.getX(i + 2)) / 2, py = (pos.getY(i) + pos.getY(i + 2)) / 2, pz = (pos.getZ(i) + pos.getZ(i + 2)) / 2;
        const nx = nor.getX(i), ny = nor.getY(i), nz = nor.getZ(i);
        if (key === 'wall_hospital') { assert.ok(Math.abs(ny) < 1e-6); assert.ok(nx * (cx - px) + nz * (cz - pz) > 0, `${sock} interior wall faces outwards at ${px.toFixed(2)},${pz.toFixed(2)}`); checked++; }
        if (key === 'tiles_white') { assert.ok(ny > 0.99); checked++; }
        if (key === 'ceiling_tiles' || key === 'ship_ceiling') { assert.ok(ny < -0.99, 'ceiling faces up'); checked++; }
      }
    });
    assert.ok(checked >= 1, sock + ' nothing checked');
  }
});
console.log(`\n${pass} passed${process.exitCode ? ', with FAILURES' : ''}`);
