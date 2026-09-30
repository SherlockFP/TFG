// CREATURES11 wave 11 - net + client side: the CAPTCHA test flow and the SHADOWBAN mute (docs/wave11/creatures11.md).
// Net (prefix c11): 'c11fx' host -> all (HOST_ONLY) { k: 'ask' {to, cid, seed, lim} | 'res' {to, ok} | 'sb' {id|null, left, cid, why} },
//                   'c11q'  client -> host request { cid, seed, picks, cancelled, busy }.
// A shadowban hides the banned player from everybody ELSE: name tag + avatar sprite, ping markers, voice (incl. the walkie), chat and chat bubbles.
// It is implemented by wrapping (not editing) game.onChat, game.hasActiveWalkie and the net 'ping' handler, and by per-frame flags on the remote avatars;
// everything is restored on dispose / when the ban ends. The banned player sees a countdown banner and sees the crew as usual.
import { HOST_ONLY } from '../net/session.js';
import { MINIGAMES } from '../minigames/index.js';
import { createCaptcha } from '../minigames/captcha.js';
import { t } from '../core/i18n.js';
import { ST, captchaAnswer } from './creatures11_ai.js';

HOST_ONLY.add('c11fx');
MINIGAMES.captcha = MINIGAMES.captcha || createCaptcha;

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;

