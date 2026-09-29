// "fun" wave-1 module installer: wardrobe / cosmetics, football, crew tasks, echo mode.
// game.js: `this.useModule('fun', installFun);` -> game.fun = { cosmetics, football, tasks, echo }; also game.cosmetics.
// Every sub-system is independent and failure-isolated (a bug in one never takes down the others or the game).
import * as THREE from 'three';
import { installCosmetics, SYMBIOTE_ID } from './cosmetics.js';
import { installFootball } from './football.js';
import { installTasks } from './tasks.js';
import { installEcho } from './echo.js';
import { openWardrobe, makeWardrobeButton } from '../ui/panels/wardrobe.js';
import { t, addTranslations } from '../core/i18n.js';
import { SPOTS } from '../world/shiplayout.js';

addTranslations({
  'GOAL!': 'GOL!', 'Kick the ball [LMB / E]': 'Topa vur [SOL TIK / E]', 'ALL TASKS DONE': 'TÜM GÖREVLER TAMAM', 'Team bonus is paid at day end': 'Takım ödülü gün sonunda ödenir',
  'All crew tasks done - team bonus at day end!': 'Tüm ekip görevleri tamam - takım ödülü gün sonunda!', 'TASKS {a}/{b} · crew {c}/{d}': 'GÖREVLER {a}/{b} · ekip {c}/{d}',
  '{name} finished a task ({d}/{n})': '{name} bir görevi bitirdi ({d}/{n})',
});

const MIRROR_POS = new THREE.Vector3(SPOTS.mirror.x, 1.3, 3.22);   // in front of the ship mirror (shipfeatures.js MIRROR, +z wall)

/** Symbiote Sample: a jar with something black that looks back */
function createSymbioteModel(T = THREE) {
  const g = new T.Group();
  const glass = new T.Mesh(new T.CylinderGeometry(0.075, 0.075, 0.2, 8), new T.MeshLambertMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.35, depthWrite: false }));
  glass.position.y = 0.1; g.add(glass);
  const lid = new T.Mesh(new T.CylinderGeometry(0.08, 0.08, 0.03, 8), new T.MeshLambertMaterial({ color: 0x3a3f48 }));
  lid.position.y = 0.215; g.add(lid);
  const goo = new T.Mesh(new T.IcosahedronGeometry(0.06, 1), new T.MeshLambertMaterial({ color: 0x07070c, emissive: 0x0b0d1a, flatShading: true }));
  goo.position.y = 0.085; goo.scale.set(1, 1.3, 1); g.add(goo);
  const eyeMat = new T.MeshBasicMaterial({ color: 0xffffff });
  for (const s of [-1, 1]) {
    const eye = new T.Mesh(new T.BoxGeometry(0.032, 0.012, 0.01), eyeMat);
    eye.position.set(s * 0.024, 0.115, 0.052); eye.rotation.z = -s * 0.5; g.add(eye);
  }
  const tendril = new T.Mesh(new T.CylinderGeometry(0.008, 0.014, 0.1, 4), goo.material);
  tendril.position.set(0.03, 0.17, 0.0); tendril.rotation.z = -0.5; g.add(tendril);
  return g;
}

// ------------------------------------------------------------------ character sheet: WARDROBE button (main menu + in-game)
let charHookInstalled = false;
function installCharacterHook() {
  if (charHookInstalled || typeof document === 'undefined') return;
  charHookInstalled = true;
  const root = document.getElementById('ui');
  if (!root) return;
  let queued = false;
  const scan = () => {
    queued = false;
    for (const frame of root.querySelectorAll('.menu-frame.char')) {
      if (frame.querySelector('[data-fun="wardrobe"]')) continue;
      const body = frame.querySelector('.cp-body');
      if (!body) continue;
      const ui = window.kefal?.ui;
      if (!ui) continue;
      const row = document.createElement('div');
      row.className = 'menu-row';
      row.appendChild(makeWardrobeButton(ui, () => window.kefal?.game || null));
      body.insertBefore(row, body.lastElementChild);
    }
  };
  new MutationObserver(() => { if (!queued) { queued = true; setTimeout(scan, 30); } }).observe(root, { childList: true, subtree: true });
}
installCharacterHook();

export function installFun(game) {
  const fun = { cosmetics: null, football: null, tasks: null, echo: null, openWardrobe: null };
  const guard = (name, fn) => { try { fun[name] = fn(game) || null; } catch (e) { console.warn('[fun]', name, e); fun[name] = null; } };

  guard('cosmetics', installCosmetics);
  const open = (from) => openWardrobe({ game, profile: game.profile, ui: game.ui, from });
  fun.openWardrobe = open;
  if (fun.cosmetics) fun.cosmetics.open = open;

  // strange item model (all peers register it; only the host rolls it into the scrap tables)
  try {
    const mm = game.mods;
    if (mm?.itemModels && !mm.itemModels.has(SYMBIOTE_ID)) mm.itemModels.set(SYMBIOTE_ID, (T) => createSymbioteModel(T || THREE));
  } catch (e) { console.warn('[fun] symbiote model', e); }

  guard('football', installFootball);
  guard('tasks', installTasks);
  // guard('echo', installEcho);   // wave 8 (owner): dead players only spectate - no ghost haunting

  // ship mirror + suit rack open the wardrobe
  const offInteract = game.mods.on('interactables', (list, g) => {
    if (g !== game) return;
    const p = game.player;
    if (!p || p.dead || !p.inShip || !game.cosmetics) return;
    const rack = game.ship?.points?.suits;
    for (const ip of list) if (rack && ip.pos === rack) { ip.label = t('Open wardrobe [E]'); ip.action = () => open(); }
    list.push({ pos: MIRROR_POS, r: 0.95, reach: 3.4, label: t('Open wardrobe [E]'), sub: 'Mirror', action: () => open() });
  });

  return {
    ...fun,
    dispose() {
      try { offInteract?.(); } catch { /* ignore */ }
      for (const k of ['echo', 'tasks', 'football', 'cosmetics']) { try { fun[k]?.dispose?.(); } catch (e) { console.warn('[fun] dispose', k, e); } fun[k] = null; }
      game.cosmetics = null;
    },
  };
}
