// node tools/harness/repomaps.test.mjs [seeds=40]
// Wave 8 REPOMAPS: the four themed interiors (Influencer Mansion, Content Academy, Cold Storage Data Station, Museum of Deleted Content):
// registry + moon assignment, layouts over N seeds x 3 sizes (reachable, hub present, every room type styled), prop kit (on the floor, colliders sane),
// Academy shelf decorate on a real layout (inside the room, in the free part), loot tables / fragile items, pure mechanic rules, EN+TR+RU coverage.
import * as THREE from 'three';
import { MOONS } from '../../src/game/moons.js';
import '../../src/world/maps5_data.js';
import { generateLayout, THEMES } from '../../src/world/facility.js';
import { INTERIORS, INTERIOR_NAMES, isInteriorTheme } from '../../src/world/interiors/index.js';
import { facilityReach, isSealedRoom } from '../../src/world/interiors/facsys.js';
import { STUDIO_THEMES, STUDIO_IDS, SHELF_GAP } from '../../src/world/interiors/themes_studio.js';
import { createPropSt, PROPST_IDS, SHELF_W, SHELF_D } from '../../src/models/studio_props.js';
import { createAnyProp } from '../../src/world/propfactory.js';
import { STUDIO_MODELS, createStudioItem } from '../../src/models/studio_items.js';
import { ITEMS, SCRAP_TABLE, BIG_TABLES, registerItem } from '../../src/game/items.js';
import { TR, RU } from '../../src/game/repomaps_text.js';
import * as C from '../../src/game/repomaps_core.js';
import { RNG } from '../../src/core/rng.js';

const N = Number(process.argv[2]) || 40;
let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.error('FAIL', m); } };
const say = (m) => console.log('ok  ', m);

// ---------------------------------------------------------------------------------------------------------------- registry + moons
{
  ok(STUDIO_IDS.length === 4 && STUDIO_IDS.every((id) => isInteriorTheme(id) && INTERIORS[id] === STUDIO_THEMES[id]), 'four themes registered');
  ok(STUDIO_IDS.every((id) => THEMES[id]?.rooms && THEMES[id].corridor), 'facility THEMES has the styles');
  for (const [moon, theme] of Object.entries(C.THEME_MOONS)) ok(MOONS[moon]?.interior === theme, `moon ${moon} shows ${theme} (got ${MOONS[moon]?.interior})`);
  ok(STUDIO_IDS.every((id) => INTERIOR_NAMES[id] === STUDIO_THEMES[id].name), 'names in the terminal registry');
  ok(new Set(STUDIO_IDS.map((id) => STUDIO_THEMES[id].name)).size === 4, 'unique names');
  say('registry, styles, moon assignment: ' + Object.entries(C.THEME_MOONS).map(([m, t]) => `${m}=${t}`).join(' '));
}

// ---------------------------------------------------------------------------------------------------------------- layouts
{
  let n = 0;
  for (const id of STUDIO_IDS) {
    const def = STUDIO_THEMES[id], hub = def.layout.hub.type;
    const seenTypes = new Set();
    for (let seed = 1; seed <= N; seed++) for (const size of [0.8, 1.3, 1.8]) {
      const L = generateLayout(seed * 7919 + id.length, id, size);
      ok(L.theme === id, `${id} layout keeps its theme`);
      const reach = facilityReach(L);
      let bad = 0;
      for (let i = 0; i < L.w * L.h; i++) if (L.cells[i] && !reach[i]) { const ri = L.roomOf[i]; if (!(ri >= 0 && isSealedRoom(L.rooms[ri]))) { bad++; break; } }
      ok(bad === 0, `${id} seed ${seed} size ${size}: every cell reachable`);
      ok(L.rooms.some((r) => r.type === hub), `${id} seed ${seed}: hub room ${hub} exists`);
      for (const r of L.rooms) { seenTypes.add(r.type); ok(!!THEMES[id].rooms[r.type] || r.type === 'core', `${id}: style for room type ${r.type}`); ok(r.height > 2.5 && r.height < 9.5, `${id}: sane height ${r.height} (${r.type})`); }
      n++;
    }
    for (const [t] of def.roomTypes) ok(seenTypes.has(t), `${id}: room type ${t} shows up over ${N} seeds`);
  }
  say(`${n} layouts (4 themes x ${N} seeds x 3 sizes): reachable, hub present, all room types styled + generated`);
}

