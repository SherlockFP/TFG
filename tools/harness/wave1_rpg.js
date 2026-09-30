// Headless body for tools/harness/headless.mjs (rpg module): role pick, node allocation changes game stats, refund, save/load
// round trip, dynamic keystone, daily kit, terminal, panel. Leaves the passive tree panel OPEN for the screenshot.
//   flock /tmp/tfg-browser.lock node tools/harness/headless.mjs --port 5185 --script tools/harness/wave1_rpg.js --shot /tmp/rpg.png
const g = kefal.game, R = g.rpg, errs = [], out = { fails: [] };
addEventListener('error', (e) => errs.push(e.message));
const ok = (c, m) => { if (!c) out.fails.push(m); return !!c; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
if (!ok(R, 'game.rpg missing')) return out;

const P = g.profile;
// Native fresh access: opening the complete tree must not require quota or grant progression.
const beforeAccess={points:P.skillPoints,nodes:[...(P.rpg?.nodes||[])]};
const accessKey=g.settings?.keys?.skillTree||'KeyK';
window.dispatchEvent(new KeyboardEvent('keydown',{code:accessKey,key:'k',bubbles:true,cancelable:true}));
ok(!!g.ui.panelOpen?.querySelector?.('.pt-canvas'),'native tree hotkey opens the full panel on a fresh profile');
ok(P.skillPoints===beforeAccess.points&&JSON.stringify(P.rpg?.nodes||[])===JSON.stringify(beforeAccess.nodes),'opening tree grants no points or ranks');
R.close();
P.skillPoints = 60; P.coins = 3000;
g.refreshStats();
const base = { ...g.stats };
out.phase = g.run.phase;
ok(g.run.phase === 'orbit', 'expected orbit at boot');
ok(R.role() === null, 'fresh profile has no role');
ok(!R.allocate('scout_s1').ok, 'cannot allocate without a role');

// ---- role
ok(R.setRole('scout') === true, 'setRole scout');
ok(R.role() === 'scout', 'role() = scout');
g.refreshStats();
ok(Math.abs(g.stats.speedMul - (base.speedMul + 0.06)) < 1e-6, 'scout role: +6% speed in game.stats');
ok(g.stats.scanRange === base.scanRange + 4, 'scout role: +4 m scan range');
ok(R.bonus('moveSpeed') === 0.06 && R.bonus('scanRange') === 4, 'bonus() reads role bonuses');
out.roleStats = { speedMul: g.stats.speedMul, scanRange: g.stats.scanRange };

// ---- allocation changes stats
const sp0 = g.stats.speedMul, pts0 = R.points();
const a1 = R.allocate('scout_s1');
ok(a1.ok, 'allocate scout_s1: ' + a1.msg);
ok(Math.abs(g.stats.speedMul - (sp0 + 0.03)) < 1e-6, 'scout_s1: +3% speed');
ok(R.points() === pts0 - 1, 'a point was spent');
const mh0 = g.stats.maxStamina;
const far = R.plan('ghoststep');
ok(far.ok && far.affordable, 'plan ghoststep affordable');
const a2 = R.allocate('ghoststep');
ok(a2.ok, 'allocate ghoststep path: ' + a2.msg);
ok(R.has('Ghost Step') && R.has('ghoststep') && R.has('ghost_step'), 'has() normalises ids');
ok(R.bonus('noise') < -0.2, 'ghost step quiets you');
ok(g.stats.maxStamina < mh0 + 40, 'ghost step -20 stamina applied via stats path');
out.afterKeystone = { points: R.points(), stamina: g.stats.maxStamina, noise: R.bonus('noise'), nodes: P.rpg.nodes.length };
const pwrapped = g.player.update !== Object.getPrototypeOf(g.player).update;
ok(pwrapped, 'player.update is wrapped (noise / no-sprint)');

// ---- refund (free undo for a fresh node) and connectivity rule
const info = R.refundInfo('ghoststep');
ok(info.ok && info.free, 'fresh keystone refunds free');
const coins0 = P.coins, pts1 = R.points();
const rf = R.refund('ghoststep');
ok(rf.ok && !R.isAllocated('ghoststep'), 'refund ghoststep');
ok(P.coins === coins0 && R.points() === pts1 + 2, 'free refund gives the 2 points back, no Clout');
const mid = P.rpg.nodes.find((id) => id !== 'scout_s1');
if (mid) ok(R.refundInfo('scout_s1').ok === false || P.rpg.nodes.length === 1, 'cannot refund a node other nodes depend on');

// ---- dynamic keystone: Adrenaline Junkie (below 40% HP)
R.allocate('adrenalinejunkie');
ok(R.has('adrenalinejunkie'), 'adrenaline junkie allocated');
g.player.hp = g.player.maxHp;
kefal.tick(20, 1 / 30, false);
const calm = g.stats.speedMul;
g.player.hp = 10;
kefal.tick(20, 1 / 30, false);
ok(g.stats.speedMul > calm + 0.25, `adrenaline: +30% speed at low HP (${calm} -> ${g.stats.speedMul})`);
ok(R.bonus('meleeDmg') >= 0.25, 'adrenaline melee bonus visible through bonus()');
g.player.hp = g.player.maxHp;
kefal.tick(20, 1 / 30, false);
ok(Math.abs(g.stats.speedMul - calm) < 1e-6, 'adrenaline bonus ends at full HP');
R.refund('adrenalinejunkie');

// ---- save / load round trip (profile JSON -> ensure -> derivedStats)
const { ensureRpgProfile } = await import('/src/game/profile.js');
const { derivedStats } = await import('/src/game/progression.js');
const copy = JSON.parse(JSON.stringify(P));
ensureRpgProfile(copy);
ok(JSON.stringify(copy.rpg.nodes) === JSON.stringify(P.rpg.nodes) && copy.rpg.role === P.rpg.role, 'rpg state survives a save / load round trip');
ok(copy.skillPoints === P.skillPoints, 'skill points survive');
ok(Math.abs(derivedStats(copy).speedMul - g.stats.speedMul) < 1e-6, 'derivedStats(loaded) == game.stats');
// legacy save: old skills are refunded once
const legacy = { id: 'legacy', level: 20, xp: 0, coins: 0, skillPoints: 1, skills: { vit: 4, end: 2, str: 0, agi: 3, lck: 0, tec: 1 } };
ensureRpgProfile(legacy);
ok(legacy.skillPoints === 11 && legacy.skills.vit === 0 && legacy.rpg.migrated.skills === 10, 'legacy skills migrated into points');

// ---- role switch needs orbit; orphan refund
R.allocate('scout_n1');
const cl0 = P.coins;
ok(R.setRole('medic') === true, 'switch to medic in orbit');
ok(P.coins < cl0, 'orphaned nodes were refunded for Clout');
ok(P.rpg.nodes.every((id) => !id.startsWith('scout_')), 'no scout nodes left after switching');
R.setRole('scout');
g.run.phase = 'moon';
ok(R.setRole('hauler') === false && R.role() === 'scout', 'roles locked while landed');
g.run.phase = 'orbit';

// ---- daily kit (host validates once per day)
R.setRole('medic');
g.run.phase = 'moon';
const before = [...g.items.all()].filter((it) => it.type === 'medkit').length;
g.net.request('rpgkit', {});
await wait(50);
const kit1 = [...g.items.all()].filter((it) => it.type === 'medkit').length;
g.net.request('rpgkit', {});
await wait(50);
const kit2 = [...g.items.all()].filter((it) => it.type === 'medkit').length;
g.run.phase = 'orbit';
ok(kit1 === before + 1 && kit2 === before + 1, `medic kit spawns once per day (${before} -> ${kit1} -> ${kit2})`);

// ---- terminal
g.terminal.exec('role');
g.terminal.exec('tree');
const lines = g.terminal.lines.map((l) => l.text).join('\n');
ok(/ROLES \(yours: FIELD MEDIC\)/.test(lines) && /PASSIVE TREE: role Field Medic/.test(lines), 'terminal ROLE / TREE print');

// ---- crew role name tag (remote player + role gossip over 'rpgst')
g.ensureRemote('peerX', { name: 'Bob', level: 7 });
g.net.msgHandlers.get('rpgst')({ role: 'medic', sv: 1.1 }, 'peerX');
kefal.tick(4, 1 / 30, false);
const rem = g.remotes.get('peerX');
ok(R.roleOf('peerX') === 'medic', 'roleOf(peer) after rpgst');
ok(rem?.tag?.material?.map?.image?.__rpgRole === 'medic', 'crew name tag carries the role suffix');
rem?.dispose(); g.remotes.delete('peerX');

// ---- sale hook does not throw (no company map loaded: original returns early)
g.run.phase = 'company';
try { g.hostSell(g.selfId); } catch (e) { ok(false, 'hostSell wrapper threw: ' + e.message); }
g.run.phase = 'orbit';

// ---- TAB character sheet hook + roles panel DOM
g.ui.openTab();
const sheet = document.querySelector('.skills')?.textContent || '';
ok(/PASSIVE TREE/.test(sheet) && !/Vitality|VIT/.test(sheet), 'TAB sheet shows the passive tree buttons instead of legacy skill rows');
g.ui.closePanel();
const rp = R.openRoles();
await wait(150);
const cards = [...document.querySelectorAll('.rl-card')];
const cr = cards[0]?.getBoundingClientRect();
out.roles = { cards: cards.length, w: cr && Math.round(cr.width), h: cr && Math.round(cr.height), icons: document.querySelectorAll('.rl-card canvas').length };
ok(cards.length === 6 && cr && cr.width > 200 && cr.height > 150 && out.roles.icons === 6, 'roles panel renders six cards with icons');
g.ui.closePanel();

// ---- panel (left open for the screenshot)
R.setRole('scout');
R.allocate('scout_nl'); R.allocate('scout_nr'); R.allocate('scout_n1'); R.allocate('ghoststep');
g.ui.closePanel?.();
const panel = R.open();
ok(!!panel && R.isOpen(), 'passive tree panel opens');
await wait(700);
panel?.hoverNode?.('lonewolf');
await wait(400);
out.panel = { open: R.isOpen(), canvas: !!document.querySelector('.pt-canvas'), points: R.points(), nodes: P.rpg.nodes.length };

out.errs = errs;
ok(errs.length === 0, 'page errors: ' + errs.join(' | '));
return out;
