// Wave-6 home3: land on HOME (leaves the onboarding moon first), grab views as 640x360 JPEG data URLs of the game canvas (HUD hidden) + renderer.info with the decor hidden / shown.
// "before" = decor hidden + the old navy biome palette, "after" = the Off-Grid Claim. Prints JSON; tools/harness/wave6_home3_save.mjs writes the jpgs.
//   flock /tmp/tfg-browser.lock node tools/harness/headless_shots.mjs --port PORT --script tools/harness/wave6_home3.js --wait 3000 > /tmp/h3.json
const g = kefal.game, errs = [], V = (x, y, z) => new THREE.Vector3(x, y, z), sleep = (ms) => new Promise((r) => setTimeout(r, ms));
addEventListener('error', (e) => errs.push(e.message));
const HOME_Y = -1.25, out = { errs, jpg: {}, diag: {} };
const tick = async (n, dt = 1 / 30, render = false) => { for (let i = 0; i < n; i += 30) { kefal.tick(Math.min(30, n - i), dt, render); await sleep(5); } };
g.ui?.closePanel?.(); g.ui?.clearCinematics?.();
out.diag.start = { phase: g.run.phase, moon: g.run.moon };
if (g.run.phase === 'moon' || g.run.phase === 'company') { g.player.inShip = true; g.hostBeginTakeoff('lever'); g.hostFinishTakeoff?.(); await tick(60); }
if (g.run.phase !== 'orbit') { g.hostSetPhase?.('orbit'); await tick(10); }
out.diag.orbit = g.run.phase;
g.run.daysLeft = Math.max(3, g.run.daysLeft || 3); g.run.moon = 'home'; g.player.inShip = true; g.hostLever(g.selfId); g.hostFinishLanding();
await tick(150);
out.diag.landed = { phase: g.run.phase, moon: g.run.moon, decor: !!g.world.outdoor?.decor, home: !!g.world.outdoor?.home };
if (!out.diag.landed.home) return out;
g.player.inShip = false; g.ui?.hud?.hide?.();
const cv = g.engine.renderer.domElement;
{ let n = cv; while (n && n !== document.body) { for (const s of n.parentElement.children) if (s !== n && s.tagName !== 'SCRIPT') s.style.visibility = 'hidden'; n = n.parentElement; } }
const RI = g.engine.renderer.info; RI.autoReset = false;
const tile = document.createElement('canvas'); tile.width = 640; tile.height = 360; const tx = tile.getContext('2d');
const look = (px, py, pz, lx, ly, lz) => { g.player.teleport(V(px, HOME_Y + py - 1.62, pz)); const d = V(lx - px, ly - py, lz - pz); g.player.yaw = Math.atan2(-d.x, -d.z); g.player.pitch = Math.asin(d.y / d.length()); };
const measure = () => { RI.reset(); kefal.tick(1, 1 / 60, true); return { calls: RI.render.calls, tris: RI.render.triangles }; };
const grab = async (name, v) => { look(...v); await tick(12, 1 / 30, true); await sleep(60); kefal.tick(1, 1 / 60, true); tx.drawImage(cv, 0, 0, 640, 360); out.jpg[name] = tile.toDataURL('image/jpeg', 0.7); };
// [eyeX, eyeH above ground, eyeZ, lookX, lookY (above ground), lookZ]
const views = { north: [2.6, 1.7, 30, 10, 26, -100], corner: [12, 4, 24, 42, 1.5, 42], high: [0, 40, 66, 0, 0, -12] };
const more = { east: [36, 1.7, 6, 118, 30, -110], west: [-30, 1.7, 30, -50, 2, 52], pad: [-6, 1.7, 22, 0, 0.5, -8] };
const dg = g.world.outdoor.decor?.group, bio = g.env.biome, keep = { ...bio };
// BEFORE: decor hidden + the old navy palette
if (dg) dg.visible = false; Object.assign(bio, { sky: 0x2a3f6a, fog: 0x32466f, fogDensity: 0.009, night: 0x0a1030, sun: 0xffe2b8 });
for (const [k, v] of Object.entries(views)) await grab('before_' + k, v);
out.without = measure();
// AFTER
if (dg) dg.visible = true; Object.assign(bio, keep);
for (const [k, v] of Object.entries({ ...views, ...more })) await grab('after_' + k, v);
out.with = measure();
{ let lights = 0; g.engine.scene.traverse((c) => { if (c.isLight) lights++; }); out.sceneLights = lights; }
out.info = { geometries: RI.memory.geometries, textures: RI.memory.textures };
out.decor = g.world.outdoor.decor?.stats?.();
out.pageErrors = errs.slice(0, 6);
return out;
