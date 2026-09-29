// wave4 checkup step 1: baseline in orbit + every major panel at 1280x720 (screenshot + text-overlap + junk scan).
const out = { base: {}, panels: [] };
out.base = {
  phase: g.run.phase, moon: g.run.moon, credits: g.run.credits, quota: g.run.quota, day: g.run.day, daysLeft: g.run.daysLeft,
  modules: g.wave1, missing: ['inventory', 'rpg', 'shop', 'forge', 'shipyard', 'pets', 'homeworld', 'food', 'cycle', 'worlds2', 'mirror', 'backrooms', 'fpbody', 'combat', 'trade'].filter((m) => !g[m]),
  runBytes: JSON.stringify(g.run).length, profileBytes: JSON.stringify(g.profile).length, dom: document.querySelectorAll('*').length,
  hp: [g.player.hp, g.player.maxHp], pos: g.player.pos.toArray().map(r1), inShip: g.player.inShip,
  stats: stats(), nan: nanScan('orbit'),
};
const P = [
  ['inventory', () => g.inventory.open(), () => g.inventory.close()],
  ['tree', () => g.rpg.open()],
  ['roles', () => g.rpg.openRoles()],
  ['character', () => g.ui.openPanel(g.ui.characterPanel(true))],
  ['shop', () => g.shop.open(), () => g.shop.close?.()],
  ['crafting', () => g.crafting.open(), () => g.crafting.close?.()],
  ['forge', () => g.forge.open(), () => g.forge.close?.()],
  ['shipyard', () => g.shipyard.open()],
  ['pets', () => g.pets.open(), () => g.pets.close?.()],
  ['homeworld', () => g.homeworld.open(), () => g.homeworld.close?.()],
  ['board', () => g.lore.openBoard()],
  ['recordJ', () => press('KeyJ')],
];
for (const [name, open, close] of P) {
  const r = { name };
  try {
    g.ui.closePanel?.(); await tick(2);
    await open(); await tick(3, true); await sleep(60);
    r.info = panelInfo();
    if (!r.info) r.note = 'NO PANEL (panelOpen null)';
    await shot('ck_orbit_' + name);
    if (close) close(); g.ui.closePanel?.(); await tick(2);
    r.closed = !g.ui.panelOpen;
  } catch (e) { r.THROW = String(e.stack || e).slice(0, 400); try { g.ui.closePanel(); } catch { /* */ } }
  out.panels.push(r);
}
// HUD in orbit: overlapping text
g.ui.closePanel?.(); await tick(4, true);
out.hudOverlaps = textOverlaps(document.getElementById('ui')).slice(0, 12);
out.hudOff = offscreen();
out.errs = newErrs();
return out;
