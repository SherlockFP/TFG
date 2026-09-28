// ANOMALY / DICE: the Loot Box Shrine (The Algorithm's gambling altar: offer credits / scrap / HP / STATIC, a big d20 decides) and the
// physical Cursed Die (d6 item, throw it, the face it rests on decides an area effect for everyone near).
// Host-authoritative: the host rolls, the host spawns, clients only animate and apply effects to their own player.
import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { addTranslations, t } from '../core/i18n.js';
import { registerItem, ITEMS, SCRAP_TABLE, isSellable } from './items.js';
import { insideShip } from '../world/ship.js';
import { G } from '../physics/physics.js';
import { createShrine, dieFaceUp, SHRINE_SIZE } from '../models/anomaly.js';
import { MUTATIONS, GOOD_MUT, BAD_MUT, rollMutation, mutDuration } from './mutations.js';
import { POWERUPS } from './powerups.js';

// ------------------------------------------------------------------------------------------------ numbers
export const SHRINE_NUM = { chance: 0.35, maxRolls: 3, hpCost: 30, hpMin: 45, staticCost: 30, staticMax: 60, bonusHp: 2, bonusStatic: 3, bonusScrapMax: 3, animSec: 3.9, reach: 8 };
export const DIE_NUM = { uses: 3, cooldown: 12, area: 9, restSec: 0.7 };
export const creditCost = (q, rolls) => Math.min(400, Math.round((40 + 20 * q) * (1 + 0.5 * rolls)));
/** natural 1 is always the curse, natural 20 always mythic; anything else is shifted by the offering bonus and kept inside 2..19. */
export function finalRoll(nat, bonus) { if (nat <= 1) return 1; if (nat >= 20) return 20; return Math.max(2, Math.min(19, nat + bonus)); }
export const bandOf = (res) => (res <= 1 ? 'curse' : res <= 7 ? 'debuff' : res <= 14 ? 'buff' : res <= 19 ? 'big' : 'mythic');
export const BAND_COLOR = { curse: '#ff3a3a', debuff: '#ff8a5a', buff: '#7dff7d', big: '#ffd35a', mythic: '#ff4fd0' };
export const BAND_NAME = { curse: 'CURSED', debuff: 'DEBUFF', buff: 'BUFF', big: 'JACKPOT', mythic: 'MYTHIC DROP' };
/** Offering bonus for a held scrap value. */
export const scrapBonus = (value) => Math.min(SHRINE_NUM.bonusScrapMax, Math.floor((value || 0) / 40));

/** Pure: outcome descriptor for a final roll. rnd = () => [0,1), q = quota index. */
export function rollOutcome(res, rnd, q = 0) {
  const band = bandOf(res);
  const pick = (a) => a[Math.floor(rnd() * a.length) % a.length];
  const o = { band, res, muts: [], pus: [], heal: 0, clean: 0, addStatic: 0, credits: 0, spawn: null, mimic: false, all: false };
  if (band === 'curse') { o.mimic = true; o.muts.push(['b_beacon', 60]); o.addStatic = 15; }
  else if (band === 'debuff') { const id = rollMutation(rnd, 0); o.muts.push([id, mutDuration(id, rnd)]); if (res <= 3) o.addStatic = 15; }
  else if (band === 'buff') {
    if (rnd() < 0.5) { const id = rollMutation(rnd, 1); o.muts.push([id, mutDuration(id, rnd)]); }
    else { const id = pick(['p_oc', 'p_premium', 'p_adfree']); o.pus.push([id, POWERUPS[id].dur]); }
  } else if (band === 'big') {
    const r = rnd();
    if (r < 0.45) { const a = rollMutation(rnd, 1); o.muts.push([a, 120], [rollMutation(rnd, 1, [a]), 120]); }
    else if (r < 0.75) o.pus.push(['p_cloud', 0], ['p_xp', 180]);
    else { o.spawn = { type: pick(['goldbar', 'ring', 'figurine', 'trophy']), tier: 'epic' }; o.pus.push(['p_viral', 45]); o.credits = 50 + 25 * q; }
  } else { o.spawn = { type: pick(['goldbar', 'playbutton', 'usbidol', 'ring']), tier: 'mythic' }; o.all = true; o.heal = 100; o.clean = 100; o.pus.push(['p_xp', 180]); }
  return o;
}
/** Pure: what a resting die face does. */
export const DIE_EFFECTS = {
  1: { id: 'blackout', good: false, name: 'BLACKOUT', desc: 'The lights go out for 25 seconds.' },
  2: { id: 'swarm', good: false, name: 'SPAM SWARM', desc: 'Something crawled out of the die.' },
  3: { id: 'loot', good: true, name: 'LOOT SHOWER', desc: 'Scrap rains from nowhere.' },
  4: { id: 'heal', good: true, name: 'PATCH NOTES', desc: 'Everyone near: +40 HP, -25 STATIC.' },
  5: { id: 'speed', good: true, name: 'OVERCLOCK', desc: 'Everyone near: Overclocked Legs for 45 s.' },
  6: { id: 'burst', good: false, name: 'STATIC BURST', desc: 'Everyone near: +30 STATIC and a Jitter.' },
};
/** Pure: deterministic shrine plan (~35% of landings). spots = facility scrap spots. */
export function planShrine(spots, seed) {
  const rng = new RNG(((seed ^ 0xd1ce5) >>> 0) || 1);
  if (!rng.chance(SHRINE_NUM.chance)) return null;
  const ok = (spots || []).filter((s) => !s.elevated && !s.item && s.room >= 0 && s.type !== 'corridor' && (s.dist || 0) >= 6);
  if (!ok.length) return null;
  const s = rng.pick(ok);
  return { x: s.x, y: s.y, z: s.z, yaw: rng.float(0, Math.PI * 2) };
}

