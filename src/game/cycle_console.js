// Terminal commands (CORE / CYCLE / KEYSTONE / RAID / GATE / ENDLESS / CASHOUT), the host request handler ('cyreq'), the client side of the 'cyx'
// messages (banners, keystone weekly best, endless cash-out rewards) and the objective lines of the sector cycle. Part of module 'cycle'.
import { MOONS } from './moons.js';
import { CREATURES } from './creatures.js';
import { t, tf } from '../core/i18n.js';
import * as CORE from './cycle_core.js';
import * as P from './cycle_plan.js';
import { BOSS_INFO } from './cycle_bosses.js';

const TIPS = {
  foreman: 'Slam telegraph, conveyor mess. Below half HP the furnace roars and summons bots.',
  loadbalancer: 'Sends damage to the weakest player. Destroy its server NODES: each one takes 20% of its armour away. Dodge the marked spot, share the splash.',
  middlemanager: 'Shielded by orbiting PAPER (shred it). Calls MEETINGS: stand in the marked circle or take damage. He is distracted while presenting.',
  hydra: 'Cut a head and TWO REPLIES appear; the root is almost immune while a head lives. Kill every head, then hit the exposed ROOT before they grow back.',
  surgeon: 'Drags the weakest patient onto the table. Damage him hard (10% of his HP) to free your friend.',
  host: 'Blinks behind you. Watch the purple marker and turn around.',
  excavator: 'Ground quake: the middle (next to him) is safe, the ring around it is not.',
  lobbymanager: 'Lights out! While it is dark he moves fast. Charges in straight lines.',
  legacybot: 'World boss outside the facility: rockets and stomps. Use cover.',
};
const THEME_NAME = { factory: 'Data Center', mansion: 'Haunted Homepage', mineshaft: 'Deep Web Mine', office: 'Corporate Intranet', backrooms: 'The Backrooms', serverfarm: 'Cloud Storage', sewer: 'The Comment Sewer', hospital: 'Telehealth Clinic' };
const fmtT = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;

