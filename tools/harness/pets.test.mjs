// Pet system rules test:  node tools/harness/pets.test.mjs
// species table, XP / levels / evolution, traits, loyalty, capture odds, egg hatch timing, stable / skins, and every model (9 species x 3 stages) builds + animates.
import assert from 'node:assert/strict';
import * as C from '../../src/game/pets_core.js';
import { createPetModel } from '../../src/models/pets.js';

const seeded = (s = 7) => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('ok', name); };

ok('species table', () => {
  assert.equal(C.SPECIES_IDS.length, 9);
  for (const id of ['cat', 'dog', 'fox', 'bear', 'bee', 'owl', 'parrot', 'crow', 'bot']) assert.ok(C.SPECIES[id], id);
  for (const s of Object.values(C.SPECIES)) {
    assert.equal(s.abilities.length, 3, s.id);
    assert.deepEqual(s.abilities.map((a) => a.lv), [1, 10, 20], s.id);
    assert.equal(s.evo.length, 3, s.id);
    assert.equal(s.variants.length, 2, s.id);
  }
  assert.equal(C.evolutionName('dog', 1), 'Pup'); assert.equal(C.evolutionName('dog', 3), 'Server Hound');
});

ok('xp / levels / evolution', () => {
  assert.equal(C.levelFromXp(0), 1);
  assert.equal(C.levelFromXp(C.xpAtLevel(10)), 10);
  assert.equal(C.levelFromXp(C.xpAtLevel(10) - 1), 9);
  assert.equal(C.levelFromXp(1e9), C.MAX_LEVEL);
  assert.equal(C.stageForLevel(9), 1); assert.equal(C.stageForLevel(10), 2); assert.equal(C.stageForLevel(20), 3);
  assert.equal(C.slotsForLevel(1), 1); assert.equal(C.slotsForLevel(10), 2); assert.equal(C.slotsForLevel(30), 3);
  const p = C.makePet({ sp: 'dog', rng: seeded(1), shiny: false, trait: 'brave' });
  const r = C.awardXp(p, C.xpAtLevel(10), { raw: false });
  assert.equal(r.to, 10); assert.ok(r.evolved); assert.equal(r.stage, 2);
  const r2 = C.awardXp(p, C.xpAtLevel(20), { raw: false });
  assert.equal(r2.stage, 3); assert.equal(C.evolutionName('dog', C.stageOf(p)), 'Server Hound');
  assert.equal(C.unlockedAbilities(p).length, 3);
  const st = C.petStats(p); assert.ok(st.carry >= 2 && st.canFetch);
  assert.ok(C.petStats(C.makePet({ sp: 'bear', rng: seeded(2), trait: 'sturdy' })).maxHp > C.petStats(C.makePet({ sp: 'cat', rng: seeded(2), trait: 'sturdy' })).maxHp);
});

ok('traits', () => {
  const seen = new Set(); const rng = seeded(3);
  for (let i = 0; i < 200; i++) seen.add(C.rollTrait(rng));
  assert.equal(seen.size, C.TRAIT_IDS.length);
  const a = C.makePet({ sp: 'fox', rng: seeded(4), trait: 'lazy' }), b = C.makePet({ sp: 'fox', rng: seeded(4), trait: 'timid' });
  assert.ok(C.petStats(a).spd < C.petStats(b).spd);
  assert.ok(C.petStats(C.makePet({ sp: 'fox', rng: seeded(4), trait: 'brave' })).atk > C.petStats(a).atk);
});

ok('loyalty', () => {
  const p = C.makePet({ sp: 'cat', rng: seeded(5), trait: 'brave', source: 'capture' });
  assert.equal(p.ly, 25);
  assert.ok(C.obeyChance(10, 'brave') < C.obeyChance(90, 'brave')); assert.equal(C.obeyChance(100, 'brave'), 1);
  assert.ok(C.obeyChance(0, 'loyal') > C.obeyChance(0, 'brave') - 0.06);
  C.addLoyalty(p, 'treat'); assert.equal(p.ly, 37);
  const l = C.makePet({ sp: 'cat', rng: seeded(5), trait: 'loyal', source: 'capture' }); C.addLoyalty(l, 'treat'); assert.equal(l.ly, 43);
  assert.equal(C.obeys({ ly: 100, tr: 'brave' }, () => 0.99), true);
  assert.equal(C.obeys({ ly: 0, tr: 'brave' }, () => 0.99), false);
  const st = C.newPetsState(); st.stable.push(p); p.ly = 50; C.advanceDays(st, 3); assert.equal(p.ly, 44);
});

ok('capture odds', () => {
  assert.equal(C.captureChance({ type: 'scuttler', hpFrac: 0.6 }), 0);
  assert.equal(C.captureChance({ type: 'giant', hpFrac: 0.1 }), 0);
  const c = C.captureChance({ type: 'scuttler', hpFrac: 0.1 }), r = C.captureChance({ type: 'scuttler', hpFrac: 0.1, tier: 'rare' }), e = C.captureChance({ type: 'scuttler', hpFrac: 0.1, tier: 'epic', elite: true });
  assert.ok(c > r && r > e && c <= 0.85 && e >= 0.02);
  assert.ok(C.captureChance({ type: 'scuttler', hpFrac: 0.02 }) > C.captureChance({ type: 'scuttler', hpFrac: 0.25 }));
  assert.equal(C.captureSpecies('hound'), 'dog');
});