export function installC11Fx(g, offs) {
  let banned = null;                 // { id, until }: the current shadowban (every peer keeps it, the host is the only writer)
  let banner = null, bannerT = 0, wrapT = 0, disposed = false;
  const undo = [];
  const selfId = () => g.selfId;
  const isBanned = (id) => !!banned && banned.id === id && banned.until > now();

  // ---- wraps (instance level, restored on dispose)
  const wrapInst = (obj, name, make) => {
    if (!obj || typeof obj[name] !== 'function') return;
    const had = Object.prototype.hasOwnProperty.call(obj, name), orig = obj[name], w = make(orig);
    obj[name] = w; undo.push(() => { if (obj[name] === w) { if (had) obj[name] = orig; else delete obj[name]; } });
  };
  wrapInst(g, 'onChat', (orig) => function (d, from) { if (from !== selfId() && isBanned(from)) return undefined; return orig.call(this, d, from); });
  wrapInst(g, 'hasActiveWalkie', (orig) => function (id) { if (id !== selfId() && isBanned(id)) return false; return orig.call(this, id); });
  let pingWrapped = null;
  const wrapPing = () => {                  // pings.js binds its handler on the current net: wrap it once per net (re-checked once a second)
    const map = g.net?.msgHandlers, h = map?.get?.('ping');
    if (!h || h === pingWrapped || h.__c11) return;
    const w = function (d, from, ...r) { if (from !== selfId() && isBanned(from)) return undefined; return h.call(this, d, from, ...r); };
    w.__c11 = true; pingWrapped = w; map.set('ping', w);
    undo.push(() => { if (map.get('ping') === w) map.set('ping', h); });
  };

  // ---- avatars: name tag / avatar sprite / voice volume
  function applyAvatars() {
    for (const [id, rp] of g.remotes || []) {
      const hide = isBanned(id);
      if (rp.tag) { const v = !hide && !rp.dead; if (rp.tag.visible !== v) rp.tag.visible = v; }
      if (rp.avTag) { const v = !hide && !rp.dead; if (rp.avTag.visible !== v) rp.avTag.visible = v; }
      if (hide) { if (rp._c11vol === undefined) { rp._c11vol = rp.localVolume ?? null; } rp.localVolume = 0; }
      else if (rp._c11vol !== undefined) { if (rp._c11vol === null) delete rp.localVolume; else rp.localVolume = rp._c11vol; delete rp._c11vol; }
    }
  }

  // ---- the banned player's banner (hard-edged TFG plate, hazard tape)
  function showBanner(on) {
    if (typeof document === 'undefined') return;
    if (!on) { banner?.remove(); banner = null; return; }
    if (banner) return;
    banner = document.createElement('div');
    banner.style.cssText = 'position:fixed;top:92px;left:50%;transform:translateX(-50%);z-index:60;pointer-events:none;min-width:280px;max-width:min(92vw,440px);padding:8px 14px 10px;'
      + 'background:var(--t-panel,#120d08);color:var(--t-paper,#ffd9b8);border:2px solid var(--t-bad,#ff5a48);font-family:"TFG Plate","TFG Plate Cyr",VT323,monospace;text-align:center;'
      + 'background-image:var(--t-stripe,none);background-size:100% 4px;background-repeat:no-repeat;';
    banner.innerHTML = '<div class="c11b-t" style="font-size:22px;letter-spacing:2px;color:var(--t-bad,#ff5a48)"></div><div class="c11b-s" style="font-size:16px;margin-top:2px"></div>'
      + '<div style="margin-top:6px;height:6px;background:#05080a;border:1px solid var(--t-line,#552)"><i class="c11b-b" style="display:block;height:100%;width:100%;background:var(--t-bad,#ff5a48)"></i></div>';
    banner.querySelector('.c11b-t').textContent = t('SHADOWBANNED');
    banner.querySelector('.c11b-s').textContent = t('Nobody can see or hear you. Touch a teammate to lift it.');
    (g.ui?.root || document.body).appendChild(banner);
  }
  function tickBanner(dt) {
    bannerT -= dt;
    if (bannerT > 0) return;
    bannerT = 0.1;
    const mine = !!banned && banned.id === selfId() && banned.until > now();
    if (!mine) { showBanner(false); return; }
    showBanner(true);
    const left = banned.until - now(), b = banner?.querySelector('.c11b-b');
    if (b) b.style.width = Math.max(0, Math.min(100, (left / (banned.total || 25)) * 100)) + '%';
  }

  // ---- net
  function onFx(d) {
    if (disposed || !d) return;
    if (d.k === 'sb') {
      const was = banned;
      if (d.id) {
        const left = +d.left || 0, fresh = !was || was.id !== d.id;
        banned = { id: d.id, until: now() + left, total: fresh ? left : was.total };
        if (fresh) {
          if (d.id === selfId()) { g.ui?.toast?.(t('You have been shadowbanned!'), 'bad'); g.audio?.ui?.('ui_notify', 0.7); }
          else g.ui?.toast?.(t('A crewmate was shadowbanned: name, pings and voice are gone. Find them and touch them.'), 'warn');
        }
      } else if (was) {
        banned = null;
        const msg = d.why === 'lift' ? 'The ban was lifted.' : d.why === 'dead' ? 'The Shadowban is dead: the ban is void.' : 'The ban has run out.';
        if (was.id === selfId() || d.why === 'lift') g.ui?.toast?.(t(msg), 'good');
      }
      applyAvatars();
    } else if (d.k === 'ask' && d.to === selfId()) ask(d);
    else if (d.k === 'res' && d.to === selfId()) g.ui?.toast?.(t(d.ok ? 'VERIFIED. Human enough.' : 'ROBOT DETECTED. Get away from it!'), d.ok ? 'good' : 'bad');
  }
  function ask(d) {
    if (g.minigame || g.player?.dead || typeof g.openMinigame !== 'function') { g.net.request('c11q', { cid: d.cid, seed: d.seed, busy: 1 }); return; }
    g.openMinigame('captcha', { seed: d.seed, limit: d.lim, difficulty: 0.5, noEase: true }, (res) => {
      g.net.request('c11q', { cid: d.cid, seed: d.seed, picks: res?.picks || [], cancelled: !!res?.cancelled });
    });
  }
  const on = (ev, fn) => { const off = g.mods?.on?.(ev, fn); if (typeof off === 'function') offs.push(off); };
  on('registerHandlers', (Hn, gg) => {
    if (gg !== g) return;
    Hn('c11q', (d, from) => { if (d && typeof d === 'object') captchaAnswer(g.creatures, String(d.cid), from, d.seed | 0, Array.isArray(d.picks) ? d.picks.slice(0, 9) : [], { cancelled: !!d.cancelled, busy: !!d.busy }); });
  });
  on('netReady', (net, gg) => { if (gg === g) net.on_('c11fx', onFx); });
  on('playerJoin', (id) => { if (g.isHost && ST.ban) g.later?.(() => { if (ST.ban) g.net.sendTo(id, 'c11fx', { k: 'sb', id: ST.ban.id, left: +ST.ban.left.toFixed(1), cid: ST.ban.cid }); }, 800); });
  on('phase', () => { banned = null; showBanner(false); applyAvatars(); });
  on('localDeath', () => showBanner(false));
  if (g.net?.on_) g.net.on_('c11fx', onFx);   // installed after netReady already fired

  function update(dt) {
    if (disposed) return;
    if (banned && banned.until <= now()) { banned = null; }
    applyAvatars();
    tickBanner(dt);
    wrapT -= dt; if (wrapT <= 0) { wrapT = 1; wrapPing(); }
  }
  function dispose() {
    disposed = true;
    banned = null; applyAvatars(); showBanner(false);
    for (const u of undo.splice(0)) try { u(); } catch { /* soft */ }
  }
  return {
    update, dispose, isBanned,
    /** debug: apply / clear a ban locally (visual test of the mute on this client only) */
    setLocalBan(id, sec = 25) { banned = id ? { id, until: now() + sec, total: sec } : null; applyAvatars(); },
    get banned() { return banned; },
  };
}
