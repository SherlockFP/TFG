// HOMEWORLD 2 - GHOST RAIDS (wave 4, module 'homeworld2'; docs/wave4/homeworld2.md). "Gemileri basabilsin": raid another base.
// There is no server, so a base to raid is a GHOST: a snapshot of a base (rival bases generated from a seed, a share code another crew exported, or your own
// base for practice). The crew flies to the ghost map (moon `h2raid`, the homeworld plateau made bigger): the ship lands at the pad, the ghost base stands ~85 m
// away. Its towers are real creatures (`h2_sentry`, shootable / meleeable / killable with any weapon) that shoot at players, its guards (`h2_guard`) hunt them.
// Goal: reach the vault at the base centre, hold [E] near it for 8 s while alive (progress drops when nobody is near), take the loot, leave with the lever.
// Nobody loses anything (a raid on a copy): the defender opted in by sharing the code (PvP flag) or the ghost is a generated rival / your own base.
// Host-authoritative: spawns, damage, vault channel and rewards run on the host; everybody builds the ghost view from run.h2g and draws tracers from h2msg.
import * as THREE from 'three';
import { t, tf, addTranslations, sysMsg, localizeFields } from '../core/i18n.js';
import { MOONS } from './moons.js';
import { registerCreature } from './creatures.js';
import { chaser } from '../entities/creatures.js';
import { G } from '../physics/physics.js';
import { hudDock } from '../ui/dock.js';
import * as H from './homeworld_core.js';
import * as X from './homeworld2_core.js';
import { buildHomeworldMap, HOME_Y } from '../world/homeworld_map.js';
import { createBuildingModel, setWrecked } from '../models/homeworld.js';

export const GMOON = 'h2raid';
const OFF = X.GHOST.off;

// ---------------------------------------------------------------------------------------------- the ghost map (moon) + creatures: registered on every peer at import
if (!MOONS[GMOON]) {
  MOONS[GMOON] = localizeFields({
    id: GMOON, name: 'Ghost Base', short: 'GHOST', tier: 0, cost: 0, home: true, ghost: true, plateauHalf: X.GHOST.half, biome: 'homeworld', interior: 'factory', size: 1, hidden: true,
    desc: 'A snapshot of somebody else\'s base. Crack the vault, leave.', weather: ['clear'], creatures: {}, outdoor: {}, scrapCount: [0, 0], scrapMul: 0, power: 0, outdoorPower: 0, customMap: buildHomeworldMap,
  }, ['name', 'desc', 'short']);   // deliberately NOT in MOON_ORDER: the terminal ROUTE list never shows it, `GHOST GO` routes there
}
const sentryBehavior = (c, dt, M) => {
  const d = c.data, g = M.game;
  if (d.off) { if (c.state !== 'off') c.setState('off'); return; }
  if (!d.rate) return;
  d.cd = (d.cd || 0) - dt;
  const eye = { x: c.pos.x, y: c.pos.y + 1.0, z: c.pos.z };
  let best = null, bd = 1e9;
  for (const p of g.aiPlayers()) {
    if (p.dead || p.inShip) continue;
    const dist = Math.hypot(p.pos.x - c.pos.x, p.pos.z - c.pos.z);
    if (dist > d.range || dist >= bd) continue;
    if (!g.physics.lineOfSight(eye, p.eye)) continue;
    best = p; bd = dist;
  }
  if (!best) { if (c.state !== 'idle') c.setState('idle'); return; }
  c.yaw = Math.atan2(best.pos.x - c.pos.x, best.pos.z - c.pos.z);
  if (c.state === 'idle' || c.state === 'off') { c.setState('alert'); d.cd = Math.max(d.cd, 0.7); return; }   // 0.7 s warning before the first shot
  if (c.state === 'alert' && c.t > 0.7) c.setState('fire');
  if (c.state === 'fire' && d.cd <= 0) {
    d.cd = d.rate;
    M.sound?.(c, 'turret_fire', 0.6);
    M.attack(c, best, d.dmg, 'turret');
    g.net.broadcast('h2msg', { k: 'gtr', a: [+eye.x.toFixed(1), +eye.y.toFixed(1), +eye.z.toFixed(1)], b: [+best.pos.x.toFixed(1), +(best.pos.y + 1).toFixed(1), +best.pos.z.toFixed(1)], w: d.kind });
  }
};
registerCreature('h2_sentry', { name: 'Ghost Sentry', model: 'turret', hp: 150, dmg: 6, walk: 0, run: 0, power: 0, xp: 25, coin: 0, zone: 'out', radius: 0.55, height: 1.3, noSpawn: true, noHunt: true, noCompDrop: true, ghost: true,
  lore: 'A tower of somebody else\'s base, rebuilt from a snapshot. It only knows how to shoot.' }, sentryBehavior);
