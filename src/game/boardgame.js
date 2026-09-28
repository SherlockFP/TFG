// THE ADMINISTRATOR + THE BOARD (module `boardgame`, install: this.useModule('boardgame', installBoardGame)). See docs/wave2/boardgame.md.
//   installBoardGame(game) -> game.boardgame = { spawnAdmin, gaze, state, force, tableView, abort, dispose }
// THE ADMINISTRATOR is a module-managed, non-hostile world entity (NOT a registered creature): the host decides when it appears (~4 % per landing,
// once per day, never before quota 1), stands it far away, walks it closer only while nobody is looking, and tells everybody its position ('bg' / adm).
// Every peer renders it. Looking at its head (crosshair, <= 20 m) for 2 s (vignette closes, heartbeat) asks the host to start a session for the gazer
// and every living player within 10 m. The Administrator never attacks.
// THE BOARD is a pocket place built far from the map (realm at y = -332, indoor zone) with a 24-tile ring; the host runs the pure rules of
// game/board_rules.js (seeded + logged die), broadcasts EVENTS, and every peer plays them (die roll, hops, popups, log). Players stay where their
// avatar stands (frozen with stunT, free look); the loot they collect is banked in the session and paid out only on success.
// Net: 'bg' (host -> participants / everybody for the Administrator, HOST_ONLY: adm | whisper | start | turn | ev | end), request action 'bgreq'
// (client -> host: gaze | roll | duel | leave). All timers run on game.time so tests can fast-forward with kefal.tick.
import * as THREE from 'three';
import { HOST_ONLY } from '../net/session.js';
import { addTranslations, t, tf, L } from '../core/i18n.js';
import { escapeHtml } from '../core/util.js';
import { RNG } from '../core/rng.js';
import { ITEMS } from './items.js';
import { G } from '../physics/physics.js';
import * as R from './board_rules.js';
import { createAdministrator, ADMIN } from '../models/administrator.js';
import { createBoard } from '../models/board.js';

HOST_ONLY.add('bg');

const REALM = { x: 6400, y: -332, z: 6400 };   // y < FACILITY_Y + 40: the game treats it as "indoor" (black fog, no sun); above the -380 void kill plane
const INTRO_S = 7.5;
const COLORS = ['#ff7a7a', '#6ac8ff', '#ffd86a', '#8aff8a'];

// ------------------------------------------------------------------------------------------------ text
const CARD_TR = {
  Tailwind: ['Arka Rüzgar', 'İki kare ileri git.'], Rewind: ['Geri Sar', 'Üç kare geri git.'], Paperwork: ['Evrak İşi', 'Sonraki turunu kaybet.'],
  'Loaded Dice': ['Hileli Zar', 'Tekrar zar at.'], Reassignment: ['Yeniden Atama', 'Sana en uzaktaki takım arkadaşınla yer değiştir.'],
  'Sticky Fingers': ['Yapışkan Parmaklar', 'Bir takım arkadaşından ganimet çal.'], 'The Toll': ['Geçiş Ücreti', 'Öde: bir ganimet ya da sağlığının %12\'si.'],
  'Team Spirit': ['Takım Ruhu', 'En geride olan 3 kare ilerler.'], 'Petty Cash': ['Bozuk Para', 'Biraz kredi bul.'], 'First Aid': ['İlk Yardım', 'Sağlığının %15\'ini geri kazan.'],
};
const CARD_RU = {
  Tailwind: ['Попутный ветер', 'Пройди 2 клетки вперёд.'], Rewind: ['Перемотка', 'Вернись на 3 клетки.'], Paperwork: ['Бумажная волокита', 'Пропусти следующий ход.'],
  'Loaded Dice': ['Подтасованные кости', 'Бросай ещё раз.'], Reassignment: ['Перевод', 'Поменяйся местами с самым далёким товарищем.'],
  'Sticky Fingers': ['Липкие пальцы', 'Укради добычу у товарища.'], 'The Toll': ['Пошлина', 'Заплати: часть добычи или 12% здоровья.'],
  'Team Spirit': ['Командный дух', 'Отстающий идёт на 3 клетки вперёд.'], 'Petty Cash': ['Мелкие деньги', 'Найди немного кредитов.'], 'First Aid': ['Первая помощь', 'Восстанови 15% здоровья.'],
};
const TR = {
  'THE BOARD': 'TAHTA', 'THE ADMINISTRATOR': 'YÖNETİCİ', 'TURN {n} / {max}': 'TUR {n} / {max}', 'ROUND {n}': 'TUR {n}',
  'YOUR TURN — ROLL [SPACE]': 'SIRA SENDE — ZAR AT [SPACE]', "{name}'s turn": 'Sıra {name} oyuncusunda', 'Rolling...': 'Zar atılıyor...',
  '[T] table view': '[T] masa görünümü', 'Loot: {c} credits, {n} items': 'Ganimet: {c} kredi, {n} eşya',
  '{name} rolls a {n}.': '{name} {n} attı.', '{name} finds {n} credits.': '{name} {n} kredi buldu.', '{name} finds: {item}.': '{name} buldu: {item}.',
  'TRAP! {name} loses {p}% health.': 'TUZAK! {name} sağlığının %{p} kadarını kaybetti.', '{name} draws "{card}": {text}': '{name} "{card}" kartını çekti: {text}',
  '{name} swaps places with {other}.': '{name}, {other} ile yer değiştirdi.', '{name} takes a shortcut to tile {i}!': '{name} kısayoldan {i}. kareye çıktı!',
  '{name} steals {what} from {other}.': '{name}, {other} oyuncusundan {what} çaldı.', '{name} pays the toll: {what}.': '{name} geçiş ücretini ödedi: {what}.',
  '{name} loses a turn.': '{name} bir tur kaybetti.', '{name} rests and recovers {p}% health.': '{name} dinlendi, sağlığının %{p} kadarı yenilendi.',
  '{name} reached the EXIT!': '{name} ÇIKIŞA ulaştı!', 'DUEL vs THE BOARD': 'TAHTAYA KARŞI DÜELLO', '{name} is dueling THE BOARD': '{name} TAHTAYLA düello yapıyor',
  'Stop the marker in the green zone. [SPACE]': 'İşaretçiyi yeşil bölgede durdur. [SPACE]', 'Wait for the signal, then hit [SPACE].': 'Sinyali bekle, sonra [SPACE].',
  'WAIT...': 'BEKLE...', 'NOW!': 'ŞİMDİ!', 'TOO EARLY!': 'ÇOK ERKEN!', '{name} wins the duel! ({s} vs {b})': '{name} düelloyu kazandı! ({s} - {b})',
  '{name} loses the duel. ({s} vs {b})': '{name} düelloyu kaybetti. ({s} - {b})', 'The duel is a draw. ({s} vs {b})': 'Düello berabere. ({s} - {b})',
  'YOU MAY LEAVE': 'GİDEBİLİRSİN', 'TERMS ENFORCED': 'ŞARTLAR UYGULANDI', 'The Administrator took your {item}.': 'Yönetici şunu aldı: {item}.',
  'Your health was cut to {p}%.': 'Sağlığın %{p} seviyesine düşürüldü.', 'Reward card: {what}': 'Ödül kartı: {what}', 'The ship left without the terms being met.': 'Şartlar yerine gelmeden gemi kalktı.',
  'ROLL AGAIN': 'TEKRAR AT', 'LOSE A TURN': 'BİR TUR KAYIP', 'EXIT!': 'ÇIKIŞ!', 'TRAP': 'TUZAK', 'CARD': 'KART', 'credits': 'kredi', 'nothing': 'hiçbir şey', 'loot': 'ganimet',
  '{n} credits': '{n} kredi', '{n}% health': 'sağlığın %{n}\'i', '{n}x {item}': '{n}x {item}', 'Everybody at the exit. Twelve turns.': 'Herkes çıkışta. On iki tur.',
};
const RU = {
  'THE BOARD': 'ДОСКА', 'THE ADMINISTRATOR': 'АДМИНИСТРАТОР', 'TURN {n} / {max}': 'ХОД {n} / {max}', 'ROUND {n}': 'РАУНД {n}',
  'YOUR TURN — ROLL [SPACE]': 'ТВОЙ ХОД — БРОСЬ [SPACE]', "{name}'s turn": 'Ходит {name}', 'Rolling...': 'Бросок...',
  '[T] table view': '[T] вид на стол', 'Loot: {c} credits, {n} items': 'Добыча: {c} кредитов, предметов: {n}',
  '{name} rolls a {n}.': '{name} выбрасывает {n}.', '{name} finds {n} credits.': '{name} находит {n} кредитов.', '{name} finds: {item}.': '{name} находит: {item}.',
  'TRAP! {name} loses {p}% health.': 'ЛОВУШКА! {name} теряет {p}% здоровья.', '{name} draws "{card}": {text}': '{name} тянет «{card}»: {text}',
  '{name} swaps places with {other}.': '{name} меняется местами с {other}.', '{name} takes a shortcut to tile {i}!': '{name} идёт короткой дорогой на клетку {i}!',
  '{name} steals {what} from {other}.': '{name} крадёт {what} у {other}.', '{name} pays the toll: {what}.': '{name} платит пошлину: {what}.',
  '{name} loses a turn.': '{name} пропускает ход.', '{name} rests and recovers {p}% health.': '{name} отдыхает и восстанавливает {p}% здоровья.',
  '{name} reached the EXIT!': '{name} дошёл до ВЫХОДА!', 'DUEL vs THE BOARD': 'ДУЭЛЬ С ДОСКОЙ', '{name} is dueling THE BOARD': '{name} дерётся с ДОСКОЙ',
  'Stop the marker in the green zone. [SPACE]': 'Останови маркер в зелёной зоне. [SPACE]', 'Wait for the signal, then hit [SPACE].': 'Дождись сигнала и жми [SPACE].',
  'WAIT...': 'ЖДИ...', 'NOW!': 'СЕЙЧАС!', 'TOO EARLY!': 'РАНО!', '{name} wins the duel! ({s} vs {b})': '{name} выигрывает дуэль! ({s} против {b})',
  '{name} loses the duel. ({s} vs {b})': '{name} проигрывает дуэль. ({s} против {b})', 'The duel is a draw. ({s} vs {b})': 'Дуэль вничью. ({s} против {b})',
  'YOU MAY LEAVE': 'ВЫ МОЖЕТЕ УЙТИ', 'TERMS ENFORCED': 'УСЛОВИЯ ВЫПОЛНЕНЫ', 'The Administrator took your {item}.': 'Администратор забрал: {item}.',
  'Your health was cut to {p}%.': 'Ваше здоровье снижено до {p}%.', 'Reward card: {what}': 'Карта награды: {what}', 'The ship left without the terms being met.': 'Корабль улетел, а условия не выполнены.',
  'ROLL AGAIN': 'БРОСЬ ЕЩЁ', 'LOSE A TURN': 'ПРОПУСК ХОДА', 'EXIT!': 'ВЫХОД!', 'TRAP': 'ЛОВУШКА', 'CARD': 'КАРТА', 'credits': 'кредитов', 'nothing': 'ничего', 'loot': 'добыча',
  '{n} credits': '{n} кредитов', '{n}% health': '{n}% здоровья', '{n}x {item}': '{n}x {item}', 'Everybody at the exit. Twelve turns.': 'Все у выхода. Двенадцать ходов.',
};
for (const [en, [n, tx]] of Object.entries(CARD_TR)) { TR[en] = n; TR[R.CARDS.find((c) => c.name === en).text] = tx; }
for (const [en, [n, tx]] of Object.entries(CARD_RU)) { RU[en] = n; RU[R.CARDS.find((c) => c.name === en).text] = tx; }

