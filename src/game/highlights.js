// HIGHLIGHTS CLIP (wave 8, module 'highlights'; docs/wave8/highlights.md; MASTERPLAN 28.2): at the end of a day the Algorithm "edits" the crew's best on-air moment into a ~9 s replay.
//   host   records a 12 s / 10 Hz ring (players + nearby creatures, no per-frame allocation); feedcams2.record() -> onMoment() freezes a window (7 s before, 3 s after) into a compact clip;
//          the best 3 of the day are broadcast at takeoff ('hlclip', <= 20 KB in total, 5 Hz tracks).
//   all    after the day report: a "WATCH HIGHLIGHT" button in the summary + a one-time offer pill (key L). The clip plays on a CRT stream frame (highlights_view.js), skippable.
// Net (prefix 'hl'): 'hlclip' host -> everyone (HOST_ONLY) { c: [clip...] }.
import { t } from '../core/i18n.js';
import { escapeHtml } from '../core/util.js';
import { HOST_ONLY } from '../net/session.js';
import { MOONS } from './moons.js';
import * as H from './highlights_core.js';
import './highlights_i18n.js';
import { CSS, playClip } from './highlights_view.js';

HOST_ONLY.add('hlclip');

const clean = (c) => {   // a clip from the wire: bound everything before it reaches the player
  if (!c || typeof c !== 'object' || !Array.isArray(c.p) || !c.p.length) return null;
  const pk = (p) => p && typeof p.s === 'string' && p.s.length <= 4000 && (p.n | 0) > 0 && (p.n | 0) <= 200;
  const out = { k: String(c.k || 'live').slice(0, 12), s: String(c.s || '?').slice(0, 24), v: c.v | 0, x: String(c.x || '').slice(0, 40), sc: c.sc | 0, hz: H.HC.netHz,
    n: Math.min(200, c.n | 0), e: Math.max(0, +c.e || 0), ev: [],
    p: c.p.slice(0, 6).filter((q) => Array.isArray(q) && pk(q[2])).map((q) => [String(q[0] || '?').slice(0, 24), Math.max(0, q[1] | 0), q[2], q[3] ? 1 : 0]),
    c: (Array.isArray(c.c) ? c.c : []).slice(0, 6).filter((q) => Array.isArray(q) && pk(q[1])).map((q) => [Math.max(0, q[0] | 0), q[1]]) };
  return out.p.length && out.n >= 4 ? out : null;
};

