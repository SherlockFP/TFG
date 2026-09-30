// CARRY 2 (wave 8, module 'carry2'; docs/wave8/carry2.md): R.E.P.O.-style carry comedy inside the camera-verb game.
//   1. heavy 2-hand loot sways the camera and slows the turn; hard bumps (wall / prop at speed) cost a fragile carried item 5-25 % (floor 35 %), crunch + "-N" fly-up
//   2. two-person carry: bulky valuables (vending machine, blade rack, Company statue, the facjobs server core) crawl with one carrier; a second player
//      holds E next to the carrier and the pair walks at near-normal speed (a strap line hangs between them)
//   3. throw & catch: a fragile item thrown to a crewmate can be caught out of the air ([E] while it flies) and keeps its value; uncaught it cracks
//   4. breakage on camera: one Algorithm line (rate-limited, firstrun-gated in algorithm.show) + a Highlight candidate (feedcams2 run.fc2.hl 'crack' / 'catch')
// Net (prefix 'cy2'): 'cy2q' client -> host {op:'bump'|'grip'|'throw', id, ...}; 'cy2fx' host -> everyone (HOST_ONLY) {k:'co'|'throw'|'brk'|'catch', ...}.
import * as THREE from 'three';
import { t, tf, addTranslations } from '../core/i18n.js';
import { HOST_ONLY } from '../net/session.js';
import { SCRAP_TABLE, ITEMS, registerItem } from './items.js';
import { MOONS } from './moons.js';
import * as C from './carry2_core.js';
import { createArtModel } from '../models/artpass.js';

HOST_ONLY.add('cy2fx');

const TR = {
  'Vending Machine': 'Otomat', 'Blade Rack': 'Blade Rafı', 'Company Statue': 'Şirket Heykeli',
  'Heavy and fragile. One player crawls with it; two players (one holds E next to the carrier) walk it home.': 'Ağır ve kırılgan. Tek kişi sürünerek taşır; iki kişi (biri taşıyıcının yanında E basılı tutar) eve yürüterek götürür.',
  'A server rack that still hums. Two people carry it at near-normal speed.': 'Hâlâ uğuldayan bir sunucu rafı. İki kişi neredeyse normal hızda taşır.',
  'A bronze-look statue of the Company founder. Do not bump it into the founder.': 'Şirket kurucusunun bronz görünümlü heykeli. Kurucuya çarptırma.',
  'Help carry the {name} [hold E]': '{name} taşımaya yardım et [E basılı tut]',
  'Two people carry it at near-normal speed.': 'İki kişi neredeyse normal hızda taşır.',
  'Catch the {name} [E]': '{name} yakala [E]',
  '{name} is helping you carry the {item}.': '{name}, {item} taşımana yardım ediyor.',
  'You share the load of the {item}.': '{item} yükünü paylaşıyorsun.',
  'The grip slips. Back to crawling.': 'Tutuş kaydı. Yine sürünmeye dönüş.',
  'Nice catch. Not a crack.': 'Güzel yakalama. Çatlak yok.',
  '{name} just turned ▮{n} of company property into confetti. Chat is delighted.': '{name} az önce ▮{n} değerinde şirket malını konfetiye çevirdi. Sohbet çok memnun.',
  'Careful, {name}. No, please, keep going. The clip is doing numbers.': 'Dikkat et, {name}. Yok, lütfen devam et. Klip rekor kırıyor.',
  'Fragile means fragile, {name}. I would say it twice, but the cameras got it the first time.': 'Kırılgan kırılgan demek, {name}. İki kere söylerdim ama kameralar ilkini yakaladı.',
};
const RU = {
  'Vending Machine': 'Торговый автомат', 'Blade Rack': 'Блейд-стойка', 'Company Statue': 'Статуя Компании',
  'Heavy and fragile. One player crawls with it; two players (one holds E next to the carrier) walk it home.': 'Тяжёлый и хрупкий. Один игрок ползёт с ним; двое (второй держит E рядом с носильщиком) несут его домой шагом.',
  'A server rack that still hums. Two people carry it at near-normal speed.': 'Серверная стойка, которая ещё гудит. Вдвоём её несут почти с нормальной скоростью.',
  'A bronze-look statue of the Company founder. Do not bump it into the founder.': 'Бронзовая на вид статуя основателя Компании. Не бейте основателя об стены.',
  'Help carry the {name} [hold E]': 'Помочь нести: {name} [держите E]',
  'Two people carry it at near-normal speed.': 'Вдвоём это несут почти с нормальной скоростью.',
  'Catch the {name} [E]': 'Поймать: {name} [E]',
  '{name} is helping you carry the {item}.': '{name} помогает вам нести: {item}.',
  'You share the load of the {item}.': 'Вы делите ношу: {item}.',
  'The grip slips. Back to crawling.': 'Хватка соскользнула. Снова ползём.',
  'Nice catch. Not a crack.': 'Отличная ловля. Ни трещинки.',
  '{name} just turned ▮{n} of company property into confetti. Chat is delighted.': '{name} только что превратил(а) ▮{n} имущества Компании в конфетти. Чат в восторге.',
  'Careful, {name}. No, please, keep going. The clip is doing numbers.': 'Осторожно, {name}. Нет, пожалуйста, продолжайте. Клип набирает просмотры.',
  'Fragile means fragile, {name}. I would say it twice, but the cameras got it the first time.': 'Хрупкое значит хрупкое, {name}. Сказал бы дважды, но камеры поймали и с первого раза.',
};
addTranslations(TR, 'tr'); addTranslations(RU, 'ru');

