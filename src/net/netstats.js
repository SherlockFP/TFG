// NETSTATS: live network diagnostics (terminal NETSTATS, chat /net). Samples the Session counters once per second
// and reports packets/s, messages/s, KB/s in/out, the busiest message types and the ping to every peer.
import { addTranslations } from '../core/i18n.js';
addTranslations({
  'Connection to the host lost - trying to reconnect...': 'Host ile bağlantı koptu - yeniden bağlanılıyor...',
  'Reconnected to the host.': 'Host ile yeniden bağlandın.',
  '{name}: connection lost, waiting for them to come back...': '{name}: bağlantı koptu, geri dönmesi bekleniyor...',
  '{name} reconnected.': '{name} yeniden bağlandı.',
  'Network unstable: no data from the host...': 'Ağ kararsız: host\'tan veri gelmiyor...',
  'Reconnected - world state resynced.': 'Yeniden bağlandın - dünya durumu eşitlendi.',
  'Lost connection to the host (network problem, could not reconnect). Session ended.': 'Host ile bağlantı koptu (ağ sorunu, yeniden bağlanılamadı). Oturum bitti.',
  'The host has left. Session ended.': 'Host ayrıldı. Oturum bitti.',
  'P2P connection blocked even through the TURN relay (check the TURN settings).': 'P2P bağlantısı TURN relay üzerinden bile kurulamadı (TURN ayarlarını kontrol et).',
  'P2P connection blocked by a router / mobile network (NAT). A TURN relay is needed - see docs/MULTIPLAYER_HOTFIX.md.': 'P2P bağlantısını modem / mobil ağ (NAT) engelledi. TURN relay gerekiyor - docs/MULTIPLAYER_HOTFIX.md.',
  'A player could not connect:': 'Bir oyuncu bağlanamadı:',
  'Could not connect to the host:': "Host'a bağlanılamadı:",
  'Signal relays reachable: {open}/{total}': 'Ulaşılabilen sinyal relay: {open}/{total}',
  'Players online in the lobby network: {n}': 'Lobi ağında çevrimiçi oyuncu: {n}',
  'No signal relay reachable from this network - servers cannot be listed or joined.': "Bu ağdan hiçbir sinyal relay'e ulaşılamıyor - sunucular listelenemez ve katılınamaz.",
  "Network relay (TURN)": "Ağ relay (TURN)",
  "TURN URLs": "TURN adresleri",
  "Username": "Kullanıcı adı",
  "username": "kullanıcı adı",
  "Password": "Şifre",
  "Test": "Test et",
  "Forget relay": "Relay'i unut",
  "TURN relay saved (used from the next session).": "TURN relay kaydedildi (bir sonraki oturumdan itibaren kullanılır).",
  "TURN relay removed.": "TURN relay kaldırıldı.",
  "No TURN relay: friends behind strict NAT / mobile data may not be able to join you.": "TURN relay yok: sıkı NAT / mobil veri arkasındaki arkadaşların sana katılamayabilir.",
  "Enter at least one turn: or turns: URL.": "En az bir turn: veya turns: adresi gir.",
  "Testing the relay...": "Relay test ediliyor...",
  "TURN relay works.": "TURN relay çalışıyor.",
  "TURN relay did not answer:": "TURN relay cevap vermedi:",
  "check the URL, username and password": "adresi, kullanıcı adını ve şifreyi kontrol et",
  "Only the host needs this. Get free TURN credentials (e.g. metered.ca), paste them here, Test, Save, then host a new lobby.": "Bunu sadece host doldurur. Ücretsiz TURN bilgisi al (örn. metered.ca), buraya yapıştır, Test et, Kaydet, sonra yeni lobi kur.",
}, 'tr');
addTranslations({
  'Connection to the host lost - trying to reconnect...': 'Связь с хостом потеряна - переподключение...',
  'Reconnected to the host.': 'Снова на связи с хостом.',
  '{name}: connection lost, waiting for them to come back...': '{name}: связь потеряна, ждём возвращения...',
  '{name} reconnected.': '{name} снова в сети.',
  'Network unstable: no data from the host...': 'Сеть нестабильна: от хоста нет данных...',
  'Reconnected - world state resynced.': 'Переподключено - состояние мира синхронизировано.',
  'Lost connection to the host (network problem, could not reconnect). Session ended.': 'Связь с хостом потеряна (проблема сети). Сессия завершена.',
  'The host has left. Session ended.': 'Хост вышел. Сессия завершена.',
  'P2P connection blocked even through the TURN relay (check the TURN settings).': 'P2P-соединение не прошло даже через TURN (проверьте настройки TURN).',
  'P2P connection blocked by a router / mobile network (NAT). A TURN relay is needed - see docs/MULTIPLAYER_HOTFIX.md.': 'P2P-соединение заблокировано роутером / мобильной сетью (NAT). Нужен TURN-сервер - см. docs/MULTIPLAYER_HOTFIX.md.',
  'A player could not connect:': 'Игрок не смог подключиться:',
  'Could not connect to the host:': 'Не удалось подключиться к хосту:',
  'Signal relays reachable: {open}/{total}': 'Доступно сигнальных реле: {open}/{total}',
  'Players online in the lobby network: {n}': 'Игроков в сети лобби: {n}',
  'No signal relay reachable from this network - servers cannot be listed or joined.': 'Из этой сети недоступно ни одно сигнальное реле - серверы не видны и к ним нельзя подключиться.',
  'Network relay (TURN)': 'Сетевое реле (TURN)',
  'TURN URLs': 'Адреса TURN',
  'Username': 'Имя пользователя',
  'username': 'имя пользователя',
  'Password': 'Пароль',
  'Test': 'Проверить',
  'Forget relay': 'Забыть реле',
  'TURN relay saved (used from the next session).': 'TURN сохранён (со следующей сессии).',
  'TURN relay removed.': 'TURN удалён.',
  'No TURN relay: friends behind strict NAT / mobile data may not be able to join you.': 'Нет TURN: друзья за строгим NAT / мобильным интернетом могут не подключиться.',
  'Enter at least one turn: or turns: URL.': 'Введите хотя бы один адрес turn: или turns:.',
  'Testing the relay...': 'Проверка реле...',
  'TURN relay works.': 'TURN работает.',
  'TURN relay did not answer:': 'TURN не ответил:',
  'check the URL, username and password': 'проверьте адрес, имя и пароль',
  'Only the host needs this. Get free TURN credentials (e.g. metered.ca), paste them here, Test, Save, then host a new lobby.': 'Нужно только хосту. Получите бесплатные данные TURN (например, metered.ca), вставьте, проверьте, сохраните и создайте новое лобби.',
}, 'ru');

