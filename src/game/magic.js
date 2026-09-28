// MAGIC (wave 1, docs/wave1/magic.md): spells cast by SPEAKING (Web Speech API while push-to-talk V is held), by
// typing the word in chat, or with the hold-C wheel. Mana + cooldowns are local; everything that touches the world
// (creatures, hush) is done by the host, which also rate-limits casts and relays the visuals to the crew.
//   game.magic = { mana, maxMana, addMana(n), knows(id), learn(id), cast(id, { source }), SPELLS, ... }
// Net: request 'spell' (caster -> host) -> host effects -> broadcast 'fx' { k: 'spell', s: id, c: caster, ... }.
// Each peer applies the per-peer parts itself (items it simulates, its own player: push shove, heal, pull).
import * as THREE from 'three';
import { G } from '../physics/physics.js';
import { ITEMS, registerItem } from './items.js';
import { TIERS } from './tiers.js';
import { RNG } from '../core/rng.js';
import { addTranslations, getLang, t } from '../core/i18n.js';
import { saveSettings } from '../core/save.js';
import { buildLexicon, findSpellWords, isTurkishWord, speechSupported, VoiceListener } from './magic_voice.js';
import { ManaDock, SpellWheel } from '../ui/panels/spellbook.js';
import { createSkillbookModel } from '../models/skillbook.js';

// ------------------------------------------------------------------ spell table
// words: what the voice / chat matcher listens for (normalised: diacritics + letter runs are folded, see magic_voice.js)
export const SPELLS = {
  push: { id: 'push', name: 'Push', say: { en: 'PUSH', tr: 'İT' }, words: { en: ['push', 'pushed'], tr: ['it', 'itt', 'pus'] },
    mana: 15, cd: 4, tier: null, color: 0x9fd4ff, desc: 'Cone of force: knocks creatures back, flings loose items, shoves crewmates.' },
  lumen: { id: 'lumen', name: 'Lumen', say: { en: 'LUMEN', tr: 'IŞIK' }, words: { en: ['lumen', 'lumin', 'lumens'], tr: ['ışık', 'isik', 'lümen'] },
    mana: 20, cd: 15, tier: 'uncommon', color: 0xfff2c0, dur: 45, desc: 'A floating orb of light follows you for 45 s. Works in a blackout.' },
  heal: { id: 'heal', name: 'Heal', say: { en: 'HEAL', tr: 'ŞİFA' }, words: { en: ['heal', 'heals'], tr: ['şifa', 'sifa', 'hil'] },
    mana: 35, cd: 25, tier: 'uncommon', color: 0x7dff9a, desc: 'Heals you and every crewmate within 8 m.' },
  pull: { id: 'pull', name: 'Pull', say: { en: 'PULL', tr: 'ÇEK' }, words: { en: ['pull', 'pulled'], tr: ['çek', 'cek', 'pul'] },
    mana: 12, cd: 3, tier: 'rare', color: 0xc79bff, desc: 'Yanks the loose item you look at into your arms (up to 18 m).' },
  hush: { id: 'hush', name: 'Hush', say: { en: 'HUSH', tr: 'SUS' }, words: { en: ['hush', 'shush'], tr: ['sus'] },
    mana: 25, cd: 22, tier: 'rare', color: 0x9a7dff, dur: 8, desc: 'Silence bubble: for 8 s creatures cannot hear you (steps, voice, noise).' },
  blink: { id: 'blink', name: 'Blink', say: { en: 'BLINK', tr: 'SIÇRA' }, words: { en: ['blink', 'blinks'], tr: ['sıçra', 'sicra', 'sichra'] },
    mana: 20, cd: 6, tier: 'epic', color: 0x5ae0ff, desc: 'Teleport up to 7 m forward. Never through walls.' },
  shield: { id: 'shield', name: 'Shield', say: { en: 'SHIELD', tr: 'KALKAN' }, words: { en: ['shield', 'shields'], tr: ['kalkan', 'şild'] },
    mana: 30, cd: 30, tier: 'epic', color: 0x66b3ff, dur: 10, desc: 'Absorbs up to 45 damage for 10 s (not instant kills).' },
  fire: { id: 'fire', name: 'Fireball', say: { en: 'FIRE', tr: 'ATEŞ' }, words: { en: ['fire', 'fireball'], tr: ['ateş', 'ates'] },
    mana: 40, cd: 10, tier: 'legendary', color: 0xff7a2a, desc: 'A fireball that bursts on impact and sets creatures on fire.' },
};
export const SPELL_ORDER = ['push', 'lumen', 'heal', 'pull', 'hush', 'blink', 'shield', 'fire'];
for (const sp of Object.values(SPELLS)) sp.tierName = sp.tier ? TIERS[sp.tier]?.name || sp.tier : 'Known';

export const BASE_MANA = 100, BASE_REGEN = 2.5;   // mana / s
const LEX = buildLexicon(Object.values(SPELLS));
const DEFAULT_KNOWN = ['push'];

// ------------------------------------------------------------------ skillbooks (registered at import: chests / shops spawn by id)
const BOOK_VALUE = { uncommon: [40, 60], rare: [70, 100], epic: [115, 150], legendary: [200, 240] };
export const SKILLBOOK_IDS = [];
for (const id of SPELL_ORDER) {
  const sp = SPELLS[id];
  if (!sp.tier) continue;
  const bid = 'skillbook_' + id;
  SKILLBOOK_IDS.push(bid);
  if (!ITEMS[bid]) registerItem({ id: bid, name: 'Skillbook: ' + sp.name, kind: 'skillbook', tier: sp.tier, spell: id, value: BOOK_VALUE[sp.tier], weight: 2, hands: 1 });
}
const bookModel = (id, i) => (T) => createSkillbookModel(T, { cover: TIERS[SPELLS[id].tier]?.hex ?? 0x6a3fb0, rune: SPELLS[id].color, glyph: i });
function registerBookModels(mm) {
  const map = mm?.itemModels;
  if (!map) return;
  SPELL_ORDER.forEach((id, i) => { const bid = 'skillbook_' + id; if (SPELLS[id].tier && !map.has(bid)) map.set(bid, bookModel(id, i)); });
}
if (typeof window !== 'undefined') registerBookModels(window.__kefalMods);

addTranslations({
  Push: 'İtme', Lumen: 'Işık', Heal: 'Şifa', Pull: 'Çekme', Hush: 'Sessizlik', Blink: 'Sıçrama', Shield: 'Kalkan', Fireball: 'Ateş Topu',
  'Skillbook: Lumen': 'Büyü Kitabı: Işık', 'Skillbook: Heal': 'Büyü Kitabı: Şifa', 'Skillbook: Pull': 'Büyü Kitabı: Çekme', 'Skillbook: Hush': 'Büyü Kitabı: Sessizlik',
  'Skillbook: Blink': 'Büyü Kitabı: Sıçrama', 'Skillbook: Shield': 'Büyü Kitabı: Kalkan', 'Skillbook: Fireball': 'Büyü Kitabı: Ateş Topu',
  'Cone of force: knocks creatures back, flings loose items, shoves crewmates.': 'Güç konisi: yaratıkları geri iter, eşyaları fırlatır, ekip arkadaşlarını savurur.',
  'A floating orb of light follows you for 45 s. Works in a blackout.': 'Yüzen bir ışık küresi 45 sn seni takip eder. Elektrik kesikken de çalışır.',
  'Heals you and every crewmate within 8 m.': 'Seni ve 8 m içindeki tüm ekip arkadaşlarını iyileştirir.',
  'Yanks the loose item you look at into your arms (up to 18 m).': 'Baktığın serbest eşyayı kucağına çeker (18 m\'ye kadar).',
  'Silence bubble: for 8 s creatures cannot hear you (steps, voice, noise).': 'Sessizlik balonu: 8 sn yaratıklar seni duyamaz (adım, ses, gürültü).',
  'Teleport up to 7 m forward. Never through walls.': '7 m ileri ışınlan. Duvarların içinden asla.',
  'Absorbs up to 45 damage for 10 s (not instant kills).': '10 sn boyunca 45 hasara kadar emer (anında ölümleri değil).',
  'A fireball that bursts on impact and sets creatures on fire.': 'Çarpınca patlayan ve yaratıkları tutuşturan bir ateş topu.',
  'NEW SPELL LEARNED': 'YENİ BÜYÜ ÖĞRENİLDİ', Say: 'Söyle', 'or type it in chat': 'ya da sohbete yaz', mana: 'mana', 'ready in': 'hazır:',
  'Learn it from a skillbook': 'Bir büyü kitabından öğren', Known: 'Bilinen', 'Voice spells': 'Sesli büyüler',
  'hold V and say a spell word (Chrome / Edge)': 'V\'ye basılı tut ve büyü kelimesini söyle (Chrome / Edge)',
  'Not enough mana.': 'Yeterli mana yok.', 'Nothing to pull there.': 'Orada çekilecek bir şey yok.', 'No room to blink.': 'Sıçrayacak yer yok.',
  'You already know this spell. Sell the book or give it to a crewmate.': 'Bu büyüyü zaten biliyorsun. Kitabı sat ya da bir ekip arkadaşına ver.',
  "You don't know that spell yet. Find its skillbook.": 'Bu büyüyü henüz bilmiyorsun. Kitabını bul.',
  'Hold V and SAY the word · or type it in chat · release C to cast': 'V\'ye basılı tut ve kelimeyi SÖYLE · ya da sohbete yaz · C\'yi bırakınca atılır',
  'Voice spells are not supported in this browser (use Chrome / Edge). Type the spell word in chat or hold C.': 'Sesli büyüler bu tarayıcıda desteklenmiyor (Chrome / Edge kullan). Büyü kelimesini sohbete yaz ya da C\'ye basılı tut.',
  'Voice spells need your microphone: turn it on in Settings > Voice.': 'Sesli büyüler için mikrofon gerekli: Ayarlar > Ses bölümünden aç.',
  'Voice spells: OFF (Settings > Voice) · type the word in chat': 'Sesli büyüler: KAPALI (Ayarlar > Ses) · kelimeyi sohbete yaz',
  'Your shield broke!': 'Kalkanın kırıldı!', 'Shield up.': 'Kalkan aktif.', 'Silence...': 'Sessizlik...', 'You feel the Algorithm stop listening.': 'Algoritma seni dinlemeyi bıraktı.',
});

