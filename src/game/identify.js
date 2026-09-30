// ENTITY IDENTIFICATION (wave 2, module gameplay2 / docs/wave2/gameplay2.md).
// "Look at a creature and say: that's an anomaly, that's a creeper."  Creatures are UNKNOWN until identified:
//   - scan (RMB) and the aim read-out show "??? UNKNOWN ENTITY" (hazards and crew-lookalike mimics keep their old labels,
//     the turret code / the mimic disguise must not be spoiled);
//   - aim at a creature and keep the scanner on it (RMB held, or within 2.6 s of a scan) for ~1.5 s -> identified;
//   - a photo from the Instant Camera (horde) identifies everything in frame at once (mimics included: the picture shows the truth);
//   - "ENTITY IDENTIFIED" card: real name, CLASS, threat stars, ONE weakness hint; first time per profile = small XP;
//   - saved per profile (profile.bestiary[type].id), shared with the crew for the session (host relays 'g2' {k:'ident'}).
// This file is data + pure helpers (node-testable: tools/harness/gameplay2.test.mjs) + installIdentify(game, ctx).
import * as THREE from 'three';
import { CREATURES } from './creatures.js';
import { G } from '../physics/physics.js';
import { addTranslations, t, getLang } from '../core/i18n.js';

export const CLASSES = {
  Predator: { color: '#ff5a4a', tr: 'Avcı' },
  Scavenger: { color: '#d9b34a', tr: 'Leşçi' },
  Mimic: { color: '#b58cff', tr: 'Taklitçi' },
  Territorial: { color: '#ff9a3d', tr: 'Bölgeci' },
  Parasite: { color: '#7dff9a', tr: 'Parazit' },
  Stalker: { color: '#a9b4ff', tr: 'Takipçi' },
  Janitor: { color: '#6fe0d0', tr: 'Hademe' },
  Collector: { color: '#ffd23f', tr: 'Koleksiyoncu' },
  Anomaly: { color: '#ff4fd8', tr: 'Anomali' },
  Swarm: { color: '#a5e04a', tr: 'Sürü' },
  Explosive: { color: '#ff7a1a', tr: 'Patlayıcı' },
};
export const CLASS_IDS = Object.keys(CLASSES);

