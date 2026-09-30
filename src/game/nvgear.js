// nvgear (wave 8): buyable Night Vision Goggles Mk I / II + spare battery cell, and a timed ship-charger interaction.
// Battery model is the existing one: per-item `battery` seconds, drained by actions.updateBatteries while `on`, synced with 'itst',
// refilled by the host 'charge' handler. So NO new net message (prefix `nv` reserved). The charger fixture already lives in shiplayout.js (SPOTS.charger).
import * as THREE from 'three';
import { t, tf, addTranslations } from '../core/i18n.js';
import { STORE_ITEMS, registerItem, itemDef } from './items.js';
import * as C from './nvgear_core.js';
import { createArtModel } from '../models/artpass.js';

const TR = {
  'Night Vision Goggles Mk I': 'Gece Görüş Gözlüğü Mk I', 'Night Vision Goggles Mk II': 'Gece Görüş Gözlüğü Mk II', 'Spare Battery Cell': 'Yedek Pil',
  [C.NV_GOGGLES.nvg1.tip]: 'Sol tık: gözlüğü aç/kapa. Yeşil PSX görüntü, 90 sn pil. Parlak ışıklar ve flaşlar seni kör eder. Gemideki şarj cihazında doldur.',
  [C.NV_GOGGLES.nvg2.tip]: 'Sol tık: gözlüğü aç/kapa. Daha parlak görüntü, 240 sn pil, parlak ışığın etkisini yarıya indirir. Gemideki şarj cihazında doldur.',
  [C.NV_CELL.tip]: 'Sol tık: taşıdığın en boş pil eşyasını %60 doldurur (gözlük, fener, telsiz...), sonra biter.',
  'Ship charger: hold a battery item [E]': 'Gemi şarj cihazı: pilli bir eşya tut [E]',
  'Hold a flashlight, goggles or another battery item in your hands, then use the charger.': 'Elinde fener, gözlük ya da pilli bir eşya tut, sonra şarj cihazını kullan.',
  'Charging...': 'Şarj oluyor...', 'Charged {name}.': '{name} şarj edildi.', '{name} is already full.': '{name} zaten dolu.', 'Charging cancelled.': 'Şarj iptal edildi.',
  'Goggles ON': 'Gözlük AÇIK', 'Goggles OFF': 'Gözlük KAPALI', NV: 'GG', 'Dazzled by the light!': 'Işıktan kör oldun!',
  'No battery item to refill.': 'Doldurulacak pilli eşya yok.', '{name} refilled.': '{name} dolduruldu.',
};
const RU = {
  'Night Vision Goggles Mk I': 'Очки ночного видения Mk I', 'Night Vision Goggles Mk II': 'Очки ночного видения Mk II', 'Spare Battery Cell': 'Запасная батарея',
  [C.NV_GOGGLES.nvg1.tip]: 'ЛКМ: включить/выключить очки. Зелёная картинка, 90 с заряда. Яркий свет и вспышки ослепляют. Заряжай на корабельной зарядке.',
  [C.NV_GOGGLES.nvg2.tip]: 'ЛКМ: включить/выключить очки. Ярче картинка, 240 с заряда, вдвое слабее ослепление. Заряжай на корабельной зарядке.',
  [C.NV_CELL.tip]: 'ЛКМ: заряжает на 60% самый пустой предмет с батареей (очки, фонарь, рация...), затем расходуется.',
  'Ship charger: hold a battery item [E]': 'Зарядка корабля: возьми предмет с батареей [E]',
  'Hold a flashlight, goggles or another battery item in your hands, then use the charger.': 'Возьми в руки фонарь, очки или другой предмет с батареей и используй зарядку.',
  'Charging...': 'Зарядка...', 'Charged {name}.': '{name} заряжен.', '{name} is already full.': '{name} уже полон.', 'Charging cancelled.': 'Зарядка отменена.',
  'Goggles ON': 'Очки ВКЛ', 'Goggles OFF': 'Очки ВЫКЛ', NV: 'НВ', 'Dazzled by the light!': 'Ослеплён светом!',
  'No battery item to refill.': 'Нет предмета с батареей.', '{name} refilled.': '{name} пополнен.',
};
addTranslations(TR, 'tr'); addTranslations(RU, 'ru');

