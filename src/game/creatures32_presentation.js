import { C32_IDS } from './creatures32.js';
import { CREATURES } from './creatures.js';
import { STATE_SOUNDS } from '../entities/creatures.js';
import { IDENT } from './identify.js';
import { FIELD_NOTES } from './collection.js';
import { RULE_LINES } from './crdirector_i18n.js';
import { addTranslations } from '../core/i18n.js';
import { createCreature32 } from '../models/creatures32.js';
import { ensureCreature32Audio } from './creatures32_audio.js';

const NOTES = {
  c32_dormant: 'Turn your light away. Retreat and break sight.',
  c32_ram: 'When its shoulder locks, step aside. Walls stop its charge.',
};
const LINES = {
  c32_dormant: ['SILENT WORKER — ' + NOTES.c32_dormant, 'SESSİZ İŞÇİ — Işığı üstünde tutma. Geri çekilip görüşünü kes.', 'ТИХИЙ РАБОЧИЙ — Отведите свет. Отступите и скройтесь из виду.'],
  c32_ram: ['LANE BREAKER — ' + NOTES.c32_ram, 'HAT KIRICI — Omzu kilitlenince yana çık. Duvar hücumu durdurur.', 'ПРОБИВЩИК — Когда плечо застынет, уйдите в сторону. Стена остановит рывок.'],
};
const FACTORIES = Object.fromEntries(C32_IDS.map(id => [id, () => createCreature32(id)]));

/** Native view/state presentation only. AI and time remain CreatureManager-owned. */
export function installCreature32Presentation(game) {
  for (const id of C32_IDS) {
    CREATURES[id].model = id;
    CREATURES[id].lore = NOTES[id];
    IDENT[id] = ['Anomaly', 3, NOTES[id]];
    FIELD_NOTES[id] = NOTES[id];
    RULE_LINES[id] = LINES[id];
  }
  STATE_SOUNDS.c32_dormant = { wake: ['c32_dormant_wake', .7, 1] };
  STATE_SOUNDS.c32_ram = { windup: ['c32_ram_brake', .8, 1] };
  addTranslations({ 'Silent Worker': 'Sessiz İşçi', 'Lane Breaker': 'Hat Kırıcı',
    [NOTES.c32_dormant]: 'Işığı üstünde tutma. Geri çekilip görüşünü kes.',
    [NOTES.c32_ram]: 'Omzu kilitlenince yana çık. Duvar hücumu durdurur.',
    [LINES.c32_dormant[0]]: LINES.c32_dormant[1], [LINES.c32_ram[0]]: LINES.c32_ram[1] }, 'tr');
  addTranslations({ 'Silent Worker': 'Тихий рабочий', 'Lane Breaker': 'Пробивщик',
    [NOTES.c32_dormant]: 'Отведите свет. Отступите и скройтесь из виду.',
    [NOTES.c32_ram]: 'Когда плечо застынет, уйдите в сторону. Стена остановит рывок.',
    [LINES.c32_dormant[0]]: LINES.c32_dormant[2], [LINES.c32_ram[0]]: LINES.c32_ram[2] }, 'ru');
  const registry = game.mods?.creatureModels || (typeof window !== 'undefined' ? window.__kefalMods?.creatureModels : null);
  for (const id of C32_IDS) if (!registry?.has(id)) registry?.set(id, FACTORIES[id]);
  let disposed = false, audioOff;
  if (!ensureCreature32Audio(game)) audioOff = game.mods?.on?.('update', () => {
    if (ensureCreature32Audio(game)) { audioOff?.(); audioOff = null; }
  });
  // Reuse at most two owned models across landings. WarmSet removes the group but
  // leaves these buffers to this cache; dispose releases each resource once.
  const warmModels = new Map();
  const warmOff = game.mods?.on?.('warm', reg => {
    if (disposed || game.config?.creatures32 !== true || (game.run?.quotaIndex | 0) < 2 || !game.world?.facility) return;
    for (const id of C32_IDS) {
      let model = warmModels.get(id);
      if (!model) {
        model = createCreature32(id);
        model.root.traverse(o => { if (o.geometry) o.geometry.userData.shared = true; });
        warmModels.set(id, model);
      }
      reg(model.root);
    }
  });
  return { dispose() {
    if (disposed) return;
    disposed = true; audioOff?.(); warmOff?.();
    for (const model of warmModels.values()) { model.root.removeFromParent(); model.dispose(); }
    warmModels.clear();
  } };
}
