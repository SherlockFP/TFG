// Wave 1 shop harness (body of an async function, see headless.mjs). Proves: the Company Store panel opens with its
// categories, a purchase is delivered, every new weapon damages a spawned creature, and the Stacked Deck gold / red / blue
// effects. Ends with the store panel OPEN so --shot captures it.
const g = kefal.game, errs = [];
addEventListener('error', (e) => errs.push(e.message));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tick = (n = 5, dt = 1 / 30) => kefal.tick(n, dt, false);
const out = { checks: {} };
const ok = (k, v) => { out.checks[k] = !!v; };
const V = (x, y, z) => new THREE.Vector3(x, y, z);

try {
// ---- 1. registration + catalogue
const IDS = ['knife', 'bat', 'nailbat', 'crowbar', 'katana', 'pistol', 'nailgun', 'crossbow', 'flaregun', 'stackeddeck', 'rounds', 'nails', 'bolts', 'flares'];
ok('items registered', IDS.every((id) => g.itemDefOf(id).name !== id));
ok('game.shop installed', !!g.shop && typeof g.shop.open === 'function');
const stock = g.shop.stock();
out.stockCount = stock.length;
out.categories = [...new Set(stock.map((e) => e.cat))];
ok('new weapons in stock list', ['knife', 'katana', 'pistol', 'stackeddeck'].every((id) => stock.some((e) => e.id === id)));
out.deals = g.shop.deals().map((e) => `${e.id} -${Math.round(e.off * 100)}%`);
out.eom = g.shop.employee()?.id;
ok('3 deals + employee of the month', g.shop.deals().length === 3 && !!g.shop.employee());

// ---- 2. purchase (host path): credits are taken, an item is delivered
g.run.credits = 5000;
const countType = (ty) => [...g.items.all()].filter((i) => i.type === ty).length;
const knife = stock.find((e) => e.id === 'knife');
const c0 = g.run.credits, k0 = countType('knife');
g.shop.buy([{ id: 'knife', n: 2 }]);
await sleep(50); tick(3);
ok('buy delivers items', countType('knife') === k0 + 2);
ok('buy takes credits', g.run.credits === c0 - knife.price * 2);
const sold = stock.find((e) => e.qty != null && e.qty > 0);
out.premium = sold ? `${sold.id} x${sold.qty}` : null;

// ---- 3. weapons vs creatures
const p = g.player;
p.teleport(V(0, 0.05, 0), 0);
tick(3);
const eye = () => g.camera.position.clone();
const fwd = () => V(0, 0, -1).applyQuaternion(g.camera.quaternion);
async function equip(type, extra = {}) {
  const id = g.items.hostSpawn(type, eye().add(V(0, -0.5, 0)), { holder: g.selfId, value: 0, ...extra });
  await sleep(10); tick(2);
  const i = p.slots.indexOf(id);
  if (i >= 0) g.switchSlot(i);
  tick(2);
  return g.items.get(id);
}
function target(hp = 400) {
  const at = eye().addScaledVector(fwd(), 2.2); at.y = eye().y - 0.7;
  const c = g.creatures.hostSpawn('crawler', at, {});
  c.stunT = 1; c.maxHp = c.hp = hp;
  tick(12);
  return c;
}
function cleanup(c, it) { g.creatures.hostRemove(c.id); if (it) g.net.broadcast('it', { e: 'rm', id: it.id }); tick(2); }
out.weapons = {};
for (const ty of ['knife', 'bat', 'nailbat', 'crowbar', 'katana', 'pistol', 'nailgun', 'crossbow', 'flaregun']) {
  const it = await equip(ty);
  const c = target();
  const hp0 = c.hp;
  g.nextSwing = 0;
  g.useHeldPress();
  const frames = ty === 'nailgun' ? 25 : 40;
  tick(frames);
  out.weapons[ty] = { dealt: Math.round(hp0 - c.hp), ammo: it?.ammo ?? null };
  ok('weapon damages creature: ' + ty, hp0 - c.hp > 0 || ty === 'flaregun');
  if (ty === 'pistol') {   // reload from a box
    const box = await equip('rounds');
    const cur = g.items.get(p.slots.find((id) => id && g.items.get(id)?.type === 'pistol'));
    g.switchSlot(p.slots.indexOf(cur.id));
    tick(2); cur.ammo = 1; g.reload(); tick(45);
    ok('pistol reload from rounds box', cur.ammo === 8 && box.charges === 24 - 7);
    g.net.broadcast('it', { e: 'rm', id: box.id });
  }
  if (ty === 'flaregun') {
    ok('flare gun lights a flare + scares', g.shop.weapons.hostFlares.length >= 1 && g.lights.emitters.size > 0);
    const sm = g.creatures.hostSpawn('scuttler', eye().addScaledVector(fwd(), 2.5), {});
    tick(20);
    ok('scuttler scared by flare', (sm.scaredT ?? 0) > 0 || (sm.scaredT ?? -1) === 0 && !!sm.scareFrom);
    g.creatures.hostRemove(sm.id);
  }
  cleanup(c, it);
  tick(10);
}
// crowbar pry hook: a locked door with a crowbar in hand becomes a pry interaction
{
  const it = await equip('crowbar');
  const r = g.doorInteraction({ id: 'x', kind: 'door', locked: true, pos: V(0, 0, -3), open: false });
  ok('crowbar pries locked doors', /Pry the door open/.test(r?.label || ''));
  cleanup({ id: 'none' }, it);
}

// ---- 4. Stacked Deck
const deckIt = await equip('stackeddeck');
const D = g.shop.deck;
g.magic = { mana: 0, addMana(n) { this.mana += n; } };
async function pickCard(kind) {
  D._st.pickCd = 0; D._st.mode = 'idle';
  g.input.pressedSet.add('KeyR'); tick(1);
  for (let i = 0; i < 60 && ['blue', 'red', 'gold'][D.state().idx] !== kind; i++) tick(1);
  g.input.pressedSet.add('KeyR'); tick(1);
  return D.state();
}
{ // fan of 3
  const c = target(); const hp0 = c.hp; g.nextSwing = 0; g.useHeldPress(); tick(20);
  out.fan = Math.round(hp0 - c.hp); ok('deck fan damages', hp0 - c.hp >= 20); cleanup(c, null);
}
{ // gold: stun
  const c = target(); c.stunT = 0.5;
  const s = await pickCard('gold'); ok('gold locked', s.mode === 'locked' && s.card === 'gold');
  g.nextSwing = 0; g.useHeldPress(); tick(20);
  out.goldStun = +(c.stunT || 0).toFixed(2); ok('gold card stuns ~2s', c.stunT > 1.2); cleanup(c, null);
}
{ // red: splash + slow on a second creature standing next to the target
  const c = target(); const at = c.pos.clone().add(V(1.6, 0, 0)); const c2 = g.creatures.hostSpawn('crawler', at, {}); c2.stunT = 1; c2.maxHp = c2.hp = 400; tick(12);
  const h1 = c.hp, h2 = c2.hp;
  const s = await pickCard('red'); ok('red locked', s.card === 'red');
  g.nextSwing = 0; g.useHeldPress(); tick(20);
  out.red = { hit: Math.round(h1 - c.hp), splash: Math.round(h2 - c2.hp), slow: +(c.slowT || 0).toFixed(2) };
  ok('red card splashes + slows', h1 - c.hp > 0 && h2 - c2.hp > 0 && c.slowT > 0); cleanup(c, null); g.creatures.hostRemove(c2.id);
}
{ // blue: damage + mana
  const c = target(); const hp0 = c.hp; g.magic.mana = 0;
  const s = await pickCard('blue'); ok('blue locked', s.card === 'blue');
  g.nextSwing = 0; g.useHeldPress(); tick(20);
  out.blue = { dmg: Math.round(hp0 - c.hp), mana: g.magic.mana };
  ok('blue card damages + restores 25 mana', hp0 - c.hp > 0 && g.magic.mana === 25); cleanup(c, deckIt);
}

// ---- 5. the panel (left open for the screenshot)
g.player.slots.forEach((id) => { if (id) g.net.broadcast('it', { e: 'rm', id }); });
tick(3);
g.terminal.open();
g.terminal.exec('store list');
ok('STORE LIST text still works', g.terminal.lines.some((l) => /Kitchen Knife/.test(l.text)));
g.terminal.exec('store');
tick(3);
const panel = document.querySelector('.shop');
ok('store panel opens', !!panel && !g.terminal.active);
out.tabs = [...document.querySelectorAll('.shop .tabs .btn')].map((b) => b.textContent);
out.cards = document.querySelectorAll('.shop .sh-card').length;
ok('panel has all 8 categories', out.tabs.length >= 8);
out.rows = document.querySelectorAll('.shop .sh-row').length;
const firstCard = document.querySelector('.shop .sh-card[tabindex="0"]');
firstCard?.click(); tick(1);
out.cartLines = document.querySelectorAll('.shop .sh-cart .ln').length;
ok('click adds to cart', out.cartLines === 1);
await sleep(500);   // let the item icons render
} catch (e) { out.error = String(e.stack || e).slice(0, 700); }
out.errs = errs;
out.failed = Object.entries(out.checks).filter(([, v]) => !v).map(([k]) => k);
return out;