/** id -> [class, threat stars 1..5, ONE weakness hint]. Every creature registered by the game or by a module has a row. */
export const IDENT = {
  scuttler: ['Swarm', 1, 'Fragile: one or two hits. Blinking ones pop: back off when they beep.'],
  yoinker: ['Territorial', 2, 'Harmless until you touch its hoard. Leave its nest alone.'],
  crawler: ['Predator', 4, 'Fast in straight lines, terrible at corners. Sidestep it at the last second.'],
  lurker: ['Stalker', 5, 'Look at it and it backs off. Do not stare for too long.'],
  mannequin: ['Stalker', 4, 'Only moves unseen. Keep eyes on it and back away, or stun it.'],
  sludge: ['Anomaly', 3, 'Cannot be killed, but it is slow. Simply outwalk it.'],
  jester: ['Anomaly', 5, 'Cannot be killed. When the jingle starts, leave the building.'],
  spider: ['Territorial', 3, 'Its webs give it away. Tear them and fight it in the open.'],
  leech: ['Parasite', 2, 'Drops on heads from the ceiling. A friend can hit it off you.'],
  screamer: ['Predator', 3, 'Nearly invisible in the dark: sweep with your flashlight.'],
  mimic: ['Mimic', 3, 'If a crewmate does not answer you, be suspicious. A photo shows the truth.'],
  hound: ['Predator', 4, 'Blind, hunts by sound. Crouch and stay quiet.'],
  giant: ['Predator', 5, 'It hunts by sight: break the line of sight.'],
  sandkefal: ['Predator', 5, 'Feels footsteps in the sand. When the ground rumbles, move.'],
  turret: ['Anomaly', 3, 'Disable it with the code from its terminal.'],
  mine: ['Explosive', 4, 'The click is the warning. Do not step off the path.'],
  mimicdoor: ['Mimic', 4, 'Real exits do not breathe. Hit it, do not open it.'],
  web: ['Territorial', 1, 'Hit it to tear it. It alerts its owner.'],
  moderator: ['Predator', 4, 'Freeze while its eye glows green. It reloads after two shots.'],
  support: ['Stalker', 3, 'Only helps customers who are alone. Stay in a group.'],
  ticketswarm: ['Swarm', 2, 'Burns out after half a minute. Run, or swat them.'],
  editor: ['Anomaly', 4, 'Frozen between drum beats. Count the rhythm and keep your distance.'],
  tamagotchi: ['Territorial', 3, 'Crouch next to it to rock it. Neglect it and it grows up fast.'],
  stalker: ['Stalker', 5, 'Only you can see it. Break line of sight or leave the building.'],
  clickbait: ['Predator', 3, 'Ambushes stragglers. Hit it hard to make it let go; travel in pairs.'],
  replyguy: ['Swarm', 2, 'Cowards alone. Stand your ground and swing.'],
  zombot: ['Swarm', 1, 'Slow and weak. Smash them; a closed door holds them for a moment.'],
  hs_enforcer: ['Predator', 3, 'Sidestep the straight-line lunge after its wind-up.'],
  hs_gunner: ['Predator', 3, 'A laser shows a second before each shot. Break line of sight; it reloads after six.'],
  hs_leader: ['Predator', 4, 'Take the leader down first: the squad panics.'],
  doppel: ['Mimic', 5, 'It cannot fool a camera. Photograph it.'],
  collector: ['Collector', 2, 'Skittish. Hit it and it drops everything; raid its nest.'],
  janitor: ['Janitor', 1, 'Harmless unless hit. It closes doors and bins your tools.'],
  hoardnest: ['Collector', 1, 'Its owner never strays far. Loot it while the Collector is away.'],
  janitorbin: ['Janitor', 1, 'Your dropped tools end up here. Take them back.'],
  foreman: ['Territorial', 5, 'When his arms go up, get out of the way. Fight him in the open.'],
  legacybot: ['Territorial', 5, 'The rockets land where you were standing: keep moving. Stay out from under it.'],
  skeleton: ['Predator', 2, 'They rattle before they run. Fight in a doorway.'],
  robot: ['Anomaly', 3, 'Weak to music, strangely. Tanky: do not trade blows.'],
  spambomb: ['Explosive', 3, 'Kill it before it swells, or blind it with your flashlight. Get 5 m away from the hiss.'],
};

