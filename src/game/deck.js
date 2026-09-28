// The Stacked Deck (Twisted Fate style card thrower). Item + model + sounds live in weapons.js / models/weapons_wave1.js;
// this file is the behaviour, installed on the shared weapon context.
//
//   LMB            throw a fan of 3 cards (client-predicted spinning projectiles, host applies damage)
//   R              "Pick a Card": the deck cycles BLUE -> RED -> GOLD for up to 3 s (HUD + deck glow); R again locks
//                  the card (LMB while cycling also locks and throws it). The next throw is ONE special card:
//                    GOLD  single target stun 2 s            RED  splash (3.4 m) + slow 45 % for 3 s
//                    BLUE  damage, then mana (+25 via game.magic.addMana) - or, without a magic module, a cooldown refund
//   Host authority: 'wdeck' throw registers a ticket (3 cards or 1 special) for that player, each 'wdeck' hit consumes one;
//   damage / stun / slow are applied by the host from the deck's def x tier x affix (client only says WHAT it hit).
import * as THREE from 'three';
import { CARD_COLORS, createCardMesh } from '../models/weapons_wave1.js';
import { relMul } from './weapons.js';
import { applyAffixes } from './loot.js';
import { hudDock } from '../ui/dock.js';
import { addTranslations, t } from '../core/i18n.js';

const PI = Math.PI;
const CYCLE = ['blue', 'red', 'gold'];
const CYCLE_STEP = 0.34;   // s per card while cycling
const CYCLE_MAX = 3.0;     // s before it auto-locks
const PICK_CD = 5.0;       // s after a special throw before the next Pick a Card
const STD = { count: 3, spreadDeg: 9, speed: 44, cd: 0.75, dmg: 1 };
const SPECIAL = { speed: 38, cd: 1.0 };
const GOLD_STUN = 2.0, RED_RADIUS = 3.4, RED_SLOW = 3.0, RED_SLOW_MUL = 0.55, BLUE_MANA = 25;
const KINDS = ['std', 'gold', 'red', 'blue'];
const NAMES = { blue: 'BLUE', red: 'RED', gold: 'GOLD' };
const EFFECT = { blue: 'damage + mana', red: 'splash + slow', gold: 'stun 2 s' };
const hex = (k) => '#' + CARD_COLORS[k].toString(16).padStart(6, '0');

addTranslations({
  'STACKED DECK': 'HİLELİ DESTE', 'PICK A CARD': 'KART SEÇ', 'LOCKED': 'KİLİTLİ', 'Cooldown': 'Bekleme',
  'damage + mana': 'hasar + mana', 'splash + slow': 'alan hasarı + yavaşlatma', 'stun 2 s': '2 sn sersemletme',
  'Blue card: +25 mana': 'Mavi kart: +25 mana', 'Blue card: cooldown refunded': 'Mavi kart: bekleme iade edildi',
});

const CSS = `
.deck-hud{font-family:var(--font,monospace);color:#ffd9b8;text-align:center;text-shadow:0 0 8px rgba(255,138,61,.45);padding:6px 12px;background:rgba(10,6,3,.72);border:1px solid rgba(255,150,70,.35)}
.deck-hud .dh-t{font-size:17px;letter-spacing:2px;opacity:.85}
.deck-hud .dh-row{display:flex;gap:8px;justify-content:center;margin:4px 0}
.deck-hud .dh-c{width:64px;padding:2px 0;border:2px solid;font-size:19px;opacity:.38;letter-spacing:1px}
.deck-hud .dh-c.on{opacity:1;box-shadow:0 0 14px currentColor;transform:translateY(-3px);background:rgba(255,255,255,.08)}
.deck-hud .dh-c.lock{animation:dhlock .35s ease-out}
.deck-hud .dh-s{font-size:20px;min-height:22px}
.deck-hud .dh-b{height:5px;background:rgba(255,255,255,.1);margin-top:4px}.deck-hud .dh-b>i{display:block;height:100%;background:#ffd23f}
@keyframes dhlock{0%{transform:translateY(-3px) scale(1.5)}100%{transform:translateY(-3px) scale(1)}}
`;

