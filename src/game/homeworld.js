// HOMEWORLD TYCOON (wave 2, module 'homeworld'; docs/wave2/homeworld.md, design docs/MASTERPLAN.md section 17).
// Route HOME (free, always in orbit): a barren plateau + landing pad + BUILD console. Build mode: [E] at the console or [H] opens the CRT panel; pick a
// building -> grid ghost (LMB place, R rotate, RMB / ESC leave, U upgrade / Delete sell / M move the building under the crosshair). The host validates
// everything (src/game/homeworld_core.js, pure + node-tested). Buildings produce per GAME DAY (day counter of the run, never real time) into a capped
// home storage; COLLECT moves credits to the ship, Clout to every crew member, meals / shards as items. Raids: <= 8 % per landed day, only with >= 3
// buildings, never two days in a row: an abstract seeded defence sim (RaidSim) with a live HUD feed while the crew is away; landing at HOME during it adds
// crew firepower. State lives on the HOST profile (profile.homeworld, survives run resets) and syncs through run.hw (late joiners get it in `welcome`).
// Net (all prefixed 'hw'): request hwact {op,...}  ->  host messages hwmsg {k:'ok'|'err'|'alert'|'raid'|'collect', ...}.
import * as THREE from 'three';
import { t, tf, addTranslations } from '../core/i18n.js';
import { MOONS, BIOMES, registerMoon } from './moons.js';
import { ITEMS } from './items.js';
import { HOST_ONLY } from '../net/session.js';
import { G } from '../physics/physics.js';
import * as H from './homeworld_core.js';
import { buildHomeworldMap, HOME_Y, CONSOLE_POS } from '../world/homeworld_map.js';
import { createBuildingModel, createGhost, setWrecked } from '../models/homeworld.js';
import { createHomeworldPanel } from '../ui/panels/homeworld.js';
import { installHomeRaid } from './homeworld_raid.js';   // [finish] on-site raid: real raiders + visible tower fire

HOST_ONLY.add('hwmsg');

// ---------------------------------------------------------------------------------------------- moon + biome (registered once, every peer)
BIOMES.homeworld = {
  name: 'Homeworld', ground: 'rock', ground2: 'concrete_dark', rock: 'rock', sky: 0x5a3a7a, fog: 0x5a3a70, fogDensity: 0.0065, night: 0x1a0c34, sun: 0xffb070,   // [home3] permanent violet dusk: the Algorithm's stream hour, unlike any moon
  height: 0, rough: 0, planet: 0x6fa8ff, fx: 'sparkle', noBushes: true, step: 'concrete', trees: null,
};
if (!MOONS.home) {
  registerMoon({
    id: 'home', name: 'Homeworld', short: 'HOME', tier: 0, cost: 0, home: true, biome: 'homeworld', interior: 'factory', size: 1,
    desc: 'Your own rock. Build, upgrade and defend a base: it produces while the days pass.', weather: ['clear'], creatures: {}, outdoor: {},
    scrapCount: [0, 0], scrapMul: 0, power: 0, outdoorPower: 0, customMap: buildHomeworldMap,
  });
}

