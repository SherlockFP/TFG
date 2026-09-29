// SOUND PACK core (module `sfx`, docs/wave4/sfx.md): pure helpers, no DOM / Web Audio, so Node can test them.
//   parsePackName(fileName)      filename convention -> { kind, key, ... } | { error }
//   readZip(arrayBuffer, opts)   minimal zip reader (store + deflate) -> [{ name, read() }]
//   PackStore                    IndexedDB wrapper with an in-memory fallback (private windows, blocked storage, Node)
//   parseManifest(json, base)    URL pack manifest -> [{ name, url }]
// Nothing here ever uploads anything: a pack lives in the player's own IndexedDB and only changes what that player hears.

export const AUDIO_EXTS = ['ogg', 'oga', 'opus', 'mp3', 'wav', 'm4a', 'aac', 'flac', 'webm', 'weba'];
export const CREATURE_EVENTS = ['idle', 'alert', 'chase', 'attack', 'hurt', 'death', 'step'];
// friendly synonyms -> canonical event (so a meme pack made by hand works without reading the docs twice)
export const EVENT_ALIASES = {
  idle: 'idle', ambient: 'idle', talk: 'idle', say: 'idle', call: 'idle', breath: 'idle', mumble: 'idle',
  alert: 'alert', notice: 'alert', spot: 'alert', spotted: 'alert', aggro: 'alert', scream: 'alert', roar: 'alert', warn: 'alert', windup: 'alert',
  chase: 'chase', run: 'chase', hunt: 'chase', pursuit: 'chase',
  attack: 'attack', bite: 'attack', hit: 'attack', strike: 'attack', slam: 'attack',
  hurt: 'hurt', pain: 'hurt', damage: 'hurt', ouch: 'hurt', stun: 'hurt',
  death: 'death', die: 'death', dead: 'death', dies: 'death', kill: 'death',
  step: 'step', steps: 'step', walk: 'step', footstep: 'step', footsteps: 'step',
};
export const MAX_FILE_BYTES = 8 * 1024 * 1024;
export const MAX_PACK_BYTES = 64 * 1024 * 1024;
export const MAX_FILES = 400;

