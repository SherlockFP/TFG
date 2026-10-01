import { el } from '../core/util.js';
import { t, tf, addTranslations } from '../core/i18n.js';
import { saveSettings } from '../core/save.js';
import { normalizeTurnServers, readTurnServers27 } from '../net/turn_config27.js';

const messages = {
  'Connection mode': ['Bağlantı yöntemi', 'Способ подключения'],
  'Use the same mode as your host, or open their join link. Local works only in tabs on this device. Changes apply to the next lobby.': ['Host ile aynı yöntemi seç veya katılma bağlantısını aç. Local yalnızca bu cihazdaki sekmelerde çalışır. Değişiklik sonraki lobide uygulanır.', 'Выберите способ хоста или откройте его ссылку. Local работает только во вкладках этого устройства. Изменения применятся в следующем лобби.'],
  'Check connection': ['Bağlantıyı kontrol et', 'Проверить соединение'],
  'Retry connection': ['Bağlantıyı yeniden dene', 'Повторить подключение'],
  'No active game connection.': ['Aktif oyun bağlantısı yok.', 'Нет активного игрового соединения.'],
  'Mode: {mode} · links: {n} · TURN configured: {turn}': ['Yöntem: {mode} · bağlantı: {n} · TURN ayarlı: {turn}', 'Способ: {mode} · соединений: {n} · TURN настроен: {turn}'],
  'Signalling relays: {open}/{total} reachable': ['Sinyal sunucuları: {open}/{total} erişilebilir', 'Сигнальные серверы: {open}/{total} доступны'],
  'Link {n}: {ice} · {path}': ['Bağlantı {n}: {ice} · {path}', 'Соединение {n}: {ice} · {path}'],
  'Connection is still starting. Wait 35 seconds after joining, or 30 seconds after a retry.': ['Bağlantı hâlâ başlıyor. Katıldıktan sonra 35, yeniden denemeden sonra 30 saniye bekle.', 'Соединение запускается. Подождите 35 секунд после входа или 30 секунд после повторной попытки.'],
  'A retry is already running.': ['Yeniden deneme zaten sürüyor.', 'Повторная попытка уже выполняется.'],
  'A crew link is active. Retry keeps working links intact.': ['Bir ekip bağlantısı aktif. Yeniden deneme çalışan bağlantıları korur.', 'Соединение с экипажем активно. Рабочие соединения сохраняются.'],
  'Local mode does not need a signalling retry.': ['Local yönteminde sinyal bağlantısını yenilemek gerekmez.', 'В режиме Local повторная сигнализация не требуется.'],
  'Connection stopped. Open or join a lobby again.': ['Bağlantı durdu. Yeniden lobi kur veya katıl.', 'Соединение остановлено. Создайте лобби или войдите снова.'],
  'Could not restart signalling. Check your network and connection mode.': ['Sinyal bağlantısı yenilenemedi. Ağını ve bağlantı yöntemini kontrol et.', 'Не удалось перезапустить сигнализацию. Проверьте сеть и способ подключения.'],
  'Signalling restarted. Waiting for the other player; this does not confirm a connection yet.': ['Sinyal bağlantısı yenilendi. Diğer oyuncu bekleniyor; bağlantı henüz doğrulanmadı.', 'Сигнализация перезапущена. Ожидаем другого игрока; соединение пока не подтверждено.'],
  'Optional TURN relay': ['İsteğe bağlı TURN sunucusu', 'Необязательный сервер TURN'],
  'Some routers need a TURN relay with valid credentials. Configure it on both browsers. Credentials stay in this browser.': ['Bazı modemlerde geçerli giriş bilgileri olan bir TURN sunucusu gerekir. İki tarayıcıda da ayarla. Giriş bilgileri bu tarayıcıda kalır.', 'Некоторым роутерам нужен TURN с действующими данными доступа. Настройте оба браузера. Данные сохраняются в этом браузере.'],
  'TURN URLs (comma or newline separated)': ['TURN adresleri (virgül veya yeni satır)', 'Адреса TURN (через запятую или новую строку)'],
  'TURN username': ['TURN kullanıcı adı', 'Имя пользователя TURN'],
  'TURN password': ['TURN şifresi', 'Пароль TURN'],
  'Save relay': ['Sunucuyu kaydet', 'Сохранить сервер'],
  'Forget relay': ['Sunucuyu sil', 'Удалить сервер'],
  'Test relay': ['Sunucuyu test et', 'Проверить сервер'],
  'Enter up to 8 valid turn: or turns: URLs.': ['En fazla 8 geçerli turn: veya turns: adresi gir.', 'Введите до 8 действительных адресов turn: или turns:.'],
  'Relay saved. Applies to the next lobby or an isolated connection retry.': ['Sunucu kaydedildi. Sonraki lobide veya bağlantısız oturumun yeniden denenmesinde uygulanır.', 'Сервер сохранён. Применится в следующем лобби или при повторном подключении без активных соединений.'],
  'Browser relay removed. A deployment relay may still be configured.': ['Tarayıcıdaki sunucu silindi. Oyun sunucusunda ayrıca TURN ayarı olabilir.', 'Сервер удалён из браузера. TURN может быть настроен при развёртывании игры.'],
  'Browser storage is unavailable.': ['Tarayıcı depolaması kullanılamıyor.', 'Хранилище браузера недоступно.'],
  'Testing relay…': ['Sunucu test ediliyor…', 'Проверяем сервер…'],
  'Relay candidate received. Peer-to-peer gameplay still needs both players to connect.': ['Sunucudan relay adayı alındı. Oyun için iki oyuncunun da bağlanması gerekiyor.', 'Получен кандидат relay. Для игры нужно подключение обоих игроков.'],
  'No relay candidate received. Check URLs, credentials and firewall.': ['Relay adayı alınamadı. Adresleri, giriş bilgilerini ve güvenlik duvarını kontrol et.', 'Кандидат relay не получен. Проверьте адреса, данные доступа и файрвол.'],
};
for (const [i, lang] of ['tr', 'ru'].entries()) addTranslations(Object.fromEntries(Object.entries(messages).map(([k, v]) => [k, v[i]])), lang);