const B_TR = { 'Content Farm': 'İçerik Çiftliği', 'Server Rack Array': 'Sunucu Rafları', Generator: 'Jeneratör', 'Solar Array': 'Güneş Paneli', 'Cooling Unit': 'Soğutma Ünitesi', 'Scrap Refinery': 'Hurda Rafinerisi', 'Shard Distiller': 'Parça Damıtıcı', 'Garden / Kitchen': 'Bahçe / Mutfak', Barracks: 'Kışla', 'Trophy Hall': 'Ganimet Salonu', 'Arcade / Lounge': 'Salon / Oyun', Warehouse: 'Depo', 'Gun Tower': 'Silah Kulesi', 'Tesla Tower': 'Tesla Kulesi', 'Flame Tower': 'Alev Kulesi', 'Cryo Tower': 'Buz Kulesi', 'Sniper Tower': 'Keskin Nişancı Kulesi', Wall: 'Duvar', Gate: 'Kapı', 'Spike Field': 'Kazık Alanı', 'Mine Field': 'Mayın Tarlası' };
const B_RU = { 'Content Farm': 'Контент-ферма', 'Server Rack Array': 'Серверные стойки', Generator: 'Генератор', 'Solar Array': 'Солнечные панели', 'Cooling Unit': 'Охладитель', 'Scrap Refinery': 'Мусороперерабатывающий завод', 'Shard Distiller': 'Дистиллятор осколков', 'Garden / Kitchen': 'Сад / Кухня', Barracks: 'Казармы', 'Trophy Hall': 'Зал трофеев', 'Arcade / Lounge': 'Аркада / Лаунж', Warehouse: 'Склад', 'Gun Tower': 'Пушечная башня', 'Tesla Tower': 'Башня Тесла', 'Flame Tower': 'Огнемётная башня', 'Cryo Tower': 'Крио-башня', 'Sniper Tower': 'Снайперская башня', Wall: 'Стена', Gate: 'Ворота', 'Spike Field': 'Шипы', 'Mine Field': 'Минное поле' };
const U_TR = { Homeworld: 'Ev Gezegeni', HOMEWORLD: 'EV GEZEGENİ', BUILD: 'İNŞA', MANAGE: 'YÖNET', STATUS: 'DURUM', ECONOMY: 'EKONOMİ', POWER: 'ELEKTRİK', DEFENCE: 'SAVUNMA', UPGRADE: 'YÜKSELT', MOVE: 'TAŞI', SELL: 'SAT', REPAIR: 'TAMİR', 'REPAIR ALL': 'HEPSİNİ TAMİR ET', COLLECT: 'TOPLA', WRECKED: 'HARAP', 'BUILD MODE': 'İNŞA MODU', CLOSE: 'KAPAT', Components: 'Parçalar', Credits: 'Kredi', Meals: 'Yemek', buildings: 'bina', Power: 'Elektrik', Cooling: 'Soğutma', 'Not enough credits.': 'Yeterli kredi yok.', 'Not enough components.': 'Yeterli parça yok.', 'Nothing to collect.': 'Toplanacak bir şey yok.', 'You must be on the homeworld.': 'Ev gezegeninde olmalısın.', 'Nothing built yet. Use the BUILD tab.': 'Henüz bir şey yok. İNŞA sekmesini kullan.', 'HOMEWORLD UNDER ATTACK': 'EV GEZEGENİ SALDIRI ALTINDA', 'RAID REPELLED': 'BASKIN PÜSKÜRTÜLDÜ', 'HOMEWORLD BREACHED': 'EV GEZEGENİ YARILDI', 'Fly home to defend it: lever, ROUTE HOME, lever.': 'Savunmak için eve uç: kol, ROUTE HOME, kol.', 'DEPOSIT HELD COMPONENTS': 'ELDEKİ PARÇALARI YATIR', 'WITHDRAW 6 COMPONENTS': '6 PARÇA ÇEK', 'BUILD console [E]': 'İNŞA konsolu [E]', 'Homeworld: buildings produce per game day. Use BUILD at the pad console (or H).': 'Ev gezegeni: binalar oyun günü başına üretir. Pistteki konsoldan (veya H) İNŞA et.' };
const U_RU = { Homeworld: 'Родной мир', HOMEWORLD: 'РОДНОЙ МИР', BUILD: 'СТРОИТЬ', MANAGE: 'УПРАВЛЕНИЕ', STATUS: 'СТАТУС', ECONOMY: 'ЭКОНОМИКА', POWER: 'ЭНЕРГИЯ', DEFENCE: 'ОБОРОНА', UPGRADE: 'УЛУЧШИТЬ', MOVE: 'ПЕРЕНЕСТИ', SELL: 'ПРОДАТЬ', REPAIR: 'РЕМОНТ', 'REPAIR ALL': 'ЧИНИТЬ ВСЁ', COLLECT: 'СОБРАТЬ', WRECKED: 'РАЗРУШЕНО', 'BUILD MODE': 'РЕЖИМ СТРОЙКИ', CLOSE: 'ЗАКРЫТЬ', Components: 'Детали', Credits: 'Кредиты', Meals: 'Еда', buildings: 'зданий', Power: 'Энергия', Cooling: 'Охлаждение', 'Not enough credits.': 'Не хватает кредитов.', 'Not enough components.': 'Не хватает деталей.', 'Nothing to collect.': 'Нечего собирать.', 'You must be on the homeworld.': 'Нужно быть на родном мире.', 'HOMEWORLD UNDER ATTACK': 'РОДНОЙ МИР ПОД АТАКОЙ', 'RAID REPELLED': 'НАБЕГ ОТБИТ', 'HOMEWORLD BREACHED': 'РОДНОЙ МИР ПРОРВАН', 'Fly home to defend it: lever, ROUTE HOME, lever.': 'Лети домой: рычаг, ROUTE HOME, рычаг.', 'BUILD console [E]': 'Консоль СТРОЙКИ [E]' };
addTranslations({ ...B_TR, ...U_TR }, 'tr'); addTranslations({ ...B_RU, ...U_RU }, 'ru');

