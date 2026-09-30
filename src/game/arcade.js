// ARCADE (module `arcade`, install: this.useModule('arcade', installArcade)). See docs/wave4/arcade.md.
//   installArcade(game) -> game.arcade = { tables, get, subscribe, request, open, close, booths, state, host, dispose }
// Downtime games for the crew: a CHESS / DAMA (Turkish draughts) table in the ship, on the HQ pier and on the homeworld pad, and a CARNIVAL corner on the HQ
// pier (can knockdown, shooting gallery, strength tester).
// Boards: host-authoritative (game/arcade_core.js). Clients send `arreq` {op: sit | stand | ai | kind | new | resign | move | sync}, the host validates and broadcasts a
// full table snapshot as `ar` {k: 't'} (HOST_ONLY). Spectators simply render snapshots. The optional AI (1-ply / 2-ply) runs on the host.
// Booths: `arreq` {op: play | end | abort}; the host charges the fee from ship credits, the client plays the round locally (game/arcade_booths.js) and reports the
// score, the host clamps + pays (daily prize cap per player) and answers with `ar` {k: go | res}. Nothing here adds scene lights.
import * as THREE from 'three';
import { HOST_ONLY } from '../net/session.js';
import { addTranslations, t, tf, sysMsg, onLangChange } from '../core/i18n.js';
import { hudDock } from '../ui/dock.js';
import { createArcadePanel, tableTitle } from '../ui/panels/arcade.js';
import { createGameTable, createCarnival, TABLE, BOOTH_X } from '../models/arcade.js';
import { createBoothPlayer } from './arcade_booths.js';
import { createRpsHost, RPS } from './arcade_rps.js';
import { createRpsClient } from './arcade_rps_ui.js';
import { createChess3d, isClassic, setClassic } from './chess3d.js';
import * as A from './arcade_core.js';
import { SPOTS as SHIP_SPOTS } from '../world/shiplayout.js';

HOST_ONLY.add('ar');

