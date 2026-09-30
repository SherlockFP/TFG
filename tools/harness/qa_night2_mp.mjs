// QA night 2, two-player scripted session (host + client tabs over LocalTransport / BroadcastChannel, one headless context).
// Usage: bash run_mp.sh  ==  flock /tmp/tfg-browser.lock node tools/harness/qa_night2_mp.mjs --port PORT --shotdir docs/wave8/qa_shots [--q 45]
// Checks: landing sync, client DOWN -> host REVIVE (ring), two-person carry of a bulky item, client TAGGED -> reaches the ship, host migration mid-landing.
// Output: JSON with a `checks` table (pass / fail) + logs. Shots (jpg): n2_mp_revive_host, n2_mp_downed_client, n2_mp_carry_host, n2_mp_carry_client, n2_mp_tagged_client, n2_mp_mig_client.
import { createRequire } from 'module';
import { execSync } from 'child_process';
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const port = arg('port', '5411'), shotDir = arg('shotdir', '.'), Q = Number(arg('q', '45'));
let chromium;
try { chromium = createRequire(import.meta.url)('playwright').chromium; }
catch { chromium = createRequire(execSync('npm root -g').toString().trim() + '/')('playwright').chromium; }
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 1024, height: 576 } });
const logs = [], checks = [], out = { checks };
const chk = (name, ok, note) => { checks.push({ name, ok: !!ok, note: note === undefined ? undefined : note }); console.log('QA: ' + (ok ? 'PASS ' : 'FAIL ') + name + (note !== undefined ? ' ' + JSON.stringify(note).slice(0, 200) : '')); };
const mk = async (url, tag) => {
  const p = await ctx.newPage();
  p.on('dialog', (d) => { logs.push(tag + ' dialog: ' + d.message().slice(0, 100)); d.dismiss().catch(() => {}); });
  p.on('pageerror', (e) => logs.push(tag + ' pageerror: ' + String(e.stack || e.message).slice(0, 500)));
  p.on('console', (m) => { if (m.type() === 'error' && !/nostr|WebSocket|wss:/i.test(m.text())) logs.push(tag + ' error: ' + m.text().slice(0, 300)); });
  await p.goto(`http://127.0.0.1:${port}${url}`);
  await p.waitForFunction(() => window.kefal?.game, null, { timeout: 120000 });
  return p;
};
const CODE = 'NT2MP' + (Date.now() % 1000);
const host = await mk(`/?autohost=local&code=${CODE}&name=Host`, 'host');
await host.waitForTimeout(2500);
const cli = await mk(`/?autojoin=${CODE}&net=local&name=Client`, 'client');
await cli.waitForFunction(() => kefal.game?.net?.connected, null, { timeout: 60000 }).catch(() => logs.push('client never connected'));
const tick = (p, n) => p.evaluate((n) => { for (let i = 0; i < n; i++) kefal.tick(1, 1 / 30, false); }, n);
const both = async (rounds, n = 10) => { for (let i = 0; i < rounds; i++) { await tick(host, n); await tick(cli, n); await host.waitForTimeout(25); } };
const shot = async (p, name) => { try { await p.evaluate(() => { kefal.tick(2, 1 / 30, true); }); await p.waitForTimeout(700); await p.screenshot({ path: `${shotDir}/${name}.jpg`, type: 'jpeg', quality: Q, timeout: 150000 }); } catch (e) { logs.push('shot ' + name + ' ' + String(e).slice(0, 100)); } };
const unpause = (p) => p.evaluate(() => { try { if (document.querySelector('.pause-info')) kefal.game.ui.closePanel(true); if (kefal.game.ui.clickHint) kefal.game.ui.clickHint.style.display = 'none'; } catch { /* ignore */ } });
const IDS = { host: await host.evaluate(() => kefal.game.selfId), cli: await cli.evaluate(() => kefal.game.selfId) };
out.ids = IDS;
chk('connect: two peers, client is not host', (await cli.evaluate(() => !kefal.game.isHost && kefal.game.remotes.size >= 1)) && (await host.evaluate(() => kefal.game.isHost && kefal.game.remotes.size >= 1)));

