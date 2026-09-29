// UI2 screenshot runner: main menu + in-run HUD + panels, ONE browser launch (hold the shared lock once). Usage:
//   flock /tmp/tfg-browser.lock node tools/harness/ui2_shots.mjs --port 5194 --out DIR [--sizes 1280x720,1920x1080] [--both] [--only menu,hud,inv,shop,roles,panels,ui3]
// UI3 (wave 5): `--only ui3` (in-run HUD overlap states + the remaining panels) toggles class tfg-ui3 instead of tfg-ui: "before_*" = ui3 layer off,
// "after_*" = on. Every JPEG is re-encoded with a lower quality until it is <= 150 KB. `--ui3-before-big` also writes 1920 "before" panel shots
// (default: 1920 panel shots are "after" only, to keep docs/ small).
// --both captures every state twice: theme on ("after_*") and theme off ("before_*", html.tfg-ui removed), on the same page state.
// Each shot is DIR/<after|before>_<WxH>_<name>.jpg. Prints page errors.
import { createRequire } from 'module';
import { execSync } from 'child_process';
import fs from 'fs';
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const port = arg('port', '5173'), out = arg('out', '.'), tag = arg('tag', 'after');
const sizes = arg('sizes', '1280x720').split(',').map((s) => s.split('x').map(Number));
const only = arg('only', '') ? arg('only').split(',') : null;
const both = process.argv.includes('--both');
const beforeBig = process.argv.includes('--ui3-before-big');
let chromium;
try { chromium = createRequire(import.meta.url)('playwright').chromium; }
catch { const root = execSync('npm root -g').toString().trim(); chromium = createRequire(root + '/')('playwright').chromium; }
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: sizes[0][0], height: sizes[0][1] } });
const logs = [];
p.on('console', (m) => { if (m.type() === 'error') logs.push('error: ' + m.text().slice(0, 300)); });
p.on('pageerror', (e) => logs.push('pageerror: ' + String(e.stack || e.message).slice(0, 600)));
const want = (n) => !only || only.includes(n);
let cur = sizes[0].join('x');
const snap = async (pre, name, maxKB = 150) => {
  let q = 72, buf;
  for (; q >= 25; q -= 9) { buf = await p.screenshot({ type: 'jpeg', quality: q }); if (buf.length <= maxKB * 1024) break; }
  fs.writeFileSync(`${out}/${pre}_${cur}_${name}.jpg`, buf);
};
const shot = async (name) => {
  await p.waitForTimeout(300);
  await snap(both ? 'after' : tag, name);
  if (both) {
    await p.evaluate(() => document.documentElement.classList.remove('tfg-ui'));
    await p.waitForTimeout(200);
    await snap('before', name);
    await p.evaluate(() => document.documentElement.classList.add('tfg-ui'));
  }
  console.log('shot', cur, name);
};
const resize = async ([w, h]) => { await p.setViewportSize({ width: w, height: h }); cur = w + 'x' + h; await p.waitForTimeout(500); };
const ev = async (code) => { try { return await p.evaluate(`(async()=>{${code}\n})()`); } catch (e) { console.log('EVAL ERROR', e.message.slice(0, 300)); } };

if (want('menu')) {
  await p.goto(`http://127.0.0.1:${port}/`);
  await p.waitForFunction(() => window.kefal?.menu?.room, null, { timeout: 120000 }).catch(() => logs.push('TIMEOUT menu'));
  await p.waitForTimeout(1200);
  await ev(`kefal.menu.room.skipBoot?.(); for(let i=0;i<40;i++) kefal.menu.update(1/30);`);
  for (const sz of sizes) {
    await resize(sz);
    await ev(`kefal.ui.showMenu('title')`); await shot('menu_title');
    await ev(`kefal.ui.showMenu('host')`); await shot('menu_host');
    if (sz === sizes[0]) { await ev(`kefal.ui.showMenu('character')`); await shot('menu_character'); }
  }
  await resize(sizes[0]);
}
if (['hud', 'inv', 'shop', 'roles', 'panels', 'ui3'].some(want)) {
  await p.goto(`http://127.0.0.1:${port}/?autohost=local&code=T1&name=Tester`);
  await p.waitForFunction(() => window.kefal?.game, null, { timeout: 120000 }).catch(() => logs.push('TIMEOUT game'));
  await p.waitForTimeout(3500);
  await ev(`const g=kefal.game; g.run.credits=4200; try{ g.profile.coins=900; g.profile.level=7; }catch{}
    g.run.daysLeft=3; g.run.moon='hamsi'; g.player.inShip=true; g.hostLever(g.selfId); g.hostFinishLanding();
    for (let i=0;i<30;i++){ kefal.tick(10,1/30,false); await new Promise(r=>setTimeout(r,10)); }
    g.player.inShip=false; kefal.tick(20,1/30,false);`);
  for (const sz of sizes) {
    await resize(sz);
    if (want('hud')) { await ev(`kefal.tick(6,1/30,false)`); await shot('hud'); }
    if (want('inv')) { await ev(`kefal.game.inventory?.open()`); await shot('inventory'); await ev(`kefal.game.inventory?.close()`); }
    if (want('shop')) { await ev(`kefal.game.ui.openShop(kefal.game)`); await shot('shop'); await ev(`kefal.game.ui.closePanel(true)`); }
    if (want('roles')) { await ev(`kefal.game.rpg?.openRoles()`); await shot('roles'); await ev(`kefal.game.ui.closePanel(true)`); }
  }
  await resize(sizes[0]);
  if (want('panels')) {
    const list = [['tree', 'kefal.game.rpg?.open()'], ['market', 'kefal.game.ui.openMarket(kefal.game)'], ['pause', 'kefal.game.ui.openPause()'],
      ['shipyard', 'kefal.game.shipyard?.open?.()'], ['pets', 'kefal.game.pets?.open?.()'], ['crafting', 'kefal.game.crafting?.open?.()'],
      ['bounties', 'kefal.game.ui.openBounties(kefal.game)']];
    for (const [n, code] of list) { await ev(code); await shot('panel_' + n); await ev(`kefal.game.ui.closePanel(true)`); }
  }
}

