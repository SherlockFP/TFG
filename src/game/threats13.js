import { addTranslations } from '../core/i18n.js';
import { registerCreature, CREATURES, EXTRA_SPAWNS } from './creatures.js';
import { STATE_SOUNDS } from '../entities/creatures.js';
import { IDENT } from './identify.js';
import { FIELD_NOTES } from './collection.js';
import { NO_TELL } from './creature_read.js';
import { registerThreat13Models } from '../models/threats13_models.js';
import { IDS, TUNE as T, inPrintLane, quietStep } from './threats13_core.js';
import { ensureThreat13Sounds } from './threats13_sfx.js';
import { TR, RU } from './threats13_text.js';
export const HINTS = {
  [IDS.printer]: 'Amber lane = printing in 1.4 seconds. Step sideways or use a wall; its aim locks before it fires.',
  [IDS.checksum]: 'It investigates noise. Stop moving and talking while its scanner lamp pulses to cancel the strike, or retreat beyond its reach.'
};
const DEFS = {
  [IDS.printer]: { name: 'Line Printer', hp: 110, dmg: 26, walk: 0, run: 0, power: 2, xp: 130, coin: 24, zone: 'in', radius: 0.6, height: 1.6, maxAlive: 1, lore: HINTS[IDS.printer] },
  [IDS.checksum]: { name: 'Checksum', hp: 85, dmg: 22, walk: 2, run: 2.7, power: 1.5, xp: 110, coin: 20, zone: 'in', radius: 0.55, height: 1.6, maxAlive: 1, lore: HINTS[IDS.checksum] }
};
const players = (c, M) => M.playersFor(c).filter(p => !p.dead && !p.downed && !M.game.downed?.isDowned?.(p.id) && !p.inShip && !M.nearSafeZone(p));
function printer(c, dt, M) {
  if (!c.data.init) { c.data.init = true; c.setState('idle'); }
  if (c.state === 'stunned') return;
  if (c.state === 'rest') { if (c.t >= T.rest) c.setState('idle'); return; }
  if (c.state === 'windup') {
    c.extra = Math.min(1, c.t / T.windup);
    if (c.t >= T.windup) {
      for (const p of players(c, M)) if (inPrintLane(p.pos, c.pos, c.yaw) && M.canSee(c, p, T.laneLength + 2, 360)) M.attack(c, p, c.dmg, c.type, true);
      c.extra = 0; c.setState('attack');
    }
    return;
  }
  if (c.state === 'attack') { if (c.t >= 0.3) c.setState('rest'); return; }
  const n = M.nearest(c, players(c, M), T.laneLength);
  if (n && c.age > 3 && c.cooldown <= 0 && M.canSee(c, n.p, T.laneLength, 360)) { c.yaw = Math.atan2(n.p.pos.x - c.pos.x, n.p.pos.z - c.pos.z); c.setState('windup'); }
}
function checksum(c, dt, M) {
  const d = c.data;
  if (!d.init) { d.init = true; d.quiet = 0; c.setState('seek'); }
  if (c.state === 'stunned') return;
  if (c.state === 'rest') { if (c.t >= T.rest) c.setState('seek'); return; }
  if (c.state === 'scan') {
    const p = players(c, M).find(p => p.id === d.target);
    if (!p || p.pos.distanceTo(c.pos) > T.hitReach + 1 || !M.canSee(c, p, 5, 360)) { c.setState('rest'); return; }
    d.quiet = quietStep(d.quiet, p, dt); c.extra = Math.min(1, c.t / T.scanTime);
    if (d.quiet >= T.quietTime) { c.extra = 0; c.setState('rest'); return; }
    if (c.t >= T.scanTime) { if (p.pos.distanceTo(c.pos) <= T.hitReach) M.attack(c, p, c.dmg, c.type, true); c.extra = 0; c.setState('attack'); }
    return;
  }
  if (c.state === 'attack') { if (c.t >= 0.3) c.setState('rest'); return; }
  const noisy = players(c, M).filter(p => (p.noise || 0) >= 0.12 || (p.voice || 0) >= 0.12);
  const n = M.nearest(c, noisy, 18);
  if (!n) { if (!c.path || M.follow(c, dt, c.def.walk * 0.5)) M.wander(c, 10); return; }
  c.yaw = Math.atan2(n.p.pos.x - c.pos.x, n.p.pos.z - c.pos.z);
  if (n.d < T.hitReach && c.age > 3 && c.cooldown <= 0 && M.canSee(c, n.p, 5, 360)) { d.target = n.p.id; d.quiet = 0; c.setState('scan'); }
  else M.moveToward(c, n.p.pos, dt, c.def.walk);
}
let installed = false, activeGame = null;
export function installThreats13(game) {
  activeGame = game;
  addTranslations(TR, 'tr'); addTranslations(RU, 'ru');
  if (!installed) {
    installed = true;
    for (const [id, def] of Object.entries(DEFS)) {
      registerCreature(id, def, id === IDS.printer ? printer : checksum);
      Object.defineProperty(CREATURES[id], 'noSpawn', { configurable: true, enumerable: true, get: () => !activeGame || (activeGame.run?.quotaIndex | 0) < 2 });
      EXTRA_SPAWNS[id] = { zone: 'in', w: [0, 0, 2, 3], interior: id === IDS.printer ? { office: 1.5, factory: 1.2 } : { serverfarm: 1.5, hospital: 1.1 } };
      IDENT[id] = ['Anomaly', 3, HINTS[id]]; FIELD_NOTES[id] = HINTS[id]; NO_TELL.add(id);
    }
    STATE_SOUNDS[IDS.printer] = { windup: ['c13_print_load', 0.7, 1], attack: ['c13_print_fire', 0.8, 1], dead: ['hit_metal', 0.6] };
    STATE_SOUNDS[IDS.checksum] = { scan: ['c13_checksum_scan', 0.65, 1], rest: ['c13_checksum_clear', 0.35, 1], attack: ['hit_metal', 0.7], dead: ['glass_break', 0.6] };
  }
  registerThreat13Models((typeof window !== 'undefined' ? window.__kefalMods : null)?.creatureModels || game.mods?.creatureModels);
  let ready = false;
  const off = game.mods?.on?.('update', () => {
    if (ready) return;
    try { ready = ensureThreat13Sounds(game); }
    catch (err) { ready = true; console.warn('[threats13] machine audio unavailable', err); } // one warning per install, never a per-frame retry storm
  });
  return { ids: IDS, dispose() { off?.(); if (activeGame === game) activeGame = null; } };
}
