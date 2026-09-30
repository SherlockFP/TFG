// THE ALGORITHM — the adaptive villain as a runtime persona (docs/LORE.md §2, docs/wave1/lore.md).
//
// HOST   watches the crew every 0.5 s during a moon day (loud time, flashlight time, crew separation, doors used,
//        value carried, time hiding in the ship, backtracking, spells shouted, deaths, abandoned teammates). At the end
//        of the day it picks tomorrow's FOCUS ('noise'|'light'|'greed'|'split'|'doors'|'coward') and a mood, stored in
//        run.algo = { focus, mood, lines, n, day, scores } (auto-synced + saved with the run) and announced as the mods
//        event 'tfg:algo' so balance / horde / director modules can react. During the day it may "adapt" twice at most:
//        a director scare matching the focus (game.director.trigger) plus a line. Every intercom line is chosen by the
//        host (pool + index) and broadcast, so every peer shows the same line in its own language.
// CLIENT the intercom: glitchy subtitle with a procedural face, typewriter reveal, optional robot voice
//        (speechSynthesis, terminal ALGO VOICE ON, off by default), line queue, cinematic-aware.
import { LINES, FACTIONS, pickLang } from './loredata.js';
import { isSellable } from './items.js';
import { getLang, t, speechLang } from '../core/i18n.js';
import { saveSettings } from '../core/save.js';

export const FOCI = ['noise', 'light', 'greed', 'split', 'doors', 'coward'];
export const FOCUS_NAME = {
  noise: ['NOISE', 'GÜRÜLTÜ'], light: ['LIGHT', 'IŞIK'], greed: ['GREED', 'AÇGÖZLÜLÜK'], split: ['ISOLATION', 'YALNIZLIK'],
  doors: ['DOORS', 'KAPILAR'], coward: ['COWARDICE', 'KORKAKLIK'],
};
export const MOOD_COLOR = { curious: '#7fd4ff', bored: '#8a9ab8', amused: '#ff8a3d', delighted: '#ff3d7f', ecstatic: '#ff2a2a' };
const GLOBAL_GAP = 11;          // s between two intercom lines (priority lines use a shorter gap)
const KEY_CD = { death: 6, orbit_idle: 90, alone: 60, greed: 240, spell_spam: 120, alarm: 70, first_scrap: 9999, first_kill: 9999, midnight: 9999 };
const NUDGE_GAP = 150;          // s between two focus "adaptations"
const NUDGES_PER_DAY = 2;
const ALONE_R = 25;             // m: no living crewmate within this = apart
const ALONE_LINE_T = 75;        // s alone (indoors) before the Algorithm comments

const tr = () => { try { return getLang() === 'tr'; } catch { return false; } };
const fill = (s, v = {}) => String(s).replace(/\{(\w+)\}/g, (m, k) => (v[k] !== undefined && v[k] !== null ? String(v[k]) : m));

