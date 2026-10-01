import { addTranslations } from './core/i18n.js';   // [ctrlw]
import '@fontsource/vt323';
import '@fontsource/press-start-2p';
import './ui/style.css';
import './minigames/minigames.css';
import './ui/theme.js';   // [ui2] art direction layer (src/ui/theme.css)
import * as THREE from 'three';
import { Engine } from './core/engine.js';
import { Input } from './core/input.js';
import { AudioManager } from './audio/audio.js';
import { loadSettings, saveSettings, loadProfile, saveProfile, defaultProfile } from './core/save.js';
import { setLang, t, tf } from './core/i18n.js';
import { lobbyCode } from './core/rng.js';
import { initPhysics, Physics } from './physics/physics.js';
import { LightPool } from './render/lightpool.js';
import { Environment } from './world/environment.js';
import { buildShip } from './world/ship.js';
import { UI } from './ui/ui.js';
import { hasEscapeLayer27, installEscape27 } from './ui/escape27.js';
import { ModManager } from './mods/modapi.js';
import { LobbyDirectory } from './net/lobby.js';
import { installHub } from './net/hub.js';   // [social]
import { createHubNotifier } from './ui/panels/hub.js';   // [social]
import { Game } from './game/game.js';
import { FpsProbe, chooseQuality, applyQualityLevel, resolveLevel } from './render/quality.js';   // [perf2]
import { preloadLazyModules } from './game/lazymods.js';   // [perf2] heavy session-only modules are separate chunks
import { setClassicAvatar } from './models/avatar.js';   // [avatar2]
import { ShipScreens } from './game/screens.js';
import { applyA11ySettings } from './game/a11y.js';   // [a11y] wave 7
import { CRTMenu } from './ui/crtmenu.js';
import { loadExtManifest, registerExtSounds } from './audio/extassets.js';
import { preloadExtModels, EXT_PRELOAD } from './world/extmodels.js';
import { registerExtContent } from './game/extcontent.js';
import { parseJoin } from './net/joinlink.js';   // [joinplay]
import './i18n/display.js';   // display-name path: item / creature / moon names go through t()

const DEV_NAME_ALIAS = { Host: 'Janitor101', Client: 'Intern202', Tester: 'Temp303' };   // [algoctx] dev-URL names -> crew-style handles (save.js defaultHandle)
class MenuScene {
  constructor(engine) {
    this.engine = engine;
    this.scene = new THREE.Scene();
    engine.scene = this.scene;
    this.scene.add(engine.camera);
    engine.camera.far = 420; engine.camera.fov = engine.settings.fov; engine.camera.updateProjectionMatrix();
    this.physics = new Physics();
    this.lights = new LightPool(this.scene);
    this.env = new Environment(engine, this.lights, null);
    this.env.setSpace(0x6f8a99);
    this.ship = buildShip({ physics: this.physics, lightPool: this.lights, scene: this.scene });
    this.t = 0;
  }
  update(dt) {
    this.t += dt;
    const cam = this.engine.camera;
    const a = Math.sin(this.t * 0.07) * 0.35;
    cam.position.set(3.2 + Math.sin(this.t * 0.05) * 0.6, 1.55 + Math.sin(this.t * 0.3) * 0.03, 1.4 + Math.cos(this.t * 0.06) * 0.4);
    cam.rotation.order = 'YXZ';
    cam.rotation.set(-0.05 + Math.sin(this.t * 0.11) * 0.03, Math.PI / 2 + 0.18 + a, 0);
    this.env.update(dt, cam.position);
    this.lights.update(dt, cam.position);
  }
  dispose() {
    this.physics.dispose();
    this.scene.traverse((o) => { if (o.geometry) o.geometry.dispose?.(); });
  }
}

// [fastmenu] tiny corner line on the title menu while the ext models load in the background (cleared when done)
function setAssetLine(text) {
  let el = document.getElementById('asset-line');
  if (!text) { el?.remove(); return; }
  if (!el) {
    el = document.createElement('div'); el.id = 'asset-line';
    el.style.cssText = "position:fixed;right:14px;bottom:10px;z-index:11;pointer-events:none;font:18px var(--font,'VT323',monospace);color:var(--green-dim,#1c8f3b);opacity:.8;letter-spacing:1px;text-shadow:0 0 6px rgba(57,255,106,.25)";
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
  }
  el.textContent = text;
}

