// Feature body for headless.mjs (wave-1 LORE): contracts offered/accepted/completed + payout, SIGN -> rep -> WAR at
// < -40 + invasion call path (stub horde), Algorithm lines on landing/death + cooldown, case file with LAST WORDS.
// Ends with the case file card on screen. Optional: window.__loreShot(name) (custom runner) screenshots the board.
const g = kefal.game, errs = []; addEventListener('error', (e) => errs.push(e.message));
const L = g.lore, core = L.core, out = {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tick = async (n) => { for (let i = 0; i < n; i++) { kefal.tick(5, 1 / 30, false); await sleep(5); } };
const says = [];
const show0 = core.algo.show;
core.algo.show = (d) => { says.push(d.key || (d.fv ? d.fv + ':' + d.fk : 'text')); return show0(d); };
const wars = [];
g.mods.on('tfg:war', (d) => wars.push(d));
const squads = [];
g.horde = { spawnHitSquad: (f, pos, n) => { squads.push({ f, n, pos: pos && [Math.round(pos.x), Math.round(pos.y), Math.round(pos.z)] }); return true; } };
const land = async (moon) => {
  g.run.moon = moon; g.player.inShip = true; g.hostLever(g.selfId); g.hostFinishLanding();
  await tick(20);
};
const takeoff = async () => {
  if (!g.player.dead) { g.player.teleport(new THREE.Vector3(0, 1, 0)); g.player.inShip = true; }
  g.hostBeginTakeoff('lever'); g.hostFinishTakeoff(); await tick(4); await sleep(400);
};

// ---- orbit: offers, accept, sign -> war
out.offers = g.run.contracts.offers.map((o) => `${o.faction}/${o.type}/n${o.n}/▮${o.reward.credits}${o.chain !== null && o.chain !== undefined ? '/chain' + (o.chain + 1) : ''}`);
g.run.contracts.offers[0] = { ...g.run.contracts.offers[0], type: 'salvage', n: 40, cls: undefined, mode: undefined, brief: ['Secure ▮{n} of scrap in the ship today.', ''] };
const off0 = g.run.contracts.offers[0];
g.net.request('lore', { op: 'accept', i: 0 });
out.accepted = g.run.contract?.state;
const repBefore = { ...g.run.factions };
g.net.request('lore', { op: 'sign', f: 'bureau' });
out.signRep = { bureau: [repBefore.bureau, g.run.factions.bureau], darkweb: [repBefore.darkweb, g.run.factions.darkweb] };
core.factions.hostAdd('darkweb', -5, 'test');
out.war = { darkweb: L.war('darkweb'), rep: L.factionRep('darkweb'), events: wars.map((w) => `${w.faction}:${w.on}`) };

// ---- day 1: brief line, contract completes, invasion path, cooldown, payout, case file
const credits0 = g.run.credits;
g.run.daysLeft = 3;
await land('hamsi');
await sleep(5200); await tick(4);
out.day1 = { focus: g.run.algo.focus, briefSaid: says.some((s) => s.startsWith('brief_')), logs: core.logs.placed() };
out.day1.planned = core.factions.plannedInvasions.map((v) => v.f);
out.day1.invasion = core.factions.invade('darkweb', 3);
out.day1.squads = squads.slice();
g.hostData.dayStats.collected = 60;
await tick(6);
out.day1.contractState = g.run.contract?.state;
const a = core.algo.hostSay('orbit_idle', {}, { force: true }), b = core.algo.hostSay('orbit_idle');
out.day1.cooldown = { first: a, secondBlocked: !b };
if (out.day1.logs[0]) g.net.request('lore', { op: 'log', id: out.day1.logs[0].id });
out.day1.logsRead = core.day.logsRead.size;
await takeoff();
out.day1.payout = { credits0, credits1: g.run.credits, contractAfter: g.run.contract, log: g.run.contractLog.slice(-1)[0], bureauRep: L.factionRep(off0.faction) };
out.day1.case = { n: g.profile.caseFiles?.[0]?.n, value: g.profile.caseFiles?.[0]?.value, contract: g.profile.caseFiles?.[0]?.contract?.result, verdict: g.profile.caseFiles?.[0]?.verdict?.key };
out.day1.cine = [g.ui.cineActive, ...g.ui.cineQ.map((c) => c.kind)];
out.newOffers = g.run.contracts.offers.length;

// ---- board screenshot (custom runner only): contract board + intercom line
g.ui.clearCinematics();
L.openBoard('contracts');
core.algo.hostSay('orbit_idle', {}, { force: true });
await sleep(2200);
if (window.__loreShot) await window.__loreShot('board');
g.ui.closePanel();

// ---- day 2: last words + death line + wipe case
await land('hamsi');
g.sendChat('GET THE FUCK OUT');
await sleep(60);
g.die('lurker');
await tick(4); await sleep(200);
out.day2 = { deathLine: says.some((s) => s === 'death' || s === 'all_dead') };
await takeoff();
const c2 = g.profile.caseFiles?.[0];
out.day2.case = c2 && { n: c2.n, lastWords: c2.lastWords, deaths: c2.deaths.map((d) => d.name + ':' + d.cause), allDead: c2.allDead, verdict: c2.verdict?.key, focusNext: g.run.algo.focus, mood: g.run.algo.mood };
out.says = says;
out.terminal = ['contracts', 'factions', 'cases', 'algo'].every((c) => g.mods.commands.has(c));

// ---- final screen: the case file card
g.ui.clearCinematics();
if (c2) core.cases.receive(c2);
await sleep(4800);
return { out, errs };
