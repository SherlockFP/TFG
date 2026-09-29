// Creatures: host-side AI simulation (behaviors per type) + client-side views (interpolated models,
// state sounds, loops, hit flash, nameplates). Hazards (turret, mine, web, mimic door) are creatures too.
import * as THREE from 'three';
import { CREATURES, creatureLevelStats, VARIANTS, AFFIXES, variantOf, rollAffix, creatureDisplayName } from '../game/creatures.js';
import { createCreatureModel } from '../models/creatures.js';
import { createProp } from '../models/props.js';
import { G } from '../physics/physics.js';
import { angleDiff, clamp, damp, dampAngle } from '../core/util.js';
import { insideShip } from '../world/ship.js';
import { applyNameTagTitle } from '../game/achievements.js';
import { ITEMS } from '../game/items.js';
import { t, addTranslations } from '../core/i18n.js';
import { creatureTierMul, creatureTierXp } from '../game/enhance.js';   // [forge] creature tiers

addTranslations({ 'CROUCH BESIDE IT TO ROCK IT': 'SALLAMAK İÇİN YANINDA ÇÖMEL' });

const V = new THREE.Vector3();
const V2 = new THREE.Vector3();

// ---------------------------------------------------------------------------------------------
// Client view
// ---------------------------------------------------------------------------------------------
export const STATE_SOUNDS = {
  scuttler: { run: ['scuttler_hiss', 0.6], attack: ['scuttler_click', 0.8], dead: ['scuttler_death', 0.8], idle: ['scuttler_click', 0.3] },
  yoinker: { idle: ['yoinker_yippee', 0.7], fly: ['yoinker_yippee', 0.9], run: ['yoinker_angry', 0.9], attack: ['yoinker_angry', 0.9], dead: ['creature_death', 0.8] },
  crawler: { run: ['crawler_roar', 1.0], attack: ['crawler_roar', 0.8], dead: ['creature_death', 1] },
  lurker: { angry: ['lurker_growl', 1.0], attack: ['lurker_snap', 1.0], flee: ['lurker_growl', 0.4], dead: ['creature_death', 1] },
  jester: { popped: ['jester_pop', 1.0] },
  spider: { run: ['spider_hiss', 0.9], attack: ['spider_hiss', 1], dead: ['creature_death', 0.9] },
  leech: { fall: ['leech_screech', 1.0], latched: ['leech_chitter', 0.8], dead: ['creature_death', 0.6] },
  screamer: { scream: ['screamer_scream', 1.0], dead: ['creature_death', 0.9] },
  hound: { run: ['hound_growl', 1.0], howl: ['hound_howl', 1.0], attack: ['hound_bark', 1.0], sniff: ['hound_growl', 0.35], dead: ['creature_death', 1] },
  giant: { run: ['giant_growl', 1.0], grab: ['giant_growl', 1.0], dead: ['creature_death', 1] },
  sandkefal: { emerge: ['sandkefal_roar', 1.0] },
  turret: { alert: ['turret_detect', 0.9] },
  mine: { triggered: ['mine_click', 0.9] },
  mimic: { attack: ['hit_flesh', 0.6], dead: ['creature_death', 0.8] },
  mimicdoor: { attack: ['lurker_snap', 1.0], dead: ['creature_death', 0.9] },
  mannequin: {},
  sludge: {},
  // round-3 creatures: a sound entry may list fallbacks (first one that exists is played) and a pitch
  moderator: { scan: [['beep_3', 'turret_detect'], 0.8], aim: [['scifi_alarm_soft', 'turret_detect'], 1.0, 1.3], reload: ['shotgun_reload', 0.9],
    hunt: [['mon_growl_2', 'lurker_growl'], 0.7, 1.2], kick: [['impact_punch', 'hit_flesh'], 1.0], stunned: ['hit_metal', 0.8, 0.8], dead: [['power_down', 'creature_death'], 1.0] },
  support: { windup: [['voice_clown_anger', 'lurker_growl'], 0.8, 1.25], stab: [['swoosh_2', 'swing_whoosh'], 1.0], run: [['voice_clown_laughing', 'yoinker_angry'], 0.9, 0.8],
    follow: [['voice_clown_grunt', 'squeak'], 0.35, 1.3], dead: [['voice_clown_die', 'creature_death'], 1.0] },
  ticketswarm: { dead: [['electric_2', 'spark'], 0.7] },
  editor: { snip: [['swoosh_1', 'swing_whoosh'], 1.0, 1.4], stunned: ['hit_metal', 0.8, 0.6], dead: [['voice_skeleton_die', 'creature_death'], 1.0] },
  tamagotchi: { cry: [['voice_rat_scared', 'squeak'], 0.9, 1.6], rocked: [['arcade_score', 'ui_notify'], 0.6], morph: [['mon_scream', 'screamer_scream'], 1.0, 0.8],
    run: [['mon_growl_5', 'hound_growl'], 0.9], crouch: [['voice_dragon_anger', 'lurker_growl'], 1.0, 1.2], lunge: [['voice_dragon_attack_1', 'lurker_snap'], 1.0], dead: [['voice_dragon_die', 'creature_death'], 1.0] },
  stalker: { lurk: [['voice_clown_laughing', 'mimic_voice_2'], 0.45, 1.35], reveal: [['sting_violin_glitch', 'jumpscare_2', 'screamer_scream'], 0.9], chase: [['jumpscare_3', 'mon_scream'], 0.8, 1.2] },
  clickbait: { aim: [['ui_notify', 'bell_ding'], 1.0, 1.1], tongue: [['swoosh_3', 'swing_whoosh'], 1.0, 0.8], drag: [['voice_slime_eating', 'leech_chitter'], 0.9],
    flee: [['voice_rat_hurt', 'creature_hurt'], 0.9], dead: [['voice_rat_die', 'creature_death'], 1.0] },
  replyguy: { posture: [['voice_bat_anger', 'animal_crow'], 1.0, 0.8], attack: [['voice_bat_attack', 'hit_flesh'], 0.9], flee: [['voice_bat_scared', 'animal_crow'], 0.8],
    dead: [['voice_bat_die', 'creature_death'], 1.0] },
};
// [state ('*' = always), sound, volume, pitch?] - loops must be procedural loop sounds (external ones never loop)
export const LOOPS = {
  sludge: [['*', 'sludge_gurgle', 0.6]],
  spider: [['run', 'spider_skitter', 0.7], ['walk', 'spider_skitter', 0.4]],
  jester: [['winding', 'jester_crank', 0.8], ['winding', 'jester_music', 0.9], ['popped', 'jester_scream', 0.9], ['run', 'jester_scream', 1.0]],
  sandkefal: [['rumble', 'sandkefal_rumble', 1.0], ['hidden', 'sandkefal_rumble', 0.25]],
  hound: [],
  scuttler: [['run', 'scuttler_click', 0.25]],
  ticketswarm: [['*', 'lights_buzz', 0.8, 2.3]],
  moderator: [['aim', 'alarm_loop', 0.35, 1.6]],
  stalker: [['chase', 'walkie_static', 0.55, 0.7], ['reveal', 'walkie_static', 0.4, 0.5], ['chase', 'breath_tired', 0.6, 1.2]],
  tamagotchi: [['morph', 'jester_scream', 0.5, 0.6]],
};
// the view hides these from everybody except the player whose id is in the creature's `extra`
const PRIVATE_TO_EXTRA = new Set(['stalker']);
// creatures whose model aims a part (tongue / arm) at the player whose id is in `extra`
const AIM_AT_EXTRA = new Set(['clickbait']);

const AFFIX_RING_GEO = new THREE.RingGeometry(0.72, 1, 24).rotateX(-Math.PI / 2);

function mimicDoorModel() {
  const root = new THREE.Group();
  let door = null;
  try { door = createProp('door_single', { seed: 13 }); } catch { /* ignore */ }
  if (door) root.add(door);
  // wall slab so it reads like a real fire exit set in the wall
  const slab = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.9, 0.12), new THREE.MeshLambertMaterial({ color: 0x3b3b38 }));
  slab.position.set(0, 1.45, -0.1);
  root.add(slab);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.35), new THREE.MeshBasicMaterial({ color: 0x55ff77 }));
  sign.position.set(0, 2.75, 0.02);
  root.add(sign);
  const eye = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.04), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
  eye.position.set(0, 1.2, 0.08);
  eye.visible = false;
  root.add(eye);
  let t = 0;
  return {
    root, parts: { head: root, eyes: [] }, height: 2.4, radius: 0.8,
    update(dt, anim) {
      t += dt;
      // subtle breathing & a sliver of red light
      root.scale.z = 1 + Math.sin(t * 1.3) * 0.02;
      eye.visible = anim.state === 'attack' || Math.sin(t * 0.7) > 0.93;
      if (anim.state === 'attack') root.rotation.z = Math.sin(t * 40) * 0.04;
      if (anim.state === 'dead') { root.rotation.x = Math.min(1.5, (anim.t || 0) * 2); }
    },
    setElite() {}, setHitFlash() {}, dispose() {},
  };
}

