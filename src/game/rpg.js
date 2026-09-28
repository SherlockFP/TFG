// RPG RUNTIME: roles + passive tree glue.  installRpg(game) -> game.rpg
//
//   game.rpg = {
//     role() -> roleId|null            setRole(id|name) -> bool (orbit only; costs Clout if nodes get orphaned)
//     bonus(key) -> number             role + allocated nodes + dynamic keystones (units: passivetree.js header)
//     has(keystoneId) -> bool          'bloodmagic' | 'packmule' | 'glasscannon' | 'ghoststep' | 'scavengersluck' |
//                                      'ironlungs' | 'adrenalinejunkie' | 'lonewolf'   (case / punctuation insensitive)
//     points() -> unspent skill points open() / close() / toggle() / openRoles()
//     roleOf(peerId)                   role of a crewmate (synced over 'rpgst')
//   }
// Static bonuses live in progression.derivedStats (so game.stats and the TAB sheet agree); this module adds what needs the
// running game: dynamic keystones (Adrenaline Junkie, Lone Wolf), Pack Mule's no-sprint, noise scaling, scrap-value on
// sales, the daily role kit, role name-tag suffix, net sync, K key, ship roster interactable, terminal ROLE / TREE / RESPEC.
// Events: 'tfg:role' (roleId, game) and 'tfg:rpg' (kind, detail, game) on the mod bus.
import * as THREE from 'three';
import { clamp } from '../core/util.js';
import { addTranslations, t, tf } from '../core/i18n.js';
import { ROLES, ROLE_ORDER, NODE, KEYSTONE_NODES, treeBonus, treeFlags, normId, bonusLines, treeSpent } from './passivetree.js';
import { createRpgController } from './rpgctl.js';
import { ensureRpgProfile } from './profile.js';
import { itemDef } from './items.js';
import { createTreePanel } from '../ui/panels/passivetree.js';
import { createRolesPanel } from '../ui/panels/roles.js';

export const TREE_KEY = 'KeyK';

addTranslations({
  'PASSIVE TREE [K]': 'PASİF AĞAÇ [K]', 'Crew roster: choose your role [E]': 'Ekip listesi: rolünü seç [E]', 'Crew roster [E]': 'Ekip listesi [E]',
  'No role yet: press K, then ROLE (or terminal: ROLE <name>).': 'Henüz rolün yok: K tuşuna bas, sonra ROL (ya da terminal: ROLE <isim>).',
  'Passive point available - press K': 'Pasif puan hazır - K tuşuna bas',
});

const ALIASES = { medic: 'medic', fieldmedic: 'medic', doc: 'medic', tech: 'technician', engineer: 'technician', porter: 'hauler', mule: 'hauler', tank: 'enforcer', mage: 'occultist', wizard: 'occultist' };
/** 'Field Medic' / 'medic' / 'tech' -> role id (or null). */
export function resolveRole(name) {
  const n = normId(name);
  if (!n) return null;
  if (ROLES[n]) return n;
  if (ALIASES[n]) return ALIASES[n];
  for (const id of ROLE_ORDER) if (normId(ROLES[id].name) === n || id.startsWith(n) || normId(ROLES[id].name).startsWith(n)) return id;
  return null;
}

const addTo = (d, o) => { for (const [k, v] of Object.entries(o)) d[k] = (d[k] || 0) + v; };

