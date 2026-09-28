// Persistent storage: settings, personal profile (MMO progression) and run saves (host).
import { randomId } from './rng.js';
import { migrateXpCurve, XP_CURVE_VERSION } from '../game/progression.js';

const KEY_SETTINGS = 'kefal.settings.v1';
const KEY_PROFILE = 'kefal.profile.v1';
const KEY_RUN = 'kefal.run.v1.';
const KEY_MODS = 'kefal.mods.v1';

function load(key, fallback) {
  try {
    const s = localStorage.getItem(key);
    if (!s) return fallback;
    return JSON.parse(s);
  } catch { return fallback; }
}
function store(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch { return false; }
}

export const DEFAULT_KEYS = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD',
  jump: 'Space', crouch: 'ControlLeft', sprint: 'ShiftLeft',
  interact: 'KeyE', drop: 'KeyG', flashlight: 'KeyF', ptt: 'KeyV',
  chat: 'Enter', emote1: 'KeyZ', emote2: 'KeyX', menu: 'Tab', throwItem: 'KeyQ',
  ping: 'KeyP',
};

export function defaultSettings() {
  return {
    lang: (navigator.language || 'en').toLowerCase().startsWith('tr') ? 'tr' : 'en',
    renderHeight: 360,      // internal PSX resolution (240/360/480/720)
    fov: 72,
    sensitivity: 1.0,
    invertY: false,
    masterVolume: 0.8,
    sfxVolume: 0.9,
    musicVolume: 0.6,
    voiceVolume: 1.0,
    micEnabled: true,
    micConsent: 'ask',      // 'ask' | 'yes' | 'no'  (never grab the mic without asking)
    voiceMode: 'ptt',       // 'open' | 'ptt'  (hold V to talk, like R.E.P.O.)
    settingsVersion: 2,
    micGain: 1.0,
    micDevice: '',
    outputDevice: '',       // AudioContext.setSinkId target ('' = system default)
    vertexJitter: 1,        // 0 off, 1 normal, 2 strong
    dither: true,
    outlines: true,
    headBob: true,
    reduceMotion: false,    // scales camera shake/bob/punch + screen warp down, disables the sprint FOV kick
    showFps: false,
    netStrategy: 'nostr',   // nostr | mqtt | torrent | local
    keys: { ...DEFAULT_KEYS },
  };
}

export function loadSettings() {
  const d = defaultSettings();
  const s = load(KEY_SETTINGS, {});
  const out = { ...d, ...s, keys: { ...d.keys, ...(s.keys || {}) } };
  // migrations
  if ((s.settingsVersion || 1) < 2) { out.voiceMode = 'ptt'; out.settingsVersion = 2; }
  return out;
}
export function saveSettings(s) { store(KEY_SETTINGS, s); }

export function defaultProfile() {
  return {
    id: randomId(10),
    name: 'Employee' + Math.floor(Math.random() * 900 + 100),
    suit: 'orange',
    hat: 'none',
    level: 1,
    xp: 0,
    xpCurve: XP_CURVE_VERSION,   // XP curve the banked xp was earned under (progression.js migrateXpCurve)
    skillPoints: 0,
    skills: { vit: 0, end: 0, str: 0, agi: 0, lck: 0, tec: 0 },
    coins: 50,               // personal Clout
    owned: ['pipe'],         // soulbound gear ids owned
    loadout: { weapon: 'pipe', head: null, body: null, perk: null },
    cosmetics: { suits: ['orange', 'green', 'blue'], hats: ['none', 'cap'] },
    bestiary: {},            // creatureId -> { seen, kills }
    stats: { kills: 0, deaths: 0, quotasMet: 0, runs: 0, scrapCollected: 0, sold: 0, fish: 0, days: 0, bestArcade: 0, arcadeDay: -1, arcadeXp: 0 },
    bounties: [],            // active accepted bounties (personal)
    bountyDay: -1,
    created: Date.now(),
  };
}

export function loadProfile() {
  const d = defaultProfile();
  const p = load(KEY_PROFILE, null);
  if (!p || typeof p !== 'object' || Array.isArray(p)) { store(KEY_PROFILE, d); return d; }
  const obj = (v, fb) => (v && typeof v === 'object' && !Array.isArray(v) ? v : fb);
  const arr = (v, fb) => (Array.isArray(v) ? v : fb);
  // a corrupted field must not brick the profile: fall back per field, keep everything else (and unknown new keys)
  const out = {
    ...d, ...p,
    bestiary: obj(p.bestiary, {}),
    bounties: arr(p.bounties, []),
    owned: arr(p.owned, d.owned),
    level: Number.isFinite(p.level) ? p.level : d.level,
    xp: Number.isFinite(p.xp) ? p.xp : d.xp,
    coins: Number.isFinite(p.coins) ? p.coins : d.coins,
    skills: { ...d.skills, ...(p.skills || {}) },
    loadout: { ...d.loadout, ...(p.loadout || {}) },
    cosmetics: { ...obj(p.cosmetics, {}), suits: [...new Set([...d.cosmetics.suits, ...arr(p.cosmetics?.suits, [])])], hats: [...new Set([...d.cosmetics.hats, ...arr(p.cosmetics?.hats, [])])] },
    stats: { ...d.stats, ...obj(p.stats, {}) },
  };
  // XP curve migration: keep the saved level + skill points, convert the in-level XP (the default profile's
  // curve version must not mask an old save, so it is taken from the stored profile only)
  out.xpCurve = p.xpCurve;
  if (migrateXpCurve(out)) store(KEY_PROFILE, out);
  return out;
}
export function saveProfile(p) { if (p._noSave) return; store(KEY_PROFILE, p); }

export function listRuns() {
  const out = [];
  for (let i = 1; i <= 3; i++) out.push({ slot: i, data: load(KEY_RUN + i, null) });
  return out;
}
export function loadRun(slot) { const r = load(KEY_RUN + slot, null); return r && typeof r === 'object' && !Array.isArray(r) ? r : null; }
export function saveRun(slot, data) { store(KEY_RUN + slot, { ...data, savedAt: Date.now() }); }
export function deleteRun(slot) { try { localStorage.removeItem(KEY_RUN + slot); } catch { /* ignore */ } }

export function loadModState() { return load(KEY_MODS, { enabled: {}, imported: [] }); }
export function saveModState(s) { store(KEY_MODS, s); }
