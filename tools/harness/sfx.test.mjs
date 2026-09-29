// Node test for the `sfx` module (creature voices, ambience beds, sound pack). No browser:  node tools/harness/sfx.test.mjs
//  - every creature id registered anywhere in the game has an EXPLICIT, complete sound profile and every recipe renders (finite, audible, not clipped)
//  - filename -> key mapping, zip reader, URL manifest, IndexedDB wrapper (real code path against a fake IDB, memory fallback when unavailable),
//    SoundPack import / pick / override + restore against a fake AudioManager
import fs from 'fs';
import zlib from 'zlib';
import { CREATURES } from '../../src/game/creatures.js';
import { DEFS as SKEL } from '../../src/game/skeleton_data.js';
import { SG } from '../../src/game/siege_core.js';
import { DEFS as W1 } from '../../src/game/creatures_wave1.js';
import { DEFS as BR } from '../../src/game/creatures_backrooms.js';
import { DEFS as W2 } from '../../src/game/worlds2_creatures.js';
import * as V from '../../src/audio/creaturevoice.js';
import * as D from '../../src/audio/dsp.js';
import * as B from '../../src/audio/sfx_beds.js';
import * as PF from '../../src/game/sfx_profiles.js';
import * as C from '../../src/audio/soundpack_core.js';
import { SoundPack } from '../../src/audio/soundpack.js';

let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.log('FAIL', m); } };
const src = (f) => fs.readFileSync(new URL('../../src/game/' + f, import.meta.url), 'utf8');

