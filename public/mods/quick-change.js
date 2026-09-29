// quick-change - suit rack QoL (TooManySuits / More Suits menu family). Change clothes without walking to the wardrobe:
//   /suit [next|prev|<name>]   /hat [...]   /back [...]   cycle or pick by (part of) name, owned items only
//   /outfit save <1-3>   /outfit <1-3>   three personal presets (browser storage, never synced beyond your normal look)
KefalAPI.defineMod({
  id: 'quick-change',
  name: 'Quick Change',
  version: '1.0.0',
  author: 'TFG Modding Team',
  inspiredBy: 'TooManySuits / More Suits',
  builtin: true,
  scope: 'local',
  category: 'qol',
  enabledByDefault: true,
  description: '/suit, /hat and /back cycle or pick your owned cosmetics by name; /outfit save 1 and /outfit 1 keep three presets. Appearance only.',
  init(api) {
    const t = api.t, tf = api.tf;
    const KEY = 'tfg.quickchange.v1';
    const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
    const save = (o) => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch { /* private window */ } };
    const nameOf = (game, slot, id) => { const e = game.cosmetics.entry?.(slot, id); return String(e?.name || id); };

    function change(game, slot, arg) {
      const c = game.cosmetics;
      if (!c) return;
      const owned = (c.unlocked()[slot] || []).filter((id) => id && id !== 'none');
      const cur = c.current()[slot];
      if (!owned.length) { game.ui.toast(t('You own nothing for that slot yet.'), 'info'); return; }
      let id = null;
      const q = String(arg || '').toLowerCase().trim();
      if (!q || q === 'next' || q === 'prev') {
        const i = owned.indexOf(cur);
        id = owned[(i + (q === 'prev' ? -1 : 1) + owned.length * 2) % owned.length];
      } else if (q === 'none' || q === 'off') id = 'none';
      else id = owned.find((x) => x.toLowerCase() === q) || owned.find((x) => nameOf(game, slot, x).toLowerCase().includes(q)) || null;
      if (!id) { game.ui.toast(tf('No owned item matches "{q}".', { q: q.slice(0, 20) }), 'info'); return; }
      if (c.equip(slot, id)) game.ui.toast(id === 'none' ? t('Removed.') : tf('Now wearing: {name}', { name: t(nameOf(game, slot, id)) }), 'good');
    }
    for (const slot of ['suit', 'hat', 'back']) api.registerChatCommand(slot, (args, game) => change(game, slot, args.join(' ')));

    api.registerChatCommand('outfit', (args, game) => {
      const c = game.cosmetics;
      if (!c) return;
      const save1 = args[0] === 'save';
      const n = parseInt(save1 ? args[1] : args[0], 10);
      if (!(n >= 1 && n <= 3)) { game.ui.toast(t('Usage: /outfit save <1-3>  or  /outfit <1-3>'), 'info'); return; }
      const all = load();
      if (save1) {
        const cur = c.current();
        all[n] = { suit: cur.suit, hat: cur.hat, back: cur.back };
        save(all);
        game.ui.toast(tf('Outfit {n} saved.', { n }), 'good');
        return;
      }
      const o = all[n];
      if (!o) { game.ui.toast(tf('Outfit {n} is empty.', { n }), 'info'); return; }
      const have = c.unlocked();
      for (const slot of ['suit', 'hat', 'back']) if (o[slot] && (o[slot] === 'none' || (have[slot] || []).includes(o[slot]))) c.equip(slot, o[slot]);
      game.ui.toast(tf('Outfit {n} on.', { n }), 'good');
    });
  },
});