// ------------------------------------------------------------------ procedural face (HUD portrait, ship CRTs, case card)
let scratch = null;
/** Draw The Algorithm's face. o: { talk 0..1, mood, glitch 0..1, seed } */
export function drawAlgoFace(ctx, w, h, t, o = {}) {
  const col = MOOD_COLOR[o.mood] || MOOD_COLOR.amused;
  const talk = o.talk || 0;
  const g = o.glitch ?? 0.15;
  ctx.save();
  ctx.fillStyle = '#07030a'; ctx.fillRect(0, 0, w, h);
  const cx = w / 2 + Math.sin(t * 0.7) * w * 0.02, cy = h * 0.5 + Math.sin(t * 1.3) * h * 0.015;
  const s = Math.min(w, h) / 48;
  const layer = (dx, color, alpha) => {
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = Math.max(1, s);
    // head: a hovering server mask drawn as broken scanline rows
    for (let yy = -16; yy <= 16; yy += 2) {
      const k = Math.sqrt(Math.max(0, 1 - (yy / 17) ** 2));
      const half = 15 * k * (1 + (yy > 6 ? -0.18 * ((yy - 6) / 10) : 0));
      if (((yy + Math.floor(t * 9)) & 7) === 0 && g > 0.05) continue;   // rolling dropout
      ctx.fillRect(cx + dx - half * s, cy + yy * s, 2 * half * s, Math.max(1, s * 0.55));
    }
    // eyes: wifi arcs (the "wifi eye" of the TFG logo) that look around and blink
    const blink = (Math.sin(t * 0.9 + (o.seed || 0)) > 0.985) ? 0.15 : 1;
    const look = Math.sin(t * 0.6) * 1.8;
    for (const ex of [-6.5, 6.5]) {
      const x = cx + dx + (ex + look) * s, y = cy - 3 * s;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#07030a'; ctx.fillRect(x - 5 * s, y - 4 * s * blink, 10 * s, 8 * s * blink);
      ctx.fillStyle = color;
      if (blink < 1) { ctx.fillRect(x - 4 * s, y, 8 * s, s); continue; }
      ctx.fillRect(x - 0.9 * s, y + 1.2 * s, 1.8 * s, 1.8 * s);
      for (let r = 1; r <= 3; r++) {
        ctx.beginPath(); ctx.arc(x, y + 2.4 * s, r * 1.45 * s, Math.PI * 1.2, Math.PI * 1.8); ctx.stroke();
      }
    }
    // mouth: a waveform that speaks
    ctx.fillStyle = '#07030a'; ctx.fillRect(cx + dx - 10 * s, cy + 5 * s, 20 * s, 7 * s);
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i <= 20; i++) {
      const x = cx + dx + (i - 10) * s;
      const env = Math.sin((i / 20) * Math.PI);
      const a = talk * env * 3 * s * (Math.sin(t * 31 + i * 1.7) * 0.6 + Math.sin(t * 17 - i) * 0.4);
      const y = cy + 8.5 * s + a;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  };
  layer(-1.2 * s * (0.4 + g), '#ff2050', 0.55);
  layer(1.2 * s * (0.4 + g), '#20e0ff', 0.55);
  layer(0, col, 1);
  ctx.globalAlpha = 1;
  // glitch: displaced slices + noise blocks
  if (g > 0 && typeof document !== 'undefined') {
    if (!scratch) scratch = document.createElement('canvas');
    if (scratch.width !== w || scratch.height !== h) { scratch.width = w; scratch.height = h; }
    const sc = scratch.getContext('2d');
    sc.clearRect(0, 0, w, h); sc.drawImage(ctx.canvas, 0, 0);
    const n = Math.floor(g * 6 + (Math.sin(t * 7.3) > 0.8 ? 3 : 0));
    for (let i = 0; i < n; i++) {
      const y = Math.floor(((Math.sin(t * 13.1 + i * 91.7) + 1) / 2) * h);
      const hh = Math.max(1, Math.floor(h * 0.04 * (1 + (i % 3))));
      const dx = Math.round(Math.sin(t * 29 + i * 7) * w * 0.06 * g * 2);
      ctx.drawImage(scratch, 0, y, w, hh, dx, y, w, hh);
    }
    ctx.fillStyle = col;
    for (let i = 0; i < n * 2; i++) {
      const x = ((Math.sin(t * 5.1 + i * 12.9) + 1) / 2) * w, y = ((Math.cos(t * 3.7 + i * 7.3) + 1) / 2) * h;
      ctx.globalAlpha = 0.35; ctx.fillRect(x, y, s * 2, s);
    }
    ctx.globalAlpha = 1;
  }
  // CRT scanlines + vignette
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  for (let y = 0; y < h; y += 2) ctx.fillRect(0, y, w, 1);
  const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.7);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

