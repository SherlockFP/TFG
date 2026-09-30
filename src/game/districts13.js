import * as THREE from 'three';
import { t, tf } from '../core/i18n.js';
import { HOST_ONLY } from '../net/session.js';
import { advanceStation, coolingTarget, THEMES13, DISTRICT_REWARD13 } from './districts13_core.js';
import { dressDistrictReturn } from '../world/districts13.js';
HOST_ONLY.add('d13fx');
export function installDistricts13(game) {
  if (!game.mods) return null;
  const offs = [], cooldown = new Map(); let boundNet = null, disposed = false;
  const lab = () => game.world?.facility?.lab;
  const active = () => game.run?.phase === 'moon' && THEMES13.includes(lab()?.id);
  const token = () => `${game.run?.moon}:${game.run?.seed}:${game.run?.day}`;
  const state = () => game.run?.district13?.token === token() ? game.run.district13 : null;
  const sync = () => game.broadcastRun?.(['district13', 'credits']);
  const toast = (s, type = 'info') => game.ui?.hud?.toast?.(s, type);
  function onFx(d) {
    if (!d || d.token !== token()) return;
    if (d.to && d.to !== game.selfId) return;
    if (d.k === 'wrong') toast(tf('Wrong packet. Find packet {n}; progress is safe.', { n: d.n }), 'warn');
    if (d.k === 'pressure') toast(t('Pressure mismatch. Turn the dial to the target; progress is safe.'), 'warn');
    if (d.k === 'paid') { toast(tf('District restoration: +{n} credits', { n: d.n }), 'good'); game.sfx?.('power_up', 0.4); }
  }
  function bind(net) {
    if (boundNet === net) return;
    boundNet?.off?.('msg:d13fx', onFx); boundNet = net; net?.on?.('msg:d13fx', onFx);
  }
  function request(d, from) {
    if (disposed || !game.isHost || !active() || !d || d.token !== token() || !Number.isInteger(d.i)) return;
    const st = state(), node = lab().stations[d.i], p = game.aiPlayers().find(p => p.id === from);
    if (!st || st.done || !node || !p || p.dead || p.zone !== 'in' || Math.hypot(p.pos.x - node.x, p.pos.z - node.z) > 3.6 || Math.abs(p.pos.y - node.y) > 3) return;
    const now = game.time, key = `${from}:${d.i}`;
    if (now - (cooldown.get(key) ?? -99) < 0.75) return;
    cooldown.set(key, now);
    if (lab().id === 'embercache') {
      st.dials ||= [1, 1, 1];
      if (st.values[d.i] >= 4) return;
      if (d.op === 'dial') { st.dials[d.i] = st.dials[d.i] % 3 + 1; sync(); return; }
      if (d.op !== 'seal') return;
      if (st.dials[d.i] !== coolingTarget(game.run.seed, d.i, st.values[d.i])) {
        game.net.broadcast('d13fx', { token: token(), k: 'pressure', to: from }); return;
      }
    }
    const result = advanceStation(lab().id, st.values, d.i);
    if (!result) {
      if (lab().id === 'echoregistry' && !st.values[d.i]) game.net.broadcast('d13fx', { token: token(), k: 'wrong', n: st.values.filter(Boolean).length + 1, to: from });
      return;
    }
    st.values = result.values; st.n = result.completed; st.done = st.n === 3;
    // Small, fixed optional bonus: cannot scale/farm quotas and only pays each completed station once.
    if (result.restored) {
      const pay = DISTRICT_REWARD13.restored + (st.done ? DISTRICT_REWARD13.complete : 0); game.run.credits = (game.run.credits | 0) + pay; st.paid += pay;
      game.net.broadcast('d13fx', { token: token(), k: 'paid', n: pay });
    }
    // Noise is an explicit choice at the objective, not invisible punishment for simply walking.
    game.creatures?.noise?.(new THREE.Vector3(node.x, node.y, node.z), 0.8, from);
    sync();
  }
  offs.push(game.mods.on('registerHandlers', (H, g) => { if (g === game) H('d13req', request); }));
  offs.push(game.mods.on('netReady', (net, g) => { if (g === game) bind(net); }));
  if (game.net) bind(game.net);
  offs.push(game.mods.on('mapLoaded', (world, g) => {
    if (g !== game || disposed) return;
    cooldown.clear(); dressDistrictReturn(world?.facility);
    if (game.isHost && THEMES13.includes(lab()?.id)) {
      // Rebuilding the same map for a reconnect preserves completed work.
      if (!state()) game.run.district13 = { token: token(), values: [0, 0, 0], dials: [1, 1, 1], n: 0, done: false, paid: 0 };
      sync();
    }
  }));
  offs.push(game.mods.on('interactables', (out, g) => {
    if (g !== game || !active() || game.player?.dead || !game.player?.indoor) return;
    const st = state(); if (!st) return;
    const max = lab().id === 'echoregistry' ? 1 : 4;
    for (const node of lab().stations) {
      if (st.values[node.i] >= max) continue;
      if (max === 1) out.push({ pos: new THREE.Vector3(node.x, node.y, node.z), r: 1.0, reach: 2.8,
        label: () => tf('Recover packet {n} [E]', { n: node.i + 1 }),
        sub: () => tf('Next packet: {n}. Crew can split up; each recovery is permanent.', { n: st.n + 1 }),
        action: () => game.net.request('d13req', { token: token(), i: node.i }),
      });
      else for (const op of ['dial', 'seal']) out.push({
        pos: new THREE.Vector3(node.x + (op === 'dial' ? -0.45 : 0.45), node.y, node.z), r: 0.22, reach: 2.8,
        label: () => tf(op === 'dial' ? 'Turn valve dial {n} [E]' : 'Seal calibration {n} [E]', { n: node.i + 1 }),
        sub: () => tf('Target {target} | dial {dial} | step {step}/4. Turn left control, seal with right control.', { target: coolingTarget(game.run.seed, node.i, st.values[node.i]), dial: st.dials?.[node.i] || 1, step: st.values[node.i] + 1 }),
        action: () => game.net.request('d13req', { token: token(), i: node.i, op }),
      });
    }
  }));
  offs.push(game.mods.on('objectives', (add, g, phase) => {
    if (g !== game || phase !== 'moon' || !active() || game.player?.dead) return;
    const st = state(); if (!st) return;
    if (st.done) add(t('Recovered. Follow the mint arrows to reception, then take the exit.'), 'hint', true, 1);
    else { add(tf('Optional: restore the district stations {n}/3', { n: st.n }), 'sub', false, st.n / 3); add(t('Mint arrows lead back to reception. Stations are optional; scrap still pays the quota.'), 'hint'); }
  }));
  offs.push(game.mods.on('phase', (phase, g) => {
    if (g === game && phase === 'orbit') { cooldown.clear(); if (game.isHost && game.run?.district13) { game.run.district13 = null; sync(); } }
  }));
  return { state, stations: () => lab()?.stations || [], dispose() { disposed = true; for (const off of offs) off?.(); boundNet?.off?.('msg:d13fx', onFx); cooldown.clear(); } };
}
