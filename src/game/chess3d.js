// CHESS3D view controller (used by module `arcade`): the real 3D board. While a table is open the camera eases to a top-down-ish view over it, the mouse picks
// squares by raycast (click a piece then a square, or drag it), legal targets / last move / check ring are glowing marks on the table (models/chess3d.js), a small HUD
// bar holds seats / AI / resign / promotion, and ESC (or Stand up) returns. The 2D overlay stays available as "Classic view" (setClassic). Rules + host code untouched:
// moves still go out as arreq 'move' with the same payloads, everybody renders the same `ar` table snapshots.
//   const c3 = createChess3d({ game, arc, viewOf(id) -> { model, root } | null, request(op, data), closeView(), openView(id) })
//   c3.create(id) -> { el, dispose, refresh }    (arcade.js mounts it with ui.openPanel)     c3.update(dt) each frame     c3.dispose()
import * as THREE from 'three';
import { el } from '../core/util.js';
import { t, tf, addTranslations } from '../core/i18n.js';
import { TOP_Y, rayToSq, rayToPoint, viewPose, createPicker, piecesOf, capturedOf } from './chess3d_map.js';

export const TR3 = {
  'Classic view': 'Klasik görünüm', '3D view': '3D görünüm', 'Promote to:': 'Terfi:', 'Queen': 'Vezir', 'Rook': 'Kale', 'Bishop': 'Fil', 'Knight': 'At',
  'Drag a piece, or click it and then a square. ESC leaves the table.': 'Taşı sürükle ya da tıkla, sonra bir kare seç. ESC masadan kalkar.',
  'Last move': 'Son hamle',
  'Sit at White [E]': 'Beyazda otur [E]', 'Sit at Black [E]': 'Siyahta otur [E]', 'Stand up [E]': 'Kalk [E]', 'Seat taken: {name}': 'Koltuk dolu: {name}', 'Seat taken: Computer': 'Koltuk dolu: Bilgisayar',
  'Watch the game': 'Oyunu izle', 'Your move': 'Sıra sende', 'Waiting for an opponent - or add the computer below': 'Rakip bekleniyor - ya da aşağıdan bilgisayarı ekle',
  'Captured': 'Alınan taşlar', 'Legal move': 'Yasal hamle', 'Capture': 'Alma',
};
export const RU3 = {
  'Classic view': 'Классический вид', '3D view': '3D-вид', 'Promote to:': 'Превращение:', 'Queen': 'Ферзь', 'Rook': 'Ладья', 'Bishop': 'Слон', 'Knight': 'Конь',
  'Drag a piece, or click it and then a square. ESC leaves the table.': 'Перетащите фигуру или щёлкните по ней, затем по клетке. ESC - встать из-за стола.',
  'Last move': 'Последний ход',
  'Sit at White [E]': 'Сесть за белых [E]', 'Sit at Black [E]': 'Сесть за чёрных [E]', 'Stand up [E]': 'Встать [E]', 'Seat taken: {name}': 'Место занято: {name}', 'Seat taken: Computer': 'Место занято: компьютер',
  'Watch the game': 'Смотреть партию', 'Your move': 'Ваш ход', 'Waiting for an opponent - or add the computer below': 'Ждём соперника - или добавьте компьютер ниже',
  'Captured': 'Съедено', 'Legal move': 'Допустимый ход', 'Capture': 'Взятие',
};

const KEY = 'tfg_arcade_classic';
export function isClassic() { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } }
export function setClassic(v) { try { localStorage.setItem(KEY, v ? '1' : '0'); } catch { /* private mode: per-session only */ } }