registerCreature('h2_guard', { name: 'Base Guard', model: 'giant', modelScale: 0.7, hp: 85, dmg: 11, walk: 3.4, run: 5.6, power: 0, xp: 22, coin: 0, zone: 'out', radius: 0.5, height: 1.7, noSpawn: true, noHunt: true, noCompDrop: true, ghost: true,
  lore: 'Hired to stand next to a vault. It takes the job seriously.' }, chaser({ sight: 24, fov: 200, hearR: 22, reach: 1.6, cd: 1.1, leash: 46 }));

const TR = { 'GHOST RAID': 'HAYALET BASKINI', 'Ghost Base': 'Hayalet Üs', 'Ghost Sentry': 'Hayalet Nöbetçi', 'Base Guard': 'Üs Muhafızı', 'Crack the vault [E]': 'Kasayı kır [E]', 'CRACKING THE VAULT': 'KASA KIRILIYOR', 'VAULT CRACKED': 'KASA KIRILDI',
  'Stay near the vault while it cracks.': 'Kırılırken kasanın yanında kal.', 'Loot': 'Ganimet', 'Time is up: reinforcements!': 'Süre doldu: takviye geliyor!', 'Take off with the lever when you are done.': 'İşin bitince kolla havalan.',
  'GHOST RAID: {n} ({s} sentries, {g} guards)': 'HAYALET BASKINI: {n} ({s} nöbetçi, {g} muhafız)', 'sentries': 'nöbetçi', 'guards': 'muhafız', 'time': 'süre',
  'GHOST GO: choose a target first (GHOST lists them).': 'GHOST GO: önce bir hedef seç (GHOST listeler).', 'Pick a ghost target (GHOST <n>), be in orbit, then GHOST GO.': 'Bir hedef seç (GHOST <n>), yörüngede ol, sonra GHOST GO.',
  'That base is on cooldown.': 'O üs bekleme süresinde.', 'Go to orbit first (take off).': 'Önce yörüngeye çık (havalan).', 'Routed to the ghost base. Pull the lever to land.': 'Hayalet üsse rotalandı. Inmek için kolu çek.',
  'Target selected.': 'Hedef seçildi.', 'Unknown target.': 'Bilinmeyen hedef.', 'You need to be within reach of the vault.': 'Kasanın yanında olmalısın.', 'The vault is already open.': 'Kasa zaten açık.',
  'Base code imported.': 'Üs kodu içe aktarıldı.', 'That is not a valid base code.': 'Geçerli bir üs kodu değil.', 'Turn on the PvP flag first (RAID tab).': 'Önce PvP bayrağını aç (BASKIN sekmesi).', 'Your base code is ready (copy it from the RAID tab).': 'Üs kodun hazır (BASKIN sekmesinden kopyala).',
  'PvP flag: raids on your base allowed.': 'PvP bayrağı: üssüne baskına izin var.', 'PvP flag off.': 'PvP bayrağı kapalı.', 'GHOST RAID targets': 'HAYALET BASKINI hedefleri', 'SELECTED': 'SEÇİLİ', 'practice': 'antrenman', GHOST: 'HAYALET', "A snapshot of somebody else's base. Crack the vault, leave.": 'Başkasının üssünün anlık görüntüsü. Kasayı kır, çık.',
  "A tower of somebody else's base, rebuilt from a snapshot. It only knows how to shoot.": 'Başkasının üssünden bir kule, anlık görüntüden yeniden kuruldu. Sadece ateş etmeyi bilir.', 'Hired to stand next to a vault. It takes the job seriously.': 'Bir kasanın yanında durmak için tutuldu. İşini ciddiye alıyor.' };
