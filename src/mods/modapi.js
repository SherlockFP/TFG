// Mod system: window.KefalAPI. Mods are plain JS files that call KefalAPI.defineMod({...}).
// Bundled mods live in public/mods (listed in mods/index.json); users can import their own .js files
// from the Mods menu (stored locally). Mods are initialised once at startup.
//
// Two kinds of bundled mods:
//  - TFG FEATURES (def.builtin = true): ports of popular Lethal Company mods that are now part of the
//    base game. They are ALWAYS initialised, on by default, and every event handler they register is
//    gated by featureOn(id), so they can be switched on/off per feature. For gameplay features
//    (scope 'host', the default) the host's switches win: the host writes config.features in
//    'configure', it reaches clients in the 'welcome' config, and live changes (terminal FEATURES)
//    are pushed with a 'tfg-features' mod message. Personal features (scope 'local': HUD, cameras,
//    lore...) follow each player's own switch.
//  - OPTIONAL MODS: cheats / jokes / difficulty tweaks. Off by default, initialised only when enabled.
import * as THREE from 'three';
import { ITEMS, registerItem, STORE_ITEMS, SHIP_UPGRADES, SCRAP_TABLE, isSellable, itemDef } from '../game/items.js';
import { CREATURES, registerCreature } from '../game/creatures.js';
import { BEHAVIORS, STATE_SOUNDS, LOOPS, chaser } from '../entities/creatures.js';
import { MOONS, registerMoon, BIOMES, WEATHER, MOON_ORDER } from '../game/moons.js';
import { MARKET, buyRate } from '../game/progression.js';
import { SUIT_COLORS, HATS } from '../models/avatar.js';
import { createCreatureModel } from '../models/creatures.js';
import { insideShip, SHIP } from '../world/ship.js';
import { FACILITY_Y } from '../world/facility.js';
import { RNG, hashString } from '../core/rng.js';
import { G } from '../physics/physics.js';
import { loadModState, saveModState } from '../core/save.js';
import { Emitter } from '../core/events.js';
import { buildModsScreen } from './modscreen.js';
import { t, tf, addTranslations } from '../core/i18n.js';
import { installLcModsI18n } from '../game/lcmods_i18n.js';   // wave 8: names / texts of the lcmods pack

// events that are never gated for built-in features: 'boot'/'netReady' install patches (the patched
// code checks featureOn itself), 'sessionEnd' must always clean up
const UNGATED = new Set(['boot', 'netReady', 'sessionEnd']);
// built-ins that used to be optional (off by default): a stored "off" from that era is reset once so
// the feature really is on by default for everyone (see migrate())
const WAS_OPTIONAL = ['reserved-slots', 'hotbar-plus', 'more-players', 'lategame-upgrades', 'lethal-things', 'extra-moons-pack',
  'lethal-casino', 'custom-boombox', 'herobrine-stalker', 'skinwalker-echoes'];
const FEATURES_VERSION = 1;

export class ModManager extends Emitter {
  constructor() {
    super();
    this.defs = new Map();       // id -> def
    this.state = loadModState();  // { enabled: {id: bool}, imported: [{id, name, code}], config: {id: {...}} }
    this.state.enabled = this.state.enabled || {};
    this.state.config = this.state.config || {};
    this.active = new Map();     // id -> def (initialised)
    this.commands = new Map();   // terminal: name -> { fn, help, owner }
    this.chatCommands = new Map(); // chat: name -> { fn, owner }
    this.content = new Map();    // mod id -> { scrap: [[entry, w]], store: [id], moons: [id], creatures: [[tbl, id, w]] }
    this.soundGens = new Map();  // name -> (sampleRate) => Float32Array | Float32Array[]
    this.game = null;
    this.errors = [];
    this._maxPlayersCap = 0;
    this.installGlobal();
    this.installCore();
    window.__kefalMods = this;
  }

