// ROLE APTITUDES + AUTO ROLES (wave 2, gameplay2). Extends the rpg module's roles WITHOUT forking passivetree.js:
//   - two new roles, TRADER and ENGINEER (they share the tree post of Hauler / Technician via `home`, see START_ID in passivetree.js);
//   - explicit "GOOD AT" aptitude text on all 8 roles (shown on the role card) and the new bonus keys
//       sellValue, shopDiscount, forgeLuck, repairSpeed, identifySpeed   (game.rpg.bonus(key), all pct fractions)
//   - host-side auto assignment: everybody without a role gets one at run start / on join, distinct from crewmates where
//     possible; ONE free reroll per run (terminal REROLL, or just pick in the ROLE panel);
//   - sellValue is applied on the host sell path (the player who rings the bell), shopDiscount on the Company Store
//     (displayed price + refund of the difference on purchase), repairSpeed / identifySpeed are read by shipfaults / identify.
//   - craftLuck is read by crafting.js already; forgeLuck: the forge module should read game.rpg.bonus('forgeLuck') (soft) or
//     game.gameplay2.aptitudes.forgeLuck().
// Pure parts (assignRoles, pickRerollRole, sellMul, discountedPrice, repairTime, ...) are node-tested.
import { ROLES, ROLE_ORDER, KEYS, KEY_IDS } from './passivetree.js';
import { addTranslations } from '../core/i18n.js';
import { aAn } from '../core/util.js';

// ---------------------------------------------------------------- data (registered at import: profile validation runs early)
export const NEW_KEYS = {
  sellValue: { unit: 'pct', label: 'Scrap Sell Price' },
  shopDiscount: { unit: 'pct', label: 'Company Store Discount' },
  forgeLuck: { unit: 'pct', label: 'Forge / Upgrade Success' },
  repairSpeed: { unit: 'pct', label: 'Ship Repair Speed' },
  identifySpeed: { unit: 'pct', label: 'Identify Speed' },
};
export const NEW_ROLES = {
  trader: {
    name: 'Trader', color: '#f2c94c', icon: 'coin', kit: 'spraypaint', tag: 'Everything has a price. Mostly yours.', home: 'hauler',
    desc: 'Knows what scrap is really worth. Sells for more at the counter and gets a better deal from the Company Store.',
    bonus: { sellValue: 0.15, shopDiscount: 0.10, carry: 4 }, post: { carry: 4 },
    aptitude: 'Haggling: scrap sells for +15% when you ring the bell, Company Store prices -10%.',
    aptitudeTr: 'Pazarlık: zili sen çalınca hurda %15 fazla eder, Şirket Mağazası fiyatları %10 düşük.',
  },
  engineer: {
    name: 'Engineer', color: '#ffb347', icon: 'bolt', kit: 'hullpatch', tag: 'Duct tape, then physics.', home: 'technician',
    desc: 'Tinkers with everything: better odds when crafting and upgrading, and the ship never stays broken for long.',
    bonus: { craftLuck: 0.10, forgeLuck: 0.10, repairSpeed: 0.40, interactSpeed: 0.05 }, post: { interactSpeed: 0.04 },
    aptitude: 'Tinkering: forge / craft / upgrade success +10%, repairs ship faults 40% faster.',
    aptitudeTr: 'Tamircilik: dövme / üretim / geliştirme başarısı +%10, gemi arızalarını %40 daha hızlı onarır.',
  },
};
// aptitude text (+ small extra bonuses) for the six existing roles
export const APTITUDES = {
  scout: { text: 'Recon: longer scan, IDENTIFIES entities 40% faster, quick feet.', tr: 'Keşif: uzun tarama, varlıkları %40 daha hızlı TANIMLAR, çevik.', add: { identifySpeed: 0.40 } },
  enforcer: { text: 'Weapon handling: hits harder with melee and ranged weapons, tougher.', tr: 'Silah ustalığı: yakın ve uzak silahlarla daha sert vurur, daha dayanıklı.', add: {} },
  occultist: { text: 'Spells: bigger mana pool, faster recharge, stronger spells.', tr: 'Büyü: daha büyük mana, hızlı dolum, güçlü büyüler.', add: {} },
  medic: { text: 'Revive and heal: revives crewmates 30% faster, sturdy.', tr: 'Diriltme ve iyileştirme: ekibi %30 daha hızlı diriltir, sağlam.', add: {} },
  technician: { text: 'Facility systems + SHIP FAULTS: quicker interaction, repairs ship faults 25% faster.', tr: 'Tesis sistemleri + GEMİ ARIZALARI: hızlı etkileşim, arızaları %25 daha hızlı onarır.', add: { repairSpeed: 0.25 } },
  hauler: { text: 'Carry: much more weight, more stamina, a little extra scrap value.', tr: 'Taşıma: çok daha fazla ağırlık, daha çok dayanıklılık, biraz fazla hurda değeri.', add: {} },
};
addTranslations({
  Trader: 'Tüccar', Engineer: 'Mühendis', 'GOOD AT': 'İYİ OLDUĞU ŞEY',
  'Scrap Sell Price': 'Hurda Satış Fiyatı', 'Company Store Discount': 'Şirket Mağazası İndirimi', 'Forge / Upgrade Success': 'Dövme / Geliştirme Başarısı',
  'Ship Repair Speed': 'Gemi Onarım Hızı', 'Identify Speed': 'Tanımlama Hızı',
  'Everything has a price. Mostly yours.': 'Her şeyin bir fiyatı var. Çoğunlukla seninki.', 'Duct tape, then physics.': 'Önce bant, sonra fizik.',
  'Knows what scrap is really worth. Sells for more at the counter and gets a better deal from the Company Store.': 'Hurdanın gerçek değerini bilir. Tezgâhta daha pahalıya satar, Şirket Mağazası\'ndan daha iyi fiyat alır.',
  'Tinkers with everything: better odds when crafting and upgrading, and the ship never stays broken for long.': 'Her şeyle uğraşır: üretim ve geliştirmede daha iyi şans, gemi uzun süre bozuk kalmaz.',
  'Hull Patch': 'Gövde Yaması',
});