// ------------------------------------------------------------------------------------------------ items
if (!ITEMS.cursed_die) registerItem({ id: 'cursed_die', name: 'Cursed Die', kind: 'scrap', value: [30, 60], weight: 1, hands: 1, cursed: true, tier: 'epic',
  tip: 'LMB: throw it. The face it rests on decides an area effect for everyone near (3 uses). It whispers. It is not lucky.' });
for (const tb of Object.values(SCRAP_TABLE)) if (Array.isArray(tb) && !tb.some((e) => e[0] === 'cursed_die')) tb.push(['cursed_die', 1]);

addTranslations({
  'LOOT BOX SHRINE': 'LOOT KUTUSU SUNAĞI', 'Loot Box Shrine [E]': 'Loot Kutusu Sunağı [E]', 'rolls left': 'atış kaldı', 'The shrine is spent.': 'Sunak tükendi.', 'The shrine is busy.': 'Sunak meşgul.',
  'The Algorithm accepts payment in many forms.': 'Algoritma birçok ödeme biçimini kabul eder.', CREDITS: 'KREDİ', SCRAP: 'HURDA', BLOOD: 'KAN', 'STATIC ': 'STATİK ', Close: 'Kapat',
  'Nothing in hand': 'Elinde eşya yok', 'Not enough credits': 'Yetersiz kredi', 'Too weak': 'Çok zayıfsın', 'Too corrupted': 'Çok bozulmuşsun', 'bonus': 'bonus',
  CURSED: 'LANETLİ', DEBUFF: 'CEZA', BUFF: 'GÜÇLENDİRME', JACKPOT: 'JACKPOT', 'MYTHIC DROP': 'EFSANEVİ DÜŞÜŞ', 'natural': 'doğal',
  '1 curse + Deepfake': '1 lanet + Deepfake', '2-7 debuff': '2-7 ceza', '8-14 buff': '8-14 güçlenme', '15-19 jackpot': '15-19 jackpot', '20 mythic drop': '20 efsanevi düşüş',
  'Cursed Die': 'Lanetli Zar', 'LOOT SHOWER': 'HURDA YAĞMURU', 'PATCH NOTES': 'YAMA NOTLARI', 'STATIC BURST': 'STATİK PATLAMASI', BLACKOUT: 'KARANLIK', 'SPAM SWARM': 'SPAM SÜRÜSÜ',
  'The lights go out for 25 seconds.': 'Işıklar 25 saniye söner.', 'Something crawled out of the die.': 'Zarın içinden bir şey çıktı.', 'Scrap rains from nowhere.': 'Yoktan hurda yağıyor.',
  'Everyone near: +40 HP, -25 STATIC.': 'Yakındaki herkes: +40 CAN, -25 STATİK.', 'Everyone near: Overclocked Legs for 45 s.': 'Yakındaki herkes: 45 sn Aşırı Hızlı Bacaklar.', 'Everyone near: +30 STATIC and a Jitter.': 'Yakındaki herkes: +30 STATİK ve Titreme.',
  'LMB: throw it. The face it rests on decides an area effect for everyone near (3 uses). It whispers. It is not lucky.': 'Sol tık: fırlat. Durduğu yüz, yakındaki herkes için bir alan etkisi belirler (3 kullanım). Fısıldar. Şanslı değil.',
  'The die crumbles to ash.': 'Zar küle dönüşüyor.', 'The die is still warm.': 'Zar hâlâ sıcak.',
  'The house always wins. Except tonight.': 'Kasa hep kazanır. Bu gece hariç.', 'A curse! The house sends its regards.': 'Bir lanet! Kasa selamlarını gönderiyor.',
  'Tough luck. It is in the terms and conditions.': 'Kötü şans. Şartlar ve koşullarda yazıyor.', 'Small win. Engagement is love.': 'Küçük kazanç. Etkileşim aşktır.',
  'JACKPOT. Please enjoy responsibly.': 'JACKPOT. Lütfen sorumlulukla eğlenin.', 'Mythic. This will be reviewed by compliance.': 'Efsanevi. Bu uyum ekibince incelenecek.',
  'Roll the die. What is the worst that could happen?': 'Zarı at. En kötü ne olabilir ki?',
});
const QUIPS = {
  curse: 'A curse! The house sends its regards.', debuff: 'Tough luck. It is in the terms and conditions.', buff: 'Small win. Engagement is love.',
  big: 'JACKPOT. Please enjoy responsibly.', mythic: 'Mythic. This will be reviewed by compliance.',
};

