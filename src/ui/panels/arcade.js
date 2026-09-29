// ARCADE board panel (chess + dama), CRT panel look like the other in-game panels. Everything comes from the host snapshot (game/arcade_core.js snapshot());
// the panel only picks moves (highlights legal targets from the decoded position) and sends them; the host validates.
//   createArcadePanel(ui, game, arc, tableId) -> { el, dispose() }     arc = { get(id) -> { snap, dec } | null, request(op, data), subscribe(fn) -> off, me() }
import { el } from '../../core/util.js';
import { t, tf } from '../../core/i18n.js';

const CSS = `
.overlay .menu-frame.arp{width:min(940px,96vw)}
.arp .arp-wrap{display:grid;grid-template-columns:auto minmax(0,1fr);gap:18px;align-items:start}
.arp .arp-board{--sq:min(60px,7.2vh);display:grid;grid-template-columns:repeat(8,var(--sq));grid-template-rows:repeat(8,var(--sq));border:3px solid #3a2412;box-shadow:0 0 0 2px rgba(0,0,0,.6),0 6px 18px rgba(0,0,0,.6);user-select:none}
.arp .sq{position:relative;width:var(--sq);height:var(--sq);display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:calc(var(--sq)*.78);line-height:1}
.arp .sq.l{background:#f0d9b5}.arp .sq.d{background:#b58863}
.arp.dama .sq.l{background:#d9c79a}.arp.dama .sq.d{background:#cbb887;box-shadow:inset 0 0 0 1px rgba(60,40,20,.5)}
.arp .sq.last{box-shadow:inset 0 0 0 100px rgba(255,220,80,.36)}
.arp .sq.sel{box-shadow:inset 0 0 0 100px rgba(90,200,255,.5)}
.arp .sq.chk{box-shadow:inset 0 0 0 100px rgba(255,60,60,.55)}
.arp .sq.tgt::after{content:'';position:absolute;width:32%;height:32%;border-radius:50%;background:rgba(30,150,60,.75)}
.arp .sq.tgt.cap::after{width:84%;height:84%;background:none;border:4px solid rgba(220,50,50,.8)}
.arp .sq.mine{cursor:pointer}
.arp .sq .co{position:absolute;left:2px;bottom:0;font:12px monospace;color:rgba(0,0,0,.45);letter-spacing:0}
.arp .pc{font-family:'DejaVu Sans','Segoe UI Symbol','Noto Sans Symbols 2',serif;text-shadow:none;pointer-events:none}
.arp .pc.w{color:#fff;-webkit-text-stroke:1.3px #1a1208;paint-order:stroke fill}
.arp .pc.b{color:#17110b;-webkit-text-stroke:1px #efe3c8;paint-order:stroke fill}
.arp .dm{width:76%;height:76%;border-radius:50%;pointer-events:none;box-shadow:0 2px 3px rgba(0,0,0,.55),inset 0 -4px 6px rgba(0,0,0,.28);position:relative}
.arp .dm.w{background:radial-gradient(circle at 35% 30%,#fff,#d9cfae 70%)}.arp .dm.b{background:radial-gradient(circle at 35% 30%,#5a4a3a,#1c140d 70%)}
.arp .dm.k::after{content:'';position:absolute;inset:22%;border-radius:50%;border:3px double #e6b422}
.arp .arp-side{display:flex;flex-direction:column;gap:9px;min-width:0}
.arp .arp-stat{font-size:25px;line-height:1.05;color:var(--ph-hi)}
.arp .arp-stat.bad{color:#ff7a5a}.arp .arp-stat.good{color:#8dff9d}
.arp .arp-seat{display:flex;align-items:center;gap:8px;border:1px solid var(--ph-line);background:rgba(0,0,0,.35);padding:4px 8px;font-size:21px}
.arp .arp-seat .dot{width:14px;height:14px;border-radius:50%;border:2px solid #000;flex:none}
.arp .arp-seat .dot.w{background:#f3ead6}.arp .arp-seat .dot.b{background:#2a1d16;border-color:#efe3c8}
.arp .arp-seat b{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:normal}
.arp .arp-seat.turn{border-color:var(--ph-hi);box-shadow:0 0 10px var(--ph-glow)}
.arp .arp-acts{display:flex;flex-wrap:wrap;gap:6px}
.arp .arp-log{border:1px solid var(--ph-line);background:rgba(0,0,0,.3);height:clamp(90px,17vh,180px);overflow:auto;padding:4px 8px;font-size:19px;line-height:1.15;color:var(--ph-dim);display:grid;grid-template-columns:1fr 1fr;align-content:start;gap:0 10px;scrollbar-width:thin}
.arp .arp-note{font-size:17px;color:var(--ph-dim);line-height:1.1}
.arp .arp-promo{position:absolute;inset:0;background:rgba(0,0,0,.62);display:flex;align-items:center;justify-content:center;gap:10px;z-index:3}
.arp .arp-promo .sq{background:#f0d9b5;border:2px solid #3a2412;width:calc(var(--sq)*1.2);height:calc(var(--sq)*1.2)}
.arp .arp-boardbox{position:relative}
@media (max-width:820px){.arp .arp-wrap{grid-template-columns:1fr}}
`;
let cssDone = false;
function ensureCss() {
  if (cssDone && document.getElementById('tfg-arcade-css')) return;
  const s = document.createElement('style'); s.id = 'tfg-arcade-css'; s.textContent = CSS; document.head.appendChild(s); cssDone = true;
}
const GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const TEXT = '︎';   // force text presentation (U+265F otherwise renders as an emoji on some platforms)
const FILES = 'abcdefgh';