// ---- 0. landing
await host.evaluate(() => { const g = kefal.game; g.run.daysLeft = 3; g.run.moon = 'hamsi'; g.player.inShip = true; g.hostLever(g.selfId); g.hostFinishLanding(); });
await both(14);
for (let i = 0; i < 20 && !(await cli.evaluate(() => kefal.game.run.phase === 'moon' && !kefal.game.landQ?.pending)); i++) await both(3);
const ph = { h: await host.evaluate(() => kefal.game.run.phase), c: await cli.evaluate(() => kefal.game.run.phase) };
chk('landing: both peers reach phase moon', ph.h === 'moon' && ph.c === 'moon', ph);
const gy = await host.evaluate(() => kefal.game.world.terrain?.heightAt?.(0, 14) ?? kefal.game.world.outdoor?.terrain?.heightAt?.(0, 14) ?? 0);
const place = (p, x, z, yaw, pitch = 0.05) => p.evaluate(([x, z, yaw, pitch, gy]) => { const g = kefal.game; g.player.teleport(new THREE.Vector3(x, gy + 0.3, z), yaw); g.player.yaw = yaw; g.player.pitch = pitch; g.player.inShip = false; g.player.hp = g.player.maxHp || 100; }, [x, z, yaw, pitch, gy]);
const HID = IDS.host, CID = IDS.cli;

// ---- 1. client DOWN -> host revives (ring)
await place(cli, 3.0, 14, Math.PI / 2, 0.0); await place(host, 1.4, 14, -Math.PI / 2, -0.4); await both(6);
await cli.evaluate(() => { const g = kefal.game; g.damageLocal(999, 'qa_bite', null); });
await both(6);
const d1 = { cDown: await cli.evaluate(() => !!kefal.game.downed?.S.me), hSees: await host.evaluate((id) => kefal.game.downed.isDowned(id), CID), hp: await cli.evaluate(() => kefal.game.player.hp), cDead: await cli.evaluate(() => kefal.game.player.dead) };
chk('down: client goes DOWN (not dead), host sees it', d1.cDown && d1.hSees && !d1.cDead, d1);
await shot(cli, 'n2_mp_downed_client');
// host looks at the body and holds E
await host.evaluate(() => { const g = kefal.game; if (!g.__qaIsDown) { g.__qaIsDown = g.input.isDown.bind(g.input); g.input.isDown = (a) => (g.__qaHold && a === 'interact') || g.__qaIsDown(a); } g.__qaHold = true; });
let tid = null;
for (const pit of [-0.4, -0.55, -0.3, -0.7, -0.2, -0.85]) {
  await host.evaluate((p) => { kefal.game.player.pitch = p; }, pit); await tick(host, 3); await tick(cli, 1);
  tid = await host.evaluate(() => kefal.game.interactTarget?.action?.__dn || null);
  if (tid) { out.revivePitch = pit; break; }
}
chk('revive: host aim finds the downed interactable', !!tid, { tid, label: await host.evaluate(() => kefal.game.interactTarget?.label && String(typeof kefal.game.interactTarget.label === 'function' ? kefal.game.interactTarget.label() : kefal.game.interactTarget.label).slice(0, 60)) });
let prog = 0, ring = null;
for (let i = 0; i < 30; i++) {
  await tick(host, 6); await tick(cli, 6); await host.waitForTimeout(40);
  prog = await host.evaluate((id) => kefal.game.downed.S.down.get(id)?.prog || 0, CID);
  if (prog > 1.2 && !ring) { await unpause(host); ring = await host.evaluate(() => { const e = document.querySelector('.dn-mid'); if (!e) return null; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return { rect: [r.left, r.top, r.width, r.height].map(Math.round), op: cs.opacity, disp: cs.display, text: e.innerText.slice(0, 60) }; }); await shot(host, 'n2_mp_revive_host'); }
  if (!(await cli.evaluate(() => !!kefal.game.downed?.S.me))) break;
}
chk('revive: ring (.dn-mid) visible on the host while holding E', ring && ring.disp !== 'none' && +ring.op > 0.05, ring);
await host.evaluate(() => { kefal.game.__qaHold = false; });
await both(4);
const d2 = { cUp: !(await cli.evaluate(() => !!kefal.game.downed?.S.me)), hp: await cli.evaluate(() => Math.round(kefal.game.player.hp)), max: await cli.evaluate(() => kefal.game.player.maxHp), hDown: await host.evaluate((id) => kefal.game.downed.isDowned(id), CID) };
chk('revive: client is back up at ~30 % HP', d2.cUp && !d2.hDown && d2.hp > 1, d2);