export function installNetStats(game) {
  const hist = [];
  let prev = null, timer = null;
  const snap = () => {
    const s = game.net?.stats;
    if (!s) return;
    const cur = { t: performance.now(), sent: s.sent, pOut: s.packetsOut, pIn: s.packetsIn, bOut: s.bytesOut, bIn: s.bytesIn, types: { ...s.byType } };
    if (prev) {
      const dt = Math.max(0.001, (cur.t - prev.t) / 1000);
      const types = Object.entries(cur.types).map(([k, v]) => [k, (v - (prev.types[k] || 0)) / dt]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
      hist.push({ msgs: (cur.sent - prev.sent) / dt, pOut: (cur.pOut - prev.pOut) / dt, pIn: (cur.pIn - prev.pIn) / dt, kOut: (cur.bOut - prev.bOut) / dt / 1024, kIn: (cur.bIn - prev.bIn) / dt / 1024, types });
      if (hist.length > 10) hist.shift();
    }
    prev = cur;
  };
  const report = async () => {
    const net = game.net;
    if (!net) return 'Not connected.';
    net.measureBytes = true;
    if (!timer) timer = setInterval(snap, 1000);
    if (hist.length < 2) return 'NETSTATS: measuring... run the command again in 3 seconds.';
    const avg = (k) => hist.reduce((a, h) => a + h[k], 0) / hist.length;
    const last = hist[hist.length - 1];
    const lines = [
      `NETSTATS (${hist.length}s avg)  role: ${net.isHost ? 'HOST' : 'CLIENT'}  peers: ${net.peerIds().length}  relayed: ${net.stats.relayed}`,
      `out: ${avg('msgs').toFixed(1)} msg/s in ${avg('pOut').toFixed(1)} packets/s  ${avg('kOut').toFixed(1)} KB/s`,
      `in:  ${avg('pIn').toFixed(1)} packets/s  ${avg('kIn').toFixed(1)} KB/s`,
      `NETSTATS link: reconnects ${net.stats.reconnects}  lost ${net.stats.lost} (now ${net.lost?.size || 0})  grace-expired ${net.stats.graceExpired}  rejoins ${net.stats.rejoins}  stalls ${net.stats.stalls}  dropped ${net.stats.dropped}  split-packets ${net.stats.splits}`,
      'top types: ' + last.types.slice(0, 6).map(([k, v]) => `${k} ${v.toFixed(1)}/s`).join('  '),
    ];
    const rs = net.transport.relayStatus?.();
    if (rs) lines.push(`signal relays open: ${rs.open}/${rs.total}  strategy: ${net.strategy}  TURN: ${net.transport.hasTurn ? 'yes' : 'no'}`);
    let links = {};
    try { links = (await net.transport.linkInfo?.()) || {}; } catch { /* ignore */ }
    for (const id of net.peerIds()) {
      let ms = -1;
      try { ms = await net.transport.ping?.(id); } catch { /* ignore */ }
      const L = links[id];
      // path host->host = same LAN, srflx = direct through NAT (STUN), relay = through the TURN server
      lines.push(`ping ${(net.players.get(id)?.name || id).slice(0, 14)}: ${ms >= 0 ? Math.round(ms) + ' ms' : 'n/a'}${L ? `  ice ${L.ice}  path ${L.path}` : ''}${net.players.has(id) ? '' : '  (not admitted)'}`);
    }
    if (net.lost?.size) lines.push('lost (grace): ' + [...net.lost.keys()].map((id) => net.players.get(id)?.name || id).join(', '));
    return lines.join('\n');
  };
  const api = window.KefalAPI;
  api?.registerCommand?.('netstats', async (rest, term) => term.print(await report()), 'Network diagnostics: packets, KB/s, top message types, ping');
  api?.registerChatCommand?.('net', async (rest, g) => g.ui.systemMessage((await report()).split('\n').slice(0, 5).join(' | ')));
  return { report, dispose() { clearInterval(timer); timer = null; if (game.net) game.net.measureBytes = false; } };
}
