// Player TRADING - pure rules (no DOM / three.js, node-tested by tools/harness/trade.test.mjs).
//   RULES                  tunables (9 items per side, 10 s request, 3 s countdown, 4.6 m to start / 6.5 m to keep)
//   tradeBlock(entry)      why an item cannot be traded (null = it can)
//   validateOffer(entries, ids)      the sender still holds every offered item and all of them are tradable
//   planTrade([sideA, sideB])        atomic swap plan: where every item lands, or why the swap is impossible
//   TradeSession           the lock / accept / countdown state machine (host owns it, clients only get snapshots)
//   compareItems(a, b)     stat-by-stat comparison (tooltips: "vs your equipped armour")
// An "entry" is inventory_core's { id, def, inv, tier, it?, value } - the host builds them from its world items.
import * as C from './inventory_core.js';
import { tierDef, tierOfItem } from './tiers.js';
import { plusMul } from './enhance.js';

export const RULES = Object.freeze({
  maxItems: 9,          // items per side
  requestTtl: 10,       // s an unanswered request lives
  countdown: 3,         // s between "both accepted" and the swap
  startDist: 4.6,       // m: the host allows a request when the players are this close (client checks 4)
  keepDist: 6.5,        // m: a trade in progress is cancelled beyond this
  idleTtl: 300,         // s without any change before an open trade times out
  maxClout: 0,          // [followers] Followers are never spent or traded: every offer's Clout clamps to 0 (protocol fields kept for old peers)
  debitTtl: 3,          // s the host waits for the giver's client to confirm a Clout debit
});

/** cancel reasons -> English text ({name} = the other player / the culprit); clients translate them (t / tf) */
export const CANCEL_TEXT = Object.freeze({
  declined: '{name} declined the trade.',
  expired: 'The trade request expired.',
  cancelled: '{name} cancelled the trade.',
  self: 'You cancelled the trade.',
  left: '{name} left the crew. Trade cancelled.',
  died: 'Trade cancelled: someone died.',
  far: 'Trade cancelled: you moved too far apart.',
  phase: 'Trade cancelled: the ship is moving.',
  invalid: 'Trade cancelled: an offered item is gone.',
  noroom: 'Trade cancelled: not enough room in {name}\'s inventory.',
  noclout: 'Trade cancelled: {name} does not have that much Followers.',
  timeout: 'The trade timed out.',
  error: 'Trade cancelled.',
});

const isObj = (v) => !!v && typeof v === 'object';
const clampInt = (v, lo, hi) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Math.round(Number(v)))) : lo);

// ------------------------------------------------------------------ what can be traded
/** Reason (English, translated by the UI) why an entry cannot be traded, or null. */
export function tradeBlock(e) {
  const def = e?.def, it = e?.it;
  if (!def) return 'Unknown item.';
  if (e.soulbound || it?.soulbound) return 'Soulbound: it cannot be traded.';
  if (def.kind === 'body' || def.id === 'body' || it?.type === 'body') return 'Bodies cannot be traded.';
  if (!C.itemSize(def)) return 'Too big to hand over.';
  if (def.special || def.hot || def.cursed || def.notrade) return 'Too dangerous to hand over.';
  if (it?.ladder) return 'Fold the ladder first.';
  if (it?.carrier) return 'Out of reach.';
  return null;
}

export const cleanIds = (raw, max = RULES.maxItems) => {
  const out = [];
  if (!Array.isArray(raw)) return out;
  for (const id of raw) if (typeof id === 'string' && id.length <= 64 && !out.includes(id)) out.push(id);
  return out.slice(0, max + 1);   // one extra so validateOffer can report 'too many'
};
export const cleanClout = (v) => clampInt(v, 0, RULES.maxClout);

/** The sender holds every offered item and none is blocked. { ok } | { ok:false, why, id? } */
export function validateOffer(entries, ids) {
  if (ids.length > RULES.maxItems) return { ok: false, why: 'Too many items.' };
  const byId = new Map(entries.map((e) => [e.id, e]));
  for (const id of ids) {
    const e = byId.get(id);
    if (!e) return { ok: false, why: 'That item is gone.', id };
    const w = tradeBlock(e);
    if (w) return { ok: false, why: w, id };
  }
  return { ok: true };
}

// ------------------------------------------------------------------ atomic swap plan
const hotCount = (list) => list.reduce((n, e) => n + (e.inv ? 0 : 1), 0);