export function installHighlights(game) {
  const mods = game.mods;
  if (!mods || typeof document === 'undefined') return null;
  const offs = [], timers = [];
  const R = new H.Ring();
  const S = { clock: 0, acc: 0, pend: [], clips: [], evs: [], sent: false, view: [], idx: 0, playing: null, offer: null, offered: false, sumSeen: false };
  const near = { x: new Float32Array(8), z: new Float32Array(8), n: 0 };
  let disposed = false, boundNet = null, style = null;
  const host = () => !!game.isHost, run = () => game.run;
  const onMoon = () => { const r = run(), m = r && MOONS[r.moon]; return !!m && r.phase === 'moon' && !m.company && !m.home; };
  const nameOf = (id) => { try { return game.playerName?.(id) || '?'; } catch { return '?'; } };
  style = document.createElement('style'); style.textContent = CSS; document.head?.appendChild(style);

  // ------------------------------------------------------------------ host: recorder (10 Hz, no allocation)
  function sample() {
    R.begin(S.clock);
    near.n = 0;
    const me = game.player;
    if (me && game.selfId && !me.dead) { R.setPlayer(game.selfId, me.pos.x, me.pos.z, me.yaw); near.x[0] = me.pos.x; near.z[0] = me.pos.z; near.n = 1; }
    if (game.remotes) for (const r of game.remotes.values()) {
      if (r.dead || !r.pos) continue;
      R.setPlayer(r.id, r.pos.x, r.pos.z, r.yaw || 0);
      if (near.n < 8) { near.x[near.n] = r.pos.x; near.z[near.n] = r.pos.z; near.n++; }
    }
    const cs = game.creatures?.host; if (!cs || !near.n) return;
    const lim = H.HC.near * H.HC.near;
    for (const c of cs.values()) {
      if (c.dead || !c.pos) continue;
      for (let i = 0; i < near.n; i++) {
        const dx = c.pos.x - near.x[i], dz = c.pos.z - near.z[i];
        if (dx * dx + dz * dz < lim) { R.setCreature(c.id, c.pos.x, c.pos.z); break; }
      }
    }
  }
  /** feedcams2.record() calls this on the host for every on-air moment: m = [kind, name, v, extra, score] */
  function onMoment(kind, id, m) {
    if (!host() || disposed || !m || !onMoon()) return;
    S.evs.push([S.clock, kind]); if (S.evs.length > 12) S.evs.shift();
    if (m[4] < H.HC.minScore) return;
    const p = S.pend.find((q) => Math.abs(q.tm - S.clock) < H.HC.gap);
    if (p) { if (m[4] > p.m[4]) { p.m = m; p.id = id; p.tm = S.clock; } return; }
    if (S.clips.some((c) => Math.abs(c.tm - S.clock) < H.HC.gap && c.sc >= m[4])) return;
    S.pend.push({ tm: S.clock, m, id });
  }
  function finalize(p) {
    try {
      const c = H.buildClip(R, p.tm, p.m, p.id, nameOf, S.evs.slice());
      if (c) { c.tm = p.tm; S.clips = H.keepBest(S.clips, c); }
    } catch (e) { console.warn('[highlights] build', e); }
  }
  function hostSend() {
    if (S.sent || !host()) return; S.sent = true;
    for (const p of S.pend.splice(0)) finalize(p);
    const wire = H.fitClips(S.clips);
    if (wire.length) { try { game.net.broadcast('hlclip', { c: wire }); } catch { /* net closing */ } }
  }

  // ------------------------------------------------------------------ everyone: receive, offer, play
  function onMsg(d) {
    if (disposed || !d || !Array.isArray(d.c)) return;
    const list = [];
    for (const raw of d.c.slice(0, H.HC.maxClips)) { const c = clean(raw); if (c) { try { list.push({ clip: c, tracks: H.unpackClip(c) }); } catch { /* bad clip */ } } }
    S.view = list; S.idx = 0;
    if (S.sumSeen) timers.push(setTimeout(() => offerWhenFree(), 1000));   // the summary came first: offer once the clip is here
  }
  function bindNet(net) {
    if (!net?.on_ || boundNet === net) return;
    boundNet = net; net.on_('hlclip', onMsg);
  }
  function watch() {
    if (disposed || S.playing || !S.view.length) return false;
    dropOffer();
    const i = S.idx % S.view.length, v = S.view[i];
    S.idx = i + 1;
    try {
      S.playing = playClip({ clip: v.clip, tracks: v.tracks, index: i, count: S.view.length, sfx: (n, vol) => { try { game.sfx?.(n, vol); } catch { /* audio optional */ } }, onDone: () => { S.playing = null; } });
      return true;
    } catch (e) { S.playing = null; console.warn('[highlights] play', e); return false; }
  }
  function dropOffer() { if (S.offer) { S.offer.el.remove(); document.removeEventListener('keydown', S.offer.key, true); clearTimeout(S.offer.timer); S.offer = null; } }
  function showOffer() {
    if (disposed || S.offer || S.offered || S.playing || !S.view.length) return;
    S.offered = true;
    const el = document.createElement('div');
    el.className = 'hc-offer';
    el.innerHTML = `<b>${escapeHtml(t('Watch highlight [L]'))}</b><small>${escapeHtml(t('Recorded on air, edited by the Algorithm.'))}</small>`;
    const key = (e) => { if (e.code === 'KeyL' && !e.repeat) { e.preventDefault(); e.stopPropagation(); watch(); } };
    el.addEventListener('click', () => watch());
    document.addEventListener('keydown', key, true);
    (document.getElementById('ui') || document.body).appendChild(el);
    S.offer = { el, key, timer: setTimeout(dropOffer, 14000) };
  }
  function offerWhenFree(tries = 0) {   // after the day report and any queued full-screen card; give up after ~40 s
    if (disposed || S.offered) return;
    if (game.ui?.fullscreenOpen?.() && tries < 40) { timers.push(setTimeout(() => offerWhenFree(tries + 1), 1000)); return; }
    showOffer();
  }
  const onClick = (e) => { const b = e.target?.closest?.('.hc-watch'); if (b) { e.preventDefault(); watch(); } };
  document.addEventListener('click', onClick);

  offs.push(mods.on('daySummary', (d, extra, g) => {
    if (g !== game || disposed || d?.company) return;
    S.sumSeen = true;
    if (!S.view.length) return;
    extra.push(`<div class="hc-sum"><button class="hc-watch" type="button">${escapeHtml(t('WATCH HIGHLIGHT'))}</button><span>${escapeHtml(S.view[0].clip.s)}</span></div>`);
    timers.push(setTimeout(() => offerWhenFree(), 13500));
  }));
  offs.push(mods.on('phase', (ph, g) => {
    if (g && g !== game) return;
    if (ph === 'moon') {
      R.clear(); S.clock = 0; S.acc = 0; S.pend.length = 0; S.clips = []; S.evs.length = 0; S.sent = false; S.view = []; S.idx = 0; S.offered = false; S.sumSeen = false;
      S.playing?.stop(); dropOffer();
    }
    if ((ph === 'takeoff' || ph === 'orbit') && host()) hostSend();
  }));
  offs.push(mods.on('netReady', (n, g) => { if (g === game) bindNet(n); }));
  if (game.net) bindNet(game.net);
  offs.push(mods.on('update', (dt, g) => {
    if (g !== game || disposed || !host() || !onMoon()) return;
    S.clock += dt; S.acc += dt;
    if (S.acc >= 1 / H.HC.hz) {
      S.acc = Math.min(S.acc - 1 / H.HC.hz, 0.1);
      try { sample(); } catch (e) { if (!S.warned) { S.warned = true; console.warn('[highlights] sample', e); } }
    }
    for (let i = S.pend.length - 1; i >= 0; i--) if (S.clock >= S.pend[i].tm + H.HC.post) finalize(S.pend.splice(i, 1)[0]);
  }));

  return {
    state: S, onMoment, watch, hostSend, ring: R,
    dispose() {
      disposed = true;
      for (const o of offs.splice(0)) { try { o?.(); } catch { /* ignore */ } }
      for (const x of timers.splice(0)) clearTimeout(x);
      try { S.playing?.stop(); } catch { /* ignore */ }
      dropOffer(); document.removeEventListener('click', onClick); style?.remove();
    },
  };
}
