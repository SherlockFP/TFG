// SOUND2 (wave 8 sound pass 2): a tiny local helper the wave-8 modules use for their new sounds (docs/wave8/sound2.md). No net messages.
//   cue(name, pos?, vol, extra)   one-shot (2D without pos, positional with pos {x,y,z}); silently ignores unknown ids; the mix policy gates repeats
//   hold(key, name, {pos, vol, pitch, lease})   lease loop: call it every frame / tick while the thing is active; it fades out LEASE s after the last call
//   muffle(hz)                    lease low-pass on the whole mix (underwater); independent of downed's own muffle
import { LEASE, expired } from './sound2_core.js';

export function installSound2(game) {
  const audio = game.audio;
  const held = new Map();
  let lp = null, muffleUntil = 0, muffleHz = 20000, disposed = false;
  const now = () => (audio?.ctx?.currentTime ?? 0);
  const ok = (name) => !!(audio?.ctx && name && (!audio.has || audio.has(name)));

  function cue(name, pos, vol = 0.6, extra = {}) {
    try {
      if (!ok(name)) return null;
      return pos ? audio.play(name, { pos, volume: vol, refDistance: 4, maxDistance: 45, ...extra }) : audio.play(name, { volume: vol, bus: 'sfx', ...extra });
    } catch { return null; }
  }
  function hold(key, name, o = {}) {
    try {
      if (!ok(name)) return;
      const t = now(), vol = (o.vol ?? 0.5) * (audio.meta?.(name)?.vol ?? 1);
      let h = held.get(key);
      if (h && h.name !== name) { h.h?.stop(0.2); held.delete(key); h = null; }
      if (!h) {
        const hd = audio.play(name, o.pos ? { loop: true, pos: o.pos, volume: 0.0001, refDistance: o.ref ?? 4, maxDistance: o.max ?? 40 } : { loop: true, volume: 0.0001, bus: 'sfx' });
        if (!hd) return;
        h = { name, h: hd, until: 0 }; held.set(key, h);
        hd.setVolume(vol, 0.3);
      }
      h.until = t + (o.lease ?? LEASE);
      const hd = h.h;
      hd.setVolume(vol, 0.12);
      if (o.pos) hd.setPos?.(o.pos);
      if (o.pitch) hd.setPitch?.(o.pitch);
    } catch { /* audio optional */ }
  }
  function muffle(hz = 900, lease = 0.4) { muffleUntil = now() + lease; muffleHz = hz; }
  function ensureLp() {
    if (lp || !audio?.ctx || !audio.comp) return;
    try {   // sits between the master compressor and the speakers, so downed's own tone-stage filter is untouched
      const ctx = audio.ctx; lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 20000;
      audio.comp.disconnect(ctx.destination); audio.comp.connect(lp); lp.connect(ctx.destination);
    } catch { lp = null; }
  }
  const off = game.mods?.on?.('update', () => {
    if (disposed || !audio?.ctx) return;
    const t = now();
    for (const k of expired(held, t)) { held.get(k)?.h?.stop(0.35); held.delete(k); }
    const want = t < muffleUntil ? muffleHz : 20000;
    if (want < 20000) ensureLp();
    if (lp) { try { lp.frequency.setTargetAtTime(want, t, 0.25); } catch { /* audio closing */ } }
  });

  return {
    cue, hold, muffle,
    state: () => ({ held: [...held.keys()], muffled: !!lp && now() < muffleUntil }),
    dispose() {
      disposed = true; try { off?.(); } catch { /* ignore */ }
      for (const h of held.values()) { try { h.h?.stop(0.1); } catch { /* ignore */ } }
      held.clear();
      if (lp && audio?.ctx) { try { audio.comp.disconnect(lp); lp.disconnect(); audio.comp.connect(audio.ctx.destination); } catch { /* ignore */ } lp = null; }
    },
  };
}
