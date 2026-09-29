// helmet-cameras — port of Helmet Cameras (RickArg).
// TFG built-in feature (personal switch). A CRT monitor hangs from the ship ceiling next to the
// monitor bank and shows a live BODYCAM feed from a crewmate's helmet: a second, tiny render
// (default 160x120 at ~6 fps, only while you are in the ship looking at it) with a night-vision
// boost, REC overlay, name / clock stamp and static when the signal is lost.
// Press E on the monitor to switch crewmates (it follows the terminal radar target by default).
KefalAPI.defineMod({
  id: 'helmet-cameras',
  name: 'Helmet Cameras',
  version: '1.0.0',
  author: 'TFG Modding Team',
  inspiredBy: 'Helmet Cameras',
  builtin: true,
  scope: 'local',
  category: 'social',
  enabledByDefault: true,
  description: 'A ship monitor shows a live bodycam feed from a crewmate\'s helmet (night-vision boosted). E on the monitor switches crewmates. Cheap: tiny render, a few frames per second, only while you watch.',
  config: {
    fps: { type: 'number', default: 6, min: 2, max: 15, label: 'Feed frames per second' },
    resolution: { type: 'select', options: ['160x120', '224x168', '128x96'], default: '160x120', label: 'Feed resolution' },
    nightVision: { type: 'boolean', default: true, label: 'Night-vision boost' },
  },
  init(api, cfg) {
    const THREE = api.THREE;
    const [RW, RH] = String(cfg.resolution || '160x120').split('x').map((n) => Math.max(64, Math.min(320, Number(n) || 160)));
    const FPS = Math.max(2, Math.min(15, Number(cfg.fps) || 6));
    // [wave5] spot from world/shiplayout.js MOD_SPOTS (game.ship.layout.mods): over the monitor bank, clear of the cockpit window
    const MON_POS = new THREE.Vector3(-5.6, 2.75, -2.55);
    let mon = null;       // { group, rt, cam, over, overCtx, overTex, frameT, overT, sel, lastName }

    function build(game) {
      const sp = game.ship?.layout?.mods?.crewMonitor;
      if (sp) MON_POS.set(sp.x, sp.y, sp.z);
      const g = new THREE.Group();
      g.position.copy(MON_POS);
      g.rotation.y = Math.PI / 2;                 // local +Z -> world +X (into the ship)
      const tilt = new THREE.Group(); tilt.rotation.x = 0.24; g.add(tilt);
      const dark = new THREE.MeshLambertMaterial({ color: 0x1b1d20 });
      const W = 0.92, H = 0.69;
      const frame = new THREE.Mesh(new THREE.BoxGeometry(W + 0.1, H + 0.1, 0.34), dark); frame.position.z = -0.14; tilt.add(frame);
      const rt = new THREE.WebGLRenderTarget(RW, RH, { depthBuffer: true, stencilBuffer: false });
      rt.texture.minFilter = THREE.NearestFilter; rt.texture.magFilter = THREE.NearestFilter; rt.texture.generateMipmaps = false;
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: rt.texture, fog: false, toneMapped: false }));
      screen.position.z = 0.035; tilt.add(screen);
      const oc = document.createElement('canvas'); oc.width = 160; oc.height = 120;
      const overTex = new THREE.CanvasTexture(oc);
      overTex.minFilter = THREE.NearestFilter; overTex.magFilter = THREE.NearestFilter; overTex.generateMipmaps = false;
      overTex.colorSpace = THREE.SRGBColorSpace;
      const over = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: overTex, transparent: true, fog: false, toneMapped: false, depthWrite: false }));
      over.position.z = 0.04; tilt.add(over);
      // two rods to the ceiling
      const ceil = (api.SHIP?.h || 3.4) - MON_POS.y, rodY0 = H / 2 + 0.02, rodL = Math.max(0.05, ceil - rodY0);   // rods end at the ceiling (they used to poke 0.25 m through it)
      for (const x of [-0.3, 0.3]) {
        const rod = new THREE.Mesh(new THREE.BoxGeometry(0.035, rodL, 0.035), dark);
        rod.position.set(x, rodY0 + rodL / 2, -0.14); g.add(rod);
      }
      game.ship.group.add(g);
      const cam = new THREE.PerspectiveCamera(78, RW / RH, 0.18, 55);
      cam.rotation.order = 'YXZ';
      mon = { group: g, screen, rt, cam, over, oc, overCtx: oc.getContext('2d'), overTex, frameT: 0, overT: 0, sel: null, live: false, t: 0 };
      drawOverlay(game, null, 'NO SIGNAL');
    }

    function dispose() {
      if (!mon) return;
      mon.group.removeFromParent();
      mon.group.traverse((o) => { o.geometry?.dispose?.(); if (o.material) { o.material.map?.dispose?.(); o.material.dispose?.(); } });
      mon.rt.dispose();
      mon = null;
    }

    function candidates(game) { return [...game.remotes.values()].filter((r) => !r.dead && r.pos.y > -900); }
    function target(game) {
      const list = candidates(game);
      if (!list.length) return null;
      let r = mon.sel && game.remotes.get(mon.sel);
      if (!r || r.dead) {
        const rid = game.terminal?.radarTarget;
        r = (rid && game.remotes.get(rid)) || null;
        if (!r || r.dead) r = list[0];
      }
      return r;
    }

    const clock = (min) => { const m = Math.round(min || 480); return String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
    function drawOverlay(game, r, status) {
      const c = mon.overCtx, W = 160, H = 120;
      c.clearRect(0, 0, W, H);
      if (!r) {
        // static
        const img = c.createImageData(W, H);
        for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 150 | 0; img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255; }
        c.putImageData(img, 0, 0);
        c.fillStyle = 'rgba(0,0,0,0.65)'; c.fillRect(20, 46, 120, 28);
        c.fillStyle = '#e8e8e8'; c.font = '14px VT323, monospace'; c.textAlign = 'center';
        c.fillText(status || 'NO SIGNAL', 80, 59);
        c.font = '10px VT323, monospace'; c.fillStyle = '#9a9a9a'; c.fillText('BODYCAM', 80, 70);
      } else {
        c.fillStyle = 'rgba(0,0,0,0.16)';
        for (let y = 0; y < H; y += 2) c.fillRect(0, y, W, 1);
        const grd = c.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, 100);
        grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(0,0,0,0.55)');
        c.fillStyle = grd; c.fillRect(0, 0, W, H);
        c.textAlign = 'left'; c.font = '11px VT323, monospace';
        if ((mon.t * 1.2) % 2 < 1.3) { c.fillStyle = '#ff3030'; c.beginPath(); c.arc(8, 8, 3, 0, Math.PI * 2); c.fill(); c.fillStyle = '#ffd0d0'; c.fillText('REC', 14, 11); }
        c.textAlign = 'right'; c.fillStyle = '#d8ffd8'; c.fillText(clock(game.run?.time), W - 4, 11);
        c.textAlign = 'left'; c.fillStyle = '#d8ffd8';
        c.fillText(('BODYCAM · ' + r.name).slice(0, 26).toUpperCase(), 4, H - 5);
        const hp = Math.max(0, Math.min(100, Math.round(r.hp ?? 100)));
        c.textAlign = 'right'; c.fillStyle = hp < 35 ? '#ff6060' : '#9dff9d'; c.fillText(hp + '%', W - 4, H - 5);
        if (hp < 35 && Math.random() < 0.5) { c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(0, Math.random() * H, W, 2 + Math.random() * 5); }
      }
      mon.overTex.needsUpdate = true;
    }

    const saved = { ac: new THREE.Color(), fc: new THREE.Color() };
    function renderFeed(game, r) {
      const eng = game.engine, renderer = eng.renderer, scene = game.scene;
      if (!renderer || !scene) return;
      const cam = mon.cam;
      r.headPos(cam.position);
      cam.rotation.set(Math.max(-1.2, Math.min(1.2, r.pitch || 0)), r.yaw || 0, 0);
      cam.position.x -= Math.sin(r.yaw) * 0.12; cam.position.z -= Math.cos(r.yaw) * 0.12;
      cam.updateMatrixWorld(true);
      const L = game.lights, fog = scene.fog;
      const indoor = r.pos.y < api.FACILITY_Y + 40;
      const prev = { rt: renderer.getRenderTarget(), ai: L.ambient.intensity, hi: L.hemi.intensity, fd: fog ? fog.density : 0, camVis: game.camera.visible, rootVis: r.root.visible };
      saved.ac.copy(L.ambient.color); if (fog) saved.fc.copy(fog.color);
      try {
        if (cfg.nightVision) {
          L.ambient.color.set(indoor ? 0x9dffb0 : 0xd8ffe0);
          L.ambient.intensity = indoor ? 0.95 : Math.max(prev.ai, 0.35);
          if (fog && indoor) { fog.color.set(0x010603); fog.density = 0.05; }
        }
        game.camera.visible = false;       // hides our own view model / held item (children of the main camera)
        r.root.visible = false;            // don't film the inside of their helmet
        renderer.setRenderTarget(mon.rt);
        renderer.clear();
        renderer.render(scene, cam);
      } catch (e) {
        console.warn('[helmet-cameras]', e);
      } finally {
        renderer.setRenderTarget(prev.rt);
        L.ambient.intensity = prev.ai; L.ambient.color.copy(saved.ac); L.hemi.intensity = prev.hi;
        if (fog) { fog.density = prev.fd; fog.color.copy(saved.fc); }
        game.camera.visible = prev.camVis;
        r.root.visible = prev.rootVis;
      }
    }

    api.on('netReady', (net, game) => { if (!api.enabled()) return; try { build(game); } catch (e) { console.warn('[helmet-cameras] build', e); } });
    api.on('sessionEnd', () => dispose());

    api.on('interactables', (list, game) => {
      if (!mon || !game.player.inShip) return;
      list.push({
        pos: MON_POS.clone(), r: 0.6, reach: 3.4, noLos: true,
        label: () => (candidates(game).length ? 'Switch bodycam [E]' : 'Bodycam: no crew out there'),
        sub: () => { const r = target(game); return r ? 'watching ' + r.name : ''; },
        action: () => {
          const list2 = candidates(game);
          if (!list2.length) return;
          const cur = target(game);
          const i = list2.indexOf(cur);
          mon.sel = list2[(i + 1) % list2.length].id;
          mon.frameT = 0; mon.overT = 0;
          game.sfx('ui_click', 0.4);
        },
      });
    });

    api.on('update', (dt, game) => {
      if (!mon) return;
      mon.t += dt;
      const p = game.player;
      const watching = !p.dead && p.inShip && game.camera.position.distanceTo(MON_POS) < 11;
      if (!watching) return;
      const r = target(game);
      const ph = game.run?.phase;
      const live = !!r && (ph === 'moon' || ph === 'company' || ph === 'landing' || ph === 'takeoff' || ph === 'orbit');
      mon.frameT -= dt; mon.overT -= dt;
      if (live && mon.frameT <= 0) { mon.frameT = 1 / FPS; renderFeed(game, r); }
      if (mon.overT <= 0 || live !== mon.live) {
        mon.overT = live ? 0.5 : 0.15;
        mon.live = live;
        drawOverlay(game, live ? r : null, game.remotes.size ? 'SIGNAL LOST' : 'NO CREW ONLINE');
      }
    });
  },
});