addTranslations({
  'ENTITY IDENTIFIED': 'VARLIK TANIMLANDI', '??? UNKNOWN ENTITY': '??? BİLİNMEYEN VARLIK', 'WEAKNESS': 'ZAYIF NOKTA', 'THREAT': 'TEHLİKE',
  'ANALYSING': 'ANALİZ EDİLİYOR', 'Hold scan (RMB) on it to identify': 'Tanımlamak için üstüne tarayıcıyı (SAĞ TIK) tut', 'identified by': 'tanımlayan:',
  'AIM + HOLD SCAN TO IDENTIFY': 'NİŞAN AL + TANIMLAMAK İÇİN TARA',
  'Fragile: one or two hits. Blinking ones pop: back off when they beep.': 'Kırılgan: bir iki vuruş. Yanıp sönenler patlar: bip sesinde uzaklaş.',
  'Harmless until you touch its hoard. Leave its nest alone.': 'Yığınına dokunmadıkça zararsız. Yuvasını rahat bırak.',
  'Fast in straight lines, terrible at corners. Sidestep it at the last second.': 'Düz çizgide hızlı, köşelerde beceriksiz. Son anda yana kaç.',
  'Look at it and it backs off. Do not stare for too long.': 'Bakarsan geri çekilir. Çok uzun bakma.',
  'Only moves unseen. Keep eyes on it and back away, or stun it.': 'Yalnızca görülmezken hareket eder. Gözünü ayırma, geri çekil ya da sersemlet.',
  'Cannot be killed, but it is slow. Simply outwalk it.': 'Öldürülemez ama yavaş. Yürüyerek kaç.',
  'Cannot be killed. When the jingle starts, leave the building.': 'Öldürülemez. Melodi başlayınca binadan çık.',
  'Its webs give it away. Tear them and fight it in the open.': 'Ağları onu ele verir. Ağları yırt, açık alanda dövüş.',
  'Drops on heads from the ceiling. A friend can hit it off you.': 'Tavandan kafaya düşer. Bir arkadaş vurup indirebilir.',
  'Nearly invisible in the dark: sweep with your flashlight.': 'Karanlıkta neredeyse görünmez: el fenerinle tara.',
  'If a crewmate does not answer you, be suspicious. A photo shows the truth.': 'Ekip arkadaşın cevap vermiyorsa şüphelen. Fotoğraf gerçeği gösterir.',
  'Blind, hunts by sound. Crouch and stay quiet.': 'Kör, sesle avlanır. Çömel ve sessiz kal.',
  'It hunts by sight: break the line of sight.': 'Görüşle avlanır: görüş hattını kes.',
  'Feels footsteps in the sand. When the ground rumbles, move.': 'Kumdaki ayak seslerini hisseder. Zemin titreyince hareket et.',
  'Disable it with the code from its terminal.': 'Terminalindeki kodla devre dışı bırak.',
  'The click is the warning. Do not step off the path.': 'Tık sesi uyarıdır. Yoldan çıkma.',
  'Real exits do not breathe. Hit it, do not open it.': 'Gerçek çıkışlar nefes almaz. Açma, vur.',
  'Hit it to tear it. It alerts its owner.': 'Vurup yırt. Sahibini uyarır.',
  'Freeze while its eye glows green. It reloads after two shots.': 'Gözü yeşil yanarken donup kal. İki atıştan sonra doldurur.',
  'Only helps customers who are alone. Stay in a group.': 'Sadece yalnız müşterilere yardım eder. Grupla kal.',
  'Burns out after half a minute. Run, or swat them.': 'Yarım dakikada söner. Kaç ya da savur.',
  'Frozen between drum beats. Count the rhythm and keep your distance.': 'Davul vuruşları arasında donar. Ritmi say, mesafeni koru.',
  'Crouch next to it to rock it. Neglect it and it grows up fast.': 'Yanında çömelip salla. İlgisiz bırakırsan hızla büyür.',
  'Only you can see it. Break line of sight or leave the building.': 'Onu sadece sen görürsün. Görüş hattını kes ya da binadan çık.',
  'Ambushes stragglers. Hit it hard to make it let go; travel in pairs.': 'Geride kalanlara pusu kurar. Sert vur, bıraksın; ikili gez.',
  'Cowards alone. Stand your ground and swing.': 'Yalnızken korkak. Yerinde dur ve salla.',
  'Slow and weak. Smash them; a closed door holds them for a moment.': 'Yavaş ve zayıf. Ez; kapalı kapı onları bir an tutar.',
  'Sidestep the straight-line lunge after its wind-up.': 'Hazırlıktan sonraki düz atılıştan yana kaç.',
  'A laser shows a second before each shot. Break line of sight; it reloads after six.': 'Her atıştan bir saniye önce lazer görünür. Görüşü kes; altı atışta doldurur.',
  'Take the leader down first: the squad panics.': 'Önce lideri indir: tim dağılır.',
  'It cannot fool a camera. Photograph it.': 'Kamerayı kandıramaz. Fotoğrafını çek.',
  'Skittish. Hit it and it drops everything; raid its nest.': 'Ürkek. Vurursan hepsini düşürür; yuvasını bas.',
  'Harmless unless hit. It closes doors and bins your tools.': 'Vurulmadıkça zararsız. Kapıları kapatır, aletlerini kutular.',
  'Its owner never strays far. Loot it while the Collector is away.': 'Sahibi uzağa gitmez. Koleksiyoncu yokken yağmala.',
  'Your dropped tools end up here. Take them back.': 'Düşürdüğün aletler burada biter. Geri al.',
  'When his arms go up, get out of the way. Fight him in the open.': 'Kolları kalkınca yoldan çekil. Açık alanda dövüş.',
  'The rockets land where you were standing: keep moving. Stay out from under it.': 'Roketler durduğun yere düşer: hareket et. Altına girme.',
  'They rattle before they run. Fight in a doorway.': 'Koşmadan önce takırdarlar. Kapı aralığında dövüş.',
  'Weak to music, strangely. Tanky: do not trade blows.': 'Garip biçimde müziğe zayıf. Sağlam: yumruk yarıştırma.',
  'Kill it before it swells, or blind it with your flashlight. Get 5 m away from the hiss.': 'Şişmeden öldür ya da el fenerinle şaşırt. Tıslamadan 5 m uzaklaş.',
  'Unknown. Watch its attack wind-up, dodge, then strike.': 'Bilinmiyor. Saldırı hazırlığını izle, kaç, sonra vur.',
  'Cannot be killed: avoid it or slip past.': 'Öldürülemez: kaçın ya da sıyrıl.',
  'Stay clear; do not touch it.': 'Uzak dur; dokunma.',
});
for (const [id, c] of Object.entries(CLASSES)) addTranslations({ [id]: c.tr, [id.toUpperCase()]: c.tr.toUpperCase() });

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** { cls, stars, weak, listed } for any creature id: the table row, or a sensible fallback from the def's flags. */
export function identOf(id, def = CREATURES[id]) {
  const row = IDENT[id];
  if (row) return { cls: row[0], stars: row[1], weak: row[2], listed: true };
  if (!def) return { cls: 'Anomaly', stars: 3, weak: 'Unknown. Watch its attack wind-up, dodge, then strike.', listed: false };
  const unk = def.hp == null;
  const cls = def.boss ? 'Territorial' : def.hazard || unk ? 'Anomaly' : (def.pack || (def.power ?? 1) < 0.7) ? 'Swarm' : 'Predator';
  const stars = def.boss ? 5 : clamp(Math.round(0.6 + (def.power ?? 1) * 0.9 + (def.dmg >= 90 ? 1 : 0)), 1, 5);
  const weak = unk ? 'Cannot be killed: avoid it or slip past.' : def.hazard ? 'Stay clear; do not touch it.' : 'Unknown. Watch its attack wind-up, dodge, then strike.';
  return { cls, stars, weak, listed: false };
}
export const classColor = (cls) => CLASSES[cls]?.color || '#ffffff';
export const starsText = (n) => '★'.repeat(clamp(n | 0, 0, 5)) + '☆'.repeat(5 - clamp(n | 0, 0, 5));
/** Seconds of steady aiming needed; identifySpeed is the rpg bonus (0.4 = +40%). */
export const identifyDuration = (speedBonus = 0) => 1.5 / Math.max(0.25, 1 + (Number(speedBonus) || 0));
/** progress step: fills while aiming with the scanner active, drains twice as fast otherwise. Returns the new value 0..1. */
export function stepProgress(p, dt, aiming, dur) {
  return clamp(aiming ? p + dt / dur : p - dt * 2 / dur, 0, 1);
}
/** XP for the first identification of a type (per profile). */
export const identifyXp = (stars) => 15 + 10 * clamp(stars | 0, 1, 5);
/** creatures the scan label / aim read-out must NOT relabel (hazards keep their codes; mimics keep their disguise). */
export function gated(view) {
  return !!view && !view.def?.hazard && !view.def?.noScan && view.type !== 'mimic' && view.hType !== 'doppel' && view.type !== 'doppel';
}

