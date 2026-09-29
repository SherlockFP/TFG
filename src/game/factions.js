// Factions: The Algorithm (Feed Corp), The Archive, Moderation Bureau, Dark Web (docs/LORE.md §3).
// Reputation -100..100 lives in run.factions (auto-synced + saved with the run). SIGN <faction> = exclusive contract:
// +rep with it, -rep with its rival (and a betrayal hit on the faction you signed with before). Rep < -40 = WAR:
// on a landing the warring faction may send an invasion (host roll per faction per day) that calls
// game.horde?.spawnHitSquad?.(factionId, pos, n) near the facility entrance or on the outdoor map.
import * as THREE from 'three';
import { FACTIONS, FACTION_IDS, START_REP, WAR_AT, HOSTILE_AT, REP_TIERS, INNER_PERKS, CHAINS, CHAIN_REQ, pickLang } from './loredata.js';
import { getLang, t, sysMsg, t as _t } from '../core/i18n.js';
import { RNG, hashString } from '../core/rng.js';
import { clamp } from '../core/util.js';

const tr = () => { try { return getLang() === 'tr'; } catch { return false; } };
export const SIGN_GAIN = 20, SIGN_RIVAL = -30, BETRAYAL = -20, RESIGN_GAIN = 10, RESIGN_RIVAL = -15;
export const tributeCost = (run) => 100 + 25 * ((run?.quotaIndex | 0));

export function repTier(rep) { return REP_TIERS.find((t) => rep >= t.at) || null; }
export function standing(rep) {
  if (rep < WAR_AT) return { id: 'war', name: ['WAR', 'SAVAŞ'], color: '#ff2a2a' };
  if (rep <= HOSTILE_AT) return { id: 'hostile', name: ['HOSTILE', 'DÜŞMANCA'], color: '#ff7a5a' };
  const t = repTier(rep);
  if (t) return { id: t.id, name: t.name, color: '#7dff7d' };
  return { id: 'neutral', name: ['NEUTRAL', 'TARAFSIZ'], color: '#e8e0d0' };
}

