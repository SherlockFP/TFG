// ARCADE2 (docs/wave8/arcade2.md): four extra 30-90 s cabinet games (Flappy Fish, Cable Runner, Quota Stack, Viewer Invaders) behind ONE menu minigame ('arcade2', src/minigames/arcade2.js).
//   entry     the existing ship arcade cabinet (its [E] now opens the menu; the old Flappy Phish stays reachable with the terminal `ARCADE CLASSIC`) and the terminal command `ARCADE [game|top|classic]`
//   rewards   host-authoritative per-day crew leaderboard (rules in arcade2_core.js), a small Clout prize per play capped per player per day (host ledger + the client's own profile ledger),
//             and the Arcade Champion hat for beating a game's target score once (profile.arcade2.champ -> cosmetics rule 'hat:arcadecap').
// Net (prefix 'ac2'): 'ac2req' client -> host {op:'score', game, score} | {op:'sync'};  'ac2s' host -> everyone {k:'b', day, b:{game:[{id,n,s}]}} | {k:'r', to, game, score, best, rank, coins, champ}.
import { MINIGAMES } from '../minigames/index.js';
import { createArcade2 } from '../minigames/arcade2.js';
import { addTranslations, t, tf, getLang } from '../core/i18n.js';
import * as K from './arcade2_core.js';