const STYLE_ID = 'g2-ident-style';
const CSS = `
.g2-aim{position:fixed;left:50%;top:58%;transform:translateX(-50%);z-index:7;pointer-events:none;text-align:center;font-family:VT323,monospace;color:#ffd9b8;text-shadow:0 0 6px #000,0 0 12px #000;display:none;min-width:240px}
.g2-aim .n{font-size:22px;letter-spacing:2px}.g2-aim .s{font-size:17px;opacity:.85}
.g2-aim .bar{height:6px;margin:4px auto 0;width:200px;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.25)}
.g2-aim .bar i{display:block;height:100%;width:0;background:#7dffb0;box-shadow:0 0 8px #7dffb0}
.g2-card{position:fixed;left:50%;top:14%;transform:translateX(-50%) scale(.92);opacity:0;z-index:40;pointer-events:none;width:min(420px,92vw);padding:12px 18px 12px;
 background:linear-gradient(180deg,rgba(16,8,4,.94),rgba(6,3,2,.94));border:2px solid var(--gc,#ff5a4a);box-shadow:0 0 26px color-mix(in srgb,var(--gc,#ff5a4a) 55%,transparent),inset 0 0 40px rgba(255,90,40,.07);
 font-family:VT323,monospace;color:#ffe6cc;text-align:center;transition:opacity .28s,transform .28s}
.g2-card.on{opacity:1;transform:translateX(-50%) scale(1)}
.g2-card .h{font-size:17px;letter-spacing:4px;color:var(--gc,#ff5a4a);opacity:.9}
.g2-card .nm{font-size:38px;line-height:1;margin:4px 0 2px;text-shadow:0 0 12px var(--gc,#ff5a4a);letter-spacing:2px}
.g2-card .cl{display:inline-block;font-size:21px;padding:0 12px;background:var(--gc,#ff5a4a);color:#160804;letter-spacing:3px}
.g2-card .st{font-size:24px;letter-spacing:4px;color:#ffd23f;margin-top:4px}
.g2-card .wk{font-size:20px;margin-top:6px;line-height:1.05;color:#dff7e4}.g2-card .wk b{color:#8dff8d;font-weight:normal}
.g2-card .xp{font-size:18px;margin-top:4px;color:#ffd23f}.g2-card .by{font-size:16px;opacity:.7}
`;