export function installRpg(game) {
  const p = game.profile;
  ensureRpgProfile(p);
  const mods = game.mods;
  const offs = [];
  const st = { disposed: false, cache: null, flags: null, dyn: {}, dynSig: '', dynT: 0, kitDay: new Map(), hint: false };
  const roles = new Map();            // peerId -> { role, sv }   (own entry included once we know our peer id)
  let panelEl = null;

  const phaseOk = (orbitOnly) => {
    const ph = game.run?.phase;
    if (!ph || ph === 'orbit' || (!orbitOnly && ph === 'company')) return { ok: true };
    return { ok: false, msg: orbitOnly ? 'Roles can only be changed while the ship is in orbit.' : 'Refunds and respecs need the ship in orbit (or the HQ).' };
  };
  const toast = (t, kind = 'info') => { try { game.ui?.toast?.(t, kind); } catch { /* ignore */ } };

  const ctl = createRpgController(p, {
    spendCoins: (c) => game.progress.spendCoins(c),
    changed: (kind, detail) => onChanged(kind, detail),
    canRespec: () => phaseOk(false),
    canChangeRole: () => phaseOk(true),
  });

  const tree = () => st.cache || (st.cache = treeBonus(p.rpg));
  const flags = () => st.flags || (st.flags = treeFlags(p.rpg));
  const bonus = (key) => (tree()[key] || 0) + (st.dyn[key] || 0);
  const has = (id) => flags().has(normId(id));

  // ------------------------------------------------------------------ net sync (role for name tags / kits, scrap value for sales)
  const myState = () => ({ role: ctl.role(), sv: Math.round(clamp(game.stats?.valueMul || 1, 0.5, 3) * 1000) / 1000 });
  function sendState(to) {
    const net = game.net;
    if (!net) return;
    const d = myState();
    if (game.selfId) roles.set(game.selfId, d);
    try { if (to) net.sendTo(to, 'rpgst', d); else net.send('rpgst', d); } catch { /* not connected yet */ }
  }
  function onState(d, from) {
    if (!d || typeof d !== 'object' || !from || from === game.selfId) return;
    const role = ROLES[d.role] ? d.role : null;
    const sv = clamp(Number(d.sv) || 1, 0.5, 3);
    const first = !roles.has(from);
    const prev = roles.get(from);
    roles.set(from, { role, sv });
    if (first) sendState(from);   // gossip: a peer we had not heard from learns our role too
    if (prev && prev.role !== role && role) toast(tf('{n} is now a {name}.', { n: game.remotes.get(from)?.name || 'A crewmate', name: ROLES[role].name }), 'info');
  }

  // ------------------------------------------------------------------ change pipeline
  function clampHp() {
    const pl = game.player, s = game.stats;
    if (pl && !pl.dead && s && pl.hp > s.maxHp) pl.hp = s.maxHp;
  }
  function invalidate() { st.cache = null; st.flags = null; st.dynSig = '@'; }
  function onChanged(kind, detail) {
    invalidate();
    game.refreshStats();
    clampHp();
    game.progress.save();
    game.audio?.ui?.(kind === 'role' ? 'ui_confirm' : kind === 'alloc' ? 'ui_confirm' : 'ui_click', 0.5);
    sendState();
    try { mods?.emit('tfg:rpg', kind, detail, game); } catch { /* ignore */ }
    if (kind === 'role') {
      try { mods?.emit('tfg:role', ctl.role(), game); } catch { /* ignore */ }
      const r = ROLES[ctl.role()];
      if (r) { toast(tf('Role: {name}. {tag}', { name: r.name, tag: r.tag }), 'good'); try { game.net?.broadcast?.('chat', { text: `${p.name} is now a ${r.name}.`, n: 'TFG' }); } catch { /* offline */ } }
    }
  }

  // ------------------------------------------------------------------ dynamic keystones (need live game state)
  function computeDyn() {
    const d = {};
    const pl = game.player;
    let sig = '';
    if (pl && !pl.dead) {
      if (has('adrenalinejunkie') && pl.hp < (pl.maxHp || 100) * 0.4) { addTo(d, { moveSpeed: 0.30, meleeDmg: 0.25, staminaRegen: 0.25 }); sig += 'A'; }
      if (has('lonewolf')) {
        let dmin = Infinity;
        for (const r of game.remotes.values()) { if (r.dead || !r.lastUpdate) continue; const dd = r.pos.distanceTo(pl.pos); if (dd < dmin) dmin = dd; }
        if (dmin > 30) { addTo(d, { meleeDmg: 0.2, rangedDmg: 0.2, spellPower: 0.2, moveSpeed: 0.08 }); sig += 'W'; }
        else if (dmin < 10) { addTo(d, { meleeDmg: -0.15, rangedDmg: -0.15, spellPower: -0.15 }); sig += 'N'; }
      }
    }
    return { d, sig };
  }
  function tickDyn(force) {
    const { d, sig } = computeDyn();
    if (!force && sig === st.dynSig) return;
    st.dyn = d; st.dynSig = sig;
    game.refreshStats();
  }

  if (mods?.on) {
    offs.push(mods.on('stats', (s, g) => {
      if (g && g !== game) return;
      const d = st.dyn;
      if (d.meleeDmg) s.meleeMul *= 1 + d.meleeDmg;
      if (d.rangedDmg && s.rangedMul) s.rangedMul *= 1 + d.rangedDmg;
      if (d.moveSpeed) s.speedMul += d.moveSpeed;
      if (d.staminaRegen) s.staminaRegen *= 1 + d.staminaRegen;
    }));
    offs.push(mods.on('update', (dt, g) => {
      if ((g && g !== game) || st.disposed) return;
      st.dynT -= dt;
      if (st.dynT <= 0) { st.dynT = 0.25; tickDyn(false); }
    }));
    offs.push(mods.on('netReady', (net, g) => {
      if (g && g !== game) return;
      net.relayTypes?.add('rpgst');
      net.on_('rpgst', onState);
      offs.push(net.on('peerLeave', (id) => { roles.delete(id); }));
    }));
    offs.push(mods.on('registerHandlers', (H, g) => {
      if (g && g !== game) return;
      H('rpgkit', (d, from) => hostKit(from));
    }));
    offs.push(mods.on('playerJoin', (id, info, g) => { if ((!g || g === game) && game.isHost) sendState(id); }));
    offs.push(mods.on('phase', (ph, g) => {
      if (g && g !== game) return;
      invalidate();
      sendState();
      if (ph === 'moon') {
        const kit = ctl.roleDef()?.kit;
        if (kit) setTimeout(() => { if (!st.disposed && game.run?.phase === 'moon') game.net?.request('rpgkit', {}); }, 1200);
      }
      if (ph === 'orbit' && !ctl.role() && !st.hint) { st.hint = true; setTimeout(() => toast(t('No role yet: press K, then ROLE (or terminal: ROLE <name>).'), 'info'), 2500); }
    }));
    offs.push(mods.on('levelUp', (lv, g) => {
      if (g && g !== game) return;
      setTimeout(() => { if (!st.disposed && ctl.points() > 0) toast(t('Passive point available - press K'), 'info'); }, 1800);
    }));
    offs.push(mods.on('remoteAvatar', (r, dt) => { try { tagRole(r); } catch { /* cosmetic only */ } }));
    offs.push(mods.on('interactables', (out, g) => {
      if (g && g !== game) return;
      const sp = game.ship?.points;
      if (!sp?.bunks || !game.player?.inShip) return;
      const cur = ctl.roleDef();
      out.push({ pos: sp.bunks, r: 0.9, reach: 2.0, label: game.run?.phase === 'orbit' ? t('Crew roster: choose your role [E]') : t('Crew roster [E]'), sub: cur ? tf('Current role: {name}', { name: cur.name }) : t('No role yet'), action: () => api.openRoles() });
    }));
  }
  offs.push(game.on?.('joined', () => sendState()));

  // ------------------------------------------------------------------ daily role kit (host validates, once per day per player)
  function hostKit(from) {
    if (!game.isHost || game.run?.phase !== 'moon') return;
    const role = from === game.selfId ? ctl.role() : roles.get(from)?.role;
    const kit = ROLES[role]?.kit;
    if (!kit) return;
    const day = game.run.day;
    if (st.kitDay.get(from) === day) return;
    const pos = from === game.selfId ? game.player.pos : game.remotes.get(from)?.pos;
    if (!pos || (from !== game.selfId && game.remotes.get(from)?.dead)) return;
    st.kitDay.set(from, day);
    game.items.hostSpawn(kit, pos.clone().add(new THREE.Vector3(0, 1, 0)), { holder: from });
    game.net.sendTo(from, 'sys', { text: `${ROLES[role].name} kit: ${itemDef(kit).name}.`, kind: 'info' });
  }

  // ------------------------------------------------------------------ crew name tags: "Lv.N  ROLE"
  function tagRole(r) {
    const map = r?.tag?.material?.map;
    const cv = map?.image;
    if (!cv || !cv.getContext) return;
    const role = roles.get(r.id)?.role || '';
    if (!role || cv.__rpgRole === role) return;
    cv.__rpgRole = role;
    const ctx = cv.getContext('2d');
    const y = cv.height > 64 ? 79 : 54;
    ctx.clearRect(0, y - 19, 256, 26);
    ctx.font = '20px VT323, monospace';
    ctx.textAlign = 'left';
    const lv = 'Lv.' + (r.level || 1) + '  ';
    const rn = ROLES[role].name.toUpperCase();
    const w1 = ctx.measureText(lv).width, w2 = ctx.measureText(rn).width;
    const x0 = 128 - (w1 + w2) / 2;
    ctx.fillStyle = '#ffd27a'; ctx.fillText(lv, x0, y);
    ctx.fillStyle = ROLES[role].color; ctx.fillText(rn, x0 + w1, y);
    map.needsUpdate = true;
  }

  // ------------------------------------------------------------------ player hooks: Pack Mule (no sprint) + noise scaling / Ghost Step
  const pl = game.player;
  const origUpdate = pl.update;
  let proxyIn = null, proxyFor = null;
  const noSprintInput = (input) => {
    if (proxyFor !== input) {
      proxyFor = input;
      proxyIn = new Proxy(input, {
        get(t, k) {
          if (k === 'isDown') return (a) => (a === 'sprint' ? false : t.isDown(a));
          const v = t[k];
          return typeof v === 'function' ? v.bind(t) : v;
        },
      });
    }
    return proxyIn;
  };
  const wrapped = function (dt, input) {
    const r = origUpdate.call(this, dt, has('packmule') ? noSprintInput(input) : input);
    const nb = bonus('noise');
    if (nb) this.noise *= clamp(1 + nb, 0.05, 1.5);
    if (this.sprinting && has('ghoststep')) this.noise = Math.min(this.noise, 0.04);
    return r;
  };
  pl.update = wrapped;

  // ------------------------------------------------------------------ scrap value: the seller's bonus applies to what they found
  const origSell = game.hostSell;
  if (typeof origSell === 'function') {
    game.hostSell = function (from) {
      const scaled = [];
      try {
        if (this.run?.phase === 'company') {
          for (const it of this.items.all()) {
            if (it.state !== 'world' || it.selling || it.soulbound || it.type === 'body' || !it.lastHolder) continue;
            const sv = it.lastHolder === this.selfId ? clamp(this.stats?.valueMul || 1, 0.5, 3) : (roles.get(it.lastHolder)?.sv || 1);
            if (Math.abs(sv - 1) < 0.001) continue;
            scaled.push([it, it.value]);
            it.value = Math.round(it.value * sv);
          }
        }
      } catch (e) { console.warn('[rpg] sell bonus', e); }
      try { return origSell.call(this, from); } finally { for (const [it, v] of scaled) it.value = v; }   // totals are computed synchronously inside hostSell
    };
  }

  // ------------------------------------------------------------------ K key + panels
  function closePanel() { if (panelEl && game.ui?.panelOpen === panelEl) game.ui.closePanel(); panelEl = null; }
  function open() {
    const ui = game.ui;
    if (!ui?.openPanel || typeof document === 'undefined') return null;
    const t = createTreePanel({ game, ctl: api, profile: p, onClose: () => { panelEl = null; ui.closePanel(); } });
    panelEl = t.el;
    ui.openPanel(t.el);
    game.audio?.ui?.('ui_click', 0.5);
    return t;
  }
  function openRoles() {
    const ui = game.ui;
    if (!ui?.openPanel || typeof document === 'undefined') return null;
    const r = createRolesPanel({ game, ctl: api, profile: p, onClose: () => { panelEl = null; ui.closePanel(); } });
    panelEl = r.el;
    ui.openPanel(r.el);
    return r;
  }
  function toggle() {
    if (panelEl && game.ui?.panelOpen === panelEl) { closePanel(); return; }
    open();
  }
  const onKey = (e) => {
    if (e.code !== TREE_KEY || e.repeat || st.disposed || game.destroyed || !game.run) return;
    const tg = e.target?.tagName;
    if (tg === 'INPUT' || tg === 'TEXTAREA') return;
    if (game.input?.isTyping?.() || game.minigame || game.terminal?.active || game.ui?.chatOpen) return;
    if (game.ui?.panelOpen && game.ui.panelOpen !== panelEl) return;
    e.preventDefault();
    toggle();
  };
  if (typeof window !== 'undefined') window.addEventListener('keydown', onKey);

  // ------------------------------------------------------------------ public API
  const api = {
    ...ctl,
    role: () => ctl.role(),
    roleDef: () => ctl.roleDef(),
    setRole(id) {
      const rid = resolveRole(id);
      if (!rid) return false;
      const r = ctl.setRole(rid);
      if (!r.ok) toast(r.msg, 'bad');
      return r.ok;
    },
    trySetRole: (id) => ctl.setRole(resolveRole(id) || id),
    bonus, has,
    flags: () => new Set(flags()),
    points: () => ctl.points(),
    roleOf: (peerId) => (peerId === game.selfId || !peerId ? ctl.role() : roles.get(peerId)?.role || null),
    open, close: closePanel, toggle, openRoles,
    isOpen: () => !!panelEl && game.ui?.panelOpen === panelEl,
    ROLES, KEYSTONES: KEYSTONE_NODES.map((n) => n.id),
    dispose() {
      if (st.disposed) return;
      st.disposed = true;
      for (const o of offs) { try { o?.(); } catch { /* ignore */ } }
      offs.length = 0;
      if (typeof window !== 'undefined') window.removeEventListener('keydown', onKey);
      if (pl.update === wrapped) delete pl.update;
      if (typeof origSell === 'function' && Object.prototype.hasOwnProperty.call(game, 'hostSell')) delete game.hostSell;
      closePanel();
    },
  };

  // ------------------------------------------------------------------ terminal: ROLE / TREE / RESPEC
  const KA = typeof window !== 'undefined' ? window.KefalAPI : null;
  if (KA?.registerCommand) {
    KA.registerCommand('role', (rest, term, g) => {
      const R = g?.rpg;
      if (!R) return;
      const arg = rest.filter((w) => w !== 'confirm').join(' ');
      const confirm = rest.includes('confirm');
      if (!arg) {
        const cur = R.role();
        const out = [`ROLES (yours: ${cur ? ROLES[cur].name.toUpperCase() : 'NONE'}):`];
        for (const id of ROLE_ORDER) { const r = ROLES[id]; out.push(`${id === cur ? '*' : ' '} ${r.name.toUpperCase().padEnd(12)} ${r.tag}`, `    ${bonusLines(r.bonus).map((l) => l.text).join(', ')} | kit: ${itemDef(r.kit).name}`); }
        out.push('', 'ROLE <name> to switch (ship in orbit only). Full tree: press K.');
        term.print(out.join('\n'));
        return;
      }
      const rid = resolveRole(arg);
      if (!rid) { term.print(t('Unknown role. Type ROLE for the list.'), 'err'); return; }
      const pv = R.previewRole(rid);
      if (!pv.current && pv.clout > 0 && !confirm) { term.print(tf('Switching to {name} un-links {length} passive node(s): they are refunded for ◈{clout}. Type ROLE {n} CONFIRM to proceed.', { name: ROLES[rid].name, length: pv.orphans.length, clout: pv.clout, n: rid.toUpperCase() })); return; }
      const res = R.trySetRole(rid);
      term.print(res.msg, res.ok ? '' : 'err');
    }, 'ROLE [name]  show / pick your crew role (orbit only)');
    KA.registerCommand('tree', (rest, term, g) => {
      const R = g?.rpg;
      if (!R) return;
      const b = treeBonus(g.profile.rpg);
      const ks = KEYSTONE_NODES.filter((n) => R.has(n.id)).map((n) => n.name);
      const lines = bonusLines(b).map((l) => `  ${l.text}`);
      term.print([`PASSIVE TREE: role ${R.role() ? ROLES[R.role()].name : 'none'} | ${R.points()} points free | ${treeSpent(g.profile.rpg)} spent | ${g.profile.rpg.nodes.length} nodes`,
        ks.length ? `Keystones: ${ks.join(', ')}` : 'Keystones: none', ...lines, '', 'Press K (outside the terminal) to open the tree.'].join('\n'));
    }, 'TREE  passive tree summary (open it with K)');
    KA.registerCommand('respec', (rest, term, g) => {
      const R = g?.rpg;
      if (!R) return;
      const cost = R.respecCost();
      if (rest[0] !== 'confirm') { term.print(tf('RESPEC refunds every passive node ({treeSpent} points) for ◈{cost}. Type RESPEC CONFIRM.', { treeSpent: treeSpent(g.profile.rpg), cost })); return; }
      const res = R.respecAll();
      term.print(res.msg, res.ok ? '' : 'err');
    }, 'RESPEC [CONFIRM]  refund the whole passive tree (Clout)');
  }

  // old saves: announce the skill refund once
  if (p.rpg.migrated && !p.rpg.migrated.shown) {
    setTimeout(() => {
      if (st.disposed) return;
      toast(tf('Your {skills} old skill point(s) were refunded. Spend them in the Passive Tree (K).', { skills: p.rpg.migrated.skills }), 'good');
      p.rpg.migrated.shown = true; game.progress.save();
    }, 5000);
  }
  invalidate();
  return api;
}