const CSS = `
.anp{width:min(720px,94vw);background:linear-gradient(180deg,rgba(20,6,26,.97),rgba(8,3,12,.97));border:1px solid #ff4fd0;box-shadow:0 0 44px rgba(255,79,208,.35),inset 0 0 60px rgba(255,79,208,.07);padding:14px 20px 16px;font-family:var(--font,'VT323',monospace);color:#ffe8f8;position:relative}
.anp::before{content:'';position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(0deg,rgba(0,0,0,.2) 0 1px,transparent 1px 3px)}
.anp h2{margin:0;font-family:var(--font2,monospace);font-size:20px;letter-spacing:4px;color:#ff4fd0;text-shadow:0 0 12px rgba(255,79,208,.6)}
.anp .sub{opacity:.75;font-size:20px;margin:2px 0 10px}
.anp .odds{display:flex;gap:6px;flex-wrap:wrap;font-size:17px;margin-bottom:12px}
.anp .odds span{padding:0 8px;border:1px solid var(--c);color:var(--c)}
.anp .offers{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.anp .off{cursor:pointer;background:rgba(255,79,208,.08);border:1px solid rgba(255,79,208,.5);padding:8px 12px;text-align:left;font-family:inherit;color:inherit;min-height:74px}
.anp .off:hover{background:rgba(255,79,208,.22);border-color:#ffd35a}
.anp .off.dis{opacity:.35;pointer-events:none;filter:grayscale(.8)}
.anp .off b{display:block;font-family:var(--font2,monospace);font-size:12px;letter-spacing:2px;color:#ffd35a;margin-bottom:3px}
.anp .off i{display:block;font-style:normal;font-size:20px}.anp .off em{display:block;font-style:normal;font-size:16px;opacity:.7}
.anp .foot{display:flex;justify-content:space-between;align-items:center;margin-top:12px;font-size:18px;opacity:.85}
.anp .x{cursor:pointer;background:none;border:1px solid #ff4fd0;color:#ff4fd0;font-family:inherit;font-size:20px;padding:0 16px}
.an-roll{position:fixed;left:50%;top:26%;transform:translateX(-50%);z-index:60;pointer-events:none;text-align:center;font-family:var(--font,'VT323',monospace);animation:anRoll .5s cubic-bezier(.2,1.5,.4,1) both}
.an-roll .n{font-size:110px;line-height:.9;color:var(--c);text-shadow:0 0 26px var(--c),3px 3px 0 #10000c}
.an-roll .b{font-family:var(--font2,monospace);font-size:20px;letter-spacing:6px;color:var(--c);text-shadow:0 0 12px var(--c)}
.an-roll .m{font-size:24px;color:#fff0f8;opacity:.9;margin-top:4px;max-width:520px}
.an-roll.out{animation:anRollOut .6s ease-in both}
@keyframes anRoll{from{opacity:0;transform:translateX(-50%) scale(1.8)}to{opacity:1;transform:translateX(-50%) scale(1)}}
@keyframes anRollOut{to{opacity:0;transform:translateX(-50%) translateY(-24px)}}`;
let cssDone = false;
function ensureCss() {
  if (cssDone || typeof document === 'undefined') return;
  cssDone = true;
  const s = document.createElement('style'); s.id = 'tfg-anomaly-dice-css'; s.textContent = CSS; document.head.appendChild(s);
}

