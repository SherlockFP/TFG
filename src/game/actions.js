// Local player actions (installed on Game.prototype): interaction, inventory, item use, combat,
// grab beam, scan, damage/death/spectate, minigame launching, held item visuals.
import { isPickType, doorDifficulty } from './lockpick2_core.js';   // [lockpick2] door locks: Simple on tier-1 moons, Standard later
import * as THREE from 'three';
import { G } from '../physics/physics.js';
import { itemDef, isSellable, RARITY, FISH_TABLE } from './items.js';
import { CREATURES } from './creatures.js';
import { MOONS } from './moons.js';
import { insideShip, SHIP } from '../world/ship.js';
import { FACILITY_Y } from '../world/facility.js';
import { clamp, damp } from '../core/util.js';
import { MINIGAMES } from '../minigames/index.js';
import { applyAffixes, applyAffixEffects, affixCooldown, affixDisplayName, affixColor, describeAffix } from './loot.js';
import { TIERS } from './tiers.js';
import { plusMul } from './enhance.js';   // [forge]
const FLASH_AHEAD = 0.62;   // [hud6] metres in front of the camera the pooled torch spot starts (viewmodel hand + torch end ~0.5-0.6 m out)

/** Weapon damage multiplier of an item's tier (tiers.js statMul; plain / store weapons are Common = 1). */
// Relative to the definition's own tier: def.dmg is the damage at def.tier/def.rarity, a better roll scales it up.
// This is the ONLY place melee/shotgun tier damage is applied (crafting/shop check inventory.appliesTierDamage).
export const tierDmg = (it) => {
  if (!it || it.def?.kind !== 'weapon') return 1;
  const own = TIERS[it.rarity?.()]?.statMul || 1;
  const base = TIERS[it.def.tier]?.statMul || TIERS[it.def.rarity]?.statMul || 1;
  return own / base * (it.plus ? plusMul(it.plus) : 1);   // [forge] +N enhancement rides the same multiplier (no second wrapper)
};
/** "Rare" suffix for labels of tiered items (plain scrap without a rolled tier shows nothing extra). */
const tierTag = (it) => (it?.tier && it.tier !== 'common' && !it.affix ? TIERS[it.tier]?.name || '' : '');

const tmp = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

class GrabBeam {
  constructor(game) {
    this.game = game;
    this.item = null;
    this.dist = 2;
    const mat = new THREE.LineBasicMaterial({ color: 0x7fe7ff, transparent: true, opacity: 0.8, fog: false });
    this.line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), mat);
    this.line.frustumCulled = false;
    this.line.visible = false;
    game.scene.add(this.line);
    this.hum = null;
  }
  start(it) {
    if (this.item) this.stop();
    this.item = it;
    this.releaseWhenOwned = false;
    this.dist = clamp(this.game.camera.position.distanceTo(it.obj.position), 1.4, 3.2);
    this.game.net.request('grab', { id: it.id });
    this.hum = this.game.audio.play('grab_beam', { loop: true, volume: 0.3 });
  }
  stop(throwIt = false) {
    const it = this.item;
    if (it && it.owner !== this.game.selfId) this.pendingRelease = it.id;
    this.item = null;
    this.line.visible = false;
    this.hum?.stop(0.1); this.hum = null;
    if (!it || !it.body) return;
    const t = it.body.translation(), r = it.body.rotation(), lv = it.body.linvel(), av = it.body.angvel();
    const mul = throwIt ? 1 : 1;
    if (it.owner === this.game.selfId) {
      this.game.net.request('release', { id: it.id, p: [t.x, t.y, t.z], q: [r.x, r.y, r.z, r.w], lv: [lv.x * mul, lv.y * mul, lv.z * mul], av: [av.x, av.y, av.z] });
    }
  }
  onItemRemoved(id) { if (this.item?.id === id) { this.item = null; this.line.visible = false; this.hum?.stop(0.1); this.hum = null; } }
  physicsStep(dt) {
    const it = this.item;
    if (!it || !it.body || it.owner !== this.game.selfId) return;
    const cam = this.game.camera;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const target = cam.position.clone().addScaledVector(fwd, this.dist);
    const t = it.body.translation();
    const mass = it.def.mass || 10;
    const strength = clamp(14 - mass * 0.12 + (this.game.stats.carryRelief || 0) * 0.05, 3.5, 14);
    const dv = new THREE.Vector3(target.x - t.x, target.y - t.y, target.z - t.z).multiplyScalar(strength);
    if (dv.length() > 9) dv.setLength(9);
    const lv = it.body.linvel();
    const k = Math.min(1, dt * 12);
    it.body.setLinvel({ x: lv.x + (dv.x - lv.x) * k, y: lv.y + (dv.y - lv.y) * k, z: lv.z + (dv.z - lv.z) * k }, true);
    const av = it.body.angvel();
    it.body.setAngvel({ x: av.x * 0.85, y: av.y * 0.85, z: av.z * 0.85 }, true);
    // if the item gets stuck far away, drop it
    if (tmp.set(t.x, t.y, t.z).distanceTo(target) > 4.5) this.stop();
  }
  update() {
    const it = this.item;
    if (!it) return;
    const from = this.game.camera.position.clone().add(new THREE.Vector3(0.25, -0.3, 0).applyQuaternion(this.game.camera.quaternion));
    const pos = this.line.geometry.attributes.position;
    pos.setXYZ(0, from.x, from.y, from.z);
    pos.setXYZ(1, it.obj.position.x, it.obj.position.y, it.obj.position.z);
    pos.needsUpdate = true;
    this.line.visible = true;
  }
}

function findFreeSlot(p) { return p.slots.findIndex((s, i) => !s && i < p.slots.length); }

