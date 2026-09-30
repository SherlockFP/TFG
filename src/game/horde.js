// HORDE (wave 1): new creature families + their directors. See docs/wave1/horde.md.
//   installHorde(game) -> game.horde = { spawnHitSquad(factionId, pos, n=3), spawnSwarm(pos, n), waveActive(), startWaves(reason, zone),
//                                        camera, stats(), dispose() }
// Host: swarm wave director (night / facility alarm / extraction: 3-5 waves of 6-20 Zombie Accounts from the edges over
// 60-90 s, scaled by sector + run.threat + balance spawn multiplier), ambient swarm groups (seeded), faction invasions
// ('tfg:war' events) and contested moons (Hit Squads), death hooks (loot, components, squad morale, corpse cleanup).
// Every peer: instanced swarm renderer, soldier lasers / tracers / barks, Doppel disguise (look + name tag + voice),
// janitor shoves + mopping, WAVE banner + dock widget + objectives lines, the Instant Camera (camera_item.js).
// All creature AI lives in creatures_wave1.js and runs in the generic CreatureManager (host-authoritative).
import * as THREE from 'three';
import { registerWave1Content, TRACK, SQUAD_TYPES, MAX_SWARM, spawnZombot, countSwarm, newSquad, bark, dropAll } from './creatures_wave1.js';
import { SWARM, FACTIONS, factionIndex, registerHordeModels } from '../models/creatures_wave1.js';
import { MOONS } from './moons.js';
import { ITEMS } from './items.js';
import { RNG, hashString } from '../core/rng.js';
import { FACILITY_Y } from '../world/facility.js';
import { hudDock } from '../ui/dock.js';
import { t, tf, addTranslations } from '../core/i18n.js';
import { applyNameTagTitle, titleOf } from './achievements.js';
import { suitColor } from '../entities/remote.js';
import { installCamera } from './camera_item.js';
import { G } from '../physics/physics.js';
import { wavesAllowed } from './crdirector_core.js';   // [onegoal] no swarm waves before quota 3

addTranslations({
  'SWARM INCOMING': 'SÜRÜ GELİYOR', 'WAVE {i}/{n}': 'DALGA {i}/{n}', '{c} zombie accounts': '{c} zombi hesap', 'SWARM CLEARED': 'SÜRÜ TEMİZLENDİ',
  'Survive the swarm: wave {i}/{n} ({c} left)': 'Sürüden sağ çık: dalga {i}/{n} ({c} kaldı)',
  'Hit squad in the sector: {n} hostiles': 'Sektörde vurucu tim: {n} düşman',
  'HIT SQUAD': 'VURUCU TİM', 'has invaded this sector': 'bu sektörü bastı',
  'CONTESTED ZONE': 'ÇATIŞMA BÖLGESİ', 'Faction squads patrol this moon.': 'Bu ayda fraksiyon timleri devriye geziyor.',
  'Hit squad eliminated': 'Vurucu tim yok edildi', 'Swarm survived': 'Sürü atlatıldı',
  'the night': 'gece', 'the alarm': 'alarm', 'the extraction': 'tahliye', 'Out of ammo.': 'Mermi bitti.', crewmate: 'ekip arkadaşı',
});

const COMP_POOLS = {
  swarm: ['comp_cable', 'comp_scrapmetal', 'comp_circuit', 'comp_battery'],
  soldier: ['comp_battery', 'comp_fuse', 'comp_cloth', 'comp_scrapmetal'],
  collector: ['comp_cable', 'comp_circuit', 'comp_crystal'],
  janitor: ['comp_circuit', 'comp_sensor', 'comp_battery', 'comp_chem'],
  doppel: ['comp_ecto', 'comp_crystal'],
};
const STYLE_ID = 'horde-style';
const CSS = `
.hban{position:fixed;left:50%;top:21%;transform:translate(-50%,-50%);z-index:25;pointer-events:none;text-align:center;opacity:0;transition:opacity .25s}
.hban.on{opacity:1;animation:hbanIn .5s cubic-bezier(.2,1.4,.4,1)}
.hban-t{font-family:var(--font2,monospace);font-size:44px;letter-spacing:6px;color:#fff;text-shadow:3px 0 #ff2a5a,-3px 0 #20ffe0,0 0 18px rgba(255,40,90,.6);animation:hbanGl .12s steps(2) infinite}
.hban-s{font-family:var(--font1,monospace);font-size:20px;letter-spacing:2px;color:#ffd27a;margin-top:6px;text-shadow:2px 2px 0 #000}
@keyframes hbanIn{0%{transform:translate(-50%,-50%) scale(1.8);filter:blur(4px)}100%{transform:translate(-50%,-50%) scale(1)}}
@keyframes hbanGl{0%{transform:translateX(0)}50%{transform:translateX(2px) skewX(-4deg)}}
.hdock{font-family:var(--font1,monospace);font-size:15px;color:#ffd6d6;background:rgba(30,4,8,.72);border:1px solid #a8203a;padding:4px 9px;min-width:170px;text-shadow:1px 1px 0 #000}
.hdock b{color:#ff5a6a;letter-spacing:1px}.hdock .bar{height:4px;background:#3a0a12;margin-top:3px}.hdock .bar i{display:block;height:100%;background:#ff3050}
`;

