// Game orchestrator: world loading, main loop, networking glue, players, items, creatures.
// Host-only logic lives in host.js, local player actions in actions.js (mixed into the prototype).
import * as THREE from 'three';
import { Physics, G } from '../physics/physics.js';
import { LightPool } from '../render/lightpool.js';
import { Environment } from '../world/environment.js';
import { buildShip, insideShip, SHIP } from '../world/ship.js';
import { generateLayout, buildFacility, FACILITY_Y } from '../world/facility.js';
import { mineshaftFootstep, mineshaftAmbience } from '../world/mineshaft.js';
import { interiorFootstep, interiorAmbience } from '../world/interiors/index.js';
import { updateThemeOneShots } from '../audio/extassets.js';
import { stepSoundAt, surfaceAt } from '../world/setpieces.js';
import { buildMoonOutdoor } from '../world/terrain.js';
import { buildCompany } from '../world/company.js';
import { LocalPlayer, footSurface } from '../entities/localplayer.js';
import { RemotePlayer, suitColor } from '../entities/remote.js';
import { ItemManager } from '../entities/items.js';
import { CreatureManager } from '../entities/creatures.js';
import { VoiceChat } from '../net/voice.js';
import { Session } from '../net/session.js';
import { MOONS, BIOMES } from './moons.js';
import { ensureSector, sectorAnnouncement } from './moongen.js';
import { itemDef } from './items.js';
import { CREATURES } from './creatures.js';
import { derivedStats, hasPerk } from './progression.js';
import { createViewModel } from '../models/avatar.js';
import { Emitter } from '../core/events.js';
import { hostMethods } from './host.js';
import { actionMethods } from './actions.js';
import { Terminal } from './terminal.js';
import { installDirector } from './director.js';
import { Progress } from './profile.js';
import { installProfileSync, avatarOfPeer } from './profilesync.js';   // [profile]
import { liteOf } from '../ui/avatarpic.js';   // [profile]
import { installAchievements, titleOf } from './achievements.js';
import { installPings } from './pings.js';
import { EmoteSystem } from './emotes.js';
import { Objectives } from './objectives.js';
import { clamp } from '../core/util.js';
import { installBosses } from './bosses.js';
import { Particles, ScanFx } from '../render/particles.js';
import { installLootFx } from './loot.js';
import { installShipFeatures } from './shipfeatures.js';
import { installMeta } from './prestige.js';
import { installCruiser } from '../entities/cruiser.js';
import './components.js';   // shared crafting components (registered at import)
import { setDocksVisible } from '../ui/dock.js';
import { installNetStats } from '../net/netstats.js';   // NETSTATS network diagnostics
// ---- WAVE 1 module imports: one line per module, keep the blank separator lines (avoids merge conflicts) ----
import { installInventory } from './inventory.js';

import { installFacilitySystems } from './facilitysys.js';

import { installBalance } from './balance.js';
import { doorwayBusy } from '../world/doorsafe.js';

import { installMagic } from './magic.js';

import { installRpg } from './rpg.js';

import { installShop } from './shop.js';

import { installCrafting } from './crafting.js';

import { installLore } from './lore.js';
import { t, tf, sysText } from '../core/i18n.js';

import { installHorde } from './horde.js';

import { installWorldX } from './worldx.js';

import { installFun } from './fun.js';


import { installBackroomsLevels } from './brlevels.js';


import { installBackrooms } from './backrooms.js';


import { installBackroomsCreatures } from './creatures_backrooms.js';


import { installLiminal } from './liminal.js';


import { installCombat } from './combat.js';   // wave 2: melee combos / parry, new weapons, spells, role skills


import { installSiege } from './siege.js';


// [import:bugfix]
import { installBugfix } from './bugfix.js';


import { installArcade } from './arcade.js';


import { installAnomaly } from './anomaly.js';


import { installForge } from './forge.js';


import { installMusic } from './music.js';
import { installSfx } from './sfx.js';   // wave 4: creature voices + footsteps + biome beds (docs/wave4/sfx.md)


// [import:gameplay2]
import { installGameplay2 } from './gameplay2.js';


// [import:shipyard]
import { installShipyard } from './shipyard.js';
import { installShip2 } from './ship2.js';   // [ship2]


import { installSkeletons } from './skeletons.js';


import { installCreatureEmotes } from './cemotes.js';


import { installFpBody } from './fpbody.js';   // [fpbody]


import { installGrenades } from './grenades.js';


import { installDurability } from './durability.js';   // [durability]


import { installMirror } from './mirror.js';   // [mirror] dimension (docs/wave2/mirror.md)


// [import:avatar2]


// [import:trade]
import { installTrade } from './trade.js';


import { installBoardGame } from './boardgame.js';   // [boardgame]


import { installLockpick2 } from './lockpick2.js';   // wave 5: tiered timing-click lockpicking (docs/wave5/lockpick2.md)
import { installSecureLoot } from './secureloot.js';   // wave 2: secured containers + breaching tools


import { installMaps2 } from './maps2.js';   // maps2 (story rooms, switches)


import { installFood } from './food.js';   // wave 2: food & drinks (buffs, booze, cheers, ship table)


// [import:homeworld]
import { installHomeworld } from './homeworld.js';


import { installHomeworld2 } from './homeworld2.js';


// [import:pets]
import { installPets } from './pets.js';


import { installCycle } from './cycle.js';   // [cycle] inert: rules only, see docs/wave2/cycle.md


// [import:cycle3]
import { installCycle3 } from './cycle3.js';   // wave 4: Glitch Gates (red / hidden), Trophy Wall, cycle case files, Elevator Stop, relay puzzle (docs/wave4/cycle3.md)


import { installSocial } from './social.js';   // [social] wave 4: phone + walkie text radio (hub lives on the App: net/hub.js)
import { installWorlds2 } from './worlds2.js';   // wave 3: Soviet raids + twin-sun planet + plasma blade + fauna + loot pacing (docs/wave3/worlds2.md)
import { installMaps5 } from './maps5.js';   // [import:maps5] wave 4: Estate 9 (hedge maze, paper archive) + Cold Storage (shifting server stacks, cryo caves) (docs/wave4/maps5.md)
import { installAlgo1 } from './algo1.js';   // [import:algo1] wave 5: The Algorithm learns you + morning rule vote + LIVE viewers (docs/wave5/algo1.md)
import { installOnboard } from './onboard.js';   // [import:onboard] wave 5: Hiring Day first-time start + staged unlocks (docs/wave5/onboard.md)

import { installPolish4 } from './polish4.js';   // wave 4: pet egg drops, ship decals + furniture, cantina barter, maw / squad fixes (docs/wave4/polish4.md)


import { installStealth } from './stealth.js';   // wave 4: sneak, noise, sound-hunting creatures, noisemaker (docs/wave4/stealth.md)


import { installHorror } from './horror.js';   // wave 4: pay-to-arm traps, outbreak wing, mansion, closets, chalk + Forger, fake closet (docs/wave4/horror.md)


import { installSurvival } from './survival.js';   // wave 4: foraging, farming, cooking, brewing, storage crates, hunger (docs/wave4/survival.md)


import { installVoyage } from './voyage.js';   // wave 4: random moons, signals, warp events, missions, set pieces (docs/wave4/voyage.md)


// [import:ux]
import { installHostMig } from './hostmig.js';   // wave 4: host migration (docs/wave4/hostmig.md)


















import { installCosm5 } from './cosm5.js';   // wave 4: cosmetics drop (suits/hats/backs/weapon skins/emotes; docs/wave4/cosm5.md)


// [import:checkup]








// [import:ui2]










import { installGuide } from './guide.js';   // wave 4: Algorithm advisor + first-landing tutorial (docs/wave4/guide.md)

import { installDaily } from './daily.js';   // wave 4: login calendar, daily/weekly challenges, crates, season track (docs/wave4/daily.md)

import { installEggs } from './eggs.js';   // wave 4: easter eggs on moons + menu cell secrets (docs/wave4/eggs.md)