// ---- 2. two-person carry of a bulky item
await place(host, 0, 16, 0, 0.0); await place(cli, 2.0, 16, 0, 0.0); await both(4);
const vid = await host.evaluate(() => { const g = kefal.game, p = g.player; const id = g.items.hostSpawn('cy_vending', p.pos.clone().setY(p.pos.y + 1), { holder: g.selfId }); return id; });
await both(3);
await host.evaluate((id) => { const g = kefal.game, p = g.player, sl = p.slots.indexOf(null); p.slots[sl] = id; p.slot = sl; g.refreshHeldVisuals?.(); }, vid);
await both(6);
const solo = await host.evaluate(() => ({ mul: kefal.game.player.carryMul, turn: kefal.game.player.carryTurn, held: kefal.game.items.get(kefal.game.player.slots[kefal.game.player.slot])?.type }));
chk('carry: solo bulky carrier is slowed (x0.55)', solo.held === 'cy_vending' && solo.mul > 0.4 && solo.mul < 0.7, solo);
const cSeen = await cli.evaluate((id) => { const it = kefal.game.items.get(id); return { has: !!it, holder: it?.holder, bulky: kefal.game.carry2.state.bulky.map((x) => x.id) }; }, vid);
await cli.evaluate(([id, hid]) => { const g = kefal.game; if (!g.__qaIsDown) { g.__qaIsDown = g.input.isDown.bind(g.input); g.input.isDown = (a) => (g.__qaHold && a === 'interact') || g.__qaIsDown(a); } g.__qaHold = true; g.carry2.state.grip = { id, holder: hid, ping: 0 }; }, [vid, HID]);
for (let i = 0; i < 14; i++) { await tick(host, 6); await tick(cli, 6); await host.waitForTimeout(40); }
const duo = { co: await host.evaluate(() => [...kefal.game.carry2.state.co.entries()]), hMul: await host.evaluate(() => +kefal.game.player.carryMul.toFixed(2)), cMul: await cli.evaluate(() => +kefal.game.player.carryMul.toFixed(2)), cGrip: await cli.evaluate(() => !!kefal.game.carry2.state.grip), seen: cSeen };
chk('carry: helper registered on host + client sees the co-carry, speed ~0.92', duo.co.length === 1 && duo.co[0][1] === CID && duo.hMul > 0.85 && duo.cGrip, duo);
await unpause(host); await unpause(cli);
await host.evaluate(() => { kefal.game.player.yaw = -0.5; }); await tick(host, 2);
await shot(host, 'n2_mp_carry_host');
await cli.evaluate(() => { const g = kefal.game; const r = [...g.remotes.values()][0]; if (r) { const dx = r.pos.x - g.player.pos.x, dz = r.pos.z - g.player.pos.z; g.player.yaw = Math.atan2(-dx, -dz); g.player.pitch = 0.05; } });
await tick(cli, 2); await shot(cli, 'n2_mp_carry_client');
await cli.evaluate(() => { kefal.game.__qaHold = false; });
for (let i = 0; i < 12; i++) { await tick(host, 6); await tick(cli, 6); await host.waitForTimeout(40); }
const rel = { co: await host.evaluate(() => kefal.game.carry2.state.co.size), hMul: await host.evaluate(() => +kefal.game.player.carryMul.toFixed(2)) };
chk('carry: letting go of E lapses the grip (back to crawl speed)', rel.co === 0 && rel.hMul < 0.7, rel);
await host.evaluate(() => { const g = kefal.game, p = g.player, it = g.items.get(p.slots[p.slot]); if (it) g.dropItem(it); });
await both(3);

