// nvgear headless check: buy-able goggles, toggle via useHeldPress, look applied + drains, dazzle on flash, timed charge at the ship charger.
const g = kefal.game, p = g.player, errs = [], out = {};
addEventListener('error', (e) => errs.push(e.message));
const tick = async (n) => { for (let i = 0; i < n; i++) { kefal.tick(1, 1 / 30, false); await new Promise((r) => setTimeout(r, 5)); } };
const hold = async (type) => {
  const id = g.items.hostSpawn(type, p.pos.clone().setY(p.pos.y + 1), { holder: g.selfId }); await tick(3);
  const s = p.slots.indexOf(null); p.slots[s] = id; p.slot = s; g.refreshHeldVisuals?.(); return g.items.get(id);
};
out.store = ['nvg1', 'nvg2', 'nvcell'].map((id) => !!g.shop?.buyables?.().some((e) => e.id === id));
const U = g.engine.postMat.uniforms, gam0 = U.uGamma.value;
const nv = await hold('nvg1');
g.useHeldPress(); await tick(4);
out.on = nv.on; out.gammaOn = +(U.uGamma.value / gam0).toFixed(2); out.active = g.nvgear.active;
const b0 = nv.battery; await tick(30); out.drained = +(b0 - nv.battery).toFixed(2);
g.engine.flash(0xffffff, 1); await tick(2); out.dazzle = +g.nvgear.dazzle.toFixed(2);
g.useHeldPress(); await tick(4); out.off = !nv.on; out.gammaOff = +(U.uGamma.value / gam0).toFixed(2);
// timed charge
nv.battery = 10; p.inShip = true;
const pt = g.ship.points.charger; p.teleport(pt.clone().add(new THREE.Vector3(0, -1, 0.9)), 0);
await tick(3);
const ip = g.interactablesNow().find((o) => o.pos === pt); out.chargeLabel = ip && (typeof ip.label === 'function' ? ip.label() : ip.label);
ip?.action(); await tick(8); out.charging = g.nvgear.charging;
await tick(100); out.after = nv.battery; out.chargingEnd = g.nvgear.charging;
const cell = await hold('nvcell'); nv.battery = 5; const fl = nv; g.useHeldPress(); await tick(4); out.cell = nv.battery;
out.errs = errs;
return out;