export function installIdentify(game, ctx = {}) {
  const st = {
    prog: 0, aimId: null, aimType: null, scanUntil: -1, lastNextScan: game.nextScan || 0, aimT: 0, cardT: 0, cardEl: null, aimEl: null,
    photoRef: game.horde?.camera?.lastInFrame || null, pending: new Set(), disposed: false, labelHits: 0,
  };
  const offs = [];
  const p = game.profile;
  const bestiary = () => (p.bestiary || (p.bestiary = {}));
  const known = (type) => !!bestiary()[type]?.id;
  const info = (type) => {
    const def = CREATURES[type], id = identOf(type, def);
    return { type, name: def?.name || type, cls: id.cls, clsColor: classColor(id.cls), stars: id.stars, weak: id.weak };
  };
  const speedBonus = () => { try { return Number(game.rpg?.bonus?.('identifySpeed')) || 0; } catch { return 0; } };

  // ---------------------------------------------------------------- dom
  function ensureDom() {
    if (typeof document === 'undefined') return;
    if (!document.getElementById(STYLE_ID)) { const s = document.createElement('style'); s.id = STYLE_ID; s.textContent = CSS; document.head.appendChild(s); }
    const root = document.getElementById('ui') || document.body;
    if (!st.aimEl) {
      st.aimEl = document.createElement('div'); st.aimEl.className = 'g2-aim'; st.aimEl.style.pointerEvents = 'none';
      st.aimEl.innerHTML = '<div class="n"></div><div class="s"></div><div class="bar"><i></i></div>';
      root.appendChild(st.aimEl);
    }
    if (!st.cardEl) { st.cardEl = document.createElement('div'); st.cardEl.className = 'g2-card'; st.cardEl.style.pointerEvents = 'none'; root.appendChild(st.cardEl); }
  }
  function showCard(type, by, xp) {
    ensureDom();
    if (!st.cardEl) return;
    const i = info(type);
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    st.cardEl.style.setProperty('--gc', i.clsColor);
    st.cardEl.innerHTML = `<div class="h">${esc(t('ENTITY IDENTIFIED'))}</div><div class="nm">${esc(t(i.name).toLocaleUpperCase(getLang()))}</div>`
      + `<div class="cl">${esc(t(i.cls).toLocaleUpperCase(getLang()))}</div><div class="st" title="${esc(t('THREAT'))}">${starsText(i.stars)}</div>`
      + `<div class="wk"><b>${esc(t('WEAKNESS'))}:</b> ${esc(t(i.weak))}</div>`
      + (xp ? `<div class="xp">+${xp} XP</div>` : '') + (by ? `<div class="by">${esc(t('identified by'))} ${esc(by)}</div>` : '');
    st.cardEl.classList.add('on');
    st.cardT = 6.5;
  }

  // ---------------------------------------------------------------- marking (every peer: host broadcast 'g2' {k:'ident'})
  function mark(type, by, quiet) {
    if (!CREATURES[type] && !IDENT[type]) return false;
    const first = !known(type);
    const b = bestiary();
    if (!b[type]) b[type] = { seen: true, kills: 0, at: Date.now() };
    b[type].seen = true;
    b[type].id = Date.now();
    const mine = by === game.selfId;
    let xp = 0;
    if (first && mine) { xp = identifyXp(identOf(type).stars); try { game.progress.addXp(xp, 'Entity identified'); } catch { /* optional */ } }
    if (first) try { game.progress.save(); } catch { /* ignore */ }
    st.pending.delete(type);
    if (!quiet && (first || mine)) {
      showCard(type, mine ? null : game.playerName(by), xp);
      try { game.audio?.ui?.('ui_quota_met', 0.5); } catch { /* ignore */ }
      game.mods?.emit('tfg:identified', type, by, game);
    }
    return first;
  }
  /** ask the host to identify a creature (aim scan / photo). Returns false when the request was not sent. */
  function request(view, via = 'scan') {
    if (!view || known(view.type) || st.pending.has(view.type)) return false;
    st.pending.add(view.type);
    setTimeout(() => st.pending.delete(view.type), 3000);
    game.net?.request('g2', { op: 'ident', ty: view.type, cid: view.id, via });
    return true;
  }
  /** host request handler (called by gameplay2 for op 'ident'). */
  function hostIdent(d, from) {
    const ty = String(d.ty || '');
    const c = game.creatures?.host?.get(String(d.cid));
    const pl = game.aiPlayerById?.(from);
    if (!c || c.dead || c.type !== ty || !pl || pl.pos.distanceTo(c.pos) > (d.via === 'photo' ? 46 : 36)) return;
    game.net.broadcast('g2', { k: 'ident', ty, by: from });
  }
  function onMsg(d) {
    if (d.k === 'ident') mark(d.ty, d.by, false);
    else if (d.k === 'known' && Array.isArray(d.list)) for (const ty of d.list.slice(0, 200)) mark(String(ty), null, true);
  }
  /** host: tell a joiner what the crew already knows */
  function sendKnown(to) {
    const list = Object.keys(bestiary()).filter((k) => bestiary()[k]?.id);
    if (list.length) game.net.sendTo(to, 'g2', { k: 'known', list });
  }

  // ---------------------------------------------------------------- scan hook: relabel + remember when a scan happened
  function relabel(labels) {
    if (!Array.isArray(labels)) return;
    for (const v of game.creatures.views.values()) {
      if (v.state === 'dead' || !gated(v) || v.hidden) continue;
      const ex = _v.set(v.pos.x, v.pos.y + v.height + 0.3, v.pos.z);
      const lb = labels.find((l) => !l._g2 && !l.type && l.pos && l.pos.distanceToSquared(ex) < 1e-4);
      if (!lb) continue;
      lb._g2 = 1; st.labelHits++;
      if (known(v.type)) {
        const i = info(v.type);
        lb.name = `${t(v.def.name)} Lv.${v.level}${v.elite ? ' ★ELITE' : ''}`;
        lb.sub = `${t(i.cls).toLocaleUpperCase(getLang())}  ${starsText(i.stars)}`;
        lb.color = i.clsColor;
      } else {
        lb.name = t('??? UNKNOWN ENTITY');
        lb.sub = t('AIM + HOLD SCAN TO IDENTIFY');
        lb.color = '#ff5a5a';
      }
    }
  }
  const _v = new THREE.Vector3(), _e = new THREE.Vector3(), _f = new THREE.Vector3(), _d = new THREE.Vector3();
  const origScan = game.scan;
  game.scan = function (...a) {
    const fx = this.scanFx, hud = this.ui?.hud;
    const oReveal = fx?.reveal, oShow = hud?.showScan;
    if (fx && oReveal) fx.reveal = function (labels, ...r) { try { relabel(labels); } catch (e) { console.warn('[g2] relabel', e); } return oReveal.call(this, labels, ...r); };
    if (hud && oShow) hud.showScan = function (labels, ...r) { try { relabel(labels); } catch { /* ignore */ } return oShow.call(this, labels, ...r); };
    const before = this.nextScan || 0;
    try { return origScan.apply(this, a); }
    finally {
      if (fx && oReveal) fx.reveal = oReveal;
      if (hud && oShow) hud.showScan = oShow;
      if ((this.nextScan || 0) !== before) st.scanUntil = this.time + 2.6;   // a scan went off: keep analysing what you aim at
    }
  };

  // ---------------------------------------------------------------- aim + progress (per frame)
  function aimedView() {
    const cam = game.camera;
    if (!cam || game.player?.dead) return null;
    cam.getWorldPosition(_e);
    _f.set(0, 0, -1).applyQuaternion(cam.getWorldQuaternion(_q));
    let best = null, bs = 0;
    for (const v of game.creatures.views.values()) {
      if (v.state === 'dead' || v.hidden || !v.root?.visible) continue;
      _d.set(v.pos.x, v.pos.y + v.height * 0.55, v.pos.z).sub(_e);
      const dist = _d.length();
      if (dist > 32 || dist < 0.4) continue;
      _d.multiplyScalar(1 / dist);
      const dot = _d.dot(_f);
      const need = Math.cos(Math.min(0.5, Math.atan2(v.radius + 0.35, dist) + 0.04));   // generous: radius + 2 degrees
      if (dot < need) continue;
      const score = dot - dist * 0.001;
      if (best && score < bs) continue;
      if (dist > 3 && !game.physics.lineOfSight(_e, _v.set(v.pos.x, v.pos.y + v.height * 0.55, v.pos.z), G.STATIC | G.DOOR)) continue;
      best = v; bs = score;
    }
    return best;
  }
  const _q = new THREE.Quaternion();

  function update(dt) {
    if (st.disposed || !game.creatures?.views) return;
    st.aimT -= dt;
    if (st.cardT > 0) { st.cardT -= dt; if (st.cardT <= 0) st.cardEl?.classList.remove('on'); }
    // photo: a new Instant Camera picture identifies everything that was in frame
    const cam = game.horde?.camera;
    if (cam && cam.lastInFrame !== st.photoRef) {
      st.photoRef = cam.lastInFrame;
      for (const f of cam.lastInFrame || []) {
        const v = game.creatures.views.get(f.id);
        if (v && f.dist <= 34) request({ id: f.id, type: f.type || v.type }, 'photo');
      }
    }
    if (st.aimT <= 0) {
      st.aimT = 0.1;
      const v = game.minigame || game.ui?.panelOpen ? null : aimedView();
      st.aimId = v?.id || null; st.aimView = v || null;
    }
    const v = st.aimView && st.aimView.state !== 'dead' ? st.aimView : null;
    const gate = v && gated(v);
    const unk = gate && !known(v.type);
    const scanning = game.time < st.scanUntil || !!game.input?.mouseDown?.(2);
    if (unk && v.id !== st.progId) { st.prog = 0; st.progId = v.id; }
    st.prog = stepProgress(st.prog, dt, !!unk && scanning, identifyDuration(speedBonus()));
    if (unk && st.prog >= 1) { request(v, 'scan'); st.prog = 0; }
    // read-out
    ensureDom();
    const el = st.aimEl;
    if (!el) return;
    const hud = game.ui?.hud?.el?.classList?.contains('hidden');
    if (!v || !gate || hud || game.player?.dead || (unk && game.firstSight?.labelHold?.(v.id))) {   // wave 9: the staged first sighting keeps its label back for 2 s
      if (el.style.display !== 'none') el.style.display = 'none'; return; }
    el.style.display = 'block';
    const n = el.children[0], s = el.children[1], bar = el.children[2];
    if (unk) {
      n.textContent = t('??? UNKNOWN ENTITY'); n.style.color = '#ff5a5a';
      s.textContent = st.prog > 0.02 ? `${t('ANALYSING')} ${Math.round(st.prog * 100)}%` : t('Hold scan (RMB) on it to identify');
      bar.style.display = st.prog > 0.02 ? 'block' : 'none'; bar.firstChild.style.width = Math.round(st.prog * 100) + '%';
    } else {
      const i = info(v.type);
      n.textContent = `${t(v.def.name).toLocaleUpperCase(getLang())}`; n.style.color = i.clsColor;
      s.textContent = `${t(i.cls).toLocaleUpperCase(getLang())}  ${starsText(i.stars)}`;
      bar.style.display = 'none';
    }
  }
  offs.push(game.mods.on('update', (dt, g) => { if (g === game) { try { update(Math.min(dt, 0.1)); } catch (e) { if (!st.warned) { st.warned = 1; console.warn('[g2] identify', e); } } } }));

  return {
    hostIdent, onMsg, sendKnown, mark, request, info, isKnown: known, table: IDENT, classes: CLASSES,
    get progress() { return st.prog; }, get aiming() { return st.aimView?.type || null; },
    /** debug / tests: identify by creature id as if the scanner had finished */
    identify(cid) { const v = game.creatures.views.get(cid); return v ? request(v, 'scan') : false; },
    state: st,
    dispose() {
      st.disposed = true;
      for (const o of offs) { try { o?.(); } catch { /* ignore */ } }
      if (Object.prototype.hasOwnProperty.call(game, 'scan') && game.scan !== origScan) delete game.scan;
      st.aimEl?.remove(); st.cardEl?.remove();
    },
  };
}
