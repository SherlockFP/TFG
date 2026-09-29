// wave 6 dance: headless body for tools/harness/headless.mjs. Exercises the wheel (pages, thumbnails), a dance in third person, the sync/combo path and the studio panel.
// ?dance=studio opens the studio panel instead of leaving the wheel open.
const g = kefal.game, errs = [];
addEventListener('error', (e) => errs.push(e.message));
const EM = await import('/src/game/emotes.js');
const DD = await import('/src/game/dance_data.js');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const MODE = new URLSearchParams(location.search).get('dance') || 'wheel';
const E = g.emotes, W = E.wheelUI, out = { hasWheelUI: !!W, hasDance: !!g.dance };
g.player.frozen = false; g.player.dead = false;
E.play(EM.EMOTE_BY_ID.spreadsheet_robot);
for (let i = 0; i < 30; i++) { kefal.tick(1, 1 / 30, false); await wait(8); }
out.playing = E.current?.id; out.net = g.emote; out.avatarVisible = E.avatar?.root.visible;
// sync + combo
const me = EM.EMOTE_BY_ID.office_shuffle;
E.play(me); kefal.tick(3, 1 / 30, false);
const fake = { id: 'fake', pos: { x: g.player.pos.x + 1.5, y: g.player.pos.y, z: g.player.pos.z }, emoteDef: me, emoteStart: performance.now() - 1500, avatar: {}, dead: false };
g.remotes.set('fake', fake);
g.dance.tick();
const cl = g.dance.clusters().get('self');
g.remotes.delete('fake');
out.cluster = cl ? { size: cl.size, anchor: cl.anchorId, offset: +cl.offset.toFixed(2) } : null;
out.comboPop = !!document.querySelector('.dance-combo');
E.stop();
// wheel
W.open();
out.pages = W.pages.map((p) => p.cat + ':' + p.ids.length);
W.turn(1);
out.page1 = W.page().cat; out.slots = W.slots.length;
await wait(2500); for (let i = 0; i < 20; i++) { kefal.tick(1, 1 / 30, false); await wait(60); }
out.thumbs = W.slots.filter((s) => (s.firstChild.style.backgroundImage || '').startsWith('url(')).length;
W.hover = 2; W.paintHover();
out.hoverName = W.nm.textContent;
if (MODE === 'studio') {
  W.close(); W.openStudio();
  await wait(2500); for (let i = 0; i < 30; i++) { kefal.tick(1, 1 / 30, false); await wait(60); }
  const tiles = [...document.querySelectorAll('.es-tile')];
  out.studio = { tiles: tiles.length, withThumb: tiles.filter((t) => (t.querySelector('.th').style.backgroundImage || '').startsWith('url(')).length, slots: document.querySelectorAll('.es-slot').length };
  // favourite: assign via the same path a drop uses
  const slot = document.querySelectorAll('.es-slot')[5];
  const dt = new DataTransfer(); dt.setData('text/plain', 'worm');
  slot.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  out.favs = g.profile.emoteFav;
  const inp = document.querySelector('.es-tools input'); inp.value = 'robot'; inp.dispatchEvent(new Event('input'));
  out.searchTiles = document.querySelectorAll('.es-tile').length;
  inp.value = ''; inp.dispatchEvent(new Event('input'));
} else {
  // leave the wheel open on the Dance page with the third-person dance behind it
  E.play(EM.EMOTE_BY_ID.metal_night);
  for (let i = 0; i < 25; i++) { kefal.tick(1, 1 / 30, false); await wait(8); }
}
out.errs = errs;
return out;
