// wave9 fastmenu node test: startGame awaits assetsReady BEFORE any Game exists, ext content order is unchanged, frame ring stats.  node tools/harness/fastmenu.test.mjs
import fs from 'fs';
const { makeFrameRing, pushFrame, frameStats } = await import('../../src/game/warmset_core.js');
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } };
const src = fs.readFileSync(new URL('../../src/main.js', import.meta.url), 'utf8');
const at = (re) => { const m = re.exec(src); return m ? m.index : -1; };

// boot: menu is built without awaiting the GLB preload; the chain keeps its old order (models -> registerExtContent -> mods.loadAll -> boot)
const boot = src.slice(at(/async boot\(\)/), at(/async loadAssetsBg\(\)/));
ok(!/await preloadExtModels/.test(boot), 'boot must not await preloadExtModels');
ok(at(/this\.assetsReady = this\.loadAssetsBg\(\)/) > 0, 'assetsReady is stored on the app');
const bg = src.slice(at(/async loadAssetsBg\(\)/), at(/\n  bindKeys\(\) \{/));
const o = ['await preloadExtModels', 'registerExtContent()', 'await this.mods.loadAll()', "emit('boot'"].map((s) => bg.indexOf(s));
ok(o.every((v) => v >= 0) && o.every((v, i) => i === 0 || v > o[i - 1]), 'bg chain order models -> ext content -> mods -> boot: ' + o);
// startGame: await before new Game, loading overlay with progress, no wait when done
const sg = src.slice(at(/async startGame\(opts\)/), at(/leaveGame\(\) \{/));
const iAw = sg.indexOf('await this.assetsReady'), iGame = sg.indexOf('new Game(');
ok(iAw > 0 && iGame > iAw, 'startGame awaits assetsReady before new Game');
ok(/if \(!this\.assetsDone && this\.assetsReady\)/.test(sg), 'no delay when assets are done');
ok(sg.includes('Loading models... {d}/{n}'), 'loading overlay shows model progress while waiting');
// every session entry goes through startGame; the join link still calls joinGame
ok(/hostGame[\s\S]*?this\.startGame\(/.test(src) && /joinGame\(opts\)[\s\S]*?this\.startGame\(/.test(src), 'host/join go through startGame');
ok(/parseJoin\(location\.search[\s\S]{0,80}this\.joinGame\(j\)/.test(src), 'join link auto-join intact');
ok(!/new Game\(/.test(src.replace(sg, '')), 'startGame is the only place that creates a Game');
// quality probe waits for the background parsing
ok(/assetsReady\.then\(\(\) => \{[^}]*FpsProbe/.test(src), 'FpsProbe starts after assetsReady');

// frame ring: percentile math, gaps ignored, ring wraps without growing
const r = makeFrameRing(100); let t = 1000; pushFrame(r, t);
for (let i = 0; i < 99; i++) { t += 10; pushFrame(r, t); }
t += 100; pushFrame(r, t);   // one 100 ms hitch
t += 5000; pushFrame(r, t);  // a hidden-tab gap is not a frame
const s = frameStats(r);
ok(s.frames === 100 && r.buf.length === 100, 'ring capped at 100 frames: ' + s.frames);
ok(s.p50 === 10 && s.p95 === 10, 'p50/p95 ' + s.p50 + '/' + s.p95);
ok(s.p99 === 100 && s.low1pctFps === 10, 'p99 / 1% low ' + s.p99 + '/' + s.low1pctFps);
ok(frameStats(makeFrameRing()).p50 === null, 'empty ring -> null');
console.log(fail ? 'fastmenu: ' + fail + ' FAIL' : 'fastmenu: all ok');
process.exit(fail ? 1 : 0);