const RU = { 'GHOST RAID': 'НАБЕГ НА ПРИЗРАКА', 'Ghost Base': 'База-призрак', 'Ghost Sentry': 'Страж-призрак', 'Base Guard': 'Страж базы', 'Crack the vault [E]': 'Взломать хранилище [E]', 'CRACKING THE VAULT': 'ВЗЛОМ ХРАНИЛИЩА', 'VAULT CRACKED': 'ХРАНИЛИЩЕ ВЗЛОМАНО',
  'Stay near the vault while it cracks.': 'Оставайтесь у хранилища, пока идёт взлом.', 'Loot': 'Добыча', 'Time is up: reinforcements!': 'Время вышло: подкрепление!', 'Take off with the lever when you are done.': 'Закончив, взлетайте рычагом.',
  'GHOST RAID: {n} ({s} sentries, {g} guards)': 'НАБЕГ НА ПРИЗРАКА: {n} ({s} стражей, {g} охранников)', 'sentries': 'стражей', 'guards': 'охранников', 'time': 'время',
  'GHOST GO: choose a target first (GHOST lists them).': 'GHOST GO: сначала выберите цель (GHOST покажет список).', 'Pick a ghost target (GHOST <n>), be in orbit, then GHOST GO.': 'Выберите цель (GHOST <n>), будьте на орбите, затем GHOST GO.',
  'That base is on cooldown.': 'Эта база на перезарядке.', 'Go to orbit first (take off).': 'Сначала на орбиту (взлёт).', 'Routed to the ghost base. Pull the lever to land.': 'Курс на базу-призрак. Потяните рычаг для посадки.',
  'Target selected.': 'Цель выбрана.', 'Unknown target.': 'Неизвестная цель.', 'You need to be within reach of the vault.': 'Нужно быть рядом с хранилищем.', 'The vault is already open.': 'Хранилище уже открыто.',
  'Base code imported.': 'Код базы импортирован.', 'That is not a valid base code.': 'Это недействительный код базы.', 'Turn on the PvP flag first (RAID tab).': 'Сначала включите флаг PvP (вкладка НАБЕГ).', 'Your base code is ready (copy it from the RAID tab).': 'Код вашей базы готов (скопируйте на вкладке НАБЕГ).',
  'PvP flag: raids on your base allowed.': 'Флаг PvP: набеги на вашу базу разрешены.', 'PvP flag off.': 'Флаг PvP выключен.', 'GHOST RAID targets': 'Цели набега на призрака', 'SELECTED': 'ВЫБРАНО', 'practice': 'тренировка', GHOST: 'ПРИЗРАК', "A snapshot of somebody else's base. Crack the vault, leave.": 'Снимок чужой базы. Взломайте хранилище и уходите.',
  "A tower of somebody else's base, rebuilt from a snapshot. It only knows how to shoot.": 'Башня чужой базы, восстановленная по снимку. Умеет только стрелять.', 'Hired to stand next to a vault. It takes the job seriously.': 'Нанят стоять у хранилища. Относится к работе серьёзно.' };
addTranslations(TR, 'tr'); addTranslations(RU, 'ru');