// ---- 3. client TAGGED -> reaches the ship
await place(cli, 6, 22, 0, 0.0); await both(3);
let tagged = false;
for (let i = 0; i < 60 && !tagged; i++) {
  await host.evaluate((id) => { kefal.game.feedcams.expose(id, 3, 'd0'); kefal.tick(4, 1 / 30, false); }, CID); await tick(cli, 4); await host.waitForTimeout(20);
  tagged = await host.evaluate((id) => !!kefal.game.run.fc?.p?.[id]?.[2], CID);
}
await both(4);
const tg = { host: await host.evaluate((id) => kefal.game.run.fc?.p?.[id] || null, CID), cli: await cli.evaluate(() => kefal.game.run.fc?.p?.[kefal.game.selfId] || null), goals: await cli.evaluate(() => [...document.querySelectorAll('.objectives *')].filter((e) => e.children.length === 0 && e.textContent.trim()).map((e) => e.textContent.trim().slice(0, 90))) };
chk('tagged: host marks the client TAGGED', tagged, tg.host);
chk('tagged: client HUD shows the TAGGED goal line', tg.goals.some((s) => /TAGGED|ETİKET|ПОМЕТ/i.test(s)), tg.goals);
await unpause(cli); await shot(cli, 'n2_mp_tagged_client');
await cli.evaluate(() => { const g = kefal.game; g.player.teleport(new THREE.Vector3(0, 1, 0)); g.player.inShip = true; });
await both(8);
const after = { host: await host.evaluate((id) => kefal.game.run.fc?.p?.[id] || null, CID), cli: await cli.evaluate(() => kefal.game.run.fc?.p?.[kefal.game.selfId] || null), goals: await cli.evaluate(() => [...document.querySelectorAll('.objectives *')].filter((e) => e.children.length === 0 && e.textContent.trim()).map((e) => e.textContent.trim().slice(0, 90))) };
chk('tagged: reaching the ship clears the tag (host + client)', !(after.host && after.host[2]) && !(after.cli && after.cli[2]) && !after.goals.some((s) => /TAGGED/i.test(s)), after);

// ---- 4. host migration mid-landing
await host.evaluate(() => { const g = kefal.game; g.player.teleport(new THREE.Vector3(0, 1, 0)); g.player.inShip = true; g.hostBeginTakeoff('lever'); });
for (let i = 0; i < 20; i++) { await host.evaluate(() => { const g = kefal.game; if (g.run.phase !== 'orbit') g.hostFinishTakeoff(); }); await both(2); if ((await cli.evaluate(() => kefal.game.run.phase)) === 'orbit' && (await host.evaluate(() => kefal.game.run.phase)) === 'orbit') break; }
const orb = { h: await host.evaluate(() => kefal.game.run.phase), c: await cli.evaluate(() => kefal.game.run.phase) };
chk('takeoff: both peers back in orbit', orb.h === 'orbit' && orb.c === 'orbit', orb);
await host.evaluate(() => { const g = kefal.game; g.run.moon = 'levrek'; g.run.daysLeft = 3; g.player.inShip = true; g.hostLever(g.selfId); });
await both(3);
const mid = { h: await host.evaluate(() => kefal.game.run.phase), c: await cli.evaluate(() => kefal.game.run.phase) };
chk('landing: both peers are mid-landing when the host leaves', mid.h === 'landing' && mid.c === 'landing', mid);
await host.evaluate(() => kefal.game.net.leave()); await host.close();
const promptOk = await cli.waitForFunction(() => kefal.game?.hostmig?.state().phase === 'prompt', null, { timeout: 60000 }).then(() => true).catch(() => false);
for (let i = 0; i < 4; i++) await tick(cli, 10);
chk('migration: the client is offered the host role', promptOk, await cli.evaluate(() => kefal.game.hostmig.state().phase));
await unpause(cli); await shot(cli, 'n2_mp_mig_client');
await cli.evaluate(() => kefal.game.hostmig.accept());
await cli.waitForFunction(() => kefal.game?.isHost, null, { timeout: 20000 }).catch(() => logs.push('client never became host'));
let ph2 = null;
for (let i = 0; i < 60; i++) { await tick(cli, 20); await cli.waitForTimeout(40); ph2 = await cli.evaluate(() => ({ phase: kefal.game.run.phase, pending: kefal.game.landQ?.pending, host: kefal.game.isHost })); if (ph2.phase === 'moon' && !ph2.pending) break; }
const fin = await cli.evaluate(() => { const g = kefal.game, p = g.player; return { phase: g.run.phase, moon: g.run.moon, host: g.isHost, pos: p.pos.toArray().map((v) => +v.toFixed(1)), finite: p.pos.toArray().every(Number.isFinite), inShip: p.inShip, dead: p.dead, terrain: !!g.world.terrain, facility: !!g.world.facility, creatures: g.creatures.host.size, epoch: g.net.hostEpoch }; });
chk('migration: the new host finishes the landing (phase moon, map built, player valid)', fin.host && fin.phase === 'moon' && fin.finite && fin.terrain && !fin.dead && fin.pos[1] > -5, fin);
await tick(cli, 30); await shot(cli, 'n2_mp_landed_after_mig');
out.logs = logs.slice(0, 30);
console.log(JSON.stringify(out, null, 1));
await b.close();
process.exit(checks.some((c) => !c.ok) || logs.some((l) => /pageerror/.test(l)) ? 1 : 0);
