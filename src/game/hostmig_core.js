// Host migration - pure rules (no DOM, no three.js), unit-tested by tools/harness/hostmig.test.mjs.
// The glue (dialog, rebuilding host state, net messages 'hmx' / 'hmclaim') is game/hostmig.js.

export const HM = {
  PROMPT_DELAY_MS: 6000,   // a host link that is merely "lost" (no bye) only raises the dialog after this long (a blip must not split the crew)
  AUTO_CLAIM_MS: 12000,    // the elected successor takes over by itself this long after the dialog opened (it may sit on the dialog)
  CLAIM_WAIT_MS: 30000,    // a follower that pressed Continue waits this long for the successor's claim, then skips it and elects the next one
  XCAST_MS: 3000,          // host -> crew 'hmx' snapshot interval
  PENDING_MS: 60000,       // a claim that arrives before we noticed the host loss is kept this long
  MAX_X_BYTES: 6000,       // 'hmx' payloads above this are sent without the (big) config block
};

// Rank of a peer in the crew's join order (host -> 'hmx'.o). Peers not in the list (joined after the last snapshot) come after all listed
// ones, sorted by id, so every peer that knows the same ids computes the same order.
export function rankKey(order, id) {
  const i = Array.isArray(order) ? order.indexOf(id) : -1;
  return i >= 0 ? [0, i, ''] : [1, 0, String(id)];
}
export function cmpRank(order, a, b) {
  const x = rankKey(order, a), y = rankKey(order, b);
  return x[0] - y[0] || x[1] - y[1] || (x[2] < y[2] ? -1 : x[2] > y[2] ? 1 : 0);
}
// Successor candidates: everybody known, alive, not the dead host, not skipped; lowest rank first.
//   ids: iterable of peer ids the caller knows (players + transport peers + self)
//   alive(id) -> bool (self is always alive)
export function candidates({ order, ids, self, oldHost, skip, alive }) {
  const out = [];
  const seen = new Set();
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    if (id === oldHost || (skip && skip.has(id))) continue;
    if (id !== self && !alive(id)) continue;
    out.push(id);
  }
  if (!seen.has(self) && self !== oldHost) out.push(self);
  return out.sort((a, b) => cmpRank(order, a, b));
}
export function elect(args) { return candidates(args)[0] ?? null; }

// New crew order after a migration: the new host first, then the previous order minus the dead host / anyone who is gone.
export function nextOrder(prevOrder, newHost, oldHost, ids) {
  ids = [...ids];
  const keep = new Set(ids);
  const out = [newHost];
  for (const id of prevOrder || []) if (id !== newHost && id !== oldHost && keep.has(id) && !out.includes(id)) out.push(id);
  for (const id of ids) if (id !== newHost && id !== oldHost && !out.includes(id)) out.push(id);   // join (Map insertion) order of the caller
  return out;
}

// HostCreature spawn options rebuilt from a client CreatureView (view.spawnData is the original 'sp' event).
// Secondary AI state (nest camps, boss phases, `data`) is NOT replicated to clients and comes back as defaults.
export function creatureOptsFromView(v, facilityY = -300) {
  const sd = v.spawnData || {};
  const p = v.target || v.pos;
  const def = v.def || {};
  const zone = def.zone === 'out' ? 'out' : (p.y < facilityY + 40 ? 'in' : 'out');
  return {
    id: v.id, level: v.level, elite: !!v.elite, variant: sd.vr ?? null, affix: v.affix ?? sd.af ?? null,
    tier: v.tier ?? sd.tr ?? null, fa: v.fgAff ?? sd.fa ?? undefined, yaw: v.targetYaw ?? v.yaw, state: v.state === 'dead' ? 'idle' : v.state,
    zone, extra: typeof v.extra === 'number' ? v.extra : 0, code: v.code || sd.code || null, seed: sd.seed, name: v.name || null, suit: sd.suit || null,
    up: !!sd.up, fakeLv: sd.fakeLv, fakeTitle: sd.ft || '',
  };
}

// Lightweight snapshot the host broadcasts ('hmx'): everything a successor needs that is NOT already replicated to every client
// (run state, items, creature views, remote players, doors all are).
export function buildX(hd, run, config, order, epoch, lobbyName) {
  hd = hd || {};
  const ds = hd.dayStats || {};
  const x = {
    e: epoch | 0, o: order,
    ds: { collected: ds.collected | 0, kills: ds.kills | 0, deaths: (ds.deaths || []).slice(0, 12), startCredits: ds.startCredits | 0, per: ds.per || {} },
    ps: hd.pressureStage | 0, mt: +(hd.moonT || 0), pu: [+(hd.powerUsed || 0), +(hd.outPowerUsed || 0)], tr: hd.takeoffReason || null, ln: lobbyName || null,
    t: run?.time ?? null,
  };
  try { const cj = JSON.stringify(config || {}); if (cj.length < 3000) x.cf = config; } catch { /* skip config */ }
  return x;
}

// hostData rebuilt from a snapshot (or defaults when none was ever received)
export function hostDataFrom(x, run, collectedIds, fresh) {
  const hd = {
    collected: new Set(collectedIds || []), dayStats: fresh(), spawnT: 20 + Math.random() * 20, outdoorSpawnT: 30 + Math.random() * 20,
    powerUsed: 0, outPowerUsed: 0, lastTimeSync: 0, alarmPlayed: (run?.time || 0) >= 23 * 60, allDeadT: 0, moonT: 0, pressureStage: 0, fuseDone: new Set(),
  };
  if (x) {
    if (x.ds) hd.dayStats = { collected: x.ds.collected | 0, kills: x.ds.kills | 0, deaths: Array.isArray(x.ds.deaths) ? x.ds.deaths : [], startCredits: x.ds.startCredits | 0, per: x.ds.per && typeof x.ds.per === 'object' ? x.ds.per : {} };
    hd.pressureStage = x.ps | 0; hd.moonT = +x.mt || 0;
    if (Array.isArray(x.pu)) { hd.powerUsed = +x.pu[0] || 0; hd.outPowerUsed = +x.pu[1] || 0; }
    if (x.tr) hd.takeoffReason = x.tr;
  }
  return hd;
}
