// HUBGATE (wave 8, module 'hubgate'; docs/wave8/hubgate.md). Owner decisions: the side systems are not deleted, they open one by one behind the ship's HUB DOOR,
// and the campaign is not the only way in: QUICK SHIFT is a one-day mode straight from the main menu (perfect for a friend joining by code / link).
//   Ladder       the id -> quota table is onboard_core.js UNLOCKS (extended, not duplicated); what a locked id switches off is hubgate_core.js SYSTEMS.
//                onboard.js keeps the terminal guard, HELP filter, the unlock gift + "Unlock everything" setting; this module adds: the Hub door + panel,
//                the unlock card, HUD docks hidden while locked, ship fixtures inert ("Unlocks at quota N"), the store's rare+ stock, and the host's ladder
//                published as run.hub so a JOINER is ruled by the host's progress. Hotkeys guard themselves (rpg.js K, daily.js F2, pets.js N: game.onboard.deny).
//   QUICK SHIFT  game.opts.quick (main menu button) -> host run: seeded tier 1-2 moon, 1 day, 15 min clock, small fixed quota, run.quick = { v, n }.
//                run.quick travels in the welcome / gs state, so a joiner gets the mode for free. hostSave is skipped (no persistence cost), the ladder does not
//                advance (onboard_core progressOf), XP + clout still pay. After the day report every peer gets the end card; the host picks PLAY AGAIN or
//                START CAMPAIGN (the run is reset in place, like the 'fired' flow).
// Net: prefix 'hg' - { k: 'close' } host -> crew (the end card goes away). No other messages: run.hub / run.quick ride the normal run sync.
import * as THREE from 'three';
import { t, tf, addTranslations } from '../core/i18n.js';
import { el } from '../core/util.js';
import { wrapMethod } from './dailyEvents.js';
import { MOONS } from './moons.js';
import { tierIndex } from './tiers.js';
import { newRun } from './host.js';
import { listRuns } from '../core/save.js';
import { SPOTS, DIMS } from '../world/shiplayout.js';
import { TEXT as OB } from './onboard_text.js';
import { NET, SYSTEMS, HUB_ORDER, requirement, hiddenDocks, zoneOwner, hubOf, sameHub, hubOpen, openIds, QUICK, quickFields, quickResult, quickReward } from './hubgate_core.js';
import { HOST_ONLY } from '../net/session.js';
HOST_ONLY.add(NET);   // 'hg' {k:'close'} is host -> crew only: a client could otherwise dismiss everybody's end card

