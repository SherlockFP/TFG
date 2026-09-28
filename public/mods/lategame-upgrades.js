// lategame-upgrades — port of Lategame Upgrades (malco).
// Tiered, crew-wide upgrades bought with team credits from the ship terminal (LGU command).
// Levels are stored in the run (run.upgrades.lgu_<id>) so they are saved and synced to everyone.
KefalAPI.defineMod({
  id: 'lategame-upgrades',
  name: 'Lategame Upgrades',
  version: '1.0.0',
  author: 'TFG Modding Team',
  inspiredBy: 'Lategame Upgrades',
  builtin: true,
  scope: 'host',
  category: 'content',
  enabledByDefault: true,
  description: 'Terminal shop (type LGU) of tiered crew upgrades: Bigger Lungs, Running Shoes, Back Muscles, Battery Pack, Protein Powder, Better Scanner, Hazmat Plating, Strong Legs, Steady Hands.',
  config: {
    priceMul: { type: 'number', default: 1, min: 0.25, max: 4, step: 0.25, label: 'Price multiplier' },
    unlockQuota: { type: 'number', default: 0, min: 0, max: 10, label: 'Unlock after N quotas met' },
  },
  init(api, cfg) {
    const U = {
      lungs: { name: 'Bigger Lungs', max: 3, price: 120, desc: '+20 max stamina and +12% regen per level',
        apply(s, l) { s.maxStamina += 20 * l; s.staminaRegen *= 1 + 0.12 * l; } },
      shoes: { name: 'Running Shoes', max: 3, price: 150, desc: '+4% move speed per level',
        apply(s, l) { s.speedMul += 0.04 * l; } },
      back: { name: 'Back Muscles', max: 3, price: 140, desc: '-10 lb effective carry weight per level',
        apply(s, l) { s.carryRelief += 10 * l; } },
      battery: { name: 'Battery Pack', max: 3, price: 100, desc: '+30% battery life per level',
        apply(s, l) { s.batteryMul *= 1 + 0.3 * l; } },
      protein: { name: 'Protein Powder', max: 3, price: 180, desc: '+12% melee damage and +2% crit per level',
        apply(s, l) { s.meleeMul *= 1 + 0.12 * l; s.crit += 0.02 * l; } },
      scanner: { name: 'Better Scanner', max: 2, price: 90, desc: '+10 m scan range per level',
        apply(s, l) { s.scanRange += 10 * l; } },
      plating: { name: 'Hazmat Plating', max: 3, price: 220, desc: '+15 max HP and +3% armor per level',
        apply(s, l) { s.maxHp += 15 * l; s.armor = (s.armor || 0) + 0.03 * l; } },
      legs: { name: 'Strong Legs', max: 2, price: 110, desc: '+10% jump height per level',
        apply(s, l) { s.jumpMul += 0.1 * l; } },
      hands: { name: 'Steady Hands', max: 2, price: 130, desc: 'Easier vaults, fuse boxes and locks per level',
        apply(s, l) { s.minigameEase += 0.06 * l; } },
    };
    const KEY = (id) => 'lgu_' + id;
    const levelOf = (run, id) => Math.max(0, Math.min(U[id].max, Number(run?.upgrades?.[KEY(id)]) || 0));
    const priceOf = (id, lvl) => Math.round(U[id].price * (Number(cfg.priceMul) || 1) * (1 + 0.75 * lvl));
    const find = (q) => {
      q = String(q || '').toLowerCase().replace(/[^a-z]/g, '');
      if (!q) return null;
      return Object.keys(U).find((id) => id.startsWith(q) || U[id].name.toLowerCase().replace(/[^a-z]/g, '').startsWith(q))
        || Object.keys(U).find((id) => U[id].name.toLowerCase().replace(/[^a-z]/g, '').includes(q)) || null;
    };
    const locked = (run) => (run?.quotaIndex || 0) < (Number(cfg.unlockQuota) || 0);

    // stats for everyone, from the synced run state
    api.on('stats', (s, game) => {
      const run = game?.run;
      if (!run?.upgrades) return;
      for (const id of Object.keys(U)) { const l = levelOf(run, id); if (l) U[id].apply(s, l); }
    });

    // host: purchase handler
    api.on('registerHandlers', (H, game) => {
      H('kmod-lgu', (d, from) => {
        const run = game.run;
        const reply = (text, err) => game.net.sendTo(from, 'term', { to: from, text, err, cls: err ? 'err' : '' });
        const id = d.id;
        if (!U[id]) { reply('Unknown upgrade.', true); return; }
        if (locked(run)) { reply(`Lategame upgrades unlock after ${cfg.unlockQuota} quota(s) met.`, true); return; }
        const l = levelOf(run, id);
        if (l >= U[id].max) { reply(`${U[id].name} is already at max level.`, true); return; }
        const price = priceOf(id, l);
        if (run.credits < price) { reply(`Insufficient credits. ${U[id].name} Lv.${l + 1} costs ▮${price}.`, true); return; }
        run.credits -= price;
        run.upgrades = { ...(run.upgrades || {}), [KEY(id)]: l + 1 };
        game.broadcastRun(['credits', 'upgrades']);
        game.net.broadcast('sys', { text: `${game.playerName(from)} bought ${U[id].name} Lv.${l + 1} (▮${price}).`, kind: 'good' });
        game.net.broadcast('fx', { k: 'snd', s: 'ui_buy', p: [0, 1.5, 0], v: 0.8 });
        reply(`${U[id].name} upgraded to Lv.${l + 1}. Your new balance is ▮${run.credits}.`);
        game.hostSave?.();
      });
    });

    const bar = (l, max) => '[' + '#'.repeat(l) + '-'.repeat(max - l) + ']';
    const cmd = (args, term, game) => {
      const run = game?.run || {};
      const [a0, ...rest] = args;
      if (a0 === 'buy' || a0 === 'b') {
        const id = find(rest.join(''));
        if (!id) { term.print('Unknown upgrade. Type LGU for the list.', 'err'); return; }
        game.net.request('kmod-lgu', { id });
        return;
      }
      if (a0) {
        const id = find(args.join(''));
        if (!id) { term.print('Unknown upgrade. Type LGU for the list.', 'err'); return; }
        const u = U[id], l = levelOf(run, id);
        term.print(`${u.name.toUpperCase()}  ${bar(l, u.max)} Lv.${l}/${u.max}\n${u.desc}\n` + (l >= u.max ? 'Fully upgraded.' : `Next level: ▮${priceOf(id, l)}  (credits ▮${run.credits ?? 0})\nType LGU BUY ${id.toUpperCase()} to purchase.`));
        return;
      }
      const out = ['LATEGAME UPGRADES  (crew-wide, saved with the run)', ''];
      if (locked(run)) out.push(`!! Locked until ${cfg.unlockQuota} quota(s) are met.`, '');
      for (const [id, u] of Object.entries(U)) {
        const l = levelOf(run, id);
        out.push(`* ${u.name.padEnd(16)} ${bar(l, u.max).padEnd(6)} ${l >= u.max ? 'MAX' : '▮' + priceOf(id, l)}`);
      }
      out.push('', `Credits: ▮${run.credits ?? 0}`, 'LGU <name> for details · LGU BUY <name> to purchase');
      term.print(out.join('\n'));
    };
    api.registerCommand('lgu', cmd, 'Lategame Upgrades shop (LGU, LGU <name>, LGU BUY <name>)');
    api.registerCommand('lategame', cmd, 'alias of LGU');
  },
});
