// ANOMALY temporary power-ups: Double XP Weekend, Premium Trial, Ad-Free, Overclock, Cloud Save, Viral.
// Sources: rare holographic world pickups (host-placed, 0-2 per landing), elite / boss drops, dice rewards.
// Every power has a cost (see docs/wave2/anomaly.md). Duration 20-180 s or (Cloud Save) until used / takeoff. No stacking: re-applying refreshes.
import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { addTranslations, t } from '../core/i18n.js';
import { createHolo } from '../models/anomaly.js';

export const POWERUPS = {
  p_xp: { power: true, good: true, glyph: '2X', color: '#ffd35a', name: 'Double XP Weekend', dur: 180, w: 3,
    desc: 'Double XP from everything for 3 minutes. Costs: "Loading..." (-8% speed).',
    stats: (s) => { s.speedMul -= 0.08; } },
  p_premium: { power: true, good: true, glyph: 'PRO', color: '#b98cff', name: 'Premium Trial', dur: 60, w: 2,
    desc: '+30% speed, +25% stamina regen for 60 s. Then the trial ends: 20 s of Free Tier (-20% speed).',
    stats: (s) => { s.speedMul += 0.3; s.staminaRegen *= 1.25; } },
  p_free: { power: true, good: false, glyph: 'FREE', color: '#ff9a5a', name: 'Free Tier', dur: 20, w: 0,
    desc: 'Your trial ended. -20% speed.', stats: (s) => { s.speedMul -= 0.2; } },
  p_adfree: { power: true, good: true, glyph: 'AD', color: '#6fe0ff', name: 'Ad-Free', dur: 20, w: 2,
    desc: 'Creatures cannot see you for 20 s (they still hear). Your attacks deal 30% less.',
    stats: (s) => { s.meleeMul *= 0.7; if (s.rangedMul) s.rangedMul *= 0.7; } },
  p_oc: { power: true, good: true, glyph: 'OC', color: '#ff7a3a', name: 'Overclock', dur: 30, w: 2,
    desc: '+35% attack speed and +15% speed for 30 s. You run hot: +0.8 STATIC per second.',
    stats: (s) => { s.speedMul += 0.15; } },
  p_cloud: { power: true, good: true, glyph: 'CLD', color: '#8ad4ff', name: 'Cloud Save', dur: 0, w: 1.2,
    desc: 'Blocks the next lethal hit (or DELETION) and restores 50% HP. Until used or takeoff. Restoring lags you for 10 s.' },
  p_viral: { power: true, good: true, glyph: 'VIR', color: '#ff4fd0', name: 'Viral', dur: 45, w: 1.5,
    desc: 'Your hits splash 50% damage to creatures within 5 m of the target. Going viral is noisy.' },
};
export const PICKUP_IDS = Object.keys(POWERUPS).filter((k) => POWERUPS[k].w > 0);

/** Pure weighted pick (rnd = () => [0,1)). */
export function rollPowerup(rnd) {
  let tot = 0; for (const k of PICKUP_IDS) tot += POWERUPS[k].w;
  let r = rnd() * tot;
  for (const k of PICKUP_IDS) { r -= POWERUPS[k].w; if (r <= 0) return k; }
  return PICKUP_IDS[0];
}
/** Pure: how many power-up pickups a landing gets (0-2). Rare on purpose. */
export function pickupCount(rnd) { const r = rnd(); return r < 0.45 ? 0 : r < 0.85 ? 1 : 2; }

