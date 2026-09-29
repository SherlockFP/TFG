// PETS NET + WORLD GLUE ([finish], wave 3). Installed by pets.js (installPetsNet). Everything a pet does in the world:
//  * OWNER (every peer): sends its active pet + mode to the host (request `pt`), keys O = cycle mode (Shift+O = deliver to me / ship),
//    L = command (attack the creature you aim at, parrot = decoy at the aimed point), Pet Carrier use handler, treat handler, HUD marks
//    (cat / dog / owl / fox), night vision (owl), owner-side effects of host events (`ptev`).
//  * HOST: one sim record per owner (pets_sim.js) stepped every frame with a game adapter (nav, creatures, items, damage, noise), the bear
//    tank / bot shield wrap of hostHurtPlayer, the crow luck wrap of inventory.hostLootLuck, crow dig, fetch carry (holder `c:pt<owner>`).
//  * EVERYONE: sees every pet. Net types: `ptinfo` (appearance, host -> all + late join), `ptst` (rows, host -> clients, delta compressed),
//    `ptev` (host -> owner), request `pt` (owner -> host: sync | mode | atk | cap | gone).
import * as THREE from 'three';
import * as C from './pets_core.js';
import * as SIM from './pets_sim.js';
import { createPetModel } from '../models/pets.js';
import { FACILITY_Y } from '../world/facility.js';
import { SHIP, insideShip } from '../world/ship.js';
import { isSellable, ITEMS, scrapTableFor } from './items.js';
import { tierIndex } from './tiers.js';
import { distToHull } from './siege_core.js';
import { addTranslations, t, tf } from '../core/i18n.js';
import { G } from '../physics/physics.js';

addTranslations({
  'Pet mode: {m}': 'Evcil mod: {m}', 'Deliver to: {d}': 'Teslimat: {d}', me: 'bana', ship: 'gemiye', follow: 'takip', stay: 'bekle', fetch: 'getir', guard: 'koru',
  '{n} ignores you.': '{n} seni dinlemiyor.', '{n} brought {c} item(s).': '{n} {c} eşya getirdi.', '{n} was knocked out and rests for a day.': '{n} bayıldı, bir gün dinlenecek.',
  '{n} got back up!': '{n} ayağa kalktı!', 'Command: attack': 'Komut: saldır', 'Command: decoy': 'Komut: yem', 'Nothing to command.': 'Emredecek bir şey yok.',
  'No pet with you.': 'Yanında evcil yok.', 'It is too healthy. Weaken it below 25% HP first.': 'Çok sağlam. Önce canını %25 altına indir.', 'This creature cannot be caught.': 'Bu yaratık yakalanamaz.',
  'Aim at a small creature.': 'Küçük bir yaratığa nişan al.', 'Caught {n}!': '{n} yakalandı!', 'It broke free!': 'Kurtuldu!', 'Catch chance {p}%': 'Yakalama şansı %{p}',
  '{n} stole from the nest!': '{n} yuvadan çaldı!', 'Incubator': 'Kuluçka', 'Nothing is incubating.': 'Kuluçkada bir şey yok.', 'Place egg [E]': 'Yumurtayı koy [E]', 'Hold an egg to use the incubator.': 'Kuluçkayı kullanmak için yumurta tut.',
  'Egg': 'Yumurta', 'Take pet [E]': 'Evcili al [E]', 'A pet is hatching!': 'Bir evcil çatlıyor!', 'Ready': 'Hazır',
}, 'tr');
addTranslations({
  'Pet mode: {m}': 'Режим питомца: {m}', 'Deliver to: {d}': 'Доставка: {d}', me: 'мне', ship: 'на корабль', follow: 'за мной', stay: 'ждать', fetch: 'принести', guard: 'охрана',
  '{n} ignores you.': '{n} вас игнорирует.', '{n} brought {c} item(s).': '{n} принёс предметов: {c}.', '{n} was knocked out and rests for a day.': '{n} без сознания и отдыхает день.',
  '{n} got back up!': '{n} снова на ногах!', 'Command: attack': 'Команда: атака', 'Command: decoy': 'Команда: приманка', 'Nothing to command.': 'Некому приказывать.',
  'No pet with you.': 'Питомца нет рядом.', 'It is too healthy. Weaken it below 25% HP first.': 'Слишком здоров. Сначала снизьте HP ниже 25%.', 'This creature cannot be caught.': 'Это существо нельзя поймать.',
  'Aim at a small creature.': 'Прицельтесь в маленькое существо.', 'Caught {n}!': 'Поймали: {n}!', 'It broke free!': 'Вырвался!', 'Catch chance {p}%': 'Шанс поимки {p}%',
  '{n} stole from the nest!': '{n} украл из гнезда!', 'Incubator': 'Инкубатор', 'Nothing is incubating.': 'Ничего не насиживается.', 'Place egg [E]': 'Положить яйцо [E]', 'Hold an egg to use the incubator.': 'Возьмите яйцо, чтобы использовать инкубатор.',
  Egg: 'Яйцо', 'Take pet [E]': 'Забрать питомца [E]', 'A pet is hatching!': 'Питомец вылупляется!', Ready: 'Готово',
}, 'ru');

const RAD = 6;
const ACTIVE_STATES = new Set(['run', 'attack', 'hunt', 'lunge', 'windup', 'roar', 'aim', 'fire', 'snip', 'sneak', 'fly', 'charge']);
const MARK_COL = { c: '#ff5a4a', h: '#ffb02a', l: '#ffe46a', k: '#7ad0ff' };
const hyp = Math.hypot;

