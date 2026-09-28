// WORLDX (wave 1): open-world module installer. game.js only does `this.useModule('worldx', installWorldX)`; everything
// else hangs off the mod event bus (game.mods.on -> off) so nothing else in the codebase changes.
//
//   game.worldx = { chests(), openChest(id), harvest, hazards, landmarks(), dispose() }
//
// What it wires:
//   chests.js   treasure chests (landmarks / outdoor / facility), hold-E opening, host loot, late-join sync
//   harvest.js  trees + rocks: chop / mine for wood, scrap metal, crystals
//   biome hazards (lava / ice), see below:
//     lava   standing in a lava river burns hard and kills after ~1.2 s; heat shimmer (engine warp) near the rivers
//     ice    frozen lakes are slippery (player velocity blends back to its previous value), blizzard gusts swell the fog
//     death cause 'lava' gets its own death text (game.deathText is wrapped, the original still handles everything else)
// Net: 'wxState' (chests), 'wxHp' / 'wxFell' (harvest) are host->everyone messages; they are added to HOST_ONLY so a client
// can never forge them. Requests: wxOpen, wxSync, wxHit, wxHSync (host handlers, registered once per net session).
import * as THREE from 'three';
import { HOST_ONLY } from '../net/session.js';
import { addTranslations } from '../core/i18n.js';
import { installChests } from './chests.js';
import { installHarvest } from './harvest.js';

