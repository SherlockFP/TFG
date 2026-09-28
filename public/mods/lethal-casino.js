// lethal-casino — port of LethalCasino (mrgrm7) + GamblingMachineAtTheCompany.
// Adds a roulette table to the GACHA MACHINE corner at 0-Algorithm HQ (next to the slot machines).
// Bets use your personal Clout. Big wins are announced to the crew.
KefalAPI.defineMod({
  id: 'lethal-casino',
  name: 'Lethal Casino',
  version: '1.0.0',
  author: 'TFG Modding Team',
  inspiredBy: 'LethalCasino + GamblingMachineAtTheCompany',
  builtin: true,
  scope: 'local',
  category: 'content',
  enabledByDefault: true,
  description: 'A roulette table in the HQ casino corner. Bet Clout on colors, parity, halves, dozens or single numbers.',
  config: {
    minBet: { type: 'number', default: 10, min: 1, max: 1000, label: 'Min bet' },
    maxBet: { type: 'number', default: 500, min: 10, max: 100000, label: 'Max bet' },
    wheel: { type: 'select', options: ['european (single 0)', 'american (0 and 00)'], default: 'european (single 0)', label: 'Wheel' },
    announceWins: { type: 'boolean', default: true, label: 'Announce big wins to the crew' },
  },
  init(api, cfg) {
    const THREE = api.THREE;
    const AMERICAN = String(cfg.wheel || '').startsWith('american');
    const EU = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
    const US = [0, 28, 9, 26, 30, 11, 7, 20, 32, 17, 5, 22, 34, 15, 3, 24, 36, 13, 1, '00', 27, 10, 25, 29, 12, 8, 19, 31, 18, 6, 21, 33, 16, 4, 23, 35, 14, 2];
    const WHEEL = AMERICAN ? US : EU;
    const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
    const colorOf = (n) => (n === 0 || n === '00' ? 'green' : REDS.has(n) ? 'red' : 'black');
    const minBet = Math.max(1, Math.round(Number(cfg.minBet) || 10));
    const maxBet = Math.max(minBet, Math.round(Number(cfg.maxBet) || 500));
    // bet kinds: payout multiplier is the total returned (stake included)
    const BETS = {
      red: { label: 'RED', pays: 2, win: (n) => colorOf(n) === 'red' },
      black: { label: 'BLACK', pays: 2, win: (n) => colorOf(n) === 'black' },
      odd: { label: 'ODD', pays: 2, win: (n) => typeof n === 'number' && n > 0 && n % 2 === 1 },
      even: { label: 'EVEN', pays: 2, win: (n) => typeof n === 'number' && n > 0 && n % 2 === 0 },
      low: { label: '1-18', pays: 2, win: (n) => typeof n === 'number' && n >= 1 && n <= 18 },
      high: { label: '19-36', pays: 2, win: (n) => typeof n === 'number' && n >= 19 },
      d1: { label: '1st 12', pays: 3, win: (n) => typeof n === 'number' && n >= 1 && n <= 12 },
      d2: { label: '2nd 12', pays: 3, win: (n) => typeof n === 'number' && n >= 13 && n <= 24 },
      d3: { label: '3rd 12', pays: 3, win: (n) => typeof n === 'number' && n >= 25 },
      num: { label: 'NUMBER', pays: 36, win: (n, pick) => String(n) === String(pick) },
    };

    // ------------------------------------------------------------------ 3D table at HQ
    let table = null;   // { root, wheel, pos, spinV }
    function buildTable(THREE) {
      const root = new THREE.Group();
      const felt = new THREE.MeshLambertMaterial({ color: 0x1f6b3a });
      const wood = new THREE.MeshLambertMaterial({ color: 0x5a3418 });
      const gold = new THREE.MeshLambertMaterial({ color: 0xc9a23a, emissive: 0x3a2a05 });
      const dark = new THREE.MeshLambertMaterial({ color: 0x1a1210 });
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 0.75, 8), dark); base.position.y = 0.375; root.add(base);
      const top = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 1.3), wood); top.position.y = 0.8; root.add(top);
      const cloth = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.02, 1.1), felt); cloth.position.y = 0.87; root.add(cloth);
      // betting grid lines on the felt
      const lineMat = new THREE.MeshBasicMaterial({ color: 0xe8e0c8 });
      for (let i = 0; i <= 6; i++) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.005, 0.7), lineMat); l.position.set(0.05 + i * 0.16, 0.885, 0); root.add(l); }
      for (let j = 0; j <= 3; j++) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.97, 0.005, 0.01), lineMat); l.position.set(0.53, 0.885, -0.35 + j * 0.2333); root.add(l); }
      // the wheel (left end)
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.42, 0.14, 20), wood); bowl.position.set(-0.6, 0.94, 0); root.add(bowl);
      const wheel = new THREE.Group(); wheel.position.set(-0.6, 1.02, 0); root.add(wheel);
      const n = WHEEL.length;
      for (let i = 0; i < n; i++) {
        const c = colorOf(WHEEL[i]);
        const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.02, 3, 1, false, (i / n) * Math.PI * 2, (Math.PI * 2) / n),
          new THREE.MeshLambertMaterial({ color: c === 'red' ? 0xb3262a : c === 'green' ? 0x1e8a3a : 0x151515 }));
        wheel.add(seg);
      }
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.08, 8), gold); hub.position.y = 0.04; wheel.add(hub);
      const knob = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 0.03), gold); knob.position.y = 0.09; wheel.add(knob);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      ball.position.set(0.33, 0.03, 0); wheel.add(ball);
      // sign
      const sign = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 0.05), new THREE.MeshBasicMaterial({ color: 0xff4fd8 }));
      sign.position.set(0.55, 1.55, -0.62); root.add(sign);
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.7, 0.05), dark); post.position.set(0.55, 1.2, -0.62); root.add(post);
      return { root, wheel };
    }

    api.on('mapLoaded', (world, game) => {
      table = null;
      const c = world.company;
      if (!c) return;
      const PY = c.groundY ?? -1.25;
      const pos = new THREE.Vector3(-12.2, PY, -10.2);
      try {
        const t = buildTable(THREE);
        t.root.position.copy(pos);
        t.root.rotation.y = Math.PI / 2;
        c.group.add(t.root);
        c.colliders.push(game.physics.addStaticBox(pos.x, PY + 0.45, pos.z, 0.68, 0.45, 1.22));
        table = { ...t, pos, spinV: 0 };
        c.emitters?.push(game.lights.add({ pos: new THREE.Vector3(pos.x, PY + 3, pos.z), color: 0xffd28a, intensity: 0.9, distance: 7, group: 'company' }));
      } catch (e) { console.warn('[lethal-casino] table', e); }
    });

    api.on('interactables', (list, game) => {
      if (!table || !game.world.company) return;
      list.push({ pos: table.pos.clone().add(new THREE.Vector3(0, 1.1, 0)), r: 1.1, reach: 2.8, noLos: true, label: 'GACHA MACHINE - Roulette [E]', sub: () => `◈ ${game.profile.coins}`, action: () => openRoulette(game) });
    });

    api.on('update', (dt) => {
      if (!table) return;
      table.wheel.rotation.y += table.spinV * dt;
      table.spinV = Math.max(0.15, table.spinV * Math.pow(0.55, dt));
    });

    api.on('message', (d) => { if (d?.k === 'kmod-casino-spin' && table) table.spinV = 14; });

    // ------------------------------------------------------------------ roulette UI
    const CSS = `
.kmod-rl { min-width: 620px; }
.kmod-rl .row { display: flex; gap: 14px; align-items: flex-start; }
.kmod-rl canvas { background: #120a06; border: 1px solid rgba(255,138,61,0.4); }
.kmod-rl .bets { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; margin: 6px 0; }
.kmod-rl .btn.sel { background: rgba(255,138,61,0.25); border-color: #ff8a3d; }
.kmod-rl .btn.red { color: #ff6a6a; } .kmod-rl .btn.black { color: #ddd; }
.kmod-rl .res { font-size: 30px; min-height: 36px; margin-top: 6px; }
.kmod-rl .res.win { color: #7dff7d; } .kmod-rl .res.lose { color: #ff8a7a; }
.kmod-rl input { width: 70px; }
.kmod-rl .hist span { display: inline-block; min-width: 26px; text-align: center; margin-right: 3px; }`;

    function openRoulette(game) {
      if (!document.getElementById('kmod-rl-css')) { const s = document.createElement('style'); s.id = 'kmod-rl-css'; s.textContent = CSS; document.head.appendChild(s); }
      const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
      const wrap = mk('div', 'menu-frame kmod-rl');
      wrap.appendChild(mk('div', 'menu-title', 'GACHA MACHINE — ROULETTE'));
      const info = mk('div', 'dim');
      wrap.appendChild(info);
      const row = mk('div', 'row');
      const cv = document.createElement('canvas'); cv.width = 260; cv.height = 260;
      const right = mk('div');
      row.append(cv, right);
      wrap.appendChild(row);
      let bet = Math.min(maxBet, Math.max(minBet, 25)), kind = 'red', pick = 17, spinning = false, angle = 0;
      const history = [];
      const betLine = mk('div');
      const betsBox = mk('div', 'bets');
      const numIn = document.createElement('input'); numIn.type = 'number'; numIn.min = 0; numIn.max = 36; numIn.value = pick;
      numIn.addEventListener('keydown', (e) => e.stopPropagation());
      numIn.addEventListener('change', () => { if (spinning) { numIn.value = pick; return; } pick = numIn.value === '00' ? '00' : Math.max(0, Math.min(36, Math.round(+numIn.value || 0))); numIn.value = pick; kind = 'num'; renderBets(); });
      const res = mk('div', 'res', '');
      const hist = mk('div', 'dim hist');
      const btn = (label, fn, cls = 'small') => { const b = mk('button', 'btn ' + cls, label); b.addEventListener('click', (e) => { e.stopPropagation(); game.audio.ui('ui_click', 0.5); fn(); }); return b; };
      const renderInfo = () => { info.textContent = `You have ◈ ${game.profile.coins} · bets ◈${minBet}–${maxBet} · ${AMERICAN ? 'American wheel (0, 00)' : 'European wheel (single 0)'}`; };
      const renderBet = () => {
        betLine.innerHTML = '';
        betLine.append(mk('span', '', 'Bet: '), btn('-', () => { if (spinning) return; bet = Math.max(minBet, Math.round(bet / 2)); renderBet(); }), mk('b', '', ` ◈ ${bet} `), btn('+', () => { if (spinning) return; bet = Math.max(minBet, Math.min(maxBet, game.profile.coins, bet * 2)); renderBet(); }), btn('MAX', () => { if (spinning) return; bet = Math.max(minBet, Math.min(maxBet, game.profile.coins)); renderBet(); }));
      };
      const renderBets = () => {
        betsBox.innerHTML = '';
        for (const [k, b] of Object.entries(BETS)) {
          if (k === 'num') continue;
          betsBox.appendChild(btn(`${b.label} ×${b.pays}`, () => { if (spinning) return; kind = k; renderBets(); }, 'small' + (kind === k ? ' sel' : '') + (k === 'red' ? ' red' : k === 'black' ? ' black' : '')));
        }
        const nb = btn(`NUMBER ×36`, () => { if (spinning) return; kind = 'num'; renderBets(); }, 'small' + (kind === 'num' ? ' sel' : ''));
        betsBox.appendChild(nb);
        betsBox.appendChild(numIn);
      };
      const draw = (ballA) => {
        const ctx = cv.getContext('2d');
        const W = cv.width, R = W / 2 - 8, n = WHEEL.length;
        ctx.clearRect(0, 0, W, W);
        ctx.save(); ctx.translate(W / 2, W / 2);
        for (let i = 0; i < n; i++) {
          const a0 = angle + (i / n) * Math.PI * 2, a1 = angle + ((i + 1) / n) * Math.PI * 2;
          const c = colorOf(WHEEL[i]);
          ctx.fillStyle = c === 'red' ? '#b3262a' : c === 'green' ? '#1e8a3a' : '#1a1a1a';
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, a0, a1); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = '#c9a23a'; ctx.lineWidth = 1; ctx.stroke();
          ctx.save(); ctx.rotate((a0 + a1) / 2); ctx.fillStyle = '#fff'; ctx.font = '13px VT323, monospace'; ctx.textAlign = 'center';
          ctx.fillText(String(WHEEL[i]), R - 14, 4); ctx.restore();
        }
        ctx.fillStyle = '#5a3418'; ctx.beginPath(); ctx.arc(0, 0, R * 0.45, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#c9a23a'; ctx.beginPath(); ctx.arc(0, 0, R * 0.12, 0, Math.PI * 2); ctx.fill();
        // pointer
        ctx.fillStyle = '#ffd9b8'; ctx.beginPath(); ctx.moveTo(0, -R - 6); ctx.lineTo(-7, -R - 16); ctx.lineTo(7, -R - 16); ctx.closePath(); ctx.fill();
        if (ballA !== undefined) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(Math.cos(ballA) * (R - 30), Math.sin(ballA) * (R - 30), 5, 0, Math.PI * 2); ctx.fill(); }
        ctx.restore();
      };
      const spin = () => {
        if (spinning) return;
        if (bet < minBet || bet > maxBet) { res.textContent = `Bets are ◈${minBet}–${maxBet}.`; return; }
        if (!game.progress.spendCoins(bet)) { res.className = 'res lose'; res.textContent = 'Not enough Clout.'; game.audio.ui('ui_error', 0.6); return; }
        // the wager is frozen here: settle() must only use this snapshot (BUGS.md: payout used to read the
        // live bet / kind / number when the wheel stopped, so changing them mid-spin farmed Clout)
        const wager = { bet, kind, pick, b: BETS[kind] };
        spinning = true; numIn.disabled = true; res.className = 'res'; res.textContent = 'No more bets...';
        renderInfo();
        const idx = Math.floor(Math.random() * WHEEL.length);
        const result = WHEEL[idx];
        const n = WHEEL.length;
        // final wheel angle so pocket idx sits under the pointer (-PI/2)
        const target = -Math.PI / 2 - ((idx + 0.5) / n) * Math.PI * 2;
        const TAU = Math.PI * 2;
        const start = angle;
        const delta = (((target - start) % TAU) + TAU) % TAU;          // lands exactly on the pocket
        const total = delta + TAU * (5 + Math.floor(Math.random() * 2)); // plus a few full turns
        const dur = 3600, t0 = performance.now();
        const h = game.audio.play('slot_spin', { volume: 0.5, bus: 'ui' });
        api.send({ k: 'kmod-casino-spin' });
        if (table) table.spinV = 14;
        const tick = (now) => {
          if (!wrap.isConnected) { h?.stop(0.1); settle(result, wager); return; }
          const k = Math.min(1, (now - t0) / dur);
          const e = 1 - Math.pow(1 - k, 3);
          angle = start + total * e;
          draw(-Math.PI / 2 + (1 - e) * 14);
          if (k < 1) requestAnimationFrame(tick);
          else { h?.stop(0.1); settle(result, wager); }
        };
        requestAnimationFrame(tick);
      };
      const settle = (result, w) => {
        spinning = false; numIn.disabled = false;
        const b = w.b;
        const won = b.win(result, w.pick);
        const col = colorOf(result);
        history.unshift(result); if (history.length > 12) history.pop();
        hist.innerHTML = 'Last: ' + history.map((x) => `<span style="color:${colorOf(x) === 'red' ? '#ff6a6a' : colorOf(x) === 'green' ? '#7dff7d' : '#ddd'}">${x}</span>`).join('');
        if (won) {
          const pay = w.bet * b.pays;
          game.progress.addCoins(pay, 'Roulette');
          res.className = 'res win';
          res.textContent = `${result} ${col.toUpperCase()} — YOU WIN ◈ ${pay}!`;
          game.audio.ui(b.pays >= 36 ? 'slot_jackpot' : 'slot_win', 0.8);
          if (cfg.announceWins && (b.pays >= 36 || pay >= 500)) game.net.broadcast('sys', { text: `GACHA MACHINE: ${game.profile.name} won ◈${pay} on ${result} ${col.toUpperCase()}!`, kind: 'good' });
        } else {
          res.className = 'res lose';
          res.textContent = `${result} ${col.toUpperCase()} — the house wins.`;
          game.audio.ui('slot_lose', 0.6);
        }
        renderInfo();
      };
      right.append(betLine, betsBox, btn('SPIN', spin, 'primary'), res, hist);
      wrap.appendChild(mk('div', 'dim', 'Payouts include your stake. Zero (and double zero) lose all outside bets.'));
      const close = btn('Close', () => game.ui.closePanel(), '');
      const bottom = mk('div', 'menu-row'); bottom.appendChild(close); wrap.appendChild(bottom);
      renderInfo(); renderBet(); renderBets(); draw();
      game.ui.openPanel(wrap);
      game.audio.play('market_greet', { volume: 0.5 });
    }

    api.registerChatCommand('roulette', (args, game) => {
      if (!game.world.company) { game.ui.toast('The roulette table is at 0-Algorithm HQ.'); return; }
      const d = table ? game.player.pos.distanceTo(table.pos) : 99;
      if (d > 4) { game.ui.toast('Walk up to the roulette table in the casino corner.'); return; }
      openRoulette(game);
    });
  },
});