let registered = false;
/** idempotent: adds the roles, bonus keys and aptitude texts to the passivetree module objects */
export function registerExtraRoles() {
  if (registered) return false;
  registered = true;
  for (const [k, v] of Object.entries(NEW_KEYS)) if (!KEYS[k]) { KEYS[k] = v; KEY_IDS.push(k); }
  for (const [id, r] of Object.entries(NEW_ROLES)) if (!ROLES[id]) ROLES[id] = { ...r, bonus: { ...r.bonus }, post: { ...r.post } };
  for (const [id, a] of Object.entries(APTITUDES)) {
    const r = ROLES[id];
    if (!r) continue;
    r.aptitude = a.text; r.aptitudeTr = a.tr;
    for (const [k, v] of Object.entries(a.add)) if (r.bonus[k] === undefined) r.bonus[k] = v;
  }
  return true;
}
registerExtraRoles();
/** every role id (the six tree roles first, then Trader / Engineer) */
export const allRoleIds = () => [...new Set([...ROLE_ORDER, ...Object.keys(ROLES)])];

// ---------------------------------------------------------------- pure math
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
/** multiplier on the credits of a sale for a seller with `sellValue` bonus */
export const sellMul = (bonus) => 1 + clamp(Number(bonus) || 0, -0.5, 1);
/** Company Store price for a buyer with `shopDiscount` */
export const discountedPrice = (price, disc) => Math.max(1, Math.round(price * (1 - clamp(Number(disc) || 0, 0, 0.5))));
/** repair speed multiplier (0.4 -> 1.4x): times are divided by it */
export const repairMul = (bonus) => 1 + clamp(Number(bonus) || 0, 0, 2);
export const repairTime = (base, bonus) => base / repairMul(bonus);

/**
 * Auto role assignment (pure). current: { peerId: roleId|null }; need: peers to assign (in order).
 * Prefers roles nobody holds; when every role is taken, the least-held ones. Returns { peerId: roleId }.
 */
