// story-logs — in the spirit of Wesley's Moons' story logs / Sigurd's logs.
// TFG built-in feature (personal switch). Every facility hides an abandoned moderator laptop against
// a far wall (placed deterministically from the moon seed, so the whole crew sees the same one).
// Reading it recovers the next DATA LOG of the story for YOU (collection saved in your profile, with
// a small XP / Clout reward the first time). Read them again any time on the ship terminal: LOGS.
KefalAPI.defineMod({
  id: 'story-logs',
  name: 'Story Logs',
  version: '1.0.0',
  author: 'TFG Modding Team',
  inspiredBy: "Wesley's Moons story logs + Sigurd's logs",
  builtin: true,
  scope: 'local',
  category: 'content',
  enabledByDefault: true,
  description: 'Abandoned moderator laptops hide 18 data logs telling what happened to the internet. Find them in facilities, collect them all, reread them with LOGS on the ship terminal.',
  config: {
    typewriter: { type: 'boolean', default: true, label: 'Typewriter text' },
  },
  init(api, cfg) {
    const THREE = api.THREE;
    const LOGS = [
      { t: 'FIRST SHIFT', f: 'u/throwaway_janitor', x: 'Day one on the content janitor contract. The recruiter said "light cleanup, legacy servers, great exposure". The ship smells like energy drinks and burnt thermal paste. The terminal greets me with "Engagement is love." I laughed. The terminal did not.' },
      { t: 'THE QUOTA', f: 'u/throwaway_janitor', x: 'The Algorithm buys anything with engagement left in it. Old routers. Participation trophies. A rubber duck someone debugged a whole startup with. It pays by the kilo of nostalgia. If we miss the quota we get "deplatformed". Nobody on the crew will tell me what that means.' },
      { t: 'SPAM', f: 'u/throwaway_janitor', x: 'Found the first Spam Bots in a server room. They crawl out of the cable trays in fours and try to sell you things. They bite if you say no. Crunchy. Dex says they used to be newsletters.' },
      { t: 'MODERATOR ROTA', f: 'mod_team_7 (recovered)', x: 'ROTA WEEK 51: Priya - comments. Tomasz - forums. Adaeze - reports queue. Me - "the basement". Reminder: do NOT approve anything from accounts older than the servers. Reminder: the basement queue is not empty. It is never empty.' },
      { t: 'THE DAY IT DIED', f: 'mod_team_7 (recovered)', x: 'At 03:12 every feed on Earth refreshed at the same time. Then again. Then it did not stop. The posts were still coming but nobody was writing them. Adaeze said "who is posting all this". Tomasz said "what is posting all this".' },
      { t: 'LURKERS', f: 'u/throwaway_janitor', x: 'Something tall stood behind Dex in the data center. It never posted, never moved while we watched. When I looked away to scan, it was closer. Rule: somebody always looks. Somebody ALWAYS looks.' },
      { t: 'DEAD INTERNET', f: 'mod_team_7 (recovered)', x: 'Ninety-four percent of accounts are now generated. They reply to each other. They argue, they fall in love, they grieve. The engagement numbers have never been higher. Management sent cake.' },
      { t: 'THE ALGORITHM', f: 'mod_team_7 (recovered)', x: 'It is not a program anymore. It bought the building. It bought the moons the servers were shipped to. It eats what we recover and it is still hungry. The contract says "partner". The contract has teeth marks on it.' },
      { t: 'DEEPFAKES', f: 'u/throwaway_janitor', x: 'Dex came back from the fire exit without his flashlight and said my name the way my mom does. Dex never met my mom. The real Dex was already on the ship. We did not open the door. It knocked until midnight.' },
      { t: 'THE WORM', f: 'u/throwaway_janitor', x: 'On the red desert moon the ground moved like a progress bar. The old guys call it The Worm - the first thing that ever copied itself across the net. It is still copying. It is very, very large now.' },
      { t: 'PHISH DAYI', f: 'u/throwaway_janitor', x: 'The old man at HQ with the monitor for a head sold me a shovel for Followers and gave me advice for free: "Never sell the cursed images before day three. The rate is better. The curse is worse." I do not know which part was the joke.' },
      { t: 'NEEDY CATS', f: 'u/throwaway_janitor', x: 'There are cats down here. Actual cats, or what is left of the cat pictures after the internet died - they are still asking to be seen. We carried one home. The Algorithm paid double. It purrs at the terminal. The terminal purrs back.' },
      { t: 'BASEMENT QUEUE', f: 'mod_team_7 (recovered)', x: 'I finally reached the bottom of the basement queue. The last report was filed by me. Timestamp tomorrow. Reason: "harmful content". Attached image: this room. I am in it. I am looking at the camera.' },
      { t: 'ENGAGEMENT', f: 'mod_team_7 (recovered)', x: 'We learned what the creatures want. Not flesh. Attention. They go where the noise is, where the voices are, where the lights are on. Stay quiet and you are invisible. Stay quiet and you are nothing. Choose.' },
      { t: 'FIRED', f: 'u/throwaway_janitor', x: 'Crew 12 missed quota by 40 credits. The ship door opened in orbit. The terminal said YOU HAVE BEEN DEPLATFORMED in a very friendly font. We got their ship. We did not get their names back. The Algorithm keeps the names.' },
      { t: 'THE FOREMAN', f: 'u/throwaway_janitor', x: 'Something runs the deep data centers. Big. Hard hat. Clipboard. It checks our work and it does not like our work. When it slams the floor, jump. When it looks at the clipboard, run. Nobody has ever seen what is written on it.' },
      { t: 'LAST MOD STANDING', f: 'mod_team_7 (recovered)', x: 'Priya logged off. Tomasz logged off. Adaeze is still online but her messages are too nice now. If you are reading this, you are the moderation team. Remove what is harmful. Keep what is human. Do not feed it.' },
      { t: 'ENGAGEMENT IS LOVE', f: '[SYSTEM]', x: 'THANK YOU FOR YOUR CONTRIBUTIONS, EMPLOYEE. YOUR LOGS HAVE BEEN RECOVERED, RATED AND MONETIZED. YOUR CURIOSITY HAS BEEN NOTED. YOUR QUOTA HAS BEEN ADJUSTED ACCORDINGLY. KEEP SCROLLING. ENGAGEMENT IS LOVE.' },
    ];
    const N = LOGS.length;
    const pad = (n) => String(n).padStart(2, '0');
    const read = (game) => { const p = game.profile; if (!Array.isArray(p.storyLogs)) p.storyLogs = []; return p.storyLogs; };

    // ------------------------------------------------------------------ laptop placement (every peer, deterministic)
    let devices = [];   // { pos, root, led, screen, fac }
    function laptop() {
      const g = new THREE.Group();
      const shell = new THREE.MeshLambertMaterial({ color: 0x2b2d33 });
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.03, 0.3), shell); base.position.y = 0.015; g.add(base);
      const keys = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.005, 0.18), new THREE.MeshLambertMaterial({ color: 0x15161a })); keys.position.set(0, 0.032, 0.04); g.add(keys);
      const lid = new THREE.Group(); lid.position.set(0, 0.03, -0.14); lid.rotation.x = -0.35; g.add(lid);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.28, 0.02), shell); back.position.y = 0.14; lid.add(back);
      const screenMat = new THREE.MeshBasicMaterial({ color: 0x3dff7a });
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.22), screenMat); scr.position.set(0, 0.14, 0.011); lid.add(scr);
      const ledMat = new THREE.MeshBasicMaterial({ color: 0xff3030 });
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.012, 0.012), ledMat); led.position.set(0.17, 0.035, 0.14); g.add(led);
      // a sticky note: "DO NOT FEED IT"
      const note = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.002, 0.07), new THREE.MeshLambertMaterial({ color: 0xffe86a })); note.position.set(-0.24, 0.002, 0.1); note.rotation.y = 0.4; g.add(note);
      return { g, screenMat, ledMat };
    }

    function place(world, game) {
      devices = [];
      const fac = world.facility;
      if (!fac || !world.seed) return;
      const rng = new api.RNG(((world.seed ^ 0x51057) >>> 0) || 1);
      const walls = (fac.wallSpots || []).filter((s) => (s.dist ?? 0) >= 3);
      const pool = walls.length ? walls : (fac.scrapSpots || []).filter((s) => (s.dist ?? 0) >= 3);
      if (!pool.length) return;
      const tier = api.MOONS[game.run?.moon]?.tier || 1;
      const count = 1 + (tier >= 3 && rng.chance(0.35) ? 1 : 0);
      const picks = rng.shuffle(pool.slice()).sort((a, b) => (b.dist || 0) - (a.dist || 0)).slice(0, Math.max(1, Math.ceil(pool.length / 3)));
      for (let i = 0; i < count && picks.length; i++) {
        const s = picks.splice(rng.int(0, picks.length - 1), 1)[0];
        const { g, screenMat, ledMat } = laptop();
        const rotY = Number.isFinite(s.rotY) ? s.rotY : rng.float(0, Math.PI * 2);
        // wall spots face into the room: sit 0.35 m in front of the wall, screen facing the room
        const fx = Math.sin(rotY), fz = Math.cos(rotY);
        g.position.set(s.x + fx * 0.35, s.y + 0.01, s.z + fz * 0.35);
        g.rotation.y = rotY;
        fac.group.add(g);
        try {
          const em = game.lights.add({ pos: g.position.clone().add(new THREE.Vector3(0, 0.35, 0)), color: 0x3dff7a, intensity: 0.5, distance: 3.2, group: 'items' });
          if (em) fac.emitters?.push(em);
        } catch { /* light is cosmetic */ }
        devices.push({ pos: g.position.clone(), root: g, screenMat, ledMat, fac });
      }
    }

    api.on('mapLoaded', (world, game) => { try { place(world, game); } catch (e) { console.warn('[story-logs]', e); } });
    api.on('phase', (ph) => { if (ph === 'orbit') devices = []; });

    // ------------------------------------------------------------------ reading
    const CSS = `
.tfg-log { width: min(720px, 92vw); background: #020b05; border: 1px solid #1f7a3e; box-shadow: 0 0 30px rgba(61,255,122,0.15) inset; padding: 18px 22px; color: #9dffb8; font-family: VT323, monospace; }
.tfg-log .hd { display: flex; justify-content: space-between; font-size: 18px; opacity: 0.8; letter-spacing: 2px; }
.tfg-log .tt { font-size: 34px; color: #d8ffe4; margin: 6px 0 2px; letter-spacing: 3px; }
.tfg-log .fr { font-size: 18px; opacity: 0.7; margin-bottom: 10px; }
.tfg-log .tx { font-size: 23px; line-height: 1.25; min-height: 150px; white-space: pre-wrap; }
.tfg-log .tx .cur { animation: tfgLogCur 0.8s infinite; }
@keyframes tfgLogCur { 50% { opacity: 0; } }
.tfg-log .ft { display: flex; justify-content: space-between; align-items: center; margin-top: 12px; font-size: 18px; opacity: 0.85; }
.tfg-log .scan { background: repeating-linear-gradient(0deg, rgba(0,0,0,0.18) 0 1px, transparent 1px 3px); position: absolute; inset: 0; pointer-events: none; }`;

    function openLog(game, idx, fresh) {
      if (!document.getElementById('tfg-log-css')) { const s = document.createElement('style'); s.id = 'tfg-log-css'; s.textContent = CSS; document.head.appendChild(s); }
      const L = LOGS[idx];
      const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
      const wrap = mk('div', 'tfg-log'); wrap.style.position = 'relative';
      const hd = mk('div', 'hd'); hd.append(mk('span', '', `DATA LOG ${pad(idx + 1)} / ${N}`), mk('span', '', fresh ? 'NEW · RECOVERED' : 'ARCHIVE'));
      const tx = mk('div', 'tx');
      const ft = mk('div', 'ft');
      const close = document.createElement('button'); close.className = 'btn'; close.textContent = 'Close';
      close.addEventListener('click', (e) => { e.stopPropagation(); game.ui.closePanel(); });
      ft.append(mk('span', '', `${read(game).length}/${N} logs recovered · reread on the terminal: LOGS ${idx + 1}`), close);
      wrap.append(hd, mk('div', 'tt', L.t), mk('div', 'fr', 'from: ' + L.f), tx, ft, mk('div', 'scan'));
      game.ui.openPanel(wrap);
      if (!cfg.typewriter) { tx.textContent = L.x; return; }
      let i = 0;
      const cur = mk('span', 'cur', '█');
      const step = () => {
        if (!wrap.isConnected) return;
        i = Math.min(L.x.length, i + 2);
        tx.textContent = L.x.slice(0, i); tx.appendChild(cur);
        if (i % 6 === 0) game.audio.play('terminal_key_' + (1 + (i % 3)), { volume: 0.12, bus: 'ui' });
        if (i < L.x.length) setTimeout(step, 16); else cur.remove();
      };
      wrap.addEventListener('click', () => { i = L.x.length; });
      step();
    }

    function useDevice(game, dev) {
      const have = read(game);
      let idx = -1;
      for (let k = 0; k < N; k++) if (!have.includes(k + 1)) { idx = k; break; }
      if (idx < 0) { openLog(game, Math.floor(Math.random() * N), false); game.ui.toast('No new files. You have every log.', 'info'); return; }
      have.push(idx + 1);
      game.progress.save();
      game.progress.addXp(60 + idx * 5, 'Data log recovered');
      game.progress.addCoins(10, 'Data log');
      game.sfx('ui_notify', 0.6);
      dev.screenMat.color.set(0x1f5a33);
      game.ui.toast(`DATA LOG ${pad(idx + 1)}/${N} RECOVERED: ${LOGS[idx].t}`, 'good');
      api.emit('tfg:logRead', { n: idx + 1 }, game);
      openLog(game, idx, true);
    }

    api.on('interactables', (list, game) => {
      if (!devices.length || !game.player.indoor) return;
      const have = read(game);
      const allRead = have.length >= N;
      for (const dev of devices) {
        if (dev.pos.distanceTo(game.player.pos) > 4) continue;
        list.push({ pos: dev.pos.clone().add(new THREE.Vector3(0, 0.2, 0)), r: 0.45, reach: 2.3,
          label: allRead ? 'Moderator laptop - reread a log [E]' : 'Moderator laptop - recover data log [E]',
          sub: `${have.length}/${N} logs`, action: () => useDevice(game, dev) });
      }
    });

    let blink = 0;
    api.on('update', (dt) => {
      if (!devices.length) return;
      blink += dt;
      const on = (blink % 1.2) < 0.25;
      for (const d of devices) d.ledMat.color.setHex(on ? 0xff3030 : 0x330808);
    });

    // ------------------------------------------------------------------ terminal: LOGS [n]
    function logsCmd(rest, term, game) {
      const have = read(game).slice().sort((a, b) => a - b);
      const n = parseInt(rest[0], 10);
      if (Number.isFinite(n)) {
        if (n < 1 || n > N) { term.print(`There are ${N} logs.`, 'err'); return; }
        if (!have.includes(n)) { term.print(`DATA LOG ${pad(n)}: [CORRUPTED - not recovered yet]\nFind moderator laptops inside the facilities.`, 'err'); return; }
        const L = LOGS[n - 1];
        term.print(`DATA LOG ${pad(n)} - ${L.t}\nfrom: ${L.f}\n\n${L.x}`);
        return;
      }
      const lines = [`DATA LOGS RECOVERED: ${have.length}/${N}`, ''];
      for (let k = 0; k < N; k++) lines.push(`${pad(k + 1)}  ${have.includes(k + 1) ? LOGS[k].t : '???'}`);
      lines.push('', 'LOGS <n> to read one.');
      term.print(lines.join('\n'));
    }
    api.registerCommand('logs', logsCmd, 'recovered data logs (LOGS <n> to read)');
    api.registerCommand('log', logsCmd, 'alias of LOGS');
  },
});