  // ------------------------------------------------------------------ public API (window.KefalAPI)
  installGlobal() {
    installLcModsI18n(addTranslations);
    const mm = this;
    const api = {
      version: 2,
      t, tf,   // wave 8: mods can localise their own strings (lcmods_i18n.js)
      THREE,
      ITEMS, CREATURES, MOONS, MOON_ORDER, BIOMES, WEATHER, BEHAVIORS, STORE_ITEMS, SHIP_UPGRADES, SCRAP_TABLE, MARKET,
      SUIT_COLORS, HATS, STATE_SOUNDS, LOOPS, SHIP, FACILITY_Y, RNG, hashString, G,
      chaser, isSellable, insideShip, buyRate, itemDef, createCreatureModel,
      defineMod(def) { mm.define(def); },
      registerItem(def, opts = {}) {
        const d = registerItem(def);
        const rec = mm.contentRec(opts._owner);
        if (opts.store && !STORE_ITEMS.includes(d.id)) { STORE_ITEMS.push(d.id); rec?.store.push(d.id); }
        if (opts.scrapWeight) {
          for (const t of Object.values(SCRAP_TABLE)) { const e = [d.id, opts.scrapWeight]; t.push(e); rec?.scrap.push([e, opts.scrapWeight]); }
        }
        if (opts.model) mm.itemModels.set(d.id, opts.model);
        return d;
      },
      registerCreature(id, def, behavior, opts = {}) {
        // a mod must never replace a built-in creature (the old Herobrine port silently overwrote 'stalker')
        if (CREATURES[id] && !CREATURES[id].custom) { console.warn(`[mods] creature id "${id}" is built in - registration skipped`); return CREATURES[id]; }
        const d = registerCreature(id, def, behavior);
        if (behavior) BEHAVIORS[id] = behavior;
        if (opts.model) mm.creatureModels.set(id, opts.model);
        const rec = mm.contentRec(opts._owner);
        if (rec) rec.types.push(id);
        if (opts.moons) {
          for (const [moonId, w] of Object.entries(opts.moons)) {
            const m = MOONS[moonId];
            if (!m) continue;
            const tbl = d.zone === 'out' ? (m.outdoor = m.outdoor || {}) : (m.creatures = m.creatures || {});
            tbl[id] = w;
            rec?.creatures.push([tbl, id, w]);
          }
        }
        return d;
      },
      /** opts.hidden: the moon exists (a lobby / save on it still loads) but is not listed or routable here */
      registerMoon(def, opts = {}) {
        const m = registerMoon(def);
        const rec = mm.contentRec(opts._owner);
        if (opts.hidden) { const i = MOON_ORDER.indexOf(m.id); if (i >= 0) MOON_ORDER.splice(i, 1); } else rec?.moons.push(m.id);
        return m;
      },
      registerUpgrade(id, def) { SHIP_UPGRADES[id] = def; },
      registerCommand(name, fn, help, owner) { mm.commands.set(name.toLowerCase(), { fn, help, owner: owner || null }); },
      registerChatCommand(name, fn, owner) { mm.chatCommands.set(name.toLowerCase(), { fn, owner: owner || null }); },
      /** Procedural sound: gen(sampleRate) -> Float32Array (mono) or [left, right]. Play it with playSound / game.audio. */
      registerSound(name, gen) { mm.soundGens.set(name, gen); },
      playSound(name, opts = {}) { mm.ensureSound(name); return mm.game?.audio.play(name, opts) || null; },
      on(ev, fn) { return mm.on(ev, fn); },
      onAlways(ev, fn) { return mm.on(ev, fn); },
      /** Custom cross-mod events (use a prefix, e.g. 'tfg:catRescued'). */
      emit(ev, ...args) { mm.emit(ev, ...args); },
      get game() { return mm.game; },
      get isHost() { return !!mm.game?.isHost; },
      toast(text, kind) { mm.game?.ui.toast(text, kind); },
      config(id) { return mm.configFor(id); },
      featureOn(id) { return mm.featureOn(id); },
      send(data) { mm.game?.net?.broadcast('modmsg', data); },
      /** host: XP / Clout (and bounty progress) for one player (to = peer id) or everyone (to = null) */
      reward(to, xp, coin, reason, extra = {}) { mm.game?.net?.broadcast('xp', { to: to || undefined, xp: Math.round(xp || 0), coin: Math.round(coin || 0), reason, ...extra }); },
    };
    this.itemModels = new Map();
    this.creatureModels = new Map();
    window.KefalAPI = api;
    window.ViralAPI = api;   // TFG name (docs/THEME.md); same object
    this.api = api;
  }

