// LIVING FACILITY (wave 1, module 'facilitysys'): host-authoritative facility state machine, objective chain,
// puzzles, set-piece events and the CORE extraction phase. Build side (placement + meshes): world/interiors/facsys.js.
//
// STATE  game.run.fac (synced by the host's generic run sync; discrete changes are pushed at once with
//        broadcastRun(['fac'])):
//          { seed, power: off|low|normal|overload, security: passive|active|alarm|lockdown,
//            containment: normal|breach|failure, vent: clean|gas|fire|toxic, stage, extraction,
//            chain: voltage|order|codes, need (component id), core (flavour name), fuel, gen, wing, volt[3], ord[],
//            codes (bitmask of fragments read), coreId, ext: {left,total}|null, ev: blackout|unknown|null, evLeft,
//            alarm, lock, gas, purge, tOff, ovCd, result: success|fail|null }
//        stage: find -> fuel -> start -> route -> core -> extract -> done | failed
// NET    client -> host request 'facAct' { a, ... } (insert, start, restart, overload, volt, flip, code, read, sec,
//        purge, override); host -> all 'facFx' { k: 'snd'|'toast'|'big'|'spark', ... } one-shot effects.
// EVENTS (game.mods): 'tfg:facility' (fac, game) on every change of power/security/containment/vent/stage/extraction,
//        'tfg:extraction' ({ phase: 'start'|'end', success }), 'tfg:objective' ({ id, text, done }),
//        'tfg:darkness' ({ on }), 'tfg:breach' ({ level, pos }), 'tfg:alarm' ({ on }), 'tfg:facEvent' ({ kind }).
// Soft interfaces: game.inventory?.countItem / consume (components), game.inventory?.equipped?.('suit')?.def?.gasProof.
import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { t, tf, addTranslations } from '../core/i18n.js';
import { registerItem, ITEMS, itemDef } from './items.js';
import { MOONS } from './moons.js';
import { insideShip } from '../world/ship.js';
import { MINIGAMES } from '../minigames/index.js';
import { createFacilityHud, createNotePanel, createKeypadPanel } from '../ui/facilityhud.js';

// ---------------------------------------------------------------- tuning
const LOW_DIM = 0.45;                 // facility light level on emergency (low) power
const NEAR = 6;                        // m: host accepts panel actions from this far (lag-tolerant)
const EXT_BASE = 150, EXT_PER_SIZE = 25;   // extraction timer = 150 s + 25 s x facility size
const PULSE_EVERY = [40, 55], PULSE_LEN = [15, 22];   // lockdown pulses during extraction
const LOCK_EVENT = [30, 60];           // random lockdown set piece
const ALARM_LEN = 45, ALARM_NOISE_EVERY = 6, ALARM_LOUD = 2.2;
const BLACKOUT_LEN = 60, UNKNOWN_LEN = 20;
const GAS_LEN = 75, PURGE_T = 8, TOXIC_PURGE_T = 14, FIRE_LEN = 25;
const GAS_DPS = 3, TOXIC_DPS = 5, FIRE_DPS = 8;
const OVERLOAD_CD = 45, OVERLOAD_WIND = 2.2;
const TURRETS_OFF = 60;
const EVENT_START = 150;               // s of moon time before random set pieces can happen
const EVENT_P = { blackout: 0.22, lockdown: 0.18, unknown: 0.07 };
const CORE_MOVE = 1.4;                 // m the core may drift before it counts as taken

const CORE_ID = 'fac_core';
const COMP_NAME = { comp_fuse: 'FUSE', comp_fuel: 'FUEL CANISTER', comp_battery: 'BATTERY CELL', comp_coolant: 'COOLANT', comp_accesscard: 'ACCESS CARD' };

// ---------------------------------------------------------------- content
if (!ITEMS[CORE_ID]) registerItem({ id: CORE_ID, name: 'Containment Core', kind: 'big', value: [260, 380], weight: 60, hands: 0, fragile: 0.35, mass: 20, core: true });

function createCoreModel() {
  const g = new THREE.Group();
  const cage = new THREE.MeshLambertMaterial({ color: 0x6a6e72 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x24262a });
  const glow = new THREE.MeshBasicMaterial({ color: 0xff3a9a });
  const glow2 = new THREE.MeshBasicMaterial({ color: 0x50e8ff });
  const add = (geo, mat, x, y, z, rx = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.x = rx; g.add(m); return m; };
  add(new THREE.CylinderGeometry(0.34, 0.38, 0.1, 10), dark, 0, 0.05, 0);
  add(new THREE.CylinderGeometry(0.34, 0.3, 0.1, 10), dark, 0, 0.75, 0);
  add(new THREE.IcosahedronGeometry(0.22, 0), glow, 0, 0.4, 0);
  add(new THREE.TorusGeometry(0.3, 0.025, 4, 14), glow2, 0, 0.4, 0, Math.PI / 2);
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + Math.PI / 4; add(new THREE.BoxGeometry(0.05, 0.64, 0.05), cage, Math.cos(a) * 0.3, 0.4, Math.sin(a) * 0.3); }
  add(new THREE.BoxGeometry(0.16, 0.06, 0.08), glow2, 0, 0.82, 0);
  g.userData.lightAnchor = null;
  return g;
}

