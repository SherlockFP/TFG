// CREATURE TIERS (Common ... Mythic): host rolls a tier when a creature spawns, HP / damage / XP are multiplied ON TOP of
// balance.scale (HP baked once in the HostCreature constructor, damage in hostHurtPlayer BEFORE balance.hitDamage so the
// early-game hit cap still protects), shards drop on death, every peer draws tier colour / aura / nameplate.
// Rules and numbers: src/game/enhance.js. Hooks in shared files are marked `[forge]`:
//   entities/creatures.js  ctor (tier, HP, XP), hostSpawn (roll + 'tr'/'fa' on the 'sp' event), kill() item drop floor, CreatureView (tier fields)
//   game.hostHurtPlayer / game.hostOnCreatureKilled / creatures.damage are wrapped on the INSTANCE and restored in dispose().
import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { TIERS, tierIndex } from './tiers.js';
import { CREATURES, rollAffix } from './creatures.js';
import { MOONS } from './moons.js';
import { scrapTableFor } from './items.js';
import * as F from './enhance.js';

const RING_GEO = new THREE.RingGeometry(0.72, 1.0, 28).rotateX(-Math.PI / 2);
const _v = new THREE.Vector3();

export function installCreatureTiers(game, forge) {
  const offs = [];
  const restores = [];
  const fxMap = new Map();          // creature id -> client fx
  let disposed = false, hpT = 0;
  const M = game.creatures;
  const rng = forge.rng;

  // ------------------------------------------------------------------ host: roll at spawn
  const ctxNow = () => ({
    quotaIndex: game.run?.quotaIndex || 0,
    threat: Number(game.balance?.threat?.()) || 0,
    moonTier: MOONS[game.run?.moon]?.tier || 1,
  });
  /** Called by CreatureManager.hostSpawn (host) before the HostCreature is built: returns opts with { tier, fa, affix }. */
  function creatureOpts(type, opts = {}) {
    if (disposed || !game.isHost) return opts;
    const def = CREATURES[type];
    if (!def) return opts;
    if (def.boss) return opts.tier === undefined && F.BOSS_TIERS[type] ? { ...opts, tier: F.BOSS_TIERS[type] } : opts;
    if (!F.tierable(def)) return opts;
    let tier = opts.tier;
    if (tier === undefined) tier = F.rollCreatureTier(rng, ctxNow());
    if (!tier || !TIERS[tier]) return opts;
    const out = { ...opts, tier: tier === 'common' ? null : tier };
    const n = F.creatureAffixCount(tier);
    if (n > 0) {
      let placed = 0;
      if (out.affix === undefined || out.affix === null) {
        const a = rollAffix(type, opts.level || 1, true, () => rng.next('affix'));
        if (a) { out.affix = a; placed++; }
      } else placed++;
      const extras = [];
      const pool = F.EXTRA_AFFIXES.slice();
      while (placed + extras.length < n && pool.length) extras.push(pool.splice(Math.floor(rng.next('xaff') * pool.length), 1)[0]);
      if (extras.length) out.fa = extras;
    }
    if (tier === 'mythic') {
      const nm = def.name || type;
      game.later?.(() => {
        game.net?.broadcast('sys', { text: `A MYTHIC ${nm.toUpperCase()} HAS SPAWNED.`, kind: 'bad' });
        game.lore?.say?.(`A MYTHIC ${nm}. Please do not make it a clip.`, { all: true, mood: 'ecstatic' });
      }, 800);
    }
    return out;
  }
  /** kill() item drop floor: the creature's own drop item rolls at least one tier below the creature (Rare+). */
  const dropOpts = (c) => (c?.tier && !c.def?.boss && tierIndex(c.tier) >= 2 ? { rollTier: true, minTier: F.creatureItemMinTier(c.tier) } : undefined);

  // ------------------------------------------------------------------ host: damage on top of balance.scale, extra affixes
  /** Instance-level wrapper that puts the previous value back on dispose (other modules may have wrapped the same method). */
  function wrapMethod(obj, name, make) {
    const orig = obj[name], hadOwn = Object.prototype.hasOwnProperty.call(obj, name);
    const w = make(orig);
    obj[name] = w;
    restores.push(() => { if (obj[name] === w) { if (hadOwn) obj[name] = orig; else delete obj[name]; } });
  }
  wrapMethod(game, 'hostHurtPlayer', (orig) => function (id, dmg, cause, fromId, fromPos) {
    if (fromId && dmg < 999 && dmg > 0) {
      const src = M.host.get(fromId);
      if (src?.tier && !src.def?.boss) dmg *= F.creatureTierMul(src.tier);   // hostHurtPlayer then applies balance.hitDamage (scale + early cap)
    }
    return orig.call(this, id, dmg, cause, fromId, fromPos);
  });
  wrapMethod(M, 'damage', (orig) => function (id, amount, by, opts = {}) {
    const c = this.host.get(id);
    if (c && !c.dead && c.fgAff?.includes('paywalled') && !opts.pierce) amount *= 1 - F.EXTRA_ARMOR;
    return orig.call(this, id, amount, by, opts);
  });

  // ------------------------------------------------------------------ host: shard drops
  const theme = () => game.world?.facility?.layout?.theme || MOONS[game.run?.moon]?.interior || 'factory';
  function spawnLoot(id, pos, extra = {}) {
    const a = Math.random() * Math.PI * 2, sp = 0.7 + Math.random() * 1.3;
    return game.items.hostSpawn(id, new THREE.Vector3(pos.x + Math.cos(a) * 0.25, pos.y + 0.45, pos.z + Math.sin(a) * 0.25), { linvel: [Math.cos(a) * sp, 2 + Math.random() * 1.6, Math.sin(a) * sp], ...extra });
  }
  function onKilled(c) {
    if (!game.isHost || !c || c.shardsDropped) return;
    const def = c.def || CREATURES[c.type];
    if (!def || def.hazard || def.hp == null || def.noSpawn) return;
    const tier = c.tier || (def.boss ? F.BOSS_TIERS[c.type] : null) || 'common';
    c.shardsDropped = true;
    const drops = F.creatureShardDrops(tier, rng);
    if (def.boss) drops.push({ id: F.shardOfTier(tier), n: 1 }, { id: 'shard_scrap', n: 3 });
    let count = 0;
    for (const d of drops) for (let i = 0; i < d.n; i++) { if (spawnLoot(d.id, c.pos)) count++; }
    // Backup Drive: small chance from Rare and up (a rare protection item)
    if (tierIndex(tier) >= 2 && rng.next('backup') < 0.04 + 0.02 * (tierIndex(tier) - 2)) { spawnLoot(F.BACKUP_ID, c.pos); count++; }
    // Rare+ creatures also carry a piece of loot of at least (tier - 1)
    if (tierIndex(tier) >= 2 && rng.next('loot') < 0.35) {
      const table = scrapTableFor(theme()).filter(([id]) => game.itemDefOf(id)?.value);
      if (table.length) { const id = table[Math.floor(rng.next('lootpick') * table.length) % table.length][0]; spawnLoot(id, c.pos, { rollTier: true, minTier: F.creatureItemMinTier(tier), luck: 0.15 }); count++; }
    }
    forge.stats.shardDrops += count;
    // Viral overclock: the corpse bursts
    if (c.fgViral) {
      const r = 4, dmg = Math.min(160, Math.max(12, c.maxHp * 0.25));
      game.net.broadcast('fx', { k: 'explode', p: [+c.pos.x.toFixed(2), +(c.pos.y + 0.4).toFixed(2), +c.pos.z.toFixed(2)] });
      for (const o of M.host.values()) if (o !== c && !o.dead && o.maxHp !== null && o.pos.distanceTo(c.pos) < r) M.damage(o.id, dmg * (1 - o.pos.distanceTo(c.pos) / r * 0.5), c.fgViral, { pierce: false });
    }
  }
  wrapMethod(game, 'hostOnCreatureKilled', (orig) => function (c, by) {
    const r = orig?.call(this, c, by);
    try { onKilled(c, by); } catch (e) { console.warn('[forge] kill drop', e); }
    return r;
  });

  // host tick: 'evergreen' regeneration for the forge's extra affix, burn DoT is handled by the overclock code in forge.js
  function hostTick(dt) {
    for (const c of M.host.values()) {
      if (c.dead || !c.fgAff?.includes('evergreen') || !c.maxHp || c.hp >= c.maxHp) continue;
      if ((game.time || 0) - (c.lastHurtT || -99) > 3) c.hp = Math.min(c.maxHp, c.hp + c.maxHp * F.EXTRA_REGEN * dt);
    }
  }

  // ------------------------------------------------------------------ client: aura, nameplate, tint
  function plateCanvas(v, T) {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
    return cv;
  }
  function drawPlate(fx) {
    const v = fx.v, T = TIERS[v.tier] || TIERS.common, cv = fx.canvas, x = cv.getContext('2d');
    x.clearRect(0, 0, 256, 64);
    x.textAlign = 'center'; x.textBaseline = 'alphabetic';
    x.font = '26px VT323, monospace';
    const name = `${T.name.toUpperCase()} ${v.def?.name || v.type}`;
    x.lineWidth = 4; x.strokeStyle = 'rgba(0,0,0,.85)'; x.strokeText(name, 128, 26);
    x.fillStyle = T.color; x.fillText(name, 128, 26);
    const extra = (v.fgAff || []).map((a) => a.toUpperCase()).join(' + ');
    if (extra) { x.font = '17px VT323, monospace'; x.lineWidth = 3; x.strokeText(extra, 128, 44); x.fillStyle = '#e8e0d0'; x.fillText(extra, 128, 44); }
    if (tierIndex(v.tier) >= 4 && v.maxHp) {
      const f = Math.max(0, Math.min(1, (v.hp ?? v.maxHp) / v.maxHp));
      x.fillStyle = 'rgba(0,0,0,.8)'; x.fillRect(38, 50, 180, 9);
      x.fillStyle = T.color; x.fillRect(40, 52, 176 * f, 5);
      fx.lastHp = f;
    }
    fx.tex.needsUpdate = true;
  }
  function makeFx(v) {
    const T = TIERS[v.tier];
    const fx = { v, sprite: null, ring: null, canvas: plateCanvas(v, T), tex: null, lastHp: -1, pT: 0, tinted: false };
    fx.tex = new THREE.CanvasTexture(fx.canvas);
    fx.tex.magFilter = THREE.NearestFilter; fx.tex.minFilter = THREE.NearestFilter; fx.tex.colorSpace = THREE.SRGBColorSpace;
    fx.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: fx.tex, transparent: true, depthWrite: false, fog: false }));
    fx.sprite.scale.set(2.0, 0.5, 1);
    fx.sprite.center.set(0.5, 0);
    fx.sprite.renderOrder = 4;
    game.scene.add(fx.sprite);
    if (tierIndex(v.tier) >= 2 && !v.ring) {
      fx.ring = new THREE.Mesh(RING_GEO, new THREE.MeshBasicMaterial({ color: T.hex, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: true }));
      const r = Math.max(0.5, (v.radius || 0.5) * 1.35);
      fx.ring.scale.set(r, 1, r); fx.ring.renderOrder = 2;
      game.scene.add(fx.ring);
    }
    drawPlate(fx);
    return fx;
  }
  function killFx(id, fx) {
    fx.sprite?.removeFromParent(); fx.sprite?.material?.dispose(); fx.tex?.dispose();
    if (fx.ring) { fx.ring.removeFromParent(); fx.ring.material.dispose(); }
    fxMap.delete(id);
  }
  function clientUpdate(dt) {
    const views = M.views;
    hpT -= dt;
    for (const v of views.values()) {
      if (!v.tier || v.tier === 'common' || fxMap.has(v.id) || v.state === 'dead') continue;
      if (!TIERS[v.tier]) continue;
      fxMap.set(v.id, makeFx(v));
    }
    const cam = game.camera?.position;
    for (const [id, fx] of fxMap) {
      const v = fx.v;
      if (views.get(id) !== v || v.state === 'dead') { killFx(id, fx); continue; }
      const T = TIERS[v.tier], hide = v.hidden || !v.root?.visible;
      const d = cam ? v.pos.distanceTo(cam) : 0;
      const a = hide ? 0 : Math.max(0, Math.min(1, (28 - d) / 8));
      fx.sprite.visible = a > 0.02; fx.sprite.material.opacity = a;
      fx.sprite.position.set(v.pos.x, v.pos.y + (v.height || 1.5) + 0.35, v.pos.z);
      if (tierIndex(v.tier) >= 4 && hpT <= 0 && v.maxHp && Math.abs(((v.hp ?? v.maxHp) / v.maxHp) - fx.lastHp) > 0.015) drawPlate(fx);
      if (fx.ring) {
        fx.ring.visible = !hide;
        fx.ring.position.set(v.pos.x, v.pos.y + 0.05, v.pos.z);
        fx.ring.material.opacity = (0.28 + 0.2 * Math.sin(game.time * (tierIndex(v.tier) >= 5 ? 9 : 4) + v.pos.x)) * (tierIndex(v.tier) >= 4 ? 1.2 : 1);
      }
      // Epic+ get a body glow (tint) unless an affix / variant already tints them; particles rise from Epic up
      if (!fx.tinted && tierIndex(v.tier) >= 3 && !v.affix && !v.variant?.tint) { try { v.model?.setTint?.(T.color, true); } catch { /* cosmetic */ } fx.tinted = true; }
      if (tierIndex(v.tier) >= 3 && !hide && game.particles && d < 30) {
        fx.pT -= dt;
        if (fx.pT <= 0) {
          fx.pT = tierIndex(v.tier) >= 5 ? 0.09 : 0.3;
          _v.set(v.pos.x + (Math.random() - 0.5) * (v.radius || 0.5), v.pos.y + (v.height || 1.5) * Math.random(), v.pos.z + (Math.random() - 0.5) * (v.radius || 0.5));
          game.particles.burst(_v, { count: 1, color: tierIndex(v.tier) >= 5 ? [T.hex, 0x000000, 0xffffff] : [T.hex], speed: 0.5, up: 1.1, life: 0.8, size: 0.055, gravity: -0.6, drag: 2 });
        }
      }
    }
    if (hpT <= 0) hpT = 0.25;
  }

  return {
    creatureOpts, dropOpts, hostTick, clientUpdate, onKilled,
    fxCount: () => fxMap.size,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const off of offs) { try { off(); } catch { /* ignore */ } }
      for (const r of restores.reverse()) { try { r(); } catch { /* ignore */ } }
      for (const [id, fx] of [...fxMap]) killFx(id, fx);
      void RNG;
    },
  };
}
