// Always-visible objective tracker: tells the player what to do next (doubles as the tutorial).
import * as THREE from 'three';
import { MOONS } from './moons.js';
import { isSellable } from './items.js';
import { carriedSalvage29 } from './carried_salvage29.js';
import { insideShip } from '../world/ship.js';
import { bountyText, quotaState } from './progression.js';
import { escapeHtml } from '../core/util.js';
import { greedOn } from './onegoal_core.js';
import { t, tf, addTranslations } from '../core/i18n.js';

addTranslations({
  'AIRLOCK': 'HAVA KİLİDİ',
  'Departure in {n} s — return aboard': 'Kalkışa {n} sn — gemiye dön',
  'Leave the ship through the AIRLOCK': 'HAVA KİLİDİ kapısından gemiden çık',
  'Unload your recovered cargo inside the ship': 'Topladığın yükü geminin içinde yere bırak',
  'Carrying salvage — return through the ship AIRLOCK': 'Ganimet taşıyorsun — geminin HAVA KİLİDİ kapısından dön',
  'Terminal: MOONS / ROUTE': 'Terminal: MOONS / ROUTE',
  'Night is dangerous. Return when ready; pull the ship lever to leave.': 'Gece tehlikeli. Hazır olduğunda dön; kalkmak için geminin kolunu çek.',
  '▮{left} still in here · deep room {m} m · leave when ready': 'İçeride hâlâ ▮{left} var · derin oda {m} m · hazır olduğunda kalk',
  '▮{left} still in here · leave when ready': 'İçeride hâlâ ▮{left} var · hazır olduğunda kalk',
});
addTranslations({
  'AIRLOCK': 'ШЛЮЗ',
  'Departure in {n} s — return aboard': 'Вылет через {n} с — вернитесь на борт',
  'Leave the ship through the AIRLOCK': 'Выйди из корабля через ШЛЮЗ',
  'Unload your recovered cargo inside the ship': 'Выгрузи найденный груз внутри корабля',
  'Carrying salvage — return through the ship AIRLOCK': 'Несёшь добычу — вернись через ШЛЮЗ корабля',
  'Terminal: MOONS / ROUTE': 'Терминал: MOONS / ROUTE',
  'Night is dangerous. Return when ready; pull the ship lever to leave.': 'Ночью опасно. Вернись, когда будешь готов; для вылета потяни рычаг.',
  '▮{left} still in here · deep room {m} m · leave when ready': 'Здесь ещё ▮{left} · глубокая комната в {m} м · вылетай, когда готов',
  '▮{left} still in here · leave when ready': 'Здесь ещё ▮{left} · вылетай, когда готов',
}, 'ru');

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
        else if (shipValue > 0 && !moon?.company && g.onboard?.fr?.wantSell?.(shipValue)) add(tf('Sell your ▮{v} of scrap at the HQ', { v: shipValue }), 'main');   // [firstrun] the first sale beat: sell before landing again
        else if (!moon?.company) add(tf('Land on {moon}: pull the LEVER', { moon: moon?.name || t('a moon') }), 'main');
        else add(t('Pull the LEVER to land at the HQ and sell'), 'main');
        add(t('Terminal: MOONS / ROUTE'), 'hint');
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
          if (nearest && nearest.d > 5) add(tf('Nearby lead: {name} ({d} m) - check it for supplies', { name: nearest.s.name, d: Math.round(nearest.d) }), 'sub').cat = 'other';   // [onegoal] detours never take the goal slot
        }
        const time = run.time || 480;
        if (run.departure38?.seconds > 0) add(tf('Departure in {n} s — return aboard', { n: Math.ceil(run.departure38.seconds) }), 'warn');
        else if (time > 23 * 60) add(t('Night is dangerous. Return when ready; pull the ship lever to leave.'), 'warn');
        else if (time > 21 * 60) add(t('It is getting late. Head back to the ship soon.'), 'warn');
        const today = g.hostData?.dayStats?.collected ?? this.clientCollected();
        const target = quotaState(run, shipValue - today).perDay;   // [econ9] the cash still needed at today's pace: scrap already aboard from earlier days counts (deadline day pays 100 %)
        let left = 0;   // [greed] loot still lying around on the moon (same filter as the host's leftValue)
        if (target <= 0 || today >= target) for (const it of g.items.all()) { if (!it.collected && !it.holder && it.state === 'world' && it.obj && isSellable(it.def) && !it.soulbound && it.type !== 'body' && !insideShip(it.obj.position)) left += it.value || 0; }
        if (!moon?.home && !moon?.expedition && !moon?.company && greedOn(today, target, left)) {   // [greed] the day target is met: leave now or push deeper with the clock visible
          const deep = p.indoor ? (g.world.facility?.bigSpots || []).filter((s) => (s.dist || 0) >= 7) : [];
          const dm = deep.length ? Math.round(Math.min(...deep.map((s) => Math.hypot(s.x - p.pos.x, s.z - p.pos.z)))) : 0;
          add(dm > 5 ? tf('▮{left} still in here · deep room {m} m · leave when ready', { left, m: dm }) : tf('▮{left} still in here · leave when ready', { left }), 'main').greed = true;
        } else if (target <= 0 && need > 0) add(t('Quota covered by the scrap aboard. More scrap is overtime bonus'), 'main', true, 1);
        else add(tf('Bring scrap to the ship: ▮{a} / ▮{b} today', { a: today, b: target }), 'main', today >= target && target > 0, target ? Math.min(1, today / target) : 1);
        const carrying = carriedSalvage29(g).length;
        const fcp = run.fc?.p?.[g.selfId], pv = g.onegoal?.preview?.();
        if (carrying && !p.inShip && pv && pv.net < pv.v && fcp && (fcp[0] > 0 || fcp[1] || fcp[2])) add(tf(fcp[2] ? '▮{v} → ▮{n} (viewer tax)' : '▮{v} → ▮{n} if tagged', { v: pv.v, n: pv.net }), 'sub').lead = true;   // [greed] on camera: the carry line prices being on air
        else if (carrying && !p.inShip) add(p.indoor ? tf(carrying > 1 ? 'Carrying {n} items - get them to the ship' : 'Carrying {n} item - get it to the ship', { n: carrying }) : t('Carrying salvage — return through the ship AIRLOCK'), 'sub').lead = true;   // [onegoal] name the actual outdoor entry, not the hull centre
        if (!p.indoor && g.world.outdoor) {
          const e = g.world.outdoor.mainExit.pos;
          const d = Math.round(Math.hypot(e.x - p.pos.x, e.z - p.pos.z));
          const aboard = p.inShip && !moon?.expedition && !moon?.home && !moon?.company;
          if (aboard && carrying) add(t('Unload your recovered cargo inside the ship'), 'sub').lead = true;
          else if (!this.enteredToday) {
            // A first landing starts aboard: name the nearby airlock before the
            // distant entrance. Special destinations retain their native filter.
            const ent = add(aboard ? t('Leave the ship through the AIRLOCK') : tf('Find the facility entrance ({d} m)', { d }), 'sub');
            if (ent && typeof ent === 'object') ent.first = true;
          }   // [firstrun] 'first' = the one goal shown while budgeted
          else if (!p.inShip) add(tf('Ship: {d} m', { d: Math.round(Math.hypot(p.pos.x, p.pos.z)) }), 'sub').cat = 'other';
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
              if (d > 5) add(tf('Deep haul: high-value room nearby ({d} m)', { d }), 'sub').cat = 'other';
            }
            const vault = (fac.vaultSpots || []).find((s) => !s.opened);
            if (vault) {
              const d = Math.round(Math.hypot(vault.x - p.pos.x, vault.z - p.pos.z));
              if (d > 5 && d < 90) add(tf('Vault route: secured loot {d} m away', { d }), 'sub').cat = 'other';
            }
          }
        }
        for (const it of g.items.all()) {
          if (it.type !== 'body') continue;
          if (it.holder === g.selfId) { if (!insideShip(p.pos)) { add(tf("Carry {name}'s body to the ship (smaller fine)", { name: it.label || t('a crewmate') }), 'sub').lead = true; break; } }
          else if (it.state === 'world' && !insideShip(it.obj.position)) { add(tf("Recover {name}'s body (smaller fine)", { name: it.label || t('a crewmate') }), 'sub'); break; }
        }
        break;
      }
      case 'takeoff': add(t('Taking off...'), 'hint'); break;
      case 'company': {
        if (shipValue > 0) add(tf('Put scrap on the COUNTER, ring the BELL (▮{v} on board)', { v: shipValue }), 'main');
        add(tf('Quota: ▮{a} / ▮{b} · buying at {r}%', { a: run.sold || 0, b: run.quota || 0, r: Math.round((run.buyRate || 0) * 100) }), 'sub', (run.sold || 0) >= (run.quota || 0)).cat = 'other';
        add(tf('Claim what your ◈{c} followers unlocked at Phish Dayı', { c: g.profile.coins }), 'hint');
        break;
      }
      case 'fired': add(t('You have been deplatformed.'), 'warn'); break;
      default: break;
    }
    if (run.phase !== 'moon') this.enteredToday = false;
    else if (moon?.expedition) { try { g.expeditions?.filterLines?.(out); } catch (e) { console.warn('expeditions filter', e); } }   // [expeditions] no facility lines on the special moons
    for (const o of out) o.src = o.src || 'core';   // [onegoal] every line knows its source (module lines are tagged in onegoal.emit)
    try { if (g.onegoal?.emit) g.onegoal.emit(add, g, run.phase); else g.mods?.emit('objectives', add, g, run.phase); } catch (e) { console.warn('objectives hook', e); }   // wave-1 modules add lines here
    for (const b of (g.profile.bounties || []).slice(0, out.length >= 6 ? 0 : 2)) add(`${b.done ? '✔ ' : ''}${bountyText(b)} ${b.done ? t('(claim at HQ)') : `${Math.min(b.progress, b.n)}/${b.n}`}`, 'bounty', b.done, b.n ? Math.min(1, b.progress / b.n) : 0).src = 'bounty';
    // keep the tracker readable: warnings and main goals first, at most 7 lines
    const rank = (o) => (o.pin ? -1 : o.kind === 'warn' ? 0 : o.kind === 'main' ? 1 : o.kind === 'bounty' ? 3 : 2);   // pin: the tutorial step always makes the calm 2-line cut
    if (g.onegoal?.sortAll) return g.onegoal.sortAll(out).slice(0, 10);   // [onegoal] the whole list in priority order (Tab card); update() shows ONE goal (+1 warning)
    const one = g.onboard?.fr?.only;   // [firstrun] a budgeted new player sees ONE goal (+ a warning), never the whole tracker
    if (one) { const kept = one(out); if (kept !== out) return kept; }
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
    const og = this.game.onegoal;   // [onegoal] Standard = ONE goal (+1 warning) for every profile; a budgeted new player gets it even in Full
    const list = og?.shown ? og.shown(all, dens === 'full' && this.game.onboard?.fr?.active?.() ? 'standard' : dens) : dens === 'full' ? all : all.slice(0, dens === 'minimal' ? 1 : 2);
    this.goalSrc = (list.find((o) => o.kind !== 'warn' && o.kind !== 'hint') || {}).src || '';   // [shotfix] the module owning the ONE goal (tasks.js floats a world label only when it is 'tasks')
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