// ------------------------------------------------------------------------------------------------ text (English is the key; TR + RU here)
const TR = {
  'CHESS TABLE': 'SATRANÇ MASASI', 'DAMA TABLE': 'DAMA MASASI', 'CAN KNOCKDOWN': 'KUTU DEVİRME', 'SHOOTING GALLERY': 'ATIŞ POLİGONU', 'STRENGTH TESTER': 'GÜÇ ÖLÇER',
  '3 balls': '3 top', '25 seconds': '25 saniye', '3 swings': '3 vuruş',
  'White': 'Beyaz', 'Black': 'Siyah', 'Empty': 'Boş', 'Computer': 'Bilgisayar', 'Computer (easy)': 'Bilgisayar (kolay)', 'Computer (normal)': 'Bilgisayar (normal)', 'you': 'sen',
  'Sit': 'Otur', 'Stand up': 'Kalk', 'AI easy': 'Kolay YZ', 'AI normal': 'Normal YZ', 'No AI': 'YZ yok', 'New game': 'Yeni oyun', 'Resign': 'Pes et',
  'Switch to CHESS': 'SATRANCA geç', 'Switch to DAMA': 'DAMAYA geç', 'Spectating': 'İzliyorsun', 'You play': 'Sen oynuyorsun:',
  '{side} to move': 'Sıra {side} tarafında', '{side} wins': '{side} kazandı', 'CHECK!': 'ŞAH!', 'Draw': 'Beraberlik',
  'checkmate': 'şah mat', 'resignation': 'teslim', 'no legal moves': 'yasal hamle kalmadı', 'stalemate': 'pat', 'insufficient material': 'yetersiz taş',
  'fifty-move rule': 'elli hamle kuralı', 'threefold repetition': 'üç kez tekrar', 'king against king': 'şah şaha karşı', 'no progress': 'ilerleme yok',
  'PICK A PIECE, THEN A SQUARE': 'BİR TAŞ SEÇ, SONRA BİR KARE',
  'Take a seat to play, or watch. Everyone at the table sees the same board.': 'Oynamak için otur ya da izle. Masadaki herkes aynı tahtayı görür.',
  'Waiting for an opponent. Invite a friend, or pick a computer opponent for the empty seat.': 'Rakip bekleniyor. Bir arkadaşını çağır ya da boş koltuğa bilgisayar rakip seç.',
  'Dama: men step forward or sideways, kings fly. Captures are mandatory and the biggest capture must be taken.': 'Dama: taşlar ileri veya yana bir kare gider, dama uçar. Yemek zorunludur ve en çok taşı yiyen yol seçilmelidir.',
  'Employee': 'Çalışan',
  'Play {game} [E]': '{game} oyna [E]', 'Win credits. Daily prize cap per player.': 'Kredi kazan. Oyuncu başına günlük ödül sınırı var.',
  'LMB throws a ball. Knock the cans off the shelf.': 'Sol tık top atar. Kutuları raftan düşür.',
  'LMB fires. Small targets pay more. Blue decoys cost points.': 'Sol tık ateş eder. Küçük hedefler daha çok verir. Mavi yemler puan götürür.',
  'LMB starts the meter, LMB again stops it. Aim for the top.': 'Sol tık ölçeri başlatır, tekrar durdurur. Tepeyi hedefle.',
  'Prize credits left today: ▮{n}': 'Bugün kalan ödül kredisi: ▮{n}', 'Round cancelled.': 'Tur iptal edildi.', 'Decoy! -{n}': 'Yem! -{n}',
  'Score {s}: you win ▮{n}!': 'Skor {s}: ▮{n} kazandın!', 'Score {s}: no prize this time.': 'Skor {s}: bu sefer ödül yok.', '(daily prize cap reached)': '(günlük ödül sınırına ulaşıldı)',
  'That was suspiciously fast. No prize.': 'Bu şüpheli derecede hızlıydı. Ödül yok.', 'JACKPOT!': 'JACKPOT!',
  'Cans': 'Kutu', 'Balls': 'Top', 'Score': 'Skor', 'Time': 'Süre', 'Swing': 'Vuruş', 'Best': 'En iyi',
  '{name} hit the jackpot at the {@game}!': '{name}, {@game} oyununda jackpotu vurdu!', 'Carnival prize': 'Panayır ödülü',
  'Bad level.': 'Geçersiz seviye.', 'Finish or resign the current game first.': 'Önce mevcut oyunu bitir ya da pes et.', 'Get closer to the booth.': 'Kabine biraz daha yaklaş.',
  'Get closer to the table.': 'Masaya biraz daha yaklaş.', 'Illegal move.': 'Geçersiz hamle.', 'No such session.': 'Böyle bir oturum yok.', 'Not enough credits.': 'Yeterli kredi yok.',
  'Not your turn.': 'Sıra sende değil.', 'Nothing to resign.': 'Pes edilecek bir şey yok.', 'Pick a side.': 'Bir taraf seç.', 'Sit down first.': 'Önce otur.',
  'That seat is taken.': 'O koltuk dolu.', 'The carnival is not here.': 'Panayır burada değil.', 'The game is over.': 'Oyun bitti.', 'Unknown booth.': 'Bilinmeyen kabin.',
  'Unknown game.': 'Bilinmeyen oyun.', 'Wait a moment.': 'Biraz bekle.', 'You are already playing.': 'Zaten oynuyorsun.', 'You are not seated.': 'Oturmuyorsun.',
};
const RU = {
  'CHESS TABLE': 'ШАХМАТНЫЙ СТОЛ', 'DAMA TABLE': 'СТОЛ ДАМЫ', 'CAN KNOCKDOWN': 'СБЕЙ БАНКИ', 'SHOOTING GALLERY': 'ТИР', 'STRENGTH TESTER': 'СИЛОМЕР',
  '3 balls': '3 мяча', '25 seconds': '25 секунд', '3 swings': '3 удара',
  'White': 'Белые', 'Black': 'Чёрные', 'Empty': 'Свободно', 'Computer': 'Компьютер', 'Computer (easy)': 'Компьютер (лёгкий)', 'Computer (normal)': 'Компьютер (обычный)', 'you': 'вы',
  'Sit': 'Сесть', 'Stand up': 'Встать', 'AI easy': 'ИИ лёгкий', 'AI normal': 'ИИ обычный', 'No AI': 'Без ИИ', 'New game': 'Новая игра', 'Resign': 'Сдаться',
  'Switch to CHESS': 'Перейти на ШАХМАТЫ', 'Switch to DAMA': 'Перейти на ДАМУ', 'Spectating': 'Вы наблюдаете', 'You play': 'Вы играете:',
  '{side} to move': 'Ход: {side}', '{side} wins': '{side} побеждают', 'CHECK!': 'ШАХ!', 'Draw': 'Ничья',
  'checkmate': 'мат', 'resignation': 'сдача', 'no legal moves': 'нет ходов', 'stalemate': 'пат', 'insufficient material': 'недостаточно материала',
  'fifty-move rule': 'правило пятидесяти ходов', 'threefold repetition': 'троекратное повторение', 'king against king': 'король против короля', 'no progress': 'нет прогресса',
  'PICK A PIECE, THEN A SQUARE': 'ВЫБЕРИ ФИГУРУ, ПОТОМ КЛЕТКУ',
  'Take a seat to play, or watch. Everyone at the table sees the same board.': 'Садитесь играть или наблюдайте. Все за столом видят одну доску.',
  'Waiting for an opponent. Invite a friend, or pick a computer opponent for the empty seat.': 'Ждём соперника. Позовите друга или выберите компьютер на свободное место.',
  'Dama: men step forward or sideways, kings fly. Captures are mandatory and the biggest capture must be taken.': 'Дама: простые ходят вперёд и в стороны, дамки летают. Взятие обязательно, надо брать максимум.',
  'Employee': 'Сотрудник',
  'Play {game} [E]': 'Играть: {game} [E]', 'Win credits. Daily prize cap per player.': 'Выигрывай кредиты. Дневной лимит призов на игрока.',
  'LMB throws a ball. Knock the cans off the shelf.': 'ЛКМ бросает мяч. Сбей банки с полки.',
  'LMB fires. Small targets pay more. Blue decoys cost points.': 'ЛКМ стреляет. Маленькие мишени дороже. Синие приманки отнимают очки.',
  'LMB starts the meter, LMB again stops it. Aim for the top.': 'ЛКМ запускает шкалу, ещё раз останавливает. Цель - верх.',
  'Prize credits left today: ▮{n}': 'Призовых кредитов на сегодня: ▮{n}', 'Round cancelled.': 'Раунд отменён.', 'Decoy! -{n}': 'Приманка! -{n}',
  'Score {s}: you win ▮{n}!': 'Счёт {s}: вы выиграли ▮{n}!', 'Score {s}: no prize this time.': 'Счёт {s}: в этот раз без приза.', '(daily prize cap reached)': '(дневной лимит призов исчерпан)',
  'That was suspiciously fast. No prize.': 'Подозрительно быстро. Приза нет.', 'JACKPOT!': 'ДЖЕКПОТ!',
  'Cans': 'Банки', 'Balls': 'Мячи', 'Score': 'Счёт', 'Time': 'Время', 'Swing': 'Удар', 'Best': 'Лучший',
  '{name} hit the jackpot at the {@game}!': '{name} сорвал джекпот: {@game}!', 'Carnival prize': 'Приз карнавала',
  'Bad level.': 'Неверный уровень.', 'Finish or resign the current game first.': 'Сначала закончите или сдайте текущую партию.', 'Get closer to the booth.': 'Подойдите ближе к палатке.',
  'Get closer to the table.': 'Подойдите ближе к столу.', 'Illegal move.': 'Недопустимый ход.', 'No such session.': 'Такой сессии нет.', 'Not enough credits.': 'Не хватает кредитов.',
  'Not your turn.': 'Не ваш ход.', 'Nothing to resign.': 'Нечего сдавать.', 'Pick a side.': 'Выберите сторону.', 'Sit down first.': 'Сначала сядьте.',
  'That seat is taken.': 'Место занято.', 'The carnival is not here.': 'Карнавала здесь нет.', 'The game is over.': 'Игра окончена.', 'Unknown booth.': 'Неизвестная палатка.',
  'Unknown game.': 'Неизвестная игра.', 'Wait a moment.': 'Подождите немного.', 'You are already playing.': 'Вы уже играете.', 'You are not seated.': 'Вы не сидите за столом.',
};


