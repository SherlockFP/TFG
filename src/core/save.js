// Persistent storage: settings, personal profile (MMO progression) and run saves (host).
import { randomId } from './rng.js';
import { migrateXpCurve, XP_CURVE_VERSION } from '../game/progression.js';
import { detectLang } from './i18n.js';
import { DEFAULT_KEYS, clampFov, clampRange, CB_MODES, UI_SCALE_MIN, UI_SCALE_MAX } from './a11y_core.js';   // [a11y]
import { sanitizeAvatar } from '../ui/avatarpic.js';   // [profile]

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

export { DEFAULT_KEYS };   // [a11y] defined in a11y_core.js (pure, node-testable); now includes reload / emote wheel / daily / role skills / hotbar / panels

export function defaultSettings() {
  return {
    lang: detectLang(navigator.language),   // first run: tr -> TR, ru -> RU, anything else -> EN
    quality: 'auto',        // [perf2] 'auto' | 'low' | 'medium' | 'high' (render/quality.js)
    qualityAuto: null,      // [perf2] level the first-boot 3 s fps probe picked (null = not probed yet)
    renderHeight: 360,      // internal PSX resolution (240/360/480/720)
    fov: 72,
    sensitivity: 1.0,
    invertY: false,
    masterVolume: 0.8,
    sfxVolume: 0.9,
    ambienceVolume: 0.8,     // [atmos] procedural ambience beds + loop beds (audio 'amb' bus)
    musicVolume: 0.6,
    dynamicMusic: true,      // [score] adaptive procedural music (src/audio/score.js); false = old looping menu theme only
    musicIntensity: 0.7,     // [score] 0..1: how loud the tension / chase / boss / extraction layers get
    instrumentVolume: 0.8,   // playable instruments (game/music.js)
    danceVolume: 0.8,        // dance music loops (game/dance.js)
    voiceVolume: 1.0,
    micEnabled: true,
    micConsent: 'ask',      // 'ask' | 'yes' | 'no'  (never grab the mic without asking)
    voiceMode: 'ptt',       // 'open' | 'ptt'  (hold V to talk, like R.E.P.O.)
    settingsVersion: 5,
    micGain: 1.0,
    micDevice: '',
    outputDevice: '',       // AudioContext.setSinkId target ('' = system default)
    vertexJitter: 1,        // 0 off, 1 normal, 2 strong
    dither: true,
    outlines: true,
    headBob: true,
    fullscreenPlay: true,   // enter fullscreen once when the game captures the mouse
    confirmLeave: true,     // [ctrlw] ask before closing the tab while in a game
    reduceMotion: false,    // scales camera shake/bob/punch + screen warp down, disables the sprint FOV kick
    showFps: false,
    classicAvatar: false,   // [avatar2] true = old hazmat avatar instead of the rounded "TFG Employee" (applies to newly built models)
    tagAvatars: true,       // [profile] small avatar sprite above remote name tags
    netStrategy: 'nostr',   // nostr | mqtt | torrent | local
    // [a11y] wave 7 accessibility (src/game/a11y.js)
    cbMode: 'off',          // off | protanopia | deuteranopia | tritanopia | contrast: remaps the signal colours (tiers, HUD, lasers, zones)
    uiScale: 1,             // 0.8 - 1.5, scales HUD and panels
    toggleHold: { sprint: false, crouch: false, aim: false },   // press once to start / again to stop instead of holding
    shakeScale: 1,          // 0 - 1, camera shake / hurt shake intensity
    reduceFlash: false,     // caps + rate-limits full-screen flashes, slows Algorithm glitch / strobe flicker
    padEnabled: true, padLook: 1, padGlyphs: 'auto',   // gamepad play, look speed, glyph set (auto | xbox | ps)
    keys: { ...DEFAULT_KEYS },
  };
}