export class Game extends Emitter {
  constructor({ engine, audio, settings, profile, ui, input, mods }) {
    super();
    this.engine = engine; this.audio = audio; this.settings = settings; this.ui = ui; this.input = input;
    this.mods = mods;
    this.profile = profile;
    this.progress = new Progress(this, profile);
    this.camera = engine.camera;
    this.scene = engine.scene;
    this.time = 0;
    this.physics = new Physics();
    this.lights = new LightPool(this.scene);
    this.env = new Environment(engine, this.lights, audio);
    this.items = new ItemManager(this);
    this.creatures = new CreatureManager(this);
    this.remotes = new Map();
    this.world = { ship: null, facility: null, outdoor: null, company: null, terrain: null, moonId: null, seed: 0 };
    this.run = null;          // replicated run state
    this.config = { maxPlayers: 4, inventorySlots: 4, quotaMul: 1, dangerMul: 1, dayLengthSec: 720, bigHeads: false, freeTravel: true };
    this.infiniteSprint = false;
    this.mapT = 1;            // landing/takeoff animation progress
    this.stateTimer = 0;
    this.scanLabels = [];
    this.scanWave = null;
    this.terminal = new Terminal(this);
    this.grab = null;
    this.minigame = null;
    this.spectateIdx = 0;
    this.ship = buildShip({ physics: this.physics, lightPool: this.lights, scene: this.scene });
    this.world.ship = this.ship;
    this.player = new LocalPlayer(this);
    this.viewModel = null;
    try { this.viewModel = createViewModel({ suitColor: suitColor(profile.suit) }); this.camera.add(this.viewModel.root); } catch (e) { console.warn('viewmodel', e); }
    this.heldVisual = null;
    this.voice = new VoiceChat(this);
    this.emotes = new EmoteSystem(this);
    this.objectives = new Objectives(this);
    this.audio.occluder = (p) => this.occlusionAt(p);
    this.hostData = null;
    this.lootFx = installLootFx(this);   // loot beams over affixed items (self-updating via mods 'update')
    this.particles = new Particles(this.engine.scene);   // pooled blood / sparks / dust bursts (render/particles.js)
    this.scanFx = new ScanFx(this);   // LC-style scan: expanding sphere + surface shell + staggered label pop-in (render/particles.js)
    this.hitstopT = 0;
    this.bosses = installBosses(this);   // The Foreman: registration, host AI glue, model, HP bar (self-updating via mods events)
    this.achievements = installAchievements(this);   // achievements, titles, daily login (observes mods/progress, disposed in destroy)
    try { this.meta = installMeta(this); } catch (e) { console.warn('meta layer', e); this.meta = null; }   // codex, daily events, weekly challenge, rebirth, crew, Service Record (J)
    try { this.shipFeatures = installShipFeatures(this); } catch (e) { console.warn('ship features', e); this.shipFeatures = null; }
    try { this.cruiser = installCruiser(this); } catch (e) { console.warn('cruiser', e); this.cruiser = null; }
    this.netstats = installNetStats(this);   // terminal NETSTATS / chat /net
    // ---- WAVE 1 modules (docs/MASTERPLAN.md): this.useModule(name, installFn) stores game[name], disposes on destroy ----
    this.wave1 = [];
    this.useModule('inventory', installInventory);

    this.useModule('facilitysys', installFacilitySystems);

    this.useModule('balance', installBalance);

    this.useModule('magic', installMagic);

    this.useModule('rpg', installRpg);

    this.useModule('shop', installShop);

    this.useModule('crafting', installCrafting);

    this.useModule('lore', installLore);

    this.useModule('horde', installHorde);

    this.useModule('worldx', installWorldX);

    this.useModule('fun', installFun);


    this.useModule('brlevels', installBackroomsLevels);


    this.useModule('backrooms', installBackrooms);


    this.useModule('brcreatures', installBackroomsCreatures);


    this.useModule('liminal', installLiminal);


    this.useModule('combat', installCombat);


    this.useModule('siege', installSiege);


    // [slot:bugfix]
    this.useModule('bugfix', installBugfix);


    this.useModule('anomaly', installAnomaly);


    this.useModule('forge', installForge);


    this.useModule('music', installMusic);
    this.useModule('cvoice', installSfx);   // [sfx] stored as game.cvoice: game.sfx is the core sound-effect FUNCTION and must not be shadowed


    // [slot:gameplay2]
    this.useModule('gameplay2', installGameplay2);


    // [slot:shipyard]
    this.useModule('shipyard', installShipyard);


    this.useModule('skeletons', installSkeletons);


    this.useModule('cemotes', installCreatureEmotes);


    this.useModule('fpbody', installFpBody);


    this.useModule('grenades', installGrenades);


    this.useModule('durability', installDurability);   // [durability]


    this.useModule('mirror', installMirror);


    // [slot:avatar2]


    // [slot:trade]
    this.useModule('trade', installTrade);


    this.useModule('boardgame', installBoardGame);   // [boardgame]


    this.useModule('secureloot', installSecureLoot);
    this.useModule('lockpick2', installLockpick2);   // wave 5: swaps the 'lockpick' minigame (after secureloot)


    this.useModule('maps2', installMaps2);


    this.useModule('food', installFood);


    // [slot:homeworld]
    this.useModule('homeworld', installHomeworld);

    this.useModule('homeworld2', installHomeworld2);


    // [slot:pets]
    this.useModule('pets', installPets);


    this.useModule('cycle', installCycle);   // [cycle]


    // [slot:cycle3]
    this.useModule('cycle3', installCycle3);


    this.useModule('worlds2', installWorlds2);   // [worlds2]
    this.useModule('maps5', installMaps5);   // [slot:maps5]
    this.useModule('algo1', installAlgo1);   // [slot:algo1]

    this.useModule('polish4', installPolish4);   // [polish4]


    this.useModule('arcade', installArcade);


    this.useModule('social', installSocial);   // [social]


    this.useModule('stealth', installStealth);


    this.useModule('ship2', installShip2);   // [ship2] (after gameplay2 / shipyard / siege / food / worlds2: it wraps hostFinishTakeoff and reads game.deployables)


    this.useModule('horror', installHorror);


    this.useModule('survival', installSurvival);   // [survival]


    this.useModule('voyage', installVoyage);   // [voyage]


    // [slot:ux]
    this.useModule('hostmig', installHostMig);


















    this.useModule('cosm5', installCosm5);   // [slot:cosm5]


    // [slot:checkup]








    // [slot:ui2]










    this.useModule('guide', installGuide);   // [guide] installed last: wraps the terminal / ALGO command of the modules above

    this.useModule('daily', installDaily);

    this.useModule('eggs', installEggs);

    this.useModule('onboard', installOnboard);   // [slot:onboard] wave 5: Hiring Day + staged unlocks (installed last: wraps hostLever / terminalCommand / objectives.compute)


  }

  get stats() {
    if (!this._stats) {
      this._stats = derivedStats(this.profile);
      this.mods?.emit('stats', this._stats, this);
    }
    return this._stats;
  }
  refreshStats() { this._stats = null; }
  hasPerk(id) { return hasPerk(this.profile, id); }
  itemDefOf(t) { return itemDef(t); }
  get isHost() { return this.net?.isHost; }
  get selfId() { return this.net?.selfId; }

  // ------------------------------------------------------------------ session
  async startSession(opts) {
    this.opts = opts;
    this.config.maxPlayers = opts.maxPlayers || this.config.maxPlayers;
    this.mods?.emit('configure', this.config, this);
    this.net = new Session({
      strategy: opts.strategy, isHost: opts.host, code: opts.code, password: opts.password,
      profile: this.profile, maxPlayers: this.config.maxPlayers,
    });
    this.installNetHandlers();
    this.director = installDirector(this);
    this.pings = installPings(this);
    await this.net.start(this.helloData());
    if (opts.host) {
      this.hostInit(opts.runData, opts.slot);
    } else {
      this.ui.toast(tf('Connecting to lobby {code}...', { code: opts.code }));
      this.joinTimeout = setTimeout(() => { if (!this.net.connected) this.emit('fatal', 'Could not reach the host. Check the lobby code / network mode.'); }, 25000);
    }
    this.setupVoice();
    return this;
  }