const PY = -1.25;   // pier / pad ground height (company + homeworld)
const SITES = {
  ship: { place: 'ship', pos: [SHIP_SPOTS.chess.x, 0, SHIP_SPOTS.chess.z], rotY: SHIP_SPOTS.chess.ry },   // [wave5] world/shiplayout.js (it stood inside the workbench)
  hq: { place: 'company', pos: [-8.5, PY, 8], rotY: 0 },
  home: { place: 'home', pos: [-9.5, PY, 6], rotY: Math.PI / 2 },
};
const CARNIVAL_AT = [11, PY, 27];   // HQ pier, north-east of the pitch: booths open toward +z (players stand at z > 27)
const SEAT_RANGE = 12, PLAY_RANGE = 6.5, CANCEL_RANGE = 10;
const CSS = `
.ar-bar{display:inline-block;position:relative;width:170px;height:14px;background:rgba(0,0,0,.6);border:1px solid rgba(255,190,110,.5);vertical-align:middle;margin-left:8px;background-image:linear-gradient(90deg,#3ad06a 0,#3ad06a 50%,#f2c230 50%,#f2c230 80%,#e0453a 80%);background-size:100% 100%;opacity:.9}
.ar-bar i{position:absolute;top:-4px;bottom:-4px;width:4px;margin-left:-2px;background:#fff;box-shadow:0 0 6px #fff}
`;