const LINES = {
  intro: [
    { en: 'Welcome. You have been selected for a short exercise.', tr: 'Hoş geldiniz. Kısa bir alıştırma için seçildiniz.', ru: 'Добро пожаловать. Вас выбрали для короткого упражнения.' },
    { en: 'Everybody reaches the exit within twelve turns. The dice do the rest.', tr: 'Herkes on iki tur içinde çıkışa ulaşır. Gerisini zarlar halleder.', ru: 'Все доходят до выхода за двенадцать ходов. Остальное решают кости.' },
  ],
  whisper: [
    { en: 'time... to choose', tr: 'zaman... seçmek için', ru: 'время... выбирать' },
    { en: 'you have been looked at', tr: 'size bakıldı', ru: 'на вас посмотрели' },
    { en: 'the table is set', tr: 'masa hazır', ru: 'стол накрыт' },
    { en: 'one moment of your attention', tr: 'bir anlık dikkatiniz', ru: 'одно мгновение вашего внимания' },
  ],
  turn: [{ en: 'Your move.', tr: 'Sıra sizde.', ru: 'Ваш ход.' }, { en: 'Whenever you are ready.', tr: 'Hazır olduğunuzda.', ru: 'Когда будете готовы.' }],
  trap: [{ en: 'Regrettable.', tr: 'Talihsiz.', ru: 'Досадно.' }, { en: 'The floor was marked. You did not read it.', tr: 'Zemin işaretliydi. Okumadınız.', ru: 'Пол был размечен. Вы не прочли.' }],
  loot: [{ en: 'Enjoy it. While it lasts.', tr: 'Tadını çıkarın. Sürdüğü müddetçe.', ru: 'Наслаждайтесь. Пока это длится.' }],
  card: [{ en: 'A card. How exciting.', tr: 'Bir kart. Ne heyecanlı.', ru: 'Карта. Как увлекательно.' }],
  duel: [{ en: 'A disagreement. Settle it.', tr: 'Bir anlaşmazlık. Çözün.', ru: 'Разногласие. Уладьте его.' }],
  win: [{ en: 'Adequate.', tr: 'Yeterli.', ru: 'Достаточно.' }], lose: [{ en: 'Unfortunate.', tr: 'Ne yazık.', ru: 'Прискорбно.' }],
  finish: [{ en: 'Noted.', tr: 'Not edildi.', ru: 'Принято к сведению.' }],
  late: [{ en: 'Time is a resource. You are running low.', tr: 'Zaman bir kaynaktır. Azalıyor.', ru: 'Время — ресурс. Он на исходе.' }],
  ok: [{ en: 'Terms fulfilled. You may go.', tr: 'Şartlar yerine getirildi. Gidebilirsiniz.', ru: 'Условия выполнены. Можете идти.' }],
  bad: [{ en: 'Terms enforced.', tr: 'Şartlar uygulandı.', ru: 'Условия применены.' }],
  ship: [{ en: 'Your ship has left. The terms did not.', tr: 'Geminiz gitti. Şartlar gitmedi.', ru: 'Ваш корабль улетел. Условия — нет.' }],
};

