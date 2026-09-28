// more-suits — port of More Suits (x753) + TooManySuits / AdditionalSuits.
// Every suit color and hat is available from the start (Character screen, the ship's suit rack,
// or /suit and /hat in chat). By default the unlock is session-only: your saved profile keeps only
// what you actually bought, so disabling the mod returns things to normal.
KefalAPI.defineMod({
  id: 'more-suits',
  name: 'More Suits',
  version: '1.0.0',
  author: 'TFG Modding Team',
  inspiredBy: 'More Suits + TooManySuits + AdditionalSuits',
  enabledByDefault: false,
  cheat: true,
  description: 'Unlocks all 13 suits and 15 hats for free. Use the Character screen, the suit rack on the ship, or /suit <color> and /hat <name> in chat.',
  config: {
    permanent: { type: 'boolean', default: false, label: 'Save unlocks to profile permanently' },
  },
  init(api, cfg) {
    // mirrors models/avatar.js SUIT_COLORS / HATS
    const SUITS = ['orange', 'green', 'blue', 'purple', 'pink', 'black', 'white', 'yellow', 'red', 'camo', 'teal', 'brown', 'kefal'];
    const HATS = ['none', 'cap', 'cone', 'bunny', 'kefal', 'crown', 'tophat', 'headphones', 'propeller', 'hardhat', 'chef', 'party', 'halo', 'horns', 'antenna'];

    function unlock(list, all) {
      if (!Array.isArray(list)) return list;
      const owned = new Set(list);
      for (const id of all) if (!list.includes(id)) list.push(id);
      if (!cfg.permanent) {
        // only really-owned ids are written to the save (JSON.stringify honours toJSON on arrays)
        Object.defineProperty(list, 'toJSON', { value() { return this.filter((id) => owned.has(id)); }, configurable: true, enumerable: false });
      }
      return list;
    }

    api.on('boot', (app) => {
      const p = app.profile;
      if (!p) return;
      p.cosmetics = p.cosmetics || { suits: ['orange'], hats: ['none'] };
      p.cosmetics.suits = unlock(p.cosmetics.suits || [], SUITS);
      p.cosmetics.hats = unlock(p.cosmetics.hats || [], HATS);
    });

    const find = (list, q) => { q = String(q || '').toLowerCase().replace(/[^a-z]/g, ''); return list.find((x) => x === q) || list.find((x) => q && x.startsWith(q)); };
    const applyLook = (game, what) => {
      game.progress.save();
      game.net?.send('pinfo', game.helloData());
      game.sfx?.('item_pickup', 0.5);
      game.ui.toast(what);
    };

    api.registerChatCommand('suit', (args, game) => {
      const id = find(SUITS, args[0]);
      if (!id) { game.ui.chatMessage(null, 'Suits: ' + SUITS.join(', '), false, 'info'); return; }
      game.profile.suit = id;
      // the viewmodel wants a css color; the character screen swatches use the same palette
      const COLORS = { orange: '#d9642b', green: '#4f8a3a', blue: '#2f5fb0', purple: '#6d3fa6', pink: '#e07aa8', black: '#26262b', white: '#d8d6cf', yellow: '#e2c02e', red: '#b3262a', camo: '#5e6b3c', teal: '#2a8f8a', brown: '#7a5231', kefal: '#8fa9bd' };
      game.viewModel?.setSuitColor?.(COLORS[id]);
      applyLook(game, 'Suit: ' + id);
    });
    api.registerChatCommand('hat', (args, game) => {
      const id = find(HATS, args[0]);
      if (!id) { game.ui.chatMessage(null, 'Hats: ' + HATS.join(', '), false, 'info'); return; }
      game.profile.hat = id;
      applyLook(game, 'Hat: ' + id);
    });
  },
});
