// SHIPDECK (wave 5): the shipyard's "Upper Deck" expansion, MASTERPLAN 25.10 (ship upper floor, tycoon style). Rules + state live in shipyard_core.js
// (state.deck, host-authoritative through the shipyard's `syact` ops deckup / deckroom), geometry + colliders in world/shiplayout.js (deckColliders), the
// look in models/shipdeck.js, the panel tab in ui/panels/shipdeck_tab.js. This module only polls the mirrored shipyard state (run.sy, so late joiners get it),
// opens the ceiling hatch (ship.deckHatch), builds the deck meshes and the colliders on every peer, and nothing else. No net messages of its own.
//   Mk I   bare deck reached from INSIDE by the hub stair (U-shaped, planStairs ramps) through the hatch: slab, rails, lamp posts, mast beacon
//   Mk II  cabin with a glass band + two rooms the crew picks (bunk room / storage / turret control / observation lounge), lit by emissive strips
//   Mk III glass observation dome, four room slots and the extra roof mount M6 (game/ship2.js) + 1 ship power slot
import { addTranslations } from '../core/i18n.js';
import { G } from '../physics/physics.js';
import * as L from '../world/shiplayout.js';
import { sanitizeDeck, blankDeck } from './shipyard_core.js';
import { buildDeck } from '../models/shipdeck.js';

addTranslations({
  'UPPER DECK': 'ÜST KAT', 'Upper Deck': 'Üst Kat', 'Upper Deck upgraded to {mk}': 'Üst Kat yükseltildi: {mk}', 'Deck room set: {name}': 'Kat odası seçildi: {name}', 'Deck room cleared': 'Kat odası boşaltıldı',
  'Bunk Room': 'Yatakhane', 'Storage': 'Depo', 'Turret Control': 'Taret Kontrol', 'Observation Lounge': 'Gözlem Salonu',
  'Bare deck': 'Çıplak güverte', 'Cabin + rooms': 'Kabin + odalar', 'Glass dome': 'Cam kubbe',
  'A deck on the roof, reached by the stair in the hub and the ceiling hatch. Open platform with rails.': 'Çatıda, merkezdeki merdiven ve tavan kapağıyla çıkılan bir güverte. Korkuluklu açık platform.',
  'A glass-banded cabin and two rooms of your choice.': 'Cam şeritli bir kabin ve seçtiğin iki oda.',
  'Glass observation dome, four rooms and one extra roof turret slot (+1 ship power).': 'Cam gözlem kubbesi, dört oda ve fazladan bir çatı taret yuvası (+1 gemi gücü).',
  'Cots and a night lamp. +60 s of Rested buff if the Bunk module is built.': 'Ranzalar ve bir gece lambası. Yatakhane modülü varsa Dinlenmiş etkisi +60 sn.',
  'Shelves and crates. +6 rack slots if the Cargo Bay is built.': 'Raflar ve sandıklar. Kargo Bölümü varsa +6 raf yuvası.',
  'Gunnery console. Roof turret fires 10% faster if the Turret Hardpoint is built.': 'Nişan konsolu. Taret Yuvası varsa çatı tareti %10 daha hızlı ateş eder.',
  'Sofa and a warm lamp. Jam sessions pay 10% more if the Lounge is built.': 'Kanepe ve sıcak bir lamba. Salon modülü varsa caz seansları %10 fazla verir.',
  'Ship cross-section': 'Gemi kesiti', 'Empty': 'Boş', 'Slot': 'Yuva', 'Clear': 'Boşalt', 'Deck room ▮{n}': 'Oda ▮{n}', 'Upper Deck is maxed (Mk III).': 'Üst Kat en üst seviyede (Mk III).',
  'Build the Upper Deck first (Mk II unlocks two rooms).': 'Önce Üst Katı yap (Mk II iki oda açar).', 'That deck slot is not built yet.': 'Bu kat yuvası henüz yok.', 'Unknown room.': 'Bilinmeyen oda.',
  'nose': 'burun', 'tail': 'kıç', 'HUB': 'MERKEZ', 'ENGINE / CARGO': 'MOTOR / KARGO',
  'Stair in the hub, hatch in the ceiling': 'Merkezde merdiven, tavanda kapak', 'BUILD DECK': 'KATI YAP',
}, 'tr');
addTranslations({
  'UPPER DECK': 'ВЕРХНЯЯ ПАЛУБА', 'Upper Deck': 'Верхняя палуба', 'Upper Deck upgraded to {mk}': 'Верхняя палуба улучшена: {mk}', 'Deck room set: {name}': 'Комната палубы выбрана: {name}', 'Deck room cleared': 'Комната палубы очищена',
  'Bunk Room': 'Спальня', 'Storage': 'Склад', 'Turret Control': 'Пост турели', 'Observation Lounge': 'Смотровой салон',
  'Bare deck': 'Голая палуба', 'Cabin + rooms': 'Каюта + комнаты', 'Glass dome': 'Стеклянный купол',
  'A deck on the roof, reached by the stair in the hub and the ceiling hatch. Open platform with rails.': 'Палуба на крыше: лестница в хабе и люк в потолке. Открытая площадка с перилами.',
  'A glass-banded cabin and two rooms of your choice.': 'Каюта со стеклянной полосой и две комнаты на ваш выбор.',
  'Glass observation dome, four rooms and one extra roof turret slot (+1 ship power).': 'Стеклянный купол, четыре комнаты и ещё одно гнездо турели на крыше (+1 энергия корабля).',
  'Cots and a night lamp. +60 s of Rested buff if the Bunk module is built.': 'Койки и ночник. +60 с к эффекту Отдых, если построен модуль Спальня.',
  'Shelves and crates. +6 rack slots if the Cargo Bay is built.': 'Полки и ящики. +6 мест на стеллажах, если построен Грузовой отсек.',
  'Gunnery console. Roof turret fires 10% faster if the Turret Hardpoint is built.': 'Пульт наводчика. Турель на крыше стреляет на 10% быстрее, если построена.',
  'Sofa and a warm lamp. Jam sessions pay 10% more if the Lounge is built.': 'Диван и тёплая лампа. Джемы приносят на 10% больше, если построен Салон.',
  'Ship cross-section': 'Разрез корабля', 'Empty': 'Пусто', 'Slot': 'Слот', 'Clear': 'Очистить', 'Deck room ▮{n}': 'Комната ▮{n}', 'Upper Deck is maxed (Mk III).': 'Верхняя палуба на максимуме (Mk III).',
  'Build the Upper Deck first (Mk II unlocks two rooms).': 'Сначала постройте палубу (Mk II открывает две комнаты).', 'That deck slot is not built yet.': 'Этот слот палубы ещё не построен.', 'Unknown room.': 'Неизвестная комната.',
  'nose': 'нос', 'tail': 'корма', 'HUB': 'ХАБ', 'ENGINE / CARGO': 'ДВИГАТЕЛЬ / ГРУЗ',
  'Stair in the hub, hatch in the ceiling': 'Лестница в хабе, люк в потолке', 'BUILD DECK': 'ПОСТРОИТЬ',
}, 'ru');