// ------------------------------------------------------------------ intercom DOM
const STYLE_ID = 'tfg-algo-style';
const CSS = `
.algo-sub{position:fixed;left:50%;top:120px;transform:translateX(-50%);z-index:15;display:flex;gap:8px;align-items:center;
 max-width:min(560px,70vw);padding:4px 10px 4px 4px;background:linear-gradient(90deg,rgba(12,4,10,.92),rgba(12,4,10,.78));border:1px solid rgba(255,61,127,.55);
 box-shadow:0 0 14px rgba(255,61,127,.22);pointer-events:none;font-family:var(--font,monospace);opacity:0;transition:opacity .15s}
.algo-sub.on{opacity:1}
.algo-sub::after{content:'';position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(0,0,0,.22) 0 1px,transparent 1px 3px);pointer-events:none}
.algo-sub.glitch{animation:algoJit .18s steps(2) 2}
@keyframes algoJit{0%{transform:translateX(-50%) skewX(0)}50%{transform:translateX(calc(-50% + 6px)) skewX(-8deg);filter:hue-rotate(60deg)}100%{transform:translateX(-50%)}}
.algo-face{width:42px;height:32px;image-rendering:pixelated;flex:none;border:1px solid rgba(255,61,127,.35)}
.algo-body{min-width:0}
.algo-who{display:flex;gap:10px;align-items:baseline;font-family:var(--font2,monospace);font-size:10px;letter-spacing:2px;color:#ff3d7f;text-shadow:0 0 8px rgba(255,61,127,.6)}
.algo-live{color:#ff2a2a;animation:algoBlink 1s steps(1) infinite}
@keyframes algoBlink{50%{opacity:.2}}
.algo-text{font-size:17px;line-height:1.15;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;text-overflow:ellipsis;color:#ffe9f2;margin-top:4px;text-shadow:-1px 0 rgba(255,32,80,.7),1px 0 rgba(32,224,255,.7),0 0 10px rgba(255,61,127,.35);min-height:19px}
.algo-text i{font-style:normal;color:#ff3d7f;opacity:.8}
`;
function ensureStyle() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style'); s.id = STYLE_ID; s.textContent = CSS; document.head.appendChild(s);
}
const GLYPHS = '#%&@$*+=?/\\|<>▮▯░▒▓01';

