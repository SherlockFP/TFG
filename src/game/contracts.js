// Contracts: three seeded offers from different factions every day (terminal CONTRACTS / ACCEPT <n>, or the contract
// board in the ship). Host-authoritative, one active contract for the whole crew, stored in run.contract (synced +
// saved). Types: salvage, retrieval, sabotage, investigation (scan / logs), cleanup, extraction. Faction chain steps
// (5 per faction, loredata.CHAINS) appear as special offers. Progress shows in the objectives tracker and the HUD
// dock; payout (credits + rep + XP) at the end of the day, failure costs rep. Plus one hidden SECRET OBJECTIVE a day,
// revealed only when completed. Emits 'tfg:contract' { id, state }.
import { FACTIONS, FACTION_IDS, CONTRACT_TYPES, RETRIEVAL, CHAINS, CHAIN_REQ, SECRETS, HOSTILE_AT, chapterOf, pickLang } from './loredata.js';
import { MOONS } from './moons.js';
import { tierOfItem, tierIndex } from './tiers.js';
import { RNG, hashString } from '../core/rng.js';
import { clamp, escapeHtml } from '../core/util.js';
import { getLang, t, sysMsg } from '../core/i18n.js';
import { hudDock } from '../ui/dock.js';

const tr = () => { try { return getLang() === 'tr'; } catch { return false; } };
const DOCK_CSS = `.lore-dock{min-width:210px;max-width:290px;padding:6px 10px 7px;background:linear-gradient(90deg,rgba(10,4,8,.82),rgba(10,4,8,.6));border:1px solid color-mix(in srgb,var(--fc) 60%,transparent);
 border-right:4px solid var(--fc);font-family:var(--font,monospace);color:#ffe9f2;text-align:right;box-shadow:0 0 14px color-mix(in srgb,var(--fc) 25%,transparent)}
.lore-dock .ld-k{font-family:var(--font2,monospace);font-size:9px;letter-spacing:2px;color:var(--fc)}
.lore-dock .ld-t{font-size:21px;line-height:1.05;margin-top:2px}
.lore-dock .ld-b{height:6px;margin-top:4px;background:rgba(255,255,255,.1);position:relative}
.lore-dock .ld-b span{position:absolute;right:0;top:0;bottom:0;background:var(--fc);box-shadow:0 0 6px var(--fc)}
.lore-dock .ld-p{font-size:16px;opacity:.85}
.lore-dock.war{padding:4px 10px;animation:ldWar 1.2s steps(2) infinite}
@keyframes ldWar{50%{background:rgba(120,0,0,.55)}}`;
function ensureDockStyle() {
  if (typeof document === 'undefined' || document.getElementById('tfg-lore-dock-style')) return;
  const s = document.createElement('style'); s.id = 'tfg-lore-dock-style'; s.textContent = DOCK_CSS; document.head.appendChild(s);
}
const fill = (s, v = {}) => String(s).replace(/\{(\w+)\}/g, (m, k) => (v[k] !== undefined && v[k] !== null ? String(v[k]) : m));