/** What one player's inventory looks like after giving `give` away and receiving `incoming` (entries of the other side). */
function receiveSide(side, give, incoming) {
  const bx = clampInt(side.bx, 0, C.MAX_EXTRA_COLS), hs = clampInt(side.hs, 1, C.MAX_HOTBAR);
  let cur = side.entries.filter((e) => !give.has(e.id));
  const grid = C.gridOfList(cur, bx);            // the bag may be leaving: pockets again
  const repack = [];
  if (!C.buildOcc(cur, grid)) {                  // remaining bag items no longer fit their (smaller) grid: pack them again
    const lay = C.packLayout(cur.filter((e) => e.inv?.k === 'bag'), grid);
    if (!lay) return { ok: false, why: 'noroom' };
    for (const [id, iv] of lay) repack.push([id, iv]);
    cur = C.applyMoves(cur, repack);
  }
  const moves = [];
  for (const e of incoming.slice().sort(C.sortCompare)) {
    const size = C.itemSize(e.def);
    const spot = size ? C.findSpot(cur, grid, size) : null;
    let inv = null;
    if (spot) inv = { k: 'bag', x: spot.x, y: spot.y };
    else if (hotCount(cur) >= hs) return { ok: false, why: 'noroom' };
    cur.push({ ...e, inv });
    moves.push({ id: e.id, inv });
  }
  if (C.validateState(cur, { extraCols: bx, maxHot: hs })) return { ok: false, why: 'noroom' };
  return { ok: true, moves, repack };
}

/**
 * sides = [{ peer, entries, give: [ids], bx, hs }, { ... }]  (entries = EVERYTHING that peer holds).
 * -> { ok:true, transfers:[{ id, from, to, inv }], repack:{ [peer]: [[id, inv]] } }
 *  | { ok:false, why: 'invalid'|'noroom', who: peerThatCannotReceive }
 * Nothing is applied here: the host applies the whole plan in one go or nothing at all (no dupes, no loss).
 */
export function planTrade(sides) {
  const [A, B] = sides;
  if (!A || !B || A.peer === B.peer) return { ok: false, why: 'invalid', who: A?.peer };
  const giveA = new Set(cleanIds(A.give)), giveB = new Set(cleanIds(B.give));
  for (const id of giveA) if (giveB.has(id)) return { ok: false, why: 'invalid', who: A.peer };
  const pick = (s, give) => {
    const out = [];
    for (const id of give) { const e = s.entries.find((x) => x.id === id); if (!e) return null; out.push(e); }
    return out;
  };
  const outA = pick(A, giveA), outB = pick(B, giveB);
  if (!outA) return { ok: false, why: 'invalid', who: A.peer };
  if (!outB) return { ok: false, why: 'invalid', who: B.peer };
  if (outA.some((e) => tradeBlock(e))) return { ok: false, why: 'invalid', who: A.peer };
  if (outB.some((e) => tradeBlock(e))) return { ok: false, why: 'invalid', who: B.peer };
  const rA = receiveSide(A, giveA, outB);
  if (!rA.ok) return { ok: false, why: rA.why, who: A.peer };
  const rB = receiveSide(B, giveB, outA);
  if (!rB.ok) return { ok: false, why: rB.why, who: B.peer };
  return {
    ok: true,
    transfers: [...rA.moves.map((m) => ({ ...m, from: B.peer, to: A.peer })), ...rB.moves.map((m) => ({ ...m, from: A.peer, to: B.peer }))],
    repack: { [A.peer]: rA.repack, [B.peer]: rB.repack },
  };
}

// ------------------------------------------------------------------ the state machine
const blank = () => ({ items: [], clout: 0, q: 0 });

/**
 * One trade between a (requester) and b. States: pending -> open <-> countdown -> exec -> done, or cancelled.
 *  - both sides edit their offer freely while `open`; ANY change (items, Clout, lock, unlock) resets every lock + accept;
 *  - LOCK freezes your side; ACCEPT needs BOTH sides locked; both accepted starts the countdown (RULES.countdown s);
 *  - anything that changes an offer during the countdown aborts the countdown (back to `open`, locks cleared).
 * Pure bookkeeping: the host validates items / distance / phase and calls cancel(); tick() only reports 'execute'.
 */