function webModel() {
  const root = new THREE.Group();
  let web = null;
  try { web = createProp('cobweb', { seed: 3 }); } catch { /* ignore */ }
  if (web) { web.scale.set(1.8, 1.4, 1.8); root.add(web); }
  else {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.2), new THREE.MeshBasicMaterial({ color: 0xdddddd, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
    m.position.y = 1.1; root.add(m);
  }
  return { root, parts: {}, height: 2, radius: 1.2, update() {}, setElite() {}, setHitFlash() {}, dispose() {} };
}

export class CreatureView {
  constructor(mgr, d) {
    this.mgr = mgr;
    this.id = d.id; this.type = d.ty;
    this.spawnData = d;   // kept for host migration (game/hostmig.js rebuilds a HostCreature from it)
    this.def = CREATURES[this.type] || { name: this.type, radius: 0.5, height: 1.5 };
    // behaviour variant + affix: shown through the display name (scan labels), tint, scale and a floor ring
    this.variant = variantOf(this.type, d.vr);
    this.affix = d.af && AFFIXES[d.af] ? d.af : null;
    this.tier = d.tr || null; this.fgAff = Array.isArray(d.fa) ? d.fa : null;   // [forge] tier + extra affixes (drawn by game/creature_tiers.js)
    if (this.variant || this.affix) this.def = { ...this.def, name: creatureDisplayName(this.type, d.vr, this.affix) };
    this.private = PRIVATE_TO_EXTRA.has(this.type);
    this.level = d.lv || 1; this.elite = !!d.el;
    this.maxHp = d.mh || null; this.hp = d.hp ?? this.maxHp;
    this.code = d.code || null;
    this.name = d.nm || null;
    this.pos = new THREE.Vector3().fromArray(d.p);
    this.target = this.pos.clone();
    this.yaw = d.yaw || 0; this.targetYaw = this.yaw;
    this.state = d.st || 'idle'; this.stateT = 0;
    this.extra = 0;
    this.alpha = 1;
    this.hitFlash = 0;
    this.showBar = 0;
    this.loops = new Map();
    try {
      if (this.type === 'mimicdoor') this.model = mimicDoorModel();
      else if (this.type === 'web') this.model = webModel();
      else if (window.__kefalMods?.creatureModels.has(this.type)) this.model = window.__kefalMods.creatureModels.get(this.type)(window.KefalAPI.THREE, { elite: this.elite, seed: d.seed || 1 });
      else this.model = createCreatureModel(this.def.model || this.type, { elite: this.elite, seed: d.seed || 1, suitColor: d.suit, variant: d.vr || null });
    } catch (e) {
      console.warn('creature model', this.type, e);
      const g = new THREE.Group();
      const m = new THREE.Mesh(new THREE.BoxGeometry(this.def.radius * 2, this.def.height, this.def.radius * 2), new THREE.MeshLambertMaterial({ color: 0x552222 }));
      m.position.y = this.def.height / 2; g.add(m);
      this.model = { root: g, parts: { head: m }, height: this.def.height, radius: this.def.radius, update() {}, setElite() {}, setHitFlash() {}, dispose() {} };
    }
    const vScale = this.variant?.scale || 1;
    if (this.def.modelScale || vScale !== 1) this.model.root.scale.setScalar((this.def.modelScale || 1) * vScale);
    this.root = this.model.root;
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
    if (d.up) this.root.rotation.z = Math.PI; // ceiling leech
    mgr.scene.add(this.root);
    this.radius = (this.model.radius ?? this.def.radius) * vScale;
    this.height = (this.model.height ?? this.def.height) * vScale;
    if (this.elite) this.model.setElite?.(true);
    // glow colour: affix colour wins over the variant tint (elite keeps its scale / red eyes when there is neither)
    const tint = this.affix ? AFFIXES[this.affix].color : this.variant?.tint;
    if (tint) this.model.setTint?.(tint, !!this.affix);
    this.ring = null;
    if (this.affix) {
      const rm = new THREE.MeshBasicMaterial({ color: AFFIXES[this.affix].color, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: true });
      this.ring = new THREE.Mesh(AFFIX_RING_GEO, rm);
      const r = Math.max(0.45, this.radius * 1.25);
      this.ring.scale.set(r, 1, r);
      this.ring.position.y = 0.04;
      this.ring.renderOrder = 2;
      mgr.scene.add(this.ring);
    }
    this.fuseT = -1;   // 'Hot Take' corpse blinking before it blows up (client-side telegraph)
    // mimic name tag
    if (this.type === 'mimic' && this.name) {
      const c = document.createElement('canvas'); c.width = 256; c.height = 64;
      const ctx = c.getContext('2d'); ctx.font = '28px VT323, monospace'; ctx.textAlign = 'center';
      ctx.fillStyle = '#b8ffcc'; ctx.fillText(this.name, 128, 30);
      ctx.font = '20px VT323, monospace'; ctx.fillStyle = '#ffd27a'; ctx.fillText('Lv.' + (d.fakeLv || 3), 128, 54);
      const tex = new THREE.CanvasTexture(c); tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, fog: false }));
      s.scale.set(1.1, 0.28, 1); s.position.y = 2.15; this.root.add(s);
      applyNameTagTitle(s, this.name, d.fakeLv || 3, d.ft);
    }
    this.materials = [];
    this.root.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => this.materials.push(m)); });
    this.startLoops();
  }

  // private creatures (Parasocial) are seen and heard only by the player whose id is in `extra`
  get hidden() {
    if (this.private) return this.extra !== this.mgr.game.selfId || this.state === 'hidden';
    if (this.type === 'dunemaw') return this.state === 'hidden' || this.state === 'rumble';   // buried: cannot be hit / scanned until it erupts
    return false;
  }
  audible() { return !this.private || this.extra === this.mgr.game.selfId; }

  startLoops() {
    // '*' loops, plus the loops tied to the state this view is created in (a view that spawns mid-state, e.g. a late
    // joiner's hidden / rumbling Worm, used to stay silent until the next state change)
    for (const [st, snd, vol, pitch] of LOOPS[this.type] || []) {
      if (st === '*' || st === this.state) this.setLoop(snd, vol, pitch);
    }
  }
  setLoop(snd, vol, pitch) {
    if (this.loops.has(snd) || !this.audible()) return;
    const h = this.mgr.game.audio.play(snd, { loop: true, follow: this.root, volume: vol, pitch, occlude: true, refDistance: 3, maxDistance: 45 });
    if (h) this.loops.set(snd, h);
  }
  stopLoop(snd) { const h = this.loops.get(snd); if (h) { h.stop(0.3); this.loops.delete(snd); } }

  setState(st) {
    if (st === this.state) return;
    const prev = this.state;
    this.state = st; this.stateT = 0;
    if (st === 'primed') this.fuseT = 0;   // bomb telegraph (blink + beeps), same as a 'Hot Take' corpse
    const sxOwn = this.mgr.game.sfx?.onState?.(this, prev, st) === 'own';   // [sfx] the procedural voice layer / sound pack took this event
    const s = sxOwn ? null : STATE_SOUNDS[this.type]?.[st];
    if (s && this.audible()) {
      const name = pickSound(this.mgr.game.audio, s[0]);
      if (name) this.mgr.game.audio.play(name, { follow: this.root, volume: s[1], pitch: s[2], occlude: true, refDistance: this.type === 'giant' ? 8 : 3, maxDistance: this.type === 'giant' ? 120 : 55 });
    }
    // loops tied to states
    const loops = LOOPS[this.type] || [];
    const wanted = new Set(loops.filter(([ls]) => ls === st || ls === '*').map((l) => l[1]));
    for (const [ls, snd, vol, pitch] of loops) {
      if (wanted.has(snd)) this.setLoop(snd, vol, pitch);
      else if (ls !== '*') this.stopLoop(snd);
    }
    this.mgr.game.onCreatureState?.(this, prev, st);
  }

  applySnap(s) {
    this.target.set(s[1], s[2], s[3]);
    this.targetYaw = s[4];
    const prevExtra = this.extra;
    this.extra = s[6] || 0;
    // a private creature switched victims: re-evaluate who hears its loops before the state change plays sounds
    if (this.private && prevExtra !== this.extra) { for (const h of this.loops.values()) h.stop(0.2); this.loops.clear(); this.state = null; }
    this.setState(s[5]);
    if (s[7] !== undefined && s[7] !== null) this.hp = s[7];
    if (this.pos.distanceToSquared(this.target) > 100) this.pos.copy(this.target);
  }

  update(dt) {
    this.stateT += dt;
    const fast = this.type === 'sandkefal' ? 30 : 12;
    this.pos.x = damp(this.pos.x, this.target.x, fast, dt);
    this.pos.y = damp(this.pos.y, this.target.y, fast, dt);
    this.pos.z = damp(this.pos.z, this.target.z, fast, dt);
    const prevYaw = this.yaw;
    this.yaw = dampAngle(this.yaw, this.targetYaw, 10, dt);
    const speed = V.copy(this.root.position).distanceTo(this.pos) / Math.max(dt, 1e-4);
    this.root.position.copy(this.pos);
    if (this.type !== 'leech' || this.state !== 'ceiling') this.root.rotation.y = this.yaw;
    if (this.type === 'leech') this.root.rotation.z = this.state === 'ceiling' ? Math.PI : 0;
    if (this.type === 'turret' && this.model.parts?.head) { this.model.parts.head.rotation.y = this.extra || 0; this.root.rotation.y = this.yaw; }
    const game = this.mgr.game;
    if (this.def.grownHeight && typeof this.extra === 'number') {      // Tamagotchi: the adult needs a bigger hit box
      const vs = this.variant?.scale || 1, grown = this.extra >= 1;
      this.height = (grown ? this.def.grownHeight : this.model.height ?? this.def.height) * vs;
      this.radius = (grown ? this.def.grownRadius : this.model.radius ?? this.def.radius) * vs;
    }
    let aim = null;
    if (AIM_AT_EXTRA.has(this.type) && typeof this.extra === 'string' && this.state !== 'dead') {
      const head = game.playerHeadById(this.extra);
      if (head) { this.root.updateMatrixWorld(); aim = this.root.worldToLocal(head.clone().add(V.set(0, -0.35, 0))); }
    }
    this.model.update(dt, { state: this.state, speed: Math.min(speed, 14), t: this.stateT, time: game.time, progress: typeof this.extra === 'number' ? this.extra : 0, aim });
    this.hitFlash = Math.max(0, this.hitFlash - dt * 4);
    // 'Hot Take' affix: the corpse blinks and beeps faster and faster until the host detonates it
    if (this.fuseT >= 0) {
      this.fuseT += dt;
      const rate = 3 + this.fuseT * 9;
      const blink = Math.sin(this.fuseT * rate * Math.PI) > 0 ? 0.9 : 0;
      this.hitFlash = Math.max(this.hitFlash, blink);
      this.beepT = (this.beepT ?? 0) - dt;
      if (this.beepT <= 0 && this.fuseT < 2) { this.beepT = 1 / rate * 2; game.audio.play('mine_beep', { follow: this.root, volume: 0.8, pitch: 1 + this.fuseT * 0.4, refDistance: 3, maxDistance: 35 }); }
    }
    this.model.setHitFlash?.(this.hitFlash);
    this.showBar = Math.max(0, this.showBar - dt);
    // private creatures: invisible (and silent) for everybody but their victim
    if (this.private) {
      const hide = this.hidden;
      this.root.visible = !hide;
      if (hide && this.loops.size) { for (const h of this.loops.values()) h.stop(0.2); this.loops.clear(); }
      // the victim's screen fills with static while it reveals itself / gives chase
      if (!hide && (this.state === 'reveal' || this.state === 'chase')) {
        const d = this.pos.distanceTo(game.player.pos);
        game.engine.fx.noise = Math.max(game.engine.fx.noise || 0, clamp(0.55 - d * 0.02, 0.12, 0.5) * (this.state === 'reveal' ? 0.7 : 1));
        this.staticOn = true;
      } else if (this.staticOn) { this.staticOn = false; game.engine.fx.noise = 0; }
    }
    // 'Shadowbanned' affix: fades out beyond a few metres
    if (this.affix === 'shadowbanned' && this.state !== 'dead') {
      const d = this.pos.distanceTo(game.camera.position);
      const a = clamp((11 - d) / 6, 0.07, 1);
      this.alpha = damp(this.alpha, a, 5, dt);
      // only per-instance materials (tinter clones): shared cached ones would fade every creature of the type
      for (const m of this.materials) { if (!m.userData?.instance) continue; m.transparent = true; m.opacity = this.alpha; m.depthWrite = this.alpha > 0.5; }
    }
    // floating prompt (Tamagotchi: "crouch to rock it") for players close by while it is in the hinted state
    const hint = this.def.hint;
    if (hint) {
      const show = this.state === hint.state && !game.player.dead && this.pos.distanceTo(game.player.pos) < hint.r;
      if (show && !this.hintSprite) this.hintSprite = makeHintSprite(hint.text);
      if (this.hintSprite) {
        this.hintSprite.visible = show;
        if (show) { if (this.hintSprite.parent !== this.mgr.scene) this.mgr.scene.add(this.hintSprite); this.hintSprite.position.set(this.pos.x, this.pos.y + this.height + 0.45 + Math.sin(game.time * 3) * 0.05, this.pos.z); }
      }
    }
    if (this.ring) {
      this.ring.visible = this.state !== 'dead' && !this.hidden && this.root.visible;
      this.ring.position.set(this.pos.x, this.pos.y + 0.04, this.pos.z);
      this.ring.material.opacity = (0.28 + 0.22 * Math.sin(game.time * 4 + this.pos.x)) * (this.affix === 'shadowbanned' ? this.alpha : 1);
    }
    // screamer visibility: nearly invisible unless lit by a flashlight
    if (this.type === 'screamer' && this.state !== 'dead') {
      const lit = this.mgr.game.isLitByFlashlight(this.pos, 16);
      const a = this.state === 'scream' ? 1 : lit ? 0.95 : 0.06;
      this.alpha = damp(this.alpha, a, 6, dt);
      for (const m of this.materials) { m.transparent = true; m.opacity = this.alpha; m.depthWrite = this.alpha > 0.5; }
    }
    // hidden sand kefal is invisible except its mound
    if (this.type === 'sandkefal') this.root.visible = true;
    // attached leech follows the victim's head
    if (this.type === 'leech' && this.state === 'latched' && this.extra) {
      const victim = this.mgr.game.playerHeadById(this.extra);
      if (victim) { this.root.position.copy(victim); this.root.position.y -= 0.2; this.pos.copy(this.root.position); }
    }
  }

  hitTest(origin, dir, maxDist) {
    if (this.hidden) return null;
    // ray vs vertical capsule (cylinder approx)
    const r = this.radius + 0.15;
    const h = this.type === 'leech' && this.state === 'ceiling' ? 0.6 : this.height;
    const y0 = this.state === 'ceiling' ? this.pos.y - 0.6 : this.pos.y;
    const ox = origin.x - this.pos.x, oz = origin.z - this.pos.z;
    const a = dir.x * dir.x + dir.z * dir.z;
    const b = 2 * (ox * dir.x + oz * dir.z);
    const c = ox * ox + oz * oz - r * r;
    let t;
    if (a < 1e-6) { if (c > 0) return null; t = 0; }
    else {
      const disc = b * b - 4 * a * c;
      if (disc < 0) return null;
      t = (-b - Math.sqrt(disc)) / (2 * a);
      if (t < 0) t = (-b + Math.sqrt(disc)) / (2 * a);
      if (t < 0) return null;
    }
    if (t > maxDist) return null;
    const y = origin.y + dir.y * t;
    if (y < y0 - 0.2 || y > y0 + h + 0.2) return null;
    return t;
  }

  dispose() {
    for (const h of this.loops.values()) h.stop(0.2);
    this.loops.clear();
    if (this.staticOn) { this.staticOn = false; this.mgr.game.engine.fx.noise = 0; }
    this.root.removeFromParent();
    if (this.ring) { this.ring.removeFromParent(); this.ring.material.dispose(); this.ring = null; }
    if (this.hintSprite) { this.hintSprite.removeFromParent(); this.hintSprite.material.map?.dispose(); this.hintSprite.material.dispose(); this.hintSprite = null; }
    this.model.dispose?.();
  }
}

function makeHintSprite(text) {
  let map = null;
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas'); c.width = 256; c.height = 40;
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'rgba(10,6,14,0.72)'; ctx.fillRect(0, 4, 256, 32);
    ctx.font = '22px VT323, monospace'; ctx.textAlign = 'center'; ctx.fillStyle = '#ffd27a'; ctx.fillText(t(text), 128, 27);
    map = new THREE.CanvasTexture(c); map.magFilter = THREE.NearestFilter; map.minFilter = THREE.NearestFilter;
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, fog: false, depthTest: false }));
  s.scale.set(1.6, 0.25, 1);
  s.renderOrder = 5;
  return s;
}

function pickSound(audio, s) {
  if (!Array.isArray(s)) return s;
  for (const n of s) if (audio?.has?.(n)) return n;
  return s[s.length - 1];
}

// ---------------------------------------------------------------------------------------------
// Host simulation
// ---------------------------------------------------------------------------------------------
class HostCreature {
  constructor(mgr, id, type, pos, opts) {
    this.mgr = mgr;
    this.id = id; this.type = type;
    this.level = opts.level || 1;
    this.elite = !!opts.elite;
    // variant / affix stat changes live on a per-creature copy of the def (behaviours read c.def.walk / run)
    this.variant = variantOf(type, opts.variant) ? opts.variant : null;
    this.affix = opts.affix && AFFIXES[opts.affix] ? opts.affix : null;
    const V0 = variantOf(type, this.variant), A0 = this.affix ? AFFIXES[this.affix] : null;
    this.def = V0 || A0 ? { ...CREATURES[type] } : CREATURES[type];
    const vs = V0?.speed || 1, as = A0?.speed || 1;
    if (vs !== 1) { this.def.walk *= vs; this.def.run *= vs; }
    // 'Viral': faster walk; the run is capped just above sprint speed so fast chargers stay outrunnable at corners
    if (as !== 1) { this.def.walk *= as; this.def.run = Math.max(this.def.run, Math.min(this.def.run * as, 9.5)); }
    const st = creatureLevelStats(this.def, this.level, this.elite, V0);
    // sector / threat scale (game.balance): HP is baked at spawn for EVERY creature type, mod creatures included
    const bs = mgr.game.balance?.scale(this.def.boss ? 'boss' : this.def.hazard ? 'hazard' : 'creature');
    if (bs && st.maxHp) st.maxHp = Math.max(1, Math.round(st.maxHp * bs.hp));
    // [forge] creature tier (game/creature_tiers.js): HP + XP multipliers ON TOP of the sector scale (bosses keep their hand-tuned stats)
    this.tier = opts.tier || null; this.fgAff = Array.isArray(opts.fa) ? opts.fa : null;
    if (this.tier && !this.def.boss) { if (st.maxHp) st.maxHp = Math.max(1, Math.round(st.maxHp * creatureTierMul(this.tier))); st.xp = Math.round(st.xp * creatureTierXp(this.tier)); }
    this.maxHp = st.maxHp; this.hp = st.maxHp;
    this.age = 0;           // s since spawn: no attacks during the first second (vent spawns, swarms)
    this.lastHurtT = -99;
    this.dmg = st.dmg; this.xp = st.xp; this.coin = st.coin;
    this.pos = pos.clone();
    this.home = pos.clone();
    this.yaw = opts.yaw ?? Math.random() * Math.PI * 2;
    this.state = opts.state || 'idle';
    this.t = 0;
    this.path = null; this.pathIdx = 0; this.repath = 0; this.dest = null;
    this.target = null;
    this.cooldown = 0;
    this.stunT = 0;
    this.zone = opts.zone || (this.def.zone === 'out' ? 'out' : 'in');
    this.data = { ...(opts.data || {}) };
    this.extra = opts.extra ?? 0;
    this.code = opts.code || null;
    this.disabledT = 0;
    this.dead = false;
    this.attackers = new Map();
    this.seed = opts.seed || Math.floor(Math.random() * 99999);
    this.name = opts.name || null;
    this.suit = opts.suit || null;
    this.up = !!opts.up;
  }
  setState(s) { if (s !== this.state) { this.state = s; this.t = 0; } }
}