  // Never grab the microphone silently: on Windows, opening a Bluetooth headset's mic switches it to
  // the low-quality "hands-free" profile and the normal stereo output can go silent.
  setupVoice() {
    const s = this.settings;
    if (this.opts?.strategy === 'local') { this.ui.toast(t('Local (same PC) mode: voice chat is not carried between tabs. Use an Online P2P network for voice.'), 'info'); return; }
    if (!s.micEnabled || s.micConsent === 'no') { this.ui.toast(t('Voice chat: listening only (enable your mic in Settings > Voice).'), 'info'); return; }
    if (s.micConsent === 'yes') { this.enableMic(); return; }
    setTimeout(() => { if (!this.net) return; this.ui.askVoice(this); }, 1200);
  }
  enableMic() {
    return this.voice.startMic().then(() => {
      if (!window.isSecureContext) this.ui.toast(t('Voice chat needs HTTPS (or localhost). You can still hear others.'), 'bad');
      else if (this.voice.micError) this.ui.toast(tf('Microphone unavailable: {micError}', { micError: this.voice.micError }), 'bad');
      else if (this.voice.enabled) this.ui.toast(this.settings.voiceMode === 'ptt' ? t('Voice chat on (hold V to talk).') : t('Voice chat on (open mic).'), 'good');
    }).catch(() => {});
  }

  helloData() {
    const p = this.profile;
    return { name: p.name, level: p.level, suit: p.suit, hat: p.hat, face: p.face || 'none', back: p.back || 'none', pid: p.id, title: titleOf(p), mods: this.mods?.enabledIds() || [], av: liteOf(p) };   // face/back: wardrobe accessories (old clients ignore them)
  }

  installNetHandlers() {
    const net = this.net;
    installProfileSync(this, net);   // [profile] nickname / avatar sync ('pf')
    net.on('playerJoin', (id, info, resume) => this.hostOnPlayerJoin(id, info, resume));
    net.on('peerHello', () => {});
    net.on('peerLeave', (id, p) => {
      if (this.isHost) this.hostOnPlayerLeave(id);
      const r = this.remotes.get(id);
      if (r) { this.ui.toast(tf('{name} left the ship.', { name: r.name })); r.dispose(); this.remotes.delete(id); }
      this.voice.removePeer(id);
    });
    net.on('hostLeft', (why) => this.hostmig?.onHostLeft?.(why) || this.emit('fatal', t(why === 'timeout' ? 'Lost connection to the host (network problem, could not reconnect). Session ended.' : 'The host has left. Session ended.')));
    // connection loss is not a leave: the player record / avatar / items stay for ~45 s while the link is re-established
    net.on('peerLost', (id, p) => {
      if (id === net.hostId && !net.isHost) this.ui.toast(t('Connection to the host lost - trying to reconnect...'), 'bad');
      else this.ui.toast(tf('{name}: connection lost, waiting for them to come back...', { name: p?.name || this.remotes.get(id)?.name || '?' }), 'bad');
      this.voice.removePeer(id);
    });
    net.on('peerResume', (id, info) => {
      if (id === net.hostId && !net.isHost) this.ui.toast(t('Reconnected to the host.'), 'good');
      else this.ui.toast(tf('{name} reconnected.', { name: info?.name || this.remotes.get(id)?.name || '?' }), 'good');
    });
    net.on('peerStall', (id, idle) => { if (id === net.hostId && !net.isHost) this.ui.toast(t('Network unstable: no data from the host...'), 'bad'); });
    net.on('error', (e) => {
      // Trystero reports a wrong lobby password as a join error; without this the joiner waits 25 s for a misleading timeout
      const msg = String(e?.error || e || '');
      if (this.net !== net || net.isHost || net.connected || !/password/i.test(msg) || this._pwErrTimer) return;
      this._pwErrTimer = setTimeout(() => {   // grace period: a stray wrong-password peer must not kick a joiner about to be welcomed
        if (this.net === net && !net.connected && !this.destroyed) { clearTimeout(this.joinTimeout); this.emit('fatal', 'Wrong lobby password (or this lobby has no password - leave the box empty).'); }
      }, 6000);
    });
    net.on('rejected', (reason) => this.emit('fatal', 'Join rejected: ' + reason));
    net.on('stream', (stream, id) => this.voice.addPeerStream(stream, id));
    net.on('binary', (buf, from, meta) => this.voice.onBinary(buf, from, meta));

    net.on_('welcome', (d) => this.onWelcome(d));
    net.on_('gs', (d) => this.applyRunState(d));
    net.on_('phase', (d) => this.onPhase(d));
    net.on_('it', (d) => this.items.onEvent(d));
    net.on_('itst', (d, from) => { if (from !== this.selfId) this.items.onState(d); });
    net.on_('is', (d, from) => { if (from !== this.selfId) this.items.applySnapshot(d); });
    net.on_('cev', (d) => this.creatures.onEvent(d));
    net.on_('cs', (d) => this.creatures.applySnapshot(d));
    net.on_('ps', (d, from) => this.onPlayerState(d, from));
    net.on_('pinfo', (d, from) => { const r = this.ensureRemote(from, d); r?.setInfo(d); });
    net.on_('pst', (d, from) => this.onPlayerStatus(d, from));
    net.on_('door', (d) => this.onDoor(d));
    net.on_('hurt', (d) => this.onHurt(d));
    net.on_('fx', (d, from) => this.onFx(d, from));
    net.on_('chat', (d, from) => this.onChat(d, from));
    net.on_('sys', (d) => this.ui.systemMessage(sysText(d), d.kind));   // d.k/d.v: every peer localises host messages itself
    net.on_('xp', (d) => this.onReward(d));
    net.on_('power', (d) => this.setPower(d.on, true));
    net.on_('term', (d) => this.terminal.onRemote(d));
    net.on_('sell', (d) => this.onSellResult(d));
    net.on_('summary', (d) => this.ui.showDaySummary(d, this));
    net.on_('latch', (d) => this.onLatch(d));
    net.on_('stun', (d) => { this.player.stunT = Math.max(this.player.stunT, d.t); this.engine.fx.noise = 0.5; setTimeout(() => (this.engine.fx.noise = 0), 600); });
    net.on_('slow', (d) => { this.player.slowT = Math.max(this.player.slowT, d.t); });
    net.on_('hold', (d) => { this.heldBy = { pos: new THREE.Vector3().fromArray(d.p), t: 0.3 }; });
    net.on_('tp', (d) => { this.player.teleport(new THREE.Vector3().fromArray(d.p), d.yaw); this.psTimer = 0; });
    net.on_('fired', (d) => this.onFired(d));
    net.on_('quotamet', (d) => this.ui.showQuotaMet?.(d, this));
    net.on_('modmsg', (d, from) => this.mods?.emit('message', d, from));
    net.on_('pickfail', (d) => this.onPickFail(d.id, d));
    // host says a player left (covers crewmates we never had a direct link to, e.g. created from the welcome roster)
    net.on_('pleft', (d) => {
      const id = d?.id;
      if (!id || id === this.selfId) return;
      const r = this.remotes.get(id);
      if (r) { r.dispose(); this.remotes.delete(id); }
      this.voice.removePeer(id);
      this.net.players.delete(id);
    });
    this.cruiser?.bindNet(net);
    this.mods?.emit('netReady', net, this);
  }

  ensureRemote(id, info) {
    if (id === this.selfId) return null;
    let r = this.remotes.get(id);
    if (!r) {
      r = new RemotePlayer(this, id, info || {});
      this.remotes.set(id, r);
      if (info?.name) this.ui.toast(tf('{name} joined the ship.', { name: info.name }));
    }
    return r;
  }

  onWelcome(d) {
    clearTimeout(this.joinTimeout);
    clearTimeout(this._pwErrTimer);
    const resume = !!d.resume && !!this.run;   // reconnect after a dropped link: resync the world, keep our position and inventory
    if (!resume) this.ui.toast(t('Connected! Welcome aboard.'));
    this.config = { ...this.config, ...(d.config || {}) };
    for (const p of d.players || []) if (p.id !== this.selfId) { const r = this.ensureRemote(p.id, p); if (p.dead) r.setDead(true); if (p.st) r.applyState(p.st); }
    this.applyRunState(d.run, true);
    this.loadMapFor(d.run, true);
    if (resume) {
      for (const it of [...this.items.all()]) if (it.holder !== this.selfId) this.items.onEvent({ e: 'rm', id: it.id });   // stale copies; what we carry stays
      this.creatures.clearAll();
    } else this.items.clearAll();
    // creatures first: items carried by a creature ('c:<id>' holder) attach to its view on spawn
    for (const c of d.creatures || []) this.creatures.onEvent(c);
    for (const it of d.items || []) this.items.onEvent({ e: 'sp', ...it });
    // late joiners: lit glowsticks, playing boomboxes, burning flares...
    for (const it of this.items.all()) if (it.on) { try { this.onItemState(it); } catch (e) { console.warn('item state', e); } }
    for (const dr of d.doors || []) this.onDoor(dr);
    this.setPower(d.run.powerOn !== false, false);
    this.ship.door.setOpen(!!d.shipDoor);
    if (resume) { this.ui.toast(t('Reconnected - world state resynced.'), 'good'); return; }
    this.spawnInShip();
    if (d.run.phase === 'moon' || d.run.phase === 'company') this.requestLoadout();
    this.tutorialHint(d.run.phase);
    this.emit('joined');
  }

