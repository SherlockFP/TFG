// Node test for the wave-8 'atmos' work: mix policy (src/audio/mixpolicy.js), bed / context rules (src/game/atmos_core.js) and a smoke run of the
// procedural ambience engine (src/game/atmos.js) against a fake WebAudio graph.   node tools/harness/atmos.test.mjs
import { policyFor, Gate, jitter, distanceCutoff, BUS_TRIM } from '../../src/audio/mixpolicy.js';
import { contextOf, ctxKey, bedFor, pickEvent, nextGap, cueEffect, BEDS, outdoorBed } from '../../src/game/atmos_core.js';
import { installAtmos } from '../../src/game/atmos.js';

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.error('FAIL', m); } };

// --- mix policy
ok(policyFor('ui_hover').gain < 0.7 && policyFor('ui_hover').cool >= 0.08, 'ui hover is quiet + rate limited');
ok(policyFor('step_metal_3').key === 'step' && policyFor('step_grass_1').key === 'step', 'steps share one gate key');
ok(policyFor('lights_buzz').cool > 0 && policyFor('lights_buzz').max >= 1, 'default rule exists');
ok(policyFor('heartbeat').max === 1, 'one heartbeat at a time');
ok(policyFor('crickets').lp > 0 && policyFor('crickets').lp < 8000, 'harsh loops are low-passed');
ok(BUS_TRIM.ui < BUS_TRIM.sfx, 'ui bus sits below effects');
{
  const g = new Gate();
  ok(g.allow('a', 1, 0.1) && !g.allow('a', 1.05, 0.1) && g.allow('a', 1.2, 0.1) && g.allow('b', 1.05, 0.1), 'gate cooldown per key');
  ok(jitter(0.1, 0) === 0.9 && jitter(0.1, 1) === 1.1 && jitter(0.1, 0.5) === 1, 'jitter range');
  ok(distanceCutoff(5) === 18000 && distanceCutoff(60) < distanceCutoff(30) && distanceCutoff(500) >= 2500, 'distance low-pass is monotonic and floored');
  ok(distanceCutoff(NaN) === 18000, 'NaN distance is safe');
}

// --- contexts
const base = { phase: 'land', inShip: false, indoor: false, company: false, theme: null, biome: 'swamp', weather: 'clear', night: false, backrooms: false, level: null, pocket: null };
ok(contextOf({ ...base, phase: 'orbit' }).kind === 'ship' && contextOf({ ...base, inShip: true }).kind === 'ship', 'ship');
ok(contextOf({ ...base, indoor: true, theme: 'sewer' }).kind === 'sewer', 'interior theme');
ok(contextOf({ ...base, indoor: true, theme: 'unknown_new_theme' }).kind === 'factory', 'unknown interior falls back to the facility bed');
ok(contextOf({ ...base, indoor: true, theme: 'backrooms', level: 'pool' }).sub === 'pool', 'backrooms pool variant');
ok(contextOf({ ...base, backrooms: true }).kind === 'backrooms', 'backrooms pocket');
ok(contextOf({ ...base, indoor: true, theme: 'factory', pocket: 'Hedge Maze' }).kind === 'maze', 'worlds3 maze pocket');
ok(contextOf({ ...base, company: true }).kind === 'company', 'company');
ok(ctxKey(contextOf({ ...base, night: true })) !== ctxKey(contextOf(base)), 'night changes the outdoor bed');
for (const k of Object.keys(BEDS)) if (k !== 'outdoor') ok(BEDS[k].layers.length > 0 && BEDS[k].events.length > 0 && BEDS[k].gap[0] >= 5 && BEDS[k].level <= 0.6, 'bed ' + k + ' is sane (silence gaps >= 5 s)');
{
  const st = outdoorBed('swamp:night:clear'), dy = outdoorBed('desert:clear');
  ok(st.events.some((e) => e[0] === 'chirps') && !dy.events.some((e) => e[0] === 'chirps'), 'insects at night in the swamp, none in the desert');
  ok(outdoorBed('hills:stormy').events.some((e) => e[0] === 'thunder'), 'storm = thunder');
  ok(bedFor({ kind: 'nope', sub: '' }) === null, 'no bed for an unknown kind');
  ok(pickEvent(BEDS.factory, 0) === 'ping' && BEDS.factory.events.map((e) => e[0]).includes(pickEvent(BEDS.factory, 0.999)), 'weighted pick');
  ok(pickEvent({ events: [] }, 0.5) === null, 'empty bed picks nothing');
  ok(nextGap(BEDS.factory, 0, 0.9) === 7 && nextGap(BEDS.factory, 0, 0.1) === 17.5, 'dead-silence roll stretches the gap');
  ok(cueEffect({ event: 'chase', dist: 20 }).quiet > cueEffect({ event: 'step', dist: 10 }).quiet && cueEffect({ event: 'step', dist: 60 }) === null && cueEffect(null) === null, 'creature cues hold the ambience back');
}