  // Per-mod view of the API for built-in features: handlers are gated by the feature switch, content
  // registrations are recorded so they can be switched off (weights zeroed, moons hidden, store items removed).
  scopedApi(def) {
    const mm = this, base = this.api, id = def.id;
    const scoped = Object.create(base);
    const gate = (ev, fn) => (UNGATED.has(ev) ? fn : (...a) => (mm.featureOn(id) ? fn(...a) : undefined));
    Object.assign(scoped, {
      on(ev, fn) { return mm.on(ev, gate(ev, fn)); },
      onAlways(ev, fn) { return mm.on(ev, fn); },
      enabled() { return mm.featureOn(id); },
      registerItem(d, opts = {}) { return base.registerItem(d, { ...opts, _owner: id }); },
      registerCreature(cid, d, behavior, opts = {}) { return base.registerCreature(cid, d, behavior, { ...opts, _owner: id }); },
      registerMoon(d, opts = {}) { return base.registerMoon(d, { ...opts, _owner: id }); },
      registerCommand(name, fn, help) { return base.registerCommand(name, fn, help, id); },
      registerChatCommand(name, fn) { return base.registerChatCommand(name, fn, id); },
    });
    return scoped;
  }

  contentRec(owner) {
    if (!owner) {
      // optional mods: remember that the mod registers content (used by the join check)
      const cur = this._initing && this.defs.get(this._initing);
      if (cur) cur.registersContent = true;
      return null;
    }
    const def = this.defs.get(owner);
    if (def) def.registersContent = true;
    if (!this.content.has(owner)) this.content.set(owner, { scrap: [], store: [], moons: [], creatures: [], types: [] });
    return this.content.get(owner);
  }

  define(def) {
    if (!def?.id) { console.warn('mod without id'); return; }
    def.source = this._loadingSource || 'bundled';
    if (def.builtin && def.source !== 'bundled') def.builtin = false;   // imported files can never pose as built-ins
    if (def.builtin && def.enabledByDefault === undefined) def.enabledByDefault = true;
    this.defs.set(def.id, def);
  }

  configFor(id) {
    const def = this.defs.get(id);
    const out = {};
    for (const [k, spec] of Object.entries(def?.config || {})) out[k] = spec.default;
    return { ...out, ...(this.state.config[id] || {}) };
  }
  setConfig(id, key, value) {
    this.state.config[id] = { ...(this.state.config[id] || {}), [key]: value };
    saveModState(this.state);
  }

  migrate() {
    if ((this.state.featuresV || 0) >= FEATURES_VERSION) return;
    for (const id of WAS_OPTIONAL) if (this.state.enabled[id] === false) delete this.state.enabled[id];
    this.state.featuresV = FEATURES_VERSION;
    saveModState(this.state);
  }

