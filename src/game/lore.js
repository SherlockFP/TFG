// LORE module (wave 1): The Algorithm as the adaptive villain + factions + contracts + case files + lore logs.
// Installed with game.useModule('lore', installLore) -> game.lore. Self-contained: listens to the mods event bus,
// wraps nothing in shared files except two instance-level wraps (Progress.see for scan tracking, the host 'door'
// request handler for door counting) and ShipScreens.drawExtra (face on the vitals monitor while it talks), all
// restored on dispose. Net: host requests 'lore' {op}, host broadcasts 'lore' {k} (host-only type).
// See docs/wave1/lore.md for the systems summary and docs/LORE.md for the story bible.
import * as THREE from 'three';
import { HOST_ONLY } from '../net/session.js';
import { installAlgorithm, drawAlgoFace, FOCUS_NAME } from './algorithm.js';
import { installFactions, findFaction } from './factions.js';
import { installContracts, retrievalMatch } from './contracts.js';
import { installCaseFiles } from './casefile.js';
import { FACTIONS, FACTION_IDS, LORE_LOGS, LOG_BY_ID, CHAINS, SECRETS, chapterOf, pickLang } from './loredata.js';
import { createLoreBoard } from '../ui/panels/contracts.js';
import { createLogReader } from '../ui/panels/casefile.js';
import { MOONS } from './moons.js';
import { isSellable } from './items.js';
import { tierOfItem, tierIndex } from './tiers.js';
import { wrapMethod } from './dailyEvents.js';
import { RNG, hashString } from '../core/rng.js';
import { getLang, t, tf, upperT } from '../core/i18n.js';
import { SHIP } from '../world/ship.js';
import { SPOTS } from '../world/shiplayout.js';

HOST_ONLY.add('lore');   // clients only take 'lore' broadcasts from the host
const tr = () => { try { return getLang() === 'tr'; } catch { return false; } };
const BOARD_POS = { x: SPOTS.board.x, y: SPOTS.board.y, z: SHIP.z1 - 0.045 };   // +z wall inside the ship, between the terminal and the door