class App {
  constructor() {
    this.settings = loadSettings();
    setClassicAvatar(!!this.settings.classicAvatar);   // [avatar2]
    applyA11ySettings(this.settings);   // [a11y] palette / UI scale before the first frame
    setLang(this.settings.lang);
    this.profile = loadProfile();
    const devName = new URLSearchParams(location.search).get('name');
    if (devName) this.profile = { ...defaultProfile(), name: DEV_NAME_ALIAS[devName] || devName, id: 'dev-' + devName, _noSave: true };   // [algoctx] harness names never reach the screen ("Host revived Client.")
    this.engine = new Engine(document.getElementById('game'), this.settings);
    this.input = new Input(this.engine.canvas, this.settings);
    this.audio = new AudioManager(this.settings);
    this.mods = new ModManager();
    this.ui = new UI(this);
    this.game = null;
    addTranslations({ 'Fullscreen when playing': 'Oynarken tam ekran', 'Use fullscreen for an immersive view': 'Daha sürükleyici bir görünüm için tam ekran', 'Ask before leaving the page': 'Sayfadan çıkmadan önce sor' }, 'tr');
    addTranslations({ 'Fullscreen when playing': 'Полный экран в игре', 'Use fullscreen for an immersive view': 'Полный экран для погружения', 'Ask before leaving the page': 'Спрашивать перед уходом со страницы' }, 'ru');
    addTranslations({ 'Loading models {d}/{n}': 'Modeller yükleniyor {d}/{n}' }, 'tr');   // [fastmenu]
    addTranslations({ 'Loading models {d}/{n}': 'Загрузка моделей {d}/{n}' }, 'ru');
    // [ctrlw] Ctrl+W (crouch + forward) closes the tab and browsers don't let a page cancel it. 1) ask before leaving while in a game;
    // 2) in fullscreen, Keyboard Lock (Chromium) lets the game receive Ctrl+W / Ctrl+T etc. instead of the browser.
    window.addEventListener('beforeunload', (e) => {
      if (!this.game || this.game.destroyed || this.settings?.confirmLeave === false) return;
      e.preventDefault(); e.returnValue = '';
    });
    document.addEventListener('fullscreenchange', () => {
      try { if (document.fullscreenElement) navigator.keyboard?.lock?.(['KeyW', 'KeyT', 'KeyN', 'KeyR', 'KeyQ']).catch?.(() => {}); else navigator.keyboard?.unlock?.(); } catch { /* unsupported */ }
    });
    this.menu = null;
    this.lobbyDir = null;
    this.last = performance.now();
    this.fpsEl = document.getElementById('fps');
    this.frames = 0; this.fpsT = 0;
  }

  // Browsers only let audio start from a user gesture. Listen for gestures for the whole session:
  // the first one creates the AudioContext, later ones resume it if the browser/OS suspended it.
  installAudioUnlock() {
    const unlock = () => {
      const first = !this.audio.ctx;
      const p = first ? this.audio.init() : Promise.resolve();
      this.audio.resume();
      if (first) p.then(() => { this.audio.resume(); if (this.booted && !this.game) this.startMenuAudio(); }).catch((e) => console.error('audio init', e));
    };
    for (const ev of ['pointerdown', 'keydown', 'touchstart', 'mousedown']) window.addEventListener(ev, unlock, { capture: true });
  }
  startMenuAudio() {
    this.audio.playMusic('menu_theme', 0.5);
    this.audio.setAmbience('ship', 'ship_hum', 0.18);
  }

