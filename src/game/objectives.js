// Always-visible objective tracker: tells the player what to do next (doubles as the tutorial).
import * as THREE from 'three';
import { MOONS } from './moons.js';
import { isSellable } from './items.js';
import { insideShip } from '../world/ship.js';
import { bountyText } from './progression.js';
import { escapeHtml } from '../core/util.js';
import { t, tf } from '../core/i18n.js';

export class Objectives {
  constructor(game) {
    this.game = game;
    this.el = document.createElement('div');
    this.el.className = 'objectives';
    document.getElementById('ui').appendChild(this.el);
    this.t = 0;
    this.last = '';
  }

  compute() {
    const g = this.game, run = g.run || {}, p = g.player;
    const out = [];
    const add = (text, kind = 'main', done = false, progress = null) => { const o = { text, kind, done, progress }; out.push(o); return o; };
    const moon = MOONS[run.moon];
    let shipValue = 0;
    for (const it of g.items.inShipItems()) if (isSellable(it.def) && !it.soulbound) shipValue += it.value;
    const need = Math.max(0, (run.quota || 0) - (run.sold || 0));
    if (p.dead) { add(t('You are dead. Spectate and help your crew (ping with P).'), 'warn'); return out; }
    switch (run.phase) {
      case 'orbit': {
        if (run.daysLeft <= 0 && !moon?.company) add(t('DEADLINE! Route to 0-Algorithm HQ: terminal → ROUTE HQ'), 'warn');
        else if (!moon?.company) add(tf('Land on {moon}: pull the LEVER', { moon: moon?.name || t('a moon') }), 'main');
        else add(t('Pull the LEVER to land at the HQ and sell'), 'main');
        add(t('Terminal: MOONS / ROUTE / STORE / BUY'), 'hint');
        if (run.weekly) add(tf('WEEKLY {key}: score ▮{score} · quotas {quotas}', { key: run.weekly.key, score: run.weekly.score || 0, quotas: run.weekly.quotas || 0 }), 'hint');
        if (shipValue > 0 && run.daysLeft <= 1) add(tf('Sell your ▮{v} of scrap at the HQ', { v: shipValue }), 'main');
        break;
      }
      case 'landing': break;   // the HUD landing briefing card (hud.js) covers this phase
      case 'moon': {
        const op = g.world.outdoor?.outposts;
        if (!p.indoor && op?.sites?.length) {
          const nearest = op.sites.reduce((best, s) => {
            const d = Math.hypot(s.x - p.pos.x, s.z - p.pos.z);
            return !best || d < best.d ? { s, d } : best;
          }, null);
          if (nearest && nearest.d > 5) add(tf('Nearby lead: {name} ({d} m) - check it for supplies', { name: nearest.s.name, d: Math.round(nearest.d) }), 'sub');
        }
        const time = run.time || 480;
        if (time > 23 * 60) add(t('THE SHIP LEAVES AT MIDNIGHT - RUN BACK NOW'), 'warn');
        else if (time > 21 * 60) add(t('It is getting late. Head back to the ship soon.'), 'warn');
        const target = Math.ceil(need / Math.max(1, run.daysLeft));
        const today = g.hostData?.dayStats?.collected ?? this.clientCollected();
        add(tf('Bring scrap to the ship: ▮{a} / ▮{b} today', { a: today, b: target }), 'main', today >= target && target > 0, target ? Math.min(1, today / target) : 1);
        const carrying = p.slots.filter((id) => id && isSellable(g.items.get(id)?.def || {})).length;
        if (carrying && !p.inShip) add(tf(carrying > 1 ? 'Carrying {n} items - get them to the ship' : 'Carrying {n} item - get it to the ship', { n: carrying }), 'sub');
        if (!p.indoor && g.world.outdoor) {
          const e = g.world.outdoor.mainExit.pos;
          const d = Math.round(Math.hypot(e.x - p.pos.x, e.z - p.pos.z));
          if (!this.enteredToday) add(tf('Find the facility entrance ({d} m)', { d }), 'sub');
          else if (!p.inShip) add(tf('Ship: {d} m', { d: Math.round(Math.hypot(p.pos.x, p.pos.z)) }), 'sub');
        }
        if (p.indoor) {
          this.enteredToday = true;
          add(t('Scan (right click) to find scrap and creatures'), 'hint');
          const fac = g.world.facility;
          // Give the player a reason to push deeper than the first handful of rooms.
          // These are navigation hints only; the actual loot remains server-authoritative.
          if (fac) {
            const deep = (fac.bigSpots || []).filter((s) => (s.dist || 0) >= 7);
            if (deep.length) {
              const s = deep.reduce((a, b) => Math.hypot(a.x - p.pos.x, a.z - p.pos.z) < Math.hypot(b.x - p.pos.x, b.z - p.pos.z) ? a : b);
              const d = Math.round(Math.hypot(s.x - p.pos.x, s.z - p.pos.z));
              if (d > 5) add(tf('Deep haul: high-value room nearby ({d} m)', { d }), 'sub');
            }
            const vault = (fac.vaultSpots || []).find((s) => !s.opened);
            if (vault) {
              const d = Math.round(Math.hypot(vault.x - p.pos.x, vault.z - p.pos.z));
              if (d > 5 && d < 90) add(tf('Vault route: secured loot {d} m away', { d }), 'sub');
            }
          }
        }
        for (const it of g.items.all()) {
          if (it.type !== 'body') continue;
          if (it.holder === g.selfId) { if (!insideShip(p.pos)) { add(tf("Carry {name}'s body to the ship (smaller fine)", { name: it.label || t('a crewmate') }), 'sub'); break; } }
          else if (it.state === 'world' && !insideShip(it.obj.position)) { add(tf("Recover {name}'s body (smaller fine)", { name: it.label || t('a crewmate') }), 'sub'); break; }
        }
        break;
      }
      case 'takeoff': add(t('Taking off...'), 'hint'); break;
      case 'company': {
        if (shipValue > 0) add(tf('Put scrap on the COUNTER, ring the BELL (▮{v} on board)', { v: shipValue }), 'main');
        add(tf('Quota: ▮{a} / ▮{b} · buying at {r}%', { a: run.sold || 0, b: run.quota || 0, r: Math.round((run.buyRate || 0) * 100) }), 'sub', (run.sold || 0) >= (run.quota || 0));
        add(tf('Spend your ◈{c} clout at Phish Dayı', { c: g.profile.coins }), 'hint');
        break;
      }
      case 'fired': add(t('You have been deplatformed.'), 'warn'); break;
      default: break;
    }
    if (run.phase !== 'moon') this.enteredToday = false;
    try { g.mods?.emit('objectives', add, g, run.phase); } catch (e) { console.warn('objectives hook', e); }   // wave-1 modules add lines here
    for (const b of (g.profile.bounties || []).slice(0, out.length >= 6 ? 0 : 2)) add(`${b.done ? '✔ ' : ''}${bountyText(b)} ${b.done ? t('(claim at HQ)') : `${Math.min(b.progress, b.n)}/${b.n}`}`, 'bounty', b.done, b.n ? Math.min(1, b.progress / b.n) : 0);
    // keep the tracker readable: warnings and main goals first, at most 7 lines
    const rank = (o) => (o.pin ? -1 : o.kind === 'warn' ? 0 : o.kind === 'main' ? 1 : o.kind === 'bounty' ? 3 : 2);   // pin: the tutorial step always makes the calm 2-line cut
    return out.map((o, i) => [o, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).slice(0, 7).map((x) => x[0]);
  }

  clientCollected() {
    // clients do not have hostData: estimate from items flagged collected in the ship
    let v = 0;
    for (const it of this.game.items.inShipItems()) if (it.collected && isSellable(it.def)) v += it.value;
    return v;
  }

  update(dt) {
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.5;
    const all = this.compute();
    this.full = all;   // [hudcalm] the Tab status card shows every line; the HUD keeps 1 (Minimal) / 2 (Standard) / 7 (Full)
    const dens = document.documentElement.dataset.hud;
    const list = dens === 'full' ? all : all.slice(0, dens === 'minimal' ? 1 : 2);
    const html = list.map((o) => `<div class="obj ${o.kind}${o.done ? ' done' : ''}"><span class="obj-dot">${o.done ? '✔' : o.kind === 'warn' ? '!' : '◆'}</span>${escapeHtml(o.text)}${o.progress !== null && !o.done ? `<div class="obj-bar"><div style="width:${Math.round(o.progress * 100)}%"></div></div>` : ''}</div>`).join('');
    if (html !== this.last) { this.el.innerHTML = html; this.last = html; }
    const hidden = this.game.ui.hud?.el.classList.contains('hidden');
    this.el.style.display = hidden ? 'none' : '';
    // sit below the top-left HUD block (health, stamina, run chips), which grows with the daily-event chip
    const tl = !hidden && this.game.ui.hud?.el.querySelector('.hud-tl');
    if (tl) { const top = Math.max(205, Math.round(tl.getBoundingClientRect().bottom + 14)); if (top !== this.top) { this.top = top; this.el.style.top = top + 'px'; } }
    if (!hidden) this.fitAboveDock();
  }

  // [checkup] the list grows down from the top-left block while the left HUD dock (pickup feed, buffs, Level 0 card...) grows
  // up from bottom:170px: at 1280x720 a long list ran into it (overlapping text). Hide the lowest lines that would collide.
  fitAboveDock() {
    const rows = this.el.children;
    const dock = (this._dockEl?.isConnected ? this._dockEl : (this._dockEl = document.querySelector('.hud-dock-left')));   // [perf3] cached ref
    const dr = dock?.getBoundingClientRect();
    const limit = dr && dr.height > 4 ? dr.top - 8 : innerHeight - 178;
    const key = this.last + '|' + Math.round(limit) + '|' + this.top;   // [perf3] same rows + same limit as last pass: nothing to re-measure (unhide/measure/hide = 2+ forced layouts)
    if (key === this._fitKey) return;
    this._fitKey = key;
    for (const r of rows) r.style.display = '';
    let cut = false;
    for (const r of rows) { if (!cut && r !== rows[0] && r.getBoundingClientRect().bottom > limit) cut = true; if (cut) r.style.display = 'none'; }
  }

  dispose() { this.el.remove(); }
}