export function installDeck(game, ctx) {
  const g = game, mm = game.mods;
  const held = () => g.player?.heldItem?.() || null;
  const eyeFwd = () => new THREE.Vector3(0, 0, -1).applyQuaternion(g.camera.quaternion);
  const st = { mode: 'idle', idx: 0, cyc: 0, life: 0, card: null, pickCd: 0, hudKey: '' };
  const deckCards = new Map();   // item id -> locked / cycling colour (for remote decks' glow)
  const setCard = (it, c) => { if (it) g.net.broadcast('fx', { k: 'sh', t: 'deckcard', id: it.id, c }); };

  // ---------------------------------------------------------------- HUD (shared bottom dock)
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const box = hudDock('bottom', 'deck', 20);
  box.style.display = 'none';
  function renderHud(it) {
    if (!it) { if (box.style.display !== 'none') box.style.display = 'none'; st.hudKey = ''; return; }
    const cd = Math.max(0, (g.nextSwing || 0) - g.time), pcd = st.pickCd;
    const cur = st.mode === 'cycling' ? CYCLE[st.idx] : st.mode === 'locked' ? st.card : null;
    const key = `${st.mode}|${cur}|${pcd > 0 ? Math.ceil(pcd * 4) : 0}|${cd > 0 ? 1 : 0}`;
    if (key === st.hudKey) return;
    st.hudKey = key;
    box.style.display = '';
    const chips = CYCLE.map((k) => `<div class="dh-c${cur === k ? ' on' : ''}${st.mode === 'locked' && cur === k ? ' lock' : ''}" style="color:${hex(k)};border-color:${hex(k)}">${NAMES[k]}</div>`).join('');
    const status = st.mode === 'locked' ? `<span style="color:${hex(st.card)}">${t('LOCKED')}: ${t(NAMES[st.card])} - ${t(EFFECT[st.card])}</span>`
      : st.mode === 'cycling' ? `<span style="color:${hex(CYCLE[st.idx])}">[R] ${t('LOCKED')}</span>`
      : pcd > 0 ? `${t('Cooldown')} ${pcd.toFixed(1)}s` : '[R] ' + t('PICK A CARD');
    box.innerHTML = `<div class="deck-hud"><div class="dh-t">${t('STACKED DECK')}</div><div class="dh-row">${chips}</div><div class="dh-s">${status}</div>${pcd > 0 ? `<div class="dh-b"><i style="width:${Math.round((1 - pcd / PICK_CD) * 100)}%"></i></div>` : ''}</div>`;
  }

  // ---------------------------------------------------------------- Pick a Card
  function reset() { st.mode = 'idle'; st.card = null; st.life = 0; }
  function onR(it) {
    if (st.mode === 'idle') {
      if (st.pickCd > 0) { ctx.snd('wv1_empty', null, 0.5); return; }
      st.mode = 'cycling'; st.idx = 0; st.cyc = 0; st.life = 0;
      ctx.snd('wv1_pick', null, 0.7, 0.9);
      setCard(it, CYCLE[0]);
    } else if (st.mode === 'cycling') lockCard(it);
  }
  function lockCard(it) {
    st.card = CYCLE[st.idx]; st.mode = 'locked';
    ctx.snd(`wv1_${st.card}`, null, 0.8);
    setCard(it, st.card);
    g.engine.flash?.(CARD_COLORS[st.card], 0.08);
  }

  // ---------------------------------------------------------------- throwing
  function throwDeck(it) {
    if (g.time < (g.nextSwing || 0)) return;
    if (st.mode === 'cycling') lockCard(it);
    const kind = st.mode === 'locked' ? st.card : 'std';
    const special = kind !== 'std';
    g.nextSwing = g.time + (special ? SPECIAL.cd : STD.cd);
    g.swingAnim = 0.6;
    g.viewModel?.kick?.('stackeddeck');
    g.engine.punch?.(0.02, 0, 0);
    const fwd = eyeFwd();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(g.camera.quaternion), down = new THREE.Vector3(0, -1, 0).applyQuaternion(g.camera.quaternion);
    const origin = g.camera.position.clone().addScaledVector(fwd, 0.55).addScaledVector(right, 0.14).addScaledVector(down, 0.12);
    const dirs = [];
    if (special) dirs.push(fwd.clone());
    else for (let i = 0; i < STD.count; i++) dirs.push(fwd.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), ((i - (STD.count - 1) / 2) * STD.spreadDeg * PI) / 180).normalize());
    g.net.request('wdeck', { op: 'throw', id: it.id, k: kind });
    ctx.fx('pcard', { kd: kind, o: origin.toArray(), d: dirs.map((d) => [+d.x.toFixed(4), +d.y.toFixed(4), +d.z.toFixed(4)]), id: it.id });
    ctx.bsnd('wv1_card', g.camera.position, 0.8, 0.95 + Math.random() * 0.1);
    g.net.request('noise', { p: g.camera.position.toArray(), loud: 0.5 });
    if (special) { reset(); st.pickCd = PICK_CD; setCard(it, null); }
  }
  ctx.offs.push(mm.on('useItem', (it, hk, gg) => {
    if (gg !== g || hk.handled || !it || it.def?.wfire !== 'deck') return;
    hk.handled = true;
    throwDeck(it);
  }));

  function cardHolder(kind) {
    const card = createCardMesh(kind, kind === 'std' ? 1 : 1.35);
    card.rotation.x = -PI / 2;   // lie flat; the projectile spins it around the world Y axis
    const h = new THREE.Group();
    h.add(card);
    h.userData.dispose = card.userData.dispose;
    return h;
  }
  ctx.onFx('pcard', (d, from) => {
    const mine = !from || from === g.selfId;
    const it = mine ? held() : null;
    const kind = d.kd, col = CARD_COLORS[kind] ?? CARD_COLORS.std;
    const origin = new THREE.Vector3().fromArray(d.o);
    for (const dv of d.d) {
      const dir = new THREE.Vector3().fromArray(dv);
      ctx.proj.spawn({
        mesh: cardHolder(kind), pos: origin.clone(), vel: dir.multiplyScalar(kind === 'std' ? STD.speed : SPECIAL.speed), grav: 0.6, life: 1.3, maxRange: 34, orient: 'card', spin: 30,
        local: mine && !!it, trail: col, trailEvery: kind === 'std' ? 0.03 : 0.018, trailSize: kind === 'std' ? 0.04 : 0.07,
        onCreature: (p, cr) => {
          g.particles?.burst(p.pos, { count: 8, color: [col, 0xffffff], speed: 2.4, up: 0.8, life: 0.4, size: 0.05, gravity: 3, drag: 2 }, null, 1);
          ctx.snd('wv1_cardhit', p.pos.clone(), 0.7);
          if (p.local) { g.net.request('wdeck', { op: 'hit', id: it.id, k: kind, cid: cr.view.id, p: [p.pos.x, p.pos.y, p.pos.z], mul: Math.min(2.5, g.stats.meleeMul || 1) }); g.hitstopT = Math.max(g.hitstopT || 0, 0.03); }
        },
        onWall: (p) => {
          g.particles?.burst(p.pos, { count: 6, color: [col, 0xffffff], speed: 1.6, up: 0.6, life: 0.35, size: 0.045, gravity: 3, drag: 2 }, null, 1);
          if (p.local && kind === 'red') g.net.request('wdeck', { op: 'hit', id: it.id, k: kind, p: [p.pos.x, p.pos.y, p.pos.z], mul: Math.min(2.5, g.stats.meleeMul || 1) });
        },
      });
    }
  });
  ctx.onFx('deckcard', (d) => { if (d.c) deckCards.set(d.id, d.c); else deckCards.delete(d.id); });
  ctx.onFx('goldhit', (d) => { const p = new THREE.Vector3().fromArray(d.p); g.particles?.burst(p, { count: 22, color: [0xffc93a, 0xfff2b0, 0xffffff], speed: 3.2, up: 2, life: 0.7, size: 0.07, gravity: 2, drag: 1.8 }, null, 1); ctx.snd('wv1_gold', p, 0.9); });
  ctx.onFx('redboom', (d) => {
    const p = new THREE.Vector3().fromArray(d.p);
    g.particles?.burst(p, { count: 34, color: [0xff4a3a, 0xff9a5a, 0x8a1208], speed: 5, up: 2.5, life: 0.6, size: 0.09, gravity: 4, drag: 1.6 }, null, 1);
    ctx.snd('wv1_red', p, 1);
    g.engine.shake(Math.max(0, 0.4 - p.distanceTo(g.camera.position) / 30));
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.42, 24), new THREE.MeshBasicMaterial({ color: 0xff4a3a, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    ring.rotation.x = -PI / 2; ring.position.copy(p).add(new THREE.Vector3(0, 0.1, 0));
    g.scene.add(ring);
    let tt = 0;
    const tick = () => { tt += 1 / 60; ring.scale.setScalar(1 + (tt / 0.4) * (RED_RADIUS / 0.4)); ring.material.opacity = 0.85 * (1 - tt / 0.4); if (tt >= 0.4) { ring.removeFromParent(); ring.geometry.dispose(); ring.material.dispose(); } else requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  // BLUE landed (host -> thrower only): mana, or a cooldown refund without a magic module
  ctx.onFx('bluehit', () => {
    if (typeof g.magic?.addMana === 'function') { g.magic.addMana(BLUE_MANA); g.ui.toast(t('Blue card: +25 mana'), 'good'); }
    else { st.pickCd = 0; g.nextSwing = Math.min(g.nextSwing || 0, g.time + 0.15); g.ui.toast(t('Blue card: cooldown refunded'), 'good'); }
    ctx.snd('wv1_blue', null, 0.8);
  });

  // ---------------------------------------------------------------- per-frame
  ctx.update((dt) => {
    const it = held(), isDeck = it?.type === 'stackeddeck', input = g.input;
    st.pickCd = Math.max(0, st.pickCd - dt);
    if (!isDeck || g.player.dead) { if (st.mode !== 'idle') { const old = st.mode; reset(); void old; } renderHud(null); }
    else {
      if (input.enabled && input.codePressed('KeyR')) onR(it);
      if (st.mode === 'cycling') {
        st.life += dt; st.cyc += dt;
        if (st.cyc >= CYCLE_STEP) { st.cyc -= CYCLE_STEP; st.idx = (st.idx + 1) % CYCLE.length; ctx.snd('wv1_pick', null, 0.45, 0.8 + st.idx * 0.25); setCard(it, CYCLE[st.idx]); }
        if (st.life >= CYCLE_MAX) lockCard(it);
      }
      renderHud(it);
    }
    // glow on every deck in the world / in hands (local state for ours, broadcast state for the rest)
    const tt = g.time;
    for (const w of g.items.all()) {
      if (w.type !== 'stackeddeck') continue;
      const ud = w.obj.userData.inner?.userData?.deck;
      if (!ud) continue;
      const mine = w.holder && w.holder === g.selfId;
      const c = mine ? (st.mode === 'cycling' ? CYCLE[st.idx] : st.mode === 'locked' ? st.card : null) : deckCards.get(w.id);
      if (c) { ud.aura.color.setHex(CARD_COLORS[c]); ud.aura.opacity = 0.32 + 0.16 * Math.sin(tt * 9); }
      else ud.aura.opacity = w.state === 'world' ? 0.1 + 0.06 * Math.sin(tt * 2.3) : 0;
      ud.fanGroup.rotation.z = Math.sin(tt * 1.7) * 0.05;
    }
  });
  ctx.onPhase(() => reset());

  // ---------------------------------------------------------------- host
  const tickets = new Map();   // player id -> { n, k, exp }
  ctx.hostOn('wdeck', (d, from) => {
    const it = g.items.get(d.id);
    if (!it || it.holder !== from || it.type !== 'stackeddeck' || !KINDS.includes(d.k)) return;
    const def = it.def, now = g.time * 1000;   // sim time (host rate limit / ticket expiry)
    if (d.op === 'throw') {
      if (now - (it._dlast || 0) < def.cd * 1000 * 0.6) return;
      it._dlast = now;
      tickets.set(from, { n: d.k === 'std' ? STD.count : 1, k: d.k, exp: now + 2600 });
      return;
    }
    if (d.op !== 'hit') return;
    const tk = tickets.get(from);
    if (!tk || tk.n <= 0 || now > tk.exp || tk.k !== d.k) return;
    tk.n--;
    if (!Array.isArray(d.p) || d.p.length < 3 || !d.p.every(Number.isFinite)) return;
    const shooter = g.aiPlayerById?.(from)?.pos;
    const P = new THREE.Vector3().fromArray(d.p);
    if (shooter && shooter.distanceTo(P) > 42) return;
    const mul = Math.max(0.5, Math.min(2.5, Number(d.mul) || 1)) * relMul(it);
    const M = g.creatures;
    const dmgFx = (base, opts = {}) => (it.affix ? applyAffixes(it.affix, { dmg: base, crit: false, cd: def.cd, stun: opts.stun || 0 }) : { dmg: base, stun: opts.stun || 0, crit: false });
    const c = d.cid ? M.host.get(d.cid) : null;
    if (d.k === 'red') {
      g.net.broadcast('fx', { k: 'sh', t: 'redboom', p: d.p });
      M.noise(P, 1.6);
      for (const e of M.host.values()) {
        if (e.dead) continue;
        const dist = Math.hypot(e.pos.x - P.x, (e.pos.y + 0.8) - P.y, e.pos.z - P.z);
        if (dist > RED_RADIUS) continue;
        const r = dmgFx((10 + 9 * (1 - dist / RED_RADIUS)) * mul);
        M.damage(e.id, Math.round(r.dmg), from, { crit: r.crit, stun: r.stun });
        if (!e.dead) { e.slowT = Math.max(e.slowT || 0, e.def?.boss ? RED_SLOW / 2 : RED_SLOW); e.slowMul = RED_SLOW_MUL; }
      }
      return;
    }
    if (!c || c.dead) return;
    if (Math.hypot(c.pos.x - P.x, c.pos.z - P.z) > 3.5) return;
    if (d.k === 'std') {
      const r = dmgFx(def.dmg * mul);
      M.damage(c.id, Math.round(r.dmg), from, { crit: r.crit, stun: r.stun });
    } else if (d.k === 'gold') {
      const r = dmgFx(14 * mul, { stun: GOLD_STUN });
      M.damage(c.id, Math.round(r.dmg), from, { crit: r.crit, stun: Math.max(GOLD_STUN, r.stun) });
      g.net.broadcast('fx', { k: 'sh', t: 'goldhit', p: d.p });
    } else if (d.k === 'blue') {
      const r = dmgFx(22 * mul);
      M.damage(c.id, Math.round(r.dmg), from, { crit: r.crit, stun: r.stun });
      g.net.sendTo(from, 'fx', { k: 'sh', t: 'bluehit' });
    }
  });

  return {
    state: () => ({ mode: st.mode, card: st.card, idx: st.idx, pickCd: st.pickCd }),
    dispose() { box.remove(); style.remove(); },
    // test hooks
    _pick: (it) => onR(it), _st: st,
  };
}
