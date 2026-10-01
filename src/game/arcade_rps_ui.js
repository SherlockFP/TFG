// ROCK - PAPER - SCISSORS client (module `arcade`): challenge prompts, the HUD line, hand-sign sprites over both players' heads, key handling.
// Pure host rules: game/arcade_rps.js. Net: client -> host `arreq` {op:'rps', s: ch | ac | no | pk | lv, ...}; host -> peers `ar` {k: rpsc | rpsn | rpsr | rpsp | rpsv | rpse}.
// Keys (captured only while they matter, so the hotbar does not switch): Y / N answer a challenge, 1 / 2 / 3 pick rock / paper / scissors.
// Chat: /rps [wager] [name]  (wager in Clout, up to 25; target = name or the crewmate you look at). E on a crewmate = challenge without a wager.
import * as THREE from 'three';
import { addTranslations, t, tf } from '../core/i18n.js';
import { MOVES, RPS } from './arcade_rps.js';

const TR = {
  'ROCK-PAPER-SCISSORS': 'TAŞ-KAĞIT-MAKAS', 'Rock-Paper-Scissors with {name} [E]': '{name} ile Taş-Kağıt-Makas [E]', 'Best of 3. Wager: /rps <Followers> <name>': '3 turda 2. Bahis: /rps <Takipçi> <isim>',
  'ROCK': 'TAŞ', 'PAPER': 'KAĞIT', 'SCISSORS': 'MAKAS', 'SHOOT!': 'AT!', 'vs': 'karşı', 'ROUND {n}': 'TUR {n}', 'YOU': 'SEN',
  '{name} challenges you to ROCK-PAPER-SCISSORS (best of 3, wager ◈{n}).': '{name} seni TAŞ-KAĞIT-MAKAS\'a çağırıyor (3 turda 2, bahis ◈{n}).',
  '{name} challenges you to ROCK-PAPER-SCISSORS (best of 3).': '{name} seni TAŞ-KAĞIT-MAKAS\'a çağırıyor (3 turda 2).',
  '[Y] Accept': '[Y] Kabul', '[N] Decline': '[N] Reddet', 'Challenge sent to {name}...': '{name} oyuncusuna meydan okundu...',
  'Pick: [1] ROCK   [2] PAPER   [3] SCISSORS': 'Seç: [1] TAŞ   [2] KAĞIT   [3] MAKAS', 'Locked in: {pick}. Waiting for {name}...': 'Seçildi: {pick}. {name} bekleniyor...',
  '{name} has locked in.': '{name} seçimini yaptı.', 'You win the round!': 'Turu sen kazandın!', '{name} wins the round.': 'Turu {name} kazandı.', 'Draw - go again.': 'Beraberlik - tekrar.',
  '(random pick)': '(rastgele seçim)', 'YOU WIN!': 'KAZANDIN!', '{name} WINS': '{name} KAZANDI', 'DRAW': 'BERABERE', 'Won ◈{n}.': '◈{n} kazandın.', 'Lost ◈{n}.': '◈{n} kaybettin.',
  '{a} vs {b}: {pa} - {pb}. {w}': '{a} - {b}: {pa} - {pb}. {w}', '{name} took the round.': 'Turu {name} aldı.', 'Draw.': 'Berabere.',
  '{name} declined.': '{name} reddetti.', 'The challenge expired.': 'Meydan okuma zaman aşımına uğradı.', 'Game cancelled: {name} left.': 'Oyun iptal: {name} ayrıldı.', 'Game cancelled.': 'Oyun iptal edildi.',
  'Not enough Followers for that wager.': 'Bu bahis için yeterli Takipçi yok.', 'No crewmate close enough.': 'Yakında bir mürettebat arkadaşı yok.', 'Pick a crewmate.': 'Bir arkadaş seç.',
  'Wagers go up to {n} Followers.': 'Bahis en fazla {n} Takipçi.', 'You are already in a game.': 'Zaten bir oyundasın.', 'They are busy.': 'Meşgul.', 'Nothing to answer.': 'Cevaplanacak bir şey yok.',
  'Not now.': 'Şimdi değil.', 'Bad pick.': 'Geçersiz seçim.', 'Already picked.': 'Zaten seçtin.', 'Get closer to them.': 'Ona biraz daha yaklaş.', 'They cannot play right now.': 'Şu an oynayamaz.',
  'Trade - Rock-Paper-Scissors': 'Ticaret - Taş-Kağıt-Makas',
};
const RU = {
  'ROCK-PAPER-SCISSORS': 'КАМЕНЬ-НОЖНИЦЫ-БУМАГА', 'Rock-Paper-Scissors with {name} [E]': 'Камень-ножницы-бумага с {name} [E]', 'Best of 3. Wager: /rps <Followers> <name>': 'До 2 побед. Ставка: /rps <подписчики> <имя>',
  'ROCK': 'КАМЕНЬ', 'PAPER': 'БУМАГА', 'SCISSORS': 'НОЖНИЦЫ', 'SHOOT!': 'РАЗ!', 'vs': 'против', 'ROUND {n}': 'РАУНД {n}', 'YOU': 'ВЫ',
  '{name} challenges you to ROCK-PAPER-SCISSORS (best of 3, wager ◈{n}).': '{name} вызывает вас на КАМЕНЬ-НОЖНИЦЫ-БУМАГА (до 2 побед, ставка ◈{n}).',
  '{name} challenges you to ROCK-PAPER-SCISSORS (best of 3).': '{name} вызывает вас на КАМЕНЬ-НОЖНИЦЫ-БУМАГА (до 2 побед).',
  '[Y] Accept': '[Y] Принять', '[N] Decline': '[N] Отклонить', 'Challenge sent to {name}...': 'Вызов отправлен: {name}...',
  'Pick: [1] ROCK   [2] PAPER   [3] SCISSORS': 'Выбор: [1] КАМЕНЬ   [2] БУМАГА   [3] НОЖНИЦЫ', 'Locked in: {pick}. Waiting for {name}...': 'Выбрано: {pick}. Ждём {name}...',
  '{name} has locked in.': '{name} сделал выбор.', 'You win the round!': 'Вы выиграли раунд!', '{name} wins the round.': '{name} выигрывает раунд.', 'Draw - go again.': 'Ничья - ещё раз.',
  '(random pick)': '(случайный выбор)', 'YOU WIN!': 'ВЫ ПОБЕДИЛИ!', '{name} WINS': '{name} ПОБЕЖДАЕТ', 'DRAW': 'НИЧЬЯ', 'Won ◈{n}.': 'Выиграно ◈{n}.', 'Lost ◈{n}.': 'Проиграно ◈{n}.',
  '{a} vs {b}: {pa} - {pb}. {w}': '{a} против {b}: {pa} - {pb}. {w}', '{name} took the round.': '{name} берёт раунд.', 'Draw.': 'Ничья.',
  '{name} declined.': '{name} отказался.', 'The challenge expired.': 'Вызов истёк.', 'Game cancelled: {name} left.': 'Игра отменена: {name} ушёл.', 'Game cancelled.': 'Игра отменена.',
  'Not enough Followers for that wager.': 'Не хватает подписчики для такой ставки.', 'No crewmate close enough.': 'Рядом нет напарника.', 'Pick a crewmate.': 'Выберите напарника.',
  'Wagers go up to {n} Followers.': 'Ставки до {n} подписчики.', 'You are already in a game.': 'Вы уже в игре.', 'They are busy.': 'Он занят.', 'Nothing to answer.': 'Отвечать не на что.',
  'Not now.': 'Сейчас нельзя.', 'Bad pick.': 'Неверный выбор.', 'Already picked.': 'Уже выбрано.', 'Get closer to them.': 'Подойдите ближе.', 'They cannot play right now.': 'Он сейчас не может играть.',
  'Trade - Rock-Paper-Scissors': 'Обмен - Камень-ножницы-бумага',
};
export const RPS_TR = TR, RPS_RU = RU;