const R1 = (n) => Math.round(n * 10) / 10;
const BEAM = { gun: 0xffe890, sniper: 0xd8f4ff, tesla: 0x9ae8ff, flame: 0xff9a30, cryo: 0xb8e8ff };
const CSS = `#h2g-box{font:20px var(--font,'VT323',monospace);color:#d8f4ff;background:rgba(6,14,22,.88);border:1px solid #3fa8d8;padding:5px 10px;min-width:230px}
#h2g-box b{color:#7fe8ff;letter-spacing:2px}#h2g-box i{display:block;height:7px;background:rgba(255,255,255,.12);margin:3px 0}#h2g-box i s{display:block;height:100%;background:#ffd23f}`;

export function installGhostRaid(game, ctx) {
  const mods = game.mods, offs = [];
  let disposed = false, vg = null, box = null, hudT = 0, vault = null;
  const cols = [], views = [];
  const gs = { spawned: false, t: 0, crack: 0, by: 0, done: false, extra: 0, extraT: 0, sig: '' };
  const host = () => !!game.isHost;
  const run = () => game.run;
  const onGhost = () => !!(MOONS[run()?.moon]?.ghost && run()?.phase === 'moon' && game.world?.outdoor?.home);
  const snap = () => run()?.h2g || null;
  if (!document.getElementById('tfg-h2g-css')) { const s = document.createElement('style'); s.id = 'tfg-h2g-css'; s.textContent = CSS; document.head.appendChild(s); }

  // ------------------------------------------------------------------------------------------ targets (rivals are deterministic, imported / mine come from the state)
  function headers() {
    const s = ctx.layout(), seed = s.seed || 1, out = [];
    const mine = ctx.host() ? X.ghostFromState(ctx.hw(), s, t('My base')) : (ctx.meta().mine || null);
    if (mine) out.push({ ...mine, id: 'mine', b: undefined, n: mine.b?.length ?? mine.n ?? 0 });
    for (let tier = 1; tier <= 5; tier++) { const g = X.genRival(seed, tier); if (g) out.push({ ...g, b: undefined, n: g.b.length }); }
    for (const g of (ctx.host() ? s.g.imported : ctx.meta().imp || [])) out.push({ ...g, b: undefined, n: g.b?.length ?? g.n ?? 0 });
    return out;
  }
  function findGhost(id) {   // host only: the full snapshot
    const s = ctx.st();
    if (id === 'mine') return X.ghostFromState(ctx.hw(), s, 'My base');
    const im = s.g.imported.find((g) => g.id === id); if (im) return im;
    const m = /^rival(\d)_/.exec(String(id));
    if (m) { const g = X.genRival(s.seed, +m[1]); if (g && g.id === id) return g; }
    return null;
  }

  // ------------------------------------------------------------------------------------------ host: requests
  function hostAct(d, from) {
    const s = ctx.st(), r = run();
    const err = (why) => game.net.sendTo(from, 'h2msg', { k: 'err', why });
    const ok = (msg) => game.net.sendTo(from, 'h2msg', { k: 'ok', msg });
    switch (d.op) {
      case 'pvp': s.pvp = d.on ? 1 : 0; ctx.commit(); ok(s.pvp ? 'PvP flag: raids on your base allowed.' : 'PvP flag off.'); return;
      case 'gexport': {
        if (!s.pvp) { err('Turn on the PvP flag first (RAID tab).'); return; }
        s.g.mine = X.ghostFromState(ctx.hw(), s, `${game.profile?.name || 'Crew'}'s base`);
        const code = X.encodeGhost(s.g.mine);
        game.net.sendTo(from, 'h2msg', { k: 'code', code }); ctx.commit(); ok('Your base code is ready (copy it from the RAID tab).'); return;
      }
      case 'gimport': {
        const g = X.decodeGhost(String(d.code || '').slice(0, 6000));
        if (!g) { err('That is not a valid base code.'); return; }
        s.g.imported = [g, ...s.g.imported.filter((x) => x.id !== g.id)].slice(0, 8);
        ctx.commit(); ok('Base code imported.'); return;
      }
      case 'gtarget': {
        const g = findGhost(String(d.id));
        if (!g) { err('Unknown target.'); return; }
        if (!X.ghostReady(s, g.id, Date.now())) { err('That base is on cooldown.'); return; }
        s.g.target = g.id; ctx.commit(); ok('Target selected.'); return;
      }
      case 'ghostgo': {
        const g = s.g.target ? findGhost(s.g.target) : null;
        if (!g) { err('GHOST GO: choose a target first (GHOST lists them).'); return; }
        if (!X.ghostReady(s, g.id, Date.now())) { err('That base is on cooldown.'); return; }
        if (r.phase !== 'orbit') { err('Go to orbit first (take off).'); return; }
        r.h2g = { ...g, prev: MOONS[r.moon]?.ghost ? (r.h2g?.prev || 'home') : r.moon, mine: g.id === 'mine' ? 1 : 0 };
        r.moon = GMOON; game.broadcastRun(['moon', 'h2g']);
        try { game.env.setSpace(game.planetColorFor(GMOON)); } catch { /* cosmetic */ }
        game.net.broadcast('sys', sysMsg('Routed to the ghost base. Pull the lever to land.', {}, 'info'));
        return;
      }
      case 'gcrack': {
        if (!onGhost() || gs.done) { err('The vault is already open.'); return; }
        const p = game.aiPlayers().find((q) => q.id === from);
        if (!p || p.dead || Math.hypot(p.pos.x, p.pos.z - OFF.z) > 6.5) { err('You need to be within reach of the vault.'); return; }
        gs.by = from; if (gs.crack <= 0) gs.crack = 0.001;
        return;
      }
      default: break;
    }
  }

  // ------------------------------------------------------------------------------------------ host: spawn + tick
  function spawnAll() {
    const g = snap(); if (!g || !g.b) return;
    const def = X.ghostDefense(g), M = game.creatures;
    gs.spawned = true; gs.t = 0; gs.crack = 0; gs.done = false; gs.extra = 0; gs.extraT = 0; gs.alive = 0;
    for (const s of def.sentries) {
      const c = M.hostSpawn('h2_sentry', new THREE.Vector3(s.x, HOME_Y, s.z + OFF.z), { level: 1, zone: 'out', state: 'idle', affix: null, variant: null });
      if (!c) continue;
      const cad = { gun: 0.5, sniper: 3.0, tesla: 0.7, flame: 0.4, cryo: 0.9 }[s.t] || 0.6;
      c.hp = c.maxHp = s.hp;
      c.data.range = s.range; c.data.kind = s.t;
      c.data.rate = cad; c.data.dmg = s.t === 'sniper' ? Math.max(8, s.shot) : Math.max(1, Math.round(s.dps * cad));
      c.data.ghost = 1;
    }
    for (let i = 0; i < def.guards; i++) spawnGuard(def, i);
    game.net.broadcast('h2msg', { k: 'banner', main: t('GHOST RAID'), sub: tf('GHOST RAID: {n} ({s} sentries, {g} guards)', { n: g.name, s: def.sentries.length, g: def.guards }) });
  }
  function spawnGuard(def, i) {
    const a = (i / Math.max(1, def.guards)) * Math.PI * 2 + 0.4, rr = 5 + (i % 3) * 2.5;
    const c = game.creatures.hostSpawn('h2_guard', new THREE.Vector3(Math.cos(a) * rr, HOME_Y, Math.sin(a) * rr + OFF.z), { level: 1 + Math.floor((snap()?.tier || 1) / 3), zone: 'out', state: 'idle', affix: null, variant: null });
    if (c) c.data.ghost = 1;
  }
  function killAll() { for (const c of [...game.creatures.host.values()]) if (c.data?.ghost && !c.dead) game.creatures.kill(c, null, { silent: true }); }
  function success() {
    const g = snap(), s = ctx.st(); if (!g) return;
    gs.done = true;
    const loot = X.ghostLoot(g, { quotaIndex: run().quotaIndex || 0, mine: !!g.mine });
    run().credits += loot.cr;
    const at = new THREE.Vector3(0, HOME_Y + 0.6, OFF.z + 3);
    try { game.crafting?.dropComponents?.(at, 'metal', Math.max(1, Math.round(loot.parts / 2))); game.crafting?.dropComponents?.(at, 'electronic', Math.max(1, loot.parts - Math.round(loot.parts / 2))); } catch { /* optional */ }
    for (const p of game.aiPlayers()) game.net.broadcast('xp', { to: p.id, xp: loot.xp, coin: loot.clout, reason: 'Ghost raid' });
    X.markRaided(s, g.id, Date.now()); s.st.ghostWins++;
    for (const c of game.creatures.host.values()) if (c.data?.ghost && !c.dead) { if (c.type === 'h2_sentry') c.data.off = true; else game.creatures.kill(c, null, { silent: true }); }
    ctx.commit(['credits']);
    game.net.broadcast('h2msg', { k: 'gwin', cr: loot.cr, parts: loot.parts, clout: loot.clout, name: g.name });
  }
  function hostTick(dt) {
    if (!onGhost()) { if (gs.spawned) { gs.spawned = false; killAll(); } return; }
    if (!snap()) return;
    if (!gs.spawned && game.time > 0) spawnAll();
    gs.t += dt;
    if (gs.done) return;
    // reinforcements after the time limit
    if (gs.t > X.GHOST.timeLimit && gs.extra < 6) { gs.extraT -= dt; if (gs.extraT <= 0) { gs.extraT = 25; gs.extra++; spawnGuard({ guards: 6 }, gs.extra * 2); if (gs.extra === 1) game.net.broadcast('h2msg', { k: 'banner', main: t('Time is up: reinforcements!'), sub: '' }); } }
    // vault channel: progress while somebody alive is within 5.5 m of the vault, decays otherwise
    if (gs.crack > 0) {
      const near = game.aiPlayers().some((p) => !p.dead && !p.inShip && Math.hypot(p.pos.x, p.pos.z - OFF.z) <= 5.5);
      gs.crack += near ? dt : -dt * 1.5;
      if (gs.crack >= X.GHOST.crackSec) { gs.crack = X.GHOST.crackSec; success(); }
      if (gs.crack <= 0) gs.crack = 0;
      const k = Math.round(gs.crack / X.GHOST.crackSec * 20);
      if (k !== gs.sig) { gs.sig = k; game.net.broadcast('h2msg', { k: 'gcr', p: k * 5 }); }
    }
  }

  // ------------------------------------------------------------------------------------------ client: ghost base view
  function clearView() {
    for (const c of cols) { try { game.physics.removeCollider(c); } catch { /* gone */ } }
    cols.length = 0; views.length = 0; vg?.removeFromParent(); vg = null; vault = null;
  }
  function buildView() {
    const out = game.world?.outdoor, g = snap();
    if (!out || !g?.b) return;
    clearView();
    vg = new THREE.Group(); vg.name = 'h2-ghost'; out.group.add(vg);
    for (const [ty, x, z, r, l] of g.b) {
      const d = H.BUILDINGS[ty]; if (!d || d.tw) continue;   // towers are the sentries (real creatures)
      const c = H.cellCenter({ x, z }, d), model = createBuildingModel(ty, l);
      model.position.set(c.x, HOME_Y, c.z + OFF.z); model.rotation.y = -r * Math.PI / 2; vg.add(model); views.push(model);
      if (!d.passable) {
        const wall = H.isWall(ty), hx = wall ? 1.5 : d.size * 1.5 - 0.4, hz = wall ? 0.35 : d.size * 1.5 - 0.4, hh = wall ? 0.9 + l * 0.15 : 1.4;
        const col = game.physics.addStaticBox(c.x, HOME_Y + hh, c.z + OFF.z, hx, hh, hz, -r * Math.PI / 2, G.STATIC, { kind: 'h2g' });
        cols.push(col); out.colliders.push(col);
      }
    }
    // the vault: a steel drum with a glowing door on the base centre (where the pad of the original base was)
    const lit = new THREE.MeshLambertMaterial({ color: 0x59606a }), glow = new THREE.MeshBasicMaterial({ color: 0x40e0ff });
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.9, 2.4, 10), lit); drum.position.set(0, HOME_Y + 1.2, OFF.z); vg.add(drum);
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.4, 0.1), glow); door.position.set(0, HOME_Y + 1.3, OFF.z + 1.75); vg.add(door);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.08, 4, 24), glow); ring.rotation.x = Math.PI / 2; ring.position.set(0, HOME_Y + 0.15, OFF.z); vg.add(ring);
    vault = { drum, door, ring, lit, glow };
    const col = game.physics.addStaticBox(0, HOME_Y + 1.2, OFF.z, 1.7, 1.2, 1.7, 0, G.STATIC, { kind: 'h2g' }); cols.push(col); out.colliders.push(col);
  }

  // tracers (pooled)
  const beamGeo = new THREE.BoxGeometry(1, 1, 1), free = [], live = [];
  const beamMats = Object.fromEntries(Object.entries(BEAM).map(([k, c]) => [k, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })]));
  const a3 = new THREE.Vector3(), b3 = new THREE.Vector3();
  function tracer(a, b, kind) {
    let m = free.pop();
    if (!m) { m = new THREE.Mesh(beamGeo, beamMats.gun); m.frustumCulled = false; game.scene.add(m); }
    m.material = beamMats[kind] || beamMats.gun;
    a3.set(a[0], a[1], a[2]); b3.set(b[0], b[1], b[2]);
    const len = a3.distanceTo(b3) || 0.01;
    m.position.copy(a3).lerp(b3, 0.5); m.lookAt(b3); m.scale.set(kind === 'sniper' ? 0.1 : 0.05, kind === 'sniper' ? 0.1 : 0.05, len); m.visible = true;
    live.push({ m, life: kind === 'sniper' ? 0.2 : 0.07 });
  }

  // ------------------------------------------------------------------------------------------ client: HUD + interactables + messages
  let crackP = 0;
  function hud(dt) {
    hudT -= dt; if (hudT > 0) return; hudT = 0.25;
    if (!onGhost()) { box?.remove(); box = null; return; }
    if (!box) { box = hudDock('right', 'h2g', 30); }
    const g = snap(); if (!g) return;
    let sen = 0, gua = 0;
    for (const v of game.creatures.views?.values?.() || []) { if (v.type === 'h2_sentry' && !v.dead) sen++; else if (v.type === 'h2_guard' && !v.dead) gua++; }
    box.innerHTML = `<div id="h2g-box"><b>${escapeHtmlLite(t('GHOST RAID'))}</b> ${escapeHtmlLite(g.name || '')}<br>${sen} ${t('sentries')} · ${gua} ${t('guards')}${crackP > 0 ? `<br>${t('CRACKING THE VAULT')} ${crackP}%<i><s style="width:${crackP}%"></s></i>` : `<br><small>${t('Stay near the vault while it cracks.')}</small>`}</div>`;
  }
  const escapeHtmlLite = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function onMsg(m) {
    if (m.k === 'gtr') tracer(m.a, m.b, m.w);
    else if (m.k === 'gcr') crackP = m.p | 0;
    else if (m.k === 'gwin') {
      crackP = 0; if (vault) vault.glow.color.setHex(0x60ff70);
      game.ui?.hud?.bigText?.(t('VAULT CRACKED'), `${t('Loot')}: ▮${m.cr} ⚙${m.parts} ◈${m.clout}`);
      game.ui?.toast?.(`${t('VAULT CRACKED')}: ▮${m.cr} ⚙${m.parts} ◈${m.clout}. ${t('Take off with the lever when you are done.')}`, 'good');
      try { game.audio?.play?.('ui_buy', { volume: 0.8, bus: 'ui' }); } catch { /* audio optional */ }
    } else if (m.k === 'banner') game.ui?.hud?.bigText?.(m.main, m.sub || '');
  }
  offs.push(mods.on('interactables', (list, g) => {
    if (g !== game || disposed || !onGhost() || gs.done && host()) return;
    list.push({ pos: new THREE.Vector3(0, HOME_Y + 1.4, OFF.z + 2.6), r: 2.4, reach: 4.6, label: t('Crack the vault [E]'), sub: snap()?.name || '', action: () => game.net.request('h2act', { op: 'gcrack' }) });
  }));
  offs.push(mods.on('mapLoaded', (w, g) => { if (g !== game) return; clearView(); crackP = 0; gs.spawned = false; if (onGhost()) buildView(); }));
  offs.push(mods.on('phase', (ph, g) => {
    if (g !== game || disposed) return;
    if (ph === 'orbit' && host() && MOONS[run().moon]?.ghost) {   // back in orbit: forget the ghost route, next lever lands on the previous moon again
      const prev = run().h2g?.prev || 'home';
      run().moon = MOONS[prev] ? prev : 'home'; run().h2g = null; game.broadcastRun(['moon', 'h2g']);
      try { game.env.setSpace(game.planetColorFor(run().moon)); } catch { /* cosmetic */ }
      gs.spawned = false;
    }
    if (ph !== 'moon') { clearView(); box?.remove(); box = null; }
  }));
  // terminal
  if (mods.api?.registerCommand) {
    mods.api.registerCommand('ghost', (rest, term) => {
      const arg = String(rest || '').trim().toLowerCase(), list = headers();
      if (arg === 'go') { game.net.request('h2act', { op: 'ghostgo' }); term.print(t('Pick a ghost target (GHOST <n>), be in orbit, then GHOST GO.')); return; }
      const n = parseInt(arg, 10);
      if (n >= 1 && n <= list.length) { game.net.request('h2act', { op: 'gtarget', id: list[n - 1].id }); term.print(`${t('Target selected.')} ${list[n - 1].name}`); return; }
      const sel = ctx.meta().gt, now = Date.now(), s = ctx.layout();
      term.print(`${t('GHOST RAID targets')}\n` + list.map((g, i) => { const cd = Math.max(0, Math.round(((s.g?.raided?.[g.id] || 0) - now) / 60000)); return `${i + 1}. ${g.name} T${g.tier} (${g.n} ${t('buildings')})${g.id === 'mine' ? ' [' + t('practice') + ']' : ''}${cd ? ' [' + cd + ' min]' : ''}${g.id === sel ? '  <- ' + t('SELECTED') : ''}`; }).join('\n') + `\n${t('Pick a ghost target (GHOST <n>), be in orbit, then GHOST GO.')}`);
    }, 'Raid a ghost base (GHOST, GHOST <n>, GHOST GO)');
  }

  return {
    headers, findGhost, hostAct, hostTick, onMsg, onGhost, snapState: () => ({ ...gs }),
    update(dt) {
      hud(dt);
      for (let i = live.length - 1; i >= 0; i--) { const b = live[i]; b.life -= dt; if (b.life <= 0) { b.m.visible = false; free.push(b.m); live.splice(i, 1); } }
      if (vault) { vault.ring.rotation.z += dt * 0.6; }
    },
    dispose() {
      if (disposed) return; disposed = true;
      for (const o of offs) { try { o?.(); } catch { /* ignore */ } }
      clearView(); box?.remove(); for (const b of [...free, ...live.map((x) => x.m)]) b.removeFromParent(); beamGeo.dispose(); for (const m of Object.values(beamMats)) m.dispose();
      void setWrecked;
    },
  };
}