addTranslations({
  'Containment Core': 'Muhafaza Çekirdeği', 'FACILITY STATUS': 'TESİS DURUMU', 'POWER': 'ELEKTRİK', 'SECURITY': 'GÜVENLİK', 'CONTAIN': 'MUHAFAZA', 'AIR': 'HAVA',
  OFF: 'KAPALI', LOW: 'DÜŞÜK', NORMAL: 'NORMAL', OVERLOAD: 'AŞIRI YÜK', PASSIVE: 'PASİF', ACTIVE: 'AKTİF', ALARM: 'ALARM', LOCKDOWN: 'KİLİTLEME',
  BREACH: 'SIZINTI', FAILURE: 'ÇÖKÜŞ', CLEAN: 'TEMİZ', GAS: 'GAZ', FIRE: 'YANGIN', TOXIC: 'ZEHİRLİ', EXIT: 'ÇIKIŞ',
  'CONTAINMENT FAILURE': 'MUHAFAZA ÇÖKTÜ', '{core} EXTRACTED': '{core} ÇIKARILDI', NOTE: 'NOT', close: 'kapat',
  'CONTAINMENT KEYPAD': 'MUHAFAZA TUŞ TAKIMI', 'Digits, Backspace, Enter': 'Rakamlar, Backspace, Enter',
  GENERATOR: 'JENERATÖR', STALLED: 'DURDU', 'OVERLOAD!': 'AŞIRI YÜK!', ONLINE: 'ÇALIŞIYOR', PWR: 'GÜÇ', READY: 'HAZIR', 'START [E]': 'BAŞLAT [E]',
  OFFLINE: 'KAPALI', NEEDS: 'GEREKLİ', CONTAINMENT: 'MUHAFAZA', OPEN: 'AÇIK', 'NO POWER': 'ELEKTRİK YOK', 'WING LOCKED': 'KANAT KİLİTLİ',
  BUS: 'HAT', 'TURRETS OFFLINE': 'TARETLER KAPALI', FUSE: 'SİGORTA', 'FUEL CANISTER': 'YAKIT BİDONU', 'BATTERY CELL': 'PİL HÜCRESİ', COOLANT: 'SOĞUTUCU', 'ACCESS CARD': 'ERİŞİM KARTI',
  'DATA CORE': 'VERİ ÇEKİRDEĞİ', 'HEART.EXE': 'KALP.EXE', 'DEEP CORE': 'DERİN ÇEKİRDEK', 'ROOT SERVER': 'KÖK SUNUCU', 'NOCLIP CORE': 'NOCLIP ÇEKİRDEĞİ',
  'COLD CORE': 'SOĞUK ÇEKİRDEK', 'SLUDGE CORE': 'ÇAMUR ÇEKİRDEĞİ', 'PATIENT ZERO': 'SIFIR NUMARALI HASTA',
  'Generator - needs {c} [E]': 'Jeneratör - {c} gerekli [E]', 'Insert the {c} into the generator [E]': '{c} parçasını jeneratöre tak [E]',
  'You need a {c}. Search the facility.': 'Bir {c} lazım. Tesisi ara.', 'Start the generator [E]': 'Jeneratörü çalıştır [E]', 'Router rewiring: restore main power': 'Router yeniden kablolama: ana elektriği geri getir',
  'Generator stalled - restart [E]': 'Jeneratör durdu - yeniden başlat [E]', 'Generator cooling down...': 'Jeneratör soğuyor...',
  'OVERLOAD the generator [E]': 'Jeneratörü AŞIRI YÜKLE [E]', '60% door opens · 25% lights out · 10% alarm · 5% ???': '%60 kapı açılır · %25 ışıklar gider · %10 alarm · %5 ???',
  'Overload cooling down': 'Aşırı yük soğuyor', 'Bus {l}: {v} - adjust [E]': 'Hat {l}: {v} - ayarla [E]', 'Panel dead - no power': 'Panel ölü - elektrik yok',
  'Flip breaker {n} [E]': '{n}. sigortayı indir [E]', 'Enter the containment code [E]': 'Muhafaza kodunu gir [E]', 'Containment console': 'Muhafaza konsolu',
  'Read the note [E]': 'Notu oku [E]', 'Security console [E]': 'Güvenlik konsolu [E]', 'Silence the alarm (hack) [E]': 'Alarmı sustur (hack) [E]',
  'Disable the turrets for 60 s (hack) [E]': "Taretleri 60 sn kapat (hack) [E]", 'Ventilation: {s} - purge [E]': 'Havalandırma: {s} - temizle [E]', 'Ventilation: CLEAN': 'Havalandırma: TEMİZ',
  'Purging...': 'Temizleniyor...', 'Find the GENERATOR room ({d} m)': 'JENERATÖR odasını bul ({d} m)', 'The generator needs a {c} - find one in the facility': 'Jeneratöre bir {c} lazım - tesiste bul',
  'Carry the {c} to the generator and press [E]': '{c} parçasını jeneratöre götür ve [E] bas', 'Start the generator (router rewiring)': 'Jeneratörü çalıştır (router kablolama)',
  'Route power to the containment wing: set BUS A / B / C ({n}/3)': 'Muhafaza kanadına güç ver: HAT A / B / C ayarla ({n}/3)',
  'Flip the containment breakers in the right order ({n}/4)': 'Muhafaza sigortalarını doğru sırayla indir ({n}/4)',
  'Enter the containment code (fragments found {n}/3)': 'Muhafaza kodunu gir (bulunan parça {n}/3)',
  'Hint: a maintenance note is pinned somewhere in the facility': 'İpucu: tesiste bir yere bakım notu iğnelenmiş',
  'Or gamble: OVERLOAD the generator': 'Ya da kumar: jeneratörü AŞIRI YÜKLE', 'Take the {core} from the containment chamber': '{core} parçasını muhafaza odasından al',
  'EXTRACTION: get the {core} to the ship - {t}': 'TAHLİYE: {core} parçasını gemiye götür - {t}', 'Exit: {d} m': 'Çıkış: {d} m',
  '{core} extracted': '{core} çıkarıldı', 'Containment failure - the core destabilised': 'Muhafaza çöktü - çekirdek kararsızlaştı',
  'LOCKDOWN - {s}s': 'KİLİTLEME - {s} sn', 'ALARM - creatures are converging': 'ALARM - yaratıklar toplanıyor', 'VENT GAS - find clean air (green light) or purge the vents': 'HAVALANDIRMA GAZI - temiz hava bul (yeşil ışık) ya da havalandırmayı temizle',
  'BLACKOUT': 'KARARTMA', 'FACILITY STATUS: UNKNOWN': 'TESİS DURUMU: BİLİNMİYOR', 'POWER RESTORED': 'ELEKTRİK GELDİ', 'Security systems are waking up.': 'Güvenlik sistemleri uyanıyor.',
  'EXTRACTION': 'TAHLİYE', 'Get the core to the ship before the timer runs out': 'Süre bitmeden çekirdeği gemiye götür', 'CORE EXTRACTED': 'ÇEKİRDEK ÇIKARILDI',
  'The containment wing is open.': 'Muhafaza kanadı açıldı.', 'Wrong sequence. The panel bites back.': 'Yanlış sıra. Panel çarptı.', 'ACCESS DENIED': 'ERİŞİM REDDEDİLDİ',
  'Everything is open. Nothing is moving.': 'Her şey açık. Hiçbir şey kıpırdamıyor.', 'VENTILATION FAILURE': 'HAVALANDIRMA ARIZASI', 'Find clean air or purge the vents.': 'Temiz hava bul ya da havalandırmayı temizle.',
  'choked on vent gas.': 'havalandırma gazında boğuldu.', 'burned in a generator fire.': 'jeneratör yangınında yandı.', 'was fried by a power surge.': 'elektrik dalgalanmasında kızardı.',
  'MAINTENANCE LOG': 'BAKIM KAYDI', 'Containment wing bus levels': 'Muhafaza kanadı hat seviyeleri', 'BREAKER SEQUENCE': 'SİGORTA SIRASI', 'Do not improvise. It remembers.': 'Doğaçlama yapma. Hatırlıyor.',
  'CODE FRAGMENT': 'KOD PARÇASI', 'Personal log': 'Kişisel kayıt', 'FACILITY OVERRIDE': 'TESİS ATLATMA',
  'Lockdown lifted from the ship terminal.': 'Kilitleme gemi terminalinden kaldırıldı.', 'Not enough credits.': 'Yeterli kredi yok.',
  'SURGE ROUTED': 'DALGA YÖNLENDİRİLDİ', 'Something sealed clicks open.': 'Mühürlü bir şey tık diye açıldı.', 'Secure doors open.': 'Güvenli kapılar açıldı.',
  'The generator hums when nobody is in the room. We stopped asking why.': 'Odada kimse yokken jeneratör mırıldanıyor. Nedenini sormayı bıraktık.',
  'If the core sings, do NOT sing back.': 'Çekirdek şarkı söylerse, sakın karşılık VERME.',
  'Management says the Algorithm only watches. Management was deplatformed on Tuesday.': 'Yönetim, Algoritmanın sadece izlediğini söylüyor. Yönetim salı günü platformdan atıldı.',
  'Third shift reported the corridors were longer than on the map.': 'Üçüncü vardiya koridorların haritadakinden uzun olduğunu bildirdi.',
  'It learned the door codes before we did.': 'Kapı kodlarını bizden önce öğrendi.',
});

// note texts (lines: string or { hl })
const LORE = [
  'The generator hums when nobody is in the room. We stopped asking why.',
  'If the core sings, do NOT sing back.',
  'Management says the Algorithm only watches. Management was deplatformed on Tuesday.',
  'Third shift reported the corridors were longer than on the map.',
  'It learned the door codes before we did.',
];