// ------------------------------------------------------------------------------------------------ every creature type
const ids = new Set(Object.keys(CREATURES));
for (const m of [SKEL, SG, W1, BR, W2]) for (const id of Object.keys(m)) ids.add(id);
for (const m of src('mirror_creatures.js').matchAll(/registerCreature\('([a-z_]+)'/g)) ids.add(m[1]);
for (const m of src('extcontent.js').matchAll(/registerCreature\('([a-z_]+)'/g)) ids.add(m[1]);
const cyb = src('cycle_bosses.js');
for (const blk of ['const SPECS = {', 'const AUX = {']) {
  const i = cyb.indexOf(blk), j = cyb.indexOf('\n};', i);
  for (const m of cyb.slice(i, j).matchAll(/^  ([a-z]+): \{/gm)) ids.add(m[1]);
}
ids.add('foreman'); ids.add('legacybot'); ids.add('spambomb');
ok(src('bosses.js').includes("FOREMAN = 'foreman'") && src('creeper.js').includes("SPAMBOMB = 'spambomb'"), 'boss / spambomb ids unchanged');
for (const id of ['keyholder', 'loadbalancer', 'middlemanager', 'hydra', 'hydrahead', 'hydrareply', 'surgeon', 'host', 'excavator', 'lobbymanager', 'lbnode', 'mmpaper', 'mr_ghost', 'skeleton', 'robot', 'sg_boss', 'dunemaw', 'br_smiler', 'hs_leader']) ok(ids.has(id), 'scanned id ' + id);

const EV = V.EVENTS;
let fallbackUsed = 0;
for (const id of ids) {
  const p = PF.PROFILES[id];
  ok(!!p, `explicit profile for ${id}`);
  const q = PF.profileFor(id, CREATURES[id]);
  ok(q && q.voice && PF.VOICES[q.voice], `${id}: voice ${q?.voice} exists`);
  ok(V.FOOT_CLASSES.includes(q.foot), `${id}: foot class ${q.foot}`);
  ok(Array.isArray(q.idle) && q.idle.length === 2 && q.idle[0] <= q.idle[1], `${id}: idle interval`);
  ok(Array.isArray(q.range) && q.range[0] > 0 && q.range[1] > q.range[0] && q.range[1] <= 130, `${id}: range`);
  ok(q.pitch > 0.4 && q.pitch < 2.5 && q.vol > 0 && q.vol <= 1.3 && q.stride > 0.2, `${id}: pitch / vol / stride sane`);
  ok(Array.isArray(q.keep) && q.keep.every((e) => EV.includes(e)), `${id}: keep events valid`);
  const voice = PF.VOICES[q.voice];
  ok(V.ARCH[voice.arch], `${id}: archetype ${voice.arch}`);
  for (const ev of EV) ok(typeof V.ARCH[voice.arch][ev] === 'function' || voice.ov?.[ev], `${id}: recipe ${ev}`);
  if (q.fallback) fallbackUsed++;
}
for (const id of Object.keys(PF.PROFILES)) ok(ids.has(id), `profile ${id} belongs to a real creature id`);   // no typos / stale ids
ok(fallbackUsed === 0, 'no creature relies on the fallback profile');
console.log(`profiles: ${ids.size} creature ids, ${Object.keys(PF.VOICES).length} voices, ${new Set(Object.values(PF.PROFILES).map((p) => p.foot)).size} foot classes`);

// unknown / future creatures still get a complete profile
for (const def of [{}, { boss: true, hp: 999, height: 3 }, { hp: 20, height: 0.4 }, { hp: 300, radius: 1.5, height: 5 }, { hazard: true }, { hp: 60, walk: 2, run: 5 }]) {
  const q = PF.profileFor('future_' + JSON.stringify(def), def);
  ok(q.fallback && PF.VOICES[q.voice] && V.FOOT_CLASSES.includes(q.foot) && q.range[1] > q.range[0], 'fallback profile complete for ' + JSON.stringify(def));
}

// ------------------------------------------------------------------------------------------------ every recipe renders
const SR = V.RENDER_SR;
const seen = new Map();
let rendered = 0, ms = 0;
const check = (buf, label) => {
  let bad = 0; for (let i = 0; i < buf.length; i++) if (!Number.isFinite(buf[i])) bad++;
  const pk = D.peak(buf), rm = D.rms(buf), dur = buf.length / SR;
  ok(!bad, `${label}: finite`);
  ok(rm > 0.004, `${label}: audible (rms ${rm.toFixed(4)})`);
  ok(pk <= 0.951, `${label}: peak ${pk.toFixed(2)}`);
  ok(dur >= 0.05 && dur <= 3.0, `${label}: duration ${dur.toFixed(2)}s`);
};
for (const [vid, voice] of Object.entries(PF.VOICES)) {
  for (const ev of EV) {
    for (const variant of [0, 1, 2]) {
      const t0 = performance.now();
      const buf = V.renderCreatureSound(voice, ev, variant, SR, vid);
      ms += performance.now() - t0; rendered++;
      check(buf, `${vid}.${ev}.${variant}`);
      if (variant === 0) {                          // identity: two voices must not render the same waveform
        let h = 0; for (let i = 0; i < Math.min(buf.length, 6000); i += 3) h = (h * 31 + Math.round(buf[i] * 1000)) | 0;
        const key = ev + ':' + h;
        ok(!seen.has(key), `${vid}.${ev} is unique (same as ${seen.get(key)})`);
        seen.set(key, vid);
      } else if (variant === 1) {                   // variants differ from each other
        const a = V.renderCreatureSound(voice, ev, 0, SR, vid);
        let diff = 0; const n = Math.min(a.length, buf.length); for (let i = 0; i < n; i += 7) diff += Math.abs(a[i] - buf[i]);
        ok(diff > 0.01 * n / 7, `${vid}.${ev}: variant 1 differs from variant 0`);
      }
    }
  }
}
for (const foot of V.FOOT_CLASSES.filter((f) => f !== 'none')) for (const variant of [0, 1]) check(V.renderCreatureSound({ foot }, 'step', variant, SR, 'foot:' + foot), `step ${foot}.${variant}`);
console.log(`rendered ${rendered} creature sounds in ${ms.toFixed(0)} ms (${(ms / rendered).toFixed(1)} ms each)`);
// deterministic
{ const a = V.renderCreatureSound(PF.VOICES.lurker, 'alert', 0, SR, 'lurker'), b = V.renderCreatureSound(PF.VOICES.lurker, 'alert', 0, SR, 'lurker'); ok(a.length === b.length && a.every((x, i) => x === b[i]), 'rendering is deterministic'); }
// footsteps by size: heavy classes are longer and lower than light ones
{
  const len = (f) => V.renderCreatureSound({ foot: f }, 'step', 0, SR, 'x').length;
  ok(len('stomp') > len('skitter') * 2, 'stomp is much longer than skitter'); ok(len('rumble') > len('paw'), 'rumble > paw');
}

// ------------------------------------------------------------------------------------------------ profile helpers
ok(PF.stateEvent('run') === 'chase' && PF.stateEvent('attack') === 'attack' && PF.stateEvent('dead') === 'death' && PF.stateEvent('windup') === 'alert' && PF.stateEvent('stunned') === 'hurt', 'state -> event map');
ok(PF.stateEvent('idle') === null && PF.stateEvent('hidden') === null && PF.stateEvent('nonsense') === null, 'idle / hidden / unknown states produce no one-shot');
ok(PF.isIdleState('patrol') && !PF.isIdleState('attack') && PF.isMovingState('run') && !PF.isMovingState('idle'), 'state classes');
for (const e of EV) ok(PF.EVENT_COOLDOWN[e] !== undefined && PF.EVENT_VOL[e] > 0 && PF.EVENT_REACH[e] > 0 && PF.CROWD_GAP[e] !== undefined, 'event tables ' + e);
ok(PF.EVENT_VOL.step > 0 && PF.EVENT_REACH.step < PF.EVENT_REACH.alert && PF.EVENT_REACH.idle < PF.EVENT_REACH.alert, 'alerts carry farther than idle calls and steps');
{
  const a = PF.creatureSeed(7, 'lurker'), a2 = PF.creatureSeed(7, 'lurker'), b = PF.creatureSeed(8, 'lurker');
  ok(a.pitch === a2.pitch && a.gap === a2.gap && a.phase === a2.phase, 'seed is stable per creature');
  ok(a.pitch !== b.pitch || a.gap !== b.gap, 'seed differs between creatures');
  ok(a.pitch >= 0.92 && a.pitch <= 1.08 && a.gap >= 0.85 && a.gap <= 1.15, 'seed ranges');
  const r1 = a.r(1), r2 = a2.r(1); ok(r1 === r2, 'seeded stream is reproducible');
}
// the recorded roars of the big monsters stay layered under ours
ok(PF.PROFILES.lurker.keep.includes('alert') && PF.PROFILES.hound.keep.includes('chase') && PF.PROFILES.scuttler.keep.length === 0, 'keep lists');
// gameplay: dangerous things are audible from farther away than their idle tells
ok(PF.PROFILES.giant.range[1] > PF.PROFILES.scuttler.range[1] && PF.PROFILES.sandkefal.range[1] >= 100, 'bigger creatures carry farther');
ok(PF.PROFILES.giant.stride > PF.PROFILES.scuttler.stride * 4, 'stride grows with size');

// ------------------------------------------------------------------------------------------------ ambience beds
for (const name of B.BED_NAMES) {
  const buf = B.renderBed(name, 22050);
  let bad = 0; for (const x of buf) if (!Number.isFinite(x)) bad++;
  ok(!bad && buf.length === Math.round(B.LOOP_SEC * 22050), `bed ${name}: finite, ${B.LOOP_SEC}s`);
  ok(D.rms(buf) > 0.02 && D.peak(buf) <= 0.81, `bed ${name}: level`);
  ok(B.BED_LEVEL[name] > 0, `bed ${name}: has a level`);
}
{
  // beds exist for every generated biome + the 3 legacy interiors; the five newer interiors keep their recorded beds
  for (const b of ['hills', 'swamp', 'snow', 'desert', 'moor', 'blackforest', 'datascape', 'servermarsh', 'ashfield', 'crystal', 'lava', 'ice', 'jungle', 'soviet', 'twinsun', 'pier']) ok(B.BED_NAMES.includes(B.bedFor({ biome: b })), 'bed for biome ' + b);
  ok(B.bedFor({ indoor: true, interior: 'factory' }) === 'i_factory' && B.bedFor({ indoor: true, interior: 'mansion' }) === 'i_mansion' && B.bedFor({ indoor: true, interior: 'mineshaft' }) === 'i_mineshaft', 'legacy interior beds');
  ok(B.bedFor({ indoor: true, interior: 'office' }) === null, 'new interior themes keep their own beds');
  ok(B.bedFor({ biome: 'mystery', ground: 'snow' }) === 'snow' && B.bedFor({ biome: 'mystery', ground: 'lava?' }) === null, 'ground fallback');
}

// ------------------------------------------------------------------------------------------------ filename convention
const P = C.parsePackName;
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
{
  const a = P('creature_lurker_alert.ogg'); ok(a.kind === 'creature' && a.type === 'lurker' && a.event === 'alert' && a.key === 'creature_lurker_alert' && a.variant === 0, 'creature basic');
  const b = P('Creature_Lurker_Alert_2.OGG'); ok(b.key === 'creature_lurker_alert' && b.variant === 2, 'case + variant');
  const c = P('creature_br_smiler_death.mp3'); ok(c.type === 'br_smiler' && c.event === 'death', 'type with underscore');
  const d = P('creature_skel_walker_step_3.wav'); ok(d.type === 'skel_walker' && d.event === 'step' && d.variant === 3, 'underscore type + step + variant');
  const e = P('creature_any_hurt.ogg'); ok(e.type === 'any' && e.key === 'creature_any_hurt', 'any type');
  ok(P('creature_lurker_bite.ogg').event === 'attack' && P('creature_lurker_pain.ogg').event === 'hurt' && P('creature_lurker_scream.ogg').event === 'alert' && P('creature_lurker_die.ogg').event === 'death' && P('creature_lurker_run.ogg').event === 'chase' && P('creature_lurker_footsteps.ogg').event === 'step', 'event synonyms');
  const f = P('Creature Lurker Alert (2).ogg'); ok(f.key === 'creature_lurker_alert' && f.variant === 2, 'spaces and (2)');
  const g = P('creature-lurker-alert-1.ogg'); ok(g.key === 'creature_lurker_alert' && g.variant === 1, 'dashes');
  const h = P('folder/sub dir\\CREATURE_ÇİĞ_Alert.ogg'); ok(h.type === 'cig' && h.event === 'alert', 'folders + Turkish letters: ' + JSON.stringify(h));
  const i = P('voice_12.ogg'); ok(i.kind === 'voice' && i.key === 'voice' && i.variant === 12, 'voice line');
  ok(P('voice_ha_ha.ogg').kind === 'voice', 'voice with a word');
  const j = P('ui_click.ogg'); ok(j.kind === 'override' && j.name === 'ui_click', 'ui override');
  const k = P('sfx_door_open.ogg'); ok(k.kind === 'override' && k.name === 'door_open', 'sfx override strips the prefix');
  const l = P('step_metal_1.ogg'); ok(l.kind === 'override' && l.name === 'step_metal_1' && l.alt === 'step_metal', 'step override keeps the number, alt without');
  const m = P('amb_blackforest.ogg'); ok(m.kind === 'amb' && m.bed === 'blackforest' && m.key === 'amb_blackforest', 'ambience bed');
  ok(P('amb_desert_2.ogg').key === 'amb_desert', 'ambience variant');
  ok(P('creature_lurker.ogg').error && P('creature_lurker_dance.ogg').error === 'unknown-event' && P('hello.ogg').error === 'unknown-prefix' && P('notes.txt').error === 'not-audio' && P('ui_.ogg').error && P('amb_.ogg').error, 'rejects');
  ok(eq(P('README.md'), { error: 'not-audio', file: 'README.md' }), 'non-audio reason');
  ok(C.slug('  Şükrü İşçi!! ') === 'sukru_isci', 'slug');
  ok(C.splitName('a/b/c.OGG').base === 'c' && C.splitName('c.txt') === null && C.splitName('noext') === null, 'splitName');
}

// ------------------------------------------------------------------------------------------------ zip
function makeZip(entries) {          // [{ name, data: Buffer, deflate }]
  const parts = [], central = []; let off = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name), raw = Buffer.from(e.data), comp = e.deflate ? zlib.deflateRawSync(raw) : raw;
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x800, 6); lh.writeUInt16LE(e.deflate ? 8 : 0, 8);
    lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(name.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x800, 8); ch.writeUInt16LE(e.deflate ? 8 : 0, 10);
    ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(off, 42);
    parts.push(lh, name, comp); central.push(ch, name); off += lh.length + name.length + comp.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, end]);
}
const payload = (n, seed) => Buffer.from(Array.from({ length: n }, (_, i) => (i * seed + (i >> 3)) & 255));
{
  const z = makeZip([
    { name: 'pack/creature_lurker_alert.ogg', data: payload(3000, 3), deflate: true }, { name: 'pack/voice_1.ogg', data: payload(500, 5), deflate: false },
    { name: 'pack/', data: Buffer.alloc(0) }, { name: '__MACOSX/pack/._voice_1.ogg', data: payload(10, 1) }, { name: 'pack/notes.txt', data: payload(20, 2) },
  ]);
  const es = C.readZip(z);
  ok(es.length === 3 - 0 + 0 || es.length === 3, 'zip entries (dirs + macosx skipped): ' + es.map((e) => e.name));
  const a = es.find((e) => e.name.endsWith('alert.ogg')), b = es.find((e) => e.name.endsWith('voice_1.ogg'));
  ok(a && b, 'zip finds entries');
  ok(Buffer.compare(Buffer.from(await a.read()), payload(3000, 3)) === 0, 'zip deflate round trip');
  ok(Buffer.compare(Buffer.from(await b.read()), payload(500, 5)) === 0, 'zip stored round trip');
  let threw = false; try { C.readZip(new Uint8Array(100)); } catch { threw = true; } ok(threw, 'not-a-zip throws');
}