/** lower-case, accents stripped, everything that is not a-z 0-9 becomes '_' */
export function slug(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i').replace(/İ/g, 'i').toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

/** { base, ext } of a path ("folder/Lurker Alert (2).OGG" -> base "lurker_alert_2", ext "ogg"); null when it is not an audio file */
export function splitName(path) {
  const file = String(path ?? '').split(/[\\/]/).pop();
  const m = /^(.*)\.([A-Za-z0-9]{2,5})$/.exec(file);
  if (!m || !AUDIO_EXTS.includes(m[2].toLowerCase())) return null;
  return { base: slug(m[1]), ext: m[2].toLowerCase(), file };
}

function stripVariant(s) {
  const m = /^(.*?)_(\d{1,3})$/.exec(s);
  return m && m[1] ? { name: m[1], variant: +m[2] } : { name: s, variant: 0 };
}

/**
 * Filename convention (case, spaces, dashes, accents, folders and the extension do not matter):
 *   creature_<type>_<event>[_<n>]   type = a creature id ("lurker", "br_smiler", "skel_walker") or "any" (all creatures);
 *                                   event = idle | alert | chase | attack | hurt | death | step (synonyms accepted, see EVENT_ALIASES)
 *   voice_<n>                       spoken lines humanoid creatures may shout (voice_1.ogg, voice_2.ogg ...)
 *   ui_<name>                       replaces the game's ui_<name> sound (ui_click, ui_hover, ui_confirm ...)
 *   sfx_<name>                      replaces any game sound by its id (sfx_door_open, sfx_step_metal_1 ...)
 *   step_<surface>[_<n>]            replaces a footstep set (step_metal_1, step_grass_2 ...)
 *   amb_<bed>                       replaces an ambience bed (amb_desert, amb_blackforest ...)
 * Trailing "_<n>" (or "-2", " (2)") = variant: several files with the same name stem are picked at random.
 */
export function parsePackName(path) {
  const sp = splitName(path);
  if (!sp) return { error: 'not-audio', file: String(path ?? '').split(/[\\/]/).pop() };
  const { base } = sp;
  const parts = base.split('_');
  const head = parts[0];
  if (head === 'creature') {
    const { name, variant } = stripVariant(base);
    const toks = name.split('_');
    if (toks.length < 3) return { error: 'creature-needs-type-and-event', file: sp.file };
    const ev = EVENT_ALIASES[toks[toks.length - 1]];
    if (!ev) return { error: 'unknown-event', file: sp.file };
    const type = toks.slice(1, -1).join('_');
    return { kind: 'creature', type, event: ev, variant, key: `creature_${type}_${ev}`, file: sp.file };
  }
  if (head === 'voice') {
    const { variant } = stripVariant(base);
    return { kind: 'voice', variant, key: 'voice', id: base, file: sp.file };
  }
  if (head === 'amb') {
    const { name, variant } = stripVariant(base);
    const bed = name.slice(4);
    if (!bed) return { error: 'amb-needs-name', file: sp.file };
    return { kind: 'amb', bed, variant, key: 'amb_' + bed, file: sp.file };
  }
  if (head === 'ui' || head === 'step' || head === 'sfx') {
    const raw = head === 'sfx' ? base.slice(4) : base;
    if (!raw || raw === 'ui' || raw === 'step') return { error: 'name-missing', file: sp.file };
    // the game's own numbered variants (step_metal_1) are kept; "alt" is the same name without the trailing number
    return { kind: 'override', name: raw, alt: stripVariant(raw).name, key: 'sfx:' + raw, file: sp.file };
  }
  return { error: 'unknown-prefix', file: sp.file };
}

// ------------------------------------------------------------------------------------------------ zip
const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
async function inflateRaw(bytes) {
  if (typeof DecompressionStream === 'undefined') throw new Error('deflate-unsupported');
  const ds = new DecompressionStream('deflate-raw');
  const res = new Response(new Blob([bytes]).stream().pipeThrough(ds));
  return new Uint8Array(await res.arrayBuffer());
}
/** Reads a .zip (stored or deflated entries, no zip64 / encryption). Returns entries lazily: [{ name, size, read() -> Uint8Array }] */
export function readZip(input, { maxFiles = MAX_FILES, maxBytes = MAX_PACK_BYTES } = {}) {
  const b = input instanceof Uint8Array ? input : new Uint8Array(input);
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (u32(b, i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('not-a-zip');
  const count = u16(b, eocd + 10);
  let p = u32(b, eocd + 16);
  if (count > maxFiles * 4) throw new Error('zip-too-many-files');
  const out = [];
  let total = 0;
  for (let n = 0; n < count && p + 46 <= b.length; n++) {
    if (u32(b, p) !== 0x02014b50) break;
    const flags = u16(b, p + 8), method = u16(b, p + 10), csize = u32(b, p + 20), usize = u32(b, p + 24);
    const nl = u16(b, p + 28), el = u16(b, p + 30), cl = u16(b, p + 32), lho = u32(b, p + 42);
    const name = new TextDecoder('utf-8').decode(b.subarray(p + 46, p + 46 + nl));
    p += 46 + nl + el + cl;
    if (name.endsWith('/') || /(^|\/)(__MACOSX|\.[^/]*)(\/|$)/.test(name) || flags & 1) continue;
    if (csize === 0xffffffff || usize === 0xffffffff) throw new Error('zip64-unsupported');
    total += usize;
    if (usize > MAX_FILE_BYTES || total > maxBytes) continue;
    out.push({
      name, size: usize,
      async read() {
        if (u32(b, lho) !== 0x04034b50) throw new Error('bad-zip-entry');
        const start = lho + 30 + u16(b, lho + 26) + u16(b, lho + 28);
        const raw = b.subarray(start, start + csize);
        if (method === 0) return raw.slice();
        if (method === 8) return inflateRaw(raw);
        throw new Error('zip-method-' + method);
      },
    });
    if (out.length >= maxFiles) break;
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ URL manifest
/** {"name":"My pack","files":{"creature_lurker_alert.ogg":"sounds/a.ogg"}} | {"files":["a/creature_x_idle.ogg", ...]} | [urls] -> [{ name, url }] */
export function parseManifest(json, baseUrl = '') {
  let files = Array.isArray(json) ? json : json?.files;
  const res = [];
  const abs = (u) => { try { return new URL(String(u), baseUrl || undefined).href; } catch { return null; } };
  if (files && !Array.isArray(files) && typeof files === 'object') {
    for (const [name, u] of Object.entries(files)) for (const uu of Array.isArray(u) ? u : [u]) { const url = abs(uu); if (url) res.push({ name, url }); }
  } else if (Array.isArray(files)) {
    for (const u of files) { const url = abs(typeof u === 'string' ? u : u?.url); if (url) res.push({ name: typeof u === 'object' && u.name ? u.name : decodeURIComponent(url.split('?')[0].split('/').pop() || ''), url }); }
  }
  return res.slice(0, MAX_FILES);
}

// ------------------------------------------------------------------------------------------------ storage
/**
 * IndexedDB store for the pack ({name, data:ArrayBuffer, ...}) with an in-memory fallback. Every method resolves (never throws):
 * `persistent` tells whether files survive a reload. Pass { indexedDB } to inject a fake (tests).
 */
export class PackStore {
  constructor({ indexedDB: idb, dbName = 'tfg-soundpack', storeName = 'files' } = {}) {
    this.idb = idb !== undefined ? idb : (typeof indexedDB !== 'undefined' ? indexedDB : null);
    this.dbName = dbName; this.storeName = storeName;
    this.mem = new Map(); this.meta = {};
    this.db = null; this.persistent = false; this.ready = null;
  }
  open() {
    if (this.ready) return this.ready;
    this.ready = new Promise((resolve) => {
      if (!this.idb) return resolve(false);
      let req;
      try { req = this.idb.open(this.dbName, 1); } catch { return resolve(false); }
      let done = false, tm = null;
      const fin = (v) => { if (!done) { done = true; clearTimeout(tm); resolve(v); } };
      req.onupgradeneeded = () => { try { const db = req.result; if (!db.objectStoreNames.contains(this.storeName)) db.createObjectStore(this.storeName, { keyPath: 'name' }); if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta'); } catch { /* handled by onerror */ } };
      req.onsuccess = () => { this.db = req.result; this.persistent = true; fin(true); };
      req.onerror = () => fin(false);
      req.onblocked = () => fin(false);
      tm = setTimeout(() => fin(false), 2500);
    });
    return this.ready;
  }
  _tx(mode, names, fn) {
    return new Promise((resolve) => {
      let tx;
      try { tx = this.db.transaction(names, mode); } catch { this.persistent = false; return resolve(undefined); }
      let out;
      tx.oncomplete = () => resolve(out === undefined ? true : out);
      tx.onerror = tx.onabort = () => { this.persistent = false; resolve(undefined); };
      try { out = fn(tx); } catch { this.persistent = false; resolve(undefined); }
    });
  }
  async putMany(records) {
    await this.open();
    for (const r of records) this.mem.set(r.name, r);
    if (this.db && this.persistent) {
      const ok = await this._tx('readwrite', [this.storeName], (tx) => { const os = tx.objectStore(this.storeName); for (const r of records) os.put(r); });
      if (!ok) this.persistent = false;
    }
    return records.length;
  }
  async all() {
    await this.open();
    if (this.db && this.persistent) {
      const rows = await new Promise((resolve) => {
        try {
          const req = this.db.transaction([this.storeName], 'readonly').objectStore(this.storeName).getAll();
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => resolve(null);
        } catch { resolve(null); }
      });
      if (rows) { this.mem = new Map(rows.map((r) => [r.name, r])); return rows; }
      this.persistent = false;
    }
    return [...this.mem.values()];
  }
  async clear() {
    await this.open();
    this.mem.clear();
    if (this.db && this.persistent) await this._tx('readwrite', [this.storeName, 'meta'], (tx) => { tx.objectStore(this.storeName).clear(); tx.objectStore('meta').clear(); });
    this.meta = {};
    return true;
  }
  async getMeta(key) {
    await this.open();
    if (this.db && this.persistent) {
      const v = await new Promise((resolve) => { try { const r = this.db.transaction(['meta'], 'readonly').objectStore('meta').get(key); r.onsuccess = () => resolve(r.result); r.onerror = () => resolve(undefined); } catch { resolve(undefined); } });
      if (v !== undefined) return v;
    }
    return this.meta[key];
  }
  async setMeta(key, val) {
    await this.open();
    this.meta[key] = val;
    if (this.db && this.persistent) await this._tx('readwrite', ['meta'], (tx) => { tx.objectStore('meta').put(val, key); });
    return true;
  }
}

/** how a record set is summarised in the UI: counts per group */
export function summarize(records) {
  const s = { total: records.length, creature: 0, voice: 0, override: 0, amb: 0, types: new Set(), bytes: 0 };
  for (const r of records) {
    s[r.kind] = (s[r.kind] || 0) + 1; s.bytes += r.size || 0;
    if (r.kind === 'creature') s.types.add(r.type);
  }
  s.types = [...s.types].sort();
  return s;
}
