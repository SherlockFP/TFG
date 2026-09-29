// Harness body for tools/harness/headless.mjs (wave 4 cosm5): API + wardrobe exercise, weapon-skin loop on real items, shop buy.
// Final screenshot = the wardrobe on the Weapon skins tab (turntable shows the Plasma Blade with the Magma Core skin).
//   flock /tmp/tfg-browser.lock node tools/harness/headless.mjs --port 5189 --script tools/harness/wave4_cosm5.js --shot /tmp/cosm5_wardrobe.png --wait 4000
const g = kefal.game, out = { errs: [] };
addEventListener('error', (e) => out.errs.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const C = g.cosm5;
out.hasApi = !!C;
out.catalog = C.catalog().length;
g.profile.coins = 5000; g.profile.level = 30;
const offers = C.offers();
const buyKey = offers.offers[0].key;
for (const e of C.catalog()) { const k = e.slot + ':' + e.id; if (k !== buyKey) C.grant(k, { quiet: true }); }
out.owned = C.ownedKeys().size;
out.buy = C.buy(buyKey);
out.buyAgain = C.buy(buyKey).ok;
out.ownedAfter = C.ownedKeys().size;
// equip: suit / hat / back go through the wave-1 wardrobe controller; the look code is what peers receive
out.equip = [g.cosmetics.equip('suit', 'glitch'), g.cosmetics.equip('hat', 'crt'), g.cosmetics.equip('back', 'jetpack')];
out.skinEquip = C.equipSkin('lava');
out.code = C.code();
out.decoded = C.decodeLook(out.code);
// weapon skin follows the holder: hold a katana + a plasma blade, check materials, then let go
const held = [];
for (const type of ['katana', 'plasmablade']) {
  const id = g.items.hostSpawn(type, new THREE.Vector3(0, 1, 0), {});
  const it = g.items.get(id);
  if (!it) { out.errs.push('spawn ' + type); continue; }
  it.setHeld(g.selfId);
  held.push(it);
}
C.syncSkins();
out.skinned = held.map((it) => it.type + ':' + C.skinOfItem(it));
C.equipSkin('none'); C.syncSkins();
out.cleared = held.map((it) => C.skinOfItem(it));
C.equipSkin('holo'); C.syncSkins();
out.holo = held.map((it) => C.skinOfItem(it));
held[0].plus = 7;                       // forge camo level: the skin loop leaves the item alone
C.equipSkin('frost'); C.syncSkins();
out.forged = { katana: C.skinOfItem(held[0]), blade: C.skinOfItem(held[1]) };
held[0].plus = 0;
C.equipSkin('lava'); C.syncSkins();
for (const it of held) it.setHeld(null);
// pretend a crewmate broadcast a look code (peer path): no remote avatar exists, must not throw
out.peer = (() => { try { g.cosm5.peerLooks.set('peerX', C.decodeLook(C.encodeLook({ suit: 'algocult', hat: 'firewall', back: 'wings', skin: 'holo' }))); return true; } catch (e) { return String(e); } })();
// emote wheel knows the new emotes
g.emotes.buildWheel();
out.emotes = ['clockout', 'clap', 'praise', 'buffering', 'undo', 'lagspike'].map((id) => !!g.emotes.list.find((e) => e.id === id));
// wardrobe: every tab renders, tiles exist, selecting works
g.cosmetics.open();
await wait(300);
const click = (nav) => document.querySelector(`[data-nav="${nav}"]`)?.click();
out.tabs = {};
for (const tab of ['shop', 'skin', 'emote', 'suit', 'hat', 'back', 'face']) { click('wd:tab:' + tab); await wait(120); out.tabs[tab] = document.querySelectorAll('.wd-tile').length; }
click('wd:tab:emote'); await wait(100); click('wd:emote:clap'); await wait(100); click('wd:equip'); await wait(100);
click('wd:tab:shop'); await wait(100); document.querySelector('.wd-tile')?.click(); await wait(100);
out.shopName = document.querySelector('.wd-name')?.textContent;
click('wd:tab:skin'); await wait(150);
click('wd:pw:plasmablade'); await wait(150);
click('wd:skin:lava'); await wait(150); click('wd:equip'); await wait(200);
out.skinName = document.querySelector('.wd-name')?.textContent;
out.canvas = !!document.querySelector('.wd .cpv-canvas');
await wait(1500);
out.shop = C.offers().offers.map((o) => o.key + '@' + o.price).join(' ');
out.featured = C.offers().featured?.key;
return out;