const CSS = `
#ar-rps{position:fixed;left:50%;top:9%;transform:translateX(-50%);z-index:23;pointer-events:none;text-align:center;font-family:VT323,monospace;color:#f3eddc;text-shadow:2px 2px 0 #000,0 0 10px rgba(0,0,0,.7);display:none;min-width:420px;max-width:80vw}
#ar-rps .b{background:rgba(8,8,14,.72);border:1px solid rgba(255,190,110,.4);padding:6px 18px 8px}
#ar-rps .h{font-size:22px;letter-spacing:3px;color:#ffcf8a}
#ar-rps .s{font-size:30px;letter-spacing:2px;margin:2px 0}
#ar-rps .p{font-size:26px;color:#fff}
#ar-rps .p.big{font-size:44px;letter-spacing:5px}
#ar-rps .p.win{color:#8dff9d}#ar-rps .p.lose{color:#ff8a70}
#ar-rps .k{font-size:22px;color:#ffe27a}
`;
const MOVE_KEYS = { Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 };
const MOVE_NAME = ['ROCK', 'PAPER', 'SCISSORS'];

// ---------------------------------------------------------------------------------------------- hand icons (canvas, stylised)
function iconCanvas(kind) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  x.lineJoin = 'round'; x.lineCap = 'round';
  const skin = '#f0c99a', line = '#3a2416';
  const rr = (px, py, w, h, r) => { x.beginPath(); x.roundRect(px, py, w, h, r); x.fill(); x.stroke(); };
  x.fillStyle = kind === 'ok' ? '#1c3b22' : '#15151d'; x.strokeStyle = kind === 'ok' ? '#6bff8c' : '#e0b070'; x.lineWidth = 5;
  x.beginPath(); x.roundRect(6, 6, 116, 116, 22); x.fill(); x.stroke();
  x.fillStyle = skin; x.strokeStyle = line; x.lineWidth = 4;
  if (kind === 'rock') {
    rr(32, 50, 64, 54, 16);
    for (let i = 0; i < 4; i++) { x.beginPath(); x.arc(41 + i * 15.5, 52, 9, 0, Math.PI * 2); x.fill(); x.stroke(); }
    x.beginPath(); x.ellipse(40, 90, 12, 17, -0.5, 0, Math.PI * 2); x.fill(); x.stroke();
    x.strokeStyle = 'rgba(58,36,22,.6)'; x.lineWidth = 2.5; for (let i = 1; i < 4; i++) { x.beginPath(); x.moveTo(33 + i * 15.5, 62); x.lineTo(33 + i * 15.5, 84); x.stroke(); }
  } else if (kind === 'paper') {
    for (let i = 0; i < 4; i++) rr(34 + i * 15, 22 + (i === 1 || i === 2 ? -6 : 4), 12, 52, 6);
    rr(32, 62, 66, 48, 14);
    x.save(); x.translate(30, 92); x.rotate(-0.9); rr(-7, -22, 15, 34, 7); x.restore();
  } else if (kind === 'scissors') {
    x.save(); x.translate(56, 70); x.rotate(-0.28); rr(-7, -52, 14, 58, 7); x.restore();
    x.save(); x.translate(76, 70); x.rotate(0.28); rr(-7, -52, 14, 58, 7); x.restore();
    rr(38, 68, 62, 42, 14);
    for (let i = 0; i < 2; i++) { x.beginPath(); x.arc(78 + i * 14, 74, 8, 0, Math.PI * 2); x.fill(); x.stroke(); }
    x.beginPath(); x.ellipse(38, 96, 11, 16, -0.4, 0, Math.PI * 2); x.fill(); x.stroke();
  } else if (kind === 'q') {
    x.fillStyle = '#e0b070'; x.font = 'bold 84px VT323, monospace'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('?', 64, 68);
  } else if (kind === 'ok') {
    x.strokeStyle = '#6bff8c'; x.lineWidth = 12; x.beginPath(); x.moveTo(32, 66); x.lineTo(55, 90); x.lineTo(98, 40); x.stroke();
  }
  return c;
}

