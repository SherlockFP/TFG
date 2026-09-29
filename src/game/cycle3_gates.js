// GLITCH GATES in full (module 'cycle3', part 'gates'; design docs/MASTERPLAN.md 14.1, rules cycle3_core.js).
//   * After a moon day a gate may open (quota 1+): rank E..S (S needs quota 5+), a themed short dungeon (wings, labyrinth from rank C, a mini-boss with the arena card from
//     rank D, the theme boss scaled by rank). Terminal GATES lists them, GATE GO <n> arms one (then the lever lands on it, like a keystone). The dungeon is the same generator
//     the Sector Cores use (facility.js wings + labyrinth + arena), the run is cycle_inst.js kind 'gate' (cycle.js gets the gate through `ext.gateDef` / `arm`).
//   * RED gate (14 %, rank D+): the exit is sealed until the boss falls, boss hp x1.35, damage x1.2, +1 elite per wing, twice the loot (+1 rarity step).
//   * HIDDEN gate (7 %, quota 2+, rank C+): not listed. A clue names the server type; PING (terminal, in orbit) answers hot / warm / cold for the routed moon; on the right moon a
//     glitch tear hangs deep in the facility and a scan pulse close to it logs the gate. Inside, a hidden SANCTUM holds the three-rules statue puzzle (Respect the Algorithm,
//     Worship the viewers, Stay alive: touch the statues in the numbered order; a wrong touch zaps you) for a mythic chest and the title "Glitch Walker".
//   * GATE BREAK: an uncleared gate breaks after 2 days; from quota 2 that starts a SIEGE on the next regular moon day (siege.js); at quota 1 it is only a warning.
// Net: request 'c3req' ops gate / ping / scan / statue; host -> all 'c3s' {k:'found'|'statue'|'gateclear'|'title'|'siegewarn'}; state run.c3.gates + run.c3live.sanctum.
import * as THREE from 'three';
import { RNG, hashString } from '../core/rng.js';
import { t, tf } from '../core/i18n.js';
import { MOONS } from './moons.js';
import { sectorMoons } from './moongen.js';
import { ITEMS } from './items.js';
import { rollWeaponAffixes } from './loot.js';
import { layoutKit } from '../world/interiors/common.js';
import { BOSS_TABLE } from './cycle_core.js';
import * as P from './cycle_plan.js';
import { wrapMethod } from './dailyEvents.js';
import { disposeGroup, textPlane, wrapLines, lambert, basic, box } from './cycle3_fx.js';

const TAU = Math.PI * 2;
const STATUE_COL = { algo: 0x40e0ff, viewers: 0xffffff, alive: 0xff4a5a };