const TR = {
  'SHIP ARCADE': 'GEMİ SALONU', '[UP][DOWN] pick   [ENTER] play   [ESC] leave': '[YUKARI][AŞAĞI] seç   [ENTER] oyna   [ESC] çık',
  'DONATION! Gravity is upside down.': 'BAĞIŞ! Yer çekimi ters döndü.', 'Dodge the Company pipes.': 'Şirket borularından kaç.',
  'Eat plugs. Gold plugs are worth 3 and vanish.': 'Fişleri ye. Altın fiş 3 puan, çabuk kaybolur.', 'Quota: {n} lines. Stack the scrap, clear the rows.': 'Kota: {n} sıra. Hurdaları diz, sıraları temizle.',
  'Shoot the hate-comments before they reach the stream.': 'Nefret yorumlarını yayına ulaşmadan vur.',
  '[SPACE] / [CLICK] flap   [ESC] menu': '[BOŞLUK] / [TIK] çırp   [ESC] menü', '[ARROWS] / [WASD] steer   [CLICK] turn toward   [ESC] menu': '[OKLAR] / [WASD] yönlendir   [TIK] o yöne dön   [ESC] menü',
  '[A][D] move  [W] rotate  [S] soft drop  [SPACE] drop   [ESC] menu': '[A][D] kaydır  [W] döndür  [S] yavaş indir  [BOŞLUK] bırak   [ESC] menü', '[A][D] / mouse move   [SPACE] / [CLICK] fire   [ESC] menu': '[A][D] / fare hareket   [BOŞLUK] / [TIK] ateş   [ESC] menü',
  'One button. The Algorithm may flip gravity.': 'Tek tuş. Algoritma yer çekimini ters çevirebilir.', 'Grow the cable, do not bite it.': 'Kabloyu uzat, kendi üstüne binme.',
  'Stack scrap shapes, make quota rows.': 'Hurda şekillerini diz, kota sıraları yap.', 'Shoot the hate-comments.': 'Nefret yorumlarını vur.',
  'TARGET BEATEN': 'HEDEF AŞILDI', 'NEW BEST': 'YENİ REKOR', 'GAME OVER': 'OYUN BİTTİ', '[ENTER] again   [ESC] menu': '[ENTER] tekrar   [ESC] menü',
  'Play ARCADE [E]': 'Salonda oyna [E]', 'Flappy Fish': 'Flappy Balık', 'Cable Runner': 'Kablo Koşucusu', 'Quota Stack': 'Kota İstifi', 'Viewer Invaders': 'İzleyici İstilası',
  'Arcade prize: +{n} Followers ({game})': 'Salon ödülü: +{n} Takipçi ({game})', 'Arcade daily prize cap reached ({n} Followers).': 'Günlük salon ödül sınırına ulaşıldı ({n} Takipçi).',
  'ARCADE CHAMPION: hat unlocked (beat {target} in {game})': 'SALON ŞAMPİYONU: şapka açıldı ({game} oyununda {target} puanı geçtin)', 'Rank #{r} on today\'s {game} board': 'Bugünün {game} tablosunda #{r}. sıra',
  'ARCADE: FLAPPY | CABLE | STACK | INVADERS | TOP | CLASSIC': 'SALON: FLAPPY | CABLE | STACK | INVADERS | TOP | CLASSIC', 'Today\'s crew high scores': 'Bugünün ekip skorları', 'no scores yet': 'henüz skor yok',
  'Arcade Champion': 'Salon Şampiyonu', 'A joystick on a cap. Worn by whoever beat the cabinet.': 'Şapkanın üstünde bir joystick. Makineyi yenen takar.', 'Beat a target score on the ship arcade': 'Gemi salonunda bir hedef skoru geç',
  'Not on the ship.': 'Gemide değilsin.',
};
const RU = {
  'SHIP ARCADE': 'КОРАБЕЛЬНЫЙ АРКАДНЫЙ', '[UP][DOWN] pick   [ENTER] play   [ESC] leave': '[ВВЕРХ][ВНИЗ] выбор   [ENTER] играть   [ESC] выход',
  'DONATION! Gravity is upside down.': 'ДОНАТ! Гравитация перевёрнута.', 'Dodge the Company pipes.': 'Уворачивайся от труб Компании.',
  'Eat plugs. Gold plugs are worth 3 and vanish.': 'Ешь разъёмы. Золотой стоит 3 и быстро исчезает.', 'Quota: {n} lines. Stack the scrap, clear the rows.': 'Квота: {n} линий. Складывай хлам, убирай ряды.',
  'Shoot the hate-comments before they reach the stream.': 'Сбей хейт-комментарии, пока они не достигли стрима.',
  '[SPACE] / [CLICK] flap   [ESC] menu': '[ПРОБЕЛ] / [КЛИК] взмах   [ESC] меню', '[ARROWS] / [WASD] steer   [CLICK] turn toward   [ESC] menu': '[СТРЕЛКИ] / [WASD] руль   [КЛИК] повернуть к точке   [ESC] меню',
  '[A][D] move  [W] rotate  [S] soft drop  [SPACE] drop   [ESC] menu': '[A][D] влево/вправо  [W] поворот  [S] ниже  [ПРОБЕЛ] сброс   [ESC] меню', '[A][D] / mouse move   [SPACE] / [CLICK] fire   [ESC] menu': '[A][D] / мышь двигаться   [ПРОБЕЛ] / [КЛИК] огонь   [ESC] меню',
  'One button. The Algorithm may flip gravity.': 'Одна кнопка. Алгоритм может перевернуть гравитацию.', 'Grow the cable, do not bite it.': 'Растяни кабель, не наступай на него.',
  'Stack scrap shapes, make quota rows.': 'Складывай фигуры из хлама, собирай ряды квоты.', 'Shoot the hate-comments.': 'Сбивай хейт-комментарии.',
  'TARGET BEATEN': 'ЦЕЛЬ ПРЕВЗОЙДЕНА', 'NEW BEST': 'НОВЫЙ РЕКОРД', 'GAME OVER': 'ИГРА ОКОНЧЕНА', '[ENTER] again   [ESC] menu': '[ENTER] ещё раз   [ESC] меню',
  'Play ARCADE [E]': 'Играть в автомат [E]', 'Flappy Fish': 'Флэппи-рыба', 'Cable Runner': 'Кабельный бегун', 'Quota Stack': 'Квотный стек', 'Viewer Invaders': 'Вторжение зрителей',
  'Arcade prize: +{n} Followers ({game})': 'Приз аркады: +{n} подписчики ({game})', 'Arcade daily prize cap reached ({n} Followers).': 'Дневной лимит призов аркады достигнут ({n} подписчики).',
  'ARCADE CHAMPION: hat unlocked (beat {target} in {game})': 'ЧЕМПИОН АРКАДЫ: шапка открыта ({target} очков в игре {game})', 'Rank #{r} on today\'s {game} board': 'Место #{r} в сегодняшней таблице {game}',
  'ARCADE: FLAPPY | CABLE | STACK | INVADERS | TOP | CLASSIC': 'АРКАДА: FLAPPY | CABLE | STACK | INVADERS | TOP | CLASSIC', 'Today\'s crew high scores': 'Рекорды экипажа за сегодня', 'no scores yet': 'очков пока нет',
  'Arcade Champion': 'Чемпион аркады', 'A joystick on a cap. Worn by whoever beat the cabinet.': 'Джойстик на кепке. Носит тот, кто победил автомат.', 'Beat a target score on the ship arcade': 'Побей целевой счёт на корабельном автомате',
  'Not on the ship.': 'Не на корабле.',
};
addTranslations(TR, 'tr');
addTranslations(RU, 'ru');

