// RESTO (wave 8): "TFG ALIEN DINER" - a Roblox-style restaurant tycoon on the homeworld (docs/wave8/resto.md).
// Loop: walk onto glowing BUY PADS to grow the diner piece by piece -> alien shuttles land, guests queue, sit and order (taste rules per species) -> the crew cooks
// (stove station minigame, 3-6 s), carries the plate to the table (real item), takes payment, clears tables -> credits + reputation (stars 1-5). Stars unlock bigger
// menus, staff robots (chef / waiter / cashier automation) and the weekly Algorithm Food Festival. PURPOSE: the good dishes need moon-only ingredients
// (Moonpetal outdoors, Ember Pepper / Glow Spore / Void Truffle in facilities) and passive + active income is CAPPED per game day, so the crew must keep flying runs.
// Dirt draws pests (swat them) and the Health Inspector; dirty diners lose stock while you are away.
// Net (prefix 'rs'): rsreq client -> host {op,...}; rsx host -> all {snapshot of the live sim, 4 Hz}; rsmsg host -> client {k}. State: profile.resto (host) = run.rs (synced).
// Host-authoritative: the host owns the sim, the pantry, credits, item spawns; clients render, interpolate and send requests.
import * as THREE from 'three';
import { t, tf, tIn, addTranslations } from '../core/i18n.js';
import { hashString, RNG } from '../core/rng.js';
import { MOONS } from './moons.js';
import { ITEMS, registerItem } from './items.js';
import { HOST_ONLY } from '../net/session.js';
import { G } from '../physics/physics.js';
import { MINIGAMES } from '../minigames/index.js';
import { createRestoPan } from '../minigames/resto_pan.js';
import { INGREDIENTS } from './survival_data.js';
import { VIEW_GAIN } from './algo1_core.js';
import { HOME_Y } from '../world/homeworld_map.js';
import * as C from './resto_core.js';
import * as V from '../world/resto_view.js';
import { TR, RU } from './resto_i18n.js';
import { createRestoPanel } from '../ui/panels/resto.js';

HOST_ONLY.add('rsx'); HOST_ONLY.add('rsmsg');
const fresh = (map, l) => Object.fromEntries(Object.entries(map).filter(([k]) => tIn(l, k) === k));   // never override another module's entry
addTranslations(fresh(TR, 'tr'), 'tr'); addTranslations(fresh(RU, 'ru'), 'ru');
MINIGAMES.rs_pan = MINIGAMES.rs_pan || createRestoPan;
VIEW_GAIN.review = VIEW_GAIN.review ?? 0.3;

// ---- items: 4 moon-only ingredients (also usable in the normal cooking pot) + one plate item per dish
for (const [id, d] of Object.entries(C.NEW_ING)) {
  if (!ITEMS[id]) registerItem({ id, name: d.name, kind: 'consumable', weight: 0.3, noEat: true, tip: d.tip });
  INGREDIENTS[id] = INGREDIENTS[id] || { cat: d.cat, heal: d.heal, nutri: d.nutri, props: { ...d.props }, meat: false };
}
for (const d of C.DISHES) { const id = C.dishItem(d.id); if (!ITEMS[id]) registerItem({ id, name: d.name, kind: 'consumable', weight: 1, noEat: true, tip: 'Alien Diner plate. Carry it to the guest who ordered it (E at their table). Its tier is its quality.' }); }
const ING = INGREDIENTS;
const QIDX = (tier) => { const i = C.QTIER.indexOf(tier); return i < 0 ? 2 : i; };

const CSS = `.rs-hint{position:fixed;left:50%;bottom:118px;transform:translateX(-50%);z-index:30;font:20px var(--font,'VT323',monospace);color:#ffe9c8;background:rgba(10,6,12,.86);border:1px solid #ff4fd8;padding:3px 12px;pointer-events:none}`;
const easeOutBack = (x) => { const c1 = 1.70158, c3 = c1 + 1, k = Math.min(1, Math.max(0, x)) - 1; return 1 + c3 * k * k * k + c1 * k * k; };