export function installDice(ctx) {
  const game = ctx.game;
  const D = { shrine: null, anim: null, builtFor: null, fac: null, panel: null, die: new Map(), forceNat: null, dieT: 0, lastOutcome: null, log: [] };
  const offs = [];
  const q = () => Math.max(0, game.run?.quotaIndex || 0);
  const smooth = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };

  // ---------------------------------------------------------------- shrine world
  function buildShrine() {
    disposeShrine();
    const fac = game.world?.facility, run = game.run;
    D.fac = fac || null;
    if (!fac || !run || (run.phase !== 'moon' && run.phase !== 'landing')) return;
    const plan = planShrine(fac.scrapSpots, run.seed);
    if (plan && !ctx.roulette?.claims?.(plan, run.seed)) createShrineAt(plan);   // roulette.js takes ~half of the spawns from quota 1 on
  }
  function createShrineAt(plan) {
    const model = createShrine();
    model.group.position.set(plan.x, plan.y, plan.z);
    model.group.rotation.y = plan.yaw || 0;
    game.scene.add(model.group);
    const col = game.physics.addStaticBox(plan.x, plan.y + 0.55, plan.z, SHRINE_SIZE.w / 2, 0.55, SHRINE_SIZE.d / 2, plan.yaw || 0, G.STATIC, { kind: 'static' });
    const light = game.lights?.add?.({ pos: new THREE.Vector3(plan.x, plan.y + 1.8, plan.z), color: 0xff4fd0, intensity: 1.3, distance: 10, group: 'fx' });
    D.shrine = { ...plan, model, col, light, rolls: 0, busy: false, pos: new THREE.Vector3(plan.x, plan.y, plan.z) };
    return D.shrine;
  }
  function disposeShrine() {
    const s = D.shrine;
    if (!s) return;
    try { game.physics?.removeCollider(s.col); } catch { /* ignore */ }
    if (s.light) try { game.lights?.remove(s.light); } catch { /* ignore */ }
    s.model.dispose();
    D.shrine = null; D.anim = null;
    closePanel();
  }

  // ---------------------------------------------------------------- panel
  function closePanel() {
    const ui = game.ui;
    if (D.panel && ui?.panelOpen === D.panel) ui.closePanel();
    D.panel = null;
  }
  function openPanel() {
    const s = D.shrine, ui = game.ui, p = game.player;
    if (!s || !ui?.openPanel || typeof document === 'undefined' || p.dead) return;
    if (ui.panelOpen && ui.panelOpen !== D.panel) return;
    ensureCss();
    const left = SHRINE_NUM.maxRolls - s.rolls;
    const el = document.createElement('div');
    el.className = 'anp';
    const cost = creditCost(q(), s.rolls);
    const held = p.heldItem?.();
    const heldOk = !!held && isSellable(held.def) && held.value > 0 && !held.soulbound && held.type !== 'body';
    const offers = [
      { k: 'cr', title: 'CREDITS', line: `▮${cost}`, sub: `${t('bonus')} +0`, dis: (game.run?.credits || 0) < cost ? t('Not enough credits') : '' },
      { k: 'sc', title: 'SCRAP', line: heldOk ? `${t(held.def.name)} (▮${held.value})` : t('Nothing in hand'), sub: heldOk ? `${t('bonus')} +${scrapBonus(held.value)}` : '', dis: heldOk ? '' : t('Nothing in hand') },
      { k: 'hp', title: 'BLOOD', line: `-${SHRINE_NUM.hpCost} HP`, sub: `${t('bonus')} +${SHRINE_NUM.bonusHp}`, dis: p.hp <= SHRINE_NUM.hpMin ? t('Too weak') : '' },
      { k: 'st', title: 'STATIC ', line: `+${SHRINE_NUM.staticCost} STATIC`, sub: `${t('bonus')} +${SHRINE_NUM.bonusStatic}`, dis: (ctx.static?.exposure || 0) > SHRINE_NUM.staticMax ? t('Too corrupted') : '' },
    ];
    el.innerHTML = `<h2>${t('LOOT BOX SHRINE')}</h2><div class="sub">${t('The Algorithm accepts payment in many forms.')} · ${left} ${t('rolls left')}</div>
      <div class="odds"><span style="--c:${BAND_COLOR.curse}">${t('1 curse + Deepfake')}</span><span style="--c:${BAND_COLOR.debuff}">${t('2-7 debuff')}</span><span style="--c:${BAND_COLOR.buff}">${t('8-14 buff')}</span><span style="--c:${BAND_COLOR.big}">${t('15-19 jackpot')}</span><span style="--c:${BAND_COLOR.mythic}">${t('20 mythic drop')}</span></div>
      <div class="offers"></div><div class="foot"><span>d20 + ${t('bonus')} · ${t('natural')} 1 / 20</span><button class="x">${t('Close')}</button></div>`;
    const box = el.querySelector('.offers');
    for (const o of offers) {
      const b = document.createElement('button');
      b.className = 'off' + (o.dis ? ' dis' : '');
      b.innerHTML = `<b>${t(o.title)}</b><i>${o.line}</i><em>${o.dis || o.sub}</em>`;
      b.onclick = () => { closePanel(); ctx.netReq('gamble', { off: o.k, item: o.k === 'sc' ? held?.id : undefined }); };
      box.appendChild(b);
    }
    el.querySelector('.x').onclick = () => closePanel();
    D.panel = el;
    ui.openPanel(el);
    ctx.snd(['ui_notify'], 0.5);
  }

  // ---------------------------------------------------------------- roll animation (all peers)
  function startRoll(d) {
    const s = D.shrine;
    if (!s) return;
    s.rolls = d.rolls ?? s.rolls + 1;
    s.busy = true;
    const cam = game.camera.position;
    s.model.group.updateMatrixWorld(true);
    const local = s.model.group.worldToLocal(cam.clone()).sub(s.model.hover).normalize();
    const qFinal = s.model.d20.faceQuat(d.res, local, (Math.random() - 0.5) * 0.6);
    D.anim = { t: 0, res: d.res, nat: d.nat, bonus: d.bonus || 0, by: d.by, off: d.off, qFinal, qSpin: s.model.d20.mesh.quaternion.clone(), ticks: [0.5, 1.0, 1.5, 2.0, 2.4, 2.8, 3.1, 3.35, 3.55], done: false };
    s.model.state.rolling = true;
    ctx.snd(['slot_spin'], 0.7, s.pos);
    if (d.by === game.selfId) {   // the roller pays (HP / STATIC are personal; credits + scrap were taken by the host)
      if (d.off === 'hp') game.damageLocal?.(SHRINE_NUM.hpCost, 'shrine', null);
      if (d.off === 'st') ctx.static.addExposure(SHRINE_NUM.staticCost, 'shrine');
    }
  }
  const tmpAxis = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
  function animate(dt) {
    const s = D.shrine, a = D.anim;
    if (!s) return;
    s.model.update(dt, game.time);
    if (!a) return;
    a.t += dt;
    const d20 = s.model.d20, T = SHRINE_NUM.animSec;
    const rise = smooth(a.t / 0.6) * (1 - smooth((a.t - 3.2) / 0.7));
    d20.root.position.set(s.model.hover.x, s.model.hover.y + 0.28 * rise + Math.abs(Math.sin(a.t * 9)) * 0.06 * (1 - smooth(a.t / 3)), s.model.hover.z);
    const speed = 16 * (1 - smooth((a.t - 0.3) / 2.6)) + 1.2;
    tmpAxis.set(Math.sin(a.t * 3.1), Math.cos(a.t * 2.3), Math.sin(a.t * 1.7 + 1)).normalize();
    a.qSpin.premultiply(tmpQ.setFromAxisAngle(tmpAxis, speed * dt));
    const w = smooth((a.t - 2.1) / 1.5);
    d20.mesh.quaternion.copy(a.qSpin).slerp(a.qFinal, w);
    d20.halo.material.opacity = 0.2 + 0.25 * smooth(a.t / 2) + 0.2 * Math.sin(a.t * 20);
    while (a.ticks.length && a.t >= a.ticks[0]) { a.ticks.shift(); ctx.snd(['slot_stop', 'safe_click'], 0.5, s.pos, 0.8 + (a.t / T) * 0.6); if (a.t > 2.6) ctx.snd(['heartbeat'], 0.4); }
    if (!a.done && a.t >= T) { a.done = true; reveal(a); }
    if (a.t >= T + 1.2) { s.model.state.rolling = false; D.anim = null; s.busy = false; }
  }
  function reveal(a) {
    const band = bandOf(a.res);
    game.engine?.flash?.(parseInt(BAND_COLOR[band].slice(1), 16), band === 'curse' || band === 'mythic' ? 0.55 : 0.3);
    ctx.snd(band === 'mythic' ? ['slot_jackpot', 'ui_quota_met'] : band === 'big' ? ['slot_win', 'ui_levelup'] : band === 'buff' ? ['ui_confirm', 'slot_win'] : band === 'curse' ? ['death_sting', 'jester_scream'] : ['slot_lose', 'ui_error'], 0.8, D.shrine?.pos);
    if (band === 'curse' || band === 'mythic') game.engine?.shake?.(0.4);
    game.particles?.burst?.(D.shrine.model.dieWorld(new THREE.Vector3()), { count: band === 'mythic' ? 60 : 24, color: [BAND_COLOR[band], 0xffffff], speed: 4, up: 2, life: 1.1, size: 0.07, gravity: 2, drag: 1.5, additive: true });
    showBanner(a, band);
  }
  function showBanner(a, band) {
    if (typeof document === 'undefined') return;
    ensureCss();
    const el = document.createElement('div');
    el.className = 'an-roll';
    el.style.setProperty('--c', BAND_COLOR[band]);
    const by = a.by === game.selfId ? '' : `${game.playerName?.(a.by) || ''}: `;
    el.innerHTML = `<div class="n">${a.res}</div><div class="b">${t(BAND_NAME[band])}</div><div class="m">${by}${a.bonus ? `d20 ${a.nat} +${a.bonus}` : `d20 ${a.nat}`} · ${t(QUIPS[band])}</div>`;
    (document.getElementById('ui') || document.body).appendChild(el);
    setTimeout(() => el.classList.add('out'), 3200);
    setTimeout(() => el.remove(), 3900);
    ctx.say(QUIPS[band]);
  }

  // ---------------------------------------------------------------- host: shrine gamble
  const isAt = (from) => { const ap = game.aiPlayerById?.(from); return !!ap && !ap.dead && D.shrine && ap.pos.distanceTo(D.shrine.pos) < SHRINE_NUM.reach; };
  function hostGamble(d, from) {
    const s = D.shrine;
    const err = (msg) => ctx.hostTo(from, { k: 'err', msg });
    if (!s) return err('The shrine is spent.');
    if (s.busy || D.anim) return err('The shrine is busy.');
    if (s.rolls >= SHRINE_NUM.maxRolls) return err('The shrine is spent.');
    if (!isAt(from)) return;
    const off = ['cr', 'sc', 'hp', 'st'].includes(d.off) ? d.off : 'cr';
    let bonus = 0, cost = 0;
    if (off === 'cr') {
      cost = creditCost(q(), s.rolls);
      if ((game.run.credits || 0) < cost) return err('Not enough credits');
      game.run.credits -= cost; game.broadcastRun?.(['credits']);
    } else if (off === 'sc') {
      const it = game.items.get(d.item);
      if (!it || it.holder !== from || it.soulbound || !isSellable(it.def) || !(it.value > 0)) return err('Nothing in hand');
      bonus = scrapBonus(it.value);
      game.net.broadcast('it', { e: 'rm', id: it.id });
    } else if (off === 'hp') bonus = SHRINE_NUM.bonusHp;
    else bonus = SHRINE_NUM.bonusStatic;
    const nat = D.forceNat ?? (1 + Math.floor(Math.random() * 20));
    const res = finalRoll(nat, bonus);
    const out = rollOutcome(res, Math.random, q());
    s.busy = true; s.rolls++;
    D.lastOutcome = { ...out, nat, bonus, by: from, off };
    ctx.hostFx({ k: 'roll', by: from, off, nat, bonus, res, rolls: s.rolls, cost });
    game.balance?.noise?.(s.pos, 1.5);
    game.later(() => { s.busy = false; try { hostApply(out, from, s.pos); } catch (e) { console.warn('[anomaly] outcome', e); } }, Math.round(SHRINE_NUM.animSec * 1000) + 100);
  }
  function hostApply(o, by, pos) {
    const at = new THREE.Vector3(pos.x, pos.y + 1.4, pos.z);
    if (o.spawn && ITEMS[o.spawn.type]) game.items.hostSpawn(o.spawn.type, at.clone().add(new THREE.Vector3(0.6, 0, 0.6)), { tier: o.spawn.tier, linvel: [1.2, 3.2, 1.2] });
    if (o.credits) { game.run.credits += o.credits; game.broadcastRun?.(['credits']); }
    if (o.mimic) {
      try { game.creatures.hostSpawn('mimic', new THREE.Vector3(pos.x + 2, pos.y, pos.z + 1), { ...(game.mimicDisguise?.() || {}), level: game.rollLevel?.() || 1, zone: 'in' }); } catch (e) { console.warn('[anomaly] mimic', e); }
    }
    ctx.hostFx({ k: 'grant', by, all: o.all, muts: o.muts, pus: o.pus, heal: o.heal, clean: o.clean, addStatic: o.addStatic, credits: o.credits, band: o.band, res: o.res });
  }
  function onGrant(d) {
    if (!(d.all || d.by === game.selfId)) return;
    for (const [id, dur] of d.muts || []) ctx.grantBuff(id, dur);
    for (const [id, dur] of d.pus || []) ctx.grantBuff(id, dur);
    const p = game.player;
    if (d.heal && !p.dead) { p.hp = Math.min(game.stats.maxHp, p.hp + d.heal); game.net?.send?.('pst', { hp: Math.round(p.hp) }); ctx.snd(['heal'], 0.6); }
    if (d.clean) ctx.static.addExposure(-d.clean);
    if (d.addStatic) ctx.static.addExposure(d.addStatic);
    if (d.credits && d.by === game.selfId) ctx.toast(`+▮${d.credits}`, 'good');
  }

  // ---------------------------------------------------------------- Cursed Die (host reads the resting face)
  function hostDieTick(dt) {
    if (game.run?.phase !== 'moon') { if (D.die.size) D.die.clear(); return; }
    for (const it of game.items.all()) {
      if (it.type !== 'cursed_die') continue;
      let st = D.die.get(it.id);
      if (!st) D.die.set(it.id, st = { moved: false, rest: 0, next: 0, uses: 0 });
      if (it.state !== 'world' || !it.body) { st.moved = false; st.rest = 0; continue; }
      const v = it.body.linvel(), w = it.body.angvel();
      const sp = Math.hypot(v.x, v.y, v.z), an = Math.hypot(w.x, w.y, w.z);
      if (sp > 0.8 || an > 3) { st.moved = true; st.rest = 0; }
      else if (st.moved && sp < 0.06 && an < 0.35) {
        st.rest += dt;
        if (st.rest > DIE_NUM.restSec) { st.moved = false; st.rest = 0; resolveDie(it, st); }
      }
    }
  }
  function resolveDie(it, st) {
    if (insideShip(it.obj.position) || game.time < st.next) return;
    const f = dieFaceUp(it.obj.quaternion);
    if (f.up < 0.85) { try { it.body.applyImpulse({ x: 0.015, y: 0.03, z: 0.01 }, true); } catch { /* ignore */ } st.moved = true; return; }
    st.next = game.time + DIE_NUM.cooldown;
    st.uses++;
    const face = D.forceFace || f.v;
    dieEffect(face, it.obj.position.clone(), it.lastHolder || game.selfId);
    if (st.uses >= DIE_NUM.uses) {
      game.later(() => { game.net.broadcast('it', { e: 'rm', id: it.id }); ctx.hostFx({ k: 'ash', p: it.obj.position.toArray() }); D.die.delete(it.id); }, 1600);
    }
  }
  /** host: run the effect of a face at pos (public for tests) */
  function dieEffect(face, pos, by) {
    const e = DIE_EFFECTS[face];
    if (!e) return;
    const at = new THREE.Vector3(pos.x, pos.y + 0.3, pos.z);
    if (e.id === 'blackout') { if (game.run.powerOn) { game.hostSetPower?.(false); game.later(() => { if (game.run?.phase === 'moon' && !game.run.powerOn) game.hostSetPower?.(true); }, 25000); } }
    else if (e.id === 'swarm') { const n = 3 + Math.floor(Math.random() * 3); for (let i = 0; i < n; i++) try { game.creatures.hostSpawn('scuttler', at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.6, 0, (Math.random() - 0.5) * 1.6)), { level: 1, zone: game.world?.facility && pos.y < -100 ? 'in' : 'out' }); } catch { /* ignore */ } }
    else if (e.id === 'loot') { for (let i = 0; i < 3; i++) { const a = Math.random() * 6.28; game.hostSpawnRandomScrap?.(at.clone().add(new THREE.Vector3(Math.cos(a) * 0.4, 0.8 + i * 0.2, Math.sin(a) * 0.4))); } }
    game.balance?.noise?.(at, 1.2);
    D.lastDie = { face, at: at.clone(), by };
    ctx.hostFx({ k: 'die', face, p: [at.x, at.y, at.z], by });
  }
  function onDie(d) {
    const e = DIE_EFFECTS[d.face];
    if (!e) return;
    const at = new THREE.Vector3().fromArray(d.p);
    const p = game.player;
    game.particles?.burst?.(at, { count: 30, color: [e.good ? 0x7dff7d : 0xff4fd0, 0xffffff], speed: 3, up: 2, life: 0.9, size: 0.07, gravity: 1, drag: 1.5, additive: true });
    ctx.snd(e.good ? ['slot_win', 'ui_confirm'] : ['slot_lose', 'death_sting'], 0.7, at);
    ctx.toast(`${t('Cursed Die')}: ${d.face} - ${t(e.name)}. ${t(e.desc)}`, e.good ? 'good' : 'bad');
    if (p.dead || p.pos.distanceTo(at) > DIE_NUM.area) return;
    if (e.id === 'heal') { p.hp = Math.min(game.stats.maxHp, p.hp + 40); game.net?.send?.('pst', { hp: Math.round(p.hp) }); ctx.static.addExposure(-25); ctx.snd(['heal'], 0.6); }
    else if (e.id === 'speed') ctx.grantBuff('m_legs', 45);
    else if (e.id === 'burst') { ctx.static.addExposure(30); ctx.grantBuff('b_jitter', 30); }
  }

  // ---------------------------------------------------------------- messages
  function onFx(d) {
    if (d.k === 'roll') startRoll(d);
    else if (d.k === 'grant') onGrant(d);
    else if (d.k === 'die') onDie(d);
    else if (d.k === 'err') { if (d.to === undefined || d.to === game.selfId) ctx.toast(t(d.msg || ''), 'bad'); }
    else if (d.k === 'ash') { game.particles?.burst?.(new THREE.Vector3().fromArray(d.p), { count: 20, color: [0x444444, 0x222222], speed: 1.2, up: 1.5, life: 1.2, size: 0.06, gravity: 0.5, drag: 2 }); ctx.toast(t('The die crumbles to ash.'), 'info'); }
    else if (d.k === 'sync' && d.sh && D.shrine) D.shrine.rolls = d.sh.rolls | 0;
  }

  offs.push(ctx.mods.on('interactables', (out, g) => {
    if (g !== game || !D.shrine) return;
    const p = game.player;
    if (!p || p.dead || p.inShip) return;
    const s = D.shrine;
    const left = SHRINE_NUM.maxRolls - s.rolls;
    out.push({ pos: new THREE.Vector3(s.x, s.y + 1.0, s.z), r: 1.1, reach: 3.4, label: t('Loot Box Shrine [E]'), sub: left > 0 ? `${left} ${t('rolls left')}` : t('The shrine is spent.'), action: () => { if (left > 0 && !s.busy) openPanel(); else ctx.snd(['ui_error'], 0.4); } });
  }));
  offs.push(ctx.mods.on('useItem', (it, hk, g) => {
    if (g !== game || !it || hk.handled || it.type !== 'cursed_die') return;
    hk.handled = true;
    game.sfx?.('item_throw', 0.5);
    game.dropItem?.(it, true);
    ctx.toast(t('Roll the die. What is the worst that could happen?'), 'info');
  }));
  offs.push(ctx.mods.on('playerJoin', (id, info, g) => { if (g === game && game.isHost && D.shrine) game.net.sendTo(id, 'anfx', { k: 'sync', sh: { rolls: D.shrine.rolls } }); }));

  function update(dt) {
    if (game.world?.facility !== D.fac || (game.world?.facility && D.builtFor !== game.run?.seed)) { buildShrine(); D.builtFor = game.run?.seed; }
    const ph = game.run?.phase;
    if (D.shrine && ph !== 'moon' && ph !== 'landing') disposeShrine();
    animate(dt);
    if (game.isHost) { D.dieT += dt; if (D.dieT >= 0.1) { hostDieTick(D.dieT); D.dieT = 0; } }
  }

  return {
    update, onFx, hostGamble, dieEffect, openPanel, closePanel,
    get shrine() { return D.shrine; }, get lastOutcome() { return D.lastOutcome; }, get lastDie() { return D.lastDie; },
    /** tests / debug: put a shrine at a spot regardless of the seeded plan */
    spawnShrine(p, yaw = 0) { disposeShrine(); D.builtFor = game.run?.seed; D.fac = game.world?.facility || null; return createShrineAt({ x: p.x, y: p.y, z: p.z, yaw }); },
    /** tests / debug: force the next natural d20 (host) or the die face (host) */
    forceNat(n) { D.forceNat = n == null ? null : n; },
    forceFace(f) { D.forceFace = f || null; },
    dispose() {
      for (const o of offs) { try { o?.(); } catch { /* ignore */ } }
      disposeShrine();
    },
  };
}
void GOOD_MUT; void BAD_MUT; void MUTATIONS;
