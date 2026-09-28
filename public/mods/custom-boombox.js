// custom-boombox — port of Custom Boombox Music (Steven) + Boombox Controller (KoderTeh).
// Type /boombox in chat while carrying a boombox to load your own audio file into it. The file is
// shared with the crew (WebRTC binary channel) so everybody hears your track from your boombox.
KefalAPI.defineMod({
  id: 'custom-boombox',
  name: 'Custom Boombox',
  version: '1.0.0',
  author: 'TFG Modding Team',
  inspiredBy: 'Custom Boombox Music + Boombox Controller',
  builtin: true,
  scope: 'local',
  category: 'social',
  enabledByDefault: true,
  description: 'Load your own music into a boombox: /boombox (file picker), /boombox url <link> (opt-in), /boombox reset, /boombox vol <0-1.5>. Tracks are shared with crewmates who also run the mod.',
  config: {
    share: { type: 'boolean', default: true, label: 'Share tracks with the crew' },
    maxMB: { type: 'number', default: 8, min: 1, max: 40, label: 'Max file size (MB)' },
    maxTrackLengthSec: { type: 'number', default: 300, min: 10, max: 1200, label: 'Max track length (s)' },
    allowUrlLoad: { type: 'boolean', default: false, label: 'Allow /boombox url (fetches from the internet)' },
    volume: { type: 'number', default: 0.8, min: 0, max: 1.5, step: 0.05, label: 'Volume' },
  },
  init(api, cfg) {
    const tracks = new Map();   // itemId -> { name, title }
    let vol = Number(cfg.volume) || 0.8;
    let counter = 0;

    const myBoombox = (game) => {
      const held = game.player.heldItem();
      if (held?.type === 'boombox') return held;
      for (const id of game.player.slots) { const it = id && game.items.get(id); if (it?.type === 'boombox') return it; }
      return null;
    };

    function restart(game, it) {
      if (!it) return;
      if (it.music) { it.music.stop(0.2); it.music = null; }
      if (it.on) game.onItemState(it);
    }

    async function decode(game, ab) {
      const ctx = game.audio.ctx;
      if (!ctx) throw new Error('audio not ready');
      let buf = await ctx.decodeAudioData(ab);
      const max = Math.max(10, Number(cfg.maxTrackLengthSec) || 300);
      if (buf.duration > max) {
        const len = Math.floor(max * buf.sampleRate);
        const out = ctx.createBuffer(buf.numberOfChannels, len, buf.sampleRate);
        for (let ch = 0; ch < buf.numberOfChannels; ch++) out.copyToChannel(buf.getChannelData(ch).subarray(0, len), ch);
        buf = out;
      }
      return buf;
    }

    async function assign(game, itemId, ab, title, fromName) {
      const buf = await decode(game, ab);
      const name = `kmod_bb_${itemId}_${++counter}`;
      game.audio.buffers.set(name, buf);
      const old = tracks.get(itemId);
      if (old) game.audio.buffers.delete(old.name);
      tracks.set(itemId, { name, title });
      restart(game, game.items.get(itemId));
      game.ui.toast(fromName ? `${fromName} loaded "${title}" into a boombox.` : `Boombox loaded: "${title}" (${Math.round(buf.duration)}s)`, 'good');
    }

    function toArrayBuffer(data) {
      if (data instanceof ArrayBuffer) return data;
      if (ArrayBuffer.isView(data)) return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
      return null;
    }

    api.on('netReady', (net, game) => {
      tracks.clear();
      // play the custom track instead of the stock boombox loops
      const origState = game.onItemState;
      game.onItemState = function (it) {
        const t = it?.type === 'boombox' ? tracks.get(it.id) : null;
        if (t && this.audio.buffers.get(t.name)) {
          if (it.on && !it.music) it.music = this.audio.play(t.name, { loop: true, follow: it.obj, volume: vol, refDistance: 4, maxDistance: 55, occlude: true });
          else if (!it.on && it.music) { it.music.stop(0.2); it.music = null; }
          return;
        }
        return origState.call(this, it);
      };
      // receive shared tracks
      net.on('binary', (data, from, meta) => {
        if (meta?.kind !== 'kmod-boombox' || !meta.item) return;
        const ab = toArrayBuffer(data);
        if (!ab || ab.byteLength > (Number(cfg.maxMB) || 8) * 1048576 * 1.05) return;
        assign(game, meta.item, ab, String(meta.title || 'a song').slice(0, 60), game.playerName(from)).catch((e) => console.warn('[boombox] shared track', e));
      });
    });

    api.on('message', (d, from) => {
      const game = api.game;
      if (!game || d?.k !== 'kmod-bb') return;
      if (d.op === 'reset') {
        const t = tracks.get(d.item);
        if (t) { tracks.delete(d.item); game.audio.buffers.delete(t.name); restart(game, game.items.get(d.item)); }
      } else if (d.op === 'url' && cfg.allowUrlLoad && from !== game.selfId && /^https:\/\//i.test(d.url || '')) {
        fetch(d.url).then((r) => r.arrayBuffer()).then((ab) => assign(game, d.item, ab, String(d.title || 'a song').slice(0, 60), game.playerName(from))).catch(() => {});
      }
    });

    function pickFile(game, it) {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'audio/*,.mp3,.ogg,.wav,.m4a,.flac,.webm';
      input.style.display = 'none';
      document.body.appendChild(input);
      input.addEventListener('change', async () => {
        const f = input.files?.[0];
        input.remove();
        if (!f) return;
        const maxB = (Number(cfg.maxMB) || 8) * 1048576;
        if (f.size > maxB) { game.ui.toast(`File too big (max ${cfg.maxMB} MB).`, 'bad'); return; }
        try {
          const ab = await f.arrayBuffer();
          const title = f.name.replace(/\.[^.]+$/, '').slice(0, 60);
          const copy = ab.slice(0);
          await assign(game, it.id, ab, title);
          if (cfg.share) game.net.sendBinary(copy, { kind: 'kmod-boombox', item: it.id, title });
        } catch (e) { game.ui.toast('Could not decode that audio file.', 'bad'); console.warn(e); }
      }, { once: true });
      input.click();
    }

    api.registerChatCommand('boombox', (args, game) => {
      const sub = (args[0] || '').toLowerCase();
      if (sub === 'vol' || sub === 'volume') {
        vol = Math.max(0, Math.min(1.5, parseFloat(args[1])));
        if (!isFinite(vol)) vol = 0.8;
        for (const it of game.items.all()) if (it.type === 'boombox' && it.music && tracks.has(it.id)) it.music.setVolume(vol);
        game.ui.toast('Custom boombox volume: ' + Math.round(vol * 100) + '%');
        return;
      }
      const it = myBoombox(game);
      if (!it) { game.ui.toast('Carry a boombox first (buy one at the terminal STORE).'); return; }
      if (sub === 'reset' || sub === 'default') { api.send({ k: 'kmod-bb', op: 'reset', item: it.id }); return; }
      if (sub === 'url') {
        if (!cfg.allowUrlLoad) { game.ui.toast('URL loading is disabled in the mod settings.'); return; }
        const url = args.slice(1).join(' ').trim();
        if (!/^https:\/\//i.test(url)) { game.ui.toast('Usage: /boombox url https://...'); return; }
        const title = url.split('/').pop().split('?')[0].slice(0, 60) || 'stream';
        fetch(url).then((r) => r.arrayBuffer()).then((ab) => assign(game, it.id, ab, title)).then(() => api.send({ k: 'kmod-bb', op: 'url', item: it.id, url, title })).catch(() => game.ui.toast('Could not load that URL (CORS or not audio).', 'bad'));
        return;
      }
      pickFile(game, it);
    });
  },
});