const EMPTY = H.blankState();
const hash = (s) => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const CSS = `#hw-hint{position:fixed;left:50%;bottom:120px;transform:translateX(-50%);z-index:30;font:22px var(--font,'VT323',monospace);color:#ffd9b8;background:rgba(10,6,2,.82);border:1px solid #a8531f;padding:4px 14px;pointer-events:none;text-shadow:0 0 8px rgba(255,138,61,.5)}
#hw-hint.bad{color:#ff8a7a;border-color:#a83a2a}
#hw-raid{position:fixed;right:14px;top:96px;z-index:30;width:270px;font:20px var(--font,'VT323',monospace);color:#ffd9b8;background:rgba(20,4,2,.88);border:1px solid #d23a2a;box-shadow:0 0 18px rgba(210,58,42,.45);padding:6px 10px;pointer-events:none}
#hw-raid b{color:#ff6b5a;letter-spacing:2px}#hw-raid i{display:block;height:6px;background:rgba(255,255,255,.12);margin:2px 0 4px}#hw-raid i s{display:block;height:100%;background:#ff6b5a}#hw-raid.done{border-color:#7dff7d}#hw-raid.done b{color:#7dff7d}`;

export function installHomeworld(game) {
  const mods = game.mods, offs = [];
  const views = new Map();
  let disposed = false, vg = null, panel = null, boundNet = null, hintEl = null, raidEl = null, rs = null, pending = null, sig = '', syncT = 0, hudT = 0, lastAct = 0;
  const raid = installHomeRaid(game, { get views() { return views; }, setWrecked });   // [finish]
  const bm = { on: false, type: null, moveId: 0, rot: 0, ghost: null, x: 0, z: 0, ok: false, key: '' };
  const host = () => !!game.isHost;
  const S = () => { const s = game.run?.hw; return s && Array.isArray(s.b) ? s : EMPTY; };
  const st = () => game.profile.homeworld;
  const onHome = () => !!(MOONS[game.run?.moon]?.home && !MOONS[game.run?.moon]?.ghost && game.run?.phase === 'moon' && game.world?.outdoor?.home);   // [h2] the ghost-raid map is not your base
  const exhibits = () => { try { return Object.values(game.profile.bestiary || {}).filter((e) => (e?.kills | 0) > 0).length; } catch { return 0; } };
  const posOf = (id) => (id === game.selfId ? game.player.pos : game.remotes.get(id)?.pos) || null;
  if (!document.getElementById('tfg-hw-hud-css')) { const s = document.createElement('style'); s.id = 'tfg-hw-hud-css'; s.textContent = CSS; document.head.appendChild(s); }

  // ------------------------------------------------------------------------------------------ host: state, actions
  function commit(extra = []) {
    if (!host()) return;
    game.run.hw = st();
    try { game.broadcastRun(['hw', ...extra]); game.progress?.save?.(); } catch (e) { console.warn('[hw] commit', e); }
  }
  function attach() {
    const p = game.profile;
    p.homeworld = H.sanitize(p.homeworld);
    game.run.hw = p.homeworld; game.run.hwr = null;
    H.daysSince(p.homeworld, game.run.runId || '', game.run.day || 0);   // mark only: a loaded / new run never pays retroactively
  }
  const err = (to, why) => game.net.sendTo(to, 'hwmsg', { k: 'err', why });
  const drop = (type, at, n = 1) => { for (let i = 0; i < n; i++) game.items.hostSpawn(type, new THREE.Vector3(at.x + (Math.random() - 0.5) * 0.8, at.y + 0.7, at.z + (Math.random() - 0.5) * 0.8), {}); };
  function hostCollect(from) {
    const s = st(), c = H.collect(s), at = posOf(from) || new THREE.Vector3(0, 0, 8);
    if (!Object.keys(c).length) return err(from, 'Nothing to collect.');
    const run = game.run;
    if (c.cr) run.credits += c.cr;
    if (c.clout) for (const p of game.aiPlayers()) game.net.broadcast('xp', { to: p.id, xp: 0, coin: c.clout, reason: 'Homeworld' });
    let k = Math.min(4, Math.floor((c.meals || 0) / 3)); if (!ITEMS.medkit) k = 0;
    if (c.meals) { s.s.meals += c.meals - k * 3; if (k) drop('medkit', at, k); }
    let left = 8;
    for (const key of ['s1', 's2', 's3', 's4']) {
      const n = c[key] || 0; if (!n) continue;
      const id = H.SHARD_ITEM[key], put = ITEMS[id] ? Math.min(n, left) : 0;
      if (put) { drop(id, at, put); left -= put; }
      if (n > put) s.s[key] += n - put;
    }
    commit(['credits']);
    game.net.broadcast('hwmsg', { k: 'collect', cr: c.cr || 0, clout: c.clout || 0, meals: k });
  }
  function hostDeposit(from) {
    const s = st(); let n = 0;
    for (const it of [...game.items.all()]) {
      if (n >= 12) break;
      if (it.holder !== from || !it.def?.component || it.soulbound || it._hwUsed) continue;
      const sk = Object.keys(H.SHARD_ITEM).find((k) => H.SHARD_ITEM[k] === it.type);
      if (sk) s.s[sk] = Math.min(H.capOf(s, sk), s.s[sk] + 1); else s.s.parts = Math.min(H.capOf(s, 'parts'), s.s.parts + (it.type === 'comp_crystal' || it.type === 'comp_ecto' ? 3 : 1));
      it._hwUsed = true; game.net.broadcast('it', { e: 'rm', id: it.id }); n++;
    }
    if (!n) return err(from, 'Hold components to deposit them.');
    commit();
  }
  function hostWithdraw(from) {
    const s = st(), n = Math.min(6, Math.floor(s.s.parts)), at = posOf(from);
    if (n < 1 || !at) return err(from, 'Not enough components.');
    s.s.parts -= n; game.crafting?.dropComponents?.(new THREE.Vector3(at.x, at.y + 0.3, at.z), Math.random() < 0.5 ? 'metal' : 'electronic', n); commit();
  }
  function hostAct(d, from) {
    if (!host() || !d || typeof d.op !== 'string') return;
    if (!onHome()) return err(from, 'You must be on the homeworld.');
    if (game.time - lastAct < 0.1) return; lastAct = game.time;
    const s = st(), wallet = { cr: game.run.credits }, i = (v) => Math.floor(Number(v) || 0);
    let r;
    switch (d.op) {
      case 'build': r = H.tryBuild(s, wallet, String(d.t), i(d.x), i(d.z), i(d.r)); break;
      case 'up': r = H.tryUpgrade(s, wallet, i(d.id)); break;
      case 'sell': r = H.trySell(s, wallet, i(d.id)); break;
      case 'move': r = H.tryMove(s, i(d.id), i(d.x), i(d.z), i(d.r)); break;
      case 'repair': r = H.tryRepair(s, wallet, d.id === 'all' ? 'all' : i(d.id)); break;
      case 'collect': return hostCollect(from);
      case 'deposit': return hostDeposit(from);
      case 'withdraw': return hostWithdraw(from);
      default: return;
    }
    if (!r.ok) return err(from, r.why);
    game.run.credits = wallet.cr;
    commit(['credits']);
    game.net.broadcast('hwmsg', { k: 'ok', op: d.op, t: r.b?.t || d.t, by: from });
  }

  // ------------------------------------------------------------------------------------------ host: days + raids
  function onPhase(ph) {
    if (!host() || !game.run?.hw) return;
    const run = game.run;
    if (ph === 'orbit') {
      pending = null;
      const n = H.daysSince(st(), run.runId || '', run.day || 0);
      if (n > 0 && st().b.length) {
        const rep = H.advanceDays(st(), n, { exhibits: exhibits() });
        commit();
        const wasted = Object.values(rep.wasted).some((v) => v > 0.5);
        game.net.broadcast('sys', { text: `HOMEWORLD: ${n} day(s) of production stored (${H.stored(st())} ready to collect)${wasted ? ' - storage is FULL, collect it!' : ''}`, kind: wasted ? 'warn' : 'info' });
      } else commit();
    } else if (ph === 'moon' && !MOONS[run.moon]?.home && !rs && Math.random() < H.raidChance(st(), run.day || 0)) pending = { at: game.time + 40 + Math.random() * 160 };
    if (ph !== 'moon') pending = null;
  }
  function raidFrame(extra) { const f = rs.sim.frame(); return { a: 1, w: f.w, W: f.W, r: Math.round(f.raiders * 100), tw: Math.round(f.tw * 100), thr: f.thr, wr: f.wr, ...extra }; }
  function startRaid(o) {
    const run = game.run, s = st();
    rs = { sim: H.makeRaid(s, { seed: (hash(run.runId) ^ Math.imul(run.day || 1, 7919) ^ Math.imul(s.days + 1, 104729) ^ (o?.power ? Math.floor(Date.now() / 1000) : 0)) >>> 0, quotaIndex: run.quotaIndex || 0, power: o?.power }), acc: 0 };   // [h2] o.power: wave strength of homeworld2
    run.hwr = raidFrame({}); game.broadcastRun(['hwr']);
    game.net.broadcast('hwmsg', { k: 'alert' });
  }
  function finishRaid() {
    const run = game.run, s = st(), res = rs.sim.result;
    const stolen = H.applyRaidResult(s, res, run.day || 0), bonus = H.raidBonus(res, run.quotaIndex || 0);
    run.credits += bonus.cr;
    if (bonus.clout) for (const p of game.aiPlayers()) game.net.broadcast('xp', { to: p.id, xp: 40, coin: bonus.clout, reason: 'Homeworld raid' });
    run.hwr = { done: 1, kind: res.kind, wr: res.wrecked.length + res.lostWalls.length, cr: stolen.cr, bonus: bonus.cr };
    commit(['credits', 'hwr']);
    game.net.broadcast('hwmsg', { k: 'raid', kind: res.kind, wrecked: res.wrecked.length, walls: res.lostWalls.length, stolen: stolen.cr, bonus: bonus.cr });
    try { game.homeworld2?.onRaidDone?.(res); } catch (e) { console.warn('[hw] h2 hook', e); }   // [h2] waves of homeworld2 pay extra loot / break machines
    rs = null;
    game.later(() => { if (game.run?.hwr?.done) { game.run.hwr = null; game.broadcastRun(['hwr']); } }, 16000);
  }
  function hostTick(dt) {
    if (pending && game.run.phase === 'moon' && !MOONS[game.run.moon]?.home && game.time >= pending.at) { pending = null; if (!rs) startRaid(); }
    if (!rs) { if (raid.active()) raid.killAll(true); return; }
    rs.sim.aid = 1;
    // [finish] crew on the homeworld during the raid: the sim becomes the data holder, real raiders + real tower fire (homeworld_raid.js)
    if (onHome() && !rs.sim.done) {
      const sec = raid.tick(rs.sim, dt);
      if (rs.sim.done) finishRaid(); else if (sec) { game.run.hwr = raidFrame({ home: 1 }); game.broadcastRun(['hwr']); }
      return;
    }
    if (raid.active()) raid.leave(rs.sim);   // the crew flew off again: live raiders fold back into the abstract sim
    rs.acc += dt;
    let stepped = false;
    while (rs.acc >= 1 && !rs.sim.done) { rs.acc -= 1; rs.sim.step(1); stepped = true; }
    if (rs.sim.done) finishRaid();
    else if (stepped) { game.run.hwr = raidFrame({ home: onHome() ? 1 : 0 }); game.broadcastRun(['hwr']); }
  }

  // ------------------------------------------------------------------------------------------ views (buildings on the map)
  function clearViews(dispose = true) {
    for (const v of views.values()) { if (dispose && v.col) { game.physics.removeCollider(v.col); const cs = game.world?.outdoor?.colliders; const k = cs?.indexOf(v.col); if (k >= 0) cs.splice(k, 1); } v.model.removeFromParent(); }
    views.clear(); if (!dispose) vg = null;
  }
  function syncViews() {
    const out = game.world?.outdoor;
    if (!onHome() || !out?.home) { if (views.size) clearViews(!!out); return; }
    if (!vg || vg.parent !== out.group) { views.clear(); vg = new THREE.Group(); vg.name = 'hw-buildings'; out.group.add(vg); }
    const s = S(), seen = new Set();
    for (const b of s.b) {
      const d = H.BUILDINGS[b.t]; if (!d) continue;
      const key = `${b.t}|${b.x}|${b.z}|${b.r}|${b.l}|${H.wrecked(b) ? 1 : 0}`;
      seen.add(b.i);
      const old = views.get(b.i);
      if (old && old.key === key) continue;
      if (old) { if (old.col) { game.physics.removeCollider(old.col); const k = out.colliders.indexOf(old.col); if (k >= 0) out.colliders.splice(k, 1); } old.model.removeFromParent(); }
      const c = H.cellCenter(b, d), model = createBuildingModel(b.t, b.l);
      model.position.set(c.x, HOME_Y, c.z); model.rotation.y = -b.r * Math.PI / 2;
      setWrecked(model, H.wrecked(b));
      vg.add(model);
      let col = null;
      if (!d.passable) {
        const wall = H.isWall(b.t), hx = wall ? 1.5 : d.size * 1.5 - 0.4, hz = wall ? 0.35 : d.size * 1.5 - 0.4, hh = wall ? 0.9 + b.l * 0.15 : 1.4;
        col = game.physics.addStaticBox(c.x, HOME_Y + hh, c.z, hx, hh, hz, -b.r * Math.PI / 2, G.STATIC, { kind: 'hw', id: b.i });
        out.colliders.push(col);
      }
      views.set(b.i, { key, model, col });
    }
    for (const id of [...views.keys()]) if (!seen.has(id)) { const v = views.get(id); if (v.col) { game.physics.removeCollider(v.col); const k = out.colliders.indexOf(v.col); if (k >= 0) out.colliders.splice(k, 1); } v.model.removeFromParent(); views.delete(id); }
  }

  // ------------------------------------------------------------------------------------------ client: panel + build mode
  const req = (op, d = {}) => game.net.request('hwact', { op, ...d });
  function openPanel(tab = 'build') {
    if (!onHome() || disposed) return;
    stopBuild();
    const ctl = createHomeworldPanel(game.ui, game, api, { tab });
    game.ui.openPanel(ctl.el); panel = ctl;
    game.ui.onPanelClose = () => { ctl.dispose(); if (panel === ctl) panel = null; return false; };
  }
  const closePanel = () => { if (panel) game.ui.closePanel(); };
  function setHint(text, bad) {
    if (!text) { hintEl?.remove(); hintEl = null; return; }
    if (!hintEl) { hintEl = document.createElement('div'); hintEl.id = 'hw-hint'; document.body.appendChild(hintEl); }
    hintEl.textContent = text; hintEl.classList.toggle('bad', !!bad);
  }
  function startPlace(type, moveId = 0, rot = 0) {
    closePanel(); stopBuild();
    bm.on = true; bm.type = type; bm.moveId = moveId; bm.rot = rot; bm.key = '';
    bm.ghost = createGhost(type, 1); game.scene.add(bm.ghost.root);
    const g = game.world?.outdoor?.home?.grid; if (g) g.visible = true;
  }
  function stopBuild() {
    if (bm.ghost) { bm.ghost.root.removeFromParent(); bm.ghost.dispose(); bm.ghost = null; }
    bm.on = false; bm.type = null; bm.moveId = 0;
    const g = game.world?.outdoor?.home?.grid; if (g) g.visible = false;
    setHint(null);
  }
  const cellAt = (wx, wz) => { const cx = Math.floor(wx / H.CELL), cz = Math.floor(wz / H.CELL); return S().b.find((b) => { const n = H.BUILDINGS[b.t].size; return cx >= b.x && cx < b.x + n && cz >= b.z && cz < b.z + n; }) || null; };
  function aim() {
    const eye = game.camera.position, fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(game.camera.quaternion);
    if (fwd.y > -0.02) return null;
    const k = (HOME_Y - eye.y) / fwd.y;
    return k > 0 && k < 70 ? { x: eye.x + fwd.x * k, z: eye.z + fwd.z * k } : null;
  }
  function buildUpdate() {
    const inp = game.input;
    if (!onHome() || game.ui?.panelOpen || game.player?.dead) { if (bm.on) stopBuild(); return; }
    if (!bm.on) { if (inp?.codePressed('KeyH') && !game.terminal?.active) openPanel(); return; }
    if (inp.codePressed('KeyH')) { openPanel(); return; }
    if (inp.mouseClicked(2)) { stopBuild(); return; }
    if (inp.codePressed('KeyR')) bm.rot = (bm.rot + 1) % 4;
    const a = aim(), s = S();
    if (!a) { bm.ghost.root.visible = false; setHint(t('Aim at the ground'), true); return; }
    const c = H.snapCell(bm.type, a.x, a.z), key = `${bm.type}|${c.x}|${c.z}|${bm.rot}|${game.run.credits}|${s.b.length}`;
    bm.x = c.x; bm.z = c.z;
    const d = H.BUILDINGS[bm.type], n = d.size;
    bm.ghost.root.visible = true; bm.ghost.root.position.set((c.x + n / 2) * H.CELL, HOME_Y, (c.z + n / 2) * H.CELL); bm.ghost.root.rotation.y = -bm.rot * Math.PI / 2;
    if (key !== bm.key) {
      bm.key = key;
      const cl = JSON.parse(JSON.stringify(s)), w = { cr: game.run.credits };
      const r = bm.moveId ? H.tryMove(cl, bm.moveId, c.x, c.z, bm.rot) : H.tryBuild(cl, w, bm.type, c.x, c.z, bm.rot);
      bm.ok = !!r.ok; bm.ghost.set(bm.ok);
      setHint(bm.ok ? `${t(d.name)} [LMB] · [R] ${t('rotate')} · [RMB] ${t('leave')}` : t(r.why || 'Blocked'), !bm.ok);
    }
    if (inp.mouseClicked(0) && bm.ok) { if (bm.moveId) { req('move', { id: bm.moveId, x: bm.x, z: bm.z, r: bm.rot }); stopBuild(); } else req('build', { t: bm.type, x: bm.x, z: bm.z, r: bm.rot }); }
    const hit = cellAt(a.x, a.z);   // U upgrade / Delete sell / M move the building under the crosshair
    if (hit && !bm.moveId) {
      if (inp.codePressed('KeyU')) req('up', { id: hit.i });
      else if (inp.codePressed('Delete')) req('sell', { id: hit.i });
      else if (inp.codePressed('KeyM')) startPlace(hit.t, hit.i, hit.r);
    }
  }

  // ------------------------------------------------------------------------------------------ HUD (raid feed) + messages
  function raidHud() {
    const r = game.run?.hwr;
    if (!r) { raidEl?.remove(); raidEl = null; return; }
    if (!raidEl) { raidEl = document.createElement('div'); raidEl.id = 'hw-raid'; document.body.appendChild(raidEl); }
    raidEl.classList.toggle('done', !!r.done);
    raidEl.innerHTML = r.done
      ? `<b>${r.kind === 'breached' ? t('HOMEWORLD BREACHED') : t('RAID REPELLED')}</b><br>${r.kind === 'breached' ? `${tf('{n} buildings wrecked', { n: r.wr })} · ▮${r.cr} ${t('stolen')}` : `+▮${r.bonus}`}`
      : `<b>⚠ ${t('HOMEWORLD UNDER ATTACK')}</b><br>${t('Wave')} ${r.w}/${r.W} · ${t('raiders')} ${r.r}%<i><s style="width:${r.r}%"></s></i>${t('Defences')} ${r.tw}% · ${t('threatened')} ${r.thr} · ${t('wrecked')} ${r.wr}${r.home ? `<br>${t('Crew on site: raiders are real, defend the base!')}` : `<br><small>${t('Fly home to defend it: lever, ROUTE HOME, lever.')}</small>`}`;
  }
  const onMsg = (m, from) => {
    if (disposed || !m || (from !== game.net?.hostId && !host())) return;
    if (m.k === 'err') { game.ui?.toast(t(m.why), 'bad'); return; }
    if (m.k === 'ok') { game.audio?.play?.(m.op === 'sell' ? 'ui_click' : 'ui_buy', { volume: 0.6, bus: 'ui' }); if (m.by === game.selfId && m.op === 'build') game.ui?.toast(`${t(H.BUILDINGS[m.t]?.name || m.t)} ✓`, 'good'); return; }
    if (m.k === 'collect') { game.ui?.toast(`${t('COLLECT')}: ▮${m.cr} · ◈${m.clout}${m.meals ? ` · +${m.meals} medkit` : ''}`, 'good'); return; }
    if (m.k === 'fx') { raid.onFx(m); return; }   // [finish] tower tracers / arcs / mines
    if (m.k === 'hp') { raid.onHp(m); return; }
    if (m.k === 'banner') { game.ui?.hud?.bigText?.(m.main, m.sub || ''); return; }
    if (m.k === 'alert') {
      game.ui?.hud?.bigText('⚠ ' + t('HOMEWORLD UNDER ATTACK'), t('Fly home to defend it: lever, ROUTE HOME, lever.'));
      game.audio?.play?.('ship_alarm', { volume: 0.7 }); return;
    }
    if (m.k === 'raid') game.ui?.toast(m.kind === 'breached' ? `${t('HOMEWORLD BREACHED')}: ${m.wrecked + m.walls} ${t('wrecked')}, ▮${m.stolen} ${t('stolen')}` : `${t('RAID REPELLED')} +▮${m.bonus}`, m.kind === 'breached' ? 'bad' : 'good');
  };
  function bindNet(net) { if (!net || boundNet === net) return; boundNet?.off?.('msg:hwmsg', onMsg); boundNet = net; net.on('msg:hwmsg', onMsg); }

  // ------------------------------------------------------------------------------------------ wiring
  offs.push(mods.on('netReady', (n, g) => { if (g === game) bindNet(n); }));
  if (game.net) bindNet(game.net);
  offs.push(mods.on('registerHandlers', (Hh, g) => { if (g === game) Hh('hwact', (d, from) => { try { hostAct(d, from); } catch (e) { console.error('hwact', e); err(from, 'Error.'); } }); }));
  offs.push(mods.on('hostStart', (g) => { if (!g || g === game) attach(); }));
  offs.push(mods.on('phase', (ph, g) => {
    if (g !== game || disposed) return;
    if (ph !== 'moon' && ph !== 'landing') { stopBuild(); closePanel(); clearViews(false); }
    try { onPhase(ph); } catch (e) { console.warn('[hw] phase', e); }
  }));
  offs.push(mods.on('mapLoaded', (w, g) => { if (g === game) { clearViews(false); sig = ''; } }));
  offs.push(mods.on('interactables', (list, g) => {
    if (g !== game || disposed || !onHome()) return;
    list.push({ pos: CONSOLE_POS.clone().add(new THREE.Vector3(0, 1.3, 0)), r: 1.4, reach: 3.6, label: t('BUILD console [E]'), sub: `${S().b.length} ${t('buildings')} · ${H.stored(S())} ${t('ready to collect')}`, action: () => openPanel() });
  }));
  offs.push(mods.on('update', (dt, g) => {
    if (g !== game || disposed) return;
    try {
      const s2 = game.run?.hw;
      syncT -= dt;
      if (syncT <= 0) { syncT = 0.4; const k = s2 ? JSON.stringify(s2.b) : ''; if (k !== sig || (views.size === 0 && s2?.b?.length && onHome())) { sig = k; syncViews(); } panel?.refresh(); }
      hudT -= dt; if (hudT <= 0) { hudT = 0.3; raidHud(); }
      if (onHome()) raid.update(dt); else raid.clearVisuals();   // [finish]
      buildUpdate();
      if (host() && game.run?.hw) hostTick(dt);
    } catch (e) { console.warn('[hw] update', e); }
  }));
  function escKey(e) { if (e.code === 'Escape' && bm.on) stopBuild(); }
  document.addEventListener('keydown', escKey);
  if (mods.api?.registerCommand) {
    mods.api.registerCommand('home', (rest, term) => {
      const s = S(), P = H.powerStats(s);
      term.print(`${t('HOMEWORLD')}: ${s.b.length} ${t('buildings')} · ⚡ ${P.demand}/${P.supply} · ❄ ${P.heat}/${P.cooling} · ${t('ready to collect')}: ${H.stored(s)}\n${t('Route there with ROUTE HOME. Buildings produce per game day. Build at the pad console (or press H).')}`);
    }, 'HOMEWORLD status (route there with ROUTE HOME)');
  }
  addTranslations({ 'Route there with ROUTE HOME. Buildings produce per game day. Build at the pad console (or press H).': 'Gitmek için ROUTE HOME. Binalar oyun günü başına üretir. Pist konsolundan (veya H) inşa et.' }, 'tr');

  const api = {
    state: S, req, startPlace, startMove: (id) => { const b = S().b.find((x) => x.i === id); if (b) startPlace(b.t, id, b.r); }, exhibits, open: openPanel, close: closePanel,
    core: H, get building() { return bm.on; }, get raid() { return rs; }, stop: () => stopBuild(), forceRaid(o) { if (host() && !rs) { startRaid(o); return true; } return false; },   // [h2] stop / forceRaid(o) for homeworld2
    dispose() {
      if (disposed) return; disposed = true;
      for (const o of offs) { try { o?.(); } catch { /* ignore */ } }
      document.removeEventListener('keydown', escKey);
      boundNet?.off?.('msg:hwmsg', onMsg);
      try { raid.dispose(); } catch { /* ignore */ }   // [finish]
      stopBuild(); clearViews(true); hintEl?.remove(); raidEl?.remove();
    },
  };
  return api;
}