export class TradeSession {
  constructor(id, a, b, now = 0) {
    this.id = id; this.a = a; this.b = b;
    this.state = 'pending';
    this.created = now; this.touched = now; this.countdownEnd = 0;
    this.offer = { [a]: blank(), [b]: blank() };
    this.locked = { [a]: false, [b]: false };
    this.accepted = { [a]: false, [b]: false };
    this.meta = { [a]: { bx: 0, hs: 4 }, [b]: { bx: 0, hs: 4 } };
    this.ver = 0;
    this.result = null;   // { why, by } once cancelled
  }
  has(p) { return p === this.a || p === this.b; }
  other(p) { return p === this.a ? this.b : this.a; }
  get live() { return this.state === 'pending' || this.state === 'open' || this.state === 'countdown' || this.state === 'exec'; }
  get editable() { return this.state === 'open' || this.state === 'countdown'; }
  setMeta(peer, m) {
    if (!this.has(peer) || !isObj(m)) return;
    this.meta[peer] = { bx: clampInt(m.bx, 0, C.MAX_EXTRA_COLS), hs: clampInt(m.hs ?? 4, 1, C.MAX_HOTBAR) };
  }
  /** b answers the request. */
  respond(peer, ok, now = 0) {
    if (this.state !== 'pending' || peer !== this.b) return false;
    if (!ok) { this.cancel('declined', peer); return true; }
    this.state = 'open'; this.touched = now; this.ver++;
    return true;
  }
  /** Any edit: drops every lock + accept and aborts a running countdown. */
  resetConfirm() {
    this.locked[this.a] = this.locked[this.b] = false;
    this.accepted[this.a] = this.accepted[this.b] = false;
    if (this.state === 'countdown') this.state = 'open';
    this.countdownEnd = 0;
    this.ver++;
  }
  /** Set one side's offer (already validated by the host). false = not editable; 'same' = nothing changed. */
  setOffer(peer, ids, clout, now = 0, q = 0) {
    if (!this.has(peer) || !this.editable) return false;
    const o = this.offer[peer];
    o.q = q | 0;
    const items = cleanIds(ids).slice(0, RULES.maxItems), c = cleanClout(clout);
    const same = c === o.clout && items.length === o.items.length && items.every((id) => o.items.includes(id));
    if (same) return 'same';
    o.items = items; o.clout = c;
    this.touched = now;
    this.resetConfirm();
    return true;
  }
  /** Drop items that left the sender's inventory (sold / dropped / died); resets the confirmations when it changed something. */
  prune(peer, keep) {
    const o = this.offer[peer];
    const items = o.items.filter((id) => keep(id));
    if (items.length === o.items.length) return false;
    o.items = items;
    this.resetConfirm();
    return true;
  }
  setLock(peer, on, now = 0) {
    if (!this.has(peer) || !this.editable) return false;
    on = !!on;
    if (this.locked[peer] === on) return true;
    this.touched = now;
    if (!on) { this.resetConfirm(); return true; }   // unlocking is a change: everything back to editing
    this.locked[peer] = true;
    this.accepted[peer] = false;
    this.ver++;
    return true;
  }
  canAccept() { return this.editable && this.locked[this.a] && this.locked[this.b]; }
  accept(peer, now = 0) {
    if (!this.has(peer) || !this.canAccept()) return false;
    if (this.accepted[peer]) return true;
    this.accepted[peer] = true;
    this.touched = now;
    this.ver++;
    if (this.accepted[this.a] && this.accepted[this.b] && this.state === 'open') { this.state = 'countdown'; this.countdownEnd = now + RULES.countdown; }
    return true;
  }
  cancel(why = 'error', by = null) {
    if (!this.live) return false;
    this.state = 'cancelled';
    this.result = { why, by };
    this.ver++;
    return true;
  }
  /** Returns 'execute' when the countdown is over, or cancels on expiry (returns 'expired'). */
  tick(now) {
    if (this.state === 'pending' && now - this.created >= RULES.requestTtl) { this.cancel('expired'); return 'expired'; }
    if (this.state === 'open' && now - this.touched >= RULES.idleTtl) { this.cancel('timeout'); return 'expired'; }
    if (this.state === 'countdown' && now >= this.countdownEnd) return 'execute';
    return null;
  }
  countdownLeft(now) { return this.state === 'countdown' ? Math.max(0, this.countdownEnd - now) : 0; }
  /** Plain object for the wire (`trs`): both sides' offers + lock / accept flags + the countdown. */
  snapshot(now = 0) {
    const side = (p) => ({ i: this.offer[p].items.slice(), c: this.offer[p].clout, l: this.locked[p] ? 1 : 0, k: this.accepted[p] ? 1 : 0, q: this.offer[p].q });
    return { tid: this.id, a: this.a, b: this.b, st: this.state, v: this.ver, cd: +this.countdownLeft(now).toFixed(2), p: { [this.a]: side(this.a), [this.b]: side(this.b) } };
  }
}

