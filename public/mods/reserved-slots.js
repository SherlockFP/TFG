// reserved-slots — port of ReservedFlashlightSlot / ReservedWalkieSlot (FlipMods) family.
// Adds dedicated hotbar slot(s) at the end of the inventory that only accept a flashlight or a
// walkie-talkie. Picking one up files it into its slot without switching what you hold; F still
// toggles the flashlight and walkies transmit from any slot, so they work straight from the belt.
// The host's setting wins (it is part of the session config sent to every client).
// TFG built-in feature (crew switch).
KefalAPI.defineMod({
  id: 'reserved-slots',
  name: 'Reserved Slots',
  version: '1.0.0',
  author: 'TFG Modding Team',
  inspiredBy: 'ReservedFlashlightSlot + ReservedWalkieSlot',
  builtin: true,
  scope: 'host',
  category: 'qol',
  enabledByDefault: true,
  description: '+1 dedicated flashlight slot (and optionally +1 walkie-talkie slot) that never eat into your normal inventory. Flashlights and walkies are filed there automatically.',
  config: {
    flashlightSlot: { type: 'boolean', default: true, label: 'Flashlight slot' },
    walkieSlot: { type: 'boolean', default: false, label: 'Walkie-talkie slot' },
    stayOnHand: { type: 'boolean', default: true, label: 'Keep holding your current item when filing' },
  },
  init(api, cfg) {
    const KINDS = { light: ['flashlight', 'proflash'], walkie: ['walkie'] };
    const LABEL = { light: 'LIGHT', walkie: 'RADIO' };
    const PH = '__kmod_reserved__';
    const spec = [];
    if (cfg.flashlightSlot) spec.push('light');
    if (cfg.walkieSlot) spec.push('walkie');

    // The host ALWAYS writes the key (possibly []), so the welcome config replaces whatever a client
    // wrote for itself (BUGS.md: a client-only reservedSlots used to survive the welcome and turn a
    // normal slot into a flashlight-only one).
    api.onAlways('configure', (config) => {
      const s = (api.enabled ? api.enabled() : true) ? spec : [];
      config.reservedSlots = s.slice();
      if (s.length) config.inventorySlots = (config.inventorySlots || 4) + s.length;
    });

    // [{ idx, kind }] of the reserved slots in the current session (host config), or null
    function reserved(game) {
      const s = game.config?.reservedSlots;
      if (!Array.isArray(s) || !s.length) return null;
      const n = game.player.slots.length;
      const out = [];
      s.forEach((kind, k) => { const idx = n - s.length + k; if (idx >= 0 && KINDS[kind]) out.push({ idx, kind }); });
      return out.length ? out : null;
    }

    api.on('netReady', (net, game) => {
      // hosts on older builds may not send the key at all: never keep our own local value then
      const origWelcome = game.onWelcome;
      game.onWelcome = function (d) {
        const hostHas = !!d?.config && Object.prototype.hasOwnProperty.call(d.config, 'reservedSlots');
        const r = origWelcome.call(this, d);
        if (!hostHas) delete this.config.reservedSlots;
        return r;
      };
      const origPickup = game.pickup;
      game.pickup = function (it) {
        const res = reserved(this);
        if (!res) return origPickup.call(this, it);
        const p = this.player;
        const home = res.find((r) => KINDS[r.kind].includes(it.type) && !p.slots[r.idx]);
        const prevSlot = p.slot, prevHeld = p.slots[p.slot];
        const filled = [];
        if (home) { for (let i = 0; i < p.slots.length; i++) if (i !== home.idx && !p.slots[i]) { p.slots[i] = PH; filled.push(i); } }
        else for (const r of res) if (!p.slots[r.idx]) { p.slots[r.idx] = PH; filled.push(r.idx); }
        try { origPickup.call(this, it); } finally { for (const i of filled) if (p.slots[i] === PH) p.slots[i] = null; }
        if (home && cfg.stayOnHand && prevHeld && p.slots[home.idx] === it.id && p.slot !== prevSlot) { p.slot = prevSlot; this.refreshHeldVisuals(); }
        else this.refreshHeldVisuals();
      };
      // items handed to us by the host (fish, soulbound weapons...) must not land in a reserved slot
      const origHeld = game.onItemHeld;
      game.onItemHeld = function (it, holder, slot) {
        const res = holder === this.selfId && !this.player.slots.includes(it.id) ? reserved(this) : null;
        if (!res) return origHeld.call(this, it, holder, slot);
        const p = this.player;
        const filled = [];
        for (const r of res) if (!p.slots[r.idx] && !KINDS[r.kind].includes(it.type)) { p.slots[r.idx] = PH; filled.push(r.idx); }
        try { return origHeld.call(this, it, holder, slot); } finally { for (const i of filled) if (p.slots[i] === PH) p.slots[i] = null; }
      };
    });

    // HUD: mark reserved slots
    const CSS = `
.hud-inv .inv-slot.kmod-res { border-style: dashed; border-color: rgba(127,231,255,0.55); }
.hud-inv .inv-slot.kmod-res.active { border-color: #bff4ff; }
.hud-inv .inv-slot .kmod-res-l { position: absolute; left: 5px; bottom: 4px; font-size: 14px; opacity: 0.55; color: #bff4ff; }`;
    api.on('boot', (app) => {
      const hud = app.ui?.hud;
      if (!hud || hud.__kmodRes) return;
      hud.__kmodRes = true;
      if (!document.getElementById('kmod-res-css')) { const s = document.createElement('style'); s.id = 'kmod-res-css'; s.textContent = CSS; document.head.appendChild(s); }
      const orig = hud.setInventory.bind(hud);
      hud.setInventory = (items, active) => {
        orig(items, active);
        const game = api.game;
        const res = game && reserved(game);
        if (!res) return;
        const kids = hud.$?.inv?.children || [];
        for (const r of res) {
          const el = kids[r.idx];
          if (!el) continue;
          el.classList.add('kmod-res');
          if (!items[r.idx]) { const l = document.createElement('div'); l.className = 'kmod-res-l'; l.textContent = LABEL[r.kind]; el.appendChild(l); }
        }
      };
    });
  },
});