  async boot() {
    this.installAudioUnlock();
    this.ui.showLoading(t('Loading physics...'));
    await initPhysics();
    this.ui.showLoading(t('Loading assets...'));
    await loadExtManifest();
    registerExtSounds(this.audio);
    // [fastmenu] the title menu no longer waits for the 174 GLBs: ext models -> registerExtContent -> mods run in the background
    // (same order as before, so item registration / SCRAP_TABLE are identical) and startGame() awaits this.assetsReady before any Game exists.
    this.mods.maxPlayersAllowed = () => this.mods.maxPlayers || 4;
    this.assetsDone = false;
    this.assetsProgress = { d: 0, n: 0 };
    this.assetsReady = this.loadAssetsBg();
    this.menu = new CRTMenu(this.engine, this);
    this.ui.hideLoading();
    this.ui.showMenu('title');
    this.bindKeys();
    this.booted = true;
    if (this.settings.quality === 'auto' && !this.settings.qualityAuto && !navigator.webdriver) this.assetsReady.then(() => { if (!this.game) this.qprobe = new FpsProbe(3); });   // [perf2] first boot: 3 s fps probe on the menu scene ([fastmenu] after the background GLB parsing, which would skew it)
    setTimeout(() => preloadLazyModules(), 1200);   // [perf2] prefetch the lazy chunks while the player reads the menu
    try { installHub(this); this.hubNotifier = createHubNotifier(this); } catch (e) { console.warn('[social] hub', e); }   // [social] optional, never blocks the game
    if (this.audio.ctx && !this.game) this.startMenuAudio();
    requestAnimationFrame((t) => this.loop(t));
    this.hiddenLast = performance.now();
    setInterval(() => {
      if (!document.hidden || !this.game) { this.hiddenLast = performance.now(); return; }
      const now = performance.now();
      // browsers throttle a hidden tab's timers to ~1 Hz: catch up in <= 0.1 s steps (max 8) so a hidden HOST keeps the world
      // (creatures, clock, snapshots for the crew) running near real time instead of at 10 % speed
      let rem = Math.min(0.8, (now - this.hiddenLast) / 1000);
      this.hiddenLast = now;
      for (let i = 0; i < 8 && rem > 1e-4 && this.game; i++) {
        const dt = Math.min(0.1, rem); rem -= dt;
        try { this.game.update(dt); } catch (e) { console.error(e); }
        this.input.endFrame();
      }
    }, 50);
    // dev helpers: ?autohost=local  /  ?autojoin=CODE&net=local
    const qs = new URLSearchParams(location.search);
    if (qs.has('autohost')) this.hostGame({ strategy: qs.get('autohost') || 'local', isPublic: qs.get('autohost') !== 'local', slot: 3, lobbyName: 'Test crew', maxPlayers: 4, code: qs.get('code') || undefined });
    else if (qs.has('autojoin')) this.joinGame({ code: qs.get('autojoin').toUpperCase(), strategy: qs.get('net') || 'local' });
    else { const j = parseJoin(location.search, this.settings.netStrategy); if (j) this.joinGame(j); }   // [joinplay] ?join=CODE&net=X: the link carries the net mode
  }

  /** [fastmenu] background half of boot: ext GLBs -> registerExtContent() -> mods.loadAll() -> 'boot'. Never rejects. */
  async loadAssetsBg() {
    try {
      await preloadExtModels(EXT_PRELOAD, (d, n) => {
        this.assetsProgress = { d, n };
        if (this.assetsWaiting) this.ui.showLoading(tf('Loading models... {d}/{n}', { d, n }));
        else setAssetLine(tf('Loading models {d}/{n}', { d, n }));
      });
      registerExtContent();
      await this.mods.loadAll();
      this.mods.emit('boot', this);
    } catch (e) { console.error('[fastmenu] background load', e); }
    this.assetsDone = true;
    setAssetLine('');
  }

  bindKeys() {
    const input = this.input;
    input.onLockChange = (locked, intentional) => {
      const g = this.game;
      if (!g) return;
      this.ui.clickHint.classList.toggle('hidden', locked || hasEscapeLayer27(this));
      if (!locked && !intentional && !hasEscapeLayer27(this) && !this.ui.fullscreenOpen?.()) {
        this.pauseFromUnlockAt = performance.now();
        this.ui.openPause();
      }
    };
    this.engine.canvas.addEventListener('click', () => {
      if (this.game && !hasEscapeLayer27(this) && !this.ui.fullscreenOpen?.()) input.lock();
    });
    this.ui.clickHint.addEventListener('click', () => { if (this.game && !hasEscapeLayer27(this) && !this.ui.fullscreenOpen?.()) input.lock(); });
    // [ux] reliable re-capture: any panel/terminal/minigame closing must return to pointer lock; when the browser refuses
    // (ESC cooldown, focus loss) the next click / key press retries and a "click to resume" hint is shown as fallback.
    const idle = () => { const g = this.game; return !!g && !g.player?.dead && !hasEscapeLayer27(this) && !this.ui.fullscreenOpen?.() && !input.isTyping(); };
    const showHint = () => { if (idle() && !input.locked) this.ui.clickHint.classList.remove('hidden'); };
    input.onLockFail = () => setTimeout(showHint, 60);
    document.addEventListener('mousedown', (e) => { if (idle() && !input.locked && !e.target.closest?.('button,input,select,textarea,a')) input.lock(); }, true);
    window.addEventListener('keydown', (e) => { if (e.code !== 'Escape' && idle() && !input.locked && !e.repeat) input.lock(); }, true);
    setInterval(() => { if (this.game && idle() && !input.locked && document.hasFocus?.() !== false) this.ui.clickHint.classList.remove('hidden'); else if (input.locked) this.ui.clickHint.classList.add('hidden'); }, 400);
    installEscape27(this);
    window.addEventListener('keydown', (e) => {
      const g = this.game;
      if (!g || input.isTyping() || e.repeat) return;
      const k = this.settings.keys;
      // The bound menu action is hold-for-status. HUDcalm owns it in play;
      // Tab still moves focus in forms, and a remapped panel-close is one gesture.
      if (e.code === k.menu) {
        if (!e.defaultPrevented && !g.minigame && !g.terminal.active && this.ui.panelOpen && e.code !== 'Tab') {
          e.preventDefault(); e.stopImmediatePropagation(); this.ui.closePanel();
        }
        return;
      }
      if (e.defaultPrevented) return;
      if (e.code === 'Escape') return;   // escape27 owns the gesture, including focused form controls.
      if (g.minigame || g.terminal.active) return;
      if ((e.code === k.chat || e.code === 'KeyT') && !this.ui.panelOpen && input.locked) { e.preventDefault(); this.ui.openChat(); return; }
    });
  }

