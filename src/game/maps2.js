// MAPS2 runtime (wave 2, module 'maps2'): the interactive part of the new facility rooms (src/world/rooms2.js).
// SHIPPED: story-room notes (readable, tie into docs/LORE.md), room light switches (pooled emitter intensity, light count
// never changes), the nursery music box. Local-only state (no host state needed: notes are read-only flavour, lights are
// cosmetic). NOT shipped yet (rooms are built but switched off, see M2_CHALLENGE_ON): challenge-room mechanics, drawers /
// PCs / radios / phones / vending state, Collapse / Migration / Elevator Stop events, outdoor landmarks. docs/wave2/maps2.md.
import { t } from '../core/i18n.js';
import { NOTES } from './maps2_text.js';
import { MINIGAMES } from '../minigames/index.js';
import { createNotePanel } from '../ui/facilityhud.js';

const TUNE = [0, 2, 4, 0, 0, 2, 4, 0, 4, 5, 7, 4, 5, 7];   // semitone steps of a simple lullaby (bell_ding pitched)

export function installMaps2(game) {
  const offs = [];
  const on = (ev, fn) => { const off = game.mods?.on?.(ev, fn); if (off) offs.push(off); };
  MINIGAMES.m2_note = MINIGAMES.m2_note || createNotePanel;
  const lightState = new Map();   // room id -> { on, base: [[emitter, intensity]] }
  let tune = 0;

  const fac = () => (game.world?.facility?.m2 ? game.world.facility : null);
  const roomRect = (F, id) => { const L = F.layout, r = L.rooms[id], C = L.cell; return { x0: L.ox + r.x * C, z0: L.oz + r.z * C, x1: L.ox + (r.x + r.w) * C, z1: L.oz + (r.z + r.h) * C }; };
  function toggleLights(F, roomId) {
    let st = lightState.get(roomId);
    if (!st) {
      const rc = roomRect(F, roomId), base = [];
      for (const e of F.emitters) if (e.group === 'facility' && e.pos.x > rc.x0 && e.pos.x < rc.x1 && e.pos.z > rc.z0 && e.pos.z < rc.z1 && e.pos.y > F.layout.y && e.pos.y < F.layout.y + 12) base.push([e, e.intensity]);
      st = { on: true, base };
      lightState.set(roomId, st);
    }
    st.on = !st.on;
    for (const [e, v] of st.base) e.intensity = st.on ? v : 0;
    game.audio?.play?.('flashlight_click', { volume: 0.5, bus: 'sfx' });
  }
  function playTune(pos) {
    if (tune > 0) return;
    tune = TUNE.length;
    TUNE.forEach((semi, i) => setTimeout(() => { try { game.audio?.at?.('bell_ding', pos, 0.35, { pitch: 1.6 * Math.pow(2, semi / 12) }); } catch { /* audio optional */ } tune = Math.max(0, tune - 1); }, i * 380));
  }
  function readNote(story) {
    const n = NOTES[story];
    if (!n) return;
    game.audio?.play?.('cloth_rustle', { volume: 0.5, bus: 'sfx' });
    game.openMinigame('m2_note', { title: t(n.title), sub: t(n.sub), lines: n.lines.map((l, i) => t(l) + (i < n.lines.length - 1 ? '\n' : '')), noEase: true }, () => {});
  }

  on('interactables', (list) => {
    try {
      const F = fac(), p = game.player;
      if (!F || !p?.indoor || p.dead) return;
      const near = (x, z, r) => (p.pos.x - x) * (p.pos.x - x) + (p.pos.z - z) * (p.pos.z - z) < r * r;
      const V = game.player.pos.constructor;
      for (const s of F.m2.spots) {
        if (!near(s.x, s.z, 4)) continue;
        if (s.k === 'note') list.push({ pos: new V(s.x, s.y, s.z), r: 0.5, reach: 2.4, label: t('Read the note [E]'), action: () => readNote(s.story) });
        else if (s.k === 'musicbox') list.push({ pos: new V(s.x, s.y, s.z), r: 0.45, reach: 2.4, label: t('Wind the music box [E]'), action: () => playTune(new V(s.x, s.y, s.z)) });
      }
      for (const s of F.m2.switches) {
        if (!near(s.x, s.z, 3.5)) continue;
        list.push({ pos: new V(s.x, s.y, s.z), r: 0.3, reach: 2.2, label: () => (lightState.get(s.room)?.on === false ? t('Switch the lights on [E]') : t('Switch the lights off [E]')), action: () => toggleLights(F, s.room) });
      }
    } catch (e) { console.warn('maps2 interactables', e); }
  });
  on('mapLoaded', () => { lightState.clear(); });

  return {
    /** debug / tests */
    state: () => { const F = fac(); return F ? { rooms: F.m2.rooms.map((r) => r.id), spots: F.m2.spots.length, switches: F.m2.switches.length, windows: F.m2.windows?.list.length || 0 } : null; },
    dispose() { for (const off of offs) { try { off(); } catch { /* ignore */ } } offs.length = 0; if (MINIGAMES.m2_note === createNotePanel) delete MINIGAMES.m2_note; lightState.clear(); },
  };
}