const TEXT = {
  'hg.lock': ['Unlocks at quota {n}: {@name}', 'Kota {n}\'de açılır: {@name}', 'Откроется на квоте {n}: {@name}'],
  'hg.lock_boss': ['Unlocks after the first sector boss: {@name}', 'İlk sektör patronundan sonra açılır: {@name}', 'Откроется после первого босса сектора: {@name}'],
  'hg.card': ['UNLOCKED: {@name}', 'AÇILDI: {@name}', 'ОТКРЫТО: {@name}'],
  'hg.door': ['Hub door [E]', 'Hub kapısı [E]', 'Дверь Хаба [E]'],
  'hg.door_sub': ['{a} of {b} systems open', '{b} sistemden {a} tanesi açık', 'Открыто систем: {a} из {b}'],
  'hg.door_first': ['Opens at quota 1', 'Kota 1\'de açılır', 'Откроется на квоте 1'],
  'hg.title': ['HUB', 'HUB', 'ХАБ'],
  'hg.sub': ['Side systems open one by one as quotas are met. Settings: Unlock everything.', 'Yan sistemler kotalar tutturuldukça tek tek açılır. Ayarlar: Her şeyin kilidini aç.', 'Побочные системы открываются по одной с выполнением квот. Настройки: открыть всё.'],
  'hg.open': ['OPEN', 'AÇIK', 'ОТКРЫТО'],
  'hg.go': ['Open', 'Aç', 'Открыть'],
  'hg.close': ['Close', 'Kapat', 'Закрыть'],
  'hg.qs': ['QUICK SHIFT', 'HIZLI VARDİYA', 'БЫСТРАЯ СМЕНА'],
  'hg.qs_start': ['QUICK SHIFT: one day, one moon. Bring ▮{q} of scrap aboard before midnight. Nothing here is saved. Invite: ESC > Copy join link.', 'HIZLI VARDİYA: bir gün, bir ay. Gece yarısından önce gemiye ▮{q} hurda getir. Burada hiçbir şey kaydedilmez. Davet: ESC > Katılma bağlantısını kopyala.', 'БЫСТРАЯ СМЕНА: один день, одна луна. Принесите на борт хлама на ▮{q} до полуночи. Здесь ничего не сохраняется. Приглашение: ESC > Скопировать ссылку.'],
  'hg.qs_met': ['SHIFT COMPLETE', 'VARDİYA TAMAM', 'СМЕНА ВЫПОЛНЕНА'],
  'hg.qs_short': ['SHIFT SHORT OF QUOTA', 'VARDİYA KOTANIN ALTINDA', 'СМЕНА НЕ ДОТЯНУЛА ДО КВОТЫ'],
  'hg.qs_dead': ['THE CREW DID NOT COME BACK', 'EKİP GERİ DÖNMEDİ', 'ЭКИПАЖ НЕ ВЕРНУЛСЯ'],
  'hg.qs_line': ['Scrap aboard: ▮{got} / ▮{quota} ({pct}%)', 'Gemideki hurda: ▮{got} / ▮{quota} (%{pct})', 'Хлама на борту: ▮{got} / ▮{quota} ({pct}%)'],
  'hg.qs_line2': ['Crew back: {alive} of {crew} · left behind: ▮{left}', 'Dönen ekip: {crew} kişiden {alive} · geride kalan: ▮{left}', 'Вернулись: {alive} из {crew} · осталось: ▮{left}'],
  'hg.qs_pay': ['+{xp} XP · ◈{coin}. No ladder progress: the campaign keeps its own.', '+{xp} XP · ◈{coin}. Kademe ilerlemesi yok: kampanya kendi ilerlemesini tutar.', '+{xp} XP · ◈{coin}. Прогресса лестницы нет: у кампании свой.'],
  'hg.qs_again': ['PLAY AGAIN', 'TEKRAR OYNA', 'ЕЩЁ РАЗ'],
  'hg.qs_camp': ['START CAMPAIGN', 'KAMPANYAYI BAŞLAT', 'НАЧАТЬ КАМПАНИЮ'],
  'hg.camp': ['Campaign started. The unlock ladder is yours again.', 'Kampanya başladı. Kilit açma kademesi yine senin.', 'Кампания началась. Лестница открытий снова твоя.'],
  'hg.qs_leave': ['LEAVE', 'AYRIL', 'ВЫЙТИ'],
  'hg.qs_wait': ['Waiting for the host: play again or start the campaign.', 'Ev sahibi bekleniyor: tekrar oyna ya da kampanyayı başlat.', 'Ждём хозяина: ещё раз или кампания.'],
  'hg.qs_goal': ['Quick Shift: ▮{q} today', 'Hızlı Vardiya: bugün ▮{q}', 'Быстрая смена: сегодня ▮{q}'],
  // Hub panel lines (one per system)
  'Company Store kiosk: rare and better stock.': ['Company Store kiosk: rare and better stock.', 'Şirket Mağazası kiosku: nadir ve daha iyi stok.', 'Киоск магазина: редкий и лучший товар.'],
  'Press K for the skill tree.': ['Press K for the skill tree.', 'Yetenek ağacı için K\'ye bas.', 'Нажми K для древа навыков.'],
  'The arcade cabinet and the chess table in the ship.': ['The arcade cabinet and the chess table in the ship.', 'Gemideki arcade makinesi ve satranç masası.', 'Аркадный автомат и шахматный стол на корабле.'],
  'Press N for your pets. The incubator is in the ship.': ['Press N for your pets. The incubator is in the ship.', 'Evcil hayvanların için N\'ye bas. Kuluçka makinesi gemide.', 'Нажми N для питомцев. Инкубатор на корабле.'],
  'Terminal: ROUTE HOME.': ['Terminal: ROUTE HOME.', 'Terminal: ROUTE HOME.', 'Терминал: ROUTE HOME.'],
  'The planters, the stove and the brewing stand in the ship.': ['The planters, the stove and the brewing stand in the ship.', 'Gemideki saksılar, ocak ve demleme standı.', 'Грядки, плита и варочный стенд на корабле.'],
  'The restaurant.': ['The restaurant.', 'Restoran.', 'Ресторан.'],
  'The Monetizer at HQ.': ['The Monetizer at HQ.', 'HQ\'daki Paralaştırıcı.', 'Монетизатор в штабе.'],
  'Reclaim sectors: capture zone cores on the moons.': ['Reclaim sectors: capture zone cores on the moons.', 'Sektörleri geri al: aylardaki bölge çekirdeklerini ele geçir.', 'Отвоёвывай сектора: захватывай ядра зон на лунах.'],
  'Terminal: MOON RANDOM, SIGNALS, MISSIONS.': ['Terminal: MOON RANDOM, SIGNALS, MISSIONS.', 'Terminal: MOON RANDOM, SIGNALS, MISSIONS.', 'Терминал: MOON RANDOM, SIGNALS, MISSIONS.'],
  'Press F2 for the daily board and the season track.': ['Press F2 for the daily board and the season track.', 'Günlük pano ve sezon yolu için F2\'ye bas.', 'Нажми F2: ежедневные задания и путь сезона.'],
  'Glitch gates open in orbit after the first sector boss.': ['Glitch gates open in orbit after the first sector boss.', 'Glitch kapıları ilk sektör patronundan sonra yörüngede açılır.', 'Глитч-врата открываются на орбите после первого босса сектора.'],
};
const trMap = {}, ruMap = {};
for (const [k, v] of Object.entries(TEXT)) { trMap[v[0]] = v[1]; ruMap[v[0]] = v[2]; }
addTranslations(trMap);
addTranslations(ruMap, 'ru');
export const HG_TEXT = TEXT;
const tx = (id, vars) => (TEXT[id] ? tf(TEXT[id][0], vars || {}) : id);
const sysName = (id) => (OB['u.' + id] ? t(OB['u.' + id][0]) : id);
const hintOf = (id) => { const h = SYSTEMS[id]?.hint; return h ? t(TEXT[h] ? TEXT[h][0] : h) : ''; };
/** systems the Hub panel can open directly: id -> game api path */
const GO = { tree: (g) => g.rpg?.open?.(), pets: (g) => g.pets?.open?.(), season: (g) => g.daily?.open?.() };

