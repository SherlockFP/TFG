// ANOMALY mutations: 5 good + 5 bad, temporary (until takeoff or 60-150 s), each with a real effect and a real cost.
// Rolled by the Glitching-stage dice (static.js -> host) and by the Loot Box Shrine (dice.js). The buff registry itself lives
// in anomaly.js (ctx.buffs); this file holds the data + the per-frame effects of the mutations.
import * as THREE from 'three';
import { addTranslations, t } from '../core/i18n.js';

export const MUTATIONS = {
  m_legs: { good: true, glyph: 'LEG', color: '#7dff7d', name: 'Overclocked Legs', dur: [80, 110],
    desc: '+25% move speed, +20% jump. Stamina regenerates at half speed.',
    stats: (s) => { s.speedMul += 0.25; s.jumpMul = (s.jumpMul || 1) * 1.2; s.staminaRegen *= 0.5; } },
  m_nv: { good: true, glyph: 'NV', color: '#9dffb0', name: 'Night Vision', dur: [90, 130],
    desc: 'You see in the dark (grainy). Scan range -30%.',
    stats: (s) => { s.scanRange = Math.round(s.scanRange * 0.7); } },
  m_skin: { good: true, glyph: 'SKN', color: '#ffd07a', name: 'Thick Skin', dur: [100, 140],
    desc: '+20% damage reduction. You are 10% slower.',
    stats: (s) => { s.armor = (s.armor || 0) + 0.2; s.speedMul -= 0.1; } },
  m_magnet: { good: true, glyph: 'MAG', color: '#7fd8ff', name: 'Magnet Hands', dur: [70, 100],
    desc: 'Loose scrap within 3.5 m jumps into your hands. It is not picky: hot and cursed items too.' },
  m_echo: { good: true, glyph: 'ECO', color: '#b0f0ff', name: 'Echolocation', dur: [70, 100],
    desc: 'Every 5 s a ping shows creatures within 26 m through walls. The ping is LOUD.' },
  b_lag: { good: false, glyph: 'LAG', color: '#ff8a5a', name: 'Lag', dur: [60, 90],
    desc: 'You freeze for half a second every few seconds. 10% slower.',
    stats: (s) => { s.speedMul -= 0.1; } },
  b_mute: { good: false, glyph: 'MUT', color: '#ff6b6b', name: 'Mute', dur: [60, 100],
    desc: 'Your voice is demonetized: voice spells will not cast. Chat and the spell wheel still work.' },
  b_glass: { good: false, glyph: 'GLS', color: '#ff5a7a', name: 'Glass Bones', dur: [60, 90],
    desc: 'You take 50% more damage.' },
  b_beacon: { good: false, glyph: 'BCN', color: '#ffd35a', name: 'Beacon', dur: [50, 80],
    desc: 'You glow. Your crew sees you from afar and creatures hear you (steady noise).' },
  b_jitter: { good: false, glyph: 'JTR', color: '#c58aff', name: 'Jitter', dur: [50, 80],
    desc: 'Your aim twitches and the screen shakes.' },
};
export const GOOD_MUT = Object.keys(MUTATIONS).filter((k) => MUTATIONS[k].good);
export const BAD_MUT = Object.keys(MUTATIONS).filter((k) => !MUTATIONS[k].good);

/** Pure: pick a mutation id. `rnd` = () => [0,1). goodChance 0..1; `not` = ids to avoid (already active). */
export function rollMutation(rnd, goodChance = 0.5, not = []) {
  const wantGood = rnd() < goodChance;
  const pool = (wantGood ? GOOD_MUT : BAD_MUT).filter((k) => !not.includes(k));
  const all = pool.length ? pool : (wantGood ? GOOD_MUT : BAD_MUT);
  return all[Math.floor(rnd() * all.length) % all.length];
}
export const mutDuration = (id, rnd) => { const d = MUTATIONS[id]?.dur || [60, 90]; return Math.round(d[0] + rnd() * (d[1] - d[0])); };

addTranslations({
  'Overclocked Legs': 'Aşırı Hızlı Bacaklar', 'Night Vision': 'Gece Görüşü', 'Thick Skin': 'Kalın Deri', 'Magnet Hands': 'Mıknatıs Eller', Echolocation: 'Ekolokasyon',
  Lag: 'Lag', Mute: 'Sessiz', 'Glass Bones': 'Cam Kemikler', Beacon: 'Fener', Jitter: 'Titreme',
  '+25% move speed, +20% jump. Stamina regenerates at half speed.': '+%25 hız, +%20 zıplama. Dayanıklılık yarı hızda yenilenir.',
  'You see in the dark (grainy). Scan range -30%.': 'Karanlıkta görürsün (grenli). Tarama menzili -%30.',
  '+20% damage reduction. You are 10% slower.': '+%20 hasar azaltma. %10 yavaşsın.',
  'Loose scrap within 3.5 m jumps into your hands. It is not picky: hot and cursed items too.': '3.5 m içindeki hurda elinize atlar. Seçici değil: sıcak ve lanetli eşyalar da.',
  'Every 5 s a ping shows creatures within 26 m through walls. The ping is LOUD.': '5 sn\'de bir 26 m içindeki yaratıkları duvar ardından gösterir. Ping ÇOK gürültülü.',
  'You freeze for half a second every few seconds. 10% slower.': 'Birkaç saniyede bir yarım saniye donarsın. %10 yavaş.',
  'Your voice is demonetized: voice spells will not cast. Chat and the spell wheel still work.': 'Sesin demonetize edildi: sesli büyüler çalışmaz. Sohbet ve büyü çarkı çalışır.',
  'You take 50% more damage.': '%50 daha fazla hasar alırsın.',
  'You glow. Your crew sees you from afar and creatures hear you (steady noise).': 'Parlıyorsun. Ekip seni uzaktan görür, yaratıklar seni duyar (sürekli gürültü).',
  'Your aim twitches and the screen shakes.': 'Nişanın titrer, ekran sallanır.',
  'Muted: voice spells are disabled for now.': 'Sessiz: sesli büyüler şimdilik kapalı.',
  'Lag spike!': 'Lag!',
});