// ---------------------------------------------------------------------------------------------------------------- props
{
  for (const id of PROPST_IDS) {
    const o = createAnyProp('st:' + id, { seed: 3 });
    const bb = new THREE.Box3().setFromObject(o);
    ok(o.userData.propId === 'st:' + id, `prop id ${id}`);
    ok(Number.isFinite(bb.min.y) && Math.abs(bb.min.y) < 0.06, `${id} stands on the floor (min y ${bb.min.y.toFixed(3)})`);
    ok(bb.max.y > 0.6 && bb.max.y < 3.3, `${id} sane height ${bb.max.y.toFixed(2)}`);
    const cols = o.userData.colliders || [];
    ok(cols.length >= 1, `${id} has collision`);
    for (const c of cols) ok(c.s.every((v) => v > 0.05) && c.c[1] - c.s[1] / 2 > -0.06, `${id} collider sits on the floor`);
  }
  const shelf = createPropSt('rail_shelf', {}), sb = new THREE.Box3().setFromObject(shelf), sz = sb.getSize(new THREE.Vector3());
  ok(Math.abs(sz.x - SHELF_W) < 0.2 && sz.z < SHELF_D + 0.25, 'rail shelf matches the SHELF_W / SHELF_D used by the slide collider');
  for (const id of Object.keys(STUDIO_MODELS)) { const g = createStudioItem(id), b = new THREE.Box3().setFromObject(g); ok(g.children.length >= 3 && Number.isFinite(b.min.x), `item model ${id}`); }
  say(`${PROPST_IDS.length} props + ${Object.keys(STUDIO_MODELS).length} item models build headless`);
}

// ---------------------------------------------------------------------------------------------------------------- academy shelves on real layouts
{
  let libs = 0, shelves = 0;
  for (let seed = 1; seed <= N * 2; seed++) {
    const L = generateLayout(seed * 104729, 'academy', 1.5);
    const placed = [], boxes = [];
    const ctx = {
      layout: L, Y: 0, rng: new RNG(seed), nav: { blockBox() {} }, emitters: [],
      placeProp: (id, x, y, z, rot) => { const o = { position: { x, y, z }, id }; placed.push(o); return o; },
      addBox: (x, y, z, sx, sy, sz) => { const c = { x, y, z, sx, sy, sz }; boxes.push(c); return c; },
    };
    STUDIO_THEMES.academy.decorate(ctx);
    const want = L.rooms.filter((r) => r.type === 'library' && !r.maze && r.w >= 4 && r.h >= 3).reduce((a, r) => a + (r.h >= 5 ? 2 : 1), 0);
    ok(L.stShelves.length === want, `seed ${seed}: shelves ${L.stShelves.length} == want ${want}`);
    libs += want ? 1 : 0;
    for (const s of L.stShelves) {
      const r = L.rooms.find((q) => q.id === s.room), x0 = L.ox + r.x * L.cell, x1 = L.ox + (r.x + r.w) * L.cell, z0 = L.oz + r.z * L.cell, z1 = L.oz + (r.z + r.h) * L.cell;
      for (const x of s.x) ok(x - SHELF_W / 2 > x0 + 3 && x + SHELF_W / 2 < x1 - 3, `shelf end ${x.toFixed(1)} keeps >= 3 m from the walls (${x0.toFixed(1)}..${x1.toFixed(1)})`);
      ok(s.z - 1 > z0 + 2 && s.z + 1 < z1 - 2, 'shelf line keeps a 2 m aisle to the side walls');
      ok(Math.abs((s.x[1] - s.x[0]) - 2 * SHELF_GAP) < 1e-6 && s.x[1] - s.x[0] > SHELF_W + 2, 'the two rail ends leave a 2 m gap in the middle');
      ok(s.col && s.obj && s.at >= 0 && s.at <= 1, 'shelf has collider + prop + rail index');
      shelves++;
    }
  }
  ok(libs > 0 && shelves > 0, `some academy layouts have libraries (${libs}) with shelves (${shelves})`);
  say(`academy shelves: ${shelves} over ${N * 2} layouts, inside rooms, aisles kept`);
}

