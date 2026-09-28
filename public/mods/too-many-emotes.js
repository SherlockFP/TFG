// too-many-emotes — port of TooManyEmotes (FlipMods) / More Emotes family.
// An emote wheel (default key B) with 12 emotes. The 4 built-in avatar emotes are sent as-is, the
// extra ones are layered on top of them by this mod on every modded client (unmodded peers simply
// see you stand still). Optional emote music for the party emote.
KefalAPI.defineMod({
  id: 'too-many-emotes',
  name: 'Too Many Emotes',
  version: '1.0.0',
  author: 'TFG Modding Team',
  inspiredBy: 'TooManyEmotes + More Emotes',
  enabledByDefault: false,
  cheat: true,
  description: 'Emote wheel (press B, then click or 1-9/0) with 12 emotes: dance, wave, point, sit, spin, headbang, bow, backflip, play dead, bunny hop, shrug and a party emote with music. Also /emote <name>.',
  config: {
    wheelKey: { type: 'select', options: ['KeyB', 'KeyH', 'KeyJ', 'KeyU', 'Backquote'], default: 'KeyB', label: 'Wheel key' },
    emoteMusic: { type: 'boolean', default: true, label: 'Emote music' },
    musicVolume: { type: 'number', default: 0.35, min: 0, max: 1, step: 0.05, label: 'Music volume' },
  },
  init(api, cfg) {
    const ease = (t) => Math.min(1, Math.max(0, t));
    // pitch the avatar root (origin at the feet) around a point h meters up its body, in its own yawed frame
    const pitchAbout = (root, th, h) => {
      root.rotation.order = 'YXZ';
      root.rotation.x = th;
      const s = Math.sin(th), c = Math.cos(th), ry = root.rotation.y;
      root.position.x += Math.sin(ry) * (-h * s);
      root.position.z += Math.cos(ry) * (-h * s);
      root.position.y += h * (1 - c);
    };
    const EMOTES = [
      { id: 'dance', name: 'Dance', base: 'dance', dur: 8 },
      { id: 'wave', name: 'Wave', base: 'wave', dur: 2.5 },
      { id: 'point', name: 'Point', base: 'point', dur: 2.5 },
      { id: 'sit', name: 'Sit', base: 'sit', dur: 30 },
      { id: 'spin', name: 'Spin', base: 'dance', dur: 5, fx(a, root, t) { root.rotation.y += t * 7; } },
      { id: 'headbang', name: 'Headbang', base: null, dur: 6, fx(a, root, t) { if (a.parts?.neck) a.parts.neck.rotation.x += Math.sin(t * 15) * 0.5; if (a.parts?.torso) a.parts.torso.rotation.x += 0.15 + Math.sin(t * 15) * 0.12; } },
      { id: 'bow', name: 'Bow', base: null, dur: 2.6, fx(a, root, t, dur) { const k = ease(t * 3) * ease((dur - t) * 3); if (a.parts?.torso) a.parts.torso.rotation.x += 0.95 * k; if (a.parts?.neck) a.parts.neck.rotation.x += 0.3 * k; } },
      { id: 'flip', name: 'Backflip', base: null, dur: 2.6, fx(a, root, t) { const ph = (t % 1.3) / 1.3; const k = Math.min(1, ph / 0.8); pitchAbout(root, -k * Math.PI * 2, 0.9); root.position.y += Math.sin(k * Math.PI) * 0.9; } },
      { id: 'playdead', name: 'Play Dead', base: null, dur: 30, fx(a, root, t) { const k = ease(t * 2.5); pitchAbout(root, -Math.PI / 2 * k, 0.25); root.position.y += 0.18 * k; } },
      { id: 'hop', name: 'Bunny Hop', base: 'wave', dur: 5, fx(a, root, t) { root.position.y += Math.abs(Math.sin(t * 7)) * 0.4; } },
      { id: 'shrug', name: 'Shrug', base: null, dur: 2.2, fx(a, root, t) { const k = Math.sin(Math.min(1, t / 2.2) * Math.PI); if (a.parts?.torso) a.parts.torso.rotation.z += Math.sin(t * 4) * 0.08 * k; if (a.parts?.neck) a.parts.neck.rotation.z += 0.3 * k; if (a.parts?.hips) a.parts.hips.position.y += 0.03 * k; } },
      { id: 'party', name: 'Party Time', base: 'dance', dur: 12, music: 'boombox_3', fx(a, root, t) { root.rotation.y += Math.sin(t * 2) * 0.6; root.position.y += Math.abs(Math.sin(t * 6)) * 0.08; } },
    ];
    const BY_ID = Object.fromEntries(EMOTES.map((e) => [e.id, e]));
    const BASE_IDS = new Set(['dance', 'wave', 'point', 'sit']);

    let localMusic = null;
    function startEmote(game, e) {
      if (!e || !game || game.player.dead) return;
      game.emote = BASE_IDS.has(e.id) ? e.id : 'tme:' + e.id;
      game.emoteT = game.time + e.dur;
      game.ui.toast('Emote: ' + e.name);
      localMusic?.stop(0.3); localMusic = null;
      if (e.music && cfg.emoteMusic) localMusic = game.audio.play(e.music, { volume: (Number(cfg.musicVolume) || 0.35) * 0.6, bus: 'music', loop: true });
    }

    // ---------------------------------------------------------------- remote avatars
    function patchRemote(r) {
      if (r.__tmePatched) return;
      r.__tmePatched = true;
      const orig = r.applyState;
      r.applyState = function (s) {
        orig.call(this, s);
        const e = this.emote;
        if (typeof e === 'string' && e.startsWith('tme:')) {
          const def = BY_ID[e.slice(4)];
          this.emote = def?.base || null;
          if (this.tmeId !== (def?.id || null)) { this.tmeId = def?.id || null; this.tmeStart = performance.now(); }
        } else if (this.tmeId) this.tmeId = null;
      };
    }
    function resetRoot(r) {
      r.root.rotation.x = 0; r.root.rotation.z = 0;
      r.tmeMusic?.stop(0.4); r.tmeMusic = null;
    }

    api.on('update', (dt, game) => {
      if (localMusic && !String(game.emote || '').includes('party')) { localMusic.stop(0.4); localMusic = null; }
      for (const r of game.remotes.values()) {
        patchRemote(r);
        const def = r.tmeId && !r.dead ? BY_ID[r.tmeId] : null;
        if (!def) { if (r.__tmeWas) { resetRoot(r); r.__tmeWas = false; } continue; }
        r.__tmeWas = true;
        r.root.rotation.x = 0; r.root.rotation.z = 0;   // only emotes touch these; clear before layering
        const t = (performance.now() - (r.tmeStart || 0)) / 1000;
        try { def.fx?.(r.avatar, r.root, t, def.dur); } catch { /* fallback avatar */ }
        if (def.music && cfg.emoteMusic && !r.tmeMusic) r.tmeMusic = game.audio.play(def.music, { follow: r.root, loop: true, volume: Number(cfg.musicVolume) || 0.35, refDistance: 3, maxDistance: 35, occlude: true });
        if (!def.music && r.tmeMusic) { r.tmeMusic.stop(0.3); r.tmeMusic = null; }
      }
    });

    // ---------------------------------------------------------------- wheel UI
    const CSS = `
.kmod-ew { position: relative; width: 440px; height: 440px; margin: 6px auto 0; }
.kmod-ew .c { position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%); text-align: center; opacity: 0.7; font-size: 20px; }
.kmod-ew .btn { position: absolute; width: 112px; transform: translate(-50%,-50%); border: 1px solid rgba(255,138,61,0.5); background: rgba(0,0,0,0.35); text-align: center; padding: 6px 4px; }
.kmod-ew .btn:hover { background: rgba(255,138,61,0.25); }
.kmod-ew .btn small { display: block; opacity: 0.6; font-size: 15px; }`;
    let wheelOpen = false;
    function openWheel(game) {
      if (!document.getElementById('kmod-ew-css')) { const s = document.createElement('style'); s.id = 'kmod-ew-css'; s.textContent = CSS; document.head.appendChild(s); }
      const frame = document.createElement('div'); frame.className = 'menu-frame';
      const title = document.createElement('div'); title.className = 'menu-title'; title.textContent = 'EMOTES';
      const ring = document.createElement('div'); ring.className = 'kmod-ew';
      const center = document.createElement('div'); center.className = 'c'; center.innerHTML = 'click or<br>1-9, 0, -, =<br>[Esc] close';
      ring.appendChild(center);
      EMOTES.forEach((e, i) => {
        const a = (i / EMOTES.length) * Math.PI * 2 - Math.PI / 2;
        const b = document.createElement('button');
        b.className = 'btn';
        b.style.left = (220 + Math.cos(a) * 165) + 'px';
        b.style.top = (220 + Math.sin(a) * 165) + 'px';
        b.innerHTML = `${e.name}<small>${KEYS[i] ? KEYS[i].replace('Digit', '').replace('Minus', '-').replace('Equal', '=') : ''}</small>`;
        b.addEventListener('click', (ev) => { ev.stopPropagation(); choose(game, e); });
        ring.appendChild(b);
      });
      frame.append(title, ring);
      game.ui.openPanel(frame);
      wheelOpen = frame;
      game.audio.ui('ui_hover', 0.4);
    }
    function choose(game, e) {
      wheelOpen = false;
      game.ui.closePanel();
      startEmote(game, e);
    }
    const KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal'];

    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', (e) => {
        const game = api.game;
        if (!game || !game.input || game.input.isTyping()) return;
        if (wheelOpen && game.ui.panelOpen !== wheelOpen) wheelOpen = false; // closed by Esc / Tab
        if (wheelOpen) {
          const i = KEYS.indexOf(e.code);
          if (i >= 0 && EMOTES[i]) { e.preventDefault(); game.input.pressedSet?.delete(e.code); choose(game, EMOTES[i]); }
          else if (e.code === cfg.wheelKey) { e.preventDefault(); wheelOpen = false; game.ui.closePanel(); game.input.pressedSet?.delete(e.code); }
          return;
        }
        if (e.code !== cfg.wheelKey) return;
        if (game.ui.panelOpen || game.ui.chatOpen || game.minigame || game.terminal?.active || game.player.dead || !game.input.locked) return;
        e.preventDefault();
        openWheel(game);
      });
    }

    api.registerChatCommand('emote', (args, game) => {
      const q = (args[0] || '').toLowerCase();
      const e = EMOTES.find((x) => x.id === q || x.name.toLowerCase().replace(/\s/g, '') === q) || EMOTES.find((x) => q && x.id.startsWith(q));
      if (!e) { game.ui.chatMessage(null, 'Emotes: ' + EMOTES.map((x) => x.id).join(', '), false, 'info'); return; }
      startEmote(game, e);
    });
    api.registerChatCommand('emotes', (args, game) => game.ui.chatMessage(null, 'Emotes: ' + EMOTES.map((x) => x.id).join(', ') + ` · wheel: ${cfg.wheelKey.replace('Key', '')}`, false, 'info'));
  },
});