  // ------------------------------------------------------------------ run state & phases
  applyRunState(d, silent = false) {
    const prev = this.run ? { credits: this.run.credits } : null;
    if (this.run) Object.assign(this.run, d); else this.run = { ...d };
    // endless moons: (re)register the generated sector for run.runId + run.quotaIndex on every peer (also resolves a saved generated run.moon after reload)
    const sector = ensureSector(this.run);
    if (sector?.changed && sector.prevKey && !silent) { const a = sectorAnnouncement(sector); this.ui.hud?.bigText(a.title, a.sub); this.ui.toast(a.toast, 'good'); }
    if (!silent && prev && d.credits !== undefined && d.credits !== prev.credits) this.ui.hud?.pulse('credits');
    if (d.upgrades) this.refreshStats();
    this.ui.hud?.setRun(this.run);
  }

  onPhase(d) {
    const prevPhase = this.run?.phase;
    this.applyRunState(d, true);
    this.stateTimer = 0;
    const ph = d.phase;
    if (ph === 'landing') {
      this.secondWindUsed = false;   // Second Wind perk: once per trip
      this.loadMapFor(this.run, false);
      this.mapT = 0;
      this.ship.door.setOpen(false);
      this.audio.play('ship_thrusters', { volume: 0.8, bus: 'sfx' });
      this.engine.shake(0.4);
      this.ui.hud?.bigText(MOONS[this.run.moon]?.name || '', this.run.weather ? `Weather: ${this.run.weather.toUpperCase()}` : '');
    } else if (ph === 'moon' || ph === 'company') {
      this.mapT = 1;
      this.audio.play('ship_land', { volume: 0.9 });
      this.engine.shake(0.7);
      this.env.landingT = 1;
      this.requestLoadout();
    } else if (ph === 'takeoff') {
      this.mapT = 1;
      this.ship.door.setOpen(false);
      this.audio.play('ship_takeoff', { volume: 0.9 });
      this.engine.shake(0.5);
      this.unloadColliders();
    } else if (ph === 'orbit') {
      this.ship.door.setOpen(false);   // e.g. after the FIRED airlock cinematic
      this.unloadMap();
      this.env.setSpace(this.planetColorFor(this.run.moon));
      this.env.landingT = 0;
      if (this.player.dead) this.respawn();
      if (prevPhase === 'takeoff' && this.player.pos.y < -50) this.spawnInShip();
    } else if (ph === 'fired') {
      // handled by onFired
    }
    this.updateAmbience();
    this.tutorialHint(ph);
    this.mods?.emit('phase', ph, this);
  }

  // first-time player hints (LC-style onboarding)
  tutorialHint(ph) {
    const t = (this.profile.tutorial = this.profile.tutorial || {});
    const show = (key, lines, delay = 1500) => {
      if (t[key]) return;
      t[key] = true;
      this.progress.save();
      lines.forEach((l, i) => setTimeout(() => this.ui.toast('💡 ' + l, 'info'), delay + i * 3800));
    };
    if (ph === 'orbit') show('orbit', ['Use the TERMINAL (E) - type MOONS, then ROUTE <moon>.', 'Buy tools with STORE / BUY (a flashlight is a good start).', 'Pull the LEVER to land. You have until midnight.']);
    if (ph === 'moon') show('moon', ['Scrap is inside the facility. Follow the path to the MAIN ENTRANCE.', 'Right-click to SCAN for scrap and creatures. Scan monsters to learn their rules.', 'Bring scrap back to the ship. The ship leaves at MIDNIGHT - with or without you.'], 3000);
    if (ph === 'company') show('company', ['Put scrap on the COUNTER, then ring the BELL to sell.', 'Buy personal gear from Phish Dayı (Black Market). Take BOUNTIES from the board.', 'Meet the quota before the deadline or you are fired.'], 2500);
  }

  planetColorFor(moonId) {
    const m = MOONS[moonId];
    const b = m ? BIOMES[m.biome] : null;
    return b?.planet ?? b?.sky ?? 0x44664f;
  }

  loadMapFor(run, instant) {
    const moonId = run.moon;
    const needMap = ['landing', 'moon', 'company', 'takeoff'].includes(run.phase);
    if (!needMap) { this.unloadMap(); this.env.setSpace(this.planetColorFor(moonId)); this.env.landingT = 0; return; }
    if (this.world.moonId === moonId && this.world.seed === run.seed) return;
    this.unloadMap();
    const moon = MOONS[moonId];
    this.world.moonId = moonId; this.world.seed = run.seed;
    if (!moon) { this.world.moonId = null; if (!this.mods?.missingMoon?.(this, moonId)) this.emit('fatal', 'Unknown moon "' + moonId + '" - enable the same mods as the host.'); return; }
    if (moon.company) {
      this.world.company = buildCompany({ physics: this.physics, lightPool: this.lights });
      this.scene.add(this.world.company.group);
      this.world.mapGroup = this.world.company.group;
      this.env.setMoon(BIOMES.pier, run.weather || 'clear', 'company');
      this.companyNpc();
    } else if (moon.customMap) {   // [hw] homeworld: own outdoor map, no facility
      const outdoor = moon.customMap(run.seed, moon, { physics: this.physics, lightPool: this.lights, biome: BIOMES[moon.biome] });
      this.world.outdoor = outdoor; this.world.terrain = outdoor.terrain;
      this.scene.add(outdoor.group);
      this.world.mapGroup = outdoor.group;
      this.env.setMoon(BIOMES[moon.biome], run.weather || 'clear', 'moon');
    } else {
      const outdoor = buildMoonOutdoor(run.seed, moon, { physics: this.physics, lightPool: this.lights });
      this.world.outdoor = outdoor; this.world.terrain = outdoor.terrain;
      this.scene.add(outdoor.group);
      this.world.mapGroup = outdoor.group;
      const layout = generateLayout(run.seed, moon.interior, moon.size, moon.layoutOpts);   // [cycle] Sector Core / Raid / Keystone moons carry layoutOpts
      const fac = buildFacility(layout, { physics: this.physics, lightPool: this.lights });
      this.world.facility = fac;
      this.env.interiorFog = fac.atmosphere || null;   // per-theme indoor haze (backrooms yellow, sewer green, server farm blue)
      this.scene.add(fac.group);
      this.env.setMoon(BIOMES[moon.biome], run.weather || 'clear', 'moon');
      this.weatherMud = run.weather === 'rainy' || run.weather === 'stormy';
    }
    this.env.landingT = instant ? 1 : 0;
    if (!instant && this.world.mapGroup) this.world.mapGroup.position.y = -260;
    this.mods?.emit('mapLoaded', this.world, this);
  }

  companyNpc() {
    // merchant + company tentacles are visual-only creature views (not host AI)
    const c = this.world.company;
    try {
      const { createCreatureModel } = this._creatureModelMod || {};
      void createCreatureModel;
    } catch { /* ignore */ }
    import('../models/creatures.js').then(({ createCreatureModel }) => {
      if (this.world.company !== c) return;
      try {
        const npc = createCreatureModel('kefaldayi', { seed: 3 });
        npc.root.position.copy(c.npcPos); npc.root.rotation.y = -Math.PI / 2;
        c.group.add(npc.root);
        c.npc = npc;
        const tent = createCreatureModel('company', { seed: 1 });
        tent.root.position.copy(c.dropZone).add(new THREE.Vector3(0, -1.0, -1.2));
        c.group.add(tent.root);
        c.tentacles = tent; c.tentT = 0; c.tentState = 'hidden';
      } catch (e) { console.warn('npc', e); }
    });
  }

