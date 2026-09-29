// SOUND PACK manager (module `sfx`, docs/wave4/sfx.md): lets a player load their own sound files (folder / zip / loose files / URL manifest).
// Files are mapped to sound keys by filename (see parsePackName in soundpack_core.js), kept in this browser's IndexedDB, decoded into the
// AudioManager's buffer cache and NEVER uploaded anywhere. Only the local player hears them.
//   creature_<type>_<event>  -> pack.pick(key) is asked by the creature voice layer (src/game/sfx.js), which then skips the synth
//   voice_<n>                -> pool `voice`
//   ui_* / step_* / sfx_*    -> replace the game's own sound of that id in audio.buffers (restored when the pack is removed / disabled)
//   amb_<bed>                -> replaces an ambience bed
import { PackStore, parsePackName, readZip, parseManifest, splitName, summarize, MAX_FILE_BYTES, MAX_PACK_BYTES, MAX_FILES } from './soundpack_core.js';

const LS_ON = 'tfg.soundpack.on';
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage blocked: the setting just does not persist */ } };

function peakOf(buf) {
  let p = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > p) p = a; } }
  return p;
}
function scaleBuffer(buf, g) {
  for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] *= g; }
}

export class SoundPack {
  constructor(audio, store = new PackStore()) {
    this.audio = audio; this.store = store;
    this.records = [];             // { name, file, kind, key, type?, event?, variant, size, mime, data }
    this.pools = new Map();        // key -> [buffer names in audio.buffers]
    this.overrides = new Map();    // game sound id -> { had, orig }
    this.ignored = [];             // [{ file, reason }] from the last import
    this.listeners = new Set();
    this.enabled = lsGet(LS_ON) !== '0';
    this.url = null;
    this.busy = false;
    this._gen = 0;
  }
  get persistent() { return !!this.store.persistent; }
  get count() { return this.records.length; }
  summary() { return summarize(this.records); }
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _emit() { for (const fn of this.listeners) { try { fn(this); } catch { /* ui only */ } } }

  async load() {
    this.busy = true;
    try {
      this.records = await this.store.all();
      this.url = (await this.store.getMeta('url')) || null;
      await this.rebuild();
    } finally { this.busy = false; this._emit(); }
    return this.records.length;
  }

  // ---------------------------------------------------------------- buffers
  async _decode(rec) {
    const ctx = this.audio?.ctx;
    if (!ctx) return null;
    try {
      const buf = await ctx.decodeAudioData(rec.data.slice(0));
      const pk = peakOf(buf);
      if (pk > 1e-4) {
        if (rec.kind === 'override') { if (pk < 0.2) scaleBuffer(buf, 0.45 / pk); }   // game sounds: only rescue very quiet files
        else scaleBuffer(buf, 0.8 / pk);
      }
      return buf;
    } catch { return null; }
  }
  _restore() {
    const a = this.audio;
    for (const [id, o] of this.overrides) {
      if (o.had) a.buffers.set(id, o.orig); else { a.buffers.delete(id); a.pending?.delete(id); }
    }
    this.overrides.clear();
    for (const names of this.pools.values()) for (const n of names) a.buffers.delete(n);
    this.pools.clear();
  }
  /** decode everything and register it (idempotent; safe to call again after imports) */
  async rebuild() {
    const gen = ++this._gen, a = this.audio;
    if (!a?.buffers) return;
    this._restore();
    if (!this.enabled || !this.records.length || !a.ctx) return;
    const queue = this.records.filter((r) => !r.bad);
    let i = 0;
    const work = async () => {
      while (i < queue.length) {
        const rec = queue[i++];
        const buf = await this._decode(rec);
        if (gen !== this._gen) return;
        if (!buf) { rec.bad = true; continue; }
        if (rec.kind === 'override') {
          // exact game id; "step_metal.ogg" (no number) replaces every numbered variant the game has (step_metal_1 .. _8)
          let ids = [rec.name];
          if (!a.has?.(rec.name)) { const nums = []; for (let n = 1; n <= 8; n++) if (a.has?.(`${rec.name}_${n}`)) nums.push(`${rec.name}_${n}`); if (nums.length) ids = nums; }
          for (const id of ids) {
            if (!this.overrides.has(id)) this.overrides.set(id, { had: a.buffers.has(id), orig: a.buffers.get(id) });
            a.buffers.set(id, buf);
          }
          rec._buf = buf; rec._ids = ids;
        } else {
          const name = 'pk:' + rec.name;
          a.buffers.set(name, buf);
          if (!this.pools.has(rec.key)) this.pools.set(rec.key, []);
          this.pools.get(rec.key).push(name);
        }
      }
    };
    await Promise.all([work(), work(), work(), work()]);
    // an external (downloaded) sound that was still loading may land after us and overwrite an override: re-assert once
    if (this.overrides.size && typeof setTimeout === 'function') {
      const t = setTimeout(() => { if (gen !== this._gen) return; for (const rec of this.records) if (rec._buf && rec._ids) for (const id of rec._ids) a.buffers.set(id, rec._buf); }, 4000);
      t.unref?.();
    }
  }

  /** a decoded pool member for `key` (or null); rnd() -> [0,1) lets callers use a seeded stream */
  pick(key, rnd = Math.random) {
    if (!this.enabled) return null;
    const pool = this.pools.get(key);
    if (!pool || !pool.length) return null;
    return pool[Math.floor(rnd() * pool.length) % pool.length];
  }
  has(key) { return this.enabled && !!this.pools.get(key)?.length; }
  /** names of creature types that have any custom sound (used by the UI summary) */
  hasCreature(type, event) { return this.has(`creature_${type}_${event}`) || this.has(`creature_any_${event}`); }

