// MAP MODS (wave 8, docs/wave8/mapmods.md): Path-of-Exile-style affixes on every landing + the "Sector Map" currency item.
//   Rules / rolls / effect tables: mapmods_core.js (pure, node-tested). This file is the glue.
//   State: run.mm = { n, nxt: {r, a[]} | null, cur: {r, a[]} | null } (rides broadcastRun / welcome / saves).
//     nxt = the map of the NEXT landing (rolled when the ship reaches orbit, visible on the terminal: ATLAS / MOON)
//     cur = the map of the landing in progress (nxt moves here at the lever, only on real moons: HQ / homeworld keep it)
//   Effects: the numeric ones are merged into run.dailyEvent at the landing (combineEvents vocabulary: danger, clout, scrap count, blackout, elites,
//   bot packs, battery, scan, stamina, value), so HUD / EVENTS / every existing consumer already understands them. The flag ones are two instance wraps on
//   CreatureManager (detectMul, speedMul) and one on ItemManager.onEvent (Volatile: dropped scrap beeps, then pops for <= 22 damage via balance_rules.capOne).
//   Currency: 'sectormap' (store, consumables). Terminal ATLAS / ATLAS REROLL / ATLAS ADD, orbit only, host-authoritative, consumes one map from your hands or the ship.
//   Net: 'mmq' request (client -> host {op}), 'mm' message (host -> client {s, v, err}). No permanent HUD widget: a terminal readout + a landing card that fades.
import { registerItem, ITEMS } from './items.js';
import { MOONS } from './moons.js';
import { wrapMethod, combineEvents } from './dailyEvents.js';
import { capOne } from './balance_rules.js';
import { insideShip } from '../world/ship.js';
import { attentionHot } from '../ui/hud_attention.js';
import { t, tf } from '../core/i18n.js';
import { RNG, hashString } from '../core/rng.js';
import { AFFIX_BY_ID, MAX_AFFIX, RARITY_NAME, rollMap, addAffix, effectsOf, flagsOf, rewardOf, mapTitle, cleanMap } from './mapmods_core.js';
import { pacingMode } from './onboard_core.js';
import { affixCalm } from './headline_core.js';
import './mapmods_i18n.js';
import { HOST_ONLY } from '../net/session.js';
HOST_ONLY.add('mm');   // host -> client text (terminal / chat): a peer must not be able to print into other players' terminals

export const MAP_ITEM = 'sectormap';
const BOOM_DMG = 22, BOOM_R = 3.2, BOOM_FUSE_MS = 1500, BOOM_MAX_PER_DAY = 6;

/** items + model (idempotent: every new Game re-installs the module) */
function registerMapItem() {
  if (!ITEMS[MAP_ITEM]) {
    registerItem({ id: MAP_ITEM, name: 'Sector Map', kind: 'consumable', price: 200, weight: 1, hands: 1, shop: 'consumables', tier: 'uncommon',
      tip: 'Use at the ship terminal: ATLAS REROLL rerolls tomorrow\'s landing, ATLAS ADD adds one affix. Riskier landing, better payout.' });
  }
  const mm = typeof window !== 'undefined' ? window.__kefalMods : null;
  if (mm?.itemModels && !mm.itemModels.has(MAP_ITEM)) {
    mm.itemModels.set(MAP_ITEM, (T) => {
      const THREE = T || window.THREE, g = new THREE.Group();
      const paper = new THREE.MeshLambertMaterial({ color: 0xd8c9a3 }), ink = new THREE.MeshLambertMaterial({ color: 0xb8471f });
      const sheet = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.012, 0.17), paper); g.add(sheet);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.014, 0.03), ink); strip.position.z = -0.07; g.add(strip);
      const x = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.015, 0.012), ink); x.position.set(0.04, 0, 0.02); x.rotation.y = 0.7; g.add(x);
      return g;
    });
  }
}
registerMapItem();

