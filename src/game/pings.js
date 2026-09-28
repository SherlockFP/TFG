// Co-op PING system (middle mouse / P, rebindable as settings.keys.ping). The pinger raycasts from the
// camera, classifies what it hit (spot, item, creature, door/exit, ship, crewmate) and broadcasts a tiny
// payload; every peer then shows a world-anchored HUD marker (edge-clamped with an arrow when off-screen or
// behind, or a fixed INSIDE/OUTSIDE badge when the ping is in the other zone), a short 3D flare and a UI
// blip. Purely informational: no host state, nothing seeded. Dead players (spectators) can ping.
// Danger labels are built by each receiver from ITS OWN bestiary (personal progression).
import * as THREE from 'three';
import { G } from '../physics/physics.js';
import { RARITY, isSellable } from './items.js';
import { CREATURES } from './creatures.js';
import { suitColor } from '../entities/remote.js';
import { insideShip } from '../world/ship.js';
import { FACILITY_Y } from '../world/facility.js';
import { t, getLang } from '../core/i18n.js';

export const PING_MSG = 'ping';
const MAX_DIST = 60;            // m
const COOLDOWN = 0.6;           // s between local pings
const RECV_COOLDOWN = 0.45;     // s, anti-spam for remote peers (a bit lenient for network jitter)
const MAX_PER_PLAYER = 3;
const MAX_TOTAL = 24;
const LIFE = 7;                 // s a marker stays
const FADE = 1.5;               // s of fade-out at the end
const FLARE_LIFE = 1.5;         // s of the 3D flare
const EDGE = 34;                // px screen margin for clamped markers
const FOLLOW_MAX_OFF = 4;       // m, max offset between hit point and followed target
const INDOOR_Y = FACILITY_Y + 40;   // same zone rule as game.js (p.indoor)
const ZONE_TOP = 112;           // px, first cross-zone badge (below the clock + quota)
const ZONE_STEP = 50;           // px between stacked badges
const ZONE_MAX = 4;             // newest cross-zone badges shown
const HINT_DELAY = 16;          // s into the first moon before the one-time "you can ping" hint

const KINDS = new Set(['loc', 'item', 'crt', 'exit', 'door', 'ship', 'player']);
const FOLLOWED = new Set(['item', 'crt', 'player']);
const COL = {
  danger: '#ff4a3a', exit: '#9fffb0', fire: '#ffcf6a', door: '#e8d27a', ship: '#9fd4ff',
  body: '#ff6b6b', tool: '#cfc6b8', web: '#d8d8d8', crew: '#b8ffcc', spot: '#ffd27a',
};
const SPOT_LABELS = {
  fuse: 'Fuse Box', bell: 'Sell Bell', sellzone: 'Sell Counter', market: 'Black Market', slots: 'Slots',
  bounties: 'Bounty Board', pond: 'Fishing Spot', vault: 'Vault', terminal: 'Terminal', lever: 'Ship Lever',
};
// Turkish strings for this module only (kept here so no shared i18n table needs editing)
const PING_TR = {
  'DANGER': 'TEHLİKE', 'pinged': 'işaretledi', 'pinged you': 'seni işaretledi', 'You': 'Sen', 'Here': 'Burası',
  'Exit': 'Çıkış', 'Fire Exit': 'Yangın Çıkışı', 'Main Entrance': 'Ana Giriş', 'Ship': 'Gemi', 'Door': 'Kapı',
  'Locked Door': 'Kilitli Kapı', 'Vault Door': 'Kasa Kapısı', 'Blast Door': 'Güvenlik Kapısı', 'Body': 'Ceset',
  'Web': 'Ağ', 'Crewmate': 'Mürettebat', 'INSIDE': 'İÇERİDE', 'OUTSIDE': 'DIŞARIDA',
  'Fuse Box': 'Sigorta Kutusu', 'Sell Bell': 'Satış Zili', 'Sell Counter': 'Satış Tezgahı', 'Black Market': 'Karaborsa',
  'Slots': 'Slot Makinesi', 'Bounty Board': 'Ödül Panosu', 'Fishing Spot': 'Balık Tutma Yeri', 'Vault': 'Kasa',
  'Terminal': 'Terminal', 'Ship Lever': 'Gemi Kolu',
};
const COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const TYPE_RE = /^[A-Za-z0-9_:-]{1,32}$/;

const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _b = new THREE.Vector3();
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const ZAXIS = new THREE.Vector3(0, 0, 1);

