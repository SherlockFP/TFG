// Wave-2 TRADE proof (body of an async function, run by tools/harness/headless.mjs after boot).
//   flock /tmp/tfg-browser.lock timeout 400 node tools/harness/headless.mjs --port 5268 --script tools/harness/wave2_trade.js --shot /tmp/trade.png
// 1) icons: renders every registered item's icon (batched queue), reports items without a 3D model and how many icons are blank / glyph
//    fallbacks (before = would have been blank or the "?" box with the old icons.js; after = blank count, must be 0);
// 2) trading: a FAKE second player ('bob': RemotePlayer + net.players entry) is driven through the host state machine directly
//    (handlers called with from = 'bob'; his outgoing messages are captured, his Clout debit is auto-confirmed); the window opens on the
//    host's screen, both sides lock, the trade is left in the "both locked" state so --shot captures the window with icons.
// NOTE: written under a browser freeze - NOT RUN. Expect small harness-level fixes on the first run. The node test
// (tools/harness/trade.test.mjs) covers the state machine + host flow with a mock game and passes.
const g = kefal.game, T = g.trade, R = { installed: !!T, errs: [] };
addEventListener('error', (e) => R.errs.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
if (!T) return R;

// ---- 1) icons
const a0 = T.iconAudit();
const pending0 = await T.warmIcons(90000);
const a1 = T.iconAudit();
R.icons = {
  total: a1.total, realModelIcons: a1.model, glyphFallbacks: a1.glyph.length, blank: a1.blank.length, stillPending: pending0,
  withoutModel: a1.noModel.map((r) => `${r.id}(${r.kind})`),
  beforeEstimate: a1.noModel.length + a1.glyph.filter((r) => !a1.noModel.some((n) => n.id === r.id)).length,   // no model -> "?" box, model that failed to render -> blank
  byKind: Object.fromEntries(Object.entries(a1.byKind).map(([k, v]) => [k, `${v.total - v.noModel}/${v.total} have a model`])),
};

// ---- 2) trading against a fake peer
const { RemotePlayer } = await import('/src/entities/remote.js');
g.run.phase = g.run.phase === 'landing' || g.run.phase === 'takeoff' ? 'orbit' : g.run.phase;
g.net.players.set('bob', { id: 'bob', name: 'Bob', level: 7, pid: 'bob-pid' });
const bob = new RemotePlayer(g, 'bob', { name: 'Bob', level: 7, suit: 'orange' });
bob.pos.set(g.player.pos.x + 2, g.player.pos.y, g.player.pos.z); bob.target.copy(bob.pos); bob.lastUpdate = 1;
g.remotes.set('bob', bob);
const P = () => new THREE.Vector3(g.player.pos.x + 1, g.player.pos.y + 1, g.player.pos.z);
const mine = ['machete', 'pipe', 'arm_riot', 'trk_dongle', 'ring'].map((ty) => g.items.hostSpawn(ty, P(), { holder: g.selfId, inv: 'bag', rollTier: true }));
const theirs = ['shovel', 'arm_kevlar', 'goldbar', 'flashlight'].map((ty) => g.items.hostSpawn(ty, P(), { holder: 'bob', inv: 'bag', rollTier: true }));
await wait(300);

const inbox = [];
const send = g.net.sendTo.bind(g.net);
g.net.sendTo = (peer, t, d) => { if (peer === 'bob') { inbox.push([t, d.k || d.st]); if (t === 'trc') setTimeout(() => g.net.handlers.get('trca')({ tid: d.tid, ok: true }, 'bob'), 0); } else send(peer, t, d); };
const H = (a, d, from) => g.net.handlers.get(a)({ a, bx: 0, hs: 4, ...d }, from);
g.profile.coins = Math.max(g.profile.coins || 0, 500);

H('trreq', { to: 'bob' }, g.selfId);
const tid = T.host.sessionOf(g.selfId)?.id;
H('tracc', { tid, ok: true }, 'bob');
await wait(200);
R.opened = { tid, state: T.host.sessionOf(g.selfId)?.state, panelOpen: !!g.ui.panelOpen?.classList.contains('trd') };
H('troff', { tid, items: mine.slice(0, 3), clout: 25, q: 1 }, g.selfId);
H('troff', { tid, items: theirs.slice(0, 3), clout: 10, q: 1 }, 'bob');
await wait(200);
H('trlock', { tid, on: true }, g.selfId); H('trlock', { tid, on: true }, 'bob');
await wait(300);
R.locked = { snap: T.state().snap && { st: T.state().snap.st, lk: Object.values(T.state().snap.p).map((p) => p.l) }, tiles: g.ui.panelOpen?.querySelectorAll('.trd-it').length };
await T.warmIcons(5000);

// ---- state machine to completion in a second trade (leave the first one open for the screenshot? no: screenshot state = both locked)
R.msgsToBob = inbox.map((x) => x.join(':')).slice(0, 20);
R.errs = R.errs.slice(0, 5);
return R;