  unloadColliders() {
    // at takeoff the moon's colliders go away (players are sealed inside the ship)
    const w = this.world;
    if (w.outdoor) { for (const c of w.outdoor.colliders) this.physics.removeCollider(c); w.outdoor.colliders.length = 0; }
    if (w.company) { for (const c of w.company.colliders) this.physics.removeCollider(c); w.company.colliders.length = 0; }
  }

  unloadMap() {
    const w = this.world;
    if (!w.moonId) return;
    w.facility?.dispose(this.physics);
    w.outdoor?.dispose(this.physics);
    w.company?.dispose(this.physics);
    w.facility = null; w.outdoor = null; w.company = null; w.terrain = null; w.moonId = null; w.mapGroup = null;
    this.creatures.clearAll();
    // remove items outside the ship
    for (const it of [...this.items.all()]) {
      if (it.state === 'world' && !insideShip(it.obj.position)) { it.dispose(); this.items.items.delete(it.id); }
    }
    this.lights.globalDim = 1;
    this.env.indoor = false;
  }

  // ------------------------------------------------------------------ doors & power
  doorById(id) { return this.world.facility?.doors.find((d) => d.id === id); }
  onDoor(d) {
    if (d.id === 'ship') { this.ship.door.setOpen(d.open); this.audio.at(d.open ? 'ship_door_open' : 'ship_door_close', new THREE.Vector3(SHIP.door.x, 1.3, SHIP.z1), 0.9); return; }
    const door = this.doorById(d.id);
    if (!door) return;
    const changed = door.open !== d.open;
    door.open = d.open;
    if (d.locked !== undefined) door.locked = d.locked;
    const nav = this.world.facility.nav;
    if (door.kind === 'blast' || door.kind === 'vault' || door.kind === 'door') {
      if (door.open || (!door.locked && door.kind === 'door')) nav.blockedEdges.delete(door.info.key); else nav.blockedEdges.add(door.info.key);
    }
    if (changed && !d.silent) {
      const snd = door.kind === 'blast' ? 'blast_door' : door.kind === 'vault' ? 'vault_open' : door.open ? 'door_open' : 'door_close';
      this.audio.at(snd, door.pos.clone().add(new THREE.Vector3(0, 1.2, 0)), 0.9, { occlude: true });
    }
  }

  // animate facility doors and toggle their colliders
  updateDoors(dt) {
    const fac = this.world.facility;
    if (!fac) return;
    for (const d of fac.doors) {
      if (!d.colArgs && d.kind !== 'blast') continue;
      const target = d.open ? 1 : 0;
      if (d.t === target && d.applied) continue;
      const speed = d.kind === 'blast' ? 0.9 : d.kind === 'vault' ? 0.5 : 3.2;
      d.t += Math.sign(target - d.t) * Math.min(Math.abs(target - d.t), dt * speed);
      d.applied = true;
      const a = d.anchors || {};
      const e = d.t * d.t * (3 - 2 * d.t);
      if (a.hinge) a.hinge.rotation.y = (a.hinge.userData.openAngle ?? 1.6) * e;
      for (const leaf of [a.leafL, a.leafR]) {
        if (!leaf) continue;
        if (!leaf.userData.basePos) leaf.userData.basePos = leaf.position.clone();
        const off = leaf.userData.openOffset || [0, 0, 0];
        leaf.position.set(leaf.userData.basePos.x + off[0] * e, leaf.userData.basePos.y + off[1] * e, leaf.userData.basePos.z + off[2] * e);
      }
      if (d.t > 0.45 && d.collider) {
        this.physics.removeCollider(d.collider);
        const i = fac.colliders.indexOf(d.collider); if (i >= 0) fac.colliders.splice(i, 1);
        d.collider = null;
      } else if (!d.collider && d.colArgs && !d.open && d.t < 0.45 && doorwayBusy(this.physics, d.colArgs)) {
        d.t = 0.45;   // safety sensor: never close a door onto somebody standing in it (a collider made inside a capsule = stuck in the wall)
      } else if (d.t < 0.3 && !d.collider && d.colArgs) {
        d.collider = this.physics.addStaticBox(d.colArgs[0], d.colArgs[1], d.colArgs[2], d.colArgs[3] / 2, d.colArgs[4] / 2, d.colArgs[5] / 2, 0, G.DOOR, { kind: 'door', door: d });
        fac.colliders.push(d.collider);
      }
    }
  }

  setPower(on, announce) {
    this.lights.globalDim = on ? 1 : 0;
    if (this.run) this.run.powerOn = on;
    if (announce) {
      this.audio.play(on ? 'power_up' : 'power_down', { volume: 0.9 });
      if (this.player.indoor) this.ui.toast(on ? t('Power restored.') : t('The lights go out...'), on ? 'good' : 'bad');
    }
  }

  // ------------------------------------------------------------------ players
  aiPlayers() {
    // host view of every player for AI
    if (!this._aiCache || this._aiCacheT !== this.time) {
      const out = [];
      const me = this.player;
      const mk = (id, pos, eyeY, yaw, pitch, dead, flags, noise, voice, flash, extra = {}) => {
        const look = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
        const inFacility = pos.y < FACILITY_Y + 40;
        return {
          id, pos: pos.clone(), eye: new THREE.Vector3(pos.x, pos.y + eyeY, pos.z), look, dead, crouch: !!(flags & 1),
          zone: inFacility ? 'in' : 'out', inShip: insideShip(pos), noise, voice, flash, ...extra,
        };
      };
      if (this.selfId) out.push(mk(this.selfId, me.pos, me.eye, me.yaw, me.pitch, me.dead, me.crouch ? 1 : 0, me.noise, this.voice.localLevel, this.flashlightOn(), { latched: !!me.latched, heldNest: this.heldNestIds() }));
      let nests = null;
      if (this.isHost) {
        // the host knows who holds which nest item from its own item state (ps.hn from clients can be stale or missing)
        for (const it of this.items.all()) if (it.nest && it.holder && it.holder !== this.selfId) ((nests ||= new Map()).get(it.holder) || nests.set(it.holder, []).get(it.holder)).push(it.nest);
      }
      for (const r of this.remotes.values()) out.push(mk(r.id, r.pos, r.crouch ? 1.0 : 1.62, r.yaw, r.pitch, r.dead, r.flags, r.noise, r.voiceLevel, r.flashOn, { latched: !!r.latched, heldNest: (this.isHost ? nests?.get(r.id) : r.heldNest) || null }));
      this._aiCache = out; this._aiCacheT = this.time;
    }
    return this._aiCache;
  }
  aiPlayerById(id) { return this.aiPlayers().find((p) => p.id === id); }
  playerHeadById(id) {
    if (id === this.selfId) return this.player.eyePos();
    const r = this.remotes.get(id);
    return r ? r.headPos(new THREE.Vector3()) : null;
  }
  playerName(id) {
    if (id === this.selfId) return this.profile.name;
    return this.remotes.get(id)?.name || this.net?.players.get(id)?.name || 'Employee';
  }
  heldNestIds() {
    const out = [];
    for (const id of this.player.slots) { const it = id && this.items.get(id); if (it?.nest) out.push(it.nest); }
    return out.length ? out : null;
  }
  flashlightOn() {
    for (const id of this.player.slots) { const it = id && this.items.get(id); if (it && (it.type === 'flashlight' || it.type === 'proflash') && it.on && it.battery > 0) return true; }
    return false;
  }
  hasActiveWalkie(peerId) {
    if (peerId === this.selfId) return this.player.slots.some((id) => { const it = id && this.items.get(id); return it?.type === 'walkie' && it.on && it.battery > 0; });
    const r = this.remotes.get(peerId);
    return !!r?.walkie;
  }