export function createRpsClient({ game, request, isHost }) {
  addTranslations(TR, 'tr'); addTranslations(RU, 'ru');
  const offs = [];
  let disposed = false, clock = 0;
  const C = { ask: null, m: null, endShow: null };   // ask = incoming/outgoing challenge, m = the running match (local view), endShow = { txt, cls, until }
  const nameOf = (id) => game.playerName?.(id) || t('Employee');
  const me = () => game.selfId;
  const coins = () => Infinity;   // [followers] a wager is a stake of followers to WIN, never a balance to cover
  const sfx = (n, v = 0.5, p) => { try { game.sfx?.(n, v, p); } catch { /* ignore */ } };
  const toast = (txt, kind = 'info') => game.ui?.toast?.(txt, kind);
  const moveName = (i) => t(MOVE_NAME[i]);

  // ---------------------------------------------------------------------------------------------- HUD
  if (!document.getElementById('tfg-rps-css')) { const s = document.createElement('style'); s.id = 'tfg-rps-css'; s.textContent = CSS; document.head.appendChild(s); }
  const hud = document.createElement('div'); hud.id = 'ar-rps'; document.body.appendChild(hud);
  let hudHtml = '';
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  function renderHud() {
    let h = '';
    const M = C.m, A = C.ask;
    if (C.endShow && clock < C.endShow.until) h = `<div class="b"><div class="h">${esc(t('ROCK-PAPER-SCISSORS'))}</div><div class="p big ${C.endShow.cls}">${esc(C.endShow.txt)}</div><div class="k">${esc(C.endShow.sub || '')}</div></div>`;
    else if (M) {
      const beat = M.reveal ? clock - M.reveal.t0 : -1;
      const opp = nameOf(M.opp), wager = M.wager ? ` · ◈${M.wager}` : '';
      let line = '', cls = '';
      if (M.reveal && beat < 1.45) { const words = [moveName(0), moveName(1), moveName(2), t('SHOOT!')]; line = words[Math.min(3, Math.floor(beat / 0.36))]; cls = 'big'; }
      else if (M.reveal) {
        const R = M.reveal, mine = R.picks[M.role === 'a' ? 0 : 1], theirs = R.picks[M.role === 'a' ? 1 : 0];
        const w = R.win === 'd' ? 'd' : R.win === M.role ? 'me' : 'opp';
        line = `${moveName(mine)}  ${t('vs')}  ${moveName(theirs)}`;
        const res = w === 'me' ? t('You win the round!') : w === 'opp' ? tf('{name} wins the round.', { name: opp }) : t('Draw - go again.');
        line += `<br><span class="${w === 'me' ? 'p win' : w === 'opp' ? 'p lose' : 'p'}">${esc(res)}</span>`;
        if (R.auto[M.role]) line += ` <span class="k">${esc(t('(random pick)'))}</span>`;
        h = `<div class="b"><div class="h">${esc(t('ROCK-PAPER-SCISSORS'))} · ${esc(opp)}${esc(wager)}</div><div class="s">${esc(t('YOU'))} ${M.sc.me} : ${M.sc.opp} ${esc(opp)}</div><div class="p">${line}</div></div>`;
        line = null;
      } else if (M.myPick !== null) line = esc(tf('Locked in: {pick}. Waiting for {name}...', { pick: moveName(M.myPick), name: opp }));
      else line = esc(t('Pick: [1] ROCK   [2] PAPER   [3] SCISSORS')) + (M.oppLocked ? `<br><span class="k">${esc(tf('{name} has locked in.', { name: opp }))}</span>` : '');
      if (line !== null) h = `<div class="b"><div class="h">${esc(t('ROCK-PAPER-SCISSORS'))} · ${esc(opp)}${esc(wager)} · ${esc(tf('ROUND {n}', { n: M.round }))}</div><div class="s">${esc(t('YOU'))} ${M.sc.me} : ${M.sc.opp} ${esc(opp)}</div><div class="p ${cls}">${line}</div></div>`;
    } else if (A) {
      const left = Math.max(0, Math.ceil(A.until - clock));
      if (A.b === me()) h = `<div class="b"><div class="h">${esc(t('ROCK-PAPER-SCISSORS'))}</div><div class="p">${esc(A.wager ? tf('{name} challenges you to ROCK-PAPER-SCISSORS (best of 3, wager ◈{n}).', { name: nameOf(A.a), n: A.wager }) : tf('{name} challenges you to ROCK-PAPER-SCISSORS (best of 3).', { name: nameOf(A.a) }))}</div><div class="k">${esc(t('[Y] Accept'))}   ${esc(t('[N] Decline'))}  (${left})</div></div>`;
      else h = `<div class="b"><div class="h">${esc(t('ROCK-PAPER-SCISSORS'))}</div><div class="p">${esc(tf('Challenge sent to {name}...', { name: nameOf(A.b) }))}</div><div class="k">${left}</div></div>`;
    }
    if (h !== hudHtml) { hudHtml = h; hud.innerHTML = h; hud.style.display = h ? 'block' : 'none'; }
  }

  // ---------------------------------------------------------------------------------------------- sprites over the players' heads
  const icons = {};
  const iconTex = (k) => (icons[k] ||= (() => { const t2 = new THREE.CanvasTexture(iconCanvas(k)); t2.colorSpace = THREE.SRGBColorSpace; return t2; })());
  const sprites = new Map();   // pid -> { sp, mat }
  function spriteFor(pid) {
    let s = sprites.get(pid);
    if (s) return s;
    const mat = new THREE.SpriteMaterial({ map: iconTex('q'), transparent: true, depthWrite: false, fog: false });
    const sp = new THREE.Sprite(mat); sp.scale.setScalar(0.55); sp.renderOrder = 20;
    game.scene.add(sp);
    s = { sp, mat, icon: 'q', tint: 0xffffff };
    sprites.set(pid, s); return s;
  }
  function setIcon(pid, kind, tint = 0xffffff) {
    const s = spriteFor(pid);
    if (s.icon !== kind) { s.icon = kind; s.mat.map = iconTex(kind); s.mat.needsUpdate = true; }
    s.mat.color.setHex(tint);
  }
  function dropSprites() { for (const s of sprites.values()) { s.sp.removeFromParent(); s.mat.dispose(); } sprites.clear(); }
  const _h = new THREE.Vector3();
  function placeSprites() {
    for (const [pid, s] of sprites) {
      const head = game.playerHeadById?.(pid);
      if (!head) { s.sp.visible = false; continue; }
      s.sp.visible = true;
      _h.copy(head); _h.y += 0.6;
      const R = live?.reveal;
      if (R && clock - R.t0 < 1.45) _h.y += Math.abs(Math.sin((clock - R.t0) / 0.36 * Math.PI)) * 0.22;   // the fist bobs on each beat
      s.sp.position.copy(_h);
    }
  }
  let live = null;   // the match whose sprites are shown (participants AND spectators): { a, b, reveal? }

  // ---------------------------------------------------------------------------------------------- messages from the host
  function onMsg(d) {
    const self = me();
    if (live) live.seen = clock;
    switch (d.k) {
      case 'rpsc': {
        C.ask = { id: d.id, a: d.a, b: d.b, wager: d.wager | 0, until: clock + (d.sec || RPS.CHALLENGE_SEC) };
        if (d.b === self) {
          sfx('ui_notify', 0.6);
          if (d.wager > coins()) { toast(t('Not enough Followers for that wager.'), 'bad'); request('no'); }
        }
        break;
      }
      case 'rpsn': {
        const A = C.ask, M = C.m;
        if (d.why === 'declined') toast(tf('{name} declined.', { name: nameOf(A?.b || M?.opp) }), 'info');
        else if (d.why === 'expired') toast(t('The challenge expired.'), 'info');
        else if (d.why === 'left') toast(tf('Game cancelled: {name} left.', { name: nameOf(M?.opp || A?.a) }), 'info');
        else toast(t('Game cancelled.'), 'info');
        C.ask = null; C.m = null; live = null; dropSprites();
        break;
      }
      case 'rpsr': {
        const A = C.ask;
        if (A && A.id === d.id) { C.m = { id: d.id, role: A.a === self ? 'a' : 'b', opp: A.a === self ? A.b : A.a, wager: A.wager, round: d.round, sc: { me: 0, opp: 0 }, myPick: null, oppLocked: false, reveal: null }; C.ask = null; live = { a: A.a, b: A.b, reveal: null, seen: clock }; }
        const M = C.m;
        if (M && M.id === d.id) {
          M.round = d.round; M.myPick = null; M.oppLocked = false; M.reveal = null;
          M.sc = M.role === 'a' ? { me: d.sc.a, opp: d.sc.b } : { me: d.sc.b, opp: d.sc.a };
          live.reveal = null;
          sfx('ui_confirm', 0.5);
        }
        if (live) { setIcon(live.a, 'q'); setIcon(live.b, 'q'); }
        break;
      }
      case 'rpsp': {
        const M = C.m;
        if (M && M.id === d.id) { if (d.who === M.role) { /* own pick confirmed */ } else M.oppLocked = true; }
        if (live) { const pid = d.who === 'a' ? live.a : live.b; setIcon(pid, 'ok'); }
        break;
      }
      case 'rpsv': {
        if (!live || (C.m && C.m.id !== d.id)) live = { a: d.a, b: d.b, reveal: null, seen: clock };
        const M = C.m && C.m.id === d.id ? C.m : null;
        const r = { t0: clock, picks: d.picks, win: d.win, auto: d.auto, sc: d.sc };
        live.reveal = r; live.picks = d.picks; live.win = d.win;
        if (M) { M.reveal = r; M.sc = M.role === 'a' ? { me: d.sc.a, opp: d.sc.b } : { me: d.sc.b, opp: d.sc.a }; }
        else toast(tf('{a} vs {b}: {pa} - {pb}. {w}', { a: nameOf(d.a), b: nameOf(d.b), pa: moveName(d.picks[0]), pb: moveName(d.picks[1]), w: d.win === 'd' ? t('Draw.') : tf('{name} took the round.', { name: nameOf(d.win === 'a' ? d.a : d.b) }) }), 'info');
        setIcon(d.a, 'rock'); setIcon(d.b, 'rock');
        sfx('ui_click', 0.4);
        break;
      }
      case 'rpse': {
        const M = C.m;
        const mine = d.a === self || d.b === self, role = d.a === self ? 'a' : 'b';
        if (mine) {
          const won = d.winner === role, draw = d.winner === 'd';
          const sc = role === 'a' ? `${d.sc.a} : ${d.sc.b}` : `${d.sc.b} : ${d.sc.a}`;
          let sub = sc;
          if (!draw && d.pay > 0 && won) sub += ' · ' + tf('Won ◈{n}.', { n: d.pay });   // [followers] the winner gains followers; the loser loses nothing (Followers are never spent)
          C.endShow = { txt: draw ? t('DRAW') : won ? t('YOU WIN!') : tf('{name} WINS', { name: nameOf(M?.opp || (role === 'a' ? d.b : d.a)) }), cls: draw ? '' : won ? 'win' : 'lose', sub, until: clock + 3.2 };
          sfx(draw ? 'ui_click' : won ? 'slot_win' : 'slot_lose', 0.6);
        }
        C.m = null; C.ask = null;
        if (live) { setTimeout(() => { if (!C.m) { live = null; dropSprites(); } }, 900); }
        break;
      }
      default: break;
    }
  }

  // ---------------------------------------------------------------------------------------------- input
  function onKey(e) {
    if (disposed || e.repeat) return;
    if (game.ui?.blocksInput?.() || game.terminal?.active || game.minigame) return;
    const A = C.ask, M = C.m;
    if (A && A.b === me() && !M && (e.code === 'KeyY' || e.code === 'KeyN')) {
      e.stopImmediatePropagation(); e.preventDefault();
      if (e.code === 'KeyY') { if (A.wager > coins()) toast(t('Not enough Followers for that wager.'), 'bad'); else request('ac'); }
      else request('no');
      return;
    }
    if (M && M.myPick === null && !M.reveal && e.code in MOVE_KEYS) {
      e.stopImmediatePropagation(); e.preventDefault();
      M.myPick = MOVE_KEYS[e.code];
      request('pk', { mv: M.myPick });
      sfx('ui_click', 0.5, 1 + M.myPick * 0.12);
    }
  }
  window.addEventListener('keydown', onKey, true);
  game.rpsPromptOpen = () => !disposed && !!(C.ask && C.ask.b === me() && !C.m);   // role skills (Y) + others yield while the wager prompt is open

  // ---------------------------------------------------------------------------------------------- challenging
  function remotesNear(range) {
    const p = game.player?.pos, out = [];
    if (!p) return out;
    for (const r of game.remotes?.values?.() || []) { if (!r?.pos || r.dead) continue; const d = Math.hypot(r.pos.x - p.x, r.pos.z - p.z); if (d <= range) out.push({ r, d }); }
    return out.sort((x, y) => x.d - y.d);
  }
  function lookedAt(list) {
    const eye = game.player.eyePos?.() || game.player.pos, f = game.player.forward?.();
    if (!f) return list[0];
    let best = null, bs = 0.5;
    for (const it of list) { _h.copy(it.r.pos); _h.y += 1.2; _h.sub(eye); const dd = _h.length() || 1, dot = _h.dot(f) / dd; if (dot > bs) { bs = dot; best = it; } }
    return best || list[0];
  }
  function challenge(id, wager = 0) {
    if (C.ask || C.m) { toast(t('You are already in a game.'), 'bad'); return false; }
    wager = Math.max(0, Math.min(RPS.WAGER_MAX, Math.floor(+wager) || 0));
    if (wager > coins()) { toast(t('Not enough Followers for that wager.'), 'bad'); return false; }
    request('ch', { to: id, w: wager });
    return true;
  }
  function chatCommand(args) {
    let wager = 0, name = '';
    for (const a of args) { if (/^\d+$/.test(a)) wager = +a; else name += (name ? ' ' : '') + a; }
    const near = remotesNear(RPS.RANGE_START);
    let target = null;
    if (name) target = near.find((x) => String(x.r.name || '').toLowerCase().includes(name.toLowerCase())) || null;
    else if (near.length) target = lookedAt(near);
    if (!target) { toast(t('No crewmate close enough.'), 'bad'); return; }
    challenge(target.r.id, wager);
  }
  try { game.mods.chatCommands?.set('rps', { fn: (args) => chatCommand(args), owner: null }); } catch { /* ignore */ }

  return {
    onMsg, challenge, chatCommand,
    state: () => ({ ask: C.ask && { ...C.ask }, m: C.m && { ...C.m, reveal: !!C.m.reveal } }),
    /** add E-prompts on crewmates that are close enough */
    interactables(list) {
      if (disposed || C.ask || C.m || !game.player || game.player.dead) return;
      for (const { r } of remotesNear(4.5)) {
        list.push({ optionalPeer: true, pos: r.pos.clone().add(new THREE.Vector3(0, 1.2, 0)), r: 0.75, reach: 4.2, label: () => tf('Rock-Paper-Scissors with {name} [E]', { name: r.name || nameOf(r.id) }), sub: () => t('Best of 3. Wager: /rps <Followers> <name>'), action: () => challenge(r.id, 0) });
      }
    },
    update(dt) {
      clock += Math.min(dt, 0.1);
      if (C.ask && clock > C.ask.until + 1) C.ask = null;
      if (live && !C.m && clock - live.seen > 14) { live = null; dropSprites(); }   // a spectated match whose end we never heard of
      if (live) {
        const R = live.reveal;
        if (R && clock - R.t0 >= 1.45) {
          const picks = R.picks, ta = R.win === 'a' ? 0xffe27a : R.win === 'b' ? 0x9a9a9a : 0xffffff, tb = R.win === 'b' ? 0xffe27a : R.win === 'a' ? 0x9a9a9a : 0xffffff;
          setIcon(live.a, MOVES[picks[0]], ta); setIcon(live.b, MOVES[picks[1]], tb);
        }
        placeSprites();
      }
      renderHud();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      game.rpsPromptOpen = null;
      window.removeEventListener('keydown', onKey, true);
      try { game.mods.chatCommands?.delete('rps'); } catch { /* ignore */ }
      dropSprites(); for (const k of Object.keys(icons)) icons[k].dispose();
      hud.remove(); document.getElementById('tfg-rps-css')?.remove();
      for (const o of offs) { try { o?.(); } catch { /* ignore */ } }
      void isHost;
    },
  };
}
