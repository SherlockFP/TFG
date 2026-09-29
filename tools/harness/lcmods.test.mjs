// lcmods (wave 8) node test: the six new built-in mods run against a stub game (host logic, message handlers, chat commands, cosmetics
// hooks), every string they use has TR + RU, the cosm8 rows have TR + RU.   node tools/harness/lcmods.test.mjs
import { pathToFileURL } from 'node:url';
import path from 'node:path';
let bad = 0;
const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const { hasTranslation } = await import('../../src/core/i18n.js');
const { RNG } = await import('../../src/core/rng.js');
const { C8 } = await import('../../src/game/cosm8_data.js');
await import('../../src/game/lcmods_i18n.js');
const { installLcModsI18n } = await import('../../src/game/lcmods_i18n.js');
const { addTranslations } = await import('../../src/core/i18n.js');
installLcModsI18n(addTranslations);
(await import('../../src/game/cosm8_i18n.js')).installCosm8I18n(addTranslations);

const store = new Map(); globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };
const seen = new Set();
const fill = (s, v = {}) => String(s).replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m));
const defs = new Map();
globalThis.KefalAPI = { defineMod: (d) => defs.set(d.id, d) };
for (const f of ['algorithm-quotes', 'loot-appraiser', 'quick-change', 'dance-party', 'ship-radio', 'shift-awards']) await import(pathToFileURL(path.resolve('public/mods', f + '.js')).href);
ok(defs.size === 6, 'six mods defined');

// ---- stub game + api factory
const out = { rewards: [], bc: [], toasts: [], sys: [], said: [], bumps: [], cmds: {}, chat: {}, term: [] };
const mkApi = (def) => {
  const h = {}; const cfg = Object.fromEntries(Object.entries(def.config || {}).map(([k, s]) => [k, s.default]));
  const game = {
    selfId: 'me', isHost: true, time: 0, run: { phase: 'moon', seed: 5, day: 2 }, remotes: new Map(),
    net: { broadcast: (t, d) => out.bc.push([t, d]) }, profile: { name: 'Tester' },
    ui: { toast: (s) => out.toasts.push(s), systemMessage: (s) => out.sys.push(s) },
    lore: { say: (s) => out.said.push(s) }, cosm5: { bump: (f) => out.bumps.push(f) },
    playerName: (id) => (id === 'me' ? 'Tester' : 'Buddy'), sfx() {}, emotes: { current: null }, aiPlayers: () => [],
    items: { all: () => [] },
  };
  const api = {
    game, RNG, t: (k) => (seen.add(k), k), tf: (k, v) => (seen.add(k), fill(k, v)), isSellable: () => true, insideShip: () => false,
    on: (ev, fn) => { (h[ev] ||= []).push(fn); }, reward: (...a) => out.rewards.push(a),
    registerChatCommand: (n, fn) => { out.chat[n] = fn; }, registerCommand: (n, fn) => { out.cmds[n] = fn; },
  };
  def.init(api, cfg);
  return { h, game, cfg, fire: (ev, ...a) => (h[ev] || []).forEach((fn) => fn(...a, game)) };
};
const msgs = () => out.bc.filter((b) => b[0] === 'modmsg').map((b) => b[1]);

