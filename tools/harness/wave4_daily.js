// Body for headless.mjs (wave 4 'daily'): exercises the retention loop in a real session.
//   flock /tmp/tfg-browser.lock node tools/harness/headless.mjs --port 5187 --script tools/harness/wave4_daily.js --shot /tmp/daily_login.png --wait 4000
// Returns key numbers + errors; leaves the LOGIN (calendar) tab of the DAILY panel open for the screenshot.
const g = kefal.game, out = {}, errs = [];
addEventListener('error', (e) => errs.push(e.message));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const D = g.daily;
out.installed = !!D;
if (!D) return { out, errs };
const svc = D.svc, P = g.profile, st = () => svc.state();

// ---- login calendar
const coins0 = P.coins;
out.loginBefore = svc.login().canClaim;
const cl = svc.claimLogin();
out.login = { ok: cl.ok, day: cl.day, streak: cl.streak, coinsGained: P.coins - coins0, stash: svc.stash().map((x) => x.join(':')).join(',') };
out.loginTwice = svc.claimLogin().ok;          // must be false
out.oldLoginBonusSilenced = P.login.day === Math.floor(Date.now() / 86400000);

// ---- challenges: feed events through the real hooks
const q = svc.quests();
out.daily = q.daily.map((x) => x.id);
out.weekly = q.weekly.map((x) => x.id);
g.onReward({ to: g.selfId, xp: 10, reason: 'Scrap secured', bounty: { type: 'collect', target: 'scrap', n: 900 } });
g.onReward({ to: g.selfId, xp: 10, reason: 'Scrap sold', bounty: { type: 'sell', target: 'value', n: 1200 } });
for (let i = 0; i < 6; i++) g.progress.kill('lurker');
out.progress = svc.quests().daily.map((x) => `${x.id}:${x.prog}`);
out.weekProgress = svc.quests().weekly.map((x) => `${x.id}:${x.prog}`);
// force one daily complete, claim it
const first = svc.quests().daily[0];
first.prog = svc.questTarget(first);
const xp0 = P.xp + P.level * 1e6;
const cq = svc.claimQuest('day', 0);
out.claimQuest = { ok: cq.ok, coin: cq.out?.coin, xp: cq.out?.xp, sxp: cq.out?.sxp };
out.claimQuestTwice = svc.claimQuest('day', 0).ok;
out.reroll = { first: svc.reroll(1).ok, second: svc.reroll(2).ok };

// ---- first win of the day (x2 XP): the reward from the host arrives as an 'xp' message
const fwBefore = P.xp + P.level * 1e6;
g.onReward({ to: g.selfId, xp: 100, coin: 20, reason: 'Survived the day', bounty: { type: 'survive', target: 'day' } });
const fwGain = P.xp + P.level * 1e6 - fwBefore;
out.firstWin = { marked: st().firstWin !== '', gainAtLeast200: fwGain >= 190, gain: fwGain };
const fwBefore2 = P.xp + P.level * 1e6;
g.onReward({ to: g.selfId, xp: 100, coin: 20, reason: 'Survived the day', bounty: { type: 'survive', target: 'day' } });
out.secondWinGain = P.xp + P.level * 1e6 - fwBefore2;

// ---- level-up fanfare + milestone crate
const lvl0 = P.level;
g.progress.addXp(60000, 'test');
await sleep(300);
out.levelUp = { from: lvl0, to: P.level, fanfareDom: !!document.querySelector('.dy-lv'), crates: st().crates.length };

// ---- season xp
out.season = svc.season();

// ---- crates: grant, open through the service (applies the reward), then show the reveal for the screenshot script
const owned0 = P.cosmetics.suits.length + P.cosmetics.hats.length + (P.cosmetics.faces?.length || 0) + (P.cosmetics.backs?.length || 0);
const before = st().crates.length;
const c = (await import('/src/game/daily_core.js')).grantCrate(P, 'cosmetic', 'harness');
const o = svc.openCrate(c.id);
out.crate = { ok: o.ok, kind: o.result?.kind, tier: o.result?.tier, title: o.view?.title, after: st().crates.length - before };
const owned1 = P.cosmetics.suits.length + P.cosmetics.hats.length + (P.cosmetics.faces?.length || 0) + (P.cosmetics.backs?.length || 0);
out.crate.ownedDelta = owned1 - owned0;

// ---- parts delivery to the ship (host authoritative): needs the orbit phase
g.run.phase = 'orbit';
const items0 = [...g.items.all()].length;
for (let i = 0; i < 6; i++) { kefal.tick(10, 0.5, false); await sleep(20); }
await sleep(300);
out.delivery = { itemsSpawned: [...g.items.all()].length - items0, stashLeft: svc.stash().length };

// ---- panel
const ctl = D.open('quests');
await sleep(200);
const panel = document.querySelector('.dy');
out.questRows = [...document.querySelectorAll('.dy-row')].map((r) => r.scrollWidth <= r.clientWidth + 1);
ctl?.setTab?.('login');
await sleep(150);
const r = panel?.getBoundingClientRect();
out.panel = { open: !!panel, fits: !!r && r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, rect: r && [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], rows: out.questRows.length };
out.dockChip = !!document.querySelector('[data-dock-id="daily"]');
out.errs = errs;
return out;