export function installMapmods(game) {
  registerMapItem();
  const mods = game.mods;
  const offs = [], restores = [];
  const S = { disposed: false, chkT: 0, card: null, cardT: 0, boom: 0, boomSeq: 0, flagsKey: '', flags: null };
  const host = () => !!game.isHost;
  const run = () => game.run;
  const q = () => run()?.quotaIndex | 0;
  const realMoon = (id) => { const m = MOONS[id]; return !!m && !m.company && !m.home; };
  const mmOf = () => { const r = run(); if (!r) return null; const m = (r.mm && typeof r.mm === 'object') ? r.mm : (r.mm = { n: 0, nxt: null, cur: null }); m.nxt = cleanMap(m.nxt); m.cur = cleanMap(m.cur); m.n |= 0; return m; };
  const seed = (m) => `${run().runId || 'r'}:${run().day | 0}:${m.n}:${q()}`;

  // ------------------------------------------------------------------ text
  const nameOf = (a) => t(AFFIX_BY_ID[a]?.name || a);
  const rewardText = (ids) => { const w = rewardOf(ids); return [w.qty ? tf('+{n}% loot quantity', { n: w.qty }) : '', w.val ? tf('+{n}% scrap value', { n: w.val }) : ''].filter(Boolean).join(', ') || t('no bonus'); };
  const perAffix = (id) => { const a = AFFIX_BY_ID[id]; const r = []; if (a.rew[0]) r.push(`+${a.rew[0]}% ${t('loot qty')}`); if (a.rew[1]) r.push(`+${a.rew[1]}% ${t('scrap val')}`); return r.join(' '); };
  const mapsInShip = () => { let n = 0; for (const it of game.items?.all?.() || []) if (it.type === MAP_ITEM && (it.holder === game.selfId || (!it.holder && it.state === 'world' && insideShip(it.obj.position)))) n++; return n; };
  /** terminal readout of tomorrow's map (also printed under MOON) */
  function readout() {
    const r = run(), m = r && mmOf(), map = m?.nxt;
    if (!map) return t('SECTOR MAP: not rolled yet (the ship must be in orbit).');
    const moon = MOONS[r.moon];
    const title = mapTitle(moon?.name || '-', map.a, t);
    const out = [`${t('SECTOR MAP')} [${t(RARITY_NAME[map.r])}]  ${t('next landing')}`, `  ${title}`];
    if (!map.a.length) out.push(`  ${t('No affixes. A plain landing.')}`);
    for (const id of map.a) out.push(`  ${AFFIX_BY_ID[id].kind === 'prefix' ? '[-]' : '[~]'} ${nameOf(id)}: ${t(AFFIX_BY_ID[id].desc)} (${perAffix(id)})`);
    out.push(`  ${t('REWARD')}: ${rewardText(map.a)}`);
    out.push(`  ${tf('Sector Maps aboard: {n}. ATLAS REROLL = new roll, ATLAS ADD = one more affix (max {m}).', { n: mapsInShip(), m: MAX_AFFIX })}`);
    return out.join('\n');
  }

  // ------------------------------------------------------------------ host: roll / landing
  function hostRollNext() {
    const m = mmOf(); if (!m) return;
    m.nxt = rollMap(seed(m), q()); m.n++;
    game.broadcastRun?.(['mm']);
  }
  offs.push(mods.on('phase', (ph, g) => {
    if (g && g !== game) return;
    if (host() && ph === 'orbit') { const m = mmOf(); if (m) { m.cur = null; if (!m.nxt) { m.nxt = rollMap(seed(m), q()); m.n++; } game.broadcastRun?.(['mm']); } }
    if (ph === 'moon') { S.boom = 0; showCard(); }
    else if (ph !== 'landing') hideCard();
  }));
  // a resumed / late run may sit in orbit without a map: roll one (cheap poll, host only)
  offs.push(mods.on('update', (dt, g) => {
    if (g && g !== game) return;
    const busy = attentionHot(game);
    if (S.card) S.card.style.visibility = busy ? 'hidden' : '';
    if (!busy && S.wait > 0 && (S.wait -= dt) <= 0) buildCard();
    if (!busy && S.card && (S.cardT -= dt) <= 0) hideCard();
    if (!host() || (S.chkT -= dt) > 0) return;
    S.chkT = 2;
    const r = run(); if (r?.phase === 'orbit' && !mmOf()?.nxt) hostRollNext();
  }));
  /** at the lever: nxt becomes cur and its numbers are merged into the day event (before the phase message, so every peer gets both) */
  /** [trim] would a landing on this run get an affix set? (the fresh-profile calm gates + a weekly challenge, which is its own headline) */
  function mmGate(r) {
    if (game.onboard?.fr?.calm?.('mapmods')) return false;
    const u = game.profile?.unlocks;
    return !affixCalm({ mode: pacingMode(game.profile, r), q: Math.max(u?.q | 0, r?.quotaIndex | 0), quick: !!r?.quick, unlockAll: !!game.settings?.unlockAll });
  }
  const mmAllowed = (r) => realMoon(r.moon) && !r.dailyEvent?.weekly && mmGate(r);
  /** [trim] headline.js: how many affixes the coming landing will carry (rolls the map now if orbit had none; applyLanding reuses it) */
  function plan() {
    const r = run(), m = mmOf(); if (!r || !m || !mmAllowed(r)) return 0;
    if (!m.nxt) { m.nxt = rollMap(seed(m), q()); m.n++; }
    return m.nxt.a.length;
  }
  function applyLanding(extra) {
    const r = run(), m = mmOf(); if (!r || !m) return extra;
    if (!mmAllowed(r)) { m.cur = null; return { ...extra, mm: m }; }   // [firstrun] no sector-map affixes / card before quota 1 (fresh staged profiles: quota 2)
    if (!m.nxt) { m.nxt = rollMap(seed(m), q()); m.n++; }
    m.cur = m.nxt; m.nxt = null;
    const fx = effectsOf(m.cur.a);
    if (!Object.keys(fx).length) return { ...extra, mm: m };
    const base = r.dailyEvent?.weekly ? r.dailyEvent : null;   // [trim] the affix set IS the day's headline: the daily event was already dropped (headline.js), only a weekly challenge stays merged
    const ev = combineEvents(base, [{ ...fx, name: 'Sector Map' }], 'MAP');
    ev.name = base?.name || 'SECTOR MAP'; ev.desc = base?.desc || m.cur.a.map((id) => AFFIX_BY_ID[id]?.name || id).join(', '); if (base?.weekly) ev.weekly = true; else delete ev.weekly;
    ev.mm = m.cur.a.slice();
    r.dailyEvent = ev;
    return { ...extra, dailyEvent: ev, mm: m };
  }
  restores.push(wrapMethod(game, 'hostSetPhase', (orig) => function (phase, extra, ...a) {
    if (phase === 'landing' && !S.disposed) { try { extra = applyLanding(extra || {}); } catch (e) { console.warn('mapmods landing', e); } }
    return orig.call(this, phase, extra, ...a);
  }));
  // announce once the ship is down (same moment as the DAILY EVENT line)
  offs.push(mods.on('phase', (ph, g) => {
    if (g && g !== game) return;
    const cur = host() && ph === 'moon' ? mmOf()?.cur : null;
    if (!cur?.a.length) return;
    sysTitle('SECTOR MAP [{@r}]: {@t} - loot +{q}%, value +{v}%', { r: RARITY_NAME[cur.r], q: rewardOf(cur.a).qty, v: rewardOf(cur.a).val }, cur.r >= 2 ? 'warn' : 'info', MOONS[run().moon]?.name || '', cur.a);
  }));

  // ------------------------------------------------------------------ runtime flags (creature speed / hearing, Volatile scrap)
  const liveFlags = () => {
    const r = run(); if (!r || (r.phase !== 'moon' && r.phase !== 'landing')) return null;
    const cur = r.mm?.cur; if (!cur?.a?.length) return null;
    const key = cur.a.join(',');
    if (S.flagsKey !== key) { S.flagsKey = key; S.flags = flagsOf(cur.a); }
    return S.flags;
  };
  const plain = (c) => !c?.def || c.def.boss || c.def.hazard;
  if (game.creatures) {
    restores.push(wrapMethod(game.creatures, 'detectMul', (orig) => function (c, ...a) {
      let v = orig.call(this, c, ...a);
      const f = liveFlags();
      if (f && !plain(c)) { v *= f.detect; if (c.type === 'listener') v *= f.listen; }
      return v;
    }));
    restores.push(wrapMethod(game.creatures, 'speedMul', (orig) => function (c, speed, ...a) {
      const f = liveFlags();
      if (f && f.spd !== 1 && !plain(c)) speed *= f.spd;      // orig still applies the balance sector scale and the early-sector speed cap
      return orig.call(this, c, speed, ...a);
    }));
  }
  if (game.items) {
    restores.push(wrapMethod(game.items, 'onEvent', (orig) => function (d, ...a) {
      const r = orig.call(this, d, ...a);
      try { if (d?.e === 'drop' && host() && !S.disposed) maybeBoom(d.id); } catch { /* volatile is optional */ }
      return r;
    }));
  }
  function maybeBoom(id) {
    const f = liveFlags(); if (!f || !f.boom || S.boom >= BOOM_MAX_PER_DAY) return;
    const it = game.items.get(id);
    if (!it || !it.def || !['scrap', 'big', 'drop'].includes(it.def.kind) || it.soulbound || it._mmBoom || insideShip(it.obj.position)) return;
    if (!new RNG(hashString(`mmboom:${seed(mmOf())}:${S.boomSeq++}`)).chance(f.boom)) return;
    const ownerFacility=game.world?.facility && Math.abs(it.obj.position.y-game.world.facility.layout.y)<40?game.world.facility:null, ownerDepth=game.run?.descent21?.depth|0;
    const validOwner=()=>game.items.get(it.id)===it && (!ownerFacility || (ownerFacility===game.world?.facility && ownerDepth===(game.run?.descent21?.depth|0)));
    it._mmBoom = true; S.boom++;
    const at = () => [+it.obj.position.x.toFixed(2), +(it.obj.position.y + 0.3).toFixed(2), +it.obj.position.z.toFixed(2)];
    game.net.broadcast('fx', { k: 'snd', s: 'mine_beep', p: at(), v: 0.9, r: 6 });
    game.later(() => { if (!S.disposed && validOwner() && it.state === 'world' && !it.holder) game.net.broadcast('fx', { k: 'snd', s: 'mine_beep', p: at(), v: 1, r: 6 }); }, BOOM_FUSE_MS * 0.5);
    game.later(() => {
      if (S.disposed || !validOwner() || run()?.phase !== 'moon' || it.state !== 'world' || it.holder || insideShip(it.obj.position)) return;   // picked up in time: defused
      game.creatures.blast(it.obj.position.clone(), BOOM_R, capOne(BOOM_DMG, q()), null, 'explosion');
    }, BOOM_FUSE_MS);
  }

  // ------------------------------------------------------------------ device: ATLAS (terminal) -> 'mmq' -> host
  const findMap = (from) => {
    for (const it of game.items.all()) if (it.type === MAP_ITEM && it.holder === from) return it;
    for (const it of game.items.inShipItems()) if (it.type === MAP_ITEM) return it;
    return null;
  };
  function hostUse(d, from) {
    if (!host() || S.disposed) return;
    const op = d?.op;
    const reply = (s, v, err) => game.net.sendTo(from, 'mm', { s, v: v || {}, err: !!err });
    if (op !== 'reroll' && op !== 'add') return;
    const r = run(), m = mmOf();
    if (!r || !m) return;
    if (r.phase !== 'orbit') return reply('The atlas only works while the ship is in orbit.', null, true);
    if (r.daysLeft <= 0 && r.moon !== 'hq') return reply('Deadline reached: there is no next landing to map.', null, true);
    if (!m.nxt) { m.nxt = rollMap(seed(m), q()); m.n++; }
    if (op === 'add' && m.nxt.a.length >= MAX_AFFIX) return reply('This map already carries {n} affixes.', { n: m.nxt.a.length }, true);
    const it = findMap(from);
    if (!it) return reply('You need a Sector Map (store, consumables). Keep it in your hands or in the ship.', null, true);
    game.net.broadcast('it', { e: 'rm', id: it.id });
    const was = m.nxt.a.length;
    m.nxt = op === 'reroll' ? rollMap(seed(m), q()) : addAffix(m.nxt, seed(m), q());
    m.n++;
    game.broadcastRun?.(['mm']);
    const name = game.aiPlayerById?.(from)?.name || game.remotes?.get?.(from)?.name || (from === game.selfId ? game.profile?.name : '') || '?';
    sysTitle(op === 'reroll' ? '{@n} rerolled the next landing: {@t}' : '{@n} added an affix to the next landing: {@t}', { n: name }, 'warn', MOONS[r.moon]?.name || '', m.nxt.a);
    reply('Map updated ({a} affixes, was {b}). Type ATLAS.', { a: m.nxt.a.length, b: was });
  }
  offs.push(mods.on('registerHandlers', (H, g) => { if (g === game) H('mmq', hostUse); }));

  let boundNet = null;
  /** host: chat line whose affix title is built on each receiver, so the affix names come out in their language */
  function sysTitle(key, v, kind, moon, ids) { game.net.broadcast('mm', { s: key, v, sys: kind, moon, ids }); }
  const onMsg = (m) => {
    if (!m?.s) return;
    if (m.sys) { game.ui?.systemMessage?.(tf(m.s, { ...(m.v || {}), t: mapTitle(t(String(m.moon || '')), Array.isArray(m.ids) ? m.ids : [], t) }), m.sys); return; }
    const text = tf(m.s, m.v || {});
    game.terminal?.print?.(text, m.err ? 'err' : '');
    game.ui?.toast?.(text, m.err ? 'bad' : 'good');
  };
  function bindNet(net) { if (!net || boundNet === net) return; boundNet?.off?.('msg:mm', onMsg); boundNet = net; net.on('msg:mm', onMsg); }
  offs.push(mods.on('netReady', (n, g) => { if (g === game) bindNet(n); }));
  if (game.net) bindNet(game.net);

  // terminal: ATLAS [REROLL|ADD]; MOON also prints tomorrow's map
  const help = 'ATLAS  tomorrow\'s Sector Map affixes (REROLL / ADD use one Sector Map)';
  const atlas = (rest, term, g) => {
    const op = (rest[0] || '').toLowerCase();
    if (op === 'reroll' || op === 'add') { g.net.request('mmq', { op }); return; }
    term.print(readout());
  };
  if (mods.commands?.set) { mods.commands.set('atlas', { fn: atlas, help, owner: null }); mods.commands.set('affix', { fn: atlas, help, owner: null }); }
  // [lanes] MOONS no longer appends the SECTOR MAP readout (it doubled the terminal wall); the ATLAS command prints it.
  // holding the map: point at the terminal
  offs.push(mods.on('useItem', (it, hk) => {
    if (it?.type !== MAP_ITEM || hk.handled) return;
    hk.handled = true;
    game.ui?.toast?.(t('Use it at the ship terminal: ATLAS REROLL or ATLAS ADD.'), 'info');
  }));

  // ------------------------------------------------------------------ landing card (fades by itself; no permanent HUD)
  function ensureCss() {
    if (typeof document === 'undefined' || document.getElementById('mm-css')) return;
    const s = document.createElement('style'); s.id = 'mm-css';
    s.textContent = `.mm-card{position:fixed;left:50%;top:84px;transform:translateX(-50%);z-index:60;width:min(420px,86vw);padding:8px 12px 10px;pointer-events:none;
      background:rgba(12,9,6,.94);border:1px solid var(--t-line-hi,rgba(255,150,70,.58));box-shadow:0 0 0 1px #000;color:var(--t-paper,#ffd9b8);font-family:var(--font2,sans-serif);text-transform:uppercase;letter-spacing:.06em;transition:opacity .6s}
      .mm-card.out{opacity:0}
      .mm-card .mm-h{display:flex;gap:8px;align-items:center;margin-bottom:5px;font-size:13px}
      .mm-card .mm-t{font-size:17px;line-height:1.15;margin:2px 0 6px;text-wrap:balance;overflow-wrap:anywhere;color:var(--t-amber-hi,#ffb266)}
      .mm-card .mm-r{display:flex;justify-content:space-between;align-items:baseline;gap:10px;font-size:13px;line-height:1.35;overflow-wrap:anywhere;border-top:1px solid var(--t-line,rgba(255,150,70,.26));padding-top:2px}
      .mm-card .mm-r b{font-weight:700;color:var(--t-paper,#ffd9b8)}.mm-card .mm-r i{font-style:normal;color:var(--t-good,#7dff7d);white-space:nowrap}
      .mm-card .mm-f{margin-top:6px;font-size:12px;color:var(--t-clout,#ffd23f)}
      .mm-card.rare .mm-t{color:var(--t-warn,#ffc233)}`;
    document.head.appendChild(s);
  }
  function showCard() {
    if (typeof document === 'undefined') return;
    const r = run(), cur = r?.mm?.cur;
    hideCard();
    if (!cur?.a?.length || !realMoon(r.moon)) return;
    S.wait = (game.onboard?.fr?.slot?.(6) || 0) / 1000;   // [qa] arrival cards queue (firstrun slot): wait for the ones that came first
    if (S.wait > 0.08) return;
    S.wait = 0; buildCard();
  }
  function buildCard() {
    const r = run(), cur = r?.mm?.cur;
    S.wait = 0;
    if (attentionHot(game)) { S.wait = 0.1; return; }
    if (!cur?.a?.length || !realMoon(r?.moon)) return;
    ensureCss();
    const el = document.createElement('div');
    el.className = 'mm-card tfg-card' + (cur.r >= 2 ? ' rare' : '');
    const head = document.createElement('div'); head.className = 'mm-h';
    const plate = document.createElement('span'); plate.className = 'tfg-plate'; plate.textContent = t('SECTOR MAP');
    const tag = document.createElement('span'); tag.className = 'tfg-tag'; tag.textContent = t(RARITY_NAME[cur.r]);
    head.append(plate, tag);
    const title = document.createElement('div'); title.className = 'mm-t'; title.textContent = mapTitle(MOONS[r.moon]?.short || MOONS[r.moon]?.name || '', cur.a, t);
    el.append(head, title);
    for (const id of cur.a) {
      const row = document.createElement('div'); row.className = 'mm-r';
      const b = document.createElement('span'); const bn = document.createElement('b'); bn.textContent = nameOf(id) + ':'; b.append(bn, ' ' + t(AFFIX_BY_ID[id].desc));
      const rw = document.createElement('i'); rw.textContent = perAffix(id);
      row.append(b, rw); el.append(row);
    }
    const foot = document.createElement('div'); foot.className = 'mm-f'; foot.textContent = `${t('REWARD')}: ${rewardText(cur.a)}`;
    const strip = document.createElement('div'); strip.className = 'tfg-hazard'; strip.style.marginTop = '6px';
    el.append(foot, strip);
    document.body.appendChild(el);
    S.card = el; S.cardT = 6;
  }
  function hideCard() {
    S.wait = 0;
    const el = S.card; S.card = null;
    if (!el) return;
    el.classList.add('out');
    setTimeout(() => el.remove(), 700);
  }

  return {
    ensure: mmOf, plan, allowed: () => mmGate(run()), readout, rollNext: hostRollNext, hostUse, apply: applyLanding, flags: liveFlags,
    state: () => run()?.mm || null,
    dispose() {
      if (S.disposed) return;
      S.disposed = true;
      for (const o of offs) { try { o?.(); } catch { /* ignore */ } }
      for (const rs of restores) { try { rs(); } catch { /* ignore */ } }
      try { mods.commands?.delete?.('atlas'); mods.commands?.delete?.('affix'); } catch { /* ignore */ }
      boundNet?.off?.('msg:mm', onMsg);
      if (S.card) { S.card.remove(); S.card = null; }
    },
  };
}