export function installShipdeck(game) {
  let cur = blankDeck(), sig = '', piece = null, cols = [], timer = 0, disposed = false, lastGroup = null;
  const shipGroup = () => game.ship?.group || null;

  function clear() {
    for (const c of cols) { try { game.physics.removeCollider(c); } catch { /* physics gone */ } }
    cols = [];
    try { piece?.dispose?.(); } catch { /* */ }
    piece = null;
  }
  function rebuild() {
    const grp = shipGroup(); if (!grp || !game.physics) return false;
    clear();
    game.ship.deckHatch?.setOpen(cur.t >= 1);
    if (cur.t >= 1) {
      try { piece = buildDeck(cur.t, cur.rooms); grp.add(piece.group); } catch (e) { console.warn('[shipdeck] build', e); piece = null; }
      for (const c of L.deckColliders(cur.t, cur.rooms)) {
        try { cols.push(game.physics.addStaticBox(c.cx, c.cy, c.cz, c.sx / 2, c.sy / 2, c.sz / 2, c.q || 0, G.STATIC, { kind: 'static' })); } catch (e) { console.warn('[shipdeck] collider', c.id, e); }
      }
    }
    lastGroup = grp;
    return true;
  }
  function poll() {
    const raw = game.shipyard?.state?.()?.deck;
    if (!raw) return;
    const d = sanitizeDeck(raw), s = JSON.stringify(d) + (shipGroup() === lastGroup ? '' : '!');
    if (s === sig) return;
    cur = d;
    if (rebuild()) sig = JSON.stringify(d);
  }
  const off = game.mods?.on?.('update', (dt) => { if (disposed) return; timer -= dt; if (timer > 0) return; timer = 0.4; poll(); });
  game.later?.(() => poll(), 80);

  return {
    tier: () => cur.t, rooms: () => cur.rooms.slice(), state: () => cur,
    has: (room) => cur.rooms.includes(room),
    dispose() {
      if (disposed) return; disposed = true;
      try { off?.(); } catch { /* */ }
      clear();
      try { game.ship?.deckHatch?.setOpen(false); } catch { /* */ }
    },
  };
}