// ------------------------------------------------------------------------------------------------ URL manifest
{
  const m1 = C.parseManifest({ files: { 'creature_lurker_alert.ogg': 'a/b.ogg', 'voice_1.ogg': ['x.ogg', 'y.ogg'] } }, 'https://example.com/pack/manifest.json');
  ok(m1.length === 3 && m1[0].url === 'https://example.com/pack/a/b.ogg' && m1[0].name === 'creature_lurker_alert.ogg', 'manifest map');
  const m2 = C.parseManifest(['https://cdn.example.com/creature_any_hurt.ogg'], '');
  ok(m2.length === 1 && m2[0].name === 'creature_any_hurt.ogg', 'manifest array of urls');
  ok(C.parseManifest(null, '').length === 0 && C.parseManifest({ files: 5 }, '').length === 0, 'manifest garbage');
}

// ------------------------------------------------------------------------------------------------ IndexedDB wrapper
function fakeIDB({ failOpen = false, failWrite = false } = {}) {
  const stores = {};
  return {
    open() {
      const req = {};
      setTimeout(() => {
        if (failOpen) { req.onerror?.(); return; }
        const db = {
          objectStoreNames: { contains: (n) => !!stores[n] },
          createObjectStore(n, o) { stores[n] = { rows: new Map(), key: o?.keyPath }; },
          transaction(names) {
            const tx = {};
            tx.objectStore = (n) => ({
              put(v, k) { if (failWrite) throw new Error('quota'); stores[n].rows.set(stores[n].key ? v[stores[n].key] : k, v); },
              clear() { stores[n].rows.clear(); },
              getAll() { const r = {}; setTimeout(() => { r.result = [...stores[n].rows.values()]; r.onsuccess?.(); }); return r; },
              get(k) { const r = {}; setTimeout(() => { r.result = stores[n].rows.get(k); r.onsuccess?.(); }); return r; },
            });
            setTimeout(() => tx.oncomplete?.(), 1);
            return tx;
          },
        };
        req.result = db; req.onupgradeneeded?.(); req.onsuccess?.();
      }, 0);
      return req;
    },
    _stores: stores,
  };
}
{
  const rec = (name, n = 4) => ({ name, key: 'k', kind: 'creature', size: n, data: new ArrayBuffer(n) });
  // 1) no IndexedDB at all
  const s0 = new C.PackStore({ indexedDB: null });
  await s0.putMany([rec('a.ogg'), rec('b.ogg')]); await s0.setMeta('url', 'https://x/y.zip');
  ok(!s0.persistent && (await s0.all()).length === 2 && (await s0.getMeta('url')) === 'https://x/y.zip', 'memory fallback works without IndexedDB');
  await s0.clear(); ok((await s0.all()).length === 0 && (await s0.getMeta('url')) === undefined, 'memory clear');
  // 2) open() throws
  const s1 = new C.PackStore({ indexedDB: { open() { throw new Error('SecurityError'); } } });
  await s1.putMany([rec('a.ogg')]); ok(!s1.persistent && (await s1.all()).length === 1, 'fallback when open() throws');
  // 3) open fails (private window)
  const s2 = new C.PackStore({ indexedDB: fakeIDB({ failOpen: true }) });
  await s2.putMany([rec('a.ogg')]); ok(!s2.persistent && (await s2.all()).length === 1, 'fallback when the open request errors');
  // 4) working IDB: persistence across two store instances
  const idb = fakeIDB();
  const s3 = new C.PackStore({ indexedDB: idb });
  await s3.putMany([rec('a.ogg', 8), rec('b.ogg', 9)]); await s3.setMeta('url', 'https://u/');
  ok(s3.persistent, 'IDB path is persistent');
  const s4 = new C.PackStore({ indexedDB: idb });
  const rows = await s4.all(); ok(rows.length === 2 && rows.find((r) => r.name === 'b.ogg').size === 9 && (await s4.getMeta('url')) === 'https://u/', 'data survives a new store instance');
  await s4.clear(); ok((await new C.PackStore({ indexedDB: idb }).all()).length === 0, 'IDB clear');
  // 5) writes fail (quota): keeps working from memory
  const s5 = new C.PackStore({ indexedDB: fakeIDB({ failWrite: true }) });
  await s5.putMany([rec('q.ogg')]); ok(!s5.persistent && (await s5.all()).length === 1, 'quota error degrades to memory');
  // 6) open never answers
  const s6 = new C.PackStore({ indexedDB: { open() { return {}; } } });
  const t0 = performance.now(); await s6.putMany([rec('z.ogg')]); ok(!s6.persistent && performance.now() - t0 < 4000, 'a silent open() times out to memory');
}

