// wave4 checkup step 4: the owner's complaints. Pointer lock (real mouse/keyboard via window.__click / __press),
// emote camera, no passive HP regen, skill / revive cooldowns, held-item viewmodel shot, menu hands after leaving.
const out = {};
const canvas = kefal.engine.canvas;
const lockedNow = () => document.pointerLockElement === canvas;
const waitLock = async (want, ms = 1200) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { if (lockedNow() === want) return true; await sleep(50); } return lockedNow() === want; };
if (g.run.phase !== 'orbit' && g.run.phase !== 'moon') { try { await takeoff(); } catch { /* */ } }
g.ui.clearCinematics?.(); g.ui.closePanel?.(); await tick(2);
// ---- role menu + inventory in TR / RU (longer strings -> overlap?)
try {
  const i18n = await import('/src/core/i18n.js');
  const L0 = i18n.getLang();
  out.panelsLang = {};
  for (const l of ['tr', 'ru']) {
    i18n.setLang(l); await tick(2);
    g.rpg.openRoles(); await tick(3, true); await sleep(50);
    const grid = g.ui.panelOpen?.querySelector('.rl-grid');
    out.panelsLang['roles_' + l] = { ...panelInfo(), gridScroll: grid ? [grid.clientHeight, grid.scrollHeight] : null };
    await shot('ck_owner_roles_' + l); g.ui.closePanel(); await tick(2);
    g.inventory.open(); await tick(3, true); await sleep(50);
    out.panelsLang['inv_' + l] = panelInfo() || { none: true, isOpen: g.inventory.isOpen() };
    await shot('ck_owner_inv_' + l); g.inventory.close(); g.ui.closePanel(); await tick(2);
  }
  i18n.setLang(L0); await tick(2);
} catch (e) { out.panelsLang = { THROW: String(e.stack || e).slice(0, 300) }; }
// ---- pointer lock
const PL = {};
try {
  const hint = () => !g.ui.clickHint.classList.contains('hidden');
  await window.__click(640, 400); PL.lockAfterClick = await waitLock(true);
  document.exitPointerLock(); await waitLock(false); await sleep(100); await tick(1);
  PL.pauseOpened = !!g.ui.panelOpen && /pause/i.test(g.ui.panelOpen.className + ' ' + g.ui.panelOpen.innerText.slice(0, 20));
  const resume = [...(g.ui.panelOpen?.querySelectorAll('button') || [])].find((b) => /resume/i.test(b.textContent));
  if (resume) { const r = resume.getBoundingClientRect(); await window.__click(r.left + r.width / 2, r.top + r.height / 2); PL.lockAfterResume = await waitLock(true); PL.panelAfterResume = !!g.ui.panelOpen; }
  // pause again, then click the dark area OUTSIDE the pause box
  document.exitPointerLock(); await waitLock(false); await sleep(100);
  PL.pause2 = !!g.ui.panelOpen;
  await window.__click(60, 690); await sleep(300); PL.lockAfterOutsideClick = lockedNow(); PL.panelAfterOutsideClick = !!g.ui.panelOpen;
  // ESC closes the pause box (ESC is not a user activation -> lock may be refused), then one click on the game
  if (g.ui.panelOpen) { await window.__press('Escape'); await sleep(250); }
  PL.afterEsc = { panel: !!g.ui.panelOpen, locked: lockedNow(), hint: hint() };
  await window.__click(640, 400); PL.lockAfterEscThenClick = await waitLock(true);
  // inventory (I) open -> ESC -> click
  g.inventory.open(); await tick(2); await sleep(100);
  await window.__press('Escape'); await sleep(250);
  PL.invEsc = { panel: !!g.ui.panelOpen, locked: lockedNow(), hint: hint() };
  await window.__click(640, 400); PL.lockAfterInvEscClick = await waitLock(true);
  // terminal: open, ESC, click
  g.terminal.open(); await tick(2); await window.__press('Escape'); await sleep(250);
  PL.termEsc = { active: !!g.terminal.active, locked: lockedNow(), hint: hint() };
  await window.__click(640, 400); PL.lockAfterTermEscClick = await waitLock(true);
} catch (e) { PL.THROW = String(e.stack || e).slice(0, 300); }
out.pointer = PL;
document.exitPointerLock(); await sleep(150); g.ui.closePanel?.(); await tick(2);
// ---- emote camera
try {
  const { EMOTE_BY_ID } = await import('/src/game/emotes.js');
  if (g.run.phase !== 'moon') await land('hamsi');
  g.player.inShip = false;
  const gy = (x, z) => (g.world.terrain?.heightAt?.(x, z) ?? 0);
  g.player.teleport(V(4, gy(4, 22) + 0.3, 22), 0.6); await tick(10);
  g.emotes.play(EMOTE_BY_ID.dance); await tick(10, true);
  const cam = kefal.engine.camera.position, p = g.player.pos;
  const fwd = V(-Math.sin(g.player.yaw), 0, -Math.cos(g.player.yaw));
  const rel = V(cam.x - p.x, 0, cam.z - p.z);
  out.emote = { active: g.emotes.active, third: g.emotes.thirdPerson, camDist: r1(rel.length()), camInFront: rel.normalize().dot(fwd) > 0, dot: r1(rel.dot(fwd)), avatarVisible: !!g.emotes.avatar?.root?.visible };
  await shot('ck_owner_emote_cam');
  g.emotes.stop(); await tick(4);
} catch (e) { out.emote = { THROW: String(e.stack || e).slice(0, 300) }; }
// ---- passive HP regen (should be none)
g.player.hp = 50; const hp0 = g.player.hp;
for (let i = 0; i < 6; i++) { kefal.tick(100, 1 / 10, false); await sleep(3); }
out.hpRegen60s = { before: hp0, after: r1(g.player.hp), dead: g.player.dead };
g.player.hp = g.player.maxHp;
// ---- role skill cooldowns
try {
  const R = g.combat.roles;
  out.cooldowns = Object.fromEntries(Object.entries(R.ROLE_SKILLS).map(([k, v]) => [k, v.map((s) => s.id + ':' + s.cd)]));
  R.debugRole = 'medic'; await tick(2);
  const used = R.use(0); await tick(2);
  out.medicBeam = { used, left: r1((R.cds.get('beam') || 0) - g.time) };
  R.debugRole = null;
} catch (e) { out.cooldowns = { THROW: String(e).slice(0, 200) }; }
// ---- viewmodel with a held bat / pipe (lead is fixing grips; shot for reference only)
try {
  for (const ty of ['bat', 'pipe']) {
    const id = g.items.hostSpawn(ty, g.player.pos.clone().add(V(0, 1, 0)), { holder: g.selfId }); await tick(4);
    const sl = g.player.slots.indexOf(id); if (sl >= 0) { g.player.slot = sl; g.refreshHeldVisuals?.(); }
    g.player.pitch = 0; await tick(6, true); await shot('ck_owner_vm_' + ty);
    g.net.request('drop', { id }); await tick(3);
  }
} catch (e) { out.vm = String(e).slice(0, 200); }
out.nan = nanScan('owner');
// ---- main menu after leaving the game: must not show hands (camera children)
try {
  kefal.leaveGame(); await sleep(400);
  const m = kefal.menu; for (let i = 0; i < 5; i++) { m?.update?.(0.1); } kefal.engine.render(0.1);
  out.menuAfterLeave = { menu: !!m, camChildren: kefal.engine.camera.children.map((c) => c.name || c.type) };
  await window.__shot('ck_owner_menu_after_leave');
} catch (e) { out.menuAfterLeave = { THROW: String(e.stack || e).slice(0, 300) }; }
out.errs = newErrs();
return out;