addTranslations({
  'Double XP Weekend': 'Çifte XP Haftasonu', 'Premium Trial': 'Premium Deneme', 'Ad-Free': 'Reklamsız', Overclock: 'Hız Aşırtma', 'Cloud Save': 'Bulut Kaydı', Viral: 'Viral', 'Free Tier': 'Ücretsiz Paket',
  'Double XP from everything for 3 minutes. Costs: "Loading..." (-8% speed).': '3 dakika her şeyden çifte XP. Bedel: "Yükleniyor..." (-%8 hız).',
  '+30% speed, +25% stamina regen for 60 s. Then the trial ends: 20 s of Free Tier (-20% speed).': '60 sn boyunca +%30 hız, +%25 dayanıklılık yenilenmesi. Sonra deneme biter: 20 sn Ücretsiz Paket (-%20 hız).',
  'Your trial ended. -20% speed.': 'Deneme süren bitti. -%20 hız.',
  'Creatures cannot see you for 20 s (they still hear). Your attacks deal 30% less.': '20 sn yaratıklar seni göremez (duyar). Saldırıların %30 daha az vurur.',
  '+35% attack speed and +15% speed for 30 s. You run hot: +0.8 STATIC per second.': '30 sn +%35 saldırı hızı, +%15 hız. Isınırsın: saniyede +0.8 STATIC.',
  'Blocks the next lethal hit (or DELETION) and restores 50% HP. Until used or takeoff. Restoring lags you for 10 s.': 'Sonraki ölümcül darbeyi (veya SİLİNMEYİ) engeller, canın %50\'sini yeniler. Kullanılana / kalkışa kadar. Geri yükleme 10 sn lag verir.',
  'Your hits splash 50% damage to creatures within 5 m of the target. Going viral is noisy.': 'Vuruşların hedefin 5 m çevresindeki yaratıklara %50 hasar sıçratır. Viral olmak gürültülü.',
  'RESTORED FROM BACKUP': 'YEDEKTEN GERİ YÜKLENDİ', 'Power-up': 'Güç artışı', 'picked up': 'alındı', 'wore off': 'bitti',
});