export function tableTitle(kind) { return kind === 'draughts' ? t('DAMA TABLE') : t('CHESS TABLE'); }

export function createArcadePanel(ui, game, arc, tableId) {
  ensureCss();
  const wrap = ui.panel('arp');
  const head = ui.panelHead(tableTitle('chess'), ' ');
  const sub = head.querySelector('.cp-sub');
  const body = el('div', { class: 'cp-body' });
  const boardBox = el('div', { class: 'arp-boardbox' }), boardEl = el('div', { class: 'arp-board' });
  boardBox.appendChild(boardEl);
  const side = el('div', { class: 'arp-side' });
  body.appendChild(el('div', { class: 'arp-wrap' }, boardBox, side));
  wrap.append(head, body, ui.panelFoot([['LMB', t('PICK A PIECE, THEN A SQUARE')]]));
  let sel = -1, prefix = [], promo = null, lastVer = -1, off = null;

  const nameOf = (id) => game.playerName?.(id) || t('Employee');
  const seatName = (c, s) => (s.seats[c] ? nameOf(s.seats[c]) + (s.seats[c] === game.selfId ? ` (${t('you')})` : '') : s.ai[c] ? (s.ai[c] === 1 ? t('Computer (easy)') : t('Computer (normal)')) : t('Empty'));
  const sideName = (c) => (c === 'w' ? t('White') : t('Black'));

  function statusLine(s, d) {
    if (s.over) {
      const w = s.over.winner, why = s.over.reason;
      if (w === 'd') return { txt: `${t('Draw')}: ${why === 'stalemate' ? t('stalemate') : why === 'insufficient' ? t('insufficient material') : why === 'fifty' ? t('fifty-move rule') : why === 'repetition' ? t('threefold repetition') : why === 'kings' ? t('king against king') : t('no progress')}`, cls: '' };
      const how = why === 'mate' ? t('checkmate') : why === 'resign' ? t('resignation') : t('no legal moves');
      return { txt: `${tf('{side} wins', { side: sideName(w) })} - ${how}`, cls: s.seats[w] === game.selfId ? 'good' : '' };
    }
    const turn = d.st.turn;
    const base = tf('{side} to move', { side: sideName(turn) });
    return { txt: d.check ? `${base} - ${t('CHECK!')}` : base, cls: d.check ? 'bad' : '' };
  }

  function myColor(s) { return s.seats.w === game.selfId ? 'w' : s.seats.b === game.selfId ? 'b' : null; }
  function candidates(s, d) {
    const me = myColor(s);
    if (!me || s.over || d.st.turn !== me) return [];
    return d.moves;
  }
  const kindDraughts = (s) => s.kind === 'draughts';
  const movesFrom = (s, d, from) => candidates(s, d).filter((m) => m.f === from);
  const targetsOf = (s, d) => {
    if (sel < 0) return new Map();
    const ms = movesFrom(s, d, sel), out = new Map();
    if (kindDraughts(s)) {
      for (const m of ms) if (m.path.length > prefix.length && prefix.every((q, i) => m.path[i] === q)) out.set(m.path[prefix.length], m.caps.length ? 'cap' : '');
    } else for (const m of ms) out.set(m.t, m.cap ? 'cap' : '');
    return out;
  };

  function click(sq) {
    const e = arc.get(tableId); if (!e) return;
    const { snap: s, dec: d } = e;
    if (promo) return;
    const me = myColor(s);
    if (!me || s.over) return;
    const tg = targetsOf(s, d);
    if (sel >= 0 && tg.has(sq)) {
      if (kindDraughts(s)) {
        prefix.push(sq);
        const full = movesFrom(s, d, sel).filter((m) => m.path.length === prefix.length && prefix.every((q, i) => m.path[i] === q));
        const longer = movesFrom(s, d, sel).some((m) => m.path.length > prefix.length && prefix.every((q, i) => m.path[i] === q));
        if (full.length && !longer) { arc.request('move', { id: tableId, m: [sel, ...prefix] }); sel = -1; prefix = []; }
        render();
      } else {
        const opts = movesFrom(s, d, sel).filter((m) => m.t === sq);
        if (opts.length > 1 && opts[0].p) { promo = { f: sel, t: sq }; render(); return; }
        arc.request('move', { id: tableId, m: [sel, sq] }); sel = -1;
        render();
      }
      return;
    }
    const mine = candidates(s, d).some((m) => m.f === sq);
    if (mine) { sel = sq === sel && !prefix.length ? -1 : sq; prefix = []; } else { sel = -1; prefix = []; }
    render();
  }

  function pieceEl(s, ch) {
    if (!ch || ch === '.') return null;
    if (kindDraughts(s)) return el('div', { class: `dm ${ch.toLowerCase()}${ch === ch.toUpperCase() ? ' k' : ''}` });
    return el('span', { class: 'pc ' + (ch === ch.toUpperCase() ? 'w' : 'b') }, GLYPH[ch.toLowerCase()] + TEXT);
  }
  function cells(s) {
    const out = new Array(64).fill('');
    if (kindDraughts(s)) { const bs = s.pos.split('|')[0]; for (let i = 0; i < 64; i++) out[i] = bs[i] === '.' ? '' : bs[i]; }
    else {
      const rows = s.pos.split(' ')[0].split('/');
      for (let i = 0; i < 8; i++) { let f = 0; for (const ch of rows[i]) { if (ch >= '1' && ch <= '8') f += +ch; else out[(7 - i) * 8 + f++] = ch; } }
    }
    return out;
  }

  function render() {
    const e = arc.get(tableId);
    if (!e) return;
    const { snap: s, dec: d } = e;
    if (s.ver !== lastVer) { lastVer = s.ver; sel = -1; prefix = []; promo = null; }
    head.querySelector('.menu-title').textContent = tableTitle(s.kind);
    wrap.classList.toggle('dama', kindDraughts(s));
    const me = myColor(s), flip = me === 'b', tg = targetsOf(s, d), bd = cells(s);
    sub.textContent = me ? `${t('You play')} ${sideName(me)}` : t('Spectating');
    boardEl.innerHTML = '';
    const chk = !kindDraughts(s) && d.check ? bd.findIndex((c) => c === (d.st.turn === 'w' ? 'K' : 'k')) : -1;
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
      const r = flip ? i : 7 - i, f = flip ? 7 - j : j, sq = r * 8 + f;
      const cls = ['sq', ((f + r) & 1) === 0 ? 'd' : 'l'];
      if (s.last && (s.last[0] === sq || s.last[1] === sq)) cls.push('last');
      if (sq === sel) cls.push('sel');
      if (sq === chk) cls.push('chk');
      if (tg.has(sq)) cls.push('tgt', tg.get(sq));
      const node = el('div', { class: cls.filter(Boolean).join(' '), 'data-sq': sq });
      const p = pieceEl(s, bd[sq]); if (p) node.appendChild(p);
      if (j === 0) node.appendChild(el('span', { class: 'co' }, String(r + 1)));
      if (i === 7) node.appendChild(el('span', { class: 'co', style: { left: 'auto', right: '3px' } }, FILES[f]));
      node.addEventListener('click', () => click(sq));
      boardEl.appendChild(node);
    }
    boardBox.querySelector('.arp-promo')?.remove();
    if (promo) {
      const bar = el('div', { class: 'arp-promo' });
      const white = d.st.turn === 'w';
      for (const pc of ['q', 'r', 'b', 'n']) {
        const b = el('div', { class: 'sq' }, el('span', { class: 'pc ' + (white ? 'w' : 'b') }, GLYPH[pc] + TEXT));
        b.addEventListener('click', () => { arc.request('move', { id: tableId, m: [promo.f, promo.t, pc] }); promo = null; sel = -1; render(); });
        bar.appendChild(b);
      }
      boardBox.appendChild(bar);
    }
    // ---- side column
    side.innerHTML = '';
    const st = statusLine(s, d);
    side.appendChild(el('div', { class: 'arp-stat ' + st.cls }, st.txt));
    for (const c of ['w', 'b']) {
      const row = el('div', { class: 'arp-seat' + (!s.over && d.st.turn === c ? ' turn' : '') }, el('span', { class: 'dot ' + c }), el('b', {}, `${sideName(c)}: ${seatName(c, s)}`));
      const free = !s.seats[c], playing0 = s.ply > 0 && !s.over;
      if (free && (!me || !playing0) && !(s.ai[c] && playing0)) row.appendChild(ui.button(t('Sit'), () => arc.request('sit', { id: tableId, c }), 'small'));
      if (free && me && !playing0) {
        if (s.ai[c] !== 1) row.appendChild(ui.button(t('AI easy'), () => arc.request('ai', { id: tableId, c, lv: 1 }), 'small'));
        if (s.ai[c] !== 2) row.appendChild(ui.button(t('AI normal'), () => arc.request('ai', { id: tableId, c, lv: 2 }), 'small'));
        if (s.ai[c]) row.appendChild(ui.button(t('No AI'), () => arc.request('ai', { id: tableId, c, lv: 0 }), 'small'));
      }
      side.appendChild(row);
    }
    const acts = el('div', { class: 'arp-acts' });
    const playing = s.ply > 0 && !s.over;
    if (me) {
      if (!playing) {
        acts.appendChild(ui.button(kindDraughts(s) ? t('Switch to CHESS') : t('Switch to DAMA'), () => arc.request('kind', { id: tableId, k: kindDraughts(s) ? 'chess' : 'draughts' }), 'small'));
        if (s.over || s.ply > 0) acts.appendChild(ui.button(t('New game'), () => arc.request('new', { id: tableId }), 'small primary'));
      } else acts.appendChild(ui.button(t('Resign'), () => arc.request('resign', { id: tableId }), 'small danger'));
      acts.appendChild(ui.button(t('Stand up'), () => arc.request('stand', { id: tableId }), 'small'));
    }
    side.appendChild(acts);
    if (!me) side.appendChild(el('div', { class: 'arp-note' }, t('Take a seat to play, or watch. Everyone at the table sees the same board.')));
    else if (!playing && !s.over && (!(s.seats.w || s.ai.w) || !(s.seats.b || s.ai.b))) side.appendChild(el('div', { class: 'arp-note' }, t('Waiting for an opponent. Invite a friend, or pick a computer opponent for the empty seat.')));
    if (kindDraughts(s)) side.appendChild(el('div', { class: 'arp-note' }, t('Dama: men step forward or sideways, kings fly. Captures are mandatory and the biggest capture must be taken.')));
    const log = el('div', { class: 'arp-log' });
    for (const l of s.log.slice(-24)) log.appendChild(el('span', {}, l));
    side.appendChild(log);
    log.scrollTop = 1e6;
  }
  off = arc.subscribe((id) => { if (id === tableId) render(); });
  // Re-render also on language change: cheap and rare
  render();
  return { el: wrap, dispose() { off?.(); }, refresh: render };
}
