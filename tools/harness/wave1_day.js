// Wave-1 REVIEW script "day in the life" (body of an async function). PARSES BUT HAS NOT BEEN RUN YET (the review browser budget was cut).
// Orbit: open/close every panel (I, K, J, TAB, store tabs, workbench, contracts board), role + tree + spells + store purchase + contract;
// land on 56K-Dialup, walk, pick up, cast by chat word, bat tier damage (epic should be 1.4x plain), threat, HUD overlap scan (getBoundingClientRect),
// midnight takeoff, summary + case file, NaN scan, draw calls, run/profile sizes. Screenshots via window.__shot(name) (needs headless_shots.mjs).
const g = kefal.game, out = { sec: {}, notes: [] }, errs = [];
addEventListener('error', (e) => errs.push('E: ' + e.message));
addEventListener('unhandledrejection', (e) => errs.push('R: ' + String(e.reason?.stack || e.reason).slice(0, 300)));
const ce = console.error; console.error = (...a) => { errs.push('console.error: ' + a.map(String).join(' ').slice(0, 300)); ce(...a); };
const cw = console.warn; console.warn = (...a) => { errs.push('console.warn: ' + a.map(String).join(' ').slice(0, 300)); cw(...a); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tick = async (n = 10, render = false, dt = 1 / 30) => { kefal.tick(n, dt, render); await sleep(4); };
const r1 = (x) => Math.round(x * 10) / 10;
const shot = async (n) => { try { if (window.__shot) await window.__shot(n); } catch (e) { out.notes.push('shot fail ' + n); } };
const sec = async (name, fn) => { try { out.sec[name] = await fn(); } catch (e) { out.sec[name] = { THROW: String(e.stack || e).slice(0, 600) }; } };
const key = (code, type = 'keydown') => window.dispatchEvent(new KeyboardEvent(type, { code, key: code.replace('Key', '').toLowerCase(), bubbles: true, cancelable: true }));
const finite = (v) => v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
const junk = (s) => { const m = String(s || '').match(/undefined|NaN|\[object|null\b|\{\{|\$\{/g); return m ? [...new Set(m)] : null; };
const bad = [];
const nanScan = (tag) => {
  if (!finite(g.player.pos)) bad.push(tag + ': player pos ' + JSON.stringify(g.player.pos));
  for (const c of g.creatures.host.values()) if (!finite(c.pos)) bad.push(tag + ': creature ' + c.type + ' pos');
  for (const it of g.items.all()) if (it.obj && !finite(it.obj.position)) bad.push(tag + ': item ' + it.type + ' pos');
  if (!Number.isFinite(g.player.hp)) bad.push(tag + ': hp ' + g.player.hp);
  if (!Number.isFinite(g.run.credits)) bad.push(tag + ': credits');
};
const desc = (el) => el.tagName.toLowerCase() + (el.dataset?.dockId ? '[' + el.dataset.dockId + ']' : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : '');
const hudOverlaps = () => {
  const vw = innerWidth, vh = innerHeight;
  const hidden = (el) => { for (let e = el; e && e !== document.body; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05 || e.classList.contains('hidden')) return true; } return false; };
  const els = [...document.querySelectorAll('#ui .hud > *, #ui > .hud-dock > *, #ui .objectives, #ui .hud-toasts > *, #ui .hud-chips, #ui .hud-chips > *, #ui .hud-bounty, #ui .hud-xpfeed > *')];
  const list = [];
  for (const el of els) {
    if (hidden(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 6 || r.height < 6) continue;
    if (r.width * r.height > vw * vh * 0.5) continue;                // full-screen overlays (visor etc.)
    if (!(el.textContent || '').trim() && !el.querySelector('canvas,svg,img,i')) continue;
    list.push({ el, r, d: desc(el) });
  }
  const hits = [];
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j];
    if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
    const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left), h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
    if (w > 4 && h > 4) hits.push({ a: a.d, b: b.d, area: Math.round(w * h), ra: [a.r.left, a.r.top, a.r.right, a.r.bottom].map(Math.round), rb: [b.r.left, b.r.top, b.r.right, b.r.bottom].map(Math.round) });
  }
  const off = list.filter((x) => x.r.right > vw + 2 || x.r.bottom > vh + 2 || x.r.left < -2 || x.r.top < -2).map((x) => x.d + ' ' + [x.r.left, x.r.top, x.r.right, x.r.bottom].map(Math.round));
  return { visible: list.map((x) => x.d + ' ' + [x.r.left, x.r.top, x.r.right, x.r.bottom].map(Math.round).join(',')), overlaps: hits, offscreen: off, hudJunk: junk(document.querySelector('#ui .hud')?.innerText) };
};
const panelCheck = async (name, openFn, closeFn) => {
  const r = { name };
  try {
    openFn(); await tick(4, true);
    const pe = g.ui.panelOpen;
    r.open = !!pe;
    if (pe) { const b = pe.getBoundingClientRect(); r.rect = [b.left, b.top, b.right, b.bottom].map(Math.round); r.fits = b.right <= innerWidth + 2 && b.bottom <= innerHeight + 2; r.junk = junk(pe.innerText); r.textLen = (pe.innerText || '').length; r.sample = (pe.innerText || '').replace(/\s+/g, ' ').slice(0, 90); }
    else { r.sample = 'NO PANEL'; }
    if (closeFn) closeFn(); else g.ui.closePanel();
    await tick(3);
    r.closed = !g.ui.panelOpen;
    if (!r.closed) { g.ui.closePanel(); await tick(2); }
  } catch (e) { r.THROW = String(e.stack || e).slice(0, 400); try { g.ui.closePanel(); } catch {} }
  return r;
};

// ------------------------------------------------------------------ S0 baseline
await sec('base', async () => {
  const run = g.run;
  const sizes = Object.entries(run).map(([k, v]) => [k, JSON.stringify(v ?? null)?.length || 0]).sort((a, b) => b[1] - a[1]);
  return {
    phase: run.phase, moon: run.moon, credits: run.credits, quota: run.quota, day: run.day, daysLeft: run.daysLeft,
    runKeys: Object.keys(run).length, runBytes: JSON.stringify(run).length, biggest: sizes.slice(0, 7),
    profileKeys: Object.keys(g.profile).length, profileBytes: JSON.stringify(g.profile).length,
    modules: Object.fromEntries(['inventory', 'facilitysys', 'balance', 'magic', 'rpg', 'shop', 'crafting', 'lore', 'horde', 'siege', 'backrooms'].map((m) => [m, !!g[m]])),
    level: g.profile.level, skillPoints: g.profile.skillPoints, clout: g.profile.coins, role: g.rpg?.role?.(), spells: g.profile.spells,
    hudJunk0: junk(document.querySelector('#ui .hud')?.innerText), dockItems: [...document.querySelectorAll('.hud-dock-item')].map((e) => e.dataset.dockId + ':' + (e.innerText || '').replace(/\s+/g, ' ').slice(0, 40)),
    domNodes: document.querySelectorAll('*').length,
  };
});
nanScan('orbit0');

// ------------------------------------------------------------------ S1 panels in orbit (key events + API)
await sec('panels', async () => {
  const P = [];
  P.push(await panelCheck('inventory(key I)', () => key('KeyI'), () => key('KeyI')));
  await shot('rev_inv_empty');
  P.push(await panelCheck('tree(key K)', () => key('KeyK'), () => key('KeyK')));
  P.push(await panelCheck('roles', () => g.rpg.openRoles?.()));
  P.push(await panelCheck('record(key J)', () => key('KeyJ'), () => key('KeyJ')));
  P.push(await panelCheck('character(TAB)', () => g.ui.openPanel(g.ui.characterPanel(true))));
  const cats = [...new Set(g.shop.stock().map((e) => e.cat))];
  for (const cat of cats) P.push(await panelCheck('store:' + cat, () => g.shop.open(cat), () => g.shop.close()));
  P.push(await panelCheck('workbench', () => g.crafting.open(), () => g.crafting.close()));
  for (const tab of ['contracts', 'factions', 'cases', 'logs']) P.push(await panelCheck('algo:' + tab, () => g.lore.openBoard(tab)));
  // stacking: open A then B
  g.inventory.open(); await tick(2);
  g.shop.open(); await tick(2);
  const stack = { panelOpen: !!g.ui.panelOpen, invOpen: g.inventory.isOpen(), overlays: document.querySelectorAll('.overlay, .panel-overlay, .tinv, .tshop').length };
  g.ui.closePanel(); await tick(2); g.inventory.close(); g.shop.close?.(); g.ui.closePanel(); await tick(2);
  stack.afterClose = !g.ui.panelOpen && !g.inventory.isOpen();
  return { cats, panels: P, stack };
});
nanScan('panels');

// ------------------------------------------------------------------ S2 orbit setup: role, tree, spells, store, contract, crafting
await sec('setup', async () => {
  const R = {};
  g.profile.skillPoints = (g.profile.skillPoints || 0) + 6;
  R.roleSet = g.rpg.setRole('occultist'); R.role = g.rpg.role();
  const pt = await import('/src/game/passivetree.js');
  const post = Object.keys(pt.ADJ).find((id) => /occultist/i.test(id));
  R.post = post; R.nodeCount = pt.NODES.length;
  const nb = (pt.ADJ[post] || []).filter((n) => !/post|role/i.test(n)).slice(0, 2);
  R.alloc = nb.map((n) => [n, g.rpg.allocate(n)]);
  R.manaMax = g.magic.maxMana; R.bonusMana = g.rpg.bonus('maxMana');
  R.learn = ['heal', 'blink'].map((s) => [s, g.magic.learn(s, { announce: false })]);
  g.run.credits = 900;
  const c0 = g.run.credits;
  g.shop.buy([{ id: 'crowbar', n: 1 }, { id: 'rounds', n: 1 }, { id: 'pistol', n: 1 }, { id: 'bag_fieldpack', n: 1 }, { id: 'bat', n: 1 }]);
  await tick(6); await sleep(150); await tick(4);
  R.credits = [c0, g.run.credits];
  R.bought = ['crowbar', 'rounds', 'pistol', 'bag_fieldpack', 'bat'].map((t) => [t, [...g.items.all()].filter((i) => i.type === t).length]);
  R.offers = (g.run.contracts?.offers || []).map((o) => o.faction + '/' + o.type + '/n' + o.n);
  g.net.request('lore', { op: 'accept', i: 0 }); await tick(4);
  R.contract = g.run.contract && { state: g.run.contract.state, faction: g.run.contract.faction, title: typeof g.run.contract.title === 'string' ? g.run.contract.title : JSON.stringify(g.run.contract.title).slice(0, 80) };
  R.sig = { recipes: g.crafting.recipes().length, locked: g.crafting.recipes().filter((r) => r.locked).length };
  R.terminalCmds = ['store', 'contracts', 'role', 'tree', 'factions', 'cases', 'algo', 'deals', 'inventory'].map((c) => [c, g.mods.commands?.has?.(c) ?? '?']);
  return R;
});

// ------------------------------------------------------------------ S3 land on 56K-Dialup
await sec('land', async () => {
  const t0 = performance.now();
  g.run.daysLeft = 3; g.run.moon = 'hamsi'; g.player.inShip = true; g.hostLever(g.selfId); g.hostFinishLanding();
  for (let i = 0; i < 20; i++) { kefal.tick(10, 1 / 30, false); await sleep(8); }
  await tick(2, true);
  g.godMode = true;
  const F = g.world.facility;
  return { ms: Math.round(performance.now() - t0), phase: g.run.phase, theme: F?.layout?.theme, creatures: g.creatures.host.size, items: [...g.items.all()].length, threat: g.balance.threat(), scrapSpots: F?.scrapSpots?.length,
    dc_outdoor: kefal.engine.sceneStats, event: g.run.dailyEvent?.name, fac: g.run.fac && { stage: g.run.fac.stage, chain: g.run.fac.chain, power: g.run.fac.power }, contract: g.run.contract?.state, docks: [...document.querySelectorAll('.hud-dock-item')].map((e) => e.dataset.dockId) };
});
nanScan('landed');

// ------------------------------------------------------------------ S4 walk outside (real player.update through the wrapper chain)
await sec('walk', async () => {
  const p = g.player, start = p.pos.clone();
  p.inShip = false; p.teleport(new THREE.Vector3(8, (g.world.terrain?.heightAt?.(8, 10) ?? 0) + 0.3, 10), 0); await tick(6);
  const a = p.pos.clone();
  kefal.input.down.add('KeyW');
  for (let i = 0; i < 6; i++) { kefal.tick(10, 1 / 30, false); await sleep(2); }
  kefal.input.down.delete('KeyW');
  const b = p.pos.clone();
  const hd = Math.hypot(b.x - a.x, b.z - a.z);
  const S = { walked_m_in_2s: r1(hd), speed: r1(hd / 2), stats: { speedMul: r1(g.stats.speedMul), carry: g.stats.carryRelief, noSprint: g.stats.noSprint } };
  kefal.input.down.add('KeyW'); kefal.input.down.add('ShiftLeft');
  const c = p.pos.clone();
  for (let i = 0; i < 6; i++) { kefal.tick(10, 1 / 30, false); await sleep(2); }
  kefal.input.down.delete('KeyW'); kefal.input.down.delete('ShiftLeft');
  S.sprint_speed = r1(Math.hypot(p.pos.x - c.x, p.pos.z - c.z) / 2);
  return S;
});
nanScan('walk');

// ------------------------------------------------------------------ S5 in the facility: items, spell, melee tier check, threat
const F = g.world.facility;
const s0 = F.scrapSpots.filter((q) => !q.elevated)[2] || F.scrapSpots[2];
let stand = null;
await sec('facility', async () => {
  const nav = F.nav;
  let setup = null;
  for (const s of F.scrapSpots.filter((q) => !q.elevated)) {
    for (let k = 0; k < 8 && !setup; k++) {
      const yaw = (k * Math.PI) / 4, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      let ok = true;
      for (let d = 0.5; d <= 6; d += 0.5) if (!nav.walkableAt(s.x + fx * d, s.z + fz * d)) { ok = false; break; }
      if (ok) setup = { s, yaw, fx, fz };
    }
    if (setup) break;
  }
  if (!setup) return { fatal: 'no clear spot' };
  const { s, yaw, fx, fz } = setup;
  const start = new THREE.Vector3(s.x, s.y + 0.2, s.z);
  stand = () => { g.player.inShip = false; g.player.teleport(start, yaw); g.player.pitch = 0; };
  stand(); await tick(30);
  for (const c of [...g.creatures.host.values()]) if (Math.hypot(c.pos.x - s.x, c.pos.z - s.z) < 14) g.creatures.hostRemove(c.id);
  const R = { spot: [r1(s.x), r1(s.z)], yaw: r1(yaw) };

  // --- pick up items (E path = g.pickup), full hotbar -> bag
  const ids = ['duck', 'canned', 'bolt', 'cog', 'tv'].map((ty, i) => g.items.hostSpawn(ty, new THREE.Vector3(s.x + 0.4 * (i - 2), s.y + 0.5, s.z + 0.5), { valueMul: 1 }));
  await tick(6);
  for (const id of ids) { const it = g.items.get(id); if (it) g.pickup(it); await tick(2); }
  R.hotbar = g.player.slots.map((id) => g.items.get(id)?.type || null);
  R.bag = g.inventory.bagItems().map((it) => it.type);
  R.weightLb = r1(g.player.carryWeight?.() ?? -1);
  R.hudWeight = document.querySelector('.hud-weight')?.innerText;
  R.hudInv = document.querySelector('.hud-inv')?.innerText?.replace(/\s+/g, ' ').slice(0, 80);

  // --- spell through chat word, twice (cooldown), heal with hp < max
  g.magic.mana = 100; g.magic.resetCooldowns();
  const m0 = g.magic.mana;
  g.sendChat('İT'); await tick(4);
  const cd1 = g.magic.cooldownLeft('push');
  g.sendChat('PUSH'); await tick(2);
  R.spell = { manaSpent: r1(m0 - g.magic.mana), cooldownAfter: r1(cd1), secondCastBlocked: r1(m0 - g.magic.mana) < 20, chatLine: (g.ui.chatLog?.lastChild?.textContent || '').slice(0, 60) };
  g.player.hp = 40; g.magic.resetCooldowns(); g.magic.mana = 100;
  g.sendChat('heal'); await tick(4);
  R.heal = { hp: g.player.hp };
  g.player.hp = g.player.maxHp || 100;
  // --- normal chat must not cast
  g.magic.resetCooldowns(); g.magic.mana = 100; g.sendChat('push it real good'); await tick(2);
  R.chatNoCast = g.magic.mana === 100;

  // --- melee damage check: epic vs common bat on the same creature type
  const dmgOf = async (tier) => {
    stand(); await tick(3);
    const bid = g.items.hostSpawn('bat', g.player.pos.clone().add(new THREE.Vector3(0, 1, 0)), { holder: g.selfId, ...(tier ? { tier } : {}) });
    await tick(3);
    const slot = g.player.slots.indexOf(bid); if (slot >= 0) { g.player.slot = slot; g.refreshHeldVisuals?.(); }
    const c = g.creatures.hostSpawn('crawler', new THREE.Vector3(s.x + fx * 1.6, F.layout?.y ?? s.y, s.z + fz * 1.6), { state: 'idle', level: 1 });
    c.age = 5; const hp0 = c.hp; c.hp = 9999; c.maxHp = 9999;
    g.useHeldPress?.(); await tick(20); g.useHeldRelease?.(); await tick(10);
    const dealt = 9999 - c.hp;
    g.creatures.hostRemove(c.id); g.net.request('drop', { id: bid });
    return { tier: tier || 'plain', slot, dealt: r1(dealt), crawlerBaseHp: hp0 };
  };
  R.bat = [await dmgOf(null), await dmgOf('epic')];
  return R;
});
nanScan('facility');

await sec('facility2', async () => {
  stand?.(); await tick(20);
  g.magic.mana = 100;
  // threat + facility state after 90 s of sim
  const T0 = g.balance.threat();
  for (let i = 0; i < 9; i++) { kefal.tick(30, 1 / 3, false); await sleep(3); }
  const R = { threat: [r1(T0), r1(g.balance.threat())], level: g.balance.level().id, creatures: g.creatures.host.size, facStage: g.run.fac?.stage, objectives: document.querySelector('.objectives')?.innerText?.replace(/\s+/g, ' ').slice(0, 200) };
  R.dc_facility = (() => { kefal.tick(2, 1 / 30, true); return { ...kefal.engine.sceneStats }; })();
  // exercise the facility widgets: open a puzzle path lightly - toggle a lockdown + alarm so the FACILITY STATUS widget has content
  try { g.facilitysys.force?.('blackout'); } catch (e) { R.forceErr = String(e); }
  await tick(30);
  return R;
});
nanScan('facility2');

// mid-run HUD state: toasts + banners
await sec('hud', async () => {
  stand?.(); await tick(6, true);
  for (const s of ['+Shiba Figurine ▮45', 'Threat rising: UNEASY', 'Contract: Salvage 40', 'NEW SPELL LEARNED']) g.ui.toast?.(s, 'info');
  g.ui.hud?.toast?.('Dumping toast 5', 'good');
  await tick(6, true); await sleep(250);
  const ov = hudOverlaps();
  await shot('rev_hud_facility');
  return ov;
});

// ------------------------------------------------------------------ S6 back to the ship, midnight takeoff, summary + case file
await sec('takeoff', async () => {
  g.ui.closePanel?.();
  g.player.teleport(new THREE.Vector3(0, 1, 0), 0); g.player.inShip = true; await tick(6);
  const R = { creditsBefore: g.run.credits, shipItems: g.items.inShipItems().length };
  g.run.time = 24 * 60 - 2; await tick(30, false, 0.1);
  R.phaseAfterMidnight = g.run.phase;
  await sleep(7600); await tick(6);
  R.phase = g.run.phase; R.day = g.run.day; R.daysLeft = g.run.daysLeft;
  R.threatAfter = g.balance.threat();
  R.cine = [g.ui.cineActive && (g.ui.cineActive.kind || 'active'), ...(g.ui.cineQ || []).map((c) => c.kind)];
  R.caseFile = g.profile.caseFiles?.[0] && { n: g.profile.caseFiles[0].n, value: g.profile.caseFiles[0].value, verdict: g.profile.caseFiles[0].verdict?.key, keys: Object.keys(g.profile.caseFiles[0]).length };
  R.contractAfter = g.run.contract ? g.run.contract.state : null; R.contractLog = g.run.contractLog?.slice(-1);
  R.algoFocus = g.run.algo?.focus;
  await sleep(1200); await tick(4, true);
  R.overlay = [...document.querySelectorAll('[class*="rp-"], [class*="lcase"], .cinematic, .cine')].filter((e) => e.getBoundingClientRect().width > 100).map(desc).slice(0, 6);
  R.junk = junk(document.getElementById('ui')?.innerText);
  await shot('rev_takeoff_summary');
  return R;
});
nanScan('takeoff');

await sec('after', async () => {
  const R = {};
  try { g.ui.clearCinematics?.(); } catch {}
  await tick(20);
  R.ui = hudOverlaps();
  R.dc_orbit = (() => { kefal.tick(2, 1 / 30, true); return { ...kefal.engine.sceneStats }; })();
  R.mem = { geometries: kefal.engine.renderer.info.memory.geometries, textures: kefal.engine.renderer.info.memory.textures, programs: kefal.engine.renderer.info.programs?.length };
  R.runBytes = JSON.stringify(g.run).length;
  const sizes = Object.entries(g.run).map(([k, v]) => [k, JSON.stringify(v ?? null)?.length || 0]).sort((a, b) => b[1] - a[1]);
  R.biggest = sizes.slice(0, 6);
  R.profileBytes = JSON.stringify(g.profile).length;
  // update cost per tick in orbit
  const t0 = performance.now(); kefal.tick(60, 1 / 30, false); R.msPerTickOrbit = r1((performance.now() - t0) / 60);
  return R;
});

out.bad = bad; out.errs = errs.slice(0, 40); out.errCount = errs.length;
return out;