export function installPowerups(ctx) {
  const game = ctx.game;
  const P = { pickups: new Map(), claimT: 0, sig: '', xpBase: undefined };
  const offs = [];
  const restores = [];
  const pu = (id) => POWERUPS[id];
  // instance-level wrap of a method (own property shadows the prototype); restore puts back what was there before
  function wrap(obj, key, make) {
    const orig = obj?.[key];
    if (typeof orig !== 'function') return;
    const had = Object.prototype.hasOwnProperty.call(obj, key);
    const w = make(orig);
    obj[key] = w;
    restores.push(() => { if (obj[key] === w) { if (had) obj[key] = orig; else delete obj[key]; } });
  }

  // ---------------------------------------------------------------- world pickups (all peers render, host decides)
  function addPickup(id, type, p) {
    if (P.pickups.has(id) || !pu(type)) return;
    const d = pu(type);
    const holo = createHolo(d.glyph, d.color);
    holo.group.position.set(p[0], p[1], p[2]);
    game.scene.add(holo.group);
    P.pickups.set(id, { id, type, pos: new THREE.Vector3(p[0], p[1], p[2]), holo, born: game.time });
  }
  function removePickup(id) { const k = P.pickups.get(id); if (!k) return; k.holo.dispose(); P.pickups.delete(id); }
  function clearPickups() { for (const id of [...P.pickups.keys()]) removePickup(id); }

  let nextId = 1;
  /** host: drop a pickup of `type` (random if omitted) at pos and tell everyone */
  function hostDrop(pos, type, spread = 0.6) {
    if (!game.isHost) return null;
    type = type || rollPowerup(Math.random);
    const id = 'pu' + (nextId++).toString(36) + Math.floor(Math.random() * 1296).toString(36);
    const a = Math.random() * Math.PI * 2;
    const p = [pos.x + Math.cos(a) * spread * 0.5, pos.y + 0.05, pos.z + Math.sin(a) * spread * 0.5];
    ctx.hostFx({ k: 'pu+', id, ty: type, p });
    return id;
  }
  /** host: seeded placement for a landing (0-2 pickups at deep floor spots) */
  function hostPlaceLanding() {
    const fac = game.world?.facility, run = game.run;
    if (!game.isHost || !fac || !run) return [];
    const rng = new RNG(((run.seed ^ 0xa7b17) >>> 0) || 1);
    const n = pickupCount(() => rng.next());
    const spots = rng.shuffle((fac.scrapSpots || []).filter((s) => !s.elevated && s.type !== 'corridor' && (s.dist || 0) >= 4));
    const out = [];
    for (let i = 0; i < Math.min(n, spots.length); i++) out.push(hostDrop(new THREE.Vector3(spots[i].x, spots[i].y, spots[i].z), rollPowerup(() => rng.next()), 0));
    return out;
  }
  function onFx(d) {
    if (d.k === 'pu+') addPickup(d.id, d.ty, d.p);
    else if (d.k === 'pu-') {
      const k = P.pickups.get(d.id);
      if (k) { game.particles?.burst?.(k.pos.clone().add(new THREE.Vector3(0, 1, 0)), { count: 18, color: [pu(k.type)?.color || '#ffffff', 0xffffff], speed: 2.5, up: 1.5, life: 0.7, size: 0.06, gravity: -1, drag: 2, additive: true }); }
      removePickup(d.id);
      if (d.by === game.selfId && pu(d.ty)) ctx.grantBuff(d.ty, pu(d.ty).dur, { pickup: true });
    } else if (d.k === 'sync') { for (const k of d.pu || []) addPickup(k.id, k.ty, k.p); }
    else if (d.k === 'vir') {
      game.particles?.burst?.(new THREE.Vector3().fromArray(d.p), { count: 16, color: [0xff4fd0, 0xffffff], speed: 3, up: 1, life: 0.5, size: 0.07, gravity: 0, drag: 2, additive: true });
      ctx.snd(['spark'], 0.5, new THREE.Vector3().fromArray(d.p));
    }
  }
  function hostClaim(d, from) {
    const k = P.pickups.get(d.id);
    if (!k) return;
    const ap = game.aiPlayerById?.(from);
    if (ap && (ap.dead || ap.pos.distanceTo(k.pos) > 4)) return;
    ctx.hostFx({ k: 'pu-', id: k.id, by: from, ty: k.type });
  }

  // ---------------------------------------------------------------- host-side hooks (creature sight, Viral splash, elite drops)
  wrap(game.creatures, 'canSee', (orig) => function (c, p, ...rest) { if (p?.id && ctx.peerHas(p.id, 'p_adfree')) return false; return orig.call(this, c, p, ...rest); });
  wrap(game.creatures, 'damage', (origDmg) => function (id, amount, by, opts = {}) {
    const r = origDmg.call(this, id, amount, by, opts);
    try {
      if (!opts._viral && amount > 0 && by && ctx.peerHas(by, 'p_viral')) {
        const c = this.host.get(id);
        if (c) {
          let n = 0;
          for (const o of this.host.values()) {
            if (o === c || o.dead || o.maxHp === null || o.def?.hazard || o.def?.boss || o.pos.distanceTo(c.pos) > 5 || n >= 4) continue;
            origDmg.call(this, o.id, amount * 0.5, by, { _viral: 1 }); n++;
          }
          if (n) { ctx.hostFx({ k: 'vir', p: [c.pos.x, c.pos.y + 1, c.pos.z] }); game.balance?.noise?.(c.pos, 0.9); }
        }
      }
    } catch (e) { console.warn('[anomaly] viral', e); }
    return r;
  });
  wrap(game, 'hostOnCreatureKilled', (orig) => function (c, by) {
    const r = orig.call(this, c, by);
    try {
      if (game.isHost && c && !c._puDrop && (c.elite || c.def?.boss)) {
        c._puDrop = true;
        if (c.def?.boss || Math.random() < 0.3) hostDrop(c.pos, undefined, 0.8);
      }
    } catch (e) { console.warn('[anomaly] drop', e); }
    return r;
  });

  // ---------------------------------------------------------------- Overclock: faster swings (wraps the melee entry point like crafting does)
  wrap(game, 'meleeSwing', (orig) => function (it, power) {
    const before = this.nextSwing || 0;
    const r = orig.call(this, it, power);
    if (ctx.buffs.has('p_oc') && this.nextSwing !== before) this.nextSwing = this.time + (this.nextSwing - this.time) * 0.65;
    return r;
  });

  // ---------------------------------------------------------------- Cloud Save: blocks the next lethal hit (after armor-free instant kills too)
  offs.push(ctx.mods.on('localHurt', (d) => {
    const p = game.player;
    if (!d || !(d.dmg > 0) || !ctx.buffs.has('p_cloud') || p.dead) return;
    const eff = d.dmg >= 999 ? 999 : d.dmg * (1 - Math.max(0, Math.min(0.6, game.stats.armor || 0)));
    if (p.hp - eff > 0) return;
    d.dmg = 0;
    cloudRestore();
  }));
  function cloudRestore() {
    const p = game.player;
    ctx.buffs.remove('p_cloud', 'used');
    p.hp = Math.max(p.hp, Math.round(game.stats.maxHp * 0.5));
    game.net?.send?.('pst', { hp: Math.round(p.hp) });
    ctx.grantBuff('b_lag', 10);
    game.engine?.flash?.(0x8ad4ff, 0.7);
    ctx.snd(['ui_levelup', 'heal'], 0.8);
    ctx.toast(t('RESTORED FROM BACKUP'), 'good');
    ctx.say('Restoring from backup. Some data was lost. It was probably yours.');
  }

  // ---------------------------------------------------------------- Double XP (Progress.addXp reads game.xpMul)
  function syncXp() {
    const on = ctx.buffs.has('p_xp');
    if (on && P.xpBase === undefined) { P.xpBase = game.xpMul; game.xpMul = (game.run?.dailyEvent?.xpMul > 1 ? 1.5 : 2); }
    else if (!on && P.xpBase !== undefined) { game.xpMul = P.xpBase; if (game.xpMul === undefined) delete game.xpMul; P.xpBase = undefined; }
  }

  // ---------------------------------------------------------------- per-frame
  function update(dt) {
    const ph = game.run?.phase;
    if (ph !== 'moon' && ph !== 'landing' && P.pickups.size) clearPickups();
    syncXp();
    const cam = game.camera.position;
    for (const k of P.pickups.values()) k.holo.update(game.time, cam);
    const p = game.player;
    if (!p || p.dead || !P.pickups.size) return;
    P.claimT -= dt;
    if (P.claimT > 0) return;
    for (const k of P.pickups.values()) {
      if (Math.hypot(k.pos.x - p.pos.x, k.pos.z - p.pos.z) < 1.35 && Math.abs(k.pos.y - p.pos.y) < 2.2) {
        P.claimT = 0.5;
        ctx.netReq('pu', { id: k.id });
        break;
      }
    }
  }

  offs.push(ctx.mods.on('moonPopulated', (g) => { if (g === game && game.isHost) { try { hostPlaceLanding(); } catch (e) { console.warn('[anomaly] pickups', e); } } }));
  offs.push(ctx.mods.on('playerJoin', (id, info, g) => { if (g === game && game.isHost) { const list = [...P.pickups.values()].map((k) => ({ id: k.id, ty: k.type, p: k.pos.toArray() })); if (list.length) game.net.sendTo(id, 'anfx', { k: 'sync', pu: list }); } }));

  return {
    update, onFx, hostClaim, hostDrop, hostPlaceLanding, clearPickups, cloudRestore,
    pickups: () => [...P.pickups.values()],
    dispose() {
      for (const o of offs) { try { o?.(); } catch { /* ignore */ } }
      for (const r of restores.reverse()) { try { r(); } catch { /* ignore */ } }
      if (P.xpBase !== undefined) { game.xpMul = P.xpBase; if (game.xpMul === undefined) delete game.xpMul; }
      clearPickups();
    },
  };
}
