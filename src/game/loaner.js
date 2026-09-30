// LOANER (wave 8 QA night 1): flashlights must be BOUGHT, so a brand-new profile's landing until quota 1 is met (firstrun budget still on) gets one weak
// "Company loaner torch" per crew member on the ship floor: a normal 'flashlight' item with a short battery and a label. It is taken back (removed) at takeoff.
// Host spawns only the unlit crew shortfall / removes tracked temporary loans (normal 'it' path). Announcement only follows actual grants.
import { insideShip } from '../world/ship.js';
import { addTranslations, t, sysMsg } from '../core/i18n.js';

const LOAN_BATTERY = 70;   // seconds of light (a bought flashlight has 150)
const TR = { 'Company loaner torch': 'Şirket ödünç feneri', 'A Company loaner torch lies on the ship floor. It goes back at the end of the day.': 'Gemi zeminde bir Şirket ödünç feneri duruyor. Gün sonunda geri alınır.' };
const RU = { 'Company loaner torch': 'Служебный фонарик Компании', 'A Company loaner torch lies on the ship floor. It goes back at the end of the day.': 'На полу корабля лежит служебный фонарик Компании. В конце дня его заберут.' };

// A charged light in any owned inventory location counts; empty batteries do not.
export function loanerNeed(game) {
  const crew = new Set([game.selfId, ...game.remotes.keys()]);
  const lit = new Set(); let floor = 0;
  for (const it of game.items.all()) {
    if (!['flashlight', 'proflash'].includes(it.type) || !(it.battery > 0)) continue;
    if (it.state === 'held' && crew.has(it.holder)) lit.add(it.holder);
    else if (it.state === 'world' && !it.carrier && !it.owner && insideShip(it.obj.position)) floor++;
  }
  return Math.max(0, crew.size - lit.size - floor);
}

export function installLoaner(game) {
  const mods = game.mods;
  if (!mods) return null;
  addTranslations(TR, 'tr'); addTranslations(RU, 'ru');
  let ids = [], disposed = false, prev = null;
  const fr = () => game.onboard?.fr;
  const wanted = () => { const f = fr(); return !!f && f.stage() !== 'free' && !!game.world?.facility; };
  const returnAll = () => {
    if (game.isHost) for (const id of ids) { try { if (game.items?.get?.(id)) game.net.broadcast('it', { e: 'rm', id }); } catch { /* item gone */ } }
    ids = [];
  };
  const off = mods.on('phase', (ph, g) => {
    if (disposed || (g && g !== game)) return;
    const was = prev; prev = ph;
    if (ph === 'moon' && was === 'landing' && wanted()) {
      if (game.isHost && game.items?.hostSpawn) {
        const p = game.player.pos, n = loanerNeed(game);
        const before = ids.length;
        for (let i = 0; i < n; i++) {
          try { ids.push(game.items.hostSpawn('flashlight', { x: p.x + (i - (n - 1) / 2) * 0.5, y: p.y + 1, z: p.z + 0.8 }, { battery: LOAN_BATTERY, label: t('Company loaner torch') })); } catch (e) { console.warn('[loaner]', e); }
        }
        if (ids.length > before) game.net.broadcast('sys', sysMsg('A Company loaner torch lies on the ship floor. It goes back at the end of the day.', {}, 'info'));
      }
    } else if (ph === 'takeoff' || ph === 'orbit' || ph === 'fired') returnAll();
  });
  return { get ids() { return ids.slice(); }, dispose() { disposed = true; try { off?.(); } catch { /* ignore */ } returnAll(); } };
}