const TR = {
  'Wooden Chest': 'Tahta Sandık', 'Iron Chest': 'Demir Sandık', 'Gold Chest': 'Altın Sandık', 'Void Chest': 'Boşluk Sandığı',
  'Open': 'Aç', 'Opening': 'Açılıyor', 'hold E': 'E basılı tut', 'Locked': 'Kilitli', 'Uses the key': 'Anahtar kullanır',
  'Needs a key, a lockpicker, a melee weapon or a crowbar': 'Anahtar, maymuncuk, yakın dövüş silahı veya levye gerekir',
  'Lockpick minigame': 'Maymuncuk mini oyunu', 'Pry it open - loud!': 'Zorla aç - gürültülü!',
  'Chop': 'Kes', 'Mine': 'Kır', 'tree': 'ağaç', 'rock': 'kaya', 'Drops wood': 'Odun düşürür',
  'Drops scrap metal, sometimes a crystal': 'Hurda metal, bazen kristal düşürür',
  'Hold a melee weapon or tool (E / swing) to harvest': 'Toplamak için yakın dövüş silahı veya alet tut (E / vur)',
};
const DEATH = { lava: 'took a bath in molten silicon.' };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function installWorldX(game) {
  const mods = game.mods;
  if (!mods) return null;
  addTranslations(TR);
  for (const k of ['wxState', 'wxHp', 'wxFell']) HOST_ONLY.add(k);
  const api = {};
  const chests = installChests(game, api);
  const harvest = installHarvest(game, api);
  const offs = [];
  const on = (ev, fn) => { const off = mods.on(ev, fn); if (typeof off === 'function') offs.push(off); };

  // ---- hazards ------------------------------------------------------------------------------------------------------
  const H = { lavaT: 0, tick: 0, warp: 0, lastWarp: 0, near: 99, nearT: 0, gustLevel: -1, onIce: false };
  const terrainOf = () => (game.world?.outdoor ? game.world.terrain : null);

  function updateLava(dt, terrain) {
    const p = game.player, fx = game.engine?.fx;
    if (!terrain?.lava || p.dead || p.indoor || p.inShip) { H.lavaT = 0; if (fx && (fx.warp === 0 || Math.abs(fx.warp - H.lastWarp) < 1e-4)) { fx.warp = 0; H.lastWarp = 0; } H.warp = 0; return; }
    const Ly = terrain.lava.y;
    const depth = terrain.lavaDepthAt(p.pos.x, p.pos.z);
    // in the river: the ground is under the lava surface and the feet are below it
    if (depth > -0.1 && p.pos.y < Ly + 0.4) {
      H.lavaT += dt;
      p.slowT = Math.max(p.slowT || 0, 0.3);
      H.tick -= dt;
      if (H.tick <= 0) {
        H.tick = 0.2;
        game.damageLocal(H.lavaT > 1.2 ? 999 : 12, 'lava', null);
        game.engine?.flash?.(0xff6a10, 0.35);
        game.sfx?.('spark', 0.5);
        game.particles?.burst?.(new THREE.Vector3(p.pos.x, Ly + 0.2, p.pos.z), 'sparks', null, 1.2);
      }
    } else H.lavaT = Math.max(0, H.lavaT - dt * 2);
    // heat shimmer: distance to the nearest lava within 14 m (ring samples, 4 Hz)
    H.nearT -= dt;
    if (H.nearT <= 0) {
      H.nearT = 0.25;
      let best = 99;
      for (const r of [3, 6, 9, 12, 15]) {
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          if (terrain.lavaDepthAt(p.pos.x + Math.cos(a) * r, p.pos.z + Math.sin(a) * r) > 0) { best = Math.min(best, r); break; }
        }
        if (best < 99) break;
      }
      H.near = depth > 0 ? 0 : best;
    }
    const want = clamp(1 - H.near / 16, 0, 1) * 0.3;
    H.warp += (want - H.warp) * Math.min(1, dt * 3);
    if (fx && (fx.warp === 0 || Math.abs(fx.warp - H.lastWarp) < 1e-4)) { fx.warp = H.warp < 0.005 ? 0 : H.warp; H.lastWarp = fx.warp; }
  }

  function updateIce(dt, terrain) {
    // fog swell of the blizzard gusts (env.update ran earlier this frame; it re-derives the density every frame)
    const gust = terrain?.wx?.gust;
    if (gust !== undefined && terrain.biome?.frozen && !game.player.indoor) {
      const sc = game.engine?.scene;
      if (sc?.fog) sc.fog.density *= 1 + gust * 0.9;
      const lv = Math.round(gust * 4);
      if (lv !== H.gustLevel) { H.gustLevel = lv; try { game.audio?.setAmbience?.('wind', 'wind', 0.25 + gust * 0.5); } catch { /* audio optional */ } }
    }
  }

  // slippery frozen lakes: blend the velocity the controller just computed back towards the previous frame's velocity
  const P = game.player;
  const origUpdate = P.update;
  const wrapped = function (dt, input) {
    const terrain = terrainOf();
    const ice = !!(terrain?.lakes?.length && !this.indoor && !this.inShip && this.grounded && terrain.onIce(this.pos.x, this.pos.z));
    const vx = this.vel.x, vz = this.vel.z;
    const r = origUpdate.call(this, dt, input);
    if (ice && this.grounded && !this.dead) {
      const k = clamp(0.12 * dt * 60, 0.03, 0.4);
      this.vel.x = vx + (this.vel.x - vx) * k;
      this.vel.z = vz + (this.vel.z - vz) * k;
      H.onIce = true;
    } else H.onIce = false;
    return r;
  };
  P.update = wrapped;

  // death text for lava
  const origDeath = game.deathText;
  if (typeof origDeath === 'function') game.deathText = function (cause) { return DEATH[cause] || origDeath.call(this, cause); };

  // ---- mod events --------------------------------------------------------------------------------------------------
  on('netReady', (net) => { chests.bindNet(net); harvest.bindNet(net); });
  on('mapLoaded', (world) => { H.lavaT = 0; H.gustLevel = -1; chests.onMapLoaded(world); harvest.onMapLoaded(world); });
  on('moonPopulated', () => { try { chests.onPopulated(); } catch (e) { console.warn('worldx populate', e); } });
  on('interactables', (out) => { chests.addInteractables(out); harvest.addInteractables(out); });
  on('tfg:pry', (info) => chests.onPry(info));
  on('update', (dt) => {
    chests.update(dt);
    harvest.update(dt);
    const terrain = terrainOf();
    if (terrain) { updateLava(dt, terrain); updateIce(dt, terrain); }
  });

  Object.assign(api, {
    chests: () => chests.list(),
    chest: (id) => chests.get(id),
    openChest: (id) => chests.hostOpen(id, game.selfId),
    harvest, hazards: H,
    landmarks: () => game.world?.outdoor?.landmarks || null,
    dispose() {
      for (const off of offs.splice(0)) { try { off(); } catch { /* ignore */ } }
      if (P.update === wrapped && Object.prototype.hasOwnProperty.call(P, 'update')) delete P.update;
      if (typeof origDeath === 'function' && Object.prototype.hasOwnProperty.call(game, 'deathText')) delete game.deathText;
      chests.dispose(); harvest.dispose();
      const fx = game.engine?.fx;
      if (fx && Math.abs(fx.warp - H.lastWarp) < 1e-4) fx.warp = 0;
    },
  });
  return api;
}