export function installResto(game) {
  const mods = game.mods, offs = [];
  let disposed = false, boundNet = null, panel = null, hintEl = null;
  const host = () => !!game.isHost;
  const me = () => game.selfId;
  const S = () => { const s = game.run?.rs; return s && Array.isArray(s.b) ? s : BLANK; };
  const BLANK = C.blank();
  let migRs = false;   // this peer became host mid-run (hostmig): the crew's diner lives in run.rs, NOT in this player's own profile.resto
  const st = () => (migRs ? game.run.rs : game.profile.resto);
  const onHome = () => !!(MOONS[game.run?.moon]?.home && !MOONS[game.run?.moon]?.ghost && game.run?.phase === 'moon' && game.world?.outdoor?.home);
  const posOf = (id) => (id === me() ? game.player.pos : game.remotes.get(id)?.pos) || null;
  const near = (from, x, z, r) => { const q = posOf(from); return !!q && Math.hypot(q.x - x, q.z - z) <= r; };
  const say = (to, m) => (to ? game.net.sendTo(to, 'rsmsg', m) : game.net.broadcast('rsmsg', m));
  const err = (to, why) => say(to, { k: 'err', why });
  if (typeof document !== 'undefined' && !document.getElementById('tfg-rs-css')) { const s = document.createElement('style'); s.id = 'tfg-rs-css'; s.textContent = CSS; document.head.appendChild(s); }

  // ------------------------------------------------------------------------------------------ item models (plates, ingredients)
  function registerModels() {
    const mm = typeof window !== 'undefined' ? window.__kefalMods : null;
    if (!mm?.itemModels) return;
    for (const d of C.DISHES) if (!mm.itemModels.has(C.dishItem(d.id))) mm.itemModels.set(C.dishItem(d.id), () => V.plateModel(d.id));
    for (const [id, d] of Object.entries(C.NEW_ING)) if (!mm.itemModels.has(id)) mm.itemModels.set(id, () => V.ingredientModel(d.color, d.cat));
  }
  registerModels();

  // ================================================================================================ HOST
  const sim = C.newSim();
  let snapT = 0, slowT
    = 0, lastReq = new Map(), hostWasHome = false, rid = 0;
  function commit(extra = []) {
    if (!host()) return;
    game.run.rs = st();
    try { game.broadcastRun(['rs', ...extra]); game.progress?.save?.(); } catch (e) { console.warn('[rs] commit', e); }
  }
  function attach() {
    const p = game.profile;
    p.resto = C.sanitize(p.resto);
    game.run.rs = p.resto;
    C.daysSince(p.resto, game.run.runId || '', game.run.day || 0);   // mark only: a loaded / new run never pays retroactively
  }
  const day = () => game.run?.day || 0;
  const wallet = () => ({ cr: game.run.credits });
  const cloutAll = (n, reason) => { if (n > 0) for (const p of game.aiPlayers?.() || []) game.net.broadcast('xp', { to: p.id, xp: 0, coin: n, reason }); };
  const heldBy = (id, from) => { const it = game.items.get(String(id)); return it && it.holder === from && it.state !== 'dead' ? it : null; };
  const rmItem = (it) => game.net.broadcast('it', { e: 'rm', id: it.id });
  const stars = () => C.starsOf(st());
  function envOf() {
    const s = st();
    return { s, rnd: Math.random, open: s.open, menu: C.cookable(s.pantry, C.starsOf(s), ING), ing: ING, autoOrder: C.has(s, 'waiterbot'), cashbot: C.has(s, 'cashbot'), day: day() };
  }
  const pieceAt = (id) => { const p = C.PIECE[id]; return p ? { x: p.at[0], z: p.at[1] } : null; };
  const cust = (id) => sim.cust.find((c) => c.id === id);

  function pay(c, by, full = true) {
    const s = st(), sp = C.SPECIES[c.sp], stars0 = C.starsOf(s);
    let amt = C.payOf(c.dish, c.sp, c.q, c.servedPat ?? 0.5, stars0);
    if (!full) amt = Math.max(1, Math.round(amt * C.PAY_AUTO_MUL));
    const paid = C.capPay(s, day(), amt);
    game.run.credits += paid; s.st.earned += paid;
    let extra = '';
    if (sp.pay === 'scrap') {
      const pool = C.SCRAP_POOL.filter((id) => ITEMS[id]), n = C.scrapCount(C.DISH[c.dish].price, c.q);
      for (let i = 0; i < n && pool.length; i++) game.items.hostSpawn(pool[Math.floor(Math.random() * pool.length)], new THREE.Vector3(C.PAY_SPOT.x - 0.4 + Math.random() * 0.8, HOME_Y + 1.3, C.PAY_SPOT.z - 0.9), {});
      extra = `+${n}|scrap`;
    } else if (sp.pay === 'clout') { cloutAll(2, 'Alien Diner'); extra = '+2|clout'; }
    if (c.sp === 'critic') {
      s.st.reviews += 1;
      if (c.q >= 3) { C.addRep(s, C.ECON.repRave); s.st.raves += 1; cloutAll(6, 'Algorithm review'); try { game.algo1?.bump?.('review', 'review'); } catch { /* optional */ } say(null, { k: 'banner', main: 'ALGORITHM REVIEW: 5 STARS', sub: 'Viewers are flooding in.' }); }
      else if (c.q >= 2) { C.addRep(s, 2); try { game.algo1?.bump?.('review', 'review'); } catch { /* optional */ } say(null, { k: 'banner', main: 'ALGORITHM REVIEW: 3 STARS', sub: 'Decent. The critic nods.' }); }
      else { C.addRep(s, C.ECON.repPan); say(null, { k: 'banner', main: 'ALGORITHM REVIEW: PAN', sub: 'The critic is not amused.' }); }
    }
    say(null, { k: 'pay', amt: paid, x: C.PAY_SPOT.x, z: C.PAY_SPOT.z, by: by || 0, extra });
    commit(['credits']);
  }
  function onServed(c) {
    const s = st(), before = C.starsOf(s);
    s.st.served += 1;
    C.addRep(s, c.q >= 3 ? C.ECON.repHappy + C.ECON.repPerfect : c.q >= 2 ? C.ECON.repHappy : c.q === 0 ? -1 : 0);
    if (C.contractServe(s, c.q)) {
      const ct = s.ct; game.run.credits += ct.reward; s.ct = null; s.ctAt = day(); s.ctDone += 1; cloutAll(C.ECON.contractClout, 'Food Festival');
      try { game.algo1?.bump?.('review', 'festival'); } catch { /* optional */ }
      say(null, { k: 'banner', main: 'FOOD FESTIVAL COMPLETE', sub: '+{r} credits, +{c} Followers each', v: { r: ct.reward, c: C.ECON.contractClout } });
      commit(['credits']); return;
    }
    if (C.starsOf(s) > before) say(null, { k: 'banner', main: 'DINER: {n} STARS', v: { n: C.starsOf(s) }, sub: 'New menu and pieces unlocked.' });
    commit();
  }
  function handleEvents(evs) {
    const s = st();
    for (const e of evs) {
      if (e.k === 'angry') { s.st.angry += 1; C.addRep(s, C.ECON.repAngry); say(null, { k: 'angry', x: e.c.x, z: e.c.z, why: e.why }); commit(); }
      else if (e.k === 'nofood') say(null, { k: 'nofood', x: e.c.x, z: e.c.z });
      else if (e.k === 'pay') pay(e.c, 0, !!e.full);
      else if (e.k === 'inspect') {
        s.inspAt = day();
        const cl = e.clean, r = cl >= C.ECON.cleanPass ? 'pass' : cl >= C.ECON.cleanFail ? 'warn' : 'fail';
        if (r === 'pass') { const b = 80 + 40 * stars(); game.run.credits += b; C.addRep(s, C.ECON.repInspectPass); say(null, { k: 'banner', main: 'INSPECTION PASSED', sub: 'Spotless: +{b} credits.', v: { b } }); }
        else if (r === 'warn') { C.addRep(s, C.ECON.repInspectWarn); say(null, { k: 'banner', main: 'INSPECTION: WARNING', sub: 'Clean up before the next visit.' }); }
        else { const f = Math.min(game.run.credits, 60 + 30 * stars()); game.run.credits -= f; C.addRep(s, C.ECON.repInspectFail); say(null, { k: 'banner', main: 'INSPECTION FAILED', sub: 'Fined {f} credits. Kill the pests, clear the tables.', v: { f } }); }
        commit(['credits']);
      } else if (e.k === 'pest') say(null, { k: 'pest' });
      else if (e.k === 'pestEat') {
        const types = Object.keys(s.pantry).filter((k) => s.pantry[k] > 0);
        if (types.length) { const k = types[Math.floor(Math.random() * types.length)]; s.pantry[k] -= 1; if (s.pantry[k] <= 0) delete s.pantry[k]; commit(); }
      } else if (e.k === 'land') say(null, { k: 'land' });
    }
  }
  function spawnPlate(dishId, q) {
    const id = game.items.hostSpawn(C.dishItem(dishId), new THREE.Vector3(C.PASS.x - 1.5 + Math.random() * 3, HOME_Y + C.PASS.y + 0.15, C.PASS.z), { tier: C.QTIER[q] });
    return id;
  }
  function botTick(dt) {
    const s = st();
    if (C.has(s, 'chefbot')) {
      for (const stv of C.STOVE_IDS.filter((x) => C.has(s, x))) {
        const cid = sim.cooks[stv], c = cid && cust(cid);
        if (c && c.cookBy === 0) {
          const d = C.DISH[c.dish];
          if (sim.t - c.cookT >= d.dur * 1.5) {
            const q = Math.random() < 0.2 ? 3 : 2, pid = spawnPlate(c.dish, q); c.plateQ = q; c.readyT = sim.t; C.finishCook(sim, c.id, pid);
          }
        } else if (!cid) {
          const tk = C.nextTicket(sim);
          if (tk) { const take = C.planTake(s.pantry, C.DISH[tk.dish], ING); if (take && C.startCook(sim, tk.id, stv, 0).ok) { for (const ty of take) { s.pantry[ty] -= 1; if (s.pantry[ty] <= 0) delete s.pantry[ty]; } tk.cookIng = take; commit(); } }
        }
      }
    }
    if (C.has(s, 'waiterbot')) {
      sim.botT.waiter += dt;
      if (sim.botT.waiter >= 2.5) {
        sim.botT.waiter = 0;
        const c = sim.cust.filter((x) => x.st === 'wait' && x.stage === 'ready').sort((a, b) => a.id - b.id)[0];
        const it = c && game.items.get(c.plate);
        if (c && it && !it.holder) { const q = QIDX(it.tier); rmItem(it); const r = C.serve(sim, c.id, c.dish, q); if (r.ok) onServed(r.c); }
        else if (c && !it && sim.t - (c.readyT || 0) > 6) c.stage = 'open';   // plate vanished: cook it again
        else {
          const dt2 = [...C.dirtyTables(sim)][0];
          if (dt2) { C.clearTable(sim, dt2); commit(); }
        }
      }
    }
  }
  function hostTick(dt) {
    const s = st();
    if (!s) return;
    // ---- game-day rollover: passive income, contract offers / expiry, pests eat while you were away, inspector due (works wherever the crew is)
    const n = C.daysSince(s, game.run.runId || '', day());
    if (n > 0) {
      const got = C.accrue(s, n);
      if (C.contractExpired(s, day())) { s.ct = null; s.ctAt = day(); say(null, { k: 'toast', text: 'The Food Festival ended without you.', bad: true }); }
      if (C.dirtyTables(sim).size >= 2 || sim.pests.length) { for (const k of Object.keys(s.pantry)) { s.pantry[k] = Math.max(0, s.pantry[k] - Math.ceil(s.pantry[k] * 0.3)); if (!s.pantry[k]) delete s.pantry[k]; } say(null, { k: 'toast', text: 'Pests raided the diner while you were away.', bad: true }); }
      if (got > 0) say(null, { k: 'toast', text: 'The diner earned {n} credits while you were away (see the register).', v: { n: Math.round(got) } });
      commit();
    }
    slowT -= dt;
    if (slowT <= 0) {
      slowT = 4;
      if (C.offerContract(s, day())) { say(null, { k: 'banner', main: 'ALGORITHM FOOD FESTIVAL', sub: 'A contract is waiting in the diner panel.' }); commit(); }
      if (C.has(s, 'floor') && day() - s.inspAt >= C.ECON.inspectEvery) sim.inspDue = true;
    }
    const home = onHome();
    if (!home) { if (hostWasHome) { sim.cust.length = 0; sim.shuttle = { st: 'away', t: 0 }; sim.cooks = {}; sim.arriveT = 10; broadcastSnap(true); } hostWasHome = false; return; }
    hostWasHome = true;
    const env = envOf();
    handleEvents(C.tick(sim, Math.min(dt, 0.1), env));
    botTick(dt);
    snapT -= dt; if (snapT <= 0) { snapT = 0.25; broadcastSnap(false); }
  }
  let lastEmpty = false;
  function broadcastSnap(force) {
    const empty = !sim.cust.length && !sim.pests.length && sim.shuttle.st === 'away' && !Object.keys(sim.dirty).length;
    if (empty && lastEmpty && !force) return;
    lastEmpty = empty;
    game.net.broadcast('rsx', C.snapshot(sim, st()));
  }

  // ---- requests
  function hostReq(d, from) {
    if (!host() || !d || typeof d.op !== 'string') return;
    if (!onHome()) return err(from, 'You must be on the homeworld.');
    const nowT = game.time || 0; if (nowT - (lastReq.get(from) || 0) < 0.08) return; lastReq.set(from, nowT);
    const s = st(), i = (v) => Math.floor(Number(v) || 0);
    switch (d.op) {
      case 'buy': {
        const p = C.PIECE[String(d.id)]; if (!p) return;
        const pd = C.padOf(p); if (!near(from, pd[0], pd[1], 2.4)) return err(from, 'Stand on the glowing pad.');
        const w = wallet(), r = C.tryBuy(s, w, p.id);
        if (!r.ok) return err(from, r.why);
        game.run.credits = w.cr; commit(['credits']); say(null, { k: 'built', id: p.id, by: from });
        return;
      }
      case 'dep': {
        const fr = C.PIECE.fridge; if (!C.has(s, 'fridge') || !near(from, fr.at[0], fr.at[1], 4)) return err(from, 'Get closer to the fridge.');
        let n = 0, skipped = 0;
        for (const it of [...game.items.all()]) {
          if (n >= 30) break;
          if (it.holder !== from || it.inv?.k === 'eq' || !ING[it.type]) continue;
          if ((s.pantry[it.type] || 0) >= C.MAX_PANTRY_TYPE || C.pantryTotal(s.pantry) >= C.MAX_PANTRY) { skipped++; continue; }
          s.pantry[it.type] = (s.pantry[it.type] || 0) + 1; rmItem(it); n++;
        }
        if (!n) return err(from, skipped ? 'The fridge is full.' : 'Hold ingredients (produce, meat, fish) to stock the fridge.');
        commit(); say(from, { k: 'dep', n }); return;
      }
      case 'ord': {
        const c = cust(i(d.cid)); if (!c || !near(from, c.x, c.z, 3.4)) return err(from, 'Get closer to the table.');
        const r = C.takeOrder(sim, c.id); if (!r.ok) return err(from, r.why);
        game.net.broadcast('xp', { to: from, xp: 1, reason: 'Waiter' }); return;
      }
      case 'cook': {
        const stv = String(d.stove), p = C.PIECE[stv];
        if (!p || p.kind !== 'stove' || !C.has(s, stv) || !near(from, p.at[0], p.at[1], 3.2)) return err(from, 'Get closer to the stove.');
        const c = cust(i(d.cid)) || C.nextTicket(sim);
        if (!c || c.st !== 'wait' || c.stage !== 'open') return err(from, 'No open orders.');
        const take = C.planTake(s.pantry, C.DISH[c.dish], ING); if (!take) return err(from, 'Missing ingredients. Stock the fridge.');
        const r = C.startCook(sim, c.id, stv, from); if (!r.ok) return err(from, r.why);
        for (const ty of take) { s.pantry[ty] -= 1; if (s.pantry[ty] <= 0) delete s.pantry[ty]; }
        c.cookIng = take; commit();
        say(from, { k: 'cookok', cid: c.id, dish: c.dish, dur: C.DISH[c.dish].dur }); return;
      }
      case 'cancel': {
        const c = cust(i(d.cid)); if (!c || c.cookBy !== from || c.stage !== 'cooking') return;
        for (const ty of c.cookIng || []) s.pantry[ty] = Math.min(C.MAX_PANTRY_TYPE, (s.pantry[ty] || 0) + 1);
        C.cancelCook(sim, c.id); commit(); return;
      }
      case 'fin': {
        const c = cust(i(d.cid)); if (!c || c.cookBy !== from || c.stage !== 'cooking') return;
        const dish = C.DISH[c.dish], q = C.clampQuality(i(d.q), sim.t - c.cookT, dish.dur), pid = spawnPlate(c.dish, q);
        c.plateQ = q; c.readyT = sim.t; C.finishCook(sim, c.id, pid);
        game.net.broadcast('xp', { to: from, xp: [1, 2, 4, 8][q], reason: 'Chef' });
        say(null, { k: 'cooked', x: C.PASS.x, z: C.PASS.z, q }); return;
      }
      case 'serve': {
        const c = cust(i(d.cid)); if (!c || !near(from, c.x, c.z, 3.6)) return err(from, 'Get closer to the table.');
        const it = heldBy(d.it, from), dish = it && C.dishOfItem(it.type);
        if (!it || !dish) return err(from, 'Hold the plate to serve it.');
        const r = C.serve(sim, c.id, dish, QIDX(it.tier));
        if (!r.ok) { if (r.wrong) c.pat = Math.max(0, c.pat - 0.15); return err(from, r.why); }
        rmItem(it); game.net.broadcast('xp', { to: from, xp: 2, reason: 'Waiter' }); onServed(r.c); return;
      }
      case 'clr': {
        const tb = C.PIECE[String(d.table)]; if (!tb || !near(from, tb.at[0], tb.at[1], 3.4)) return err(from, 'Get closer to the table.');
        if (C.clearTable(sim, tb.id)) { commit(); game.net.broadcast('xp', { to: from, xp: 1, reason: 'Busser' }); } return;
      }
      case 'swat': {
        const p = sim.pests.find((x) => x.id === i(d.pid)); if (!p || !near(from, p.x, p.z, 2.6)) return;
        C.swat(sim, p.id); say(null, { k: 'swat', x: p.x, z: p.z }); game.net.broadcast('xp', { to: from, xp: 2, reason: 'Pest control' }); return;
      }
      case 'pay': {
        if (!near(from, C.PAY_SPOT.x, C.PAY_SPOT.z, 4.5)) return err(from, 'Get closer to the register.');
        const c = cust(i(d.cid)) || sim.cust.find((x) => x.st === 'pay');
        const r = C.collectPay(sim, c?.id); if (!r.ok) return err(from, r.why);
        pay(r.c, from, true); return;
      }
      case 'till': {
        const cp = C.PIECE.counter; if (!C.has(s, 'counter') || !near(from, cp.at[0], cp.at[1], 4)) return err(from, 'Get closer to the register.');
        const n = Math.floor(s.till); if (n < 1) return err(from, 'The till is empty.');
        s.till -= n; game.run.credits += n; s.st.earned += n; commit(['credits']); say(from, { k: 'till', n }); return;
      }
      case 'open': s.open = !!d.on; commit(); return;
      case 'ct': { if (s.ct && !s.ct.on && d.on) { s.ct.on = true; commit(); say(null, { k: 'toast', text: 'Food Festival accepted: serve {n} good dishes before day {d}.', v: { n: s.ct.need, d: s.ct.by } }); } return; }
    }
  }

  // ---- moon ingredients: host seeds pickups on every real moon landing (outdoor flowers, facility spices / spores / a rare truffle)
  function seedIngredients() {
    if (!host() || !game.run || MOONS[game.run.moon]?.home) return;
    const key = `${game.run.runId}|${game.run.day}|${game.run.moon}|${game.run.quotaIndex}`;
    const rng = new RNG((hashString(key) ^ 0x7e57d1) >>> 0), W = game.world, fac = W?.facility, out = W?.outdoor;
    const put = (type, s, dy = 0.5) => { if (ITEMS[type] && s) game.items.hostSpawn(type, new THREE.Vector3(s.x, s.y + dy, s.z), {}); };
    const outs = rng.shuffle([...(out?.outdoorScrapSpots || [])]);
    for (let i = 0; i < Math.min(outs.length, rng.int(1, 3)); i++) put('rs_moonpetal', outs[i], 0.4);
    const spots = rng.shuffle([...(fac?.scrapSpots || [])].filter((sp) => !sp.elevated));
    let k = 0;
    for (let i = 0; i < rng.int(1, 2) && k < spots.length; i++) put('rs_ember_pepper', spots[k++]);
    for (let i = 0; i < rng.int(1, 2) && k < spots.length; i++) put('rs_glow_spore', spots[k++]);
    if (k < spots.length && rng.chance(0.16 + Math.min(0.2, (game.run.quotaIndex || 0) * 0.02))) { const deep = spots.filter((sp) => (sp.dist || 0) >= 6); put('rs_void_truffle', deep.length ? deep[deep.length - 1] : spots[k]); }
  }

  // ================================================================================================ CLIENT: views
  const V0 = { root: null, marker: null, pieces: new Map(), colliders: new Map(), pops: new Map(), pads: new Map(), cust: new Map(), pests: new Map(), bots: new Map(), shuttle: null, first: true, padSig: '', stand: 0, standId: '', reqAt: 0 };
  let snap = { sh: [0, 0], c: [], p: [], d: [], cl: 100, ck: [] }, snapCust = [];
  const dispView = (grp) => { if (!grp) return; for (const g of grp.userData?.geos || []) g.dispose?.(); for (const m of grp.userData?.mats || []) m.dispose?.(); grp.removeFromParent(); };
  function ensureRoot() {
    if (V0.root) return V0.root;
    V0.root = new THREE.Group(); V0.root.name = 'resto'; V0.root.position.y = HOME_Y; game.scene.add(V0.root);
    V0.marker = V.buildMarker(); V0.root.add(V0.marker);
    return V0.root;
  }
  function clearViews() {
    if (!V0.root && !V0.pieces.size) return;
    for (const g of V0.pieces.values()) dispView(g);
    for (const g of V0.pads.values()) dispView(g.grp);
    for (const g of V0.bots.values()) dispView(g);
    for (const v of V0.cust.values()) dropCust(v);
    for (const v of V0.pests.values()) dispView(v);
    for (const cols of V0.colliders.values()) for (const c of cols) { try { game.physics.removeCollider(c); } catch { /* gone */ } }
    dispView(V0.shuttle); dispView(V0.marker);
    V0.pieces.clear(); V0.pads.clear(); V0.bots.clear(); V0.cust.clear(); V0.pests.clear(); V0.colliders.clear(); V0.pops.clear(); V0.shuttle = null; V0.marker = null; V0.first = true; V0.padSig = '';
    V0.root?.removeFromParent(); V0.root = null;
    V.disposeBubbles(); V.disposeCustomers();
  }
  function syncPieces() {
    const s = S(), root = ensureRoot(), built = new Set(s.b);
    for (const id of s.b) {
      if (V0.pieces.has(id)) continue;
      const p = C.PIECE[id], grp = V.buildPiece(id); if (!grp) continue;
      if (p.kind !== 'floor') grp.position.set(p.at[0], 0, p.at[1]);
      const rot = p.kind === 'stove' || p.kind === 'fridge' ? Math.PI : 0; grp.rotation.y = rot;   // kitchen gear faces the pass (north), the door faces south
      root.add(grp); V0.pieces.set(id, grp);
      const cols = []; for (const [x, y, z, hx, hy, hz] of V.piecePads(id)) cols.push(game.physics.addStaticBox(x, HOME_Y + y, z, hx, hy, hz, 0, G.STATIC, { kind: 'prop' })); V0.colliders.set(id, cols);
      if (!V0.first) {
        V0.pops.set(id, { t: 0, grp, floor: p.kind === 'floor' }); grp.scale.setScalar(0.01);
        const at = new THREE.Vector3(p.at[0], HOME_Y + 0.4, p.at[1]);
        game.particles?.burst?.(at, 'dust'); game.particles?.burst?.(at.clone().setY(HOME_Y + 1.2), 'sparks');
        game.audio?.play?.('ui_buy', { volume: 0.7, bus: 'ui' });
      }
      if (p.kind === 'bot') V0.bots.set(id, grp);
    }
    for (const [id, grp] of [...V0.pieces]) if (!built.has(id)) { dispView(grp); V0.pieces.delete(id); V0.bots.delete(id); for (const c of V0.colliders.get(id) || []) { try { game.physics.removeCollider(c); } catch { /* gone */ } } V0.colliders.delete(id); }
    V0.first = false;
  }
  function syncPads() {
    const s = S(), cr = game.run?.credits || 0, av = C.availablePieces(s), lk = C.lockedPieces(s);
    const sig = `${s.b.join(',')}|${C.starsOf(s)}|${av.map((p) => (cr >= p.cost ? 1 : 0)).join('')}`;
    if (sig === V0.padSig) return; V0.padSig = sig;
    for (const g of V0.pads.values()) dispView(g.grp); V0.pads.clear();
    const root = ensureRoot();
    const mk = (p, locked) => {
      const afford = cr >= p.cost, col = locked ? 0xff6a3a : afford ? 0x50ff80 : 0xffc040, grp = V.buildPad(col);
      grp.position.set(C.padOf(p)[0], 0, C.padOf(p)[1]);
      const lb = V.labelSprite(locked ? `${t(p.name)}  ${p.star}*` : `${t(p.name)}  ${p.cost}`, { color: locked ? '#ff9a6a' : afford ? '#9dffb4' : '#ffd070', scale: 2.2 });
      lb.position.set(0, 1.9, 0); grp.add(lb); grp.userData.mats.push(lb.material);
      root.add(grp); V0.pads.set(p.id, { grp, p, locked, afford });
    };
    av.forEach((p) => mk(p, false)); lk.forEach((p) => mk(p, true));
  }
  function padUpdate(dt) {
    const pp = game.player?.pos; let on = null;
    const time = performance.now() / 1000;
    for (const v of V0.pads.values()) {
      const u = v.grp.userData; u.arrow.position.y = 1.15 + Math.sin(time * 3 + v.p.at[0]) * 0.1; u.arrow.rotation.y += dt * 2; u.disc.material.opacity = 0.4 + 0.2 * Math.sin(time * 4);
      if (!v.locked && pp && !game.ui?.panelOpen && !game.player.dead && Math.hypot(pp.x - C.padOf(v.p)[0], pp.z - C.padOf(v.p)[1]) < 0.95 && Math.abs(pp.y - HOME_Y) < 2.2) on = v;
    }
    if (on && on.afford) {
      if (V0.standId !== on.p.id) { V0.standId = on.p.id; V0.stand = 0; }
      V0.stand += dt; on.grp.userData.ring.scale.setScalar(1 + Math.sin(V0.stand * 20) * 0.06);
      if (V0.stand >= 0.7 && time - V0.reqAt > 1.6) { V0.reqAt = time; game.net.request('rsreq', { op: 'buy', id: on.p.id }); }
    } else { V0.standId = ''; V0.stand = 0; if (on && !on.afford && time - V0.reqAt > 2.5) { V0.reqAt = time; game.ui?.toast(t('Not enough credits.'), 'bad'); } }
  }
  function dropCust(v) { v.grp.removeFromParent(); v.bubble?.removeFromParent(); v.bar?.material.dispose(); v.bg?.material.dispose(); }
  function syncCust(dt) {
    const root = ensureRoot(), alive = new Set();
    for (const c of snapCust) {
      alive.add(c.id);
      let v = V0.cust.get(c.id);
      if (!v) {
        const sp = C.SPECIES[c.sp]; if (!sp) continue;
        const grp = V.buildCustomer(sp); grp.position.set(c.x, c.sitY, c.z); grp.rotation.y = c.yaw;
        const bg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x000000, transparent: true, opacity: 0.7, depthWrite: false })), bar = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x50ff80, depthWrite: false }));
        bg.scale.set(0.86, 0.13, 1); bar.scale.set(0.8, 0.08, 1); bg.position.set(0, 2.05, 0); bar.position.set(0, 2.05, 0.01); grp.add(bg, bar);
        root.add(grp); v = { grp, bg, bar, bubble: null, bub: '', walk: Math.random() * 6, c }; V0.cust.set(c.id, v);
      }
      v.c = c;
      const g = v.grp, dx = c.x - g.position.x, dz = c.z - g.position.z, d = Math.hypot(dx, dz);
      if (d > 5) g.position.set(c.x, g.position.y, c.z); else { g.position.x += dx * Math.min(1, dt * 7); g.position.z += dz * Math.min(1, dt * 7); }
      let dy = c.yaw - g.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); g.rotation.y += dy * Math.min(1, dt * 8);
      v.walk += dt * (d > 0.03 ? 9 : 0);
      g.position.y = c.sitY + (d > 0.03 ? Math.abs(Math.sin(v.walk)) * 0.07 : 0);
      const showBar = c.st === 'q' || c.st === 'ord' || c.st === 'wait';
      v.bar.visible = v.bg.visible = showBar;
      if (showBar) { const p = Math.max(0, Math.min(1, c.pat)); v.bar.scale.x = Math.max(0.02, 0.8 * p); v.bar.position.x = -0.4 + 0.4 * p; v.bar.material.color.setHSL(0.33 * p, 0.9, 0.5); }
      const want = c.st === 'wait' && c.dish ? c.dish : c.st === 'ord' ? '?' : '';
      if (want !== v.bub) {
        v.bub = want; v.bubble?.removeFromParent(); v.bubble = null;
        if (want === '?') { v.bubble = V.labelSprite(t('ORDER?'), { color: '#ffd23f', scale: 1.1, w: 128, h: 32 }); }
        else if (want) { v.bubble = new THREE.Sprite(V.bubbleMaterial(want)); v.bubble.scale.set(1.5, 0.25, 1); }
        if (v.bubble) { v.bubble.position.set(0, 2.5, 0); g.add(v.bubble); }
      }
    }
    for (const [id, v] of [...V0.cust]) if (!alive.has(id)) { dropCust(v); V0.cust.delete(id); }
    // pests
    const pa = new Set();
    for (const a of snap.p) {
      pa.add(a[0]); let pv = V0.pests.get(a[0]);
      if (!pv) { pv = V.buildPest(); pv.position.set(a[1] / 100, 0, a[2] / 100); root.add(pv); V0.pests.set(a[0], pv); }
      pv.position.x += (a[1] / 100 - pv.position.x) * Math.min(1, dt * 6); pv.position.z += (a[2] / 100 - pv.position.z) * Math.min(1, dt * 6); pv.rotation.y = a[3] / 100;
    }
    for (const [id, pv] of [...V0.pests]) if (!pa.has(id)) { dispView(pv); V0.pests.delete(id); }
  }
  function animate(dt) {
    const time = performance.now() / 1000;
    for (const [id, pop] of [...V0.pops]) {
      pop.t += dt; const k = easeOutBack(pop.t / 0.55);
      if (pop.floor) pop.grp.scale.set(1, Math.max(0.01, k), 1); else pop.grp.scale.setScalar(Math.max(0.01, k));
      if (pop.t >= 0.55) { pop.grp.scale.setScalar(1); V0.pops.delete(id); }
    }
    for (const [id, grp] of V0.pieces) { const p = C.PIECE[id]; if (p.kind === 'stove' && grp.userData.lamp) grp.userData.lamp.material.color.setHex(snap.ck.includes(id) ? (Math.sin(time * 12) > 0 ? 0xff7a20 : 0xffc040) : 0x40e070); }
    for (const [id, grp] of V0.bots) {
      const p = C.PIECE[id], b = p.bot, busy = snap.c.length > 0 && (b !== 'chef' || snap.ck.length > 0);
      let x = p.at[0], z = p.at[1];
      if (b === 'waiter' && busy) z = 31.5 + (Math.sin(time * 0.5) * 0.5 + 0.5) * 8;
      grp.position.x += (x - grp.position.x) * Math.min(1, dt * 3); grp.position.z += (z - grp.position.z) * Math.min(1, dt * 3);
      grp.position.y = Math.sin(time * (busy ? 8 : 2) + p.at[0]) * (busy ? 0.04 : 0.02);
      grp.rotation.y = b === 'chef' ? Math.PI + Math.sin(time * (busy ? 3 : 0.7)) * 0.4 : Math.sin(time * 0.6) * 0.4;
    }
    // shuttle
    const [sti, stt] = snap.sh;
    if (sti > 0) {
      if (!V0.shuttle) { V0.shuttle = V.buildShuttle(); V0.shuttle.position.set(C.SHUTTLE.x, 14, C.SHUTTLE.z); ensureRoot().add(V0.shuttle); }
      const k = sti === 1 ? 1 - Math.min(1, stt / C.SHUTTLE_LAND) : sti === 3 ? Math.min(1, stt / C.SHUTTLE_LEAVE) : 0;
      V0.shuttle.position.y = 15 * k * k + (sti === 2 ? Math.sin(time * 1.5) * 0.04 : 0); V0.shuttle.rotation.y = time * 0.05;
    } else if (V0.shuttle) { dispView(V0.shuttle); V0.shuttle = null; }
  }

  // ------------------------------------------------------------------------------------------ CLIENT: interactables + messages
  const heldPlate = (dish) => { let best = null; for (const it of game.items.all()) if (it.holder === me() && it.type === C.dishItem(dish) && it.inv?.k !== 'eq' && (!best || QIDX(it.tier) > QIDX(best.tier))) best = it; return best; };
  const req = (op, d = {}) => game.net.request('rsreq', { op, ...d });
  const dName = (id) => t(C.DISH[id]?.name || id);
  const hasIngredientsInHand = () => { let n = 0; for (const it of game.items.all()) if (it.holder === me() && ING[it.type] && it.inv?.k !== 'eq') n++; return n; };
  function interactables(list) {
    const s = S(), V3 = (x, y, z) => new THREE.Vector3(x, HOME_Y + y, z);
    list.push({ pos: V3(C.DOOR.x + 2.6, 1.6, 26.6), r: 1.6, reach: 4, label: t('Alien Diner [E]'), sub: `${'*'.repeat(C.starsOf(s))} ${C.starsOf(s)}/5 - ${t('manage the restaurant')}`, action: () => openPanel() });
    if (!C.has(s, 'floor')) return;
    const pays = snapCust.filter((c) => c.st === 'pay');
    if (C.has(s, 'counter')) {
      const cp = C.PIECE.counter;
      if (pays.length) list.push({ pos: V3(cp.at[0], 1.4, cp.at[1] + 0.9), r: 1.4, reach: 4, label: t('Take payment [E]'), sub: `${pays.length} ${t('waiting')}`, action: () => req('pay', { cid: pays[0].id }) });
      else list.push({ pos: V3(cp.at[0], 1.4, cp.at[1] + 0.9), r: 1.4, reach: 4, label: s.till >= 1 ? tf('Empty the till: {n} [E]', { n: Math.floor(s.till) }) : t('Register'), sub: t('Passive income collects here (capped)'), action: () => (s.till >= 1 ? req('till') : game.ui?.toast(t('The till is empty.'))) });
    }
    if (C.has(s, 'fridge')) { const fp = C.PIECE.fridge, pn = C.pantryTotal(s.pantry); list.push({ pos: V3(fp.at[0], 1.3, fp.at[1] - 0.8), r: 1.4, reach: 4, label: t('Stock the fridge [E]'), sub: `${pn}/${C.MAX_PANTRY} - ${hasIngredientsInHand()} ${t('ingredients in hand')}`, action: () => req('dep') }); }
    const tk = snapCust.filter((c) => c.st === 'wait' && c.stage === 'open').sort((a, b) => a.id - b.id)[0];
    for (const id of C.STOVE_IDS) {
      if (!C.has(s, id)) continue;
      const p = C.PIECE[id], busy = snap.ck.includes(id);
      list.push({ pos: V3(p.at[0], 1.2, p.at[1] - 0.8), r: 1.3, reach: 3.6, label: busy ? t('Stove: cooking...') : tk ? tf('Cook: {d} [E]', { d: dName(tk.dish) }) : t('Stove'), sub: tk ? tf('{n} order(s) open', { n: snapCust.filter((c) => c.st === 'wait' && c.stage === 'open').length }) : t('No open orders'),
        action: () => { if (busy || game.minigame) return; if (!tk) return game.ui?.toast(t('No open orders.')); req('cook', { stove: id, cid: tk.id }); } });
    }
    for (const c of snapCust) {
      if (c.st === 'ord') list.push({ pos: V3(c.x, 1.5, c.z), r: 1.2, reach: 3.6, label: t('Take order [E]'), sub: t(C.SPECIES[c.sp]?.name || ''), action: () => req('ord', { cid: c.id }) });
      else if (c.st === 'wait' && c.dish) {
        const pl = heldPlate(c.dish);
        list.push({ pos: V3(c.x, 1.5, c.z), r: 1.2, reach: 3.6, label: pl ? tf('Serve {d} [E]', { d: dName(c.dish) }) : tf('Wants {d}', { d: dName(c.dish) }), sub: pl ? t(C.SPECIES[c.sp]?.name || '') : (c.stage === 'ready' ? t('Plate is ready at the pass') : c.stage === 'cooking' ? t('Being cooked') : t('Cook it at the stove')),
          action: () => { const p2 = heldPlate(c.dish); if (!p2) return game.ui?.toast(t('Hold the plate to serve it.'), 'bad'); req('serve', { cid: c.id, it: p2.id }); } });
      }
    }
    for (const tb of snap.d) { const p = C.PIECE[tb]; if (p) list.push({ pos: V3(p.at[0], 1.0, p.at[1]), r: 1.2, reach: 3.4, label: t('Clear the table [E]'), sub: t('Dirty tables draw pests'), action: () => req('clr', { table: tb }) }); }
    for (const a of snap.p) list.push({ pos: V3(a[1] / 100, 0.3, a[2] / 100), r: 1.0, reach: 3.0, label: t('Swat the pest [E]'), sub: t('It eats your stock'), action: () => req('swat', { pid: a[0] }) });
  }
  function setHint(text) {
    if (!text) { hintEl?.remove(); hintEl = null; return; }
    if (!hintEl) { hintEl = document.createElement('div'); hintEl.className = 'rs-hint'; document.body.appendChild(hintEl); }
    hintEl.textContent = text;
  }
  const onMsg = (m, from) => {
    if (disposed || !m || (from !== game.net?.hostId && !host())) return;
    switch (m.k) {
      case 'err': game.ui?.toast(t(m.why), 'bad'); game.audio?.play?.('ui_error', { volume: 0.4, bus: 'ui' }); break;
      case 'toast': game.ui?.toast(m.v ? tf(m.text, m.v) : t(m.text), m.bad ? 'bad' : 'good'); break;
      case 'banner': game.ui?.hud?.bigText?.(m.v ? tf(m.main, m.v) : t(m.main), m.v ? tf(m.sub || '', m.v) : t(m.sub || '')); break;
      case 'built': if (m.by === me()) game.ui?.toast(`${t(C.PIECE[m.id]?.name || m.id)} - ${t('built')}`, 'good'); break;
      case 'dep': game.ui?.toast(tf('Stocked {n} ingredients.', { n: m.n }), 'good'); game.audio?.play?.('ui_confirm', { volume: 0.4, bus: 'ui' }); break;
      case 'till': game.ui?.toast(tf('Collected {n} credits from the till.', { n: m.n }), 'good'); game.audio?.play?.('coins', { volume: 0.7 }); break;
      case 'pay': { const at = new THREE.Vector3(m.x, HOME_Y + 1.5, m.z); game.sound2?.cue('resto_bell', at, 0.6); game.sound2?.cue('alien_chatter', at, 0.5, { pitch: 1.25, delay: 0.25 }); game.audio?.play?.('coins', { volume: 0.25 });   // [sound2]
         game.particles?.burst?.(new THREE.Vector3(m.x, HOME_Y + 1.5, m.z), 'sparks'); if (m.by === me()) { const [n, w] = String(m.extra || '').split('|'); game.ui?.toast(`+${m.amt}${w ? ` ${n} ${t(w === 'scrap' ? 'scrap' : 'Followers tip')}` : ''}`, 'good'); } break; }
      case 'cooked': game.particles?.burst?.(new THREE.Vector3(m.x, HOME_Y + 1.3, m.z), m.q === 0 ? 'dust' : 'sparks'); if (m.q === 0) game.audio?.play?.('ui_error', { volume: 0.35, bus: 'ui' }); else game.sound2?.cue('resto_sizzle', new THREE.Vector3(m.x, HOME_Y + 1.3, m.z), 0.7); break;   // [sound2] kitchen sizzle
      case 'angry': game.sound2?.cue('alien_chatter', new THREE.Vector3(m.x, HOME_Y + 1.8, m.z), 0.7, { pitch: 0.7 });   // [sound2] grumbling game.particles?.burst?.(new THREE.Vector3(m.x, HOME_Y + 1.8, m.z), 'dust'); break;
      case 'swat': game.particles?.burst?.(new THREE.Vector3(m.x, HOME_Y + 0.2, m.z), 'goo'); break;
      case 'land': game.audio?.play?.('ship_land', { volume: 0.25 }); break;
      case 'cookok': {
        if (game.minigame) { req('cancel', { cid: m.cid }); break; }
        const d = C.DISH[m.dish], cid = m.cid;
        game.openMinigame('rs_pan', { dur: m.dur, label: `${t('COOK')}: ${dName(m.dish)}`, difficulty: 0.3, noEase: true }, (r) => { if (!r || r.cancelled) req('cancel', { cid }); else req('fin', { cid, q: r.q }); });
        void d; break;
      }
    }
  };
  const onSnap = (d, from) => {
    if (disposed || !d || (from !== game.net?.hostId && !host())) return;
    snap = { sh: d.sh || [0, 0], c: d.c || [], p: d.p || [], d: d.d || [], cl: d.cl ?? 100, ck: d.ck || [] };
    snapCust = snap.c.map(C.unpackCustomer);
  };
  function bindNet(net) { if (!net || boundNet === net) return; boundNet?.off?.('msg:rsmsg', onMsg); boundNet?.off?.('msg:rsx', onSnap); boundNet = net; net.on('msg:rsmsg', onMsg); net.on('msg:rsx', onSnap); }

  function openPanel() {
    if (game.onboard?.deny?.('restaurant')) return;   // [hubgate] unlocks at quota 3
    if (!onHome() || disposed) return;
    closePanel();
    const ctl = createRestoPanel(game.ui, game, api);
    game.ui.openPanel(ctl.el); panel = ctl;
    game.ui.onPanelClose = () => { ctl.dispose(); if (panel === ctl) panel = null; return false; };
  }
  const closePanel = () => { if (panel) game.ui.closePanel(); };

  // ------------------------------------------------------------------------------------------ wiring
  offs.push(mods.on('netReady', (n, g) => { if (g === game) bindNet(n); }));
  if (game.net) bindNet(game.net);
  offs.push(mods.on('registerHandlers', (Hh, g) => { if (g === game) Hh('rsreq', (d, from) => { try { hostReq(d, from); } catch (e) { console.error('rsreq', e); err(from, 'Error.'); } }); }));
  offs.push(mods.on('hostStart', (g) => { if (!g || g === game) attach(); }));
  offs.push(mods.on('hostMigrated', (g, info) => {
    if (g !== game || !info?.self || !game.run?.rs) return;
    migRs = true; game.run.rs = C.sanitize(game.run.rs);   // adopt the synced diner; commit() then keeps broadcasting it without touching the new host's profile
  }));
  offs.push(mods.on('phase', (ph, g) => { if (g !== game || disposed) return; if (ph !== 'moon' && ph !== 'landing') { closePanel(); clearViews(); snap = { sh: [0, 0], c: [], p: [], d: [], cl: 100, ck: [] }; snapCust = []; } }));
  offs.push(mods.on('mapLoaded', (w, g) => { if (g === game) clearViews(); }));
  offs.push(mods.on('moonPopulated', (g) => { if (!g || g === game) { try { seedIngredients(); } catch (e) { console.warn('[rs] seed', e); } } }));
  offs.push(mods.on('interactables', (list, g) => { if (g !== game || disposed || !onHome() || game.onboard?.locked?.('restaurant')) return; try { interactables(list); } catch (e) { console.warn('[rs] interactables', e); } }));
  let padT = 0, errs = 0;
  offs.push(mods.on('update', (dt, g) => {
    if (g !== game || disposed) return;
    try {
      if (host() && game.run && !game.run.rs) attach();
      if (host() && game.run?.rs) hostTick(dt);
      if (!onHome()) { if (V0.root) clearViews(); setHint(null); return; }
      registerModels();
      syncPieces(); padT -= dt; if (padT <= 0) { padT = 0.25; syncPads(); panel?.refresh?.(); }
      syncCust(dt); animate(dt); padUpdate(dt);
      if (V0.standId) setHint(t('Hold still on the pad to build...')); else setHint(null);
    } catch (e) { if (++errs <= 3) console.warn('[rs] update', e); }
  }));
  const api = {
    state: S, core: C, req, open: openPanel, close: closePanel, sim, get snap() { return snap; }, get cust() { return snapCust; }, pantryOf: () => S().pantry, ING,
    dispose() {
      if (disposed) return; disposed = true;
      for (const o of offs) { try { o?.(); } catch { /* ignore */ } }
      boundNet?.off?.('msg:rsmsg', onMsg); boundNet?.off?.('msg:rsx', onSnap);
      clearViews(); setHint(null); V.disposeTextures();
    },
  };
  return api;
}