export function installAlgorithm(core) {
  const { game } = core;
  const st = {
    t: 0, lastSay: -99, keyAt: {}, bags: {},
    // client intercom
    q: [], cur: null, el: null, face: null, faceCtx: null, speakingT: 0, faceT: 0,
    // host
    tickT: 0, nudgesToday: 0, nextNudgeT: 0, orbitT: 60, lastQuotaIndex: null, spellTimes: [],
    alone: new Map(), cells: new Map(),
  };

  // ---------------------------------------------------------------- run state
  function ensure(run) {
    if (!run) return null;
    if (!run.algo || typeof run.algo !== 'object') run.algo = { focus: null, mood: 'curious', lines: [], n: 0, day: 0, scores: null };
    if (!Array.isArray(run.algo.lines)) run.algo.lines = [];
    return run.algo;
  }

  // ---------------------------------------------------------------- host: choosing lines
  function pickIndex(key) {
    const pool = LINES[key];
    if (!pool?.length) return -1;
    let bag = st.bags[key];
    if (!bag || !bag.length) {
      bag = st.bags[key] = pool.map((_, i) => i);
      for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
    }
    return bag.pop();
  }
  /** host: say line `key` to everyone. opts: { force, gap, to } */
  function hostSay(key, vars = {}, opts = {}) {
    if (!game.isHost || !LINES[key]) return false;
    const gap = opts.gap ?? GLOBAL_GAP;
    if (!opts.force && st.t - st.lastSay < gap) return false;
    const cd = KEY_CD[key] ?? 30;
    if (!opts.force && st.t - (st.keyAt[key] ?? -1e9) < cd) return false;
    const i = pickIndex(key);
    if (i < 0) return false;
    st.lastSay = st.t; st.keyAt[key] = st.t;
    const a = ensure(game.run);
    if (a) { a.lines = [...a.lines, fill(LINES[key][i][0], vars)].slice(-3); }
    core.broadcast('say', { key, i, v: vars, voice: opts.voice || null });
    return true;
  }
  /** host: a faction leader speaks (FACTIONS[f].voice[kind]) */
  function hostSayFaction(f, kind) {
    if (!game.isHost || !FACTIONS[f]?.voice?.[kind]) return false;
    core.broadcast('say', { fv: f, fk: kind, voice: f });
    return true;
  }

  // ---------------------------------------------------------------- client: intercom
  function ensureDom() {
    if (st.el || typeof document === 'undefined') return;
    ensureStyle();
    const el = document.createElement('div');
    el.className = 'algo-sub';
    el.innerHTML = '<canvas class="algo-face" width="64" height="48"></canvas><div class="algo-body"><div class="algo-who"><span class="algo-name">THE ALGORITHM</span><span class="algo-live">● LIVE</span></div><div class="algo-text"></div></div>';
    (document.getElementById('ui') || document.body).appendChild(el);
    st.el = el; st.face = el.querySelector('canvas'); st.faceCtx = st.face.getContext('2d');
    st.nameEl = el.querySelector('.algo-name'); st.textEl = el.querySelector('.algo-text');
  }
  function textOf(d) {
    const T = tr();
    if (d.text) return String(d.text);
    if (d.fv) return pickLang(FACTIONS[d.fv]?.voice?.[d.fk], T);
    const pair = LINES[d.key]?.[d.i];
    if (!pair) return '';
    const v = { ...(d.v || {}) };
    if (v.faction && FACTIONS[v.faction]) v.faction = FACTIONS[v.faction].name;
    if (v.cause !== undefined) v.cause = T ? 'öldü.' : (game.deathText?.(v.cause) || 'died.');
    return fill(pickLang(pair, T), v);
  }
  /** local: queue a line (d = {text} | {key,i,v} | {fv,fk}); voice = faction id or null */
  function show(d) {
    const text = textOf(d);
    if (!text) return;
    // [firstrun] a brand-new player hears at most one Algorithm line per 45 s; teaching lines (d.pri) and deaths always pass
    if (d.key !== 'death' && game.onboard?.fr?.algoOk?.(!!d.pri) === false) return;
    if (st.q.length >= 3) st.q.shift();
    st.q.push({ text, pri: !!d.pri, voice: d.voice || null, mood: d.mood || game.run?.algo?.mood });
  }
  function startNext() {
    const n = st.q.shift();
    if (!n) return;
    ensureDom();
    if (!st.el) return;
    const f = n.voice && FACTIONS[n.voice];
    st.cur = { ...n, shown: 0, t: 0, dur: 1.2 + n.text.length * 0.034 + 1.8 };
    st.nameEl.textContent = f ? `${f.name.toUpperCase()} · ${f.leader.toUpperCase()}` : t('THE ALGORITHM');
    st.el.style.borderColor = f ? f.color : '';
    st.nameEl.style.color = f ? f.color : '';
    st.el.classList.add('on');
    st.el.classList.remove('glitch'); void st.el.offsetWidth; st.el.classList.add('glitch');
    try { game.sfx?.('terminal_enter', 0.35, 0.6); } catch { /* audio optional */ }
    speak(n.text, f);
  }
  function speak(text, f) {
    if (!game.settings?.algoVoice || typeof window === 'undefined' || !window.speechSynthesis) return;
    try {
      const u = new SpeechSynthesisUtterance(text.replace(/[▮◈]/g, ''));
      const lang = getLang();
      const v = window.speechSynthesis.getVoices().find((x) => x.lang?.toLowerCase().startsWith(lang));
      if (v) u.voice = v;
      u.lang = speechLang();
      u.pitch = f ? 0.8 : 0.05; u.rate = f ? 1 : 0.9; u.volume = 0.8;
      window.speechSynthesis.cancel(); window.speechSynthesis.speak(u);
    } catch { /* optional */ }
  }
  function setVoice(on) {
    if (!game.settings) return false;
    game.settings.algoVoice = !!on;
    try { saveSettings(game.settings); } catch { /* ignore */ }
    if (!on) { try { window.speechSynthesis?.cancel(); } catch { /* ignore */ } }
    return true;
  }
  function clientUpdate(dt) {
    const busy = game.ui?.fullscreenOpen?.();
    if (!st.cur && st.q.length && !busy && (st.q[0].pri || !(game.onboard?.fr?.busy?.() > 0))) startNext();   // [qa] the Algorithm box waits for the arrival cards (soul / sector map / wave)
    const c = st.cur;
    if (c && st.el) {
      c.t += dt;
      const typeT = Math.max(0, c.t - 0.35);
      const shown = Math.min(c.text.length, Math.floor(typeT * 32));
      if (shown !== c.shown || shown < c.text.length) {
        c.shown = shown;
        const tail = shown < c.text.length ? GLYPHS[Math.floor(Math.random() * GLYPHS.length)] + GLYPHS[Math.floor(Math.random() * GLYPHS.length)] : '';
        st.textEl.innerHTML = '';
        st.textEl.append(document.createTextNode(c.text.slice(0, shown)));
        if (tail) { const i = document.createElement('i'); i.textContent = tail; st.textEl.append(i); }
      }
      if (c.t > c.dur || busy) { st.el.classList.remove('on'); st.cur = null; }
    }
    // face (20 fps while visible)
    st.faceT -= dt;
    if (st.el && st.faceCtx && (st.cur || st.el.classList.contains('on')) && st.faceT <= 0) {
      st.faceT = 0.05;
      const talking = st.cur && st.cur.shown < st.cur.text.length ? 1 : 0.15;
      drawAlgoFace(st.faceCtx, 64, 48, st.t, { talk: talking, mood: st.cur?.mood || game.run?.algo?.mood, glitch: st.cur?.voice ? 0.5 : 0.25 });
    }
    st.speakingT = st.cur ? st.cur.t : 0;
  }

  // ---------------------------------------------------------------- host: tracking
  const DAY = () => core.day;
  function hostTrack(dt) {
    const run = game.run, hd = game.hostData, day = DAY();
    if (!run || !hd || !day || run.phase !== 'moon') return;
    const players = game.aiPlayers?.() || [];
    const alive = players.filter((p) => !p.dead);
    // carried value per holder
    const carry = new Map();
    for (const it of game.items.all()) {
      if (!it.holder || String(it.holder).startsWith('c:') || !it.def || !isSellable(it.def) || it.soulbound) continue;
      carry.set(it.holder, (carry.get(it.holder) || 0) + (it.value || 0));
    }
    for (const p of players) {
      const r = core.dayPlayer(p.id);
      if (p.dead) continue;
      if (p.inShip) { r.shipT += dt; day.tot.shipT += dt; st.alone.set(p.id, 0); continue; }
      r.activeT += dt; day.tot.activeT += dt;
      if (p.zone === 'in') r.entered = true;
      if ((p.noise || 0) >= 0.6 || (p.voice || 0) > 0.35) { r.loudT += dt; day.tot.loudT += dt; }
      if (p.flash) { r.lightT += dt; day.tot.lightT += dt; }
      const c = carry.get(p.id) || 0;
      if (c > r.maxCarry) r.maxCarry = c;
      if (c > day.tot.maxCarry) { day.tot.maxCarry = c; day.tot.maxCarryBy = p.id; }
      // separation
      let near = Infinity;
      for (const q of alive) if (q !== p && !q.inShip) near = Math.min(near, q.pos.distanceTo(p.pos));
      const apart = alive.length > 1 && near > ALONE_R;
      if (apart) { r.apartT += dt; day.tot.apartT += dt; }
      const at = apart && p.zone === 'in' ? (st.alone.get(p.id) || 0) + dt : 0;
      st.alone.set(p.id, at);
      r.nearest = near;
      if (at > ALONE_LINE_T && !r.aloneSaid) { r.aloneSaid = hostSay('alone', { name: game.playerName(p.id), n: Math.round(near) }); }
      // backtracking (route reuse): entering a 6 m cell last visited > 40 s ago
      const key = (p.zone === 'in' ? 'i' : 'o') + Math.floor(p.pos.x / 6) + ',' + Math.floor(p.pos.z / 6);
      const prev = st.cells.get(key);
      if (prev !== undefined && core.clock - prev > 40 && (r.lastCell !== key)) { day.tot.backtracks += 1; }
      if (r.lastCell !== key) { st.cells.set(key, core.clock); r.lastCell = key; }
      // greed line
      const greedAt = Math.max(150, (run.quota || 0) * 0.3);
      if (c >= greedAt && !day.said.greed) day.said.greed = hostSay('greed', { name: game.playerName(p.id), n: Math.round(c) });
    }
    // first scrap / first kill / midnight
    if (!day.said.firstScrap && (hd.dayStats?.collected || 0) > 0) {
      const holder = [...game.items.inShipItems()].find((it) => it.collected && it.lastHolder)?.lastHolder;
      day.said.firstScrap = hostSay('first_scrap', { name: holder ? game.playerName(holder) : game.profile.name }, { gap: 4 });
    }
    if (!day.said.firstKill && day.tot.kills > 0) day.said.firstKill = hostSay('first_kill', { name: day.lastKiller ? game.playerName(day.lastKiller) : game.profile.name }, { gap: 4 });
    if (!day.said.midnight && run.time >= 23 * 60 + 5) day.said.midnight = hostSay('midnight', {}, { gap: 3 });
    hostNudge(players, carry);
  }

  // one soft "adaptation" matching today's focus: a director scare + a line (max NUDGES_PER_DAY, NUDGE_GAP apart)
  function hostNudge(players, carry) {
    const run = game.run, hd = game.hostData, day = DAY();
    const focus = run.algo?.focus;
    if (!focus || (hd.moonT || 0) < 100 || st.nudgesToday >= NUDGES_PER_DAY || st.t < st.nextNudgeT) return;
    const dir = game.director;
    const trig = (kind, id) => { try { return !!dir?.trigger?.(kind, id); } catch { return false; } };
    let ok = false, who = null, n = 0;
    for (const p of players) {
      if (p.dead) continue;
      const r = core.dayPlayer(p.id);
      if (focus === 'coward' && p.inShip && r.shipT > 90 && (hd.moonT || 0) > 200) { ok = true; who = p.id; break; }
      if (p.inShip || p.zone !== 'in') continue;
      if (focus === 'noise' && (p.noise || 0) >= 0.6) ok = trig('vent', p.id) || trig('fs', p.id);
      else if (focus === 'light' && p.flash) ok = trig('flk', p.id);
      else if (focus === 'split' && (st.alone.get(p.id) || 0) > 40) ok = trig('fig', p.id);
      else if (focus === 'doors' && core.clock - (day.lastDoorT[p.id] ?? -99) < 4) ok = trig('door', p.id);
      else if (focus === 'greed' && (carry.get(p.id) || 0) >= 150) { ok = trig('pressure', p.id); n = carry.get(p.id); }
      if (ok) { who = p.id; break; }
    }
    if (!ok) return;
    st.nudgesToday += 1; st.nextNudgeT = st.t + NUDGE_GAP;
    day.nudges.push({ focus, who: game.playerName(who), t: Math.round(run.time) });
    hostSay('nudge_' + focus, { name: game.playerName(who), n: Math.round(n) }, { gap: 3 });
    core.emit('tfg:algo', { focus, mood: run.algo.mood, kind: 'nudge', player: who });
  }

  // ---------------------------------------------------------------- host: day lifecycle
  function onLanding() {
    st.nudgesToday = 0; st.nextNudgeT = 0; st.alone.clear(); st.cells.clear(); st.spellTimes.length = 0;
  }
  function onMoon() {
    const a = ensure(game.run);
    if (!a) return;
    if (!a.focus) a.focus = FOCI[(game.run.seed >>> 3) % FOCI.length];   // day 1: the Algorithm guesses
    game.later?.(() => {
      if (game.run?.phase !== 'moon') return;
      const key = a.scores ? 'brief_' + a.focus : 'brief_none';
      hostSay(key, { n: Math.round(a.n || 0) }, { force: true });
    }, 4500);
    core.emit('tfg:algo', { focus: a.focus, mood: a.mood, kind: 'brief' });
  }
  /** host, end of a moon day: score the crew, pick tomorrow's focus + mood. Returns { focus, mood, verdictKey, verdictVars } */
  function endDay(summary) {
    const run = game.run, day = DAY(), a = ensure(run);
    if (!a || !day) return null;
    const T = day.tot;
    const act = Math.max(1, T.activeT);
    const nP = Math.max(1, (summary?.players || []).length);
    const q = Math.max(1, run.quota || 1);
    const scores = {
      noise: (T.loudT / act) / 0.22,
      light: (T.lightT / act) / 0.45,
      split: nP > 1 ? (T.apartT / act) / 0.35 : 0,
      doors: (T.doors / Math.max(1, act / 60)) / 3,
      greed: T.maxCarry / Math.max(120, q * 0.25),
      coward: (T.shipT / Math.max(1, T.activeT + T.shipT)) / 0.35 + (day.earlyTakeoff ? 0.8 : 0),
    };
    let best = null, bv = -1;
    for (const f of FOCI) if (scores[f] > bv) { bv = scores[f]; best = f; }
    if (bv < 0.5) best = FOCI[(run.seed + run.day) % FOCI.length];   // nothing stood out: the Algorithm experiments
    const nFor = { noise: T.loudT, light: T.lightT, greed: T.maxCarry, split: T.apartT, doors: T.doors, coward: T.shipT };
    const deaths = summary?.deaths || [];
    const collected = summary?.collected || 0;
    const engagement = deaths.length * 25 + T.kills * 6 + T.loudT / 8 + T.spells * 2 + day.events.length * 8 + (collected / q) * 30;
    const mood = summary?.allDead ? 'ecstatic' : engagement < 15 ? 'bored' : engagement < 45 ? 'amused' : engagement < 90 ? 'delighted' : 'ecstatic';
    a.focus = best; a.n = Math.round(nFor[best] || 0); a.mood = mood; a.day = run.day;
    a.scores = Object.fromEntries(Object.entries(scores).map(([k, v]) => [k, Math.round(v * 100) / 100]));
    a.engagement = Math.round(engagement);
    core.emit('tfg:algo', { focus: best, mood, kind: 'day', scores: a.scores });
    // verdict for the case file
    const abandoned = day.abandoned || [];
    let vk = 'verdict_poor';
    if (summary?.allDead) vk = 'verdict_wipe';
    else if (abandoned.length) vk = 'verdict_abandon';
    else if (deaths.length) vk = 'verdict_death';
    else if (collected >= q * 0.4) vk = 'verdict_rich';
    else if (collected >= 60) vk = 'verdict_clean';
    const vi = pickIndex(vk);
    return { focus: best, mood, verdict: { key: vk, i: vi, v: { name: abandoned[0] || '' } } };
  }

  // ---------------------------------------------------------------- mod events (called by lore.js)
  function onPhase(ph, prev) {
    if (!game.isHost) return;
    if (ph === 'landing') onLanding();
    else if (ph === 'moon') onMoon();
    else if (ph === 'takeoff') {
      const run = game.run, hd = game.hostData, day = DAY();
      const target = Math.max(1, (run.quota - run.sold) / Math.max(1, run.daysLeft));
      if (day && prev === 'moon' && hd?.takeoffReason === 'lever' && run.time < 16 * 60 && (hd.dayStats?.collected || 0) < target * 0.6) {
        day.earlyTakeoff = true;
        hostSay('takeoff_early', { n: hd.dayStats?.collected || 0 }, { gap: 2 });
      }
    } else if (ph === 'fired') hostSay('quota_fail', {}, { force: true });
  }
  function onDeath(dd, allDead) {
    if (allDead) hostSay('all_dead', {}, { force: true });
    else hostSay('death', { name: dd.name, cause: dd.cause }, { gap: 5 });
  }
  function onSpell(d) {
    if (!game.isHost) return;
    const day = DAY();
    if (day) day.tot.spells += 1;
    st.spellTimes.push(st.t);
    while (st.spellTimes.length && st.t - st.spellTimes[0] > 20) st.spellTimes.shift();
    if (st.spellTimes.length >= 4) hostSay('spell_spam', { n: st.spellTimes.length, s: Math.max(1, Math.round(st.t - st.spellTimes[0])) });
    void d;
  }

  function update(dt) {
    st.t += dt;
    clientUpdate(dt);
    if (!game.isHost || !game.run) return;
    st.tickT -= dt;
    if (st.tickT <= 0) { st.tickT = 0.5; try { hostTrack(0.5); } catch (e) { console.warn('[algo] track', e); } }
    // quota met (run.quotaIndex went up)
    const qi = game.run.quotaIndex | 0;
    if (st.lastQuotaIndex !== null && qi > st.lastQuotaIndex) hostSay('quota_met', {}, { force: true });
    st.lastQuotaIndex = qi;
    // idle chatter in orbit
    if (game.run.phase === 'orbit') {
      st.orbitT -= dt;
      if (st.orbitT <= 0) { st.orbitT = 80 + Math.random() * 70; hostSay('orbit_idle'); }
    } else st.orbitT = Math.max(st.orbitT, 30);
  }

  function dispose() {
    st.el?.remove(); st.el = null;
    try { if (game.settings?.algoVoice) window.speechSynthesis?.cancel(); } catch { /* ignore */ }
  }

  return {
    ensure, hostSay, hostSayFaction, show, onPhase, onDeath, onSpell, endDay, update, dispose, setVoice,
    get speaking() { return !!st.cur; },
    get state() { return st; },
    textOf,
  };
}