  onPlayerState(d, from) {
    const r = this.ensureRemote(from, this.net.players.get(from));
    if (!r) return;
    r.applyState(d);
    if (d.hn) r.heldNest = d.hn; else r.heldNest = null;
  }
  onPlayerStatus(d, from) {
    if (from === this.selfId) return;
    const r = this.ensureRemote(from, this.net.players.get(from));
    if (!r) return;
    if (d.dead !== undefined && d.dead !== r.dead) {
      r.setDead(d.dead);
      if (d.dead) {
        this.ui.systemMessage(`${r.name} ${this.deathText(d.cause)}`, 'bad');
        this.audio.at('death', r.pos.clone().add(new THREE.Vector3(0, 1, 0)), 0.8, { occlude: true });
        if (this.isHost) this.hostOnPlayerDied(from, d);
      }
    }
    if (d.hp !== undefined) r.hp = d.hp;
  }
  deathText(cause) {
    const map = {
      fall: 'fell to their death.', lurker: 'had their neck snapped.', jester: 'was caught by the music box.', giant: 'was eaten by a giant.',
      sandkefal: 'was swallowed by The Worm.', turret: 'was shot by a turret.', explosion: 'was blown up.', left: 'was left behind.',
      void: 'fell into the void.', leech: 'suffocated.', hound: 'was mauled by a hound.', mimic: 'was killed by... themselves?',
      mimicdoor: 'opened the wrong door.', ejected: 'was ejected.', mannequin: 'blinked.', crawler: 'was flattened by a crawler.',
      scuttler: 'was nibbled to death.', spider: 'got wrapped up for later.', screamer: 'was screamed to death.', scream: 'was screamed to death.',
      sludge: 'was dissolved.', yoinker: 'touched the wrong pile of junk.', crewmate: 'was bonked by a crewmate.', electric: 'was electrocuted.',
      lightning: 'was struck by lightning.', kefalshark: 'was eaten by a land shark.', foreman: 'was flattened by the Foreman.',
      steam: 'was boiled alive by a steam vent.',
      laser: 'walked into a laser grid.', collapse: 'was buried by a cave-in.', toxic: 'dissolved in toxic sludge.',
      cruiser: 'was run over by the Uplink Van.',
    };
    return map[cause] || CREATURES[cause]?.deathText || 'died.';
  }

  respawn() {
    const p = this.player;
    p.dead = false;
    p.hp = this.stats.maxHp; p.stamina = this.stats.maxStamina;
    p.latched = null;
    this.engine.fx.blind = 0; this.engine.fx.noise = 0;
    this.spawnInShip();
    this.net.send('pst', { dead: false, hp: p.hp });
    this.ui.hud?.setDead(false);
    this.spectating = null;
  }
  spawnInShip() {
    let h = 0;
    for (const ch of String(this.selfId || 'x')) h = (h * 31 + ch.charCodeAt(0)) | 0;
    const s = this.ship.spawns[Math.abs(h) % this.ship.spawns.length];
    this.player.teleport(s, Math.PI / 2);
  }

  // ------------------------------------------------------------------ misc helpers
  occlusionAt(p) {
    const cam = this.camera.position;
    const hit = this.physics.raycast(cam, { x: p.x - cam.x, y: p.y - cam.y, z: p.z - cam.z }, 1, G.STATIC | G.DOOR);
    if (!hit) return 0;
    const d = Math.hypot(p.x - cam.x, p.y - cam.y, p.z - cam.z);
    // normalized ray length was 1 unit of the (unnormalized) direction -> hit.distance in [0..1]
    return hit.distance < 0.97 ? (d > 12 ? 1 : 0.6) : 0;
  }

  isLitByFlashlight(pos, range) {
    const check = (eye, look) => {
      const to = pos.clone().add(new THREE.Vector3(0, 1.2, 0)).sub(eye);
      const d = to.length();
      if (d > range) return false;
      return to.normalize().dot(look) > 0.9;
    };
    if (this.flashlightOn() && !this.player.dead && check(this.player.eyePos(), this.player.forward())) return true;
    for (const r of this.remotes.values()) {
      if (!r.flashOn || r.dead) continue;
      const look = new THREE.Vector3(-Math.sin(r.yaw) * Math.cos(r.pitch), Math.sin(r.pitch), -Math.cos(r.yaw) * Math.cos(r.pitch));
      if (check(r.headPos(new THREE.Vector3()), look)) return true;
    }
    return false;
  }

  footstep(pos, vol, local) {
    let surf = 'concrete';
    if (insideShip(pos)) surf = 'metal';
    else if (pos.y < FACILITY_Y + 40) surf = interiorFootstep(this.world.facility, pos) || (this.world.facility?.layout.theme === 'mansion' ? 'wood' : 'concrete');
    else if (this.world.company) surf = 'concrete';
    else if (this.world.terrain) {
      const g = this.world.terrain.biome.ground;
      surf = this.world.terrain.footSurface?.(pos) || (g === 'snow' ? 'snow' : g === 'mud' ? 'mud' : g.includes('sand') ? 'concrete' : 'grass');
    }
    // facility set pieces: splashing through flood water, metal catwalks/stairs
    const spZones = pos.y < FACILITY_Y + 40 ? this.world.facility?.zones : null;
    if (spZones) {
      const splash = stepSoundAt(spZones, pos);
      if (splash) {
        const pitch = 0.85 + Math.random() * 0.3;
        if (local) this.audio.play(splash, { volume: vol * 1.1, bus: 'sfx', pitch });
        else this.audio.at(splash, pos.clone().add(new THREE.Vector3(0, 0.1, 0)), vol * 1.1, { occlude: true, refDistance: 1.5, maxDistance: 30, pitch });
        return;
      }
      surf = surfaceAt(spZones, pos) || surf;
    }
    if (surf === 'concrete' && !insideShip(pos) && pos.y < FACILITY_Y + 40 && this.world.facility?.layout.theme === 'mineshaft') surf = mineshaftFootstep(this.world.facility, pos, (n) => this.audio.has(n));
    surf = footSurface(this, pos, surf);   // carpet / tile / metal / gravel / water from the floor under the foot
    this.lastStepSurface = surf;   // [stealth] the noise of the next steps depends on it (game/stealth.js surfaceMul)
    const name = this.audio.variant('step_' + surf);
    if (local) this.audio.play(name, { volume: vol * 0.8, bus: 'sfx', pitch: 0.95 + Math.random() * 0.1 });
    else this.audio.at(name, pos.clone().add(new THREE.Vector3(0, 0.1, 0)), vol, { occlude: true, refDistance: 1.5, maxDistance: 30 });
  }

  sfx(name, vol = 0.7, pitch) { return this.audio.play(name, { volume: vol, bus: 'sfx', pitch }); }

  updateAmbience() {
    const a = this.audio;
    const ph = this.run?.phase;
    const p = this.player;
    if (!ph || ph === 'orbit') {
      a.setAmbience('base', 'orbit_ambience', 0.35);
      a.setAmbience('ship', 'ship_hum', 0.3);
      a.setEnvironment('ship');
      return;
    }
    if (p.inShip) { a.setAmbience('ship', 'ship_hum', 0.35); a.setEnvironment('ship'); }
    else a.setAmbience('ship', null);
    if (p.indoor) {
      const mansion = this.world.facility?.layout.theme === 'mansion';
      const mine = this.world.facility?.layout.theme === 'mineshaft';
      const amb = interiorAmbience(this.world.facility?.layout.theme);   // new interior themes bring their own mix (null for legacy)
      a.setAmbience('base', amb ? amb.base : mine ? mineshaftAmbience((n) => a.has(n)) : mansion ? 'ambience_mansion' : 'ambience_facility', amb ? amb.vol : mine ? 0.45 : 0.5);
      a.setAmbience('buzz', this.lights.globalDim > 0 && !mansion && !mine ? (amb ? amb.buzz : 'lights_buzz') : null, amb ? amb.buzzVol : 0.12);
      a.setEnvironment(mansion ? 'mansion' : 'facility');
    } else if (this.world.company) {
      a.setAmbience('base', 'wind', 0.25); a.setAmbience('buzz', null);
      if (!p.inShip) a.setEnvironment('company');
    } else {
      const night = (this.run?.time || 480) > 19 * 60;
      a.setAmbience('base', night ? 'crickets' : 'ambience_outdoor', night ? 0.3 : 0.35);
      a.setAmbience('buzz', null);
      if (!p.inShip) a.setEnvironment('outdoor');
    }
  }

