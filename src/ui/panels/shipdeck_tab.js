// UPPER DECK tab of the shipyard panel (wave 5 shipdeck): a simple side cross-section of the ship (deck, rooms, dome highlighted, the next upgrade dashed),
// the three tiers with their costs, the upgrade buttons and the room picker. All rules come from game/shipyard_core.js; the host re-checks every action.
import { el, escapeHtml } from '../../core/util.js';
import { t, tf } from '../../core/i18n.js';
import * as Y from '../../game/shipyard_core.js';
import * as L from '../../world/shiplayout.js';

const RC = { bunk: '#5b86ff', store: '#ffb433', turret: '#40ff80', lounge: '#ff6f99' };
const fmt = (n) => Math.round(n).toLocaleString('en-US');

/** SVG string: side view (x = nose -> tail, y up). tier = built, next = tier the upgrade would add (dashed) */
export function crossSection(tier, rooms, next) {
  const X0 = -9, Y1 = 9, K = 28, px = (x) => ((x - X0) * K).toFixed(1), py = (y) => ((Y1 - y) * K).toFixed(1), W = (17.6 * K).toFixed(0), H = (11 * K).toFixed(0);
  const D = L.DECK, o = [];
  const rect = (x0, y0, x1, y1, fill, extra = '') => o.push(`<rect x="${px(x0)}" y="${py(y1)}" width="${((x1 - x0) * K).toFixed(1)}" height="${((y1 - y0) * K).toFixed(1)}" fill="${fill}" ${extra}/>`);
  const ghost = 'fill="none" stroke="#7dff7d" stroke-width="1.6" stroke-dasharray="5 4"';
  // hull + the four rooms of the core
  o.push(`<ellipse cx="${px(-7)}" cy="${py(1.5)}" rx="${(1.8 * K).toFixed(0)}" ry="${(1.6 * K).toFixed(0)}" fill="#3a3d42"/>`);
  rect(-7, -0.6, 7, 3.85, '#3d4046');
  for (const [a, b, c, n] of [[-7, -4, '#2d7fd6', 'COCKPIT'], [-4, 3.2, '#3aa88a', 'HUB'], [3.2, 7, '#c8823a', 'ENGINE / CARGO']]) { rect(a + 0.05, 0.05, b - 0.05, 3.35, c, 'opacity=".38"'); o.push(`<text x="${px((a + b) / 2)}" y="${py(0.5)}" fill="#e8e0cc" font-size="11" text-anchor="middle" opacity=".8">${escapeHtml(t(n))}</text>`); }
  rect(-5, -1.7, -3, -0.6, '#25282c'); rect(4, -1.7, 6, -0.6, '#25282c');                                  // thrusters / gear hint
  rect(4.15, 3.85, 6.95, 4.05, '#5a5f66', 'opacity=".7"'); o.push(`<text x="${px(5.55)}" y="${py(4.4)}" fill="#9aa39a" font-size="10" text-anchor="middle">${escapeHtml(t('ROOF'))}</text>`);
  rect(-6.6, 3.85, -0.6, 4.05, '#5a5f66', 'opacity=".5"');
  // the stair well: housing + zig-zag of the two flights
  const S = L.deckStairs(), W0 = L.WELL, built = tier >= 1, mine = built ? 'fill="#1b2a20" stroke="#7dff7d" stroke-width="1.4"' : 'fill="none" stroke="#7dff7d" stroke-width="1.2" stroke-dasharray="4 3"';
  o.push(`<rect x="${px(W0.x0 - 0.1)}" y="${py(built ? D.y : 3.4)}" width="${((W0.x1 - W0.x0 + 0.2) * K).toFixed(1)}" height="${(((built ? D.y : 3.4) - 0) * K).toFixed(1)}" ${next === 1 ? ghost : mine} opacity="${built || next === 1 ? 1 : 0.6}"/>`);
  o.push(`<polyline points="${px(W0.x0 + 0.1)},${py(0)} ${px(W0.x1 - 0.1)},${py(S.platform.y)} ${px(W0.x0 + 0.1)},${py(D.y)}" fill="none" stroke="${built ? '#7dff7d' : '#556'}" stroke-width="2"/>`);
  if (!built && next !== 1) o.push(`<rect x="${px(W0.x0)}" y="${py(3.85)}" width="${((W0.x1 - W0.x0) * K).toFixed(1)}" height="${(0.45 * K).toFixed(1)}" fill="#2a2c30"/>`);
  // deck floor
  const floor = (fill, stroke) => rect(D.x0, D.y - D.slab, D.x1, D.y, fill, stroke);
  if (built) floor('#8a9099'); else if (next === 1) floor('none', ghost);
  // rails / cabin / rooms / dome
  const railY = D.y + D.rail;
  if (tier === 1) { o.push(`<polyline points="${px(D.x0)},${py(D.y)} ${px(D.x0)},${py(railY)} ${px(D.x1)},${py(railY)} ${px(D.x1)},${py(D.y)}" fill="none" stroke="#f2c740" stroke-width="2"/>`); o.push(`<line x1="${px(D.x1 - 0.5)}" y1="${py(D.y)}" x2="${px(D.x1 - 0.5)}" y2="${py(D.y + 2.6)}" stroke="#ff5040" stroke-width="2"/>`); }
  const cab = (cls) => rect(D.x0, D.y, D.x1, D.y + D.h, cls === 'now' ? 'rgba(90,170,200,.16)' : 'none', cls === 'now' ? 'stroke="#8fd8f0" stroke-width="1.6"' : ghost);
  if (tier >= 2) cab('now'); else if (next === 2) cab('next');
  if (tier >= 2 || next === 2) for (let i = 0; i < 4; i++) {
    const s = L.DECK_SLOTS[i], active = i < L.deckSlots(tier), r = rooms[i], nextSlot = !active && i < L.deckSlots(Math.max(next || 0, tier));
    const a = i % 2 ? 2.45 : 0.0, x0 = D.x0 + 0.15 + (i % 2) * 2.15, w = 1.95, h = 1.2;
    if (active && r) rect(x0, D.y + 0.05 + (i < 2 ? 0 : 0), x0 + w, D.y + 0.05 + h * (L.DECK_ROOM_H[r] / 1.9 + 0.35), RC[r], 'opacity=".85"');
    else if (active) rect(x0, D.y + 0.05, x0 + w, D.y + 0.45, 'none', 'stroke="#c8b070" stroke-dasharray="3 3"');
    else if (nextSlot) rect(x0, D.y + 0.05, x0 + w, D.y + 0.45, 'none', ghost);
    void s; void a;
    if (i < 2 || tier >= 3 || next === 3) o.push(`<text x="${px(x0 + w / 2)}" y="${py(D.y + 0.25 - (i < 2 ? 0 : 0))}" fill="#0b0d10" font-size="10" text-anchor="middle">${active && r ? escapeHtml(t(Y.DECK_INFO[r].name)) : ''}</text>`);
  }
  const dome = (cls) => o.push(`<path d="M ${px(D.x0)} ${py(D.y + D.h)} A ${((D.x1 - D.x0) / 2 * K).toFixed(1)} ${(1.35 * K).toFixed(1)} 0 0 1 ${px(D.x1)} ${py(D.y + D.h)}" ${cls === 'now' ? 'fill="rgba(120,210,255,.22)" stroke="#8fe8ff" stroke-width="2"' : ghost}/>`);
  if (tier >= 3) { dome('now'); o.push(`<circle cx="${px(L.DECK_MOUNT.x)}" cy="${py(D.y + 0.1)}" r="6" fill="#ffb030"/>`); } else if (next === 3) { dome('next'); o.push(`<circle cx="${px(L.DECK_MOUNT.x)}" cy="${py(D.y + 0.1)}" r="6" ${ghost}/>`); }
  o.push(`<text x="8" y="${(11 * K - 8).toFixed(0)}" fill="#9aa39a" font-size="11">${escapeHtml(t('nose'))} &lt;--  --&gt; ${escapeHtml(t('tail'))}</text>`);
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px;background:#05070a;border:1px solid var(--ph-line)" font-family="VT323,monospace">${o.join('')}</svg>`;
}

