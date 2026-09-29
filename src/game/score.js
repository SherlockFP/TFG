// SCORE (wave 7): game side of the adaptive music. Installed with this.useModule('score', installScore) -> game.score. Docs: docs/wave7/score.md.
// Every 0.25 s it reduces the game to a tiny snapshot (phase, biome, indoor, chaser closeness from the director's heartbeat level, aimtell locks, boss,
// extraction, Algorithm speech, dance music) and hands it to audio.score (src/audio/score.js), which owns the stems. It also plays the Algorithm's
// stream jingle / the Company muzak motif on the game's events. Nothing here touches the network or the world: every peer scores its own game.
import { MOONS } from './moons.js';
import { parseAim } from './aimtell_core.js';
import { addTranslations } from '../core/i18n.js';

addTranslations({
  'Dynamic music': 'Dinamik müzik', 'Music intensity': 'Müzik yoğunluğu', 'Layers react to chases, bosses and extraction.': 'Katmanlar kovalamaca, boss ve tahliyeye tepki verir.',
}, 'tr');
addTranslations({
  'Dynamic music': 'Динамическая музыка', 'Music intensity': 'Интенсивность музыки', 'Layers react to chases, bosses and extraction.': 'Слои реагируют на погоню, боссов и эвакуацию.',
}, 'ru');

const POLL = 0.25;
const AIM_STATES = new Set(['aim', 'alert']);
const INTERCOM_GAP = 30;    // s between two intercom jingles (the Algorithm talks every ~11 s, the jingle must stay special)

export function installScore(game) {
  const offs = [];
  let disposed = false, acc = 0, wasSpeaking = false, lastIntercom = -99, paT = 60 + Math.random() * 40, lastPhase = null, hqT = -1;
  const audio = () => game.audio;
  const eng = () => game.audio?.score || null;
  const sting = (id, vol) => { try { return !!eng()?.sting(id, vol); } catch { return false; } };

  function snapshot(dt) {
    const run = game.run || {}, p = game.player;
    const moon = MOONS[run.moon] || null;
    const phase = run.phase || 'orbit';
    const views = game.creatures?.views;
    let boss = false, locked = 0, near = 0;
    if (p && views && phase === 'moon') {
      for (const v of views.values()) {
        if (!v?.pos || v.state === 'dead') continue;
        const dx = v.pos.x - p.pos.x, dy = v.pos.y - p.pos.y, dz = v.pos.z - p.pos.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (v.def?.boss && typeof v.extra === 'number' && (v.extra & 1) && d < 70) boss = true;
        if (AIM_STATES.has(v.state) && d < 60) { const a = parseAim(v.extra); if (a && (a.pid === game.selfId || a.pid === game.profile?.id)) locked = Math.max(locked, a.lock ? 1 : 0.15); }
        if (d < 18 && !v.def?.hazard) near = Math.max(near, 1 - d / 18);
      }
    }
    const chase = game.director?.chaseLevel?.() || 0;
    const hp = p ? (p.hp ?? 100) / Math.max(1, game.stats?.maxHp || p.maxHp || 100) : 1;
    const indoor = !!p?.indoor, night = (run.time || 0) > 20 * 60;
    const powerOff = indoor && game.lights?.globalDim === 0;
    const tension = Math.max(chase * 0.9, near * 0.55, hp < 0.4 ? 0.45 : 0, indoor ? 0.3 : 0, !indoor && night ? 0.3 : 0, powerOff ? 0.55 : 0);
    const fac = game.facilitysys?.state || null;
    const ext = !!(fac?.extraction && fac.ext);
    return {
      phase, biome: moon?.biome || 'hills', indoor, inShip: !!p?.inShip, home: !!moon?.home, dead: !!p?.dead,
      chase, tension, locked, boss, extract: ext, extractFrac: ext ? Math.max(0, Math.min(1, (fac.ext.left || 0) / Math.max(1, fac.ext.total || 1))) : 1,
    };
  }

  function poll(dt) {
    const sc = eng();
    if (!sc) return;
    const snap = snapshot(dt);
    sc.setContext(snap);
    const speaking = !!game.lore?.algo?.speaking;
    sc.setFlags({ speech: speaking, dance: !!game.dance?.musicActive?.() });
    const now = game.time || 0;
    if (speaking && !wasSpeaking && now - lastIntercom >= INTERCOM_GAP && snap.phase !== 'company') { lastIntercom = now; sting('intercom', 0.9); }
    wasSpeaking = speaking;
    if (snap.phase !== lastPhase) { lastPhase = snap.phase; if (snap.phase === 'company') hqT = 2.5; paT = 60 + Math.random() * 40; }
    if (hqT >= 0) { hqT -= dt; if (hqT < 0) { hqT = -1; sting('co_hq', 0.8); } }
    if (snap.phase === 'company') { paT -= dt; if (paT <= 0) { paT = 70 + Math.random() * 50; sting('co_pa', 0.7); } }
  }

  offs.push(game.mods.on('update', (dt, g) => {
    if (disposed || g !== game) return;
    acc += dt;
    if (acc < POLL) return;
    const d = acc; acc = 0;
    try { poll(d); } catch (e) { console.warn('score poll', e); }
  }));
  // the Algorithm's audio identity: the same 5-note jingle everywhere, clean when it is being friendly, glitched when it is not
  offs.push(game.mods.on('tfg:score', (d, g) => {
    if (disposed || !d) return;
    if (d.k === 'vote') sting('vote', 0.9);
    else if (d.k === 'hype') { const t = Math.max(1, Math.min(3, d.tier | 0)); sting('hype' + t, 0.9); }
    else if (d.k === 'glitch') sting('glitch', 0.9);
    else if (d.k === 'punish') sting('punish', 1);
    else if (d.k === 'shop') sting('co_shop', 0.8);
  }));
  offs.push(game.mods.on('tfg:viewers', (d) => { if (!disposed && d?.reason && d.delta > 0) sting('live', 0.85); }));   // a LIVE event pulled viewers in
  offs.push(game.mods.on('tfg:extraction', (d) => { if (!disposed && d?.phase === 'end') sting(d.success ? 'hype2' : 'punish', 0.9); }));

  return {
    sting,
    snapshot: () => snapshot(0),
    debug: () => eng()?.snapshot?.() || null,
    dispose() { disposed = true; for (const f of offs) { try { f(); } catch { /* ignore */ } } try { eng()?.setContext(null); eng()?.setFlags({ speech: false, dance: false }); } catch { /* audio gone */ } },
  };
}
