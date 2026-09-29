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
    for (const id of net.peerIds()) {
      let ms = -1;
      try { ms = await net.transport.ping?.(id); } catch { /* ignore */ }
      lines.push(`ping ${(net.players.get(id)?.name || id).slice(0, 14)}: ${ms >= 0 ? Math.round(ms) + ' ms' : 'n/a'}`);
    }
    return lines.join('\n');
  };
  const api = window.KefalAPI;
  api?.registerCommand?.('netstats', async (rest, term) => term.print(await report()), 'Network diagnostics: packets, KB/s, top message types, ping');
  api?.registerChatCommand?.('net', async (rest, g) => g.ui.systemMessage((await report()).split('\n').slice(0, 5).join(' | ')));
  return { report, dispose() { clearInterval(timer); timer = null; if (game.net) game.net.measureBytes = false; } };
}
