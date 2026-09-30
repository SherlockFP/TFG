// QA night 3 fixes check (fresh tab, ONE landing; prepend qa_night2_lib.js): held shovel + pickaxe in the ship, then Rooftop Blackout City from the street.
const gyAt = (x, z) => g.world.outdoor?.terrain?.heightAt?.(x, z) ?? 0;
async function hold(id) { const p = g.player; p.slots.fill(null); const iid = g.items.hostSpawn(id, p.pos.clone().setY(p.pos.y + 1), { holder: g.selfId }); await frames(3, false); p.slots[0] = iid; p.slot = 0; g.refreshHeldVisuals?.(); await frames(8); return g.items.get(iid)?.type; }
await step('held', async () => {
  g.player.inShip = true; look(0, 1.0, 2, 0, -0.1); g.settings.hudDensity = 'standard'; g.hudcalm?.pass?.(); await frames(4);
  R.shovel = await hold('shovel'); await shot('n3fix_shovel.jpg');
  R.pick = await hold('x_pickaxe'); await shot('n3fix_pickaxe.jpg');
  g.player.slots.fill(null); g.refreshHeldVisuals?.();
});
await step('roof', async () => {
  const info = await land('ex_roof', false); R.landRoof = info; const S = g.expeditions.state, P = S.P; g.player.inShip = false;
  const bb = P.bbs[0], c = P.spawnCell;
  const dx = bb.x - c.x, dz = bb.z - c.z, dl = Math.hypot(dx, dz) || 1, fx = bb.x - (dx / dl) * 9, fz = bb.z - (dz / dl) * 9;
  look(fx, Math.max(gyAt(fx, fz), c.y) + 0.1, fz, yaw2(fx, fz, bb.x, bb.z), 0.18); await frames(24); await shot('n3fix_roof_a.jpg');
  const st = P.stairs[0], gy = gyAt(0, 0) + 0.1;
  look(0, gy, 0, yaw2(0, 0, st.x, st.z), 0.25); await frames(24); await shot('n3fix_roof_b.jpg');
});
R.errs = 'see LOGS'; console.log('QA: R ' + JSON.stringify(R).slice(0, 1500)); return R;