for (const d of [C.NV_GOGGLES.nvg1, C.NV_GOGGLES.nvg2, C.NV_CELL]) { registerItem({ ...d }); if (!STORE_ITEMS.includes(d.id)) STORE_ITEMS.push(d.id); }

const isGoggles = (it) => !!it && !!C.NV_GOGGLES[it.type];
const STYLE_ID = 'nv-style';
const CSS = `
.nv-ov{position:fixed;inset:0;pointer-events:none;z-index:4;display:none;background:radial-gradient(ellipse at center,rgba(60,255,130,.13) 0%,rgba(30,200,90,.20) 62%,rgba(0,40,10,.55) 100%);mix-blend-mode:screen}
.nv-ov::after{content:'';position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(0,0,0,.10) 0 1px,transparent 1px 3px)}
.nv-glare{position:fixed;inset:0;pointer-events:none;z-index:5;display:none;background:#eaffe9}
.nv-hud{position:fixed;left:50%;bottom:132px;transform:translateX(-50%);z-index:30;pointer-events:none;display:none;font:12px/1.2 monospace;letter-spacing:.06em;color:#cfc6b8;background:rgba(10,10,12,.62);border:1px solid rgba(207,198,184,.25);padding:3px 9px;text-shadow:0 1px 0 #000}
.nv-hud b{color:#8affb0;font-weight:600}.nv-hud.low b{color:#ff8a4a}
.nv-chg{position:fixed;left:50%;top:58%;transform:translateX(-50%);z-index:31;pointer-events:none;display:none;width:180px;font:12px/1.2 monospace;color:#cfc6b8;text-align:center;text-shadow:0 1px 0 #000}
.nv-chg i{display:block;height:6px;margin-top:4px;background:rgba(0,0,0,.6);border:1px solid rgba(207,198,184,.35)}.nv-chg i b{display:block;height:100%;width:0;background:#ffd23f}
`;

function registerModels() {
  const mm = typeof window !== 'undefined' ? window.__kefalMods : null;
  if (!mm?.itemModels) return;
  if (!mm.itemModels.has('nvg1')) mm.itemModels.set('nvg1', () => createArtModel('nvg1'));
  if (!mm.itemModels.has('nvg2')) mm.itemModels.set('nvg2', () => createArtModel('nvg2'));
  if (!mm.itemModels.has('nvcell')) mm.itemModels.set('nvcell', () => createArtModel('nvcell'));
}