// ------------------------------------------------------------------ procedural spell sounds (no samples)
function mkNoise(seed) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2147483648 - 1; }; }
function render(sr, dur, seed, fn) {
  const n = Math.max(1, Math.floor(dur * sr));
  const out = new Float32Array(n);
  const st = { ph: 0, ph2: 0, lp: 0, lp2: 0, rnd: mkNoise(seed), dt: 1 / sr };
  let peak = 1e-6;
  for (let i = 0; i < n; i++) { const v = fn(i / sr, st); out[i] = v; if (Math.abs(v) > peak) peak = Math.abs(v); }
  const g = 0.9 / peak, fade = Math.floor(sr * 0.006);
  for (let i = 0; i < n; i++) out[i] *= g * Math.min(1, i / fade, (n - 1 - i) / fade);
  return out;
}
const TAU = Math.PI * 2;
const SOUNDS = {
  spell_push: (sr) => render(sr, 0.6, 11, (t, s) => {
    s.ph += (48 + 150 * Math.exp(-t * 14)) * s.dt;
    const thump = Math.sin(TAU * s.ph) * Math.exp(-t * 7);
    s.lp += (s.rnd() - s.lp) * (0.05 + 0.4 * Math.exp(-t * 5));
    return thump + s.lp * 2.2 * (t < 0.04 ? t / 0.04 : Math.exp(-(t - 0.04) * 5.5));
  }),
  spell_cast: (sr) => render(sr, 0.9, 12, (t, s) => {
    const env = Math.min(1, t / 0.03) * Math.exp(-t * 3.6), vib = 1 + 0.01 * Math.sin(TAU * 6 * t);
    s.lp += (s.rnd() - s.lp) * 0.3;
    return env * (Math.sin(TAU * 880 * vib * t) + 0.6 * Math.sin(TAU * 1320 * vib * t) + 0.35 * Math.sin(TAU * 1760 * t)) + (s.rnd() - s.lp) * 0.25 * Math.exp(-t * 7);
  }),
  spell_heal: (sr) => render(sr, 1.1, 13, (t) => {
    let v = 0;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, k) => { const u = t - k * 0.085; if (u > 0) v += Math.exp(-u * 4) * (Math.sin(TAU * f * u) + 0.3 * Math.sin(TAU * 2 * f * u)); });
    return v;
  }),
  spell_blink: (sr) => render(sr, 0.38, 14, (t, s) => {
    const u = t / 0.38;
    s.ph += (260 + 2600 * u * u) * s.dt;
    return Math.sin(TAU * s.ph + 2.2 * Math.sin(TAU * s.ph * 0.5)) * Math.sin(Math.PI * u) + s.rnd() * 0.5 * Math.max(0, u - 0.75) * 4 * (1 - u);
  }),
  spell_shield: (sr) => render(sr, 0.85, 15, (t, s) => {
    s.ph += (110 + 110 * Math.min(1, t / 0.5)) * s.dt;
    let saw = 0; for (let h = 1; h <= 5; h++) saw += Math.sin(TAU * s.ph * h) / h;
    const env = Math.min(1, t / 0.05) * (t < 0.55 ? 1 : Math.exp(-(t - 0.55) * 9));
    return env * (saw * 0.6 + 0.35 * Math.sin(TAU * 1760 * t) * (0.5 + 0.5 * Math.sin(TAU * 11 * t)));
  }),
  spell_shieldhit: (sr) => render(sr, 0.35, 16, (t) => Math.exp(-t * 12) * (Math.sin(TAU * 1210 * t) + 0.7 * Math.sin(TAU * 1873 * t) + 0.4 * Math.sin(TAU * 2651 * t))),
  spell_pull: (sr) => render(sr, 0.5, 17, (t, s) => {
    const u = t / 0.5;
    s.lp += (s.rnd() - s.lp) * (0.04 + 0.3 * u);
    s.ph += (900 - 600 * u) * s.dt;
    return s.lp * 2.4 * u * u * (u > 0.92 ? (1 - u) / 0.08 : 1) + 0.4 * Math.sin(TAU * s.ph) * Math.sin(Math.PI * u);
  }),
  spell_hush: (sr) => render(sr, 1.0, 18, (t, s) => {
    const n = s.rnd();
    s.lp += (n - s.lp) * 0.45;
    return (n - s.lp) * Math.min(1, t / 0.06) * Math.exp(-t * 3.2) + 0.25 * Math.sin(TAU * 70 * t) * Math.exp(-t * 2);
  }),
  spell_fire: (sr) => render(sr, 0.6, 19, (t, s) => {
    s.lp += (s.rnd() - s.lp) * 0.12;
    s.ph += (95 - 40 * t) * s.dt;
    const crack = s.rnd() > 0.985 ? s.rnd() * 1.5 : 0;
    return s.lp * 2.5 * Math.min(1, t / 0.03) * Math.exp(-t * 3.5) + 0.6 * Math.sin(TAU * s.ph) * Math.exp(-t * 5) + crack * Math.exp(-t * 2);
  }),
  spell_fizzle: (sr) => render(sr, 0.28, 20, (t, s) => { s.ph += (420 - 1000 * t) * s.dt; return Math.sign(Math.sin(TAU * s.ph)) * 0.5 * Math.exp(-t * 9) + s.rnd() * 0.15 * Math.exp(-t * 14); }),
  spell_slam: (sr) => render(sr, 0.45, 21, (t, s) => { s.ph += (70 - 50 * Math.min(1, t * 3)) * s.dt; s.lp += (s.rnd() - s.lp) * 0.2; return Math.sin(TAU * s.ph) * Math.exp(-t * 9) + s.lp * 1.6 * Math.exp(-t * 18); }),
  spell_learn: (sr) => render(sr, 1.9, 22, (t) => {
    let v = 0;
    [392, 523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, k) => { const u = t - k * 0.11; if (u > 0) v += Math.exp(-u * 2.2) * (Math.sin(TAU * f * u) + 0.25 * Math.sin(TAU * 3 * f * u)) * 0.7; });
    return v + (t > 0.6 ? 0.35 * Math.exp(-(t - 0.6) * 1.8) * (Math.sin(TAU * 523.25 * t) + Math.sin(TAU * 659.25 * t) + Math.sin(TAU * 783.99 * t)) * (0.6 + 0.4 * Math.sin(TAU * 5 * t)) : 0);
  }),
};

// particle presets
const PFX = {
  push: { count: 34, color: [0x9fd4ff, 0xffffff, 0x5ab8ff], speed: 7, up: 0.4, life: 0.5, size: 0.06, gravity: 0, drag: 3.2 },
  heal: { count: 26, color: [0x7dff9a, 0xd8ffe0, 0x3adf6a], speed: 1.3, up: 2.6, life: 1.1, size: 0.06, gravity: -2.2, drag: 2 },
  blink: { count: 30, color: [0x5ae0ff, 0xffffff, 0x2a8aff], speed: 3.2, up: 1.2, life: 0.6, size: 0.06, gravity: -1, drag: 2.5 },
  pull: { count: 16, color: [0xc79bff, 0xffffff, 0x7a4aff], speed: 2, up: 1, life: 0.5, size: 0.05, gravity: 0, drag: 3 },
  hush: { count: 22, color: [0x2a1040, 0x6a4aa0, 0x9a7dff], speed: 2.4, up: 0.6, life: 0.9, size: 0.09, gravity: -0.5, drag: 3 },
  fire: { count: 5, color: [0xff6a20, 0xffb040, 0xffe08a, 0x802010], speed: 1.1, up: 2.2, life: 0.5, size: 0.08, gravity: -3, drag: 2 },
  boom: { count: 44, color: [0xff6a20, 0xffb040, 0xffe08a, 0x401008], speed: 7, up: 3, life: 0.9, size: 0.11, gravity: 4, drag: 1.6 },
  shield: { count: 20, color: [0x66b3ff, 0xdff4ff], speed: 2.6, up: 1, life: 0.5, size: 0.05, gravity: 0, drag: 3 },
  learn: { count: 60, color: [0xffffff, 0xbfe4ff, 0xffe08a], speed: 3, up: 3.5, life: 1.4, size: 0.06, gravity: -1.5, drag: 1.5 },
  slam: { count: 14, color: [0x8a7a66, 0x6a5e50, 0xa89880], speed: 2.4, up: 1.2, life: 0.7, size: 0.1, gravity: 2, drag: 3 },
};

