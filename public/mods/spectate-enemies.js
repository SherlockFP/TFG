// spectate-enemies — port of SpectateEnemies (AllToasters).
// TFG built-in feature (crew switch). While dead, right-click switches between watching your crew and
// watching the creatures (third-person chase cam, mouse to orbit, LMB / Space for the next one).
// Wraps game.updateSpectator; the original crew spectator is untouched when the feature is off.
// Exposes game.tfgSpec (mode, current creature id, control hook) for control-company-lite.
KefalAPI.defineMod({
  id: 'spectate-enemies',
  name: 'Spectate Enemies',
  version: '1.0.0',
  author: 'TFG Modding Team',
  inspiredBy: 'SpectateEnemies',
  builtin: true,
  scope: 'host',
  category: 'social',
  enabledByDefault: true,
  description: 'Dead? Right-click to watch the creatures instead of your crew: chase cam, names, levels and what they are doing. Call out what you see.',
  config: {
    showHazards: { type: 'boolean', default: false, label: 'Include turrets and mines' },
  },
  init(api, cfg) {
    const THREE = api.THREE;
    const SKIP = new Set(['web', 'mimicdoor']);
    const HAZ = new Set(['turret', 'mine']);
    const STATE_TXT = { idle: 'idle', walk: 'wandering', run: 'HUNTING', attack: 'ATTACKING', stunned: 'stunned', flee: 'fleeing', angry: 'ANGRY', chase: 'HUNTING', ceiling: 'waiting on the ceiling', latched: 'FEEDING', sniff: 'sniffing', howl: 'howling', scream: 'SCREAMING', popped: 'POPPED', fly: 'carrying loot', armed: 'armed', alert: 'ALERT' };
    const head = new THREE.Vector3(), want = new THREE.Vector3(), dir = new THREE.Vector3();

    function watchable(game) {
      const out = [];
      for (const v of game.creatures.views.values()) {
        if (v.state === 'dead' || SKIP.has(v.type) || v.hidden) continue;
        if (HAZ.has(v.type) && !cfg.showHazards) continue;
        if (v.def?.hazard && !HAZ.has(v.type)) continue;
        out.push(v);
      }
      return out.sort((a, b) => (a.id < b.id ? -1 : 1));
    }

    api.on('netReady', (net, game) => {
      const orig = game.updateSpectator;
      const st = game.tfgSpec = { mode: 'crew', cid: null, yaw: 0, pitch: 0.35, control: null };
      game.updateSpectator = function (dt, input) {
        if (!api.enabled()) { st.mode = 'crew'; st.cid = null; return orig.call(this, dt, input); }
        const ready = (this.deadT || 0) > 2.5;
        const possessing = !!st.control?.active?.();
        if (ready && !possessing && input.mouseClicked(2)) {
          st.mode = st.mode === 'crew' ? 'creature' : 'crew';
          st.cid = null;
          this.sfx('ui_click', 0.4);
        }
        if (st.mode === 'creature') {
          const list = watchable(this);
          if (!list.length) {
            st.mode = 'crew';
            this.ui.toast('No creatures to watch right now.', 'info');
          } else {
            this.deadT = (this.deadT || 0) + dt;
            creatureCam(this, dt, input, list, possessing);
            return;
          }
        }
        const r = orig.call(this, dt, input);
        if (ready) {
          const who = this.spectating ? this.remotes.get(this.spectating)?.name : null;
          this.ui.hud?.setSpectate(who ? `Spectating ${who}  [LMB] next · [RMB] creature cam` : 'No crew left standing  ·  [RMB] watch the creatures');
        }
        return r;
      };
    });

    function creatureCam(game, dt, input, list, possessing) {
      const st = game.tfgSpec;
      let idx = list.findIndex((v) => v.id === st.cid);
      if (idx < 0) { idx = 0; st.yaw = (list[0].yaw || 0) + Math.PI; }
      if (!possessing && (input.mouseClicked(0) || input.pressed('jump'))) { idx = (idx + 1) % list.length; st.yaw = (list[idx].yaw || 0) + Math.PI; game.sfx('ui_click', 0.3); }
      const v = list[idx];
      st.cid = v.id;
      const { dx, dy } = input.consumeMouse();
      st.yaw -= dx;
      st.pitch = Math.max(-0.5, Math.min(1.1, st.pitch - dy));
      const h = v.height || 1.5;
      head.copy(v.pos); head.y += Math.max(0.5, h * 0.75);
      const dist = Math.max(2.4, Math.min(7.5, 1.6 + (v.radius || 0.5) * 2 + h * 0.8)) * (possessing ? 0.8 : 1);
      want.set(Math.sin(st.yaw) * dist, 0.5 + st.pitch * 2.2, Math.cos(st.yaw) * dist);
      const len = want.length();
      dir.copy(want).normalize();
      const hit = game.physics.raycast(head, dir, len, api.G.STATIC | api.G.DOOR);
      const cam = game.camera;
      cam.position.copy(head).addScaledVector(dir, hit ? Math.max(0.35, hit.distance - 0.25) : len);
      cam.lookAt(head);
      game.env.indoor = v.pos.y < api.FACILITY_Y + 40;
      if (st.control?.update?.(dt, input, v, game)) return;   // possession handles its own HUD line
      const name = v.def?.name || v.type;
      const lvl = v.def?.hazard ? '' : ` Lv.${v.level || 1}${v.elite ? ' ★ELITE' : ''}`;
      const doing = STATE_TXT[v.state] || v.state;
      const extra = st.control?.hint?.(v, game) || '';
      game.ui.hud?.setSpectate(`👁 ${name}${lvl} — ${doing}   (${idx + 1}/${list.length})  [LMB] next · [RMB] crew cam${extra}`);
    }

    api.on('phase', (ph, game) => { if (ph === 'orbit' && game.tfgSpec) { game.tfgSpec.mode = 'crew'; game.tfgSpec.cid = null; } });
    // every death starts on your own body / the crew, never on a creature from last time
    api.onAlways('localDeath', (cause, game) => { if (game.tfgSpec) { game.tfgSpec.mode = 'crew'; game.tfgSpec.cid = null; } });
  },
});
