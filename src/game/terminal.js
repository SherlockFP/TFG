// The ship terminal (Lethal-Company-style typed commands). UI is a DOM overlay; side-effect commands
// are executed by the host (hostExecute) which replies with text.
import { MOONS, MOON_ORDER, WEATHER } from './moons.js';
import { ensureSector, sectorMoons, INTERIOR_NAMES, MODIFIERS, biomeName } from './moongen.js';
import * as FACILITY from '../world/facility.js';
import { RNG, hashString } from '../core/rng.js';
import { ITEMS, STORE_ITEMS, SHIP_UPGRADES, itemDef, isSellable } from './items.js';
import { CREATURES } from './creatures.js';
import { buyRate } from './progression.js';
import { insideShip } from '../world/ship.js';
import { escapeHtml } from '../core/util.js';

const BANNER = [
  '  _  _______ _____ _    _',
  ' | |/ / ____|  ___/ \\  | |',
  " | ' /|  _| | |_ / _ \\ | |",
  ' | . \\| |___|  _/ ___ \\| |___',
  ' |_|\\_\\_____|_|/_/   \\_\\_____|',
  '     TFG OS v4.1  -  "Engagement is love."',
];

// ------------------------------------------------------------------ moon helpers (handcrafted + generated sector)
const interiorName = (id) => FACILITY.INTERIOR_NAMES?.[id] || INTERIOR_NAMES[id] || id;
const sizeLabel = (s) => (s < 1.3 ? 'S' : s < 1.7 ? 'M' : s < 2.1 ? 'L' : 'XL');
const riskBar = (m) => { const n = Math.max(1, Math.min(5, Math.round(m.riskScore ?? m.tier ?? 1))); return '[' + '#'.repeat(n) + '-'.repeat(5 - n) + ']'; };
const weatherName = (run, m) => WEATHER[run.forecast?.[m.id] || 'clear']?.name || 'Clear';
const costText = (m) => (m.cost ? '▮' + m.cost : 'FREE');
// every moon the autopilot can fly to right now (generated moons of older sectors are gone)
const routable = () => MOON_ORDER.map((id) => MOONS[id]).filter((m) => m && !m.stale);
const moonKey = (m) => m.name.replace(/^[^-]+-/, '') + ' ' + m.id + ' ' + m.name + ' ' + (m.short || '');
function findMoon(q) {
  q = String(q || '').trim();
  const slot = /^#?([1-9])$/.exec(q);
  if (slot) { const m = sectorMoons()[+slot[1] - 1]; if (m) return m; }
  return fuzzyFind(routable(), q, moonKey);
}