const CSS = `.hg-end{position:fixed;inset:0;z-index:80;display:flex;align-items:center;justify-content:center;background:rgba(4,6,4,.78);font:600 15px/1.4 var(--font2,'Arial Narrow',Arial,sans-serif);color:#e8e6d0}
.hg-end .box{width:min(560px,92vw);background:#12130d;border:2px solid #f2c230;box-shadow:0 8px 40px #000c}
.hg-end .h{padding:6px 14px;background:repeating-linear-gradient(-45deg,#f2c230 0 10px,#15150f 10px 20px);color:#111;font-weight:800;text-transform:uppercase;letter-spacing:.06em}
.hg-end .h b{background:#f2c230;padding:1px 10px}
.hg-end .b{padding:14px 18px}.hg-end .b div{margin:4px 0}.hg-end .pay{color:#9fd49f}
.hg-end .r{display:flex;gap:10px;padding:12px 18px 16px;flex-wrap:wrap}
.hg-end button{flex:1;min-width:140px;padding:10px 12px;background:#1b1c12;border:1px solid #f2c230;color:#f2c230;font:800 14px var(--font2,'Arial Narrow',Arial,sans-serif);letter-spacing:.06em;cursor:pointer}
.hg-end button:hover{background:#f2c230;color:#111}.hg-end .w{padding:0 18px 16px;opacity:.75}
.hg-hub .hg-row{display:flex;gap:12px;align-items:center;padding:6px 8px;border-bottom:1px solid #ffffff18}
.hg-hub .hg-row.lk{opacity:.5}.hg-hub .hg-n{width:170px;font-weight:800;letter-spacing:.04em}.hg-hub .hg-d{flex:1;font-size:13px;opacity:.85}`;

