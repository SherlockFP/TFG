// MOONS10 (wave 10, docs/wave10/moons10.md): two new outdoor-identity moons. Installed with this.useModule('moons10', installMoons10) -> game.moons10.
//   x503   503-SERVICE UNAVAILABLE  frozen tundra of dead data centers (cooling towers, half-buried racks, a fallen satellite dish, the last technician's hut)
//   x8feed ∞-FEED                   dune desert of fallen phone screens, a colossal cracked phone at the horizon, red notification badges in the air
// The moons + biomes + route-board data are registered at IMPORT (moons10_core.js) so every peer knows them before any run state arrives; the geometry is biome decor
// (world/moons10_decor.js, built by terrain.js from the map seed on every peer). This runtime part only adds what needs the game object:
//   - the [E] reader of the story-beat notes (the same note the world paper shows), through the existing m2_note reader when present
//   - the outdoor ambience bed (a tundra has no crickets; the wind layer is driven by the gusts in the decor)
// No network messages: everything is seeded local presentation.
import { t } from '../core/i18n.js';
import { MOONS } from './moons.js';
import { TUNDRA, FEED, isMoon10 } from './moons10_core.js';
import { TX } from './moons10_text.js';
import '../world/moons10_decor.js';   // registers the decor kinds 'tundra503' / 'feed8'

const NOTES = { x503_note: ['x503_note_title', 'x503_note_sub', 'x503_note'], feed_note: ['feed_note_title', 'feed_note_sub', 'feed_note'] };
const lineOf = (key) => t(TX[key][0]);

export function installMoons10(game) {
  const mods = game.mods;
  if (!mods) return null;
  const offs = [], restores = [];
  let disposed = false;
  const mine = () => isMoon10(game.world?.moonId);

  function read(id) {
    const n = NOTES[id];
    if (!n) return;
    const title = lineOf(n[0]), sub = lineOf(n[1]), body = lineOf(n[2]);
    try { game.audio?.play?.('cloth_rustle', { volume: 0.5, bus: 'sfx' }); } catch { /* audio optional */ }
    if (typeof game.openMinigame === 'function') {
      try { game.openMinigame('m2_note', { title, sub, lines: [body], noEase: true }, () => {}); return; } catch { /* fall back to a toast */ }
    }
    game.ui?.toast?.(title + ': ' + body, 'info', 9000);
  }

  offs.push(mods.on('interactables', (out, g) => {
    if (g && g !== game) return;
    const p = game.player;
    if (disposed || !p || p.dead || p.indoor || p.inShip || !mine()) return;
    const notes = game.world?.outdoor?.decor?.info?.notes;
    if (!notes?.length) return;
    const V = p.pos.constructor;
    for (const n of notes) {
      if ((p.pos.x - n.x) ** 2 + (p.pos.z - n.z) ** 2 > 36) continue;
      out.push({ pos: new V(n.x, n.y, n.z), r: 0.5, reach: 2.6, label: t(TX.note_btn[0]), sub: lineOf(NOTES[n.id][0]), action: () => read(n.id) });
    }
  }));

  // outdoor ambience bed: the tundra has wind (not crickets); the desert keeps its daytime bed and swaps the night crickets for a low wind
  if (typeof game.updateAmbience === 'function') {
    const own = Object.prototype.hasOwnProperty.call(game, 'updateAmbience'), orig = game.updateAmbience;
    const wrapped = function () {
      orig.call(this);
      try {
        const a = this.audio, p = this.player, id = this.world?.moonId;
        if (disposed || !a || !p || p.indoor || p.inShip || this.world?.company || !isMoon10(id) || this.run?.phase === 'orbit') return;
        if (id === TUNDRA) a.setAmbience('base', 'wind', 0.4);
        else if (id === FEED && (this.run?.time || 480) > 19 * 60) a.setAmbience('base', 'wind', 0.22);
      } catch { /* audio optional */ }
    };
    game.updateAmbience = wrapped;
    restores.push(() => { if (game.updateAmbience !== wrapped) return; if (own) game.updateAmbience = orig; else delete game.updateAmbience; });
  }

  return {
    ids: [FEED, TUNDRA],
    /** the seeded layout of the map that is loaded now (null elsewhere): { towers, halls, dish, hut, ... } / { giant, slabs, plug, cable, badges, beat } */
    plan: () => (mine() ? game.world?.outdoor?.decor?.info?.plan || null : null),
    read,
    moons: () => [MOONS[FEED], MOONS[TUNDRA]],
    dispose() {
      disposed = true;
      for (const o of offs) { try { o?.(); } catch { /* gone */ } }
      for (const r of restores.reverse()) { try { r(); } catch { /* gone */ } }
    },
  };
}