const WANDER_TIME = [4, 9];
const NO_HUNT = new Set(['yoinker', 'leech', 'spider', 'sludge', 'mimicdoor', 'web', 'stalker', 'ticketswarm', 'editor']);   // guard a nest / lair, or have their own hunting rules

export class CreatureManager {
  constructor(game) {
    this.game = game;
    this.scene = game.engine.scene;
    this.views = new Map();
    this.host = new Map();
    this.nextId = 1;
    this.snapTimer = 0;
    this.noises = [];     // host: {pos, loud, t, zone, owner}
    this.pvel = new Map(); // host: player id -> { x, z, sp } smoothed horizontal speed (the Moderator sees movement)
  }
  // host timers die with the game (AGENTS.md gotcha); falls back to setTimeout for tools / tests
  later(fn, ms) { return this.game.later ? this.game.later(fn, ms) : setTimeout(fn, ms); }

  // ------------------------- shared (event application) -------------------------
  onEvent(d) {
    switch (d.e) {
      case 'sp': {
        if (this.views.has(d.id)) return;
        this.views.set(d.id, new CreatureView(this, d));
        break;
      }
      case 'rm': {
        const v = this.views.get(d.id); if (!v) return;
        v.dispose(); this.views.delete(d.id);
        break;
      }
      case 'hp': {
        const v = this.views.get(d.id); if (!v) return;
        v.hp = d.hp; v.hitFlash = 1; v.showBar = 4;
        if (d.dmg) this.game.sfx?.onHurt?.(v, d);   // [sfx]
        if (d.dmg && this.game.particles) {
          const pre = v.type === 'turret' || v.type === 'mine' || v.maxHp === null ? 'sparks' : v.type === 'sludge' ? 'goo' : v.type === 'mimicdoor' ? 'dust' : 'blood';
          const at = v.pos.clone(); at.y += (v.model?.height || 1.2) * 0.6;
          const bp = d.by && (d.by === this.game.selfId ? this.game.player.pos : this.game.remotes.get(d.by)?.pos);
          const dir = bp ? at.clone().sub(bp).setY(0.3).normalize() : null;
          this.game.particles.burst(at, pre, dir, d.crit ? 1.8 : 1);
        }
        if (d.dmg) this.game.onCreatureDamaged?.(v, d.dmg, d.crit, d.by);
        break;
      }
      case 'die': {
        const v = this.views.get(d.id); if (!v) return;
        v.hp = 0; v.setState('dead'); v.showBar = 0;
        if (d.fuse) v.fuseT = 0;
        if (this.game.particles && !v.hidden) { const at = v.pos.clone(); at.y += 0.8; this.game.particles.burst(at, v.type === 'sludge' ? 'goo' : v.type === 'turret' || v.type === 'mine' ? 'sparks' : 'death', null, v.elite ? 1.6 : 1); }
        this.game.onCreatureKilled?.(v, d);
        break;
      }
      case 'snd': {
        const v = this.views.get(d.id); if (!v) return;
        if (!v.audible()) break;
        if (d.clip) this.game.voice?.playClip(v.pos.clone().add(new THREE.Vector3(0, 1.6, 0)), d.clip);
        else this.game.audio.play(pickSound(this.game.audio, d.s), { follow: v.root, volume: d.v ?? 1, pitch: d.pt, occlude: true, refDistance: d.ref ?? 3, maxDistance: d.max ?? 60 });
        break;
      }
      default: break;
    }
  }
  applySnapshot(list) {
    for (const s of list) {
      const v = this.views.get(s[0]);
      if (v) v.applySnap(s);
    }
  }
  update(dt) {
    for (const v of this.views.values()) v.update(dt);
  }
  clearAll() {
    for (const v of this.views.values()) v.dispose();
    this.views.clear();
    this.host.clear();
    this.noises.length = 0;
    this.pvel.clear();
  }
  // client-side raycast against creature views
  raycast(origin, dir, maxDist, filter) {
    let best = null;
    for (const v of this.views.values()) {
      if (v.state === 'dead' && v.type !== 'mimicdoor') continue;
      if (filter && !filter(v)) continue;
      const t = v.hitTest(origin, dir, maxDist);
      if (t !== null && (!best || t < best.t)) best = { t, view: v };
    }
    return best;
  }

  // ------------------------- host -------------------------
  hostSpawn(type, pos, opts = {}) {
    const def = CREATURES[type];
    if (!def) return null;
    const id = opts.id || ('c' + (this.nextId++));   // opts.id: host migration re-creates a creature under its old id
    // host rolls (Math.random is fine: creatures are host-authoritative, not world generation)
    if (opts.variant === undefined && !def.hazard && !def.boss && !def.custom) {
      const list = VARIANTS[type];
      let v = null;
      if (list) { let r = Math.random() * 100; for (const e of list) { r -= e.w; if (r < 0) { v = e.id; break; } } }
      opts = { ...opts, variant: v };
    }
    if (this.game.forge) opts = this.game.forge.creatureOpts(type, opts);   // [forge] tier + extra affixes
    if (opts.affix === undefined) opts = { ...opts, affix: rollAffix(type, opts.level || 1, !!opts.elite) };
    const c = new HostCreature(this, id, type, pos, opts);
    c.fakeLv = opts.fakeLv; c.fakeTitle = opts.fakeTitle || '';   // disguise tag data, re-sent to late joiners by serializeFor
    this.host.set(id, c);
    this.game.net.broadcast('cev', {
      e: 'sp', id, ty: type, p: [pos.x, pos.y, pos.z], yaw: c.yaw, st: c.state, lv: c.level, el: c.elite,
      mh: c.maxHp, hp: c.hp, code: c.code, seed: c.seed, nm: c.name, suit: c.suit, up: c.up, fakeLv: opts.fakeLv, ft: opts.fakeTitle || undefined,
      vr: c.variant || undefined, af: c.affix || undefined, tr: c.tier || undefined, fa: c.fgAff || undefined,   // [forge]
    });
    return c;
  }
  hostRemove(id) {
    this.host.delete(id);
    this.game.net.broadcast('cev', { e: 'rm', id });
  }
  serializeFor() {
    const out = [];
    for (const c of this.host.values()) {
      out.push({ e: 'sp', id: c.id, ty: c.type, p: [c.pos.x, c.pos.y, c.pos.z], yaw: c.yaw, st: c.state, lv: c.level, el: c.elite, mh: c.maxHp, hp: c.hp, code: c.code, seed: c.seed, nm: c.name, suit: c.suit, up: c.up, fakeLv: c.fakeLv, ft: c.fakeTitle || undefined, vr: c.variant || undefined, af: c.affix || undefined, tr: c.tier || undefined, fa: c.fgAff || undefined });   // [forge]
    }
    return out;
  }
  snapshot() {
    const out = [];
    for (const c of this.host.values()) {
      out.push([c.id, +c.pos.x.toFixed(2), +c.pos.y.toFixed(2), +c.pos.z.toFixed(2), +c.yaw.toFixed(2), c.state, typeof c.extra === 'number' ? +c.extra.toFixed(2) : c.extra, typeof c.hp === 'number' ? Math.round(c.hp * 10) / 10 : c.hp]);
    }
    return out;
  }
  noise(pos, loud, owner = null) {
    this.game.balance?.onNoise?.(loud);   // every noise event also feeds the Threat meter
    this.noises.push({ pos: pos.clone ? pos.clone() : new THREE.Vector3(pos.x, pos.y, pos.z), loud, t: 0, owner });
  }
  // s: sound name or fallback list; pt: pitch; max: max distance
  sound(c, s, v = 1, ref, pt, max) { this.game.net.broadcast('cev', { e: 'snd', id: c.id, s, v, ref, pt, max }); }

  // damage from a player (host)
  damage(id, amount, by, opts = {}) {
    const c = this.host.get(id);
    if (!c || c.dead) return;
    // bosses walking home after a leash reset evade everything (MMO evade: no damage, no stun, no re-aggro)
    if (c.data.evade) { if (amount > 0) this.game.net.broadcast('cev', { e: 'hp', id, hp: c.hp, dmg: 0, by }); return; }
    if (opts.stun) { c.stunT = Math.max(c.stunT, opts.stun); if (c.type !== 'mine' && c.type !== 'turret') c.setState('stunned'); }
    if (c.maxHp === null) {
      if (c.type === 'turret' && amount > 0) { c.disabledT = Math.max(c.disabledT, 3); }
      if (amount > 0) this.game.net.broadcast('cev', { e: 'hp', id, hp: null, dmg: 0, by });
      ON_HURT[c.type]?.(c, amount, by, this, opts);
      return;
    }
    const armor = c.affix ? AFFIXES[c.affix].armor || 0 : 0;
    if (armor) amount *= 1 - armor;
    c.hp = Math.max(0, c.hp - amount);
    c.lastHurtT = this.game.time || 0;
    // 'by' can be a pseudo source ('explosion', 'stun', 'cruiser'...): only real players get aggro / kill credit
    const fromPlayer = typeof by === 'string' && !!this.game.aiPlayerById?.(by);
    if (fromPlayer) c.attackers.set(by, (c.attackers.get(by) || 0) + amount);
    this.game.net.broadcast('cev', { e: 'hp', id, hp: c.hp, dmg: Math.round(amount), crit: !!opts.crit, by });
    // aggro onto attacker
    if (fromPlayer && (!c.target || Math.random() < 0.6)) c.target = by;
    // one-shot aggro marker: chasers hit from outside their FOV turn and chase (consumed by the behaviour, so a
    // stun delays it instead of being overridden)
    if (fromPlayer) { c.data.hitBy = by; c.data.hitAt = this.game.time || 0; if (c.type === 'spider') c.data.alarm = by; }
    if (c.type === 'yoinker') c.data.angry = 14;
    if (c.type === 'lurker') c.data.anger = (c.data.anger || 0) + 3;
    if (c.type === 'mimicdoor') c.setState('attack');
    if (c.hp > 0 && (fromPlayer || amount > 0)) ON_HURT[c.type]?.(c, amount, by, this, opts);
    if (c.hp <= 0) this.kill(c, by);
  }

  kill(c, by, opts = {}) {
    if (c.dead) return;
    c.dead = true;
    if (c.type === 'leech' && c.extra) { this.game.hostLatch(c, c.extra, false); c.extra = 0; }
    c.setState('dead');
    const fuse = !opts.silent && c.affix === 'hottake';
    this.game.net.broadcast('cev', { e: 'die', id: c.id, by: opts.silent ? null : by, xp: opts.silent ? 0 : c.xp, coin: opts.silent ? 0 : c.coin, ty: c.type, lv: c.level, el: c.elite, attackers: [...c.attackers.keys()], fuse: fuse || undefined });
    if (!opts.silent) {
      this.game.hostOnCreatureKilled?.(c, by);
      // drop an item
      const d = c.def.drop;
      if (d && Math.random() < d[1] * (c.elite ? 2 : 1)) {
        this.game.items.hostSpawn(d[0], c.pos.clone().add(new THREE.Vector3(0, 0.6, 0)), { valueMul: 1 + (c.level - 1) * 0.08, ...this.game.forge?.dropOpts?.(c) });   // [forge] item tier floor (Rare+ creatures)
      }
      if (c.type === 'mimic' && Math.random() < 0.6) this.game.hostSpawnRandomScrap(c.pos.clone().add(new THREE.Vector3(0, 0.6, 0)));
      try { ON_DEATH[c.type]?.(c, by, this); } catch (e) { console.error('death', c.type, e); }
      // 'Hot Take': the corpse blinks (client telegraph) and detonates 1.6 s later
      if (fuse) { const at = c.pos.clone().add(new THREE.Vector3(0, 0.4, 0)); this.later(() => this.blast(at, 3.6, Math.max(25, Math.round(c.dmg * 0.8)), c.id, 'explosion'), 1600); }
    }
    if (c.type === 'yoinker' && c.data.carry) { this.game.hostCreatureDropItem(c); }
    this.later(() => { if (this.host.get(c.id) === c) this.hostRemove(c.id); }, c.type === 'web' ? 300 : opts.silent ? 1800 : 25000);
  }

  // Host explosion that hurts players only (creature bombs: Pop-up Ad Bot, Hot Take, rockets). LOS-checked, falloff.
  blast(pos, radius, dmg, sourceId, cause = 'explosion') {
    const g = this.game;
    g.net.broadcast('fx', { k: 'explode', p: [+pos.x.toFixed(2), +pos.y.toFixed(2), +pos.z.toFixed(2)] });
    this.noise(pos, 3.5);
    const from = V2.copy(pos); from.y += 0.3;
    for (const p of g.aiPlayers()) {
      if (p.dead || p.inShip) continue;
      const d = p.pos.distanceTo(pos);
      if (d > radius) continue;
      if (!g.physics.lineOfSight(from, p.eye) && !g.physics.lineOfSight(from, V.set(p.pos.x, p.pos.y + 0.4, p.pos.z))) continue;
      g.hostHurtPlayer(p.id, Math.round(dmg * (1 - 0.6 * (d / radius))), cause, sourceId, pos);
    }
  }

  // Fairness: nobody is one-shot right at the facility's main entrance or next to the ship.
  nearSafeZone(p) {
    const w = this.game.world;
    if (p.zone === 'in') {
      const e = w.facility?.mainDoor?.pos;
      return !!e && Math.abs(p.pos.y - e.y) < 4 && Math.hypot(p.pos.x - e.x, p.pos.z - e.z) < 12;
    }
    if (Math.hypot(p.pos.x, p.pos.z) < 18) return true;
    const x = w.outdoor?.mainExit?.pos;
    return !!x && Math.hypot(p.pos.x - x.x, p.pos.z - x.z) < 10;
  }
  playerSpeed(p) { return this.pvel.get(p.id)?.sp || 0; }