export function createHostConsole(d) {
  const { ctx, game, enabled, host, armInstance, disarm, instRequirements, endless, handleFx, step, patchCy, banner, say, cy, qiOf, tfIn } = d;
  const cmds = [];
  const reg = (name, fn, help) => {
    try { window.KefalAPI?.registerCommand?.(name, (rest, term) => fn(rest, term), help); cmds.push(name); } catch (e) { console.warn('cycle command', name, e); }
  };
  const runKey = () => String(game.run?.runId ?? 'legacy');

  // ------------------------------------------------------------ host: requests
  function handle(req, from) {
    if (!host() || !enabled()) return;
    const reply = (text, err, vars) => game.net.sendTo(from, 'term', { to: from, text: tfIn('en', text, vars || {}), k: vars ? text : undefined, v: vars, err, cls: err ? 'err' : '' });
    const c = cy();
    switch (req.op) {
      case 'keystone': {
        if (req.cancel) { disarm(); reply('Cancelled.'); return; }
        const b = armInstance('keystone', { moon: req.moon, level: req.level | 0 }, reply);
        if (b) {
          say('CORRUPTED KEYSTONE +{l} armed on {@m}. Pull the lever to land.', { l: b.level, m: MOONS[b.base]?.$name || MOONS[b.base]?.name || b.base }, 'good');
          for (const id of P.keystoneAffixes(b.level)) say('Keystone affix: {@n} - {@d}', { n: P.KS_AFFIXES[id].name, d: P.KS_AFFIXES[id].desc }, 'warn');
          reply('Keystone armed. Pull the lever. (KEYSTONE CANCEL to disarm)');
        }
        return;
      }
      case 'raid': {
        if (req.cancel) { disarm(); reply('Cancelled.'); return; }
        const b = armInstance('raid', { diff: req.diff }, reply);
        if (b) {
          say('THE ALGORITHM\'S CORE ({@d}) armed for a crew of {n}. Pull the lever to land.', { d: P.RAID_DIFFS[b.diff].name, n: game.aiPlayers().length }, 'good');
          reply('Raid armed. Pull the lever. (RAID CANCEL to disarm)');
        }
        return;
      }
      case 'gate': {
        const b = armInstance('gate', {}, reply);
        if (b) { say('S-RANK GATE armed. Pull the lever to land.', {}, 'warn'); reply('Gate armed. Pull the lever.'); }
        return;
      }
      case 'endless': {
        if (req.accept) {
          if (game.run.phase !== 'orbit') { reply('Only possible while in orbit.', true); return; }
          if (c.mode === 'endless') { reply('Already in the Deep Feed.', true); return; }
          if (c.cores < CORE.TUNE.coresForEndless) { reply('Locked: clear {n} Sector Cores first.', true, { n: CORE.TUNE.coresForEndless }); return; }
          if (c.stage !== 'days') { reply('Finish the current sector first.', true); return; }
          if (endless.start(game.run.quota)) reply('PATCH 1.0 installed.'); else reply('Not available.', true);
        } else if (req.decline) {
          step({ t: 'endlessDecline' }); patchCy({ offer: false });
          reply('Staying in the classic loop.');
        }
        return;
      }
      case 'cashout': {
        if (c.mode !== 'endless') { reply('Not in the Deep Feed.', true); return; }
        if (game.run.phase !== 'orbit') { reply('Only possible while in orbit.', true); return; }
        if (endless.cashOut()) reply('Cashed out.'); else reply('Nothing to cash out yet.', true);
        return;
      }
      default: reply('Unknown command.', true);
    }
  }

  // ------------------------------------------------------------ text builders (client, local)
  function coreText() {
    const run = game.run, c = cy();
    if (!c) return t('No run.');
    const out = [];
    const sector = c.sector | 0;
    const theme = P.coreTheme(runKey(), sector);
    const def = MOONS[P.coreId(sector)] || P.coreMoonDef(runKey(), sector);
    const b = def.coreBoss || CORE.bossFor(theme, sector);
    const crew = Math.max(1, (game.remotes?.size || 0) + 1);
    const hp = P.bossHpFor({ hp: BOSS_INFO[b.id]?.hp || b.hp || 1000 }, { sector, crew });
    out.push(`${t('SECTOR CORE')} // ${t('SECTOR')} ${sector + 1}`);
    out.push(`${t('Status')}: ${c.mode === 'endless' ? t('Endless mode: cores appear as S-rank gates (GATE).') : c.stage === 'gate' ? t('GATE OPEN - pull the lever to land') : c.stage === 'core' ? t('IN THE CORE') : c.stage === 'grace' ? t('GRACE DAY - the gate re-opens after this day') : t('Meet the quota on the last day to open the gate')}   ${t('Attempt')} ${(c.attempts | 0)}   ${t('Losses')} ${c.fails}/${CORE.TUNE.maxFails}   ${t('Cores cleared')} ${c.cores}/${CORE.TUNE.coresForEndless}`);
    out.push(`${t('Interior')}: ${t(THEME_NAME[theme] || theme)}   ${t('Tier')} ${def.tier}`);
    out.push(`${t('BOSS')}: ${(CREATURES[b.id]?.name || b.name)} - ${t(b.title || '')} (${t('RANK')} ${b.rank})`);
    out.push(`  ${t('HP')} ~${hp} (${t('crew')} ${crew})   ${t('recommended level')} ${CORE.recommendedLevel(sector)}${CORE.secondPhase(sector) ? '   ' + t('PHASE 2') : ''}`);
    if (TIPS[b.id]) out.push('  ' + t(TIPS[b.id]));
    if (b.id === 'legacybot') out.push('  ' + t('No access cards this time: the world boss roams outside.'));
    else out.push(`${t('Structure')}: ${def.layoutOpts?.wings || 2} ${t('wings')}, ${t('a labyrinth')}, ${CORE.keysNeeded(sector)} ${t('Key Holder(s) carrying access cards')}, ${t('a locked boss arena')}.`);
    out.push(t('Win: boss chest + the next sector. Lose: a grace day, then retry. Second loss: the sector advances without a chest. There is no time pressure, but the building gets hungrier.'));
    void run;
    return out.join('\n');
  }
  function cycleText() {
    const c = cy();
    if (!c) return t('No run.');
    const stage = { days: 'DAYS (meet the quota)', gate: 'SECTOR GATE OPEN', core: 'INSIDE THE CORE', grace: 'GRACE DAY' }[c.stage] || c.stage;
    const out = [`SECTOR CYCLE // ${c.mode === 'endless' ? 'THE DEEP FEED' : t('classic')}`, `${t('Sector')} ${c.sector + 1}   ${t('Stage')}: ${t(stage)}   ${t('Cores cleared')} ${c.cores}`];
    const firsts = Object.keys(c.firstKills || {});
    if (firsts.length) out.push(`${t('First kills')}: ${firsts.map((x) => t(THEME_NAME[x] || x)).join(', ')}`);
    out.push(t('Commands: CORE (boss briefing), KEYSTONE, RAID, ENDLESS.'));
    return out.join('\n');
  }
  const ksBest = () => { const b = game.profile?.cycle2?.ksBest; return b && b.week === P.weekKey() ? b : null; };
  function keystoneText() {
    const c = cy(), level = c?.ks?.level || P.KS.minLevel;
    const bad = instRequirements();
    const out = [`${t('CORRUPTED KEYSTONE')} // ${t('timed facility clear')}`, `${t('Your key')}: +${level}   ${t('Weekly best')}: ${ksBest() ? `+${ksBest().level} (${fmtT(ksBest().left)} ${t('left')})` : '-'}`];
    const af = P.keystoneAffixes(level);
    out.push(`${t('Affixes')}: ${af.length ? af.map((id) => `${t(P.KS_AFFIXES[id].name)} (${t(P.KS_AFFIXES[id].desc)})`).join('; ') : '-'}`);
    out.push(t('Clear the enemy forces (kills fill the bar), then the Guardian awakens. Beat the timer: key level +1..+3 (more time left = more). A depleted key drops one level. The day counts as a normal day.'));
    out.push(bad ? `${t('Not available')}: ${t(bad)}` : `${t('Type')} KEYSTONE GO [${t('moon')}] ${t('to start on')} ${MOONS[game.run.moon]?.short || MOONS[game.run.moon]?.name || t('the routed moon')}. KEYSTONE CANCEL ${t('to disarm')}.`);
    return out.join('\n');
  }
  function raidText() {
    const bad = instRequirements();
    const wk = P.weekKey();
    const rk = runKey();
    const list = P.raidBosses(rk, wk);
    const out = [`${t('RAID')} // ${t("THE ALGORITHM'S CORE")}`, `${t('Bosses this week')}: ${list.map((b) => CREATURES[b.id]?.name || b.name).join(' > ')}`];
    const crew = Math.max(1, (game.remotes?.size || 0) + 1);
    out.push(`${t('Crew')} ${crew}: ${t('boss health')} x${P.raidCrewMul(crew)}. ${t('Any crew size 1-8 works: health and adds scale with the crew.')}`);
    for (const [id, D] of Object.entries(P.RAID_DIFFS)) {
      const done = game.profile?.cycle2?.raid?.wk === wk && game.profile.cycle2.raid.done?.[id];
      out.push(`  ${t(D.name).padEnd(7)} ${t('HP')} x${D.hp}  ${t('damage')} x${D.dmg}  ${t('chests')} ${D.chests}  ${done ? '[' + t('weekly chest claimed') + ']' : ''}`);
    }
    out.push(t('3 wings, 2 labyrinths, 2 mini-bosses hold the access cards for the final arena. One chest per difficulty per week.'));
    out.push(bad ? `${t('Not available')}: ${t(bad)}` : `${t('Type')} RAID GO [NORMAL|HEROIC|MYTHIC]. RAID CANCEL ${t('to disarm')}.`);
    return out.join('\n');
  }

  // ------------------------------------------------------------ terminal commands
  const req = (op, data) => game.net.request('cyreq', { op, ...data });
  reg('core', (rest, term) => term.print(coreText()), 'sector core briefing: boss, rules, structure');
  reg('cycle', (rest, term) => term.print(cycleText()), 'sector cycle status (3 days + boss, endless)');
  reg('keystone', (rest, term) => {
    const a = (rest[0] || '').toLowerCase();
    if (a === 'go' || a === 'start') {
      const lvTok = rest.slice(1).find((x) => /^l(?:vl)?\d+$/i.test(x));   // KEYSTONE GO [moon | #slot] [L5]: start a lower key than yours
      const moon = rest.slice(1).filter((x) => x !== lvTok).join(' ');
      req('keystone', { moon: moon || undefined, level: lvTok ? +lvTok.replace(/\D/g, '') : 0 });
    } else if (a === 'cancel') req('keystone', { cancel: 1 });
    else term.print(keystoneText());
  }, 'Corrupted Keystone: timed facility clear with affixes (KEYSTONE GO [moon], CANCEL)');
  reg('raid', (rest, term) => {
    const a = (rest[0] || '').toLowerCase();
    if (a === 'go' || a === 'start') req('raid', { diff: (rest[1] || 'normal').toLowerCase() });
    else if (a === 'cancel') req('raid', { cancel: 1 });
    else term.print(raidText());
  }, "Raid: 3 wings, 3 bosses, any crew size 1-8 (RAID GO [normal|heroic|mythic])");
  reg('gate', (rest, term) => {
    if (cy()?.mode !== 'endless') { term.print(t('S-rank gates appear in the Deep Feed (ENDLESS).'), 'err'); return; }
    const g = cy().endless?.gate;
    if (!g) { term.print(t('No gate is open right now.')); return; }
    req('gate', {});
  }, 'enter the S-rank glitch gate (endless mode)');
  reg('endless', (rest, term) => {
    const a = (rest[0] || '').toLowerCase();
    if (a === 'accept' || a === 'yes') req('endless', { accept: 1 });
    else if (a === 'decline' || a === 'no') req('endless', { decline: 1 });
    else {
      const lines = endless.text();
      const board = game.profile?.cycle2?.board;
      if (board?.length) { lines.push('', t('LOCAL TOP 5:')); board.slice(0, 5).forEach((e, i) => lines.push(`${i + 1}. ${e.score}  ${t('depth')} ${e.depth}  ${t('cores')} ${e.cores}${e.fired ? '  (' + t('deplatformed') + ')' : ''}`)); }
      term.print(lines.join('\n'));
    }
  }, 'THE DEEP FEED (endless mode after 3 cores): status, ENDLESS ACCEPT / DECLINE');
  reg('cashout', () => req('cashout', {}), 'leave the Deep Feed with your permanent rewards');

  // ------------------------------------------------------------ client: messages
  function onMessage(m) {
    const hud = game.ui?.hud;
    if (m.k === 'banner') {
      hud?.bigText(t(m.main), (m.sub ? t(m.sub) : '') + (m.ty && CREATURES[m.ty] ? (m.sub ? ': ' : '') + CREATURES[m.ty].name : ''));
      game.audio?.ui?.(m.kind === 'bad' ? 'ui_fired' : 'ui_quota_met', 0.6);
    } else if (m.k === 'win') {
      const name = CREATURES[m.ty]?.name || '';
      hud?.bigText(t('SECTOR CLEARED'), name ? tf('{n} defeated', { n: name }) : '');
      game.audio?.ui?.('ui_quota_met', 0.9);
      if (m.first) game.ui?.toast(t('FIRST KILL BONUS: the shards are worth a little more.'), 'good');
    } else if (m.k === 'bossdown') {
      hud?.bigText(t('BOSS DEFEATED'), CREATURES[m.ty]?.name || '');
    } else if (m.k === 'chest') {
      game.ui?.toast(t('The BOSS CHEST spills its loot!'), 'good');
    } else if (m.k === 'ksdone') {
      const p = game.profile;
      if (m.success) {
        p.cycle2 = p.cycle2 || {};
        const r = P.bestUpdate(p.cycle2.ksBest, P.weekKey(), m.level, m.left);
        p.cycle2.ksBest = r.best;
        game.progress?.save?.();
        hud?.bigText(tf('KEYSTONE +{l} COMPLETED', { l: m.level }), tf('Next key: +{n}  ({t} left)', { n: m.next, t: fmtT(m.left) }));
        if (r.improved) game.ui?.toast(t('New weekly best!'), 'good');
      } else hud?.bigText(t('KEYSTONE DEPLETED'), tf('The key drops to +{n}', { n: m.next }));
    } else if (m.k === 'raiddone') {
      game.ui?.toast(m.first ? t('Raid cleared: the weekly chest is yours.') : t('Raid cleared (weekly chest already claimed).'), 'good');
    } else if (m.k === 'cashout') {
      const p = game.profile, r = m.rew || {};
      game.progress?.addXp?.(r.xp || 0, 'Endless cash out');
      game.progress?.addCoins?.(r.clout || 0, 'Endless cash out');
      p.cycle2 = p.cycle2 || {};
      if (r.title) { p.titles = Array.isArray(p.titles) ? p.titles : []; if (!p.titles.includes(r.title)) p.titles.push(r.title); }
      if (r.stars) { p.prestige = p.prestige || {}; p.prestige.stars = (p.prestige.stars || 0) + r.stars; }
      if (r.cosmetic) { p.cycle2.endlessCosmetics = p.cycle2.endlessCosmetics || []; if (!p.cycle2.endlessCosmetics.includes(r.cosmetic)) p.cycle2.endlessCosmetics.push(r.cosmetic); }
      p.cycle2.board = CORE.insertLeaderboard(p.cycle2.board || [], m.entry || { score: 0, depth: 0 }).list;
      game.progress?.save?.();
      hud?.bigText(m.fired ? t('DEPLATFORMED FROM THE DEEP FEED') : t('CASHED OUT'), tf('{c} Followers, {x} XP{s}', { c: r.clout || 0, x: r.xp || 0, s: r.stars ? `, +${r.stars} ` + t('prestige star') : '' }));
    }
  }

  // ------------------------------------------------------------ objectives (every peer)
  function objectives(add, phase) {
    const c = cy(), run = game.run;
    if (!enabled() || !c || !run) return;
    const lv = c.live || {};
    if (phase === 'orbit') {
      if (c.mode === 'classic' && c.stage === 'gate') add(t('SECTOR GATE OPEN: pull the lever to land on the Sector Core (terminal: CORE)'), 'main');
      else if (c.mode === 'classic' && c.stage === 'grace') add(t('GRACE DAY: collect freely - no quota - the gate re-opens after this day'), 'main');
      else if (c.inst && c.inst.state === 'armed') add(c.inst.kind === 'keystone' ? tf('KEYSTONE +{l} armed: pull the lever', { l: c.inst.level }) : c.inst.kind === 'raid' ? tf('RAID armed ({d}): pull the lever', { d: t(P.RAID_DIFFS[c.inst.diff]?.name || '') }) : c.inst.spec ? tf('GLITCH GATE {r} armed: pull the lever', { r: c.inst.spec.rank }) : t('S-RANK GATE armed: pull the lever'), 'main');
      if (!instRequirements() && !(c.inst && c.inst.state === 'armed')) {
        add(tf('KEYSTONE +{l} available: terminal KEYSTONE', { l: c.ks?.level || P.KS.minLevel }), 'hint');
        add(t('RAID available (1-8 players): terminal RAID'), 'hint');
      }
      if (c.mode === 'endless' && c.endless) {
        add(tf('DEEP FEED depth {d} - engagement {m}%', { d: c.endless.depth, m: Math.round(c.endless.meter) }), c.endless.meter < 30 ? 'warn' : 'sub');
        if (c.endless.gate) add(tf('S-RANK GATE open: terminal GATE (chest x{c})', { c: c.endless.gate.chests }), 'main');
      } else if (c.offer && c.mode === 'classic') add(t('PATCH 1.0 - ENDLESS CONTENT available: terminal ENDLESS'), 'main');
    } else if (phase === 'moon') {
      const moon = MOONS[run.moon];
      if (moon?.core || moon?.gate) {
        const b = lv.boss ? CREATURES[lv.boss]?.name : moon.coreBoss?.name;
        if (lv.bossDead) add(tf('{n} is down: take the chest and pull the lever', { n: b || t('The boss') }), 'main', true);
        else if (lv.locked) add(tf('Find the Key Holders: access cards {a}/{b}', { a: lv.keys | 0, b: lv.keysNeed | 0 }), 'main', false, lv.keysNeed ? (lv.keys | 0) / lv.keysNeed : 0);
        else add(tf('Boss arena open: defeat {n}', { n: b || t('the boss') }), 'main');
        if (lv.red) add(t('RED GATE: the exit is sealed until the boss falls'), 'warn');
      } else if (moon?.raid) {
        const dead = (lv.mids || []).filter((x) => x).length, total = (lv.mids || []).length;
        if (lv.bossDead) add(t('RAID CLEARED: take the chest and leave'), 'main', true);
        else if (lv.locked) add(tf('Raid: mini-bosses {a}/{b} (access cards {c}/{d})', { a: dead, b: total, c: lv.keys | 0, d: lv.keysNeed | 0 }), 'main');
        else add(tf('Raid: defeat {n}', { n: CREATURES[lv.boss]?.name || t('the final boss') }), 'main');
      } else if (moon?.keystone) {
        const left = lv.left ?? 0;
        if (lv.bossDead) add(t('GUARDIAN DOWN: get to the ship'), 'main', true);
        else if (lv.guardian) add(tf('KEYSTONE +{l}: defeat the Guardian! {t}', { l: lv.level, t: fmtT(left) }), lv.expired ? 'warn' : 'main');
        else add(tf('KEYSTONE +{l}: enemy forces {f}% - {t}', { l: lv.level, f: lv.forces ?? 0, t: lv.expired ? t('DEPLETED') : fmtT(left) }), lv.expired || left < 60 ? 'warn' : 'main', false, (lv.forces || 0) / 100);
      }
    }
  }

  return {
    handle, onMessage, objectives, coreText,
    dispose() { for (const n of cmds) { try { window.__kefalMods?.commands?.delete?.(n); } catch { /* ignore */ } } cmds.length = 0; },
  };
}