const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
const r2 = (v) => Math.round(v * 100) / 100;
const str = (v, n) => (v === undefined || v === null ? '' : String(v).slice(0, n));
const col = (c, fb) => (typeof c === 'string' && COLOR_RE.test(c) ? c : fb);
const isIndoor = (y) => y < INDOOR_Y;
// i18n lookup that never lets a remote label resolve to a non-string (e.g. '__proto__')
function tr(s) {
  if (getLang() === 'tr' && own(PING_TR, s)) return PING_TR[s];
  const r = t(s);
  return typeof r === 'string' ? r : s;
}
// same value fuzz as the scanner (actions.js scan) so a ping never contradicts a scan
function scanFuzz(id) { const s = String(id); let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return 0.85 + (Math.abs(h) % 30) / 100; }
// dark suit colors (black, brown...) are lifted toward white so the sender name stays readable
function lift(hex) {
  let h = hex.slice(1);
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if ((0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 >= 0.38) return hex;
  r = Math.round(r + (255 - r) * 0.5); g = Math.round(g + (255 - g) * 0.5); b = Math.round(b + (255 - b) * 0.5);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}
const keyName = (code) => String(code).replace(/^(Key|Digit)/, '');

// ------------------------------------------------------------------ styles (injected once)
const CSS = `
.kp-root{position:absolute;inset:0;pointer-events:none;overflow:hidden;font-family:var(--font,monospace)}
.kp-root *{pointer-events:none}
.kp-mk{position:absolute;left:0;top:0;will-change:transform,opacity;text-shadow:0 0 4px #000,0 0 2px #000}
.kp-dia{position:absolute;left:-8px;top:-8px;width:16px;height:16px;box-sizing:border-box;border:2px solid currentColor;
 background:rgba(0,0,0,.35);box-shadow:0 0 7px currentColor;transform:rotate(45deg);animation:kpPop .4s ease-out both}
.kp-mk.danger .kp-dia{background:currentColor;animation:kpPop .4s ease-out both,kpBlink .5s steps(2) .4s 6}
.kp-txt{position:absolute;left:0;top:11px;transform:translateX(-50%);white-space:nowrap;text-align:center;line-height:.95}
.kp-l{font-size:21px}
.kp-s{font-size:16px;color:#fff}
.kp-v:empty{display:none}
.kp-v:not(:empty){margin-right:6px}
.kp-n{margin-left:6px}
.kp-z{display:none;margin-right:6px;opacity:.85}
.kp-arr{position:absolute;left:0;top:0;width:0;height:0;display:none;transform-origin:0 0;
 border-top:7px solid transparent;border-bottom:7px solid transparent;border-left:11px solid currentColor}
.kp-mk.edge .kp-arr{display:block}
.kp-mk.edge .kp-l,.kp-mk.edge .kp-n,.kp-mk.edge .kp-v{display:none}
.kp-mk.zone .kp-z{display:inline}
.kp-mk.zone .kp-d{display:none}
@keyframes kpPop{0%{transform:rotate(45deg) scale(2.6);opacity:0}100%{transform:rotate(45deg) scale(1);opacity:1}}
@keyframes kpBlink{0%{opacity:1}100%{opacity:.35}}
`;
let cssRefs = 0;
function addCss() {
  if (typeof document === 'undefined') return;
  cssRefs++;
  if (document.getElementById('kefal-pings-css')) return;
  const s = document.createElement('style');
  s.id = 'kefal-pings-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}
function removeCss() {
  if (typeof document === 'undefined') return;
  cssRefs = Math.max(0, cssRefs - 1);
  if (!cssRefs) document.getElementById('kefal-pings-css')?.remove();
}
function div(cls, text) {
  const e = document.createElement('div');
  e.classList.add(...cls.split(' ').filter(Boolean));
  if (text) e.textContent = text;
  return e;
}
function span(cls, text) {
  const e = document.createElement('span');
  e.classList.add(cls);
  if (text) e.textContent = text;
  return e;
}

// ------------------------------------------------------------------ install
export function installPings(game) {
  const pings = [];               // active markers, oldest first
  const flares = [];
  const lastRecv = new Map();     // peer -> clock of their last accepted ping
  let clock = 0;
  let nextLocal = 0;
  let seq = 0;
  let boundNet = null;
  let disposed = false;
  let lastMap = game.world?.mapGroup ?? null;
  let geo = null;                 // shared flare geometries (lazy)
  let hintAt = -1;                // clock time of the one-time tutorial hint (-1 = not scheduled)
  let hintDone = false;
  const onMsg = (d, from) => receive(d, from);

  // HUD layer: right above the HUD, below menus/overlays
  let root = null;
  if (typeof document !== 'undefined') {
    addCss();
    root = div('kp-root');
    root.style.pointerEvents = 'none';
    const hudEl = game.ui?.hud?.el;
    const uiRoot = game.ui?.root || document.getElementById('ui');
    if (hudEl?.parentNode && hudEl.insertAdjacentElement) hudEl.insertAdjacentElement('afterend', root);
    else uiRoot?.appendChild(root);
  }

  function bindNet() {
    const net = game.net;
    if (!net || net === boundNet || !net.on_) return;
    if (boundNet?.msgHandlers?.get(PING_MSG) === onMsg) boundNet.msgHandlers.delete(PING_MSG);
    boundNet = net;
    net.on_(PING_MSG, onMsg);
  }
  bindNet();

  const selfId = () => game.selfId || 'local';
  const pingKey = () => {
    const k = game.settings?.keys?.ping ?? game.input?.settings?.keys?.ping;
    return typeof k === 'string' && k ? k : 'KeyP';
  };

  // ---------------------------------------------------------------- local ping (classification)
  function tryPing() {
    if (disposed || clock < nextLocal) return false;
    const cam = game.camera;
    if (!cam || !game.physics) return false;
    const origin = _o.copy(cam.position);
    const dir = _d.set(0, 0, -1).applyQuaternion(cam.quaternion).normalize();
    const res = classify(origin, dir);
    if (!res) return false;
    nextLocal = clock + COOLDOWN;
    const prof = game.profile || {};
    const pt = res.point;
    const payload = {
      k: res.k, p: [r2(pt.x), r2(pt.y), r2(pt.z)], c: res.c,
      n: str(prof.name || 'Employee', 24), sc: suitColor(prof.suit), oy: r2(res.oy ?? 0.25),
    };
    if (res.l) payload.l = str(res.l, 40);
    if (res.s) payload.s = str(res.s, 24);
    if (res.tid !== undefined && res.tid !== null) payload.tid = str(res.tid, 40);
    if (res.dg) payload.dg = 1;
    if (res.ty) { payload.ty = str(res.ty, 32); payload.lv = res.lv; if (res.el) payload.el = 1; }
    if (res.cd) payload.cd = str(res.cd, 12);
    if (res.nm) payload.nm = [r2(res.nm.x), r2(res.nm.y), r2(res.nm.z)];
    if (game.net?.broadcast) game.net.broadcast(PING_MSG, payload);
    else receive(payload, selfId());
    return true;
  }

  function classify(origin, dir) {
    const p = game.player;
    // spectators orbit the watched crewmate: exclude THAT capsule (not all crewmates), else our own
    const watched = p?.dead && game.spectating ? game.remotes?.get(game.spectating) : null;
    const exclude = watched?.col || p?.col || null;
    const mask = G.STATIC | G.DOOR | G.ITEM | G.BIG | G.REMOTE;
    let hit = null;
    try { hit = game.physics.raycast(origin, dir, MAX_DIST, mask, exclude); } catch { hit = null; }
    const hitD = hit ? hit.distance : Infinity;
    let ch = null;
    try { ch = game.creatures?.raycast?.(origin, dir, Math.min(MAX_DIST, hitD), pingableCreature) || null; } catch { ch = null; }
    if (ch && ch.t < hitD) return creaturePing(ch.view, origin.clone().addScaledVector(dir, ch.t));
    const res = hit ? classifyHit(hit, origin) : null;
    if (!res || res.k === 'loc' || res.k === 'door' || res.k === 'exit' || res.k === 'ship') {
      const a = assist(origin, dir, hitD);
      if (a) return a;
    }
    return res;
  }

  function pingableCreature(v) {
    if (!v || v.state === 'dead') return false;
    if (v.type === 'screamer' && (v.alpha ?? 1) < 0.3) return false;   // invisible: no free intel
    if (v.root && v.root.visible === false) return false;
    return true;
  }

  // Decoys (mimic, mimicdoor, web) send a final label and look exactly like the real thing; real
  // dangers send only their type/level so each receiver names them from its own bestiary.
  function creaturePing(v, point) {
    const base = { k: 'crt', tid: v.id, point };
    if (v.type === 'mimicdoor') return { ...base, l: 'Fire Exit', c: COL.fire, oy: 2.6 };
    if (v.type === 'web') return { ...base, l: 'Web', c: COL.web, oy: 2.2 };
    if (v.type === 'mimic') return { ...base, l: v.name || 'Crewmate', c: COL.crew, oy: 2.45 };
    return {
      ...base, ty: v.type, lv: Math.max(1, Math.min(99, Math.round(v.level || 1))), el: !!v.elite, cd: v.code || '',
      c: COL.danger, oy: (v.height || v.def?.height || 1.5) + 0.35, dg: 1,
    };
  }

  function itemPing(it) {
    if (!it || it.state !== 'world') return null;
    const def = it.def || {};
    const point = itemBase(it, new THREE.Vector3());
    const sz = it.size;
    const oy = sz && sz.y ? Math.min(3, sz.y * 0.5 + 0.3) : 0.45;
    if (it.type === 'body') return { k: 'item', tid: it.id, l: it.label || 'Body', c: COL.body, oy, point };
    const val = Math.max(0, Math.round(it.value || 0));
    if (val > 0 && isSellable(def)) {
      const rc = RARITY[it.rarity?.()]?.color || COL.tool;
      return { k: 'item', tid: it.id, l: def.name || it.type, s: '▮' + Math.round(val * scanFuzz(it.id)), c: rc, oy, point };
    }
    return { k: 'item', tid: it.id, l: def.name || it.type, c: COL.tool, oy, point };
  }

  function classifyHit(hit, origin) {
    const info = hit.info || {};
    const pt = new THREE.Vector3(hit.point.x, hit.point.y, hit.point.z);
    const nm = hit.normal ? new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z) : null;
    if (info.kind === 'item') { const r = itemPing(game.items?.get(info.itemId)); if (r) return r; }
    if (info.kind === 'remote') {
      const r = game.remotes?.get(info.peerId);
      // same color as a mimic ping (and as both name tags) so a ping never tells them apart
      if (r && !r.dead) return { k: 'player', tid: info.peerId, l: r.name || 'Employee', c: COL.crew, oy: 2.45, point: pt };
    }
    if (info.kind === 'shipdoor') return shipPing(pt);
    if (info.kind === 'door' && info.door) return info.door.teleport ? exitFromDoor(info.door) : doorPing(info.door);
    const ex = exitNear(pt);
    if (ex) return ex;
    if (!insideShip(origin) && insideShip(pt, 0.8)) return shipPing(pt);
    const sp = spotNear(pt);
    if (sp) return sp;
    return { k: 'loc', l: 'Here', c: COL.spot, oy: 0.25, point: pt, nm };
  }

  function shipPing(pt) { return { k: 'ship', l: 'Ship', c: COL.ship, oy: 0.4, point: pt }; }

  function doorPing(door) {
    const h = door.height || 2.2;
    const l = door.kind === 'vault' ? 'Vault Door' : door.kind === 'blast' ? 'Blast Door' : door.locked ? 'Locked Door' : 'Door';
    const s = door.kind === 'blast' && door.code ? String(door.code).toUpperCase() : '';
    return { k: 'door', l, s, c: COL.door, oy: h * 0.5 + 0.25, point: door.pos.clone().setY(door.pos.y + h * 0.5) };
  }

  function exitFromDoor(d) {
    const h = d.height || 2.4;
    const main = d.kind === 'entrance';
    return { k: 'exit', l: main ? 'Exit' : 'Fire Exit', c: main ? COL.exit : COL.fire, oy: h * 0.5 + 0.35, point: d.pos.clone().setY(d.pos.y + h * 0.5) };
  }

  function exitNear(pt) {
    const fac = game.world?.facility;
    if (fac?.doors) {
      for (const d of fac.doors) {
        if (!d.teleport || !d.pos) continue;
        const dx = pt.x - d.pos.x, dz = pt.z - d.pos.z, dy = pt.y - d.pos.y;
        if (dx * dx + dz * dz < 2.6 * 2.6 && dy > -1 && dy < 4) return exitFromDoor(d);
      }
    }
    const out = game.world?.outdoor;
    if (out) {
      const m = out.mainExit?.pos;
      if (m && m.distanceTo(pt) < 3.5) return { k: 'exit', l: 'Main Entrance', c: COL.exit, oy: 2.8, point: m.clone().setY(m.y + 1.2) };
      for (const f of out.fireExits || []) {
        if (f.pos && f.pos.distanceTo(pt) < 3.2) return { k: 'exit', l: 'Fire Exit', c: COL.fire, oy: 2.6, point: f.pos.clone().setY(f.pos.y + 1.1) };
      }
    }
    return null;
  }

  function spotNear(pt) {
    const w = game.world || {};
    let best = null, bestD = Infinity;
    for (const src of [w.facility, w.outdoor, w.company]) {
      for (const ia of src?.interactables || []) {
        if (!ia?.pos || ia.type === 'exit') continue;
        const label = SPOT_LABELS[ia.type] || (typeof ia.pingLabel === 'string' ? ia.pingLabel : null);
        if (!label) continue;
        const r = ia.type === 'sellzone' ? 2.6 : ia.r ? Math.min(ia.r, 14) : 1.7;
        const d = ia.pos.distanceTo(pt);
        if (d < r && d < bestD) { bestD = d; best = { k: 'loc', l: label, c: COL.spot, oy: 0.6, point: ia.type === 'pond' ? pt.clone() : ia.pos.clone() }; }
      }
    }
    return best;
  }

  // small aim assist: tiny items / thin creatures right next to the crosshair
  function assist(origin, dir, hitD) {
    const phys = game.physics;
    let best = null, bestDot = 0;
    const cands = [];
    for (const v of game.creatures?.views?.values?.() || []) {
      if (!pingableCreature(v) || v.type === 'web' || !v.pos) continue;
      cands.push({ v, c: v.pos.clone().setY(v.pos.y + (v.height || 1.5) * 0.5), minDot: 0.994, maxD: MAX_DIST });
    }
    for (const it of game.items?.all?.() || []) {
      if (it.state !== 'world' || !it.obj) continue;
      cands.push({ it, c: itemBase(it, new THREE.Vector3()), minDot: 0.997, maxD: 30 });
    }
    for (const cd of cands) {
      _b.subVectors(cd.c, origin);
      const d = _b.length();
      if (d < 0.3 || d > cd.maxD || d > hitD + 0.75) continue;
      const dot = _b.dot(dir) / d;
      if (dot < cd.minDot || dot <= bestDot) continue;
      if (phys.lineOfSight && !phys.lineOfSight(origin, cd.c, G.STATIC | G.DOOR)) continue;
      best = cd; bestDot = dot;
    }
    if (!best) return null;
    return best.it ? itemPing(best.it) : creaturePing(best.v, best.c);
  }

  // ---------------------------------------------------------------- target tracking
  function itemBase(it, out) {
    if (it.state === 'held' && it.holder) {
      const h = game.playerHeadById?.(it.holder);
      if (h) return out.copy(h).setY(h.y - 0.45);
      const v = game.creatures?.views?.get(it.holder);
      if (v) return out.copy(v.pos).setY(v.pos.y + (v.height || 1) * 0.5);
    }
    if (it.worldPos) return it.worldPos(out);
    return out.copy(it.obj?.position || out);
  }

  // base position of a followed target (feet for creatures/players, center for items); false if gone
  function targetBase(pg, out) {
    if (pg.k === 'item') {
      const it = game.items?.get(pg.tid);
      if (!it) return false;
      if (it.state === 'held' && game.selfId && it.holder === game.selfId) return false;   // it's in my hands: done
      itemBase(it, out);
      return true;
    }
    if (pg.k === 'crt') {
      const v = game.creatures?.views?.get(pg.tid);
      if (!v || v.state === 'dead') return false;
      out.copy(v.pos);
      return true;
    }
    if (pg.k === 'player') {
      if (pg.tid === game.selfId) return false;
      const r = game.remotes?.get(pg.tid);
      if (!r || r.dead) return false;
      out.copy(r.pos);
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- receive (all peers, incl. self)
  function senderInfo(who, self, d) {
    if (self) {
      const prof = game.profile || {};
      return { n: str(prof.name, 24) || 'Employee', sc: suitColor(prof.suit) };
    }
    // trust the hello/remote record over the payload; the payload is only a fallback
    const r = game.remotes?.get?.(who);
    const n = r?.name || game.net?.players?.get?.(who)?.name || d.n;
    return { n: str(n, 24) || 'Employee', sc: r?.suit ? suitColor(r.suit) : col(d.sc, '#d9642b') };
  }

  // danger creatures: label from MY bestiary; decoys / unknown types: the sent label
  function dangerText(d) {
    const ty = typeof d.ty === 'string' && TYPE_RE.test(d.ty) ? d.ty : null;
    const code = str(d.cd, 12).toUpperCase();
    if (!ty) return { l: str(d.l, 40) || '???', s: code || str(d.s, 24) };
    const def = own(CREATURES, ty) ? CREATURES[ty] : null;
    const best = game.profile?.bestiary;
    const known = !!(def && own(best, ty) && best[ty]?.seen);
    const lv = Math.max(1, Math.min(99, Math.round(+d.lv || 1)));
    return {
      l: known ? str(def.name || ty, 36) + (d.el ? ' ★' : '') : '???',
      s: code || (known && !def.hazard ? 'Lv.' + lv : ''),
    };
  }

  function receive(d, from) {
    if (disposed || !d || typeof d !== 'object' || !Array.isArray(d.p) || d.p.length !== 3) return;
    const x = +d.p[0], y = +d.p[1], z = +d.p[2];
    if (![x, y, z].every((v) => Number.isFinite(v) && Math.abs(v) < 1e5)) return;
    const who = String(from ?? 'local');
    const self = who === selfId();
    const last = lastRecv.get(who);
    if (!self && last !== undefined && clock - last < RECV_COOLDOWN) return;
    lastRecv.set(who, clock);
    const k = KINDS.has(d.k) ? d.k : 'loc';
    const dg = !!d.dg;
    const tid = d.tid !== undefined && d.tid !== null ? String(d.tid).slice(0, 40) : null;
    const snd = senderInfo(who, self, d);
    const txt = dg ? dangerText(d) : { l: str(d.l, 40) || 'Here', s: str(d.s, 24) };
    const a = game.audio;
    const blip = () => {
      try {
        if (a?.play) a.play('ui_notify', { volume: dg ? 0.75 : 0.45, bus: 'ui', pitch: dg ? 0.78 : 1.12 });
        else a?.ui?.('ui_notify', dg ? 0.75 : 0.45);
      } catch { /* audio is optional */ }
    };
    // a crewmate pinged ME: a marker on my own head is useless, tell me instead
    if (k === 'player' && tid && game.selfId && tid === game.selfId) {
      blip();
      game.ui?.toast?.(`${snd.n} ${tr('pinged you')}`, 'info');
      game.mods?.emit?.('ping', { ...d, from: who }, game);
      return;
    }
    const pg = {
      id: ++seq, from: who, self, k, dg, tid,
      l: txt.l, s: txt.s, c: col(d.c, COL.spot), n: snd.n, sc: lift(snd.sc),
      oy: Math.max(0, Math.min(12, +d.oy || 0.25)),
      base: new THREE.Vector3(x, y, z), off: new THREE.Vector3(), anchor: new THREE.Vector3(x, y, z), mark: new THREE.Vector3(),
      age: 0, life: LIFE, lost: false, dead: false, el: null, dom: null, mode: null, op: -1, dist: -1, zin: null,
    };
    if (FOLLOWED.has(k) && pg.tid && targetBase(pg, _b)) {
      pg.off.set(x, y, z).sub(_b);
      if (pg.off.lengthSq() > FOLLOW_MAX_OFF * FOLLOW_MAX_OFF) pg.off.set(0, 0, 0);
      pg.base.copy(_b);
    }
    pg.anchor.copy(pg.base).add(pg.off);
    pg.mark.copy(pg.base).setY(pg.base.y + pg.oy);
    // per-player cap (oldest replaced) + global cap
    let n = 0;
    for (const o of pings) if (o.from === who) n++;
    while (n >= MAX_PER_PLAYER) { const old = pings.find((o) => o.from === who); if (!old) break; removePing(old); n--; }
    while (pings.length >= MAX_TOTAL) removePing(pings[0]);
    pings.push(pg);
    makeMarker(pg);
    // 3D flare + light only when the ping is in the zone I'm looking at (facility vs outdoors)
    const cam = game.camera;
    if (!cam || isIndoor(pg.anchor.y) === isIndoor(cam.position.y)) {
      let nm = null;
      if (Array.isArray(d.nm) && d.nm.length === 3 && d.nm.every((v) => Number.isFinite(+v))) {
        nm = _n.set(+d.nm[0], +d.nm[1], +d.nm[2]);
        if (nm.lengthSq() < 0.01) nm = null; else nm.normalize();
      }
      spawnFlare(pg, nm);
    }
    blip();
    if (pg.dg) game.ui?.chatMessage?.(null, `${pg.n} ${tr('pinged')} ${labelText(pg)}`, self, 'bad');
    game.mods?.emit?.('ping', { ...d, from: who }, game);
  }

  function labelText(pg) { return pg.dg ? `${tr('DANGER')}: ${tr(pg.l)}` : tr(pg.l); }

  // ---------------------------------------------------------------- HUD markers
  function makeMarker(pg) {
    if (!root) return;
    const el = div('kp-mk' + (pg.dg ? ' danger' : ''));
    el.style.color = pg.c;
    el.style.transform = 'translate(-9999px,-9999px)';
    const arr = div('kp-arr');
    const txt = div('kp-txt');
    const l = div('kp-l', labelText(pg));
    const s = div('kp-s');
    const zone = span('kp-z');
    const dist = span('kp-d');
    const who = span('kp-n', pg.self ? tr('You') : pg.n);
    who.style.color = pg.sc;
    s.appendChild(zone);
    s.appendChild(span('kp-v', pg.s));
    s.appendChild(dist);
    s.appendChild(who);
    txt.appendChild(l);
    txt.appendChild(s);
    el.appendChild(arr);
    el.appendChild(div('kp-dia'));
    el.appendChild(txt);
    root.appendChild(el);
    pg.el = el;
    pg.dom = { arr, dist, zone };
  }

  function removePing(pg) {
    pg.dead = true;
    pg.el?.remove();
    pg.el = null;
    const i = pings.indexOf(pg);
    if (i >= 0) pings.splice(i, 1);
  }

  // mode: 'screen' | 'edge' (clamped + arrow) | 'zone' (fixed INSIDE/OUTSIDE badge) | 'hidden'
  function setMode(pg, mode) {
    if (pg.mode === mode || !pg.el) return;
    pg.mode = mode;
    pg.el.classList.toggle('edge', mode === 'edge');
    pg.el.classList.toggle('zone', mode === 'zone');
    pg.el.style.visibility = mode === 'hidden' ? 'hidden' : '';
  }

  function setOpacity(pg, mul) {
    const fade = pg.age > pg.life - FADE ? Math.max(0, (pg.life - pg.age) / FADE) : 1;
    const op = Math.round(fade * mul * 100) / 100;
    if (op !== pg.op) { pg.op = op; pg.el.style.opacity = String(op); }
  }

  function placeMarker(pg, cam, W, H) {
    const el = pg.el;
    if (!el) return;
    _v.copy(pg.mark).applyMatrix4(cam.matrixWorldInverse);
    const vx = _v.x, vy = _v.y;
    let sx, sy, edge;
    if (_v.z < -0.05) {
      _v.applyMatrix4(cam.projectionMatrix);
      sx = (_v.x * 0.5 + 0.5) * W; sy = (-_v.y * 0.5 + 0.5) * H;
      edge = sx < EDGE || sx > W - EDGE || sy < EDGE || sy > H - EDGE;
    } else {
      // behind the camera: push to the edge in the view-space direction (straight behind -> bottom)
      edge = true;
      sx = W / 2 + vx; sy = H / 2 - vy;
      if (Math.abs(vx) + Math.abs(vy) < 1e-4) sy = H / 2 + 1;
    }
    if (edge) {
      const cx = W / 2, cy = H / 2, dx = sx - cx, dy = sy - cy;
      const k = Math.min((cx - EDGE) / Math.max(Math.abs(dx), 1e-6), (cy - EDGE) / Math.max(Math.abs(dy), 1e-6));
      sx = cx + dx * k; sy = cy + dy * k;
      pg.dom.arr.style.transform = `rotate(${Math.atan2(dy, dx).toFixed(3)}rad) translate(13px,-7px)`;
    }
    setMode(pg, edge ? 'edge' : 'screen');
    el.style.transform = `translate(${Math.round(sx)}px,${Math.round(sy)}px)`;
    setOpacity(pg, edge ? 0.85 : 1);
    const dist = Math.round(cam.position.distanceTo(pg.anchor));
    if (dist !== pg.dist) { pg.dist = dist; pg.dom.dist.textContent = dist + 'm'; }
  }

  // ping in the other zone (facility vs outdoors): no direction/distance, just a fixed badge
  function placeBadge(pg, W, slot) {
    if (!pg.el) return;
    setMode(pg, 'zone');
    const zin = isIndoor(pg.anchor.y);
    if (zin !== pg.zin) { pg.zin = zin; pg.dom.zone.textContent = tr(zin ? 'INSIDE' : 'OUTSIDE'); }
    pg.el.style.transform = `translate(${Math.round(W / 2)}px,${ZONE_TOP + slot * ZONE_STEP}px)`;
    setOpacity(pg, 0.9);
  }

  // ---------------------------------------------------------------- 3D flare
  function flareGeo() {
    if (geo) return geo;
    const beam = new THREE.CylinderGeometry(0.035, 0.035, 1, 6, 1, true);
    beam.translate(0, 0.5, 0);
    geo = { beam, ring: new THREE.RingGeometry(0.2, 0.3, 24), core: new THREE.OctahedronGeometry(0.13, 0) };
    for (const g of Object.values(geo)) g.userData.shared = true;
    return geo;
  }

  function spawnFlare(pg, normal) {
    const scene = game.scene || game.engine?.scene;
    if (!scene) return;
    const g = flareGeo();
    const mat = new THREE.MeshBasicMaterial({
      color: pg.c, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    });
    const group = new THREE.Group();
    group.name = 'ping_flare';
    group.position.copy(pg.anchor);
    const beam = new THREE.Mesh(g.beam, mat);
    const ring = new THREE.Mesh(g.ring, mat);
    const core = new THREE.Mesh(g.core, mat);
    ring.quaternion.setFromUnitVectors(ZAXIS, normal || UP);
    ring.position.copy(normal || UP).multiplyScalar(0.03);
    core.position.y = 0.35;
    for (const m of [beam, ring, core]) { m.renderOrder = 20; group.add(m); }
    scene.add(group);
    // indoors the light belongs to the facility group, so a power-off blackout also kills it (no free flashlight)
    let light = null;
    const group_ = isIndoor(pg.anchor.y) ? 'facility' : 'fx';
    try { light = game.lights?.add?.({ pos: pg.anchor.clone().setY(pg.anchor.y + 0.4), color: pg.c, intensity: 1.1, distance: 4, group: group_ }) || null; } catch { light = null; }
    flares.push({ group, mat, beam, ring, core, light, ping: pg, age: 0 });
  }

  function removeFlare(f) {
    f.group.removeFromParent();
    f.mat.dispose();
    if (f.light) { try { game.lights?.remove?.(f.light); } catch { /* ignore */ } }
    const i = flares.indexOf(f);
    if (i >= 0) flares.splice(i, 1);
  }

  function updateFlares(dt) {
    for (let i = flares.length - 1; i >= 0; i--) {
      const f = flares[i];
      f.age += dt;
      const k = f.age / FLARE_LIFE;
      if (k >= 1) { removeFlare(f); continue; }
      if (f.ping && !f.ping.dead) f.group.position.copy(f.ping.anchor);
      f.mat.opacity = (1 - k) * (1 - k);
      f.ring.scale.setScalar(1 + k * 3.5);
      f.beam.scale.set(1, 0.3 + 2.7 * Math.min(1, k * 3), 1);
      f.core.rotation.y += dt * 6;
      f.core.position.y = 0.35 + k * 0.5;
      if (f.light) { f.light.intensity = 1.1 * (1 - k); f.light.pos.copy(f.group.position).setY(f.group.position.y + 0.4); }
    }
  }

  // ---------------------------------------------------------------- per frame
  function update(dt) {
    if (disposed) return;
    clock += dt;
    bindNet();
    const map = game.world?.mapGroup ?? null;
    if (map !== lastMap) { lastMap = map; clearAll(); }
    const inp = game.input;
    if (inp && inp.enabled && inp.locked && !game.minigame && !game.terminal?.active) {
      if (inp.mouseClicked?.(1) || inp.codePressed?.(pingKey())) tryPing();
    }
    if (pings.length) updatePings(dt);
    if (flares.length) updateFlares(dt);
    if (!hintDone) updateHint();
  }

  // one-time onboarding toast, a while into the first moon (after the built-in moon hints)
  function updateHint() {
    const prof = game.profile;
    if (!prof || game.run?.phase !== 'moon') { hintAt = -1; return; }
    const tut = prof.tutorial || (prof.tutorial = {});
    if (tut.ping) { hintDone = true; return; }
    if (hintAt < 0) { hintAt = clock + HINT_DELAY; return; }
    if (clock < hintAt) return;
    tut.ping = true;
    hintDone = true;
    try { game.progress?.save?.(); } catch { /* ignore */ }
    const key = keyName(pingKey());
    const msg = getLang() === 'tr'
      ? `Ekibine bir şey göstermek için orta tık veya ${key} ile İŞARETLE.`
      : `Middle-click or ${key} to PING things for your crew.`;
    game.ui?.toast?.('💡 ' + msg, 'info');
  }

  function updatePings(dt) {
    const cam = game.camera;
    const hudHidden = !!game.ui?.hud?.el?.classList?.contains('hidden');
    if (root) root.style.display = hudHidden ? 'none' : '';
    for (let i = pings.length - 1; i >= 0; i--) {
      const pg = pings[i];
      pg.age += dt;
      if (FOLLOWED.has(pg.k) && !pg.lost) {
        if (targetBase(pg, _b)) pg.base.copy(_b);
        else { pg.lost = true; pg.age = Math.max(pg.age, pg.life - 1); }   // target gone/dead: fade out soon
      }
      if (pg.age >= pg.life) { removePing(pg); continue; }
      pg.anchor.copy(pg.base).add(pg.off);
      pg.mark.copy(pg.base).setY(pg.base.y + pg.oy);
    }
    if (hudHidden || !cam || !root) return;
    cam.updateMatrixWorld();
    const W = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const H = typeof window !== 'undefined' ? window.innerHeight : 720;
    const camIn = isIndoor(cam.position.y);
    let cross = 0;
    for (const pg of pings) if (isIndoor(pg.anchor.y) !== camIn) cross++;
    let skip = Math.max(0, cross - ZONE_MAX), slot = 0;
    for (const pg of pings) {
      if (isIndoor(pg.anchor.y) === camIn) placeMarker(pg, cam, W, H);
      else if (skip > 0) { skip--; setMode(pg, 'hidden'); }
      else placeBadge(pg, W, slot++);
    }
  }

  function clearAll() {
    while (pings.length) removePing(pings[pings.length - 1]);
    while (flares.length) removeFlare(flares[flares.length - 1]);
  }

  function dispose() {
    if (disposed) return;
    clearAll();
    disposed = true;
    if (boundNet?.msgHandlers?.get(PING_MSG) === onMsg) boundNet.msgHandlers.delete(PING_MSG);
    boundNet = null;
    root?.remove();
    root = null;
    removeCss();
    if (geo) { for (const g of Object.values(geo)) g.dispose(); geo = null; }
    lastRecv.clear();
  }

  return {
    update, dispose,
    ping: tryPing,            // manual trigger (mods / tests)
    receive,                  // inject a payload as if it came from `from`
    clear: clearAll,
    get active() { return pings.slice(); },
    get flareCount() { return flares.length; },
  };
}
