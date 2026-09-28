// Wave 2 combat feature check (body for tools/harness/headless.mjs --script). NOTE: written in a budget-capped session and NOT run yet -
// run it once before trusting the module:
//   flock /tmp/tfg-browser.lock timeout 400 node tools/harness/headless.mjs --port 5251 --script tools/harness/wave2_combat.js --shot /tmp/combat.png
const g = kefal.game, errs = []; addEventListener('error', (e) => errs.push(e.message));
const out = {}, wait = (ms) => new Promise((r) => setTimeout(r, ms));
const tick = async (n = 10, dt = 1 / 30) => { kefal.tick(n, dt, false); await wait(5); };
g.run.daysLeft = 3; g.run.moon = 'hamsi'; g.player.inShip = true; g.hostLever(g.selfId); g.hostFinishLanding();
for (let i = 0; i < 20; i++) await tick();
const s0 = g.world.facility.scrapSpots[2];
g.player.teleport(new THREE.Vector3(s0.x, s0.y + 0.2, s0.z)); await tick(15);
const C = g.combat;
out.installed = !!(C && C.melee && C.weapons && C.spells && C.roles);
const fwd = () => new THREE.Vector3(-Math.sin(g.player.yaw), 0, -Math.cos(g.player.yaw));
const give = async (type, extra = {}) => { const it = g.items.hostSpawn(type, g.player.pos.clone().add(new THREE.Vector3(0, 1, 0)), { holder: g.selfId, ...extra }); await tick(6); const i = g.player.slots.indexOf(it.id); if (i >= 0) g.switchSlot(i); await tick(3); return it; };
const dummy = async (dist, type = 'crawler') => { const p = g.player.pos.clone().addScaledVector(fwd(), dist); const c = g.creatures.hostSpawn(type, p, { state: 'idle' }); c.age = 0; c.stunT = 99; c.setState('stunned'); c.maxHp = c.hp = 9999; await tick(4); return c; };

// ---- melee: 3-hit combo, then a parry
await give('longsword');
const c1 = await dummy(1.6);
const hp0 = c1.hp, steps = [];
for (let n = 0; n < 3; n++) { C.melee.swing('l'); for (let i = 0; i < 24; i++) { await tick(1, 1 / 60); if (!C.melee.state.atk) break; } steps.push(C.melee.state.step); await tick(3, 1 / 60); }
await tick(20);
out.combo = { steps, dmg: Math.round(hp0 - c1.hp) };
C.melee.swing('h', 1); await tick(60, 1 / 60);
out.heavy = { dmg: Math.round(hp0 - c1.hp), stunned: c1.stunT > 0 };
const c2 = await dummy(1.4); c2.stunT = 0; c2.setState('idle');
C.melee.setBlock(true); await tick(4, 1 / 60);
const before = g.player.hp;
g.onHurt({ dmg: 30, cause: 'crawler', from: c2.id, p: [c2.pos.x, c2.pos.y, c2.pos.z] });
await tick(6, 1 / 60);
out.parry = { hpLost: Math.round(before - g.player.hp), attackerStunned: c2.stunT > 0 };
C.melee.setBlock(false);

// ---- rocket splash + rocket jump
const rl = await give('rocketlauncher'); rl.ammo = 1;
const c3 = await dummy(2.2, 'spider'); const c3hp = c3.hp;
g.player.pitch = -1.45; g.nextSwing = 0; g.player.vel.set(0, 0, 0);
const hpBefore = g.player.hp; let maxVy = 0;
g.useHeldPress();
for (let i = 0; i < 50; i++) { await tick(1, 1 / 60); maxVy = Math.max(maxVy, g.player.vel.y); }
out.rocket = { rocketJumpVy: +maxVy.toFixed(1), selfDamage: Math.round(hpBefore - g.player.hp), alive: !g.player.dead, splashOnNearby: Math.round(c3hp - c3.hp) };
g.player.pitch = 0; await tick(60);

// ---- spell: chain lightning through 3 dummies
g.magic.learn('zap', { announce: false }); g.magic.mana = 100; g.magic.resetCooldowns?.();
const line = []; for (const d of [3, 5, 7]) line.push(await dummy(d, 'scuttler'));
const hps = line.map((c) => c.hp);
const r = g.magic.cast('zap', { source: 'key' }); await tick(20);
out.zap = { ok: r.ok, hit: line.filter((c, i) => c.hp < hps[i]).length };

// ---- role skills: enforcer War Cry, medic Heal Beam
C.roles.debugRole = 'enforcer'; const c4 = await dummy(3, 'hound'); c4.stunT = 0; c4.setState('idle');
C.roles.use(1); await tick(10);
out.warCry = { staggered: c4.stunT > 0 };
C.roles.debugRole = 'medic'; g.player.hp = 40; C.roles.use(0); await tick(10);
out.healBeam = { hp: Math.round(g.player.hp) };
out.errs = errs;
return out;