  // ------------------------------------------------------------------ main loop
  // One broken stage must never take the whole frame down: an exception before netSend() used to stop this player's
  // state/heartbeat broadcast (peers saw them freeze and "drop") or the host's creature/clock sync. Errors are throttled.
  guard(tag, fn) {
    try { fn(); } catch (e) {
      const now = performance.now(), g = (this._guardT ||= {});
      if (!(now - (g[tag] || 0) < 5000)) { g[tag] = now; console.error('[update:' + tag + ']', e); }
    }
  }

  update(dt) {
    try { this.updateFrame(dt); } finally { this.guard('netSend', () => this.netSend(dt)); }   // netSend ALWAYS runs, exactly once per frame
  }

  updateFrame(dt) {
    // hitstop: a few frames of near-freeze on a confirmed melee hit (local only)
    if (this.hitstopT > 0) { this.hitstopT -= dt; dt *= 0.12; }
    this.particles?.update(dt);
    this.scanFx?.update(dt);
    this.time += dt;
    if (this.scanWave) {
      const w = this.scanWave;
      w.t += dt;
      const u = clamp(w.t / 0.95, 0, 1);
      const eased = 1 - Math.pow(1 - u, 2);
      w.root.scale.setScalar(0.3 + eased * (w.range || 1.35));
      w.mat.opacity = (1 - u) * 0.62;
      if (u >= 1) {
        w.root.removeFromParent();
        w.geo.dispose(); w.mat.dispose();
        this.scanWave = null;
      }
    }
    const p = this.player;
    const input = this.input;
    input.enabled = !this.ui.blocksInput() && !this.minigame && !this.terminal.active;
    // local player
    const zonePrevIndoor = p.indoor, zonePrevShip = p.inShip;
    if (this.heldBy) { this.heldBy.t -= dt; p.teleport(this.heldBy.pos); if (this.heldBy.t <= 0) this.heldBy = null; }
    if (input.enabled) this.emotes.update(dt, input);
    if (!p.dead) {
      // LocalPlayer caps its step at 1/30 s (no giant collision steps); sub-step long frames (low fps, the 20 Hz
      // hidden-tab loop) so movement, stamina and falls keep real-time speed instead of slowing down.
      const n = Math.min(3, Math.max(1, Math.ceil(dt * 30 - 1e-3)));
      for (let i = 0; i < n && !p.dead; i++) p.update(dt / n, input);
    } else this.updateSpectator(dt, input);
    this.emotes.applyCamera();
    p.inShip = insideShip(p.pos);
    p.indoor = p.pos.y < FACILITY_Y + 40;
    this.env.indoor = p.indoor && !p.dead;
    if (zonePrevIndoor !== p.indoor || zonePrevShip !== p.inShip) this.updateAmbience();
    updateThemeOneShots(this, dt);
    // indoors the black fog hides everything past ~40 m: cull it with the far plane
    const far = (p.dead ? this.env.indoor : p.indoor) ? 46 : 420;
    if (this.camera.far !== far) { this.camera.far = far; this.camera.updateProjectionMatrix(); }

    if (!p.dead) this.localActions(dt, input);
    this.updateItemFx();
    this.safetyNets(dt);

    // physics
    this.physics.step(dt, (fdt) => this.grab?.physicsStep(fdt));
    this.guard('items', () => this.items.update(dt));
    this.guard('cruiser', () => this.cruiser?.update(dt));

    // remotes
    for (const r of this.remotes.values()) this.guard('remote', () => r.update(dt));
    // creatures
    if (this.isHost) this.guard('hostUpdate', () => this.hostUpdate(dt));
    this.guard('creatures', () => this.creatures.update(dt));
    if (this.director) this.guard('director', () => { if (this.isHost) this.director.hostUpdate(dt); this.director.update(dt); });
    // ship & map animation
    this.ship.door.update(dt);
    this.shipFeatures?.update(dt);
    this.updateDoors(dt);
    this.world.facility?.setPieces?.update(dt, this);
    this.updateMapAnimation(dt);
    this.world.outdoor?.outposts?.update(dt, this);
    this.world.outdoor?.update?.(dt, this);
    // environment
    if (this.run) this.env.timeMin = this.run.time ?? 480;
    this.env.update(dt, this.camera.position, { onLightning: () => this.onLightning() });
    this.lights.update(dt, this.camera.position);
    this.guard('voice', () => this.voice.update(dt, input));
    this.guard('audio', () => this.audio.update(dt, this.camera));
    this.guard('companyVis', () => this.updateCompanyVisuals(dt));
    this.guard('viewModel', () => this.updateViewModel(dt));
    this.mods?.emit('update', dt, this);
    this.ui.hud?.update(dt, this);
    this.pings?.update(dt);
    this.objectives.update(dt);
    setDocksVisible(!this.ui.hud?.el.classList.contains('hidden'));
  }

  // Falls that should never be deaths: the Company harbour (no sea collider) and the void under the ship in
  // orbit / during the FIRED cinematic. Teleport back instead of a 375 m fall to a 'void' death.
  safetyNets() {
    const p = this.player;
    if (p.dead || !this.run) return;
    const ph = this.run.phase;
    const co = this.world.company;
    if (co && ph === 'company' && p.pos.y < Math.min((co.groundY ?? 0) - 3.5, -3) && !insideShip(p.pos)) {
      this.sfx('fish_splash', 0.8);
      this.spawnInShip();
      p.vel?.set(0, 0, 0);
      this.ui.toast(t('The Company fished you out of the harbour.'), 'info');
      return;
    }
    if ((ph === 'orbit' || ph === 'fired') && p.pos.y < -120) { this.spawnInShip(); p.vel?.set(0, 0, 0); }
  }

  updateMapAnimation(dt) {
    const ph = this.run?.phase;
    const g = this.world.mapGroup;
    if (ph === 'landing') {
      this.stateTimer += dt;
      const t = clamp(this.stateTimer / 9, 0, 1);
      const e = 1 - Math.pow(1 - t, 3);
      if (g) g.position.y = -260 * (1 - e);
      this.env.landingT = clamp(t * 1.3, 0, 1);
      this.engine.fx.shake = Math.max(this.engine.fx.shake, 0.15 * (1 - t));
    } else if (ph === 'takeoff') {
      this.stateTimer += dt;
      const t = clamp(this.stateTimer / 7, 0, 1);
      const e = t * t;
      if (g) g.position.y = -300 * e;
      this.env.landingT = 1 - clamp(t * 1.2, 0, 1);
      this.engine.fx.shake = Math.max(this.engine.fx.shake, 0.12);
    } else if (g && g.position.y !== 0 && (ph === 'moon' || ph === 'company')) g.position.y = 0;
  }

  updateCompanyVisuals(dt) {
    const c = this.world.company;
    if (!c) return;
    if (c.npc) {
      const near = this.player.pos.distanceTo(c.npcPos) < 5;
      c.npc.update(dt, { state: this.ui.marketOpen ? 'talk' : 'idle', speed: 0, t: this.time, time: this.time });
      c.npc.root.lookAt(this.player.pos.x, c.npc.root.position.y, this.player.pos.z);
      void near;
    }
    if (c.tentacles) {
      c.tentT += dt;
      const prog = c.tentState === 'grab' ? clamp(c.tentT / 3, 0, 1) : 0;
      c.tentacles.update(dt, { state: c.tentState === 'grab' ? 'grab' : 'hidden', progress: prog, t: c.tentT, time: this.time, speed: 0 });
      if (c.tentState === 'grab' && c.tentT > 3.2) c.tentState = 'hidden';
    }
  }