export function loadSettings() {
  const d = defaultSettings();
  const s = load(KEY_SETTINGS, {});
  const out = { ...d, ...s, keys: { ...d.keys, ...(s.keys || {}) } };
  // migrations
  if ((s.settingsVersion || 1) < 2) { out.voiceMode = 'ptt'; out.settingsVersion = 2; }
  // v3 (2026-09-30): every player back on the same signalling network. Hosts and joiners on different modes
  // (an old MQTT / torrent / local pick) never see each other's lobbies and a code join silently times out.
  if ((s.settingsVersion || 1) < 3) { out.netStrategy = 'nostr'; out.settingsVersion = 3; }
  // v4: migrate the old default pair only. Preserve intentional custom bindings.
  if ((s.settingsVersion || 1) < 4) {
    const old = s.keys || {};
    const cTaken = Object.entries(old).some(([a, code]) => a !== 'crouch' && a !== 'magicWheel' && code === 'KeyC');
    const slashTaken = Object.entries(old).some(([a, code]) => a !== 'magicWheel' && code === 'Backslash');
    const oldWheel = !old.magicWheel || old.magicWheel === 'KeyC';
    if ((!old.crouch || old.crouch === 'ControlLeft') && !cTaken && (!oldWheel || !slashTaken)) {
      out.keys.crouch = 'KeyC';
      if (oldWheel) out.keys.magicWheel = 'Backslash';
    }
    out.settingsVersion = 4;
  }
  // v5: v4 conflict saves can still have Ctrl crouch. Move it to C and keep
  // displaced actions usable without moving an unrelated custom binding.
  const isCtrl = code => code === 'ControlLeft' || code === 'ControlRight';
  if ((s.settingsVersion || 1) < 5 || Object.values(out.keys).some(isCtrl)) {
    const moveToFree = action => {
      const candidates = [DEFAULT_KEYS[action], 'Backslash', 'BracketLeft', 'BracketRight',
        'Semicolon', 'Quote', 'Minus', 'Equal', ...Object.values(DEFAULT_KEYS)];
      const occupied = new Set(Object.values(out.keys));
      const free = candidates.find(code => code && !isCtrl(code) && !occupied.has(code));
      if (free) out.keys[action] = free;
    };
    if (out.keys.crouch === 'ControlLeft' || out.keys.crouch === 'ControlRight') {
      out.keys.crouch = 'KeyC';
      for (const action of Object.keys(out.keys)) {
        if (action === 'crouch' || out.keys[action] !== 'KeyC') continue;
        moveToFree(action);
      }
    }
    for (const action of Object.keys(out.keys)) if (isCtrl(out.keys[action])) moveToFree(action);
    out.settingsVersion = 5;
  }
  // [a11y] range checks (a hand-edited / old save must not give a 5 degree or 300 degree FOV)
  out.fov = clampFov(out.fov);
  out.uiScale = clampRange(out.uiScale, UI_SCALE_MIN, UI_SCALE_MAX, 1);
  out.shakeScale = clampRange(out.shakeScale, 0, 1, 1);
  out.padLook = clampRange(out.padLook, 0.3, 2.5, 1);
  if (!CB_MODES.includes(out.cbMode)) out.cbMode = 'off';
  out.toggleHold = { ...d.toggleHold, ...(s.toggleHold && typeof s.toggleHold === 'object' ? s.toggleHold : {}) };
  return out;
}
export function saveSettings(s) { store(KEY_SETTINGS, s); }

// first-run handle: a job title plus a 3-digit badge number (<= 16 chars, passes profilename rules)
const HANDLES = ['Janitor', 'Lurker', 'Intern', 'Temp', 'Contractor', 'Nobody', 'Trainee', 'Guest', 'Volunteer', 'Newbie', 'Extra', 'Anon'];
export const defaultHandle = () => HANDLES[Math.floor(Math.random() * HANDLES.length)] + Math.floor(Math.random() * 900 + 100);

export function defaultProfile() {
  return {
    id: randomId(10),
    name: defaultHandle(),
    suit: 'orange',
    hat: 'none',
    avatar: null,            // [profile] { m, f, px, png?, bg? } (ui/avatarpic.js); null = generated default seeded by the name
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

/** [followers] Clout -> Followers migration: the persisted count is the max of every name it ever had (coins = Clout, followers, clout); >= 0 */
export function followersFromSave(p, d = { coins: 0 }) {
  const c = [p?.coins, p?.followers, p?.clout].filter((v) => Number.isFinite(v));
  return c.length ? Math.max(0, ...c) : d.coins;
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
    name: typeof p.name === 'string' && p.name.trim() ? p.name : d.name,   // [profile]
    avatar: sanitizeAvatar(p.avatar),   // [profile]
    bestiary: obj(p.bestiary, {}),
    bounties: arr(p.bounties, []),
    owned: arr(p.owned, d.owned),
    level: Number.isFinite(p.level) ? p.level : d.level,
    xp: Number.isFinite(p.xp) ? p.xp : d.xp,
    coins: followersFromSave(p, d),   // [followers] profile.coins IS the follower count (the old Clout field): never lost, never spent
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