export function installLore(game) {
  const offs = [];
  const restores = [];
  let disposed = false;
  const core = {
    game, clock: 0, day: null, prevPhase: null, pendingSummary: null,
    broadcast(k, d = {}) { if (game.isHost) game.net?.broadcast('lore', { k, ...d }); },
    request(op, d = {}) { game.net?.request('lore', { op, ...d }); },
    emit(ev, payload) { try { game.mods?.emit?.(ev, payload, game); } catch (e) { console.warn('[lore] emit', ev, e); } },
    dayPlayer(id) {
      const day = core.day;
      if (!day) return { entered: false, activeT: 0, shipT: 0, loudT: 0, lightT: 0, apartT: 0, maxCarry: 0, doors: 0 };
      return day.players[id] || (day.players[id] = { name: game.playerName(id), entered: false, activeT: 0, shipT: 0, loudT: 0, lightT: 0, apartT: 0, maxCarry: 0, doors: 0 });
    },
    lastWords(id) {
      const list = chat.get(id) || [];
      const d = core.day?.deaths.find((x) => x.id === id);
      const limit = d ? d.at + 1500 : Infinity;
      const since = core.day?.startAt || 0;
      for (let i = list.length - 1; i >= 0; i--) if (list[i].at <= limit && list[i].at >= since) return list[i].text;
      return null;
    },
  };
  const chat = new Map();   // host: peer id -> last chat lines [{ text, at }]
  const on = (ev, fn) => { const off = game.mods?.on?.(ev, (...a) => { if (disposed) return; try { fn(...a); } catch (e) { console.warn('[lore]', ev, e); } }); if (off) offs.push(off); };

  core.algo = installAlgorithm(core);
  core.factions = installFactions(core);
  core.contracts = installContracts(core);
  core.cases = installCaseFiles(core);
  const { algo, factions, contracts, cases } = core;

  function ensureRun() {
    const run = game.run;
    if (!run) return;
    factions.ensure(run); contracts.ensure(run); algo.ensure(run);
  }
  function newDay() {
    const run = game.run;
    core.day = {
      key: `${run.runId}:${run.day}:${run.seed}`, moon: run.moon, theme: game.world?.facility?.layout?.theme || null, startAt: Date.now(), players: {},
      tot: { activeT: 0, shipT: 0, loudT: 0, lightT: 0, apartT: 0, doors: 0, maxCarry: 0, maxCarryBy: null, backtracks: 0, kills: 0, spells: 0 },
      deaths: [], abandoned: [], collected: [], seen: new Set(), events: [], said: {}, nudges: [], logsRead: new Set(), scanned: new Set(),
      lastDoorT: {}, sabotage: false, extracted: false, invasions: 0, secret: null, takeoffTime: 0, earlyTakeoff: false,
      killsSeen: game.hostData?.dayStats?.kills || 0, deathsSeen: 0, powerWas: run.powerOn !== false, facSeen: new Set(), perKills: {},
    };
  }
  function addEvent(label) { const d = core.day; if (d && !d.events.includes(label)) d.events.push(label); }

  // ---------------------------------------------------------------- host: polling the day
  let lastBlackoutT = -99;
  function hostDayTick() {
    const run = game.run, hd = game.hostData, day = core.day;
    if (!run || !hd || !day || run.phase !== 'moon') return;
    // secured items (for retrieval contracts, artifacts, most valuable item, extraction fallback)
    for (const id of hd.collected || []) {
      if (day.seen.has(id)) continue;
      day.seen.add(id);
      const it = game.items.get(id);
      if (!it?.def || !isSellable(it.def)) continue;
      const cls = {};
      for (const k of ['fragile', 'big', 'noisy', 'artifact']) cls[k] = retrievalMatch(k, it);
      const artifact = cls.artifact || tierIndex(tierOfItem(it, it.def)) >= tierIndex('epic');
      day.collected.push({ id, type: it.type, name: it.def.name, value: it.value || 0, artifact, cls });
      if (it.def.special === 'apparatus' && !day.extracted) { day.extracted = true; addEvent(t('Reactor core extracted')); }
    }
    // kills (+ who)
    const kills = hd.dayStats?.kills || 0;
    if (kills > day.killsSeen) {
      day.tot.kills += kills - day.killsSeen;
      day.killsSeen = kills;
      for (const [pid, p] of Object.entries(hd.dayStats.per || {})) { if ((p.kills || 0) > (day.perKills[pid] || 0)) day.lastKiller = pid; day.perKills[pid] = p.kills || 0; }
    }
    // deaths (+ alone = nobody alive within 30 m)
    const deaths = hd.dayStats?.deaths || [];
    while (day.deathsSeen < deaths.length) {
      const dd = deaths[day.deathsSeen++];
      const players = game.aiPlayers?.() || [];
      const me = players.find((p) => p.id === dd.id);
      const others = players.filter((p) => p.id !== dd.id && !p.dead);
      const alone = !!me && others.length > 0 && others.every((p) => p.pos.distanceTo(me.pos) > 30);
      day.deaths.push({ id: dd.id, name: dd.name, cause: dd.cause, alone, at: Date.now(), t: Math.round(run.time) });
      if (alone) day.abandoned.push(dd.name);
      const allDead = players.length > 0 && players.every((p) => p.dead);
      algo.onDeath(dd, allDead);
    }
    // power cut by the crew (not the director's blackout, not the landing blackout event)
    const pw = run.powerOn !== false;
    if (day.powerWas && !pw && (hd.moonT || 0) > 3 && core.clock - lastBlackoutT > 3) { day.sabotage = true; addEvent(t('Power cut')); }
    day.powerWas = pw;
  }

  // ---------------------------------------------------------------- host: day end sequence
  function endDay(summary) {
    const run = game.run;
    if (!core.day || !summary || summary.company) return;
    core.day.takeoffTime = core.day.takeoffTime || run.time;
    const settle = contracts.settleDay(summary);
    const res = algo.endDay(summary);
    factions.endDay();
    const c = cases.build(summary, res, settle);
    contracts.genOffers(true);
    game.broadcastRun?.();
    if (c) game.later?.(() => cases.hostPublish(c), 60);   // after the performance report is queued everywhere
    if (res?.focus) game.later?.(() => algo.hostSay('orbit_idle', {}, { force: true }), 16000);
    core.lastSummary = summary;
  }

  // ---------------------------------------------------------------- host request handler
  function hostOp(d, from) {
    const run = game.run;
    if (!run || !d || typeof d.op !== 'string') return;
    ensureRun();
    let res = null;
    switch (d.op) {
      case 'accept': res = contracts.hostAccept(Number(d.i) | 0, from); break;
      case 'abandon': res = contracts.hostAbandon(from); break;
      case 'sign': res = FACTIONS[d.f] ? factions.hostSign(d.f, from) : { err: true, text: 'Unknown faction.' }; break;
      case 'tribute': res = FACTIONS[d.f] ? factions.hostTribute(d.f, from) : { err: true, text: 'Unknown faction.' }; break;
      case 'log': {
        const l = LOG_BY_ID[d.id];
        if (!l || run.phase !== 'moon' || !core.day || core.day.logsRead.has(l.id)) return;
        core.day.logsRead.add(l.id);
        game.net.broadcast('sys', { text: `${game.playerName(from)} recovered a lore log: "${l.title}"`, kind: 'info' });
        if (Math.random() < 0.45) algo.hostSay('log_read', {}, { gap: 4 });
        return;
      }
      case 'scan': {
        if (run.phase !== 'moon' || !core.day || typeof d.type !== 'string' || d.type.length > 40) return;
        core.day.scanned.add(d.type);
        return;
      }
      default: return;
    }
    if (!res) return;
    if (d.term) game.net.sendTo(from, 'term', { to: from, text: res.text, err: !!res.err, cls: res.err ? 'err' : '' });
    else game.net.sendTo(from, 'sys', { text: res.text.split('\n')[0], kind: res.err ? 'bad' : 'good' });
    game.broadcastRun?.();
  }

  // ---------------------------------------------------------------- client: messages from the host
  function onMsg(d) {
    if (!d || typeof d.k !== 'string') return;
    const hud = game.ui?.hud;
    const T = tr();
    switch (d.k) {
      case 'say': algo.show(d); break;
      case 'case': cases.receive(d.c); break;
      case 'secret': {
        const s = SECRETS[d.id];
        hud?.bigText?.(t('SECRET OBJECTIVE COMPLETE'), tf('{pickLang} - ▮{credits} · {xp} XP', { pickLang: pickLang(s?.name, T), credits: d.credits, xp: d.xp }));
        game.sfx?.('ui_quota_met', 0.6);
        break;
      }
      case 'contract': if (d.state === 'complete') { hud?.bigText?.(t('CONTRACT COMPLETE'), `${pickLang(d.title, T)} · ${FACTIONS[d.f]?.name || ''}`); game.sfx?.('ui_quota_met', 0.5); } break;
      case 'war': {
        const f = FACTIONS[d.f];
        if (!f) break;
        hud?.bigText?.(d.on ? (t('⚔ WAR DECLARED')) : (t('CEASEFIRE')), upperT(f.name));
        if (d.on) { game.engine?.flash?.(0xff2010, 0.35); game.engine?.shake?.(0.3); }
        break;
      }
      case 'invade': {
        const f = FACTIONS[d.f];
        if (!f) break;
        hud?.bigText?.(`⚠ ${upperT(f.name)} ${t('HIT SQUAD')}`, t('HAS ENTERED THE SECTOR'));
        game.engine?.flash?.(0xff2010, 0.45); game.engine?.shake?.(0.4);
        game.sfx?.('ship_alarm', 0.6);
        break;
      }
      case 'ending': {
        const c = CHAINS[d.f];
        if (!c) break;
        const item = { tier: 'gold', icon: FACTIONS[d.f].glyph, kicker: t('FACTION ENDING'), name: pickLang(c.name, T), desc: pickLang(c.ending, T), reward: '' };
        if (game.achievements?.banner) game.achievements.banner(item); else hud?.bigText?.(item.kicker, item.name);
        break;
      }
      default: break;
    }
  }

  // ---------------------------------------------------------------- lore logs in facilities (deterministic on every peer)
  const logState = { placed: [], mats: [], texs: [], geos: [], t: 0 };
  function clearLogs() {
    for (const m of logState.placed) m.obj.removeFromParent();
    for (const x of [...logState.mats, ...logState.texs, ...logState.geos]) { try { x.dispose(); } catch { /* ignore */ } }
    logState.placed = []; logState.mats = []; logState.texs = []; logState.geos = [];
  }
  function logTexture(log, idx) {
    const c = document.createElement('canvas'); c.width = 128; c.height = 88;
    const x = c.getContext('2d');
    x.fillStyle = '#031208'; x.fillRect(0, 0, 128, 88);
    x.fillStyle = '#39ff6a'; x.font = 'bold 12px monospace'; x.fillText('▣ LOG ' + String(idx + 1).padStart(2, '0'), 6, 15);
    x.font = '10px monospace'; x.fillStyle = '#b9ffcf';
    const words = log.title.toLocaleUpperCase(getLang()).split(/\s+/); let line = '', y = 32;
    for (const w of words) { if ((line + ' ' + w).length > 18) { x.fillText(line, 6, y); y += 12; line = w; } else line = (line ? line + ' ' : '') + w; }
    if (line && y < 70) x.fillText(line, 6, y);
    x.fillStyle = '#39ff6a'; x.fillText('[E] READ', 6, 82);
    x.fillStyle = 'rgba(0,0,0,.3)'; for (let yy = 0; yy < 88; yy += 2) x.fillRect(0, yy, 128, 1);
    const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  function placeLogs() {
    clearLogs();
    const run = game.run, fac = game.world?.facility;
    if (!run || !fac || MOONS[run.moon]?.company || typeof document === 'undefined') return;
    const rng = new RNG(hashString('lorelogs:' + run.seed + ':' + run.moon));
    const n = rng.int(1, 3) + (factions.inner('archive') ? 1 : 0);
    const ch = chapterOf(run.quotaIndex).n;
    const pool = LORE_LOGS.map((l, i) => ({ l, i, w: l.ch === ch ? 4 : l.ch < ch ? 2 : 0.6 }));
    const walls = rng.shuffle((fac.wallSpots || []).filter((s) => (s.dist || 0) >= 2).slice());
    const floors = rng.shuffle((fac.scrapSpots || []).filter((s) => !s.elevated && (s.dist || 0) >= 2).slice());
    const spots = [];
    for (const s of [...walls.map((s) => ({ ...s, wall: true })), ...floors]) {
      if (spots.length >= n) break;
      if (spots.some((q) => Math.hypot(q.x - s.x, q.z - s.z) < 9)) continue;
      spots.push(s);
    }
    const back = new THREE.BoxGeometry(0.56, 0.4, 0.04); logState.geos.push(back);
    const plane = new THREE.PlaneGeometry(0.5, 0.34); logState.geos.push(plane);
    const backMat = new THREE.MeshBasicMaterial({ color: 0x0b0d0c }); logState.mats.push(backMat);
    for (const s of spots) {
      if (!pool.length) break;
      const pick = rng.weighted(pool);
      pool.splice(pool.indexOf(pick), 1);
      const tex = logTexture(pick.l, pick.i); logState.texs.push(tex);
      const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, fog: false }); logState.mats.push(mat);
      const g = new THREE.Group();
      const b = new THREE.Mesh(back, backMat); const p = new THREE.Mesh(plane, mat); p.position.z = 0.021;
      g.add(b, p);
      const rot = s.wall ? s.rotY : rng.float(0, Math.PI * 2);
      if (s.wall) g.position.set(s.x + Math.sin(rot) * 0.05, s.y + 1.45, s.z + Math.cos(rot) * 0.05);
      else { g.position.set(s.x, s.y + 0.06, s.z); g.rotation.x = -Math.PI / 2 + 0.25; }
      g.rotation.y = rot;
      if (!s.wall) g.rotation.order = 'YXZ';
      g.userData.loreLog = pick.l.id;
      fac.group.add(g);
      logState.placed.push({ obj: g, id: pick.l.id, idx: pick.i, mat, pos: new THREE.Vector3().copy(g.position).add(new THREE.Vector3(0, s.wall ? 0 : 0.3, 0)) });
    }
  }
  function readLog(log, fresh) {
    const p = game.profile;
    if (!p.loreLogs || typeof p.loreLogs !== 'object') p.loreLogs = {};
    const isNew = !p.loreLogs[log.id];
    if (isNew) { p.loreLogs[log.id] = { at: Date.now() }; try { game.progress?.save?.(); } catch { /* ignore */ } }
    if (fresh && game.run?.phase === 'moon') core.request('log', { id: log.id });
    const ui = game.ui;
    if (!ui?.openPanel) return;
    const found = LORE_LOGS.filter((l) => p.loreLogs[l.id]).length;
    const el = createLogReader(log, { index: LORE_LOGS.indexOf(log), total: LORE_LOGS.length, found, fresh: fresh && isNew, onClose: () => ui.closePanel() });
    game.terminal?.close?.();
    ui.openPanel(el);
    game.sfx?.('terminal_enter', 0.4);
  }

  // ---------------------------------------------------------------- the contract board in the ship (screen + [E])
  const board = { mesh: null, ctx: null, tex: null, t: 0, acc: 0, wrapped: false };
  function buildBoard() {
    if (typeof document === 'undefined' || !game.ship?.group) return;
    const c = document.createElement('canvas'); c.width = 192; c.height = 112;
    board.ctx = c.getContext('2d');
    board.tex = new THREE.CanvasTexture(c); board.tex.magFilter = THREE.NearestFilter; board.tex.minFilter = THREE.NearestFilter; board.tex.generateMipmaps = false; board.tex.colorSpace = THREE.SRGBColorSpace;
    const g = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.98, 0.06), new THREE.MeshBasicMaterial({ color: 0x120a10 }));
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.875), new THREE.MeshBasicMaterial({ map: board.tex, toneMapped: false }));
    screen.position.z = 0.032;
    g.add(frame, screen);
    g.position.set(BOARD_POS.x, BOARD_POS.y, BOARD_POS.z - 0.03);
    g.rotation.y = Math.PI;   // faces -z (into the ship)
    game.ship.group.add(g);
    board.mesh = g;
    drawBoard();
  }
  function drawBoard() {
    const x = board.ctx;
    if (!x) return;
    const run = game.run || {};
    const T = tr();
    drawAlgoFace(x, 80, 60, board.t, { mood: run.algo?.mood, glitch: 0.25, talk: algo.speaking ? 0.9 : 0.1 });
    x.save();
    x.fillStyle = '#0a0409'; x.fillRect(80, 0, 112, 112); x.fillRect(0, 60, 80, 52);
    x.fillStyle = '#ff3d7f'; x.font = 'bold 9px monospace';
    x.fillText(t('THE ALGORITHM LINK'), 84, 11);
    x.font = '9px monospace'; x.fillStyle = '#ffd9e6';
    const lines = [];
    const f = run.algo?.focus;
    lines.push(`${t('FOCUS')}: ${f ? pickLang(FOCUS_NAME[f], T) : '???'}`);
    const c = run.contract;
    if (c) { const tt = pickLang(c.title, T); lines.push(`${FACTIONS[c.faction]?.short || ''}: ${tt}`.slice(0, 20)); lines.push(`${c.state === 'complete' ? '✔' : ''} ${c.progress || 0}/${c.n}`); }
    else lines.push(`${(run.contracts?.offers || []).filter((o) => !o.taken).length} ${t('OFFERS')} [E]`);
    for (const id of FACTION_IDS) if (factions.war(id)) lines.push(`⚔ ${t('WAR')}: ${FACTIONS[id].short}`);
    lines.slice(0, 7).forEach((l, i) => x.fillText(l.slice(0, 20), 84, 25 + i * 11));
    // bottom-left: current intercom line / chapter
    x.fillStyle = '#ff3d7f'; x.font = '8px monospace';
    const cur = algo.state.cur;
    const text = cur ? cur.text.slice(0, Math.max(0, cur.shown)) : `CH${chapterOf(run.quotaIndex).n} ${pickLang(chapterOf(run.quotaIndex).name, T)}`;
    const words = String(text).split(/\s+/); let line = '', y = 70; let rows = 0;
    for (const w of words) { if ((line + ' ' + w).length > 15) { if (rows < 4) x.fillText(line, 3, y); y += 10; rows++; line = w; } else line = (line ? line + ' ' : '') + w; }
    if (rows < 4 && line) x.fillText(line, 3, y);
    x.fillStyle = 'rgba(0,0,0,0.25)'; for (let yy = 0; yy < 112; yy += 2) x.fillRect(0, yy, 192, 1);
    x.restore();
    board.tex.needsUpdate = true;
  }
  function updateBoard(dt) {
    board.t += dt;
    board.acc += dt;
    if (!board.mesh || board.acc < (algo.speaking ? 0.08 : 0.4)) return;   // [perf3] idle redraw 0.25 -> 0.4 s (canvas draw + texture upload, up to ~20 ms)
    board.acc = 0;
    if (game.camera?.position?.length?.() > 22) return;
    drawBoard();
    // the vitals monitor shows the face while the Algorithm talks (instance wrap, restored on dispose)
    const ss = game.shipScreens;
    if (ss && !board.wrapped && typeof ss.drawExtra === 'function') {
      board.wrapped = true;
      restores.push(wrapMethod(ss, 'drawExtra', (orig) => function (...a) {
        if (!disposed && algo.speaking && this.extra) { drawAlgoFace(this.extra.ctx, this.extra.c.width, this.extra.c.height, board.t, { mood: game.run?.algo?.mood, talk: 1, glitch: 0.4 }); this.extra.t.needsUpdate = true; return undefined; }
        return orig.apply(this, a);
      }));
    }
  }
  function openBoard(tab) {
    const ui = game.ui;
    if (!ui?.openPanel || typeof document === 'undefined') return null;
    game.terminal?.close?.();
    const el = createLoreBoard({ game, lore: core, tab, onClose: () => ui.closePanel() });
    ui.openPanel(el);
    game.sfx?.('terminal_enter', 0.4);
    return el;
  }
  core.logs = { read: (l, fresh) => readLog(l, fresh), placedCount: () => logState.placed.length, placed: () => logState.placed.map((p) => ({ id: p.id, pos: p.pos.toArray().map((v) => Math.round(v * 10) / 10) })) };
  core.openBoard = openBoard;

  // ---------------------------------------------------------------- terminal commands
  const mm = game.mods;
  const ownCmds = new Map();
  function registerCommands() {
    const kapi = typeof window !== 'undefined' ? window.KefalAPI : null;
    if (!kapi?.registerCommand) return;
    const api = { registerCommand: (name, fn, help) => { ownCmds.set(name, fn); kapi.registerCommand(name, fn, help); } };
    const T = () => tr();
    const req = (op, d) => core.request(op, { ...d, term: 1 });
    api.registerCommand('contracts', (rest, term) => { ensureRun(); term.print(contracts.listText()); }, 'contract board (3 daily offers)');
    api.registerCommand('accept', (rest, term) => {
      const i = parseInt(rest[0], 10);
      if (!i) { term.print(t('Usage: ACCEPT <n>  (see CONTRACTS)'), 'err'); return; }
      req('accept', { i: i - 1 }); term.print(t('Waiting for the host...'));
    }, 'accept contract <n>');
    api.registerCommand('abandon', (rest, term) => { req('abandon', {}); term.print('...'); }, 'abandon the active contract (-5 rep)');
    api.registerCommand('factions', (rest, term) => term.print(factions.statusText()), 'faction reputation, rivals, perks, wars');
    api.registerCommand('sign', (rest, term) => {
      const f = findFaction(rest.join(' '));
      if (!f) { term.print(t('Which faction? SIGN FEED / ARCHIVE / BUREAU / DARKWEB'), 'err'); return; }
      req('sign', { f }); term.print(`${FACTIONS[f].name}...`);
    }, 'sign an exclusive contract (+rep, its rival -rep)');
    api.registerCommand('tribute', (rest, term) => {
      const f = findFaction(rest.join(' '));
      if (!f) { term.print(t('TRIBUTE FEED / ARCHIVE / BUREAU / DARKWEB'), 'err'); return; }
      req('tribute', { f }); term.print(`${FACTIONS[f].name}...`);
    }, 'pay credits for +15 rep (ends wars)');
    api.registerCommand('cases', (rest, term) => term.print(cases.listText()), 'case file archive');
    api.registerCommand('case', (rest, term) => term.print(cases.caseText(rest[0])), 'CASE <n>: read a case file');
    api.registerCommand('logs', (rest, term) => {
      const p = game.profile.loreLogs || {};
      const got = LORE_LOGS.map((l, i) => ({ l, i })).filter((x) => p[x.l.id]);
      term.print([(t('RECOVERED LOGS ')) + `${got.length}/${LORE_LOGS.length}`, ...got.map((x) => `${String(x.i + 1).padStart(2, '0')}. ${x.l.title} - ${x.l.author}`), '', '>LOG <n>'].join('\n'));
    }, 'recovered lore logs');
    api.registerCommand('log', (rest, term) => {
      const l = LORE_LOGS[(parseInt(rest[0], 10) || 0) - 1];
      if (!l || !game.profile.loreLogs?.[l.id]) { term.print(t('Log not recovered yet.'), 'err'); return; }
      readLog(l, false);
    }, 'LOG <n>: read a recovered log');
    api.registerCommand('algo', (rest, term) => {
      if ((rest[0] || '') === 'voice') {
        const v = (rest[1] || '').toLowerCase();
        const onv = v === 'on' ? true : v === 'off' ? false : !game.settings?.algoVoice;
        algo.setVoice(onv);
        term.print(tf('THE ALGORITHM voice: {n}', { n: onv ? 'ON' : 'OFF' }));
        return;
      }
      const a = game.run?.algo || {};
      const s = a.scores || {};
      term.print([
        'THE ALGORITHM - ' + (t('behaviour analysis')),
        `${t("Today's focus")}: ${a.focus ? pickLang(FOCUS_NAME[a.focus], T()) : '???'}   ${t('mood')}: ${a.mood || 'curious'}   engagement: ${a.engagement ?? '?'}`,
        `${t("Yesterday's scores")}: ${Object.entries(s).map(([k, v]) => `${k} ${v}`).join(' · ') || '-'}`,
        ...(a.lines || []).map((l) => `  "${l}"`),
        '', '>ALGO VOICE ON|OFF   robotic voice (speech synthesis)',
      ].join('\n'));
    }, 'The Algorithm status (ALGO VOICE ON|OFF)');
    api.registerCommand('board', () => openBoard(), 'open the contract board');
  }

  // ---------------------------------------------------------------- wiring
  on('netReady', (net, g) => { if (g && g !== game) return; net.on_('lore', (d, from) => { if (!disposed && (from === net.selfId || from === net.hostId || game.isHost)) onMsg(d); }); });
  on('registerHandlers', (H, g) => {
    if (g && g !== game) return;
    H('lore', (d, from) => { try { hostOp(d, from); } catch (e) { console.warn('[lore] op', e); } });
    // count door opens per player (host request handler wrap)
    const net = game.net, orig = net?.handlers?.get('door');
    if (orig) {
      const w = (d, from) => {
        if (d?.open && core.day && game.run?.phase === 'moon') { core.day.tot.doors += 1; core.dayPlayer(from).doors += 1; core.day.lastDoorT[from] = core.clock; }
        return orig(d, from);
      };
      net.handle('door', w);
      restores.push(() => { if (net.handlers.get('door') === w) net.handle('door', orig); });
    }
  });
  on('hostStart', (g) => { if (g && g !== game) return; ensureRun(); contracts.genOffers(); game.broadcastRun?.(); });
  on('phase', (ph, g) => {
    if (g && g !== game) return;
    const prev = core.prevPhase;
    core.prevPhase = ph;
    ensureRun();
    if (game.isHost) {
      const moonDay = !MOONS[game.run?.moon]?.company;
      if (ph === 'landing' && moonDay) newDay();
      if (ph === 'takeoff' && core.day) core.day.takeoffTime = game.run.time;
    }
    algo.onPhase(ph, prev);
    factions.onPhase(ph, prev);
    contracts.onPhase(ph, prev);
    if (game.isHost && ph === 'orbit' && prev === 'takeoff' && core.pendingSummary) {
      const s = core.pendingSummary; core.pendingSummary = null;
      endDay(s);
    }
    if (ph === 'orbit') clearLogs();
  });
  on('mapLoaded', (w, g) => { if (g && g !== game) return; placeLogs(); });
  on('daySummary', (d, extra, g) => {
    if (g && g !== game) return;
    if (game.isHost) core.pendingSummary = d;
    const c = game.run?.contract;
    if (!d.company && c && (c.state === 'running' || c.state === 'complete') && Array.isArray(extra)) {
      const f = FACTIONS[c.faction], T = tr();
      const ok = c.state === 'complete' && !d.allDead;
      extra.push(`<span style="color:${f.color}">${f.glyph} ${t('CONTRACT')}</span> ${pickLang(c.title, T).replace(/</g, '&lt;')} - <b style="color:${ok ? '#7dff7d' : '#ff6b5a'}">${ok ? (t('PAID')) : (t('FAILED'))}</b>`);
    }
  });
  on('update', (dt, g) => {
    if (g && g !== game) return;
    core.clock += dt;
    if (game.isHost) { try { hostDayTick(); } catch (e) { console.warn('[lore] day', e); } }
    algo.update(dt);
    factions.update(dt);
    contracts.update(dt);
    updateBoard(dt);
    // pulse the log tablets
    logState.t += dt;
    const k = 0.75 + Math.sin(logState.t * 3) * 0.25;
    for (const p of logState.placed) p.mat.color.setScalar(k);
  });
  on('chat', (d, from, g) => {
    if (g && g !== game) return;
    if (!game.isHost || !d?.text) return;
    const l = chat.get(from) || [];
    l.push({ text: String(d.text).slice(0, 140), at: Date.now() });
    if (l.length > 6) l.shift();
    chat.set(from, l);
  });
  on('objectives', (add, g, phase) => { if (g && g !== game) return; contracts.objectives(add, phase); });
  on('interactables', (out, g) => {
    if (g && g !== game) return;
    const p = game.player;
    if (board.mesh && p.inShip) {
      const pos = new THREE.Vector3(BOARD_POS.x, 1.55, BOARD_POS.z - 0.25);
      out.push({ pos, r: 0.9, reach: 2.6, label: t('Contract board - The Algorithm [E]'), sub: () => (game.run?.contract ? pickLang(game.run.contract.title, tr()) : ''), action: () => openBoard() });
    }
    if (p.indoor && logState.placed.length) {
      for (const L of logState.placed) {
        if (L.pos.distanceTo(p.pos) > 4) continue;
        const log = LOG_BY_ID[L.id];
        const read = !!game.profile.loreLogs?.[L.id];
        out.push({ pos: L.pos, r: 0.5, reach: 2.2, label: `${t('Read log')}: ${log.title} [E]`, sub: read ? (t('(read)')) : (t('lost log')), action: () => readLog(log, true) });
      }
    }
  });
  on('director', (d) => { if (d?.kind === 'blackout') lastBlackoutT = core.clock; });
  on('tfg:facility', (d) => {
    if (!game.isHost || !core.day || game.run?.phase !== 'moon') return;
    const vals = [];
    const walk = (o, depth) => {
      if (depth > 3 || o === null || o === undefined) return;
      if (typeof o === 'string') { vals.push(o.toLowerCase()); return; }
      if (typeof o !== 'object') return;
      for (const [k, v] of Object.entries(o)) { if (v === true) vals.push(k.toLowerCase()); else walk(v, depth + 1); }
    };
    walk(d, 0);
    const s = vals.join(' ');
    const HITS = [['overload', 'Generator overload', true], ['destroy', 'Generator destroyed', true], ['lockdown', 'Lockdown', true], ['alarm', 'Alarm', true], ['breach', 'Containment breach', true], ['blackout', 'Blackout', false], ['fire', 'Fire', false], ['gas', 'Gas leak', false], ['toxic', 'Toxic leak', false]];
    for (const [k, label, sab] of HITS) {
      if (!s.includes(k) || core.day.facSeen.has(k)) continue;
      core.day.facSeen.add(k);
      addEvent(label);
      if (sab) core.day.sabotage = true;
      if (k === 'alarm' || k === 'lockdown') algo.hostSay('alarm', {}, { gap: 4 });
    }
  });
  on('tfg:extraction', (d) => {
    if (!game.isHost || !core.day) return;
    const ph = String(d?.phase || '').toLowerCase();
    if (d?.success === true || ['done', 'success', 'complete', 'extracted', 'escaped'].includes(ph)) {
      if (!core.day.extracted) { core.day.extracted = true; addEvent(t('Extraction')); algo.hostSay('extraction_done', {}, { gap: 3 }); }
    } else if (d?.success !== false && ph && !core.day.said.extraction) {
      core.day.said.extraction = true; addEvent(t('Extraction alarm')); algo.hostSay('extraction', {}, { force: true });
    }
  });
  on('tfg:spell', (d) => algo.onSpell(d));

  // scans (local player) -> host, for Investigation contracts: Progress.see(type) without "announce" = a scan
  const scanSent = new Set();
  if (game.progress) {
    restores.push(wrapMethod(game.progress, 'see', (orig) => function (type, announce, ...rest) {
      const r = orig.call(this, type, announce, ...rest);
      if (!disposed && !announce && game.run?.phase === 'moon' && type) {
        const k = (game.run.seed || 0) + ':' + type;
        if (!scanSent.has(k)) { scanSent.add(k); core.request('scan', { type }); }
      }
      return r;
    }));
  }

  registerCommands();
  try { buildBoard(); } catch (e) { console.warn('[lore] board', e); }

  // ---------------------------------------------------------------- public API (game.lore)
  return {
    /** show a line in the intercom (local); opts.all (host) = everyone; opts.voice = faction id; opts.cls = 'danger' | 'teach'; opts.ctx / opts.ttl see onegoal_core.inferCtx */
    say(text, opts = {}) {
      if (opts.all && game.isHost) core.broadcast('say', { text: String(text), voice: opts.voice || null, cls: opts.cls, pri: !!opts.pri, ctx: opts.ctx, ttl: opts.ttl });
      else algo.show({ text: String(text), voice: opts.voice || null, mood: opts.mood, pri: !!opts.pri, cls: opts.cls, ctx: opts.ctx, ttl: opts.ttl });   // [algoctx] opts.ctx / opts.ttl: where the line makes sense / seconds it may wait. [trim] opts.cls = 'danger' | 'teach' (default: flavour, or teach when pri)
    },
    factionRep: (id) => factions.rep(id),
    factions: () => FACTION_IDS.map((id) => ({ id, name: FACTIONS[id].name, color: FACTIONS[id].color, rival: FACTIONS[id].rival, rep: factions.rep(id), war: factions.war(id), discount: factions.discount(id) })),
    activeContract: () => game.run?.contract || null,
    war: (id) => factions.war(id),
    discount: (id) => factions.discount(id),
    focus: () => game.run?.algo?.focus || null,
    caseFiles: () => cases.list(),
    openBoard,
    readLog: (id) => LOG_BY_ID[id] && readLog(LOG_BY_ID[id], false),
    core,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const o of offs) { try { o(); } catch { /* ignore */ } }
      for (const r of restores.reverse()) { try { r(); } catch { /* ignore */ } }
      if (mm?.commands) for (const [c, fn] of ownCmds) if (mm.commands.get(c)?.fn === fn) mm.commands.delete(c);
      clearLogs();
      if (board.mesh) { board.mesh.removeFromParent(); board.mesh.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); }); board.tex?.dispose(); board.mesh = null; }
      algo.dispose(); contracts.dispose();
    },
  };
}