  // ------------------------------------------------------------------ networking (send)
  netSend(dt) {
    if (!this.net) return;
    this.psTimer = (this.psTimer || 0) - dt;
    if (this.psTimer <= 0) {
      this.psTimer = 1 / 15;
      const p = this.player;
      const held = p.heldItem();
      const flags = (p.crouch ? 1 : 0) | (p.sprinting ? 2 : 0) | (p.grounded ? 0 : 4) | (p.indoor ? 8 : 0) | (p.inShip ? 16 : 0) | (p.dead ? 32 : 0);
      const st = {
        p: [+p.pos.x.toFixed(2), +p.pos.y.toFixed(2), +p.pos.z.toFixed(2)], y: +p.yaw.toFixed(3), pt: +p.pitch.toFixed(2), f: flags,
        h: held?.type || null, fl: this.flashlightOn() ? 1 : 0, n: +(p.noise || 0).toFixed(2), vl: +this.voice.localLevel.toFixed(2),
        sw: +(this.swingAnim || 0).toFixed(2), e: this.emote || null, wk: this.hasActiveWalkie(this.selfId) ? 1 : 0, hp: Math.round(p.hp),
      };
      const hn = this.heldNestIds(); if (hn) st.hn = hn;
      this.lastPs = st;
      // idle players (nothing changed) only send a 4 Hz heartbeat instead of 15 Hz
      const key = JSON.stringify(st);
      this.psIdleT = (this.psIdleT || 0) + 1 / 15;
      if (key !== this._psKey || this.psIdleT >= 0.25) { this._psKey = key; this.psIdleT = 0; this.net.send('ps', st); }
    }
    // physics items I own
    this.itemSnapT = (this.itemSnapT || 0) - dt;
    if (this.itemSnapT <= 0) {
      this.itemSnapT = 1 / 12;
      const list = this.items.collectSnapshot(this.selfId);
      if (list.length) this.net.sendRows('is', list, { eps: 0.004 });
    }
  }

  // ------------------------------------------------------------------ events
  onFx(d, from) {
    if (d.k === 'snd') this.audio.at(d.s, new THREE.Vector3().fromArray(d.p), d.v ?? 1, { occlude: true, refDistance: d.r ?? 3, maxDistance: d.m ?? 60, pitch: d.pt });
    else if (d.k === 'explode') {
      const pos = new THREE.Vector3().fromArray(d.p);
      this.audio.at('explosion', pos, 1.2, { refDistance: 6, maxDistance: 120 });
      const dist = pos.distanceTo(this.camera.position);
      this.engine.shake(clamp(1.5 - dist / 20, 0, 1.2));
      if (dist < 25) this.engine.flash(0xffe0a0, clamp(0.8 - dist / 30, 0, 0.8));
      this.spawnExplosionFx(pos);
    } else if (d.k === 'stunbang') {
      const pos = new THREE.Vector3().fromArray(d.p);
      this.audio.at('stun_bang', pos, 1.2, { refDistance: 6 });
      const eye = this.player.eyePos();
      const dist = pos.distanceTo(eye);
      if (dist < 14 && this.physics.lineOfSight(pos, eye)) {
        const facing = pos.clone().sub(eye).normalize().dot(this.player.forward());
        const amt = clamp((1 - dist / 14) * (facing > 0.3 ? 1 : 0.5), 0, 1);
        this.engine.flash(0xffffff, amt);
        this.player.stunT = Math.max(this.player.stunT, amt * 2.5);
      }
    } else if (d.k === 'spray') this.spawnSpray(d);
    else if (d.k === 'lightning') this.spawnLightningStrike(new THREE.Vector3().fromArray(d.p));
    else if (d.k === 'emote') { /* part of ps */ }
    this.mods?.emit('fx', d, from);
  }

  spawnExplosionFx(pos) {
    const g = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffb040, transparent: true, opacity: 0.9, fog: false }));
    g.position.copy(pos);
    this.scene.add(g);
    const light = this.lights.add({ pos: pos.clone(), color: 0xffa040, intensity: 4, distance: 16, group: 'fx' });
    let t = 0;
    const tick = () => {
      t += 0.016;
      g.scale.setScalar(1 + t * 14);
      g.material.opacity = Math.max(0, 0.9 - t * 2.5);
      light.intensity = Math.max(0, 4 - t * 12);
      if (t < 0.4) requestAnimationFrame(tick); else { g.removeFromParent(); g.geometry.dispose(); this.lights.remove(light); }
    };
    tick();
  }

  spawnLightningStrike(pos) {
    const pts = [];
    let p = pos.clone().add(new THREE.Vector3(0, 80, 0));
    for (let i = 0; i < 12; i++) { pts.push(p.clone()); p = p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 6, -80 / 12, (Math.random() - 0.5) * 6)); }
    pts.push(pos.clone());
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xeef4ff, fog: false }));
    this.scene.add(line);
    this.audio.at(this.audio.variant('thunder'), pos, 1.3, { refDistance: 20, maxDistance: 400 });
    this.audio.at('lightning_strike', pos, 1.2, { refDistance: 8 });
    this.engine.flash(0xdfe8ff, 0.5);
    setTimeout(() => { line.removeFromParent(); line.geometry.dispose(); }, 220);
  }

  onLightning() {
    this.audio.play(this.audio.variant('thunder'), { volume: 0.6 + Math.random() * 0.4, bus: 'amb', delay: 0.5 + Math.random() * 1.5 });
    if (this.isHost) this.hostLightningStrike?.();
  }

  onChat(d, from) {
    this.mods?.emit('chat', d, from, this);
    const name = d.n || this.playerName(from);
    this.ui.chatMessage(name, d.text, from === this.selfId, undefined, avatarOfPeer(this, from, name));   // [profile] tiny avatar icon
    if (from !== this.selfId) this.audio.ui('ui_chat', 0.4);
  }
  sendChat(text) {
    text = String(text).slice(0, 200).trim();
    if (!text) return;
    if (text.startsWith('/') && this.mods?.command(text, this)) return;
    this.net.broadcast('chat', { text, n: this.profile.name });
  }

  onReward(d) {
    if (d.to && d.to !== this.selfId && d.to !== this.profile.id) return;
    this.progress.addXp(d.xp || 0, d.reason);
    if (d.coin) this.progress.addCoins(d.coin, d.reason);
    if (d.bounty) this.progress.bountyEvent(d.bounty.type, d.bounty.target, d.bounty.n || 1);
  }

  onFired(d) {
    this.ui.showFired(d, this);
    this.audio.play('ui_fired', { volume: 0.9 });
    this.ship.door.setOpen(true);
    // everyone gets sucked out of the airlock
    const p = this.player;
    let t = 0;
    const tick = () => {
      t += 0.016;
      if (t < 2.5) { p.vel.set(0, 1.5, 9); requestAnimationFrame(tick); }
    };
    setTimeout(tick, 1200);
    this.engine.fadeTarget = 1;
    setTimeout(() => { this.engine.fadeTarget = 0; }, 6500);
  }

  /** Install a self-contained feature module: fn(game) -> api with optional dispose(). Errors never break the game. */
  useModule(name, fn) {
    try { this[name] = fn(this) || null; if (this[name]) this.wave1.push(name); }
    catch (e) { console.warn('module ' + name, e); this[name] = null; }
    return this[name];
  }

  destroy() {
    clearTimeout(this.joinTimeout); clearTimeout(this._pwErrTimer);
    this.netstats?.dispose(); this.netstats = null;
    for (const n of (this.wave1 || []).reverse()) { try { this[n]?.dispose?.(); } catch (e) { console.warn('dispose', n, e); } this[n] = null; }
    this.achievements?.dispose();
    this.meta?.dispose(); this.meta = null;
    this.director?.dispose(); this.director = null;
    this.pings?.dispose(); this.pings = null;
    this.destroyed = true;
    for (const id of this._timers || []) clearTimeout(id);
    this._timers?.clear();
    this.voice.stopMic();
    this.bosses?.dispose(); this.lootFx?.dispose(); this.particles?.dispose();
    this.items?.dispose?.();   // ItemTools: mod-event listeners, ping rings, ring-light pool lights, warp/noise fx
    this.scanFx?.dispose(); this.scanFx = null;
    this.shipFeatures?.dispose(); this.shipFeatures = null;
    this.cruiser?.dispose(); this.cruiser = null;
    for (const r of this.remotes.values()) r.dispose();
    this.remotes.clear();
    this.net?.leave();
    this.releaseAllItemFx?.();
    this.unloadMap();
    this.items.clearAll();
    this.creatures.clearAll();
    this.audio.stopAll();
    this.terminal.close();
    this.terminal.el?.remove();
    this.emotes?.dispose();
    this.objectives?.dispose();
    this.closeMinigame?.();
    this.viewModel?.root.removeFromParent();
    this._hand?.removeFromParent();
    this.grab?.line.removeFromParent();
    this.player.destroy();
    if (this.scanWave) { this.scanWave.root.removeFromParent(); this.scanWave.geo.dispose(); this.scanWave.mat.dispose(); this.scanWave = null; }
    this.physics.dispose();
    this.clear();
  }
}

Object.assign(Game.prototype, hostMethods, actionMethods);
