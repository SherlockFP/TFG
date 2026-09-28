// night-vision — helmet night-vision mode: press N to boost ambient light with a green phosphor tint.
// Runs on a small rechargeable battery (refills aboard the ship). Local visual effect.
KefalAPI.defineMod({
  id: 'night-vision',
  name: 'Night Vision',
  version: '1.0.0',
  author: 'TFG Modding Team',
  inspiredBy: 'NightVision / FlashlightToggle',
  enabledByDefault: false,
  cheat: true,
  description: 'Toggle helmet night vision (default N): brightens the dark with a green phosphor tint and thinner fog. Has a battery that recharges on the ship.',
  config: {
    key: { type: 'select', options: ['KeyN', 'KeyB', 'KeyH', 'KeyJ', 'KeyU'], default: 'KeyN', label: 'Toggle key' },
    indoorOnly: { type: 'boolean', default: true, label: 'Only works inside the facility' },
    strength: { type: 'number', default: 0.9, min: 0.2, max: 2, step: 0.05, label: 'Brightness' },
    batterySec: { type: 'number', default: 150, min: 0, max: 1200, label: 'Battery seconds (0 = unlimited)' },
  },
  init(api, cfg) {
    let on = false, active = false, orig = null, overlay = null, meter = null, activeGame = null;
    let battery = Number(cfg.batterySec) || 0;
    const maxBat = battery;

    const ensureDom = (game) => {
      if (!overlay || !overlay.isConnected) {
        const host = game.engine?.canvas?.parentElement || document.body;
        overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;pointer-events:none;display:none;mix-blend-mode:multiply;background:radial-gradient(ellipse at center, rgba(120,255,140,0.95) 0%, rgba(70,200,90,0.9) 60%, rgba(10,40,15,0.95) 100%);z-index:2;';
        host.appendChild(overlay);
      }
      const hudEl = game.ui?.hud?.el;
      if (hudEl && (!meter || !meter.isConnected)) {
        meter = document.createElement('div');
        meter.style.cssText = 'position:absolute;left:34px;bottom:64px;font-size:20px;color:#8dff9d;display:none;text-shadow:0 0 6px #000;';
        hudEl.appendChild(meter);
      }
    };

    function apply(game) {
      const L = game.lights, u = game.engine.postMat?.uniforms;
      if (!orig) orig = { amb: L.ambient.color.getHex(), sat: u?.uSat?.value ?? 1, gamma: u?.uGamma?.value ?? 1.08 };
      L.ambient.color.setHex(0xb8ffc4);
      L.ambient.intensity = Math.max(L.ambient.intensity, Number(cfg.strength) || 0.9);
      L.hemi.intensity = Math.max(L.hemi.intensity, 0.25);
      if (game.scene.fog) game.scene.fog.density *= 0.45;
      if (u?.uSat) u.uSat.value = 0.15;
      if (u?.uGamma) u.uGamma.value = 1.3;
      overlay.style.display = 'block';
      active = true;
      activeGame = game;
    }
    function unapply(game) {
      if (!active) return;
      active = false;
      activeGame = null;
      const u = game.engine.postMat?.uniforms;
      if (orig) {
        game.lights.ambient.color.setHex(orig.amb);
        if (u?.uSat) u.uSat.value = orig.sat;
        if (u?.uGamma) u.uGamma.value = orig.gamma;
      }
      if (overlay) overlay.style.display = 'none';
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', (e) => {
        const game = api.game;
        if (!game || e.code !== cfg.key || e.repeat || game.input?.isTyping()) return;
        if (game.ui.panelOpen || game.ui.chatOpen || game.minigame || game.terminal?.active || game.player.dead) return;
        on = !on;
        game.audio.play('flashlight_click', { volume: 0.6 });
        if (on) game.audio.play('walkie_static', { volume: 0.15 });
        game.ui.toast(on ? 'Night vision ON' : 'Night vision off');
      });
    }

    api.on('netReady', (net, game) => { on = false; active = false; orig = null; battery = maxBat; });
    // the renderer outlives a session: if the game ends while NV is active, undo the post-fx tweaks
    if (typeof setInterval !== 'undefined') setInterval(() => { if (active && activeGame && api.game !== activeGame) { unapply(activeGame); on = false; } }, 400);

    api.on('update', (dt, game) => {
      ensureDom(game);
      const p = game.player;
      if (maxBat > 0) {
        if (p.inShip) battery = Math.min(maxBat, battery + dt * maxBat / 20);
        else if (on && active) battery = Math.max(0, battery - dt);
        if (on && battery <= 0) { on = false; game.audio.play('battery_dead', { volume: 0.6 }); game.ui.toast('Night vision battery depleted. Recharge on the ship.', 'bad'); }
      }
      const want = on && !p.dead && (!cfg.indoorOnly || p.indoor) && game.run?.phase !== 'orbit';
      if (want) apply(game); else unapply(game);
      if (meter) {
        meter.style.display = on ? '' : 'none';
        meter.textContent = maxBat > 0 ? `NV ${Math.round((battery / maxBat) * 100)}%${!want ? ' (standby)' : ''}` : `NV${!want ? ' (standby)' : ''}`;
      }
    });
  },
});