  async loadAll() {
    // bundled
    try {
      const idx = await fetch('mods/index.json', { cache: 'no-cache' }).then((r) => r.json());
      for (const file of idx.mods || []) {
        this._loadingSource = 'bundled';
        try { await import(/* @vite-ignore */ new URL('mods/' + file, document.baseURI).href); } catch (e) { this.errors.push(file + ': ' + e.message); console.warn('mod load', file, e); }
      }
    } catch (e) { console.warn('no mods index', e); }
    // imported by the user
    for (const m of this.state.imported || []) {
      this._loadingSource = 'imported';
      try {
        const url = URL.createObjectURL(new Blob([m.code], { type: 'text/javascript' }));
        await import(/* @vite-ignore */ url);
        URL.revokeObjectURL(url);
      } catch (e) { this.errors.push(m.name + ': ' + e.message); }
    }
    this._loadingSource = null;
    this.migrate();
    // built-in features first (always initialised; gated at runtime), then enabled optional mods
    const order = [...this.defs.values()].sort((a, b) => (b.builtin ? 1 : 0) - (a.builtin ? 1 : 0));
    for (const def of order) {
      if (!def.builtin && !this.isEnabled(def.id)) continue;
      this._initing = def.id;
      try {
        def.init?.(def.builtin ? this.scopedApi(def) : this.api, this.configFor(def.id));
        this.active.set(def.id, def);
      } catch (e) { this.errors.push(def.id + ': ' + e.message); console.error('mod init', def.id, e); }
      this._initing = null;
    }
    // built-ins whose requirements are missing are reported (they stay initialised but switched off)
    for (const def of this.defs.values()) {
      for (const req of def.requires || []) if (!this.defs.has(req)) this.errors.push(`${def.id}: needs ${req}`);
    }
  }

  isEnabled(id) {
    const def = this.defs.get(id);
    const v = this.state.enabled[id];
    return v === undefined ? !!def?.enabledByDefault : !!v;
  }
  setEnabled(id, on) { this.state.enabled[id] = on; saveModState(this.state); }
  // optional mods only: built-in features ship with the game and are identical for everyone
  enabledIds() { return [...this.active.values()].filter((d) => !d.builtin).map((d) => d.id).sort().map((id) => id + '@' + (this.active.get(id).version || '1')); }
  list() { return [...this.defs.values()]; }
  features() { return [...this.defs.values()].filter((d) => d.builtin); }
  optional() { return [...this.defs.values()].filter((d) => !d.builtin); }

  /** Is a built-in feature (or optional mod) active right now in this session? */
  featureOn(id) {
    const def = this.defs.get(id);
    if (!def) return false;
    if (!def.builtin) return this.active.has(id);
    if (!this.active.has(id)) return false;
    for (const req of def.requires || []) if (req !== id && !this.featureOn(req)) return false;
    if (def.scope !== 'local') {
      const f = this.game?.config?.features;
      if (f && Object.prototype.hasOwnProperty.call(f, id)) return !!f[id];
    }
    return this.isEnabled(id);
  }
  localFeatureMap() {
    const out = {};
    for (const d of this.features()) if (d.scope !== 'local') out[d.id] = this.isEnabled(d.id);
    return out;
  }

  // content of switched-off features: zero spawn weights, hide moons from the terminal, pull store items
  applyContentGates() {
    for (const [owner, rec] of this.content) {
      const on = this.featureOn(owner);
      for (const [e, w] of rec.scrap) e[1] = on ? w : 0;
      for (const [tbl, cid, w] of rec.creatures) tbl[cid] = on ? w : 0;
      for (const sid of rec.store) {
        const i = STORE_ITEMS.indexOf(sid);
        if (on && i < 0) STORE_ITEMS.push(sid);
        if (!on && i >= 0) STORE_ITEMS.splice(i, 1);
      }
      for (const mid of rec.moons) {
        const i = MOON_ORDER.indexOf(mid);
        if (on && i < 0 && MOONS[mid]) MOON_ORDER.push(mid);
        if (!on && i >= 0) MOON_ORDER.splice(i, 1);   // MOONS[mid] stays: a saved run on it still loads
      }
    }
  }