const retryMessages = {
  waiting: 'Connection is still starting. Wait 35 seconds after joining, or 30 seconds after a retry.',
  busy: 'A retry is already running.', connected: 'A crew link is active. Retry keeps working links intact.',
  unsupported: 'Local mode does not need a signalling retry.', stopped: 'Connection stopped. Open or join a lobby again.',
  failed: 'Could not restart signalling. Check your network and connection mode.',
  retried: 'Signalling restarted. Waiting for the other player; this does not confirm a connection yet.',
};

/** A snapshot on demand: no new polling loop or changes to an admitted crew. */
export function networkSettings27(ui) {
  const app = ui.app, s = app.settings;
  const section = (label) => el('div', { class: 'cp-sec' }, t(label));
  const row = (label, input) => el('div', { class: 'form-row' }, el('label', {}, t(label)), input);
  const note = (label) => el('div', { class: 'dim note' }, t(label));
  const mode = el('select', { 'data-nav': 'set:network' }, ...['nostr', 'mqtt', 'torrent', 'local'].map(value => el('option', { value, selected: value === s.netStrategy }, value.toLocaleUpperCase('en'))));
  mode.addEventListener('change', () => { s.netStrategy = mode.value; saveSettings(s); });
  const status = el('div', { class: 'dim note', role: 'status', 'aria-live': 'polite' }, t('No active game connection.'));
  const inspect = async () => {
    const transport = app.game?.net?.transport;
    if (!transport) { status.textContent = t('No active game connection.'); return; }
    const lines = [tf('Mode: {mode} · links: {n} · TURN configured: {turn}', { mode: transport.strategy || 'local', n: transport.peers.size, turn: t(transport.hasTurn ? 'Yes' : 'No') })];
    const relays = transport.strategy === 'nostr' ? transport.relayStatus?.() : null;
    if (relays?.total) lines.push(tf('Signalling relays: {open}/{total} reachable', relays));
    let links = {}; try { links = await transport.linkInfo?.() || {}; } catch { /* A link may disappear during inspection. */ }
    let n = 0;
    for (const link of Object.values(links)) lines.push(tf('Link {n}: {ice} · {path}', { n: ++n, ice: link.ice, path: link.path }) + (Number.isFinite(link.rtt) ? ` · ${link.rtt} ms` : ''));
    status.textContent = lines.join('\n'); status.style.whiteSpace = 'pre-line';
  };
  const retry = ui.button(t('Retry connection'), async () => {
    const net = app.game?.net;
    if (!net) { status.textContent = t('No active game connection.'); return; }
    retry.disabled = true;
    try { const result = await net.retryConnection(); status.textContent = t(retryMessages[result.reason] || retryMessages.failed); }
    catch { status.textContent = t(retryMessages.failed); }
    finally { retry.disabled = false; }
  }, 'small');

  let stored = []; try { stored = normalizeTurnServers(localStorage.getItem('tfg.turn')); } catch { /* Denied storage. */ }
  const relay = stored[0];
  const urls = el('textarea', { rows: 2, maxlength: 4096, value: relay?.urls.join(', ') || '', placeholder: 'turn:relay.example.com:3478, turns:relay.example.com:5349', 'data-nav': 'set:turnurl' });
  urls.value = relay?.urls.join(', ') || '';
  const user = el('input', { maxlength: 2048, value: relay?.username || '', autocomplete: 'off', 'data-nav': 'set:turnuser' });
  const pass = el('input', { type: 'password', maxlength: 2048, value: relay?.credential || '', autocomplete: 'off', 'data-nav': 'set:turnpass' });
  const result = el('div', { class: 'dim note', role: 'status', 'aria-live': 'polite' });
  const formRelay = () => {
    const parts = urls.value.split(/[,\r\n]/).map(v => v.trim()).filter(Boolean);
    const entries = normalizeTurnServers({ urls: parts, username: user.value, credential: pass.value });
    if (!parts.length || parts.length > 8 || parts.some(url => normalizeTurnServers({ urls: url }).length !== 1) || !entries.length) {
      result.textContent = t('Enter up to 8 valid turn: or turns: URLs.'); return null;
    }
    return entries[0];
  };
  const forget = () => {
    try { localStorage.removeItem('tfg.turn'); urls.value = user.value = pass.value = ''; result.textContent = t('Browser relay removed. A deployment relay may still be configured.'); }
    catch { result.textContent = t('Browser storage is unavailable.'); }
  };
  const save = ui.button(t('Save relay'), () => {
    if (!urls.value.trim()) { forget(); return; }
    const value = formRelay(); if (!value) return;
    try { localStorage.setItem('tfg.turn', JSON.stringify(value)); result.textContent = t('Relay saved. Applies to the next lobby or an isolated connection retry.'); }
    catch { result.textContent = t('Browser storage is unavailable.'); }
  }, 'small');
  const test = ui.button(t('Test relay'), async () => {
    const value = formRelay(); if (!value) return;
    test.disabled = true; result.textContent = t('Testing relay…');
    let pc, timer, observer, finish; let received = false;
    try {
      pc = new RTCPeerConnection({ iceServers: [value], iceTransportPolicy: 'relay' });
      const done = new Promise(resolve => { finish = resolve; });
      pc.onicecandidate = e => { if (e.candidate && (e.candidate.type === 'relay' || / typ relay(?: |$)/.test(e.candidate.candidate))) { received = true; finish(); } else if (!e.candidate) finish(); };
      timer = setTimeout(() => finish(), 6500);
      observer = new MutationObserver(() => { if (!test.isConnected) { pc.close(); finish(); } });
      observer.observe(document.body, { childList: true, subtree: true });
      pc.createDataChannel('relay-check');
      // The budget also bounds a stalled offer/description operation.
      await Promise.race([pc.createOffer().then(offer => pc.setLocalDescription(offer)).then(() => done), done]);
      result.textContent = t(received ? 'Relay candidate received. Peer-to-peer gameplay still needs both players to connect.' : 'No relay candidate received. Check URLs, credentials and firewall.');
    } catch { result.textContent = t('No relay candidate received. Check URLs, credentials and firewall.'); }
    finally { clearTimeout(timer); observer?.disconnect(); try { pc?.close(); } catch { /* Already closed. */ } test.disabled = false; }
  }, 'small');
  const root = el('div', {}, section('Connection mode'), row('Network', mode),
    note('Use the same mode as your host, or open their join link. Local works only in tabs on this device. Changes apply to the next lobby.'),
    el('div', { class: 'menu-row' }, ui.button(t('Check connection'), inspect, 'small'), retry), status,
    section('Optional TURN relay'), note('Some routers need a TURN relay with valid credentials. Configure it on both browsers. Credentials stay in this browser.'),
    row('TURN URLs (comma or newline separated)', urls), row('TURN username', user), row('TURN password', pass),
    el('div', { class: 'menu-row' }, save, ui.button(t('Forget relay'), forget, 'small'), test), result);
  // Report configuration only; neither a saved relay nor open signalling proves ICE.
  if (readTurnServers27().length) status.textContent = tf('Mode: {mode} · links: {n} · TURN configured: {turn}', { mode: app.game?.net?.transport?.strategy || s.netStrategy, n: app.game?.net?.transport?.peers.size || 0, turn: t('Yes') });
  return root;
}