export function installFacilitySystems(game) {
  const offs = [];
  const on = (ev, fn) => { const off = game.mods?.on?.(ev, fn); if (off) offs.push(off); };
  const hud = createFacilityHud();
  MINIGAMES.fac_note = createNotePanel;
  MINIGAMES.fac_keypad = createKeypadPanel;
  try { window.__kefalMods?.itemModels?.set?.(CORE_ID, () => createCoreModel()); } catch { /* optional */ }

  // death texts for the new causes (instance wrap, restored on dispose)
  const origDeath = game.deathText;
  const DEATHS = { gas: 'choked on vent gas.', fire: 'burned in a generator fire.', overload: 'was fried by a power surge.' };
  game.deathText = function (cause) { return DEATHS[cause] ? t(DEATHS[cause]) : origDeath.call(this, cause); };

  // ================================================================ helpers
  const fac = () => {
    const f = game.run?.fac;
    const w = game.world.facility;
    return f && w?.sys && game.run?.phase === 'moon' && f.seed === game.run.seed ? f : null;
  };
  const sysOf = () => game.world.facility?.sys || null;
  const coreName = (f) => t(f?.core || sysOf()?.coreName || 'CORE');
  const compName = (id) => t(COMP_NAME[id] || itemDef(id)?.name || 'PART');
  const roomAt = (pos) => {
    const F = game.world.facility;
    if (!F || !pos) return -1;
    const i = F.cellAt(pos.x, pos.z);
    return i >= 0 ? F.layout.roomOf[i] : -1;
  };
  const emit = (ev, ...a) => { try { game.mods?.emit?.(ev, ...a); } catch (e) { console.warn(ev, e); } };

  // ================================================================ HOST
  let hs = null;   // host-only state for the current facility
  const H = {};
  const push = () => { if (game.isHost && game.run) game.broadcastRun?.(['fac']); };
  const fx = (d) => game.net?.broadcast('facFx', d);
  const say = (text, kind = 'info') => game.net?.broadcast('sys', { text, kind });
  const posOf = (id) => (id === game.selfId ? game.player.pos : game.remotes.get(id)?.pos);
  const near = (id, p, r = NEAR) => { const q = posOf(id); return !!(q && p && q.distanceTo(p) < r); };

  function hostInit() {
    const F = game.world.facility, sys = F?.sys, run = game.run;
    if (!sys || !run || run.phase !== 'moon') { if (run?.fac) { run.fac = null; push(); } hs = null; return; }
    const L = F.layout;
    const rng = new RNG((run.seed ^ 0x0fac5ea7) >>> 0);
    const volt = sys.targets.volt.map((v) => { let s = rng.int(1, 9); if (s === v) s = (s % 9) + 1; return s; });
    hs = {
      seed: run.seed, rng, t: 0, sub: 0, fac: F, alarmNoiseT: 0, pulseT: rng.int(PULSE_EVERY[0], PULSE_EVERY[1]),
      nextEvtT: EVENT_START + rng.int(0, 200), events: 0, ventAt: sys.plan.ventEvent?.at ?? null, closedByLock: new Set(),
      overload: null, codeFails: 0, vanished: null, coreSpot: sys.core?.spot?.clone() || null, lastPower: null,
    };
    run.fac = {
      seed: run.seed, power: run.powerOn === false ? 'off' : sys.gen ? 'low' : 'normal', security: 'passive', containment: 'normal', vent: 'clean',
      stage: sys.gen ? 'find' : 'route', extraction: false, chain: sys.chain, need: sys.need, core: sys.coreName,
      fuel: 0, gen: sys.gen ? 0 : 1, wing: 0, volt, ord: [], codes: 0, coreId: null, ext: null, ev: null, evLeft: 0,
      alarm: 0, lock: 0, gas: 0, purge: 0, tOff: 0, ovCd: 0, result: null,
    };
    // components the generator needs: 2-3 in reachable rooms, away from the generator room
    const reach = sys.plan.reach;
    const genRoom = sys.gen?.room ?? -1;
    const spots = (F.scrapSpots || []).filter((s) => !s.sealed && s.room !== genRoom && !s.elevated && s.room >= 0 && reach[F.cellAt(s.x, s.z)]);
    rng.shuffle(spots);
    const nComp = 2 + ((L.size || 1) > 1.6 ? 1 : 0);
    if (sys.gen) for (let i = 0; i < Math.min(nComp, spots.length); i++) { const s = spots[i]; game.items.hostSpawn(sys.need, new THREE.Vector3(s.x, s.y + 0.4, s.z)); }
    // one key per sealed treasure room, somewhere reachable
    const nTreasure = L.rooms.filter((r) => r.treasure).length;
    for (let i = 0; i < nTreasure && spots.length > nComp + i; i++) { const s = spots[nComp + i]; game.items.hostSpawn('key', new THREE.Vector3(s.x, s.y + 0.4, s.z)); }
    // the CORE (open-pedestal fallback spawns it when the wing is powered)
    if (sys.core && !sys.core.open) spawnCore();
    push();
  }

  function spawnCore() {
    const sys = sysOf(), f = game.run?.fac;
    if (!sys?.core || !f || f.coreId) return;
    const qi = game.run.quotaIndex || 0;
    const mul = (MOONS[game.run.moon]?.scrapMul || 1) * (1 + qi * 0.12);
    f.coreId = game.items.hostSpawn(CORE_ID, sys.core.spot.clone().add(new THREE.Vector3(0, 0.55, 0)), { valueMul: mul, yaw: 0 });
    hs && (hs.coreSpot = sys.core.spot.clone().add(new THREE.Vector3(0, 0.45, 0)));
  }

  function setStage(stage) {
    const f = game.run.fac;
    if (!f || f.stage === stage) return;
    f.stage = stage;
    push();
  }

  function solveWing(how, from) {
    const f = game.run.fac, sys = sysOf();
    if (!f || f.wing) return;
    f.wing = 1;
    const door = sys?.contain?.door;
    if (door) { door.locked = false; game.hostSetDoor(door.id, true); }
    if (sys?.core?.open) spawnCore();
    if (f.stage === 'route' || f.stage === 'find' || f.stage === 'fuel' || f.stage === 'start') f.stage = 'core';
    fx({ k: 'snd', s: 'vault_open', p: door ? [door.pos.x, door.pos.y + 1.5, door.pos.z] : null, v: 1 });
    say(t('The containment wing is open.'), 'good');
    if (from) game.net.broadcast('xp', { to: from, xp: 90 + (game.run.quotaIndex || 0) * 15, coin: 12, reason: how === 'overload' ? 'Lucky overload' : 'Containment wing powered' });
    push();
  }

  function startAlarm(sec) {
    const f = game.run.fac;
    f.alarm = Math.max(f.alarm || 0, sec);
    hs.alarmNoiseT = 0;
    push();
  }

  function startLockdown(sec) {
    const f = game.run.fac;
    const doors = game.world.facility?.doors || [];
    for (const d of doors) if (d.kind === 'blast' && d.code && d.open) { hs.closedByLock.add(d.id); game.hostSetDoor(d.id, false); }
    f.lock = Math.max(f.lock || 0, sec);
    fx({ k: 'snd', s: 'blast_door', v: 0.9 });
    push();
  }
  function endLockdown() {
    const f = game.run.fac;
    f.lock = 0;
    for (const id of hs.closedByLock) { const d = game.doorById(id); if (d && !d.open) game.hostSetDoor(id, true); }
    hs.closedByLock.clear();
    push();
  }

  function startBlackout(sec, cause) {
    const f = game.run.fac;
    f.ev = 'blackout'; f.evLeft = sec;
    if (game.run.powerOn !== false) game.hostSetPower(false);
    emit('tfg:facEvent', { kind: 'blackout', cause }, game);
    push();
  }

  function startUnknown() {
    const f = game.run.fac;
    f.ev = 'unknown'; f.evLeft = UNKNOWN_LEN;
    // everything opens (never vaults / the containment door)
    for (const d of game.world.facility?.doors || []) {
      if (d.kind === 'door' && !d.treasure) { if (d.locked) d.locked = false; if (!d.open) game.hostSetDoor(d.id, true, true); }
      if (d.kind === 'blast' && !d.open) game.hostSetDoor(d.id, true, true);
    }
    // creatures vanish (host keeps what they were and puts them back afterwards)
    const keep = [];
    for (const c of [...game.creatures.host.values()]) {
      if (c.dead || c.zone !== 'in' || c.def?.hazard || c.def?.boss) continue;
      if (['mimic', 'leech', 'jester', 'mimicdoor'].includes(c.type)) { c.stunT = Math.max(c.stunT || 0, UNKNOWN_LEN); c.setState?.('stunned'); continue; }
      keep.push({ type: c.type, pos: c.pos.clone(), level: c.level, elite: c.elite, variant: c.variant ?? null, affix: c.affix ?? null, zone: c.zone, yaw: c.yaw });
      game.creatures.hostRemove(c.id);
    }
    hs.vanished = keep;
    emit('tfg:facEvent', { kind: 'unknown' }, game);
    push();
  }
  function endUnknown() {
    const f = game.run.fac;
    f.ev = null; f.evLeft = 0;
    for (const c of hs.vanished || []) game.creatures.hostSpawn(c.type, c.pos, { level: c.level, elite: c.elite, variant: c.variant, affix: c.affix, zone: c.zone, yaw: c.yaw });
    hs.vanished = null;
    fx({ k: 'snd', s: 'power_up', v: 0.6 });
    push();
  }

  function startVent(kind, sec) {
    const f = game.run.fac;
    f.vent = kind; f.gas = sec; f.purge = 0;
    push();
  }

  function startExtraction() {
    const f = game.run.fac;
    if (!f || f.extraction || f.result) return;
    const size = game.world.facility?.layout?.size || 1;
    const total = Math.round(EXT_BASE + EXT_PER_SIZE * size);
    f.extraction = true; f.stage = 'extract'; f.ext = { left: total, total }; f.containment = 'breach';
    hs.pulseT = hs.rng.int(PULSE_EVERY[0], PULSE_EVERY[1]);
    // doors change: every open regular door slams shut
    for (const d of game.world.facility?.doors || []) if (d.kind === 'door' && d.open) game.hostSetDoor(d.id, false);
    // containment breach: spawn rules change (balance / horde modules listen to the events too)
    const hd = game.hostData;
    if (hd) { hd.powerBoost = (hd.powerBoost || 0) + 2; hd.spawnT = Math.min(hd.spawnT || 30, 25); }
    try { game.hostSpawnWave?.(0.6); } catch (e) { console.warn('breach wave', e); }
    const core = game.items.get(f.coreId);
    emit('tfg:breach', { level: 'breach', pos: core?.obj?.position?.clone() || null }, game);
    push();
  }

  function endExtraction(success) {
    const f = game.run.fac;
    if (!f || f.result) return;
    f.extraction = false;
    f.result = success ? 'success' : 'fail';
    f.stage = success ? 'done' : 'failed';
    f.ext = null;
    f.alarm = 0;
    if (f.lock) endLockdown();
    const run = game.run, qi = run.quotaIndex || 0;
    if (success) {
      f.containment = 'normal';
      const bonus = 60 + 25 * qi;
      run.credits += bonus;
      game.broadcastRun(['credits']);
      for (const p of game.aiPlayers()) game.net.broadcast('xp', { to: p.id, xp: 220 + 40 * qi, coin: 25 + 6 * qi, reason: 'Core extracted' });
      say(tf('{core} extracted', { core: coreName(f) }) + ` +▮${bonus}`, 'good');
    } else {
      f.containment = 'failure';
      startVent('toxic', 45);
      const core = game.items.get(f.coreId);
      if (core?.value) game.net.broadcast('it', { e: 'val', id: core.id, v: Math.round(core.value * 0.5) });
      const hd = game.hostData;
      if (hd) hd.powerBoost = (hd.powerBoost || 0) + 3;
      try { game.hostSpawnWave?.(1); } catch (e) { console.warn('failure wave', e); }
      emit('tfg:breach', { level: 'failure', pos: core?.obj?.position?.clone() || null }, game);
    }
    push();
  }

  // ---------------------------------------------------------------- requests
  function onRequest(d, from) {
    const f = fac(), sys = sysOf();
    if (!f || !sys || !hs || typeof d?.a !== 'string') return;
    const a = d.a;
    const pw = f.power;
    const dead = pw === 'off';
    if (a === 'insert') {
      if (!sys.gen || f.fuel || !near(from, sys.gen.pos)) return;
      let ok = false;
      if (d.item) { const it = game.items.get(d.item); if (it && it.holder === from && it.type === f.need) { game.net.broadcast('it', { e: 'rm', id: it.id }); ok = true; } }
      else if (d.inv) ok = true;   // consumed from the (wave-1) backpack inventory on the client
      if (!ok) { game.net.sendTo(from, 'facFx', { k: 'toast', text: tf('You need a {c}. Search the facility.', { c: compName(f.need) }), kind: 'bad' }); return; }
      f.fuel = 1;
      if (f.stage === 'find' || f.stage === 'fuel') f.stage = 'start';
      fx({ k: 'snd', s: 'wire_connect', p: sys.gen.slotPos.toArray(), v: 0.9 });
      push();
    } else if (a === 'start') {
      if (!sys.gen || !f.fuel || f.gen || !near(from, sys.gen.pos)) return;
      f.gen = 1;
      if (game.run.powerOn === false && f.ev !== 'blackout') game.hostSetPower(true);
      if (f.stage === 'start' || f.stage === 'find' || f.stage === 'fuel') f.stage = f.wing ? 'core' : 'route';
      say(`${game.playerName(from)}: ${t('POWER RESTORED')} - ${t('Security systems are waking up.')}`, 'good');
      game.net.broadcast('xp', { to: from, xp: 70 + (game.run.quotaIndex || 0) * 10, coin: 10, reason: 'Generator restored', bounty: { type: 'minigame', target: 'fuse' } });
      push();
    } else if (a === 'restart') {
      if (!sys.gen || !f.gen || !dead || f.ev === 'blackout' || !near(from, sys.gen.pos)) return;
      game.hostSetPower(true);
      push();
    } else if (a === 'overload') {
      if (!sys.gen || !f.gen || dead || f.ovCd > 0 || hs.overload || !near(from, sys.gen.pos)) return;
      f.power = 'overload'; f.ovCd = OVERLOAD_CD;
      hs.overload = { t: OVERLOAD_WIND, roll: hs.rng.next(), from };
      game.creatures.noise(sys.gen.pos, 2.5);
      fx({ k: 'spark', p: sys.gen.overloadPos.toArray() });
      push();
    } else if (a === 'volt') {
      const i = d.i | 0, p = sys.panels[i];
      if (f.chain !== 'voltage' || f.wing || !f.gen || dead || !p || !near(from, p.pos)) return;
      f.volt[i] = (f.volt[i] % 9) + 1;
      fx({ k: 'snd', s: 'safe_click', p: p.pos.toArray(), v: 0.8 });
      if (f.volt.every((v, k) => v === sys.targets.volt[k])) solveWing('voltage', from);
      push();
    } else if (a === 'flip') {
      const i = d.i | 0, c = sys.contain;
      if (f.chain !== 'order' || f.wing || !f.gen || dead || !c || i < 0 || i > 3 || f.ord.includes(i) || !near(from, c.pos)) return;
      if (sys.targets.order[f.ord.length] === i) {
        f.ord.push(i);
        fx({ k: 'snd', s: 'lever_pull', p: c.pos.toArray(), v: 0.8 });
        if (f.ord.length >= 4) solveWing('order', from);
      } else {
        f.ord = [];
        game.hostHurtPlayer(from, 12, 'electric', null, c.pos);
        game.creatures.noise(c.pos, 1.6);
        fx({ k: 'spark', p: c.pos.toArray() });
        game.net.sendTo(from, 'facFx', { k: 'toast', text: t('Wrong sequence. The panel bites back.'), kind: 'bad' });
      }
      push();
    } else if (a === 'code') {
      const c = sys.contain;
      if (f.chain !== 'codes' || f.wing || !f.gen || dead || !c || !near(from, c.pos)) return;
      if (String(d.code || '') === sys.targets.code) solveWing('codes', from);
      else {
        hs.codeFails++;
        fx({ k: 'snd', s: 'terminal_error', p: c.pos.toArray(), v: 1 });
        game.net.sendTo(from, 'facFx', { k: 'toast', text: t('ACCESS DENIED'), kind: 'bad' });
        if (hs.codeFails % 3 === 0) startAlarm(30);
      }
    } else if (a === 'read') {
      const i = d.i | 0, n = sys.notes[i];
      if (!n || !near(from, n.pos, 8)) return;
      if (!(f.codes & (1 << i))) { f.codes |= 1 << i; push(); }
    } else if (a === 'sec') {
      const s = sys.security;
      if (!s || dead || !near(from, s.pos)) return;
      if (d.op === 'silence' && f.alarm > 0 && !f.extraction) f.alarm = 0;
      if (f.lock > 0 && !f.extraction) endLockdown();
      f.tOff = TURRETS_OFF;
      game.net.broadcast('xp', { to: from, xp: 40, coin: 5, reason: 'Security hacked', bounty: { type: 'minigame', target: 'safe' } });
      push();
    } else if (a === 'secfail') {
      const s = sys.security;
      if (!s || !near(from, s.pos)) return;
      startAlarm(ALARM_LEN);
    } else if (a === 'purge') {
      const v = sys.vent;
      if (!v || dead || f.vent === 'clean' || f.purge > 0 || !near(from, v.pos)) return;
      f.purge = f.vent === 'toxic' ? TOXIC_PURGE_T : PURGE_T;
      fx({ k: 'snd', s: 'steam_hiss', p: v.pos.toArray(), v: 1 });
      push();
    } else if (a === 'override') {
      if (!(f.lock > 0)) return;
      if ((game.run.credits || 0) < 25) { game.net.sendTo(from, 'facFx', { k: 'toast', text: t('Not enough credits.'), kind: 'bad' }); return; }
      game.run.credits -= 25; game.broadcastRun(['credits']);
      endLockdown();
      say(t('Lockdown lifted from the ship terminal.'), 'info');
    }
  }

  function resolveOverload() {
    const o = hs.overload, f = game.run.fac, sys = sysOf();
    hs.overload = null;
    if (!f) return;
    f.power = game.run.powerOn === false ? 'off' : f.gen ? 'normal' : 'low';
    const r = o.roll;
    let kind;
    if (r < 0.6) {
      kind = 'door';
      if (!f.wing && (f.stage === 'route' || f.stage === 'core')) solveWing('overload', o.from);
      else {
        const td = (game.world.facility?.doors || []).find((d) => d.treasure && d.locked);
        if (td) { td.locked = false; game.hostSetDoor(td.id, true); say(`${t('SURGE ROUTED')}: ${t('Something sealed clicks open.')}`, 'good'); }
        else { for (const d of game.world.facility?.doors || []) if (d.kind === 'blast' && !d.open) game.hostSetDoor(d.id, true); say(`${t('SURGE ROUTED')}: ${t('Secure doors open.')}`, 'info'); }
      }
    } else if (r < 0.85) {
      kind = 'blackout';
      startBlackout(BLACKOUT_LEN, 'overload');
      if (hs.rng.chance(0.3)) startVent('fire', FIRE_LEN);
      for (const p of game.aiPlayers()) if (!p.dead && sys?.gen && p.pos.distanceTo(sys.gen.pos) < 3) game.hostHurtPlayer(p.id, 15, 'overload', null, sys.gen.pos);
    } else if (r < 0.95) {
      kind = 'alarm';
      startAlarm(ALARM_LEN);
    } else {
      kind = 'unknown';
      startUnknown();
    }
    emit('tfg:facEvent', { kind: 'overload', result: kind }, game);
    push();
  }

  // ---------------------------------------------------------------- host tick (4 Hz logic, per-frame timers)
  function hostTick(dt) {
    const f = fac();
    if (!f || !hs || hs.seed !== game.run.seed || hs.fac !== game.world.facility) return;
    const sys = sysOf();
    hs.t += dt;
    const dec = (k) => { if (f[k] > 0) { f[k] = Math.max(0, f[k] - dt); return f[k] === 0; } return false; };
    if (hs.overload) { hs.overload.t -= dt; if (hs.overload.t <= 0) resolveOverload(); }
    if (dec('alarm')) push();
    if (dec('lock') && hs.closedByLock.size) endLockdown();
    if (dec('tOff')) push();
    dec('ovCd');
    if (f.ev && dec('evLeft')) {
      if (f.ev === 'blackout') { f.ev = null; if (game.run.powerOn === false) game.hostSetPower(true); push(); }
      else if (f.ev === 'unknown') endUnknown();
    }
    if (f.purge > 0) { f.purge = Math.max(0, f.purge - dt); if (f.purge === 0) { f.vent = 'clean'; f.gas = 0; push(); } }
    else if (f.vent !== 'clean' && dec('gas')) { f.vent = 'clean'; push(); }
    hs.sub -= dt;
    if (hs.sub > 0) return;
    hs.sub = 0.25;
    // power mirrors run.powerOn (director blackouts, the apparatus, daily events, fuse boxes all use hostSetPower)
    const want = game.run.powerOn === false ? 'off' : f.power === 'overload' ? 'overload' : f.gen ? 'normal' : 'low';
    if (f.power !== want) f.power = want;
    // security derives from power + timers
    const sec = f.lock > 0 ? 'lockdown' : f.alarm > 0 || f.extraction ? 'alarm' : f.gen && f.power !== 'off' && !(f.tOff > 0) ? 'active' : 'passive';
    if (f.security !== sec) f.security = sec;
    // turrets only run on main power with security active (a hacked console or a blackout keeps them offline)
    const turretsOn = (f.power === 'normal' || f.power === 'overload') && sec !== 'passive';
    if (!turretsOn) for (const c of game.creatures.host.values()) if (c.type === 'turret' && !c.dead) c.disabledT = Math.max(c.disabledT || 0, 0.6);
    // stage: find the generator room
    if (f.stage === 'find' && sys.gen) {
      for (const p of game.aiPlayers()) if (!p.dead && p.zone === 'in' && (roomAt(p.pos) === sys.gen.room || p.pos.distanceTo(sys.gen.pos) < 5)) { f.stage = f.fuel ? 'start' : 'fuel'; push(); break; }
    }
    // the core: taken -> extraction; delivered -> success
    const core = f.coreId ? game.items.get(f.coreId) : null;
    if (f.coreId && !core && !f.result && (f.extraction || f.stage === 'core')) endExtraction(false);
    if (core && !f.extraction && !f.result) {
      const moved = core.holder || core.owner || (hs.coreSpot && core.obj.position.distanceTo(hs.coreSpot) > CORE_MOVE);
      if (moved) startExtraction();
    }
    if (f.extraction && core) {
      const holderP = core.holder ? game.aiPlayerById(core.holder) : null;
      const inShip = core.state === 'world' ? insideShip(core.obj.position) : !!holderP?.inShip;
      if (inShip) endExtraction(true);
    }
    if (f.extraction && f.ext) {
      f.ext.left = Math.max(0, f.ext.left - 0.25);
      if (f.ext.left <= 0) endExtraction(false);
      else {
        hs.pulseT -= 0.25;
        if (hs.pulseT <= 0 && !(f.lock > 0)) { hs.pulseT = hs.rng.int(PULSE_EVERY[0], PULSE_EVERY[1]); startLockdown(hs.rng.int(PULSE_LEN[0], PULSE_LEN[1])); }
      }
    }
    // alarm: loud noise pulls creatures (onto the core carrier during extraction)
    if (f.security === 'alarm') {
      hs.alarmNoiseT -= 0.25;
      if (hs.alarmNoiseT <= 0) {
        hs.alarmNoiseT = ALARM_NOISE_EVERY;
        let p = null;
        if (f.extraction && core) p = core.holder ? game.aiPlayerById(core.holder)?.pos : core.obj.position;
        if (!p) { const ins = game.aiPlayers().filter((q) => !q.dead && q.zone === 'in'); if (ins.length) p = ins[Math.floor(hs.rng.next() * ins.length)].pos; }
        if (p) game.creatures.noise(p.clone(), ALARM_LOUD);
      }
    }
    // seeded vent failure + rare random set pieces (never during extraction)
    const moonT = game.hostData?.moonT || hs.t;
    if (hs.ventAt !== null && moonT >= hs.ventAt && !f.extraction) { hs.ventAt = null; if (f.vent === 'clean') startVent('gas', GAS_LEN); }
    if (moonT >= hs.nextEvtT && !f.extraction && !f.ev && !(f.lock > 0) && hs.events < 2) {
      hs.nextEvtT = moonT + hs.rng.int(180, 300);
      const r = hs.rng.next();
      if (r < EVENT_P.blackout) { hs.events++; startBlackout(BLACKOUT_LEN, 'event'); }
      else if (r < EVENT_P.blackout + EVENT_P.lockdown) { hs.events++; startLockdown(hs.rng.int(LOCK_EVENT[0], LOCK_EVENT[1])); }
      else if (r < EVENT_P.blackout + EVENT_P.lockdown + EVENT_P.unknown) { hs.events++; startUnknown(); }
    }
    // cheap anti-cheat: the containment door only stands open once the wing is powered
    const cd = sys.contain?.door;
    if (cd && cd.open && !f.wing) { cd.locked = true; game.hostSetDoor(cd.id, false); }
  }

  // ================================================================ CLIENT
  const cs = { prev: null, sig: '', stageSig: '', extLeft: 0, lastExtSync: null, klaxon: null, gasT: 0, fireT: 0, fogKey: '', savedFog: undefined, unknownAmb: false, exitBoost: null, arrow: 0, exitD: null, hudT: 0 };

  function onFx(d, from) {
    if (!d || from !== game.net?.hostId) return;
    const a = game.audio;
    if (d.k === 'snd') {
      if (d.p) a.at(d.s, new THREE.Vector3().fromArray(d.p), d.v ?? 1, { occlude: true, refDistance: 3, maxDistance: 50 });
      else if (game.player.indoor) a.play(d.s, { volume: (d.v ?? 1) * 0.7, bus: 'sfx' });
    } else if (d.k === 'spark') {
      const p = new THREE.Vector3().fromArray(d.p);
      a.at('spark', p, 1, { occlude: true, refDistance: 3, maxDistance: 40 });
      a.at('taser_zap', p, 0.8, { occlude: true, refDistance: 3, maxDistance: 30 });
      game.particles?.burst(p, 'sparks', null, 1.6);
      if (game.player.pos.distanceTo(p) < 6) game.engine.shake(0.25);
    } else if (d.k === 'toast') game.ui.toast(d.text, d.kind || 'info');
  }

  function stateSig(f) { return f ? [f.power, f.security, f.containment, f.vent, f.stage, f.extraction].join('|') : ''; }

  function clientTransitions(f) {
    const p = cs.prev || {};
    const hud = game.ui.hud;
    const big = (a, b) => hud?.bigText?.(a, b || '');
    if (f.power !== p.power) {
      if (p.power === 'low' && f.power === 'normal') { big(t('POWER RESTORED'), t('Security systems are waking up.')); game.audio.play('power_up', { volume: 0.8, bus: 'sfx' }); }
      if (f.power === 'overload') { game.audio.play('spark', { volume: 0.8, bus: 'sfx' }); game.engine.shake(0.4); }
      if ((f.power === 'off') !== (p.power === 'off') && p.power) emit('tfg:darkness', { on: f.power === 'off' }, game);
    }
    if (f.security !== p.security) {
      if (f.security === 'lockdown') { big(t('LOCKDOWN'), tf('LOCKDOWN - {s}s', { s: Math.ceil(f.lock || 0) })); game.audio.play('blast_door', { volume: 0.7, bus: 'sfx' }); }
      else if (f.security === 'alarm' && p.security !== 'lockdown' && !f.extraction) { big(t('ALARM'), t('ALARM - creatures are converging')); }
      if ((f.security === 'alarm') !== (p.security === 'alarm')) emit('tfg:alarm', { on: f.security === 'alarm' }, game);
    }
    if (f.extraction && !p.extraction) {
      big(t('EXTRACTION'), t('Get the core to the ship before the timer runs out'));
      game.audio.play('chase_sting', { volume: 0.9, bus: 'sfx' });
      game.engine.shake(0.6);
      emit('tfg:extraction', { phase: 'start', core: f.coreId, total: f.ext?.total }, game);
    }
    if (f.result && !p.result) {
      if (f.result === 'success') { big(t('CORE EXTRACTED'), coreName(f)); game.audio.play('ui_quota_met', { volume: 0.8, bus: 'sfx' }); }
      else { big(t('CONTAINMENT FAILURE'), t('Containment failure - the core destabilised')); game.audio.play('death_sting', { volume: 0.8, bus: 'sfx' }); }
      emit('tfg:extraction', { phase: 'end', success: f.result === 'success' }, game);
    }
    if (f.ev !== p.ev) {
      if (f.ev === 'unknown') { big(t('FACILITY STATUS: UNKNOWN'), t('Everything is open. Nothing is moving.')); game.audio.play('scan_blip', { volume: 0.5, bus: 'sfx', pitch: 0.5 }); }
      if (f.ev === 'blackout') big(t('BLACKOUT'), '');
    }
    if (f.vent !== p.vent && f.vent !== 'clean' && p.vent) big(t('VENTILATION FAILURE'), t('Find clean air or purge the vents.'));
    if (f.stage !== p.stage && p.stage) {
      emit('tfg:objective', { id: p.stage, text: objectiveText(p, true), done: true }, game);
      emit('tfg:objective', { id: f.stage, text: objectiveText(f, false), done: f.stage === 'done' }, game);
    }
    cs.prev = { ...f, volt: [...(f.volt || [])], ord: [...(f.ord || [])] };
  }

  function objectiveText(f, done) {
    const cn = coreName(f);
    switch (f.stage) {
      case 'find': return t('Find the GENERATOR room ({d} m)').replace(' ({d} m)', '');
      case 'fuel': return tf('The generator needs a {c} - find one in the facility', { c: compName(f.need) });
      case 'start': return t('Start the generator (router rewiring)');
      case 'route': return f.chain === 'voltage' ? tf('Route power to the containment wing: set BUS A / B / C ({n}/3)', { n: done ? 3 : 0 }) : f.chain === 'order' ? tf('Flip the containment breakers in the right order ({n}/4)', { n: done ? 4 : 0 }) : tf('Enter the containment code (fragments found {n}/3)', { n: 3 });
      case 'core': return tf('Take the {core} from the containment chamber', { core: cn });
      case 'extract': return tf('EXTRACTION: get the {core} to the ship - {t}', { core: cn, t: '' });
      case 'done': return tf('{core} extracted', { core: cn });
      case 'failed': return t('Containment failure - the core destabilised');
      default: return f.stage;
    }
  }

  // the route marker: follow the exit field (cells) a few steps ahead of the player
  function routeArrow() {
    const F = game.world.facility, sys = F?.sys, p = game.player;
    if (!sys?.exitField || !p.indoor) return { d: null, deg: 0 };
    const L = F.layout;
    let i = F.cellAt(p.pos.x, p.pos.z);
    if (i < 0 || sys.exitField[i] < 0) return { d: null, deg: 0 };
    const d0 = sys.exitField[i];
    for (let step = 0; step < 2; step++) {
      const x = i % L.w, z = (i / L.w) | 0;
      let best = -1;
      for (let d = 0; d < 4; d++) {
        const nx = x + [1, 0, -1, 0][d], nz = z + [0, 1, 0, -1][d];
        if (nx < 0 || nz < 0 || nx >= L.w || nz >= L.h) continue;
        const j = L.idx(nx, nz);
        if (!L.open.has(L.edgeKey(x, z, d)) || sys.exitField[j] < 0 || sys.exitField[j] >= sys.exitField[i]) continue;
        const door = F.doorByKey?.get(L.edgeKey(x, z, d));
        if (door && !door.open && door.locked) continue;
        best = j; break;
      }
      if (best < 0) break;
      i = best;
    }
    const tx = L.ox + ((i % L.w) + 0.5) * L.cell, tz = L.oz + (((i / L.w) | 0) + 0.5) * L.cell;
    let target = { x: tx, z: tz };
    if (d0 <= 1) {   // in the exit cell: point at the nearest exit door
      const doors = [F.mainDoor, ...(F.fireDoors || [])].filter(Boolean);
      const dn = doors.reduce((b, dd) => (!b || dd.pos.distanceTo(p.pos) < b.pos.distanceTo(p.pos) ? dd : b), null);
      if (dn) target = { x: dn.pos.x, z: dn.pos.z };
    }
    const ang = Math.atan2(-(target.x - p.pos.x), -(target.z - p.pos.z));   // yaw convention: forward = (-sin, -cos)
    let rel = ang - p.yaw;
    rel = Math.atan2(Math.sin(rel), Math.cos(rel));
    return { d: Math.round(d0 * L.cell + 2), deg: -rel * 180 / Math.PI };
  }

  function clientVisuals(dt, f) {
    const F = game.world.facility, sys = F?.sys, p = game.player;
    if (!sys) return;
    sys.refresh?.(f, t);
    sys.animate?.(dt, f, game);
    // light level: low power = dim emergency lighting, alarm = red takes over, unknown = steady
    const alarm = f.security === 'alarm' || f.security === 'lockdown' || f.extraction;
    let target = game.run.powerOn === false ? 0 : f.power === 'low' ? LOW_DIM : 1;
    if (f.power === 'overload') target = Math.random() < 0.35 ? 0.15 : 1.25;
    if (alarm && target > 0) target *= 0.5;
    if (f.ev === 'unknown') target = 1;
    const L0 = game.lights;
    let gd = L0.globalDim + (target - L0.globalDim) * Math.min(1, dt * (f.power === 'overload' ? 20 : 3));
    if (target === 0 && gd < 0.02) gd = 0;
    if (Math.abs(gd - target) < 0.005) gd = target;
    L0.globalDim = gd;
    // exit signs pulse during extraction
    if (f.extraction) {
      if (!cs.exitBoost) cs.exitBoost = (F.emitters || []).filter((e) => e.group === 'exit').map((e) => [e, e.intensity]);
      const k = 1.2 + Math.sin(game.time * 6) * 0.6;
      for (const [e, base] of cs.exitBoost) e.intensity = base * 2.2 * k;
    } else if (cs.exitBoost) { for (const [e, base] of cs.exitBoost) e.intensity = base; cs.exitBoost = null; }
    // indoor haze: gas green, alarm red
    const gas = f.vent !== 'clean' && p.indoor;
    const fogKey = gas ? 'gas' : alarm && p.indoor ? 'alarm' : 'base';
    if (fogKey !== cs.fogKey) {
      if (cs.savedFog === undefined) cs.savedFog = game.env.interiorFog;
      cs.fogKey = fogKey;
      game.env.interiorFog = fogKey === 'gas' ? { fog: f.vent === 'toxic' ? 0x3a4a08 : 0x26361a, density: 0.105 } : fogKey === 'alarm' ? { fog: 0x1c0303, density: 0.08 } : (cs.savedFog ?? null);
      if (fogKey === 'base') cs.savedFog = undefined;
    }
    // klaxon
    const wantKlaxon = alarm && p.indoor && !p.dead;
    if (wantKlaxon && !cs.klaxon) cs.klaxon = game.audio.play('alarm_loop', { volume: 0.16, bus: 'sfx', loop: true });
    else if (!wantKlaxon && cs.klaxon) { cs.klaxon.stop?.(0.4); cs.klaxon = null; }
    // FACILITY STATUS: UNKNOWN - silence
    if (f.ev === 'unknown' && !cs.unknownAmb) { cs.unknownAmb = true; game.audio.setAmbience?.('base', null); game.audio.setAmbience?.('buzz', null); }
    else if (f.ev !== 'unknown' && cs.unknownAmb) { cs.unknownAmb = false; game.updateAmbience(); }
    // security systems ride the facility power: lasers die in a blackout, flash during an alarm
    const hz = F.hazards, clock = F.setPieces?.clock;
    if (hz?.lasers?.length && typeof clock === 'number') {
      for (const g of hz.lasers) {
        if (f.power === 'off') g.offUntil = Math.max(g.offUntil, clock + 0.5);
        if (alarm) g.alarmT = Math.max(g.alarmT || 0, 0.3);
      }
    }
    // gas / fire damage (client side, like the steam vents)
    if (!p.dead && p.indoor) {
      cs.gasT -= dt;
      if (cs.gasT <= 0) {
        cs.gasT = 0.5;
        const safe = sys.safeRooms?.has(roomAt(p.pos));
        const proof = !!game.inventory?.equipped?.('suit')?.def?.gasProof;
        if ((f.vent === 'gas' || f.vent === 'toxic') && !safe && !proof) {
          game.damageLocal((f.vent === 'toxic' ? TOXIC_DPS : GAS_DPS) * 0.5, 'gas', null);
          game.engine.flash(0x70ff40, 0.08);
          if (Math.random() < 0.25) game.audio.play('breath_tired', { volume: 0.5, bus: 'sfx', pitch: 1.2 });
        }
        if (f.vent === 'fire' && sys.gen && p.pos.distanceTo(sys.gen.firePos) < 6) {
          game.damageLocal(FIRE_DPS * 0.5, 'fire', sys.gen.firePos);
          game.particles?.burst(sys.gen.firePos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2)), 'sparks', new THREE.Vector3(0, 1, 0), 1.2);
        }
      }
    }
  }

  function clientUpdate(dt) {
    const f = fac();
    if (!f) {
      if (cs.prev) {   // left the moon / new facility: reset every client-side override
        if (cs.klaxon) { cs.klaxon.stop?.(0.2); cs.klaxon = null; }
        if (cs.unknownAmb) { cs.unknownAmb = false; game.updateAmbience(); }
        if (cs.fogKey && cs.fogKey !== 'base' && game.world.facility) game.env.interiorFog = game.world.facility.atmosphere || null;
        cs.fogKey = ''; cs.savedFog = undefined; cs.exitBoost = null; cs.prev = null;
      }
      hud.update(null, null);
      return;
    }
    const sig = stateSig(f);
    if (sig !== cs.sig) { cs.sig = sig; emit('tfg:facility', f, game); }
    if (!cs.prev || cs.prev.stage !== f.stage || cs.prev.power !== f.power || cs.prev.security !== f.security || cs.prev.ev !== f.ev || cs.prev.vent !== f.vent || cs.prev.extraction !== f.extraction || cs.prev.result !== f.result) clientTransitions(f);
    // smooth local countdown between host syncs
    if (f.ext) {
      if (cs.lastExtSync !== f.ext.left) { cs.lastExtSync = f.ext.left; cs.extLeft = f.ext.left; }
      else cs.extLeft = Math.max(0, cs.extLeft - dt);
    }
    clientVisuals(dt, f);
    cs.hudT -= dt;
    if (cs.hudT <= 0) {
      cs.hudT = 0.2;
      const ra = f.extraction ? routeArrow() : { d: null, deg: 0 };
      cs.exitD = ra.d;
      const p = game.player;
      const event = f.lock > 0 ? tf('LOCKDOWN - {s}s', { s: Math.ceil(f.lock) }) : f.ev === 'unknown' ? t('FACILITY STATUS: UNKNOWN') : f.ev === 'blackout' ? t('BLACKOUT') : f.vent !== 'clean' ? `${t('AIR')}: ${t(f.vent.toUpperCase())}` : '';
      hud.update(f, { visible: (p.indoor || f.extraction) && !p.dead, coreName: f.core, left: cs.extLeft, exitD: ra.d, arrowDeg: ra.deg, event });
    }
  }

  // ---------------------------------------------------------------- interactables
  function pushInteractables(list) {
    const f = fac(), sys = sysOf(), p = game.player;
    if (!f || !sys || !p.indoor || p.dead) return;
    const nearP = (pos, r = 5) => pos && p.pos.distanceToSquared(pos) < r * r;
    const dead = f.power === 'off';
    const g = sys.gen;
    if (g && nearP(g.pos)) {
      const c = compName(f.need);
      if (!f.fuel) {
        list.push({ pos: g.slotPos, r: 0.6, reach: 2.4, label: () => (hasComponent(f.need) ? tf('Insert the {c} into the generator [E]', { c }) : tf('Generator - needs {c} [E]', { c })), action: () => insertComponent(f.need) });
      } else if (!f.gen) {
        list.push({ pos: g.pos, r: 0.8, reach: 2.4, label: t('Start the generator [E]'), sub: t('Router rewiring: restore main power'), action: () => startGenerator() });
      } else if (dead) {
        list.push({ pos: g.pos, r: 0.8, reach: 2.4, label: () => (f.ev === 'blackout' ? t('Generator cooling down...') : t('Generator stalled - restart [E]')), sub: () => (f.ev === 'blackout' ? `${Math.ceil(f.evLeft || 0)}s` : ''), action: () => { if (f.ev !== 'blackout') game.net.request('facAct', { a: 'restart' }); } });
      } else {
        list.push({ pos: g.overloadPos, r: 0.45, reach: 2.2, label: () => (f.ovCd > 0 ? t('Overload cooling down') : t('OVERLOAD the generator [E]')), sub: () => (f.ovCd > 0 ? `${Math.ceil(f.ovCd)}s` : t('60% door opens · 25% lights out · 10% alarm · 5% ???')), action: () => { if (!(f.ovCd > 0)) { game.audio.play('lever_pull', { volume: 0.7, bus: 'sfx' }); game.net.request('facAct', { a: 'overload' }); } } });
      }
    }
    if (f.chain === 'voltage' && !f.wing) for (const pn of sys.panels) {
      if (!nearP(pn.pos)) continue;
      list.push({ pos: pn.pos, r: 0.55, reach: 2.3, label: () => (!f.gen || dead ? t('Panel dead - no power') : tf('Bus {l}: {v} - adjust [E]', { l: pn.label, v: f.volt?.[pn.i] ?? 0 })), action: () => { if (f.gen && !dead) game.net.request('facAct', { a: 'volt', i: pn.i }); else game.audio.play('ui_error', { volume: 0.4, bus: 'ui' }); } });
    }
    const c = sys.contain;
    if (c && !f.wing && nearP(c.pos)) {
      if (f.chain === 'order' && c.levers) for (const lv of c.levers) {
        if (f.ord?.includes(lv.i)) continue;
        list.push({ pos: lv.pos, r: 0.14, reach: 2.2, label: () => (!f.gen || dead ? t('Panel dead - no power') : tf('Flip breaker {n} [E]', { n: lv.i + 1 })), action: () => { if (f.gen && !dead) game.net.request('facAct', { a: 'flip', i: lv.i }); } });
      } else if (f.chain === 'codes') {
        list.push({ pos: c.pos, r: 0.5, reach: 2.3, label: () => (!f.gen || dead ? t('Panel dead - no power') : t('Enter the containment code [E]')), action: () => { if (f.gen && !dead) openKeypad(); } });
      } else list.push({ pos: c.pos, r: 0.45, reach: 2.2, label: t('Containment console'), sub: () => (!f.gen ? t('NO POWER') : t('WING LOCKED')), action: () => {} });
    }
    for (const n of sys.notes) if (nearP(n.pos, 4)) list.push({ pos: n.pos, r: 0.4, reach: 2.2, label: t('Read the note [E]'), action: () => readNote(n) });
    const s = sys.security;
    if (s && nearP(s.pos)) {
      list.push({
        pos: s.pos, r: 0.7, reach: 2.4,
        label: () => (dead ? t('NO POWER') : f.alarm > 0 && !f.extraction ? t('Silence the alarm (hack) [E]') : t('Disable the turrets for 60 s (hack) [E]')),
        sub: t('Security console [E]').replace(' [E]', ''),
        action: () => { if (!dead) hackSecurity(f); },
      });
    }
    const v = sys.vent;
    if (v && nearP(v.pos)) list.push({ pos: v.pos, r: 0.6, reach: 2.3, label: () => (f.purge > 0 ? t('Purging...') : f.vent === 'clean' ? t('Ventilation: CLEAN') : tf('Ventilation: {s} - purge [E]', { s: t(f.vent.toUpperCase()) })), action: () => { if (f.vent !== 'clean' && !(f.purge > 0) && !dead) game.net.request('facAct', { a: 'purge' }); } });
  }

  function hasComponent(id) {
    const p = game.player;
    if (p.heldItem()?.type === id) return true;
    if (p.slots.some((sid) => sid && game.items.get(sid)?.type === id)) return true;
    try { return (game.inventory?.countItem?.(id) || 0) > 0; } catch { return false; }
  }
  function insertComponent(id) {
    const p = game.player;
    const held = p.heldItem();
    const slotItem = held?.type === id ? held : p.slots.map((sid) => sid && game.items.get(sid)).find((it) => it?.type === id);
    if (slotItem) { game.net.request('facAct', { a: 'insert', item: slotItem.id }); return; }
    let inv = 0;
    try { inv = game.inventory?.countItem?.(id) || 0; } catch { inv = 0; }
    if (inv > 0) { try { game.inventory.consume?.(id, 1); } catch (e) { console.warn(e); } game.net.request('facAct', { a: 'insert', inv: 1 }); return; }
    game.ui.toast(tf('You need a {c}. Search the facility.', { c: compName(id) }), 'bad');
    game.audio.play('ui_error', { volume: 0.4, bus: 'ui' });
  }
  function startGenerator() {
    game.openMinigame('fuse', { difficulty: Math.min(0.9, 0.3 + (game.hostDangerGuess?.() || 0) * 0.1) }, (res) => {
      if (res.success) game.net.request('facAct', { a: 'start' });
      else if (!res.cancelled) { game.engine.flash(0x88ccff, 0.4); game.damageLocal(10, 'electric'); }
    });
  }
  function hackSecurity(f) {
    game.openMinigame('safe', { difficulty: Math.min(0.9, 0.3 + (game.hostDangerGuess?.() || 0) * 0.1) }, (res) => {
      if (res.success) game.net.request('facAct', { a: 'sec', op: f.alarm > 0 ? 'silence' : 'turrets' });
      else if (!res.cancelled) { game.net.request('facAct', { a: 'secfail' }); game.ui.toast(t('ACCESS DENIED'), 'bad'); }
    });
  }
  function openKeypad() {
    const f = fac();
    game.openMinigame('fac_keypad', { length: 3, title: t('CONTAINMENT KEYPAD'), sub: tf('Enter the containment code (fragments found {n}/3)', { n: bits(f?.codes) }), noEase: true }, (res) => {
      if (res.success && res.code) game.net.request('facAct', { a: 'code', code: res.code });
    });
  }
  const bits = (m) => { let n = 0; for (let i = 0; i < 3; i++) if ((m || 0) & (1 << i)) n++; return n; };

  function noteContent(n) {
    const sys = sysOf(), T = sys.targets;
    const lore = LORE[(sys.layout.seed + n.i * 7) % LORE.length];
    if (n.kind === 'volt') return { title: t('MAINTENANCE LOG'), sub: t('Containment wing bus levels'), lines: [`BUS A = `, { hl: String(T.volt[0]) }, `\nBUS B = `, { hl: String(T.volt[1]) }, `\nBUS C = `, { hl: String(T.volt[2]) }, `\n\n${t(lore)}`] };
    if (n.kind === 'order') return { title: t('BREAKER SEQUENCE'), sub: t('Do not improvise. It remembers.'), lines: [{ hl: T.order.map((i) => i + 1).join('  →  ') }, `\n\n${t(lore)}`] };
    const frag = T.code.split('').map((ch, k) => (k === n.i ? ch : '_')).join(' ');
    return { title: `${t('CODE FRAGMENT')} ${n.i + 1}/3`, sub: t('Personal log'), lines: [{ hl: frag }, `\n\n${t(lore)}`] };
  }
  function readNote(n) {
    const c = noteContent(n);
    game.audio.play('cloth_rustle', { volume: 0.5, bus: 'sfx' });
    game.net.request('facAct', { a: 'read', i: n.i });
    game.openMinigame('fac_note', { ...c, noEase: true }, () => {});
  }

  // ---------------------------------------------------------------- objectives tracker lines
  function objectives(add, g, phase) {
    if (phase !== 'moon') return;
    const f = fac(), sys = sysOf(), p = game.player;
    if (!f || !sys) return;
    const cn = coreName(f), c = compName(f.need);
    const dist = (pos) => (pos ? Math.round(Math.hypot(pos.x - p.pos.x, pos.z - p.pos.z)) : 0);
    if (!p.indoor && !f.extraction && !f.result) return;   // inside only (the outdoor lines stay clean)
    switch (f.stage) {
      case 'find': add(tf('Find the GENERATOR room ({d} m)', { d: dist(sys.gen?.pos) }), 'main'); break;
      case 'fuel': add(tf('The generator needs a {c} - find one in the facility', { c }), 'main'); if (hasComponent(f.need)) add(tf('Carry the {c} to the generator and press [E]', { c }), 'sub'); break;
      case 'start': add(t('Start the generator (router rewiring)'), 'main'); break;
      case 'route': {
        if (f.chain === 'voltage') { const n = (f.volt || []).filter((v, k) => v === sys.targets.volt[k]).length; add(tf('Route power to the containment wing: set BUS A / B / C ({n}/3)', { n }), 'main', false, n / 3); add(t('Hint: a maintenance note is pinned somewhere in the facility'), 'hint'); }
        else if (f.chain === 'order') { const n = (f.ord || []).length; add(tf('Flip the containment breakers in the right order ({n}/4)', { n }), 'main', false, n / 4); add(t('Hint: a maintenance note is pinned somewhere in the facility'), 'hint'); }
        else { const n = bits(f.codes); add(tf('Enter the containment code (fragments found {n}/3)', { n }), 'main', false, n / 3); }
        add(t('Or gamble: OVERLOAD the generator'), 'hint');
        break;
      }
      case 'core': add(tf('Take the {core} from the containment chamber', { core: cn }), 'main'); break;
      case 'extract': {
        const left = Math.max(0, Math.ceil(cs.extLeft || f.ext?.left || 0));
        add(tf('EXTRACTION: get the {core} to the ship - {t}', { core: cn, t: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` }), 'warn', false, f.ext ? left / Math.max(1, f.ext.total) : null);
        if (cs.exitD != null) add(tf('Exit: {d} m', { d: cs.exitD }), 'sub');
        break;
      }
      case 'done': add(tf('{core} extracted', { core: cn }), 'main', true); break;
      case 'failed': add(t('Containment failure - the core destabilised'), 'warn'); break;
      default: break;
    }
    if (f.lock > 0) add(tf('LOCKDOWN - {s}s', { s: Math.ceil(f.lock) }), 'warn');
    else if (f.security === 'alarm' && !f.extraction) add(t('ALARM - creatures are converging'), 'warn');
    if (f.vent === 'gas' || f.vent === 'toxic') add(t('VENT GAS - find clean air (green light) or purge the vents'), 'warn');
  }

  // ---------------------------------------------------------------- terminal
  try {
    window.KefalAPI?.registerCommand?.('facility', (rest, term, g) => {
      const f = g.run?.fac;
      if (!f || g.run?.phase !== 'moon') { term.print(t('FACILITY: no facility telemetry (land on a moon first).')); return; }
      if (rest[0] === 'override') {
        if (!(f.lock > 0)) { term.print(t('No lockdown in progress.')); return; }
        g.net.request('facAct', { a: 'override' });
        term.print(t('Lockdown override requested (▮25).'));
        return;
      }
      const L = (k, v) => `${k.padEnd(12)}${String(v).toUpperCase()}`;
      term.print([`${t('FACILITY STATUS')} // ${t(f.core || '')}`, L('POWER', f.power), L('SECURITY', f.security), L('CONTAINMENT', f.containment), L('AIR', f.vent),
        L('OBJECTIVE', f.stage), f.ext ? L('EXTRACTION', `${Math.ceil(f.ext.left)}s`) : '', f.lock > 0 ? `LOCKDOWN ${Math.ceil(f.lock)}s - type FACILITY OVERRIDE (▮25)` : ''].filter(Boolean).join('\n'));
    }, 'facility telemetry (FACILITY OVERRIDE ends a lockdown, ▮25)');
  } catch (e) { console.warn('facility command', e); }

  // ================================================================ wiring
  let boundNet = null;
  const fxHandler = (d, from) => onFx(d, from);
  on('netReady', (net) => {
    if (boundNet === net) return;
    boundNet = net;
    net.on('msg:facFx', fxHandler);
  });
  if (game.net) { boundNet = game.net; game.net.on('msg:facFx', fxHandler); }
  on('registerHandlers', (Hh) => { Hh('facAct', (d, from) => { try { onRequest(d, from); } catch (e) { console.error('facAct', e); } }); });
  on('moonPopulated', () => { try { hostInit(); } catch (e) { console.error('facility init', e); } });
  on('phase', (ph) => {
    if (!game.isHost || !game.run) return;
    if (ph === 'takeoff') {
      const f = game.run.fac;
      if (f?.extraction && hs) {   // last chance: the core made it aboard as the ship leaves
        const core = game.items.get(f.coreId);
        if (core && (core.state === 'world' ? insideShip(core.obj.position) : !!game.aiPlayerById(core.holder)?.inShip)) endExtraction(true);
      }
    }
    if (ph === 'orbit' || ph === 'landing' || ph === 'company') { if (game.run.fac) { game.run.fac = null; push(); } hs = null; }
  });
  on('update', (dt) => {
    try { if (game.isHost) hostTick(dt); } catch (e) { console.error('facility host', e); }
    try { clientUpdate(dt); } catch (e) { console.error('facility client', e); }
  });
  on('interactables', (list) => { try { pushInteractables(list); } catch (e) { console.warn('facility interactables', e); } });
  on('objectives', (add, g, phase) => objectives(add, g, phase));

  return {
    get state() { return game.run?.fac || null; },
    get sys() { return sysOf(); },
    get host() { return hs; },
    /** debug / tests (host): run a facility action as if requested by the host player */
    act(a, d = {}) { game.net?.request('facAct', { a, ...d }); },
    /** debug / tests (host): force a set piece: 'blackout' | 'lockdown' | 'unknown' | 'alarm' | 'gas' */
    force(kind) {
      if (!game.isHost || !fac() || !hs) return false;
      if (kind === 'blackout') startBlackout(BLACKOUT_LEN, 'debug');
      else if (kind === 'lockdown') startLockdown(30);
      else if (kind === 'unknown') startUnknown();
      else if (kind === 'alarm') startAlarm(ALARM_LEN);
      else if (kind === 'gas') startVent('gas', GAS_LEN);
      else return false;
      return true;
    },
    dispose() {
      for (const off of offs) { try { off(); } catch { /* ignore */ } }
      offs.length = 0;
      boundNet?.off?.('msg:facFx', fxHandler);
      if (cs.klaxon) { cs.klaxon.stop?.(0.1); cs.klaxon = null; }
      game.deathText = origDeath;
      hud.dispose();
      if (MINIGAMES.fac_note === createNotePanel) delete MINIGAMES.fac_note;
      if (MINIGAMES.fac_keypad === createKeypadPanel) delete MINIGAMES.fac_keypad;
      try { window.KefalAPI?.registerCommand && window.__kefalMods?.commands?.delete?.('facility'); } catch { /* ignore */ }
      hs = null;
    },
  };
}