export function assignRoles(current, need, rand = Math.random, roles = allRoleIds()) {
  const count = new Map(roles.map((r) => [r, 0]));
  for (const r of Object.values(current || {})) if (r && count.has(r)) count.set(r, count.get(r) + 1);
  const out = {};
  for (const id of need) {
    const min = Math.min(...count.values());
    const pool = roles.filter((r) => count.get(r) === min);
    const pick = pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))];
    out[id] = pick; count.set(pick, count.get(pick) + 1);
  }
  return out;
}
/** reroll target: a role that is neither the current one nor held by a crewmate (falls back to "not the current one"). */
export function pickRerollRole(current, crewRoles, rand = Math.random, roles = allRoleIds()) {
  const held = new Set((crewRoles || []).filter(Boolean));
  let pool = roles.filter((r) => r !== current && !held.has(r));
  if (!pool.length) pool = roles.filter((r) => r !== current);
  return pool.length ? pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))] : null;
}

// ---------------------------------------------------------------- game glue
export function installAptitudes(game, ctx = {}) {
  const R = game.rpg;
  if (!R) return null;
  registerExtraRoles();
  const offs = [];
  const st = { assigned: new Set(), pending: null, disposed: false };
  const p = game.profile;
  const toast = (s, k = 'info') => { try { game.ui?.toast?.(s, k); } catch { /* ignore */ } };
  const runKey = () => String(game.run?.runId || game.saveSlot || 0);
  const ext = () => (p.g2 || (p.g2 = {}));
  const bonus = (key) => { try { return Number(R.bonus(key)) || 0; } catch { return 0; } };
  const bonusOf = (peer, key) => (!peer || peer === game.selfId ? bonus(key) : Number(ROLES[R.roleOf(peer)]?.bonus?.[key]) || 0);
  const canSwitch = () => { const ph = game.run?.phase; return !ph || ph === 'orbit'; };

  // ---- sell path: the bell ringer's sellValue (stacks with rpg's scrapValue wrapper, which sits inside ours)
  const origSell = game.hostSell;
  if (typeof origSell === 'function') {
    game.hostSell = function (from) {
      const b = this.run?.phase === 'company' ? bonusOf(from, 'sellValue') : 0;
      const run = this.run, had = run && Object.prototype.hasOwnProperty.call(run, 'favor'), f = run?.favor;
      if (b > 0 && run) run.favor = (f || 1) * sellMul(b);
      try { return origSell.call(this, from); }
      finally {
        if (b > 0 && run) { if (had) run.favor = f; else delete run.favor; if (this.hostData?.selling) this.net.sendTo(from, 'sys', { text: `Haggled: +${Math.round(b * 100)}% on this sale.`, kind: 'good' }); }
      }
    };
  }

  // ---- Company Store: displayed price + refund of the discount on purchase
  const shop = game.shop;
  let oStock = null, oCart = null;
  if (shop && typeof shop.stock === 'function') {
    oStock = shop.stock;
    shop.stock = () => {
      const list = oStock.call(shop), d = bonus('shopDiscount');
      return d > 0 ? list.map((e) => (e.currency === 'credits' && e.price > 0 ? { ...e, price: discountedPrice(e.price, d), g2off: d } : e)) : list;
    };
  }
  if (shop && typeof shop.hostCart === 'function') {
    oCart = shop.hostCart;
    shop.hostCart = function (cmd, from, reply) {
      const run = game.run, before = run?.credits ?? 0;
      const r = oCart.call(this, cmd, from, reply);
      const d = bonusOf(from, 'shopDiscount'), spent = before - (run?.credits ?? 0);
      if (d > 0 && spent > 0) {
        const back = Math.round(spent * clamp(d, 0, 0.5));
        if (back > 0) { run.credits += back; game.broadcastRun?.(['credits']); game.net.sendTo(from, 'sys', { text: `Trader discount: ▮${back} back.`, kind: 'good' }); }
      }
      return r;
    };
  }

  // ---- auto assignment
  function applyRole(role, how = 'auto') {
    if (!ROLES[role] || R.role()) return false;
    if (!canSwitch()) { st.pending = role; toast(`Your crew role is assigned next time the ship is in orbit.`, 'info'); return false; }
    const res = R.trySetRole(role);
    if (!res.ok) return false;
    st.pending = null;
    const spent = ext().rerollUsed === runKey();
    toast(`Role auto-assigned: ${ROLES[role].name}. ${spent ? '' : 'One free reroll: terminal REROLL (or pick in the ROLE panel).'}`, 'good');
    game.mods?.emit('tfg:autorole', role, how, game);
    return true;
  }
  function hostAssign() {
    if (!game.isHost || st.disposed) return {};
    const ids = [game.selfId, ...game.remotes.keys()].filter(Boolean);
    const cur = {};
    for (const id of ids) cur[id] = R.roleOf(id) || null;
    const need = ids.filter((id) => !cur[id] && !st.assigned.has(id));
    if (!need.length) return {};
    const plan = assignRoles(cur, need);
    for (const [id, role] of Object.entries(plan)) {
      st.assigned.add(id);
      if (id === game.selfId) applyRole(role); else game.net.sendTo(id, 'g2', { k: 'role', role });
    }
    return plan;
  }
  function onMsg(d) { if (d.k === 'role') applyRole(String(d.role)); }
  offs.push(game.mods.on('phase', (ph, g) => {
    if (g !== game) return;
    if (ph === 'orbit') {
      if (st.pending && !R.role()) applyRole(st.pending);
      if (game.isHost) game.later(() => hostAssign(), 1500);
    }
  }));
  offs.push(game.mods.on('hostStart', (g) => { if (g === game) game.later(() => hostAssign(), 2500); }));
  offs.push(game.mods.on('playerJoin', (id, info, g) => { if (g === game && game.isHost) game.later(() => hostAssign(), 3500); }));

  // ---- one free reroll per run
  const rerollsLeft = () => (ext().rerollUsed === runKey() ? 0 : 1);
  function reroll() {
    if (!R.role()) return { ok: false, msg: 'You have no role yet.' };
    if (rerollsLeft() < 1) return { ok: false, msg: 'Free reroll already used this run. Pick a role in the ROLE panel.' };
    if (!canSwitch()) return { ok: false, msg: 'Roles can only be changed while the ship is in orbit.' };
    const crew = [...game.remotes.keys()].map((id) => R.roleOf(id));
    const role = pickRerollRole(R.role(), crew);
    if (!role) return { ok: false, msg: 'No other role available.' };
    const pv = R.previewRole(role);
    if (pv.clout > 0) return { ok: false, msg: 'Your passive tree would lose nodes: use the ROLE panel instead.' };
    const res = R.trySetRole(role);
    if (!res.ok) return res;
    ext().rerollUsed = runKey();
    game.progress?.save?.();
    return { ok: true, msg: `Rerolled: you are now ${aAn(ROLES[role].name)} ${ROLES[role].name}.`, role };
  }

  // ---- terminal REROLL
  const KA = typeof window !== 'undefined' ? window.KefalAPI : null;
  if (KA?.registerCommand) {
    KA.registerCommand('reroll', (rest, term, g) => {
      const A = g?.gameplay2?.aptitudes;
      if (!A) return;
      const r = A.reroll();
      term.print(r.msg, r.ok ? '' : 'err');
    }, 'REROLL  one free role reroll per run (orbit only)');
  }

  return {
    bonus, bonusOf, onMsg, hostAssign, applyRole, reroll, rerollsLeft,
    sellBonus: (peer) => bonusOf(peer, 'sellValue'),
    discount: (peer) => bonusOf(peer, 'shopDiscount'),
    repairMul: (peer) => repairMul(bonusOf(peer, 'repairSpeed')),
    identifySpeed: (peer) => bonusOf(peer, 'identifySpeed'),
    forgeLuck: (peer) => bonusOf(peer, 'forgeLuck'),
    roles: () => allRoleIds().map((id) => ({ id, name: ROLES[id].name, aptitude: ROLES[id].aptitude })),
    state: st,
    dispose() {
      st.disposed = true;
      for (const o of offs) { try { o?.(); } catch { /* ignore */ } }
      if (Object.prototype.hasOwnProperty.call(game, 'hostSell') && game.hostSell !== origSell) game.hostSell = origSell;
      if (shop && oStock) shop.stock = oStock;
      if (shop && oCart) shop.hostCart = oCart;
    },
  };
}