const CSS = `
.overlay.arc3d{background:transparent;pointer-events:none;align-items:flex-end;padding-bottom:12px}
.a3h{pointer-events:auto;width:min(820px,96vw);background:var(--ph-bg,rgba(12,7,3,.95));border:1px solid var(--ph-line,rgba(255,150,70,.3));box-shadow:0 4px 18px rgba(0,0,0,.6);padding:6px 10px 8px;font-family:VT323,monospace;color:var(--ph-hi,#ffe9b0);display:flex;flex-direction:column;gap:5px}
.a3h .r{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.a3h .st{font-size:26px;line-height:1;flex:1;min-width:0}.a3h .st.bad{color:#ff7a5a}.a3h .st.good{color:#8dff9d}
.a3h .tt{font-size:20px;color:var(--ph-dim,rgba(255,190,140,.6))}
.a3h .seat{display:flex;align-items:center;gap:6px;border:1px solid var(--ph-line,rgba(255,150,70,.3));background:rgba(0,0,0,.35);padding:2px 8px;font-size:20px}
.a3h .seat.turn{border-color:var(--ph-hi,#ffe9b0);box-shadow:0 0 8px var(--ph-glow,rgba(255,170,80,.5))}
.a3h .seat .dot{width:12px;height:12px;border-radius:50%;border:2px solid #000;flex:none}.a3h .seat .dot.w{background:#f3ead6}.a3h .seat .dot.b{background:#2a1d16;border-color:#efe3c8}
.a3h .hint{font-size:17px;color:var(--ph-dim,rgba(255,190,140,.6))}
`;
function ensureCss() {
  if (typeof document === 'undefined' || document.getElementById('tfg-chess3d-css')) return;
  const s = document.createElement('style'); s.id = 'tfg-chess3d-css'; s.textContent = CSS; document.head.appendChild(s);
}
const smooth = (u) => u * u * (3 - 2 * u);

