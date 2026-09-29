// TROPHY WALL (module 'cycle3', part 'trophy'). Every boss kill (Foreman / Legacy Bot outdoors, the Sector Core bosses, the gate / raid / keystone bosses), every
// raid + keystone completion and the hidden gate mount a trophy on the ship's +z wall (x -5.4 .. 0.3, free of props). Interact = a card with the kill date, crew and time.
// State: run.c3.trophies (host writes, generic run sync = the whole crew sees the same wall; late joiners too) + the host's profile.cycle3.trophies (survives 'fired' / a new
// run); every crew member also stores the records of the fights they were part of (K.saveToProfile). Net: 'c3s' {k:'trophy', id, rec, first} (host -> all).
import * as THREE from 'three';
import { t, tf, getLang } from '../core/i18n.js';
import { insideShip } from '../world/ship.js';
import { DOSSIERS } from './cycle3_lore.js';
import { RAID_DIFFS } from './cycle_plan.js';
import { wrapMethod } from './dailyEvents.js';

const WALL_Z = 3.44, COL0 = -4.95, COLD = 0.98, ROW_Y = [2.2, 1.12], COLS = 6;
const COLORS = { foreman: 0xffb02a, loadbalancer: 0x38e0ff, middlemanager: 0xc8c8d8, hydra: 0x6cff5a, surgeon: 0x9affc8, host: 0xd06aff, excavator: 0xd8a45a, lobbymanager: 0xffe64a, legacybot: 0xff5a4a, raid: 0xff3ad0, keystone: 0xffd23f, hidden: 0xff4fd0 };
const CSS = `
.c3p{width:min(560px,94vw);background:linear-gradient(180deg,rgba(24,16,8,.97),rgba(10,7,4,.97));border:1px solid var(--amber,#ff8a3d);box-shadow:0 0 36px rgba(255,138,61,.22);padding:14px 20px 16px;font-family:var(--font,'VT323',monospace);color:#ffe9cf;position:relative}
.c3p h2{margin:0;font-family:var(--font2,monospace);font-size:18px;letter-spacing:3px;color:var(--amber,#ff8a3d)}
.c3p .sub{font-size:17px;opacity:.7;letter-spacing:2px;margin:2px 0 10px}
.c3p .row{display:grid;grid-template-columns:130px 1fr;gap:8px;font-size:20px;line-height:1.25;padding:3px 0;border-bottom:1px dotted rgba(255,138,61,.28)}
.c3p .row b{font-weight:normal;opacity:.65}
.c3p .lore{margin-top:10px;font-size:19px;line-height:1.25;opacity:.9}
.c3p .lore i{display:block;font-style:normal;color:var(--amber,#ff8a3d);margin-top:6px}
.c3p .foot{display:flex;justify-content:flex-end;margin-top:12px}
.c3p .x{cursor:pointer;background:none;border:1px solid var(--amber,#ff8a3d);color:var(--amber,#ff8a3d);font-family:inherit;font-size:20px;padding:0 16px}
`;
let cssDone = false;
function ensureCss() {
  if (cssDone || typeof document === 'undefined') return;
  cssDone = true;
  const s = document.createElement('style'); s.id = 'tfg-c3-css'; s.textContent = CSS; document.head.appendChild(s);
}