export const actionMethods = {
  // ------------------------------------------------------------------ per-frame local actions
  localActions(dt, input) {
    const p = this.player;
    if (!this.grab) this.grab = new GrabBeam(this);
    if (this.cruiser?.seated) { this.cruiser.seatedActions(dt, input); return; }
    this.ensureSlots();
    // interaction target
    const target = this.findInteraction();
    this.interactTarget = target;
    this.ui.hud?.setPrompt(target ? target.label : null, target?.sub);
    if (!input.enabled) {
      // chat / panel / terminal / minigame opened: the mouse-up will never arrive, so release holds now
      this.swingCharge = 0;
      this.healing = null;
      if (this.grab.item) this.grab.stop();
      return;
    }
    if (input.pressed('interact') && target) { target.action(); }
    // slot switching
    const wheel = input.consumeWheel();
    const held = p.heldItem();
    const locked2h = held && itemDef(held.type).hands === 2;
    if (!locked2h && !this.grab.item) {
      for (let i = 0; i < p.slots.length; i++) if (input.pressed('hotbar' + (i + 1))) this.switchSlot(i);
      if (wheel) this.switchSlot((p.slot + (wheel > 0 ? 1 : -1) + p.slots.length) % p.slots.length);
    }
    if (input.pressed('drop') && held) this.dropHeld(false);
    if (input.pressed('throwItem') && held) this.dropHeld(true);
    if (input.pressed('flashlight')) this.toggleFlashlight();
    if (input.mouseClicked(2)) this.scan();
    if (input.pressed('reload')) this.reload();

    // grab beam / item use
    const aimBig = target?.bigItem;
    if (input.mouseClicked(0)) {
      if (aimBig && (!held || itemDef(held.type).hands !== 2)) this.grab.start(aimBig);
      else if (target?.bodyItem && !held) this.pickup(target.bodyItem);   // empty hands: LMB carries a body like it grabbed one before
      else this.useHeldPress();
    }
    if (input.mouseDown(0)) this.useHeldHold(dt);
    if (input.mouseUp(0)) {
      if (this.grab.item) this.grab.stop();
      else this.useHeldRelease();
    }
    if (this.grab.item) {
      const w = input.wheel; void w;
      if (input.codeDown('KeyQ')) this.grab.dist = Math.max(1.2, this.grab.dist - dt * 2);
      if (input.codeDown('KeyE') && false) this.grab.dist += dt;
      if (this.grab.item.state !== 'world') this.grab.stop();
    }
    this.grab.update();
    this.updateBatteries(dt);
    this.swingAnim = Math.max(0, (this.swingAnim || 0) - dt * 2.2);
    if (this.pendingHit && this.time >= this.pendingHit.t) { const h = this.pendingHit; this.pendingHit = null; this.resolveMelee(h); }
    // latched leech: blind + struggle
    if (p.latched) { this.engine.fx.blind = damp(this.engine.fx.blind, 0.9, 3, dt); }
    else if (this.engine.fx.blind > 0) this.engine.fx.blind = Math.max(0, this.engine.fx.blind - dt);
    // bestiary: notice creatures nearby
    this.seeT = (this.seeT || 0) - dt;
    if (this.seeT <= 0) { this.seeT = 0.5; this.noticeCreatures(); }
  },

  ensureSlots() {
    const n = this.config.inventorySlots + (this.hasPerk('packmule') ? 1 : 0);
    const s = this.player.slots;
    while (s.length < n) s.push(null);
    while (s.length > n && !s[s.length - 1]) s.pop();
  },

  switchSlot(i) {
    const p = this.player;
    if (i === p.slot || i < 0 || i >= p.slots.length) return;
    p.slot = i;
    this.swingCharge = 0;
    this.sfx('inventory_switch', 0.35);
    this.refreshHeldVisuals();
  },

  // ------------------------------------------------------------------ interaction finding
  findInteraction() {
    const p = this.player;
    const eye = this.camera.position.clone();
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const reach = 2.7;
    // 1) physics ray: items / doors
    const hit = this.physics.raycast(eye, fwd, 3.6, G.STATIC | G.DOOR | G.ITEM | G.BIG, p.col);
    if (hit?.info?.kind === 'item') {
      const it = this.items.get(hit.info.itemId);
      if (it && it.state === 'world') {
        const def = it.def;
        const r = it.tierColor;
        if (it.type === 'body') {
          // a crewmate's body is carried in the hands (2-handed, heavy, ONE at a time) so it follows you through every door
          if (hit.distance < reach) {
            const has = this.carriedBody();
            return { label: it.label ? tf("Carry {name}'s body [E]", { name: it.label }) : t('Carry body [E]'), sub: t(has ? 'You already carry a body' : 'Heavy - slows you down'), bodyItem: it, action: () => this.pickup(it) };
          }
        } else if (def.kind === 'big') {
          if (hit.distance < 3.6) {
            return { label: tf('Grab {name} [LMB]', { name: def.name }), sub: `▮${it.value}`, bigItem: it, action: () => this.grab.start(it) };
          }
        } else if (hit.distance < reach) {
          const toBag = this.inventory?.pickTargetHint?.(it);
          return { label: tf('Pick up {name} [E]', { name: affixDisplayName(def.name, it.affix, it) }), sub: [isSellable(def) && it.value ? `▮${it.value}` : '', tierTag(it), ...describeAffix(it.affix, { rarity: true }), toBag ? '→ ' + t('BAG') : ''].filter(Boolean).join(' · '), color: it.affix ? affixColor(it.affix) : r, action: () => this.pickup(it) };
        }
      }
    }
    if (hit?.info?.kind === 'door' && hit.distance < reach) {
      const door = hit.info.door;
      return this.doorInteraction(door);
    }
    // 2) point interactables
    const pts = this.interactablesNow();
    let best = null, bestScore = 1e9;
    for (const ip of pts) {
      tmp.copy(ip.pos).sub(eye);
      const along = tmp.dot(fwd);
      const r = ip.r || 0.7;
      if (along < 0 || along > (ip.reach || reach) + r) continue;
      const perp = tmp.clone().addScaledVector(fwd, -along).length();
      if (perp > r) continue;
      const score = along + perp * 2;
      // Do not let the generous interaction radius punch through a 30 cm wall.
      // noLos is reserved for deliberately screen/position based interactions.
      if (score < bestScore && (!hit || hit.distance > along - 0.15 || ip.noLos)) { best = ip; bestScore = score; }
    }
    if (best) {
      const lbl = typeof best.label === 'function' ? best.label() : best.label;
      if (!lbl) return null;
      return { label: lbl, sub: best.sub ? (typeof best.sub === 'function' ? best.sub() : best.sub) : '', action: best.action };
    }
    return null;
  },

  doorInteraction(door) {
    const held = this.player.heldItem();
    if (door.kind === 'blast') return { label: door.open ? t('Secure door (open)') : tf('Secure door [{n}] - use the ship terminal', { n: (door.code || '').toUpperCase() }), action: () => {} };
    if (door.kind === 'vault') return { label: door.locked ? t('Vault (locked) - use the keypad') : t('Vault'), action: () => {} };
    if (door.teleport) return null;
    if (door.locked && door.info?.shortcut) { const sc = this.stealth?.shortcutPrompt?.(door); if (sc) return sc; }   // [stealth] latch shortcut: opens from the deep side
    if (door.locked) {
      if (door.info?.arena) return held?.type === 'corecard'   // [cycle] the boss arena door only takes the Key Holders' access cards
        ? { label: t('Insert the access card [E]'), action: () => this.net.request('unlock', { id: door.id, key: held.id }) }
        : { label: t('Locked'), sub: t('Needs the access cards of the Key Holders'), action: () => this.audio.at('door_locked', door.pos.clone().add(UP), 0.8) };
      if (held?.type === 'key') return { label: t('Unlock door with key [E]'), action: () => this.net.request('unlock', { id: door.id, key: held.id }) };
      if (isPickType(held?.type)) return { label: t('Pick the lock [E]'), action: () => this.startLockpick(door, held) };
      return { label: t('Locked'), sub: t('Needs a key or lockpicker'), action: () => this.audio.at('door_locked', door.pos.clone().add(UP), 0.8) };
    }
    return { label: door.open ? t('Close door [E]') : t('Open door [E]'), action: () => this.net.request('door', { id: door.id, open: !door.open }) };
  },

  interactablesNow() {
    const out = [];
    const ph = this.run?.phase;
    const sp = this.ship.points;
    const p = this.player;
    const held = p.heldItem();
    const add = (o) => { if (o.pos) out.push(o); };
    if (p.inShip || p.pos.distanceTo(new THREE.Vector3(0, 0, 0)) < 12) {
      add({ pos: sp.terminal, r: 0.8, label: t('Use terminal [E]'), action: () => this.openTerminal() });
      add({
        pos: sp.lever, r: 0.6, label: () => ph === 'orbit' ? (this.run.daysLeft <= 0 && this.run.moon !== 'hq' ? t('Deadline. Route to 0-Algorithm HQ') : tf('Land on {name} [E]', { name: MOONS[this.run.moon]?.name })) : (ph === 'moon' || ph === 'company') ? t('Start the ship / take off [E]') : t('Ship in flight...'),
        action: () => { if (ph === 'orbit' || ph === 'moon' || ph === 'company') { this.sfx('lever_pull', 0.9); this.animLever(); this.net.request('lever'); } },
      });
      add({ pos: sp.doorOpen, r: 0.5, label: () => this.ship.door.label(this.run?.phase), action: () => this.net.request('shipdoor', { open: !this.ship.door.open }) });
      add({ pos: sp.arcade, r: 0.6, label: t('Play FLAPPY PHISH [E]'), action: () => this.startArcade() });
      if (held?.battery !== undefined && held?.battery !== null && itemDef(held.type).battery) add({ pos: sp.charger, r: 0.6, label: tf('Charge {name} [E]', { name: itemDef(held.type).name }), action: () => { this.net.request('charge', { id: held.id, mul: this.stats.batteryMul }); } });
      add({ pos: sp.suits, r: 0.7, label: t('Change suit [E]'), action: () => this.cycleSuit() });
      add({ pos: sp.coffee, r: 0.5, label: t('Drink coffee [E]'), action: () => { p.stamina = p.maxStamina; this.sfx('heal', 0.4); this.ui.toast(t('Refreshing. (+stamina)')); } });
    }
    const fac = this.world.facility;
    if (fac && p.indoor) {
      for (const ip of fac.interactables) {
        if (ip.type === 'fuse') add({ pos: ip.pos, r: 0.6, label: () => (this.run?.powerOn ? t('Fuse box: run diagnostics [E]') : t('Fuse box: restore power [E]')), action: () => this.startFuse(ip) });
      }
      for (const d of fac.doors) {
        if (d.kind === 'vault' && d.locked && d.keypadPos) add({ pos: d.keypadPos, r: 0.6, label: t('Crack the vault keypad [E]'), action: () => this.startSafe(d) });
        if (d.teleport) add({ pos: d.pos.clone().add(new THREE.Vector3(0, 1.3, 0)), r: 1.2, reach: 2.4, label: d.kind === 'entrance' ? t('Exit facility [E]') : t('Use fire exit [E]'), action: () => this.useExit(d.exitIndex, false) });
        if (d.kind === 'door' && d.open && d.t > 0.9) add({ pos: d.pos.clone().add(new THREE.Vector3(0, 1.2, 0)), r: 0.8, reach: 2.2, label: t('Close door [E]'), action: () => this.net.request('door', { id: d.id, open: false }) });
      }
      for (const v of this.creatures.views.values()) {
        if (v.type === 'mimicdoor' && v.state !== 'dead') add({ pos: v.pos.clone().add(new THREE.Vector3(0, 1.3, 0)), r: 1.1, reach: 2.4, label: t('Use fire exit [E]'), action: () => this.net.request('mimicdoor', { cid: v.id }) });
      }
    }
    const outd = this.world.outdoor;
    if (outd && !p.indoor) {
      for (const ip of outd.interactables) {
        if (ip.type === 'exit') add({ pos: ip.pos, r: 1.2, reach: 2.6, label: ip.index === 0 ? t('Enter facility [E]') : t('Enter fire exit [E]'), action: () => this.useExit(ip.index, true) });
        if (ip.type === 'pond' && p.pos.distanceTo(ip.pos) < ip.r + 3) add({ pos: p.pos.clone().add(new THREE.Vector3(0, 1.2, 0)).addScaledVector(p.forward().setY(0).normalize(), 1.6), r: 1.5, noLos: true, label: held?.type === 'rod' ? t('Cast your line [E]') : t('A pond. You need a Phishing Rod.'), action: () => held?.type === 'rod' && this.startFishing() });
      }
    }
    if (outd?.outposts && !p.indoor) outd.outposts.addInteractables(this, add);
    const comp = this.world.company;
    if (comp) {
      for (const ip of comp.interactables) {
        if (ip.type === 'bell') add({ pos: ip.pos, r: 0.5, label: tf('Ring the bell - SELL (rate {n}%) [E]', { n: Math.round((this.run.buyRate || 0.3) * 100) }), action: () => { this.net.request('bell'); } });
        if (ip.type === 'market') add({ pos: ip.pos, r: 1.2, reach: 3, label: t('Black Market - Phish Dayı [E]'), action: () => this.ui.openMarket(this) });
        if (ip.type === 'slots') add({ pos: ip.pos, r: 0.6, label: t('GACHA MACHINE - play slots [E]'), action: () => this.startSlots() });
        if (ip.type === 'bounties') add({ pos: ip.pos, r: 0.9, label: t('Bounty board [E]'), action: () => this.ui.openBounties(this) });
        if (ip.type === 'pond' && p.pos.distanceTo(ip.pos) < 5) add({ pos: p.pos.clone().add(new THREE.Vector3(0, 1.2, 0)).addScaledVector(p.forward().setY(0).normalize(), 1.6), r: 1.5, noLos: true, label: held?.type === 'rod' ? t('Cast your line [E]') : t('The sea. You need a Phishing Rod.'), action: () => held?.type === 'rod' && this.startFishing(true) });
      }
    }
    this.mods?.emit('interactables', out, this);
    return out;
  },

  animLever() {
    const h = this.ship.anchors.lever?.userData?.anchors?.handle;
    if (!h) return;
    const base = h.rotation.x;
    let t = 0;
    const tick = () => { t += 0.03; h.rotation.x = base + Math.sin(Math.min(1, t) * Math.PI) * 0.9; if (t < 1) requestAnimationFrame(tick); else h.rotation.x = base; };
    tick();
  },

  useExit(index, toInside) {
    const w = this.world;
    let dest, yaw;
    if (toInside) {
      const d = index === 0 ? w.facility?.mainDoor : w.facility?.fireDoors[index - 1];
      if (!d) return;
      dest = d.spawn; yaw = d.faceYaw;
    } else {
      const e = index === 0 ? w.outdoor?.mainExit : w.outdoor?.fireExits[index - 1];
      if (!e) return;
      dest = e.spawn; yaw = e.yaw;
    }
    this.engine.flash(0x000000, 1);
    this.sfx('door_open', 0.8);
    this.player.teleport(dest.clone(), yaw);
    this.player.pitch = 0;
    this.psTimer = 0;   // send the new position before any request that depends on it (e.g. a 'pick' right after)
    this.updateAmbience();
    this.mods?.emit('exit', { index, toInside }, this);
  },

  cycleSuit() {
    const owned = this.profile.cosmetics.suits;
    const i = owned.indexOf(this.profile.suit);
    this.profile.suit = owned[(i + 1) % owned.length];
    this.progress.save();
    this.viewModel?.setSuitColor?.(suitColorFor(this.profile.suit));
    this.net.send('pinfo', this.helloData());
    this.ui.toast('Suit: ' + this.profile.suit);
    this.sfx('item_pickup', 0.5);
  },

  // ------------------------------------------------------------------ inventory
  /** The body item this player carries (hands, hotbar or bag), or null. */
  carriedBody() {
    for (const o of this.items.all()) if (o.type === 'body' && o.holder === this.selfId) return o;
    return null;
  },

  pickup(it) {
    const p = this.player;
    const def = it.def;
    if (it.type === 'body' && this.carriedBody()) { this.ui.toast(t('You can only carry ONE body at a time.'), 'bad'); this.sfx('ui_error', 0.4); return; }
    const held = p.heldItem();
    const handsFull = held && itemDef(held.type).hands === 2;
    let slot = p.slots[p.slot] ? findFreeSlot(p) : p.slot;
    if (def.hands === 2 && p.slots[p.slot]) slot = findFreeSlot(p);
    if (handsFull || slot < 0) {
      // hotbar full / hands busy: straight into the backpack when it fits (inventory.js, host-validated)
      if (this.inventory?.pickToBag?.(it)) return;
      if (handsFull) { this.ui.toast(t('Your hands are full.')); return; }
      this.ui.toast(this.inventory ? t('Inventory full. [I] to make room.') : t('Inventory full.')); this.sfx('ui_error', 0.4); return;
    }
    // predict (remember where it lay, so a rejected pick puts it back exactly there)
    it.predFrom = { p: it.obj.position.clone(), q: it.obj.quaternion.clone() };
    p.slots[slot] = it.id;
    if (def.hands === 2 || slot !== p.slot) p.slot = slot;
    it.setHeld(this.selfId);
    it.predicted = true;
    this.sfx('item_pickup', 0.6);
    this.net.request('pick', { id: it.id, slot });
    this.refreshHeldVisuals();
    if (it.nest) this.ui.toast(t('Something is angry...'), 'bad');
    if (it.type === 'body') this.ui.toast(t('Carrying a body: heavy, no sprinting. Bring it to the ship to cut the fine.'), 'info');
  },

  onPickFail(id, d = {}) {
    const p = this.player;
    const i = p.slots.indexOf(id);
    if (i >= 0) p.slots[i] = null;
    const it = this.items.get(id);
    if (it && it.holder === this.selfId) {
      it.setHeld(null);
      it.inv = null;
      it.obj.removeFromParent(); this.scene.add(it.obj);
      // back to the host's transform (or where we picked it from) - not wherever the hand anchor left it
      if (Array.isArray(d.p) && Array.isArray(d.q)) { it.obj.position.fromArray(d.p); it.obj.quaternion.fromArray(d.q); }
      else if (it.predFrom) { it.obj.position.copy(it.predFrom.p); it.obj.quaternion.copy(it.predFrom.q); }
      it.obj.scale.setScalar(1);
      it.obj.visible = true;
      it.predicted = false;
      it.makeBody();
    }
    this.refreshHeldVisuals();
  },

  onItemHeld(it, holder, slot) {
    const p = this.player;
    if (holder === this.selfId) {
      if (it.inv) {   // stashed in the bag / equipped: never in a hotbar slot, never in hand
        const i = p.slots.indexOf(it.id);
        if (i >= 0) p.slots[i] = null;
        it.predicted = false;
        this.refreshHeldVisuals();
        return;
      }
      if (!p.slots.includes(it.id)) {
        let s = Number.isInteger(slot) && slot >= 0 && slot < p.slots.length && !p.slots[slot] ? slot : findFreeSlot(p);
        if (s < 0) { // no room: into the bag if it fits, else drop it right away
          setTimeout(() => { if (!this.inventory?.stashOrDrop?.(it)) this.dropItem(it, false); }, 50);
          return;
        }
        p.slots[s] = it.id;
        if (it.def.kind === 'weapon' && it.soulbound && !p.slots[p.slot]) p.slot = s;
      }
      it.predicted = false;
      this.refreshHeldVisuals();
      return;
    }
    // somebody else (or a creature) took it; if I predicted it, undo
    const i = p.slots.indexOf(it.id);
    if (i >= 0) { p.slots[i] = null; this.refreshHeldVisuals(); }
    if (holder.startsWith?.('c:')) {
      const v = this.creatures.views.get(holder.slice(2));
      const anchor = v?.model.parts?.carry || v?.root;
      if (anchor) { anchor.add(it.obj); it.obj.position.set(0, 0, 0); it.obj.visible = true; }
      return;
    }
    this.refreshRemoteHeld();
  },

  onItemDropped(it, prevHolder, removed) {
    const p = this.player;
    const i = p.slots.indexOf(it.id);
    if (i >= 0) { p.slots[i] = null; this.refreshHeldVisuals(); }
    if (removed && it.obj.parent) it.obj.removeFromParent();
    this.refreshRemoteHeld();
  },

  dropHeld(throwIt) {
    const it = this.player.heldItem();
    if (!it) return;
    this.dropItem(it, throwIt);
  },
  dropItem(it, throwIt, extra = {}) {
    const p = this.player;
    if (it.type === 'body') throwIt = false;   // 90 lb of body: put it down, never a 9 m/s throw
    const i = p.slots.indexOf(it.id);
    if (i >= 0) p.slots[i] = null;
    const fwd = p.forward();
    const eye = p.eyePos();
    // don't drop through walls
    const hit = this.physics.raycast(eye, fwd, 0.9, G.STATIC | G.DOOR);
    const dist = hit ? Math.max(0.1, hit.distance - 0.3) : 0.8;
    const pos = eye.clone().addScaledVector(fwd, dist).add(new THREE.Vector3(0, -0.25, 0));
    const q = new THREE.Quaternion().setFromAxisAngle(UP, p.yaw + (it.type === 'body' ? Math.PI / 2 : 0));   // a body is long: lie it across the view
    const v = throwIt ? fwd.clone().multiplyScalar(9).add(new THREE.Vector3(0, 2.5, 0)).add(p.vel.clone().multiplyScalar(0.5)) : p.vel.clone().multiplyScalar(0.5);
    it.obj.visible = false;
    // battery drained locally (jetpack, flashlight...) reaches every peer before the item leaves our hands
    if (it.def.battery && it.battery != null) this.net.send('itst', { id: it.id, b: Math.round(it.battery * 10) / 10 });
    this.net.request('drop', { id: it.id, p: pos.toArray(), q: q.toArray(), lv: v.toArray(), ...extra });
    this.sfx(throwIt ? 'item_throw' : 'item_drop', 0.5);
    this.refreshHeldVisuals();
    if (it.type === 'boombox' && it.on) this.setItemOn(it, false);
  },

  refreshHeldVisuals() {
    const p = this.player;
    const heldId = p.heldId();
    for (const id of p.slots) {
      if (!id) continue;
      const it = this.items.get(id);
      if (!it) continue;
      const active = id === heldId;
      if (it.obj.parent !== this.handAnchor()) {
        this.handAnchor().add(it.obj);
      }
      it.obj.visible = active && !p.dead;
      const def = it.def;
      const g = it.obj.userData.gripOffset || new THREE.Vector3();
      if (this.fpbody?.placeHeld(it, def)) { /* [fpbody] fitted to the palm from the model's own bounding box (game/fpbody_grip.js) */ }
      else if ((def.hands === 2 && !def.ranged && def.kind !== 'weapon') || def.kind === 'big' || it.type === 'body') {
        it.obj.position.set(0, -0.28, -0.75);
        it.obj.quaternion.identity();
      } else {
        // melee weapons are held tilted up like Lethal Company's shovel; tools/guns point forward
        if (def.kind === 'weapon' && !def.ranged) it.obj.quaternion.setFromEuler(new THREE.Euler(0.95, -0.14, 0));   // [ux] no roll
        else it.obj.quaternion.identity();
        it.obj.position.copy(g).applyQuaternion(it.obj.quaternion).multiplyScalar(-1);
      }
      it.obj.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; } });
    }
    // stashed / equipped items (inventory.js) are carried but never rendered
    for (const it of this.items.all()) if (it.inv && it.holder === this.selfId) it.obj.visible = false;
    const held = p.heldItem();
    this.heldDefCache = held ? itemDef(held.type) : null;
    this.ui.hud?.setInventory(p.slots.map((id) => (id ? this.items.get(id) : null)), p.slot);
  },
  handAnchor() {
    if (!this._hand) {
      this._hand = new THREE.Group();
      this.camera.add(this._hand);
    }
    return this.viewModel?.handR || this._hand;
  },

  refreshRemoteHeld() {
    // parent items held by remote players to their avatar hands (visible only the one they hold)
    for (const it of this.items.all()) {
      if (!it.holder || it.holder === this.selfId || it.holder.startsWith?.('c:')) continue;
      const r = this.remotes.get(it.holder);
      if (!r) continue;
      if (it.inv) { it.obj.visible = false; continue; }   // in their bag / equipment slots
      const hand = r.avatar.parts?.handR || r.root;
      if (it.obj.parent !== hand) hand.add(it.obj);
      const g = it.obj.userData.gripOffset || new THREE.Vector3();
      if ((it.def.hands === 2 && it.def.kind !== 'weapon') || it.type === 'body') { it.obj.quaternion.identity(); it.obj.position.set(0, 0, 0.35); }
      else {
        if (it.def.kind === 'weapon' && !it.def.ranged) it.obj.quaternion.setFromEuler(new THREE.Euler(0.9, 0, 0)); else it.obj.quaternion.identity();
        if (!this.fpbody?.placeRemoteHeld(it, hand)) it.obj.position.copy(g).applyQuaternion(it.obj.quaternion).multiplyScalar(-1);   // [fpbody] placeRemoteHeld: grip offset sign fixed, scrap in front of the glove
      }
      it.obj.visible = false;
    }
  },

  updateRemoteHeldVisibility() {
    for (const it of this.items.all()) {
      if (!it.holder || it.holder === this.selfId || it.holder.startsWith?.('c:')) continue;
      const r = this.remotes.get(it.holder);
      if (!r) continue;
      it.obj.visible = !it.inv && !r.dead && r.heldType === it.type;
    }
  },

  // ------------------------------------------------------------------ item use
  useHeldPress() {
    const p = this.player;
    const it = p.heldItem();
    const hk = { handled: false };
    this.mods?.emit('useItem', it, hk, this);
    if (hk.handled) return;
    if (!it) { this.meleeSwing(null, 1); return; }
    const def = it.def;
    this.useStart = this.time;
    if (def.kind === 'weapon') {
      if (def.ranged) { this.fireRanged(it); return; }
      if (def.charge) { this.swingCharge = 0.001; return; }
      this.meleeSwing(it, 1);
      return;
    }
    switch (it.type) {
      case 'jetpack': return;   // LMB is the thrust (localplayer.js), never a melee swing
      case 'flashlight': case 'proflash': case 'walkie': case 'boombox':
        this.toggleItem(it); return;
      case 'medkit': this.healing = { it, t: 0 }; this.sfx('heal', 0.6); return;
      case 'adrenaline':
        p.speedBoost = 20; p.stamina = p.maxStamina; this.sfx('heal', 0.7);
        this.net.request('consume', { id: it.id }); this.ui.toast(t('Adrenaline rush!'), 'good'); return;
      case 'stungrenade': this.sfx('stun_pin', 0.8); this.dropItem(it, true, { fuse: 2.2 }); return;
      case 'glowstick': this.sfx('glowstick_crack', 0.8); this.setItemOn(it, true); this.dropItem(it, true); return;
      case 'spraypaint': this.spray(it); return;
      case 'rod': {
        const near = this.findInteraction();
        if (near && /Cast/.test(near.label)) near.action(); else this.ui.toast(t('Find a pond or the dock to fish.'));
        return;
      }
      default: break;
    }
    if (def.use === 'noise') {
      const snd = def.useSound;
      const pos = p.eyePos();
      this.net.broadcast('fx', { k: 'snd', s: snd, p: pos.toArray(), v: 1, r: 4 });
      this.net.request('noise', { p: pos.toArray(), loud: def.noise ?? 0.6 });
      return;
    }
    this.meleeSwing(it, 0.6); // bonk with whatever you hold
  },
  useHeldHold(dt) {
    if (this.swingCharge > 0) this.swingCharge = Math.min(1, this.swingCharge + dt * 1.6);
    if (this.healing && this.player.heldItem() !== this.healing.it) this.healing = null;
    if (this.healing) {
      this.healing.t += dt;
      if (this.healing.t > 1.5) {
        const it = this.healing.it;
        this.healing = null;
        const p = this.player;
        p.hp = Math.min(p.maxHp, p.hp + (it.def.heal || 50));
        this.net.request('consume', { id: it.id });
        this.ui.toast(t('Patched up.'), 'good');
        this.net.send('pst', { hp: p.hp });
      }
    }
  },
  useHeldRelease() {
    if (this.healing) this.healing = null;
    if (this.swingCharge > 0) {
      const it = this.player.heldItem();
      const c = this.swingCharge;
      this.swingCharge = 0;
      if (it) this.meleeSwing(it, 0.7 + c * 0.8);
    }
  },

  toggleItem(it) {
    if ((it.battery ?? 1) <= 0) { this.sfx('battery_dead', 0.5); this.ui.toast(t('Battery is dead. Charge it on the ship.')); return; }
    this.setItemOn(it, !it.on);
    this.sfx(it.type === 'walkie' ? 'walkie_on' : 'flashlight_click', 0.6);
  },
  setItemOn(it, on) {
    it.on = on;
    this.net.broadcast('itst', { id: it.id, on, b: it.battery });
    this.onItemState(it);
  },
  toggleFlashlight() {
    const p = this.player;
    const lights = p.slots.map((id) => id && this.items.get(id)).filter((it) => it && (it.type === 'flashlight' || it.type === 'proflash'));
    if (!lights.length) return;
    const held = p.heldItem();
    const target = lights.includes(held) ? held : lights[0];
    this.toggleItem(target);
  },
  onItemState(it) {
    const hk = { handled: false };
    this.mods?.emit('itemState', it, hk, this);
    if (hk.handled) return;
    // boombox music follows the item
    if (it.type === 'boombox') {
      if (it.on && !it.music) {
        const track = 'boombox_' + (1 + (Math.abs(hashId(it.id)) % 3));
        it.music = this.audio.play(track, { loop: true, follow: it.obj, volume: 0.8, refDistance: 4, maxDistance: 50, occlude: true });
      } else if (!it.on && it.music) { it.music.stop(0.2); it.music = null; }
    }
    if (it.type === 'glowstick' && it.on && !it.glow) {
      // own vector: updateBatteries copies the WORLD position into it every frame (obj.position is local while held)
      it.glow = this.lights.add({ pos: it.obj.getWorldPosition(new THREE.Vector3()), color: 0x66ff88, intensity: 0.8, distance: 7, group: 'items' });
    }
    if (it.music || it.glow) (this._fxItems ||= new Set()).add(it);
    if (it.type === 'walkie' && it.on) { /* voice routing handles it */ }
  },

  // Item side effects (boombox music, glowstick light) die with the item: 'rm', map unload, fired wipe, resync.
  updateItemFx() {
    const set = this._fxItems;
    if (!set?.size) return;
    for (const it of set) {
      if (this.items.get(it.id) === it && (it.music || it.glow)) continue;
      if (this.items.get(it.id) !== it) {
        it.music?.stop(0.2); it.music = null;
        if (it.glow) { this.lights.remove(it.glow); it.glow = null; }
      }
      set.delete(it);
    }
  },
  releaseAllItemFx() {
    for (const it of this._fxItems || []) { it.music?.stop(0.1); it.music = null; if (it.glow) { this.lights.remove(it.glow); it.glow = null; } }
    this._fxItems?.clear();
  },

  updateBatteries(dt) {
    const p = this.player;
    const held = p.heldItem();
    let flashReq = null;
    for (const id of p.slots) {
      const it = id && this.items.get(id);
      if (!it || !it.on || it.battery === null || it.battery === undefined) continue;
      const drain = it.type === 'boombox' ? 0.5 : it.type === 'walkie' ? 0.3 : 1;
      it.battery = Math.max(0, it.battery - (drain * dt) / (this.stats.batteryMul || 1));
      if (it.battery <= 0) { this.setItemOn(it, false); this.sfx('battery_dead', 0.6); this.ui.toast(tf('{name} battery died.', { name: it.def.name }), 'bad'); }
      if ((it.type === 'flashlight' || it.type === 'proflash') && it.on) {
        const L = it.def.light;
        const isHeld = it === held;
        const dim = it.battery < 15 ? 0.4 + Math.random() * 0.3 : 1;
        flashReq = { it, pos: null, intensity: L.intensity * (isHeld ? 1 : 0.45) * dim, distance: L.distance * (isHeld ? 1 : 0.7), angle: L.angle * (isHeld ? 1 : 1.2) };
      }
    }
    // periodic battery sync
    this.batSync = (this.batSync || 0) - dt;
    if (this.batSync <= 0) {
      this.batSync = 4;
      for (const id of p.slots) {
        const it = id && this.items.get(id);
        if (!it || it.battery == null) continue;
        // lit items, plus anything whose charge moved since the last sync (the jetpack burns fuel without being 'on')
        if (it.on || (it.syncedB != null && Math.abs(it.syncedB - it.battery) >= 0.5)) { it.syncedB = it.battery; this.net.send('itst', { id: it.id, b: Math.round(it.battery * 10) / 10 }); }
        else if (it.syncedB == null) it.syncedB = it.battery;
      }
    }
    if (flashReq && !p.dead) {
      const cam = this.camera;
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
      const pos = cam.position.clone().add(new THREE.Vector3(0.16, -0.1, -FLASH_AHEAD).applyQuaternion(cam.quaternion));   // [hud6] the lamp sits AHEAD of the hand + torch model: a Lambert hand 0.5 m from a 38 cd spot was blown out to a white blob
      this.lights.requestSpot({ pos, target: pos.clone().addScaledVector(fwd, 10), priority: 0, intensity: flashReq.intensity, distance: flashReq.distance, angle: flashReq.angle, penumbra: 0.5 });
    }
    // glowsticks lying around
    for (const it of this.items.all()) if (it.glow) it.glow.pos.copy(it.obj.getWorldPosition(tmp));
  },

  // ------------------------------------------------------------------ combat
  meleeSwing(it, power) {
    const now = this.time;
    const def = it ? it.def : { dmg: 4, cd: 0.5, reach: 1.6 };
    const cd = def.kind === 'weapon' ? def.cd : 0.7;
    if (now < (this.nextSwing || 0)) return;
    this.nextSwing = now + cd;
    this.swingAnim = 1;
    const p = this.player;
    if (p.stamina > 4) p.stamina -= def.kind === 'weapon' ? 5 : 2;
    this.sfx('swing_whoosh', 0.6, 0.9 + Math.random() * 0.2);
    this.engine.punch?.(-0.006, 0.01, -0.012);
    let dmg = (def.kind === 'weapon' ? def.dmg * tierDmg(it) : 5 + (def.weight || 0) * 0.15) * power * this.stats.meleeMul;
    if (this.hasPerk('berserk') && p.hp < p.maxHp * 0.5) dmg *= 1.25;
    const crit = Math.random() < this.stats.crit;
    if (crit) dmg *= 2;
    let afx = null;
    if (it?.affix) {
      afx = applyAffixes(it.affix, { dmg, crit, cd, stun: def.stun || 0 });
      dmg = afx.dmg;
      this.nextSwing = now + afx.cd;
    }
    this.pendingHit = { t: now + 0.14, dmg, crit: afx ? afx.crit : crit, reach: (def.reach || 2) + 0.2, knock: def.knock || 1, stun: afx ? afx.stun : def.stun || 0, afx };
  },
  resolveMelee(h) {
    const p = this.player;
    const eye = this.camera.position.clone();
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    // latched leech: always hit it
    if (p.latched) {
      this.net.request('hit', { cid: p.latched, dmg: h.dmg, crit: h.crit });
      if (h.afx) applyAffixEffects(this, h.afx, this.creatures.views.get(p.latched));
      this.sfx('hit_flesh', 0.9);
      return;
    }
    const wall = this.physics.raycast(eye, fwd, h.reach, G.STATIC | G.DOOR);
    const maxD = wall ? wall.distance : h.reach;
    // creatures (slightly generous: test 3 rays)
    let best = null;
    for (const off of [0, 0.12, -0.12]) {
      const dir = fwd.clone().applyAxisAngle(UP, off);
      const r = this.creatures.raycast(eye, dir, maxD + 0.3);
      if (r && (!best || r.t < best.t)) best = r;
    }
    if (best) {
      const v = best.view;
      this.net.request('hit', { cid: v.id, dmg: Math.round(h.dmg), crit: h.crit, stun: h.stun, kb: h.knock || 1 });
      this.hitstopT = Math.max(this.hitstopT || 0, this.feel?.hitstop(h.dmg, { crit: h.crit }) ?? (h.crit ? 0.11 : 0.065));   // wave 7: 40-90 ms by damage
      if (h.afx) applyAffixEffects(this, h.afx, v);
      this.sfx(v.maxHp === null && v.type !== 'mimicdoor' ? 'hit_metal' : 'hit_flesh', 0.9);
      this.engine.shake(0.15);
      this.viewModel?.impact?.(v.maxHp === null && v.type !== 'mimicdoor' ? 'metal' : 'flesh', h.crit ? 1.3 : 1);
      this.engine.punch?.(0.015, 0, 0);
      return;
    }
    // other players (friendly fire, reduced)
    for (const r of this.remotes.values()) {
      if (r.dead) continue;
      const head = r.pos.clone().add(new THREE.Vector3(0, 1.0, 0));
      const to = head.clone().sub(eye);
      const along = to.dot(fwd);
      if (along < 0 || along > maxD + 0.3) continue;
      if (to.addScaledVector(fwd, -along).length() < 0.55) {
        this.net.sendTo(r.id, 'hurt', { dmg: Math.round(h.dmg * 0.35), cause: 'crewmate', from: this.selfId, p: eye.toArray() });
        this.sfx('hit_flesh', 0.8);
        return;
      }
    }
    // items: knock big ones
    const ih = this.physics.raycast(eye, fwd, maxD + 0.2, G.ITEM | G.BIG);
    if (ih?.info?.itemId) {
      const it = this.items.get(ih.info.itemId);
      if (it?.body && it.isSimulatedHere()) it.body.applyImpulse({ x: fwd.x * 3 * h.knock, y: 1.5, z: fwd.z * 3 * h.knock }, true);
      this.sfx('hit_metal', 0.6);
      this.viewModel?.impact?.('metal', 0.8);
      return;
    }
    if (wall) { this.viewModel?.impact?.('wall', 1.1); this.engine.punch?.(0.012, 0, 0.01); this.sfx('hit_wall', 0.45, 0.9 + Math.random() * 0.2); }
    if (wall) { if (wall.point && this.particles) this.particles.burst(wall.point, 'sparks', fwd.clone().negate(), 0.6);
      this.sfx('hit_metal', 0.5); this.net.request('noise', { p: wall.point ? [wall.point.x, wall.point.y, wall.point.z] : eye.toArray(), loud: 0.4 }); }
  },

  fireRanged(it) {
    const def = it.def;
    const now = this.time;
    if (now < (this.nextSwing || 0)) return;
    if (def.ammo !== undefined && (it.ammo ?? 0) <= 0) { this.sfx('ui_error', 0.5); this.ui.toast(t('Out of ammo. [R] to reload with shells.')); return; }
    if (def.battery && (it.battery ?? 0) <= 0) { this.sfx('battery_dead', 0.5); return; }
    this.nextSwing = now + affixCooldown(it.affix, def.cd);
    const eye = this.camera.position.clone();
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    if (def.ammo !== undefined) { it.ammo -= 1; this.net.broadcast('itst', { id: it.id, am: it.ammo }); }
    if (def.battery) { it.battery = Math.max(0, it.battery - 12); this.net.broadcast('itst', { id: it.id, b: it.battery }); }
    const snd = it.type === 'shotgun' ? 'shotgun_fire' : it.type === 'harpoon' ? 'harpoon_fire' : 'taser_zap';
    this.net.broadcast('fx', { k: 'snd', s: snd, p: eye.toArray(), v: 1, r: 6 });
    this.net.request('noise', { p: eye.toArray(), loud: it.type === 'shotgun' ? 3 : 1 });
    this.engine.shake(it.type === 'shotgun' ? 0.5 : 0.2);
    this.engine.punch?.(it.type === 'shotgun' ? 0.09 : it.type === 'harpoon' ? 0.05 : 0.02, (Math.random() - 0.5) * 0.02, 0);
    if (it.type === 'shotgun') this.engine.flash(0xffd080, 0.25);
    const pellets = it.type === 'shotgun' ? 8 : 1;
    const hits = new Map();
    for (let k = 0; k < pellets; k++) {
      const dir = fwd.clone();
      if (pellets > 1) dir.add(new THREE.Vector3((Math.random() - 0.5) * 0.09, (Math.random() - 0.5) * 0.09, (Math.random() - 0.5) * 0.09)).normalize();
      const wall = this.physics.raycast(eye, dir, def.reach, G.STATIC | G.DOOR);
      const maxD = wall ? wall.distance : def.reach;
      const r = this.creatures.raycast(eye, dir, maxD);
      if (r) {
        const falloff = it.type === 'shotgun' ? clamp(1.3 - r.t / 18, 0.2, 1) : 1;
        hits.set(r.view.id, (hits.get(r.view.id) || 0) + (def.dmg * tierDmg(it) / pellets) * falloff * this.stats.meleeMul);
      }
    }
    for (const [cid, dmg] of hits) {
      if (!it.affix) { this.net.request('hit', { cid, dmg: Math.round(dmg), stun: def.stun || 0 }); continue; }
      const a = applyAffixes(it.affix, { dmg, crit: false, cd: def.cd, stun: def.stun || 0 });
      this.net.request('hit', { cid, dmg: Math.round(a.dmg), crit: a.crit, stun: a.stun });
      applyAffixEffects(this, a, this.creatures.views.get(cid));
    }
    this.swingAnim = 0.6;
  },

  reload() {
    const p = this.player;
    const it = p.heldItem();
    if (!it || it.type !== 'shotgun') return;
    const shellsId = p.slots.find((id) => id && this.items.get(id)?.type === 'shells') || this.inventory?.bagItems?.().find((b) => b.type === 'shells')?.id;
    if (!shellsId) { this.ui.toast(t('No shells.')); return; }
    it.ammo = 2;
    this.net.broadcast('itst', { id: it.id, am: 2 });
    this.net.request('consume', { id: shellsId });
    this.sfx('shotgun_reload', 0.8);
  },

  spray(it) {
    if ((it.charges ?? 0) <= 0) { this.ui.toast(t('Spray can is empty.')); return; }
    const eye = this.camera.position.clone();
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const hit = this.physics.raycast(eye, fwd, 3, G.STATIC | G.DOOR);
    if (!hit) return;
    it.charges -= 1;
    this.net.broadcast('itst', { id: it.id, c: it.charges });
    const n = hit.normal;
    const colors = [0xff3355, 0x33ff88, 0xffee33, 0x33aaff, 0xff66ff];
    this.net.broadcast('fx', { k: 'spray', p: [hit.point.x, hit.point.y, hit.point.z], n: [n.x, n.y, n.z], c: colors[hashId(this.selfId) % colors.length] });
    this.sfx('spray_paint', 0.6);
  },
  spawnSpray(d) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(0.22 + Math.random() * 0.1, 7), new THREE.MeshBasicMaterial({ color: d.c, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    const n = new THREE.Vector3().fromArray(d.n);
    m.position.fromArray(d.p).addScaledVector(n, 0.01);
    m.lookAt(m.position.clone().add(n));
    this.scene.add(m);
    (this.sprays = this.sprays || []).push(m);
    if (this.sprays.length > 200) { const o = this.sprays.shift(); o.removeFromParent(); o.geometry.dispose(); }
  },

  doEmote(e) {
    this.emote = e;
    this.emoteT = this.time + (e === 'dance' ? 8 : 2.5);
  },

  // ------------------------------------------------------------------ scan
  scan() {
    if (this.time < (this.nextScan || 0)) return;
    this.nextScan = this.time + 1.2;
    this.audio.ui('ui_scan', 0.5);
    this.ui.hud?.scanPulse();
    // World-space scan wave: the HUD ring tells the player a scan happened;
    // this makes the information feel like a physical pulse travelling through the level.
    if (this.scanWave) {
      this.scanWave.root.removeFromParent();
      this.scanWave.geo.dispose(); this.scanWave.mat.dispose();
    }
    const waveRoot = new THREE.Group();
    const waveGeo = new THREE.RingGeometry(0.9, 1.0, 48);
    const waveMat = new THREE.MeshBasicMaterial({ color: 0x9fd4ff, transparent: true, opacity: 0.62, depthWrite: false, side: THREE.DoubleSide });
    const wave = new THREE.Mesh(waveGeo, waveMat);
    wave.rotation.x = -Math.PI / 2;
    wave.frustumCulled = false;
    waveRoot.add(wave);
    waveRoot.position.set(this.player.pos.x, this.player.pos.y + 0.06, this.player.pos.z);   // the pulse leaves from where you scanned
    if (!this.scanFx) this.scene.add(waveRoot);   // ScanFx replaces the flat ring with a 3D sphere + surface shell
    this.scanFx?.start(this.camera.position, this.stats.scanRange);
    this.scanWave = { root: waveRoot, geo: waveGeo, mat: waveMat, t: 0, range: clamp((this.stats.scanRange || 20) * 0.9, 6, 40) };
    const eye = this.camera.position.clone();
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const range = this.stats.scanRange;
    const labels = [];
    let total = 0;
    for (const it of this.items.all()) {
      if (it.state !== 'world' || !isSellable(it.def) && it.type !== 'body') continue;
      const pos = it.obj.getWorldPosition(new THREE.Vector3());
      const to = pos.clone().sub(eye);
      const d = to.length();
      if (d > range) continue;
      if (to.normalize().dot(fwd) < 0.45) continue;
      if (d > 3 && !this.physics.lineOfSight(eye, pos, G.STATIC | G.DOOR)) continue;
      const fuzz = 0.85 + (Math.abs(hashId(it.id)) % 30) / 100;
      const shown = it.type === 'body' ? 0 : Math.round(it.value * fuzz);
      total += shown;
      const tg = tierTag(it);
      labels.push({ pos, name: it.type === 'body' ? `${it.label || 'Body'}` : it.def.name, sub: it.type === 'body' ? t('Recover to reduce fines') : tf('Value: ▮{shown}{n}', { shown, n: tg ? ' · ' + tg : '' }), color: it.type === 'body' ? '#ff6b6b' : it.tierColor });
      labels[labels.length - 1].type = it.type;
      if (it.affix) { const l = labels[labels.length - 1]; l.name = affixDisplayName(it.def.name, it.affix, it); l.color = affixColor(it.affix); l.sub += ' · ' + describeAffix(it.affix).slice(0, 2).join(', '); }
      else if (it.plus || it.oc?.length) labels[labels.length - 1].name = affixDisplayName(it.def.name, null, it);   // [forge]
    }
    for (const v of this.creatures.views.values()) {
      if (v.state === 'dead' || v.type === 'web' || v.type === 'mimicdoor' || v.def?.noScan) continue;   // noScan: disguised (lcmonsters Loot Mimic paints its own item label)
      const to = v.pos.clone().add(new THREE.Vector3(0, v.height * 0.6, 0)).sub(eye);
      const d = to.length();
      if (d > 30 || to.normalize().dot(fwd) < 0.5) continue;
      if (v.type === 'screamer' && v.alpha < 0.3) continue;
      if (v.hidden) continue;   // private creatures (Parasocial) only exist for their victim
      if (!this.physics.lineOfSight(eye, v.pos.clone().add(new THREE.Vector3(0, v.height * 0.6, 0)), G.STATIC | G.DOOR)) continue;
      const known = !!this.profile.bestiary[v.type]?.seen;
      this.progress.see(v.type);
      const name = v.type === 'mimic' ? (v.name || 'Crewmate') : (known ? v.def.name : '???');
      const ft = v.tier && known ? TIERS[v.tier] : null;   // [forge] creature tier colour + name
      labels.push({ pos: v.pos.clone().add(new THREE.Vector3(0, v.height + 0.3, 0)), name: v.type === 'mimic' ? name : `${ft ? ft.name + ' ' : ''}${name}${v.def.hazard ? '' : ' Lv.' + v.level}${v.elite ? ' ★ELITE' : ''}`, sub: v.code ? `Code: ${v.code.toUpperCase()}` : (v.def.hazard ? t('Hazard') : t('Entity')), color: v.type === 'mimic' ? '#b8ffcc' : ft ? ft.color : '#ff5a5a' });
    }
    // exits / ship
    if (this.world.outdoor && !this.player.indoor) {
      const e = this.world.outdoor.mainExit.pos;
      if (e.distanceTo(eye) < 200) labels.push({ pos: e.clone().add(new THREE.Vector3(0, 3, 0)), name: 'Main Entrance', sub: '', color: '#9fffb0' });
      labels.push({ pos: new THREE.Vector3(0, 4, 0), name: 'Ship', sub: '', color: '#9fd4ff' });
      this.world.outdoor.outposts?.scanLabels(eye, labels);
    }
    this.mods?.emit('scanLabels', labels, eye, fwd, this);   // [lcmonsters] cursed-scrap tell + Loot Mimic label
    this.scanFx?.reveal(labels);   // sort near->far, give each label a pop-in delay synced to the wave + blips
    this.ui.hud?.showScan(labels, total);
  },

  noticeCreatures() {
    const eye = this.camera.position;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    for (const v of this.creatures.views.values()) {
      if (v.def.hazard && v.type !== 'turret' && v.type !== 'mine') continue;
      if (this.profile.bestiary[v.type]?.seen) continue;
      const to = v.pos.clone().add(new THREE.Vector3(0, 1, 0)).sub(eye);
      if (to.length() > 14 || to.normalize().dot(fwd) < 0.7) continue;
      if (v.type === 'screamer' && v.alpha < 0.4) continue;
      if (v.hidden) continue;
      if (!this.physics.lineOfSight(eye, v.pos.clone().add(new THREE.Vector3(0, 1, 0)), G.STATIC | G.DOOR)) continue;
      if (v.type !== 'mimic') this.progress.see(v.type, true);
    }
  },

  // ------------------------------------------------------------------ damage / death
  onHurt(d) {
    const p = this.player;
    if (p.dead) return;
    this.mods?.emit('localHurt', d, this);
    if (p.inShip && ['hound', 'giant', 'sandkefal', 'mimic'].includes(d.cause) && d.dmg < 999) return;
    let dmg = d.dmg;
    if (dmg < 999) dmg *= 1 - clamp(this.stats.armor || 0, 0, 0.6);
    this.damageLocal(dmg, d.cause, d.p ? new THREE.Vector3().fromArray(d.p) : null);
  },
  damageLocal(dmg, cause, fromPos) {
    const p = this.player;
    if (p.dead || dmg <= 0) return;
    if (this.godMode) return;
    if (p.hp - dmg <= 0 && this.hasPerk('secondwind') && !this.secondWindUsed && dmg < 999) {
      this.secondWindUsed = true;
      p.hp = 1;
      this.ui.toast(t('SECOND WIND!'), 'good');
      this.engine.flash(0xffffff, 0.6);
      return;
    }
    p.hp -= dmg;
    this.engine.hurt(clamp(dmg / 50, 0.25, 1));
    p.onHurt?.(dmg, fromPos);
    this.sfx(this.audio.variant('hurt'), 0.8);
    if (fromPos) this.ui.hud?.damageDirection(fromPos, this);
    this.net.send('pst', { hp: Math.max(0, Math.round(p.hp)) });
    this.lastHurtT = this.time;
    if (p.hp <= 0) this.die(cause);
  },

  die(cause) {
    const p = this.player;
    if (p.dead) return;
    p.dead = true;
    p.hp = 0;
    this.grab?.stop();
    this.closeMinigame();
    this.terminal.close();
    // drop inventory
    for (const id of [...p.slots]) {
      const it = id && this.items.get(id);
      if (!it) continue;
      if (it.soulbound) { const i = p.slots.indexOf(id); p.slots[i] = null; this.net.request('consume', { id }); continue; }
      if (it.type === 'boombox' && it.on) this.setItemOn(it, false);
      if (it.def.battery && it.battery != null) this.net.send('itst', { id, b: Math.round(it.battery * 10) / 10 });
      const pos = p.pos.clone().add(new THREE.Vector3((Math.random() - 0.5), 0.8, (Math.random() - 0.5)));
      this.net.request('drop', { id, p: pos.toArray(), q: [0, 0, 0, 1], lv: [0, 1, 0] });
      const i = p.slots.indexOf(id); p.slots[i] = null;
    }
    // bag + equipment spill around the body (inventory.js); soulbound gear goes back to the Black Market as usual
    let k = 0;
    for (const it of [...this.items.all()]) {
      if (it.holder !== this.selfId || !it.inv) continue;
      if (it.soulbound) { this.net.request('consume', { id: it.id }); continue; }
      const a = k * 2.399, r = 0.35 + Math.min(1.1, k * 0.09);
      const pos = p.pos.clone().add(new THREE.Vector3(Math.cos(a) * r, 0.7 + (k % 4) * 0.12, Math.sin(a) * r));
      this.net.request('drop', { id: it.id, p: pos.toArray(), q: [0, Math.sin(a / 2), 0, Math.cos(a / 2)], lv: [Math.cos(a) * 1.2, 1.4, Math.sin(a) * 1.2] });
      k++;
    }
    this.inventory?.close?.();
    this.refreshHeldVisuals();
    this.sfx('death', 0.9);
    this.engine.fx.blind = 0;
    this.engine.flash(0x550000, 0.9);
    this.net.send('pst', { dead: true, cause, pos: p.pos.toArray() });
    if (this.isHost) this.hostOnPlayerDied(this.selfId, { cause, pos: p.pos.toArray() });
    this.progress.onDeath(cause);
    const DEATH_TIPS = ['Crouch (C) to stay quiet - most things hunt by sound.', 'Scan (right click) before you walk into a room.',
      'Ping (P) threats so your crew knows.', 'Dead crewmates can still watch and ping. Stay on comms.', 'Bodies can be carried back to cut the fine.',
      'Close doors behind you. Some things cannot open them.', 'Do not stare at what blinks. Do not look away either.', 'Leave before midnight. The ship will not wait.'];
    this.ui.hud?.setDead(true, 'You ' + this.deathText(cause).replace('their', 'your'), DEATH_TIPS[Math.floor(Math.random() * DEATH_TIPS.length)]);
    this.ui.systemMessage(tf('You {replace}', { replace: this.deathText(cause).replace('their', 'your') }), 'bad');
    this.spectateIdx = 0;
    this.deadT = 0;
    if (p.latched) { p.latched = null; }
    this.mods?.emit('localDeath', cause, this);
  },

  updateSpectator(dt, input) {
    this.deadT = (this.deadT || 0) + dt;
    const alive = [...this.remotes.values()].filter((r) => !r.dead);
    const cam = this.camera;
    if (input.mouseClicked(0) || input.pressed('jump')) this.spectateIdx++;
    const { dx, dy } = input.consumeMouse();
    this.specYaw = (this.specYaw || 0) - dx;
    this.specPitch = clamp((this.specPitch || 0.3) - dy, -0.6, 1.2);
    if (this.deadT < 2.5 || !alive.length) {
      // look at own death spot
      const c = this.player.pos.clone().add(new THREE.Vector3(0, 1, 0));
      const off = new THREE.Vector3(Math.sin(this.specYaw) * 3.5, 1.5 + this.specPitch * 2, Math.cos(this.specYaw) * 3.5);
      cam.position.copy(c).add(off);
      cam.lookAt(c);
      this.spectating = null;
      this.ui.hud?.setSpectate(alive.length ? null : t('Waiting for the crew...'));
      return;
    }
    const r = alive[this.spectateIdx % alive.length];
    this.spectating = r.id;
    const head = r.headPos(new THREE.Vector3());
    const off = new THREE.Vector3(Math.sin(this.specYaw) * 3.2, 0.6 + this.specPitch * 2, Math.cos(this.specYaw) * 3.2);
    const want = head.clone().add(off);
    const hit = this.physics.raycast(head, want.clone().sub(head).normalize(), off.length(), G.STATIC | G.DOOR);
    cam.position.copy(hit ? head.clone().add(want.sub(head).setLength(Math.max(0.3, hit.distance - 0.2))) : want);
    cam.lookAt(head);
    this.env.indoor = r.indoor;
    this.ui.hud?.setSpectate(tf('Spectating {name}  [LMB] next', { name: r.name }));
  },

  onLatch(d) {
    if (d.pid === this.selfId) {
      this.player.latched = d.on ? d.cid : null;
      if (d.on) { this.ui.toast(t('Something is on your head! Hit it!'), 'bad'); this.engine.shake(0.6); }
    } else {
      const r = this.remotes.get(d.pid);
      if (r) r.latched = d.on;
    }
  },

  requestLoadout() {
    const w = this.profile.loadout?.weapon;
    if (!w || this.player.dead) return;
    setTimeout(() => this.net.request('loadout', { weapon: w, pid: this.profile.id }), 400);
  },

  // ------------------------------------------------------------------ feedback hooks
  onItemImpact(it, dv) {
    if (it.def.fragile) {
      const amt = Math.round((dv - 4) * it.def.fragile * (it.baseValue || 50) * 0.035 + 1);
      if (this.isHost) this.hostDamageItem(it.id, amt); else this.net.request('dmgItem', { id: it.id, amt });
    }
    const vol = clamp(dv / 12, 0.1, 0.8);
    this.audio.at(it.def.fragile ? 'glass_break' : 'item_drop', it.obj.position, vol * (it.def.fragile ? 0.5 : 1), { refDistance: 2 });
    if (dv > 7) this.net.request('noise', { p: it.obj.position.toArray(), loud: 0.5 });
  },
  onItemValueLost(it, lost) {
    this.audio.at('value_lost', it.obj.position, 0.6);
    this.ui.hud?.floatText(it.obj.getWorldPosition(new THREE.Vector3()), `-▮${lost}`, '#ff5a5a');
  },
  onCreatureDamaged(v, dmg, crit, by) {
    if (dmg > 0) this.ui.hud?.floatText(v.pos.clone().add(new THREE.Vector3(0, v.height + 0.2, 0)), (crit ? 'CRIT ' : '') + dmg, crit ? '#ffd23f' : by === this.selfId ? '#ffffff' : '#bbbbbb', crit);
  },
  onCreatureKilled(v, d) {
    if (d.by === this.selfId) this.progress.kill(v.type);
  },
  onCreatureState(v, prev, st) {
    if (v.type === 'jester' && st === 'popped' && this.player.indoor) { this.audio.play('chase_sting', { volume: 0.7, bus: 'music' }); }
    if (v.type === 'sandkefal' && st === 'rumble' && v.pos.distanceTo(this.player.pos) < 30) this.engine.shake(0.6);
  },
  onSellResult(d) {
    const c = this.world.company;
    if (d.pending) { if (c) { c.tentState = 'grab'; c.tentT = 0; } this.audio.play('company_tentacle', { volume: 0.9 }); return; }
    this.audio.play('coins', { volume: 0.8 });
    this.ui.showSale(d, this);
  },

  // ------------------------------------------------------------------ minigames
  openMinigame(kind, opts, onDone) {
    if (this.minigame) return;
    const factory = MINIGAMES[kind];
    if (!factory) { console.warn('no minigame', kind); return; }
    this.input.unlock();
    const layer = this.ui.minigameLayer();
    const ease = opts.noEase ? 0 : (this.stats.minigameEase || 0);
    const mg = factory({
      container: layer, rng: Math.random,
      sfx: (n) => {
        if (typeof n !== 'string') return;
        if (n.startsWith('stop:')) { this._mgLoops?.get(n.slice(5))?.stop(0.1); return; }
        const loop = n.endsWith('_loop') || n === 'slot_spin';
        const h = this.audio.play(n, { volume: 0.6, bus: 'ui', loop: loop && n !== 'slot_spin' });
        if (loop) { (this._mgLoops = this._mgLoops || new Map()).set(n, h); }
      },
      ...opts,   // callers may still override container/rng/sfx, but not the eased difficulty
      difficulty: clamp((opts.difficulty ?? 0.4) - ease, 0, 1),
      onDone: (res) => {
        this.closeMinigame();
        try { onDone?.(res); } catch (e) { console.error(e); }
      },
    });
    this.minigame = mg;
    this.ui.setMinigameOpen(true);
  },
  closeMinigame() {
    if (!this.minigame) return;
    const mg = this.minigame;
    this.minigame = null;
    try { mg.destroy(); } catch (e) { console.warn(e); }
    this._mgLoops?.forEach((h) => h?.stop(0.1)); this._mgLoops?.clear();
    this.ui.setMinigameOpen(false);
    if (!this.player.dead) this.input.lock();
  },

  startArcade() {
    this.openMinigame('arcade', { difficulty: 0.3, noEase: true, highScore: this.profile.stats.bestArcade || 0 }, (r) => {
      if (r.score) this.progress.arcade(r.score);
    });
  },
  startFishing(sea) {
    if (sea) {
      this.hqFish = this.hqFish || { day: -1, n: 0 };
      if (this.hqFish.day !== this.run?.day) this.hqFish = { day: this.run?.day, n: 0 };
      if (this.hqFish.n >= 6) { this.ui.toast(t('The fish are not biting here anymore today. Try a moon pond.')); return; }
      this.hqFish.n++;
    }
    const luck = (this.profile.skills.lck || 0) * 0.01;
    const table = FISH_TABLE.map((f) => ({ ...f, w: f.w * (f.rarity === 'legendary' || f.rarity === 'epic' ? 1 + luck * 10 : 1) }));
    let tot = 0; for (const f of table) tot += f.w;
    let r = Math.random() * tot; let fish = table[0];
    for (const f of table) { r -= f.w; if (r <= 0) { fish = f; break; } }
    if (sea && Math.random() < 0.15) fish = table.find((f) => f.id === 'fish_eel') || fish;
    const def = itemDef(fish.id);
    this.sfx('fish_cast', 0.6);
    this.net.request('noise', { p: this.player.pos.toArray(), loud: 0.3 });
    this.openMinigame('fishing', { difficulty: fish.difficulty, fish: { id: fish.id, name: def.name, difficulty: clamp(fish.difficulty - (this.stats.minigameEase || 0), 0, 1), rarity: fish.rarity } }, (res) => {
      if (res.success) {
        const slot = findFreeSlot(this.player);
        this.net.request('fish', { type: fish.id, slot });
        this.progress.fish(fish.id);
        this.ui.toast(tf('Caught: {name}!', { name: def.name }), 'good');
      }
    });
  },
  startSafe(door) {
    const danger = this.hostDangerGuess();
    this.openMinigame('safe', { difficulty: clamp(0.25 + danger * 0.12, 0, 0.95) }, (res) => {
      if (res.success) { this.net.request('vault', { id: door.id }); this.ui.toast(t('Vault unlocked.'), 'good'); }
      else if (!res.cancelled) { this.net.request('alarm', { p: door.pos.toArray() }); this.ui.toast(t('ALARM TRIGGERED!'), 'bad'); }
    });
  },
  startFuse(ip) {
    this.openMinigame('fuse', { difficulty: clamp(0.3 + this.hostDangerGuess() * 0.1, 0, 0.9) }, (res) => {
      if (res.success) this.net.request('fuse', {});
      else if (!res.cancelled) { this.engine.flash(0x88ccff, 0.4); this.damageLocal(10, 'electric'); }
    });
  },
  startLockpick(door, pick) {
    this.openMinigame('lockpick', { difficulty: doorDifficulty(this.hostDangerGuess()) }, (res) => {
      if (res.success) this.net.request('unlock', { id: door.id });
      if (!res.cancelled) {
        pick.charges = Math.max(0, (pick.charges ?? 3) - 1);
        if (pick.charges <= 0) this.net.request('consume', { id: pick.id });
        else this.net.broadcast('itst', { id: pick.id, c: pick.charges });
      }
    });
  },
  startSlots() {
    this.openMinigame('slots', { difficulty: 0.5, balance: this.profile.coins, bets: [10, 25, 50, 100, 250], onSpin: (bet, win) => { this.profile.coins += win - bet; this.progress.save(); this.ui.hud?.setCoins(this.profile.coins); return this.profile.coins; } }, () => {});
  },
  hostDangerGuess() {
    const m = MOONS[this.run?.moon];
    return (m?.tier || 1) + (this.run?.quotaIndex || 0) * 0.35;
  },

  openTerminal() { this.terminal.open(); },

  // ------------------------------------------------------------------ view model
  updateViewModel(dt) {
    const vm = this.viewModel;
    const p = this.player;
    this.updateRemoteHeldVisibility();
    if (!vm) return;
    const held = p.heldItem();
    const def = held ? itemDef(held.type) : null;
    vm.setVisible?.(!p.dead && !this.emotes?.active && (!!held || this.swingAnim > 0 || this.grab?.item));
    vm.update(dt, {
      moveBob: p.bobAmt || 0, sprint: p.sprinting, swing: this.swingAnim > 0 ? 1 - this.swingAnim : 0, charging: this.swingCharge || 0,
      holding: !def ? 'none' : def.hands === 2 || def.kind === 'big' || held.type === 'body' ? 'twohand' : 'onehand',
      lookDelta: p.lookDelta || { x: 0, y: 0 }, time: this.time,
      item: held ? held.type : null, weapon: def?.kind === 'weapon', ranged: !!def?.ranged, player: p, reduceMotion: !!this.settings.reduceMotion,
      grip: this.fpbody?.gripOf(held) || null,   // [fpbody] arm IK targets for two-handed items
    });
  },
};

function hashId(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }

import { suitColor as suitColorFor } from '../entities/remote.js';
import { t, tf } from '../core/i18n.js';
