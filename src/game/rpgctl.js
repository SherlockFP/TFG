// Passive-tree operations on a profile: allocate (whole path), refund, respec, role switch. [followers] refunds / respec / role switches are FREE: Followers are never spent.
// Used identically in game (rpg.js wires hooks to the Progress / stats / net layer) and from the main menu (profile only),
// so both entry points obey the same rules. Pure w.r.t. three / DOM; returns { ok, msg } for the UI to show.
import { saveProfile } from '../core/save.js';
import { aAn } from '../core/util.js';
import * as T from './passivetree.js';
import { ensureRpgProfile } from './profile.js';

// Nodes allocated during this page session refund for free (an "undo" so experimenting costs nothing). Not saved.
const freshByProfile = new Map();
const freshOf = (p) => { let s = freshByProfile.get(p.id); if (!s) freshByProfile.set(p.id, (s = new Set())); return s; };

/**
 * hooks (all optional):
 *   changed(kind, detail)     after any mutation: 'alloc' | 'refund' | 'respec' | 'role'  (default: save the profile)
 *   canRespec() -> {ok,msg}   gate for refunds / respec (default: always)
 *   canChangeRole() -> {ok,msg}
 */
export function createRpgController(profile, hooks = {}) {
  ensureRpgProfile(profile);
  const st = () => profile.rpg;
  const changed = (kind, detail) => { (hooks.changed || (() => saveProfile(profile)))(kind, detail); };
  const fresh = () => freshOf(profile);
  const gateRespec = () => (hooks.canRespec ? hooks.canRespec() : { ok: true });
  const gateRole = () => (hooks.canChangeRole ? hooks.canChangeRole() : { ok: true });

  const ctl = {
    profile,
    state: st,
    role: () => st().role,
    roleDef: () => T.roleDef(st().role),
    points: () => Math.max(0, profile.skillPoints | 0),
    coins: () => profile.coins | 0,
    spent: () => T.treeSpent(st()),
    allocated: () => T.allocatedSet(st()),
    isAllocated: (id) => T.allocatedSet(st()).has(id),
    bonus: (key) => T.treeBonus(st())[key] || 0,
    has: (id) => T.treeFlags(st()).has(T.normId(id)),
    canChangeRole: gateRole,
    canRespec: gateRespec,

    /** What clicking `id` would do right now: { ok, reason, path, cost, affordable }. */
    plan(id) {
      const p = T.planAllocation(st(), id);
      p.affordable = p.ok && ctl.points() >= p.cost;
      if (p.ok && !p.affordable) p.reason = `Needs ${p.cost} point${p.cost === 1 ? '' : 's'} (you have ${ctl.points()})`;
      return p;
    },
    allocate(id) {
      const p = ctl.plan(id);
      if (!p.ok || !p.affordable) return { ok: false, msg: p.reason || 'Cannot allocate' };
      for (const nid of p.path) { st().nodes.push(nid); fresh().add(nid); }
      profile.skillPoints -= p.cost;
      changed('alloc', { ids: p.path, cost: p.cost });
      return { ok: true, msg: p.path.length > 1 ? `Allocated ${p.path.length} nodes (${p.cost} points)` : `Allocated ${T.NODE[id].name}`, added: p.path };
    },

    /** { ok, reason, cost, free } for refunding one node. */
    refundInfo(id) {
      const n = T.NODE[id];
      const g = gateRespec();
      if (!g.ok) return { ok: false, reason: g.msg, cost: 0, free: false };
      const r = T.planRefund(st(), id);
      if (!r.ok) return { ...r, cost: 0, free: false };
      const free = fresh().has(id);
      return { ok: true, reason: '', cost: 0, free: true };
    },
    refund(id) {
      const info = ctl.refundInfo(id);
      if (!info.ok) return { ok: false, msg: info.reason };
      st().nodes = st().nodes.filter((x) => x !== id);
      fresh().delete(id);
      profile.skillPoints += T.nodeCost(T.NODE[id]);
      changed('refund', { id, cost: info.cost });
      return { ok: true, msg: 'Refunded (free undo)' };
    },

    respecCost() { return 0; },   // [followers] free
    respecAll() {
      const g = gateRespec();
      if (!g.ok) return { ok: false, msg: g.msg };
      if (!st().nodes.length) return { ok: false, msg: 'Nothing to refund' };
      const cost = ctl.respecCost();
      const back = T.treeSpent(st());
      st().nodes = [];
      fresh().clear();
      profile.skillPoints += back;
      changed('respec', { cost, points: back });
      return { ok: true, msg: `Respec done: ${back} points back` };
    },

    previewRole(id) { return { ...T.planRoleSwitch(st(), id), clout: 0, current: st().role === id }; },   // [followers] role switches are free
    setRole(id) {
      if (!T.ROLES[id]) return { ok: false, msg: 'Unknown role' };
      if (st().role === id) return { ok: true, msg: 'Already your role', same: true };
      const g = gateRole();
      if (!g.ok) return { ok: false, msg: g.msg };
      const plan = T.planRoleSwitch(st(), id);
      const drop = new Set([...plan.orphans, ...plan.freed]);
      st().nodes = st().nodes.filter((x) => !drop.has(x));
      for (const x of drop) fresh().delete(x);
      profile.skillPoints += plan.points;
      const prev = st().role;
      st().role = id;
      changed('role', { role: id, prev, refunded: plan.orphans.length, clout: 0 });
      return { ok: true, msg: `You are now ${aAn(T.ROLES[id].name)} ${T.ROLES[id].name}`, role: id, prev };
    },
  };
  return ctl;
}