const mat = (color, o = {}) => new THREE.MeshLambertMaterial({ color, ...o });
const glow = (color) => new THREE.MeshBasicMaterial({ color });
/** the emblem of a mount: a few primitives in the boss colour (dark grey when the trophy is not earned yet) */
function emblem(id, on) {
  const c = on ? COLORS[id] || 0xffd23f : 0x26262c, m = mat(c, on ? { emissive: c, emissiveIntensity: 0.25 } : {});
  const g = new THREE.Group();
  const add = (geo, pos, mm = m, rot) => { const x = new THREE.Mesh(geo, mm); x.position.set(...pos); if (rot) x.rotation.set(...rot); g.add(x); return x; };
  switch (id) {
    case 'foreman': add(new THREE.SphereGeometry(0.2, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), [0, -0.04, 0]); add(new THREE.CylinderGeometry(0.27, 0.27, 0.03, 12), [0, -0.05, 0]); break;
    case 'loadbalancer': for (let i = 0; i < 3; i++) { add(new THREE.BoxGeometry(0.42, 0.11, 0.1), [0, 0.13 - i * 0.14, 0]); add(new THREE.BoxGeometry(0.04, 0.04, 0.02), [0.15, 0.13 - i * 0.14, 0.06], on ? glow(0x40ff80) : m); } break;
    case 'middlemanager': add(new THREE.BoxGeometry(0.1, 0.1, 0.06), [0, 0.2, 0]); add(new THREE.ConeGeometry(0.11, 0.42, 4), [0, -0.05, 0], m, [Math.PI, 0, 0]); break;
    case 'hydra': for (let i = -1; i <= 1; i++) { add(new THREE.CylinderGeometry(0.03, 0.045, 0.3, 6), [i * 0.15, -0.06, 0], m, [0, 0, -i * 0.3]); add(new THREE.SphereGeometry(0.07, 8, 6), [i * 0.2, 0.11, 0]); } break;
    case 'surgeon': add(new THREE.BoxGeometry(0.36, 0.22, 0.05), [0, 0, 0]); add(new THREE.BoxGeometry(0.42, 0.02, 0.02), [0, 0.05, 0.03], glow(on ? 0xffffff : 0x333338)); add(new THREE.BoxGeometry(0.42, 0.02, 0.02), [0, -0.05, 0.03], glow(on ? 0xffffff : 0x333338)); break;
    case 'host': add(new THREE.CylinderGeometry(0.13, 0.15, 0.26, 12), [0, 0.06, 0]); add(new THREE.CylinderGeometry(0.28, 0.28, 0.03, 14), [0, -0.08, 0]); break;
    case 'excavator': add(new THREE.CylinderGeometry(0.025, 0.025, 0.5, 6), [0, -0.02, 0], m, [0, 0, 0.5]); add(new THREE.BoxGeometry(0.4, 0.06, 0.05), [-0.09, 0.18, 0], m, [0, 0, 0.5]); break;
    case 'lobbymanager': for (let i = -1; i <= 1; i++) add(new THREE.BoxGeometry(0.1, 0.42, 0.04), [i * 0.15, 0, 0]); break;
    case 'legacybot': add(new THREE.BoxGeometry(0.32, 0.26, 0.2), [0, 0, 0]); add(new THREE.BoxGeometry(0.05, 0.05, 0.02), [-0.07, 0.03, 0.11], glow(on ? 0xff2a1a : 0x333338)); add(new THREE.BoxGeometry(0.05, 0.05, 0.02), [0.07, 0.03, 0.11], glow(on ? 0xff2a1a : 0x333338)); add(new THREE.CylinderGeometry(0.01, 0.01, 0.16, 4), [0, 0.2, 0]); break;
    case 'raid': add(new THREE.OctahedronGeometry(0.2), [0, 0, 0]); add(new THREE.TorusGeometry(0.28, 0.02, 6, 20), [0, 0, 0], m, [1.1, 0.3, 0]); break;
    case 'keystone': add(new THREE.TorusGeometry(0.1, 0.035, 6, 14), [0, 0.15, 0]); add(new THREE.BoxGeometry(0.06, 0.34, 0.05), [0, -0.05, 0]); add(new THREE.BoxGeometry(0.14, 0.05, 0.05), [0.06, -0.16, 0]); add(new THREE.BoxGeometry(0.1, 0.05, 0.05), [0.04, -0.06, 0]); break;
    case 'hidden': add(new THREE.BoxGeometry(0.26, 0.26, 0.26), [0, 0, 0], m, [0.5, 0.6, 0]); add(new THREE.BoxGeometry(0.26, 0.26, 0.26), [0.06, 0.03, 0.03], on ? mat(0x40ffff, { transparent: true, opacity: 0.55 }) : m, [0.5, 0.6, 0]); break;
    default: add(new THREE.OctahedronGeometry(0.2), [0, 0, 0]);
  }
  return g;
}
function plate(text, sub, on) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 56;
  const x = cv.getContext('2d');
  x.fillStyle = on ? '#c8a040' : '#3a3a40'; x.fillRect(0, 0, 256, 56);
  x.fillStyle = on ? '#1a1208' : '#111116'; x.textAlign = 'center'; x.textBaseline = 'middle';
  let size = 24; x.font = `bold ${size}px monospace`;
  while (x.measureText(text).width > 240 && size > 11) { size--; x.font = `bold ${size}px monospace`; }
  x.fillText(text, 128, sub ? 20 : 28);
  if (sub) { x.font = 'bold 18px monospace'; x.fillText(sub, 128, 42); }
  const tex = new THREE.CanvasTexture(cv); tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.76, 0.166), new THREE.MeshBasicMaterial({ map: tex }));
  return m;
}