  // ------------------------------------------------------------------ core glue (own listeners, registered first)
  installCore() {
    this.on('configure', (config) => {
      config.features = this.localFeatureMap();
      this.applyContentGates();
    });
    this.on('netReady', (net, game) => {
      game.on?.('joined', () => this.applyContentGates());
    });
    this.on('hostStart', (game) => {
      // a save made with a moon that is not installed any more would crash the landing
      if (game.run && !MOONS[game.run.moon]) {
        game.run.moon = MOONS.hamsi ? 'hamsi' : MOON_ORDER.find((m) => MOONS[m] && !MOONS[m].company) || game.run.moon;
        game.ui?.toast(t('Your save was routed to a moon that is not installed. Autopilot reset.'), 'bad');
      }
    });
    this.on('message', (d, from) => {
      const g = this.game;
      if (!g || d?.k !== 'tfg-features' || g.isHost || from !== g.net?.hostId || !d.f || typeof d.f !== 'object') return;
      const f = {};
      for (const [k, v] of Object.entries(d.f)) if (this.defs.get(k)?.builtin) f[k] = !!v;
      g.config.features = f;
      this.applyContentGates();
      if (d.changed) g.ui?.toast(tf('Host {n} {n2}.', { n: d.on ? 'enabled' : 'disabled', n2: this.defs.get(d.changed)?.name || d.changed }), 'info');
    });
    // terminal: FEATURES [name on|off]
    this.commands.set('features', { fn: (rest, term, game) => this.featuresCommand(rest, term, game), help: 'TFG feature switches (host: FEATURES <name> ON/OFF)', owner: null });
  }

  featuresCommand(rest, term, game) {
    const list = this.features().sort((a, b) => a.name.localeCompare(b.name));
    if (!rest.length) {
      const lines = ['TFG FEATURES' + (game?.isHost ? '  (you are the host)' : '  (host decides crew features)'), ''];
      for (const d of list) lines.push(`${this.featureOn(d.id) ? '[ON] ' : '[OFF]'} ${d.name.padEnd(22)} ${d.scope === 'local' ? '(personal)' : ''}`);
      lines.push('', game?.isHost ? 'FEATURES <name> ON / OFF to switch a crew feature.' : 'Personal features: MODS menu.');
      term.print(lines.join('\n'));
      return;
    }
    const want = rest[rest.length - 1];
    const q = rest.slice(0, want === 'on' || want === 'off' ? -1 : rest.length).join(' ').replace(/[^a-z0-9]/g, '');
    const def = list.find((d) => d.id.replace(/[^a-z0-9]/g, '').startsWith(q) || d.name.toLowerCase().replace(/[^a-z0-9]/g, '').startsWith(q));
    if (!def) { term.print(t('Unknown feature. Type FEATURES for the list.'), 'err'); return; }
    if (want !== 'on' && want !== 'off') { term.print(`${def.name}: ${this.featureOn(def.id) ? 'ON' : 'OFF'}\n${def.description || ''}`); return; }
    const on = want === 'on';
    if (def.scope === 'local') { this.setEnabled(def.id, on); term.print(tf('{name} {n} for you{n2}.', { name: def.name, n: on ? 'enabled' : 'disabled', n2: on && !this.active.has(def.id) ? ' (reload needed)' : '' })); return; }
    if (!game?.isHost) { term.print(t('Only the host can switch crew features.'), 'err'); return; }
    this.setEnabled(def.id, on);
    game.config.features = { ...(game.config.features || {}), [def.id]: on };
    this.applyContentGates();
    game.net.broadcast('modmsg', { k: 'tfg-features', f: game.config.features, changed: def.id, on });
    term.print(tf('{name} is now {n} for the crew. Some effects apply from the next landing.', { name: def.name, n: on ? 'ON' : 'OFF' }));
  }