export function installFactions(core) {
  const { game } = core;
  const st = { invasions: [], lastInvasion: null, warned: new Set() };

  function ensure(run) {
    if (!run) return null;
    if (!run.factions || typeof run.factions !== 'object') run.factions = { ...START_REP };
    for (const id of FACTION_IDS) if (typeof run.factions[id] !== 'number' || !isFinite(run.factions[id])) run.factions[id] = START_REP[id];
    if (!run.chains || typeof run.chains !== 'object') run.chains = {};
    for (const id of FACTION_IDS) run.chains[id] = clamp(run.chains[id] | 0, 0, 5);
    if (run.signed && !FACTIONS[run.signed.f]) run.signed = null;
    return run.factions;
  }
  const rep = (id) => { const r = game.run?.factions?.[id]; return typeof r === 'number' ? r : (START_REP[id] ?? 0); };
  const war = (id) => rep(id) < WAR_AT;
  const discount = (id) => { const r = rep(id); if (r <= HOSTILE_AT) return -0.15; return repTier(r)?.discount || 0; };   // negative = surcharge
  const payBonus = (id) => repTier(rep(id))?.pay || 0;
  const inner = (id) => rep(id) >= REP_TIERS[0].at;

  /** host: change reputation, announce wars / peace (emits 'tfg:war') */
  function hostAdd(id, delta, reason) {
    const run = game.run;
    if (!game.isHost || !run || !FACTIONS[id] || !delta) return;
    ensure(run);
    const before = run.factions[id];
    const after = clamp(Math.round(before + delta), -100, 100);
    run.factions[id] = after;
    run.factions = { ...run.factions };   // new object: the diff sync sees the change
    if (before >= WAR_AT && after < WAR_AT) {
      core.emit('tfg:war', { faction: id, on: true });
      game.net.broadcast('sys', sysMsg('⚔ {n} HAS DECLARED WAR ON YOUR CREW', { n: FACTIONS[id].name.toUpperCase() }, 'bad'));
      core.broadcast('war', { f: id, on: true });
      core.algo?.hostSayFaction(id, 'war');
      game.later?.(() => core.algo?.hostSay('war', { faction: id }, { gap: 2 }), 5000);
    } else if (before < WAR_AT && after >= WAR_AT) {
      core.emit('tfg:war', { faction: id, on: false });
      game.net.broadcast('sys', sysMsg('{@name} has called off the war.', { name: FACTIONS[id].$name ?? FACTIONS[id].name }, 'good'));
      core.broadcast('war', { f: id, on: false });
      core.algo?.hostSay('peace', { faction: id }, { gap: 2 });
    }
    void reason;
  }

  /** host: SIGN <faction>. Returns reply text. */
  function hostSign(id, from) {
    const run = game.run;
    ensure(run);
    const f = FACTIONS[id];
    if (!f) return { err: true, text: 'Unknown faction. Type FACTIONS.' };
    if (!['orbit', 'company'].includes(run.phase)) return { err: true, text: 'Contracts are signed in orbit (or at HQ).' };
    if (war(id)) return { err: true, text: `${f.name} is at war with you. Pay TRIBUTE first.` };
    if (run.signed?.day === run.day) return { err: true, text: 'You already signed an exclusive deal today. The ink is still wet.' };
    const prev = run.signed?.f;
    const again = prev === id;
    if (prev && !again) hostAdd(prev, BETRAYAL, 'betrayal');
    hostAdd(id, again ? RESIGN_GAIN : SIGN_GAIN, 'sign');
    hostAdd(f.rival, again ? RESIGN_RIVAL : SIGN_RIVAL, 'rival');
    run.signed = { f: id, day: run.day };
    game.net.broadcast('sys', sysMsg('{name} signed an EXCLUSIVE contract with {@name2}. {@name3} is not happy.', { name: game.playerName(from), name2: f.$name ?? f.name, name3: FACTIONS[f.rival].$name ?? FACTIONS[f.rival].name }, 'warn'));
    core.algo?.hostSayFaction(id, 'sign');
    core.emit('tfg:contract', { id: 'sign:' + id, state: 'signed', faction: id });
    const lines = [`EXCLUSIVE CONTRACT SIGNED: ${f.name} (${f.org})`, `  ${f.name} +${again ? RESIGN_GAIN : SIGN_GAIN} rep   ${FACTIONS[f.rival].name} ${again ? RESIGN_RIVAL : SIGN_RIVAL} rep`];
    if (prev && !again) lines.push(`  Betrayal: ${FACTIONS[prev].name} ${BETRAYAL} rep`);
    lines.push(`  Their contracts pay +25% and one of them is always on the board.`);
    return { text: lines.join('\n') };
  }
  /** host: TRIBUTE <faction>: credits for +15 rep (how you end a war) */
  function hostTribute(id, from) {
    const run = game.run;
    ensure(run);
    const f = FACTIONS[id];
    if (!f) return { err: true, text: 'Unknown faction. Type FACTIONS.' };
    if (!['orbit', 'company'].includes(run.phase)) return { err: true, text: 'Tribute can only be wired from orbit (or at HQ).' };
    const cost = tributeCost(run);
    if (run.credits < cost) return { err: true, text: `Tribute costs ▮${cost}. You have ▮${run.credits}.` };
    run.credits -= cost;
    game.broadcastRun?.(['credits']);
    hostAdd(id, 15, 'tribute');
    game.net.broadcast('sys', sysMsg('{name} wired ▮{cost} tribute to {@name2}.', { name: game.playerName(from), cost, name2: f.$name ?? f.name }, 'info'));
    return { text: `Tribute of ▮${cost} accepted by ${f.name}. Reputation +15 (now ${rep(id)}).` };
  }

  // ---------------------------------------------------------------- invasions (host)
  function planInvasions() {
    st.invasions = [];
    const run = game.run;
    if (!game.isHost || !run) return;
    const rng = new RNG((hashString('inv:' + run.runId + ':' + run.day) ^ (run.seed >>> 0)) >>> 0);
    for (const id of FACTION_IDS) {
      if (!war(id)) continue;
      let chance = clamp(0.45 + (WAR_AT - rep(id)) / 100, 0.45, 0.85);
      if (id === 'darkweb' && inner('bureau')) chance *= 0.5;
      if (!rng.chance(chance)) continue;
      st.invasions.push({ f: id, at: rng.float(120, 300), done: false, n: clamp(2 + Math.floor((WAR_AT - rep(id)) / 20), 2, 5) });
    }
  }
  /** host: send a hit squad now (also used by tests / other modules). Returns the invasion record. */
  function invade(id, n = 3) {
    const f = FACTIONS[id];
    if (!game.isHost || !f) return null;
    const pos = invasionPos();
    game.net.broadcast('sys', sysMsg('⚠ {n} HIT SQUAD HAS ENTERED THE SECTOR', { n: f.name.toUpperCase() }, 'bad'));
    core.broadcast('invade', { f: id });
    core.algo?.hostSayFaction(id, 'invade');
    game.later?.(() => core.algo?.hostSay('invasion', { faction: id }, { gap: 2 }), 5500);
    let spawned = false;
    const fn = game.horde?.spawnHitSquad;
    if (typeof fn === 'function' && pos) {
      try { const r = fn.call(game.horde, id, pos, n); spawned = r !== false; } catch (e) { console.warn('[factions] hit squad', e); }
    }
    if (!spawned) game.net.broadcast('sys', sysMsg('(The {short} squad lost its signal in the Dead Feed. Lucky you.)', { short: f.short }, 'info'));
    st.lastInvasion = { f: id, n, pos: pos ? [Math.round(pos.x), Math.round(pos.y), Math.round(pos.z)] : null, spawned, day: game.run?.day, t: Math.round(game.run?.time || 0) };
    core.day?.events.push(`${f.short} hit squad invasion`);
    core.emit('tfg:war', { faction: id, on: true, invasion: true, n, spawned });
    return st.lastInvasion;
  }
  function invasionPos() {
    const players = (game.aiPlayers?.() || []).filter((p) => !p.dead && !p.inShip);
    const inside = players.filter((p) => p.zone === 'in').length;
    const fac = game.world.facility, out = game.world.outdoor;
    if (fac?.mainDoor?.spawn && inside >= Math.max(1, players.length / 2)) return fac.mainDoor.spawn.clone();
    const e = out?.mainExit?.pos;
    if (e) {
      const a = Math.random() * Math.PI * 2;
      const x = e.x + Math.cos(a) * 14, z = e.z + Math.sin(a) * 14;
      return new THREE.Vector3(x, game.world.terrain?.heightAt?.(x, z) ?? e.y, z);
    }
    return fac?.mainDoor?.spawn?.clone() || null;
  }

  function onPhase(ph) {
    if (!game.isHost) return;
    if (ph === 'moon') planInvasions();
    else if (ph === 'takeoff' || ph === 'orbit') st.invasions = [];
  }
  function update() {
    const run = game.run, hd = game.hostData;
    if (!game.isHost || !run || run.phase !== 'moon' || !st.invasions.length) return;
    for (const v of st.invasions) {
      if (v.done || (hd?.moonT || 0) < v.at) continue;
      v.done = true;
      if (war(v.f)) invade(v.f, v.n);
    }
  }
  /** host, end of a moon day: reputation drifts 1 toward 0 for factions you are not signed with */
  function endDay() {
    const run = game.run;
    ensure(run);
    for (const id of FACTION_IDS) {
      if (run.signed?.f === id) continue;
      const r = run.factions[id];
      if (r > 0) hostAdd(id, -1, 'drift'); else if (r < 0) hostAdd(id, 1, 'drift');
    }
  }

  // ---------------------------------------------------------------- display helpers
  function perkLines(id) {
    const T = tr();
    const out = [];
    for (const t of [...REP_TIERS].reverse()) {
      const on = rep(id) >= t.at;
      out.push({ on, text: `${pickLang(t.name, T)} (${t.at}+): ${Math.round(t.discount * 100)}% ${_t('discount')}, ${_t('contracts')} +${Math.round(t.pay * 100)}%${t.id === 'inner' ? ' · ' + pickLang(INNER_PERKS[id], T) : ''}` });
    }
    return out;
  }
  function chainInfo(id) {
    const c = CHAINS[id], step = game.run?.chains?.[id] | 0;
    const req = CHAIN_REQ[step];
    return { name: c.name, step, total: c.steps.length, next: step < c.steps.length ? c.steps[step] : null, req };
  }
  function statusText() {
    const run = game.run || {};
    ensure(run);
    const T = tr();
    const out = [t('FACTIONS - reputation -100..100 (war below -40)'), ''];
    for (const id of FACTION_IDS) {
      const f = FACTIONS[id], r = rep(id), s = standing(r);
      const bar = '[' + '#'.repeat(Math.round((r + 100) / 10)).padEnd(20, '-') + ']';
      out.push(`${f.glyph} ${f.name.padEnd(18)} ${String(r).padStart(4)} ${bar} ${pickLang(s.name, T)}${run.signed?.f === id ? '  [SIGNED]' : ''}`);
      out.push(`    ${f.org} · ${t('leader')}: ${f.leader} · ${t('rival')}: ${FACTIONS[f.rival].name}`);
      const ch = chainInfo(id);
      out.push(`    ${t('chain')} "${pickLang(ch.name, T)}" ${ch.step}/${ch.total}${ch.next ? ` · ${t('next')}: ${pickLang(ch.next.title, T)} (rep ${ch.req.rep}+)` : ' · COMPLETE'}`);
      const d = discount(id);
      if (d) out.push(`    ${d > 0 ? (t('discount')) + ' ' + Math.round(d * 100) + '%' : (t('surcharge')) + ' ' + Math.round(-d * 100) + '%'}`);
    }
    out.push('', t('>SIGN <faction>   exclusive contract (+20, its rival -30; once a day)'));
    out.push(T ? `>TRIBUTE <fraksiyon>  ▮${tributeCost(run)} öde, +15 itibar (savaşı bitirir)` : `>TRIBUTE <faction>  pay ▮${tributeCost(run)} for +15 rep (ends wars)`);
    return out.join('\n');
  }

  return {
    ensure, rep, war, discount, payBonus, inner, hostAdd, hostSign, hostTribute, invade, planInvasions,
    onPhase, update, endDay, perkLines, chainInfo, statusText,
    get lastInvasion() { return st.lastInvasion; },
    get plannedInvasions() { return st.invasions.map((v) => ({ ...v })); },
  };
}

/** Fuzzy faction lookup for terminal input ("bureau", "mod", "dark", "arch", "feed"...). */
export function findFaction(q) {
  q = String(q || '').toLowerCase().replace(/[^a-z]/g, '');
  if (!q) return null;
  const alias = { feed: 'algorithm', algo: 'algorithm', corp: 'algorithm', karma: 'algorithm', wayback: 'archive', lib: 'archive', mod: 'bureau', moderation: 'bureau', halvorsen: 'bureau', dark: 'darkweb', phish: 'darkweb', dayi: 'darkweb', uncle: 'darkweb', web: 'darkweb' };
  for (const [k, v] of Object.entries(alias)) if (q.startsWith(k)) return v;
  return FACTION_IDS.find((id) => id.startsWith(q) || FACTIONS[id].name.toLowerCase().replace(/[^a-z]/g, '').includes(q)) || null;
}
