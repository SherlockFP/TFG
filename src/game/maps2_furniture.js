// [finish] MAPS2 STATEFUL FURNITURE (wave 3): the drawer cabinets, PCs, radios and phones placed by world/rooms2.js are now searchable ONCE per day.
//   drawer  ~1/3 loose scrap, sometimes a note or junk    pc     a log entry, sometimes a wallet file (+credits)
//   radio   a weak signal that points at the nearest challenge / story room, or static     phone  a voicemail, rarely a scream that draws creatures
// The content is a deterministic function of (layout seed, furniture id) so every peer agrees; the host applies the effects (scrap, credits,
// noise) and remembers used pieces in run.m2s.used for late joiners. Vending machines / fridges are handled by the food module (food.js).
import * as THREE from 'three';
import { t, tf } from '../core/i18n.js';
import * as R from './maps2_rules.js';
import { DRAWER_NOTES, PC_LOGS, RADIO_STATIC, VOICEMAILS, CH_NAMES } from './maps2_text2.js';

const KINDS = ['drawer', 'pc', 'radio', 'phone'];
const LABEL = { drawer: 'Open the drawer [E]', pc: 'Use the PC [E]', radio: 'Tune the radio [E]', phone: 'Answer the phone [E]' };
const TITLE = { drawer: 'A dusty note', pc: 'The PC hums', radio: 'Radio', phone: 'Voicemail' };

export function installFurniture(game, W) {
  const seedOf = () => (W.F?.layout?.seed ?? 1) >>> 0;
  const rnd = (seed, id) => R.hash01(seed, id);
  const pick = (arr, n) => arr[n % arr.length];
  const read = (title, sub, lines) => {
    try { game.openMinigame('m2_note', { title: t(title), sub: t(sub), lines: lines.map((l, i) => t(l) + (i < lines.length - 1 ? '\n' : '')), noEase: true }, () => {}); } catch { game.ui?.toast?.(t(lines[0]), 'info'); }
  };
  const dirWord = (dx, dz) => (Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'east' : 'west') : (dz > 0 ? 'south' : 'north'));

  // ------------------------------------------------------------------------------------------------ host: use
  W.handle('use', (d, from, pl) => {
    const s = W.byKey.get(String(d.id || ''));
    if (!s || !KINDS.includes(s.k) || W.hs.used[s.id] || !W.nearSpot(pl, s, 4)) return;
    W.hs.used[s.id] = 1;
    W.persist();
    const r = R.furnitureRoll(seedOf(), s.id, s.k, rnd);
    const at = { x: s.x, y: s.y - 0.2, z: s.z };
    const out = { k: 'use', id: s.id, what: r.what, n: r.n };
    if (r.what === 'loot') W.loot(at, 1, 'common');
    else if (r.what === 'credits') W.credits(r.n);
    else if (r.what === 'noise') W.noise(s.x, s.y, s.z, 4.5);
    else if (r.what === 'signal') {
      // the nearest interesting room (challenge first, else story) from the radio
      const c = W.challenge();
      let target = null;
      if (c) { const rr = W.roomOf(c.room); if (rr) target = { x: rr.cx, z: rr.cz, name: CH_NAMES[c.id] }; }
      if (!target) {
        let best = 1e9;
        for (const rr of W.F?.m2?.rooms || []) { if (rr.kind !== 'story') continue; const room = W.roomOf(rr.room); const dd = Math.hypot(room.cx - s.x, room.cz - s.z); if (dd < best) { best = dd; target = { x: room.cx, z: room.cz, name: CH_NAMES[rr.id] }; } }
      }
      if (target) { out.dist = Math.round(Math.hypot(target.x - s.x, target.z - s.z)); out.dir = dirWord(target.x - s.x, target.z - s.z); out.name = target.name; } else out.what = 'static';
    }
    // everybody marks it used; the user gets the content
    W.send({ k: 'used', id: s.id });
    try { game.net.sendTo(from, 'm2s', out); } catch { /* peer gone */ }
  });

  // ------------------------------------------------------------------------------------------------ client: results
  W.on('used', (d) => { W.hs.used[d.id] = 1; });
  W.on('use', (d) => {
    const s = W.byKey.get(d.id);
    if (!s) return;
    const at = new THREE.Vector3(s.x, s.y, s.z);
    switch (d.what) {
      case 'loot': game.ui?.toast(t('You find some scrap.'), 'good'); try { game.audio?.at?.('cloth_rustle', at, 0.6, { refDistance: 4 }); } catch { /* audio */ } break;
      case 'note': read(TITLE.drawer, '', [pick(DRAWER_NOTES, d.n || 0)]); break;
      case 'junk': game.ui?.toast(t('Just junk.'), 'info'); break;
      case 'empty': game.ui?.toast(t('Empty.'), 'info'); break;
      case 'credits': game.ui?.toast(tf('Found a wallet file: +{n} credits.', { n: d.n }), 'good'); break;
      case 'log': read(TITLE.pc, '', [pick(PC_LOGS, d.n || 0)]); break;
      case 'signal': game.ui?.toast(tf('A weak signal points {d} m {dir}: {what}.', { d: d.dist, dir: t(d.dir), what: t(d.name) }), 'good'); break;
      case 'static': read(TITLE.radio, '', [pick(RADIO_STATIC, d.n || 0)]); break;
      case 'voicemail': read(TITLE.phone, '', [pick(VOICEMAILS, d.n || 0)]); break;
      case 'noise': game.ui?.toast(t('The phone screams a dial tone. Something heard that.'), 'bad'); try { game.audio?.at?.('ship_alarm', at, 1, { refDistance: 8 }); } catch { /* audio */ } break;
      default: break;
    }
  });

  // ------------------------------------------------------------------------------------------------ interactables
  W.interFns.push((list, p) => {
    const V = THREE.Vector3;
    for (const s of W.spots) {
      if (!KINDS.includes(s.k)) continue;
      if ((p.pos.x - s.x) ** 2 + (p.pos.z - s.z) ** 2 > 16 || Math.abs(p.pos.y - s.y) > 3) continue;
      const used = !!W.hs.used[s.id];
      list.push({ pos: new V(s.x, s.y, s.z), r: 0.5, reach: 2.2, label: () => (W.hs.used[s.id] ? t('Already searched.') : t(LABEL[s.k])), action: () => { if (!used && !W.hs.used[s.id]) W.request('use', { id: s.id }); else game.ui?.toast(t('Already searched.'), 'info'); } });
    }
  });
  return { dispose() {} };
}
