// Node test for wave-8 SOUND PASS 2 (docs/wave8/sound2.md): every sound id the wave-8 modules play exists (procedural library or the external pack),
// every new id has a mix-policy category, renders non-silent, and the new atmos beds resolve.   node tools/harness/sound2.test.mjs
import fs from 'node:fs';
import { SFX, renderSfx } from '../../src/audio/sfxlib.js';
import { W8_IDS } from '../../src/audio/sfxlib_w8.js';
import { policyFor } from '../../src/audio/mixpolicy.js';
import { SOUND_MAP, minePick, LEASE, expired } from '../../src/game/sound2_core.js';
import { contextOf, bedFor, BEDS } from '../../src/game/atmos_core.js';
import { TELLS } from '../../src/game/crdirector_core.js';

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.error('FAIL', m); } };
const manifest = JSON.parse(fs.readFileSync(new URL('../../public/assets/ext/manifest.json', import.meta.url), 'utf8'));
const EXT = new Set(manifest.sounds.map((s) => s.id));
const has = (id) => !!SFX[id] || EXT.has(id);
const src = (f) => fs.readFileSync(new URL('../../src/game/' + f, import.meta.url), 'utf8');

// --- 1. the module -> id table: every id exists; new ids have a category and do not collide with an external sound (which would override them)
for (const [mod, ids] of Object.entries(SOUND_MAP)) for (const id of ids) ok(has(id), `${mod}: sound id "${id}" is missing from the sfx library`);
ok(W8_IDS.length >= 60 && new Set(W8_IDS).size === W8_IDS.length, 'w8 id list has no duplicates');
for (const id of W8_IDS) {
  ok(!!SFX[id], `w8 id "${id}" is registered`);
  ok(!EXT.has(id), `w8 id "${id}" does not collide with an external sound`);
  const p = policyFor(id);
  ok(typeof p.cat === 'string' && p.cat.length > 0, `mix policy category for "${id}"`);
  ok(SFX[id]?.loop ? p.cat === 'loop' : p.cat !== 'loop', `"${id}" loop flag matches its policy category`);
}
{   // every id in the table is either new (w8) or an older sound that already carries a library category
  const w8 = new Set(W8_IDS);
  for (const ids of Object.values(SOUND_MAP)) for (const id of ids) ok(w8.has(id) || (SFX[id] && SFX[id].cat) || EXT.has(id), `"${id}" has a category`);
  for (const id of W8_IDS) { const seen = Object.values(SOUND_MAP).some((l) => l.includes(id)); ok(seen, `w8 id "${id}" is used by a module in SOUND_MAP`); }
}
// stings / cues are rate limited, loops are not gated, chat blips are quiet
ok(policyFor('chat_blip').gain <= 0.5 && policyFor('chat_blip').max === 1, 'chat blips are quiet and single-voice');
ok(policyFor('onair_sting').max === 1 && policyFor('door_knock').cool >= 0.3, 'stings / cues are rate limited');
ok(policyFor('mine_pick_ore').max <= 3 && policyFor('alien_chatter').cool >= 2, 'mining / restaurant chatter caps');

// --- 2. every literal sound id the modules pass to their play helpers resolves (an array resolves when ANY entry exists)
const FILES = ['feedcams', 'feedcams2', 'downed', 'carry2', 'highlights', 'highlights_view', 'labyrinths', 'expeditions', 'lcmonsters', 'lcmonsters_ai', 'lcmonsters_fx', 'crdirector',
  'crdirector_creatures', 'resto', 'mining', 'hubgate', 'rewardviz', 'repomaps', '../minigames/arcade2'];