function fuzzyFind(list, q, key = (x) => x) {
  q = q.toLowerCase().replace(/[^a-z0-9çğıöşü]/g, '');
  if (!q) return null;
  return list.find((x) => key(x).toLowerCase().replace(/[^a-z0-9çğıöşü]/g, '').startsWith(q))
    || list.find((x) => key(x).toLowerCase().replace(/[^a-z0-9çğıöşü]/g, '').includes(q));
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
    el.innerHTML = `<div class="term-screen"><div class="term-out"></div><div class="term-line"><span class="term-prompt">&gt;</span><input class="term-in" spellcheck="false" autocomplete="off" maxlength="80"/></div></div><div class="term-hint">[ESC] leave terminal · type HELP</div>`;
    document.getElementById('ui').appendChild(el);
    this.el = el;
    this.out = el.querySelector('.term-out');
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
    if (!this.lines.length) { this.print(BANNER.join('\n'), 'banner'); this.print('Welcome to the Company terminal. Type HELP for a list of commands.'); }
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
    for (const line of String(text).split('\n')) this.lines.push({ text: line, cls });
    if (this.lines.length > 400) this.lines.splice(0, this.lines.length - 400);
    this.render();
    this.game.shipScreens?.markTerminalDirty();
  }
  clear() { this.lines = []; this.render(); }
  render() {
    if (!this.out) return;
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
    try { this.exec(cmd); } catch (e) { console.error(e); this.print('ERROR: ' + e.message, 'err'); }
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
    if (this.pending && (w0 === 'deny' || w0 === 'd' || w0 === 'no' || w0 === 'n')) { this.pending = null; this.print('Cancelled.'); return; }
    this.pending = null;
    switch (w0) {
      case 'help': case '?':
        this.print([
          '>MOONS        list moons, weather & routing costs',
          '>SECTOR       map of the current uncharted sector',
          '>INFO <moon>  details: biome, interior, risk, modifiers',
          '>ROUTE <moon> set the autopilot destination (or ROUTE #2)',
          '>STORE        the Company Store screen (STORE LIST = plain text)',
          '>BUY <item> [n]',
          '>BUY VAN      order the Uplink Van (4 seats + cargo bed)',
          '>SCAN         scrap remaining on this moon',
          '>QUOTA        profit quota status',
          '>CREW         crew status',
          '>BESTIARY     creature entries  (>BESTIARY <name>)',
          '>SWITCH [name] change the radar target',
          '>CODES        list secure door / turret / mine codes',
          '><code>       toggle a secure door or disable a turret/mine (e.g. A3)',
          '>TRANSMIT <msg>  (Signal Translator)',
          '>TELEPORT [name] (Teleporter)',
          '>CLEAR',
        ].join('\n'));
        return;
      case 'clear': this.clear(); return;
      case 'moons': case 'moon': {
        const sector = ensureSector(run);
        const out = ['CURRENT ROUTE: ' + (MOONS[run.moon]?.name || '-'), ''];
        if (run.dailyEvent) out.push(`TODAY: ${run.dailyEvent.name} — ${run.dailyEvent.desc}`, '');
        out.push('CHARTED MOONS:');
        for (const id of MOON_ORDER) {
          const m = MOONS[id];
          if (!m || m.generated) continue;
          const w = m.company ? '' : ` (${weatherName(run, m)})`;
          const rate = m.company ? `  buying at ${Math.round(buyRate(run.daysLeft, run.buyRnd) * 100)}%` : '';
          out.push(`* ${m.name.padEnd(14)} ${m.company ? '' : 'T' + m.tier} ${costText(m)}${w}${rate}`);
        }
        const gen = sectorMoons();
        if (gen.length) {
          out.push('', `UNCHARTED: ${sector?.name || 'SECTOR'}  (${gen.length} servers)`);
          gen.forEach((m, i) => {
            const cur = m.id === run.moon ? '>' : '*';
            out.push(`${cur} #${i + 1} ${m.name.padEnd(28)} T${m.tier} ${costText(m).padEnd(6)} (${weatherName(run, m)}) ${m.risk}`);
            out.push(`       ${biomeName(m.biome)} / ${interiorName(m.interior)} / ${sizeLabel(m.size)}${m.mods.length ? '  +' + m.mods.map((k) => MODIFIERS[k]?.name || k).join(' +') : ''}`);
          });
          out.push('', 'Type SECTOR for the map, INFO <moon> for details.');
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
        if (!m) { this.print('Unknown moon. Type MOONS.', 'err'); return; }
        this.print(this.moonInfo(m, run));
        return;
      }
      case 'route': case 'r': {
        ensureSector(run);
        const moon = findMoon(arg);
        if (!moon) { this.print('Unknown moon. Type MOONS (or SECTOR for uncharted servers).', 'err'); return; }
        if (run.phase !== 'orbit') { this.print('Routing is only possible while in orbit.', 'err'); return; }
        if (moon.id === run.moon) { this.print('Already routed to ' + moon.name + '.'); return; }
        this.pending = { op: 'route', moon: moon.id };
        const rcost = g.config?.freeTravel ? 0 : moon.cost;
        this.print(`Route the autopilot to ${moon.name}? ${rcost ? `It will cost ▮${rcost}.` : 'Free travel.'}\n${this.moonInfo(moon, run, true)}\nYour credits: ▮${run.credits}${run.credits < rcost ? '  (NOT ENOUGH)' : ''}\n\nType CONFIRM or DENY.`);
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
        const out = ['Welcome to the Company store. Deliveries arrive instantly (for a small fee we do not mention).', ''];
        for (const id of STORE_ITEMS) { const d = ITEMS[id]; if (d) out.push(`* ${d.name.padEnd(18)} ▮${d.price}`); }
        out.push('', 'SHIP UPGRADES:');
        for (const [id, u] of Object.entries(SHIP_UPGRADES)) { if (u.owned) continue; out.push(`* ${u.name.padEnd(18)} ▮${u.price}${run.upgrades?.[id] ? '  [INSTALLED]' : ''}`); }
        out.push(...(g.cruiser?.storeLines?.() || []));
        out.push('', 'Personal gear, armor and cosmetics: visit Phish Dayı at 0-Algorithm HQ.');
        this.print(out.join('\n'));
        return;
      }
      case 'buy': {
        const m = arg.match(/^(.*?)(?:\s+(\d+))?$/);
        const q = (m?.[1] || '').trim();
        const n = Math.max(1, Math.min(10, parseInt(m?.[2] || '1', 10)));
        if (g.cruiser?.terminalBuy?.(q, this)) return;
        const up = fuzzyFind(Object.entries(SHIP_UPGRADES), q, ([id, u]) => u.name + ' ' + id);
        // data-driven stock (game/shop.js): every registered item with a price + shop category, at today's deal prices
        const pool = g.shop?.buyables ? g.shop.buyables().map((e) => ({ ...e.def, price: e.price })) : STORE_ITEMS.map((id) => ITEMS[id]);
        const it = fuzzyFind(pool, q, (d) => d.name + ' ' + d.id);
        if (it && (!up || it.name.toLowerCase().startsWith(q))) {
          const cost = it.price * n;
          this.pending = { op: 'buy', item: it.id, n };
          this.print(`Order ${n}x ${it.name} for ▮${cost}? Credits: ▮${run.credits}\nType CONFIRM or DENY.`);
          return;
        }
        if (up) {
          const [id, u] = up;
          if (run.upgrades?.[id]) { this.print('Already installed.'); return; }
          this.pending = { op: 'upgrade', id };
          this.print(`Install ${u.name} for ▮${u.price}? ${u.desc}\nType CONFIRM or DENY.`);
          return;
        }
        this.print('Unknown item. Type STORE.', 'err');
        return;
      }
      case 'scan': {
        if (run.phase !== 'moon') { this.print('Nothing to scan. Land on a moon first.'); return; }
        let n = 0, v = 0;
        for (const it of g.items.all()) {
          if (it.state !== 'world' || !isSellable(it.def) || insideShip(it.obj.position) || it.soulbound) continue;
          n++; v += it.value;
        }
        this.print(`There are ${n} objects outside the ship, totalling an approximate value of ▮${Math.round(v * (0.8 + Math.random() * 0.2) / 10) * 10}.`);
        return;
      }
      case 'quota': {
        this.print(`PROFIT QUOTA: ▮${run.sold} / ▮${run.quota}\nDEADLINE: ${run.daysLeft} day(s)\nCREDITS: ▮${run.credits}\nQUOTAS MET THIS RUN: ${run.quotaIndex}\nCURRENT COMPANY BUYING RATE: ${Math.round(buyRate(run.daysLeft, run.buyRnd) * 100)}%`);
        return;
      }
      case 'crew': {
        const out = [];
        const me = g.player;
        out.push(`* ${g.profile.name} (you)  Lv.${g.profile.level}  ${me.dead ? 'DECEASED' : Math.round(me.hp) + ' HP'}`);
        for (const r of g.remotes.values()) out.push(`* ${r.name}  Lv.${r.level}  ${r.dead ? 'DECEASED' : (r.hp ?? 100) + ' HP'}${r.indoor ? '  [inside facility]' : ''}`);
        this.print(out.join('\n'));
        return;
      }
      case 'bestiary': case 'b': {
        const seen = Object.entries(g.profile.bestiary).filter(([, b]) => b.seen);
        if (arg) {
          const e = fuzzyFind(seen.map(([id]) => id), arg, (id) => (CREATURES[id]?.name || id) + ' ' + id);
          if (!e) { this.print('No entry. You have to see it first.', 'err'); return; }
          const d = CREATURES[e];
          this.print(`${d.name.toUpperCase()}\n${d.hp ? 'Durability: ' + d.hp + ' (Lv.1)' : 'Durability: UNKNOWN'}    Danger: ${'!'.repeat(Math.min(5, Math.ceil((d.power || 1) + (d.dmg >= 999 ? 2 : 0))))}\nKills: ${g.profile.bestiary[e].kills || 0}\n\n${d.lore}\n\n  - field notes by u/throwaway_janitor`);
          return;
        }
        if (!seen.length) { this.print('No entries yet. Scan creatures (RMB) to learn about them.'); return; }
        this.print('BESTIARY:\n' + seen.map(([id, b]) => `* ${CREATURES[id]?.name || id}${b.kills ? '  (' + b.kills + ' kills)' : ''}`).join('\n') + '\n\nType BESTIARY <name> for details.');
        return;
      }
      case 'switch': {
        const names = [{ id: g.selfId, name: g.profile.name }, ...[...g.remotes.values()].map((r) => ({ id: r.id, name: r.name }))];
        let t;
        if (arg) t = fuzzyFind(names, arg, (x) => x.name);
        else { const i = names.findIndex((x) => x.id === this.radarTarget); t = names[(i + 1) % names.length]; }
        if (!t) { this.print('No crewmate by that name.', 'err'); return; }
        this.radarTarget = t.id;
        this.print('Radar now tracking: ' + t.name);
        return;
      }
      case 'codes': {
        const out = [];
        for (const d of g.world.facility?.doors || []) if (d.code) out.push(`* ${d.code.toUpperCase()}  secure door  ${d.open ? '[OPEN]' : '[CLOSED]'}`);
        for (const v of g.creatures.views.values()) if (v.code && v.state !== 'dead') out.push(`* ${v.code.toUpperCase()}  ${v.def.name}`);
        this.print(out.length ? out.join('\n') : 'No coded objects detected.');
        return;
      }
      case 'transmit': {
        if (!run.upgrades?.signal) { this.print('Requires the Signal Translator upgrade.', 'err'); return; }
        if (!arg) { this.print('Usage: TRANSMIT <message>', 'err'); return; }
        g.net.request('term', { cmd: { op: 'transmit', text: cmd.slice(9, 9 + 20) } });
        return;
      }
      case 'teleport': {
        if (!run.upgrades?.teleporter) { this.print('Requires the Teleporter upgrade.', 'err'); return; }
        const names = [...g.remotes.values()].map((r) => ({ id: r.id, name: r.name }));
        const t = arg ? fuzzyFind(names, arg, (x) => x.name) : names.find((x) => x.id === this.radarTarget);
        if (!t) { this.print('Teleport whom? (TELEPORT <name> or SWITCH first)', 'err'); return; }
        if (g.shipFeatures) { g.net.request('shipf', { op: 'tp', target: t.id, term: 1 }); return; }
        g.net.request('shipf', { op: 'tp', target: t.id });
        return;
      }
      case 'kefal': this.print('><((((º>   The Algorithm thanks you for your loyalty.'); return;
      default: {
        // codes
        if (/^[a-z]\d{1,2}$/.test(w0)) { g.net.request('term', { cmd: { op: 'code', code: w0 } }); return; }
        const moon = fuzzyFind(routable(), w0, moonKey);
        if (moon) { this.exec('route ' + w0); return; }
        const cr = Object.keys(g.profile.bestiary).find((id) => (CREATURES[id]?.name || '').toLowerCase().startsWith(w0));
        if (cr) { this.exec('bestiary ' + w0); return; }
        this.print('[There was no action supplied with the word.]', 'err');
      }
    }
  }

  // moon details (INFO / ROUTE confirmation)
  moonInfo(m, run, brief = false) {
    if (m.company) return `${m.name}\n${m.desc}`;
    const lines = [];
    if (!brief) lines.push(`${m.name.toUpperCase()}${m.generated ? '  [UNCHARTED]' : ''}`);
    lines.push(`Tier ${m.tier}  ·  Risk ${riskBar(m)} ${m.risk || ['', 'LOW', 'MODERATE', 'HIGH', 'SEVERE', 'LETHAL'][Math.min(5, m.tier)]}  ·  ${costText(m)}`);
    lines.push(`Biome: ${biomeName(m.biome)}   Interior: ${interiorName(m.interior)}   Size: ${sizeLabel(m.size || 1)}${(m.mapScale || 1) > 1 ? ' (big map)' : ''}`);
    lines.push(`Forecast: ${weatherName(run, m)}   Scrap value: x${(m.scrapMul || 1).toFixed(2)}`);
    for (const k of m.mods || []) lines.push(`+ ${MODIFIERS[k]?.name || k}: ${MODIFIERS[k]?.desc || ''}`);
    if (!brief || !m.generated) lines.push(m.desc || '');
    else lines.push(m.desc.split('. ')[0].replace(/\.?$/, '.'));
    return lines.join('\n');
  }

  // ASCII sector map: the ship, the current sector's servers and the flight lines between them
  printSector(run) {
    const sector = ensureSector(run);
    const moons = sectorMoons();
    if (!sector || !moons.length) { this.print('No uncharted sector in range.', 'err'); return; }
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
    const out = [`${sector.name}`.padEnd(W - 10) + `QUOTA #${(run.quotaIndex | 0) + 1}`, '+' + '-'.repeat(W) + '+'];
    for (const row of grid) out.push('|' + row.join('') + '|');
    out.push('+' + '-'.repeat(W) + '+', '[@] your ship' + (MOONS[run.moon]?.generated ? '   === current route' : ''));
    pos.forEach((p, i) => {
      const m = p.m;
      out.push(`[${i + 1}] ${m.name.padEnd(28)} T${m.tier} ${costText(m).padEnd(6)} ${riskBar(m)} ${m.risk}`);
      out.push(`    ${biomeName(m.biome)} / ${interiorName(m.interior)} / ${sizeLabel(m.size)} / ${weatherName(run, m)}${m.mods.length ? '  +' + m.mods.map((k) => MODIFIERS[k]?.name || k).join(' +') : ''}`);
    });
    out.push('', 'ROUTE #n (or a name) to fly there. Meet the quota and this sector goes dark: a new one is charted.');
    this.print(out.join('\n'));
  }

  onRemote(d) {
    if (d.to && d.to !== this.game.selfId) {
      if (d.all) this.print(d.text, d.cls || '');
      return;
    }
    this.print(d.text, d.cls || '');
    if (d.err) this.game.sfx('terminal_error', 0.5);
  }

  // ------------------------------------------------------------------ host side
  hostExecute(cmd, from) {
    const g = this.game;
    const run = g.run;
    const reply = (text, err) => g.net.sendTo(from, 'term', { to: from, text, err, cls: err ? 'err' : '' });
    if (!cmd || typeof cmd !== 'object') return;
    switch (cmd.op) {
      case 'route': {
        const m = MOONS[cmd.moon];
        if (!m || run.phase !== 'orbit') { reply('Cannot route now.', true); return; }
        if (m.stale) { reply('That server went dark with the old sector. Type SECTOR.', true); return; }
        if (run.daysLeft <= 0 && !m.company) { reply('Deadline reached: only 0-Algorithm HQ is available.', true); return; }
        // Free travel (host option, on by default): every moon/server is reachable without credits.
        const cost = g.config?.freeTravel ? 0 : m.cost;
        if (run.credits < cost) { reply(`Insufficient credits: ${m.name} costs ▮${cost}, you have ▮${run.credits}.\nSell scrap at 0-Algorithm HQ (ROUTE HQ) or pick a FREE moon.`, true); return; }
        run.credits -= cost;
        run.moon = m.id;
        g.broadcastRun(['moon', 'credits']);
        g.env.setSpace(g.planetColorFor(m.id));
        g.net.broadcast('sys', { text: `Autopilot routed to ${m.name}. Pull the lever to land.`, kind: 'info' });
        reply(`Routing autopilot to ${m.name}. Your new balance is ▮${run.credits}.\nPull the lever to land.`);
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
          const pos = { x: 4.5 + Math.random() * 1.5, y: 1.2 + i * 0.25, z: -2 + Math.random() * 1.2 };
          g.items.hostSpawn(cmd.item, pos, { value: 0 });
        }
        g.net.broadcast('fx', { k: 'snd', s: 'dropship', p: [5, 2, -1], v: 0.8 });
        reply(`Ordered ${n}x ${d.name}. Your new balance is ▮${run.credits}.\nYour order has been delivered to the ship's storage.`);
        return;
      }
      case 'upgrade': {
        const u = SHIP_UPGRADES[cmd.id];
        if (!u || run.upgrades[cmd.id]) { reply('Unavailable.', true); return; }
        if (run.credits < u.price) { reply('Insufficient credits.', true); return; }
        run.credits -= u.price;
        run.upgrades = { ...run.upgrades, [cmd.id]: true };
        g.broadcastRun(['credits', 'upgrades']);
        g.net.broadcast('sys', { text: `Ship upgrade installed: ${u.name}`, kind: 'good' });
        reply(`${u.name} installed.`);
        return;
      }
      case 'code': {
        const code = String(cmd.code).toLowerCase();
        const door = g.world.facility?.doors.find((dd) => dd.code === code);
        if (door) { g.hostSetDoor(door.id, !door.open); reply(`Secure door ${code.toUpperCase()} ${!door.open ? 'opened' : 'closed'}.`); return; }
        const c = [...g.creatures.host.values()].find((cc) => cc.code === code && !cc.dead);
        if (c) { c.disabledT = 8; reply(`${c.def.name} ${code.toUpperCase()} disabled for 8 seconds.`); return; }
        reply('Unknown code.', true);
        return;
      }
      case 'transmit': {
        g.net.broadcast('sys', { text: '[SIGNAL] ' + String(cmd.text).toUpperCase(), kind: 'signal' });
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