  // ---- perception helpers ----
  playersFor(c) { return this.game.aiPlayers().filter((p) => !p.dead && (c.zone === 'any' || p.zone === c.zone)); }
  eye(c) { return V2.set(c.pos.x, c.pos.y + Math.min(c.def.height * 0.8, 2.2), c.pos.z); }
  canSee(c, p, range = 20, fovDeg = 70) {
    const e = this.eye(c).clone();
    const d = e.distanceTo(p.eye);
    let r = range * (p.flash ? 1.4 : 1) * (p.crouch ? 0.6 : 1) * this.detectMul(c);
    if (d > r) return false;
    if (fovDeg < 180) {
      const ang = Math.atan2(-(p.pos.x - c.pos.x), -(p.pos.z - c.pos.z));
      const fwdAng = c.yaw + Math.PI; // model faces +z; yaw convention: facing (sin(yaw),cos(yaw))
      const a = Math.abs(angleDiff(Math.atan2(p.pos.x - c.pos.x, p.pos.z - c.pos.z), c.yaw));
      if (a > (fovDeg * Math.PI) / 360 && d > 2.5) return false;
      void ang; void fwdAng;
    }
    return this.game.physics.lineOfSight(e, p.eye);
  }
  // Is a player looking at this creature (for mannequin / lurker)?
  isLookedAt(c, p, maxDist = 40, cone = 0.78) {
    const target = V.set(c.pos.x, c.pos.y + c.def.height * 0.6, c.pos.z);
    const d = target.distanceTo(p.eye);
    if (d > maxDist) return false;
    const dir = target.clone().sub(p.eye).normalize();
    if (dir.dot(p.look) < cone) return false;
    return this.game.physics.lineOfSight(p.eye, target);
  }
  // ---- balance (game.balance): detection, speed, wandering towards the crew, all in the generic paths ----
  balanceKind(c) { return c.def.boss ? 'boss' : c.def.hazard ? 'hazard' : 'creature'; }
  detectMul(c) { const B = this.game.balance; return B ? B.scale(this.balanceKind(c)).detect : 1; }
  speedMul(c, speed) {
    const B = this.game.balance;
    if (!B) return speed;
    const kind = this.balanceKind(c);
    speed *= B.scale(kind).speed;
    const cap = kind === 'creature' ? B.speedCap() : 0;   // early sectors: nothing outruns a sprinting player
    return cap ? Math.min(speed, cap) : speed;
  }
  nearest(c, list, maxD = 1e9) {
    let best = null, bd = maxD;
    for (const p of list) { const d = p.pos.distanceTo(c.pos); if (d < bd) { bd = d; best = p; } }
    return best ? { p: best, d: bd } : null;
  }
  hear(c, radius) {
    radius *= this.detectMul(c);
    let best = null, bl = 0;
    const acoustic = this.game.stealth?.hearDist;   // [stealth] walls and closed doors muffle sound (nav-grid line count)
    for (const n of this.noises) {
      const d0 = n.pos.distanceTo(c.pos);
      if (n.loud * radius - d0 <= 0) continue;
      const d = acoustic ? acoustic(n.pos, c.pos, c, d0) : d0;
      const heard = n.loud * radius - d;
      if (heard > 0 && heard > bl) { bl = heard; best = n; }
    }
    return best;
  }