export function installArcade(game) {
  addTranslations(TR, 'tr'); addTranslations(RU, 'ru');
  const mm = game.mods;
  const offs = [];
  let disposed = false, boundNet = null, worldSig = '';
  const isHost = () => !!game.isHost;
  const day = () => game.run?.day | 0;
  const nameOf = (id) => game.playerName?.(id) || 'Employee';
  const feeOf = (b) => A.BOOTHS[b].fee;
  if (typeof document !== 'undefined' && !document.getElementById('tfg-arcade-hud-css')) { const s = document.createElement('style'); s.id = 'tfg-arcade-hud-css'; s.textContent = CSS; document.head.appendChild(s); }

  // ================================================================================================ shared state
  const tables = new Map();      // id -> { snap, dec } (every peer)
  const subs = new Set();
  const fresh = {};              // default (untouched) entries for ids we have no snapshot of yet
  const entry = (id) => tables.get(id) || (fresh[id] ||= (() => { const s = A.snapshot(A.newTable(id)); return { snap: s, dec: A.decode(s) }; })());
  const emitChange = (id) => { for (const f of [...subs]) { try { f(id); } catch (e) { console.warn('[arcade] sub', e); } } };

  // ================================================================================================ world views
  const views = new Map();       // table id -> { model, group, colliders }
  let carn = null;               // { model, group, colliders, anchor: Vector3 }
  const sitePos = new THREE.Vector3();
  const worldOfSite = (id) => {
    const v = views.get(id);
    if (!v) return null;
    v.model.root.updateWorldMatrix(true, false);
    return v.model.root.getWorldPosition(sitePos.set(0, 0, 0)).clone();
  };
  /** static boxes in a parent's frame; `owner` is the map's colliders array (freed with the map at takeoff / unload) */
  function addColliders(owner, specs, ox, oy, oz) {
    const hs = [];
    for (const c of specs) { const h = game.physics.addStaticBox(ox + c.x, oy + c.y, oz + c.z, c.hx, c.hy, c.hz, 0); hs.push(h); owner.push(h); }
    return { hs, owner };
  }
  function dropColliders(c) {
    for (const h of c?.hs || []) {
      const i = c.owner.indexOf(h);
      if (i >= 0) { c.owner.splice(i, 1); try { game.physics.removeCollider(h); } catch { /* ignore */ } }   // already gone with the map: never remove twice
    }
  }
  function buildTable(id, parent, ownerColliders) {
    const s = SITES[id];
    const model = createGameTable();
    model.root.position.set(s.pos[0], s.pos[1], s.pos[2]); model.root.rotation.y = s.rotY;
    parent.add(model.root);
    const [x, y, z] = s.pos;
    const hs = addColliders(ownerColliders, [{ x: 0, y: TABLE.topY / 2, z: 0, hx: 0.5, hy: TABLE.topY / 2, hz: 0.5 }], x, y, z);   // 1 x 1 m top: turning it 90 degrees keeps the box
    const e = tables.get(id);
    if (e) model.update(e.snap.kind, e.snap.pos, { last: e.snap.last, check: e.dec.check, turn: e.dec.st.turn });
    views.set(id, { model, group: parent, colliders: hs });
  }
  function dropView(id) {
    const v = views.get(id);
    if (!v) return;
    dropColliders(v.colliders); v.model.dispose(); views.delete(id);
  }
  function labels() {
    const f = (k) => `▮${feeOf(k)}`;
    return { cans: [t('CAN KNOCKDOWN'), `${t('3 balls')} · ${f('cans')}`], gallery: [t('SHOOTING GALLERY'), `${t('25 seconds')} · ${f('gallery')}`], strength: [t('STRENGTH TESTER'), `${t('3 swings')} · ${f('strength')}`] };
  }
  function buildCarnival(co) {
    dropCarnival();
    const model = createCarnival(labels());
    const [x, y, z] = CARNIVAL_AT;
    model.root.position.set(x, y, z);
    co.group.add(model.root);
    const hs = addColliders(co.colliders, model.colliders, x, y, z);
    carn = { model, colliders: hs, co };
  }
  function dropCarnival() {
    if (!carn) return;
    booths.cancel(true); dropColliders(carn.colliders); carn.model.dispose(); carn = null;
  }
  function syncWorld() {
    if (disposed) return;
    const w = game.world;
    // ship table (permanent)
    if (!views.has('ship') && game.ship?.group) {
      const own = [];
      buildTable('ship', game.ship.group, own);
    } else if (views.get('ship') && !views.get('ship').model.root.parent && game.ship?.group) game.ship.group.add(views.get('ship').model.root);
    const wantHq = !!w?.company, wantHome = !!(w?.outdoor?.home);
    if (wantHq && (!views.has('hq') || views.get('hq').group !== w.company.group)) { dropView('hq'); buildTable('hq', w.company.group, w.company.colliders); }
    if (!wantHq && views.has('hq')) dropView('hq');
    if (wantHq && (!carn || carn.co !== w.company)) buildCarnival(w.company);
    if (!wantHq && carn) dropCarnival();
    if (wantHome && (!views.has('home') || views.get('home').group !== w.outdoor.group)) { dropView('home'); buildTable('home', w.outdoor.group, w.outdoor.colliders); }
    if (!wantHome && views.has('home')) dropView('home');
  }

  // ================================================================================================ HOST: tables
  const H = { tables: new Map(), booths: A.createBooths(), timers: new Map(), awayT: 0, rps: createRpsHost({ day: () => game.run?.day | 0 }), rpsT: 0 };
  const hostTable = (id) => { if (!SITES[id]) return null; let tb = H.tables.get(id); if (!tb) H.tables.set(id, tb = A.newTable(id)); return tb; };
  const err = (to, key, vars = {}) => game.net?.sendTo(to, 'sys', sysMsg(key, vars, 'bad'));
  const posOf = (pid) => game.aiPlayerById?.(pid)?.pos || null;
  function hostBroadcast(tb) { game.net?.broadcast('ar', { k: 't', s: A.snapshot(tb) }); }
  function aiKick(tb) {
    if (!A.aiToMove(tb) || H.timers.has(tb.id)) return;
    const id = game.later?.(() => {
      H.timers.delete(tb.id);
      if (disposed || !A.aiToMove(tb)) return;
      try { A.aiStep(tb); } catch (e) { console.warn('[arcade] ai', e); return; }
      hostBroadcast(tb); aiKick(tb);
    }, 700 + Math.random() * 600);
    H.timers.set(tb.id, id);
  }
  const near = (pid, id, range) => {
    const p = posOf(pid), s = worldOfSite(id);
    if (!p || !s) return false;
    return Math.hypot(p.x - s.x, p.z - s.z) < range && Math.abs(p.y - s.y) < 4;
  };
  function hostReq(d, from) {
    if (!d || typeof d.op !== 'string') return;
    try { hostOp(d, from); } catch (e) { console.error('[arcade] req', d.op, e); }
  }
  function hostOp(d, from) {
    if (d.op === 'sync') { for (const tb of H.tables.values()) game.net.sendTo(from, 'ar', { k: 't', s: A.snapshot(tb) }); return; }
    if (['play', 'end', 'abort'].includes(d.op)) return boothOp(d, from);
    if (d.op === 'rps') return rpsOp(d, from);
    const tb = hostTable(d.id);
    if (!tb) return;
    let r = { ok: false };
    switch (d.op) {
      case 'sit': if (!near(from, tb.id, SEAT_RANGE)) return err(from, 'Get closer to the table.'); r = A.sit(tb, from, d.c); break;
      case 'stand': r = A.stand(tb, from); break;
      case 'ai': r = A.setAI(tb, from, d.c, d.lv); break;
      case 'kind': r = A.setKind(tb, from, d.k); break;
      case 'new': r = A.newGame(tb, from); break;
      case 'resign': r = A.resign(tb, from); break;
      case 'move': r = A.move(tb, from, d.m); break;
      default: return;
    }
    if (!r.ok) { if (r.err) err(from, r.err); hostBroadcast(tb); return; }   // resend the truth so a desynced panel heals
    hostBroadcast(tb); aiKick(tb);
  }
  function boothOp(d, from) {
    const B = H.booths;
    if (d.op === 'abort') { B.abort(from); return; }
    if (!A.BOOTHS[d.booth]) return;
    if (d.op === 'play') {
      if (!carn) return err(from, 'The carnival is not here.');
      const bx = BOOTH_X[d.booth], p = posOf(from);
      const c = carnWorld(bx, 0, 2);
      if (!p || Math.hypot(p.x - c.x, p.z - c.z) > PLAY_RANGE) return err(from, 'Get closer to the booth.');
      const r = B.start(from, d.booth, game.time, game.run?.credits | 0);
      if (!r.ok) return err(from, r.err);
      game.run.credits -= r.fee; game.broadcastRun?.(['credits']);
      game.net.sendTo(from, 'ar', { k: 'go', booth: d.booth, sid: r.sid, fee: r.fee, left: B.prizeLeft(from, day()) });
      return;
    }
    const r = B.end(from, d.sid | 0, d.booth, d.score, game.time, day());
    if (!r.ok) return;
    if (r.pay > 0) {
      game.run.credits += r.pay; game.broadcastRun?.(['credits']);
      if (r.xp) game.net.broadcast('xp', { to: from, xp: r.xp, coin: 0, reason: 'Carnival prize' });
      if (r.pay >= A.BOOTHS[d.booth].pay[0][1]) game.net.broadcast('sys', sysMsg('{name} hit the jackpot at the {@game}!', { name: nameOf(from), game: boothName(d.booth) }, 'good'));
    }
    game.net.sendTo(from, 'ar', { k: 'res', booth: d.booth, score: r.score, pay: r.pay, capped: !!r.capped, cheat: !!r.cheat, left: B.prizeLeft(from, day()) });
  }
  // ---- rock-paper-scissors (host rules in arcade_rps.js; here: range / alive checks + delivering the events)
  function rpsFlush() {
    for (const e of H.rps.drain()) {
      if (e.to === 'all') game.net.broadcast('ar', e.msg); else for (const pid of e.to) game.net.sendTo(pid, 'ar', e.msg);
      if (e.msg.k === 'rpse' && e.msg.pay > 0) game.net.broadcast('xp', { to: e.msg.winner === 'a' ? e.msg.a : e.msg.b, xp: 0, coin: e.msg.pay, reason: 'Trade - Rock-Paper-Scissors' });
    }
  }
  function rpsOp(d, from) {
    const R = H.rps, now = game.time;
    switch (d.s) {
      case 'ch': {
        const a = game.aiPlayerById?.(from), b = game.aiPlayerById?.(d.to);
        if (!a || !b || a.dead || b.dead) return err(from, 'They cannot play right now.');
        if (Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z) > RPS.RANGE_START || Math.abs(a.pos.y - b.pos.y) > 4) return err(from, 'Get closer to them.');
        const r = R.challenge(now, from, d.to, d.w);
        if (!r.ok) err(from, r.err, r.vars);
        break;
      }
      case 'ac': case 'no': { const r = R.respond(now, from, d.s === 'ac'); if (!r.ok && r.err) err(from, r.err); break; }
      case 'pk': { const r = R.pick(now, from, d.mv); if (!r.ok && r.err && r.err !== 'Not now.') err(from, r.err); break; }
      case 'lv': R.leave(now, from); break;
      default: break;
    }
    rpsFlush();
  }
  function rpsWatch(dt) {
    H.rpsT -= dt;
    H.rps.tick(game.time);
    if (H.rpsT <= 0) {
      H.rpsT = 1;
      for (const m of [...H.rps.matches.values()]) {
        if (m.state !== 'live') continue;
        const a = game.aiPlayerById?.(m.a), b = game.aiPlayerById?.(m.b);
        if (!a || !b || a.dead || b.dead || Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z) > RPS.RANGE_KEEP) H.rps.leave(game.time, !a || a.dead ? m.a : m.b, 'far');
      }
    }
    rpsFlush();
  }
  function hostAway(dt) {
    H.awayT -= dt;
    if (H.awayT > 0) return;
    H.awayT = 2;
    for (const tb of H.tables.values()) {
      for (const pid of A.humans(tb)) {
        const p = posOf(pid), s = worldOfSite(tb.id);
        if (!p || !s || Math.hypot(p.x - s.x, p.z - s.z) > SEAT_RANGE + 4) { A.stand(tb, pid); hostBroadcast(tb); }
      }
      // a table whose map is gone (HQ / homeworld after takeoff) resets
      if (!worldOfSite(tb.id) && (tb.ply > 0 || A.humans(tb).length || tb.ai.w || tb.ai.b)) { A.resetTable(tb); hostBroadcast(tb); }
    }
  }

  // ================================================================================================ CLIENT: net
  function onMsg(d) {
    if (!d) return;
    try {
      if (typeof d.k === 'string' && d.k.startsWith('rps')) { rpsc.onMsg(d); return; }
      if (d.k === 't' && d.s?.id && SITES[d.s.id]) {
        const dec = A.decode(d.s);
        tables.set(d.s.id, { snap: d.s, dec });
        views.get(d.s.id)?.model.update(d.s.kind, d.s.pos, { last: d.s.last, check: dec.check, turn: dec.st.turn, animate: true });   // [chess3d] every peer animates the move
        emitChange(d.s.id);
      } else if (d.k === 'go') {
        if (booths.start(d.booth, d.sid)) {
          const how = d.booth === 'cans' ? t('LMB throws a ball. Knock the cans off the shelf.') : d.booth === 'gallery' ? t('LMB fires. Small targets pay more. Blue decoys cost points.') : t('LMB starts the meter, LMB again stops it. Aim for the top.');
          game.ui?.toast?.(`${t(boothName(d.booth))}: ${how}`, 'info');
          game.ui?.toast?.(tf('Prize credits left today: ▮{n}', { n: d.left }), 'info');
        }
      } else if (d.k === 'res') {
        if (d.cheat) { game.ui?.toast?.(t('That was suspiciously fast. No prize.'), 'bad'); return; }
        const line = d.pay > 0 ? tf('Score {s}: you win ▮{n}!', { s: d.score, n: d.pay }) : tf('Score {s}: no prize this time.', { s: d.score });
        game.ui?.toast?.(line + (d.capped ? ' ' + t('(daily prize cap reached)') : ''), d.pay > 0 ? 'good' : 'info');
        game.sfx?.(d.pay > 0 ? (d.pay >= 20 ? 'slot_jackpot' : 'slot_win') : 'slot_lose', 0.6);
        if (d.pay >= 20) game.ui?.hud?.bigText?.(t('JACKPOT!'), line);
      }
    } catch (e) { console.warn('[arcade] msg', d?.k, e); }
  }
  const boothName = (b) => (b === 'cans' ? 'CAN KNOCKDOWN' : b === 'gallery' ? 'SHOOTING GALLERY' : 'STRENGTH TESTER');
  function request(op, data = {}) { game.net?.request('arreq', { op, ...data }); }

  // ================================================================================================ CLIENT: panel
  let panel = null, openId = null;
  // [chess3d] the real 3D board is the default view; the 2D overlay is "Classic view" (saved per browser)
  const c3 = createChess3d({ game, arc: { get: entry, subscribe: (f) => { subs.add(f); return () => subs.delete(f); }, request: (op, data) => request(op, data) }, viewOf: (id) => { const v = views.get(id); return v ? { model: v.model, root: v.model.root } : null; }, request: (op, data) => request(op, data), closeView: () => close(), openView: (id) => open(id) });
  // [chess-seats] seats are physical: E on a stool sits (open), closing the view (ESC / E / Stand up) stands you up again. Re-opening the same table keeps the seat.
  let keepSeat = false;
  const seatedAt = (id) => { const s = entry(id).snap.seats; return s.w === game.selfId ? 'w' : s.b === game.selfId ? 'b' : null; };
  function open(id) {
    if (disposed || !SITES[id]) return;
    if (!tables.has(id)) request('sync');
    keepSeat = true; close(); keepSeat = false;
    openId = id;
    const ctl = isClassic() || !views.has(id) ? createArcadePanel(game.ui, game, api, id) : c3.create(id);
    game.ui.openPanel(ctl.el); panel = ctl;
    const openedAt = performance.now();
    const onKey = (e) => { if (e.code === 'KeyE' && !e.repeat && !e.ctrlKey && !e.altKey && performance.now() - openedAt > 250 && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '')) { e.preventDefault(); e.stopImmediatePropagation(); close(); } };
    window.addEventListener('keydown', onKey, true);
    game.ui.onPanelClose = () => {
      window.removeEventListener('keydown', onKey, true);
      ctl.dispose(); if (panel === ctl) panel = null;
      if (!keepSeat && !disposed && seatedAt(id)) request('stand', { id });
      return false;
    };
  }
  function close() { if (panel) game.ui.closePanel(); }
  function toggleClassic(v) { setClassic(v); if (panel && openId) open(openId); }

  // ================================================================================================ CLIENT: booths
  const booths = createBoothPlayer({
    game, carnival: () => carn?.model || null,
    finish: (booth, sid, score) => request('end', { booth, sid, score }),
    say: (text, kind) => game.ui?.toast?.(text, kind || 'info'),
  });
  const dock = typeof document !== 'undefined' ? hudDock('bottom', 'arcade', 46) : null;
  if (dock) dock.style.cssText = 'font-family:VT323,monospace;font-size:26px;color:#ffe9b0;text-shadow:0 0 6px #000,0 0 10px rgba(255,160,40,.5);display:none;background:rgba(0,0,0,.5);padding:2px 14px;border:1px solid rgba(255,190,110,.4)';
  let hudTxt = '';
  function onMouseDown(e) {
    if (e.button !== 0 || disposed || !booths.active) return;
    const inp = game.input;
    if (!inp?.locked || !inp.enabled || game.player.dead || game.minigame || game.terminal?.active || game.ui?.blocksInput?.()) return;
    e.stopImmediatePropagation(); e.preventDefault();
    booths.fire();
  }
  window.addEventListener('mousedown', onMouseDown, true);
  const carnWorld = (x, y, z) => { if (!carn) return null; carn.model.root.updateWorldMatrix(true, false); return carn.model.root.localToWorld(new THREE.Vector3(x, y, z)); };
  const boothWorld = (id) => carnWorld(BOOTH_X[id], 1.3, 0.55);

  const rpsc = createRpsClient({ game, request: (s, data = {}) => request('rps', { s, ...data }) });

  // ================================================================================================ wiring
  offs.push(mm.on('registerHandlers', (Hh, g) => { if (g === game) Hh('arreq', hostReq); }));
  function bindNet(net) {
    if (!net || net === boundNet) return;
    boundNet = net;
    net.on_('ar', onMsg);
    offs.push(net.on('peerLeave', (id) => { if (!isHost()) return; for (const tb of H.tables.values()) if (A.seatOf(tb, id)) { A.stand(tb, id); hostBroadcast(tb); } H.booths.abort(id); H.rps.leave(game.time, id); rpsFlush(); }));
    if (!isHost()) setTimeout(() => { if (!disposed) request('sync'); }, 1200);
  }
  offs.push(mm.on('netReady', (net, g) => { if (g === game) bindNet(net); }));
  if (game.net) bindNet(game.net);
  offs.push(mm.on('playerJoin', (id, info, g) => { if (g === game && isHost()) for (const tb of H.tables.values()) if (tb.ply > 0 || A.humans(tb).length) game.net.sendTo(id, 'ar', { k: 't', s: A.snapshot(tb) }); }));
  // host migration: every peer mirrors the table snapshots, so the new host rebuilds its books from them (stale seats are stood up by the away sweep)
  offs.push(mm.on('hostMigrated', (g, info) => {
    if (g !== game || !info?.self) return;
    for (const [id, e] of tables) { try { if (SITES[id] && !H.tables.has(id) && e?.snap) { const tb = A.restoreTable(e.snap); H.tables.set(id, tb); aiKick(tb); } } catch (err2) { console.warn('[arcade] migrate', id, err2); } }
  }));
  offs.push(mm.on('mapLoaded', (w, g) => { if (g === game) syncWorld(); }));
  offs.push(mm.on('phase', (ph, g) => { if (g === game) { close(); booths.cancel(true); if (isHost()) { for (const m of [...H.rps.matches.values()]) H.rps.leave(game.time, m.a); rpsFlush(); } setTimeout(() => { if (!disposed) syncWorld(); }, 50); } }));
  offs.push(mm.on('interactables', (list, g) => {
    if (g !== game || disposed || !game.player || game.player.dead) return;
    rpsc.interactables(list);
    const pp = game.player.pos;
    for (const [id, v] of views) {
      const w = worldOfSite(id);
      if (!w || Math.hypot(pp.x - w.x, pp.z - w.z) > 6 || Math.abs(pp.y - w.y) > 3.5) continue;
      const e = entry(id).snap;
      const seatTxt = (c) => (e.seats[c] ? nameOf(e.seats[c]) : e.ai[c] ? t('Computer') : '-');
      list.push({ pos: w.clone().add(new THREE.Vector3(0, TABLE.topY + 0.1, 0)), r: 0.5, reach: 3.3, label: () => `${t('Watch the game')} - ${tableTitle(entry(id).snap.kind)} [E]`, sub: () => `${t('White')}: ${seatTxt('w')} · ${t('Black')}: ${seatTxt('b')}`, action: () => open(id) });
      // [chess-seats] two stools (White on the +z side of the table, Black on -z): E sits you at that colour and locks the camera to it
      for (const c of ['w', 'b']) {
        const sp = v.model.root.localToWorld(new THREE.Vector3(0, 0.62, c === 'w' ? 0.78 : -0.78));
        list.push({
          pos: sp, r: 0.55, reach: 3.3,
          label: () => { const sn = entry(id).snap; return sn.seats[c] === game.selfId ? t('Stand up [E]') : sn.seats[c] ? tf('Seat taken: {name}', { name: nameOf(sn.seats[c]) }) : sn.ai[c] && sn.ply > 0 && !sn.over ? t('Seat taken: Computer') : c === 'w' ? t('Sit at White [E]') : t('Sit at Black [E]'); },
          sub: () => `${t('White')}: ${seatTxt('w')} · ${t('Black')}: ${seatTxt('b')}`,
          action: () => {
            const sn = entry(id).snap;
            if (sn.seats[c] === game.selfId) { if (panel) close(); else request('stand', { id }); return; }
            if (sn.seats[c] || (sn.ai[c] && sn.ply > 0 && !sn.over)) { game.ui?.toast?.(t('That seat is taken.'), 'bad'); return; }
            request('sit', { id, c }); open(id);
          },
        });
      }
    }
    if (carn && !booths.active) {
      for (const b of A.BOOTH_IDS) {
        const w = boothWorld(b);
        if (!w || Math.hypot(pp.x - w.x, pp.z - w.z) > 7) continue;
        list.push({ pos: w, r: 1.1, reach: 3.2, label: () => `${tf('Play {game} [E]', { game: t(boothName(b)) })}  ▮${feeOf(b)}`, sub: () => t('Win credits. Daily prize cap per player.'), action: () => request('play', { booth: b }) });
      }
    }
  }));
  offs.push(mm.on('update', (dt, g) => {
    if (g !== game || disposed) return;
    try {
      const w = game.world, sig = `${w?.company?.group?.id || 0}|${w?.outdoor?.home ? w.outdoor.group.id : 0}|${game.ship?.group?.id || 0}`;
      if (sig !== worldSig || (!views.has('ship') && game.ship?.group)) { worldSig = sig; syncWorld(); }   // maps come and go with the landings
      booths.update(dt);
      c3.update(dt);
      for (const v of views.values()) v.model.tick(dt);
      const act = booths.active;
      if (act) {
        const w = boothWorld(act.booth), pp = game.player.pos;
        if (game.player.dead || !w || Math.hypot(pp.x - w.x, pp.z - w.z) > CANCEL_RANGE) { booths.cancel(); request('abort'); }
      }
      const txt = booths.hud();
      if (dock && txt !== hudTxt) { hudTxt = txt; dock.innerHTML = txt; dock.style.display = txt ? '' : 'none'; }
      rpsc.update(dt);
      if (isHost()) { hostAway(dt); rpsWatch(dt); }
    } catch (e) { console.warn('[arcade] update', e); }
  }));
  offs.push(onLangChange(() => { try { carn?.model.relabel(labels()); panel?.refresh(); } catch { /* ignore */ } }));
  syncWorld();

  const api = {
    tables,
    get: entry,
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    request: (op, data) => request(op, data),
    open, close, booths, rps: rpsc, chess3d: c3, setClassic: toggleClassic,
    state: () => ({ tables: Object.fromEntries([...tables].map(([k, v]) => [k, { kind: v.snap.kind, ply: v.snap.ply, seats: v.snap.seats, ai: v.snap.ai, over: v.snap.over }])), views: [...views.keys()], carnival: !!carn, session: booths.active ? { ...booths.active } : null }),
    host: H,
    site: worldOfSite,
    boothPos: boothWorld,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const o of offs) { try { o?.(); } catch { /* ignore */ } }
      window.removeEventListener('mousedown', onMouseDown, true);
      if (boundNet?.msgHandlers?.get('ar') === onMsg) boundNet.msgHandlers.delete('ar');
      close(); c3.dispose(); booths.cancel(true); rpsc.dispose();
      for (const id of [...views.keys()]) dropView(id);
      dropCarnival();
      dock?.remove();
      document.getElementById('tfg-arcade-hud-css')?.remove();
      subs.clear();
    },
  };
  return api;
}