export function renderDeckTab({ main, ui, sy, S, cr, sfx }) {
  main.innerHTML = '';
  const s = S(), dk = s.deck || Y.blankDeck(), q = Y.deckQuote(s), atC = sy.atConsole();
  const left = el('div', { class: 'sy-det' }), right = el('div', { class: 'sy-det' });
  main.append(left, right);
  main.style.gridTemplateColumns = 'minmax(0,1.15fr) minmax(0,1fr)';
  const head = el('div', { class: 'sy-box', style: { '--tc': '#8fe8ff' } });
  head.append(el('div', { class: 'sy-name' }, t('UPPER DECK')), el('div', { class: 'sy-sub' }, dk.t ? `Mk ${Y.ROMAN[dk.t]} · ${t(['', 'Bare deck', 'Cabin + rooms', 'Glass dome'][dk.t])}` : t('Not installed')), el('div', { class: 'sy-sub' }, t('Stair in the hub, hatch in the ceiling')));
  left.append(head, el('div', { class: 'sy-box' }, el('div', { class: 'sy-sub' }, t('Ship cross-section')), el('div', { html: crossSection(dk.t, dk.rooms, q.maxed ? 0 : q.to) })));
  // tiers
  const desc = ['', 'A deck on the roof, reached by the stair in the hub and the ceiling hatch. Open platform with rails.', 'A glass-banded cabin and two rooms of your choice.', 'Glass observation dome, four rooms and one extra roof turret slot (+1 ship power).'];
  for (let n = 1; n <= 3; n++) {
    const d = el('div', { class: 'sy-tier' + (n === dk.t ? ' now' : n === dk.t + 1 ? ' next' : ''), style: { '--tc': '#8fe8ff' } });
    d.append(el('h4', {}, `Mk ${Y.ROMAN[n]} · ${t(['', 'Bare deck', 'Cabin + rooms', 'Glass dome'][n])}${n <= dk.t ? ' ✓' : ''}`), el('div', { class: 'sy-note' }, t(desc[n])));
    if (n === dk.t + 1) {
      const p = q.parts, parts = Y.PART_KEYS.filter((k) => p[k]).map((k) => `<span class="${(s.parts[k] || 0) >= p[k] ? 'ok' : 'bad'}">${s.parts[k] || 0}/${p[k]} ${escapeHtml(t(Y.PARTS[k].name))}</span>`).join(', ');
      d.insertAdjacentHTML('beforeend', `<div class="sy-cost">${escapeHtml(t('Cost'))}: <b class="${cr() >= q.cr ? '' : 'bad'}">▮${fmt(q.cr)}</b> · ${escapeHtml(t('or free with parts'))}: ${parts}</div>`);
    }
    right.append(d);
  }
  const acts = el('div', { class: 'sy-box' }), row = el('div', { class: 'sy-acts' });
  if (q.maxed) row.append(el('div', { class: 'ok' }, t('Upper Deck is maxed (Mk III).')));
  else {
    const canC = cr() >= q.cr, canP = Y.PART_KEYS.every((k) => (s.parts[k] || 0) >= (q.parts[k] || 0)) && atC;
    row.append(ui.button(`${t(q.install ? 'BUILD DECK' : 'UPGRADE')} ▮${fmt(q.cr)}`, () => { if (canC) sy.req('deckup', { via: 'credits' }); else { ui.sfx('ui_error'); ui.toast(t('Not enough credits.'), 'bad'); } }, 'primary' + (canC ? '' : ' disabled')));
    row.append(ui.button(`${t('UPGRADE')} (${t('Ship parts')})`, () => { if (canP) sy.req('deckup', { via: 'parts' }); else { ui.sfx('ui_error'); ui.toast(atC ? t('Missing ship parts.') : t('Stand at the Frame Console to use ship parts.'), 'bad'); } }, canP ? '' : 'disabled'));
  }
  acts.append(row);
  if (!atC) acts.append(el('div', { class: 'sy-note' }, t('Stand at the Frame Console to use ship parts.')));
  right.append(acts);
  // rooms
  const rooms = el('div', { class: 'sy-box' });
  rooms.append(el('div', { class: 'sy-sub' }, `${t('Deck room ▮{n}').replace('{n}', Y.DECK_ROOM_CR)}`));
  if (dk.t < 2) rooms.append(el('div', { class: 'sy-note' }, t('Build the Upper Deck first (Mk II unlocks two rooms).')));
  for (let i = 0; i < L.deckSlots(dk.t); i++) {
    rooms.append(el('div', { class: 'sy-sub' }, `${t('Slot')} ${i + 1}: ${dk.rooms[i] ? t(Y.DECK_INFO[dk.rooms[i]].name) : t('Empty')}`));
    const b = el('div', { class: 'sy-btns' });
    for (const r of L.DECK_ROOMS) b.append(ui.button(t(Y.DECK_INFO[r].name), () => { if (cr() >= Y.DECK_ROOM_CR) { sfx('ui_click'); sy.req('deckroom', { slot: i, room: r }); } else { ui.sfx('ui_error'); ui.toast(t('Not enough credits.'), 'bad'); } }, 'small' + (dk.rooms[i] === r ? ' primary' : '')));
    b.append(ui.button(t('Clear'), () => sy.req('deckroom', { slot: i, room: null }), 'small'));
    rooms.append(b);
  }
  const eff = dk.rooms.filter(Boolean).map((r) => `<li>${escapeHtml(t(Y.DECK_INFO[r].name))}: ${escapeHtml(t(Y.DECK_INFO[r].tip))}</li>`).join('');
  if (eff) rooms.insertAdjacentHTML('beforeend', `<ul class="sy-note" style="margin:6px 0 0 14px">${eff}</ul>`);
  right.append(rooms);
  void tf;
}
