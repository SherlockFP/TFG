// Node test for the pure parts of the creature emote system (no browser):
//   node tools/harness/cemotes.test.mjs
// Every registered creature id resolves to a personality, reaction / idle / win tables are complete, body fx return to neutral, cooldown logic.
import fs from 'fs';
import { CREATURES } from '../../src/game/creatures.js';
import {
  ARCH, CREATURE_ARCH, KINDS, EMOTE_KIND, COPY_MAP, BUBBLES, BODY, EMOTE_DUR, WIN_LINES, CD, CooldownBook, NOTES, NOTE_KIND,
  resolvePersonality, guessArch, pickEmote, canReact, markReact, nextIdleDelay, newOffsets, resetOffsets, ampFor, translationMap,
} from '../../src/game/cemotes_data.js';

let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.log('FAIL', m); } };
const REACTS = new Set(['ignore', 'curious', 'laugh', 'copy', 'wave', 'sulk', 'join', 'shy', 'enrage']);
const src = (f) => fs.readFileSync(new URL('../../src/game/' + f, import.meta.url), 'utf8');

// ---- every registered creature id: base table + ids registered by other modules (their files import three / DOM, so they are scanned as text)
const ids = new Set(Object.keys(CREATURES));
const wave1 = src('creatures_wave1.js');
const defs = wave1.slice(wave1.indexOf('export const DEFS'), wave1.indexOf('export const ITEM_DEFS'));
for (const m of defs.matchAll(/^  ([a-z_]+): \{/gm)) ids.add(m[1]);
for (const id of ['zombot', 'hs_enforcer', 'hs_gunner', 'hs_leader', 'doppel', 'collector', 'janitor', 'hoardnest', 'janitorbin']) ok(ids.has(id), 'scanned wave-1 id ' + id);
ok(src('bosses.js').includes("FOREMAN = 'foreman'") && src('bosses.js').includes("LEGACY = 'legacybot'"), 'boss ids unchanged');
for (const m of src('extcontent.js').matchAll(/registerCreature\('([a-z_]+)'/g)) ids.add(m[1]);
ids.add('foreman'); ids.add('legacybot');
ok(ids.has('skeleton') && ids.has('robot'), 'ext creatures scanned');
let explicit = 0; const fallback = [];
for (const id of ids) {
  const def = CREATURES[id] || {};
  const p = resolvePersonality(id, def);
  ok(p && p.id === id && ARCH[p.arch], `personality for ${id}`);
  for (const k of KINDS) ok(REACTS.has(p.react[k]), `${id}: react.${k} = ${p.react[k]}`);
  ok(Array.isArray(p.idle) && Array.isArray(p.win), `${id}: idle / win arrays`);
  if (!p.mute) ok(p.idle.length > 0 && p.win.length > 0, `${id}: non-mute has idle + win pools`);
  for (const pool of [p.idle, p.win]) for (const [body, bubs] of pool) { ok(BODY[body], `${id}: body ${body}`); for (const b of bubs) ok(BUBBLES[b], `${id}: bubble ${b}`); }
  for (const [body] of p.win) ok(WIN_LINES[body], `${id}: chat lines for win emote ${body}`);
  ok(['chase', 'noise', 'anger'].includes(p.rage), `${id}: rage kind`);
  if (def.hazard) ok(p.mute, `${id}: hazards are mute`);
  if (CREATURE_ARCH[id]) explicit++; else fallback.push(id);
}
for (const id of Object.keys(CREATURES)) ok(CREATURE_ARCH[id], `base creature ${id} has an explicit personality`);
console.log(`personalities: ${ids.size} ids, ${explicit} explicit, fallback: ${fallback.join(', ') || '-'}`);

// ---- unknown / future creatures resolve from their stats (or def.cemote)
const arch = (def) => resolvePersonality('future_' + JSON.stringify(def), def).arch;
ok(arch({ hazard: true }) === 'stoic' && resolvePersonality('x1', { hazard: true }).mute, 'future hazard is mute');
ok(arch({ boss: true, hp: 999 }) === 'boss', 'future boss -> boss');
ok(arch({ hp: null, dmg: 999 }) === 'stoic', 'future unkillable -> stoic');
ok(arch({ hp: 30, dmg: 5 }) === 'swarm' && arch({ hp: 100, pack: [2, 4] }) === 'swarm', 'future fodder -> swarm');
ok(arch({ hp: 200, dmg: 40 }) === 'predator', 'future brute -> predator');
ok(arch({ hp: 200, cemote: 'partygoer' }) === 'partygoer', 'def.cemote overrides');
ok(guessArch({}).length === 2, 'guessArch on an empty def');

// ---- the tactical reactions the owner asked for
const P = (id) => resolvePersonality(id, CREATURES[id]);
ok(P('tamagotchi').react.dance === 'join' && P('sludge').react.dance === 'join' && P('scuttler').react.dance === 'join', 'partygoers / swarms dance along (safe passage)');
ok(P('crawler').react.taunt === 'enrage' && P('lurker').react.taunt === 'enrage' && P('crawler').rage === 'chase' && P('lurker').rage === 'anger', 'predators are enraged by taunts');
ok(P('mimic').react.dance === 'copy' && P('mimic').react.taunt === 'copy', 'the mimic copies every emote');
ok(P('yoinker').react.dance === 'shy' && P('collector').react.greet === 'shy', 'shy types wave and flee');
ok(P('foreman').react.taunt === 'laugh' && P('foreman').noFreeze, 'bosses laugh and are never frozen');
ok(P('jester').mute && P('mannequin').mute && P('sandkefal').mute && P('stalker').mute, 'scare creatures never break character');
ok(P('tamagotchi').joinT >= 5 && P('scuttler').joinT >= 4 && P('scuttler').joinT < P('tamagotchi').joinT, 'join durations');

// ---- player emote kinds: every emote id known to the game maps to a kind and a copy body
const emoteIds = [...src('emotes.js').matchAll(/^  \{ id: '([a-z]+)'/gm)].map((m) => m[1]);
ok(emoteIds.length >= 20, 'found the player emotes (' + emoteIds.length + ')');
for (const e of emoteIds) { ok(KINDS.includes(EMOTE_KIND[e]), `emote ${e} has a kind`); ok(BODY[COPY_MAP[e]], `emote ${e} has a copy body`); }
for (const k of Object.values(EMOTE_KIND)) ok(KINDS.includes(k), 'kind ' + k);

// ---- body language: finite, neutral at the start and the end, bounded
const o = newOffsets();
const TAU = Math.PI * 2;
for (const [id, fx] of Object.entries(BODY)) {
  const d = EMOTE_DUR[id]; ok(d > 0.5, `${id} has a duration`);
  for (const h of [0.4, 1.8, 8]) {
    const a = ampFor(h);
    ok(a >= 0.07 && a <= 0.55, `amp ${a}`);
    for (let t = 0; t <= d + 1e-9; t += 0.02) {
      fx(resetOffsets(o), t, d, a);
      for (const [k, v] of Object.entries(o)) ok(Number.isFinite(v), `${id}.${k} finite at ${t}`);
      ok(Math.abs(o.y) <= a * 1.01 && Math.abs(o.x) <= a && o.sx > 0.7 && o.sx < 1.4 && o.sy > 0.6 && o.sy < 1.4, `${id} bounded at t=${t.toFixed(2)}`);
      ok(Math.abs(o.rx) < 1.2 && Math.abs(o.rz) < 0.6, `${id} rotation bounded`);
    }
    fx(resetOffsets(o), d, d, a);
    const ry = ((o.ry % TAU) + TAU) % TAU;
    ok(Math.abs(o.y) < 1e-6 && Math.abs(o.x) < 1e-6 && Math.abs(o.z) < 1e-6 && Math.abs(o.rx) < 1e-6 && Math.abs(o.rz) < 1e-6 && Math.abs(o.sx - 1) < 1e-6 && Math.abs(o.sy - 1) < 1e-6 && (ry < 1e-6 || TAU - ry < 1e-6), `${id} is neutral at t=dur`);
    fx(resetOffsets(o), 0, d, a);
    ok(Math.abs(o.y) < 1e-6 && Math.abs(o.rx) < 1e-6 && Math.abs(o.rz) < 1e-6 && Math.abs(o.sx - 1) < 1e-6 && Math.abs(o.ry) < 1e-6, `${id} is neutral at t=0`);
  }
}

// ---- pickEmote / idle delay
let seed = 7; const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const cnt = {}; for (let i = 0; i < 4000; i++) { const [b, bub] = pickEmote(ARCH.predator.win, rnd); cnt[b] = (cnt[b] || 0) + 1; ok(BUBBLES[bub], 'picked bubble'); }
ok(cnt.griddy > cnt.flex && cnt.hop > cnt.laugh, 'weights respected: ' + JSON.stringify(cnt));
ok(pickEmote([], rnd) === null && pickEmote(null, rnd) === null, 'empty pool -> null');
const d0 = []; for (let i = 0; i < 200; i++) d0.push(nextIdleDelay({ rate: 1 }, rnd));
ok(Math.min(...d0) >= CD.idleMin && Math.max(...d0) <= CD.idleMax, 'idle delay within range');
ok(nextIdleDelay({ rate: 0.5 }, () => 0) === CD.idleMin * 2, 'rate scales idle delay');

// ---- cooldowns
{
  const b = new CooldownBook();
  ok(canReact(b, 'c1', 'p1', 'join', 100), 'fresh: can react');
  markReact(b, 'c1', 'p1', 'join', 100, 6);
  ok(!canReact(b, 'c1', 'p1', 'curious', 105), 'same creature/player blocked (creature cooldown)');
  ok(!canReact(b, 'c1', 'p2', 'curious', 105), 'creature cooldown blocks other players too');
  ok(canReact(b, 'c2', 'p1', 'join', 105), 'other creature is free');
  ok(!canReact(b, 'c1', 'p2', 'join', 100 + CD.creature + 1), 'dance-off immunity outlasts the creature cooldown');
  ok(canReact(b, 'c1', 'p2', 'join', 100 + 6 + CD.joinImmune + 0.1), 'creature joins again once the immunity is over');
  ok(!canReact(b, 'c1', 'p1', 'join', 100 + 6 + CD.joinImmune + 0.1) && canReact(b, 'c1', 'p1', 'join', 100 + CD.joinPc + 0.1), 'same player waits joinPc for the same creature');
  ok(canReact(b, 'c1', 'p1', 'curious', 100 + CD.pc + 0.1), 'pc cooldown ends');
  const e = new CooldownBook();
  markReact(e, 'h1', 'p1', 'enrage', 50);
  ok(!canReact(e, 'h1', 'p2', 'enrage', 55), 'enrage per creature');
  ok(!canReact(e, 'h2', 'p1', 'enrage', 55), 'enrage per player (a taunt does not chain across a pack)');
  ok(canReact(e, 'h2', 'p1', 'enrage', 50 + CD.enragePlayer + 0.1), 'enrage per player ends');
  const bb = new CooldownBook();
  for (let i = 0; i < CD.burstN; i++) { ok(bb.burstOk('p', i), 'burst ' + i); bb.burstMark('p', i); }
  ok(!bb.burstOk('p', 10) && bb.burstOk('p', CD.burstWin + 1), 'burst cap then window slides');
  bb.set('x', 0, 1); bb.prune(100); ok(bb.m.size === 0, 'prune');
}

// ---- text: every victory line has EN + TR with placeholders, notes translate
const tr = translationMap();
for (const [id, arr] of Object.entries(WIN_LINES)) {
  ok(BODY[id], `win lines for a real body emote: ${id}`);
  for (const l of arr) { ok(l.en.includes('{c}') && l.en.includes('{p}') && l.tr.includes('{c}') && l.tr.includes('{p}'), 'placeholders: ' + l.en); ok(tr[l.en] === l.tr, 'translation registered: ' + l.en); }
}
for (const [k, txt] of Object.entries(NOTES)) { ok(tr[txt] && txt.includes('{c}') && tr[txt].includes('{c}'), 'note ' + k + ' EN+TR'); ok(NOTE_KIND[k], 'note kind ' + k); }
for (const id of Object.keys(ARCH)) for (const [b] of [...ARCH[id].win, ...ARCH[id].idle]) ok(BODY[b], `${id} pool body ${b}`);
// =====================================================================================================================
// Simulation of the runtime module against a fake game (no browser): victory path, player-emote reactions, idle emotes, camera, cleanup.
// =====================================================================================================================
const THREE = await import('three');
const { installCreatureEmotes } = await import('../../src/game/cemotes.js');
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const listeners = new Map();
const mods = { on(ev, fn) { if (!listeners.has(ev)) listeners.set(ev, new Set()); listeners.get(ev).add(fn); return () => listeners.get(ev).delete(fn); }, emit(ev, ...a) { for (const fn of [...(listeners.get(ev) || [])]) fn(...a); } };
const handlers = {}, sent = [], chat = [], toasts = [], noises = [], timers = [];
const dispatch = (t, d) => { sent.push([t, JSON.parse(JSON.stringify(d))]); handlers[t]?.(JSON.parse(JSON.stringify(d))); };
const net = { on_(t, fn) { handlers[t] = fn; }, broadcast: dispatch, sendTo: (id, t, d) => dispatch(t, d) };
const me = { id: 'me', pos: V(0, 0, 0), eye: V(0, 1.6, 0), dead: false, inShip: false, zone: 'out' };
const hosts = new Map(), views = new Map();
const game = {
  mods, net, isHost: true, selfId: 'me', time: 100, scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), emote: null, remotes: new Map(),
  player: { dead: false }, world: {}, physics: { lineOfSight: () => true },
  later(fn, ms) { timers.push({ at: this.time + ms / 1000, fn }); return timers.length; },
  ui: { chatMessage(n, text) { chat.push(text); }, toast(text, kind) { toasts.push([text, kind]); } },
  playerName: () => 'Hasan', aiPlayers: () => [me], aiPlayerById: (id) => (id === 'me' ? me : null),
  hostHurtPlayer() {}, hostOnPlayerDied() {},
  creatures: {
    views, host: hosts, nav: () => null, eye: (c) => V(c.pos.x, c.pos.y + 1, c.pos.z), noise(pos, loud, owner) { noises.push({ loud, owner }); },
    goTo(c, x, z) { c.path = [{ x, z }]; c.dest = V(x, 0, z); },
    follow(c, dt, sp) { const w = c.path?.[0]; if (!w) return true; const dx = w.x - c.pos.x, dz = w.z - c.pos.z, d = Math.hypot(dx, dz); if (d < 0.3) { c.path = null; return true; } c.pos.x += dx / d * Math.min(d, sp * dt); c.pos.z += dz / d * Math.min(d, sp * dt); return false; },
  },
};
const origHurt = game.hostHurtPlayer, origDied = game.hostOnPlayerDied;
const api = installCreatureEmotes(game);
mods.emit('netReady', net, game);
ok(game.hostHurtPlayer !== origHurt && game.hostOnPlayerDied !== origDied, 'module wraps hostHurtPlayer / hostOnPlayerDied');
const mkC = (id, type, x, z, state = 'idle') => {
  const def = CREATURES[type] || { name: type, hp: 100, height: 1.6, dmg: 10, run: 5, walk: 2 };
  const c = { id, type, def, state, stunT: 0, data: {}, zone: 'out', pos: V(x, 0, z), age: 10, dead: false, cooldown: 0, path: null, dest: null, target: null, lostT: 0, setState(st) { this.state = st; } };
  hosts.set(id, c);
  views.set(id, { id, type, def, root: new THREE.Group(), pos: c.pos.clone(), height: def.height || 1.5, state: 'idle', hidden: false });
  return c;
};
const clearAll = () => { hosts.clear(); views.clear(); api.book.m.clear(); api.book.hist.clear(); api.nextIdle.clear(); };
const camBase = V(0, 2.5, 3.5);
let dev = 0;
function advance(sec, { cam = false } = {}) {
  for (let i = 0; i < Math.round(sec * 30); i++) {
    const dt = 1 / 30; game.time += dt;
    for (let k = 0; k < timers.length; k++) { const tm = timers[k]; if (tm && game.time >= tm.at) { timers[k] = null; tm.fn(); } }
    // Game order: hostUpdate (stun countdown) -> CreatureView.update (root reset) -> updateSpectator (camera) -> mods 'update'
    for (const c of hosts.values()) { if (c.stunT > 0) c.stunT -= dt; const v = views.get(c.id); if (v) { v.pos.copy(c.pos); v.state = c.dead ? 'dead' : 'idle'; v.root.position.copy(v.pos); v.root.rotation.y = 0.5; } }
    if (cam) { game.camera.position.copy(camBase); game.camera.lookAt(0, 1, 0); }
    mods.emit('update', dt, game);
    for (const v of views.values()) dev = Math.max(dev, Math.abs(v.root.position.y - v.pos.y), Math.abs(v.root.rotation.x), Math.abs(v.root.rotation.z), Math.abs(v.root.scale.x - 1), Math.abs(v.root.scale.y - 1), Math.abs(v.root.rotation.y - 0.5));
  }
}
const ces = (k) => sent.filter(([t, d]) => t === 'ce' && (!k || d.k === k));

// ---- A. victory through the real hooks: hurt -> died -> (350 ms) -> freeze + 'win' broadcast -> chat line + camera on the killer
{
  const c = mkC('c1', 'lurker', 3, 0, 'run'); c.target = 'me';
  game.hostHurtPlayer('me', 1, 'lurker', 'c1', c.pos);
  me.dead = true; game.player.dead = true;
  game.hostOnPlayerDied('me', { cause: 'lurker', pos: [0, 0, 0] });
  advance(0.2, { cam: true });
  ok(ces('win').length === 0 && c.stunT === 0, 'victory waits ~350 ms after the death');
  advance(0.3, { cam: true });
  const w = ces('win')[0]?.[1];
  ok(w && w.id === 'c1' && w.v === 'me' && w.vn === 'Hasan' && w.ty === 'lurker', 'win message: ' + JSON.stringify(w));
  ok(c.stunT > 2 && c.state === 'idle' && c.target === null, 'the killer is frozen for the emote (stunT ' + c.stunT.toFixed(2) + ', ' + c.state + ')');
  ok(chat.length === 1 && chat[0].includes('Lurker') && chat[0].includes('Hasan'), 'chat line: ' + chat[0]);
  ok(api.stats().bodies === 1 && api.stats().bubbles === 1 && api.stats().focus, 'body + bubble + camera focus started: ' + JSON.stringify(api.stats()));
  ok(game.scene.children.some((o) => o.isSprite && o.visible), 'a bubble sprite is visible');
  advance(1.0, { cam: true });
  const hd = V(3, 2.2 * 0.6, 0);
  const want = Math.hypot(Math.max(3.2, Math.min(9.5, 2.6 + 2.2 * 1.4)), 0.5 + 2.2 * 0.25);
  ok(Math.abs(game.camera.position.distanceTo(hd) - want) < 0.5, `victim camera orbits the killer (dist ${game.camera.position.distanceTo(hd).toFixed(2)} vs ${want.toFixed(2)})`);
  ok(dev > 0.01, 'the body layer moved the model root (' + dev.toFixed(3) + ')');
  advance(1.3, { cam: true });
  ok(!api.stats().focus, 'camera focus lasts ~2 s only');
  advance(2, { cam: true });
  const v = views.get('c1');
  ok(api.stats().bodies === 0 && v.root.rotation.order === 'XYZ' && Math.abs(v.root.scale.y - 1) < 1e-9 && Math.abs(v.root.rotation.x) < 1e-9 && c.stunT <= 0, 'everything restored after the emote');
  advance(0.5); me.dead = false; game.player.dead = false;
  const m2 = ces('win').length; game.hostOnPlayerDied('me', { cause: 'fall' }); advance(0.6); ok(ces('win').length === m2, 'no victory emote for a fall');
  clearAll(); mkC('c2', 'crawler', 2, 0); const m3 = ces('win').length; game.hostOnPlayerDied('me', { cause: 'crawler', pos: [0, 0, 0] }); advance(0.6); ok(ces('win').length === m3 + 1 && ces('win').at(-1)[1].id === 'c2', 'fallback: nearest creature of the killer type');
  clearAll(); mkC('m9', 'mannequin', 2, 0); const m4 = ces('win').length; game.hostHurtPlayer('me', 999, 'mannequin', 'm9', V(2, 0, 0)); game.hostOnPlayerDied('me', { cause: 'mannequin' }); advance(0.6); ok(ces('win').length === m4, 'a mannequin never breaks character');
  clearAll(); const b = mkC('b1', 'foreman', 3, 0); game.hostHurtPlayer('me', 5, 'foreman', 'b1', b.pos); game.hostOnPlayerDied('me', { cause: 'foreman' }); advance(0.6); ok(ces('win').at(-1)?.[1].id === 'b1' && b.stunT === 0, 'boss victory does not freeze it');
}

// ---- B. player emotes near creatures
function playerEmote(netId, sec = 1.6) { game.emote = netId; advance(sec); game.emote = null; advance(0.3); }
{
  clearAll(); const n0 = sent.length;
  const sc = mkC('s1', 'scuttler', 5, 0, 'run'); sc.target = 'me';
  playerEmote('dance', 1.6);
  ok(sc.stunT > 2 && sc.state === 'idle' && sc.target === null, 'swarm bot dances along and stops being hostile (stunT ' + sc.stunT.toFixed(2) + ')');
  ok(sent.slice(n0).some(([t, d]) => t === 'ce' && d.k === 'e' && d.e === 'dance' && d.id === 's1'), 'dance body broadcast');
  ok(toasts.some(([txt, k]) => k === 'good' && txt.includes('Spam Bot')), 'the dancer is told: ' + toasts.at(-1)?.[0]);
  const before = ces('e').length;
  playerEmote('dance', 1.6);
  ok(ces('e').length === before, 'creature + player cooldown: the second dance does nothing');
  ok(!api.book.ready('cj:s1', game.time), 'dance-off immunity is running');

  clearAll(); const cr = mkC('k1', 'crawler', 6, 0, 'idle');
  playerEmote('x:rage', 1.6);
  ok(cr.target === 'me' && cr.state === 'run' && cr.data.hitBy === 'me', 'taunted crawler goes for the taunter');
  ok(noises.length > 0 && toasts.at(-1)[1] === 'bad', 'taunt is loud and the taunter is warned');
  clearAll(); const cr2 = mkC('k2', 'crawler', 6, 0, 'run'); cr2.target = 'mate';
  playerEmote('x:rage', 1.6); ok(cr2.target === 'me', 'taunt steals the target of a crawler chasing a teammate');
  clearAll(); const far = mkC('f1', 'crawler', 12, 0, 'idle'); playerEmote('x:rage', 1.6); ok(far.target === null && far.state === 'idle', 'no reaction beyond 11 m');
  clearAll(); const gone = mkC('f2', 'tamagotchi', 9, 0, 'idle'); playerEmote('dance', 1.6); ok(gone.stunT === 0, 'no dance-along beyond 8.5 m');
  clearAll(); const wall = mkC('f3', 'scuttler', 4, 0, 'run'); game.physics.lineOfSight = () => false; playerEmote('dance', 1.6); game.physics.lineOfSight = () => true; ok(wall.stunT === 0, 'no reaction without line of sight');
  clearAll(); const lu = mkC('l1', 'lurker', 5, 0, 'idle'); playerEmote('x:flex', 1.6); ok((lu.data.anger || 0) >= 5, 'taunted Lurker gets angry');
  clearAll(); const ho = mkC('h1', 'hound', 5, 0, 'idle'); noises.length = 0; playerEmote('x:laugh', 1.6); ok(noises.length > 0 && ho.state === 'idle', 'hound is drawn by noise (its own AI does the rest)');
  clearAll(); me.dead = true; const dd = mkC('d1', 'scuttler', 4, 0); playerEmote('dance', 1.6); ok(dd.stunT === 0, 'dead players do not trigger reactions'); me.dead = false;
  clearAll(); const mi = mkC('m1', 'mimic', 5, 0, 'walk'); const nm = ces('e').length; playerEmote('x:flex', 1.6);
  ok(ces('e').length > nm && ces('e').at(-1)[1].e === 'flex' && mi.stunT === 0, 'mimic copies the flex and is not frozen');
  clearAll(); const fo = mkC('b2', 'foreman', 5, 0, 'idle'); const nb = ces('e').length; playerEmote('x:rage', 1.6);
  ok(ces('e').length > nb && ces('e').at(-1)[1].e === 'laugh' && fo.stunT === 0 && fo.target === null, 'boss laughs and ignores the taunt');
  clearAll(); const je = mkC('j1', 'jester', 5, 0, 'idle'); const nj = ces('e').length; playerEmote('dance', 1.6); ok(ces('e').length === nj && je.stunT === 0, 'jester ignores emotes');
  clearAll(); const yo = mkC('y1', 'yoinker', 4, 0, 'idle'); const d0y = Math.hypot(yo.pos.x, yo.pos.z); playerEmote('wave', 1.0);
  ok(yo.state === 'walk' && yo.stunT > 0 && api.stats().fleeing === 1, 'shy yoinker waves and runs (' + yo.state + ', stunT ' + yo.stunT.toFixed(2) + ')');
  advance(3.5); ok(Math.hypot(yo.pos.x, yo.pos.z) > d0y + 3 && api.stats().fleeing === 0 && yo.state === 'idle' && yo.stunT <= 0, 'and calms down afterwards (moved ' + (Math.hypot(yo.pos.x, yo.pos.z) - d0y).toFixed(1) + ' m)');
  clearAll(); let fired = 0;
  for (let i = 0; i < 8; i++) { mkC('z' + i, 'tamagotchi', 3 + i * 0.1, 0, 'run'); const b0 = ces('e').length; playerEmote('dance', 1.0); if (ces('e').length > b0) fired++; hosts.delete('z' + i); views.delete('z' + i); }
  ok(fired >= 1 && fired <= CD.burstN, `burst cap: ${fired} reactions (max ${CD.burstN}) in ${(8 * 1.3).toFixed(0)} s`);
}

// ---- C. idle emotes: rare, only while wandering (never while hunting), only when somebody is around
{
  clearAll(); mkC('i1', 'crawler', 10, 0, 'walk'); mkC('i2', 'crawler', -10, 0, 'run');
  api.nextIdle.set('i1', 0); api.nextIdle.set('i2', 0);
  const n = ces('e').length; advance(1.3);
  const got = ces('e').slice(n).map(([, d]) => d.id);
  ok(got.includes('i1') && !got.includes('i2'), 'idle emote for the wanderer, not for the hunter: ' + got);
  ok(api.nextIdle.get('i1') > game.time + 30, 'next idle emote is 45+ s away');
  ok(api.nextIdle.get('i2') > game.time && api.nextIdle.get('i2') < game.time + 7, 'the hunter is re-checked soon');
  clearAll(); mkC('i3', 'crawler', 100, 0, 'idle'); api.nextIdle.set('i3', 0); const n3 = ces('e').length; advance(1.3); ok(ces('e').length === n3, 'nobody around: no idle emote');
  clearAll(); mkC('i4', 'turret', 4, 0, 'idle'); mkC('i5', 'stalker', 4, 0, 'idle'); api.nextIdle.set('i4', 0); api.nextIdle.set('i5', 0); const n4 = ces('e').length; advance(1.3); ok(ces('e').length === n4, 'hazards / scare creatures never idle-emote');
}

// ---- D. bad input from the network, then cleanup
{
  const before = JSON.stringify(api.stats());
  for (const bad of [null, 5, { k: 'e' }, { k: 'e', id: 'c1', e: 'nope' }, { k: 'e', id: 'c1', e: 'dance', b: 'NOPE' }, { k: 'win', id: 5, e: 'dance' }, { k: 'note', n: 'toString' }]) { try { handlers.ce(bad); } catch (e) { ok(false, 'bad ce input threw: ' + e.message); } }
  ok(JSON.stringify(api.stats()) === before, 'bad ce messages are ignored');
  clearAll(); mkC('e1', 'crawler', 3, 0); handlers.ce({ k: 'e', id: 'e1', e: 'spin', b: 'GG', d: 99 });
  advance(0.5); ok(api.stats().bodies === 1 && api.stats().bubbles === 1, 'valid ce accepted (duration clamped)');
  views.delete('e1'); advance(0.2); ok(api.stats().bodies === 0 && api.stats().bubbles === 0, 'body + bubble drop when the creature view is removed');
  api.dispose();
  ok(game.hostHurtPlayer === origHurt && game.hostOnPlayerDied === origDied, 'dispose restores the wrapped host methods');
  ok(!game.scene.children.some((o) => o.isSprite) && (listeners.get('update')?.size || 0) === 0 && (listeners.get('netReady')?.size || 0) === 0, 'dispose removes sprites and listeners');
  mods.emit('update', 0.03, game);   // must not throw
}

console.log(fails ? `${fails} FAILURES` : `cemotes.test: all ok (${checks} checks)`);
process.exit(fails ? 1 : 0);
