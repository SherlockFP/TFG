// GAMEPLAY 2 (wave 2): installGameplay2(game) -> game.gameplay2
//   identify   creature identification (aim scan / photo -> "ENTITY IDENTIFIED" card, classes, weaknesses, codex)      identify.js
//   creeper    SPAMBOMB, TFG's own creeper: fuse, pop, knockback, breaks scrap / doors / crates                        creeper.js
//   faults     pre-flight ship faults that block takeoff (stations, HUD checklist, alarm, penalties)                   shipfaults.js
//   aptitudes  auto roles + Trader / Engineer + role aptitudes (sellValue, shopDiscount, repairSpeed, ...)             aptitudes.js
// One net type, 'g2' (host-only broadcasts; requests are host handlers): ident, known, faults, clear, fixed, hit, bad, role, kb.
// Every sub-module is failure-isolated (a broken part never takes the others down). docs/wave2/gameplay2.md.
import { HOST_ONLY } from '../net/session.js';
import { MINIGAMES } from '../minigames/index.js';
import { createValve, createNeedle, createCode } from '../minigames/shipfix.js';
import { installIdentify } from './identify.js';
import { installCreeper } from './creeper.js';
import { installShipFaults } from './shipfaults.js';
import { installAptitudes } from './aptitudes.js';

HOST_ONLY.add('g2');
MINIGAMES.g2valve = MINIGAMES.g2valve || createValve;
MINIGAMES.g2needle = MINIGAMES.g2needle || createNeedle;
MINIGAMES.g2code = MINIGAMES.g2code || createCode;

export function installGameplay2(game) {
  const offs = [];
  const parts = {};
  const guard = (name, fn) => { try { parts[name] = fn() || null; } catch (e) { console.warn('[gameplay2] ' + name, e); parts[name] = null; } };
  guard('aptitudes', () => installAptitudes(game));
  guard('identify', () => installIdentify(game));
  guard('creeper', () => installCreeper(game));
  guard('faults', () => installShipFaults(game));

  // knockback from a Spambomb pop: the velocity is re-applied for ~0.35 s (LocalPlayer.update would damp a single impulse away)
  const KB = { t: 0, x: 0, z: 0 };
  const pl = game.player, origUpdate = pl.update;
  const wrappedUpdate = function (dt, input) {
    if (KB.t > 0) { const k = KB.t / 0.35; this.vel.x = KB.x * k; this.vel.z = KB.z * k; KB.t -= dt; }
    return origUpdate.call(this, dt, input);
  };
  pl.update = wrappedUpdate;
  const kb = (d) => {
    const p = game.player;
    if (!p || p.dead || !Array.isArray(d.d)) return;
    const f = Math.max(0, Math.min(12, Number(d.f) || 6));
    KB.x = (Number(d.d[0]) || 0) * f; KB.z = (Number(d.d[1]) || 0) * f; KB.t = 0.35;
    p.vel.y = Math.max(p.vel.y, 2.6); p.grounded = false;
    game.engine?.shake?.(0.35);
  };
  function onMsg(d, from) {
    if (!d || typeof d !== 'object') return;
    try {
      switch (d.k) {
        case 'ident': case 'known': parts.identify?.onMsg(d); break;
        case 'faults': case 'clear': case 'fixed': case 'hit': case 'bad': parts.faults?.onMsg(d); break;
        case 'role': parts.aptitudes?.onMsg(d); break;
        case 'kb': kb(d); break;
        default: break;
      }
    } catch (e) { console.warn('[gameplay2] msg', d.k, e); }
    void from;
  }
  function onRequest(d, from) {
    if (!d || !game.isHost) return;
    try {
      switch (d.op) {
        case 'ident': parts.identify?.hostIdent(d, from); break;
        case 'start': case 'fix': case 'jam': parts.faults?.onRequest(d, from); break;
        case 'sync': parts.faults?.onRequest(d, from); parts.identify?.sendKnown(from); break;
        default: break;
      }
    } catch (e) { console.warn('[gameplay2] request', d.op, e); }
  }
  offs.push(game.mods.on('netReady', (net, g) => { if (g === game) net.on_('g2', onMsg); }));
  offs.push(game.mods.on('registerHandlers', (H, g) => { if (g === game) H('g2', onRequest); }));
  offs.push(game.mods.on('playerJoin', (id, info, g) => {
    if (g !== game || !game.isHost) return;
    game.later(() => { parts.identify?.sendKnown(id); if (parts.faults?.active()) game.net.sendTo(id, 'g2', parts.faults.snapshot()); }, 1800);
  }));
  if (game.net) { try { game.net.on_('g2', onMsg); } catch { /* not ready */ } }

  return {
    ...parts, parts,
    /** compact status for tests / the console */
    status: () => ({ aptitudes: !!parts.aptitudes, identify: !!parts.identify, creeper: !!parts.creeper, faults: !!parts.faults }),
    dispose() {
      for (const o of offs) { try { o?.(); } catch { /* ignore */ } }
      if (pl.update === wrappedUpdate) pl.update = origUpdate;
      for (const k of ['faults', 'creeper', 'identify', 'aptitudes']) { try { parts[k]?.dispose?.(); } catch (e) { console.warn('[gameplay2] dispose ' + k, e); } }
    },
  };
}