// --- engine smoke test on a fake WebAudio graph (no throw, ducks on a cue, quiets the events, switches beds)
const any = () => new Proxy(function () {}, {
  get(t, k) { if (k === 'connect') return (x) => x; if (k === 'then') return undefined; if (k === 'value' && !(k in t)) return 0; if (k in t) return t[k]; return any(); },
  set(t, k, v) { t[k] = v; return true; },
  apply() { return any(); },
});
const ctx = new Proxy({ sampleRate: 8000, currentTime: 1, state: 'running', destination: any(), createBuffer: (c, len) => ({ getChannelData: () => new Float32Array(len) }) }, {
  get(t, k) { return k in t ? t[k] : (k.startsWith('create') ? () => any() : undefined); },
});
const ducks = [], handlers = {};
const audio = { ctx, ready: true, buses: { amb: any() }, reverb: any(), duck: (a, h, b) => ducks.push([a, h, b]), ambTrim: null };
const game = {
  audio, settings: { ambienceVolume: 0.8 }, run: { phase: 'land', seed: 7, time: 600, weather: 'stormy' }, player: { indoor: true, inShip: false, pos: {} },
  world: { moonId: 'x', facility: { layout: { theme: 'sewer' } } },
  mods: { on: (ev, fn) => { handlers[ev] = fn; return () => {}; } },
};
{
  const at = installAtmos(game);
  for (let i = 0; i < 10; i++) handlers.update(0.3, game);
  ok(at.context === 'sewer|' && at.state.bed, 'sewer bed started: ' + at.context);
  ok(audio.ambTrim && audio.ambTrim.base < 1, 'loop beds trimmed under the procedural ambience');
  for (const n of ['ping', 'creak', 'door', 'vent', 'drip', 'groan', 'relay', 'flicker', 'gust', 'chirps', 'thunder']) ok(at.fire(n) || n === 'x', 'event ' + n + ' synthesises');
  ok(at.fire('nope') === false, 'unknown event is ignored');
  handlers['sx:cue']({ event: 'chase', dist: 12 }, {});
  ok(ducks.length === 1 && ducks[0][0] > 0.3, 'chase cue ducks music / ui / ambience');
  ok(at.state.quiet > 5, 'chase cue silences the events');
  game.player.inShip = true;
  for (let i = 0; i < 4; i++) handlers.update(0.3, game);
  ok(at.context === 'ship|', 'switches to the ship bed: ' + at.context);
  game.settings.ambienceVolume = 0;
  for (let i = 0; i < 4; i++) handlers.update(0.3, game);
  ok(!at.state.bed, 'Ambience volume 0 tears the beds down');
  at.dispose();
  ok(audio.ambTrim === null, 'dispose restores the trims');
}

if (fails) { console.error(fails + ' FAILED'); process.exit(1); }
console.log('atmos.test.mjs OK');
