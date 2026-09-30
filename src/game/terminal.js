// The ship terminal (Lethal-Company-style typed commands). UI is a DOM overlay; side-effect commands
// are executed by the host (hostExecute) which replies with text.
import { MOONS, MOON_ORDER, WEATHER } from './moons.js';
import { ensureSector, sectorMoons, INTERIOR_NAMES, MODIFIERS, biomeName } from './moongen.js';
import * as FACILITY from '../world/facility.js';
import { RNG, hashString } from '../core/rng.js';
import { ITEMS, STORE_ITEMS, SHIP_UPGRADES, itemDef, isSellable } from './items.js';
import { CREATURES } from './creatures.js';
import { poolFor } from './threatpool.js';   // [threatmerge]
import { buyRate } from './progression.js';
import { insideShip } from '../world/ship.js';
import { dropPoint } from '../world/shiplayout.js';
import { copyJoinLink } from '../net/joinlink.js';   // [joinplay]
import { escapeHtml } from '../core/util.js';
const n0 = (v) => Math.round(v || 0).toLocaleString('en-US');   // credits are always shown with thousands separators (docs/wave8/studio_style.md)
import { t, tf, tfIn, sysMsg } from '../core/i18n.js';
import { tNum } from '../i18n/tnum.js';   // [i18n8] safety net for literal terminal lines that were not wrapped
import { LAB_HINT } from './labyrinths_core.js';   // [labyrinths]

const BANNER = [
  '  _  _______ _____ _    _',
  ' | |/ / ____|  ___/ \\  | |',
  " | ' /|  _| | |_ / _ \\ | |",
  ' | . \\| |___|  _/ ___ \\| |___',
  ' |_|\\_\\_____|_|/_/   \\_\\_____|',
  '     TFG OS v4.1  -  "Engagement is love."',
];

// ------------------------------------------------------------------ moon helpers (handcrafted + generated sector)
const interiorName = (id) => t(FACILITY.INTERIOR_NAMES?.[id] || INTERIOR_NAMES[id] || id);
const sizeLabel = (s) => (s < 1.3 ? 'S' : s < 1.7 ? 'M' : s < 2.1 ? 'L' : 'XL');
const riskBar = (m) => { const n = Math.max(1, Math.min(5, Math.round(m.riskScore ?? m.tier ?? 1))); return '[' + '#'.repeat(n) + '-'.repeat(5 - n) + ']'; };
const weatherName = (run, m) => WEATHER[run.forecast?.[m.id] || 'clear']?.name || t('Clear');
const costText = (m) => (m.cost ? '▮' + m.cost : t('FREE'));
// every moon the autopilot can fly to right now (generated moons of older sectors are gone)
const routable = () => MOON_ORDER.map((id) => MOONS[id]).filter((m) => m && !m.stale);
const moonKey = (m) => m.name.replace(/^[^-]+-/, '') + ' ' + m.id + ' ' + m.name + ' ' + (m.short || '') + ' ' + (m.$name || '');
function findMoon(q) {
  q = String(q || '').trim();
  const slot = /^#?([1-9])$/.exec(q);
  if (slot) { const m = sectorMoons()[+slot[1] - 1]; if (m) return m; }
  return fuzzyFind(routable(), q, moonKey);
}

function fuzzyFind(list, q, key = (x) => x) {
  q = q.toLowerCase().replace(/[^a-z0-9а-яёçğıöşü]/g, '');
  if (!q) return null;
  return list.find((x) => key(x).toLowerCase().replace(/[^a-z0-9а-яёçğıöşü]/g, '').startsWith(q))
    || list.find((x) => key(x).toLowerCase().replace(/[^a-z0-9а-яёçğıöşü]/g, '').includes(q));
}