  // ---- movement ----
  nav(c) { return c.zone === 'in' ? this.game.world.facility?.nav : null; }
  goTo(c, x, z) {
    c.dest = new THREE.Vector3(x, c.pos.y, z);
    const nav = this.nav(c);
    if (nav) {
      const found = nav.findPath(c.pos.x, c.pos.z, x, z);
      c.path = found || null;
      c.pathIdx = 0;
      c.repath = found ? 0.8 + Math.random() * 0.4 : 1.5 + Math.random();   // unreachable target: back off instead of re-running A* every timer
      return;
    } else c.path = [{ x, z }];
    c.repath = 0.8 + Math.random() * 0.4;
  }
  // goTo for per-tick stimuli (noise): keeps the current path while the goal moved less than `tol` metres,
  // so a creature hearing continuous footsteps does not run A* every frame
  goToLazy(c, x, z, tol = 2) {
    if (c.dest && Math.hypot(c.dest.x - x, c.dest.z - z) < tol && ((c.path && c.pathIdx < c.path.length) || (!c.path && c.repath > 0))) return;   // (2nd: the last search failed, wait)
    this.goTo(c, x, z);
  }
  wander(c, radius = 14) {
    // Threat: the higher the meter, the more often an idle creature wanders TOWARDS a crewmate (never for nest / ambush / trap types)
    const B = this.game.balance;
    if (B && !c.def.hazard && !c.def.noHunt && !NO_HUNT.has(c.type)) {
      const hunt = B.scale(this.balanceKind(c)).hunt;
      if (hunt > 0 && Math.random() < hunt) {
        const near = this.nearest(c, this.playersFor(c).filter((p) => !p.inShip), 70);
        if (near) { this.goTo(c, near.p.pos.x + (Math.random() - 0.5) * 6, near.p.pos.z + (Math.random() - 0.5) * 6); return; }
      }
    }
    const nav = this.nav(c);
    if (nav) {
      const p = nav.randomWalkable(Math.random, c.pos.x, c.pos.z, radius);
      if (p) this.goTo(c, p.x, p.z);
    } else {
      const a = Math.random() * Math.PI * 2, r = 6 + Math.random() * radius;
      let x = c.pos.x + Math.cos(a) * r, z = c.pos.z + Math.sin(a) * r;
      const lim = this.game.world.terrain?.playHalf ?? 130;   // generated big moons are up to 1.5x wider
      x = clamp(x, -lim, lim); z = clamp(z, -lim, lim);
      if (Math.hypot(x, z) < 14) { x *= 2; z *= 2; }
      this.goTo(c, x, z);
    }
  }
  // follow current path; returns true when arrived
  follow(c, dt, speed, turnRate = 8) {
    if (!c.path || c.pathIdx >= c.path.length) return true;
    speed = this.speedMul(c, speed);
    const wp = c.path[c.pathIdx];
    const dx = wp.x - c.pos.x, dz = wp.z - c.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.35) { c.pathIdx++; return c.pathIdx >= c.path.length; }
    const want = Math.atan2(dx, dz);
    c.yaw += clamp(angleDiff(c.yaw, want), -turnRate * dt, turnRate * dt);
    const facing = Math.abs(angleDiff(c.yaw, want)) < 1.2 ? 1 : 0.3;
    const step = Math.min(d, speed * dt * facing);
    const nx = c.pos.x + (dx / d) * step, nz = c.pos.z + (dz / d) * step;
    this.placeAt(c, nx, nz);
    this.openDoorsNear(c);
    return false;
  }
  placeAt(c, x, z) {
    c.pos.x = x; c.pos.z = z;
    if (c.zone === 'out' || (c.zone === 'any' && c.pos.y > -200)) {
      const terr = this.game.world.terrain;
      if (terr) c.pos.y = terr.heightAt(x, z);
      const r = Math.hypot(c.pos.x, c.pos.z);
      // keep out of the ship
      if (r < 9) { c.pos.x *= 9 / r; c.pos.z *= 9 / r; }
    } else if (c.type !== 'leech') {
      c.pos.y = this.game.world.facility?.layout.y ?? c.pos.y;
    }
  }
  moveToward(c, target, dt, speed, turnRate = 8) {
    c.repath -= dt;
    // (a failed search leaves path null: retry on the repath timer, not every frame; flat distance so slopes
    // and the player's eye/feet height never force a re-path)
    if (c.repath <= 0 || (!c.path && !c.dest) || (c.dest && Math.hypot(c.dest.x - target.x, c.dest.z - target.z) > 2.5)) this.goTo(c, target.x, target.z);
    return this.follow(c, dt, speed, turnRate);
  }
  openDoorsNear(c) {
    const fac = this.game.world.facility;
    if (!fac || c.zone === 'out') return;
    for (const d of fac.doors) {
      if (d.open || d.locked || d.kind !== 'door') continue;
      if (d.pos.distanceToSquared(c.pos) < 2.5 * 2.5) this.game.hostSetDoor(d.id, true, true);
    }
  }
  attack(c, p, dmg, cause) {
    if (c.age < 1) return;                                     // spawn grace
    if (dmg >= 999 && this.nearSafeZone(p)) dmg = 70;          // never an instant death at the entrance / ship
    const leech = c.affix ? AFFIXES[c.affix].leech : 0;       // 'Monetized': heals on every hit
    if (leech && c.maxHp && c.hp < c.maxHp) c.hp = Math.min(c.maxHp, c.hp + leech);
    this.game.hostHurtPlayer(p.id, dmg, cause || c.type, c.id, c.pos);
  }

  // ------------------------- host tick -------------------------
  hostUpdate(dt) {
    for (const n of this.noises) n.t += dt;
    this.noises = this.noises.filter((n) => n.t < 1.2);
    // player-generated noise (footsteps, voice)
    for (const p of this.game.aiPlayers()) {
      if (p.dead) continue;
      const loud = Math.max(p.noise || 0, (p.voice || 0) * 0.8);
      if (loud > 0.08) this.noises.push({ pos: p.pos.clone(), loud, t: 0.9, owner: p.id, zone: p.zone });
      // smoothed horizontal speed per player (teleports ignored)
      let s = this.pvel.get(p.id);
      if (!s) { s = { x: p.pos.x, z: p.pos.z, sp: 0 }; this.pvel.set(p.id, s); }
      if (dt > 0) {
        const inst = Math.hypot(p.pos.x - s.x, p.pos.z - s.z) / dt;
        s.sp += ((inst > 30 ? 0 : inst) - s.sp) * Math.min(1, dt * 6);
      }
      s.x = p.pos.x; s.z = p.pos.z;
    }
    const now = this.game.time || 0;
    for (const c of this.host.values()) {
      if (c.dead) { c.t += dt; continue; }
      c.t += dt;
      c.age += dt;
      c.cooldown = Math.max(0, c.cooldown - dt);
      // 'Evergreen': regenerates when it has not been hit for 3 s
      if (c.affix === 'evergreen' && c.maxHp && c.hp < c.maxHp && now - c.lastHurtT > 3) c.hp = Math.min(c.maxHp, c.hp + c.maxHp * AFFIXES.evergreen.regen * dt);
      if (c.stunT > 0) {
        c.stunT -= dt;
        if (c.stunT <= 0 && c.state === 'stunned') c.setState('idle');
        continue;
      }
      const beh = BEHAVIORS[c.type] || CREATURES[c.type]?.behavior || BEHAVIORS.scuttler;
      try { beh(c, dt, this); } catch (e) { console.error('AI', c.type, e); }
    }
    this.snapTimer -= dt;
    if (this.snapTimer <= 0 && this.host.size) {
      this.snapTimer = 1 / 12;
      const snap = this.snapshot();
      this.game.net.sendRows('cs', snap, { eps: 0.02 });   // delta rows + 1.5 s keyframes (net/session.js)
      this.applySnapshot(snap);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Behaviors (host)
// ---------------------------------------------------------------------------------------------
export function chaser({ sight = 14, fov = 110, hearR = 16, reach = 1.4, cd = 1.2, leash = 18 } = {}) {
  return (c, dt, M) => {
    const players = M.playersFor(c);
    const def = c.def;
    if (c.state === 'idle' || c.state === 'walk') {
      if (takeAggro(c, players, M)) return;
      if (c.state === 'idle' && c.t > 1 + Math.random() * 3) { M.wander(c); c.setState('walk'); }
      if (c.state === 'walk' && M.follow(c, dt, def.walk)) c.setState('idle');
      for (const p of players) if (M.canSee(c, p, sight, fov)) { c.target = p.id; c.setState('run'); c.lostT = 0; return; }
      const n = M.hear(c, hearR);
      if (n && c.state !== 'run') { M.goToLazy(c, n.pos.x, n.pos.z); c.setState('walk'); }
      return;
    }
    if (c.state === 'run' || c.state === 'attack') {
      const p = players.find((q) => q.id === c.target);
      if (!p || p.inShip) { c.target = null; c.setState('idle'); return; }
      const d = p.pos.distanceTo(c.pos);
      if (M.canSee(c, p, sight * 1.6, 360)) c.lostT = 0; else c.lostT = (c.lostT || 0) + dt;
      if (c.lostT > 6 || d > leash * 1.8) { c.target = null; c.setState('idle'); return; }
      if (d < reach && Math.abs(p.pos.y - c.pos.y) < 2.2) {
        c.yaw = Math.atan2(p.pos.x - c.pos.x, p.pos.z - c.pos.z);
        if (c.cooldown <= 0) { c.setState('attack'); c.cooldown = cd; M.attack(c, p, c.dmg); }
        else if (c.state === 'attack' && c.t > 0.5) c.setState('run');
        return;
      }
      if (c.state === 'attack' && c.t < 0.4) return;
      c.setState('run');
      M.moveToward(c, p.pos, dt, def.run);
    }
  };
}

const scuttlerChase = chaser({ sight: 12, hearR: 14, reach: 1.1, cd: 1.0 });
const hunterSpiderChase = chaser({ sight: 18, fov: 140, reach: 1.6, cd: 1.2, leash: 26 });
const spiderChase = chaser({ sight: 14, reach: 1.6, cd: 1.3, leash: 16 });

export const BEHAVIORS = {
  scuttler: (c, dt, M) => {
    // 'Pop-up Ad Bot' variant: stops next to you, blinks + beeps for a second (telegraph), then pops
    if (c.variant === 'popup') {
      if (c.state === 'primed') {
        if (c.t >= 1.05) { M.blast(V.copy(c.pos).setY(c.pos.y + 0.3).clone(), 2.8, Math.round(20 + c.level * 2), c.id, 'explosion'); M.kill(c, null, { silent: true }); }
        return;
      }
      if (c.state === 'run' && c.age > 1.5) {
        const p = M.game.aiPlayerById(c.target);
        if (p && !p.dead && p.pos.distanceTo(c.pos) < 2.3) { c.setState('primed'); M.sound(c, 'mine_click', 1, 3, 1.3); return; }
      }
    }
    scuttlerChase(c, dt, M);
  },
  spider: (c, dt, M) => {
    // 'Hunter Spider' variant: no webs, roams and hunts
    if (c.variant === 'hunter') {
      if (c.state === 'idle' && c.t > 2) { M.wander(c, 16); c.setState('walk'); return; }
      hunterSpiderChase(c, dt, M);
      return;
    }
    // ambusher: waits near lair, triggered by webs or proximity
    if (!c.data.webs) {
      c.data.webs = true;
      const nav = M.nav(c);
      for (let k = 0; k < 2 && nav; k++) {
        const p = nav.randomWalkable(Math.random, c.pos.x, c.pos.z, 6);
        if (p) M.hostSpawn('web', new THREE.Vector3(p.x, c.pos.y, p.z), { data: { owner: c.id } });
      }
    }
    if (c.data.alarm) { const p = M.game.aiPlayerById(c.data.alarm); c.data.alarm = null; if (p) { c.target = p.id; c.setState('run'); } }
    if (c.state === 'idle' || c.state === 'walk') {
      const near = M.nearest(c, M.playersFor(c), 8);
      if (near && M.canSee(c, near.p, 8, 200)) { c.target = near.p.id; c.setState('run'); return; }
      if (c.state === 'idle' && c.t > 6 + Math.random() * 8) { M.goTo(c, c.home.x + (Math.random() - 0.5) * 8, c.home.z + (Math.random() - 0.5) * 8); c.setState('walk'); }
      if (c.state === 'walk' && M.follow(c, dt, c.def.walk)) c.setState('idle');
      return;
    }
    spiderChase(c, dt, M);
    if (c.state === 'idle') { M.goTo(c, c.home.x, c.home.z); c.setState('walk'); }
  },
  crawler: (c, dt, M) => {
    const players = M.playersFor(c);
    if (c.state === 'idle' || c.state === 'walk') {
      if (takeAggro(c, players, M)) { c.data.spd = 3; return; }
      if (c.state === 'idle' && c.t > 2) { M.wander(c, 18); c.setState('walk'); }
      if (c.state === 'walk' && M.follow(c, dt, c.def.walk)) c.setState('idle');
      for (const p of players) if (M.canSee(c, p, 20, 120)) { c.target = p.id; c.setState('run'); c.data.spd = 3; return; }
      return;
    }
    const p = players.find((q) => q.id === c.target);
    if (!p || p.inShip) { c.target = null; c.lostT = 0; c.setState('idle'); return; }
    c.data.spd = Math.min(c.def.run, (c.data.spd || 3) + dt * 6);
    const seen = M.canSee(c, p, 26, 360);
    c.lostT = seen ? 0 : (c.lostT || 0) + dt;
    if (c.lostT > 5) { c.target = null; c.lostT = 0; c.setState('idle'); return; }
    const d = p.pos.distanceTo(c.pos);
    if (d < 1.6 && c.cooldown <= 0) { c.setState('attack'); c.cooldown = 1.4; M.attack(c, p, c.dmg); c.data.spd = 2; return; }
    if (c.state === 'attack' && c.t < 0.5) return;
    c.setState('run');
    // poor turning when fast
    const turn = c.data.spd > 7 ? (c.variant === 'deep' ? 2.4 : 1.4) : 6;
    const arrived = M.moveToward(c, p.pos, dt, c.data.spd, turn);
    const want = Math.atan2(p.pos.x - c.pos.x, p.pos.z - c.pos.z);
    if (Math.abs(angleDiff(c.yaw, want)) > 1.2) c.data.spd = Math.max(2, c.data.spd - dt * 12); // overshoot at corners
    void arrived;
  },
  yoinker: (c, dt, M) => {
    const g = M.game;
    c.data.angry = Math.max(0, (c.data.angry || 0) - dt);
    if (!c.data.nest) c.data.nest = c.home.clone();
    const players = M.playersFor(c);
    // anger triggers: someone near the nest holding nest items, or took items
    const nestR = c.variant === 'feral' ? 7 : 5, nestWait = c.variant === 'feral' ? 2 : 4;
    for (const p of players) {
      if (p.pos.distanceTo(c.data.nest) < nestR && c.pos.distanceTo(c.data.nest) < 10) { c.data.nestT = (c.data.nestT || 0) + dt; if (c.data.nestT > nestWait) { c.data.angry = 12; c.target = p.id; } }
      if (p.heldNest && p.heldNest.includes(c.id)) { c.data.angry = 12; c.target = p.id; }
    }
    if (c.data.angry > 0) {
      const p = players.find((q) => q.id === c.target) || M.nearest(c, players, 20)?.p;
      if (!p) { c.data.angry = 0; return; }
      if (c.data.carry) g.hostCreatureDropItem(c);
      const d = p.pos.distanceTo(c.pos);
      if (d < 1.3 && c.cooldown <= 0) { c.setState('attack'); c.cooldown = 0.9; M.attack(c, p, c.dmg); return; }
      c.setState('run');
      M.moveToward(c, p.pos, dt, c.def.run);
      return;
    }
    // hoarding loop
    if (c.data.carry) {
      if (c.state !== 'fly') c.setState('fly');
      if (M.moveToward(c, c.data.nest, dt, c.def.walk * 1.3)) { g.hostCreatureDropItem(c, true); c.setState('idle'); }
      return;
    }
    if (c.state === 'idle' && c.t > 3) {
      const item = g.hostFindLooseScrap(c.pos, 22, c);
      if (item && !(c.data.bad || []).includes(item.id)) {
        c.data.want = item.id; M.goTo(c, item.obj.position.x, item.obj.position.z);
        if (!c.path) { (c.data.bad = c.data.bad || []).push(item.id); c.data.want = null; M.wander(c, 12); }
        c.setState('walk');
      }
      else { M.wander(c, 12); c.setState('walk'); }
      if (Math.random() < 0.4) M.sound(c, 'yoinker_yippee', 0.8);
    }
    if (c.state === 'walk') {
      const arrived = M.follow(c, dt, c.def.walk);
      if (c.data.want) {
        const it = g.items.get(c.data.want);
        if (!it || it.state !== 'world') { c.data.want = null; c.setState('idle'); return; }
        if (it.obj.position.distanceTo(c.pos) < 1.4) { g.hostCreatureTakeItem(c, it); c.data.want = null; return; }
      }
      if (arrived) c.setState('idle');
    }
  },
  lurker: (c, dt, M) => {
    const players = M.playersFor(c);
    c.data.anger = c.data.anger || 0;
    if (!players.length) { if (c.state !== 'idle') c.setState('idle'); return; }
    let tgt = players.find((q) => q.id === c.target);
    if (!tgt) { tgt = M.nearest(c, players)?.p; c.target = tgt?.id; }
    if (!tgt) return;
    const d = tgt.pos.distanceTo(c.pos);
    const watched = players.some((p) => M.isLookedAt(c, p, 25, 0.82));
    if (!watched) c.data.anger = Math.max(0, c.data.anger - dt * 0.15);
    if (c.state === 'angry') {
      if (d < 1.4) { c.setState('attack'); M.attack(c, tgt, 999, 'lurker'); c.data.anger = 0; c.data.fleeT = 8; return; }
      M.moveToward(c, tgt.pos, dt, c.def.run);
      if (c.t > 14) { c.data.anger = 0; c.setState('flee'); c.data.fleeT = 5; }   // calm down (no instant re-anger)
      return;
    }
    if (c.state === 'attack') { if (c.t > 1.5) c.setState('flee'); return; }
    // stares build anger in EVERY state (also while it flees): it used to grow only on the one tick before fleeing
    if (watched) {
      c.data.anger += dt * (c.variant === 'obsessed' ? 3 : 1.6);
      if (c.data.anger > 6 && d < 18) { c.setState('angry'); return; }
    }
    if (watched && c.state !== 'flee') {
      c.setState('flee');
      const nav = M.nav(c);
      const away = nav?.randomWalkable(Math.random, c.pos.x + (c.pos.x - tgt.pos.x) * 1.5, c.pos.z + (c.pos.z - tgt.pos.z) * 1.5, 8);
      if (away) M.goTo(c, away.x, away.z);
      c.data.fleeT = 4 + Math.random() * 3;
      return;
    }
    if (c.state === 'flee') {
      c.data.fleeT = (c.data.fleeT || 3) - dt;
      if (M.follow(c, dt, c.def.run) || c.data.fleeT <= 0) c.setState('sneak');
      return;
    }
    // sneak up behind the target, staying out of view
    c.setState('sneak');
    if (d < 1.3 && !watched) { c.setState('attack'); M.attack(c, tgt, 999, 'lurker'); c.data.anger = 0; c.data.fleeT = 10; return; }
    const behind = tgt.pos.clone().addScaledVector(tgt.look.clone().setY(0).normalize(), -1.2);
    M.moveToward(c, d > 9 ? tgt.pos : behind, dt, d > 9 ? c.def.walk * 1.4 : c.def.walk);
  },
  mannequin: (c, dt, M) => {
    const players = M.playersFor(c);
    const watched = players.some((p) => M.isLookedAt(c, p, 45, 0.72));
    if (watched || !players.length) { if (c.state !== 'idle') c.setState('idle'); return; }
    const n = M.nearest(c, players);
    if (!n || n.p.inShip) return;
    if (n.d < 1.2 && c.cooldown <= 0) { c.cooldown = 0.6; M.attack(c, n.p, c.dmg); }
    c.setState('run');
    M.moveToward(c, n.p.pos, dt, c.def.run, 20);
    if (Math.random() < dt * 0.8) M.sound(c, 'mannequin_step', 0.9);
  },
  sludge: (c, dt, M) => {
    const players = M.playersFor(c);
    const music = M.game.hostBoomboxNear(c.pos, 14);
    if (music) { c.setState('calm'); c.data.calm = true; return; }
    if (c.state === 'calm') c.setState('idle');
    const n = M.nearest(c, players, 26);
    if (!n) { if (c.state === 'idle' && c.t > 5) { M.wander(c, 8); c.setState('walk'); } if (c.state === 'walk' && M.follow(c, dt, c.def.walk * 0.6)) c.setState('idle'); return; }
    c.setState('walk');
    M.moveToward(c, n.p.pos, dt, n.d < 6 ? c.def.run : c.def.walk);
    for (const p of players) {
      if (p.pos.distanceTo(c.pos) < c.def.radius + 0.6 && c.cooldown <= 0) { c.cooldown = 0.5; M.attack(c, p, Math.round(c.dmg * 0.5), 'sludge'); }
    }
  },
  jester: (c, dt, M) => {
    const players = M.playersFor(c);
    if (!players.length) {
      c.data.empty = (c.data.empty || 0) + dt;
      if (c.data.empty > 8 && c.state !== 'box') { c.setState('box'); c.data.timer = 60 + Math.random() * 60; }
      return;
    }
    c.data.empty = 0;
    if (c.data.timer === undefined) c.data.timer = 50 + Math.random() * 70;
    if (c.state === 'box' || c.state === 'box_walk' || c.state === 'idle') {
      c.data.timer -= dt;
      const n = M.nearest(c, players);
      if (n && n.d > 6) { c.setState('box_walk'); M.moveToward(c, n.p.pos, dt, c.def.walk); } else c.setState('box');
      if (c.data.timer <= 0) { c.setState('winding'); c.data.wind = 15 + Math.random() * 20; }
      return;
    }
    if (c.state === 'winding') {
      c.extra = Math.min(1, c.t / c.data.wind);
      if (c.t >= c.data.wind) c.setState('popped');
      return;
    }
    if (c.state === 'popped') { if (c.t > 1.2) c.setState('run'); return; }
    if (c.state === 'run') {
      const n = M.nearest(c, players);
      if (!n) return;
      if (n.d < 1.3) M.attack(c, n.p, 999, 'jester');
      M.moveToward(c, n.p.pos, dt, c.def.run, 12);
    }
  },
  leech: (c, dt, M) => {
    const g = M.game;
    if (c.state === 'ceiling') {
      for (const p of M.playersFor(c)) {
        const dx = p.pos.x - c.pos.x, dz = p.pos.z - c.pos.z;
        if (dx * dx + dz * dz < 1.3 * 1.3 && !p.latched) { c.setState('fall'); c.target = p.id; return; }
      }
      return;
    }
    if (c.state === 'fall') {
      if (c.t > 0.45) {
        const p = g.aiPlayerById(c.target);
        if (p && !p.dead) { c.setState('latched'); c.extra = p.id; g.hostLatch(c, p.id, true); }
        else { c.setState('walk'); c.pos.y = g.world.facility?.layout.y ?? c.pos.y; }
      } else c.pos.y -= dt * 5;
      return;
    }
    if (c.state === 'latched') {
      const p = g.aiPlayerById(c.extra);
      if (!p || p.dead) { g.hostLatch(c, c.extra, false); c.extra = 0; c.setState('walk'); c.pos.y = g.world.facility?.layout.y ?? c.pos.y; c.data.climb = 10; return; }
      c.pos.copy(p.pos);
      if (c.cooldown <= 0) { c.cooldown = 1; M.attack(c, p, c.dmg, 'leech'); }
      return;
    }
    // on floor: crawl away, then climb back
    c.data.climb = (c.data.climb ?? 10) - dt;
    if (c.state !== 'walk') c.setState('walk');
    if (!c.path || M.follow(c, dt, c.def.walk)) M.wander(c, 6);
    if (c.data.climb <= 0) { c.setState('ceiling'); c.pos.y = (g.world.facility?.layout.y ?? 0) + 3.1; c.data.climb = 10; }
  },
  screamer: (c, dt, M) => {
    const players = M.playersFor(c);
    if (c.state === 'scream') { if (c.t > 1.6) { c.setState('flee'); c.data.fleeT = 6; const a = Math.random() * 6.28; M.goTo(c, c.pos.x + Math.cos(a) * 12, c.pos.z + Math.sin(a) * 12); } return; }
    if (c.state === 'flee') { c.data.fleeT -= dt; if (M.follow(c, dt, c.def.run) || c.data.fleeT <= 0) c.setState('idle'); return; }
    const n = M.nearest(c, players, 18);
    if (!n) { if (c.state === 'idle' && c.t > 4) { M.wander(c, 10); c.setState('walk'); } if (c.state === 'walk' && M.follow(c, dt, c.def.walk)) c.setState('idle'); return; }
    const looked = M.isLookedAt(c, n.p, 7, 0.8);
    if (n.d < 6 && looked && c.cooldown <= 0) {
      const banshee = c.variant === 'banshee';
      c.setState('scream'); c.cooldown = banshee ? 20 : 12;
      for (const p of players) if (p.pos.distanceTo(c.pos) < (banshee ? 14 : 9)) { M.attack(c, p, c.dmg, 'scream'); M.game.hostStunPlayer(p.id, 2); }
      return;
    }
    if (n.d < 1.3 && c.cooldown <= 6) { c.setState('attack'); c.cooldown = 8; M.attack(c, n.p, c.dmg); return; }
    c.setState('walk');
    M.moveToward(c, n.p.pos, dt, c.def.walk * 1.3);
  },
  mimic: (c, dt, M) => {
    const players = M.playersFor(c);
    c.data.voiceT = (c.data.voiceT ?? 6 + Math.random() * 8) - dt;
    if (c.data.voiceT <= 0) { c.data.voiceT = 9 + Math.random() * 14; M.game.net.broadcast('cev', { e: 'snd', id: c.id, clip: c.data.voiceOf || true }); }
    const n = M.nearest(c, players, 40);
    if (!n) { if (c.state === 'idle' && c.t > 4) { M.wander(c, 12); c.setState('walk'); } if (c.state === 'walk' && M.follow(c, dt, c.def.walk)) c.setState('idle'); return; }
    if (n.p.inShip) { c.setState('idle'); return; }
    if (n.d < 1.3) { if (c.cooldown <= 0) { c.setState('attack'); c.cooldown = 1.1; M.attack(c, n.p, c.dmg, 'mimic'); } return; }
    if (n.d < 5) { c.setState('run'); M.moveToward(c, n.p.pos, dt, c.def.run); return; }
    c.setState('walk');
    M.moveToward(c, n.p.pos, dt, c.def.walk);
  },
  hound: (c, dt, M) => {
    const players = M.playersFor(c);
    c.data.howlT = (c.data.howlT ?? 20 + Math.random() * 30) - dt;
    if (c.data.howlT <= 0 && c.state !== 'run') {
      c.data.howlT = 30 + Math.random() * 40; c.setState('howl');
      // 'Alpha Troll': the howl calls every Troll within 60 m to where it heard something last
      if (c.variant === 'alpha') {
        const to = c.data.last || c.pos;
        for (const o of M.host.values()) if (o !== c && o.type === 'hound' && !o.dead && o.pos.distanceTo(c.pos) < 60) { M.goTo(o, to.x, to.z); o.setState('sniff'); }
      }
      return;
    }
    if (c.state === 'howl') { if (c.t > 2.2) c.setState('idle'); return; }
    // attack if someone noisy is very close
    for (const p of players) {
      const d = p.pos.distanceTo(c.pos);
      if (d < 1.8 && (p.noise > 0.06 || p.voice > 0.05 || c.state === 'run') && c.cooldown <= 0) { c.setState('lunge'); c.cooldown = 1.5; M.attack(c, p, c.dmg, 'hound'); return; }
    }
    if (c.state === 'lunge' && c.t < 0.6) return;
    const n = M.hear(c, 26);
    if (n) {
      const loudish = n.loud > 0.45;
      c.data.last = n.pos.clone();
      c.setState(loudish ? 'run' : 'sniff');
      M.goToLazy(c, n.pos.x, n.pos.z);
    }
    if (c.state === 'run' || c.state === 'sniff') {
      if (M.follow(c, dt, c.state === 'run' ? c.def.run : c.def.walk)) c.setState('idle');
      return;
    }
    if (c.state === 'idle' && c.t > 5) { M.wander(c, 20); c.setState('walk'); }
    if (c.state === 'walk' && M.follow(c, dt, c.def.walk)) c.setState('idle');
  },
  giant: (c, dt, M) => {
    const players = M.playersFor(c).filter((p) => !p.inShip);
    if (c.state === 'grab') {
      const p = M.game.aiPlayerById(c.target);
      if (p && !p.dead) M.game.hostHoldPlayer(p.id, c.pos.clone().add(new THREE.Vector3(Math.sin(c.yaw) * 1.5, 5.5, Math.cos(c.yaw) * 1.5)));
      if (c.t > 1.4) c.setState('eat');
      return;
    }
    if (c.state === 'eat') {
      const p = M.game.aiPlayerById(c.target);
      if (c.t > 1.4 && p && !p.dead) { M.attack(c, p, 999, 'giant'); }
      if (c.t > 2.5) { c.setState('idle'); c.target = null; }
      return;
    }
    let tgt = players.find((q) => q.id === c.target);
    if (!tgt) for (const p of players) if (M.canSee(c, p, 34, 140)) { tgt = p; c.target = p.id; c.lostT = 0; break; }
    if (tgt) {
      if (M.canSee(c, tgt, 40, 360)) c.lostT = 0; else c.lostT = (c.lostT || 0) + dt;
      if (c.lostT > 7 || tgt.inShip) { c.target = null; c.setState('idle'); return; }
      const d = tgt.pos.distanceTo(c.pos);
      if (d < 2.8) { c.setState('grab'); return; }
      c.setState('run');
      M.moveToward(c, tgt.pos, dt, c.def.run, 2.5);
      if (Math.random() < dt * 1.5) M.sound(c, 'giant_step', 1, 10);
      return;
    }
    if (c.state === 'idle' && c.t > 4) { M.wander(c, 30); c.setState('walk'); }
    if (c.state === 'walk') { if (M.follow(c, dt, c.def.walk, 2)) c.setState('idle'); if (Math.random() < dt) M.sound(c, 'giant_step', 0.8, 10); }
  },
  sandkefal: (c, dt, M) => {
    const players = M.playersFor(c).filter((p) => !p.inShip && Math.hypot(p.pos.x, p.pos.z) > 14);
    if (c.state === 'idle') c.setState('hidden');
    if (c.state === 'hidden') {
      c.data.cd = (c.data.cd ?? 20 + Math.random() * 20) - dt;
      if (c.data.cd > 0 || !players.length) return;
      const p = players[Math.floor(Math.random() * players.length)];
      c.target = p.id;
      c.pos.set(p.pos.x, p.pos.y, p.pos.z);
      c.setState('rumble');
      return;
    }
    if (c.state === 'rumble') {
      const p = M.game.aiPlayerById(c.target);
      if (p && c.t < 2.2) { c.pos.x += (p.pos.x - c.pos.x) * Math.min(1, dt * 1.5); c.pos.z += (p.pos.z - c.pos.z) * Math.min(1, dt * 1.5); M.placeAt(c, c.pos.x, c.pos.z); }
      if (c.t > 3.2) { c.setState('emerge'); c.data.hit = false; c.yaw = Math.random() * 6.28; }
      return;
    }
    if (c.state === 'emerge') {
      c.extra = Math.min(1, c.t / 3);
      if (!c.data.hit && c.t > 0.5) {
        c.data.hit = true;
        for (const p of M.playersFor(c)) if (p.pos.distanceTo(c.pos) < 5.5 && !p.inShip) M.attack(c, p, 999, 'sandkefal');
      }
      if (c.t > 3.2) { c.setState('hidden'); c.extra = 0; c.data.cd = 25 + Math.random() * 35; }
    }
  },
  turret: (c, dt, M) => {
    if (c.disabledT > 0) { c.disabledT -= dt; if (c.state !== 'off') c.setState('off'); if (c.disabledT <= 0) c.setState('idle'); return; }
    if (c.state === 'off') c.setState('idle');
    const players = M.playersFor(c);
    const eye = new THREE.Vector3(c.pos.x, c.pos.y + 1.0, c.pos.z);
    let seen = null;
    const headYaw = c.yaw + (c.extra || 0);
    for (const p of players) {
      const d = p.eye.distanceTo(eye);
      if (d > 20) continue;
      const a = Math.atan2(p.pos.x - c.pos.x, p.pos.z - c.pos.z);
      if (Math.abs(angleDiff(headYaw, a)) > (c.state === 'idle' ? 0.5 : 0.9)) continue;
      if (!M.game.physics.lineOfSight(eye, p.eye)) continue;
      seen = p; break;
    }
    if (!seen) {
      if (c.state !== 'idle') c.setState('idle');
      c.extra = Math.sin(c.t * 0.6) * 1.0;
      return;
    }
    const want = angleDiff(c.yaw, Math.atan2(seen.pos.x - c.pos.x, seen.pos.z - c.pos.z));
    c.extra += clamp(want - c.extra, -dt * 3, dt * 3);
    if (c.state === 'idle') { c.setState('alert'); return; }
    if (c.state === 'alert' && c.t > 0.9) c.setState('fire');
    if (c.state === 'fire') {
      c.data.shot = (c.data.shot || 0) - dt;
      if (c.data.shot <= 0) {
        c.data.shot = 0.14;
        M.sound(c, 'turret_fire', 0.7);
        if (Math.random() < 0.75) M.attack(c, seen, c.dmg, 'turret');
      }
    }
  },
  mine: (c, dt, M) => {
    if (c.disabledT > 0) { c.disabledT -= dt; if (c.state !== 'off') c.setState('off'); return; }
    if (c.state === 'off' || c.state === 'idle') c.setState('armed');
    const players = M.playersFor(c);
    if (c.state === 'armed') {
      for (const p of players) if (p.pos.distanceTo(c.pos) < 0.75) { c.setState('triggered'); c.target = p.id; return; }
      return;
    }
    if (c.state === 'triggered') {
      const p = M.game.aiPlayerById(c.target);
      const stillOn = p && !p.dead && p.pos.distanceTo(c.pos) < 1.05;
      if (!stillOn || c.t > 30) {
        M.game.hostExplosion(c.pos.clone().add(new THREE.Vector3(0, 0.3, 0)), 5.5, c.dmg, c.id);
        c.dead = true;
        M.hostRemove(c.id);
      }
    }
  },
  web: (c, dt, M) => {
    for (const p of M.playersFor(c)) {
      if (p.pos.distanceTo(c.pos) < 1.3) {
        M.game.hostSlowPlayer(p.id, 1.5);
        if (!c.data.alerted || c.data.alerted < M.game.time - 5) {
          c.data.alerted = M.game.time;
          const owner = M.host.get(c.data.owner);
          if (owner) owner.data.alarm = p.id;
        }
      }
    }
  },
  mimicdoor: (c, dt, M) => {
    if (c.state === 'attack' && c.t > 3) c.setState('idle');
  },

  // =========================================================================================
  // Round 3: Lethal Company inspired creatures (internet-horror re-theme). Every lethal move is telegraphed.
  // =========================================================================================

  // THE MODERATOR (Nutcracker): patrols; the hat eye opens to REVIEW (scan 2.4 s) - moving players get
  // reported. Then: red laser aim 1.0 s -> ban-hammer shotgun blast, two shells, 2.2 s reload. Kicks up close.
  moderator: (c, dt, M) => {
    const d = c.data;
    const senior = c.variant === 'senior';
    if (!d.init) { d.init = 1; d.scanT = 3 + Math.random() * 4; d.shots = 2; d.memT = 0; d.heardT = 0; c.setState('patrol'); }
    const players = M.playersFor(c).filter((p) => !p.inShip);
    d.memT -= dt;
    if (d.memT <= 0) d.tid = null;
    const tgt = d.tid ? players.find((p) => p.id === d.tid) || null : null;
    if (d.tid && !tgt) d.tid = null;
    c.target = d.tid || null;
    const st = c.state;
    if (st === 'aim') {
      if (!tgt) { c.setState('hunt'); return; }
      faceTo(c, tgt.pos.x, tgt.pos.z, dt, senior ? 6 : 4.5);
      if (c.t >= (senior ? 0.75 : 1.0)) moderatorFire(c, M);
      return;
    }
    if (st === 'fire') { if (c.t > 0.45) c.setState(d.shots <= 0 ? 'reload' : 'hunt'); return; }
    if (st === 'reload') { if (c.t > 2.2) { d.shots = 2; c.setState(tgt ? 'hunt' : 'patrol'); } return; }
    if (st === 'kick') {
      if (!d.kicked && c.t > 0.3) {
        d.kicked = true;
        if (tgt && tgt.pos.distanceTo(c.pos) < 2.1) { M.attack(c, tgt, Math.round(c.dmg * 0.55), 'moderator'); M.game.hostSlowPlayer?.(tgt.id, 0.8); }
      }
      if (c.t > 0.75) c.setState('hunt');
      return;
    }
    if (st === 'scan') {
      for (const p of players) {
        if (M.playerSpeed(p) > 0.7 && M.canSee(c, p, 26, 160)) {
          d.tid = p.id; c.target = p.id; d.memT = 20; d.lastSeen = p.pos.clone();
          c.setState(d.shots > 0 ? 'aim' : 'reload');
          return;
        }
      }
      if (c.t > (senior ? 3.2 : 2.4)) { d.scanT = tgt ? 1.5 : 5 + Math.random() * 5; c.setState(tgt ? 'hunt' : 'patrol'); }
      return;
    }
    d.scanT -= dt;
    if (tgt) {
      // it remembers you now: it shoots on sight (moving or not) until it loses you for 20 s
      const dist = tgt.pos.distanceTo(c.pos);
      if (dist < 1.7 && c.cooldown <= 0) { c.cooldown = 1.6; d.kicked = false; faceTo(c, tgt.pos.x, tgt.pos.z, 1, 99); c.setState('kick'); return; }
      if (d.shots > 0 && c.cooldown <= 0 && M.canSee(c, tgt, 26, 150)) { d.lastSeen = tgt.pos.clone(); d.memT = Math.max(d.memT, 12); c.setState('aim'); return; }
      if (st !== 'hunt') c.setState('hunt');
      if (d.lastSeen) { if (M.moveToward(c, d.lastSeen, dt, c.def.run)) d.lastSeen = null; }
      else if (!c.path || M.follow(c, dt, c.def.walk)) M.wander(c, 10);
      if (d.scanT <= 0) c.setState('scan');
      return;
    }
    if (d.scanT <= 0) { c.setState('scan'); return; }
    // patrol: hallway walks with short pauses; loud noises draw it over
    d.heardT -= dt;
    if (d.heardT <= 0) {
      const n = M.hear(c, 10);
      if (n) { d.heardT = 3; M.goToLazy(c, n.pos.x, n.pos.z); c.setState('patrol'); }
    }
    if (st === 'idle') { if (c.t > 1.5) { M.wander(c, 16); c.setState('patrol'); } }
    else if (st === 'patrol' || st === 'hunt') { if (M.follow(c, dt, c.def.walk)) c.setState('idle'); }
    else c.setState('idle');
  },

  // CUSTOMER SUPPORT (Butler): follows the nearest customer politely. Alone with it for ~6 s -> the knife
  // comes out (0.8 s windup) and it stabs. Hitting it (or a first stab) makes it hostile for a while.
  support: (c, dt, M) => {
    const d = c.data;
    if (!d.init) { d.init = 1; d.aloneT = 0; d.hostile = 0; d.following = false; }
    const players = M.playersFor(c).filter((p) => !p.inShip);
    d.hostile = Math.max(0, d.hostile - dt);
    const tgt = d.tid ? players.find((p) => p.id === d.tid) || null : null;
    const st = c.state;
    if (st === 'windup') {
      if (!tgt) { c.setState('idle'); return; }
      faceTo(c, tgt.pos.x, tgt.pos.z, dt, 6);
      if (c.t >= (d.windT || 0.8)) { d.hit = false; c.setState('stab'); }
      return;
    }
    if (st === 'stab') {
      if (!d.hit && c.t > 0.12) {
        d.hit = true;
        if (tgt) {
          const dx = tgt.pos.x - c.pos.x, dz = tgt.pos.z - c.pos.z;
          if (Math.hypot(dx, dz) < 2.1 && Math.abs(angleDiff(c.yaw, Math.atan2(dx, dz))) < 1.0) M.attack(c, tgt, c.dmg, 'support');
        }
        d.hostile = Math.max(d.hostile, 14); c.cooldown = 1.3;
      }
      if (c.t > 0.45) c.setState(d.hostile > 0 ? 'run' : 'idle');
      return;
    }
    if (d.hostile > 0) {
      const p = tgt || M.nearest(c, players, 30)?.p;
      if (!p) { d.hostile = 0; c.setState('idle'); return; }
      d.tid = p.id; c.target = p.id;
      if (p.pos.distanceTo(c.pos) < 1.6 && c.cooldown <= 0) { d.windT = 0.4; c.setState('windup'); return; }
      c.setState('run');
      M.moveToward(c, p.pos, dt, c.def.run);
      return;
    }
    c.target = null;
    const n = M.nearest(c, players, 16);
    if (!n) { d.tid = null; d.aloneT = 0; d.following = false; roam(c, dt, M, 14, 4); return; }
    d.tid = n.p.id;
    const alone = crewNear(M, n.p, 9) === 0;
    d.aloneT = alone && n.d < 5 ? d.aloneT + dt : Math.max(0, d.aloneT - dt * 2);
    if (d.aloneT > (c.elite ? 4 : 6) && n.d < 3 && c.cooldown <= 0 && c.age > 6) { d.aloneT = 0; d.windT = 0.8; c.setState('windup'); return; }
    // polite following with hysteresis: keeps ~2.6 m away, always facing its customer
    if (d.following ? n.d < 2.6 : n.d > 3.6) d.following = !d.following;
    if (d.following) { c.setState('follow'); M.moveToward(c, n.p.pos, dt, c.def.walk); }
    else { if (st !== 'idle') c.setState('idle'); faceTo(c, n.p.pos.x, n.p.pos.z, dt, 3); }
  },

  // TICKET SWARM: what is left of Customer Support. Chases, stings, burns out after ~30 s.
  ticketswarm: (c, dt, M) => {
    const d = c.data;
    d.life = (d.life ?? 30) - dt;
    if (d.life <= 0) { M.kill(c, null, { silent: true }); return; }
    const players = M.playersFor(c).filter((p) => !p.inShip);
    const p = players.find((q) => q.id === c.target) || M.nearest(c, players, 30)?.p;
    if (!p) { roam(c, dt, M, 8, 1); return; }
    c.target = p.id;
    c.setState('run');
    M.moveToward(c, p.pos, dt, c.def.run * (d.life < 5 ? 0.6 : 1));
    if (p.pos.distanceTo(c.pos) < 1.4 && c.cooldown <= 0) { c.cooldown = 0.45; M.attack(c, p, c.dmg, 'ticketswarm'); }
  },

  // THE EDITOR (Barber): moves ONLY on the drum beat (audible, tempo rises when close), hopping ~2.8 m.
  // Next to someone on the beat (or when it lands): the blades close. Frozen in between.
  editor: (c, dt, M) => {
    const d = c.data;
    if (!d.init) { d.init = 1; d.beatT = 1 + Math.random() * 2; }
    const players = M.playersFor(c).filter((p) => !p.inShip);
    const st = c.state;
    if (st === 'snip') {
      if (!d.cut && c.t > 0.28) {
        d.cut = true;
        for (const p of players) {
          const dx = p.pos.x - c.pos.x, dz = p.pos.z - c.pos.z;
          if (Math.hypot(dx, dz) < 2.1 && Math.abs(p.pos.y - c.pos.y) < 2 && Math.abs(angleDiff(c.yaw, Math.atan2(dx, dz))) < 1.3) M.attack(c, p, c.dmg, 'editor');
        }
      }
      if (c.t > 0.7) c.setState('idle');
      return;
    }
    if (st === 'hop') {
      M.follow(c, dt, 10, 30);
      if (c.t >= 0.28) {
        c.setState('idle');
        const n = M.nearest(c, players, 1.8);
        if (n) { faceTo(c, n.p.pos.x, n.p.pos.z, 1, 99); d.cut = false; c.setState('snip'); }
      }
      return;
    }
    if (st !== 'idle') c.setState('idle');
    d.beatT -= dt;
    if (d.beatT > 0) return;
    const n = M.nearest(c, players, 30);
    d.beatT = n ? (n.d < 10 ? 1.55 : 1.9) : 2.4;
    M.sound(c, ['sting_drum', 'sting2_drum_3', 'hit_metal'], 1, 7, n && n.d < 10 ? 1.1 : 0.95, 70);
    if (n && n.d < 1.9) { c.target = n.p.id; faceTo(c, n.p.pos.x, n.p.pos.z, 1, 99); d.cut = false; c.setState('snip'); return; }
    if (n) { c.target = n.p.id; M.goTo(c, n.p.pos.x, n.p.pos.z); }
    else { c.target = null; M.wander(c, 10); }
    c.setState('hop');
  },

  // TAMAGOTCHI (Maneater): a crying baby console. Crouch next to it to rock it (2.2 s). Neglect it or hit it and
  // it morphs (3 s, loud) into an adult that crouches (0.6 s telegraph) and lunges in a straight line.
  tamagotchi: (c, dt, M) => {
    const d = c.data;
    const neglected = c.variant === 'neglected';
    if (!d.init) { d.init = 1; d.care = 100; d.cryT = (neglected ? 15 : 25) + Math.random() * 25; d.rockT = 0; d.adult = false; c.extra = 0; c.setState('idle'); }
    const players = M.playersFor(c).filter((p) => !p.inShip);
    if (d.adult) { tamagotchiAdult(c, dt, M, players); return; }
    if (c.state === 'morph') {
      c.extra = Math.min(1, c.t / 3);
      if (c.t >= 3) { d.adult = true; c.extra = 1; c.def = c.def === CREATURES.tamagotchi ? { ...c.def } : c.def; c.def.radius = 0.7; c.hp = c.maxHp; c.target = M.nearest(c, players, 40)?.p.id || null; c.cooldown = 1; c.setState('run'); }
      return;
    }
    if (c.state === 'rocked') { if (c.t > 2.5) c.setState('idle'); return; }
    if (c.state === 'cry') {
      d.care -= dt * (neglected ? 8 : 5);
      d.sobT = (d.sobT || 0) - dt;
      if (d.sobT <= 0) { d.sobT = 1.4; M.sound(c, ['voice_rat_scared', 'squeak'], 0.9, 4, 1.5 + Math.random() * 0.3); M.noise(c.pos, 1.3); }
      const rocker = players.find((p) => p.crouch && p.pos.distanceTo(c.pos) < 2.4);
      d.rockT = rocker ? d.rockT + dt : Math.max(0, d.rockT - dt * 0.5);
      if (rocker && d.rockT >= 2.2) {
        d.rockT = 0; d.care = 100; d.cryT = (neglected ? 18 : 35) + Math.random() * 25;
        c.setState('rocked');
        M.game.net.broadcast('xp', { to: rocker.id, xp: 30, reason: 'Tamagotchi rocked to sleep' });
        return;
      }
      if (d.care <= 0) { c.setState('morph'); M.noise(c.pos, 3); }
      return;
    }
    const n = M.nearest(c, players, 14);
    if (n) { d.cryT -= dt; if (d.cryT <= 0) { d.sobT = 0; d.rockT = 0; c.setState('cry'); return; } }
    if (n && n.d > 2.2 && n.d < 12) { if (c.state !== 'walk') c.setState('walk'); M.moveToward(c, n.p.pos, dt, c.def.walk); }
    else roam(c, dt, M, 6, 5);
  },

  // PARASOCIAL (Ghost Girl): haunts ONE player (only they see / hear it). Appears at a distance, vanishes when
  // stared at, creeps closer. Haunt meter full -> 2.2 s reveal (static + sting) -> chase up to 12 s.
  // Break line of sight for 3 s, reach the entrance or leave the building to survive.
  stalker: (c, dt, M) => {
    const d = c.data;
    if (!d.init) { d.init = 1; d.haunt = 0; d.hideT = 4; d.goneT = 0; c.setState('hidden'); c.extra = 0; }
    const players = M.playersFor(c).filter((p) => !p.inShip);
    let v = d.vid ? players.find((p) => p.id === d.vid) || null : null;
    const endChase = (h) => { d.haunt = h; c.target = null; d.hideT = 20 + Math.random() * 20; c.setState('hidden'); if (Math.random() < 0.35) d.vid = null; };
    if (!v) {
      if (c.state !== 'hidden') c.setState('hidden');
      c.target = null;
      d.goneT += dt;
      const gone = d.vid ? M.game.aiPlayerById(d.vid) : null;
      if (d.vid && gone && !gone.dead && d.goneT < 60) return;     // victim stepped outside: wait for them
      d.pickT = (d.pickT || 0) - dt;
      if (d.pickT > 0 || !players.length) return;
      d.pickT = 5;
      const lone = players.filter((p) => crewNear(M, p, 12) === 0);
      const pool = lone.length ? lone : players;
      v = pool[Math.floor(Math.random() * pool.length)];
      d.vid = v.id; d.haunt = 0.1; d.hideT = 6 + Math.random() * 6; d.goneT = 0;
      c.extra = v.id;
      return;
    }
    d.goneT = 0;
    c.extra = v.id;
    const dist = v.pos.distanceTo(c.pos);
    const st = c.state;
    if (st === 'chase') {
      c.target = v.id;
      d.lostT = M.canSee(c, v, 30, 360) ? 0 : (d.lostT || 0) + dt;
      if (dist < 1.1 && Math.abs(v.pos.y - c.pos.y) < 2) { M.attack(c, v, c.dmg, 'stalker'); endChase(0.3); return; }
      if (d.lostT > 3 || c.t > 12 || M.nearSafeZone(v)) { endChase(0.45); return; }
      M.moveToward(c, v.pos, dt, c.def.run, 12);
      return;
    }
    if (st === 'reveal') {
      c.target = v.id;
      faceTo(c, v.pos.x, v.pos.z, dt, 6);
      if (c.t >= 2.2) { d.lostT = 0; c.setState('chase'); }
      return;
    }
    c.target = null;
    const alone = crewNear(M, v, 12) === 0;
    const looked = st === 'lurk' && M.isLookedAt(c, v, 30, 0.9);
    d.haunt += (dt / 110) * (alone ? 1.8 : 1) * (looked ? 2.5 : 1);
    if (d.haunt >= 1 && st === 'lurk' && dist < 20 && !M.nearSafeZone(v) && M.canSee(c, v, 22, 360)) { c.setState('reveal'); return; }
    if (st !== 'lurk') {
      if (st !== 'hidden') c.setState('hidden');
      d.hideT -= dt;
      if (d.hideT <= 0) {
        if (stalkerPlace(c, v, M)) { c.setState('lurk'); d.lurkT = 7 + Math.random() * 7; d.lookT = 0; } else d.hideT = 2;
      }
      return;
    }
    faceTo(c, v.pos.x, v.pos.z, dt, 2);
    d.lurkT -= dt;
    d.lookT = looked ? d.lookT + dt : 0;
    if (d.lookT > 1.3 || d.lurkT <= 0 || dist < 3.5) { c.setState('hidden'); d.hideT = (d.haunt > 0.7 ? 4 : 8) + Math.random() * 8; return; }
    if (d.haunt > 0.5 && dist > 6 && !looked) M.moveToward(c, v.pos, dt, c.def.walk * 0.6);   // creeps closer while unobserved
  },

  // CLICKBAIT (Kidnapper Fox): outdoor. Hides in the brush, stalks stragglers (frozen while watched), then a
  // notification DING + face flash (0.85 s) -> tongue (13 m) -> drags the victim to its nest. Hit it to break free.
  clickbait: (c, dt, M) => {
    const g = M.game, d = c.data;
    if (!d.init) { d.init = 1; d.nest = c.home.clone(); d.cd = 8; c.setState('hide'); }
    const players = M.playersFor(c).filter((p) => !p.inShip && Math.hypot(p.pos.x, p.pos.z) > 22);
    d.cd = Math.max(0, d.cd - dt);
    const v = d.vid ? g.aiPlayerById(d.vid) : null;
    const st = c.state;
    if (st === 'drag') {
      c.target = d.vid;
      if (!v || v.dead || v.inShip || c.t > 7.5) { clickbaitRelease(c, M, !!v && !v.dead && c.t > 7.5); return; }
      M.moveToward(c, d.nest, dt, 2.1, 4);
      const dx = c.pos.x - d.vpos.x, dz = c.pos.z - d.vpos.z, dist = Math.hypot(dx, dz) || 1;
      c.yaw = Math.atan2(-dx, -dz);
      const pull = Math.min(dist - 1.3, 3.2 * dt);
      if (pull > 0) { d.vpos.x += (dx / dist) * pull; d.vpos.z += (dz / dist) * pull; }
      const terr = g.world.terrain;
      if (terr) d.vpos.y = terr.heightAt(d.vpos.x, d.vpos.z) + 0.05;
      d.holdT -= dt;
      if (d.holdT <= 0) { d.holdT = 0.1; g.hostHoldPlayer(v.id, d.vpos); }
      d.tickT -= dt;
      if (d.tickT <= 0) { d.tickT = 1; M.attack(c, v, c.dmg, 'clickbait'); }
      return;
    }
    if (st === 'tongue') {
      if (!d.shot && c.t >= 0.3) {
        d.shot = true;
        if (v && !v.dead && v.pos.distanceTo(c.pos) < 13 && !M.nearSafeZone(v) && g.physics.lineOfSight(M.eye(c).clone(), v.eye)) {
          d.dmgTaken = 0; d.vpos = v.pos.clone(); d.holdT = 0; d.tickT = 0.6;
          c.setState('drag');
        } else clickbaitRelease(c, M, false);
      }
      return;
    }
    if (st === 'aim') {
      if (!v || v.dead || v.inShip) { clickbaitRelease(c, M, false); return; }
      faceTo(c, v.pos.x, v.pos.z, dt, 8);
      if (c.t >= 0.85) { d.shot = false; c.setState('tongue'); }
      return;
    }
    if (st === 'flee') {
      if (M.follow(c, dt, c.def.run) || c.t > 8) { c.setState('hide'); d.cd = Math.max(d.cd, 10); }
      return;
    }
    let tgt = v && !v.dead ? players.find((p) => p.id === v.id) || null : null;
    if (!tgt && d.cd <= 0) {
      for (const p of players) if (p.pos.distanceTo(c.pos) < 45 && crewNear(M, p, 10) === 0) { tgt = p; break; }
      d.vid = tgt?.id || null;
    }
    if (tgt && (crewNear(M, tgt, 8) > 0 || tgt.pos.distanceTo(c.pos) > 60)) { d.vid = null; tgt = null; d.cd = 6; }   // regrouped: not worth it
    if (!tgt) {
      c.target = null; c.extra = 0;
      if (st !== 'hide' && st !== 'walk') c.setState('hide');
      if (c.state === 'hide' && c.t > 6) { const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 6; M.goTo(c, d.nest.x + Math.cos(a) * r, d.nest.z + Math.sin(a) * r); c.setState('walk'); }
      else if (c.state === 'walk' && M.follow(c, dt, c.def.walk)) c.setState('hide');
      return;
    }
    c.target = tgt.id;
    const dist = tgt.pos.distanceTo(c.pos);
    if (dist < 11 && dist > 2 && M.canSee(c, tgt, 14, 360)) { c.extra = tgt.id; c.setState('aim'); return; }
    if (st !== 'stalk') c.setState('stalk');
    if (!M.isLookedAt(c, tgt, 40, 0.85)) M.moveToward(c, tgt.pos, dt, c.def.run * 0.8, 6);   // frozen while watched
  },

  // REPLY GUY (Baboon Hawk): outdoor flocks of 3-4. Alone they are cowards; a flock postures (wings + screech,
  // 1.3 s) at a lone janitor, then piles on. Hitting one usually scatters it.
  replyguy: (c, dt, M) => {
    const d = c.data;
    if (!d.init) {
      d.init = 1; d.camp = d.camp ? new THREE.Vector3(d.camp.x, d.camp.y, d.camp.z) : c.home.clone(); d.flock = d.flock || c.id;
      if (!d.mate) {
        const n = 2 + (Math.random() < 0.5 ? 1 : 0);
        for (let k = 0; k < n; k++) {
          const a = Math.random() * Math.PI * 2;
          M.hostSpawn('replyguy', new THREE.Vector3(c.pos.x + Math.cos(a) * 2.5, c.pos.y, c.pos.z + Math.sin(a) * 2.5), { level: c.level, zone: c.zone, data: { mate: true, flock: c.id, camp: { x: d.camp.x, y: d.camp.y, z: d.camp.z } } });
        }
      }
    }
    d.fleeT = Math.max(0, (d.fleeT || 0) - dt);
    const players = M.playersFor(c).filter((p) => !p.inShip && Math.hypot(p.pos.x, p.pos.z) > 16);
    const mates = [];
    for (const o of M.host.values()) if (o.type === 'replyguy' && !o.dead && o.data.flock === d.flock && o.pos.distanceTo(c.pos) < 14) mates.push(o);
    let courage = 0;
    for (const o of mates) courage += o.variant === 'verified' ? 2 : 1;
    if (d.fleeT > 0) {
      if (c.state !== 'flee') c.setState('flee');
      if (M.follow(c, dt, c.def.run)) d.fleeT = 0;
      return;
    }
    const tgt = c.target ? players.find((p) => p.id === c.target) || null : null;
    if (c.state === 'posture') {
      if (!tgt) { c.target = null; c.setState('idle'); return; }
      faceTo(c, tgt.pos.x, tgt.pos.z, dt, 5);
      if (c.t >= 1.3) c.setState('run');
      return;
    }
    if (c.state === 'attack') { if (c.t > 0.5) c.setState('run'); return; }
    if (c.state === 'run') {
      if (!tgt || courage < 2 || tgt.pos.distanceTo(d.camp) > 45) { c.target = null; M.goTo(c, d.camp.x, d.camp.z); c.setState('walk'); return; }
      if (tgt.pos.distanceTo(c.pos) < 1.4 && c.cooldown <= 0) { c.cooldown = 1.3 + Math.random() * 0.5; c.setState('attack'); M.attack(c, tgt, c.dmg, 'replyguy'); return; }
      M.moveToward(c, tgt.pos, dt, c.def.run);
      return;
    }
    if (courage >= 3) {
      for (const p of players) {
        if (p.pos.distanceTo(c.pos) < 16 && crewNear(M, p, 8) <= (courage >= 4 ? 1 : 0) && M.canSee(c, p, 18, 200)) {
          for (const o of mates) if (o.state !== 'run' && o.state !== 'posture' && !(o.data.fleeT > 0)) { o.target = p.id; o.setState('posture'); }
          return;
        }
      }
    }
    if (c.state === 'idle') { if (c.t > 3 + (c.seed % 4)) { const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 8; M.goTo(c, d.camp.x + Math.cos(a) * r, d.camp.z + Math.sin(a) * r); c.setState('walk'); } }
    else if (c.state === 'walk') { if (M.follow(c, dt, c.def.walk)) c.setState('idle'); }
    else c.setState('idle');
    if (Math.random() < dt * 0.04) M.sound(c, ['animal_crow', 'voice_bat_grunt'], 0.6, 4, 0.8 + Math.random() * 0.3);
  },
};

// ---------------------------------------------------------------------------------------------
// helpers for the round-3 behaviours
// ---------------------------------------------------------------------------------------------
function faceTo(c, x, z, dt, rate) {
  const want = Math.atan2(x - c.pos.x, z - c.pos.z);
  c.yaw += clamp(angleDiff(c.yaw, want), -rate * dt, rate * dt);
}
// one-shot 'hit by a player' marker set in damage(): turn around and chase them (idle / walk states)
function takeAggro(c, players, M) {
  const d = c.data;
  if (!d.hitBy) return false;
  const p = players.find((q) => q.id === d.hitBy);
  const id = d.hitBy;
  d.hitBy = null;
  if (!p || p.inShip || p.dead || (M.game.time || 0) - (d.hitAt || 0) > 8) return false;
  c.target = id; c.lostT = 0; c.setState('run');
  return true;
}
// idle <-> walk wandering
function roam(c, dt, M, radius = 12, idleT = 3) {
  if (c.state === 'idle') { if (c.t > idleT) { M.wander(c, radius); c.setState('walk'); } }
  else if (c.state === 'walk') { if (M.follow(c, dt, c.def.walk)) c.setState('idle'); }
  else c.setState('idle');
}
// living crewmates of p within r metres
function crewNear(M, p, r) {
  let n = 0;
  for (const q of M.game.aiPlayers()) if (q.id !== p.id && !q.dead && q.pos.distanceTo(p.pos) < r) n++;
  return n;
}
function awayFrom(c, M, x, z, dist = 14) {
  const a = Math.atan2(c.pos.x - x, c.pos.z - z);
  const nav = M.nav(c);
  if (nav) { const w = nav.randomWalkable(Math.random, c.pos.x + Math.sin(a) * dist, c.pos.z + Math.cos(a) * dist, 6); if (w) { M.goTo(c, w.x, w.z); return; } }
  M.goTo(c, c.pos.x + Math.sin(a) * dist, c.pos.z + Math.cos(a) * dist);
}

// Moderator shot: a cone along its facing (the laser the players saw for a second), LOS, falloff with range.
function moderatorFire(c, M) {
  const g = M.game, d = c.data;
  d.shots--; c.cooldown = 0.3;
  c.setState('fire');
  M.sound(c, 'shotgun_fire', 1.2, 6, 0.85, 90);
  M.noise(c.pos, 3.5);
  const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
  const eye = new THREE.Vector3(c.pos.x + fx * 0.6, c.pos.y + 1.45, c.pos.z + fz * 0.6);
  for (const p of M.playersFor(c)) {
    if (p.inShip) continue;
    const dx = p.pos.x - eye.x, dz = p.pos.z - eye.z, dist = Math.hypot(dx, dz);
    if (dist > 28 || Math.abs(p.pos.y - c.pos.y) > 3) continue;
    if (Math.abs(angleDiff(c.yaw, Math.atan2(dx, dz))) > Math.atan2(0.85, Math.max(dist, 0.5)) + 0.04) continue;
    if (!g.physics.lineOfSight(eye, p.eye)) continue;
    const k = dist < 7 ? 1 : Math.max(0.45, 1 - (dist - 7) / 30);
    M.attack(c, p, Math.round(c.dmg * k), 'moderator');
  }
}

function tamagotchiAdult(c, dt, M, players) {
  const d = c.data;
  if (c.state === 'crouch') {
    const p = M.game.aiPlayerById(c.target);
    if (p && c.t < 0.35) faceTo(c, p.pos.x, p.pos.z, dt, 8);
    if (c.t >= 0.6) { d.lx = Math.sin(c.yaw); d.lz = Math.cos(c.yaw); d.hit = false; c.setState('lunge'); }   // direction locked: sidestep
    return;
  }
  if (c.state === 'lunge') {
    const nx = c.pos.x + d.lx * 12 * dt, nz = c.pos.z + d.lz * 12 * dt;
    const nav = M.nav(c);
    if (!nav || nav.walkableAt(nx, nz)) M.placeAt(c, nx, nz); else c.t = 99;   // hit a wall
    if (!d.hit) for (const p of players) if (p.pos.distanceTo(c.pos) < 1.4 && Math.abs(p.pos.y - c.pos.y) < 2) { d.hit = true; M.attack(c, p, c.dmg, 'tamagotchi'); break; }
    if (c.t >= 0.5) c.setState('recover');
    return;
  }
  if (c.state === 'recover') { if (c.t > 1.0) c.setState('run'); return; }
  let tgt = players.find((p) => p.id === c.target) || null;
  if (!tgt || tgt.pos.distanceTo(c.pos) > 40) { tgt = players.find((p) => M.canSee(c, p, 22, 200)) || null; c.target = tgt?.id || null; }
  if (!tgt) { roam(c, dt, M, 14, 2); return; }
  const dist = tgt.pos.distanceTo(c.pos);
  if (dist < 5.5 && c.cooldown <= 0 && M.canSee(c, tgt, 8, 360)) { c.cooldown = 2.4; c.setState('crouch'); return; }
  c.setState('run');
  M.moveToward(c, tgt.pos, dt, c.def.run);
}

// Parasocial: appear 8-16 m from the victim, preferably somewhere they can see it
function stalkerPlace(c, v, M) {
  const nav = M.nav(c);
  if (!nav) return false;
  const y = M.game.world.facility?.layout.y ?? c.pos.y;
  let best = null;
  for (let i = 0; i < 12; i++) {
    const p = nav.randomWalkable(Math.random, v.pos.x, v.pos.z, 16);
    if (!p || Math.hypot(p.x - v.pos.x, p.z - v.pos.z) < 8) continue;
    best = p;
    if (M.game.physics.lineOfSight(V.set(p.x, y + 1.5, p.z), v.eye)) break;
  }
  if (!best) return false;
  M.placeAt(c, best.x, best.z);
  c.path = null;
  c.yaw = Math.atan2(v.pos.x - c.pos.x, v.pos.z - c.pos.z);
  return true;
}

function clickbaitRelease(c, M, bite) {
  const d = c.data;
  const v = d.vid ? M.game.aiPlayerById(d.vid) : null;
  if (bite && v && !v.dead) M.attack(c, v, 25, 'clickbait');
  d.vid = null; c.extra = 0; c.target = null; d.cd = 15;
  c.setState('flee');
  M.goTo(c, d.nest.x, d.nest.z);
}

// Reactions to being hit (host). amount is after armour. Called only while the creature survives.
const ON_HURT = {
  support: (c, amount, by) => { c.data.hostile = 20; c.data.tid = by; },
  tamagotchi: (c, amount, by, M) => {
    if (!c.data.adult && c.state !== 'morph') { c.data.care = 0; c.setState('morph'); M.noise(c.pos, 3); }
    else c.target = by;
  },
  stalker: (c, amount, by) => {
    // the victim fighting back makes it vanish (and it will be back)
    if (by === c.data.vid && (c.state === 'lurk' || c.state === 'reveal')) { c.setState('hidden'); c.data.hideT = 6 + Math.random() * 6; c.data.haunt = Math.max(0, (c.data.haunt || 0) - 0.15); }
  },
  clickbait: (c, amount, by, M) => {
    const d = c.data;
    if (!d.nest) d.nest = c.home.clone();   // hit before its first AI tick (spawn frame, stun grenade in the same step)
    d.dmgTaken = (d.dmgTaken || 0) + amount;
    if (c.state === 'drag') { if (d.dmgTaken >= Math.max(35, c.maxHp * 0.2)) clickbaitRelease(c, M, false); }
    else if (c.state !== 'flee') { d.vid = null; c.extra = 0; c.target = null; d.cd = 12; c.setState('flee'); M.goTo(c, d.nest.x, d.nest.z); }
  },
  replyguy: (c, amount, by, M) => {
    if (c.variant === 'verified' || !(Math.random() < 0.6 || c.hp < c.maxHp * 0.5)) return;
    const p = M.game.aiPlayerById(by);
    c.data.fleeT = 4; c.target = null;
    if (p) awayFrom(c, M, p.pos.x, p.pos.z);
    c.setState('flee');
  },
  moderator: (c, amount, by) => { c.data.tid = by; c.data.memT = 20; },
  editor: (c, amount, by) => { c.target = by; },
};

// Death drops / splits (host)
const dropAt = (c, up = 0.6) => c.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, up, (Math.random() - 0.5) * 0.6));
const ON_DEATH = {
  moderator: (c, by, M) => {
    // the ban-hammer shotgun (loaded) + spare shells
    if (ITEMS.shotgun) M.game.items.hostSpawn('shotgun', dropAt(c, 0.8), {});
    if (ITEMS.shells) for (let i = 0, n = 1 + (Math.random() < 0.5 ? 1 : 0); i < n; i++) M.game.items.hostSpawn('shells', dropAt(c), {});
  },
  support: (c, by, M) => {
    const sw = M.hostSpawn('ticketswarm', c.pos.clone(), { level: c.level, zone: c.zone, state: 'run', variant: null, affix: null });
    if (sw) { sw.target = typeof by === 'string' ? by : null; sw.age = 0.2; }
    M.game.net.broadcast('fx', { k: 'snd', s: 'vent_crawl', p: [c.pos.x, c.pos.y + 1, c.pos.z], v: 1, r: 5, m: 40 });
    if (ITEMS.machete && Math.random() < 0.5) M.game.items.hostSpawn('machete', dropAt(c), {});
  },
  editor: (c, by, M) => { if (ITEMS.tv && Math.random() < 0.4) M.game.items.hostSpawn('tv', dropAt(c), { valueMul: 1 + (c.level - 1) * 0.08 }); },
  tamagotchi: (c, by, M) => { if (ITEMS.robot) M.game.items.hostSpawn('robot', dropAt(c), { valueMul: 1.3 + (c.level - 1) * 0.08 }); },
  clickbait: (c, by, M) => {
    c.data.vid = null; c.extra = 0;   // the hold on the victim times out on its own (0.3 s)
    if (ITEMS.magnify && Math.random() < 0.6) M.game.items.hostSpawn('magnify', dropAt(c), { valueMul: 1.2 + (c.level - 1) * 0.08 });
  },
  replyguy: (c, by, M) => { if (ITEMS.phone && Math.random() < 0.15) M.game.items.hostSpawn('phone', dropAt(c), {}); },
};