const CSS = '.cy2-pop{position:fixed;left:50%;top:52%;transform:translateX(-50%);pointer-events:none;z-index:45;font-family:var(--cond,"Barlow Condensed","Arial Narrow",sans-serif);font-size:30px;color:#ff6a5a;text-shadow:0 2px 8px #000;opacity:0}';

// ---------------------------------------------------------------------------------------------------------------- models (art-pass kit models, unlit / Lambert materials only: no lights)
const MODELS = {};
for (const id of ['cy_vending', 'cy_rack', 'cy_statue', 'pipe']) MODELS[id] = () => createArtModel(id);   // [heroprops] the held lead pipe rides along (hand tool, same hooks)

export function installCarry2(game) {
  const mods = game.mods;
  if (!mods) return null;
  const offs = [], V3 = THREE.Vector3;
  let disposed = false, boundNet = null, style = null;

  // ---- items, loot, models (idempotent: every new Game re-installs the module) ------------------------------------------------
  for (const d of C.ITEM_DEFS) registerItem({ ...d });
  for (const id of C.BULKY_IDS) if (ITEMS[id]) ITEMS[id].bulky = true;   // facjobs' server core
  for (const [th, rows] of Object.entries(C.LOOT)) {
    const tb = SCRAP_TABLE[th]; if (!tb) continue;
    for (const [id, w] of rows) if (!tb.some((e) => e[0] === id)) tb.push([id, w]);
  }
  const mm = (typeof window !== 'undefined' ? window.__kefalMods : null) || mods;
  if (mm?.itemModels) for (const id of Object.keys(MODELS)) if (!mm.itemModels.has(id)) mm.itemModels.set(id, () => MODELS[id]());
  if (typeof document !== 'undefined') { style = document.createElement('style'); style.textContent = CSS; document.head?.appendChild(style); }

  const S = {
    co: new Map(),          // item id -> helper id (everyone, from the host)
    coHost: new Map(),      // host: item id -> { by, t }
    fly: new Map(),         // item id -> { by, t, spd, last } thrown fragile items a crewmate may catch
    throws: new Map(),      // host: item id -> { by, t }
    bumpAt: new Map(),      // host: item id -> time of the last bump
    grip: null,             // local helper: { id, holder, ping }
    prevHs: 0, bumpCd: 0, swayT: 0, scan: 0, bulky: [], lineAt: -99, syncT: 0,
    lines: [], stats: { bumps: 0, cracks: 0, catches: 0, grips: 0 },
  };
  const run = () => game.run, host = () => !!game.isHost;
  const onMoon = () => { const r = run(), m = r && MOONS[r.moon]; return !!m && r.phase === 'moon' && !m.company && !m.home; };
  const toast = (s, k = 'info') => { try { game.ui?.toast?.(s, k); } catch { /* ui optional */ } };
  const fx = (d) => { try { game.net.broadcast('cy2fx', d); } catch { /* net closing */ } };
  const nameOf = (id) => { try { return game.playerName?.(id) || '?'; } catch { return '?'; } };
  const posOf = (id) => (id === game.selfId ? game.player?.pos : game.remotes?.get(id)?.pos) || null;
  const snd = (name, pos, vol = 0.6) => { try { if (game.audio?.has && !game.audio.has(name)) return; game.audio?.at?.(name, pos, vol, { refDistance: 3, maxDistance: 40 }); } catch { /* audio optional */ } };
  const onCam = (id, pos) => { try { const m = game.feedcams?.meter?.(id); return !!m && (m.live || m.m > 0.2 || !!m.tag || (!!pos && !!game.feedcams?.sees?.(pos))); } catch { return false; } };

  // ---- net -----------------------------------------------------------------------------------------------------------------------
  function bindNet(net) { if (!net || boundNet === net) return; boundNet = net; net.on_('cy2fx', (d) => onFx(d)); }
  offs.push(mods.on('netReady', (n, g) => { if (!g || g === game) bindNet(n); }));
  if (game.net) bindNet(game.net);
  const req = (d) => { try { game.net.request('cy2q', d); } catch { /* net closing */ } };

  // ---- host: requests ----------------------------------------------------------------------------------------------------------
  function hostReq(d, from) {
    if (!d || !host()) return;
    const it = game.items?.get?.(d.id);
    if (!it) return;
    if (d.op === 'bump') return hostBump(it, from, +d.s);
    if (d.op === 'grip') return hostGrip(it, from, !!d.on);
    if (d.op === 'throw') {
      if (it.state !== 'world' && it.holder !== from) return;
      if (!C.throwable(it.def) || (it.lastHolder && it.lastHolder !== from)) return;
      S.throws.set(it.id, { by: from, t: 0 });
      fx({ k: 'throw', id: it.id, by: from });
    }
  }
  offs.push(mods.on('registerHandlers', (H, g) => { if (g === game) H('cy2q', (d, from) => { try { hostReq(d, from); } catch (e) { console.warn('[carry2] req', e); } }); }));

  /** host: value lost + the shared reaction (crunch fx, Algorithm line, highlight) */
  function hostBreak(it, lost, by, why) {
    const base = it.baseValue || it.value || 0;
    game.hostDamageItem?.(it.id, lost);
    const p = it.obj.position, cam = onCam(by, posOf(by));
    let ln = -1;
    const now = game.time || 0;
    if (C.isBreak(base, lost) && cam && now - S.lineAt >= C.LINE_GAP) { S.lineAt = now; ln = Math.floor(Math.random() * C.LINES.length); }
    fx({ k: 'brk', id: it.id, by, n: lost, w: why === 'throw' ? 1 : 0, p: [p.x, p.y, p.z], ln });
    if (C.isBreak(base, lost) && (cam || lost >= C.BUMP.big * 2)) { try { game.feedcams2?.record?.('crack', by, lost, it.def.name); } catch { /* feedcams2 optional */ } }
  }
  function hostBump(it, from, speed) {
    if (it.holder !== from || !(it.def.fragile > 0) || !(speed >= C.BUMP.minSpeed)) return;
    const now = game.time || 0;
    if (now - (S.bumpAt.get(it.id) ?? -99) < C.BUMP.cooldown * 0.9) return;
    S.bumpAt.set(it.id, now);
    const lost = C.lossOf(it.baseValue || it.value, it.value, C.bumpPct(Math.min(speed, 14), it.def.fragile));
    S.stats.bumps++;
    if (lost > 0) hostBreak(it, lost, from, 'bump');
  }
  function hostGrip(it, from, on) {
    const cur = S.coHost.get(it.id);
    if (!on) { if (cur?.by === from) { S.coHost.delete(it.id); coSync(); } return; }
    if (!it.holder || it.holder.startsWith?.('c:') || !C.canGrip(it.def, it.holder, from, posOf(it.holder), posOf(from))) return;
    const now = game.time || 0;
    if (cur && cur.by !== from && now - cur.t < C.CO.ttl) return;   // one helper per item
    S.coHost.set(it.id, { by: from, t: now });
    if (!cur || cur.by !== from) { S.stats.grips++; coSync(); }
  }
  function coSync() { fx({ k: 'co', l: [...S.coHost].map(([id, e]) => [id, e.by]) }); S.syncT = 0; }

  function hostTick(dt) {
    const now = game.time || 0;
    // two-person grips lapse on their own
    let changed = false;
    for (const [id, e] of [...S.coHost]) {
      const it = game.items?.get?.(id);
      if (!it || !it.holder || now - e.t > C.CO.ttl || !C.canGrip(it.def, it.holder, e.by, posOf(it.holder), posOf(e.by), C.CO.leash + 0.8)) { S.coHost.delete(id); changed = true; }
    }
    S.syncT += dt;
    if (changed || (S.coHost.size && S.syncT > 3)) coSync();
    // throws: caught (somebody else holds it) or landed (cracks)
    for (const [id, th] of [...S.throws]) {
      const it = game.items?.get?.(id);
      th.t += dt;
      if (!it) { S.throws.delete(id); continue; }
      if (it.holder) {
        if (th.t > 0.12 && it.holder !== th.by && !it.holder.startsWith?.('c:')) { S.stats.catches++; fx({ k: 'catch', id, by: it.holder, from: th.by }); try { game.feedcams2?.record?.('catch', th.by, 0, it.def.name); } catch { /* optional */ } }
        if (th.t > 0.12) S.throws.delete(id);
        continue;
      }
      if (it.state !== 'world') { S.throws.delete(id); continue; }
      let spd = 99;
      try { const v = it.body?.linvel?.(); if (v) spd = Math.hypot(v.x, v.y, v.z); } catch { /* body gone */ }
      if ((th.t > C.THROW.settle && spd < C.THROW.rest) || th.t > C.THROW.ttl) {
        S.throws.delete(id);
        S.stats.cracks++;
        const lost = C.lossOf(it.baseValue || it.value, it.value, C.crackPct(it.def.fragile));
        if (lost > 0) hostBreak(it, lost, th.by, 'throw');
      }
    }
  }

  // ---- everyone: effects -------------------------------------------------------------------------------------------------------
  function pop(n) {
    if (typeof document === 'undefined') return;
    const el = document.createElement('div'); el.className = 'cy2-pop'; el.textContent = `-▮${n}`;
    (document.getElementById('ui') || document.body).appendChild(el);
    try { el.animate([{ opacity: 0, transform: 'translate(-50%,10px) scale(.8)' }, { opacity: 1, transform: 'translate(-50%,-8px) scale(1.15)', offset: 0.2 }, { opacity: 0, transform: 'translate(-50%,-52px) scale(1)' }], { duration: 1100, easing: 'ease-out' }); } catch { /* no animations */ }
    setTimeout(() => el.remove(), 1150);
  }
  function onFx(d) {
    if (!d || disposed) return;
    try {
      if (d.k === 'co') {
        const prev = S.co;
        S.co = new Map(Array.isArray(d.l) ? d.l.filter((e) => Array.isArray(e)) : []);
        for (const [id, by] of S.co) {
          if (prev.get(id) === by) continue;
          const it = game.items?.get?.(id), nm = it ? t(it.def.name) : '';
          if (it?.holder === game.selfId) toast(tf('{name} is helping you carry the {item}.', { name: nameOf(by), item: nm }), 'good');
          else if (by === game.selfId) toast(tf('You share the load of the {item}.', { item: nm }), 'good');
        }
        for (const [id, by] of prev) if (!S.co.has(id) && by === game.selfId && S.grip?.id === id) { S.grip = null; toast(t('The grip slips. Back to crawling.'), 'warn'); }
      } else if (d.k === 'throw') {
        S.fly.set(d.id, { by: d.by, t: 0, spd: 9, last: null });
      } else if (d.k === 'brk') {
        const p = Array.isArray(d.p) ? new V3(d.p[0], d.p[1], d.p[2]) : null;
        if (p) { if (d.n >= C.BUMP.big) { snd('glass_break', p, 0.9); snd('item_drop', p, 0.7); } else snd('fragile_crunch', p, 0.7); }   // [sound2] small losses crunch, big ones shatter
        if (d.by === game.selfId) { if (d.n >= C.BUMP.big) pop(d.n); game.engine?.shake?.(Math.min(0.5, 0.15 + d.n / 120)); game.engine?.punch?.(-0.03, 0, (Math.random() - 0.5) * 0.05); }
        if (d.ln >= 0 && C.LINES[d.ln]) game.lore?.say?.(tf(C.LINES[d.ln], { name: nameOf(d.by), n: d.n }), { mood: 'curious' });
      } else if (d.k === 'catch') {
        S.fly.delete(d.id);
        if (d.by === game.selfId) toast(t('Nice catch. Not a crack.'), 'good');
        const it = game.items?.get?.(d.id); if (it) snd('catch_thump', it.obj.position, 0.6);   // [sound2]
      }
    } catch (e) { console.warn('[carry2] fx', e); }
  }

  // ---- local player: feel, bumps, grip -----------------------------------------------------------------------------------------
  const heldOf = (P) => { try { return P.heldItem?.() || null; } catch { return null; } };
  function helperOf() { for (const [id, by] of S.co) if (by === game.selfId && game.items?.get?.(id)) return id; return null; }
  function feelTick(P, dt) {
    const held = heldOf(P), def = held?.def || null;
    let mode = 'none';
    if (held && C.isBulky(def)) mode = S.co.has(held.id) ? 'co' : 'solo';
    else if (helperOf()) mode = 'helper';
    else if (held && C.isHeavy(def)) mode = 'solo';
    const f = C.carryFeel(def, mode);
    P.carryMul = mode === 'co' ? C.coopHolderMul() : f.speed;
    P.carryCancel = mode === 'co';   // localplayer divides the weight penalty out (effective speed = carryMul)
    P.carryTurn = f.turn;
    if (f.sway > 0 && !P.frozen) {   // low-frequency roll / pitch sway, stronger while moving (engine.punch honours reduce motion)
      S.swayT += dt;
      const mv = Math.min(1, Math.max(0.2, (P.hSpeed || 0) / 4)), a = f.sway * mv, w = S.swayT * 2.6;
      game.engine?.punch?.(0.05 * dt * a * Math.cos(w * 0.7), 0, 0.18 * dt * a * Math.sin(w));
      S.creakT = (S.creakT ?? 2) - dt * mv;   // [sound2] a rope / wood creak every few steps while a heavy load swings
      if (S.creakT <= 0 && mv > 0.5) { S.creakT = 2.6 + Math.random() * 2; game.sound2?.cue('carry_creak', null, Math.min(0.6, 0.2 + a * 0.25)); }
    }
    return held;
  }
  function bumpTick(P, held, dt) {
    S.bumpCd = Math.max(0, S.bumpCd - dt);
    const hs = P.hSpeed || 0, prev = S.prevHs;
    S.prevHs = hs;
    if (!held || P.dead || P.mantle || S.bumpCd > 0 || !C.isBump(prev, hs)) return;
    const def = held.def;
    if (!(def.fragile > 0) && !C.isHeavy(def)) return;
    S.bumpCd = C.BUMP.cooldown;
    try { game.audio?.play?.('item_drop', { volume: 0.5 }); } catch { /* audio optional */ }
    game.engine?.punch?.(-0.035, 0, (Math.random() - 0.5) * 0.06);
    if (def.fragile > 0) req({ op: 'bump', id: held.id, s: Math.round(prev * 10) / 10 });
  }
  function gripTick(P, dt) {
    const g = S.grip;
    if (!g) return;
    const it = game.items?.get?.(g.id), hp = it?.holder ? posOf(it.holder) : null;
    const down = !!game.input?.isDown?.('interact');
    if (!it || it.holder !== g.holder || !hp || P.dead || !down || Math.hypot(hp.x - P.pos.x, hp.z - P.pos.z) > C.CO.leash) { req({ op: 'grip', id: g.id, on: 0 }); S.grip = null; return; }
    g.ping -= dt;
    if (g.ping <= 0) { g.ping = C.CO.ping; req({ op: 'grip', id: g.id, on: 1 }); }
  }
  function flyTick(dt) {
    for (const [id, f] of [...S.fly]) {
      const it = game.items?.get?.(id);
      f.t += dt;
      if (!it || it.state !== 'world' || f.t > C.THROW.ttl + 0.5) { S.fly.delete(id); continue; }
      const p = it.obj.position;
      if (f.last) { const s = Math.hypot(p.x - f.last.x, p.y - f.last.y, p.z - f.last.z) / Math.max(dt, 1e-3); f.spd += (s - f.spd) * Math.min(1, dt * 12); }
      f.last = (f.last || new V3()).copy(p);
    }
  }
  function scanBulky() {
    S.bulky = [];
    if (!game.items?.all) return;
    for (const it of game.items.all()) if (it.holder && it.holder !== game.selfId && !it.inv && !String(it.holder).startsWith('c:') && C.isBulky(it.def) && !S.co.has(it.id)) S.bulky.push(it);
  }

  offs.push(mods.on('interactables', (out, g) => {
    if (g !== game || disposed || !onMoon()) return;
    const P = game.player; if (!P || P.dead) return;
    const held = heldOf(P), busy = held && held.def.hands === 2;
    if (!busy && !S.grip) {
      for (const it of S.bulky) {
        const hp = posOf(it.holder);
        if (!hp || it.holder === game.selfId || Math.hypot(hp.x - P.pos.x, hp.z - P.pos.z) > C.CO.reach + 0.6) continue;
        out.push({
          pos: new V3(hp.x, hp.y + 1.1, hp.z), r: 1.3, reach: C.CO.reach, noLos: true,
          label: () => tf('Help carry the {name} [hold E]', { name: t(it.def.name) }), sub: () => t('Two people carry it at near-normal speed.'),
          action: () => { if (!S.grip) { S.grip = { id: it.id, holder: it.holder, ping: 0 }; } },
        });
      }
    }
    if (!busy) {
      for (const [id, f] of S.fly) {
        const it = game.items?.get?.(id);
        if (!it || it.state !== 'world' || f.by === game.selfId || f.spd < C.THROW.minFly || it.obj.position.distanceTo(P.pos) > C.THROW.reach + 1.4) continue;
        out.push({
          pos: it.obj.position.clone(), r: 2.4, reach: C.THROW.reach + 0.4, noLos: true,
          label: () => tf('Catch the {name} [E]', { name: t(it.def.name) }), sub: () => (it.value ? `▮${it.value}` : ''),
          action: () => { if (it.state === 'world') { try { game.pickup(it); } catch (e) { console.warn('[carry2] catch', e); } } },
        });
      }
    }
  }));

  // local throws are reported to the host (wrapped once, restored on dispose)
  const hadDrop = Object.prototype.hasOwnProperty.call(game, 'dropItem'), origDrop = game.dropItem;
  const wrappedDrop = function (it, throwIt, extra) {
    const r = origDrop.call(this, it, throwIt, extra);
    try { if (throwIt && it && C.throwable(it.def)) req({ op: 'throw', id: it.id }); } catch { /* net closing */ }
    return r;
  };
  if (typeof origDrop === 'function') game.dropItem = wrappedDrop;

  // ---- strap between carrier and helper -----------------------------------------------------------------------------------------
  const straps = [];
  const SEG = 8;
  function strapAt(i) {
    if (straps[i]) return straps[i];
    const geo = new THREE.BufferGeometry().setFromPoints(Array.from({ length: SEG + 1 }, () => new V3()));
    const ln = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xf2c230, fog: false }));
    ln.frustumCulled = false; ln.visible = false;
    game.scene?.add(ln);
    return (straps[i] = ln);
  }
  function strapsTick() {
    let i = 0;
    for (const [id, by] of S.co) {
      const it = game.items?.get?.(id), a = it?.holder ? posOf(it.holder) : null, b = posOf(by);
      if (!a || !b || i >= 4) continue;
      const ln = strapAt(i++), pa = ln.geometry.attributes.position;
      for (let k = 0; k <= SEG; k++) {
        const u = k / SEG;
        pa.setXYZ(k, a.x + (b.x - a.x) * u, a.y + 1.0 + (b.y - a.y) * u - Math.sin(u * Math.PI) * 0.35, a.z + (b.z - a.z) * u);
      }
      pa.needsUpdate = true; ln.visible = true;
    }
    for (; i < straps.length; i++) straps[i].visible = false;
  }

  // ---- frame ---------------------------------------------------------------------------------------------------------------------
  offs.push(mods.on('update', (dt, g) => {
    if (g !== game || disposed) return;
    try {
      const P = game.player;
      if (P && !P.dead) {
        const held = feelTick(P, dt);
        bumpTick(P, held, dt); gripTick(P, dt);
      } else if (P) { P.carryMul = 1; P.carryTurn = 1; P.carryCancel = false; S.grip = null; }
      flyTick(dt);
      S.scan -= dt; if (S.scan <= 0) { S.scan = 0.25; scanBulky(); }
      if (S.co.size || straps.length) strapsTick();
      if (host() && onMoon()) hostTick(dt);
    } catch (e) { if (!S.warned) { S.warned = true; console.warn('[carry2] update', e); } }
  }));
  offs.push(mods.on('phase', (ph, g) => {
    if (g && g !== game) return;
    if (ph !== 'moon') { S.co.clear(); S.coHost.clear(); S.fly.clear(); S.throws.clear(); S.grip = null; }
  }));

  return {
    state: S, items: C.ITEM_DEFS.map((d) => d.id), core: C,
    /** debug / tests: local carry multipliers right now */
    feel: () => ({ speed: game.player?.carryMul ?? 1, turn: game.player?.carryTurn ?? 1 }),
    dispose() {
      disposed = true;
      for (const o of offs.splice(0)) { try { o?.(); } catch { /* ignore */ } }
      if (game.dropItem === wrappedDrop) { if (hadDrop) game.dropItem = origDrop; else delete game.dropItem; }
      for (const ln of straps) { ln.removeFromParent(); ln.geometry.dispose(); ln.material.dispose(); }
      straps.length = 0;
      if (game.player) { game.player.carryMul = 1; game.player.carryTurn = 1; game.player.carryCancel = false; }
      style?.remove();
    },
  };
}