const CSS = `
#bg-hud{position:fixed;inset:0;z-index:23;pointer-events:none;font-family:var(--font1,monospace);color:#e8ecff;text-shadow:2px 2px 0 #000}
#bg-hud .bg-top{position:absolute;left:50%;top:3.5%;transform:translateX(-50%);text-align:center;white-space:nowrap}
#bg-hud .bg-turn{font-size:22px;letter-spacing:4px;color:#aeb6d8}
#bg-hud .bg-prompt{font-size:38px;letter-spacing:3px;margin-top:4px}
#bg-hud .bg-prompt.me{color:#ffe27a;animation:bgPulse .9s ease-in-out infinite}
@keyframes bgPulse{50%{transform:scale(1.06);opacity:.8}}
#bg-hud .bg-log{position:absolute;left:18px;top:22%;width:380px;font-size:16px;line-height:1.35}
#bg-hud .bg-log div{padding:1px 6px;background:rgba(6,6,12,.55);margin-top:2px;border-left:3px solid #7f8ab0}
#bg-hud .bg-bank{position:absolute;left:18px;top:17%;font-size:17px;color:#ffd86a}
#bg-hud .bg-track{position:absolute;left:50%;bottom:4%;transform:translateX(-50%);display:flex;gap:2px}
#bg-hud .bg-track i{position:relative;width:22px;height:22px;display:block;opacity:.85;font-style:normal;font-size:10px;text-align:center;line-height:22px;color:#000}
#bg-hud .bg-track b{position:absolute;left:5px;top:-10px;width:12px;height:12px;border-radius:50%;border:2px solid #000}
#bg-hud .bg-pop{position:absolute;left:50%;top:38%;transform:translate(-50%,-50%);text-align:center;font-size:54px;letter-spacing:4px;opacity:0}
#bg-hud .bg-pop.on{animation:bgPop 1.8s ease-out both}
@keyframes bgPop{0%{opacity:0;transform:translate(-50%,-50%) scale(1.8)}12%{opacity:1;transform:translate(-50%,-50%) scale(1)}80%{opacity:1}100%{opacity:0;transform:translate(-50%,-58%)}}
#bg-hud .bg-pop small{display:block;font-size:20px;letter-spacing:1px;margin-top:6px;color:#cfd6ff;max-width:560px;margin-left:auto;margin-right:auto}
#bg-hud .bg-sub{position:absolute;left:50%;bottom:13%;transform:translateX(-50%);width:min(760px,90vw);text-align:center;opacity:0;transition:opacity .4s}
#bg-hud .bg-sub.on{opacity:1}
#bg-hud .bg-sub b{display:block;font-size:13px;letter-spacing:3px;color:#8f98bd;margin-bottom:2px}
#bg-hud .bg-sub span{font-size:24px;color:#f2f3f8;font-style:italic}
#bg-hud .bg-duel{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(560px,90vw);background:rgba(8,8,16,.88);border:2px solid #b8a05a;padding:14px 20px;text-align:center;display:none}
#bg-hud .bg-duel.on{display:block}
#bg-hud .bg-duel h3{margin:0 0 6px;font-size:26px;letter-spacing:3px;color:#ffd27a}
#bg-hud .bg-duel p{margin:0 0 10px;font-size:16px;color:#cfd6ff}
#bg-hud .bg-bar{position:relative;height:34px;background:#1a1a26;border:2px solid #555b7a;overflow:hidden}
#bg-hud .bg-bar .z{position:absolute;top:0;bottom:0;background:rgba(80,220,120,.55)}
#bg-hud .bg-bar .m{position:absolute;top:-2px;bottom:-2px;width:6px;background:#fff;margin-left:-3px}
#bg-hud .bg-sig{height:96px;line-height:96px;font-size:46px;background:#3a1010;color:#fff;letter-spacing:6px}
#bg-hud .bg-sig.go{background:#0f5a26}
#bg-hud .bg-end{position:absolute;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;background:rgba(0,0,0,.5);text-align:center}
#bg-hud .bg-end.on{display:flex}
#bg-hud .bg-end h1{font-size:72px;letter-spacing:8px;margin:0}
#bg-hud .bg-end p{font-size:24px;margin:8px 0 0;color:#dfe4ff}
#bg-hud .bg-hint{position:absolute;right:16px;bottom:16px;font-size:14px;color:#8f98bd}
#bg-gaze{position:fixed;inset:0;z-index:22;pointer-events:none;opacity:0}
`;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function installBoardGame(game) {
  addTranslations(TR, 'tr'); addTranslations(RU, 'ru');
  const mm = game.mods;
  const offs = [];
  const timers = [];
  let disposed = false;
  const later = (sec, fn) => { const o = { at: game.time + sec, fn }; timers.push(o); return o; };
  const cancel = (o) => { const i = timers.indexOf(o); if (i >= 0) timers.splice(i, 1); };
  const isHost = () => !!game.isHost;
  const self = () => game.selfId;
  const name = (id) => game.playerName?.(id) || 'Player';
  const itemName = (id) => { const d = ITEMS[id]; return d ? t(d.name) : String(id); };
  const sfx = (n, v = 0.6, p) => { try { game.sfx?.(n, v, p); } catch { /* ignore */ } };
  const tmpV = new THREE.Vector3(), tmpH = new THREE.Vector3();

  // ============================================================================================== host state
  const H = { sess: null, sid: 0, parts: new Map(), chain: null, extra: false, forceRolls: null, forceCards: null };
  const A = { on: false, pos: new THREE.Vector3(), yaw: 0, life: 0, unobs: 0, idle: 0, whisperT: 0, sendT: 0, last: null, keyT: 0, armed: false, spawnAt: 0, tries: 0, lastDay: -1, minD: 24, force: false, indoor: false };

  const bcastParts = (k, d = {}) => { for (const pid of H.parts.keys()) game.net?.sendTo(pid, 'bg', { k, sid: H.sid, ...d }); };
  function sched(sec, fn) {
    if (H.chain) cancel(H.chain);
    H.chain = later(sec, () => { H.chain = null; try { fn(); } catch (e) { console.warn('[boardgame] host', e); } });
  }
  const seenBy = (p, head, cosMin) => {
    const dx = head.x - p.eye.x, dy = head.y - p.eye.y, dz = head.z - p.eye.z, d = Math.hypot(dx, dy, dz) || 1;
    return (dx * p.look.x + dy * p.look.y + dz * p.look.z) / d > cosMin;
  };

  // ---------------------------------------------------------------------------- host: Administrator director
  function armAdmin() {
    const run = game.run || {};
    A.armed = false; A.tries = 0;
    if (R.shouldAppear({ quotaIndex: run.quotaIndex | 0, day: run.day | 0, lastDay: A.lastDay, roll: Math.random(), force: A.force })) {
      A.armed = true; A.lastDay = run.day | 0; A.spawnAt = game.time + (A.force ? 2 : 40 + Math.random() * 110); A.force = false;
    }
  }
  function pickSpot(near = false) {
    const ps = game.aiPlayers().filter((p) => !p.dead && !p.inShip);
    if (!ps.length) return null;
    const p = ps[Math.floor(Math.random() * ps.length)];
    const terr = game.world?.terrain, nav = game.world?.facility?.nav;
    const indoor = p.zone === 'in';
    for (let k = 0; k < 40; k++) {
      const a = Math.random() * Math.PI * 2;
      let x, y, z, d;
      if (!indoor) {
        d = near ? 11 + Math.random() * 4 : 38 + Math.random() * 32;
        x = p.pos.x + Math.cos(a) * d; z = p.pos.z + Math.sin(a) * d;
        const lim = (terr?.playHalf || 120) - 6;
        if (Math.abs(x) > lim || Math.abs(z) > lim) continue;
        y = terr ? terr.heightAt(x, z) : p.pos.y;
      } else {
        d = near ? 8 + Math.random() * 3 : 13 + Math.random() * 14;
        x = p.pos.x + Math.cos(a) * d; z = p.pos.z + Math.sin(a) * d; y = p.pos.y;
        if (nav && !nav.walkableAt(x, z)) continue;
        if (game.physics.raycast({ x, y: y + 0.4, z }, { x: 0, y: 1, z: 0 }, 3.7, G.STATIC | G.DOOR)) continue;   // too low a ceiling for a 3.4 m figure
      }
      const head = tmpH.set(x, y + ADMIN.HEAD_Y, z);
      if (!game.physics.lineOfSight(p.eye, head)) continue;
      if (!near && ps.some((q) => seenBy(q, head, 0.3))) continue;   // never pop into somebody's view
      return { x, y, z, indoor, target: p };
    }
    return null;
  }
  function trySpawnAdmin(near = false) {
    if (A.on || H.sess || !isHost()) return false;
    const s = pickSpot(near);
    if (!s) return false;
    A.on = true; A.pos.set(s.x, s.y, s.z); A.indoor = s.indoor; A.minD = s.indoor ? 11 : 22;
    A.yaw = Math.atan2(s.target.pos.x - s.x, s.target.pos.z - s.z);
    A.life = 240; A.unobs = 0; A.idle = 0; A.whisperT = 12 + Math.random() * 25; A.sendT = 0; A.last = null;
    sendAdm(true);
    return true;
  }
  function admState() { return { k: 'adm', on: A.on ? 1 : 0, p: [+A.pos.x.toFixed(2), +A.pos.y.toFixed(2), +A.pos.z.toFixed(2)], yaw: +A.yaw.toFixed(3) }; }
  function sendAdm(force) {
    const s = admState();
    const l = A.last;
    if (!force && l && Math.abs(l.p[0] - s.p[0]) < 0.03 && Math.abs(l.p[2] - s.p[2]) < 0.03 && Math.abs(l.yaw - s.yaw) < 0.03 && l.on === s.on && game.time - A.keyT < 2) return;
    A.last = s; A.keyT = game.time;
    game.net?.broadcast('bg', s);
  }
  function admDespawn() {
    const was = A.on;
    A.on = false; A.armed = false;
    if (was) { A.last = null; game.net?.broadcast('bg', { k: 'adm', on: 0, p: [0, 0, 0], yaw: 0 }); }
  }
  function admTick(dt) {
    const ps = game.aiPlayers().filter((p) => !p.dead);
    const live = ps.filter((p) => !p.inShip);
    A.life -= dt;
    const head = tmpH.set(A.pos.x, A.pos.y + ADMIN.HEAD_Y, A.pos.z);
    let nearest = null, nd = 1e9, observed = false;
    for (const p of ps) { const d = Math.hypot(p.pos.x - A.pos.x, p.pos.z - A.pos.z); if (d < nd) { nd = d; nearest = p; } }
    for (const p of live) { if (seenBy(p, head, 0.55) && p.eye.distanceTo(head) < 95 && game.physics.lineOfSight(p.eye, head)) { observed = true; break; } }
    if (!live.length) { A.idle += dt; if (A.idle > 25) { admDespawn(); return; } } else A.idle = 0;
    if (nearest) A.yaw = Math.atan2(nearest.pos.x - A.pos.x, nearest.pos.z - A.pos.z);
    if (!observed) {
      A.unobs += dt;
      if (A.life <= 0) { admDespawn(); return; }
      if (A.unobs > 1.5 && nearest && nd > A.minD) {           // never runs: a slow walk, only while nobody is looking
        const dx = nearest.pos.x - A.pos.x, dz = nearest.pos.z - A.pos.z, l = Math.hypot(dx, dz) || 1;
        const nx = A.pos.x + (dx / l) * 1.1 * dt, nz = A.pos.z + (dz / l) * 1.1 * dt;
        const ny = !A.indoor && game.world?.terrain ? game.world.terrain.heightAt(nx, nz) : A.pos.y;
        if (!A.indoor || game.physics.lineOfSight({ x: A.pos.x, y: A.pos.y + 1, z: A.pos.z }, { x: nx, y: ny + 1, z: nz })) A.pos.set(nx, ny, nz);
      }
    } else A.unobs = 0;
    A.whisperT -= dt;
    if (A.whisperT <= 0) { A.whisperT = 35 + Math.random() * 55; if (nd < 75) game.net?.broadcast('bg', { k: 'whisper', n: Math.floor(Math.random() * LINES.whisper.length) }); }
    A.sendT -= dt;
    if (A.sendT <= 0) { A.sendT = 0.25; sendAdm(false); }
  }
  function hostGaze(from, trust = false) {
    if (H.sess || !A.on || game.run?.phase !== 'moon') return false;
    const pl = game.aiPlayerById?.(from);
    if (!pl || pl.dead) return false;
    const head = tmpH.set(A.pos.x, A.pos.y + ADMIN.HEAD_Y, A.pos.z);
    if (!trust) {
      const d = pl.eye.distanceTo(head);
      if (d > R.RULES.GAZE_RANGE + 4 || !seenBy(pl, head, 0.85)) return false;
    }
    return hostStart(pl);
  }

  // ---------------------------------------------------------------------------- host: session control
  function hostStart(gazer) {
    if (H.sess || !isHost()) return false;
    const all = game.aiPlayers();
    const ids = R.groupWithin(gazer.pos, all.map((p) => ({ id: p.id, pos: p.pos, dead: p.dead })), R.RULES.GROUP_RANGE);
    if (!ids.includes(gazer.id)) ids.unshift(gazer.id);
    ids.sort((a, b) => (a === gazer.id ? -1 : b === gazer.id ? 1 : a < b ? -1 : 1));
    const seed = (Math.random() * 4294967296) >>> 0;
    H.sid++;
    const s = R.createSession({ seed, players: ids, quota: game.run?.quotaIndex | 0, itemPool: R.LOOT_ITEMS.filter((id) => ITEMS[id]) });
    if (H.forceRolls) s.rng.force('die', H.forceRolls);
    if (H.forceCards) s.forcedCards.push(...H.forceCards);
    H.forceRolls = null; H.forceCards = null;
    H.sess = s; H.parts = new Map(); H.extra = false;
    const ret = {};
    for (const id of ids) {
      const pl = all.find((p) => p.id === id);
      const r = pl ? [+pl.pos.x.toFixed(2), +(pl.pos.y + 0.05).toFixed(2), +pl.pos.z.toFixed(2), +Math.atan2(-pl.look.x, -pl.look.z).toFixed(3)] : null;
      H.parts.set(id, { ret: r }); ret[id] = r;
    }
    admDespawn();
    bcastParts('start', { seed, order: ids, turns: s.turns, ret });
    sched(INTRO_S, () => nextTurn());
    return true;
  }
  function promptTurn() {
    const s = H.sess; if (!s) return;
    bcastParts('turn', { pid: s.cur, round: s.round, extra: H.extra ? 1 : 0 });
    H.extra = false;
    sched(R.RULES.TURN_TIMEOUT_MS / 1000, () => hostRoll(s.cur));   // AFK: the host rolls for a player who never does
  }
  function hostRoll(pid) {
    const s = H.sess; if (!s || s.phase !== 'roll' || s.cur !== pid) return;
    const n = R.rollDie(s);
    const res = R.applyRoll(s, pid, n);
    if (!res) return;
    res.events[0].seed = (s.seed ^ Math.imul(s.rolls, 0x9e3779b1)) >>> 0;
    afterAction(res);
  }
  function hostDuel(pid, score) {
    const s = H.sess; if (!s || s.phase !== 'duel' || s.duel?.pid !== pid) return;
    const res = R.applyDuel(s, pid, Number.isFinite(score) ? score : null);
    if (res) afterAction(res);
  }
  function afterAction(res) {
    const s = H.sess;
    bcastParts('ev', { evs: res.events, ms: res.ms });
    sched(res.ms / 1000 + 0.3, () => {
      if (s.phase === 'duel') { sched(R.RULES.DUEL_TIMEOUT_MS / 1000, () => hostDuel(s.duel?.pid, null)); return; }
      if (s.phase === 'roll') { H.extra = true; promptTurn(); return; }
      if (s.phase === 'over') { hostFinish(); return; }
      nextTurn();
    });
  }
  function nextTurn() {
    const s = H.sess; if (!s) return;
    const evs = R.advance(s);
    const ms = R.eventsMs(evs);
    if (evs.length) bcastParts('ev', { evs, ms });
    sched(ms / 1000 + (evs.length ? 0.3 : 0.05), () => { if (s.phase === 'over') hostFinish(); else promptTurn(); });
  }
  const heldItems = (pid) => game.items.all().filter((it) => it.holder === pid);
  function spawnAt(type, at, opts = {}) {
    try {
      if (!ITEMS[type]) return false;
      game.items.hostSpawn(type, new THREE.Vector3(at[0] + (Math.random() - 0.5) * 1.2, at[1] + 0.8, at[2] + (Math.random() - 0.5) * 1.2), opts);
      return true;
    } catch (e) { console.warn('[boardgame] spawn', e); return false; }
  }
  function hostFinish() {
    const s = H.sess; if (!s) return;
    if (H.chain) { cancel(H.chain); H.chain = null; }
    const out = R.settleOutcome(s);
    const ship = out.why === 'ship';
    const shipAt = (() => { const sp = game.ship?.spawns?.[0]; return sp ? [sp.x, sp.y, sp.z] : [0, 1, 0]; })();
    let credits = 0;
    const msgs = {};
    for (const [pid, o] of Object.entries(out.players)) {
      const part = H.parts.get(pid);
      const at = ship || !part?.ret ? shipAt : part.ret;
      const m = { status: out.status, why: out.why, failed: o.failed, ship, ret: ship ? null : part?.ret || null, took: null, reward: null, loot: o.loot };
      if (o.failed) {
        const pick = R.pickPenaltyItem(heldItems(pid));
        if (pick) { game.net.broadcast('it', { e: 'rm', id: pick.item.id }); m.took = { type: pick.item.type, worth: pick.worth }; }
      } else {
        credits += o.loot.credits;
        for (const id of o.loot.items) spawnAt(id, at);
        if (o.reward) {
          const r = o.reward;
          if (r.kind === 'item' && spawnAt(r.id, at, { tier: r.tier })) m.reward = { kind: 'item', id: r.id, n: 1 };
          else if (r.kind === 'shards') {
            let n = 0; for (let i = 0; i < r.n; i++) if (spawnAt(r.id, at)) n++;
            if (n) m.reward = { kind: 'item', id: r.id, n }; else { credits += 60 * r.n; m.reward = { kind: 'credits', n: 60 * r.n }; }
          } else { credits += 100; m.reward = { kind: 'credits', n: 100 }; }
        }
      }
      msgs[pid] = m;
    }
    if (credits > 0 && game.run) { game.run.credits += credits; game.broadcastRun?.(['credits']); }
    for (const pid of Object.keys(msgs)) game.net.sendTo(pid, 'bg', { k: 'end', sid: H.sid, ...msgs[pid] });
    H.last = { status: out.status, why: out.why, rounds: out.rounds, seed: s.seed, players: out.players, log: s.rng.log.length };
    H.sess = null; H.parts = new Map();
  }
  function hostAbort(why) { const s = H.sess; if (!s) return; R.forceEnd(s, 'fail', why); hostFinish(); }
  function hostLeft(id) {
    const s = H.sess;
    if (!s || !H.parts.has(id)) return;
    H.parts.delete(id); R.removePlayer(s, id);
    if (!H.parts.size) { if (H.chain) { cancel(H.chain); H.chain = null; } H.sess = null; return; }
    if (s.cur === id && s.phase !== 'over') nextTurn();
  }
  function hostReq(d, from) {
    if (!isHost() || !d) return;
    switch (d.op) {
      case 'gaze': hostGaze(from); break;
      case 'roll': if (H.sess && d.sid === H.sid) hostRoll(from); break;
      case 'duel': if (H.sess && d.sid === H.sid) hostDuel(from, Number(d.score)); break;
      case 'leave': if (H.sess && d.sid === H.sid) hostLeft(from); break;
      default: break;
    }
  }
  function hostUpdate(dt) {
    if (H.sess || game.run?.phase !== 'moon') return;
    if (A.armed && !A.on && game.time >= A.spawnAt) {
      A.spawnAt = game.time + 8;
      if (trySpawnAdmin(false)) A.armed = false; else if (++A.tries > 12) A.armed = false;
    }
    if (A.on) admTick(dt);
  }

  // ============================================================================================== client: Administrator view
  const V = { model: null, on: false, pos: new THREE.Vector3(), tp: new THREE.Vector3(), yaw: 0, tyaw: 0, gaze: 0, sent: false, sentT: 0, hbT: 0, noiseT: 0, noiseOn: false, vig: null };
  function onAdm(d) {
    if (!d.on) { if (V.model) { V.model.dispose(); V.model = null; } V.on = false; V.gaze = 0; return; }
    V.on = true; V.tp.set(d.p[0], d.p[1], d.p[2]); V.tyaw = d.yaw;
    if (!V.model) { V.model = createAdministrator({ seed: 5 }); V.pos.copy(V.tp); V.yaw = d.yaw; game.scene.add(V.model.root); V.model.root.position.copy(V.pos); }
    else if (V.pos.distanceTo(V.tp) > 6) V.pos.copy(V.tp);
  }
  function ensureVignette() {
    if (V.vig || typeof document === 'undefined') return;
    ensureCss();
    V.vig = document.createElement('div'); V.vig.id = 'bg-gaze'; document.body.appendChild(V.vig);
  }
  function viewUpdate(dt) {
    const p = game.player, fx = game.engine?.fx;
    let prog = 0, dist = 99;
    if (V.model) {
      V.pos.lerp(V.tp, 1 - Math.exp(-dt * 3.5));
      let dy = Math.atan2(Math.sin(V.tyaw - V.yaw), Math.cos(V.tyaw - V.yaw)); V.yaw += dy * Math.min(1, dt * 2.5);
      V.model.root.position.copy(V.pos); V.model.root.rotation.y = V.yaw;
      const head = tmpH.set(V.pos.x, V.pos.y + ADMIN.HEAD_Y, V.pos.z);
      const eye = p.eyePos(), look = p.forward();
      const can = !C.active && !p.dead && game.run?.phase === 'moon' && !game.ui?.blocksInput?.();
      const g = R.gazeHit({ eye, look, head });
      dist = g.dist;
      const looking = can && g.hit && game.physics.lineOfSight(eye, head);
      V.gaze = looking ? V.gaze + dt : Math.max(0, V.gaze - dt * 1.5);
      prog = clamp(V.gaze / R.RULES.GAZE_SEC, 0, 1);
      V.model.update(dt, game.time, { lookAt: game.camera.position, agit: 0.15 + prog * 0.85, near: dist < 90 });
      if (V.gaze >= R.RULES.GAZE_SEC && !V.sent) { V.sent = true; V.sentT = 6; game.net?.request('bgreq', { op: 'gaze' }); }
      // proximity static: subtle while it is in front of you
      const facing = (tmpV.copy(head).sub(eye).normalize().dot(look)) > 0.5;
      const noise = (dist < 45 && facing ? 0.04 + 0.1 * (1 - dist / 45) : 0) + (V.noiseT > 0 ? 0.3 : 0);
      if (fx && noise > 0) { fx.noise = Math.max(fx.noise || 0, noise); V.noiseOn = true; } else if (V.noiseOn && fx) { fx.noise = 0; V.noiseOn = false; }
    } else if (V.noiseOn && fx) { fx.noise = 0; V.noiseOn = false; }
    V.noiseT = Math.max(0, V.noiseT - dt);
    if (V.sent) { V.sentT -= dt; if (V.sentT <= 0) { V.sent = false; V.gaze = 0; } }
    // the 2 s warning: vignette closing + heartbeat (looking away cancels: prog decays)
    if (prog > 0.02) {
      ensureVignette();
      if (fx) fx.blind = Math.max(fx.blind || 0, 0.7 * prog * prog);
      V.hbT -= dt;
      if (V.hbT <= 0) { V.hbT = 0.85 - 0.5 * prog; sfx('heartbeat', 0.3 + 0.5 * prog, 0.9 + 0.2 * prog); game.engine?.beat?.(0.4 + 0.5 * prog); }
      if (V.vig) { V.vig.style.opacity = String(Math.min(1, prog * 1.4)); V.vig.style.background = `radial-gradient(circle at 50% 50%, rgba(0,0,0,0) ${Math.round(72 - prog * 58)}%, rgba(0,0,0,.96) ${Math.round(100 - prog * 46)}%)`; }
    } else if (V.vig && V.vig.style.opacity !== '0') V.vig.style.opacity = '0';
  }
  function onWhisper(d) {
    if (!V.on || !V.model || C.active) return;
    const dist = V.pos.distanceTo(game.camera.position);
    if (dist > 80) return;
    sub(L(LINES.whisper[(d.n | 0) % LINES.whisper.length]), 3.6, true);
    V.noiseT = 0.5; sfx('walkie_static', 0.25);
  }

  // ============================================================================================== client: session (the board)
  const C = {
    active: false, sid: 0, board: null, adm: null, order: [], tok: {}, bank: {}, round: 1, turns: R.RULES.TURNS, cur: null, phase: 'idle', myTurn: false,
    queue: [], ev: null, evT: 0, hop: null, ret: null, view: false, saved: null, emitters: [], cols: [], hud: null, log: [], duel: null, autoDuel: null,
    rolling: false, ended: false, speak: 0, subEnd: 0, popT: 0,
  };
  let cssOn = false;
  function ensureCss() {
    if (cssOn || typeof document === 'undefined') return;
    cssOn = true;
    const st = document.createElement('style'); st.id = 'bg-style'; st.textContent = CSS; document.head.appendChild(st);
  }
  const $ = (sel) => C.hud?.el.querySelector(sel);
  function hudEnsure() {
    if (C.hud || typeof document === 'undefined') return;
    ensureCss();
    const el = document.createElement('div'); el.id = 'bg-hud';
    el.innerHTML = '<div class="bg-top"><div class="bg-turn"></div><div class="bg-prompt"></div></div><div class="bg-bank"></div><div class="bg-log"></div><div class="bg-track"></div>'
      + '<div class="bg-pop"></div><div class="bg-sub"><b></b><span></span></div><div class="bg-duel"></div><div class="bg-end"></div><div class="bg-hint"></div>';
    document.body.appendChild(el);
    C.hud = { el };
  }
  function sub(text, sec = 4.5, faint = false) {
    hudEnsureAny();
    const el = document.querySelector('#bg-hud .bg-sub'); if (!el) return;
    el.querySelector('b').textContent = t('THE ADMINISTRATOR');
    const sp = el.querySelector('span'); sp.textContent = text; sp.style.opacity = faint ? '0.7' : '1';
    el.classList.add('on');
    const my = ++C.subTok;
    later(sec, () => { if (C.subTok === my) el.classList.remove('on'); });
    C.speak = sec;
  }
  C.subTok = 0;
  function hudEnsureAny() { if (!document.getElementById('bg-hud')) { C.hud = null; hudEnsure(); } }
  const narrate = (key, chance = 1) => { const a = LINES[key]; if (a && Math.random() < chance) sub(L(a[Math.floor(Math.random() * a.length)])); };
  function pop(main, subText = '', color = '#ffe27a') {
    const el = $('.bg-pop'); if (!el) return;
    el.innerHTML = `<span style="color:${color}">${escapeHtml(main)}</span>${subText ? `<small>${escapeHtml(subText)}</small>` : ''}`;
    el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
  }
  function log(line) { C.log.push(line); if (C.log.length > 8) C.log.shift(); const el = $('.bg-log'); if (el) el.innerHTML = C.log.map((l) => `<div>${escapeHtml(l)}</div>`).join(''); }
  const colorOf = (pid) => COLORS[Math.max(0, C.order.indexOf(pid)) % COLORS.length];
  function hudRefresh() {
    if (!C.hud) return;
    const tt = $('.bg-turn'), pr = $('.bg-prompt');
    tt.textContent = tf('TURN {n} / {max}', { n: C.round, max: C.turns });
    if (C.ended) pr.textContent = '';
    else if (C.myTurn) { pr.textContent = t('YOUR TURN — ROLL [SPACE]'); pr.className = 'bg-prompt me'; }
    else { pr.className = 'bg-prompt'; pr.textContent = C.phase === 'duel' ? '' : C.rolling ? t('Rolling...') : C.cur ? tf("{name}'s turn", { name: name(C.cur) }) : ''; }
    const trk = $('.bg-track');
    const cells = [];
    for (let i = 0; i < 24; i++) {
      const on = C.order.filter((id) => C.tok[id] === i);
      const bg = { start: '#3b7a4c', loot: '#b58a1a', trap: '#a52a2a', card: '#6a3aa8', duel: '#b8571a', short: '#1a8a94', rest: '#3a6aa8', exit: '#1fd05e' }[R.tileType(i)];
      cells.push(`<i style="background:${bg}">${i}${on.map((id, k) => `<b style="background:${colorOf(id)};left:${2 + k * 6}px"></b>`).join('')}</i>`);
    }
    trk.innerHTML = cells.join('');
    const bk = C.bank[self()];
    $('.bg-bank').textContent = bk ? tf('Loot: {c} credits, {n} items', { c: bk.credits, n: bk.items.length }) : '';
    $('.bg-hint').textContent = t('[T] table view');
    if (C.board) C.board.drawScore({ title: tf('TURN {n} / {max}', { n: C.round, max: C.turns }), rows: C.order.slice(0, 4).map((id) => ({ name: name(id), pos: C.tok[id] || 0, done: (C.tok[id] || 0) >= 23, color: colorOf(id) })) });
  }
  // ---- geometry helpers
  const slotOf = (pid, tile) => {
    const here = C.order.filter((id) => (C.tok[id] || 0) === tile);
    const k = Math.max(0, here.indexOf(pid));
    return { k, n: Math.max(1, here.length) };
  };
  function slotWorld(pid, tile, out = new THREE.Vector3()) {
    const { k, n } = slotOf(pid, tile);
    C.board.tokenPos(tile, k, n, out);
    return out.add(new THREE.Vector3(REALM.x, REALM.y, REALM.z));
  }
  const tileWorld = (tile) => C.board.tilePos(tile, new THREE.Vector3()).add(new THREE.Vector3(REALM.x, REALM.y, REALM.z));
  function placeSelf() {
    if (!C.board) return;
    const tile = C.tok[self()] || 0;
    game.player.teleport(slotWorld(self(), tile), C.board.yawToCenter(tile));
    game.player.pitch = -0.12;
  }
  function hopTo(pts, dur, arc) {
    const p = game.player;
    C.hop = { pts, i: 0, u: 0, from: p.pos.clone(), dur, arc };
  }

  // ---- realm
  function buildRealm() {
    if (C.board) return;
    const b = createBoard();
    b.root.position.set(REALM.x, REALM.y, REALM.z);
    game.scene.add(b.root);
    C.board = b;
    for (const [cx, cy, cz, hx, hy, hz] of b.colliders) C.cols.push(game.physics.addStaticBox(REALM.x + cx, REALM.y + cy, REALM.z + cz, hx, hy, hz));
    C.cols.push(game.physics.addStaticBox(REALM.x, REALM.y - 18, REALM.z, 90, 1, 90));   // safety floor: never a void death
    for (const l of b.lights) C.emitters.push(game.lights.add({ pos: new THREE.Vector3(REALM.x + l.x, REALM.y + l.y, REALM.z + l.z), color: l.color, intensity: l.intensity, distance: l.distance, group: 'board' }));
    const adm = createAdministrator({ seed: 11 });
    adm.setPose('sit');
    adm.root.position.set(REALM.x + b.admin.seat.x, REALM.y + b.admin.seat.y, REALM.z + b.admin.seat.z);
    game.scene.add(adm.root);
    C.adm = adm;
    b.onBounce((i) => { sfx('item_drop', 0.55 - i * 0.1, 0.6 + i * 0.12); game.engine?.shake?.(0.12); });
  }
  function disposeRealm() {
    for (const c of C.cols) { try { game.physics.removeCollider(c); } catch { /* ignore */ } }
    C.cols.length = 0;
    for (const e of C.emitters) { try { game.lights.remove(e); } catch { /* ignore */ } }
    C.emitters.length = 0;
    C.adm?.dispose(); C.adm = null;
    C.board?.dispose(); C.board = null;
  }
  function enterEnv() {
    if (!C.saved) C.saved = { fog: game.env.interiorFog, vm: game.viewModel?.root?.visible };
    game.env.interiorFog = { fog: 0x07060d, density: 0.011 };
  }
  function leaveEnv() {
    if (C.saved) { game.env.interiorFog = C.saved.fog || null; if (game.viewModel?.root && C.saved.vm !== undefined) game.viewModel.root.visible = C.saved.vm; C.saved = null; }
    if (game.camera.far < 100 || game.camera.far > 400) { /* game.update resets it next frame */ }
  }

  // ---- client message handlers
  function onStart(d) {
    if (!d.order?.includes(self())) return;
    if (C.active) resetLocal(true);
    C.active = true; C.sid = d.sid; C.order = d.order.slice(); C.turns = d.turns || R.RULES.TURNS; C.round = 1; C.cur = null; C.phase = 'intro';
    C.myTurn = false; C.ended = false; C.queue.length = 0; C.ev = null; C.hop = null; C.rolling = false; C.log.length = 0; C.view = false;
    C.ret = d.ret?.[self()] || null; C.tok = {}; C.bank = {};
    for (const id of C.order) { C.tok[id] = 0; C.bank[id] = { credits: 0, items: [] }; }
    hudEnsure();
    game.player.stunT = Math.max(game.player.stunT, 2);
    game.engine?.flash?.(0xffffff, 1); if (game.engine) game.engine.fadeTarget = 1;
    sfx('teleport', 0.9);
    later(0.7, () => {
      if (!C.active) return;
      buildRealm(); enterEnv(); placeSelf();
      if (game.engine) game.engine.fadeTarget = 0;
      hudRefresh(); pop(t('THE BOARD'), t('Everybody at the exit. Twelve turns.'), '#e8ecff');
      later(1.2, () => sub(L(LINES.intro[0]), 3.6));
      later(4.9, () => sub(L(LINES.intro[1]), 3.4));
    });
  }
  function onTurn(d) {
    if (!C.active || d.sid !== C.sid) return;
    C.cur = d.pid; C.round = d.round; C.phase = 'roll'; C.myTurn = d.pid === self(); C.rolling = false;
    C.board?.setTurn(C.tok[d.pid] || 0);
    if (C.myTurn) { sfx('ui_notify', 0.5); if (!d.extra) narrate('turn', 0.3); }
    hudRefresh();
  }
  function onEv(d) {
    if (!C.active || d.sid !== C.sid) return;
    for (const ev of d.evs || []) C.queue.push(ev);
  }
  function onEnd(d) {
    if (!C.active || d.sid !== C.sid || C.ended) return;
    C.ended = true; C.myTurn = false; C.phase = 'over'; closeDuel(false);
    const failed = !!d.failed;
    const el = $('.bg-end');
    if (el) {
      const bits = [];
      if (d.took) bits.push(tf('The Administrator took your {item}.', { item: itemName(d.took.type) }));
      if (failed) bits.push(tf('Your health was cut to {p}%.', { p: Math.round(R.RULES.HP_KEEP * 100) }));
      if (d.ship) bits.unshift(t('The ship left without the terms being met.'));
      if (d.reward) bits.push(tf('Reward card: {what}', { what: d.reward.kind === 'credits' ? tf('{n} credits', { n: d.reward.n }) : tf('{n}x {item}', { n: d.reward.n, item: itemName(d.reward.id) }) }));
      el.innerHTML = `<h1 style="color:${failed ? '#ff5a4a' : '#7dff9a'}">${escapeHtml(failed ? t('TERMS ENFORCED') : t('YOU MAY LEAVE'))}</h1>${bits.map((b) => `<p>${escapeHtml(b)}</p>`).join('')}`;
      el.classList.add('on');
    }
    narrate(d.ship ? 'ship' : failed ? 'bad' : 'ok');
    sfx(failed ? 'death_sting' : 'ui_quota_met', 0.7);
    if (failed) { game.engine?.hurt?.(0.6); game.engine?.shake?.(0.5); }
    const wait = d.ship ? 1.8 : 3.6;
    later(wait, () => { if (game.engine) game.engine.fadeTarget = 1; });
    later(wait + 0.7, () => finishLocal(d));
  }
  function finishLocal(d) {
    if (!C.active) return;
    const p = game.player;
    resetLocal(false);
    p.stunT = 0;
    if (d.ship || !d.ret) game.spawnInShip?.();
    else p.teleport(new THREE.Vector3(d.ret[0], d.ret[1], d.ret[2]), d.ret[3]);
    if (d.failed && !p.dead) {
      p.hp = R.penaltyHp(p.hp, p.maxHp || 100);
      game.net?.send('pst', { hp: Math.round(p.hp) });
      game.engine?.hurt?.(0.9);
    }
    if (game.engine) { game.engine.fadeTarget = 0; game.engine.flash?.(d.failed ? 0xff2020 : 0xffffff, 0.6); }
    if (d.took) game.ui?.toast?.(tf('The Administrator took your {item}.', { item: itemName(d.took.type) }), 'bad');
    if (d.reward) game.ui?.toast?.(tf('Reward card: {what}', { what: d.reward.kind === 'credits' ? tf('{n} credits', { n: d.reward.n }) : tf('{n}x {item}', { n: d.reward.n, item: itemName(d.reward.id) }) }), 'good');
  }
  function resetLocal(silent) {
    closeDuel(false);
    C.active = false; C.queue.length = 0; C.ev = null; C.hop = null; C.myTurn = false; C.view = false; C.cur = null; C.phase = 'idle';
    disposeRealm(); leaveEnv();
    if (C.hud) { C.hud.el.remove(); C.hud = null; }
    if (silent && game.engine) game.engine.fadeTarget = 0;
  }

  // ---- event presentation (host durations = R.eventMs, so host and clients stay in step)
  const bankOf = (pid) => C.bank[pid] || (C.bank[pid] = { credits: 0, items: [] });
  function hurtSelf(frac) {
    const p = game.player; if (p.dead) return;
    p.hp = R.trapHp(p.hp, p.maxHp || 100, frac);
    game.engine?.hurt?.(0.5); sfx('hit_flesh', 0.6);
    game.net?.send('pst', { hp: Math.max(1, Math.round(p.hp)) });
  }
  function healSelf(frac) {
    const p = game.player; if (p.dead) return;
    const max = p.maxHp || 100;
    p.hp = Math.min(max, p.hp + max * frac);
    game.net?.send('pst', { hp: Math.round(p.hp) });
    sfx('heal', 0.5);
  }
  const whatText = (ev) => (ev.item ? itemName(ev.item) : ev.credits ? tf('{n} credits', { n: ev.credits }) : ev.frac ? tf('{n}% health', { n: Math.round(ev.frac * 100) }) : t('nothing'));
  function startEv(ev) {
    const me = self(), nm = name(ev.pid);
    switch (ev.k) {
      case 'roll':
        C.rolling = true; C.board?.rollDie(ev.n, ev.seed || 1, 1900);
        sfx('item_throw', 0.6); log(tf('{name} rolls a {n}.', { name: nm, n: ev.n }));
        later(1.95, () => { C.rolling = false; pop(String(ev.n), nm, '#ffe27a'); hudRefresh(); });
        break;
      case 'move':
        C.tok[ev.pid] = ev.to;
        if (ev.pid === me && C.board) hopTo(ev.path.map((tile, j) => (j === ev.path.length - 1 ? slotWorld(me, tile) : tileWorld(tile))), 0.32, 0.9);
        sfx('safe_click', 0.3); break;
      case 'jump':
        C.tok[ev.pid] = ev.to;
        if (ev.pid === me && C.board) hopTo([slotWorld(me, ev.to)], 0.95, 4.5);
        log(tf('{name} takes a shortcut to tile {i}!', { name: nm, i: ev.to })); sfx('jetpack', 0.3); break;
      case 'tile': sfx('safe_click', 0.25); break;
      case 'loot':
        if (ev.credits) { bankOf(ev.pid).credits += ev.credits; log(tf('{name} finds {n} credits.', { name: nm, n: ev.credits })); pop('+' + ev.credits, nm, '#ffd86a'); sfx('coins', 0.5); }
        else { bankOf(ev.pid).items.push(ev.item); log(tf('{name} finds: {item}.', { name: nm, item: itemName(ev.item) })); pop(itemName(ev.item), nm, '#ffd86a'); sfx('item_pickup', 0.5); }
        if (ev.cause === 'tile') narrate('loot', 0.4);
        break;
      case 'trap':
        if (ev.pid === me) hurtSelf(ev.frac);
        log(tf('TRAP! {name} loses {p}% health.', { name: nm, p: Math.round(ev.frac * 100) })); pop(t('TRAP'), nm, '#ff5a4a'); game.engine?.shake?.(0.4); narrate('trap', 0.5);
        break;
      case 'heal':
        if (ev.pid === me) healSelf(ev.frac);
        log(tf('{name} rests and recovers {p}% health.', { name: nm, p: Math.round(ev.frac * 100) })); break;
      case 'card': {
        const c = R.CARD_BY_ID[ev.id];
        if (c) { log(tf('{name} draws "{card}": {text}', { name: nm, card: t(c.name), text: t(c.text) })); pop(t(c.name), t(c.text), '#d8b8ff'); }
        sfx('ui_notify', 0.5); narrate('card', 0.4); break; }
      case 'swap': {
        const a = C.tok[ev.a]; C.tok[ev.a] = C.tok[ev.b]; C.tok[ev.b] = a;
        if ((ev.a === me || ev.b === me) && C.board) hopTo([slotWorld(me, C.tok[me])], 1.0, 3);
        log(tf('{name} swaps places with {other}.', { name: name(ev.a), other: name(ev.b) })); sfx('teleport', 0.3); break; }
      case 'steal': {
        const from = bankOf(ev.from), to = bankOf(ev.to);
        if (ev.item) { const i = from.items.indexOf(ev.item); if (i >= 0) from.items.splice(i, 1); to.items.push(ev.item); } else { from.credits -= ev.credits; to.credits += ev.credits; }
        log(tf('{name} steals {what} from {other}.', { name: name(ev.to), what: whatText(ev), other: name(ev.from) })); sfx('cloth_rustle', 0.4); break; }
      case 'toll': {
        const b = bankOf(ev.pid);
        if (ev.item) { const i = b.items.indexOf(ev.item); if (i >= 0) b.items.splice(i, 1); } else if (ev.credits) b.credits -= ev.credits; else if (ev.frac && ev.pid === me) hurtSelf(ev.frac);
        log(tf('{name} pays the toll: {what}.', { name: nm, what: whatText(ev) })); sfx('register', 0.4); break; }
      case 'skip': log(tf('{name} loses a turn.', { name: nm })); pop(t('LOSE A TURN'), nm, '#aeb6d8'); break;
      case 'extra': pop(t('ROLL AGAIN'), nm, '#7dff9a'); break;
      case 'finish': log(tf('{name} reached the EXIT!', { name: nm })); pop(t('EXIT!'), nm, '#7dff9a'); sfx('slot_win', 0.6); narrate('finish', 0.6); break;
      case 'round': C.round = ev.n; if (ev.n >= C.turns) narrate('late'); break;
      case 'duel':
        C.phase = 'duel'; C.myTurn = false;
        if (ev.pid === me) openDuel(ev.kind, ev.dseed); else pop(t('DUEL vs THE BOARD'), tf('{name} is dueling THE BOARD', { name: nm }), '#ffb060');
        narrate('duel', 0.6); break;
      case 'duelres': {
        closeDuel(true);
        const key = ev.res === 'win' ? '{name} wins the duel! ({s} vs {b})' : ev.res === 'lose' ? '{name} loses the duel. ({s} vs {b})' : 'The duel is a draw. ({s} vs {b})';
        const line = tf(key, { name: nm, s: Math.round(ev.score * 100), b: Math.round(ev.board * 100) });
        log(line); pop(ev.res === 'win' ? '+3' : ev.res === 'lose' ? '-3' : '=', line, ev.res === 'win' ? '#7dff9a' : ev.res === 'lose' ? '#ff5a4a' : '#ffe27a');
        narrate(ev.res === 'win' ? 'win' : ev.res === 'lose' ? 'lose' : 'finish', 0.6); break; }
      default: break;
    }
    hudRefresh();
    return R.eventMs(ev) / 1000;
  }

  // ---- DUEL minigame (timing bar / reaction), vs THE BOARD
  function openDuel(kind, dseed) {
    closeDuel(false);
    const rnd = new RNG(dseed || 1);
    const D = { kind, t: 0, done: false };
    if (kind === 'timing') { D.zone = 0.22 + rnd.next() * 0.56; D.w = 0.1 + rnd.next() * 0.05; D.speed = 0.95 + rnd.next() * 0.55; D.pos = 0; D.dir = 1; }
    else { D.wait = 1.3 + rnd.next() * 2.2; D.state = 'wait'; D.at = 0; }
    C.duel = D;
    const el = $('.bg-duel');
    if (el) {
      el.classList.add('on');
      el.innerHTML = `<h3>${escapeHtml(t('DUEL vs THE BOARD'))}</h3><p>${escapeHtml(kind === 'timing' ? t('Stop the marker in the green zone. [SPACE]') : t('Wait for the signal, then hit [SPACE].'))}</p>`
        + (kind === 'timing' ? `<div class="bg-bar"><div class="z" style="left:${(D.zone - D.w / 2) * 100}%;width:${D.w * 100}%"></div><div class="m" style="left:0%"></div></div>` : `<div class="bg-sig">${escapeHtml(t('WAIT...'))}</div>`);
    }
    if (C.autoDuel != null) later(0.4, () => duelPress(C.autoDuel));
  }
  function duelScore(D) {
    if (D.kind === 'timing') {
      const diff = Math.abs(D.pos - D.zone);
      if (diff <= D.w / 2) return 0.85 + 0.15 * (1 - diff / (D.w / 2));
      return Math.max(0, 0.8 * (1 - (diff - D.w / 2) / (D.w * 2.5)));
    }
    if (D.state === 'wait') return 0;
    return clamp(1 - (D.t - D.at - 0.18) / 0.55, 0, 1);
  }
  function duelPress(force) {
    const D = C.duel; if (!D || D.done) return;
    D.done = true;
    const score = force != null ? force : duelScore(D);
    const el = $('.bg-duel');
    if (el && D.kind === 'reaction' && D.state === 'wait') { const s = el.querySelector('.bg-sig'); if (s) s.textContent = t('TOO EARLY!'); }
    game.net?.request('bgreq', { op: 'duel', sid: C.sid, score });
    later(0.6, () => closeDuel(false));
  }
  function closeDuel(fromResult) {
    void fromResult;
    if (C.duel && !C.duel.done) { /* closed without an answer: the host times it out */ }
    C.duel = null;
    const el = $('.bg-duel'); if (el) el.classList.remove('on');
  }
  function duelUpdate(dt) {
    const D = C.duel; if (!D || D.done) return;
    D.t += dt;
    const el = $('.bg-duel');
    if (D.kind === 'timing') {
      D.pos += D.dir * D.speed * dt;
      if (D.pos >= 1) { D.pos = 1; D.dir = -1; } else if (D.pos <= 0) { D.pos = 0; D.dir = 1; }
      const m = el?.querySelector('.m'); if (m) m.style.left = (D.pos * 100) + '%';
    } else if (D.state === 'wait' && D.t >= D.wait) {
      D.state = 'go'; D.at = D.t;
      const s = el?.querySelector('.bg-sig'); if (s) { s.textContent = t('NOW!'); s.classList.add('go'); }
    }
    if (D.t > 9) duelPress(0);
  }

  // ---- input
  function onKey(e) {
    if (!C.active || disposed || e.repeat) return;
    if (game.ui?.blocksInput?.()) return;
    if (e.code === 'Space') {
      e.preventDefault();
      if (C.duel) { duelPress(); return; }
      if (C.myTurn && C.phase === 'roll' && !C.ended) { C.myTurn = false; hudRefresh(); game.net?.request('bgreq', { op: 'roll', sid: C.sid }); }
    } else if (e.code === 'KeyT') C.view = !C.view;
  }
  if (typeof window !== 'undefined') { window.addEventListener('keydown', onKey); offs.push(() => window.removeEventListener('keydown', onKey)); }

  // ---- per frame (client)
  function clientUpdate(dt) {
    if (!C.active) return;
    const p = game.player;
    p.stunT = Math.max(p.stunT || 0, 0.5);
    if (C.board) {
      C.board.update(dt, game.time);
      C.adm?.update(dt, game.time, { lookAt: game.camera.position, agit: C.speak > 0 ? 0.55 : 0.12, near: true });
      C.speak = Math.max(0, C.speak - dt);
      // presentation queue
      if (C.ev) { C.evT -= dt; if (C.evT <= 0) C.ev = null; }
      if (!C.ev && C.queue.length && !C.ended) { const ev = C.queue.shift(); C.ev = ev; C.evT = startEv(ev); }
      // own body: hop between tiles, otherwise stay glued to the slot
      if (C.hop) {
        const h = C.hop; h.u += dt / h.dur;
        const to = h.pts[h.i], u = Math.min(1, h.u);
        const pos = tmpV.copy(h.from).lerp(to, u); pos.y += Math.sin(Math.PI * u) * h.arc;
        p.teleport(pos);
        if (h.u >= 1) { h.from = to.clone(); h.i++; h.u = 0; sfx('land_soft', 0.25, 1.1); if (h.i >= h.pts.length) C.hop = null; }
      } else if (!p.dead) {
        const want = slotWorld(self(), C.tok[self()] || 0);
        if (Math.hypot(p.pos.x - want.x, p.pos.z - want.z) > 0.7 || Math.abs(p.pos.y - want.y) > 1.2) p.teleport(want);
      }
      // realm view: dark, long sight
      if (game.camera.far < 200) { game.camera.far = 240; game.camera.updateProjectionMatrix(); }
      if (C.view) {
        game.camera.position.set(REALM.x, REALM.y + 26, REALM.z + 25);
        game.camera.lookAt(REALM.x, REALM.y, REALM.z - 2);
      }
      if (game.viewModel?.root) game.viewModel.root.visible = !C.view;
    }
    duelUpdate(dt);
    if (p.dead) { game.net?.request('bgreq', { op: 'leave', sid: C.sid }); resetLocal(false); if (game.engine) game.engine.fadeTarget = 0; }
  }

  // ============================================================================================== wiring
  offs.push(mm.on('registerHandlers', (Hh, g) => { if (g === game) Hh('bgreq', hostReq); }));
  offs.push(mm.on('netReady', (net, g) => {
    if (g !== game) return;
    net.on_('bg', (d) => {
      try {
        switch (d?.k) {
          case 'adm': onAdm(d); break; case 'whisper': onWhisper(d); break; case 'start': onStart(d); break;
          case 'turn': onTurn(d); break; case 'ev': onEv(d); break; case 'end': onEnd(d); break; default: break;
        }
      } catch (e) { console.warn('[boardgame] msg', d?.k, e); }
    });
    offs.push(net.on('peerLeave', (id) => { if (isHost()) hostLeft(id); }));
  }));
  offs.push(mm.on('playerJoin', (id, info, g) => { if (g === game && isHost() && A.on) game.net.sendTo(id, 'bg', admState()); }));
  offs.push(mm.on('phase', (ph, g) => {
    if (g !== game) return;
    if (isHost()) {
      if (ph === 'moon') armAdmin();
      else { if (H.sess) hostAbort('ship'); admDespawn(); }
    }
  }));
  offs.push(mm.on('update', (dt, g) => {
    if (g !== game || disposed) return;
    try {
      for (let i = timers.length - 1; i >= 0; i--) if (game.time >= timers[i].at) { const f = timers.splice(i, 1)[0].fn; try { f(); } catch (e) { console.warn('[boardgame] timer', e); } }
      if (isHost()) hostUpdate(dt);
      viewUpdate(dt);
      clientUpdate(dt);
    } catch (e) { console.warn('[boardgame] update', e); }
  }));

  // ============================================================================================== public api (tests / debug)
  const api = {
    /** host: put the Administrator ~12 m from a living player right now (bypasses the 4 % roll) */
    spawnAdmin(o = {}) { if (!isHost()) return false; return trySpawnAdmin(o.near !== false); },
    /** host: force the gaze trigger for `pid` (default: the local player) */
    gaze(pid = self()) { return hostGaze(pid, true); },
    /** host: next landing always rolls the Administrator (once) */
    appearNextLanding() { A.force = true; A.lastDay = -1; },
    abort(why = 'ship') { hostAbort(why); },
    force: {
      rolls(list) { if (H.sess) H.sess.rng.force('die', list); else H.forceRolls = list.slice(); },
      cards(list) { if (H.sess) H.sess.forcedCards.push(...list); else H.forceCards = list.slice(); },
      /** client: answer every duel with this score (0..1) instead of playing it */
      duel(score) { C.autoDuel = score == null ? null : score; },
    },
    tableView(on = !C.view) { C.view = !!on; },
    state: () => ({
      admin: { on: A.on, armed: A.armed, pos: A.pos.toArray(), lastDay: A.lastDay },
      host: H.sess ? { sid: H.sid, phase: H.sess.phase, round: H.sess.round, cur: H.sess.cur, status: H.sess.status, pos: Object.fromEntries(Object.entries(H.sess.p).map(([k, v]) => [k, v.pos])), finished: Object.fromEntries(Object.entries(H.sess.p).map(([k, v]) => [k, v.finished])) } : null,
      last: H.last || null,
      local: C.active ? { sid: C.sid, phase: C.phase, round: C.round, cur: C.cur, myTurn: C.myTurn, tok: { ...C.tok }, queue: C.queue.length, duel: !!C.duel, ended: C.ended, realm: !!C.board } : null,
      view: { on: V.on, gaze: +V.gaze.toFixed(2) },
    }),
    rules: R,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const o of offs) { try { o?.(); } catch { /* ignore */ } }
      resetLocal(true);
      if (V.model) { V.model.dispose(); V.model = null; }
      V.vig?.remove();
      document.getElementById('bg-style')?.remove();
      timers.length = 0;
    },
  };
  return api;
}