export class Terminal {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.lines = [];
    this.pending = null;
    this.history = [];
    this.histIdx = -1;
    this.el = null;
    this.radarTarget = null;
  }

  ensureDom() {
    if (this.el) return;
    const el = document.createElement('div');
    el.className = 'terminal hidden';
    el.innerHTML = `<div class="term-screen"><div class="term-code"></div><div class="term-head"></div><div class="term-out"></div><div class="term-line"><span class="term-prompt">&gt;</span><input class="term-in" spellcheck="false" autocomplete="off" maxlength="80"/></div></div><div class="term-hint">${escapeHtml(t('[ESC] leave terminal · type HELP'))}</div>`;
    document.getElementById('ui').appendChild(el);
    this.el = el;
    this.out = el.querySelector('.term-out'); this.head = el.querySelector('.term-head');
    this.codeEl = el.querySelector('.term-code');   // [joinplay] lobby code stays visible while in a run; click copies the join link
    this.codeEl.addEventListener('click', () => copyJoinLink(this.game.ui, this.game));
    this.inp = el.querySelector('.term-in');
    this.inp.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { const v = this.inp.value; this.inp.value = ''; this.submit(v); }
      else if (e.key === 'Escape') this.close();
      else if (e.key === 'Tab') e.preventDefault();   // keep focus (and the caret) in the terminal
      else if (e.key === 'ArrowUp') { if (this.history.length) { this.histIdx = Math.max(0, (this.histIdx < 0 ? this.history.length : this.histIdx) - 1); this.inp.value = this.history[this.histIdx]; } e.preventDefault(); }
      else if (e.key === 'ArrowDown') { if (this.histIdx >= 0) { this.histIdx = Math.min(this.history.length, this.histIdx + 1); this.inp.value = this.history[this.histIdx] || ''; } e.preventDefault(); }
      else this.game.sfx(this.game.audio.variant('terminal_key', 3), 0.25);
    });
    el.addEventListener('mousedown', () => setTimeout(() => this.inp.focus(), 0));
  }

  open() {
    this.ensureDom();
    if (this.active) return;
    this.active = true;
    this.game.input.unlock();
    this.el.classList.remove('hidden');
    if (this.codeEl && this.game.net?.code) this.codeEl.textContent = tf('LOBBY {code}', { code: this.game.net.code }) + '  [' + t('Copy join link') + ']';
    if (!this.lines.length) { this.print(BANNER.join('\n'), 'banner'); this.print(t('Company terminal online. Type HELP.')); }
    this.render();
    setTimeout(() => this.inp.focus(), 30);
    this.game.sfx('terminal_enter', 0.4);
    this.game.player.frozen = true;
  }
  close() {
    if (!this.active) return;
    this.active = false;
    this.el?.classList.add('hidden');
    this.inp?.blur();
    this.game.player.frozen = false;
    if (!this.game.player.dead) this.game.input.lock();
  }

  print(text, cls = '') {
    for (const line of String(text).split('\n')) this.lines.push({ text: tNum(line), cls });
    if (this.lines.length > 400) this.lines.splice(0, this.lines.length - 400);
    this.render();
    this.game.shipScreens?.markTerminalDirty();
  }
  clear() { this.lines = []; this.render(); }
  /** [algoslot] QUOTA / CREDITS / ROUTE moved here from the top bar: one status line above the output */
  headText() {
    const run = this.game.run;
    if (!run) return '';
    let s = `${t('QUOTA')} ▮${run.sold ?? 0}/${run.quota ?? 0} · ${run.daysLeft ?? 3} ${t('DAYS LEFT')} · ${t('CREDITS')} ▮${run.credits ?? 0}`;
    if (run.phase === 'orbit') s += ` · ${t('ROUTE')}: ${MOONS[run.moon]?.name || '-'}`;
    else if (run.phase === 'company') s += ` · ${t('BUYING AT')} ${Math.round((run.buyRate || 0) * 100)}%`;
    return s;
  }
  render() {
    if (!this.out) return;
    if (this.head) { const h = this.headText(); if (this.head.textContent !== h) this.head.textContent = h; }
    const html = this.lines.slice(-120).map((l) => `<div class="tl ${l.cls}">${escapeHtml(l.text) || '&nbsp;'}</div>`).join('');
    this.out.innerHTML = html;
    this.game.ui?.decorateTerminal?.(this.out);
    this.out.scrollTop = this.out.scrollHeight;
  }

  submit(raw) {
    const cmd = raw.trim();
    if (!cmd) return;
    this.history.push(cmd); this.histIdx = -1;
    this.print('> ' + cmd, 'echo');
    this.game.sfx('terminal_enter', 0.4);
    try { this.exec(cmd); } catch (e) { console.error(e); this.print(t('ERROR') + ': ' + e.message, 'err'); }
  }

  exec(cmd) {
    const g = this.game;
    const run = g.run || {};
    const [w0, ...rest] = cmd.toLowerCase().split(/\s+/);
    const arg = rest.join(' ');
    // mod commands
    if (g.mods?.terminalCommand(w0, rest, this)) return;
    if (this.pending && (w0 === 'confirm' || w0 === 'c' || w0 === 'yes' || w0 === 'y')) {
      const p = this.pending; this.pending = null;
      g.net.request('term', { cmd: p });
      return;
    }
    if (this.pending && (w0 === 'deny' || w0 === 'd' || w0 === 'no' || w0 === 'n')) { this.pending = null; this.print(t('Cancelled.')); return; }
    this.pending = null;
    switch (w0) {
      case 'help': case '?':
        this.print([
          t('>MOONS        route board (MOONS ALL: the full list)'),   // [routeboard]
          t('>SECTOR       map of the current uncharted sector'),
          t('>INFO <moon>  details: biome, interior, risk, modifiers'),
          t('>ROUTE <moon> set the autopilot destination (or ROUTE #2)'),
          t('>STORE        open the Company Store (STORE LIST: plain text)'),
          t('>BUY <item> [n]'),
          t('>BUY VAN      order the Uplink Van (4 seats + cargo bed)'),
          t('>SCAN         scrap remaining on this moon'),
          t('>QUOTA        quota, deadline, credits'),
          t('>CREW         crew status'),
          t('>BESTIARY     creature entries  (>BESTIARY <name>)'),
          t('>SWITCH [name] change the radar target'),
          t('>CODES        list secure door / turret / mine codes'),
          t('><code>       toggle a secure door or disable a turret/mine (e.g. A3)'),
          t('>TRANSMIT <msg>  (Signal Translator)'),
          t('>TELEPORT [name] (Teleporter)'),
          t('>CLEAR'),
        ].join('\n'));
        return;
      case 'clear': this.clear(); return;
      case 'moons': case 'moon': {
        const sector = ensureSector(run);
        const out = [t('CURRENT ROUTE') + ': ' + (MOONS[run.moon]?.name || '-'), ''];
        if (run.dailyEvent) out.push(tf('TODAY: {name} - {desc}', { name: t(run.dailyEvent.name), desc: t(run.dailyEvent.desc) }), '');
        out.push(t('CHARTED MOONS:'));
        for (const id of MOON_ORDER) {
          const m = MOONS[id];
          if (!m || m.generated) continue;
          const w = m.company ? '' : ` (${weatherName(run, m)})`;
          const rate = m.company ? '  ' + tf('buying at {r}%', { r: Math.round(buyRate(run.daysLeft, run.buyRnd) * 100) }) : '';
          out.push(`* ${m.name.padEnd(14)} ${m.company ? '' : 'T' + m.tier} ${costText(m)}${w}${rate}${g.routeboard?.lockTag?.(m) || ''}`);   // [routeboard] campaign ladder
        }
        const gen = sectorMoons();
        if (gen.length) {
          out.push('', tf('UNCHARTED: {name}  ({n} servers)', { name: sector?.name || t('SECTOR'), n: gen.length }));
          gen.forEach((m, i) => {
            const cur = m.id === run.moon ? '>' : '*';
            out.push(`${cur} #${i + 1} ${m.name.padEnd(28)} T${m.tier} ${costText(m).padEnd(6)} (${weatherName(run, m)}) ${t(m.risk)}${g.routeboard?.lockTag?.(m) || ''}`);
            out.push(`       ${t(biomeName(m.biome))} / ${interiorName(m.interior)} / ${sizeLabel(m.size)}${m.mods.length ? '  +' + m.mods.map((k) => MODIFIERS[k]?.name || k).join(' +') : ''}`);
          });
          out.push('', t('Type SECTOR for the map, INFO <moon> for details.'));
        }
        this.print(out.join('\n'));
        return;
      }
      case 'sector': case 'map': {
        this.printSector(run);
        return;
      }
      case 'info': {
        ensureSector(run);
        const m = arg ? findMoon(arg) : MOONS[run.moon];
        if (!m) { this.print(t('Unknown moon. Type MOONS.'), 'err'); return; }
        this.print(this.moonInfo(m, run));
        return;
      }
      case 'route': case 'r': {
        ensureSector(run);
        const moon = findMoon(arg);
        if (!moon) { this.print(t('Unknown moon. Type MOONS (or SECTOR for uncharted servers).'), 'err'); return; }
        if (run.phase !== 'orbit') { this.print(t('Routing is only possible while in orbit.'), 'err'); return; }
        if (moon.id === run.moon) { this.print(tf('Already routed to {name}.', { name: moon.name })); return; }
        this.pending = { op: 'route', moon: moon.id };
        const rcost = g.shipyard?.routeFee ? g.shipyard.routeFee(moon, !!g.config?.freeTravel) : (g.config?.freeTravel ? 0 : moon.cost);   // [shipyard] +5 % per module
        this.print(`${tf('Route the autopilot to {name}?', { name: moon.name })} ${rcost ? tf('It will cost ▮{c}.', { c: rcost }) : t('Free travel.')}\n${this.moonInfo(moon, run, true)}\n${tf('Credits: ▮{c}', { c: n0(run.credits) })}${run.credits < rcost ? '  ' + t('(NOT ENOUGH)') : ''}\n\n${t('Type CONFIRM or DENY.')}`);
        return;
      }
      case 'store': case 'shop': {
        // the Company Store screen (game/shop.js + ui/panels/shop.js); STORE LIST / STORE TEXT keeps the plain text list
        if (g.shop?.open && arg !== 'list' && arg !== 'text') {
          this.close();
          g.shop.open(arg || undefined, { from: 'terminal' });
          return;
        }
        if (g.shop?.textList) { const out = g.shop.textList(); out.splice(out.length - 1, 0, ...(g.cruiser?.storeLines?.() || [])); this.print(out.join('\n')); return; }
        const out = [t('Company Store. Delivery is instant. The fee is not mentioned.'), ''];
        for (const id of STORE_ITEMS) { const d = ITEMS[id]; if (d) out.push(`* ${d.name.padEnd(18)} ▮${d.price}`); }
        out.push('', t('SHIP UPGRADES:'));
        for (const [id, u] of Object.entries(SHIP_UPGRADES)) { if (u.owned) continue; out.push(`* ${u.name.padEnd(18)} ▮${u.price}${run.upgrades?.[id] ? '  [' + t('INSTALLED') + ']' : ''}`); }
        out.push(...(g.cruiser?.storeLines?.() || []));
        out.push('', t('Personal gear, armor and cosmetics: visit Phish Dayı at 0-Algorithm HQ.'));
        this.print(out.join('\n'));
        return;
      }
      case 'buy': {
        const m = arg.match(/^(.*?)(?:\s+(\d+))?$/);
        const q = (m?.[1] || '').trim();
        const n = Math.max(1, Math.min(10, parseInt(m?.[2] || '1', 10)));
        if (g.cruiser?.terminalBuy?.(q, this)) return;
        const up = fuzzyFind(Object.entries(SHIP_UPGRADES), q, ([id, u]) => u.name + ' ' + (u.$name || '') + ' ' + id);
        // data-driven stock (game/shop.js): every registered item with a price + shop category, at today's deal prices
        const pool = g.shop?.buyables ? g.shop.buyables().map((e) => ({ ...e.def, price: e.price })) : STORE_ITEMS.map((id) => ITEMS[id]);
        const it = fuzzyFind(pool, q, (d) => d.name + ' ' + (d.$name || '') + ' ' + d.id);
        if (it && (!up || it.name.toLowerCase().startsWith(q))) {
          const cost = it.price * n;
          this.pending = { op: 'buy', item: it.id, n };
          this.print(`${tf('Order {n}x {name} for ▮{cost}? Credits: ▮{c}', { n, name: it.name, cost, c: run.credits })}\n${t('Type CONFIRM or DENY.')}`);
          return;
        }
        if (up) {
          const [id, u] = up;
          if (run.upgrades?.[id]) { this.print(t('Already installed.')); return; }
          this.pending = { op: 'upgrade', id };
          this.print(`${tf('Install {name} for ▮{price}? {desc}', { name: u.name, price: u.price, desc: u.desc })}\n${t('Type CONFIRM or DENY.')}`);
          return;
        }
        this.print(t('Unknown item. Type STORE.'), 'err');
        return;
      }
      case 'scan': {
        if (run.phase !== 'moon') { this.print(t('Nothing to scan. Land on a moon first.')); return; }
        let n = 0, v = 0;
        for (const it of g.items.all()) {
          if (it.state !== 'world' || !isSellable(it.def) || insideShip(it.obj.position) || it.soulbound) continue;
          n++; v += it.value;
        }
        this.print(tf('There are {n} objects outside the ship, totalling an approximate value of ▮{v}.', { n, v: Math.round(v * (0.8 + Math.random() * 0.2) / 10) * 10 }));
        return;
      }
      case 'quota': {
        this.print(tf('QUOTA: ▮{sold} / ▮{quota}', { sold: n0(run.sold), quota: n0(run.quota) }) + '\n' + tf('DAYS LEFT: {d}', { d: run.daysLeft }) + '\n' + tf('CREDITS: ▮{c}', { c: n0(run.credits) }) + '\n' + tf('QUOTAS MET THIS RUN: {n}', { n: run.quotaIndex }) + '\n' + tf('BUYING RATE: {r}%', { r: Math.round(buyRate(run.daysLeft, run.buyRnd) * 100) }));
        return;
      }
      case 'crew': {
        const out = [];
        const me = g.player;
        out.push(`* ${g.profile.name} (${t('you')})  ${t('Lv.')}${g.profile.level}  ${me.dead ? t('DECEASED') : Math.round(me.hp) + ' HP'}`);
        for (const r of g.remotes.values()) out.push(`* ${r.name}  ${t('Lv.')}${r.level}  ${r.dead ? t('DECEASED') : (r.hp ?? 100) + ' HP'}${r.indoor ? '  [' + t('inside facility') + ']' : ''}`);
        this.print(out.join('\n'));
        return;
      }
      case 'bestiary': case 'b': {
        const seen = Object.entries(g.profile.bestiary).filter(([, b]) => b.seen);
        if (arg) {
          const e = fuzzyFind(seen.map(([id]) => id), arg, (id) => (CREATURES[id]?.name || id) + ' ' + (CREATURES[id]?.$name || '') + ' ' + id);
          if (!e) { this.print(t('No entry. You have to see it first.'), 'err'); return; }
          const d = CREATURES[e];
          this.print(`${d.name.toUpperCase()}\n${d.hp ? tf('Durability: {hp} (Lv.1)', { hp: d.hp }) : t('Durability: UNKNOWN')}    ${t('Danger')}: ${'!'.repeat(Math.min(5, Math.ceil((d.power || 1) + (d.dmg >= 999 ? 2 : 0))))}\n${t('Kills')}: ${g.profile.bestiary[e].kills || 0}\n\n${d.lore}\n\n  - ${t('field notes by u/throwaway_janitor')}`);
          return;
        }
        if (!seen.length) { this.print(t('No entries yet. Scan creatures (RMB) to learn about them.')); return; }
        this.print(t('BESTIARY:') + '\n' + seen.map(([id, b]) => `* ${CREATURES[id]?.name || id}${b.kills ? '  (' + tf('{n} kills', { n: b.kills }) + ')' : ''}`).join('\n') + '\n\n' + t('Type BESTIARY <name> for details.'));
        return;
      }
      case 'switch': {
        const names = [{ id: g.selfId, name: g.profile.name }, ...[...g.remotes.values()].map((r) => ({ id: r.id, name: r.name }))];
        let tg;
        if (arg) tg = fuzzyFind(names, arg, (x) => x.name);
        else { const i = names.findIndex((x) => x.id === this.radarTarget); tg = names[(i + 1) % names.length]; }
        if (!tg) { this.print(t('No crewmate by that name.'), 'err'); return; }
        this.radarTarget = tg.id;
        this.print(t('Radar now tracking:') + ' ' + tg.name);
        return;
      }
      case 'codes': {
        const out = [];
        for (const d of g.world.facility?.doors || []) if (d.code) out.push(`* ${d.code.toUpperCase()}  ${t('secure door')}  ${d.open ? '[' + t('OPEN') + ']' : '[' + t('CLOSED') + ']'}`);
        for (const v of g.creatures.views.values()) if (v.code && v.state !== 'dead') out.push(`* ${v.code.toUpperCase()}  ${v.def.name}`);
        this.print(out.length ? out.join('\n') : t('No coded objects detected.'));
        return;
      }
      case 'transmit': {
        if (!run.upgrades?.signal) { this.print(t('Requires the Signal Translator upgrade.'), 'err'); return; }
        if (!arg) { this.print(t('Usage: TRANSMIT <message>'), 'err'); return; }
        g.net.request('term', { cmd: { op: 'transmit', text: cmd.slice(9, 9 + 20) } });
        return;
      }
      case 'teleport': {
        if (!run.upgrades?.teleporter) { this.print(t('Requires the Teleporter upgrade.'), 'err'); return; }
        const names = [...g.remotes.values()].map((r) => ({ id: r.id, name: r.name }));
        const tg = arg ? fuzzyFind(names, arg, (x) => x.name) : names.find((x) => x.id === this.radarTarget);
        if (!tg) { this.print(t('Teleport whom? (TELEPORT <name> or SWITCH first)'), 'err'); return; }
        if (g.shipFeatures) { g.net.request('shipf', { op: 'tp', target: tg.id, term: 1 }); return; }
        g.net.request('shipf', { op: 'tp', target: tg.id });
        return;
      }
      case 'kefal': this.print(t('><((((º>   The Algorithm thanks you for your loyalty.')); return;
      default: {
        // codes
        if (/^[a-z]\d{1,2}$/.test(w0)) { g.net.request('term', { cmd: { op: 'code', code: w0 } }); return; }
        const moon = fuzzyFind(routable(), w0, moonKey);
        if (moon) { this.exec('route ' + w0); return; }
        const cr = Object.keys(g.profile.bestiary).find((id) => (CREATURES[id]?.name || '').toLowerCase().startsWith(w0));
        if (cr) { this.exec('bestiary ' + w0); return; }
        this.print(t('[There was no action supplied with the word.]'), 'err');
      }
    }
  }

  // moon details (INFO / ROUTE confirmation)
  moonInfo(m, run, brief = false) {
    if (m.company) return `${m.name}\n${m.desc}`;
    const lines = [];
    if (!brief) lines.push(`${m.name.toUpperCase()}${m.generated ? '  [' + t('UNCHARTED') + ']' : ''}`);
    lines.push(`${t('Tier')} ${m.tier}  ·  ${t('Risk')} ${riskBar(m)} ${t(m.risk || ['', 'LOW', 'MODERATE', 'HIGH', 'SEVERE', 'LETHAL'][Math.min(5, m.tier)])}  ·  ${costText(m)}`);
    lines.push(`${t('Biome')}: ${t(biomeName(m.biome))}   ${t('Interior')}: ${interiorName(m.interior)}   ${t('Size')}: ${sizeLabel(m.size || 1)}${(m.mapScale || 1) > 1 ? ' (' + t('big map') + ')' : ''}`);
    lines.push(`${t('Forecast')}: ${weatherName(run, m)}   ${t('Scrap value')}: x${(m.scrapMul || 1).toFixed(2)}`);
    const pool = run ? poolFor(run, m) : null;   // [threatmerge] the curated headline residents of this moon (seeded per run + moon + sector)
    if (pool?.all.length) lines.push(`${t('KNOWN RESIDENTS')}: ${pool.all.map((id) => t(id === 'zombie' ? 'Zombie Accounts' : CREATURES[id]?.name || id)).join(', ')}`);
    if (LAB_HINT[m.interior]) lines.push(`${t('Hazard')}: ${t(LAB_HINT[m.interior])}`);   // [labyrinths] the interior's signature mechanic
    for (const k of m.mods || []) lines.push(`+ ${MODIFIERS[k]?.name || k}: ${MODIFIERS[k]?.desc || ''}`);
    if (!brief || !m.generated) lines.push(m.desc || '');
    else lines.push(m.desc.split('. ')[0].replace(/\.?$/, '.'));
    return lines.join('\n');
  }

  // ASCII sector map: the ship, the current sector's servers and the flight lines between them
  printSector(run) {
    const sector = ensureSector(run);
    const moons = sectorMoons();
    if (!sector || !moons.length) { this.print(t('No uncharted sector in range.'), 'err'); return; }
    const W = 46, H = 9;
    const grid = Array.from({ length: H }, () => Array(W).fill(' '));
    const r = new RNG(hashString('map:' + sector.key));     // same stars every time for this sector
    for (let i = 0; i < 26; i++) grid[r.int(0, H - 1)][r.int(0, W - 1)] = r.chance(0.3) ? '*' : "'";
    const ship = { x: 2, y: Math.floor(H / 2) };
    const put = (x, y, str) => { for (let i = 0; i < str.length; i++) if (x + i >= 0 && x + i < W && y >= 0 && y < H) grid[y][x + i] = str[i]; };
    const pos = moons.map((m) => ({ m, x: Math.max(6, Math.min(W - 4, Math.round((m.mapPos?.x ?? 0.5) * (W - 4)))), y: Math.max(0, Math.min(H - 1, Math.round((m.mapPos?.y ?? 0.5) * (H - 1)))) }));
    for (let i = 1; i < pos.length; i++) for (let j = 0; j < i; j++) if (Math.abs(pos[i].x - pos[j].x) < 4 && pos[i].y === pos[j].y) pos[i].y = (pos[i].y + 2) % H;
    // flight lines (the routed one drawn solid)
    for (const p of pos) {
      const routed = p.m.id === run.moon;
      const x0 = ship.x + 2, y0 = ship.y, x1 = p.x - 1, y1 = p.y;
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0) * 2, 1);
      for (let k = 1; k < n; k++) {
        const x = Math.round(x0 + ((x1 - x0) * k) / n), y = Math.round(y0 + ((y1 - y0) * k) / n);
        if (routed) grid[y][x] = '=';
        else if (k % 2 === 0 && grid[y][x] !== '=') grid[y][x] = '.';
      }
    }
    put(ship.x - 1, ship.y, '[@]');
    pos.forEach((p, i) => put(p.x - 1, p.y, `[${i + 1}]`));
    const out = [`${sector.name}`.padEnd(W - 10) + `${t('QUOTA')} #${(run.quotaIndex | 0) + 1}`, '+' + '-'.repeat(W) + '+'];
    for (const row of grid) out.push('|' + row.join('') + '|');
    out.push('+' + '-'.repeat(W) + '+', '[@] ' + t('your ship') + (MOONS[run.moon]?.generated ? '   === ' + t('current route') : ''));
    pos.forEach((p, i) => {
      const m = p.m;
      out.push(`[${i + 1}] ${m.name.padEnd(28)} T${m.tier} ${costText(m).padEnd(6)} ${riskBar(m)} ${t(m.risk)}`);
      out.push(`    ${t(biomeName(m.biome))} / ${interiorName(m.interior)} / ${sizeLabel(m.size)} / ${weatherName(run, m)}${m.mods.length ? '  +' + m.mods.map((k) => MODIFIERS[k]?.name || k).join(' +') : ''}`);
    });
    out.push('', t('ROUTE #n (or a name) to fly there. Meet the quota and this sector goes dark: a new one is charted.'));
    this.print(out.join('\n'));
  }

  onRemote(d) {
    if (d.to && d.to !== this.game.selfId) {
      if (d.all) this.print(d.k ? tf(d.k, d.v || {}) : t(d.text), d.cls || '');
      return;
    }
    this.print(d.k ? tf(d.k, d.v || {}) : t(d.text), d.cls || '');
    if (d.err) this.game.sfx('terminal_error', 0.5);
  }

  // ------------------------------------------------------------------ host side
  hostExecute(cmd, from) {
    const g = this.game;
    const run = g.run;
    const reply = (text, err, vars) => g.net.sendTo(from, 'term', { to: from, text: tfIn('en', text, vars || {}), k: vars ? text : undefined, v: vars, err, cls: err ? 'err' : '' });
    if (!cmd || typeof cmd !== 'object') return;
    switch (cmd.op) {
      case 'route': {
        const m = MOONS[cmd.moon];
        if (!m || run.phase !== 'orbit') { reply('Cannot route now.', true); return; }
        if (m.stale) { reply('That server went dark with the old sector. Type SECTOR.', true); return; }
        { const blocked = g.cycle?.routeBlocked?.(m); if (blocked) { reply(blocked, true); return; } }   // [cycle] the Sector Gate locks the autopilot
        { const lk = g.onboard?.routeBlocked?.(m); if (lk) { reply(lk.k, true, lk.v); return; } }   // [onboard] the homeworld is gifted at quota 3
        if (run.daysLeft <= 0 && !m.company) { reply('Deadline reached: only 0-Algorithm HQ is available.', true); return; }
        // Free travel (host option, on by default): every moon/server is reachable without credits.
        const cost = g.shipyard?.routeFee ? g.shipyard.routeFee(m, !!g.config?.freeTravel) : (g.config?.freeTravel ? 0 : m.cost);   // [shipyard] +5 % per module
        if (run.credits < cost) { reply('Insufficient credits: {@m} costs ▮{cost}, you have ▮{c}.\nSell scrap at 0-Algorithm HQ (ROUTE HQ) or pick a FREE moon.', true, { m: m.$name || m.name, cost, c: run.credits }); return; }
        run.credits -= cost;
        run.moon = m.id;
        g.broadcastRun(['moon', 'credits']);
        g.env.setSpace(g.planetColorFor(m.id));
        g.net.broadcast('sys', sysMsg('Autopilot routed to {@m}. Pull the lever to land.', { m: m.$name || m.name }, 'info'));
        reply('Routing autopilot to {@m}. Your new balance is ▮{c}.\nPull the lever to land.', false, { m: m.$name || m.name, c: run.credits });
        return;
      }
      case 'cart': { if (g.shop?.hostCart) g.shop.hostCart(cmd, from, reply); else reply('The store is offline.', true); return; }
      case 'coinbuy': { if (g.shop?.hostCoin) g.shop.hostCoin(cmd, from, reply); else reply('The store is offline.', true); return; }
      case 'buy': {
        if (g.shop?.hostCart) { g.shop.hostCart({ lines: [{ id: cmd.item, n: cmd.n }] }, from, reply); return; }   // same deal prices / stock / delivery as the store screen
        const d = itemDef(cmd.item);
        const n = Math.max(1, Math.min(10, cmd.n | 0));
        if (!STORE_ITEMS.includes(cmd.item)) { reply('Not sold here.', true); return; }
        const cost = d.price * n;
        if (run.credits < cost) { reply('Insufficient credits.', true); return; }
        run.credits -= cost;
        g.broadcastRun(['credits']);
        for (let i = 0; i < n; i++) {
          const pos = dropPoint(i);   // [ship2] the loot bay (world/shiplayout.js)
          g.items.hostSpawn(cmd.item, pos, { value: 0 });
        }
        g.net.broadcast('fx', { k: 'snd', s: 'dropship', p: [5, 2, -1], v: 0.8 });
        reply("Ordered {n}x {@name}. Your new balance is ▮{c}.\nYour order has been delivered to the ship's storage.", false, { n, name: d.$name || d.name, c: run.credits });
        return;
      }
      case 'upgrade': {
        const u = SHIP_UPGRADES[cmd.id];
        if (!u || run.upgrades[cmd.id]) { reply('Unavailable.', true); return; }
        if (run.credits < u.price) { reply('Insufficient credits.', true); return; }
        run.credits -= u.price;
        run.upgrades = { ...run.upgrades, [cmd.id]: true };
        g.broadcastRun(['credits', 'upgrades']);
        g.net.broadcast('sys', sysMsg('Ship upgrade installed: {@name}', { name: u.$name || u.name }, 'good'));
        reply('{@name} installed.', false, { name: u.$name || u.name });
        return;
      }
      case 'code': {
        const code = String(cmd.code).toLowerCase();
        const door = g.world.facility?.doors.find((dd) => dd.code === code);
        if (door) { g.hostSetDoor(door.id, !door.open); reply(!door.open ? 'Secure door {code} opened.' : 'Secure door {code} closed.', false, { code: code.toUpperCase() }); return; }
        const c = [...g.creatures.host.values()].find((cc) => cc.code === code && !cc.dead);
        if (c) { c.disabledT = 8; reply('{@name} {code} disabled for 8 seconds.', false, { name: c.def.$name || c.def.name, code: code.toUpperCase() }); return; }
        reply('Unknown code.', true);
        return;
      }
      case 'transmit': {
        g.net.broadcast('sys', { text: '[' + 'SIGNAL' + '] ' + String(cmd.text).toUpperCase(), kind: 'signal' });
        reply('Transmission sent.');
        return;
      }
      case 'teleport': {
        const r = g.remotes.get(cmd.target);
        if (!r && cmd.target !== g.selfId) { reply('Target lost.', true); return; }
        const spot = g.ship.spawns[2];
        g.net.sendTo(cmd.target, 'tp', { p: [spot.x, spot.y, spot.z], yaw: Math.PI / 2 });
        g.net.broadcast('fx', { k: 'snd', s: 'teleport', p: [spot.x, 1, spot.z], v: 1 });
        reply('Teleporting...');
        return;
      }
      case 'cruiser': { if (g.cruiser) g.cruiser.hostBuy(from, reply); else reply('Vehicle bay offline.', true); return; }
      default: reply('Unknown command.', true);
    }
  }
}
