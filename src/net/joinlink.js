// [joinplay] Join link: ?join=CODE&net=MODE. The net mode travels inside the link so a friend can never pick a different one by hand.
import { t, tf, addTranslations } from '../core/i18n.js';

export const NET_MODES = ['nostr', 'mqtt', 'torrent', 'local'];

addTranslations({
  'ADVANCED': 'GELİŞMİŞ', 'PLAY': 'OYNA',
  'Copy join link': 'Katılma bağlantısını kopyala', 'Join link copied': 'Katılma bağlantısı kopyalandı', 'Copy failed: {link}': 'Kopyalanamadı: {link}',
  'LOBBY {code}': 'LOBİ {code}', 'You are the host. Lobby code: {code}. ESC > Copy join link': 'Sen hostsun. Lobi kodu: {code}. ESC > Katılma bağlantısını kopyala',
  'Join with code {code} or ESC > Copy join link': '{code} koduyla katıl ya da ESC > Katılma bağlantısını kopyala',
}, 'tr');
addTranslations({
  'ADVANCED': 'ДОПОЛНИТЕЛЬНО', 'PLAY': 'ИГРА',
  'Copy join link': 'Скопировать ссылку', 'Join link copied': 'Ссылка скопирована', 'Copy failed: {link}': 'Не удалось скопировать: {link}',
  'LOBBY {code}': 'ЛОББИ {code}', 'You are the host. Lobby code: {code}. ESC > Copy join link': 'Ты хост. Код лобби: {code}. ESC > Скопировать ссылку',
  'Join with code {code} or ESC > Copy join link': 'Входи по коду {code} или ESC > Скопировать ссылку',
}, 'ru');

/** "?join=CODE&net=X" -> { code, strategy } or null. Code is upper-cased and stripped; an unknown mode falls back to `fallback`. */
export function parseJoin(search, fallback = 'nostr') {
  let qs; try { qs = new URLSearchParams(search); } catch { return null; }
  const code = String(qs.get('join') || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 24);
  if (code.length < 4) return null;
  const net = String(qs.get('net') || '').toLowerCase();
  return { code, strategy: NET_MODES.includes(net) ? net : (NET_MODES.includes(fallback) ? fallback : 'nostr') };
}

/** Absolute link for the running session (host or client). */
export function joinLinkFor(game, loc = (typeof location !== 'undefined' ? location : { origin: 'http://localhost', pathname: '/' })) {
  const code = game?.net?.code || '', net = game?.net?.strategy || 'nostr';
  if (!code) return '';
  return `${loc.origin}${loc.pathname}?join=${encodeURIComponent(code)}&net=${encodeURIComponent(net)}`;
}

/** Copy the link and toast the result (shows the link itself if the clipboard is refused). */
export async function copyJoinLink(ui, game) {
  const link = joinLinkFor(game);
  if (!link) return false;
  let ok = false;
  try { await navigator.clipboard.writeText(link); ok = true; } catch { /* clipboard refused (focus / permissions) */ }
  ui?.toast?.(ok ? t('Join link copied') : tf('Copy failed: {link}', { link }), ok ? 'good' : 'info');
  return ok;
}