// ---- algorithm-quotes: host stores chat, quotes it later, the quoted player gets the counter
{
  const m = mkApi(defs.get('algorithm-quotes'));
  m.fire('chat', { text: 'I am definitely not scared of the dark' }, 'me');
  m.fire('chat', { text: '/help me' }, 'me'); m.fire('chat', { text: 'ok' }, 'me');
  m.game.time = 100;
  for (let i = 0; i < 400 && !msgs().length; i++) m.fire('update', 1);
  const q = msgs().find((d) => d.k === 'lcm-quote');
  ok(q && q.x === 'I am definitely not scared of the dark' && q.id === 'me', 'quote broadcast (commands and short lines are skipped)');
  m.fire('message', q, 'host');
  ok(out.said.length === 1 && out.said[0].includes('not scared'), 'quote shown on the intercom');
  ok(out.bumps.includes('quoted'), 'quoted player gets the counter');
  m.fire('message', { k: 'lcm-quote', x: 5 }, 'x'); ok(out.said.length === 1, 'garbage ignored');
  ok(defs.get('algorithm-quotes').enabledByDefault === false, 'quotes are opt-in');
}
// ---- dance-party: two dancers close together get paid, capped at 6 a day
{
  out.rewards.length = 0; out.bc.length = 0;
  const m = mkApi(defs.get('dance-party'));
  m.game.emotes.current = { id: 'dance' }; m.game.remotes.set('b', { emoteNet: 'x:mosh' });
  const V = (x) => ({ x, y: 0, z: 0, distanceTo(o) { return Math.abs(o.x - this.x); } });
  m.game.aiPlayers = () => [{ id: 'me', pos: V(0), dead: false }, { id: 'b', pos: V(4), dead: false }];
  for (let i = 0; i < 400; i++) m.fire('update', 0.5);
  ok(out.rewards.length === 12, 'dance payouts capped at 6 per player: ' + out.rewards.length);
  ok(msgs().some((d) => d.k === 'lcm-party' && d.ids.includes('me')), 'party message');
  m.fire('message', msgs().find((d) => d.k === 'lcm-party'));
  ok(out.bumps.includes('raved') && out.toasts.some((s) => s.includes('OFFICE PARTY')), 'party toast + counter');
  out.rewards.length = 0; m.game.aiPlayers = () => [{ id: 'me', pos: V(0), dead: false }, { id: 'b', pos: V(40), dead: false }];
  m.fire('phase', 'landing'); for (let i = 0; i < 200; i++) m.fire('update', 0.5);
  ok(out.rewards.length === 0, 'far apart dancers earn nothing');
}
// ---- shift-awards: marathoner wins, needs two players
{
  out.bc.length = 0;
  const m = mkApi(defs.get('shift-awards'));
  const P = (id, x) => ({ id, pos: { x, y: 0, z: 0 }, dead: false, inShip: false });
  m.game.remotes.set('b', {});
  m.fire('phase', 'landing');
  for (let i = 0; i < 200; i++) { m.game.aiPlayers = () => [P('me', i * 4), P('b', i)]; m.fire('update', 0.5); }
  m.fire('phase', 'orbit');
  const a = msgs().find((d) => d.k === 'lcm-awards');
  ok(a && a.a.some((x) => x[0] === 'walk' && x[1] === 'me'), 'walk award goes to the walker');
  out.sys.length = 0; m.fire('message', a); ok(out.sys.length >= 2 && out.sys.some((s) => s.includes('Marathoner')), 'awards printed');
}
// ---- loot-appraiser
{
  const m = mkApi(defs.get('loot-appraiser'));
  m.cfg.exact = true;
  const it = (v) => ({ state: 'world', value: v, type: 'x', def: {}, obj: { position: {} } });
  m.game.items.all = () => [it(40), it(60), { ...it(90), state: 'held' }];
  out.toasts.length = 0; out.chat.appraise([], m.game);
  ok(out.toasts[0] && out.toasts[0].includes('2 pieces') && out.toasts[0].includes('100 Credits'), 'appraisal exact: ' + out.toasts[0]);
  out.chat.appraise([], m.game); ok(out.toasts[1].includes('busy'), 'cooldown');
  ok(out.bumps.filter((b) => b === 'appraised').length === 1, 'appraised counter');
}
// ---- quick-change
{
  const m = mkApi(defs.get('quick-change'));
  const eq = []; const cur = { suit: 'a', hat: 'none', back: 'none' };
  m.game.cosmetics = { unlocked: () => ({ suit: ['a', 'b', 'c'], hat: ['none', 'h1'], back: ['none'] }), current: () => ({ ...cur }), entry: (s, id) => ({ name: 'Name ' + id }), equip: (s, id) => { eq.push([s, id]); cur[s] = id; return true; } };
  out.chat.suit([], m.game); out.chat.suit(['prev'], m.game); out.chat.suit(['name c'], m.game); out.chat.hat([], m.game);
  ok(JSON.stringify(eq) === JSON.stringify([['suit', 'b'], ['suit', 'a'], ['suit', 'c'], ['hat', 'h1']]), 'cycle / pick: ' + JSON.stringify(eq));
  out.chat.outfit(['save', '2'], m.game); cur.suit = 'a'; cur.hat = 'none'; out.chat.outfit(['2'], m.game);
  ok(cur.suit === 'c' && cur.hat === 'h1', 'outfit preset roundtrip');
}
// ---- ship-radio
{
  out.bc.length = 0; out.sys.length = 0;
  const m = mkApi(defs.get('ship-radio'));
  out.chat.radio(['ready', 'to', 'lift'], m.game);
  const r = msgs().find((d) => d.k === 'lcm-radio');
  ok(r && r.x === 'ready to lift' && r.n === 'Tester', 'radio sent');
  m.fire('message', { ...r, x: '<b>hi</b>\u0007' }, 'me'); ok(out.sys.length === 1 && !/[<>]/.test(out.sys[0]), 'radio sanitised: ' + out.sys[0]);
}
// ---- i18n: every string the mods used at runtime + their names / descriptions / labels has TR and RU; cosm8 rows too
const need = new Set([...seen].filter((s) => !/^Name /.test(s)));
for (const d of defs.values()) { need.add(d.name); need.add(d.description); for (const s of Object.values(d.config || {})) need.add(s.label); }
for (const e of C8) { need.add(e.name); need.add(e.desc); if (e.how) need.add(e.how); if (e.slot === 'emote') need.add('Wardrobe: ' + e.name); }
for (const s of ['estimate the loose scrap left on the moon', 'radio the whole crew from anywhere (text-to-speech)']) need.add(s);
for (const s of need) for (const l of ['tr', 'ru']) ok(hasTranslation(l, s), `i18n ${l}: ${String(s).slice(0, 60)}`);
ok(C8.length === 31, 'cosm8 count ' + C8.length);
console.log(bad ? `lcmods: FAILED (${bad})` : `lcmods: all ok (${defs.size} mods, ${need.size} strings, ${C8.length} cosmetics)`);
process.exit(bad ? 1 : 0);