/** Per-frame effects of the active mutations (own player only). ctx = anomaly context (see anomaly.js). */
export function installMutations(ctx) {
  const game = ctx.game;
  const S = { lag: 3 + Math.random() * 4, jit: 0, echo: 2, mag: 0, beacon: 0, nvOn: false };
  const eng = game.engine;
  const U = eng?.postMat?.uniforms;
  const base = { gamma: U ? U.uGamma.value : 1.08, vig: U ? U.uVignette.value : 0.55 };
  let nvEl = null;

  // ---- glass bones: incoming damage x1.5 (before armor; instant kills untouched)
  const offHurt = ctx.mods.on('localHurt', (d) => {
    if (!d || !(d.dmg > 0) || d.dmg >= 999 || !ctx.buffs.has('b_glass')) return;
    d.dmg *= 1.5;
  });

  function nightVision(on) {
    if (U) {
      U.uGamma.value = on ? base.gamma * 1.55 : base.gamma;
      U.uVignette.value = on ? base.vig * 0.45 : base.vig;
    }
    if (typeof document === 'undefined') return;
    if (on && !nvEl) {
      nvEl = document.createElement('div');
      nvEl.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:4;background:rgba(40,255,120,.10);mix-blend-mode:screen';
      (document.getElementById('ui') || document.body).appendChild(nvEl);
    } else if (!on && nvEl) { nvEl.remove(); nvEl = null; }
  }

  function echoPing() {
    const p = game.player;
    const eye = p.eyePos();
    const labels = [];
    for (const v of game.creatures.views.values()) {
      if (v.state === 'dead' || v.hidden || v.type === 'web') continue;
      const c = v.pos.clone().add(new THREE.Vector3(0, (v.height || 1.6) * 0.6, 0));
      if (c.distanceTo(eye) > 26) continue;
      labels.push({ pos: c, name: `${v.def?.name || '???'}`, sub: `${Math.round(c.distanceTo(eye))} m`, color: '#b0f0ff' });
    }
    game.scanFx?.start?.(eye, 26);
    if (labels.length) { game.scanFx?.reveal?.(labels); game.ui?.hud?.showScan?.(labels, 0); }
    ctx.snd(['ui_scan'], 0.5);
    game.balance?.noise?.(p.pos, 0.6);
  }

  function magnet() {
    const p = game.player;
    if (p.dead || game.minigame || (game.grab && game.grab.item)) return;
    let best = null, bd = 3.5;
    for (const it of game.items.all()) {
      if (it.state !== 'world' || it.owner || it.carrier || it.ladder || it.def.kind === 'big' || it.type === 'body' || it.def.special) continue;
      if (!it.def.value && it.def.kind !== 'drop') continue;
      const d = it.obj.position.distanceTo(p.pos.clone().setY(p.pos.y + 0.9));
      if (d < bd && Math.abs(it.obj.position.y - p.pos.y) < 2.4) { bd = d; best = it; }
    }
    if (best) { try { game.pickup(best); } catch { /* full hands */ } }
  }

  function update(dt) {
    const p = game.player;
    if (!p || p.dead) { if (S.nvOn) { S.nvOn = false; nightVision(false); } return; }
    const has = (id) => ctx.buffs.has(id);
    const nv = has('m_nv');
    if (nv !== S.nvOn) { S.nvOn = nv; nightVision(nv); }
    if (nv) ctx.screen.noise = Math.max(ctx.screen.noise, 0.06);
    if (has('b_lag')) {
      S.lag -= dt;
      if (S.lag <= 0) { S.lag = 5 + Math.random() * 5; p.stunT = Math.max(p.stunT, 0.45); ctx.blip(0.4, 0.3, 0.4); ctx.snd(['walkie_static'], 0.35); }
    }
    if (has('b_jitter')) {
      S.jit -= dt;
      if (S.jit <= 0) { S.jit = 0.5 + Math.random() * 0.9; p.yaw += (Math.random() - 0.5) * 0.06; p.pitch = Math.max(-1.4, Math.min(1.4, p.pitch + (Math.random() - 0.5) * 0.035)); eng?.shake?.(0.14); }
      ctx.screen.warp = Math.max(ctx.screen.warp, 0.35);
    }
    if (has('m_echo')) { S.echo -= dt; if (S.echo <= 0) { S.echo = 5; echoPing(); } }
    if (has('m_magnet')) { S.mag -= dt; if (S.mag <= 0) { S.mag = 0.35; magnet(); } }
    if (has('b_beacon')) { S.beacon -= dt; if (S.beacon <= 0) { S.beacon = 1.6; game.balance?.noise?.(p.pos, 0.5); } }
  }

  return {
    update,
    /** true while Mute is active (magic.js asks before a voice cast) */
    muted: () => ctx.buffs.has('b_mute'),
    dispose() { offHurt?.(); nightVision(false); },
  };
}