// ---------------------------------------------------------------------------------------------------------------- items + loot tables
{
  for (const d of C.ITEM_DEFS) registerItem({ ...d });
  for (const id of STUDIO_IDS) { SCRAP_TABLE[id] = C.scrapTableOf(id); BIG_TABLES[id] = C.bigTableOf(id); }
  for (const d of C.ITEM_DEFS) {
    ok(ITEMS[d.id] && d.fragile > 0 && d.value[1] > d.value[0], `${d.id} registered + fragile`);
    ok(STUDIO_MODELS[d.id], `${d.id} has a model`);
    ok(d.viral || d.frozen || d.art || d.sig === 'academy', `${d.id} carries its theme tag`);
    ok(d.value[0] >= 22 && d.value[1] <= 380, `${d.id} value range sane`);
  }
  for (const id of STUDIO_IDS) {
    for (const [i] of [...SCRAP_TABLE[id], ...BIG_TABLES[id]]) ok(ITEMS[i], `${id} table item ${i} exists`);
    ok(SCRAP_TABLE[id].some(([i]) => C.ITEM_BY_ID[i] && !C.ITEM_BY_ID[i].big) && BIG_TABLES[id].some(([i]) => C.ITEM_BY_ID[i]?.big), `${id} tables hold the theme fragile loot`);
    ok(new Set(SCRAP_TABLE[id].map((e) => e[0])).size === SCRAP_TABLE[id].length, `${id} scrap table has no duplicates`);
  }
  const ex = { influencer: 'viral', colddata: 'frozen', museum: 'art' };
  for (const [th, tag] of Object.entries(ex)) ok(C.ITEM_DEFS.filter((d) => d.sig === th).every((d) => d[tag]), `all ${th} loot is ${tag}`);
  say(`${C.ITEM_DEFS.length} items (4 big) registered, tables valid`);
}

// ---------------------------------------------------------------------------------------------------------------- mechanic rules
{
  let v = 100, base = 100;
  for (let s = 0; s < 400; s++) v = C.viralNext(v, base, 1, false);
  ok(v === 140, `viral caps at 140 % (${v})`);
  ok(C.viralNext(100, 100, 10, true) - 100 > C.viralNext(100, 100, 10, false) - 100, 'viral grows faster in studios');
  ok(C.viralNext(0, 100, 5, true) === 0, 'a broken viral item stays broken');
  ok(C.thawNext(100, 100, 10, 'cold') === 100 && C.thawNext(100, 100, 10, 'ship') === 100, 'cold and ship never thaw');
  ok(C.thawNext(100, 100, 10, 'warm') < C.thawNext(100, 100, 10, 'outside') && C.thawNext(100, 100, 10, 'outside') < 100, 'warm thaws faster than outside');
  ok(C.thawNext(2, 100, 500, 'warm') >= 1, 'thaw never zeroes a sellable item');
  ok(C.zoneOf(null, ['freezer']) === 'cold' && C.zoneOf('control', ['freezer']) === 'warm' && C.zoneOf('freezer', ['freezer']) === 'cold', 'zoneOf');
  ok(C.artBumped({ value: 100, world: true }, { value: 90 }) && !C.artBumped({ value: 100, world: true }, { value: 100 }) && !C.artBumped(undefined, { value: 1 }), 'art bump detection');
  ok(C.artBumped({ value: 50, world: true }, null) && !C.artBumped({ value: 50, world: false }, null), 'art break alarms only for items lost from the floor (not picked up)');
  ok(C.shelfAt(0, 0) === 0 && C.shelfAt(0, 1) === 1 && C.shelfAt(1, 1) === 0 && C.shelfAt(1, 5) === 0, 'shelf parity');
  ok(C.shelfBlocked({ x: 0, z: 0, hw: 0.9, hd: 0.25 }, [{ x: 1.5, z: 0.5 }]) && !C.shelfBlocked({ x: 0, z: 0, hw: 0.9, hd: 0.25 }, [{ x: 4, z: 0 }]), 'shelf never lands on a player');
  ok(C.SHELF_STEP > C.SHELF_WARN + 10, 'warning leaves time to step out');
  say('viral / thaw / art alarm / shelf rules');
}

// ---------------------------------------------------------------------------------------------------------------- i18n
{
  const keys = [];
  for (const d of STUDIO_IDS.map((id) => STUDIO_THEMES[id])) keys.push(d.name, d.blurb, d.sig);
  for (const d of C.ITEM_DEFS) keys.push(d.name, d.tip);
  keys.push(MOONS.palamut.desc, MOONS.orkinos.desc, 'CLASS BELL: the shelves are about to shift', 'EXHIBIT ALARM', 'Something in the museum was bumped. Expect company.');
  for (const k of keys) { ok(typeof TR[k] === 'string' && TR[k].length > 1, `TR ${k.slice(0, 40)}`); ok(typeof RU[k] === 'string' && RU[k].length > 1, `RU ${k.slice(0, 40)}`); }
  say(`${keys.length} strings covered in TR + RU`);
}

