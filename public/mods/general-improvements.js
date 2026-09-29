// general-improvements — port of the most-loved bits of GeneralImprovements (ShaosilGaming) and friends.
// TFG built-in feature (personal switch). A QoL bundle:
//  - TAB autocomplete on the ship terminal (commands, moons for ROUTE, store items for BUY, ...)
//  - an LED "SHIP LOOT" board above the ship door (loot on board, quota, deadline, clock)
//  - "+▮value SECURED" pop-ups when scrap lands inside the ship
//  - hold the drop key (G) inside the ship to unload ALL your scrap at once
KefalAPI.defineMod({
  id: 'general-improvements',
  name: 'General Improvements',
  version: '1.0.0',
  author: 'TFG Modding Team',
  inspiredBy: 'GeneralImprovements + ShipLootBoard + DropAllItems',
  builtin: true,
  scope: 'local',
  category: 'qol',
  enabledByDefault: true,
  description: 'Terminal TAB autocomplete, an LED loot board above the ship door, "+▮ SECURED" pop-ups when scrap reaches the ship, and hold G in the ship to drop all your scrap.',
  config: {
    autocomplete: { type: 'boolean', default: true, label: 'Terminal TAB autocomplete' },
    lootBoard: { type: 'boolean', default: true, label: 'Ship door loot board' },
    securedPopups: { type: 'boolean', default: true, label: '"Secured" pop-ups' },
    dropAll: { type: 'boolean', default: true, label: 'Hold G in the ship to drop all scrap' },
  },
  init(api, cfg) {
    const THREE = api.THREE;
    const sellable = (d) => !!d && api.isSellable(d) && d.kind !== 'weapon' && d.kind !== 'tool';

    // ------------------------------------------------------------------ terminal autocomplete
    const BASE_CMDS = ['help', 'moons', 'route', 'store', 'buy', 'scan', 'quota', 'crew', 'bestiary', 'switch', 'codes', 'transmit', 'teleport', 'clear', 'confirm', 'deny'];
    const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9çğıöşü\- ]/g, '').trim();
    function wordsFor(game, first) {
      if (first === 'route') return api.MOON_ORDER.map((id) => api.MOONS[id]).filter(Boolean).map((m) => norm(m.short || m.name));
      if (first === 'buy') return [...api.STORE_ITEMS.map((id) => api.ITEMS[id]?.name), ...Object.values(api.SHIP_UPGRADES).filter((u) => u.price > 0).map((u) => u.name)].filter(Boolean).map(norm);
      if (first === 'bestiary') return Object.entries(api.CREATURES).filter(([id]) => game.profile.bestiary?.[id]?.seen).map(([, d]) => norm(d.name));
      if (first === 'switch' || first === 'teleport') return [...game.remotes.values()].map((r) => norm(r.name));
      if (first === 'features') return (game.mods?.features?.() || []).map((d) => norm(d.name));
      return null;
    }
    function complete(game, inp) {
      const val = inp.value;
      const parts = val.replace(/^\s+/, '').split(/\s+/);
      const term = game.terminal;
      let pool, prefix, head;
      if (parts.length <= 1) {
        const mm = game.mods;
        const modCmds = mm ? [...mm.commands.entries()].filter(([, v]) => !v.owner || mm.featureOn(v.owner)).map(([k]) => k) : [];
        pool = [...new Set([...BASE_CMDS, ...modCmds])];
        prefix = norm(parts[0] || ''); head = '';
      } else {
        const first = norm(parts[0]);
        pool = wordsFor(game, first);
        if (!pool) return;
        prefix = norm(parts.slice(1).join(' ')); head = parts[0] + ' ';
      }
      const hits = [...new Set(pool.filter((w) => w.startsWith(prefix)))].sort();
      if (!hits.length) { game.sfx('ui_error', 0.25); return; }
      if (hits.length === 1) { inp.value = head + hits[0] + ' '; return; }
      let common = hits[0];
      for (const h of hits) while (!h.startsWith(common)) common = common.slice(0, -1);
      if (common.length > prefix.length) inp.value = head + common;
      else term.print(hits.slice(0, 24).map((h) => h.toUpperCase()).join('   '), 'dim');
    }

    api.on('netReady', (net, game) => {
      const term = game.terminal;
      const origEnsure = term.ensureDom.bind(term);
      term.ensureDom = function () {
        const fresh = !this.el;
        origEnsure();
        if (fresh && this.inp) {
          this.inp.addEventListener('keydown', (e) => {
            if (e.key !== 'Tab') return;
            e.preventDefault();
            if (!api.enabled() || !cfg.autocomplete) return;
            try { complete(game, this.inp); } catch (err) { console.warn('[general-improvements] tab', err); }
          });
        }
      };
      buildBoard(game);
    });

    // ------------------------------------------------------------------ LED loot board above the ship door
    let board = null;   // { mesh, ctx, tex, t, last }
    function buildBoard(game) {
      if (!cfg.lootBoard || !api.enabled()) return;
      const S = api.SHIP;
      const c = document.createElement('canvas'); c.width = 192; c.height = 56;
      const tex = new THREE.CanvasTexture(c);
      tex.minFilter = THREE.NearestFilter; tex.magFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.colorSpace = THREE.SRGBColorSpace;
      const g = new THREE.Group();
      const sp = game.ship?.layout?.mods?.lootBoard;   // [wave5] world/shiplayout.js MOD_SPOTS: flush on the wall above the door (it floated 0.15 m off it)
      if (sp) g.position.set(sp.x, sp.y, sp.z); else g.position.set(S.door.x, S.door.height + 0.42, S.z1 - 0.07);
      g.rotation.y = Math.PI;                    // face into the ship
      const back = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.56, 0.08), new THREE.MeshLambertMaterial({ color: 0x141414 }));
      back.position.z = -0.03; g.add(back);
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.47), new THREE.MeshBasicMaterial({ map: tex, fog: false, toneMapped: false }));
      mesh.position.z = 0.015; g.add(mesh);
      game.ship.group.add(g);
      board = { g, ctx: c.getContext('2d'), tex, t: 0, last: '' };
    }
    function drawBoard(game) {
      const run = game.run || {};
      let total = 0, n = 0;
      for (const it of game.items.all()) {
        if (it.state !== 'world' || !sellable(it.def) || it.soulbound || it.type === 'body') continue;
        if (!api.insideShip(it.obj.position)) continue;
        total += it.value || 0; n++;
      }
      const m = Math.round(run.time ?? 480);
      const h = Math.floor(m / 60) % 24, ap = h >= 12 ? 'PM' : 'AM';
      const clock = `${(h % 12) || 12}:${String(m % 60).padStart(2, '0')}${ap}`;
      const key = `${total}|${n}|${run.sold}|${run.quota}|${run.daysLeft}|${clock}|${run.phase}`;
      if (key === board.last) return;
      board.last = key;
      const c = board.ctx, W = 192, H = 56;
      c.fillStyle = '#050201'; c.fillRect(0, 0, W, H);
      // LED dot matrix feel
      c.font = '16px VT323, monospace'; c.textAlign = 'left';
      c.fillStyle = '#ffb347'; c.fillText(`SHIP LOOT ▮${total}`, 6, 16);
      c.textAlign = 'right'; c.fillStyle = '#ff7a3d'; c.fillText(`${n} ITEM${n === 1 ? '' : 'S'}`, W - 6, 16);
      const quota = run.quota || 0, sold = run.sold || 0;
      const f = quota ? Math.min(1, sold / quota) : 0, f2 = quota ? Math.min(1, (sold + total) / quota) : 0;
      c.strokeStyle = '#7a3a12'; c.strokeRect(6.5, 22.5, W - 13, 8);
      c.fillStyle = 'rgba(255,179,71,0.35)'; c.fillRect(7, 23, (W - 14) * f2, 7);
      c.fillStyle = '#ffb347'; c.fillRect(7, 23, (W - 14) * f, 7);
      c.textAlign = 'left'; c.fillStyle = '#ffd9a8'; c.font = '14px VT323, monospace';
      c.fillText(`QUOTA ▮${sold}/▮${quota}`, 6, 47);
      c.textAlign = 'right'; c.fillStyle = run.daysLeft <= 1 ? '#ff4a3a' : '#ffd9a8';
      c.fillText(run.phase === 'moon' ? clock : `${run.daysLeft ?? '-'} DAY${run.daysLeft === 1 ? '' : 'S'} LEFT`, W - 6, 47);
      c.fillStyle = 'rgba(0,0,0,0.25)';
      for (let y = 0; y < H; y += 2) c.fillRect(0, y, W, 1);
      board.tex.needsUpdate = true;
    }

    // ------------------------------------------------------------------ secured pop-ups + drop all
    const seenOut = new WeakSet();     // items that were seen outside the ship this landing
    const popped = new WeakSet();
    let scanT = 0, holdG = 0, dropping = false;
    const tmp = new THREE.Vector3();

    function dropAll(game) {
      const p = game.player;
      const list = p.slots.map((id) => id && game.items.get(id)).filter((it) => it && sellable(it.def) && !it.soulbound && it.state === 'held');
      if (!list.length) return;
      dropping = true;
      const fwd = p.forward().setY(0).normalize();
      const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
      list.forEach((it, k) => {
        const i = p.slots.indexOf(it.id);
        if (i >= 0) p.slots[i] = null;
        const off = (k - (list.length - 1) / 2) * 0.38;
        const pos = p.pos.clone().addScaledVector(fwd, 0.75).addScaledVector(right, off).add(new THREE.Vector3(0, 0.9, 0));
        if (!api.insideShip(pos)) pos.copy(p.pos).add(new THREE.Vector3(0, 0.9 + k * 0.3, 0));
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.yaw + k * 0.7);
        game.net.request('drop', { id: it.id, p: pos.toArray(), q: q.toArray(), lv: [0, 0, 0] });
      });
      game.sfx('item_drop', 0.6);
      game.refreshHeldVisuals();
      game.ui.toast(`Unloaded ${list.length} item${list.length > 1 ? 's' : ''}.`, 'info');
      setTimeout(() => { dropping = false; }, 300);
    }

    api.on('update', (dt, game) => {
      const p = game.player;
      // board
      if (board) {
        board.t -= dt;
        if (board.t <= 0 && game.camera.position.length() < 14) { board.t = 0.5; drawBoard(game); }
      }
      // hold G in the ship: drop everything sellable
      if (cfg.dropAll && !p.dead && p.inShip && game.input.enabled && game.input.isDown('drop')) {
        holdG += dt;
        if (holdG > 0.6 && !dropping) { holdG = -99; dropAll(game); }
      } else holdG = 0;
      // secured pop-ups
      if (!cfg.securedPopups || game.run?.phase !== 'moon') return;
      scanT -= dt;
      if (scanT > 0) return;
      scanT = 0.25;
      const cam = game.camera.position;
      for (const it of game.items.all()) {
        if (!sellable(it.def) || it.soulbound || it.type === 'body') continue;
        if (it.state !== 'world') {
          const hp = it.holder === game.selfId ? p.pos : game.remotes.get(it.holder)?.pos;
          if (hp && !api.insideShip(hp)) seenOut.add(it);
          continue;
        }
        const inside = api.insideShip(it.obj.position);
        if (!inside) { seenOut.add(it); continue; }
        if (!seenOut.has(it) || popped.has(it)) continue;
        popped.add(it);
        it.obj.getWorldPosition(tmp);
        if (tmp.distanceTo(cam) > 16) continue;
        game.ui.hud?.floatText(tmp.clone().add(new THREE.Vector3(0, 0.5, 0)), `+▮${it.value} SECURED`, '#7dff7d', it.value >= 80);
        game.audio.play('coins', { volume: 0.18 + Math.min(0.3, it.value / 600), bus: 'sfx', pitch: 1.1 + Math.random() * 0.2 });
      }
    });

    api.on('sessionEnd', () => {
      if (board) { board.g.removeFromParent(); board.g.traverse((o) => { o.geometry?.dispose?.(); o.material?.map?.dispose?.(); o.material?.dispose?.(); }); board = null; }
    });
  },
});