  applySettings() {
    this.engine.applySettings();
    applyA11ySettings(this.settings);   // [a11y]
    setClassicAvatar(!!this.settings.classicAvatar);   // [avatar2]
    this.audio.applyVolumes();
    this.game?.refreshStats();
    try { this.hub?.sync(); } catch { /* [social] optional */ }
  }

  // ------------------------------------------------------------------ lobby browser
  startLobbyBrowser(strategy, onChange) {
    if (this.lobbyDir && this.lobbyDir.strategy === strategy) { this.lobbyDir.onChange = onChange; return; }
    this.stopLobbyBrowser();
    this.lobbyDir = new LobbyDirectory(strategy);
    this.lobbyDir.onChange = onChange;
    this.lobbyDir.start().then(() => onChange?.());
  }
  stopLobbyBrowser() { this.lobbyDir?.stop(); this.lobbyDir = null; }

  // ------------------------------------------------------------------ sessions
  async hostGame(opts) {
    const code = opts.code || lobbyCode();
    const ok = await this.startGame({ ...opts, host: true, code });
    if (!ok || !this.game) return;   // session failed to start (startGame already cleaned up)
    if (opts.isPublic && opts.strategy) {
      this.startLobbyBrowser(opts.strategy, null);
      this.game.on('announce', (info) => this.lobbyDir?.announce(info));
      this.game.hostAnnounce();
    } else this.stopLobbyBrowser();
  }
  async joinGame(opts) {
    if (this._startingGame || this.game) return false;
    this.stopLobbyBrowser();
    return this.startGame({ ...opts, host: false });
  }

  async startGame(opts) {
    if (this._startingGame || this.game) return false;
    this._startingGame = true;
    try { return await this._startGame(opts); } finally { this._startingGame = false; }
  }

  async _startGame(opts) {
    this.ui.showLoading(opts.host ? t('Preparing the ship...') : tf('Connecting to {code}...', { code: opts.code }));
    if (!this.assetsDone && this.assetsReady) {   // [fastmenu] PLAY / host / join / join link all pass here: wait for the background load (no delay when already done)
      this.assetsWaiting = true;
      const { d, n } = this.assetsProgress;
      this.ui.showLoading(tf('Loading models... {d}/{n}', { d, n }));
      try { await this.assetsReady; } finally { this.assetsWaiting = false; }
      this.ui.showLoading(opts.host ? t('Preparing the ship...') : tf('Connecting to {code}...', { code: opts.code }));
    }
    await this.audio.init();
    this.audio.resume();
    this.audio.stopAll();
    if ((await preloadLazyModules()).length) await preloadLazyModules();   // [perf2] usually already prefetched in idle time after boot; one retry
    this.menu?.dispose();
    this.menu = null;
    const scene = new THREE.Scene();
    this.engine.scene = scene;
    scene.add(this.engine.camera);
    this.game = new Game({ engine: this.engine, audio: this.audio, settings: this.settings, profile: this.profile, ui: this.ui, input: this.input, mods: this.mods });
    this.mods.attach(this.game);
    this.game.shipScreens = new ShipScreens(this.game);
    this.game.on('fatal', (msg) => { alert(msg); this.leaveGame(); });
    try {
      await this.game.startSession(opts);
    } catch (e) {
      console.error(e);
      if (!this.game) return false;   // fatal already displayed the error and cleaned up
      alert(tf('Could not start the session: {message}', { message: e.message }));
      this.leaveGame();
      return false;
    }
    if (!this.game) return false;   // a 'fatal' during startSession already left the game
    this.ui.hideLoading();
    this.ui.hideMenu();
    this.ui.hud.show(true);
    this.ui.hud.setCoins(this.profile.coins);
    this.game.refreshHeldVisuals();
    this.game.updateAmbience();
    this.audio.playMusic(null);
    this.input.lock();
    return true;
  }