// ------------------------------------------------------------------------------------------------------------------------------
// UI3 section: HUD overlap states + remaining panels, "before" (tfg-ui3 off) vs "after" (on), same page state.
if (want('ui3')) {
  // freeze the rAF loop (swiftshader frames take seconds and starve page.screenshot); every shot renders one frame itself
  await ev(`const a = kefal; if (!a.__realLoop) { a.__realLoop = a.loop; a.loop = function (now) { requestAnimationFrame((t) => this.loop(t)); this.last = now; this.input?.endFrame?.(); }; }`);
  const setU3 = (on) => p.evaluate((o) => document.documentElement.classList.toggle('tfg-ui3', o), on);
  const report = {};
  // states: [pre, ...]; `setup` runs once per state (so panels are rebuilt and JS-side fixes such as footers / compass are re-evaluated)
  const shot3 = async (name, setup, { states = ['before', 'after'], settle = 0 } = {}) => {
    for (const st of states) {
      await setU3(st === 'after');
      if (setup) await ev(setup);
      await ev(`kefal.tick(${4 + settle}, 1/30, true)`);
      await p.waitForTimeout(500);
      await snap(st, name);
      console.log('shot', cur, st, name);
    }
    await setU3(true);
  };
  const closeAll = `const g = kefal.game; g.ui.closePanel(true); document.querySelectorAll('.quotamet').forEach((x) => x.remove()); document.querySelector('.mr-root')?.classList.remove('on'); g.liminal?.setVhs?.(null);`;
  // items in the hotbar (once)
  const itemInfo = await ev(`const g = kefal.game; const { ITEMS } = await import('/src/game/items.js');
    const want = ['flashlight', 'pro_flashlight', 'walkie', 'shovel', 'pipe', 'lantern', 'bolt', 'jetpack'];
    const ids = Object.keys(ITEMS).filter((k) => /flashlight|walkie|shovel|pipe|jetpack|lantern|stun/i.test(k + ITEMS[k].name)).slice(0, 5);
    const got = [];
    for (const ty of ids) { try { const r = g.items.hostSpawn(ty, { x: g.player.pos.x, y: g.player.pos.y + 0.5, z: g.player.pos.z }); const it = typeof r === 'string' ? g.items.get(r) : r; if (it) { g.pickup(it); got.push(ty); } } catch (e) { got.push('ERR ' + ty + ' ' + e.message.slice(0, 60)); } kefal.tick(3, 1/30, false); }
    kefal.tick(40, 1/30, false);
    return { got, slots: g.player.slots.length, hud: [...document.querySelectorAll('.hud-inv .inv-slot')].map((s) => s.innerText.replace(/\\n/g, ' | ')) };`);
  console.log('ITEMS', JSON.stringify(itemInfo));
  report.items = itemInfo;

  for (const sz of sizes) {
    await resize(sz);
    const big = sz[0] > 1400;
    const st2 = big && !beforeBig ? ['after'] : ['before', 'after'];
    await ev(closeAll);

    // 1. compass: SHIP + ENTRANCE on the same bearing (player stands on the line ship -> entrance, behind the ship, looking at both)
    await ev(`const g = kefal.game; const ex = g.world.outdoor?.mainExit?.pos; const L = Math.hypot(ex.x, ex.z) || 1, dx = ex.x / L, dz = ex.z / L;
      g.player.inShip = false; g.player.pos.set(-dx * 40, g.player.pos.y, -dz * 40);
      g.player.yaw = -Math.atan2(ex.x + dx * 40, -(ex.z + dz * 40));`);
    report.compass = await ev(`return { pos: kefal.game.player.pos.toArray().map((x) => Math.round(x)), exit: kefal.game.world.outdoor?.mainExit?.pos?.toArray?.().map((x) => Math.round(x)) };`);
    await shot3('hud_compass', `kefal.game.player.inShip = false;`, { states: st2 });

    // 2. Algorithm banner over an open panel (forge-like: shop) + over the plain HUD
    await ev(`const g = kefal.game; g.lore?.algo?.show?.({ text: 'LIVE FEEDBACK: You sprinted 71 percent of the day. The crowd noticed.' }); kefal.tick(90, 1/30, false);`);
    await shot3('hud_algo', ``, { states: st2, settle: 40 });
    await shot3('hud_algo_panel', `const g = kefal.game; g.ui.closePanel(true); g.ui.openShop(g); g.lore?.algo?.show?.({ text: 'LIVE FEEDBACK: You sprinted 71 percent of the day.' }); kefal.tick(60, 1/30, false);`, { states: st2, settle: 40 });
    await ev(closeAll);

    // 3. mirror timer + reflection bar over clock / compass
    await ev(`const g = kefal.game; const ex = g.world.outdoor?.mainExit?.pos;
      const m = await import('/src/ui/mirror_ui.js'); window.__mui?.dispose?.(); const u = window.__mui = m.createMirrorUI(); u.show(true); u.setTimer('2:57', 'warn', 0); u.setMeter({ v: 40, k: 1, next: 90, frac: 0.44 }, 3, 12, 30); u.setChips([{ glyph: 'X', color: '#5affc0', name: 'Spark', lvl: 2 }]);`);
    await shot3('hud_mirror', ``, { states: st2 });
    await ev(`window.__mui?.dispose?.(); window.__mui = null;`);

    // 4. Backrooms VHS overlay (liminal) over the hotbar / body icon
    await ev(`kefal.game.liminal?.setVhs?.(true); kefal.tick(30, 1/30, false);`);
    await shot3('hud_vhs', `kefal.game.liminal?.setVhs?.(true);`, { states: st2, settle: 30 });
    await ev(`kefal.game.liminal?.setVhs?.(null); kefal.tick(5, 1/30, false);`);

    // 5. QUOTA MET (credit sign)
    await shot3('quota_met', `document.querySelectorAll('.quotamet').forEach((x) => x.remove()); kefal.game.ui.renderQuotaMet({ quotaIndex: 2, surplus: 40, bonus: 120, prev: 130 }, kefal.game, () => {}); `, { states: st2, settle: 100 });
    await ev(closeAll);

    // 6. panels
    const R = { forge: `const f = await import('/src/ui/panels/forge.js'); const g = kefal.game; const c = f.createForgePanel(g.ui, g, g.forge, { tab: 'enhance' }); g.ui.openPanel(c.el);`,
      hub: `const h = await import('/src/ui/panels/hub.js'); const g = kefal.game; g.ui.openPanel(h.hubPanel(g.ui, { inGame: true }));`,
      stove: `const g = kefal.game; const s = (g.survival?.structs?.() || []).find((x) => x.k === 'stove'); g.survival?.openCook?.('stove', s?.id || 'stove');`,
      crate: `const g = kefal.game; const s = (g.survival?.structs?.() || []).find((x) => x.k === 'crate'); if (s) g.survival.openStorage(s.id);` };
    const panels = [['shop', `kefal.game.ui.openShop(kefal.game)`], ['forge', R.forge], ['shipyard', `kefal.game.shipyard?.open?.()`], ['pets', `kefal.game.pets?.open?.()`],
      ['homeworld', `kefal.game.homeworld?.open?.()`], ['homeworld2', `kefal.game.homeworld2?.open?.()`], ['settings', `kefal.game.ui.openPanel(kefal.game.ui.settingsPanel(true))`],
      ['tree', `kefal.game.rpg?.open()`], ['stove', R.stove], ['crate', R.crate], ['daily', `kefal.game.daily?.open?.()`], ['hub', R.hub]];
    for (const [n, code] of panels) {
      await shot3('panel_' + n, `const g = kefal.game; g.ui.closePanel(true); await new Promise((r) => setTimeout(r, 30)); try { ${code} } catch (e) { window.__pErr = '${n}: ' + e.message; }`, { states: st2 });
      const info = await ev(`const g = kefal.game; return { open: !!g.ui.panelOpen, err: window.__pErr || null, foot: [...document.querySelectorAll('.overlay .cp-foot')].map((f) => f.innerText.replace(/\\n/g, ' ')).join(' / ') };`);
      report['panel_' + n + '_' + cur] = info; 
      await ev(`kefal.game.ui.closePanel(true)`);
    }
  }
  console.log('UI3 REPORT', JSON.stringify(report, null, 1));
}
console.log('LOGS', JSON.stringify(logs.slice(0, 30), null, 1));
await b.close();