const TITLES = {
  salvage: [['Content Harvest', 'İçerik Hasadı'], ['Bulk Upload', 'Toplu Yükleme'], ['Fence Run', 'Çalıntı Mal Turu']],
  retrieval: [['Lost & Found', 'Kayıp Eşya'], ['Special Delivery', 'Özel Teslimat'], ["Collector's Request", 'Koleksiyoncu Siparişi']],
  sabotage: [['Lights Out', 'Işıkları Söndür'], ['Kill Switch', 'Kapatma Anahtarı'], ['Hard Reset', 'Sert Sıfırlama']],
  scan: [['Field Survey', 'Saha Taraması'], ['Specimen Census', 'Numune Sayımı']],
  logs: [['Dead Letters', 'Ölü Mektuplar'], ['Oral History', 'Sözlü Tarih']],
  cleanup: [['Report Queue', 'Şikâyet Kuyruğu'], ['Pest Control', 'Haşere Kontrolü'], ['Spam Filter', 'Spam Filtresi']],
  extraction: [['Core Dump', 'Çekirdek Dökümü'], ['Hot Extract', 'Sıcak Tahliye']],
};
const BRIEF = {
  salvage: ['Secure ▮{n} of scrap in the ship today.', 'Bugün gemiye ▮{n} değerinde hurda getir.'],
  retrieval: ['Bring back {n}× {cls} to the ship.', 'Gemiye {n}× {cls} getir.'],
  sabotage: ['Cut the facility power, overload the generator or trigger a lockdown.', 'Tesisin elektriğini kes, jeneratörü aşırı yükle ya da karantina başlat.'],
  scan: ['Scan {n} different entity types (right click).', '{n} farklı varlık türünü tara (sağ tık).'],
  logs: ['Find and read {n} lore log(s) in the facility.', 'Tesiste {n} kayıt bul ve oku.'],
  cleanup: ['Delete {n} entities.', '{n} varlık sil.'],
  extraction: ['Complete a facility extraction (or secure the Reactor Core).', 'Bir tesis tahliyesini tamamla (ya da Reaktör Çekirdeğini güvenceye al).'],
};
export const FAIL_REP = -6, ABANDON_REP = -5, RIVAL_REP = -3;

/** Does a secured item count for a retrieval class? */
export function retrievalMatch(cls, it, v) {
  const d = it?.def || {};
  if (!it || it.type === 'body') return false;
  switch (cls) {
    case 'fragile': return !!d.fragile && (it.value || 0) > 0;
    case 'big': return d.kind === 'big';
    case 'noisy': return d.use === 'noise';
    case 'valuable': return (it.value || 0) >= (v || 100);
    case 'artifact': return tierIndex(tierOfItem(it, d)) >= tierIndex('epic') || d.kind === 'artifact' || !!d.strange;
    default: return false;
  }
}

export function contractText(c, T = tr()) {
  if (!c) return { title: '', brief: '' };
  const clsLbl = c.cls ? fill(pickLang(RETRIEVAL[c.cls]?.label, T), { v: c.v }) : '';
  const brief = fill(pickLang(c.brief, T), { n: c.n, cls: clsLbl, v: c.v });
  const goal = c.goal ? fill(pickLang(c.goal, T), { n: c.n, cls: clsLbl, v: c.v }) : brief;
  return { title: pickLang(c.title, T), brief, goal, type: pickLang(CONTRACT_TYPES[c.type]?.name, T), icon: CONTRACT_TYPES[c.type]?.icon || '◆' };
}