// ------------------------------------------------------------------------------------------------ SoundPack against a fake AudioManager
function fakeAudio() {
  const mkbuf = (v) => ({ numberOfChannels: 1, length: 4, getChannelData: () => v });
  const a = {
    buffers: new Map(), pending: new Map(), has: (n) => ['ui_click', 'step_metal_1', 'step_metal_2', 'step_grass_1', 'step_grass_2', 'door_open'].includes(n),
    ctx: { decodeAudioData: async (ab) => { const u = new Uint8Array(ab); if (u[0] === 255) throw new Error('bad audio'); return mkbuf(Float32Array.from([0.1 * (u[0] || 1), 0.05, -0.05, 0])); } },
  };
  return a;
}
const fakeFile = (name, byte, size = 16) => ({ name, size, type: 'audio/ogg', arrayBuffer: async () => new Uint8Array(size).fill(byte).buffer });
{
  const audio = fakeAudio();
  audio.buffers.set('ui_click', 'ORIGINAL_CLICK');
  const pack = new SoundPack(audio, new C.PackStore({ indexedDB: null }));
  pack.enabled = true;
  const r = await pack.importFiles([
    fakeFile('creature_lurker_alert.ogg', 1), fakeFile('creature_lurker_alert_2.ogg', 2), fakeFile('creature_any_hurt.mp3', 3), fakeFile('voice_1.ogg', 4), fakeFile('ui_click.ogg', 5),
    fakeFile('step_metal_2.ogg', 6), fakeFile('step_grass.ogg', 8), fakeFile('amb_desert.ogg', 7), fakeFile('readme.txt', 0), fakeFile('bad_name.ogg', 1), fakeFile('creature_x_alert.ogg', 255), fakeFile('creature_big_idle.ogg', 1, 9 * 1024 * 1024),
  ]);
  ok(r.added === 9 && r.ignored.length === 3, `importFiles added ${r.added} ignored ${r.ignored.length} ${JSON.stringify(r.ignored)}`);
  ok(pack.count === 9, 'records');
  const s = pack.summary(); ok(s.creature === 4 && s.voice === 1 && s.override === 3 && s.amb === 1 && s.types.includes('lurker'), 'summary ' + JSON.stringify(s));
  ok(pack.has('creature_lurker_alert') && pack.pools.get('creature_lurker_alert').length === 2, 'variants pooled');
  ok(pack.pick('creature_lurker_alert', () => 0) !== pack.pick('creature_lurker_alert', () => 0.99), 'pick spans the variants');
  ok(pack.pick('creature_any_hurt') && pack.pick('voice') && pack.pick('amb_desert') && pack.pick('creature_none_idle') === null, 'pick by key');
  ok(pack.hasCreature('lurker', 'alert') && pack.hasCreature('crawler', 'hurt') && !pack.hasCreature('crawler', 'idle'), 'hasCreature + any');
  ok(audio.buffers.get('ui_click') !== 'ORIGINAL_CLICK' && audio.buffers.has('step_metal_2') && !audio.buffers.has('step_metal_1') && audio.buffers.has('step_grass_1') && audio.buffers.has('step_grass_2'), 'game sounds overridden (exact id + unnumbered = all variants)');
  const bad = pack.records.find((x) => x.name === 'creature_x_alert.ogg'); ok(bad?.bad === true && !pack.has('creature_x_alert'), 'undecodable file is skipped');
  await pack.setEnabled(false);
  ok(audio.buffers.get('ui_click') === 'ORIGINAL_CLICK' && !audio.buffers.has('step_metal_2') && !audio.buffers.has('step_grass_1') && pack.pick('creature_lurker_alert') === null && !audio.buffers.has([...audio.buffers.keys()].find((k) => k.startsWith('pk:'))), 'disable restores the game sounds');
  await pack.setEnabled(true);
  ok(audio.buffers.get('ui_click') !== 'ORIGINAL_CLICK' && pack.has('voice'), 'enable re-applies');
  await pack.clear();
  ok(pack.count === 0 && audio.buffers.get('ui_click') === 'ORIGINAL_CLICK' && !audio.buffers.has('step_metal_2') && pack.pick('voice') === null, 'clear restores everything');
  // zip through importFiles
  const z = makeZip([{ name: 'my/creature_hound_attack.ogg', data: payload(64, 9), deflate: true }, { name: 'my/voice_2.ogg', data: payload(64, 11), deflate: false }]);
  const r2 = await pack.importFiles([{ name: 'meme.zip', size: z.length, arrayBuffer: async () => z.buffer.slice(z.byteOffset, z.byteOffset + z.byteLength) }]);
  ok(r2.added === 2 && pack.has('creature_hound_attack') && pack.has('voice'), 'zip import');
  // URL import with a fake fetch (manifest)
  const audio2 = fakeAudio(); const pack2 = new SoundPack(audio2, new C.PackStore({ indexedDB: null })); pack2.enabled = true;
  const fake = async (url) => {
    if (url.endsWith('manifest.json')) return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ files: { 'creature_lurker_idle.ogg': 'l.ogg', 'voice_3.ogg': 'v.ogg' } }) };
    return { ok: true, headers: { get: () => 'audio/ogg' }, arrayBuffer: async () => new Uint8Array(20).fill(9).buffer };
  };
  const r3 = await pack2.importUrl('https://example.com/p/manifest.json', fake);
  ok(r3.added === 2 && pack2.has('creature_lurker_idle') && pack2.url === 'https://example.com/p/manifest.json', 'URL manifest import');
  let threw = false; try { await pack2.importUrl('file:///etc/passwd', fake); } catch { threw = true; } ok(threw, 'non-http URL refused');
  threw = false; try { await pack2.importUrl('javascript:alert(1)', fake); } catch { threw = true; } ok(threw, 'javascript: URL refused');
  // persistence: a new SoundPack on the same store sees the files
  const st = new C.PackStore({ indexedDB: null });
  const pA = new SoundPack(fakeAudio(), st); pA.enabled = true; await pA.importFiles([fakeFile('creature_lurker_idle.ogg', 3)]);
  const pB = new SoundPack(fakeAudio(), st); pB.enabled = true; await pB.load(); ok(pB.has('creature_lurker_idle'), 'a later session loads the stored pack');
}

// ------------------------------------------------------------------------------------------------ wiring (text scan)
{
  const cr = fs.readFileSync(new URL('../../src/entities/creatures.js', import.meta.url), 'utf8');
  ok(cr.includes('game.cvoice?.onState?.(this, prev, st)') && cr.includes('game.cvoice?.onHurt?.(v, d)'), 'creatures.js hooks');
  const g = src('game.js');
  ok(g.includes("import { installSfx } from './sfx.js'") && g.includes("this.useModule('cvoice', installSfx)"), 'game.js slot');
  const au = fs.readFileSync(new URL('../../src/audio/audio.js', import.meta.url), 'utf8');
  ok(au.includes('attachSoundPack'), 'audio.js attaches the pack');
  const ui = fs.readFileSync(new URL('../../src/ui/ui.js', import.meta.url), 'utf8');
  ok(ui.includes('soundPackSection(this, audio, section)'), 'settings panel section');
  const s = src('sfx.js');
  ok(!/net\.(broadcast|send|request)/.test(s), 'the sfx module sends nothing over the network');
}

console.log(`${checks} checks, ${fails} failures`);
process.exit(fails ? 1 : 0);