export function installPetsNet(game, api, S, { save, say }) {
  const mods = game.mods;
  const offs = [];
  const info = new Map();        // owner -> appearance { sp, st, sh, sk, nm, id, lv }
  const views = new Map();       // owner -> { model, pos, tgt, yaw, anim, speed, sig, carry }
  const recs = new Map();        // HOST: owner -> sim record
  const NS = { disposed: false, syncSig: '', syncT: 0, rowT: 0, markT: 0, marks: [], boundNet: null, capT: 0, nv: false, itemsT: -1, items: [], crT: -1, cr: [], lastPhase: '' };
  const restores = [];
  const host = () => !!game.isHost;
  const net = () => game.net;
  const isMe = (id) => id === game.selfId;

  // ------------------------------------------------------------------------------------------------ owner: mode / dest / sync
  const petState = () => C.ensurePets(game.profile);
  const modeOf = () => { const m = petState().mode; return C.MODES.includes(m) ? m : 'follow'; };
  const blocked = () => !!(game.mirror?.active || game.boardgame?.active || game.petsBlocked);
  function sendSync(force = false) {
    if (!net() || NS.disposed) return;
    const s = petState(), pet = C.activePet(s);
    const ok = pet && !C.isResting(s, pet);
    const sig = ok ? `${C.netPet(pet) ? JSON.stringify(C.netPet(pet)) : ''}|${modeOf()}|${s.dest}|${blocked() ? 1 : 0}` : 'gone';
    if (!force && sig === NS.syncSig) return;
    NS.syncSig = sig;
    if (!ok) net().request('pt', { op: 'gone' });
    else net().request('pt', { op: 'sync', pet: C.netPet(pet), mode: modeOf(), dest: s.dest === 'ship' ? 'ship' : 'me', bl: blocked() ? 1 : 0 });
  }
  api.setMode = (m) => { if (!C.MODES.includes(m)) return false; petState().mode = m; save(); sendSync(true); return true; };
  api.setDest = (d) => { petState().dest = d === 'ship' ? 'ship' : 'me'; save(); sendSync(true); return true; };
  api.mode = modeOf;
  const cycleMode = (dir = 1) => {
    const list = C.MODES, i = list.indexOf(modeOf());
    const m = list[(i + dir + list.length) % list.length];
    api.setMode(m);
    say(tf('Pet mode: {m}', { m: t(m) }), 'info');
  };
  const toggleDest = () => { const d = petState().dest === 'ship' ? 'me' : 'ship'; api.setDest(d); say(tf('Deliver to: {d}', { d: t(d) }), 'info'); };

  // ------------------------------------------------------------------------------------------------ HOST: adapter (world <-> sim)
  const E = {
    owner: null, day: 0, rand: Math.random, creatures: [], cur: null, shipPoint: null, guardPoint: null, shipReachable: true,
    emit(k, d) { if (E.cur) ptev(E.cur.owner, k, d); },
    claimed(id, rec) { for (const r of recs.values()) if (r !== rec && r.tgt === id) return true; return false; },
    isBig(id) { const it = game.items.get(id); return !!it && (it.def.kind === 'big' || it.def.hands === 2); },
    findItems() { return itemList().filter((q) => q.zone === E.cur.zone); },
    looseLoot() { return itemList().filter((q) => q.zone === E.cur.zone && q.val > 0); },
    chests() { try { return (game.chests?.list?.() || []).filter((c) => (c.y < FACILITY_Y + 40) === (E.cur.zone === 'in')); } catch { return []; } },
    floorY(x, z, zone, inShip, o) {
      if (inShip) return o.inShip ? o.pos.y : (game.ship?.spawns?.[0]?.y ?? 0.2);
      if (zone === 'in') return o.zone === 'in' ? o.pos.y : (game.world?.facility?.layout?.y ?? FACILITY_Y);
      const th = game.world?.terrain;
      if (th?.heightAt && o.zone === 'out') return th.heightAt(x, z);
      return o.pos.y;
    },
    moveTo: moveRec,
    take(rec, id) {
      const it = game.items.get(id);
      if (!it || it.state !== 'world' || it.holder || it.carrier || it.owner) return false;
      it.carrier = 'pt' + rec.owner;
      net().broadcast('it', { e: 'held', id, h: 'c:pt' + rec.owner, sl: 0 });
      return true;
    },
    dropCarry(rec, ids, where) {
      const o = ownerOf(rec.owner);
      let at = { x: rec.x, y: rec.y, z: rec.z };
      if (where === 'owner' && o) at = { x: o.pos.x, y: o.pos.y, z: o.pos.z };
      else if (where === 'ship') {
        const sp = game.ship?.spawns?.[0];
        if (sp && game.ship?.door?.open) at = { x: sp.x, y: sp.y, z: sp.z };
        else at = { x: SHIP.door.x, y: rec.y, z: SHIP.z1 + 1.4 };
      }
      ids.forEach((id, i) => {
        const it = game.items.get(id);
        if (!it) return;
        it.carrier = null;
        const a = i * 2.4 + Math.random();
        net().broadcast('it', { e: 'drop', id, p: [at.x + Math.cos(a) * 0.5, at.y + 0.75 + i * 0.2, at.z + Math.sin(a) * 0.5], q: [0, 0, 0, 1] });
      });
    },
    hit(rec, id, dmg, o) {
      const M = game.creatures, c = M.host.get(id);
      if (!c || c.dead) return { killed: true };
      const strike = (cr, mul) => { if (cr && !cr.dead) M.damage(cr.id, dmg * mul, null, o.stun && cr === c ? { stun: o.stun } : {}); };
      strike(c, 1);
      if (o.aoe && !c.dead) for (const q of M.host.values()) if (q !== c && !q.dead && !q.def.hazard && q.zone === c.zone && q.pos.distanceTo(c.pos) < o.aoe) strike(q, 0.6);
      if (o.dot && !c.dead) for (let i = 1; i <= 3; i++) game.later(() => { const q = M.host.get(id); if (q && !q.dead) M.damage(id, Math.max(1, dmg * 0.35), null); }, i * 1000);
      net().broadcast('fx', { k: 'snd', s: 'hit_flesh', p: [c.pos.x, c.pos.y + 0.6, c.pos.z], v: 0.5 });
      return { killed: !!c.dead };
    },
    decoy(rec, dc, lure, scare) {
      const M = game.creatures, p = new THREE.Vector3(dc.x, dc.y, dc.z);
      M.noise(p, 3.2, null);
      if (dc.t === 0 || dc.phase === 'call') net().broadcast('fx', { k: 'snd', s: game.audio?.has?.('yoinker_yippee') ? 'yoinker_yippee' : 'ui_confirm', p: [p.x, p.y + 0.6, p.z], v: 0.8 });
      if (scare) for (const c of M.host.values()) if (!c.dead && !c.def.hazard && !c.def.boss && c.pos.distanceTo(p) < 9) { c.stunT = Math.max(c.stunT || 0, 2); c.setState?.('stunned'); }
    },
    dig(rec, tier) {
      const at = new THREE.Vector3(rec.x, rec.y + 0.5, rec.z);
      const theme = game.world?.facility?.layout?.theme;
      const table = scrapTableFor(theme || 'factory').filter(([id]) => ITEMS[id] && id !== 'key');
      if (!table.length) return;
      let r = Math.random() * table.reduce((a, [, w]) => a + w, 0), id = table[0][0];
      for (const [k, w] of table) { r -= w; if (r <= 0) { id = k; break; } }
      game.items.hostSpawn(id, at, { minTier: tier === 'rare' ? 'rare' : 'uncommon' });
      ptev(rec.owner, 'dug', {});
    },
  };
  function ownerOf(id) {
    const p = game.aiPlayerById?.(id);
    if (!p) return null;
    if (p.yaw === undefined) p.yaw = Math.atan2(-p.look.x, -p.look.z);
    return p;
  }
  function itemList() {
    if (NS.itemsT === game.time) return NS.items;
    NS.itemsT = game.time;
    const out = [];
    for (const it of game.items.all()) {
      if (it.state !== 'world' || it.holder || it.owner || it.carrier || it.soulbound || it.type === 'body' || it.ladder || !isSellable(it.def)) continue;
      const p = it.obj.position;
      if (insideShip(p)) continue;
      out.push({ id: it.id, x: p.x, y: p.y, z: p.z, val: it.value || 0, tier: tierIndex(it.rarity()), weight: it.def.weight || 1, big: it.def.kind === 'big' || it.def.hands === 2, nest: it.nest || null, zone: p.y < FACILITY_Y + 40 ? 'in' : 'out' });
    }
    NS.items = out;
    return out;
  }
  function creatureList() {
    if (NS.crT === game.time) return NS.cr;
    NS.crT = game.time;
    const out = [];
    for (const c of game.creatures.host.values()) {
      if (c.dead) continue;
      out.push({
        id: c.id, x: c.pos.x, y: c.pos.y, z: c.pos.z, hp: c.hp, maxHp: c.maxHp, dead: c.dead, zone: c.zone === 'any' ? undefined : c.zone, hazard: !!c.def.hazard, boss: !!c.def.boss,
        dmg: c.dmg || c.def.dmg || 0, target: c.target || null, type: c.type, level: c.level, active: !!c.target || ACTIVE_STATES.has(c.state), friendly: !!c.def.siegeAlly,
      });
    }
    NS.cr = out;
    return out;
  }
  // movement: nav paths in the facility, straight lines outside (slides around the ship hull)
  function moveRec(rec, x, z, speed, dt) {
    const fac = game.world?.facility;
    if (rec.zone === 'in' && fac?.nav && !rec.inShip) {
      rec.repath -= dt;
      if (!rec.pdest || hyp(rec.pdest.x - x, rec.pdest.z - z) > 2.5 || rec.repath <= 0) {
        const found = fac.nav.findPath(rec.x, rec.z, x, z);
        rec.path = found || null; rec.pathIdx = 0; rec.pdest = { x, z }; rec.repath = 0.8 + Math.random() * 0.4;
      }
      if (!rec.path || rec.pathIdx >= rec.path.length) return !rec.path ? hyp(x - rec.x, z - rec.z) < 1.2 : true;
      const wp = rec.path[rec.pathIdx], dx = wp.x - rec.x, dz = wp.z - rec.z, d = hyp(dx, dz);
      if (d < 0.35) { rec.pathIdx++; return rec.pathIdx >= rec.path.length; }
      const st = Math.min(d, speed * dt);
      rec.x += (dx / d) * st; rec.z += (dz / d) * st;
      for (const dr of fac.doors || []) if (!dr.open && !dr.locked && dr.kind === 'door' && dr.pos.distanceToSquared(new THREE.Vector3(rec.x, dr.pos.y, rec.z)) < 6.25) { try { game.hostSetDoor(dr.id, true, true); } catch { /* door api */ } }
      return false;
    }
    const dx = x - rec.x, dz = z - rec.z, d = hyp(dx, dz);
    if (d < 0.1) return true;
    const st = Math.min(d, speed * dt);
    let ux = dx / d, uz = dz / d;
    const hull = rec.zone === 'out' && !rec.inShip && game.run?.phase === 'moon';
    const free = (px, pz) => !hull || distToHull(px, pz) > 0.9;
    let nx = rec.x + ux * st, nz = rec.z + uz * st;
    if (!free(nx, nz)) {
      // slide: try the axes, then a sidestep around the hull
      if (free(rec.x + ux * st, rec.z)) { nx = rec.x + ux * st; nz = rec.z; }
      else if (free(rec.x, rec.z + uz * st)) { nx = rec.x; nz = rec.z + uz * st; }
      else { const sx = -uz, sz = ux, sgn = (sx * (x - rec.x) + sz * (z - rec.z)) >= 0 ? 1 : -1; nx = rec.x + sx * sgn * st; nz = rec.z + sz * sgn * st; if (!free(nx, nz)) { nx = rec.x; nz = rec.z; } }
    }
    rec.x = nx; rec.z = nz;
    return d - st < 0.25;
  }
  function ptev(owner, e, d) { try { net().sendTo(owner, 'ptev', { ...d, e }); } catch { /* peer gone */ } }
  function appearance(pet) { return { id: pet.id, sp: pet.sp, st: C.stageOf(pet), sh: pet.sh ? 1 : 0, sk: { ...pet.sk }, nm: pet.nm, lv: C.levelOf(pet), tr: pet.tr }; }

  function hostSync(d, from) {
    if (!host() || !d || typeof d !== 'object') return;
    const pet = C.sanitizePet(d.pet);
    if (!pet || pet.ko) { hostGone(from); return; }
    const o = ownerOf(from);
    let rec = recs.get(from);
    if (!rec) {
      rec = SIM.makeRec(from, pet, o ? { x: o.pos.x + 1.2, y: o.pos.y, z: o.pos.z + 1.2 } : undefined);
      if (o) { rec.zone = o.zone; rec.inShip = !!o.inShip; }
      recs.set(from, rec);
    } else if (rec.pet?.id !== pet.id) { SIM.flush(rec, E); SIM.applyPet(rec, pet); rec.ko = false; if (o) { rec.x = o.pos.x + 1.2; rec.z = o.pos.z + 1.2; rec.y = o.pos.y; rec.zone = o.zone; rec.inShip = !!o.inShip; } }
    else SIM.applyPet(rec, pet);
    SIM.setMode(rec, C.MODES.includes(d.mode) ? d.mode : 'follow');
    rec.dest = d.dest === 'ship' ? 'ship' : 'me';
    rec.blocked = !!d.bl;
    net().broadcast('ptinfo', { o: from, a: appearance(pet) });
  }
  function hostGone(from) {
    const rec = recs.get(from);
    if (rec) { E.cur = rec; SIM.flush(rec, E); E.cur = null; recs.delete(from); }
    net()?.broadcast('ptinfo', { o: from, a: null });
  }
  function hostCap(d, from) {
    if (!host() || !d) return;
    const M = game.creatures, c = M.host.get(String(d.id || ''));
    const o = ownerOf(from);
    const fail = (why) => ptev(from, 'cap', { ok: 0, why });
    if (!c || c.dead || !o) return fail('gone');
    if (o.pos.distanceTo(c.pos) > 9) return fail('far');
    const sp = C.captureSpecies(c.type);
    if (!sp || c.def.boss || c.def.hazard || c.maxHp == null) return fail('type');
    const hpFrac = c.hp / Math.max(1, c.maxHp);
    const p = C.captureChance({ type: c.type, hpFrac, tier: c.tier || 'common', elite: c.elite, level: c.level });
    if (!(p > 0)) return fail('healthy');
    if (Math.random() < p) { M.kill(c, null, { silent: true }); ptev(from, 'cap', { ok: 1, sp }); }
    else { c.data.angry = 8; ptev(from, 'cap', { ok: 0, why: 'free' }); }
  }
  function hostCmd(d, from) {
    if (!host() || !d) return;
    const rec = recs.get(from);
    if (!rec) return;
    if (d.mode) SIM.setMode(rec, d.mode);
    const p = Array.isArray(d.p) && d.p.length === 3 && d.p.every((v) => Number.isFinite(v)) ? d.p : null;
    E.cur = rec; E.owner = ownerOf(from); E.rand = Math.random;
    const r = SIM.command(rec, { op: 'atk', id: d.id, p }, E);
    E.cur = null;
    ptev(from, 'cmd', { r });
  }
  offs.push(mods.on('registerHandlers', (H, g) => {
    if (g !== game) return;
    H('pt', (d, from) => {
      try {
        if (d.op === 'sync') hostSync(d, from);
        else if (d.op === 'gone') hostGone(from);
        else if (d.op === 'atk') hostCmd(d, from);
        else if (d.op === 'cap') hostCap(d, from);
      } catch (e) { console.error('pt', e); }
    });
  }));
  offs.push(mods.on('playerJoin', (id, _i, g) => {
    if (g !== game || !host()) return;
    for (const [o, r] of recs) if (r.pet) net().sendTo(id, 'ptinfo', { o, a: appearance(r.pet) });
  }));

  // host: per-frame sim + rows
  function rowsOf() {
    const rows = [];
    for (const r of recs.values()) rows.push([r.owner, +r.x.toFixed(2), +r.y.toFixed(2), +r.z.toFixed(2), +r.yaw.toFixed(2), SIM.animCode(r.anim), Math.round(100 * r.hp / Math.max(1, r.maxHp)), C.MODES.indexOf(r.mode), r.carry.length, +Math.min(9, r.speed).toFixed(1), r.blocked ? 1 : 0]);
    return rows;
  }
  function hostFrame(dt) {
    const run = game.run;
    if (!run || !recs.size) return;
    const ph = run.phase;
    const live = ph === 'moon' || ph === 'company' || ph === 'orbit';
    if (NS.lastPhase !== ph) {   // landing / takeoff / leaving: put whatever is carried down at the owner's feet
      NS.lastPhase = ph;
      for (const r of recs.values()) if (r.carry.length) { E.cur = r; E.dropCarry(r, r.carry.splice(0), 'owner'); E.cur = null; r.tgt = null; }
    }
    if (!live) return;
    dt = Math.min(dt, 0.1);
    E.creatures = creatureList();
    E.day = run.day;
    const terr = game.world?.terrain;
    E.guardPoint = ph === 'moon' && terr?.heightAt ? { x: SHIP.door.x, z: SHIP.z1 + 3.2, y: terr.heightAt(SHIP.door.x, SHIP.z1 + 3.2) } : null;
    E.shipPoint = ph === 'moon' && terr?.heightAt ? { x: SHIP.door.x, z: SHIP.z1 + 1.6, y: terr.heightAt(SHIP.door.x, SHIP.z1 + 1.6) } : null;
    for (const r of recs.values()) {
      const o = ownerOf(r.owner);
      if (!o || o.dead) { r.speed = 0; r.anim = 'idle'; continue; }
      E.cur = r; E.owner = o;
      E.shipReachable = o.zone === 'out' && ph === 'moon';
      try { SIM.stepPet(r, E, dt); } catch (e) { if (!NS.warned) { NS.warned = 1; console.warn('[pets] sim', e); } }
    }
    E.cur = null;
    NS.rowT -= dt;
    if (NS.rowT <= 0) {
      NS.rowT = 0.1;
      const rows = rowsOf();
      applyRows(rows);
      try { net().sendRows('ptst', rows, { keyframe: 1.5, eps: 0.04 }); } catch { /* net closing */ }
    }
  }
  // tank / shield / crew luck wraps (host side)
  function wrapM(obj, name, make) {
    if (!obj || typeof obj[name] !== 'function') return;
    const orig = obj[name], own = Object.prototype.hasOwnProperty.call(obj, name);
    const w = make(orig);
    obj[name] = w;
    restores.push(() => { if (obj[name] === w) { if (own) obj[name] = orig; else delete obj[name]; } });
  }
  wrapM(game, 'hostHurtPlayer', (orig) => function (id, dmg, cause, fromId, fromPos) {
    try {
      if (host() && recs.size && dmg > 0 && dmg < 999 && cause !== 'left') {
        const victim = ownerOf(id);
        if (victim) {
          const mine = recs.get(id);
          if (mine && !mine.ko) {
            const sh = SIM.tankShare(mine, dmg, victim.pos);
            if (sh.toPet > 0) { E.cur = mine; SIM.hurtPet(mine, sh.toPet * 0.7, E); E.cur = null; dmg = sh.toPlayer; }
          }
          for (const r of recs.values()) {   // firewall: the owner's bot, or any crew bot with shareShield in range
            if (r.ko || !r.stats?.shield) continue;
            if (r.owner !== id && !(r.stats.shareShield && hyp(r.x - victim.pos.x, r.z - victim.pos.z) < SIM.SIM.shareRange)) continue;
            const before = dmg;
            dmg = SIM.absorbShield(r, dmg);
            if (dmg < before) { ptev(r.owner, 'shield', { n: Math.round(before - dmg) }); break; }
          }
        }
      }
    } catch (e) { console.warn('[pets] hurt wrap', e); }
    if (!(dmg > 0)) return undefined;
    return orig.call(this, id, dmg, cause, fromId, fromPos);
  });
  const inv = game.inventory;
  wrapM(inv, 'hostLootLuck', (orig) => function (...a) {
    let luck = 0;
    for (const r of recs.values()) if (!r.ko && r.stats?.luck > luck) luck = r.stats.luck;
    return Math.min(1, (orig.apply(this, a) || 0) + luck);
  });

  // ------------------------------------------------------------------------------------------------ everyone: views
  function makeView(owner, a) {
    if (typeof document === 'undefined' || !game.engine?.scene) return null;
    try {
      const model = createPetModel(a.sp, a.st, { shiny: !!a.sh, skin: { c: a.sk.c, h: a.sk.h, v: a.sk.v, s: a.sk.s } });
      game.engine.scene.add(model.root);
      const p = ownerPos(owner);
      if (p) model.root.position.set(p.x - 1.2, p.y, p.z - 1.2);
      return { model, pos: model.root.position, tgt: model.root.position.clone(), yaw: 0, anim: 'idle', speed: 0, sig: sigOf(a), carry: 0, fresh: true, mood: 'happy' };
    } catch (e) { console.warn('[pets] view', e); return null; }
  }
  const sigOf = (a) => `${a.sp}|${a.st}|${a.sh}|${a.sk.c}|${a.sk.h}|${a.sk.v}|${a.sk.s}`;
  function ownerPos(id) {
    if (isMe(id)) return game.player?.pos;
    return game.remotes?.get(id)?.pos || null;
  }
  function dropView(owner) {
    const v = views.get(owner);
    if (!v) return;
    for (const it of game.items.all()) if (it.obj.parent === v.model.root) { game.engine.scene.add(it.obj); it.obj.scale.setScalar(1); it.obj.visible = false; }
    v.model.dispose(); views.delete(owner);
  }
  function onInfo(d, from) {
    if (NS.disposed || !d || (from !== net()?.hostId && from !== game.selfId)) return;
    if (!d.a) { info.delete(d.o); dropView(d.o); return; }
    const a = d.a;
    if (!a || !C.SPECIES[a.sp]) return;
    a.sk = a.sk || { c: 'none', h: 'none', v: 'base', s: 'none' };
    info.set(d.o, a);
    const v = views.get(d.o);
    if (v && v.sig !== sigOf(a)) dropView(d.o);
  }
  function applyRows(rows) {
    if (!Array.isArray(rows)) return;
    for (const r of rows) {
      if (!Array.isArray(r)) continue;
      const a = info.get(r[0]);
      if (!a) continue;
      let v = views.get(r[0]);
      if (!v) { v = makeView(r[0], a); if (!v) continue; views.set(r[0], v); }
      v.tgt.set(r[1], r[2], r[3]); v.yaw = r[4]; v.anim = SIM.ANIM_CODES[r[5]] || 'idle'; v.hp = r[6]; v.mode = C.MODES[r[7]] || 'follow'; v.carry = r[8]; v.speed = r[9]; v.hidden = !!r[10];
      v.age = 0;
      if (v.fresh) { v.pos.copy(v.tgt); v.fresh = false; }
    }
  }
  function onRows(rows, from) { if (NS.disposed || from !== net()?.hostId) return; applyRows(rows); }
  // items a pet carries (holder 'c:pt<owner>'): shown on the pet's back, hidden while its view does not exist yet
  function syncCarried() {
    for (const it of game.items.all()) {
      const h = it.holder;
      if (typeof h !== 'string' || !h.startsWith('c:pt')) continue;
      const v = views.get(h.slice(4));
      if (v && v.model.root.visible) {
        if (it.obj.parent !== v.model.root) { v.model.root.add(it.obj); it.obj.position.set(0, 0.85, 0.05); it.obj.quaternion.identity(); it.obj.scale.setScalar(0.6); }
        it.obj.visible = true;
      } else it.obj.visible = false;
    }
  }
  function tickViews(dt) {
    for (const [owner, v] of views) {
      v.age = (v.age || 0) + dt;
      const a = info.get(owner);
      const stale = v.age > 6 && !(host() && recs.has(owner));
      v.model.root.visible = !stale && !v.hidden && !(isMe(owner) && blocked());
      if (v.pos.distanceTo(v.tgt) > 12) v.pos.copy(v.tgt); else v.pos.lerp(v.tgt, Math.min(1, dt * 9));
      let dy = v.yaw - v.model.root.rotation.y;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      v.model.root.rotation.y += dy * Math.min(1, dt * 10);
      v.model.update(dt, { anim: v.anim, speed: v.speed, mood: v.mood, carry: v.carry > 0 });
      void a;
    }
  }

  // ------------------------------------------------------------------------------------------------ owner: HUD marks + night vision
  const marks = { sprites: [], tex: {} };
  function markTex(kind) {
    if (marks.tex[kind]) return marks.tex[kind];
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const g = cv.getContext('2d');
    g.strokeStyle = MARK_COL[kind]; g.lineWidth = 6; g.beginPath();
    if (kind === 'c') { g.moveTo(32, 8); g.lineTo(56, 52); g.lineTo(8, 52); g.closePath(); }
    else if (kind === 'h') { g.moveTo(32, 8); g.lineTo(56, 32); g.lineTo(32, 56); g.lineTo(8, 32); g.closePath(); }
    else if (kind === 'k') g.rect(14, 14, 36, 36);
    else g.arc(32, 32, 20, 0, Math.PI * 2);
    g.stroke();
    const tx = new THREE.CanvasTexture(cv);
    marks.tex[kind] = tx;
    return tx;
  }
  function showMarks(list) {
    if (typeof document === 'undefined' || !game.engine?.scene) return;
    NS.markT = 1.4;
    while (marks.sprites.length < list.length && marks.sprites.length < 24) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: markTex('c'), transparent: true, depthTest: false, depthWrite: false, fog: false }));
      sp.renderOrder = 999; sp.visible = false;
      game.engine.scene.add(sp);
      marks.sprites.push(sp);
    }
    marks.sprites.forEach((sp, i) => {
      const m = list[i];
      if (!m) { sp.visible = false; return; }
      sp.material.map = markTex(m[3]); sp.material.needsUpdate = true;
      sp.position.set(m[0], m[1] + (m[3] === 'c' ? 2.2 : 0.7), m[2]);
      const d = game.player ? hyp(m[0] - game.player.pos.x, m[2] - game.player.pos.z) : 10;
      sp.scale.setScalar(Math.max(0.35, Math.min(2.2, d * 0.07)));
      sp.visible = true;
    });
  }
  function tickMarks(dt) {
    if (NS.markT > 0) { NS.markT -= dt; if (NS.markT <= 0) for (const sp of marks.sprites) sp.visible = false; }
  }
  function nightVision(on) {
    const U = game.engine?.postMat?.uniforms;
    if (!U || on === NS.nv) return;
    NS.nv = on;
    U.uGamma.value *= on ? 1.28 : 1 / 1.28;
    U.uVignette.value *= on ? 0.7 : 1 / 0.7;
  }

  // ------------------------------------------------------------------------------------------------ owner: host events
  function onEv(d, from) {
    if (NS.disposed || !d || (from !== net()?.hostId && from !== game.selfId)) return;
    const s = petState(), pet = C.activePet(s);
    if (!pet && d.e !== 'cap') return;
    switch (d.e) {
      case 'fetched': {
        const r = C.awardXp(pet, 3 + 2 * d.n, { raw: true, fetch: true });
        s.stats.fetched += d.n; C.addLoyalty(pet, 'play');
        say(tf('{n} brought {c} item(s).', { n: pet.nm, c: d.n }), 'good');
        levelToast(pet, r); save(); break;
      }
      case 'kill': { const r = C.awardXp(pet, 4 + (d.lv || 1), { raw: true }); pet.kills++; s.stats.kills++; levelToast(pet, r); save(); break; }
      case 'ko': C.knockOut(s, pet); save(); say(tf('{n} was knocked out and rests for a day.', { n: pet.nm }), 'bad'); api.afterKo?.(); sendSync(true); break;
      case 'revive': say(tf('{n} got back up!', { n: pet.nm }), 'good'); break;
      case 'heal': { const p = game.player; if (p && !p.dead && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + d.n); break; }
      case 'recharge': {
        for (const it of game.items.all()) {
          if (it.holder !== game.selfId || !it.def.battery || it.battery == null || it.battery >= it.def.battery) continue;
          it.battery = Math.min(it.def.battery, it.battery + it.def.battery * d.f);
          net().send('itst', { id: it.id, b: Math.round(it.battery * 10) / 10 });
        }
        break;
      }
      case 'mk': showMarks(d.list || []); break;
      case 'bark': { try { game.audio?.at?.(game.audio.has('yoinker_yippee') ? 'yoinker_yippee' : 'ui_confirm', new THREE.Vector3(d.x, game.player.pos.y + 0.5, d.z), 0.7); } catch { /* audio */ } break; }
      case 'say': if (d.k === 'ignore') say(tf('{n} ignores you.', { n: pet.nm }), 'warn'); else if (d.k === 'stole') say(tf('{n} stole from the nest!', { n: pet.nm }), 'good'); break;
      case 'shield': say(`${pet.nm}: -${d.n}`, 'good'); break;
      case 'dug': say(`${pet.nm}: !`, 'good'); break;
      case 'cmd': { if (d.r === 'attack') say(t('Command: attack'), 'info'); else if (d.r === 'decoy') say(t('Command: decoy'), 'info'); else if (d.r === 'ignored') say(tf('{n} ignores you.', { n: pet.nm }), 'warn'); break; }
      case 'cap': capResult(d); break;
      default: break;
    }
  }
  function levelToast(pet, r) {
    if (r.to > r.from) say(tf('{n} reached level {l}!', { n: pet.nm, l: r.to }), 'good');
    if (r.evolved) { petState().stats.evolved++; say(tf('{n} evolved into {e}!', { n: pet.nm, e: C.evolutionName(pet.sp, r.stage) }), 'good'); }
    if (r.to > r.from) sendSync(true);
  }
  // ------------------------------------------------------------------------------------------------ owner: Pet Carrier / treat / command keys
  function aimCreature(maxDist = 12) {
    const p = game.player, M = game.creatures;
    if (!p || !M) return null;
    const eye = p.eyePos(), fwd = p.forward();
    const hit = M.raycast(eye, fwd, maxDist, (v) => v.state !== 'dead');
    return hit ? hit.view : null;
  }
  function useCarrier(it) {
    const s = petState();
    if (s.stable.length >= C.MAX_STABLE) { say(t('The stable is full.'), 'warn'); return; }
    if (game.time - NS.capT < 1.5) return;
    const v = aimCreature(7);
    if (!v) { say(t('Aim at a small creature.'), 'warn'); return; }
    if (!C.captureSpecies(v.type) || v.def?.boss) { say(t('This creature cannot be caught.'), 'warn'); return; }
    const hpFrac = (v.hp ?? 1) / Math.max(1, v.maxHp || 1);
    const p = C.captureChance({ type: v.type, hpFrac, tier: v.tier || 'common', elite: v.elite, level: v.level });
    if (!(p > 0)) { say(t('It is too healthy. Weaken it below 25% HP first.'), 'warn'); return; }
    NS.capT = game.time; NS.capItem = it.id;
    say(tf('Catch chance {p}%', { p: Math.round(p * 100) }), 'info');
    net().request('pt', { op: 'cap', id: v.id });
  }
  function capResult(d) {
    const s = petState();
    if (!d.ok) { say(d.why === 'free' ? t('It broke free!') : d.why === 'healthy' ? t('It is too healthy. Weaken it below 25% HP first.') : t('This creature cannot be caught.'), 'warn'); return; }
    const pet = C.makePet({ sp: d.sp, source: 'capture' });
    const r = C.adoptPet(s, pet);
    if (!r.ok) { say(t(r.err), 'warn'); return; }
    s.stats.captured++;
    if (NS.capItem) { try { net().request('consume', { id: NS.capItem }); } catch { /* ignore */ } NS.capItem = null; }
    save(); say(tf('Caught {n}!', { n: pet.nm }), 'good');
    game.audio?.ui?.('ui_confirm', 0.8);
    api.refresh?.();
    sendSync(true);
  }
  offs.push(mods.on('useItem', (it, hk, g) => {
    if (g !== game || !it || hk.handled) return;
    if (it.type === 'pet_carrier') { hk.handled = true; useCarrier(it); }
  }));
  function command() {
    const s = petState(), pet = C.activePet(s);
    if (!pet || C.isResting(s, pet)) { say(t('No pet with you.'), 'warn'); return; }
    const st = C.petStats(pet);
    const p = game.player, eye = p.eyePos(), fwd = p.forward();
    let point = null;
    if (st.decoy) {
      const h = game.physics?.raycast?.(eye, fwd, 30, G.STATIC);
      const dist = h ? Math.max(1, h.distance - 0.4) : 18;
      point = [eye.x + fwd.x * dist, eye.y + fwd.y * dist - 0.6, eye.z + fwd.z * dist];
    }
    const v = aimCreature(28);
    if (!v && !point) { say(t('Nothing to command.'), 'warn'); return; }
    net().request('pt', { op: 'atk', id: v?.id, p: point });
  }
  const onKey = (e) => {
    if (e.repeat || NS.disposed || game.destroyed || !game.run) return;
    if (e.code !== 'KeyO' && e.code !== 'KeyL') return;
    if (game.input?.isTyping?.() || game.minigame || game.terminal?.active || game.ui?.chatOpen || game.ui?.panelOpen || game.music?.playing || game.player?.dead) return;
    if (e.code === 'KeyO') { if (e.shiftKey) toggleDest(); else cycleMode(1); e.preventDefault(); }
    else { command(); e.preventDefault(); }
  };
  if (typeof window !== 'undefined') window.addEventListener('keydown', onKey);

  // ------------------------------------------------------------------------------------------------ net binding + frame
  function bind(n) {
    if (!n || NS.boundNet === n) return;
    NS.boundNet?.off?.('msg:ptinfo', onInfo); NS.boundNet?.off?.('msg:ptst', onRows); NS.boundNet?.off?.('msg:ptev', onEv);
    NS.boundNet = n;
    n.on('msg:ptinfo', onInfo); n.on('msg:ptst', onRows); n.on('msg:ptev', onEv);
  }
  offs.push(mods.on('netReady', (n, g) => { if (g === game) { bind(n); NS.syncSig = ''; } }));
  if (game.net) bind(game.net);
  offs.push(mods.on('update', (dt, g) => {
    if (g !== game || NS.disposed) return;
    try {
      if (host()) hostFrame(dt);
      tickViews(dt);
      if ((NS.carryT = (NS.carryT || 0) - dt) <= 0) { NS.carryT = 0.25; syncCarried(); }
      tickMarks(dt);
      NS.syncT -= dt;
      if (NS.syncT <= 0) { NS.syncT = 1.5; if (game.run) sendSync(false); }
      const pet = C.activePet(petState());
      const dark = !!(game.player?.indoor || (game.env?.night ?? 0) > 0.35);
      const mine = views.get(game.selfId);
      nightVision(!!(dark && pet && C.petStats(pet).night && !C.isResting(petState(), pet) && mine && mine.pos.distanceTo(game.player.pos) < 14 && !blocked()));
    } catch (e) { if (!NS.warned2) { NS.warned2 = 1; console.warn('[pets] net', e); } }
  }));
  offs.push(mods.on('mapLoaded', (w, g) => { if (g === game) { NS.syncSig = ''; setTimeout(() => sendSync(true), 600); } }));
  offs.push(mods.on('phase', (ph, g) => { if (g === game) { setTimeout(() => sendSync(true), 500); } }));

  api.net = {
    views, info, recs, sendSync, cycleMode, toggleDest, command, useCarrier, hostFrame, aimCreature,
    ownView: () => views.get(game.selfId) || null,
  };
  return {
    dispose() {
      NS.disposed = true;
      for (const off of offs) { try { off?.(); } catch { /* ignore */ } }
      NS.boundNet?.off?.('msg:ptinfo', onInfo); NS.boundNet?.off?.('msg:ptst', onRows); NS.boundNet?.off?.('msg:ptev', onEv);
      for (const r of restores.reverse()) { try { r(); } catch { /* ignore */ } }
      for (const o of [...views.keys()]) dropView(o);
      for (const sp of marks.sprites) { sp.removeFromParent(); sp.material.dispose(); }
      for (const k of Object.keys(marks.tex)) marks.tex[k].dispose();
      nightVision(false);
      if (typeof window !== 'undefined') window.removeEventListener('keydown', onKey);
    },
  };
}
export { RAD as _RAD };