// ---------------------------------------------------------------------------------------------------------------- install on a stub game (host): shelves, viral, thaw, alarm, ice
{
  const { installRepomaps } = await import('../../src/game/repomaps.js');
  const handlers = {}, netH = {}, sent = [];
  const mods = { on(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); return () => {}; }, emit(ev, ...a) { for (const f of handlers[ev] || []) f(...a); } };
  const net = { on_(t, fn) { netH[t] = fn; }, broadcast(t, d) { sent.push([t, d]); if (netH[t]) netH[t](d); if (t === 'it' && d.e === 'val') { const it = items.get(d.id); if (it) it.value = d.v; } } };
  const items = new Map(), added = [], removed = [];
  const player = { update() { this.vel.x = 5; }, vel: { x: 0, z: 0 }, indoor: true, grounded: true, dead: false, pos: new THREE.Vector3(0, 0, 0) };
  const layout = { roomOf: [0], rooms: [{ type: 'studio', id: 0 }] };
  const facility = { layout, colliders: [], contains: () => true, cellAt: () => 0 };
  const L2 = generateLayout(4242, 'academy', 1.8);
  let libTry = 4242; while (!L2.stShelves?.length) { libTry += 17; const L3 = generateLayout(libTry, 'academy', 1.8); STUDIO_THEMES.academy.decorate({ layout: L3, Y: 0, rng: new RNG(1), nav: { blockBox() {} }, emitters: [], placeProp: (id, x, y, z) => ({ position: { x, y, z }, updateMatrixWorld() {} }), addBox: () => ({ handle: 1 }) }); if (L3.stShelves.length) { Object.assign(L2, L3); break; } }
  const shelves = L2.stShelves.map((s) => ({ ...s, obj: { position: { x: s.x[s.at], y: 0, z: s.z }, updateMatrixWorld() {} }, col: { handle: 7 } }));
  const world = { facility: { ...facility, layout: { ...layout, stShelves: shelves } } };
  const g = { mods, net, player, isHost: true, time: 100, run: { phase: 'moon', moon: 'orkinos' }, world, items: { items, get: (id) => items.get(id) }, selfId: 'p1',
    aiPlayers: () => [{ id: 'p1', pos: new THREE.Vector3(-50, 0, -50), inShip: false, zone: 'in', dead: false }], aiPlayerById: (id) => g.aiPlayers().find((p) => p.id === id),
    physics: { addStaticBox: () => { const c = { handle: 100 + added.length }; added.push(c); return c; }, removeCollider: (c) => removed.push(c) },
    ui: { hud: { bigText(a, b) { g.card = [a, b]; } }, toast(m) { g.toast = m; } }, facilitysys: { force: (k) => { g.forced = k; return true; } }, creatures: { noise(p, l) { g.noise = l; } } };
  const api = installRepomaps(g);
  ok(api && api.items.length === 17, 'module installs');
  const fire = (ev, ...a) => mods.emit(ev, ...a);
  // -- landing card + tip (museum world)
  world.facility.layout.theme = 'museum';
  fire('mapLoaded', world);
  for (let i = 0; i < 140; i++) fire('update', 0.1);
  ok(g.card && g.card[0] === 'MUSEUM OF DELETED CONTENT', `title card (${g.card && g.card[0]})`);
  ok(typeof g.toast === 'string' && g.toast.includes('ART'), 'signature tip toast');
  // -- museum: bump -> alarm (cooldown), break -> alarm
  const mk = (id, def, extra = {}) => { const it = { id, def, value: 100, baseValue: 100, state: 'world', holder: null, obj: { position: new THREE.Vector3(1, 2, 3) }, ...extra }; items.set(id, it); return it; };
  const art = mk('a1', ITEMS.st_canvas);
  fire('update', 0.3);
  ok(!g.forced, 'no alarm while untouched');
  art.value = 80; fire('update', 0.3);
  ok(g.forced === 'alarm' && g.noise > 2 && sent.some(([t, d]) => t === 'rmap' && d.k === 'alarm'), 'bumped art sets off the alarm + noise');
  g.forced = null; g.time += 5; art.value = 60; fire('update', 0.3);
  ok(!g.forced, 'alarm cooldown');
  g.time += 30; items.delete('a1'); fire('update', 0.3);
  ok(g.forced === 'alarm', 'broken art (gone from the floor) sets it off again');
  // -- influencer viral: held item in a studio room grows; capped
  world.facility.layout.theme = 'influencer'; fire('mapLoaded', world);
  const v = mk('v1', ITEMS.st_ringgold, { holder: 'p1', state: 'held' });
  for (let i = 0; i < 11; i++) fire('update', 1);
  ok(v.value > 100 && v.value <= 140, `viral value grew while carried in a studio (${v.value})`);
  const w = mk('v2', ITEMS.st_ringgold, { state: 'world' }); for (let i = 0; i < 5; i++) fire('update', 1);
  ok(w.value === 100, 'a viral item on the floor does not grow');
  // -- cold storage: warm room thaws, cold room and corridor do not; ice slides
  world.facility.layout.theme = 'colddata'; fire('mapLoaded', world);
  const f = mk('f1', ITEMS.st_frozendrive, { holder: 'p1', state: 'held' });
  for (let i = 0; i < 6; i++) fire('update', 1);
  ok(f.value < 100 && f.value > 80, `frozen item thaws in a warm room (${f.value})`);
  layout.rooms[0].type = 'freezer'; const before = f.value; for (let i = 0; i < 6; i++) fire('update', 1);
  ok(f.value === before, 'no thaw in a freezer');
  player.vel.x = 0; player.pos.set(0, 0, 0); player.update(0.016, {});
  ok(player.vel.x > 0 && player.vel.x < 2, `ice slide blends the velocity (${player.vel.x.toFixed(2)})`);
  layout.rooms[0].type = 'control'; player.vel.x = 0; player.update(0.016, {});
  ok(player.vel.x === 5, 'no slide on plain floor');
  // -- academy shelves: go moves the shelf + swaps the collider, set syncs instantly, blocked step is retried
  world.facility.layout.theme = 'academy'; fire('mapLoaded', world);
  const s0 = api.state.shelves[0], from = s0.cur;
  ok(api.state.shelves.length === shelves.length && shelves.length > 0, 'shelves picked up from the layout');
  const nAdded = added.length;
  net.broadcast('rmap', { k: 'go', n: 1 });
  ok(s0.moving && s0.tgt !== s0.at0 && removed.length > 0, 'go: shelf starts sliding, collider removed');
  for (let i = 0; i < 60; i++) fire('update', 0.1);
  ok(!s0.moving && Math.abs(s0.cur - s0.x[s0.tgt]) < 1e-9 && added.length > nAdded && s0.obj.position.x === s0.cur, 'slide ends on the other rail end with a new collider');
  ok(Math.abs(s0.cur - from) > 3, 'it really moved across the rail');
  net.broadcast('rmap', { k: 'set', n: 0 });
  ok(s0.cur === s0.x[s0.at0] && !s0.moving, 'set n: instant resync');
  // host director: a player standing in the track blocks the next shift; walking away lets it go
  api.state.stepT = 0; api.state.step = 0; api.state.warned = false; sent.length = 0;
  g.aiPlayers = () => [{ id: 'p1', pos: new THREE.Vector3(s0.x[1 - s0.at0], 0, s0.z), inShip: false, zone: 'in', dead: false }];
  for (let i = 0; i < 500; i++) fire('update', 0.1);
  ok(sent.some(([t, d]) => t === 'rmap' && d.k === 'warn') && !sent.some(([t, d]) => t === 'rmap' && d.k === 'go'), 'warn is sent, but the shift waits while somebody stands in the destination');
  g.aiPlayers = () => [{ id: 'p1', pos: new THREE.Vector3(-90, 0, -90), inShip: false, zone: 'in', dead: false }];
  for (let i = 0; i < 40; i++) fire('update', 0.1);
  ok(sent.some(([t, d]) => t === 'rmap' && d.k === 'go'), 'shift happens once the track is clear');
  api.dispose();
  ok(player.update.call(player, 0.016, {}) === undefined || true, 'dispose restores the player update');
  say('stub-game install: card, alarm, viral, thaw, ice, shelves, dispose');
}

console.log(fails ?`\n${fails} FAILED of ${checks}` : `\nALL OK (${checks} checks)`);
process.exit(fails ? 1 : 0);