  leaveGame() {
    this.ui.closePanel(true);
    this.ui.closeChat();
    if (this.game) {
      try { this.mods.emit('sessionEnd', this.game); } catch (e) { console.warn(e); }
      try { if (this.game.isHost && ['orbit', 'company'].includes(this.game.run?.phase)) this.game.hostSave(); } catch (e) { console.warn(e); }
      this.game.destroy();
      this.mods.detach();
      this.game = null;
    }
    this.stopLobbyBrowser();
    saveProfile(this.profile);
    this.input.enabled = true;   // [menufix] game.update left it false (pause panel open) -> menu-room mouse look / walking were dead after a run
    this.input.unlock();
    setTimeout(() => this.input.unlock(), 120);
    this.ui.hud.setDead(false);
    this.ui.hud.setSpectate(null);
    this.ui.chatLog.innerHTML = '';
    this.engine.fx.blind = 0; this.engine.fx.noise = 0; this.engine.fadeTarget = 0;
    this.ui.hud.show(false);
    this.ui.chatEl.classList.add('hidden');
    this.menu = new CRTMenu(this.engine, this);
    this.ui.showMenu('title');
    this.audio.playMusic('menu_theme', 0.5);
    this.audio.setAmbience('ship', 'ship_hum', 0.18);
    this.ui.hideLoading();
  }

  // debug: advance the simulation manually (works even when the tab is not being painted)
  tick(n = 1, dt = 1 / 60, render = false) {
    for (let i = 0; i < n; i++) {
      if (this.game) { this.game.update(dt); this.game.minigame?.update?.(dt); }
      this.input.endFrame();
    }
    if (render) this.engine.render(dt);
  }

  // ------------------------------------------------------------------ loop
  finishQualityProbe() {   // [perf2] auto quality: Medium keeps the player's own resolution/outline settings, Low/High write their preset
    const level = this.qprobe.level();
    this.qprobe = null;
    this.settings.qualityAuto = level;
    if (level === 'medium') applyQualityLevel('medium'); else chooseQuality(this.settings, 'auto');
    saveSettings(this.settings);
    this.applySettings();
    console.info('[perf2] auto quality ->', level);
  }

  loop(now) {
    requestAnimationFrame((t) => this.loop(t));
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (this.qprobe && this.booted && !this.game && this.qprobe.push(dt)) this.finishQualityProbe();   // [perf2]
    if (dt > 0.1) dt = 0.1;
    try {
      this.input.pollPad(dt, !!this.game);   // [a11y] gamepad -> key / mouse state before the sim reads it
      if (this.game) {
        this.game.update(dt);
        this.game.shipScreens?.update(dt);
        this.game.minigame?.update?.(dt);
        const g = this.game;
        const needClick = !this.input.locked && !this.ui.panelOpen && !g.minigame && !g.terminal.active && !this.ui.chatOpen;
        this.ui.clickHint.classList.toggle('hidden', !needClick);
      } else if (this.menu) {
        this.menu.update(dt);
        this.audio.update(dt, this.engine.camera);
      }
      this.engine.render(dt);
    } catch (e) {
      console.error(e);
    }
    this.input.endFrame();
    this.frames++; this.fpsT += dt;
    if (this.fpsT > 0.5) {
      const st = this.audio.state();
      this.ui.soundHint.classList.toggle('hidden', st === 'running' || !this.booted);
      if (st === 'suspended' || st === 'interrupted') this.ui.soundHint.textContent = t('The browser paused the sound. Click anywhere to resume.');
      if (this.settings.showFps) { this.fpsEl.textContent = Math.round(this.frames / this.fpsT) + ' fps · ' + (this.engine.sceneStats?.calls ?? 0) + ' dc · ' + Math.round((this.engine.sceneStats?.tris ?? 0) / 1000) + 'k tris'; this.fpsEl.style.display = ''; }
      else this.fpsEl.style.display = 'none';
      this.frames = 0; this.fpsT = 0;
    }
  }
}

const app = new App();
window.kefal = app;
window.THREE = THREE; // handy for debugging from the console
app.boot().catch((e) => { console.error(e); document.getElementById('loading').innerHTML = '<div class="load-text">Failed to start: ' + e.message + '</div>'; });
