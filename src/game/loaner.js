// LOANER (wave 8 QA night 1): flashlights must be BOUGHT, so a brand-new profile's first landing (firstrun budget still on, day 1, quota 0) gets one weak
// "Company loaner torch" per crew member on the ship floor: a normal 'flashlight' item with a short battery and a label. It is taken back (removed) at takeoff.
// Host spawns / removes (net 'it' sp / rm, the normal item path); every peer just shows the toast. No new item type, no new net message.
import { addTranslations, t } from '../core/i18n.js';

const LOAN_BATTERY = 70;   // seconds of light (a bought flashlight has 150)
const TR = { 'Company loaner torch': 'Şirket ödünç feneri', 'A Company loaner torch lies on the ship floor. It goes back at the end of the day.': 'Gemi zeminde bir Şirket ödünç feneri duruyor. Gün sonunda geri alınır.' };
const RU = { 'Company loaner torch': 'Служебный фонарик Компании', 'A Company loaner torch lies on the ship floor. It goes back at the end of the day.': 'На полу корабля лежит служебный фонарик Компании. В конце дня его заберут.' };

export function installLoaner(game) {
  const mods = game.mods;
  if (!mods) return null;
  addTranslations(TR, 'tr'); addTranslations(RU, 'ru');
  let ids = [], disposed = false, prev = null;
  const fr = () => game.onboard?.fr;
  const wanted = () => { const f = fr(); return !!f && f.stage() !== 'free' && f.firstDay() && !!game.world?.facility; };
  const returnAll = () => {
    if (game.isHost) for (const id of ids) { try { if (game.items?.get?.(id)) game.net.broadcast('it', { e: 'rm', id }); } catch { /* item gone */ } }
    ids = [];
  };
  const off = mods.on('phase', (ph, g) => {
    if (disposed || (g && g !== game)) return;
    const was = prev; prev = ph;
    if (ph === 'moon' && was === 'landing' && wanted()) {
      try { game.ui?.toast?.(t('A Company loaner torch lies on the ship floor. It goes back at the end of the day.'), 'info'); } catch { /* ui optional */ }
      if (game.isHost && game.items?.hostSpawn) {
        const p = game.player.pos, n = 1 + (game.remotes?.size || 0);
        for (let i = 0; i < n; i++) {
          try { ids.push(game.items.hostSpawn('flashlight', { x: p.x + (i - (n - 1) / 2) * 0.5, y: p.y + 1, z: p.z + 0.8 }, { battery: LOAN_BATTERY, label: t('Company loaner torch') })); } catch (e) { console.warn('[loaner]', e); }
        }
      }
    } else if (ph === 'takeoff' || ph === 'orbit' || ph === 'fired') returnAll();
  });
  return { get ids() { return ids.slice(); }, dispose() { disposed = true; try { off?.(); } catch { /* ignore */ } returnAll(); } };
}