export function installContracts(core) {
  const { game } = core;
  const st = { secret: null, dock: null, dockHtml: '', dockT: 0 };

  function ensure(run) {
    if (!run) return;
    if (!run.contracts || typeof run.contracts !== 'object' || !Array.isArray(run.contracts.offers)) run.contracts = { key: '', offers: [] };
    if (run.contract && typeof run.contract !== 'object') run.contract = null;
    if (!Array.isArray(run.contractLog)) run.contractLog = [];
  }

  // ---------------------------------------------------------------- offers (host, seeded)
  function makeContract(rng, fid, run, chainStep = null) {
    const q = run.quotaIndex | 0;
    const f = FACTIONS[fid];
    const step = chainStep !== null ? CHAINS[fid].steps[chainStep] : null;
    const type = step?.type || rng.pick(f.types);
    const c = { id: '', faction: fid, type, n: 1, chain: chainStep, rival: f.rival };
    let tkey = type;
    if (type === 'salvage') {
      const perDay = Math.max(120, (run.quota || 130) / 3);
      c.n = Math.max(60, Math.round((perDay * rng.float(0.45, 0.7) * (step?.mul || 1)) / 10) * 10);
    } else if (type === 'retrieval') {
      c.cls = step?.cls || rng.pick(Object.keys(RETRIEVAL));
      const r = RETRIEVAL[c.cls];
      c.n = step?.n || rng.int(r.n[0], r.n[1]);
      if (c.cls === 'valuable') c.v = 80 + 20 * q;
    } else if (type === 'investigation') {
      c.mode = step?.mode || (rng.chance(0.5) ? 'scan' : 'logs');
      c.n = step?.n || (c.mode === 'scan' ? clamp(2 + Math.floor(q / 2), 2, 5) : (rng.chance(0.3) ? 2 : 1));
      tkey = c.mode;
    } else if (type === 'cleanup') {
      c.n = step?.n || clamp(2 + q, 2, 8);
    }
    c.title = step ? step.title : rng.pick(TITLES[tkey]);
    c.brief = step ? step.brief : BRIEF[tkey];
    if (step) c.goal = BRIEF[tkey];   // measurable goal line under the story brief
    const base = 60 + 25 * q;
    const mul = CONTRACT_TYPES[type].mul * (step ? 1.5 : 1);
    c.reward = { credits: Math.round((base * mul * rng.float(0.9, 1.2)) / 5) * 5, rep: step ? 12 : 8, xp: Math.round((80 + 30 * q) * (step ? 1.5 : 1)) };
    c.id = `${fid}:${type}:${run.day}:${Math.floor(rng.next() * 1e6).toString(36)}`;
    return c;
  }
  function genOffers(force) {
    const run = game.run;
    if (!game.isHost || !run) return;
    ensure(run);
    core.factions.ensure(run);
    const key = `${run.runId}:${run.day}:${run.quotaIndex | 0}`;
    if (!force && run.contracts.key === key && run.contracts.offers.length) return;
    const rng = new RNG(hashString('contracts:' + key));
    const rep = core.factions.rep;
    let pool = FACTION_IDS.filter((id) => rep(id) > HOSTILE_AT);
    if (!pool.length) pool = ['algorithm'];
    const chosen = [];
    if (run.signed?.f && pool.includes(run.signed.f)) chosen.push(run.signed.f);
    while (chosen.length < 3) {
      const left = pool.filter((id) => !chosen.includes(id));
      const from = left.length ? left : pool;
      const w = from.map((id) => ({ id, w: Math.max(5, rep(id) + 60) }));
      chosen.push(rng.weighted(w).id);
    }
    // one chain step per day: the best-standing faction on the board whose next step is unlocked
    const ch = chapterOf(run.quotaIndex).n;
    const chainF = [...new Set(chosen)].sort((a, b) => (run.signed?.f === b) - (run.signed?.f === a) || rep(b) - rep(a))
      .find((id) => { const s = run.chains?.[id] | 0; return s < 5 && rep(id) >= CHAIN_REQ[s].rep && ch >= CHAIN_REQ[s].ch; });
    let chainUsed = false;
    const offers = chosen.map((fid) => {
      const useChain = !chainUsed && fid === chainF;
      if (useChain) chainUsed = true;
      return makeContract(rng, fid, run, useChain ? (run.chains[fid] | 0) : null);
    });
    run.contracts = { key, offers };
  }

  // ---------------------------------------------------------------- host ops
  function hostAccept(idx, from) {
    const run = game.run;
    ensure(run);
    genOffers();
    if (run.phase !== 'orbit') return { err: true, text: 'Contracts can only be accepted in orbit.' };
    if (run.contract && ['active', 'running'].includes(run.contract.state)) return { err: true, text: 'You already have an active contract. ABANDON it first (costs reputation).' };
    const c = run.contracts.offers[idx];
    if (!c) return { err: true, text: 'No such offer. Type CONTRACTS.' };
    if (core.factions.war(c.faction)) return { err: true, text: `${FACTIONS[c.faction].name} is at war with you.` };
    run.contract = { ...c, state: 'active', progress: 0, by: game.playerName(from) };
    run.contracts.offers = run.contracts.offers.map((o, i) => (i === idx ? { ...o, taken: true } : o));
    const tx = contractText(c, false);
    game.net.broadcast('sys', { text: `${game.playerName(from)} accepted a ${FACTIONS[c.faction].name} contract: ${tx.title}`, kind: 'info' });
    core.algo?.hostSay('contract_accept', { faction: c.faction }, { gap: 2 });
    core.emit('tfg:contract', { id: c.id, state: 'accepted', faction: c.faction, type: c.type });
    return { text: `CONTRACT ACCEPTED: ${tx.title} (${FACTIONS[c.faction].name})\n  ${tx.brief}\n  Reward: ▮${c.reward.credits} · +${c.reward.rep} rep · ${c.reward.xp} XP. Land on a moon to start.` };
  }
  function hostAbandon(from) {
    const run = game.run;
    const c = run?.contract;
    if (!c || !['active', 'running', 'complete'].includes(c.state)) return { err: true, text: 'No active contract.' };
    if (c.state === 'running' || c.state === 'complete') return { err: true, text: 'Too late: the contract is running. Finish the day.' };
    run.contract = null;
    core.factions.hostAdd(c.faction, ABANDON_REP, 'abandon');
    logResult(c, 'abandoned');
    game.net.broadcast('sys', sysMsg('{name} abandoned the {@name2} contract ({ABANDON_REP} rep).', { name: game.playerName(from), name2: FACTIONS[c.faction].$name ?? FACTIONS[c.faction].name, ABANDON_REP }, 'warn'));
    core.emit('tfg:contract', { id: c.id, state: 'abandoned', faction: c.faction });
    return { text: `Contract abandoned. ${FACTIONS[c.faction].name} ${ABANDON_REP} rep.` };
  }
  function logResult(c, result) {
    const run = game.run;
    ensure(run);
    run.contractLog = [...run.contractLog, { day: run.day, f: c.faction, title: c.title, result, chain: c.chain }].slice(-20);
  }

  // ---------------------------------------------------------------- day lifecycle (host)
  function onPhase(ph) {
    const run = game.run;
    if (!game.isHost || !run) return;
    ensure(run);
    const moonDay = !MOONS[run.moon]?.company;
    if (ph === 'landing' && moonDay) {
      if (run.contract?.state === 'active') { run.contract.state = 'running'; run.contract.progress = 0; run.contract.day = run.day; core.emit('tfg:contract', { id: run.contract.id, state: 'running', faction: run.contract.faction }); }
      pickSecret();
    }
    if (ph === 'orbit' || ph === 'company') genOffers();
  }
  function pickSecret() {
    const run = game.run;
    const rng = new RNG(hashString('secret:' + run.runId + ':' + run.day + ':' + run.seed));
    const nP = (game.aiPlayers?.() || []).length;
    const ids = Object.keys(SECRETS).filter((id) => (id !== 'undertaker' || nP > 1) && (id !== 'bookworm' || (core.logs?.placedCount?.() || 0) >= 2));
    const id = rng.pick(ids);
    const q = run.quota || 130;
    st.secret = { id, done: false, x: Math.max(80, Math.round((q / 3) * 0.35 / 10) * 10), hoard: Math.max(300, Math.round(q * 0.4)) };
  }
  function progressOf(c, day, hd) {
    switch (c.type) {
      case 'salvage': return hd?.dayStats?.collected || 0;
      case 'retrieval': return day.collected.filter((x) => (c.cls === 'valuable' ? x.value >= (c.v || 100) : x.cls?.[c.cls])).length;
      case 'sabotage': return day.sabotage ? 1 : 0;
      case 'investigation': return c.mode === 'logs' ? day.logsRead.size : day.scanned.size;
      case 'cleanup': return day.tot.kills;
      case 'extraction': return day.extracted ? 1 : 0;
      default: return 0;
    }
  }
  function update(dt) {
    const run = game.run;
    updateDock(dt);
    if (!game.isHost || !run || run.phase !== 'moon' || !core.day) return;
    const c = run.contract, day = core.day, hd = game.hostData;
    if (c && (c.state === 'running' || c.state === 'complete')) {
      const p = Math.min(c.n, progressOf(c, day, hd));
      if (p !== c.progress && c.state === 'running') c.progress = p;
      if (c.state === 'running' && p >= c.n) completeContract(c);
    }
    checkSecret(false);
  }
  function completeContract(c) {
    c.state = 'complete';
    c.progress = c.n;
    const tx = contractText(c, false);
    game.net.broadcast('sys', sysMsg('CONTRACT COMPLETE: {title} - payout at the end of the day.', { title: tx.title }, 'good'));
    core.broadcast('contract', { state: 'complete', f: c.faction, title: c.title });
    core.algo?.hostSayFaction(c.faction, 'done');
    game.later?.(() => core.algo?.hostSay('contract_done', { faction: c.faction }, { gap: 2 }), 5000);
    core.emit('tfg:contract', { id: c.id, state: 'complete', faction: c.faction, type: c.type });
  }
  function checkSecret(dayEnd, summary) {
    const s = st.secret, day = core.day, run = game.run, hd = game.hostData;
    if (!s || s.done || !day) return false;
    const T = day.tot, collected = dayEnd ? (summary?.collected || 0) : (hd?.dayStats?.collected || 0);
    const deaths = dayEnd ? (summary?.deaths || []).length : day.deaths.length;
    let ok = false;
    switch (s.id) {
      case 'hoarder': ok = T.maxCarry >= s.hoard; break;
      case 'bookworm': ok = day.logsRead.size >= 2; break;
      case 'early_bird': ok = collected >= s.x && run.time < 13 * 60; break;
      case 'exterminator': ok = T.kills >= 4; break;
      case 'undertaker': ok = [...game.items.inShipItems()].some((it) => it.type === 'body'); break;
      default: break;
    }
    if (dayEnd && !ok && !summary?.allDead) {
      switch (s.id) {
        case 'pacifist': ok = T.kills === 0 && collected >= s.x; break;
        case 'untouchable': ok = deaths === 0 && Object.values(day.players).some((p) => p.entered); break;
        case 'lights_out': ok = T.lightT < 30 && collected >= s.x; break;
        case 'whisper': ok = T.loudT / Math.max(1, T.activeT) < 0.08 && collected >= s.x; break;
        case 'open_plan': ok = T.doors <= 3 && collected >= s.x; break;
        case 'photo_finish': ok = deaths === 0 && (day.takeoffTime || 0) >= 23 * 60; break;
        default: break;
      }
    }
    if (!ok) return false;
    s.done = true;
    const q = run.quotaIndex | 0;
    const credits = 50 + 15 * q, xp = 150 + 30 * q;
    run.credits += credits;
    game.broadcastRun?.(['credits']);
    game.net.broadcast('xp', { xp, coin: 10 + 5 * q, reason: 'Secret objective' });
    core.broadcast('secret', { id: s.id, credits, xp });
    game.net.broadcast('sys', sysMsg('SECRET OBJECTIVE COMPLETE: {n} - ▮{credits}, {xp} XP', { n: SECRETS[s.id].name[0], credits, xp }, 'good'));
    core.algo?.hostSay('secret', {}, { gap: 3 });
    day.secret = { id: s.id };
    core.emit('tfg:contract', { id: 'secret:' + s.id, state: 'secret' });
    return true;
  }
  /** host, end of a moon day: pay or fail the running contract, settle day-end secrets. Returns a result record. */
  function settleDay(summary) {
    const run = game.run;
    ensure(run);
    const out = { contract: null, secret: null };
    checkSecret(true, summary);
    if (st.secret?.done) out.secret = { id: st.secret.id, name: SECRETS[st.secret.id].name };
    st.secret = null;
    const c = run.contract;
    if (c && (c.state === 'running' || c.state === 'complete')) {
      const tx = contractText(c, false);
      if (c.state === 'complete' && !summary?.allDead) {
        const bonus = core.factions.payBonus(c.faction) + (run.signed?.f === c.faction ? 0.25 : 0);
        const credits = Math.round(c.reward.credits * (1 + bonus)) + (c.faction === 'algorithm' && core.factions.inner('algorithm') ? 25 : 0);
        const coin = c.faction === 'darkweb' && core.factions.inner('darkweb') ? Math.round(credits * 0.2) : 0;
        run.credits += credits;
        game.broadcastRun?.(['credits']);
        core.factions.hostAdd(c.faction, c.reward.rep, 'contract');
        core.factions.hostAdd(c.rival, RIVAL_REP, 'rival contract');
        game.net.broadcast('xp', { xp: c.reward.xp, coin, reason: 'Contract: ' + tx.title });
        game.net.broadcast('sys', { text: `CONTRACT PAID: ${tx.title} - ▮${credits} · ${FACTIONS[c.faction].name} +${c.reward.rep} rep`, kind: 'good' });
        let ending = null;
        if (c.chain !== null && c.chain !== undefined) {
          run.chains = { ...run.chains, [c.faction]: Math.max(run.chains?.[c.faction] | 0, c.chain + 1) };
          if (run.chains[c.faction] >= 5) {
            ending = CHAINS[c.faction].ending;
            core.broadcast('ending', { f: c.faction });
            try { game.achievements?.grant?.({ title: pickLang(CHAINS[c.faction].name, false).replace(/\b\w/g, (m) => m.toUpperCase()), coin: 500 }); } catch { /* optional */ }
          }
        }
        out.contract = { title: c.title, f: c.faction, result: 'paid', credits, chain: c.chain, ending };
        logResult(c, 'paid');
        core.emit('tfg:contract', { id: c.id, state: 'paid', faction: c.faction, credits });
      } else if (c.state === 'complete') {
        out.contract = { title: c.title, f: c.faction, result: 'void' };
        logResult(c, 'void');
        core.emit('tfg:contract', { id: c.id, state: 'void', faction: c.faction });
      } else {
        core.factions.hostAdd(c.faction, FAIL_REP, 'failed');
        game.net.broadcast('sys', { text: `CONTRACT FAILED: ${tx.title} - ${FACTIONS[c.faction].name} ${FAIL_REP} rep`, kind: 'bad' });
        core.algo?.hostSay('contract_fail', { faction: c.faction }, { gap: 2 });
        out.contract = { title: c.title, f: c.faction, result: 'failed', progress: c.progress, n: c.n };
        logResult(c, 'failed');
        core.emit('tfg:contract', { id: c.id, state: 'failed', faction: c.faction });
      }
      run.contract = null;
    }
    return out;
  }

  // ---------------------------------------------------------------- display (all peers, from synced run state)
  function listText() {
    const run = game.run || {};
    ensure(run);
    const T = tr();
    const out = [t('CONTRACT BOARD'), ''];
    const c = run.contract;
    if (c) {
      const tx = contractText(c, T);
      out.push(`${t('ACTIVE')}: [${FACTIONS[c.faction].short}]${c.patron ? (c.patron === 'company' ? ' ' + t('<COMPANY>') : ' ' + t('<ALGORITHM>')) : ''} ${tx.title} - ${stateName(c.state, T)} ${c.progress || 0}/${c.n}`, `  ${tx.brief}`, '');
    }
    const offers = run.contracts?.offers || [];
    if (!offers.length) out.push(t('No offers. New ones arrive in orbit.'));
    offers.forEach((o, i) => {
      const tx = contractText(o, T), f = FACTIONS[o.faction];
      out.push(`${o.taken ? 'x' : i + 1}. [${f.short}]${o.patron ? (o.patron === 'company' ? ' ' + t('<COMPANY>') : ' ' + t('<ALGORITHM>')) : ''} ${tx.title}${o.chain !== null && o.chain !== undefined ? `  ★ ${pickLang(CHAINS[o.faction].name, T)} ${o.chain + 1}/5` : ''}  (${tx.type})`);
      out.push(`   ${tx.brief}`);
      if (tx.goal !== tx.brief) out.push(`   > ${tx.goal}`);
      out.push(`   ▮${o.reward.credits} · +${o.reward.rep} ${f.short} / ${RIVAL_REP} ${FACTIONS[o.rival].short} · ${o.reward.xp} XP${o.taken ? (t('  [TAKEN]')) : ''}`);
    });
    out.push('', t('>ACCEPT <n>  take a contract · >ABANDON  drop it (-5 rep) · >BOARD  open the board'));
    out.push(t('??? Every day hides a SECRET OBJECTIVE. It is revealed only when completed.'));
    return out.join('\n');
  }
  function stateName(s, T) {
    return ({ active: ['ACCEPTED', 'ALINDI'], running: ['IN PROGRESS', 'SÜRÜYOR'], complete: ['COMPLETE', 'TAMAM'] }[s] || [s, s])[T ? 1 : 0];
  }
  function objectives(add, phase) {
    const run = game.run;
    const c = run?.contract;
    const T = tr();
    if (phase === 'orbit') {
      if (c) add(`${t('Contract')}: ${contractText(c, T).title} - ${t('land to start')}`, 'sub');
      else if (run?.contracts?.offers?.some((o) => !o.taken)) add(t('Contract board: terminal CONTRACTS or the board in the ship'), 'hint');
    } else if (phase === 'moon' && c) {
      const tx = contractText(c, T);
      if (c.state === 'complete') add(`${FACTIONS[c.faction].short}: ${tx.title} ✔ ${t('(paid at day end)')}`, 'sub', true);
      else add(`${FACTIONS[c.faction].short}: ${tx.goal} ${c.progress || 0}/${c.n}`, 'sub', false, c.n ? Math.min(1, (c.progress || 0) / c.n) : 0);
    }
    if (phase === 'moon') add(t('??? Secret objective'), 'hint');
  }
  function updateDock(dt) {
    st.dockT -= dt;
    if (st.dockT > 0) return;
    st.dockT = 0.5;
    const run = game.run;
    const c = run?.contract;
    const wars = FACTION_IDS.filter((id) => core.factions?.war(id));
    const ph = run?.phase;
    const show = (c || wars.length) && ['orbit', 'landing', 'moon', 'company'].includes(ph);
    if (!show) { if (st.dock) { st.dock.remove(); st.dock = null; st.dockHtml = ''; } return; }
    if (!st.dock?.isConnected) { ensureDockStyle(); st.dock = hudDock('right', 'contract', 30); st.dockHtml = ''; }
    const T = tr();
    let html = '';
    if (c) {
      const f = FACTIONS[c.faction], tx = contractText(c, T);
      const pct = c.n ? Math.round(Math.min(1, (c.progress || 0) / c.n) * 100) : 0;
      html += `<div class="lore-dock" style="--fc:${f.color}"><div class="ld-k">${f.glyph} ${escapeHtml(f.short)} · ${escapeHtml(tx.type)}${c.chain !== null && c.chain !== undefined ? ' ★' : ''}</div>`
        + `<div class="ld-t">${escapeHtml(tx.title)}</div><div class="ld-b"><span style="width:${pct}%"></span></div>`
        + `<div class="ld-p">${c.state === 'complete' ? (t('COMPLETE ✔')) : c.state === 'active' ? (t('starts on landing')) : `${c.progress || 0} / ${c.n}`}</div></div>`;
    }
    for (const id of wars) html += `<div class="lore-dock war" style="--fc:#ff2a2a"><div class="ld-k">⚔ ${t('WAR')}: ${escapeHtml(FACTIONS[id].short)}</div></div>`;
    if (html !== st.dockHtml) { st.dock.innerHTML = html; st.dockHtml = html; }
  }

  function dispose() { st.dock?.remove(); st.dock = null; }

  return {
    ensure, genOffers, hostAccept, hostAbandon, onPhase, update, settleDay, listText, objectives, dispose, contractText,
    get secret() { return st.secret ? { ...st.secret } : null; },
    active: () => game.run?.contract || null,
  };
}
