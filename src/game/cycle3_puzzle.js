// THE THREE RELAYS (module 'cycle3', part 'puzzle'): the "1 short puzzle" of a Sector Core (docs/MASTERPLAN.md 14). Three signal relays stand in three different rooms
// (one per wing when the core has wings). Each one stays lit for 75 s (55 s for a crew) after a touch; all three lit AT THE SAME TIME drops the arena shield. Until then the
// arena door refuses the access cards ("ARENA SHIELD"). The old 720 s arena auto-open of cycle_inst.js is still the safety net, so this can never soft-lock a run.
// Host: RelayPuzzle sim (cycle3_core.js), request 'c3req' op 'relay' {i}; state in run.c3live.relays (all peers draw it); 'c3s' {k:'relay', r:'lit'|'done'|'off'}.
import * as THREE from 'three';
import { t, tf } from '../core/i18n.js';
import { layoutKit } from '../world/interiors/common.js';
import { wrapMethod } from './dailyEvents.js';
import { disposeGroup, lambert, basic, box } from './cycle3_fx.js';

export function installPuzzle(C3) {
  const { game, K } = C3;
  let disposed = false, rp = null, view = null, viewSig = '', pushT = 0, lastKey = '', lastLit = 0, hostRooms = null;
  const cyc = () => C3.cycle();
  const live = () => game.run?.c3live || null;
  const relays = () => live()?.relays || null;
  const setRelays = (r) => { if (!C3.host() || !game.run) return; game.run.c3live = { ...(game.run.c3live || {}), relays: r }; C3.push(['c3live']); };

  // ------------------------------------------------------------ host: setup after cycle.js populated the core
  function setup() {
    rp = null; hostRooms = null;
    const cur = cyc()?.inst?.cur, fac = game.world?.facility;
    if (!C3.host() || !cur || cur.kind !== 'core' || !fac?.layout || !cur.plan.lockedArena || cur.finalType === 'legacybot') return;
    const L = fac.layout;
    const rooms = K.pickRelayRooms(L, cur.plan.keyHolders.map((k) => k.room), (game.run.seed | 0) ^ 0x33);
    if (rooms.length < K.RELAY.count) return;
    const kit = layoutKit(L);
    const walk = (x, z) => { const nav = fac.nav; if (!nav || nav.walkableAt(x, z)) return [x, z]; const g = nav.nearestWalkable(...nav.toGrid(x, z), 6); if (!g) return [x, z]; const w = nav.toWorld(g[0], g[1]); return [w.x, w.z]; };
    const pos = rooms.map((id) => { const rc = kit.roomRect(L.rooms[id]); const w = walk((rc.x0 + rc.x1) / 2, (rc.z0 + rc.z1) / 2); return { x: +w[0].toFixed(2), z: +w[1].toFixed(2) }; });
    const crew = Math.max(1, game.aiPlayers().length);
    rp = new K.RelayPuzzle(K.RELAY.count, K.relayHold(crew));
    hostRooms = rooms;
    setRelays({ y: L.y, pos, on: [0, 0, 0], solved: 0, hold: rp.hold });
    C3.say('ARENA SHIELD: the boss arena is sealed by three signal relays. Light all three AT THE SAME TIME ({s} s each).', { s: rp.hold }, 'warn');
  }
  C3.disposers.push(wrapMethod(game, 'hostPopulateMoon', (orig) => function (...a) {
    const r = orig.apply(this, a);
    if (!disposed && C3.host() && C3.enabled()) { try { setup(); } catch (e) { console.warn('[cycle3] relays', e); } }
    return r;
  }));

  // ------------------------------------------------------------ host: tick + presses
  C3.ticks.push((dt) => {
    if (!C3.host() || !rp) return;
    if (game.run?.phase !== 'moon') { rp = null; return; }
    rp.tick(dt);
    pushT -= dt;
    const s = rp.snap(), key = s.on.map((x) => (x > 0 ? 1 : 0)).join('') + s.solved;
    const lit = rp.lit();
    if (key !== lastKey || (pushT <= 0 && lit > 0 && !rp.solved)) {
      if (key !== lastKey && lit < lastLit && !rp.solved) C3.send({ k: 'relay', r: 'off' });
      lastKey = key; lastLit = lit; pushT = 1;
      const r = relays();
      if (r) setRelays({ ...r, on: s.on, solved: s.solved });
    }
  });
  C3.handle('relay', (d, from, p) => {
    const r = relays();
    if (!rp || !r || !p || p.dead || game.run.phase !== 'moon') return;
    const i = d.i | 0, q = r.pos[i];
    if (!q || Math.hypot(p.pos.x - q.x, p.pos.z - q.z) > 3.8) return;
    const res = rp.press(i);
    if (res === 'ignored') return;
    const s = rp.snap();
    setRelays({ ...r, on: s.on, solved: s.solved });
    lastKey = s.on.map((x) => (x > 0 ? 1 : 0)).join('') + s.solved; lastLit = rp.lit();
    C3.send({ k: 'relay', r: res, i, lit: rp.lit() });
    if (res === 'done') { C3.say('ARENA SHIELD DOWN. Now the access cards will work.', {}, 'good'); C3.banner('ARENA SHIELD DOWN', '', 'good'); }
  });
  C3.on('relay', (m) => {
    game.audio?.ui?.(m.r === 'off' ? 'ui_fired' : m.r === 'done' ? 'ui_quota_met' : 'ui_notify', 0.55);
    if (m.r === 'lit') game.ui?.toast?.(tf('Relay lit ({n}/3)', { n: m.lit }), 'info');
    else if (m.r === 'off') game.ui?.toast?.(t('A relay went dark.'), 'warn');
  });
  // the arena door refuses cards while the shield is up
  C3.handlerHooks.push((H) => {
    const prev = game.net.handlers.get('unlock');
    H('unlock', (d, from) => {
      if (C3.enabled() && rp && !rp.solved) {
        const door = game.doorById?.(d.id);
        if (door?.info?.arena && door.locked) { C3.sayTo(from, 'ARENA SHIELD: light the three relays at once first ({n}/3 lit).', { n: rp.lit() }, 'bad'); return; }
      }
      prev?.(d, from);
    });
  });
  C3.phaseFns.push((ph) => { if (ph !== 'moon') { rp = null; disposeView(); } });

  // ------------------------------------------------------------ every peer: draw the relays
  function disposeView() { if (view) { disposeGroup(view.group); view = null; } viewSig = ''; }
  function build() {
    disposeView();
    const r = relays();
    if (!r || !game.scene || game.run?.phase !== 'moon' || !game.world?.facility) return;
    const group = new THREE.Group(), orbs = [];
    r.pos.forEach((q, i) => {
      const g = new THREE.Group(); g.position.set(q.x, r.y, q.z);
      g.add(box(0.7, 0.25, 0.7, lambert(0x2a2c32), 0, 0.125, 0), new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 1.5, 8), lambert(0x54585f)));
      g.children[1].position.y = 1.0;
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), basic(0x5a1218)); orb.position.y = 1.95; g.add(orb); orbs.push(orb);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.025, 6, 20), basic(0x40ffff)); ring.rotation.x = Math.PI / 2; ring.position.y = 1.95; g.add(ring);
      group.add(g);
    });
    game.scene.add(group);
    view = { group, orbs, t: 0 };
    viewSig = sig();
  }
  const sig = () => { const r = relays(); return r ? `${r.pos.length}|${r.y}|${game.run?.phase}` : ''; };
  C3.mapFns.push(() => { viewSig = ''; });
  C3.ticks.push((dt) => {
    const r = relays(), inMoon = game.run?.phase === 'moon' && game.world?.facility;
    if (!r || !inMoon) { if (view) disposeView(); return; }
    if (!view || viewSig !== sig()) { try { build(); } catch (e) { console.warn('[cycle3] relay draw', e); } }
    if (!view) return;
    view.t += dt;
    view.orbs.forEach((o, i) => {
      const s = r.on?.[i] || 0;
      const blink = s > 0 && s <= 8 ? 0.5 + 0.5 * Math.sin(view.t * 12) : 1;
      o.material.color.setHex(r.solved ? 0x40ff70 : s > 0 ? (blink > 0.55 ? 0x40ffff : 0x1a6a70) : 0x5a1218);
    });
  });
  C3.interFns.push((list, p) => {
    const r = relays();
    if (!r || r.solved || !p.indoor || game.run?.phase !== 'moon') return;
    r.pos.forEach((q, i) => {
      if (Math.hypot(p.pos.x - q.x, p.pos.z - q.z) > 5) return;
      const s = r.on?.[i] || 0, lit = (r.on || []).filter((x) => x > 0).length;
      list.push({ pos: new THREE.Vector3(q.x, r.y + 1.3, q.z), r: 0.9, reach: 3.0, label: tf('Signal relay {n}/3 [E]', { n: i + 1 }), sub: s > 0 ? tf('lit {s} s · {a}/3 lit', { s, a: lit }) : tf('dark · {a}/3 lit', { a: lit }), action: () => C3.req('relay', { i }) });
    });
  });
  C3.objFns.push((add, phase) => {
    if (phase !== 'moon') return;
    const r = relays(), lv = game.run?.cycle?.live;
    if (!r || r.solved || lv?.locked === false) return;
    const lit = (r.on || []).filter((x) => x > 0).length;
    add(tf('ARENA SHIELD: light the 3 signal relays at once ({n}/3)', { n: lit }), 'main', false, lit / 3);
  });

  return {
    setup, get sim() { return rp; }, get rooms() { return hostRooms; }, get view() { return view; },
    dispose() { disposed = true; disposeView(); },
  };
}