export function installHubgate(game) {
  const mods = game.mods;
  if (!mods) return null;
  const offs = [], restores = [];
  let disposed = false, time = 0, tickT = 0, style = null, docksStyle = null, docksKey = '', endEl = null, door = null, panelEl = null, doorOpenK = 0;
  const S = { hub: null, told: false };
  const warn = (tag, e) => { try { console.warn('[hubgate] ' + tag, e); } catch { /* ignore */ } };
  const toast = (s, kind = 'info', ms) => { try { game.ui?.toast?.(s, kind, ms); } catch { /* optional */ } };
  const sfx = (n, v = 0.6) => { try { game.sfx?.(n, v); } catch { /* unknown sound */ } };
  const unlockAll = () => !!game.settings?.unlockAll;
  const ob = () => game.onboard;
  const LOCK_NEAR = 1.5;
  const locked = (id) => !!ob()?.locked?.(id);
  const lockedIds = () => HUB_ORDER.filter(locked);
  const needText = (id) => { const r = requirement(id); return r?.boss ? tx('hg.lock_boss', { name: sysName(id) }) : tx('hg.lock', { n: r?.q || 1, name: sysName(id) }); };
  const ensureStyle = () => { if (style || typeof document === 'undefined') return; style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style); };

  // ---------------------------------------------------------------------------------------------------------------- ladder
  /** the host's ladder for a joiner (run.hub); null on the host / when the host has not published one */
  const remoteHub = () => (game.isHost ? null : game.run?.hub || null);
  /** shop.js hook: rare+ stock (and ship upgrades) wait for quota 1 -> a lock reason or '' */
  function shopLock(e) { return locked('shop') && (tierIndex(e.tier) >= 2 || e.currency === 'clout') ? tx('hg.lock', { n: 1, name: sysName('shop') }) : ''; }
  function publishHub() {
    if (!game.isHost || !game.run || !ob()) return;
    const u = ob().unlocks?.();
    if (!u) return;
    const hub = hubOf(u, null);
    if (!sameHub(hub, game.run.hub)) { game.run.hub = hub; try { game.broadcastRun?.(['hub']); } catch (e) { warn('hub sync', e); } }
    S.hub = hub;
  }
  /** unlock card: one big banner per new system (onboard.js announceGift calls it). true = shown */
  function card(id) {
    if (disposed || !SYSTEMS[id]) return false;
    try { game.ui?.hud?.bigText?.(tx('hg.card', { name: sysName(id) }), hintOf(id)); sfx('hub_unlock', 0.6); return true; } catch { return false; }   // [sound2] unlock sting
  }

  // ---------------------------------------------------------------------------------------------------------------- locked docks + fixtures
  function docksTick() {
    if (typeof document === 'undefined') return;
    const ids = hiddenDocks(lockedIds());
    const key = ids.join(',');
    if (key === docksKey) return;
    docksKey = key;
    if (!docksStyle) { docksStyle = document.createElement('style'); document.head.appendChild(docksStyle); }
    docksStyle.textContent = ids.map((d) => `.hud-dock-item[data-dock-id="${d}"]{display:none!important}`).join('');
  }
  /** ship interactables inside a locked system's zone collapse into ONE "Unlocks at quota N" prompt */
  restores.push(wrapMethod(game, 'interactablesNow', (orig) => function (...a) {
    const out = orig.apply(this, a);
    try {
      if (disposed || !Array.isArray(out) || !this.player?.inShip) return out;
      const lk = lockedIds();
      if (!lk.length) return out;
      const kept = [], first = new Map();
      for (const it of out) {
        const p = it?.pos;
        const owner = p ? zoneOwner(p.x, p.z, lk) : null;
        if (owner) { if (!first.has(owner)) first.set(owner, it); } else kept.push(it);
      }
      if (!first.size) return out;
      const pp = this.player.pos;   // [feelfix2] a locked prompt only fires from up close (LOCK_NEAR), never across the room
      for (const [id, it] of first) if (Math.hypot(it.pos.x - pp.x, it.pos.z - pp.z) <= LOCK_NEAR) kept.push({ pos: it.pos, r: it.r, reach: it.reach, label: needText(id), action: () => { toast(needText(id), 'bad'); sfx('ui_error', 0.4); } });
      return kept;
    } catch (e) { warn('interactables', e); return out; }
  }));

  // ---------------------------------------------------------------------------------------------------------------- the Hub door (fixture: world/shiplayout.js SPOTS.hubDoor) + panel
  function buildDoor() {
    const g = game.ship?.group, D = SPOTS.hubDoor;
    if (!g || !D) return;
    if (door) { door.grp.parent?.remove(door.grp); door = null; }
    const grp = new THREE.Group();
    grp.position.set(D.x, 0, D.z); grp.rotation.y = D.ry;
    const frameM = new THREE.MeshLambertMaterial({ color: 0x2a2c26 }), leafM = new THREE.MeshLambertMaterial({ color: 0x7c7a68 }), lampM = new THREE.MeshBasicMaterial({ color: 0xd04030 });
    const add = (m, w, h, d, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); grp.add(b); return b; };
    // local +z = the direction the door faces (out of the wall), local x = along the wall
    add(frameM, 0.08, D.h, 0.06, -D.w / 2 + 0.04, D.h / 2, 0.0); add(frameM, 0.08, D.h, 0.06, D.w / 2 - 0.04, D.h / 2, 0.0); add(frameM, D.w, 0.1, 0.06, 0, D.h - 0.05, 0.0);
    const leaf = add(leafM, D.w - 0.2, D.h - 0.2, 0.04, 0, (D.h - 0.1) / 2, 0.005);
    const lamp = add(lampM, 0.16, 0.16, 0.05, 0, D.h + 0.14, 0.0);
    add(frameM, 0.5, 0.14, 0.03, 0, D.h * 0.62, 0.035);   // sign plate
    g.add(grp);
    door = { grp, leaf, lamp, lampM, w: D.w };
  }
  function doorTick(dt) {
    const sg = game.ship?.group;
    if (!sg) return;
    if (!door || door.grp.parent !== sg) buildDoor();
    if (!door) return;
    const n = openIds(S.hub || remoteHub() || hubOf(ob()?.unlocks?.(), null), unlockAll()).length;
    const want = n > 0 ? 1 : 0;
    doorOpenK += Math.max(-dt, Math.min(dt, (want - doorOpenK) * 0.5));
    door.leaf.position.x = doorOpenK * (door.w - 0.25);
    door.lampM.color.setHex(n > 0 ? 0x40d060 : 0xd04030);
  }
  // [threatmerge] locked ship fixtures (arcade cabinet, chess table, stove, brewing stand, planter) are hidden under a grey tarp block until their Hub system opens
  const tarps = new Map();
  /** (dx, dz) from the spot rotated into fixture-local space lies within the footprint box (a little slack) and the object sits below the tarp top */
  function inFoot(dx, dz, ry, dm, o) {
    const c = Math.cos(ry), sn = Math.sin(ry), lx = dx * c - dz * sn, lz = dx * sn + dz * c;
    if (!(o.position.y < dm.h + 0.3 && lx > dm.x0 - 0.05 && lx < dm.x1 + 0.05 && lz > dm.z0 - 0.05 && lz < dm.z1 + 0.05)) return false;
    const sz = new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3());   // never hide a room-sized group that merely has its origin inside
    return Math.max(sz.x, sz.z) <= Math.max(dm.x1 - dm.x0, dm.z1 - dm.z0) + 0.6;
  }
  function coverTick() {
    const sg = game.ship?.group;
    if (!sg) return;
    const lk = new Set(lockedIds());
    for (const [id, def] of Object.entries(SYSTEMS)) for (const key of def.cover || []) {
      const spot = SPOTS[key], dm = DIMS[key];
      if (!spot || !dm) continue;
      let e = tarps.get(key);
      if (e && e.grp.parent !== sg) { tarps.delete(key); e = null; }   // ship rebuilt
      if (!lk.has(id)) { if (e) { for (const o of e.hidden) o.visible = true; e.grp.parent?.remove(e.grp); tarps.delete(key); } continue; }
      if (!e) {
        const grp = new THREE.Group(); grp.position.set(spot.x, spot.y || 0, spot.z); grp.rotation.y = spot.ry || 0;
        const h = dm.h + 0.03, m = new THREE.Mesh(new THREE.BoxGeometry(dm.x1 - dm.x0 + 0.04, h, dm.z1 - dm.z0 + 0.04), new THREE.MeshLambertMaterial({ color: 0x4a4f43 }));
        m.position.set((dm.x0 + dm.x1) / 2, h / 2, (dm.z0 + dm.z1) / 2); grp.add(m);
        grp.userData.hgTarp = true; sg.add(grp);
        e = { grp, hidden: new Set() }; tarps.set(key, e);
      }
      for (const o of sg.children) {   // fixture roots stand exactly on their spot; [feelfix2] a lid / part parented next to it is hidden too when its centre is inside the tarp footprint
        if (o === e.grp || o.userData.hgTarp || !o.visible || !o.isObject3D) continue;
        const dx = o.position.x - spot.x, dz = o.position.z - spot.z;
        if (Math.hypot(dx, dz) < 0.06 || inFoot(dx, dz, spot.ry || 0, dm, o)) { o.visible = false; e.hidden.add(o); }
      }
    }
  }
  function openPanel() {
    const ui = game.ui;
    if (!ui?.openPanel || !ui.panel) return;
    ensureStyle();
    const wrap = ui.panel('hg-hub');
    const list = el('div', { class: 'hg-hub' });
    const reqKey = (id) => { const r = requirement(id); return r?.boss ? 'boss' : r?.q; };
    const nextKey = reqKey(HUB_ORDER.find((id) => locked(id)));   // [trim] the panel lists what is open + only the NEXT unlock step (no advert for the whole roadmap)
    for (const id of HUB_ORDER) {
      const open = !locked(id);
      if (!open && reqKey(id) !== nextKey) continue;
      const row = el('div', { class: 'hg-row' + (open ? '' : ' lk') }, el('span', { class: 'hg-n' }, sysName(id)), el('span', { class: 'hg-d' }, open ? hintOf(id) : needText(id)));
      if (open && GO[id]) row.appendChild(ui.button(tx('hg.go'), () => { ui.closePanel(); try { GO[id](game); } catch (e) { warn('go ' + id, e); } }, 'small'));
      else row.appendChild(el('span', { class: 'dim' }, open ? tx('hg.open') : ''));
      list.appendChild(row);
    }
    wrap.append(ui.panelHead(tx('hg.title'), tx('hg.sub')), el('div', { class: 'cp-body' }, list, el('div', { class: 'menu-row' }, ui.button(tx('hg.close'), () => ui.closePanel(), 'back'))), ui.panelFoot());
    panelEl = wrap;
    ui.openPanel(wrap);
    sfx('ui_confirm', 0.5);
  }
  offs.push(mods.on('interactables', (list, g) => {
    if (g !== game || disposed || !door || !game.player?.inShip || game.player.dead) return;
    const D = SPOTS.hubDoor;
    const nOpen = openIds(S.hub || remoteHub() || hubOf(ob()?.unlocks?.(), null), unlockAll()).length;
    list.push({ pos: new THREE.Vector3(D.x, 1.2, D.z), r: 0.9, reach: 3.2, label: tx('hg.door'), sub: nOpen > 0 ? tx('hg.door_sub', { a: nOpen, b: HUB_ORDER.length }) : tx('hg.door_first'), action: openPanel });
  }));

  // ---------------------------------------------------------------------------------------------------------------- QUICK SHIFT
  const quickOn = () => !!game.run?.quick;
  const tierOf = (id) => MOONS[id]?.tier || 1;
  function startQuick() {
    const run = game.run;
    if (!run) return;
    const code = String(game.net?.code || run.runId || 'x');
    Object.assign(run, quickFields(code + ':0', tierOf));
    game.config.dayLengthSec = QUICK.dayLengthSec;
    try { game.env.setSpace(game.planetColorFor(run.moon)); } catch { /* cosmetic */ }
    try { game.broadcastRun?.(); } catch (e) { warn('quick sync', e); }
  }
  function freeSlot() {
    const runs = listRuns();
    const empty = runs.find((r) => !r.data);
    if (empty) return empty.slot;
    return runs.slice().sort((a, b) => (a.data.savedAt || 0) - (b.data.savedAt || 0))[0].slot;   // never the newest save
  }
  /** host: reset the run in place (the 'fired' flow idiom) into a fresh quick day or a fresh campaign */
  function resetRun(campaign) {
    if (!game.isHost || !game.run) return;
    const run = game.run, n = (run.quick?.n | 0) + 1;
    const base = { ...newRun(), forecast: run.forecast || {}, runId: run.runId };
    delete base.phase;
    const fresh = campaign ? base : { ...base, ...quickFields(String(game.net?.code || run.runId) + ':' + n, tierOf, run.moon), quick: { v: QUICK.v, n } };
    fresh.hub = run.hub;
    for (const it of [...game.items.all()]) game.net.broadcast('it', { e: 'rm', id: it.id });
    const cleared = {};
    for (const k of Object.keys(run)) if (!(k in fresh) && k !== 'phase') { cleared[k] = null; delete run[k]; }
    Object.assign(run, fresh);
    game.config.dayLengthSec = campaign ? 720 : QUICK.dayLengthSec;
    if (campaign) game.saveSlot = freeSlot();
    game.hostData.dayStats = game.freshDayStats(); game.hostData.collected = new Set();
    game._runSent?.clear();
    game.net.broadcast('gs', { ...cleared, ...fresh });
    game.hostSetPhase('orbit');
    game.net.broadcast(NET, { k: 'close' });
    for (const r of [...game.remotes.keys(), game.selfId]) game.net.sendTo(r, 'tp', { p: game.ship.spawns[0].toArray(), yaw: Math.PI / 2 });
    if (campaign) { try { game.hostSave(); } catch (e) { warn('save', e); } toast(tx('hg.camp'), 'good'); }
  }
  function hideEnd() {
    endEl?.remove(); endEl = null;
    try { game.input?.lock?.(); } catch { /* optional */ }
  }
  function showEnd(summary, done) {
    ensureStyle();
    const res = quickResult(summary, game.run), pay = quickReward(res);
    endEl?.remove();
    const btn = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.addEventListener('click', fn); return b; };
    endEl = el('div', { class: 'hg-end' });
    const title = res.allDead ? tx('hg.qs_dead') : res.ok ? tx('hg.qs_met') : tx('hg.qs_short');
    const box = el('div', { class: 'box' }, el('div', { class: 'h' }, el('b', {}, tx('hg.qs')), ' ' + (res.moon || '')),
      el('div', { class: 'b' }, el('div', { style: 'font-size:20px;font-weight:800' }, title), el('div', {}, tx('hg.qs_line', res)), el('div', {}, tx('hg.qs_line2', res)), el('div', { class: 'pay' }, tx('hg.qs_pay', pay))));
    const row = el('div', { class: 'r' });
    if (game.isHost) { row.append(btn(tx('hg.qs_again'), () => { done?.(); hideEnd(); resetRun(false); }), btn(tx('hg.qs_camp'), () => { done?.(); hideEnd(); resetRun(true); })); box.appendChild(row); }
    else box.append(el('div', { class: 'w' }, tx('hg.qs_wait')));
    const leave = btn(tx('hg.qs_leave'), () => { done?.(); hideEnd(); try { window.kefal?.leaveGame?.(); } catch { /* menu */ } });
    (game.isHost ? row : box).appendChild(leave);
    endEl.appendChild(box);
    (document.getElementById('ui') || document.body).appendChild(endEl);
    try { game.input?.unlock?.(); } catch { /* optional */ }
    endEl._done = done;
  }
  offs.push(mods.on('daySummary', (d, extra, g) => {
    if (g !== game || disposed || !quickOn() || d?.company) return;
    const gen = game.run.quick.n | 0;
    if (game.isHost) { const pay = quickReward(quickResult(d, game.run)); try { game.net.broadcast('xp', { xp: pay.xp, coin: pay.coin, reason: 'Quick Shift' }); } catch (e) { warn('reward', e); } }
    // queued AFTER the day report (showDaySummary emits this event before it queues the report)
    setTimeout(() => {
      if (disposed || !game.ui?.playCinematic || !quickOn() || (game.run.quick.n | 0) !== gen) return;
      game.ui.playCinematic('quickend', (done) => showEnd(d, done));
    }, 30);
  }));
  offs.push(mods.on('hostStart', (g) => { if (g === game && game.opts?.quick) startQuick(); }));
  offs.push(mods.on('netReady', (net, g) => {
    if (g !== game || !net?.on_) return;
    net.on_(NET, (d) => { if (d?.k === 'close') { const done = endEl?._done; endEl?.remove(); endEl = null; try { done?.(); } catch { /* cinematic gone */ } } });
  }));
  // no persistence cost: a Quick Shift day never touches the campaign save slots
  restores.push(wrapMethod(game, 'hostSave', (orig) => function (...a) { if (this.run?.quick) return undefined; return orig.apply(this, a); }));
  // the quota line of the objective tracker already reads "Bring scrap to the ship: today / quota" with daysLeft = 1

  offs.push(mods.on('update', (dt, g) => {
    if (g !== game || disposed) return;
    time += dt; tickT -= dt;
    try { doorTick(dt); } catch (e) { warn('door', e); }
    if (tickT <= 0) { try { coverTick(); } catch (e) { warn('cover', e); } }
    if (!S.told && quickOn() && time > 3) { S.told = true; toast(tx('hg.qs_start', { q: game.run.quota }), 'info', 9000); }   // host and joiner alike (run.quick came with the run state)
    if (tickT > 0) return;
    tickT = 0.5;
    try { publishHub(); docksTick(); } catch (e) { warn('tick', e); }
  }));

  const api = {
    NET, shopLock, remoteHub, card, openPanel, quick: quickOn, resetRun, startQuick,
    locked: lockedIds, door: () => door, endShown: () => !!endEl, showEnd,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const o of offs) { try { o(); } catch { /* ignore */ } }
      for (const r of restores.reverse()) { try { r(); } catch { /* ignore */ } }
      style?.remove(); docksStyle?.remove(); endEl?.remove();
      try { door?.grp.parent?.remove(door.grp); } catch { /* ignore */ }
      for (const e of tarps.values()) { for (const o of e.hidden) o.visible = true; e.grp.parent?.remove(e.grp); } tarps.clear();
    },
  };
  void panelEl; void hubOpen;
  return api;
}
