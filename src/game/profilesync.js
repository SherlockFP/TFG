// [profile] Crew profile sync: nickname + avatar of every peer.
// helloData()/pinfo carry name + `av` (258-char lite avatar). A snapshot avatar's PNG (<= 6 KB) and live changes
// travel in the unique 'pf' message: { n: name, a: lite wire, s?: png body }. New peers get a direct 'pf' from
// everybody (only when a snapshot exists); a rename / new avatar while connected is broadcast. Old clients ignore both.
import { fromWire, avatarOfProfile, toWire, defaultAvatar, isPng } from '../ui/avatarpic.js';
import { cleanName, isSlur } from '../core/profilename.js';

function pfData(profile, withPng) {
  const av = avatarOfProfile(profile);
  const d = { n: profile.name, a: toWire(av) };
  if (withPng && av.m === 's' && av.png) d.s = av.png;
  return d;
}

/** The avatar to show for a peer (or yourself): full snapshot when received, else the lite one, else a generated default. */
export function avatarOfPeer(game, id, fallbackName, liteHint) {
  if (!game || id === game.selfId) return avatarOfProfile(game?.profile);
  const e = game._pf?.get(id);
  const lite = liteHint || game.remotes?.get(id)?.av || game.net?.players?.get(id)?.av || e?.a;
  const av = fromWire(lite, e && e.a === lite ? e.png : undefined);
  if (av) return av;
  return defaultAvatar(fallbackName || game.playerName?.(id) || 'Employee');
}

/** Call once per session from installNetHandlers. */
export function installProfileSync(game, net) {
  game._pf = new Map();                 // peerId -> { a: lite wire, png }
  net.relayTypes?.add('pf');            // the host forwards it to crewmates without a direct link
  net.on_('pf', (d, from) => {
    if (!d || typeof d !== 'object' || from === game.selfId) return;
    const name = cleanName(d.n);
    const e = { a: typeof d.a === 'string' ? d.a : '', png: isPng(d.s) ? d.s : undefined };
    game._pf.set(from, e);
    const info = {};
    if (name && !isSlur(name)) info.name = name;
    const pl = net.players.get(from);
    if (pl) { if (info.name) pl.name = info.name; pl.av = e.a; }
    const r = game.remotes.get(from);
    if (r) { r.av = e.a; if (info.name) r.setInfo(info); r.refreshAvatarTag?.(); }
  });
  const greet = (id) => { try { const d = pfData(game.profile, true); if (d.s) net.sendTo(id, 'pf', d); } catch { /* not connected yet */ } };
  net.on('playerJoin', (id) => greet(id));
  net.on('peerHello', (id) => greet(id));
}

/** After the local profile changed (name / avatar): refresh what new peers will be told and tell the current crew. */
export function syncProfile(game) {
  const net = game?.net;
  if (!net) return;
  try {
    const hd = game.helloData();
    net.helloData = hd;                                        // hello sent to peers that join later
    const self = net.players?.get(net.selfId);
    if (self) { self.name = hd.name; self.av = hd.av; }
    net.send('pinfo', hd);                                     // old clients: name + lite avatar ride on pinfo
    net.send('pf', pfData(game.profile, true));
    if (game.isHost) game.hostAnnounce?.();                     // lobby browser: host name + avatar
  } catch (e) { console.warn('[profile] sync', e); }
}