// ------------------------------------------------------------------ comparison
export const STAT_LABEL = Object.freeze({
  dmg: 'Damage', cd: 'Cooldown', reach: 'Reach', armor: 'Damage reduction', luck: 'crew luck', crit: 'crit', stamina: 'max stamina',
  regenPct: 'stamina regen', scan: 'scan range', battery: 'battery life', cells: 'Grid', weightMul: 'Stashed weight', weight: 'Weight', value: 'Value',
});
const LOWER_IS_BETTER = new Set(['cd', 'weight', 'weightMul']);
const rnd = (v) => Math.round(v * 100) / 100;

/** Numeric stats of an item ({ def, tier?, plus?, value? } - a world item or a plain object). */
export function itemStats(it) {
  const def = it?.def;
  if (!def) return {};
  const tier = it.tier && tierDef(it.tier) ? it.tier : tierOfItem(it, def);
  const mul = tierDef(tier).statMul * plusMul(it.plus || 0);
  const s = { weight: def.weight || 0 };
  if (it.value || (Array.isArray(def.value) && def.value[1])) s.value = it.value || 0;
  if (def.kind === 'weapon') {
    s.dmg = rnd((def.dmg || 0) * mul); s.cd = def.cd || 0; s.reach = def.reach || 0;
  }
  const g = def.gear;
  if (g) for (const k of ['armor', 'luck', 'crit', 'stamina', 'regenPct', 'scan', 'battery']) if (g[k]) s[k] = rnd(g[k] * mul * (k === 'armor' || k === 'luck' || k === 'crit' || k === 'regenPct' || k === 'battery' ? 100 : 1));
  if (def.kind === 'bag') { const b = C.bagInfo(def); s.cells = b.cols * b.rows; s.weightMul = b.weightMul; }
  return s;
}

/** [{ key, label, a, b, delta, better: 'up'|'down'|'same' }] for the stats either item has ("a" = the item being inspected). */
export function compareItems(a, b) {
  if (!a || !b) return [];
  const A = itemStats(a), B = itemStats(b);
  const rows = [];
  for (const key of ['dmg', 'cd', 'reach', 'armor', 'luck', 'crit', 'stamina', 'regenPct', 'scan', 'battery', 'cells', 'weightMul', 'value', 'weight']) {
    if (A[key] === undefined && B[key] === undefined) continue;
    const x = A[key] ?? 0, y = B[key] ?? 0;
    const delta = rnd(x - y);
    const better = delta === 0 ? 'same' : ((delta > 0) !== LOWER_IS_BETTER.has(key) ? 'up' : 'down');
    rows.push({ key, label: STAT_LABEL[key], a: x, b: y, delta, better });
  }
  return rows;
}

/** The item of mine an inspected item should be compared with (equipped gear of that slot, my best weapon, same type). */
export function comparableFor(it, mine) {
  const def = it?.def;
  if (!def || !Array.isArray(mine)) return null;
  const others = mine.filter((e) => e.id !== it.id && e.def);
  if (def.kind === 'armor') return others.find((e) => e.inv?.k === 'eq' && e.inv.s === 'armor') || others.find((e) => e.def.kind === 'armor') || null;
  if (def.kind === 'bag') return others.find((e) => e.inv?.k === 'eq' && e.inv.s === 'bag') || others.find((e) => e.def.kind === 'bag') || null;
  if (def.kind === 'trinket') {
    const worn = others.filter((e) => e.def.kind === 'trinket' && e.inv?.k === 'eq');
    return worn.find((e) => e.def.id === def.id) || worn[0] || others.find((e) => e.def.kind === 'trinket') || null;
  }
  if (def.kind === 'weapon') {
    const ws = others.filter((e) => e.def.kind === 'weapon').sort((p, q) => (itemStats(q).dmg || 0) - (itemStats(p).dmg || 0));
    return ws.find((e) => e.def.id === def.id) || ws[0] || null;
  }
  return others.find((e) => e.def.id === def.id) || null;
}

/** Total shown under an offer: sellable value of the items. */
export const offerValue = (items) => items.reduce((n, it) => n + (it?.value || 0), 0);