  // ---------------------------------------------------------------- import
  async _addRecords(items) {
    // items: [{ file (name), data: ArrayBuffer|Uint8Array, mime }]
    const ignored = [], recs = [];
    let bytes = this.records.reduce((s, r) => s + (r.size || 0), 0);
    for (const it of items) {
      const parsed = parsePackName(it.file);
      if (parsed.error) { ignored.push({ file: it.file, reason: parsed.error }); continue; }
      const data = it.data instanceof Uint8Array ? it.data.buffer.slice(it.data.byteOffset, it.data.byteOffset + it.data.byteLength) : it.data;
      if (data.byteLength > MAX_FILE_BYTES) { ignored.push({ file: it.file, reason: 'file-too-big' }); continue; }
      if (bytes + data.byteLength > MAX_PACK_BYTES || this.records.length + recs.length >= MAX_FILES) { ignored.push({ file: it.file, reason: 'pack-too-big' }); continue; }
      bytes += data.byteLength;
      const sp = splitName(it.file);
      recs.push({ name: `${sp.base}.${sp.ext}`, ...parsed, size: data.byteLength, mime: it.mime || '', data });
    }
    if (recs.length) {
      await this.store.putMany(recs);
      const byName = new Map(this.records.map((r) => [r.name, r]));
      for (const r of recs) byName.set(r.name, r);
      this.records = [...byName.values()];
    }
    this.ignored = ignored;
    return { added: recs.length, ignored };
  }

  /** File / Blob objects from an <input type=file> (also folders via webkitdirectory) or zips; returns { added, ignored } */
  async importFiles(files) {
    this.busy = true; this._emit();
    try {
      const items = [], skipped = [];
      for (const f of Array.from(files || [])) {
        const path = f.webkitRelativePath || f.name || '';
        if (/\.zip$/i.test(path)) {
          try {
            const entries = readZip(await f.arrayBuffer());
            for (const e of entries) { try { items.push({ file: e.name, data: await e.read() }); } catch (err) { skipped.push({ file: e.name, reason: String(err?.message || err) }); } }
          } catch (err) { skipped.push({ file: path, reason: String(err?.message || err) }); }
        } else if (splitName(path)) {
          if (f.size > MAX_FILE_BYTES) skipped.push({ file: path, reason: 'file-too-big' });
          else items.push({ file: path, data: await f.arrayBuffer(), mime: f.type });
        } else skipped.push({ file: path.split(/[\\/]/).pop(), reason: 'not-audio' });
      }
      const res = await this._addRecords(items);
      res.ignored = [...skipped, ...res.ignored]; this.ignored = res.ignored;
      await this.rebuild();
      return res;
    } finally { this.busy = false; this._emit(); }
  }

  /** a pack published on the web: a .zip, or a JSON manifest { files: { "creature_lurker_alert.ogg": "url" } } (needs CORS; the user's responsibility) */
  async importUrl(url, fetchFn = (typeof fetch === 'function' ? fetch : null)) {
    if (!fetchFn) throw new Error('fetch-unavailable');
    const u = new URL(String(url).trim());
    if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('bad-protocol');
    this.busy = true; this._emit();
    try {
      const get = async (href) => {
        const r = await fetchFn(href, { mode: 'cors', credentials: 'omit', cache: 'no-store' });
        if (!r.ok) throw new Error('http-' + r.status);
        return r;
      };
      const r = await get(u.href);
      const items = [];
      const ct = (r.headers?.get?.('content-type') || '').toLowerCase();
      if (/\.zip($|\?)/i.test(u.pathname + u.search) || ct.includes('zip')) {
        for (const e of readZip(await r.arrayBuffer())) { try { items.push({ file: e.name, data: await e.read() }); } catch { /* skip broken entry */ } }
      } else {
        const list = parseManifest(await r.json(), u.href);
        let i = 0;
        const work = async () => {
          while (i < list.length) {
            const it = list[i++];
            try { const fr = await get(it.url); const ab = await fr.arrayBuffer(); items.push({ file: it.name || it.url.split('/').pop(), data: ab, mime: fr.headers?.get?.('content-type') || '' }); } catch { this.ignored.push({ file: it.name, reason: 'download-failed' }); }
          }
        };
        await Promise.all([work(), work(), work()]);
      }
      const res = await this._addRecords(items);
      await this.store.setMeta('url', u.href); this.url = u.href;
      await this.rebuild();
      return res;
    } finally { this.busy = false; this._emit(); }
  }

  async setEnabled(on) {
    this.enabled = !!on; lsSet(LS_ON, on ? '1' : '0');
    await this.rebuild(); this._emit();
  }
  async clear() {
    this._gen++; this._restore();
    this.records = []; this.ignored = []; this.url = null;
    await this.store.clear();
    this._emit();
  }
}

/** called by AudioManager.init(): creates audio.pack and loads whatever the player stored earlier (never throws) */
export async function attachSoundPack(audio, store) {
  if (!audio || audio.pack) return audio?.pack || null;
  try {
    audio.pack = new SoundPack(audio, store);
    await audio.pack.load();
  } catch (e) { console.warn('sound pack', e); }
  return audio.pack;
}