const HEADS = [
  /\b(?:sfx2d|sfx|snd|cue|csnd)\(\s*(\[[^\]]*\]|'[a-z0-9_]+')/g,
  /\bcsnd\([^,()]+,[^,()]+,\s*(\[[^\]]*\]|'[a-z0-9_]+')/g,
  /\bgame\.sfx\??\.?\(\s*(\[[^\]]*\]|'[a-z0-9_]+')/g,
  /\baudio\??\.(?:at|play)\??\.?\(\s*(\[[^\]]*\]|'[a-z0-9_]+')/g,
  /\bhold\('[a-z0-9_]+',\s*(?:[^'()]*\?\s*)?('[a-z0-9_]+')/g,
  /\b(?:ritual|dark|dead|grab|emerge|attack|run|chase|feed|audit|stunned): \[\[?([^\]]*)\]/g,
];
let scanned = 0;
for (const f of FILES) {
  const text = src(f + '.js');
  for (const re of HEADS) for (const m of text.matchAll(re)) {
    const ids = [...m[1].matchAll(/'([a-z0-9_]+)'/g)].map((x) => x[1]);
    if (!ids.length) continue;
    scanned++;
    ok(ids.some(has), `${f}: none of [${ids.join(', ')}] exists in the sfx library`);
  }
}
ok(scanned > 60, `scanned ${scanned} sound call sites`);

// --- 3. creature approach cues are distinct and never fall back to a generic sample
for (const t of ['cd_dimmer', 'cd_follower', 'cd_auditor']) ok(SFX[TELLS[t].s[0]] && W8_IDS.includes(TELLS[t].s[0]), `${t} has its own approach cue`);
{
  const first = ['cd_dimmer', 'cd_follower', 'cd_auditor'].map((t) => TELLS[t].s[0]);
  ok(new Set(first).size === 3, 'director creature tells are distinct');
  const lm = src('lcmonsters_ai.js') + src('lcmonsters_fx.js') + src('lcmonsters.js');
  for (const id of ['door_knock', 'lm_witch_chant', 'lm_cage_chime', 'lm_mark_bell', 'lm_giggle', 'lm_treat_jingle', 'lm_mimic_creak', 'lm_mask_laugh', 'lm_mask_weep', 'lm_rift_rumble']) ok(lm.includes(`'${id}'`), `lcmonsters plays ${id}`);
  ok(!/\['whisper', /.test(lm.replace("k === 'whisper'", '')), 'no missing "whisper" id left in lcmonsters');
}

// --- 4. procedural sounds render finite and non-silent (low sample rate keeps it fast)
for (const id of W8_IDS) {
  const r = renderSfx(id, 11025), ch = r.channels[0];
  let bad = 0, e = 0; for (const v of ch) { if (!Number.isFinite(v)) bad++; e += v * v; }
  ok(bad === 0 && e > 0.5 && ch.length > 100, `render "${id}" (${bad} bad samples, energy ${e.toFixed(1)})`);
  ok(SFX[id].dur > 0 && SFX[id].dur < 7, `"${id}" duration is sane`);
}

// --- 5. atmos beds for the new themes / moons
const EVENTS = new Set([...fs.readFileSync(new URL('../../src/game/atmos.js', import.meta.url), 'utf8').matchAll(/^    (\w+)\(bed\)/gm)].map((m) => m[1]));
for (const th of ['metro', 'greenhouse', 'prison', 'tower', 'academy', 'museum', 'influencer', 'colddata']) {
  const c = contextOf({ phase: 'moon', indoor: true, theme: th });
  const b = bedFor(c);
  ok(c.kind === th && b && b === BEDS[th], `${th}: has its own bed`);
  ok(b.events.every((e) => EVENTS.has(e[0])), `${th}: every event has an implementation`);
  ok(b.gap[0] >= 7 && b.level <= 0.5, `${th}: sparse and low`);
}
for (const biome of ['ex_barge', 'ex_dune', 'ex_roof']) {
  for (const night of [false, true]) {
    const c = contextOf({ phase: 'moon', biome, weather: 'clear', night }), b = bedFor(c);
    ok(c.kind === 'outdoor' && b && b.layers.length >= 2 && b.events.every((e) => EVENTS.has(e[0])), `${biome}${night ? ' night' : ''}: expedition bed`);
    ok(b.gap[0] >= 7, `${biome}: keeps silence gaps`);
  }
}

// --- 6. leases
{
  const m = new Map([['a', { until: 1 }], ['b', { until: 3 }]]);
  ok(LEASE > 0 && LEASE < 1 && expired(m, 2).join() === 'a', 'expired leases');
  ok(minePick('crystal') === 'mine_pick_crystal' && minePick('ore') === 'mine_pick_ore' && minePick('x') === 'mine_pick_stone', 'mining pick by material');
}

console.log(fails ? `sound2: ${fails} FAILED` : `sound2: all ok (${W8_IDS.length} new sounds, ${scanned} call sites scanned)`);
process.exit(fails ? 1 : 0);