const IMMUNE = new Set(['sandkefal', 'giant', 'web', 'mimicdoor', 'turret', 'mine']);
const V = () => new THREE.Vector3();
const arr3 = (v) => [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)];
const fin3 = (a) => (Array.isArray(a) && a.length >= 3 && a.every(Number.isFinite) ? new THREE.Vector3(a[0], a[1], a[2]) : null);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// ------------------------------------------------------------------ install
export function installMagic(game) {
  const S = {
    mana: BASE_MANA, cds: new Map(), shieldHp: 0, shieldMax: 0, shieldT: 0, hushT: 0,
    lumens: new Map(), bubbles: new Map(), projs: new Map(), burnFx: new Map(), anims: [],
    // host state
    hPush: [], hProj: [], hBurn: new Map(), hHush: new Map(), hBudget: new Map(),
    offs: [], disposed: false, wheelOpen: false, voiceHeld: false, voiceWarned: false, castIn: new Map(),
    warpT: 0, warpSet: 0, burnAcc: 0,
  };
  const scene = game.scene, audio = game.audio;
  const on = (ev, fn) => { const off = game.mods?.on?.(ev, fn); if (off) S.offs.push(off); };
  registerBookModels(game.mods);
  for (const [name, gen] of Object.entries(SOUNDS)) { try { game.mods?.api?.registerSound?.(name, gen); } catch { /* optional */ } }

  // ---- soft interfaces
  const bonus = (k) => { try { const v = Number(game.rpg?.bonus?.(k)); return Number.isFinite(v) ? v : 0; } catch { return 0; } };
  const maxMana = () => BASE_MANA + Math.max(-50, bonus('maxMana'));
  const power = () => 1 + clamp(bonus('spellPower'), 0, 1.5);
  const profile = () => game.profile;
  const knows = (id) => DEFAULT_KNOWN.includes(id) || (Array.isArray(profile()?.spells) && profile().spells.includes(id));
  const cooldownOf = (id) => (SPELLS[id]?.cd || 0) * (1 - clamp(bonus('cooldown'), 0, 0.5));
  const costOf = (id) => SPELLS[id]?.mana || 0;
  const cooldownLeft = (id) => Math.max(0, (S.cds.get(id) || 0) - game.time);
  const cooldownFrac = (id) => { const l = cooldownLeft(id); return l > 0 ? clamp(l / Math.max(0.01, cooldownOf(id)), 0, 1) : 0; };
  const sayWord = (id) => (getLang() === 'tr' ? SPELLS[id].say.tr : SPELLS[id].say.en);

  // ---- audio
  function ensureSound(name) {
    if (!audio?.ctx || audio.buffers?.has(name) || !SOUNDS[name]) return;
    try {
      const data = SOUNDS[name](audio.ctx.sampleRate);
      const buf = audio.ctx.createBuffer(1, data.length, audio.ctx.sampleRate);
      buf.copyToChannel(data, 0);
      audio.buffers.set(name, buf);
    } catch (e) { console.warn('magic sound', name, e); audio.buffers?.set(name, null); }
  }
  const sfx = (name, vol = 0.8, pitch) => { ensureSound(name); return audio?.play?.(name, { volume: vol, bus: 'sfx', pitch }); };
  const sfxAt = (name, pos, vol = 0.9, ref = 3) => { ensureSound(name); return audio?.at?.(name, pos, vol, { occlude: true, refDistance: ref, maxDistance: 60 }); };

  // ---- small VFX toolkit (meshes are unlit / additive: no scene lights are ever added)
  function anim(dur, upd, end) { S.anims.push({ t: 0, dur, upd, end }); }
  function addMesh(geo, color, opacity = 0.6, extra = {}) {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, ...extra }));
    m.frustumCulled = false;
    scene.add(m);
    return m;
  }
  const killMesh = (m) => { if (!m) return; m.removeFromParent(); m.geometry?.dispose(); m.material?.dispose(); };
  // orient: true = flat on the floor, or a direction Vector3 the ring faces
  function ringFx(pos, color, r0, r1, dur, orient = true, inward = false) {
    const m = addMesh(new THREE.RingGeometry(0.85, 1, 40), color, 0.75);
    m.position.copy(pos);
    if (orient === true) m.rotation.x = -Math.PI / 2;
    else if (orient?.isVector3) m.lookAt(pos.clone().add(orient));
    anim(dur, (u) => { const e = inward ? 1 - u : 1 - Math.pow(1 - u, 2); m.scale.setScalar(r0 + (r1 - r0) * e); m.material.opacity = 0.75 * (1 - u); }, () => killMesh(m));
  }
  function coneFx(eye, dir, color, len = 6, rad = 3.2) {
    const geo = new THREE.ConeGeometry(1, 1, 20, 1, true);
    geo.translate(0, -0.5, 0); geo.rotateX(-Math.PI / 2);   // apex at origin, opening towards -Z
    const m = addMesh(geo, color, 0.35);
    m.position.copy(eye);
    m.lookAt(eye.clone().sub(dir));                            // -Z (the opening) points along dir
    anim(0.42, (u) => { const e = 1 - Math.pow(1 - u, 3); m.scale.set(rad * (0.2 + 0.8 * e), rad * (0.2 + 0.8 * e), len * (0.25 + 0.75 * e)); m.material.opacity = 0.35 * (1 - u); }, () => killMesh(m));
  }
  function beamFx(a, b, color, dur = 0.45) {
    const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
    const l = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    l.frustumCulled = false; scene.add(l);
    anim(dur, (u) => { l.material.opacity = 0.9 * (1 - u); }, () => { l.removeFromParent(); geo.dispose(); l.material.dispose(); });
  }
  const burst = (pos, preset, dir, mul) => game.particles?.burst(pos, PFX[preset] || preset, dir || null, mul || 1);
  const shakeBy = (pos, amt, range = 16) => { const d = pos.distanceTo(game.camera.position); if (d < range) game.engine.shake(amt * (1 - d / range)); };
  function warp(amount) {
    const fx = game.engine.fx;
    if (!fx || (fx.warp && fx.warp !== S.warpSet)) return;   // someone else (hype inhaler) owns the warp
    S.warpT = amount; fx.warp = amount; S.warpSet = amount;
  }
  const casterHead = (id) => game.playerHeadById?.(id) || null;

  // ---- HUD (created once the api object exists, see the end of installMagic)
  let dock = null, wheel = null;
  const toast = (text, kind = 'info') => game.ui?.toast?.(t(text), kind);

  // ================================================================== casting (local)
  function fizzle(msg, reason) {
    sfx('spell_fizzle', 0.5);
    if (msg) toast(msg, 'bad');
    return { ok: false, reason };
  }
  function eyeDir() {
    const cam = game.camera;
    return { eye: cam.position.clone(), dir: new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion).normalize() };
  }

  function cast(id, opts = {}) {
    const source = opts.source || 'key';
    const sp = SPELLS[id];
    if (!sp) return { ok: false, reason: 'unknown' };
    if (!knows(id)) return fizzle("You don't know that spell yet. Find its skillbook.", 'not-known');
    const p = game.player;
    if (!game.net || !game.run || !p || p.dead || S.disposed) return { ok: false, reason: 'unavailable' };
    const cdl = cooldownLeft(id);
    if (cdl > 0) { if (source !== 'voice') sfx('spell_fizzle', 0.3); dock?.note(`${t(sp.name)}: ${cdl.toFixed(1)}s`); return { ok: false, reason: 'cooldown', left: cdl }; }
    const cost = costOf(id);
    if (S.mana < cost) { dock?.lowMana(); return fizzle('Not enough mana.', 'mana'); }
    const { eye, dir } = eyeDir();
    const pw = power();
    const fx = { k: 'spell', s: id, c: game.selfId, p: arr3(eye), d: [+dir.x.toFixed(3), +dir.y.toFixed(3), +dir.z.toFixed(3)], pw: +pw.toFixed(2), src: source[0], w: String(opts.word || sayWord(id)).slice(0, 16) };
    // spell-specific preparation (may fizzle before any mana is spent)
    if (id === 'blink') {
      const to = blinkTarget(p, dir);
      if (!to) return fizzle('No room to blink.', 'blocked');
      fx.q = arr3(to); fx.p = arr3(p.pos);
      p.teleport(to);
      game.psTimer = 0;
    } else if (id === 'pull') {
      const it = pullTarget(eye, dir);
      if (!it) return fizzle('Nothing to pull there.', 'no-target');
      fx.it = it.id;
      const fwdH = new THREE.Vector3(dir.x, 0, dir.z).normalize();
      fx.to = arr3(p.pos.clone().addScaledVector(fwdH, 1.3).add(new THREE.Vector3(0, 1.0, 0)));
    } else if (id === 'heal') {
      fx.amt = Math.round(30 * pw);
      healSelf(fx.amt, null);
    } else if (id === 'shield') {
      fx.dur = sp.dur;
      S.shieldMax = S.shieldHp = Math.round(45 * pw); S.shieldT = sp.dur;
      toast('Shield up.', 'good');
    } else if (id === 'hush') {
      fx.dur = sp.dur; S.hushT = sp.dur;
      toast('Silence...', 'info');
    } else if (id === 'lumen') {
      fx.dur = sp.dur;
    } else if (id === 'fire') {
      fx.f = Math.random().toString(36).slice(2, 9);
    }
    S.mana -= cost;
    S.cds.set(id, game.time + cooldownOf(id));
    game.swingAnim = Math.max(game.swingAnim || 0, 0.7);   // arm gesture (also replicated to the avatar)
    applyFx(fx, true);
    game.net.request('spell', fx);
    castNoise(source, eye);
    dock?.popCast(id, fx.w.toUpperCase());
    try { game.mods?.emit?.('tfg:spell', { id, caster: game.selfId, source }); } catch { /* listeners are optional */ }
    return { ok: true };
  }

  // speaking a spell makes noise (shouting attracts creatures); typing it is a whisper
  function castNoise(source, eye) {
    if (S.hushT > 0) return;
    const lvl = game.voice?.localLevel || 0;
    const loud = source === 'voice' ? clamp(1.1 + lvl * 2.2, 1.1, 3.2) : source === 'chat' ? 0.25 : 0.6;
    const pos = game.player.pos.clone().setY(eye.y);
    try {
      if (game.balance?.noise) game.balance.noise(pos, loud);
      else game.net.request('noise', { p: arr3(pos), loud });
    } catch { /* optional */ }
  }

  // ---- targets
  function blinkTarget(p, dir) {
    const ph = game.physics;
    const h = new THREE.Vector3(dir.x, 0, dir.z);
    if (h.lengthSq() < 1e-4) return null;
    h.normalize();
    const MAX = 7, R = 0.55;
    let dist = MAX;
    for (const y of [0.35, 0.95, 1.6]) {
      const hit = ph.raycast({ x: p.pos.x, y: p.pos.y + y, z: p.pos.z }, h, MAX + R, G.STATIC | G.DOOR);
      if (hit) dist = Math.min(dist, hit.distance - R);
    }
    const nav = p.indoor ? game.world.facility?.nav : null;
    const lim = game.world.terrain?.playHalf;
    for (let d = dist; d >= 1.2; d -= 0.4) {
      const x = p.pos.x + h.x * d, z = p.pos.z + h.z * d;
      if (nav && !nav.walkableAt(x, z)) continue;
      if (!p.indoor && lim && (Math.abs(x) > lim || Math.abs(z) > lim)) continue;
      const down = ph.raycast({ x, y: p.pos.y + 1.4, z }, { x: 0, y: -1, z: 0 }, 4.2, G.STATIC | G.DOOR);
      if (!down) continue;
      const gy = down.point.y;
      if (gy > p.pos.y + 1.0 || gy < p.pos.y - 2.6) continue;   // no ledge-hopping, no pits
      const up = ph.raycast({ x, y: gy + 0.1, z }, { x: 0, y: 1, z: 0 }, 1.75, G.STATIC | G.DOOR);
      if (up) continue;                                           // no headroom
      return new THREE.Vector3(x, gy + 0.03, z);
    }
    return null;
  }
  function pullTarget(eye, dir) {
    let best = null, bestScore = -1;
    const tmp = V();
    for (const it of game.items.all()) {
      if (it.state !== 'world' || !it.body || it.ladder || it.carrier || it.holder) continue;
      it.obj.getWorldPosition(tmp);
      const to = tmp.clone().sub(eye);
      const d = to.length();
      if (d > 18 || d < 0.8) continue;
      const dot = to.divideScalar(d).dot(dir);
      if (dot < 0.9) continue;
      if (!game.physics.lineOfSight(eye, tmp, G.STATIC | G.DOOR)) continue;
      const score = dot * 2 - d / 18;
      if (score > bestScore) { bestScore = score; best = it; }
    }
    return best;
  }

  // ================================================================== per-peer effects of a cast (all peers)
  function applyFx(d, local) {
    const sp = SPELLS[d.s];
    const p = fin3(d.p);
    const dir = fin3(d.d)?.normalize() || null;
    switch (d.s) {
      case 'push': {
        if (!p || !dir) break;
        coneFx(p.clone().addScaledVector(dir, 0.4), dir, sp.color, 6.5, 3.2);
        burst(p.clone().addScaledVector(dir, 0.9), 'push', dir, 1);
        ringFx(p.clone().addScaledVector(dir, 1.2), sp.color, 0.3, 2.6, 0.35, dir);
        if (local) {
          sfx('spell_push', 0.95);
          game.engine.punch?.(0.035, 0, 0); game.engine.shake(0.22); game.engine.flash(sp.color, 0.12);
        } else sfxAt('spell_push', p, 1, 4);
        pushItems(p, dir, clamp(Number(d.pw) || 1, 1, 2.5));
        if (!local) pushMe(p, dir, clamp(Number(d.pw) || 1, 1, 2.5), d.c);
        break;
      }
      case 'lumen': startLumen(d.c, clamp(Number(d.dur) || 45, 1, 90)); if (local) { sfx('spell_cast', 0.8); game.engine.flash(sp.color, 0.15); } else if (p) sfxAt('spell_cast', p, 0.8); break;
      case 'heal': {
        const at = p ? p.clone().setY(p.y - 1.5) : game.player.pos.clone();
        ringFx(at.clone().setY(at.y + 0.08), sp.color, 0.4, 8, 0.8);
        burst(at.clone().setY(at.y + 0.6), 'heal', null, 1.4);
        if (local) { sfx('spell_heal', 0.9); game.engine.flash(sp.color, 0.18); } else {
          if (p) sfxAt('spell_heal', p, 0.9);
          const me = game.player;
          if (p && !me.dead && me.pos.distanceTo(at) < 8.5) healSelf(clamp(Number(d.amt) || 30, 0, 80), d.c);
        }
        break;
      }
      case 'blink': {
        const a = p, b = fin3(d.q);
        if (!a || !b) break;
        burst(a.clone().setY(a.y + 1), 'blink', null, 1.2);
        burst(b.clone().setY(b.y + 1), 'blink', null, 1.2);
        beamFx(a.clone().setY(a.y + 1), b.clone().setY(b.y + 1), sp.color, 0.35);
        ringFx(b.clone().setY(b.y + 0.06), sp.color, 0.2, 2.2, 0.4);
        if (local) { sfx('spell_blink', 0.9); game.engine.flash(sp.color, 0.28); game.engine.punch?.(-0.02, 0, 0); warp(0.9); } else { sfxAt('spell_blink', a, 0.8); sfxAt('spell_blink', b, 0.9); }
        break;
      }
      case 'shield':
        if (local) { sfx('spell_shield', 0.85); game.engine.flash(sp.color, 0.2); burst(game.player.eyePos(), 'shield', null, 1); } else { startBubble(d.c, clamp(Number(d.dur) || 10, 1, 30)); if (p) sfxAt('spell_shield', p, 0.8); }
        break;
      case 'shieldoff': stopBubble(d.c, true); break;
      case 'pull': {
        const it = game.items.get(d.it);
        const to = fin3(d.to);
        if (!it || !to) break;
        const ip = it.obj.getWorldPosition(V());
        const hand = p ? p.clone().setY(p.y - 0.3) : to;
        beamFx(hand, ip, sp.color, 0.5);
        burst(ip, 'pull', null, 1);
        if (local) { sfx('spell_pull', 0.9); game.engine.punch?.(-0.02, 0, 0); } else sfxAt('spell_pull', ip, 0.9);
        pullItem(it, to);
        break;
      }
      case 'hush': {
        const at = p ? p.clone().setY(p.y - 1.5) : game.player.pos.clone();
        ringFx(at.clone().setY(at.y + 0.08), sp.color, 5, 0.3, 0.9, true, true);
        burst(at.clone().setY(at.y + 1), 'hush', null, 1);
        if (local) { sfx('spell_hush', 0.9); game.engine.flash(0x2a1040, 0.3); } else if (p) sfxAt('spell_hush', p, 0.7);
        break;
      }
      case 'fire': spawnFireball(d, local); if (local) { sfx('spell_fire', 0.95); game.engine.punch?.(0.05, 0, 0); game.engine.shake(0.18); game.engine.flash(sp.color, 0.14); } else if (p) sfxAt('spell_fire', p, 1); break;
      case 'fireboom': fireboom(d); break;
      case 'burn': if (typeof d.cid === 'string') S.burnFx.set(d.cid, game.time + clamp(Number(d.t) || 3, 0, 8)); break;
      case 'slam': if (p) { burst(p, 'slam', null, 1); sfxAt('spell_slam', p, 1, 4); shakeBy(p, 0.25, 12); } break;
      default: break;
    }
    // everyone else sees the incantation over the caster's head
    if (!local && sp && d.c && d.c !== game.selfId) {
      const head = casterHead(d.c);
      if (head) game.ui?.hud?.floatText?.(head.clone().setY(head.y + 0.5), '✦ ' + String(d.w || sp.say.en).slice(0, 16).toUpperCase() + '!', '#' + sp.color.toString(16).padStart(6, '0'), true);
    }
  }

  // PUSH: loose items this peer simulates, and this peer's own player (never the caster)
  function pushItems(eye, dir, pw) {
    const tmp = V();
    for (const it of game.items.all()) {
      if (it.state !== 'world' || !it.body || it.ladder || !it.isSimulatedHere()) continue;
      it.obj.getWorldPosition(tmp);
      const to = tmp.clone().sub(eye);
      const d = to.length();
      if (d > 7.5 || d < 0.05) continue;
      if (to.divideScalar(d).dot(dir) < 0.6) continue;
      if (!game.physics.lineOfSight(eye, tmp, G.STATIC | G.DOOR)) continue;
      const mass = it.def.mass ?? Math.max(0.5, (it.def.weight || 5) * 0.2);
      const dv = (11 * pw * (1 - 0.45 * d / 7.5)) / Math.max(1, Math.sqrt(mass / 2));
      const v = it.body.linvel();
      it.body.setLinvel({ x: v.x + dir.x * dv, y: Math.max(v.y, 0) + dv * 0.35 + dir.y * dv * 0.5, z: v.z + dir.z * dv }, true);
      it.body.setAngvel({ x: (Math.random() - 0.5) * 6, y: (Math.random() - 0.5) * 6, z: (Math.random() - 0.5) * 6 }, true);
      it.impactCooldown = Math.max(it.impactCooldown || 0, 0.25);
    }
  }
  function pushMe(eye, dir, pw, casterId) {
    const me = game.player;
    if (me.dead || casterId === game.selfId) return;
    const chest = me.pos.clone().setY(me.pos.y + 1.0);
    const to = chest.clone().sub(eye);
    const d = to.length();
    if (d > 6.5 || to.divideScalar(Math.max(d, 1e-3)).dot(dir) < 0.6) return;
    if (!game.physics.lineOfSight(eye, chest, G.STATIC | G.DOOR)) return;
    const h = new THREE.Vector3(dir.x, 0, dir.z).normalize();
    const k = 11 * pw * (1 - 0.4 * d / 6.5);
    me.vel.x += h.x * k; me.vel.z += h.z * k; me.vel.y = Math.max(me.vel.y, 4.2);
    me.grounded = false;
    game.engine.shake(0.35); game.engine.punch?.(0.04, (Math.random() - 0.5) * 0.04, 0.03);
  }
  function healSelf(amt, fromId) {
    const me = game.player;
    if (me.dead || amt <= 0) return;
    const before = me.hp;
    me.hp = Math.min(me.maxHp, me.hp + amt);
    const got = Math.round(me.hp - before);
    game.net?.send?.('pst', { hp: Math.round(me.hp) });
    if (fromId) { game.engine.flash(SPELLS.heal.color, 0.2); game.ui?.toast?.(`✦ ${game.playerName(fromId)}: ${t('Heal')} +${got}`, 'good'); }
  }
  function pullItem(it, to) {
    if (!it.body || it.state !== 'world' || it.ladder || !it.isSimulatedHere()) return;
    const from = it.obj.getWorldPosition(V());
    const dist = from.distanceTo(to);
    const T = clamp(dist / 11, 0.45, 1.0);
    const heavy = (it.def.weight || 0) > 60 ? 0.6 : 1;
    const v = to.clone().sub(from).divideScalar(T).multiplyScalar(heavy);
    v.y += 9.8 * T * heavy;
    it.body.setLinvel({ x: v.x, y: v.y, z: v.z }, true);
    it.body.setAngvel({ x: (Math.random() - 0.5) * 3, y: (Math.random() - 0.5) * 3, z: (Math.random() - 0.5) * 3 }, true);
    it.impactCooldown = Math.max(it.impactCooldown || 0, T + 0.4);   // a pulled vase lands in your arms, not in pieces
  }

  // LUMEN orb (per caster, visible to everyone; the light is a LightPool emitter, never a new THREE light)
  function startLumen(casterId, dur) {
    let o = S.lumens.get(casterId);
    if (!o) {
      const core = addMesh(new THREE.SphereGeometry(0.11, 10, 8), 0xfff6d8, 1, { blending: THREE.NormalBlending, side: THREE.FrontSide });
      const glow = addMesh(new THREE.SphereGeometry(0.28, 10, 8), SPELLS.lumen.color, 0.22);
      const light = game.lights.add({ pos: V(), color: 0xe8f0ff, intensity: 1.6, distance: 14, group: 'magic' });
      o = { core, glow, light, pos: null, until: 0, t: 0 };
      S.lumens.set(casterId, o);
    }
    o.until = game.time + dur;
  }
  function stopLumen(id) {
    const o = S.lumens.get(id);
    if (!o) return;
    killMesh(o.core); killMesh(o.glow); game.lights.remove(o.light);
    S.lumens.delete(id);
  }
  function updateLumens(dt) {
    for (const [id, o] of S.lumens) {
      const left = o.until - game.time;
      const head = casterHead(id);
      if (left <= 0 || !head || (id !== game.selfId && !game.remotes.has(id))) { stopLumen(id); continue; }
      o.t += dt;
      let yaw;
      if (id === game.selfId) yaw = game.player.yaw; else yaw = game.remotes.get(id)?.yaw || 0;
      const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
      const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
      const want = head.clone().addScaledVector(right, 0.55).addScaledVector(fwd, 0.35).add(new THREE.Vector3(0, 0.35 + Math.sin(o.t * 2.1) * 0.08, 0));
      if (!o.pos) o.pos = want.clone(); else o.pos.lerp(want, Math.min(1, dt * 5));
      o.core.position.copy(o.pos); o.glow.position.copy(o.pos);
      o.light.pos.copy(o.pos);
      const fade = left < 3 ? (Math.random() < 0.25 ? 0.2 : 0.7) * (left / 3) + 0.1 : 1;
      o.light.intensity = 1.6 * fade;
      o.glow.material.opacity = 0.22 * fade * (0.85 + 0.15 * Math.sin(o.t * 7));
      o.glow.scale.setScalar(1 + 0.1 * Math.sin(o.t * 5));
    }
  }

  // SHIELD bubble around remote casters
  function startBubble(id, dur) {
    let b = S.bubbles.get(id);
    if (!b) {
      const m = addMesh(new THREE.IcosahedronGeometry(0.95, 1), SPELLS.shield.color, 0.28, { wireframe: true });
      const inner = addMesh(new THREE.SphereGeometry(0.9, 14, 10), SPELLS.shield.color, 0.08);
      b = { m, inner, until: 0, t: 0 };
      S.bubbles.set(id, b);
    }
    b.until = game.time + dur;
  }
  function stopBubble(id, pop) {
    const b = S.bubbles.get(id);
    if (!b) return;
    if (pop) { burst(b.m.position, 'shield', null, 1.4); sfxAt('spell_shieldhit', b.m.position, 0.9); }
    killMesh(b.m); killMesh(b.inner);
    S.bubbles.delete(id);
  }
  function updateBubbles(dt) {
    for (const [id, b] of S.bubbles) {
      const r = game.remotes.get(id);
      if (!r || r.dead || game.time > b.until) { stopBubble(id, false); continue; }
      b.t += dt;
      b.m.position.set(r.pos.x, r.pos.y + 1.0, r.pos.z); b.inner.position.copy(b.m.position);
      b.m.rotation.y += dt * 0.8;
      b.m.material.opacity = 0.2 + 0.1 * Math.sin(b.t * 6);
    }
  }

  // FIREBALL visuals (every peer flies its own copy; the host decides where it bursts)
  function spawnFireball(d) {
    const p = fin3(d.p), dir = fin3(d.d)?.normalize();
    if (!p || !dir || !d.f) return;
    const core = addMesh(new THREE.SphereGeometry(0.16, 10, 8), 0xffe08a, 1, { blending: THREE.NormalBlending, side: THREE.FrontSide });
    const glow = addMesh(new THREE.SphereGeometry(0.34, 10, 8), SPELLS.fire.color, 0.45);
    const light = game.lights.add({ pos: p.clone(), color: 0xff8a30, intensity: 2.2, distance: 9, group: 'magic' });
    S.projs.set(String(d.f), { core, glow, light, pos: p.clone().addScaledVector(dir, 0.6), vel: dir.clone().multiplyScalar(24), t: 0, stopped: false });
  }
  function killProj(fid) {
    const o = S.projs.get(fid);
    if (!o) return;
    killMesh(o.core); killMesh(o.glow); game.lights.remove(o.light);
    S.projs.delete(fid);
  }
  function updateProjs(dt) {
    for (const [fid, o] of S.projs) {
      o.t += dt;
      if (o.t > 3) { killProj(fid); continue; }
      if (o.stopped) continue;
      const step = o.vel.length() * dt;
      const dirN = o.vel.clone().normalize();
      const wall = game.physics.raycast(o.pos, dirN, step, G.STATIC | G.DOOR);
      const cr = game.creatures.raycast(o.pos, dirN, step);
      if (wall || cr || o.t > 2.2) {
        o.pos.addScaledVector(dirN, Math.min(step, wall ? wall.distance : step, cr ? cr.t : step));
        o.stopped = true; o.core.visible = false; o.glow.visible = false; o.light.intensity = 0;
        continue;
      }
      o.pos.addScaledVector(dirN, step);
      o.core.position.copy(o.pos); o.glow.position.copy(o.pos); o.light.pos.copy(o.pos);
      o.glow.scale.setScalar(1 + 0.2 * Math.sin(o.t * 30));
      burst(o.pos, 'fire', null, 1);
    }
  }
  function fireboom(d) {
    const p = fin3(d.p);
    if (d.f) killProj(String(d.f));
    if (!p) return;
    game.spawnExplosionFx?.(p);
    burst(p, 'boom', null, 1);
    ringFx(p, SPELLS.fire.color, 0.4, 4.2, 0.5, true);
    sfxAt('explosion', p, 1.1, 6);
    shakeBy(p, 0.9, 22);
    const dist = p.distanceTo(game.camera.position);
    if (dist < 14) game.engine.flash(0xffb060, clamp(0.5 - dist / 30, 0, 0.5));
    // blast wave: shove nearby loose items and this player a little (no crew damage)
    const me = game.player;
    if (!me.dead) {
      const to = me.pos.clone().setY(me.pos.y + 1).sub(p);
      const dd = to.length();
      if (dd < 3 && dd > 0.01) { to.setY(0).normalize(); me.vel.x += to.x * 6; me.vel.z += to.z * 6; me.vel.y = Math.max(me.vel.y, 3); me.grounded = false; }
    }
    const tmp = V();
    for (const it of game.items.all()) {
      if (it.state !== 'world' || !it.body || it.ladder || !it.isSimulatedHere()) continue;
      it.obj.getWorldPosition(tmp);
      const to = tmp.clone().sub(p); const dd = to.length();
      if (dd > 3.5 || dd < 0.01) continue;
      const k = 6 * (1 - dd / 3.5);
      to.normalize();
      const v = it.body.linvel();
      it.body.setLinvel({ x: v.x + to.x * k, y: v.y + 2 + to.y * k, z: v.z + to.z * k }, true);
    }
  }
  function updateBurnFx(dt) {
    S.burnAcc += dt;
    if (S.burnAcc < 0.1) return;
    S.burnAcc = 0;
    for (const [cid, until] of S.burnFx) {
      const v = game.creatures.views.get(cid);
      if (!v || v.state === 'dead' || game.time > until) { S.burnFx.delete(cid); continue; }
      const h = v.height || v.def?.height || 1.2;
      burst(v.pos.clone().setY(v.pos.y + h * 0.5), 'fire', null, 1.4);
    }
  }

  // ================================================================== host
  const posOf = (id) => (id === game.selfId ? game.player.pos : game.remotes.get(id)?.pos || null);
  function hostAllow(from, id) {
    const now = game.time;
    let b = S.hBudget.get(from);
    if (!b) { b = { m: 170, t: now, last: {} }; S.hBudget.set(from, b); }
    b.m = Math.min(170, b.m + (now - b.t) * 5); b.t = now;
    const sp = SPELLS[id];
    const cost = sp.mana * 0.6;
    if (b.m < cost) return false;
    if (now - (b.last[id] ?? -99) < sp.cd * 0.45) return false;   // loose: clock drift and the max -50% cooldown bonus still pass
    b.m -= cost; b.last[id] = now;
    return true;
  }
  function onHostSpell(d, from) {
    const sp = SPELLS[d?.s];
    if (!sp || !game.isHost) return;
    if (!hostAllow(from, d.s)) return;
    const base = posOf(from);
    let eye = fin3(d.p);
    if (base && (!eye || eye.distanceTo(base) > (d.s === 'blink' ? 12 : 6))) eye = base.clone().setY(base.y + 1.5);
    if (!eye) return;
    const dir = fin3(d.d);
    const pw = clamp(Number(d.pw) || 1, 1, 2.5);
    if (dir && dir.lengthSq() > 0.01) dir.normalize();
    if (d.s === 'push' && dir) hostPush(from, eye, dir, pw);
    else if (d.s === 'hush') S.hHush.set(from, game.time + sp.dur);
    else if (d.s === 'fire' && dir && d.f) S.hProj.push({ fid: String(d.f).slice(0, 12), pos: eye.clone().addScaledVector(dir, 0.6), vel: dir.clone().multiplyScalar(24), t: 0, from, pw });
    const out = { ...d, k: 'spell', c: from, p: arr3(eye) };
    delete out.a;
    game.net.broadcast('fx', out);
  }
  function pushable(c) {
    if (!c || c.dead || c.def?.boss || c.def?.hazard || IMMUNE.has(c.type)) return false;
    if (c.type === 'leech' && (c.state === 'ceiling' || c.extra)) return false;
    return true;
  }
  function hostPush(from, eye, dir, pw) {
    const h = new THREE.Vector3(dir.x, 0, dir.z);
    if (h.lengthSq() < 1e-4) h.set(0, 0, -1);
    h.normalize();
    const range = 7.5;
    for (const c of [...game.creatures.host.values()]) {
      if (!pushable(c)) continue;
      const hh = Math.min(c.def?.height || 1.2, 2.2);
      const cy = c.pos.y + hh * 0.5;
      const tx = c.pos.x - eye.x, tz = c.pos.z - eye.z;
      const dh = Math.hypot(tx, tz);
      if (dh > range + (c.def?.radius || 0.5) || Math.abs(cy - eye.y) > 3.5) continue;
      if (dh > 1.3 && (tx * h.x + tz * h.z) / dh < 0.72) continue;   // ~44 degree half-cone
      if (!game.physics.lineOfSight(eye, new THREE.Vector3(c.pos.x, cy, c.pos.z), G.STATIC | G.DOOR)) continue;
      const fall = 1 - 0.5 * Math.min(1, dh / range);
      const heavy = 1 / (0.55 + (c.def?.radius || 0.5));
      const sp = 17 * fall * pw * clamp(heavy, 0.6, 1.4);
      const ax = dh > 0.2 ? tx / dh : h.x, az = dh > 0.2 ? tz / dh : h.z;
      const nx = ax * 0.6 + h.x * 0.4, nz = az * 0.6 + h.z * 0.4, nl = Math.hypot(nx, nz) || 1;
      game.creatures.damage(c.id, Math.round(4 * pw), from, { stun: 1.1 });
      if (c.dead) continue;
      S.hPush = S.hPush.filter((q) => q.c !== c);
      S.hPush.push({ c, vx: (nx / nl) * sp, vz: (nz / nl) * sp, t: 0, from, pw, slam: false });
    }
  }
  function hostUpdatePush(dt) {
    if (!S.hPush.length) return;
    const lim = game.world.terrain?.playHalf;
    for (const ps of S.hPush) {
      const c = ps.c;
      if (c.dead || game.creatures.host.get(c.id) !== c) { ps.done = true; continue; }
      ps.t += dt;
      const sp = Math.hypot(ps.vx, ps.vz);
      if (sp < 0.4 || ps.t > 0.85) { ps.done = true; continue; }
      const step = sp * dt, ux = ps.vx / sp, uz = ps.vz / sp;
      const nx = c.pos.x + ux * step, nz = c.pos.z + uz * step;
      const r = c.def?.radius || 0.45;
      const cy = c.pos.y + Math.min(1.0, (c.def?.height || 1.2) * 0.5);
      const hit = game.physics.raycast({ x: c.pos.x, y: cy, z: c.pos.z }, { x: ux, y: 0, z: uz }, step + r, G.STATIC | G.DOOR);
      const nav = game.creatures.nav(c);
      const outOfMap = c.zone !== 'in' && lim && (Math.abs(nx) > lim || Math.abs(nz) > lim);
      if (hit || (nav && !nav.walkableAt(nx, nz)) || (c.zone === 'in' && !nav) || outOfMap) {
        if (!ps.slam && sp > 5) {
          ps.slam = true;
          game.creatures.damage(c.id, Math.round(10 * ps.pw), ps.from, { stun: 1.5 });   // slammed into a wall
          game.net.broadcast('fx', { k: 'spell', s: 'slam', p: [+c.pos.x.toFixed(2), +(cy).toFixed(2), +c.pos.z.toFixed(2)] });
        }
        ps.done = true;
        continue;
      }
      game.creatures.placeAt(c, nx, nz);
      c.path = null; c.dest = null; c.repath = 0;
      const k = Math.exp(-5 * dt);
      ps.vx *= k; ps.vz *= k;
    }
    S.hPush = S.hPush.filter((q) => !q.done);
  }
  function hostUpdateProj(dt) {
    if (!S.hProj.length) return;
    for (const pr of S.hProj) {
      pr.t += dt;
      const step = pr.vel.length() * dt;
      const dirN = pr.vel.clone().normalize();
      const wall = game.physics.raycast(pr.pos, dirN, step, G.STATIC | G.DOOR);
      let maxT = wall ? wall.distance : step;
      let hitC = null;
      for (const c of game.creatures.host.values()) {
        if (c.dead || c.type === 'web') continue;
        const ctr = new THREE.Vector3(c.pos.x, c.pos.y + Math.min(c.def?.height || 1.2, 2.4) * 0.5, c.pos.z);
        const rad = (c.def?.radius || 0.5) + 0.3;
        const rel = ctr.sub(pr.pos);
        const along = clamp(rel.dot(dirN), 0, maxT);
        if (rel.addScaledVector(dirN, -along).length() < rad && along <= maxT) { maxT = along; hitC = c; }
      }
      if (wall || hitC || pr.t > 2.2) {
        pr.pos.addScaledVector(dirN, maxT);
        pr.done = true;
        hostExplode(pr, hitC);
        continue;
      }
      pr.pos.addScaledVector(dirN, step);
    }
    S.hProj = S.hProj.filter((q) => !q.done);
  }
  function hostExplode(pr, direct) {
    const p = pr.pos, R = 3.5;
    const up = p.clone().setY(p.y + 0.3);
    for (const c of [...game.creatures.host.values()]) {
      if (c.dead || c.type === 'web') continue;
      const ctr = new THREE.Vector3(c.pos.x, c.pos.y + Math.min(c.def?.height || 1.2, 2.4) * 0.5, c.pos.z);
      const d = c === direct ? 0 : ctr.distanceTo(p);
      if (d > R + (c.def?.radius || 0.5)) continue;
      if (c !== direct && !game.physics.lineOfSight(up, ctr, G.STATIC | G.DOOR)) continue;
      game.creatures.damage(c.id, Math.round(38 * pr.pw * (1 - 0.5 * Math.min(1, d / R))), pr.from, {});
      if (!c.dead && c.maxHp !== null) {
        S.hBurn.set(c.id, { t: 3, acc: 0, dps: 6 * pr.pw, from: pr.from });
        game.net.broadcast('fx', { k: 'spell', s: 'burn', cid: c.id, t: 3 });
      }
    }
    game.creatures.noise(p, 3);
    game.net.broadcast('fx', { k: 'spell', s: 'fireboom', p: arr3(p), f: pr.fid });
  }
  function hostUpdateBurn(dt) {
    for (const [cid, b] of S.hBurn) {
      const c = game.creatures.host.get(cid);
      if (!c || c.dead) { S.hBurn.delete(cid); continue; }
      b.t -= dt; b.acc += dt;
      if (b.acc >= 0.5) { b.acc -= 0.5; game.creatures.damage(cid, Math.max(1, Math.round(b.dps * 0.5)), b.from, {}); }
      if (b.t <= 0) S.hBurn.delete(cid);
    }
  }
  // HUSH (host): hushed players emit no noise and anything loud right next to them is swallowed
  const hushedNear = (pos) => {
    if (!S.hHush.size) return false;
    const now = game.time;
    for (const [id, until] of S.hHush) {
      if (until < now) { S.hHush.delete(id); continue; }
      const pp = posOf(id);
      if (pp && Math.hypot(pp.x - pos.x, pp.z - pos.z) < 4 && Math.abs(pp.y - pos.y) < 4) return true;
    }
    return false;
  };
  const aiWrap = function (...a) {
    const out = Game_aiPlayers.apply(game, a);
    if (!S.disposed && S.hHush.size && Array.isArray(out)) {
      const now = game.time;
      for (const p of out) { const u = S.hHush.get(p.id); if (u && u > now) { p.noise = 0; p.voice = 0; } }
    }
    return out;
  };
  const Game_aiPlayers = game.aiPlayers;
  const noiseOrig = game.creatures.noise;
  const noiseWrap = function (pos, loud, owner) { if (!S.disposed && pos && hushedNear(pos)) return; return noiseOrig.call(this, pos, loud, owner); };
  game.aiPlayers = aiWrap;
  game.creatures.noise = noiseWrap;

  // skillbooks now and then in the facility (host, deterministic per landing; chests / shops can add more by id)
  function hostWorldBook(g) {
    if (!api.worldBooks || !g?.isHost) return;
    const fac = g.world.facility;
    if (!fac?.scrapSpots?.length || !g.run) return;
    const rng = new RNG(((g.run.seed ^ 0x5b00c) >>> 0) + (g.run.quotaIndex || 0) * 7919);
    if (!rng.chance(0.3)) return;
    const r = rng.next();
    const tier = r < 0.55 ? 'uncommon' : r < 0.85 ? 'rare' : r < 0.97 ? 'epic' : 'legendary';
    const pool = SPELL_ORDER.filter((id) => SPELLS[id].tier === tier);
    const deep = fac.scrapSpots.filter((s) => (s.dist || 0) >= 5 && !s.elevated);
    const s = rng.pick(deep.length ? deep : fac.scrapSpots);
    g.items.hostSpawn('skillbook_' + rng.pick(pool), new THREE.Vector3(s.x, s.y + 0.5, s.z), {});
  }

  // ================================================================== learning
  function learn(id, { announce = true } = {}) {
    if (!SPELLS[id] || knows(id)) return false;
    const p = profile();
    p.spells = [...new Set([...(Array.isArray(p.spells) ? p.spells : []), id])];
    game.progress?.save?.();
    if (announce) {
      const sp = SPELLS[id];
      dock?.learnBanner(id, `${sp.say.en}" / "${sp.say.tr}`);
      dock?.newSpell(id);
      sfx('spell_learn', 1);
      game.engine.flash(sp.color, 0.45); game.engine.shake(0.25);
      burst(game.player.pos.clone().setY(game.player.pos.y + 1), 'learn', null, 1);
      ringFx(game.player.pos.clone().setY(game.player.pos.y + 0.08), sp.color, 0.3, 5, 1.1);
      game.ui?.systemMessage?.(`✦ ${t('NEW SPELL LEARNED')}: ${t(sp.name).toUpperCase()} — "${sp.say.en}" / "${sp.say.tr}"`, 'good');
    }
    return true;
  }
  function useBook(it) {
    const id = it.def.spell;
    if (!SPELLS[id]) return;
    if (knows(id)) { toast('You already know this spell. Sell the book or give it to a crewmate.', 'info'); sfx('spell_fizzle', 0.4); return; }
    learn(id);
    if (it.holder === game.selfId && game.items.get(it.id) === it) game.net.request('consume', { id: it.id });
    else { try { game.inventory?.consume?.(it.type); } catch (e) { console.warn('magic consume', e); } }
  }

  // ================================================================== voice
  const voiceEnabled = () => game.settings?.voiceSpells !== false;
  const micOk = () => game.settings?.micConsent === 'yes' && game.settings?.micEnabled !== false;
  function voiceStatusText() {
    if (!speechSupported()) return t('Voice spells are not supported in this browser (use Chrome / Edge). Type the spell word in chat or hold C.');
    if (!voiceEnabled()) return t('Voice spells: OFF (Settings > Voice) · type the word in chat');
    if (!micOk()) return t('Voice spells need your microphone: turn it on in Settings > Voice.');
    return t('Hold V and SAY the word · or type it in chat · release C to cast');
  }
  function onSpeech(text, final = true, idx = 0) {
    if (S.disposed) return [];
    const found = findSpellWords(text, LEX, { mode: 'voice', lang: getLang() === 'tr' ? 'tr' : 'en' });
    dock?.showHeard(text, found.map((m) => m.w));
    let done = S.castIn.get(idx);
    if (!done) { done = new Set(); S.castIn.set(idx, done); if (S.castIn.size > 40) S.castIn.delete(S.castIn.keys().next().value); }
    const res = [];
    for (const m of found) {
      if (done.has(m.id)) continue;
      done.add(m.id);
      res.push({ id: m.id, ...cast(m.id, { source: 'voice', word: upperWord(m.w) }) });
    }
    void final;
    return res;
  }
  const listener = new VoiceListener({
    onText: (text, final, idx) => onSpeech(text, final, idx),
    onError: (code) => { if (code === 'not-allowed' || code === 'service-not-allowed') toast('Voice spells need your microphone: turn it on in Settings > Voice.', 'bad'); else if (code === 'network') game.ui?.toast?.('Voice spells: speech service unreachable (network).', 'bad'); },
  });
  function updateVoice() {
    const want = !!(game.input?.isDown?.('ptt') && !game.player.dead && voiceEnabled());
    if (want && !S.voiceHeld) {
      if (!speechSupported()) { if (!S.voiceWarned) { S.voiceWarned = true; toast('Voice spells are not supported in this browser (use Chrome / Edge). Type the spell word in chat or hold C.', 'info'); } }
      else if (!micOk()) { if (!S.voiceWarned) { S.voiceWarned = true; toast('Voice spells need your microphone: turn it on in Settings > Voice.', 'info'); } }
      else listener.start(getLang() === 'tr' ? 'tr-TR' : 'en-US');
    } else if (!want && S.voiceHeld) listener.stop();
    S.voiceHeld = want;
  }
  const upperWord = (w) => (isTurkishWord(w, LEX) ? String(w).toLocaleUpperCase('tr-TR') : String(w).toUpperCase());

  // ================================================================== chat
  function onChat(d, from, g) {
    if (!d || typeof d.text !== 'string' || d.text.length > 40) return;
    const found = findSpellWords(d.text, LEX, { mode: 'chat' });
    if (!found.length) return;
    const W = upperWord(found[0].w);
    const name = d.n || g?.playerName?.(from) || '';
    d.n = '✦ ' + name;
    d.text = W + '!';
    if (from === game.selfId) cast(found[0].id, { source: 'chat', word: W });
  }

  // ================================================================== wheel (hold C)
  function wheelUsable() {
    const ui = game.ui, inp = game.input;
    return !S.disposed && game.run && !game.player.dead && !inp?.isTyping?.() && !ui?.chatOpen && !ui?.panelOpen && !ui?.marketOpen && !ui?.dialogEl && !game.minigame && !game.terminal?.active;
  }
  function openWheel() { if (!wheel || S.wheelOpen) return; S.wheelOpen = true; wheel.show(); game.audio?.ui?.('ui_hover', 0.4); }
  function closeWheel(doCast = true) {
    if (!S.wheelOpen) return null;
    S.wheelOpen = false;
    wheel?.hide();
    const id = wheel?.selected();
    if (!doCast || !id) return null;
    return cast(id, { source: 'key' });
  }
  const onKeyDown = (e) => {
    if (e.code === 'KeyC' && !e.repeat && !S.wheelOpen && game.input?.enabled !== false && wheelUsable()) { openWheel(); e.preventDefault(); return; }
    if (!S.wheelOpen) return;
    const m = /^Digit([1-8])$/.exec(e.code) || /^Numpad([1-8])$/.exec(e.code);
    if (m) { wheel.setHover(Number(m[1]) - 1); e.preventDefault(); e.stopImmediatePropagation(); }
    else if (e.code === 'Escape') closeWheel(false);
  };
  const onKeyUp = (e) => { if (e.code === 'KeyC' && S.wheelOpen) closeWheel(true); };
  const onMouseMove = (e) => {
    if (!S.wheelOpen) return;
    if (Math.abs(e.movementX) < 400 && Math.abs(e.movementY) < 400) wheel.move(e.movementX, e.movementY);
    e.stopImmediatePropagation();   // the camera does not turn while choosing
  };
  const onMouseDown = (e) => { if (S.wheelOpen && e.button === 0) { e.stopImmediatePropagation(); closeWheel(true); } };
  const onBlur = () => closeWheel(false);
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('mousemove', onMouseMove, true);
    window.addEventListener('mousedown', onMouseDown, true);
    window.addEventListener('blur', onBlur);
  }

  // ================================================================== frame update
  function update(dt) {
    if (S.disposed) return;
    const me = game.player;
    if (!me.dead) S.mana = Math.min(maxMana(), S.mana + (BASE_REGEN + Math.max(0, bonus('manaRegen'))) * dt);
    if (S.mana > maxMana()) S.mana = maxMana();
    if (S.shieldT > 0) {
      S.shieldT -= dt;
      if (S.shieldT <= 0 || me.dead) { S.shieldT = 0; if (S.shieldHp > 0) { S.shieldHp = 0; game.net?.broadcast?.('fx', { k: 'spell', s: 'shieldoff', c: game.selfId }); } }
    }
    if (S.hushT > 0) S.hushT = Math.max(0, S.hushT - dt);
    if (S.warpT > 0) {
      S.warpT = Math.max(0, S.warpT - dt * 2.2);
      const fx = game.engine.fx;
      if (fx.warp === S.warpSet) { fx.warp = S.warpT; S.warpSet = S.warpT; }
    }
    for (const a of S.anims) { a.t += dt; const u = Math.min(1, a.t / a.dur); try { a.upd(u, dt); } catch { a.t = a.dur; } if (u >= 1) { a.done = true; try { a.end?.(); } catch { /* ignore */ } } }
    if (S.anims.some((a) => a.done)) S.anims = S.anims.filter((a) => !a.done);
    updateLumens(dt);
    updateBubbles(dt);
    updateProjs(dt);
    updateBurnFx(dt);
    if (game.isHost) { hostUpdatePush(dt); hostUpdateProj(dt); hostUpdateBurn(dt); }
    updateVoice();
    dock?.update(dt);
  }

  // ================================================================== wiring
  on('update', (dt) => update(dt));
  on('registerHandlers', (H) => H('spell', (d, from) => onHostSpell(d, from)));
  on('netReady', (net) => { try { net.relayTypes?.add?.('fx'); } catch { /* fx is relayed by default */ } });
  on('fx', (d, from) => { if (d?.k === 'spell' && d.c !== game.selfId) applyFx(d, false); void from; });
  on('chat', (d, from, g) => onChat(d, from, g));
  on('useItem', (it, hk) => { if (it?.def?.kind === 'skillbook' && !hk.handled) { hk.handled = true; useBook(it); } });
  on('localHurt', (d) => {
    if (!(S.shieldHp > 0) || !d || !(d.dmg > 0) || d.dmg >= 999) return;
    const a = Math.min(S.shieldHp, d.dmg);
    S.shieldHp -= a; d.dmg -= a;
    sfx('spell_shieldhit', 0.9); game.engine.flash(SPELLS.shield.color, 0.25);
    burst(game.player.eyePos(), 'shield', null, 0.8);
    if (S.shieldHp <= 0) { S.shieldHp = 0; S.shieldT = 0; toast('Your shield broke!', 'bad'); game.net?.broadcast?.('fx', { k: 'spell', s: 'shieldoff', c: game.selfId }); }
  });
  on('localDeath', () => { S.shieldHp = 0; S.shieldT = 0; closeWheel(false); });
  on('moonPopulated', (g) => { try { hostWorldBook(g); } catch (e) { console.warn('magic books', e); } });
  // chat commands: /spells, /voicespells on|off
  const chatCmds = game.mods?.chatCommands;
  chatCmds?.set('spells', { owner: null, fn: () => {
    const lines = SPELL_ORDER.map((id) => `${knows(id) ? '✦' : '·'} ${t(SPELLS[id].name)}: "${SPELLS[id].say.en}" / "${SPELLS[id].say.tr}"${knows(id) ? '' : ' (' + t(SPELLS[id].tierName) + ')'}`);
    for (const l of lines) game.ui?.chatMessage?.(null, l, false, 'info');
    game.ui?.chatMessage?.(null, voiceStatusText(), false, 'info');
  } });
  chatCmds?.set('voicespells', { owner: null, fn: (rest) => {
    const v = String(rest?.[0] || '').toLowerCase();
    game.settings.voiceSpells = v === 'on' ? true : v === 'off' ? false : !voiceEnabled();
    try { saveSettings(game.settings); } catch { /* ignore */ }
    game.ui?.chatMessage?.(null, `${t('Voice spells')}: ${voiceEnabled() ? 'ON' : 'OFF'}`, false, 'info');
  } });

  // ================================================================== public API (game.magic)
  const api = {
    SPELLS, ORDER: SPELL_ORDER, SKILLBOOK_IDS, game,
    worldBooks: true,
    get mana() { return S.mana; }, set mana(v) { S.mana = clamp(Number(v) || 0, 0, maxMana()); },
    get maxMana() { return maxMana(); },
    get shieldHp() { return S.shieldHp; }, get shieldMax() { return S.shieldMax; }, get hushT() { return S.hushT; },
    get wheelOpen() { return S.wheelOpen; },
    addMana(n) { S.mana = clamp(S.mana + (Number(n) || 0), 0, maxMana()); return S.mana; },
    knows, learn, cast, costOf, cooldownOf, cooldownLeft, cooldownFrac, voiceStatusText,
    known: () => SPELL_ORDER.filter(knows),
    resetCooldowns() { S.cds.clear(); },
    /** Feed a transcript as if it was heard (tests / other input methods). */
    hear: (text) => onSpeech(text, true, 'h' + Math.random()),
    openWheel, closeWheel, selectWheel: (i) => { if (S.wheelOpen) wheel?.setHover(i); },
    voiceSupported: speechSupported,
    /** host debug: is this peer inside a hush bubble right now? */
    isHushed: (id) => (S.hHush.get(id) || 0) > game.time,
    dispose() {
      if (S.disposed) return;
      S.disposed = true;
      for (const off of S.offs) { try { off(); } catch { /* ignore */ } }
      S.offs.length = 0;
      if (typeof window !== 'undefined') {
        window.removeEventListener('keydown', onKeyDown, true); window.removeEventListener('keyup', onKeyUp, true);
        window.removeEventListener('mousemove', onMouseMove, true); window.removeEventListener('mousedown', onMouseDown, true);
        window.removeEventListener('blur', onBlur);
      }
      if (game.aiPlayers === aiWrap) delete game.aiPlayers;
      if (game.creatures?.noise === noiseWrap) delete game.creatures.noise;
      if (chatCmds?.get('spells')?.owner === null) chatCmds.delete('spells');
      if (chatCmds?.get('voicespells')?.owner === null) chatCmds.delete('voicespells');
      listener.dispose();
      for (const id of [...S.lumens.keys()]) stopLumen(id);
      for (const id of [...S.bubbles.keys()]) stopBubble(id, false);
      for (const id of [...S.projs.keys()]) killProj(id);
      for (const a of S.anims) { try { a.end?.(); } catch { /* ignore */ } }
      S.anims.length = 0; S.hPush.length = 0; S.hProj.length = 0; S.hBurn.clear(); S.hHush.clear(); S.burnFx.clear();
      if (game.engine?.fx && game.engine.fx.warp === S.warpSet) game.engine.fx.warp = 0;
      dock?.dispose(); wheel?.dispose();
    },
  };
  try { dock = new ManaDock(api); wheel = new SpellWheel(api); } catch (e) { console.warn('magic ui', e); }
  return api;
}