export function installTrophy(C3) {
  const { game, mods, K } = C3;
  const offs = [];
  let disposed = false, wall = null, wallSig = '', landAt = 0, panel = null;
  const seen = new Set();
  const myName = () => game.profile?.name || '';
  const map = () => game.run?.c3?.trophies || {};

  // ------------------------------------------------------------ records (host)
  function seed() {
    if (!C3.host()) return;
    const c = C3.ensure();
    if (!c) return;
    c.trophies = K.seedFromProfile(game.profile, c.trophies);
  }
  /** host: apply a kill / completion. evt: { id, src, t, sector, lvl, crew? } */
  function record(evt) {
    if (!C3.host() || !K.isTrophyId(evt?.id)) return null;
    const c = C3.ensure();
    if (!c) return null;
    const crew = evt.crew || C3.crewNames();
    const r = K.recordKill(c.trophies, { ...evt, at: Date.now(), crew, day: game.run.day | 0, sector: evt.sector ?? C3.qi() });
    if (!r.rec) return null;
    c.trophies = r.map;
    K.saveToProfile(game.profile, { [evt.id]: r.rec }, myName(), true);
    try { game.progress?.save?.(); } catch { /* ignore */ }
    C3.push();
    C3.send({ k: 'trophy', id: evt.id, rec: r.rec, first: r.first, src: evt.src || 'world' });
    try { mods.emit('tfg:trophy', { id: evt.id, first: r.first, rec: r.rec }, game); } catch { /* ignore */ }
    return r;
  }
  function onKilled(c) {
    const d = c?.def;
    if (!d || !d.boss || d.cyAux || c.type === 'keyholder' || !K.isTrophyId(c.type) || seen.has(c.id)) return;
    seen.add(c.id);
    const cur = game.cycle?.inst?.cur;
    record({ id: c.type, src: cur ? cur.kind : 'world', t: cur ? cur.elapsed : Math.max(0, game.time - landAt), sector: cur ? cur.sector : undefined });
  }
  // raid / keystone completions come through the cycle.js result hook
  function onResult(res) {
    if (!res?.success) return;
    if (res.kind === 'raid') record({ id: 'raid', src: 'raid', t: res.time || 0, lvl: res.diff || 'normal' });
    else if (res.kind === 'keystone') record({ id: 'keystone', src: 'keystone', t: Math.max(0, (res.limit || 0) - (res.left || 0)), lvl: res.level || 0 });
  }
  const cyc = C3.cycle();
  if (cyc?.ext) { cyc.ext.onResult.push(onResult); C3.disposers.push(() => { const i = cyc.ext.onResult.indexOf(onResult); if (i >= 0) cyc.ext.onResult.splice(i, 1); }); }
  C3.disposers.push(wrapMethod(game, 'hostOnCreatureKilled', (orig) => function (c, by) {
    const r = orig.call(this, c, by);
    if (!disposed && C3.enabled() && C3.host()) { try { onKilled(c); } catch (e) { console.warn('[cycle3] trophy kill', e); } }
    return r;
  }));
  C3.phaseFns.push((ph) => { if (ph === 'moon' || ph === 'landing') { landAt = game.time; seen.clear(); } });
  C3.hostStartFns.push(seed);

  // ------------------------------------------------------------ clients: a trophy was mounted
  C3.on('trophy', (m) => {
    if (!K.isTrophyId(m.id) || !m.rec) return;
    if (K.saveToProfile(game.profile, { [m.id]: m.rec }, myName(), C3.host())) { try { game.progress?.save?.(); } catch { /* ignore */ } }
    const name = t(K.BOSS_NAMES[m.id] || m.id);
    if (m.first) { game.ui?.hud?.bigText?.(t('TROPHY MOUNTED'), name); game.audio?.ui?.('ui_quota_met', 0.5); }
    else game.ui?.toast?.(tf('Trophy: {n} (x{k})', { n: name, k: m.rec.kills }), 'good');
    wallSig = '';
  });

  // ------------------------------------------------------------ the wall (every peer)
  const slotPos = (i) => ({ x: COL0 + (i % COLS) * COLD, y: ROW_Y[Math.floor(i / COLS)] ?? 1.5 });
  function disposeWall() {
    if (!wall) return;
    wall.removeFromParent();
    wall.traverse((o) => { o.geometry?.dispose?.(); const mm = o.material; if (mm) { mm.map?.dispose?.(); mm.dispose?.(); } });
    wall = null;
  }
  function buildWall() {
    disposeWall();
    if (typeof document === 'undefined' || !game.scene) return;
    wall = new THREE.Group(); wall.name = 'c3_trophy_wall';
    const board = mat(0x4a3018), frame = mat(0x2a1a0c);
    K.TROPHY_SLOTS.forEach((s, i) => {
      const rec = map()[s.id], on = !!(rec && rec.kills > 0), p = slotPos(i);
      const g = new THREE.Group();
      g.position.set(p.x, p.y, WALL_Z); g.rotation.y = Math.PI;
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.9, 0.05), board); g.add(b);
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.96, 0.03), frame); f.position.z = -0.02; g.add(f);
      const e = emblem(s.id, on); e.position.set(0, 0.1, 0.09); e.scale.setScalar(1.25); g.add(e);
      const nm = on ? t(K.BOSS_NAMES[s.id] || s.id) : '???';
      const pl = plate(nm, on ? `x${rec.kills}` : '', on); pl.position.set(0, -0.32, 0.03); g.add(pl);
      wall.add(g);
    });
    game.scene.add(wall);
  }
  const sigNow = () => K.TROPHY_SLOTS.map((s) => map()[s.id]?.kills | 0).join(',') + '|' + getLang();

  // ------------------------------------------------------------ interact + card
  function closePanel() { const ui = game.ui; if (panel && ui?.panelOpen === panel) ui.closePanel(); panel = null; }
  const row = (a, b) => `<div class="row"><b>${a}</b><span>${b}</span></div>`;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const side = (s) => (s ? `${K.fmtDate(s.at)} · ${tf('Sector {n}', { n: (s.sector | 0) + 1 })}${s.t ? ' · ' + K.mmss(s.t) : ''}` : '-');
  function openCard(id) {
    const rec = map()[id], ui = game.ui;
    if (!ui?.openPanel || typeof document === 'undefined') return;
    if (ui.panelOpen && ui.panelOpen !== panel) return;
    ensureCss();
    const on = !!(rec && rec.kills > 0), dz = DOSSIERS[id];
    const el = document.createElement('div');
    el.className = 'c3p';
    let h = `<h2>${esc(t(K.BOSS_NAMES[id] || id))}</h2><div class="sub">${esc(t('TROPHY WALL'))} · ${on ? esc(tf('{n} kills', { n: rec.kills })) : esc(t('not earned yet'))}</div>`;
    if (on) {
      h += row(t('First kill'), esc(side(rec.first))) + row(t('Crew'), esc((rec.first.crew || []).join(', ') || '-'));
      if (rec.last && rec.last.at !== rec.first.at) h += row(t('Latest kill'), esc(side(rec.last))) + row(t('Crew'), esc((rec.last.crew || []).join(', ') || '-'));
      if (rec.best?.t) h += row(t('Fastest'), esc(K.mmss(rec.best.t)));
      if (id === 'raid' && rec.top) h += row(t('Best difficulty'), esc(t(RAID_DIFFS[rec.top]?.name || rec.top)));
      if (id === 'keystone' && rec.top) h += row(t('Highest key'), `+${rec.top | 0}`);
    } else h += `<div class="lore">${esc(t(hintFor(id)))}</div>`;
    if (dz && on) h += `<div class="lore">${esc(t(dz.lines[0][0]))}<i>${esc(t(dz.lines[1][0]))}</i></div>`;
    h += `<div class="foot"><button class="x">${esc(t('Close'))}</button></div>`;
    el.innerHTML = h;
    el.querySelector('.x').onclick = () => closePanel();
    panel = el;
    ui.openPanel(el);
    game.audio?.ui?.('ui_notify', 0.4);
  }
  const hintFor = (id) => (id === 'raid' ? 'Clear the Algorithm\'s Core raid (terminal RAID).' : id === 'keystone' ? 'Complete a Corrupted Keystone (terminal KEYSTONE).' : id === 'hidden' ? 'Solve the three rules inside a Hidden Gate (terminal GATES, PING).' : 'Defeat this boss (Sector Cores, gates, raids) to mount its trophy.');
  C3.interFns.push((list, p) => {
    if (!wall || !insideShip(p.pos)) return;
    if (Math.abs(p.pos.z - WALL_Z) > 4.5 || p.pos.x < COL0 - 2 || p.pos.x > COL0 + COLD * COLS + 2) return;
    let best = -1, bd = 1e9;
    K.TROPHY_SLOTS.forEach((s, i) => { const q = slotPos(i), d = Math.hypot(p.pos.x - q.x, (p.pos.y + 1.2) - q.y) + Math.abs(p.pos.z - WALL_Z) * 0.3; if (d < bd) { bd = d; best = i; } });
    if (best < 0 || bd > 2.6) return;
    const s = K.TROPHY_SLOTS[best], q = slotPos(best), rec = map()[s.id], on = !!(rec && rec.kills > 0);
    list.push({ pos: new THREE.Vector3(q.x, q.y, WALL_Z - 0.35), r: 1.1, reach: 3.2, noLos: true, label: on ? tf('Trophy: {n} [E]', { n: t(K.BOSS_NAMES[s.id] || s.id) }) : t('Empty mount [E]'), sub: on ? `${K.fmtDate(rec.first.at)} · ${(rec.first.crew || []).length} ${t('crew')}` : t('not earned yet'), action: () => openCard(s.id) });
  });
  C3.ticks.push(() => {
    if (!game.scene || !game.run) return;
    const s = sigNow();
    if (s !== wallSig || !wall) { wallSig = s; try { buildWall(); } catch (e) { console.warn('[cycle3] wall', e); } }
  });

  // ------------------------------------------------------------ terminal
  try {
    window.KefalAPI?.registerCommand?.('trophies', (rest, term) => {
      const m = map(), out = [`${t('TROPHY WALL')}: ${K.trophyCount(m)}/${K.TROPHY_SLOTS.length}`];
      for (const s of K.TROPHY_SLOTS) { const r = m[s.id]; out.push(r && r.kills > 0 ? `  ${t(K.BOSS_NAMES[s.id] || s.id)} x${r.kills}  ${K.fmtDate(r.first.at)}  ${(r.first.crew || []).join(', ')}${r.best?.t ? '  ' + K.mmss(r.best.t) : ''}` : `  ???`); }
      term.print(out.join('\n'));
    }, 'the trophy wall on the ship: every boss you defeated');
    C3.disposers.push(() => { try { window.__kefalMods?.commands?.delete?.('trophies'); } catch { /* ignore */ } });
  } catch { /* no terminal in tests */ }

  return {
    record, reseed: seed, openCard, closePanel, get wall() { return wall; }, map, slotPos,
    dispose() { disposed = true; for (const o of offs) { try { o?.(); } catch { /* ignore */ } } closePanel(); disposeWall(); },
  };
}