ok('egg hatch timing', () => {
  const s = C.newPetsState();
  assert.ok(C.incubate(s, 'pet_egg_common').ok); assert.ok(C.incubate(s, 'strange_egg').ok);
  assert.equal(C.incubate(s, 'pet_egg_wild').ok, false);          // 2 slots
  assert.equal(C.incubate(s, 'pet_carrier').ok, false);
  assert.equal(C.hatchReady(s, seeded(9)).length, 0);
  C.advanceDays(s, 1); assert.equal(C.hatchReady(s, seeded(9)).length, 0);
  C.advanceDays(s, 1); const h = C.hatchReady(s, seeded(9));       // common = 2 days, Unknown Egg = 4
  assert.equal(h.length, 1); assert.equal(s.stable.length, 1); assert.equal(s.incubator.length, 1);
  assert.ok(C.SPECIES[h[0].pet.sp]); assert.equal(s.stats.hatched, 1);
  C.advanceDays(s, 2); assert.equal(C.hatchReady(s, seeded(9)).length, 1);
  assert.equal(C.eggProgress({ start: 0, need: 4 }, 2), 0.5); assert.equal(C.daysLeft({ start: 0, need: 4 }, 1), 3);
  // shiny odds ~2% (x1), x3 for the Unknown Egg
  const rng = seeded(11); let sh = 0; for (let i = 0; i < 20000; i++) if (C.rollShiny(rng)) sh++;
  assert.ok(sh > 250 && sh < 550, 'shiny rate ' + sh);
});

ok('stable / active / ko / skins / shop', () => {
  const s = C.newPetsState(); const profile = { coins: 1000, achievements: { packrat: { at: 1 } } };
  for (let i = 0; i < C.MAX_STABLE; i++) assert.ok(C.adoptPet(s, C.makePet({ sp: 'dog', rng: seeded(i + 20) })).ok);
  assert.equal(C.adoptPet(s, C.makePet({ sp: 'cat' })).ok, false);
  assert.equal(s.active, s.stable[0].id);
  const id = s.stable[2].id; assert.ok(C.setActive(s, id).ok); assert.equal(C.activePet(s).id, id);
  assert.ok(C.renamePet(s, id, '  <b>Rex</b>  ')); assert.equal(C.findPet(s, id).nm, 'bRex/b');
  C.knockOut(s, C.findPet(s, id)); assert.ok(C.isResting(s, C.findPet(s, id))); assert.equal(C.setActive(s, s.stable[0].id).ok, true); assert.equal(C.setActive(s, id).ok, false);
  C.advanceDays(s, 1); assert.equal(C.isResting(s, C.findPet(s, id)), false);
  const ctx = { state: s, profile, now: new Date('2026-10-20') };
  assert.equal(C.skinAccess(ctx, 'c', 'gold').ok, true);                    // achievement skin
  assert.equal(C.skinAccess(ctx, 'h', 'crown').ok, false);
  assert.equal(C.skinAccess(ctx, 's', 'halloween').why, 'buy');             // October
  assert.equal(C.skinAccess(ctx, 's', 'winter').why, 'season');
  assert.ok(C.buySkin(ctx, 'h', 'party').ok); assert.equal(profile.coins, 900);
  assert.ok(C.equipSkin(ctx, id, 'h', 'party').ok); assert.equal(C.findPet(s, id).sk.h, 'party');
  assert.equal(C.equipSkin(ctx, id, 'h', 'crown').ok, false);
  assert.ok(C.releasePet(s, id));
  const s2 = C.newPetsState(); const r = C.buyPet({ state: s2, profile }, 'cat'); assert.ok(r.ok); assert.equal(profile.coins, 650);
  assert.equal(C.buyPet({ state: s2, profile }, 'owl').ok, false);          // egg only
  const prof = { pets: { stable: [{ sp: 'nope' }, { sp: 'fox', xp: 999999, nm: 'x'.repeat(50), sk: { h: 'evil' } }] } };
  const e = C.ensurePets(prof); assert.equal(e.stable.length, 1); assert.equal(e.stable[0].nm.length, C.NAME_MAX); assert.equal(e.stable[0].sk.h, 'none'); assert.equal(C.levelOf(e.stable[0]), 30);
});

ok('models: 9 species x 3 stages x shiny x skins build and animate', () => {
  for (const sp of C.SPECIES_IDS) for (const stage of [1, 2, 3]) for (const shiny of [false, true]) {
    const skin = { c: 'spike', h: stage === 3 ? 'crown' : 'party', v: 'v1', s: shiny ? 'winter' : 'none' };
    const m = createPetModel(sp, stage, { shiny, skin });
    assert.ok(m.root && m.height > 0.2, sp);
    for (const anim of ['idle', 'walk', 'run', 'sit', 'attack', 'ko', 'happy', 'sleep']) for (let i = 0; i < 6; i++) m.update(0.05, { anim, speed: 3, carry: i % 2 === 0, mood: 'happy' });
    m.setCarry(true);
    m.dispose();
  }
});

console.log(`pets.test: ${n} groups passed`);
