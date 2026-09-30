// CREATURES10 wave 10 - installer of the three internet-horror creatures (docs/wave10/creatures10.md).
//   Buffering (c10_buffering), The Doomscroller (c10_doomscroller), The Ratio (c10_ratio). Pure rules: creatures10_core.js; host AI + registration: creatures10_ai.js;
//   models: models/creatures10_models.js; sounds: creatures10_sfx.js; TR + RU: creatures10_text.js. No net messages: everything rides the generic creature
//   channels (cev sp / snd / hp / die + the 'cs' snapshot rows, where `extra` carries the ring fill / dwell meter / twin mode).
// Debug (host): kefal.game.creatures10.debugSpawn('buffering' | 'doom' | 'ratio') puts one 8 m in front of you.
import * as THREE from 'three';
import { addTranslations } from '../core/i18n.js';
import { registerC10Content, setC10Game } from './creatures10_ai.js';
import { TR, RU } from './creatures10_text.js';
import { registerC10Models } from '../models/creatures10_models.js';
import { ensureC10Sounds } from './creatures10_sfx.js';
import { IDS } from './creatures10_core.js';

const KIND = { buffering: IDS.buffering, doom: IDS.doom, doomscroller: IDS.doom, ratio: IDS.ratio };

export function installCreatures10(game) {
  const g = game;
  setC10Game(g);
  registerC10Content();
  addTranslations(TR, 'tr'); addTranslations(RU, 'ru');
  const mm = (typeof window !== 'undefined' ? window.__kefalMods : null) || g.mods;
  registerC10Models(mm?.creatureModels);
  // the recipes render into audio.buffers once an AudioContext exists (created on the first user gesture): poll a few times, then stop
  let timer = 0, tries = 0, disposed = false;
  const pump = () => {
    timer = 0;
    if (disposed) return;
    let done = false;
    try { done = ensureC10Sounds(g); } catch (e) { console.warn('c10 sounds', e); }
    if (!done && ++tries < 60) timer = setTimeout(pump, 2000);
  };
  pump();

  const api = {
    ids: IDS,
    debugSpawn(kind = 'buffering') {
      const id = KIND[kind];
      if (!id || !g.isHost || !g.creatures?.hostSpawn) return false;
      const dir = new THREE.Vector3(-Math.sin(g.player.yaw), 0, -Math.cos(g.player.yaw));
      const pos = g.player.pos.clone().addScaledVector(dir, 8);
      return !!g.creatures.hostSpawn(id, pos, { zone: 'in', yaw: g.player.yaw + Math.PI });
    },
    state() {
      const out = [];
      for (const c of g.creatures?.host?.values?.() || []) if (Object.values(IDS).includes(c.type) && !c.dead) out.push({ id: c.id, type: c.type, state: c.state, extra: c.extra, x: +c.pos.x.toFixed(1), y: +c.pos.y.toFixed(1), z: +c.pos.z.toFixed(1) });
      return out;
    },
    dispose() { disposed = true; if (timer) clearTimeout(timer); timer = 0; setC10Game(null); },
  };
  return api;
}