export function installGates(C3) {
  const { game, mods, K } = C3;
  let disposed = false, tear = null, sanct = null, sanctSig = '', tearSig = '', siegeT = 0, landAt = 0;
  const cyc = () => C3.cycle();
  const G = () => game.run?.c3?.gates || null;
  const setG = (g) => { const c = C3.ensure(); if (c) { c.gates = g; C3.push(); } };
  const patchGate = (n, patch) => { const g = G(); if (g) setG(K.setGateState(g, 'cg' + n, patch)); };
  const live = () => game.run?.c3live || null;
  const setLive = (l) => { if (!C3.host() || !game.run) return; if (l) game.run.c3live = l; else delete game.run.c3live; C3.push(['c3live']); };
  const nameOfTheme = (th) => t(K.interiorLabel[th] || th || '?');
  const bossOfTheme = (th) => (BOSS_TABLE[th] || BOSS_TABLE.factory).name;
  const curInst = () => game.run?.cycle?.inst || null;

  // ============================================================ host: day roll, announce, break
  function announce(g) {
    if (g.hidden) {
      C3.say('ANOMALY: an unregistered signal was traced to a {t} server. Nothing is listed. Type PING in orbit, then scan deep inside the right server.', { t: nameOfTheme(g.theme) }, 'warn');
      C3.banner('UNREGISTERED SIGNAL', 'Type GATES', 'warn');
    } else {
      C3.say('{@k} (rank {r}, {t}) has opened. Clear it within {d} days. Type GATES.', { k: g.red ? 'A RED GLITCH GATE' : 'A GLITCH GATE', r: g.rank, t: nameOfTheme(g.theme), d: K.GATE.breakDays }, g.red ? 'bad' : 'warn');
      C3.banner(g.red ? 'RED GATE DETECTED' : 'GLITCH GATE OPENED', 'RANK {r}', g.red ? 'bad' : 'warn', { r: g.rank });
    }
  }
  function onBreak(b) {
    const siege = K.breakStartsSiege(C3.qi());
    C3.say('GATE BREAK: the rank {r} gate #{n} was not cleared in time. It tore open and its creatures are spilling out!', { r: b.rank, n: b.n }, 'bad');
    C3.banner('GATE BREAK', 'RANK {r}', 'bad', { r: b.rank });
    if (siege) { const c = C3.ensure(); c.siegeDue = (c.siegeDue | 0) + 1; }
    else C3.say('Early sectors are spared: the gate simply closes. Later ones send a siege.', {}, 'info');
  }
  function dayRoll() {
    const run = game.run, cy = cyc()?.state();
    if (!run || !cy || !C3.enabled() || game.onboard?.locked?.('gates')) return;   // [onboard] gifted after the first sector boss
    const c = C3.ensure();
    if ((c.gates.rolled | 0) >= run.day && c.gates.rolled !== -1) return;
    const tk = K.tickGates(c.gates, run.day);
    let g = tk.gates;
    for (const b of tk.broke) onBreak(b);
    const moons = K.sectorInteriors(sectorMoons().filter((m) => m.interior && !m.instance));
    const nu = K.rollGate({ runKey: C3.runKey(), day: run.day, q: C3.qi(), gates: g, moons, mode: cy.mode });
    if (nu) { g = K.addGate(g, nu, run.day); announce(nu); }
    c.gates = g; C3.push();
  }
  C3.phaseFns.push((ph) => {
    if (!C3.host()) return;
    if (ph === 'orbit') { try { dayRoll(); } catch (e) { console.warn('[cycle3] dayRoll', e); } }
    if (ph === 'orbit' || ph === 'takeoff' || ph === 'landing') { if (live()) setLive(null); }
    if (ph === 'moon' || ph === 'landing') landAt = game.time;
  });
  C3.hostStartFns.push(() => { if (game.run?.c3live) delete game.run.c3live; });   // a save never resumes inside a gate day
  // a pending gate-break siege starts ~2 min into the next regular moon day (siege.js decides whether it is allowed: quota 2+, one per day)
  C3.ticks.push((dt) => {
    if (!C3.host() || !game.run) return;
    const c = game.run.c3;
    if (!c || !(c.siegeDue > 0)) return;
    const moon = MOONS[game.run.moon];
    if (game.run.phase !== 'moon' || !moon || moon.instance || moon.company || moon.home) { siegeT = 0; return; }
    siegeT += dt;
    if (siegeT < 120) return;
    siegeT = 100;
    if (game.run.siege) return;
    C3.say('The broken gate\'s creatures reach the ship: SIEGE!', {}, 'bad');
    try { mods.emit('tfg:siege', { reason: 'gatebreak' }, game); } catch { /* siege module optional */ }
    if (game.run.siege) { c.siegeDue = Math.max(0, c.siegeDue - 1); C3.push(); siegeT = 0; }
  });

  // ============================================================ instance glue (cycle.js ext)
  const c0 = cyc();
  if (c0?.ext) {
    c0.ext.gateDef = (inst, runKey) => {
      const g = inst.spec;
      if (!g || !g.rank) return null;
      const core = P.coreMoonDef(runKey, inst.gateSector | 0, g.theme || null);
      return K.gateMoonFrom(core, g);
    };
    const resFn = (res, moon, inst) => { try { onResult(res, moon, inst); } catch (e) { console.warn('[cycle3] gate result', e); } };
    c0.ext.onResult.push(resFn);
    C3.disposers.push(() => { c0.ext.gateDef = null; const i = c0.ext.onResult.indexOf(resFn); if (i >= 0) c0.ext.onResult.splice(i, 1); });
  }

  function onResult(res, moon, inst) {
    if (res.kind !== 'gate' || !inst?.spec || !C3.host()) return;
    const g = inst.spec;
    // the gate moon disappears with the instance: route the ship to a real server (cycle.js does this for a won core; keystone / raid rely on the host's autopilot fallback)
    if (game.run.moon === inst.id) { const m = sectorMoons().find((x) => x && !x.instance && !x.company)?.id; if (m) { game.run.moon = m; C3.push(['moon']); } }
    if (!res.success) { say0('The gate is still open: you left before the boss fell. It breaks {d} days after it opened.', { d: K.GATE.breakDays }); return; }
    patchGate(g.n, { state: 'cleared' });
    const s = K.gateStats(g, C3.qi());
    game.net.broadcast('xp', { xp: s.xp, coin: s.coin, reason: g.hidden ? 'Hidden gate cleared' : g.red ? 'Red gate cleared' : 'Glitch gate cleared' });
    C3.say('GLITCH GATE {r} CLEARED. XP and loot are yours.', { r: g.rank }, 'good');
    C3.send({ k: 'gateclear', rank: g.rank, red: g.red ? 1 : 0, hidden: g.hidden ? 1 : 0 });
    if (g.red) C3.caseFiles?.open?.('redgate', { sector: C3.qi(), closed: true });
    try { mods.emit('tfg:gateCleared', { rank: g.rank, red: g.red, hidden: g.hidden }, game); } catch { /* ignore */ }
  }
  const say0 = (k, v) => C3.say(k, v, 'info');
  C3.on('gateclear', (m) => { game.ui?.hud?.bigText?.(t(m.hidden ? 'HIDDEN GATE CLEARED' : m.red ? 'RED GATE CLEARED' : 'GLITCH GATE CLEARED'), `${t('RANK')} ${m.rank}`); game.audio?.ui?.('ui_quota_met', 0.7); });

  // ============================================================ terminal (client)
  const dayNow = () => game.run?.day | 0;
  function gatesText() {
    const g = G();
    const out = [`${t('GLITCH GATES')} // ${t('rank')} E-S`];
    if (!g) return t('No run.');
    const list = K.listedGates(g);
    const hiddenPending = K.openGates(g).filter((x) => x.hidden && !x.found);
    if (!list.length && !hiddenPending.length) out.push(C3.qi() < K.GATE.fromQuota ? t('No gates yet. They start to open once you have met your first quota.') : t('No open gates. New ones open after moon days.'));
    for (const x of list) {
      const left = Math.max(0, x.expires - dayNow());
      const tag = x.hidden ? ` [${t('HIDDEN')}]` : x.red ? ` [${t('RED')}]` : '';
      const s = K.gateStats(x, C3.qi());
      out.push(`  #${x.n}  ${t('RANK')} ${x.rank}  ${nameOfTheme(x.theme)}${tag}   ${t('boss')}: ${t(bossOfTheme(x.theme))}   ${tf('breaks in {d} day(s)', { d: left })}${x.red ? '   ' + t('no exit until the boss falls') : ''}   ${t('chests')} x${s.chests}`);
    }
    for (const x of hiddenPending) out.push(`  ?   ${t('UNREGISTERED SIGNAL')}: ${tf('traced to a {t} server', { t: nameOfTheme(x.theme) })}. ${t('Type PING in orbit, then scan deep inside the right server.')}`);
    const inCycle = game.run?.cycle;
    if (inCycle?.mode === 'endless') out.push(t('In the Deep Feed only the S-rank gate (GATE) opens.'));
    else if (list.length) out.push(t('Type GATE GO <n> in orbit to arm one, then pull the lever. GATE CANCEL disarms it.'));
    return out.join('\n');
  }
  const regCmd = (name, fn, help) => { try { window.KefalAPI?.registerCommand?.(name, fn, help); C3.disposers.push(() => { try { window.__kefalMods?.commands?.delete?.(name); } catch { /* ignore */ } }); } catch { /* no terminal */ } };
  regCmd('gates', (rest, term) => term.print(gatesText()), 'glitch gates of the sector: rank, boss, breaks in N days');
  regCmd('gate', (rest, term) => {
    const cy = game.run?.cycle;
    if (cy?.mode === 'endless') {
      if (!cy.endless?.gate) { term.print(t('No gate is open right now.')); return; }
      game.net.request('cyreq', { op: 'gate' });
      return;
    }
    const a = String(rest[0] || '').toLowerCase();
    if (a === 'cancel') { C3.req('gate', { cancel: 1 }); return; }
    const num = /^#?(\d+)$/.exec(String(a === 'go' || a === 'enter' ? rest[1] || '' : rest[0] || ''));
    if (a === 'go' || a === 'enter' || num) C3.req('gate', { n: num ? +num[1] : 0 });
    else term.print(gatesText());
  }, 'GATE GO <n>: enter a glitch gate (GATES lists them); in the Deep Feed: the S-rank gate');
  regCmd('ping', () => C3.req('ping'), 'ship scanner: hot / warm / cold for an unregistered signal on the routed server');

  // ============================================================ host: requests
  C3.handle('gate', (d, from) => {
    const reply = (text, err, vars) => C3.term(from, text, err, vars);
    const cy = cyc()?.state(), api = cyc();
    if (!cy || !api) { reply('The sector cycle is off.', true); return; }
    if (d.cancel) { api.disarm('Gate cancelled.'); reply('Cancelled.'); return; }
    if (cy.mode === 'endless') { reply('In the Deep Feed only the S-rank gate (GATE) opens.', true); return; }
    const g0 = G();
    const list = g0 ? K.listedGates(g0) : [];
    if (!list.length) { reply('No open gates. New ones open after moon days.', true); return; }
    const gate = d.n ? list.find((x) => x.n === (d.n | 0)) : (list.length === 1 ? list[0] : null);
    if (!gate) { reply(d.n ? 'No such gate. Type GATES.' : 'Several gates are open: type GATE GO <n>. (GATES)', true); return; }
    const info = K.gateInfo(gate, C3.qi());
    const b = api.arm('gate', { gate, info }, reply);
    if (b) {
      C3.say('{@k} armed (rank {r}). Pull the lever to land.', { k: gate.hidden ? 'HIDDEN GATE' : gate.red ? 'RED GATE' : 'GLITCH GATE', r: gate.rank }, gate.red ? 'bad' : 'warn');
      if (gate.red) C3.say('RED GATE: once you land there is no way out until the boss falls.', {}, 'bad');
      reply('Gate armed. Pull the lever. (GATE CANCEL to disarm)');
    }
  });
  C3.handle('ping', (d, from) => {
    const run = game.run, g0 = G();
    const reply = (text, err, vars) => C3.term(from, text, err, vars);
    if (run.phase !== 'orbit') { reply('Only possible while in orbit.', true); return; }
    const hidden = g0 ? K.openGates(g0).find((x) => x.hidden && !x.found) : null;
    if (!hidden) { reply('PING: nothing unregistered on the sensors.'); return; }
    const m = MOONS[run.moon];
    const r = K.pingReading(hidden, run.moon, m?.interior);
    if (r === 'hot') reply('PING: HOT. The signal is on this server. Land and scan deep inside the facility.');
    else if (r === 'warm') reply('PING: warm. Same kind of server, but not this one.');
    else reply('PING: cold. Nothing here.');
  });
  C3.handle('scan', (d, from, p) => {
    const run = game.run, g0 = G();
    if (!p || p.dead || run.phase !== 'moon' || !g0) return;
    const hidden = K.openGates(g0).find((x) => x.hidden && !x.found && x.anchor === run.moon);
    const fac = game.world?.facility;
    if (!hidden || !fac) return;
    const spot = K.tearSpot(fac.scrapSpots, hidden.seed);
    if (!spot || !K.scanReveals(spot, p.pos, K.GATE.pingRange + 4)) return;
    patchGate(hidden.n, { found: true });
    C3.say('HIDDEN GATE LOGGED: rank {r}, {t}. It opens from orbit after takeoff: type GATES.', { r: hidden.rank, t: nameOfTheme(hidden.theme) }, 'good');
    C3.send({ k: 'found', rank: hidden.rank, theme: hidden.theme });
    C3.caseFiles?.open?.('hidden', { sector: C3.qi(), closed: false });
  });
  C3.on('found', (m) => { game.ui?.hud?.bigText?.(t('HIDDEN GATE LOGGED'), `${t('RANK')} ${m.rank} · ${nameOfTheme(m.theme)}`); game.audio?.ui?.('ui_quota_met', 0.8); game.engine?.shake?.(0.3); });

  // ============================================================ hidden gate: the tear (every peer)
  const hiddenHere = () => {
    const g0 = G(), run = game.run;
    if (!g0 || !run || (run.phase !== 'moon' && run.phase !== 'landing')) return null;
    return K.openGates(g0).find((x) => x.hidden && x.anchor === run.moon) || null;
  };
  function disposeTear() { if (tear) { disposeGroup(tear.group); tear = null; } tearSig = ''; }
  function buildTear() {
    disposeTear();
    const g0 = hiddenHere(), fac = game.world?.facility;
    if (!g0 || !fac || !game.scene || typeof document === 'undefined') return;
    const spot = K.tearSpot(fac.scrapSpots, g0.seed);
    if (!spot) return;
    const group = new THREE.Group();
    group.position.set(spot.x, spot.y + 1.15, spot.z); group.rotation.y = spot.yaw;
    const mat = new THREE.MeshBasicMaterial({ color: 0xff4fd0, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    const mat2 = new THREE.MeshBasicMaterial({ color: 0x40ffff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    const a = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 2.2), mat), b = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 1.6), mat2);
    b.position.set(0.12, 0.05, 0.03); b.rotation.z = 0.12;
    group.add(a, b);
    game.scene.add(group);
    tear = { group, mat, mat2, spot, gate: g0.n, t: 0 };
    tearSig = `${g0.n}|${g0.found ? 1 : 0}`;
  }
  C3.mapFns.push(() => { try { buildTear(); } catch (e) { console.warn('[cycle3] tear', e); } });
  C3.ticks.push((dt) => {
    const h = hiddenHere();
    const sig = h ? `${h.n}|${h.found ? 1 : 0}` : '';
    if (h && game.world?.facility && (!tear || tearSig !== sig)) { try { buildTear(); } catch { /* ignore */ } }
    else if (!h && tear) disposeTear();
    if (!tear || !h) return;
    tear.t += dt;
    const p = game.player?.pos;
    const d = p ? Math.hypot(p.x - tear.spot.x, p.z - tear.spot.z) : 99;
    const flick = 0.5 + 0.5 * Math.sin(tear.t * 13) * Math.sin(tear.t * 5.3);
    const o = h.found ? 0.55 + 0.25 * Math.sin(tear.t * 3) : d < 11 ? (0.08 + 0.1 * flick) * (1 - d / 14) : 0;
    tear.mat.opacity = Math.max(0, o); tear.mat2.opacity = Math.max(0, o * 0.8);
    tear.group.scale.set(1 + 0.08 * Math.sin(tear.t * 9), 1, 1);
  });
  C3.disposers.push(wrapMethod(game, 'scan', (orig) => function (...a) {
    const r = orig.apply(this, a);
    try {
      const h = tear && hiddenHere();
      const p = game.player?.pos;
      if (h && !h.found && p && K.scanReveals(tear.spot, p, K.GATE.pingRange)) C3.req('scan');
    } catch { /* ignore */ }
    return r;
  }));

  // ============================================================ hidden gate: the Sanctum + the three rules (host builds the plan, every peer draws it)
  const weaponPool = () => { const l = Object.values(ITEMS).filter((d) => d.kind === 'weapon' && !d.ranged && Array.isArray(d.value) && d.value[1] > 0 && d.dmg > 0); return l.length ? l : (ITEMS.machete ? [ITEMS.machete] : []); };
  function dropLoot(pos, spec, salt) {
    const r = new RNG(hashString(`${game.run.seed}:c3loot:${salt}`) >>> 0), pool = weaponPool(), drops = [];
    for (let i = 0; i < (spec.weapons || 0) && pool.length; i++) { const w = pool[Math.floor(r.next() * pool.length)]; drops.push({ type: w.id, af: rollWeaponAffixes(w, 8 + C3.qi(), r, { minRarity: spec.minRarity || 'epic', luck: 1 }) }); }
    for (const [id, n] of spec.shards || []) if (ITEMS[id]) for (let i = 0; i < n; i++) drops.push({ type: id });
    for (const [id, n] of spec.scrap || []) if (ITEMS[id]) for (let i = 0; i < n; i++) drops.push({ type: id });
    drops.forEach((dr, i) => {
      const a = (i / Math.max(1, drops.length)) * TAU;
      game.items.hostSpawn(dr.type, new THREE.Vector3(pos.x + Math.cos(a) * 0.9, pos.y + 1.0, pos.z + Math.sin(a) * 0.9), { linvel: [Math.cos(a) * 2, 3.2, Math.sin(a) * 2], af: dr.af || undefined, valueMul: 1.4 });
    });
  }
  let pz = null;   // host: StatuePuzzle
  function sanctumSetup() {
    const inst = curInst(), cur = cyc()?.inst?.cur, fac = game.world?.facility;
    pz = null;
    if (!C3.host() || !inst?.spec?.hidden || !cur || !fac?.layout) return;
    const L = fac.layout;
    const room = K.pickSanctumRoom(L, cur.plan.keyHolders.map((k) => k.room));
    if (room === null || room === undefined) return;
    const kit = layoutKit(L), rc = kit.roomRect(L.rooms[room]);
    const cx = (rc.x0 + rc.x1) / 2, cz = (rc.z0 + rc.z1) / 2;
    const walk = (x, z) => { const nav = fac.nav; if (!nav || nav.walkableAt(x, z)) return [x, z]; const g = nav.nearestWalkable(...nav.toGrid(x, z), 6); if (!g) return [x, z]; const w = nav.toWorld(g[0], g[1]); return [w.x, w.z]; };
    pz = new K.StatuePuzzle(inst.seed | 0);
    const sp = pz.slots.map((id, i) => ({ id, p: walk(cx + (i - 1) * 2.0, cz + 1.1) }));
    const plaque = walk(cx, cz - 1.7);
    setLive({ ...(live() || {}), sanctum: { room, y: L.y, gate: inst.spec.n, statues: sp.map((s) => ({ id: s.id, x: +s.p[0].toFixed(2), z: +s.p[1].toFixed(2) })), plaque: { x: +plaque[0].toFixed(2), z: +plaque[1].toFixed(2), rules: pz.plaque.map((r) => ({ n: r.n, text: r.text })) }, prog: 0, solved: 0 } });
    C3.say('Something hums behind the walls: a hidden SANCTUM. Read the three rules.', {}, 'warn');
  }
  const uniqLive = () => live()?.sanctum || null;
  function statueAt(id) { const s = uniqLive(); return s?.statues?.find((x) => x.id === id) || null; }
  C3.handle('statue', (d, from, p) => {
    const s = uniqLive();
    if (!s || !pz || pz.solved || !p || p.dead || game.run.phase !== 'moon') return;
    const st = statueAt(String(d.s || ''));
    if (!st || Math.hypot(p.pos.x - st.x, p.pos.z - st.z) > 3.6) return;
    const r = pz.press(st.id);
    if (r === 'ignored') return;
    const l = live();
    l.sanctum.prog = pz.progress; l.sanctum.solved = pz.solved ? 1 : 0;
    setLive({ ...l });
    C3.send({ k: 'statue', s: st.id, r, prog: pz.progress });
    if (r === 'wrong') {
      C3.sayTo(from, 'WRONG. The floor punishes improvisation.', {}, 'bad');
      try { game.hostHurtPlayer(from, 45, 'statue', null); } catch { /* ignore */ }
    } else if (r === 'done') {
      const pos = new THREE.Vector3(s.statues[1].x, s.y, s.plaque.z + 1.2);
      dropLoot(pos, { weapons: 2, minRarity: 'legendary', shards: [['shard_algo', 2], ['shard_source', 2]], scrap: [['goldbar', 4], ['x_goldbars', 2]] }, 'sanctum');
      C3.say('THE THREE RULES ARE KEPT. The Sanctum opens: a MYTHIC chest and the title "Glitch Walker".', {}, 'good');
      C3.banner('SANCTUM OPEN', 'GLITCH WALKER', 'good');
      C3.send({ k: 'title', title: 'Glitch Walker' });
      C3.trophy?.record?.({ id: 'hidden', src: 'gate', t: Math.max(0, game.time - landAt), sector: C3.qi() });
    }
  });
  C3.on('title', (m) => {
    const p = game.profile; if (!p || !m.title) return;
    p.titles = Array.isArray(p.titles) ? p.titles : [];
    if (!p.titles.includes(m.title)) { p.titles.push(m.title); try { game.progress?.save?.(); } catch { /* ignore */ } game.ui?.toast?.(tf('New title: {n}', { n: t(m.title) }), 'good'); }
  });
  C3.on('statue', (m) => {
    game.audio?.ui?.(m.r === 'wrong' ? 'ui_fired' : 'ui_notify', 0.6);
    if (m.r === 'wrong') game.engine?.shake?.(0.5);
  });
  // populate hook: after cycle.js populated the instance (the moonPopulated event fires before cycle's own populate)
  C3.disposers.push(wrapMethod(game, 'hostPopulateMoon', (orig) => function (...a) {
    const r = orig.apply(this, a);
    if (!disposed && C3.host() && C3.enabled()) { try { sanctumSetup(); } catch (e) { console.warn('[cycle3] sanctum', e); } }
    return r;
  }));

  // ---- drawing (every peer, from run.c3live.sanctum)
  function disposeSanct() { if (sanct) { disposeGroup(sanct.group); sanct = null; } sanctSig = ''; }
  function statueModel(id, lit) {
    const g = new THREE.Group(), col = STATUE_COL[id] || 0xffffff;
    g.add(box(0.9, 0.3, 0.9, lambert(0x2a2a30), 0, 0.15, 0));
    const stone = lambert(0x50525a);
    if (id === 'algo') {
      g.add(box(0.5, 0.75, 0.32, stone, 0, 0.7, 0));
      const face = textPlane(0.4, 0.5, 64, 80, (c, w, h) => { c.fillStyle = '#031418'; c.fillRect(0, 0, w, h); c.fillStyle = '#40e0ff'; c.fillRect(14, 24, 12, 12); c.fillRect(38, 24, 12, 12); c.fillRect(16, 52, 32, 5); }, {});
      face.position.set(0, 0.72, 0.17); g.add(face);
    } else if (id === 'viewers') {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), stone); m.position.y = 0.72; g.add(m);
      for (let i = 0; i < 9; i++) { const a = i * 2.4, e = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), basic(0xffffff)); e.position.set(Math.cos(a) * 0.29 * Math.cos(i * 0.5), 0.72 + Math.sin(i * 1.1) * 0.2, Math.sin(a) * 0.29); g.add(e); }
    } else {
      for (const sx of [-0.13, 0.13]) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), lambert(0x7a2a30)); m.position.set(sx, 0.85, 0); g.add(m); }
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.31, 0.5, 4), lambert(0x7a2a30)); cone.rotation.x = Math.PI; cone.position.set(0, 0.55, 0); g.add(cone);
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.03, 6, 20), basic(lit ? 0x40ff70 : col)); ring.rotation.x = Math.PI / 2; ring.position.y = 1.35; g.add(ring);
    return g;
  }
  function buildSanct() {
    disposeSanct();
    const s = uniqLive(), run = game.run;
    if (!s || !game.scene || typeof document === 'undefined' || run?.phase !== 'moon' || !game.world?.facility) return;
    const group = new THREE.Group(), order = K.RULES.map((r) => r.statue);
    for (const st of s.statues) { const m = statueModel(st.id, order.indexOf(st.id) < s.prog || !!s.solved); m.position.set(st.x, s.y, st.z); group.add(m); }
    // the plaque: a board with the three rules in scrambled order (numbers stay)
    const pl = new THREE.Group(); pl.position.set(s.plaque.x, s.y, s.plaque.z);
    pl.add(box(1.7, 1.15, 0.08, lambert(0x2b2118), 0, 1.35, 0), box(0.1, 0.8, 0.1, lambert(0x2b2118), 0, 0.4, 0));
    const draw = (c, w, h) => {
      c.fillStyle = '#efe4c9'; c.fillRect(0, 0, w, h); c.fillStyle = '#2b2014'; c.textAlign = 'center';
      c.font = 'bold 30px monospace'; c.fillText(t('THE THREE RULES'), w / 2, 44);
      c.font = 'bold 26px monospace'; c.textAlign = 'left';
      let y = 100;
      for (const r of s.plaque.rules) { for (const ln of wrapLines(c, `${r.n}. ${t(r.text)}`, w - 50)) { c.fillText(ln, 26, y); y += 34; } y += 12; }
    };
    for (const side of [1, -1]) { const f = textPlane(1.6, 1.05, 400, 262, draw); f.position.set(0, 1.35, 0.045 * side); if (side < 0) f.rotation.y = Math.PI; pl.add(f); }
    group.add(pl);
    game.scene.add(group);
    sanct = { group };
    sanctSig = sanctKey();
  }
  const sanctKey = () => { const s = uniqLive(); return s ? `${s.gate}|${s.prog}|${s.solved}|${game.run?.phase}` : ''; };
  C3.mapFns.push(() => { sanctSig = ''; });
  C3.ticks.push(() => {
    const k = sanctKey(), inMoon = game.run?.phase === 'moon' && game.world?.facility;
    if (!k || !inMoon) { if (sanct) disposeSanct(); return; }
    if (!sanct || sanctSig !== k) { try { buildSanct(); } catch (e) { console.warn('[cycle3] sanctum draw', e); } }
  });
  C3.interFns.push((list, p) => {
    const s = uniqLive();
    if (!s || s.solved || !p.indoor || game.run?.phase !== 'moon') return;
    for (const st of s.statues) {
      if (Math.hypot(p.pos.x - st.x, p.pos.z - st.z) > 4.5) continue;
      list.push({ pos: new THREE.Vector3(st.x, s.y + 1.0, st.z), r: 0.8, reach: 2.8, label: tf('Touch the statue of {n} [E]', { n: t(K.STATUE_NAMES[st.id] || st.id) }), sub: `${s.prog}/3`, action: () => C3.req('statue', { s: st.id }) });
    }
  });

  // ============================================================ objectives
  C3.objFns.push((add, phase) => {
    const cy = game.run?.cycle, g0 = G();
    if (phase === 'orbit' && g0 && cy?.mode !== 'endless') {
      const l = K.listedGates(g0);
      if (l.length && !(cy?.inst && cy.inst.state === 'armed')) add(tf('GLITCH GATES open: {n} (terminal GATES)', { n: l.length }), 'hint');
      const soon = l.filter((x) => x.expires - dayNow() <= 1);
      if (soon.length) add(tf('A gate breaks tomorrow: rank {r}', { r: soon[0].rank }), 'warn');
      if (K.openGates(g0).some((x) => x.hidden && !x.found)) add(t('UNREGISTERED SIGNAL: terminal PING'), 'hint');
    } else if (phase === 'moon') {
      const inst = cy?.inst;
      if (inst?.kind === 'gate' && inst.spec?.hidden) { const s = uniqLive(); add(s?.solved ? t('SANCTUM OPEN: take the mythic chest') : t('HIDDEN GATE: find the Sanctum and obey the three rules'), 'sub'); }
      else if (hiddenHere() && !hiddenHere().found) add(t('A glitch hums on this server: scan (middle mouse) deep inside the facility'), 'hint');
    }
  });

  return {
    gatesText, onResult, dayRoll, sanctumSetup, get tear() { return tear; }, get puzzle() { return pz; }, get sanct() { return sanct; },
    dispose() { disposed = true; disposeTear(); disposeSanct(); },
  };
}