  // Host: may this peer join? Sends 'reject' (before any world data) and returns false when not.
  gateJoin(id, info, game) {
    const reject = (reason) => {
      try { game.net.sendTo(id, 'reject', { reason }); } catch (e) { console.warn(e); }
      game.ui?.toast(`${info?.name || 'A player'} could not join: ${reason}`, 'bad');
      return false;
    };
    const phase = game.run?.phase;
    if (this.defs.has('late-join') && !this.featureOn('late-join') && phase && phase !== 'orbit') {
      return reject('The crew is already out on a job and late joining is off. Try again when the ship is in orbit.');
    }
    const theirs = new Set((Array.isArray(info?.mods) ? info.mods : []).map((s) => String(s).split('@')[0]));
    const missing = [...this.active.values()].filter((d) => !d.builtin && d.registersContent && !theirs.has(d.id)).map((d) => d.name);
    if (missing.length) return reject('Missing content mods: ' + missing.join(', ') + '. Enable them in MODS and reload.');
    return true;
  }

  // Client/host: a map for a moon that is not installed here was requested (loadMapFor guard).
  missingMoon(game, moonId) {
    const msg = `This lobby is on moon "${moonId}", which is not installed here. Enable the same mods as the host.`;
    console.warn('[mods]', msg);
    if (game.isHost) game.ui?.toast(tf('Unknown moon "{moonId}" - the autopilot will abort the landing.', { moonId }), 'bad');
    else game.emit('fatal', msg);
    return true;
  }

  // lobby size cap raised by the More Players feature (read by main.js maxPlayersAllowed)
  get maxPlayers() { return this._maxPlayersCap && (!this.defs.get('more-players')?.builtin || this.isEnabled('more-players')) ? this._maxPlayersCap : 0; }
  set maxPlayers(v) { this._maxPlayersCap = Math.max(0, Math.round(Number(v) || 0)); }

  ensureSound(name) {
    const audio = this.game?.audio;
    if (!audio?.ctx || audio.buffers?.has(name)) return;
    const gen = this.soundGens.get(name);
    if (!gen) return;
    try {
      const sr = audio.ctx.sampleRate;
      const out = gen(sr);
      const chans = Array.isArray(out) ? out : [out];
      const buf = audio.ctx.createBuffer(chans.length, chans[0].length, sr);
      chans.forEach((c, i) => buf.copyToChannel(c, i));
      audio.buffers.set(name, buf);
    } catch (e) { console.warn('mod sound', name, e); audio.buffers.set(name, null); }
  }

  importMod(name, code) {
    this.state.imported = (this.state.imported || []).filter((m) => m.name !== name);
    this.state.imported.push({ name, code });
    saveModState(this.state);
  }
  removeImported(name) {
    this.state.imported = (this.state.imported || []).filter((m) => m.name !== name);
    saveModState(this.state);
  }

  attach(game) { this.game = game; }
  detach() { this.game = null; }

  /** Mods / TFG Features screen (main menu). Returns the element; ui.js appends it. */
  buildScreen(ui) { return buildModsScreen(this, ui); }

  command(text, game) {
    const [w, ...rest] = text.slice(1).split(/\s+/);
    const c = this.chatCommands.get(w.toLowerCase());
    if (!c || (c.owner && !this.featureOn(c.owner))) return false;
    try { c.fn(rest, game); } catch (e) { console.error(e); }
    return true;
  }
  terminalCommand(w0, rest, terminal) {
    const c = this.commands.get(w0);
    if (!c || (c.owner && !this.featureOn(c.owner))) {
      if (w0 === 'help' && this.commands.size) {
        const live = [...this.commands.entries()].filter(([, v]) => !v.owner || this.featureOn(v.owner));
        setTimeout(() => terminal.print(tf('FEATURE & MOD COMMANDS:\n{n}', { n: live.map(([k, v]) => `>${k.toUpperCase()}  ${v.help || ''}`).join('\n') })), 0);
      }
      return false;
    }
    try { c.fn(rest, terminal, this.game); } catch (e) { terminal.print(tf('Mod error: {message}', { message: e.message }), 'err'); }
    return true;
  }
}