export function createChess3d(ctx) {
  const { game, arc } = ctx;
  addTranslations(TR3, 'tr'); addTranslations(RU3, 'ru');
  ensureCss();
  const cam = () => game.camera;
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), inv = new THREE.Matrix4(), o = new THREE.Vector3(), d = new THREE.Vector3();
  const eye = new THREE.Vector3(), tgt = new THREE.Vector3(), qTo = new THREE.Quaternion(), mLook = new THREE.Matrix4(), UP = new THREE.Vector3(0, 1, 0);
  let cur = null;                 // { id, picker, hud, drag, hover, ... } while the table is open
  let k = 0, lastId = null, theta = 0, thetaTo = 0, disposed = false;

  const me = (s) => (s.seats.w === game.selfId ? 'w' : s.seats.b === game.selfId ? 'b' : null);
  const nameOf = (id) => game.playerName?.(id) || t('Employee');
  const sideName = (c) => (c === 'w' ? t('White') : t('Black'));
  const seatName = (c, s) => (s.seats[c] ? nameOf(s.seats[c]) + (s.seats[c] === game.selfId ? ` (${t('you')})` : '') : s.ai[c] ? (s.ai[c] === 1 ? t('Computer (easy)') : t('Computer (normal)')) : t('Empty'));

  // ---------------------------------------------------------------- picking
  function localRay(e, id) {
    const v = ctx.viewOf(id), c = cam();
    if (!v || !c) return null;
    const cv = game.engine?.canvas, r = cv.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1));
    c.updateMatrixWorld();
    ray.setFromCamera(ndc, c);
    v.root.updateWorldMatrix(true, false);
    inv.copy(v.root.matrixWorld).invert();
    o.copy(ray.ray.origin).applyMatrix4(inv); d.copy(ray.ray.direction).transformDirection(inv);
    return { o, d };
  }
  const sqAt = (e, id) => { const r = localRay(e, id); return r ? rayToSq(r.o, r.d, TOP_Y + 0.05) : -1; };
  const entry = () => arc.get(cur.id);

  function marks() {
    const v = ctx.viewOf(cur.id); if (!v) return;
    const { snap, dec } = entry(), m = me(snap), P = cur.picker;
    const tg = P.targets(snap, dec, m);
    v.model.pieces.setMarks({ sel: P.sel, tgt: [...tg].map(([s, c]) => [s, c === 'cap']), hover: cur.hover });
  }
  function apply(res, from) {
    if (res.m) {
      ctx.request('move', { id: cur.id, m: res.m });
      const v = ctx.viewOf(cur.id);
      v?.model.pieces.settle(res.m[0], res.m[res.m.length - 1]);
    } else if (from != null) ctx.viewOf(cur.id)?.model.pieces.release();
    marks(); hud.render();
  }

  function onDown(e) {
    if (!cur || e.button !== 0 || (e.target instanceof Node && cur.hud.el.contains(e.target))) return;
    const { snap, dec } = entry(), m = me(snap), P = cur.picker;
    const sq = sqAt(e, cur.id);
    if (sq < 0) { const had = P.sel >= 0; P.reset(); if (had) { marks(); hud.render(); } return; }
    const tg = P.targets(snap, dec, m);
    if (P.sel >= 0 && tg.has(sq)) { apply(P.click(snap, dec, m, sq)); return; }
    if (P.canPick(snap, dec, m, sq)) {
      const was = P.sel === sq;
      if (!was) P.click(snap, dec, m, sq);
      cur.drag = { sq, was, moved: false, x: e.clientX, y: e.clientY };
      marks(); hud.render();
    } else apply(P.click(snap, dec, m, sq));
  }
  function onMove(e) {
    if (!cur) return;
    const r = localRay(e, cur.id); if (!r) return;
    const dr = cur.drag;
    if (dr) {
      if (!dr.moved && Math.hypot(e.clientX - dr.x, e.clientY - dr.y) > 6) dr.moved = true;
      if (dr.moved) { const p = rayToPoint(r.o, r.d, TOP_Y + 0.05); if (p) ctx.viewOf(cur.id)?.model.pieces.hold(dr.sq, Math.max(-0.44, Math.min(0.44, p.x)), Math.max(-0.44, Math.min(0.44, p.z))); }
    }
    const sq = rayToSq(r.o, r.d, TOP_Y + 0.05);
    if (sq !== cur.hover) { cur.hover = sq; marks(); }
  }
  function onUp(e) {
    if (!cur || e.button !== 0 || !cur.drag) return;
    const dr = cur.drag; cur.drag = null;
    const { snap, dec } = entry(), m = me(snap), P = cur.picker;
    if (dr.moved) {
      const sq = sqAt(e, cur.id);
      if (sq >= 0 && P.targets(snap, dec, m).has(sq)) apply(P.click(snap, dec, m, sq), dr.sq);
      else apply({}, dr.sq);
    } else if (dr.was) { P.click(snap, dec, m, dr.sq); marks(); hud.render(); }
  }

  // ---------------------------------------------------------------- HUD
  const hud = { el: null, render() {} };
  function buildHud(id) {
    const ui = game.ui;
    const root = el('div', { class: 'a3h' });
    hud.el = root;
    hud.render = () => {
      if (!cur) return;
      const e = arc.get(id), s = e.snap, dec = e.dec, m = me(s), P = cur.picker;
      root.innerHTML = '';
      // status
      let txt, cls = '';
      if (s.over) {
        const w = s.over.winner, why = s.over.reason;
        if (w === 'd') txt = `${t('Draw')}: ${why === 'stalemate' ? t('stalemate') : why === 'insufficient' ? t('insufficient material') : why === 'fifty' ? t('fifty-move rule') : why === 'repetition' ? t('threefold repetition') : why === 'kings' ? t('king against king') : t('no progress')}`;
        else { txt = `${tf('{side} wins', { side: sideName(w) })} - ${why === 'mate' ? t('checkmate') : why === 'resign' ? t('resignation') : t('no legal moves')}`; cls = s.seats[w] === game.selfId ? 'good' : ''; }
      } else {
        const tn = dec.st.turn, base = m === tn ? `${t('Your move')} (${sideName(tn)})` : tf('{side} to move', { side: sideName(tn) });
        txt = dec.check ? `${base} - ${t('CHECK!')}` : base; cls = dec.check ? 'bad' : m === tn ? 'good' : '';
        if (!s.seats[tn] && !s.ai[tn] && m) txt = t('Waiting for an opponent - or add the computer below');   // the other stool is empty and nobody plays it
      }
      const title = s.kind === 'draughts' ? t('DAMA TABLE') : t('CHESS TABLE');
      root.appendChild(el('div', { class: 'r' }, el('div', { class: 'st ' + cls }, txt), el('div', { class: 'tt' }, `${title} · ${m ? `${t('You play')} ${sideName(m)}` : t('Spectating')}${s.log.length ? ` · ${t('Last move')}: ${s.log[s.log.length - 1]}` : ''}`)));
      // seats
      const playing = s.ply > 0 && !s.over, seats = el('div', { class: 'r' });
      for (const c of ['w', 'b']) {
        const row = el('div', { class: 'seat' + (!s.over && dec.st.turn === c ? ' turn' : '') }, el('span', { class: 'dot ' + c }), `${sideName(c)}: ${seatName(c, s)}`);
        const free = !s.seats[c];
        if (free && (!m || !playing) && !(s.ai[c] && playing)) row.appendChild(ui.button(t('Sit'), () => arc.request('sit', { id, c }), 'small'));
        if (free && m) {
          if (s.ai[c] !== 1) row.appendChild(ui.button(t('AI easy'), () => arc.request('ai', { id, c, lv: 1 }), 'small'));
          if (s.ai[c] !== 2) row.appendChild(ui.button(t('AI normal'), () => arc.request('ai', { id, c, lv: 2 }), 'small'));
          if (s.ai[c]) row.appendChild(ui.button(t('No AI'), () => arc.request('ai', { id, c, lv: 0 }), 'small'));
        }
        seats.appendChild(row);
      }
      root.appendChild(seats);
      // captured pieces (chess) + legend
      const cap = capturedOf(s.kind, piecesOf(s.kind, s.pos)), GL = { w: { p: '\u2659', n: '\u2658', b: '\u2657', r: '\u2656', q: '\u2655' }, b: { p: '\u265F', n: '\u265E', b: '\u265D', r: '\u265C', q: '\u265B' } };
      const lost = (c) => cap[c].map((x) => GL[c][x]).join('');
      const info = el('div', { class: 'r' });
      if (s.kind !== 'draughts') info.appendChild(el('span', { class: 'tt' }, `${t('Captured')}: ${lost('b') || '-'} | ${lost('w') || '-'}`));
      info.appendChild(el('span', { class: 'hint' }, el('span', { style: 'color:#7dff8a' }, `\u25CF ${t('Legal move')}`), '  ', el('span', { style: 'color:#ff6a5a' }, `\u25CB ${t('Capture')}`)));
      root.appendChild(info);
      // promotion picker
      if (P.promo) {
        const pr = el('div', { class: 'r' }, el('span', { class: 'st' }, t('Promote to:')));
        for (const [pc, name] of [['q', 'Queen'], ['r', 'Rook'], ['b', 'Bishop'], ['n', 'Knight']]) pr.appendChild(ui.button(t(name), () => { const mv = P.choosePromo(pc); if (mv) { ctx.request('move', { id, m: mv }); ctx.viewOf(id)?.model.pieces.settle(mv[0], mv[1]); } marks(); hud.render(); }, 'small primary'));
        root.appendChild(pr);
      }
      // actions
      const acts = el('div', { class: 'r' });
      if (m) {
        if (!playing) {
          acts.appendChild(ui.button(s.kind === 'draughts' ? t('Switch to CHESS') : t('Switch to DAMA'), () => arc.request('kind', { id, k: s.kind === 'draughts' ? 'chess' : 'draughts' }), 'small'));
          if (s.over || s.ply > 0) acts.appendChild(ui.button(t('New game'), () => arc.request('new', { id }), 'small primary'));
        } else acts.appendChild(ui.button(t('Resign'), () => arc.request('resign', { id }), 'small danger'));
        acts.appendChild(ui.button(t('Stand up'), () => { arc.request('stand', { id }); ctx.closeView(); }, 'small'));
      }
      acts.appendChild(ui.button(t('Classic view'), () => { setClassic(true); ctx.openView(id); }, 'small'));
      acts.appendChild(el('span', { class: 'hint' }, t('Drag a piece, or click it and then a square. ESC leaves the table.')));
      root.appendChild(acts);
    };
  }

  // ---------------------------------------------------------------- lifecycle
  function create(id) {
    if (cur) release();
    buildHud(id);
    cur = { id, picker: createPicker(), hud, drag: null, hover: -1, ver: -1, off: null };
    lastId = id;
    game.ui?.overlay?.classList.add('arc3d');
    window.addEventListener('mousedown', onDown, true);
    window.addEventListener('mousemove', onMove, true);
    window.addEventListener('mouseup', onUp, true);
    const mine = cur;
    mine.off = arc.subscribe((tid) => {
      if (cur !== mine || tid !== id) return;
      const v = arc.get(id).snap.ver;
      if (v !== mine.ver) { mine.ver = v; mine.picker.reset(); }
      marks(); hud.render();
    });
    mine.ver = arc.get(id).snap.ver;
    marks(); hud.render();
    return {
      el: hud.el, refresh: () => hud.render(),
      dispose() { if (cur === mine) release(); },
    };
  }
  function release() {
    if (!cur) return;
    window.removeEventListener('mousedown', onDown, true);
    window.removeEventListener('mousemove', onMove, true);
    window.removeEventListener('mouseup', onUp, true);
    cur.off?.();
    const v = ctx.viewOf(cur.id);
    if (v) { v.model.pieces.release(); v.model.pieces.setMarks({ sel: -1, hover: -1, tgt: [] }); }
    game.ui?.overlay?.classList.remove('arc3d');
    cur = null;
  }

  /** camera blend, called every frame AFTER the player camera update (mods 'update') */
  function update(dt) {
    if (disposed) return;
    const goal = cur ? 1 : 0;
    if (k === goal && !cur) return;
    k += (goal - k) * Math.min(1, dt * 4.2);
    if (Math.abs(goal - k) < 0.004) k = goal;
    const id = cur?.id || lastId, v = id && ctx.viewOf(id), c = cam();
    if (!v || !c) return;
    if (cur) {
      const s = arc.get(cur.id).snap, m = me(s);
      thetaTo = m === 'b' ? Math.PI : 0;
      if (game.player?.dead) ctx.closeView();
    }
    if (k <= 0) return;
    theta += (thetaTo - theta) * Math.min(1, dt * 5);
    const pose = viewPose('w'), sn = Math.sin(theta), cs = Math.cos(theta);
    v.root.updateWorldMatrix(true, false);
    eye.set(pose.eye.z * sn, pose.eye.y, pose.eye.z * cs); tgt.set(pose.target.z * sn, pose.target.y, pose.target.z * cs);
    v.root.localToWorld(eye); v.root.localToWorld(tgt);
    mLook.lookAt(eye, tgt, UP); qTo.setFromRotationMatrix(mLook);
    const e = smooth(k);
    c.position.lerp(eye, e); c.quaternion.slerp(qTo, e);
    const fov = c.fov + (pose.fov - c.fov) * e;
    if (Math.abs(fov - c.fov) > 0.01) { c.fov = fov; c.updateProjectionMatrix(); }
  }

  return {
    create, update, get active() { return !!cur; }, get blend() { return k; }, get id() { return cur?.id || null; },
    picker: () => cur?.picker || null,
    dispose() { disposed = true; release(); document.getElementById('tfg-chess3d-css')?.remove(); },
  };
}