export function installHorde(game) {
  registerWave1Content();
  registerHordeModels();
  const offs = [];
  const mods = game.mods;
  const on = (ev, fn) => { if (mods?.on) offs.push(mods.on(ev, fn)); };
  const S = {
    disposed: false, waves: null, waveSeq: 0, day: {}, dayKey: null, wars: new Map(), squads: new Set(),
    clientWave: null, bubbles: [], tracers: [], beams: [], dock: null, dockHtml: '', dockT: 0, banner: null, bannerTimer: null, styleEl: null,
  };
  const camera = installCamera(game);
  SWARM.onDeath = (rec) => {
    if (!game.particles || !rec.root.parent) return;
    const at = rec.root.position.clone(); at.y += 0.9;
    game.particles.burst(at, 'glitch', null, 1.2);
    game.particles.burst(at, 'sparks', null, 0.6);
  };
  const rnd = Math.random;
  const isHost = () => !!game.isHost;
  const M = () => game.creatures;
  const sector = () => game.run?.quotaIndex || 0;
  const threat = () => clampN(Number(game.run?.threat ?? 30), 0, 100);
  const balanceSpawnMul = () => { try { const s = game.balance?.scale?.('creature'); return clampN(Number(s?.spawn ?? 1) || 1, 0.25, 3); } catch { return 1; } };
  const livePlayers = (zone) => game.aiPlayers().filter((p) => !p.dead && !p.inShip && (!zone || p.zone === zone));

  // ================================================================================== host: swarm waves
  function startWaves(reason = 'night', zone = null, force = false) {
    if (!isHost() || S.disposed || S.waves || game.run?.phase !== 'moon') return false;
    if (!force && !wavesAllowed(sector())) return false;   // [onegoal] quota 0-2: no swarm waves at all (night / alarm / extraction); force = debug / harness
    if (!zone) { const ps = livePlayers(); const ins = ps.filter((p) => p.zone === 'in').length; zone = ps.length && ins > ps.length / 2 ? 'in' : 'out'; }
    if (zone === 'in' && !game.world.facility) zone = 'out';
    const sec = sector(), th = threat();
    const total = 3 + (sec >= 2 ? 1 : 0) + (th >= 70 ? 1 : 0);
    const duration = 60 + Math.min(30, sec * 6 + th * 0.15);
    S.waves = { id: ++S.waveSeq, zone, total, idx: 0, gap: duration / total, nextT: (game.time || 0) + 2.5, reason, lastSpawnT: game.time || 0 };
    game.net.broadcast('fx', { k: 'hwave', s: 'start', n: total, r: reason, z: zone });
    return true;
  }
  function waveSize(W) {
    const base = 6 + sector() * 1.5 + threat() / 12 + (W.idx - 1) * 1.6;
    return Math.round(clampN(base * balanceSpawnMul() * (0.9 + rnd() * 0.3), 6, 20));
  }
  function wavePoints(zone, k) {
    const out = [];
    if (zone === 'out') {
      const ps = livePlayers('out');
      const c = ps.length ? ps.reduce((a, p) => a.add(p.pos), new THREE.Vector3()).multiplyScalar(1 / ps.length) : new THREE.Vector3(0, 0, 0);
      const lim = (game.world.terrain?.playHalf ?? 130) - 6;
      const base = rnd() * Math.PI * 2;
      for (let i = 0; i < k; i++) {
        const a = base + (i / k) * Math.PI * 2 + (rnd() - 0.5) * 0.8, r = 42 + rnd() * 14;
        let x = clampN(c.x + Math.cos(a) * r, -lim, lim), z = clampN(c.z + Math.sin(a) * r, -lim, lim);
        if (Math.hypot(x, z) < 18) { const s = 18 / Math.max(1, Math.hypot(x, z)); x *= s; z *= s; }
        out.push(new THREE.Vector3(x, game.world.terrain?.heightAt(x, z) ?? 0, z));
      }
      return out;
    }
    const fac = game.world.facility;
    if (!fac) return out;
    const ps = livePlayers('in');
    const cand = [...(fac.ventSpots || []), ...(fac.scrapSpots || []).filter((s) => !s.elevated)]
      .filter((s) => ps.every((p) => { const d = Math.hypot(s.x - p.pos.x, s.z - p.pos.z); return d > 14 && d < 55; }));
    for (let i = 0; i < k && cand.length; i++) { const s = cand.splice((rnd() * cand.length) | 0, 1)[0]; out.push(new THREE.Vector3(s.x, fac.layout.y, s.z)); }
    if (!out.length && fac.nav) { const w = fac.nav.randomWalkable(rnd); if (w) out.push(new THREE.Vector3(w.x, fac.layout.y, w.z)); }
    return out;
  }
  function spawnAround(p, zone, level, data) {
    const nav = zone === 'in' ? game.world.facility?.nav : null;
    let x = p.x + (rnd() - 0.5) * 6, z = p.z + (rnd() - 0.5) * 6;
    if (nav) { const w = nav.randomWalkable(rnd, p.x, p.z, 3); if (!w) return null; x = w.x; z = w.z; }
    return spawnZombot(M(), new THREE.Vector3(x, p.y, z), { zone, level, state: 'run', data });
  }
  function spawnWave(W) {
    const room = MAX_SWARM - countSwarm(M());
    const n = Math.min(room, waveSize(W));
    if (n <= 0) return 0;
    const pts = wavePoints(W.zone, 2 + (n > 12 ? 1 : 0));
    if (!pts.length) return 0;
    const level = 1 + Math.floor(sector() / 2);
    let made = 0;
    for (let i = 0; i < n; i++) if (spawnAround(pts[i % pts.length], W.zone, level, { wave: W.id })) made++;
    W.lastSpawnT = game.time || 0;
    game.net.broadcast('fx', { k: 'hwave', s: 'wave', i: W.idx, n: W.total, c: made, z: W.zone });
    for (const p of pts) game.net.broadcast('fx', { k: 'snd', s: 'vent_crawl', p: [p.x, p.y + 0.5, p.z], v: 1, r: 8, m: 90 });
    return made;
  }
  function aliveOfWave(id) { let n = 0; for (const c of M().host.values()) if (c.type === 'zombot' && !c.dead && c.data.wave === id) n++; return n; }
  function tickWaves() {
    const W = S.waves;
    if (!W) return;
    const now = game.time || 0;
    if (game.run?.phase !== 'moon') { S.waves = null; return; }
    if (W.idx < W.total && now >= W.nextT) { W.idx++; W.nextT = now + W.gap; spawnWave(W); }
    if (W.idx >= W.total && now - W.lastSpawnT > 4 && aliveOfWave(W.id) === 0) {
      S.waves = null;
      game.net.broadcast('fx', { k: 'hwave', s: 'clear' });
      for (const p of game.aiPlayers()) if (!p.dead) game.net.broadcast('xp', { to: p.id, xp: 40 + sector() * 15, coin: 5 + sector() * 2, reason: t('Swarm survived') });
    }
  }

  // ================================================================================== host: hit squads
  const ROLES = { 1: ['hs_gunner'], 2: ['hs_enforcer', 'hs_gunner'], 3: ['hs_leader', 'hs_enforcer', 'hs_gunner'] };
  function rolesFor(n) {
    if (ROLES[n]) return ROLES[n];
    const out = ['hs_leader'];
    for (let i = 1; i < n; i++) out.push(i % 2 ? 'hs_enforcer' : 'hs_gunner');
    return out;
  }
  function spawnHitSquad(factionId = 'bureau', pos = null, n = 3) {
    if (!isHost() || S.disposed || !game.world.moonId) return [];
    const fi = factionIndex(factionId);
    const Mg = M();
    pos = pos ? new THREE.Vector3(pos.x, pos.y, pos.z) : new THREE.Vector3(40, 0, 40);
    const zone = pos.y < FACILITY_Y + 40 ? 'in' : 'out';
    const fac = game.world.facility, nav = zone === 'in' ? fac?.nav : null;
    if (zone === 'in' && !nav) return [];
    const sq = newSquad(fi);
    const moon = MOONS[game.run?.moon];
    const level = 1 + Math.floor(sector() / 2) + Math.max(0, (moon?.tier || 1) - 1);
    const out = [];
    rolesFor(clampN(Math.round(n) || 3, 1, 6)).forEach((role, i) => {
      let x = pos.x, z = pos.z, y = pos.y;
      if (nav) {
        const w = nav.randomWalkable(rnd, pos.x, pos.z, 2) || (() => { const g = nav.nearestWalkable(...nav.toGrid(pos.x, pos.z), 6); return g ? nav.toWorld(g[0], g[1]) : null; })();
        if (!w) return;
        x = w.x; z = w.z; y = fac.layout.y;
      } else {
        const a = (i / 3) * Math.PI * 2 + rnd(), r = i ? 1.5 + rnd() : 0;
        x += Math.cos(a) * r; z += Math.sin(a) * r; y = game.world.terrain?.heightAt(x, z) ?? y;
      }
      const seed = fi + 4 * (1 + ((rnd() * 20000) | 0));
      const near = livePlayers(zone).sort((a, b) => a.pos.distanceTo(pos) - b.pos.distanceTo(pos))[0];
      const yaw = near ? Math.atan2(near.pos.x - x, near.pos.z - z) + (rnd() - 0.5) * 0.8 : rnd() * Math.PI * 2;   // they arrive looking for the crew
      const c = Mg.hostSpawn(role, new THREE.Vector3(x, y, z), { level, elite: false, zone, state: 'patrol', variant: null, affix: null, seed, yaw, data: { squad: sq, faction: fi } });
      if (c) { Mg.placeAt(c, c.pos.x, c.pos.z); TRACK.add(c); out.push(c); }
    });
    if (out.length) { sq.spawned = out.length; S.squads.add(sq); }
    return out;
  }
  function isContested(run, moon) {
    if (!run || !moon || moon.company || (moon.tier || 1) < 2) return false;
    return (Math.abs(hashString(`${run.runId || run.seed || ''}:${moon.id}`)) % 100) < 22;
  }
  function launchInvasion(inv) {
    const F = FACTIONS[factionIndex(inv.faction)];
    const lim = (game.world.terrain?.playHalf ?? 130) - 12;
    const a = rnd() * Math.PI * 2, d = 55 + rnd() * 20;
    const x = clampN(Math.cos(a) * d, -lim, lim), z = clampN(Math.sin(a) * d, -lim, lim);
    const y = game.world.terrain?.heightAt(x, z) ?? 0;
    game.net.broadcast('fx', { k: 'hdrop', p: [+x.toFixed(2), +y.toFixed(2), +z.toFixed(2)], f: factionIndex(inv.faction) });
    game.net.broadcast('sys', { text: `⚠ ${F.name.toUpperCase()} SQUAD HAS INVADED THIS SECTOR`, kind: 'bad' });
    game.net.broadcast('fx', { k: 'hbanner', t: `${F.short.toUpperCase()} ${t('HIT SQUAD')}`, s: t('has invaded this sector'), c: F.color });
    const n = 3 + (sector() >= 2 ? 1 : 0) + (sector() >= 4 ? 1 : 0);
    game.later(() => { if (!S.disposed && game.run?.phase === 'moon') spawnHitSquad(inv.faction, new THREE.Vector3(x, y, z), n); }, 3500);
  }

  // ================================================================================== host: day setup / tick
  function hostOnMoonPopulated() {
    if (!isHost() || S.disposed) return;
    const run = game.run, moon = MOONS[run?.moon];
    if (!run || run.phase !== 'moon' || !moon || moon.company || moon.expedition) return;   // [expeditions] no swarm director on the special moons
    const key = run.seed + ':' + run.moon;
    if (S.dayKey === key) return;
    S.dayKey = key; S.day = {}; S.waves = null;
    const r = new RNG(((run.seed ^ 0x2b07a11) >>> 0) || 1);
    // loose ambient groups of zombie accounts outdoors, far from the ship and the main entrance
    if (game.world.outdoor) {
      const tier = Math.max(1, moon.tier || 1);
      const groups = Math.min(4, tier + (sector() >= 3 ? 1 : 0));
      const ent = game.world.outdoor.mainExit?.pos;
      const lim = (game.world.terrain?.playHalf ?? 130) - 8;
      const level = 1 + Math.floor(sector() / 2);
      for (let gi = 0; gi < groups; gi++) {
        let x = 0, z = 0;
        for (let k = 0; k < 10; k++) {
          const a = r.float(0, Math.PI * 2), d = r.float(55, 105);
          x = clampN(Math.cos(a) * d, -lim, lim); z = clampN(Math.sin(a) * d, -lim, lim);
          if (!ent || Math.hypot(x - ent.x, z - ent.z) > 35) break;
        }
        const n = r.int(3, 5);
        for (let i = 0; i < n; i++) {
          const px = x + r.float(-3, 3), pz = z + r.float(-3, 3);
          spawnZombot(M(), new THREE.Vector3(px, game.world.terrain?.heightAt(px, pz) ?? 0, pz), { zone: 'out', level, data: { ambient: true } });
        }
      }
    }
    // invasions: warring factions (lore module 'tfg:war') or a contested moon
    const warring = [...S.wars.entries()].filter(([, v]) => v).map(([f]) => f);
    const contested = isContested(run, moon);
    if (warring.length && r.next() < 0.6) S.day.invasion = { at: 100 + r.float(0, 110), faction: r.pick(warring), reason: 'war' };
    else if (contested) S.day.invasion = { at: 120 + r.float(0, 110), faction: r.pick(FACTIONS).id, reason: 'contested' };
    if (contested) game.later(() => game.net.broadcast('sys', { text: `⚠ ${t('CONTESTED ZONE')}: ${t('Faction squads patrol this moon.')}`, kind: 'warn' }), 6000);
  }
  function hostUpdate(dt) {
    const run = game.run;
    if (!run) return;
    const Mg = M();
    // death hooks (loot, components, squad morale) + early corpse cleanup
    for (const c of TRACK) {
      if (Mg.host.get(c.id) !== c) { TRACK.delete(c); continue; }
      if (c.dead && !c.data.hDone) { c.data.hDone = true; try { onDeath(c); } catch (e) { console.warn('[horde] death', c.type, e); } }
    }
    for (const sq of S.squads) {
      let alive = 0;
      for (const id of sq.members) { const c = Mg.host.get(id); if (c && !c.dead) alive++; }
      if (!alive && sq.members.size) {
        S.squads.delete(sq);
        game.net.broadcast('sys', { text: `${t('Hit squad eliminated')}.`, kind: 'good' });
        for (const p of game.aiPlayers()) if (!p.dead) game.net.broadcast('xp', { to: p.id, xp: 60 + sector() * 20, coin: 12, reason: t('Hit squad eliminated') });
      }
    }
    if (run.phase !== 'moon') { S.waves = null; return; }
    tickWaves();
    const tm = run.time ?? 480;
    const outside = livePlayers('out').length > 0;
    if (!S.day.night1 && tm >= 18 * 60 + 30 && tm < 23 * 60 + 30 && outside && !S.waves) { S.day.night1 = true; startWaves('night', 'out'); }
    if (!S.day.night2 && S.day.night1 && tm >= 21 * 60 + 30 && tm < 23 * 60 + 30 && outside && !S.waves && (sector() >= 1 || threat() >= 60)) { S.day.night2 = true; startWaves('night', 'out'); }
    const inv = S.day.invasion;
    if (inv && !inv.done && (game.hostData?.moonT || 0) >= inv.at) { inv.done = true; launchInvasion(inv); }
  }
  function dropComponents(pos, kind, n) {
    if (!n) return;
    if (typeof game.crafting?.dropComponents === 'function') { try { game.crafting.dropComponents(pos, kind, n); return; } catch (e) { console.warn('[horde] crafting drop', e); } }
    const pool = (COMP_POOLS[kind] || COMP_POOLS.swarm).filter((id) => ITEMS[id]);
    for (let i = 0; i < n && pool.length; i++) game.items.hostSpawn(pool[(rnd() * pool.length) | 0], pos.clone().add(new THREE.Vector3((rnd() - 0.5) * 0.5, 0.3, (rnd() - 0.5) * 0.5)), {});
  }
  function spawnItem(type, at, opts = {}) { if (ITEMS[type]) game.items.hostSpawn(type, at.clone().add(new THREE.Vector3((rnd() - 0.5) * 0.6, 0.2, (rnd() - 0.5) * 0.6)), opts); }
  function onDeath(c) {
    const Mg = M();
    const at = c.pos.clone().add(new THREE.Vector3(0, 0.7, 0));
    switch (c.type) {
      case 'zombot':
        if (rnd() < 0.1) dropComponents(at, 'swarm', 1);
        game.later(() => { if (Mg.host.get(c.id) === c) Mg.hostRemove(c.id); }, 2600);
        break;
      case 'hs_enforcer': if (rnd() < 0.35) spawnItem('machete', at); if (rnd() < 0.4) dropComponents(at, 'soldier', 1); squadLoss(c); break;
      case 'hs_gunner': if (rnd() < 0.4) spawnItem('hs_pistol', at); if (rnd() < 0.5) spawnItem('hs_mag', at); if (rnd() < 0.4) dropComponents(at, 'soldier', 1); squadLoss(c); break;
      case 'hs_leader': if (rnd() < 0.65) spawnItem('hs_pistol', at); if (rnd() < 0.6) spawnItem('hs_mag', at); if (rnd() < 0.5) game.hostSpawnRandomScrap?.(at); dropComponents(at, 'soldier', 1); squadLoss(c); break;
      case 'doppel':
        if (rnd() < 0.5) game.hostSpawnRandomScrap?.(at);
        if (rnd() < 0.5) dropComponents(at, 'doppel', 1);
        c.extra = 'R:' + (c.data.victim || '');
        break;
      case 'collector': dropAll(c, Mg, false); if (rnd() < 0.35) dropComponents(at, 'collector', 1); break;
      case 'janitor': dropAll(c, Mg, false); dropComponents(at, 'janitor', 1 + (rnd() < 0.5 ? 1 : 0)); break;
      default: break;
    }
  }
  function squadLoss(c) {
    const sq = c.data.squad, Mg = M();
    if (!sq) return;
    const alive = [...sq.members].map((id) => Mg.host.get(id)).filter((m) => m && !m.dead);
    if (!alive.length) return;
    const speaker = alive[(rnd() * alive.length) | 0];
    if (c.type === 'hs_leader') {
      bark(speaker, Mg, 'LEADER DOWN!');
      for (const m of alive) { m.data.fleeT = 2.5; Mg.wander(m, 10); }   // morale break
    } else if (rnd() < 0.6) bark(speaker, Mg, 'MAN DOWN!');
  }

  // ================================================================================== client: fx
  function ensureStyle() {
    if (S.styleEl || typeof document === 'undefined') return;
    S.styleEl = document.getElementById(STYLE_ID);
    if (!S.styleEl) { S.styleEl = document.createElement('style'); S.styleEl.id = STYLE_ID; S.styleEl.textContent = CSS; document.head.appendChild(S.styleEl); }
  }
  function banner(title, sub, color, late) {
    if (typeof document === 'undefined') return;
    if (!late) { const d = game.onboard?.fr?.slot?.(3) || 0; if (d > 80) { clearTimeout(S.bannerWait); S.bannerWait = setTimeout(() => banner(title, sub, color, true), d); return; } }   // [qa] arrival cards queue
    ensureStyle();
    if (!S.banner) {
      S.banner = document.createElement('div');
      S.banner.className = 'hban';
      S.banner.innerHTML = '<div class="hban-t"></div><div class="hban-s"></div>';
      (document.getElementById('ui') || document.body).appendChild(S.banner);
    }
    S.banner.querySelector('.hban-t').textContent = title;
    S.banner.querySelector('.hban-t').style.color = color || '#fff';
    S.banner.querySelector('.hban-s').textContent = sub || '';
    S.banner.className = 'hban';
    void S.banner.offsetWidth;
    S.banner.className = 'hban on';
    clearTimeout(S.bannerTimer);
    S.bannerTimer = setTimeout(() => { if (S.banner) S.banner.className = 'hban'; }, 2600);
  }
  const v3 = (a) => (Array.isArray(a) && a.length >= 3 && a.every(Number.isFinite) ? new THREE.Vector3(a[0], a[1], a[2]) : null);
  const has = (n) => { try { return !!game.audio?.has?.(n); } catch { return false; } };
  const snd = (names, pos, vol = 1, o = {}) => { const n = names.find(has) || names[names.length - 1]; if (pos) game.audio?.at?.(n, pos, vol, { occlude: true, refDistance: 4, maxDistance: 90, ...o }); else game.sfx?.(n, vol); };

  function onFx(d, from) {
    if (S.disposed || !d || typeof d !== 'object') return;
    switch (d.k) {
      case 'hwave': {
        const why = { night: t('the night'), alarm: t('the alarm'), extraction: t('the extraction') }[d.r] || '';
        if (d.s === 'start') { S.clientWave = { i: 0, n: d.n || 3, zone: d.z }; banner(t('SWARM INCOMING'), why ? `// ${why}` : '', '#ff5a7a'); snd(['scifi_alarm', 'alarm_loop'], null, 0.5); game.engine?.shake(0.25); }
        else if (d.s === 'wave') { S.clientWave = { i: d.i, n: d.n, zone: d.z }; banner(tf('WAVE {i}/{n}', { i: d.i, n: d.n }), tf('{c} zombie accounts', { c: d.c || 0 }), '#ffffff'); snd(['sting_drum_glitch', 'chase_sting'], null, 0.6); }
        else if (d.s === 'clear') { S.clientWave = null; banner(t('SWARM CLEARED'), '', '#7dffb0'); snd(['sting_synth', 'ui_levelup'], null, 0.5); }
        break;
      }
      case 'hbanner': banner(String(d.t || '').slice(0, 40), String(d.s || '').slice(0, 60), d.c); snd(['scifi_sirens', 'ship_alarm'], null, 0.45); break;
      case 'hshot': shotFx(d); break;
      case 'hbark': barkFx(d); break;
      case 'hshove': if (d.to === game.selfId && Array.isArray(d.d)) shoveMe(d); break;
      case 'hmop': mopFx(d); break;
      case 'hdrop': dropFx(d); break;
      case 'hdvoice': {
        const v = game.creatures.views.get(d.id);
        if (!v || v.state === 'dead') break;
        game.voice?.playClip?.(v.pos.clone().add(new THREE.Vector3(0, 1.6, 0)), d.clip || undefined);
        v.model?.talk?.(1.8);
        break;
      }
      case 'hreveal': {
        const v = game.creatures.views.get(d.id);
        const pos = v ? v.pos.clone().add(new THREE.Vector3(0, 1.5, 0)) : null;
        snd(['sting_violin_glitch', 'jumpscare_2', 'screamer_scream'], pos, 0.9);
        if (v && v.pos.distanceTo(game.player.pos) < 30) {
          game.ui?.toast('📸 ' + (d.nm ? tf('That is not {name}!', { name: d.nm }) : t('Something is wrong with this photo...')), 'bad');
          game.particles?.burst(pos, 'glitch', null, 1.5);
        }
        break;
      }
      default: break;
    }
    void from;
  }
  // gunshot: tracer + muzzle flash sprite (no extra lights: light count is fixed) + impact sparks
  let tracerGeo = null;
  const flashTex = makeFlashTex();
  function shotFx(d) {
    const a = v3(d.a), b = v3(d.b);
    if (!a || !b) return;
    snd(['gun_shot', 'shotgun_fire'], a, 1.0, { refDistance: 6, maxDistance: 120, pitch: has('gun_shot') ? 1 : 1.6 });
    if (!tracerGeo) tracerGeo = new THREE.CylinderGeometry(0.012, 0.012, 1, 4, 1, true).translate(0, 0.5, 0).rotateX(Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: '#ffe6a0', transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const m = new THREE.Mesh(tracerGeo, mat);
    m.position.copy(a); m.lookAt(b); m.scale.set(1.6, 1.6, a.distanceTo(b));
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, color: '#ffd27a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    sp.position.copy(a); sp.scale.setScalar(0.55);
    game.scene.add(m, sp);
    S.tracers.push({ m, sp, t: 0 });
    if (!d.h) game.particles?.burst(b, 'sparks', a.clone().sub(b).normalize(), 0.7);
    // near-miss whizz for the local player
    const me = game.camera.position, ab = b.clone().sub(a), L = ab.length() || 1;
    const tt = clampN(me.clone().sub(a).dot(ab) / (L * L), 0, 1);
    if (!d.h && a.clone().addScaledVector(ab, tt).distanceTo(me) < 1.6) { game.sfx?.('swing_whoosh', 0.5); game.engine?.shake(0.12); }
  }
  function barkFx(d) {
    const v = game.creatures.views.get(d.id);
    if (!v || typeof document === 'undefined') return;
    const c = document.createElement('canvas'); c.width = 256; c.height = 40;
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'rgba(8,10,14,0.78)'; ctx.fillRect(0, 4, 256, 32);
    const col = v.model?.faction?.color || '#ffd27a';
    ctx.fillStyle = col; ctx.fillRect(0, 4, 4, 32);
    ctx.font = '22px VT323, monospace'; ctx.textAlign = 'center'; ctx.fillStyle = '#ffffff'; ctx.fillText(String(d.t || ''), 130, 27);
    const tex = new THREE.CanvasTexture(c); tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, fog: false, depthTest: false }));
    s.scale.set(1.9, 0.3, 1); s.renderOrder = 6;
    game.scene.add(s);
    S.bubbles.push({ s, v, t: 0 });
    snd(['radio_static_1', 'walkie_static'], v.pos.clone().add(new THREE.Vector3(0, 1.6, 0)), 0.35, { maxDistance: 35 });
  }
  function shoveMe(d) {
    const p = game.player;
    if (!p || p.dead) return;
    const f = clampN(Number(d.f) || 6, 0, 10);
    const dx = clampN(Number(d.d[0]) || 0, -1, 1), dz = clampN(Number(d.d[1]) || 0, -1, 1);
    p.vel.x += dx * f; p.vel.z += dz * f; p.vel.y = Math.max(p.vel.y, 2.4); p.grounded = false;
    game.engine?.shake(0.25);
    game.sfx?.(has('impact_punch') ? 'impact_punch' : 'hit_flesh', 0.6);
  }
  // mopping: collapse the blood-trail decal quads around the mop (the set-piece decal mesh is one merged geometry)
  function mopFx(d) {
    const p = v3(d.p);
    const sp = game.world.facility?.setPieces;
    if (!p || !sp) return;
    if (!sp._hDecal) sp._hDecal = (sp.owned || []).find((o) => o.isMesh && o.renderOrder === 1 && o.material?.vertexColors && o.material?.polygonOffsetFactor === -4) || false;
    const mesh = sp._hDecal;
    if (mesh) {
      const pos = mesh.geometry.attributes.position, r = clampN(Number(d.r) || 1, 0.3, 2), r2 = r * r;
      let changed = false;
      for (let q = 0; q + 3 < pos.count; q += 4) {
        const cx = (pos.getX(q) + pos.getX(q + 2)) / 2, cz = (pos.getZ(q) + pos.getZ(q + 2)) / 2, cy = pos.getY(q);
        if ((cx - p.x) ** 2 + (cz - p.z) ** 2 > r2 || Math.abs(cy - p.y) > 2.5) continue;
        for (let k = 0; k < 4; k++) pos.setXYZ(q + k, cx, cy, cz);
        changed = true;
      }
      if (changed) pos.needsUpdate = true;
    }
    if (p.distanceTo(game.player.pos) < 25) game.particles?.burst(p.clone().add(new THREE.Vector3(0, 0.1, 0)), 'splash', null, 0.5);
  }
  function dropFx(d) {
    const p = v3(d.p);
    if (!p) return;
    const F = FACTIONS[(d.f | 0) % FACTIONS.length];
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 2.4, 120, 10, 1, true), new THREE.MeshBasicMaterial({ color: F.color, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
    beam.position.set(p.x, p.y + 60, p.z);
    game.scene.add(beam);
    S.beams.push({ m: beam, t: 0 });
    snd(['dropship', 'ship_thrusters'], p, 1.2, { refDistance: 15, maxDistance: 300 });
  }
  function tickFx(dt) {
    for (let i = S.tracers.length - 1; i >= 0; i--) {
      const tr = S.tracers[i];
      tr.t += dt;
      tr.m.material.opacity = Math.max(0, 0.95 - tr.t * 9);
      tr.sp.material.opacity = Math.max(0, 1 - tr.t * 16);
      if (tr.t > 0.12) { tr.m.removeFromParent(); tr.m.material.dispose(); tr.sp.removeFromParent(); tr.sp.material.dispose(); S.tracers.splice(i, 1); }
    }
    for (let i = S.bubbles.length - 1; i >= 0; i--) {
      const b = S.bubbles[i];
      b.t += dt;
      const alive = game.creatures.views.get(b.v.id) === b.v;
      b.s.position.set(b.v.pos.x, b.v.pos.y + (b.v.height || 1.8) + 0.55 + b.t * 0.08, b.v.pos.z);
      b.s.material.opacity = b.t > 1.8 ? Math.max(0, 1 - (b.t - 1.8) * 3) : 1;
      if (b.t > 2.2 || !alive) { b.s.removeFromParent(); b.s.material.map?.dispose(); b.s.material.dispose(); S.bubbles.splice(i, 1); }
    }
    for (let i = S.beams.length - 1; i >= 0; i--) {
      const b = S.beams[i];
      b.t += dt;
      b.m.material.opacity = 0.35 * Math.max(0, 1 - b.t / 5) * (0.8 + 0.2 * Math.sin(b.t * 20));
      b.m.scale.x = b.m.scale.z = 1 + Math.sin(b.t * 3) * 0.1;
      if (b.t > 5) { b.m.removeFromParent(); b.m.geometry.dispose(); b.m.material.dispose(); S.beams.splice(i, 1); }
    }
  }

  // ================================================================================== client: views
  function lookOf(pid) {
    if (!pid) return null;
    if (pid === game.selfId) { const p = game.profile; return { suit: p.suit, hat: p.hat, name: p.name, level: p.level, title: safeTitle(p) }; }
    const r = game.remotes.get(pid);
    return r ? { suit: r.suit, hat: r.hat, name: r.name, level: r.level, title: r.title } : null;
  }
  function safeTitle(p) { try { return titleOf(p) || ''; } catch { return ''; } }
  function makeTag(name, level, title, revealed) {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const ctx = c.getContext('2d');
    ctx.font = '28px VT323, monospace'; ctx.textAlign = 'center';
    if (revealed) {
      ctx.fillStyle = '#ff2a3a'; ctx.fillText('???', 128, 30);
      ctx.fillStyle = 'rgba(0,255,220,0.5)'; ctx.fillText('???', 131, 31);
      ctx.font = '20px VT323, monospace'; ctx.fillStyle = '#ff8a8a'; ctx.fillText('Lv.?', 128, 54);
    } else {
      ctx.fillStyle = '#b8ffcc'; ctx.fillText(String(name || 'Employee').slice(0, 18), 128, 30);
      ctx.font = '20px VT323, monospace'; ctx.fillStyle = '#ffd27a'; ctx.fillText('Lv.' + (level || 1), 128, 54);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.NearestFilter; tex.magFilter = THREE.NearestFilter; tex.generateMipmaps = false;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: true, fog: false }));
    s.scale.set(1.1, 0.28, 1);
    if (!revealed && title) applyNameTagTitle(s, name, level, title);
    return s;
  }
  function viewTick(dt) {
    const eye = game.camera.position;
    for (const v of game.creatures.views.values()) {
      if (v.hType === 'doppel' || v.type === 'doppel') { doppelView(v, dt); continue; }
      if (SQUAD_TYPES.has(v.type)) { soldierView(v); continue; }
      if (v.type === 'mimic' && typeof v.extra === 'string' && v.extra[0] === 'R' && !v._hRevealed) deepfakeRevealed(v);
    }
    void eye;
  }
  function doppelView(v, dt) {
    if (!v.hType) {
      // masquerade as a crewmate decoy everywhere the UI special-cases mimics (scan, pings, bestiary)
      v.hType = 'doppel'; v.type = 'mimic';
      if (v.ring) { v.ring.removeFromParent(); v.ring.material.dispose(); v.ring = null; }
      v.affix = null;
      v._hLx = v.pos.x; v._hLz = v.pos.z; v._hStep = 0;
    }
    const ex = typeof v.extra === 'string' ? v.extra : '';
    const revealed = ex.startsWith('R:');
    const pid = revealed ? ex.slice(2) : ex;
    const look = lookOf(pid);
    if (look || revealed) {
      const key = `${pid}|${look?.suit}|${look?.hat}|${look?.name}|${look?.level}|${look?.title}|${revealed}`;
      if (key !== v._hLook) {
        v._hLook = key;
        if (look) v.model.setLook?.(suitColor(look.suit), look.hat);
        v.model.setTag?.(makeTag(look?.name, look?.level, look?.title, revealed));
        v.model.setRevealed?.(revealed);
        v.name = revealed ? '???' : look?.name || v.name;
      }
    }
    if (v.state !== 'dead') {
      const dd = Math.hypot(v.pos.x - v._hLx, v.pos.z - v._hLz);
      v._hLx = v.pos.x; v._hLz = v.pos.z;
      if (dd < 1) v._hStep += dd;
      if (v._hStep > (v.state === 'run' ? 2.3 : 1.9)) { v._hStep = 0; game.footstep?.(v.pos, v.state === 'run' ? 0.5 : 0.3, false); }
    }
    void dt;
  }
  const _hv = new THREE.Vector3();
  function soldierView(v) {
    if (!v._hNamed && v.model?.faction) { v._hNamed = true; v.def = { ...v.def, name: `${v.model.faction.short} ${v.def.name}` }; }
    if (!v.model?.setLaser) return;
    v.model.setLaser(null);   // wave 5: the laser (jitter -> steady -> white lock at the frozen point) is drawn by src/game/aimtell.js for every shooter
    void _hv;
  }
  function deepfakeRevealed(v) {
    v._hRevealed = true;
    v.name = '???';
    v.model?.parts?.avatar?.setEyeColor?.('#ff2030');
    for (const o of [...v.root.children]) if (o.isSprite) { o.removeFromParent(); o.material?.map?.dispose(); o.material?.dispose(); }
    const tag = makeTag('', 0, '', true);
    if (tag) { tag.position.y = 2.15; v.root.add(tag); }
    const hullM = new THREE.MeshBasicMaterial({ color: '#ff1a3a', side: THREE.BackSide, transparent: true, opacity: 0.8, depthWrite: false, fog: false });
    const meshes = [];
    v.root.traverse((o) => { if (o.isMesh && o.name !== 'visor') meshes.push(o); });
    for (const o of meshes) { const h = new THREE.Mesh(o.geometry, hullM); h.scale.setScalar(1.09); o.add(h); }
  }

  // ================================================================================== client: HUD
  function dockTick(dt) {
    S.dockT -= dt;
    if (S.dockT > 0) return;
    S.dockT = 0.25;
    let html = '';
    const W = S.clientWave;
    let swarm = 0, squad = 0;
    for (const v of game.creatures.views.values()) {
      if (v.state === 'dead') continue;
      if (v.type === 'zombot') swarm++;
      else if (SQUAD_TYPES.has(v.type)) squad++;
    }
    S.swarmCount = swarm; S.squadCount = squad;
    if (W && game.run?.phase === 'moon') html += `<div class="hdock"><b>☠ ${tf('WAVE {i}/{n}', { i: W.i || 0, n: W.n })}</b> · ${swarm}<div class="bar"><i style="width:${Math.round(100 * (W.i || 0) / Math.max(1, W.n))}%"></i></div></div>`;
    if (squad && game.run?.phase === 'moon') html += `<div class="hdock"><b>⚠ ${t('HIT SQUAD')}</b> · ${squad}</div>`;
    if (html === S.dockHtml) return;
    S.dockHtml = html;
    if (!html) { S.dock?.remove(); S.dock = null; return; }
    if (typeof document === 'undefined') return;
    ensureStyle();
    if (!S.dock || !S.dock.isConnected) S.dock = hudDock('right', 'horde', 35);
    S.dock.innerHTML = html;
  }

  // ================================================================================== pistol (Hit Squad loot)
  let nextShot = 0;
  function firePistol(it) {
    const now = game.time || 0;
    if (now < nextShot) return;
    const p = game.player;
    if ((it.ammo ?? 0) <= 0) {
      const magId = p.slots.find((id) => id && game.items.get(id)?.type === 'hs_mag');
      if (!magId) { game.sfx?.('ui_error', 0.5); game.ui?.toast(t('Out of ammo.'), 'info'); nextShot = now + 0.4; return; }
      it.ammo = ITEMS.hs_pistol?.ammo || 6;
      game.net.broadcast('itst', { id: it.id, am: it.ammo });
      game.net.request('consume', { id: magId });
      snd(['gun_reload', 'shotgun_reload'], null, 0.8);
      nextShot = now + 1.1;
      return;
    }
    nextShot = now + (it.def.cd || 0.32);
    it.ammo -= 1;
    game.net.broadcast('itst', { id: it.id, am: it.ammo });
    const eye = game.camera.position.clone();
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(game.camera.quaternion);
    const reach = it.def.reach || 30;
    const wall = game.physics.raycast(eye, fwd, reach, G.STATIC | G.DOOR);
    const maxD = wall ? wall.distance : reach;
    const r = game.creatures.raycast(eye, fwd, maxD);
    const end = eye.clone().addScaledVector(fwd, r ? r.t : maxD);
    const muzzle = eye.clone().add(new THREE.Vector3(0.14, -0.1, -0.3).applyQuaternion(game.camera.quaternion));
    game.net.broadcast('fx', { k: 'hshot', a: muzzle.toArray().map((x) => +x.toFixed(2)), b: end.toArray().map((x) => +x.toFixed(2)), h: r ? 1 : 0 });
    game.net.request('noise', { p: eye.toArray(), loud: 2 });
    if (r) game.net.request('hit', { cid: r.view.id, dmg: Math.round((it.def.dmg || 24) * (game.stats?.meleeMul || 1)), kb: 0.6 });
    game.engine?.shake(0.15);
    game.engine?.punch?.(0.03, (rnd() - 0.5) * 0.01, 0);
    game.swingAnim = 0.5;
  }

  // ================================================================================== wiring
  function update(dt) {
    if (S.disposed) return;
    if (isHost()) { try { hostUpdate(dt); } catch (e) { console.warn('[horde] host', e); } }
    SWARM.update(dt, game.engine?.scene, game.camera?.position);   // normally already advanced by CreatureManager.update this frame (deduped)
    camera.update();
    viewTick(dt);
    tickFx(dt);
    dockTick(dt);
  }
  on('update', (dt, g) => { if (g === game) update(dt); });
  on('moonPopulated', (g) => { if (g === game) hostOnMoonPopulated(); });
  on('phase', (ph, g) => { if (g === game && ph !== 'moon') { S.clientWave = null; if (isHost()) S.waves = null; } });
  on('fx', (d, from) => onFx(d, from));
  on('useItem', (it, hk, g) => { if (g === game && it && !hk.handled && it.type === 'hs_pistol') { hk.handled = true; firePistol(it); } });
  on('objectives', (add, g, phase) => {
    if (g !== game || phase !== 'moon') return;
    const W = S.clientWave;
    if (W) add(tf('Survive the swarm: wave {i}/{n} ({c} left)', { i: W.i || 0, n: W.n, c: S.swarmCount || 0 }), 'warn');
    if (S.squadCount) add(tf('Hit squad in the sector: {n} hostiles', { n: S.squadCount }), 'warn');
  });
  // other wave-1 modules (facility / lore / balance): alarms + extraction start swarm waves, wars send hit squads
  const truthy = (d, keys) => keys.some((k) => d?.[k] === true || d?.[k] === 1 || d?.[k] === 'on' || d?.[k] === 'start');
  on('tfg:facility', (d) => {
    if (!isHost()) return;
    const s = typeof d === 'string' ? d : JSON.stringify(d || {});
    const now = game.time || 0;
    if (now - (S.alarmT ?? -999) < 90) return;   // one alarm swarm per 90 s
    if (/alarm|lockdown/i.test(s) && !/"(alarm|security)"\s*:\s*(false|"(off|passive|active|normal)")/i.test(s) && startWaves('alarm', null)) S.alarmT = now;
  });
  on('tfg:extraction', (d) => { if (isHost() && (d === undefined || d === true || truthy(d, ['on', 'active', 'start', 'started', 'phase']) || /start|begin|alarm/i.test(String(d?.phase || d?.state || '')))) startWaves('extraction', null); });
  on('tfg:war', (d) => { if (d && d.faction) S.wars.set(String(d.faction), !!d.on); });
  on('sessionEnd', (g) => { if (g === game) dispose(); });

  function dispose() {
    if (S.disposed) return;
    S.disposed = true;
    for (const off of offs) { try { off(); } catch { /* ignore */ } }
    offs.length = 0;
    camera.dispose();
    for (const tr of S.tracers) { tr.m.removeFromParent(); tr.m.material.dispose(); tr.sp.removeFromParent(); tr.sp.material.dispose(); }
    for (const b of S.bubbles) { b.s.removeFromParent(); b.s.material.map?.dispose(); b.s.material.dispose(); }
    for (const b of S.beams) { b.m.removeFromParent(); b.m.geometry.dispose(); b.m.material.dispose(); }
    S.tracers.length = 0; S.bubbles.length = 0; S.beams.length = 0;
    tracerGeo?.dispose(); flashTex?.dispose();
    S.banner?.remove(); S.banner = null; clearTimeout(S.bannerTimer);
    S.dock?.remove(); S.dock = null;
    SWARM.dispose();
    SWARM.onDeath = null;
    TRACK.clear();
  }

  return {
    spawnHitSquad,
    spawnSwarm(pos, n = 10) {
      if (!isHost() || !pos) return 0;
      const zone = pos.y < FACILITY_Y + 40 ? 'in' : 'out';
      const level = 1 + Math.floor(sector() / 2);
      let made = 0;
      for (let i = 0; i < clampN(n | 0, 1, MAX_SWARM); i++) if (spawnAround(new THREE.Vector3(pos.x, zone === 'in' ? game.world.facility?.layout.y ?? pos.y : pos.y, pos.z), zone, level, { hunt: true })) made++;
      return made;
    },
    waveActive: () => (isHost() ? !!S.waves : !!S.clientWave),
    startWaves,
    camera,
    stats: () => ({ swarm: countSwarm(M()), squads: S.squads.size, wave: S.waves ? { idx: S.waves.idx, total: S.waves.total, zone: S.waves.zone } : null, drawCalls: SWARM.drawCalls }),
    update,   // only needed without a mod manager
    dispose,
  };
}

function clampN(v, a, b) { return v < a ? a : v > b ? b : v; }
function makeFlashTex() {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = 32; c.height = 32;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,230,1)'); g.addColorStop(0.35, 'rgba(255,200,90,0.8)'); g.addColorStop(1, 'rgba(255,120,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 32, 32);
  x.fillStyle = 'rgba(255,240,200,0.9)'; x.fillRect(0, 15, 32, 2); x.fillRect(15, 0, 2, 32);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}