const ALIAS = { flappy: 'fish', fish: 'fish', cable: 'cable', snake: 'cable', stack: 'stack', tetris: 'stack', invaders: 'invaders', shooter: 'invaders' };
const GN = { fish: 'Flappy Fish', cable: 'Cable Runner', stack: 'Quota Stack', invaders: 'Viewer Invaders' };

export function installArcade2(game) {
  const mods = game.mods;
  const offs = [], restores = [];
  let disposed = false, boundNet = null;
  const S = { host: null, mirror: { day: K.dayKey(), b: { fish: [], cable: [], stack: [], invaders: [] } } };
  const host = () => !!game.isHost;
  const me = () => game.selfId ?? 'me';
  const P = () => game.profile;

  MINIGAMES.arcade2 = createArcade2;
  restores.push(() => { if (MINIGAMES.arcade2 === createArcade2) delete MINIGAMES.arcade2; });

  // ------------------------------------------------------------ host side
  function hostState() {
    if (!S.host) {
      const st = P()?.arcade2?.hb;
      S.host = st && st.day === K.dayKey() && st.b && st.paid ? { last: {}, ...st } : K.newBoards();
    }
    return K.rollDay(S.host);
  }
  function persistHost() {
    try { const a = (P().arcade2 = P().arcade2 || {}); a.hb = { day: S.host.day, b: S.host.b, paid: S.host.paid }; game.progress?.save?.(); } catch { /* profile optional */ }
  }
  function sendAll(m) { try { game.net?.broadcast('ac2s', m); } catch { /* net closing */ } if (!game.net) onMsg(m); }
  function hostSubmit(d, from) {
    const s = hostState();
    const res = K.submit(s, { pid: from, name: game.playerName?.(from) || 'Employee', game: d.game, score: d.score });
    if (!res.ok) return;
    persistHost();
    sendAll({ k: 'r', to: from, game: d.game, score: Math.floor(+d.score) || 0, best: res.best ? 1 : 0, rank: res.rank, coins: res.coins, champ: res.champ ? 1 : 0 });
    sendAll({ k: 'b', ...K.wire(s) });
  }
  function hostReq(d, from) {
    if (!host() || !d) return;
    if (d.op === 'score') hostSubmit(d, from);
    else if (d.op === 'sync') sendAll({ k: 'b', ...K.wire(hostState()) });
  }

  // ------------------------------------------------------------ client side
  function onMsg(m, fromId) {
    if (disposed || !m) return;
    if (game.net && fromId !== undefined && fromId !== game.selfId && fromId !== game.net.hostId) return;   // only the host speaks
    if (m.k === 'b' && m.b) S.mirror = { day: m.day, b: m.b };
    else if (m.k === 'r' && (m.to === game.selfId || !game.net)) receive(m);
  }
  function receive(m) {
    const p = P(); if (!p || !K.isGame(m.game)) return;
    const name = t(GN[m.game]);
    let coins = Math.max(0, Math.min(m.coins | 0, K.PRIZE_CAP));
    const room = K.ledgerRoom(p);   // profile-side cap: even a lying host cannot pay more than PRIZE_CAP a day
    const pay = Math.min(coins, room);
    if (pay > 0) { p.arcade2.paid = (p.arcade2.paid | 0) + pay; game.progress?.addCoins?.(pay, 'Daily arcade'); game.ui.toast(tf('Arcade prize: +{n} Followers ({game})', { n: pay, game: name }), 'good'); }
    else if (coins > 0 || room <= 0) game.ui.toast(tf('Arcade daily prize cap reached ({n} Followers).', { n: K.PRIZE_CAP }));
    if (m.rank > 0 && m.rank <= 3 && m.best) game.ui.toast(tf('Rank #{r} on today\'s {game} board', { r: m.rank, game: name }), 'good');
    if (m.champ && !p.arcade2.champ && (m.score | 0) >= K.TARGETS[m.game]) {
      p.arcade2.champ = 1;
      game.ui.toast(tf('ARCADE CHAMPION: hat unlocked (beat {target} in {game})', { target: K.TARGETS[m.game], game: name }), 'good');
    }
    game.progress?.save?.();
  }
  function bindNet(net) {
    if (!net || boundNet === net) return;
    boundNet?.off?.('msg:ac2s', onMsg);
    boundNet = net; net.on('msg:ac2s', onMsg);
  }
  offs.push(mods.on('netReady', (n, g) => { if (g === game) bindNet(n); }));
  if (game.net) bindNet(game.net);
  offs.push(mods.on('registerHandlers', (H, g) => { if (g === game) H('ac2req', (d, from) => hostReq(d, from)); }));
  // host migration: every peer mirrors the boards (top entries); the new host continues from them (daily prize ledger restarts, the client profile ledger still caps it)
  offs.push(mods.on('hostMigrated', (g, info) => {
    if (g !== game || !info?.self || S.host) return;
    const m = S.mirror; if (m && m.day === K.dayKey() && m.b) S.host = { day: m.day, b: K.wire({ day: m.day, b: m.b }).b, paid: {}, last: {} };
  }));
  offs.push(mods.on('playerJoin', (id, info, g) => {
    if (g !== game || !host()) return;
    try { game.net.sendTo(id, 'ac2s', { k: 'b', ...K.wire(hostState()) }); } catch { /* joiner gone */ }
  }));

  // ------------------------------------------------------------ opening it
  const myBest = () => {
    const out = {};
    for (const g of K.GAMES) out[g] = (S.mirror.b[g] || []).find((r) => r.id === me())?.s || 0;
    return out;
  };
  function request(d) { if (game.net) { try { game.net.request('ac2req', d); } catch { /* net closing */ } } else if (d.op === 'score') hostSubmit(d, 'me'); }
  function open(id) {
    if (disposed || game.minigame || game.player?.dead) return;
    if (!game.net) { S.mirror = K.wire(hostState()); } else request({ op: 'sync' });
    game.openMinigame('arcade2', {
      noEase: true, game: id, board: () => S.mirror.b, best: myBest,
      onScore: (g, score) => request({ op: 'score', game: g, score }),
    }, () => {});
  }
  // the existing cabinet: same fixture, same [E], but it opens the menu now
  const origStart = Object.prototype.hasOwnProperty.call(game, 'startArcade') ? game.startArcade : null;
  const classic = game.startArcade?.bind(game);
  game.startArcade = () => open();
  restores.push(() => { if (origStart) game.startArcade = origStart; else delete game.startArcade; });
  offs.push(mods.on('interactables', (out, g) => {
    if (g !== game) return;
    for (const it of out) if (it.label === t('Play FLAPPY PHISH [E]')) it.label = t('Play ARCADE [E]');
  }));

  function topLines() {
    const lines = [t('Today\'s crew high scores')];
    for (const g of K.GAMES) {
      const rows = (S.mirror.b[g] || []).slice(0, 3);
      lines.push(`${t(GN[g]).toLocaleUpperCase(getLang())} (${K.TARGETS[g]}): ${rows.length ? rows.map((r, i) => `${i + 1}. ${r.n} ${r.s}`).join('  ') : t('no scores yet')}`);
    }
    return lines.join('\n');
  }
  try {
    window.KefalAPI?.registerCommand?.('arcade', (rest, term) => {
      const w = String(rest || '').trim().toLowerCase();
      if (w === 'top') { if (!game.net) S.mirror = K.wire(hostState()); else request({ op: 'sync' }); term.print(topLines()); return; }
      if (w && w !== 'classic' && !ALIAS[w]) { term.print(t('ARCADE: FLAPPY | CABLE | STACK | INVADERS | TOP | CLASSIC')); return; }
      term.close?.();
      if (w === 'classic') classic?.(); else open(ALIAS[w]);
    }, 'ship arcade: FLAPPY | CABLE | STACK | INVADERS | TOP (crew scores) | CLASSIC');
  } catch { /* terminal optional */ }

  return {
    open, board: () => S.mirror, topLines,
    dispose() {
      disposed = true;
      for (const o of offs) { try { o?.(); } catch { /* ignore */ } }
      for (const r of restores.reverse()) { try { r(); } catch { /* ignore */ } }
      boundNet?.off?.('msg:ac2s', onMsg); boundNet = null;
      try { window.__kefalMods?.commands?.delete?.('arcade'); } catch { /* ignore */ }
    },
  };
}