export function installNvgear(game) {
  const offs = [];
  let disposed = false, ov = null, glare = null, hud = null, chgEl = null;
  const S = { active: null, applied: false, factor: null, dazzle: 0, dazzleMax: 1, chg: null, tick: 0 };
  const eng = game.engine;
  const U = () => eng?.postMat?.uniforms;
  const mods = game.mods;
  registerModels();

  function ensureDom() {
    if (ov || typeof document === 'undefined') return;
    if (!document.getElementById(STYLE_ID)) { const s = document.createElement('style'); s.id = STYLE_ID; s.textContent = CSS; document.head.appendChild(s); }
    const host = document.getElementById('ui') || document.body;
    const mk = (cls) => { const d = document.createElement('div'); d.className = cls; host.appendChild(d); return d; };
    ov = mk('nv-ov'); glare = mk('nv-glare'); hud = mk('nv-hud'); chgEl = mk('nv-chg');
    chgEl.innerHTML = '<span></span><i><b></b></i>';
  }

  // ---- post effect: multiply the shared uniforms on the on/off transition only (pets_net idiom); the m_nv mutation owns them while it runs
  function setLook(on, gain) {
    const u = U();
    if (!u || on === S.applied) return;
    if (on) {
      if (game.anomaly?.buffs?.has?.('m_nv')) return;
      S.factor = { g: gain, v: 0.5, s: 0.35 };
      u.uGamma.value *= S.factor.g; u.uVignette.value *= S.factor.v; u.uSat.value *= S.factor.s;
      S.applied = true;
    } else {
      const f = S.factor || { g: 1, v: 1, s: 1 };
      u.uGamma.value /= f.g; u.uVignette.value /= f.v; u.uSat.value /= f.s;
      S.applied = false; S.factor = null;
    }
  }

  // ---- counter-play: screen flashes and flashlights aimed at you dazzle the goggles
  const origFlash = eng?.flash;
  if (eng && typeof origFlash === 'function') {
    eng.flash = function (color, amount) {
      if (S.active && !disposed) dazzle(C.dazzleSeconds(amount ?? 0.8, S.active.def.nv.resist));
      return origFlash.call(this, color, amount);
    };
  }
  function dazzle(sec) {
    if (sec <= S.dazzle) return;
    if (S.dazzle <= 0.05) game.ui?.toast?.(t('Dazzled by the light!'), 'bad');
    S.dazzle = S.dazzleMax = sec;
  }
  const _v = new THREE.Vector3();
  function remoteBeam() {
    const eye = game.player.eyePos();
    for (const r of game.remotes?.values?.() || []) {
      if (!r.flashOn || r.dead || !r.headPos) continue;
      r.headPos(_v);
      const to = eye.clone().sub(_v); const d = to.length();
      if (d > 16 || d < 0.5) continue;
      const look = new THREE.Vector3(-Math.sin(r.yaw) * Math.cos(r.pitch), Math.sin(r.pitch), -Math.cos(r.yaw) * Math.cos(r.pitch));
      if (to.normalize().dot(look) > 0.93) dazzle(C.dazzleSeconds(0.3, S.active.def.nv.resist));
    }
  }

  // ---- toggle + spare cell via the existing useItem flow
  const cap = (it) => itemDef(it.type).battery || 0;
  function toggle(it) {
    if ((it.battery ?? 0) <= 0) { game.sfx('battery_dead', 0.5); game.ui?.toast?.(t('Battery is dead. Charge it on the ship.')); return; }
    game.setItemOn(it, !it.on);
    game.sfx('flashlight_click', 0.6);
    game.ui?.toast?.(t(it.on ? 'Goggles ON' : 'Goggles OFF'));
  }
  function useCell(it) {
    const slots = game.player.slots.map((id) => (id && id !== it.id ? game.items.get(id) : null));
    const idx = C.emptiest(slots.map((x) => (x && x.battery != null && cap(x) ? { battery: x.battery, cap: cap(x) } : null)));
    if (idx < 0) { game.ui?.toast?.(t('No battery item to refill.')); return; }
    const tgt = slots[idx];
    tgt.battery = C.afterCell(tgt.battery, cap(tgt));
    game.net.broadcast('itst', { id: tgt.id, on: tgt.on, b: tgt.battery });
    game.sfx('heal', 0.5);
    game.ui?.toast?.(tf('{name} refilled.', { name: itemDef(tgt.type).name }), 'good');
    game.net.request('consume', { id: it.id });
  }
  offs.push(mods.on('useItem', (it, hk, g) => {
    if (g !== game || !it || hk.handled) return;
    if (isGoggles(it)) { hk.handled = true; toggle(it); } else if (it.type === 'nvcell') { hk.handled = true; useCell(it); }
  }));

  // ---- ship charger: the existing interactable gets a timed charge (progress + beeps); a hint shows when no battery item is held
  function startCharge(held) {
    if (S.chg) return;
    const d = itemDef(held.type);
    if ((held.battery ?? 0) >= (d.battery || 0) - 0.5) { game.ui?.toast?.(tf('{name} is already full.', { name: d.name })); return; }
    S.chg = { id: held.id, t: 0, name: d.name }; S.tick = 0;
    game.sfx('mine_beep', 0.35);
  }
  function endCharge(ok) {
    const c = S.chg; S.chg = null;
    if (chgEl) chgEl.style.display = 'none';
    if (!ok && c) game.ui?.toast?.(t('Charging cancelled.'));
  }
  offs.push(mods.on('interactables', (out, g) => {
    if (g !== game || disposed) return;
    const pt = game.ship?.points?.charger;
    if (!pt) return;
    const held = game.player.heldItem?.();
    const own = out.find((o) => o.pos === pt);
    if (own && held?.battery != null) own.action = () => startCharge(held);
    else if (!own && (game.player.inShip || game.player.pos.distanceTo(pt) < 6)) {
      out.push({ pos: pt, r: 0.6, label: t('Ship charger: hold a battery item [E]'), action: () => game.ui?.toast?.(t('Hold a flashlight, goggles or another battery item in your hands, then use the charger.')) });
    }
  }));

  offs.push(mods.on('update', (dt, g) => {
    if (g !== game || disposed) return;
    ensureDom();
    const p = game.player;
    const held = p?.heldItem?.();
    // goggles in hand + on + charged -> the look; leaving them (swap / drop) switches them off so they never drain in a pocket
    let act = null;
    for (const id of p?.slots || []) {
      const it = id && game.items.get(id);
      if (!isGoggles(it) || !it.on) continue;
      if (it !== held || p.dead) { game.setItemOn(it, false); continue; }
      if ((it.battery ?? 0) > 0) act = it;
    }
    S.active = act ? { it: act, def: itemDef(act.type) } : null;
    if (act) {
      const extra = C.drainMul({ cold: (game.survival?.warmth ?? 100) < 45 }) - 1;   // cold moon: the cells sag (glitch drain not wired, see docs)
      if (extra > 0) act.battery = Math.max(0, act.battery - extra * dt);
    }
    setLook(!!act, act ? S.active.def.nv.gain : 1);
    if (act && eng?.fx) eng.fx.noise = Math.max(eng.fx.noise || 0, 0.05);
    if (act) remoteBeam();
    S.dazzle = Math.max(0, S.dazzle - dt);
    if (ov) {
      const mut = !!game.anomaly?.buffs?.has?.('m_nv');
      const low = act ? act.battery / (S.active.def.battery || 1) < C.LOW_BATTERY : false;
      ov.style.display = act && !mut ? 'block' : 'none';
      if (act) ov.style.opacity = low ? String(0.55 + 0.4 * Math.abs(Math.sin(game.time * 17))) : '1';
      const gl = S.dazzle > 0 ? Math.min(1, S.dazzle / Math.min(S.dazzleMax, 1.2)) * (eng?.settings?.reduceFlash ? 0.5 : 0.95) : 0;
      glare.style.display = gl > 0 ? 'block' : 'none';
      if (gl > 0) glare.style.opacity = gl.toFixed(2);
      // small held-only readout (the hotbar already draws the battery bar; this adds seconds + state)
      if (isGoggles(held) && !p.dead) {
        const d = itemDef(held.type);
        hud.style.display = 'block'; hud.classList.toggle('low', (held.battery / d.battery) < C.LOW_BATTERY);
        hud.innerHTML = `${t('NV')} Mk ${d.nv.mk} · <b>${Math.max(0, Math.ceil(held.battery || 0))} s</b> · ${held.on ? 'ON' : 'OFF'}`;
      } else hud.style.display = 'none';
    }
    // charging progress
    const c = S.chg;
    if (c) {
      const it = game.items.get(c.id), pt = game.ship?.points?.charger;
      if (!it || it !== held || !pt || p.pos.distanceTo(pt) > 2.2 || p.dead) { endCharge(false); return; }
      c.t += dt; S.tick += dt;
      if (S.tick >= 0.5) { S.tick = 0; game.sfx('mine_beep', 0.25 + 0.2 * (c.t / C.CHARGE_SECONDS)); }
      if (chgEl) { chgEl.style.display = 'block'; chgEl.firstChild.textContent = t('Charging...'); chgEl.querySelector('b').style.width = Math.min(100, (c.t / C.CHARGE_SECONDS) * 100) + '%'; }
      if (c.t >= C.CHARGE_SECONDS) {
        game.net.request('charge', { id: it.id, mul: game.stats?.batteryMul });   // host-authoritative refill + spark fx (host.js 'charge')
        game.ui?.toast?.(tf('Charged {name}.', { name: c.name }), 'good');
        endCharge(true);
      }
    }
  }));

  function dispose() {
    if (disposed) return;
    disposed = true;
    setLook(false, 1);
    for (const off of offs) { try { off(); } catch { /* ignore */ } }
    if (eng && eng.flash !== origFlash && typeof origFlash === 'function') eng.flash = origFlash;
    for (const e of [ov, glare, hud, chgEl]) e?.remove();
    ov = glare = hud = chgEl = null;
  }
  return { dispose, get charging() { return !!S.chg; }, get active() { return !!S.active; }, get dazzle() { return S.dazzle; } };
}
