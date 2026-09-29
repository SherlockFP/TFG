// [avatar2] node check: the rounded "TFG Employee" avatar keeps the classic avatar's API + anchor names, every suit (venom, wave-3,
// all outfits) / hat / face / back cosmetic builds on it, and the triangle budget holds.   node tools/harness/avatar2.test.mjs
const av = await import('../../src/models/avatar.js');
const { OUTFITS, FACE_ACCS, BACK_ACCS } = await import('../../src/models/cosmetics.js');
const { HATS } = av;
const warn = console.warn; let warned = 0; console.warn = (...a) => { warned++; warn(...a); };
let bad = 0; const fail = (m) => { bad++; console.log('BAD', m); };
const tris = (root) => { let n = 0; root.traverse((o) => { if (o.isMesh && o.visible) { const g = o.geometry; n += (g.index ? g.index.count : g.attributes.position.count) / 3; } }); return n; };
const frameArgs = [{ speed: 0, time: 1 }, { speed: 3, sprint: true, time: 2 }, { crouch: true }, { grounded: false }, { climbing: true, speed: 1 },
  { carry2h: true }, { holding: true }, { swing: 0.5 }, { emote: 'sit' }, { emote: 'dance' }, { emote: 'wave' }, { emote: 'point' }, { dead: true }];
function drive(a) { for (const f of frameArgs) for (let i = 0; i < 6; i++) a.update(0.05, f); }

av.setClassicAvatar(false);
const a2 = av.createAvatar({ suitColor: '#3a7bd5', hat: 'none' });
const a1 = av.createAvatar({ suitColor: '#3a7bd5', hat: 'none', classic: true });
if (a2.style !== 'tfg2') fail('new avatar is not tfg2 (' + a2.style + ')');
if (av.createAvatar({ classic: true }).style === 'tfg2') fail('classic override ignored');
av.setClassicAvatar(true); if (av.createAvatar({}).style === 'tfg2') fail('classicAvatar setting ignored'); av.setClassicAvatar(false);
if (av.createAvatar({ faceStyle: 'mimic' }).style === 'tfg2') fail('mimic must stay classic');
if (av.createAvatar({ visorColor: '#000' }).style === 'tfg2') fail('visorColor (hit squad) must stay classic');

// API + anchor parity
for (const k of Object.keys(a1)) if (!(k in a2)) fail('missing api key ' + k);
for (const k of Object.keys(a1.parts)) {
  if (!a2.parts[k]) fail('missing parts.' + k);
  else if (!a2.parts[k].isObject3D) fail('parts.' + k + ' is not an Object3D');
}
for (const k of ['setSuitColor', 'setHat', 'getHat', 'setLook', 'getLook', 'setEyeColor', 'setHitFlash', 'setVisible', 'dispose', 'update', 'setMouth', 'setExpression'])
  if (typeof a2[k] !== 'function') fail('api ' + k + ' not a function');
for (const [k, v] of [['height', 1.8], ['radius', 0.35]]) if (a2[k] !== v) fail('a2.' + k + ' = ' + a2[k]);
for (const n of ['visor']) if (!a2.root.getObjectByName(n)) fail('no mesh named ' + n);

// triangle budget
const t2 = tris(a2.root), t1 = tris(a1.root);
console.log('tris new', Math.round(t2), 'classic', Math.round(t1));
if (t2 > 9000) fail('triangle budget exceeded: ' + t2);

// animation
drive(a2);
a2.setMouth(0.8); a2.setExpression('scared'); a2.setExpression('dead'); a2.setExpression('normal'); a2.setEyeColor('#ff0000'); a2.setHitFlash(0.5); a2.setHitFlash(0);
for (const p of Object.values(a2.parts)) if (p.position && ![p.position.x, p.position.y, p.position.z].every(Number.isFinite)) fail('NaN in part');
for (let i = 0; i < 30; i++) a2.update(0.05, {});   // recover from the dead pose
// hands are grip anchors: they must exist under the arms and hang below the shoulders
a2.root.updateMatrixWorld(true);
const wp = (o) => o.getWorldPosition(new (o.position.constructor)());
for (const h of ['handR', 'handL']) { const y = wp(a2.parts[h]).y; if (!(y > 0.2 && y < 1.6)) fail(h + ' world y ' + y); }
if (wp(a2.parts.head).y < 0.9 || wp(a2.parts.head).y > 1.9) fail('head y ' + wp(a2.parts.head).y);

// suits / hats / faces / backs
let suits = 0;
for (const o of OUTFITS) {
  a2.setLook({ suit: o.id }); drive(a2); suits++;
  const n = tris(a2.root); if (n > 16000) fail('suit ' + o.id + ' tris ' + n);
  a2.setLook({ suit: 'orange' });
}
for (const h of HATS) { a2.setLook({ hat: h.id }); a2.update(0.02, {}); if (a2.getHat() !== h.id) fail('hat ' + h.id); }
a2.setLook({ hat: 'none' });
for (const f of FACE_ACCS) { a2.setLook({ face: f.id }); a2.update(0.02, {}); }
for (const b of BACK_ACCS) { a2.setLook({ back: b.id }); a2.update(0.02, {}); }
a2.setLook({ suit: 'venom' }); if (a2.getLook().suit !== 'venom') fail('venom suit not applied');
a2.setSuitColor('#ff00ff');
console.log('suits', suits, 'hats', HATS.length, 'faces', FACE_ACCS.length, 'backs', BACK_ACCS.length);
a2.dispose();
if (warned) fail('console.warn called ' + warned + 'x');
console.log(bad ? 'FAILED' : 'avatar2 ok');
process.exit(bad ? 1 : 0);
