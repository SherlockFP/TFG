// SOCIAL HUB core (pure logic, no DOM / three / network: unit-tested by tools/harness/social.test.mjs).
// Presence table with expiry, message + beacon validation, text sanitising, rate limiters, friend list + DM history helpers.
// Wire types (all prefixed 'so'): sop (presence beacon), sobye (leaving), sodm (direct message), soinv (lobby invite),
// sorad (in-run walkie text, see game/social.js). Privacy notes: docs/wave4/social.md.
import { cleanName, isSlur } from '../core/profilename.js';

export const HUB_ROOM = 'tfg-hub-v1';
export const HUB = {
  BEACON_MS: 10000,      // presence beacon period
  STALE_MS: 30000,       // a peer that stayed silent this long disappears from the list
  MIN_BEACON_GAP: 2500,  // inbound beacons faster than this per peer are dropped (flood guard)
  MAX_PEERS: 120,        // presence table cap (oldest evicted)
  DM_MAX: 240,           // characters per direct message
  DM_OUT: [4, 8000],     // outbound: 4 DMs per 8 s
  DM_IN: [5, 8000],      // inbound: 5 DMs per 8 s per peer (rest dropped)
  INV_OUT: [3, 20000],   // outbound invites per 20 s
  INV_IN: [2, 30000],    // inbound invites per 30 s per peer
  FRIENDS_MAX: 100,
  BLOCK_MAX: 200,
  HISTORY_MAX: 50,       // DM lines kept per friend
  MEM_HISTORY_MAX: 100,  // DM lines kept per conversation in memory
  LOBBY_NAME_MAX: 24,
};
const STRATEGIES = ['nostr', 'mqtt', 'torrent', 'local'];
const STATUSES = ['menu', 'lobby', 'run'];

// ------------------------------------------------------------------------------------------------ text
// Control chars, zero-width + bidi override / isolate marks (spoofing), private use. Newlines become spaces.
const BAD_CHARS = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁯﻿-]/g;

/** Plain-text sanitiser for chat-like strings. Never returns markup handling: the UI must still use textContent. */
export function cleanText(raw, max = HUB.DM_MAX) {
  if (typeof raw !== 'string') return '';
  let s = raw.normalize('NFC').replace(/[\r\n\t]+/g, ' ').replace(BAD_CHARS, '').replace(/\s{2,}/g, ' ').trim();
  // drop a broken trailing surrogate that a plain slice could create
  if (s.length > max) { s = s.slice(0, max); if (/[\ud800-\udbff]$/.test(s)) s = s.slice(0, -1); s = s.trim(); }
  return s;
}
/** Text that arrives from a peer: sanitised, and refused entirely when it is empty. */
export function cleanIncoming(raw, max = HUB.DM_MAX) { return cleanText(raw, max); }

export const cleanLobbyCode = (c) => (typeof c === 'string' && /^[A-Za-z0-9]{4,8}$/.test(c) ? c.toUpperCase() : '');
const cleanId = (s) => (typeof s === 'string' && /^[A-Za-z0-9_-]{4,24}$/.test(s) ? s : '');
const cleanAv = (s) => (typeof s === 'string' && s.length === 258 && (s[0] === 'p' || s[0] === 's') && /^[0-9a-f]+$/.test(s.slice(2)) ? s : '');
const int = (v, lo, hi, fb = 0) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, v | 0)) : fb);

// ------------------------------------------------------------------------------------------------ wire validation
/** Presence beacon body -> clean object or null. { id, n, av, st, lb?, v } */
export function validateBeacon(d) {
  if (!d || typeof d !== 'object') return null;
  const id = cleanId(d.id);
  const n = cleanName(d.n);
  if (!id || !n || n.length < 2 || isSlur(n)) return null;
  const out = { id, n, av: cleanAv(d.av), st: STATUSES.includes(d.st) ? d.st : 'menu', v: typeof d.v === 'string' ? d.v.slice(0, 12) : '', lv: int(d.lv, 0, 999) };
  const l = d.lb;
  if (l && typeof l === 'object') {
    const code = cleanLobbyCode(l.c);
    if (code) out.lb = { c: code, n: cleanText(String(l.n ?? ''), HUB.LOBBY_NAME_MAX), p: int(l.p, 0, 64), m: int(l.m, 1, 64, 4), k: l.k ? 1 : 0, s: STRATEGIES.includes(l.s) ? l.s : 'nostr' };
  }
  return out;
}
/** Direct message body -> { text } or null. */
export function validateDm(d) {
  if (!d || typeof d !== 'object') return null;
  const text = cleanIncoming(d.x, HUB.DM_MAX);
  if (!text) return null;
  return { text, id: cleanId(d.id), n: cleanName(d.n) };
}
/** Invite body -> { code, name, lock, strat } or null. Never carries a password. */
export function validateInvite(d) {
  if (!d || typeof d !== 'object') return null;
  const code = cleanLobbyCode(d.c);
  if (!code) return null;
  return { code, name: cleanText(String(d.ln ?? ''), HUB.LOBBY_NAME_MAX), lock: d.k ? 1 : 0, strat: STRATEGIES.includes(d.s) ? d.s : 'nostr', id: cleanId(d.id), n: cleanName(d.n) };
}

// ------------------------------------------------------------------------------------------------ rate limiting
/** Sliding window: allow(key, now) -> true when under `max` events in the last `windowMs`. Bounded memory. */
export class RateLimiter {
  constructor(max, windowMs, maxKeys = 400) { this.max = max; this.windowMs = windowMs; this.maxKeys = maxKeys; this.hits = new Map(); }
  allow(key, now) {
    let a = this.hits.get(key);
    if (!a) { a = []; if (this.hits.size >= this.maxKeys) this.hits.delete(this.hits.keys().next().value); this.hits.set(key, a); }
    while (a.length && now - a[0] >= this.windowMs) a.shift();
    if (a.length >= this.max) return false;
    a.push(now);
    return true;
  }
  /** milliseconds until a new event would be allowed (0 when free) */
  wait(key, now) {
    const a = this.hits.get(key);
    if (!a || a.length < this.max) return 0;
    return Math.max(0, this.windowMs - (now - a[a.length - this.max]));
  }
  forget(key) { this.hits.delete(key); }
}

// ------------------------------------------------------------------------------------------------ presence
/** peerId -> beacon + last seen. Expiry is by LOCAL receive time (peer clocks are never trusted). */
export class PresenceTable {
  constructor({ staleMs = HUB.STALE_MS, maxPeers = HUB.MAX_PEERS, minGap = HUB.MIN_BEACON_GAP } = {}) {
    this.staleMs = staleMs; this.maxPeers = maxPeers; this.minGap = minGap;
    this.map = new Map();
  }
  /** returns 'new' | 'update' | 'same-ignored' (flood-dropped) | null (invalid) */
  upsert(peerId, raw, now) {
    const b = validateBeacon(raw);
    if (!b || typeof peerId !== 'string') return null;
    const prev = this.map.get(peerId);
    if (prev && now - prev.seen < this.minGap && prev.id === b.id) return 'same-ignored';
    if (!prev && this.map.size >= this.maxPeers) this._evictOldest();
    this.map.set(peerId, { ...b, peerId, seen: now, first: prev?.first ?? now });
    return prev ? 'update' : 'new';
  }
  remove(peerId) { return this.map.delete(peerId); }
  /** drop everybody silent for staleMs; returns the removed peer ids */
  prune(now) {
    const gone = [];
    for (const [id, e] of this.map) if (now - e.seen > this.staleMs) { this.map.delete(id); gone.push(id); }
    return gone;
  }
  get(peerId) { return this.map.get(peerId) || null; }
  /** live entries (never stale), newest first unless sorted by the caller */
  list(now) {
    const out = [];
    for (const e of this.map.values()) if (now - e.seen <= this.staleMs) out.push(e);
    return out.sort((a, b) => a.n.localeCompare(b.n));
  }
  /** peers that advertise a joinable lobby */
  lobbies(now) { return this.list(now).filter((e) => e.lb).sort((a, b) => (b.lb.p - a.lb.p) || a.lb.n.localeCompare(b.lb.n)); }
  byStableId(id, now) { return this.list(now).filter((e) => e.id === id); }
  get size() { return this.map.size; }
  _evictOldest() {
    let oldest = null;
    for (const [k, e] of this.map) if (!oldest || e.seen < oldest[1]) oldest = [k, e.seen];
    if (oldest) this.map.delete(oldest[0]);
  }
}

// ------------------------------------------------------------------------------------------------ friends / blocks / history
/** friends: [{ id, nick, added }]. Returns the (possibly new) list; the caller stores it. */
export function addFriend(list, id, nick, now = Date.now()) {
  id = cleanId(id); nick = cleanName(nick);
  if (!id || !nick) return { list, ok: false, reason: 'bad' };
  const cur = Array.isArray(list) ? list : [];
  const i = cur.findIndex((f) => f.id === id);
  if (i >= 0) { const next = cur.slice(); next[i] = { ...next[i], nick }; return { list: next, ok: true, existed: true }; }
  if (cur.length >= HUB.FRIENDS_MAX) return { list: cur, ok: false, reason: 'full' };
  return { list: [...cur, { id, nick, added: now }], ok: true };
}
export const removeFriend = (list, id) => (Array.isArray(list) ? list.filter((f) => f.id !== id) : []);
export const isFriend = (list, id) => Array.isArray(list) && list.some((f) => f.id === id);
/** Clean a stored friend list (hand-edited or old saves). */
export function sanitizeFriends(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set(), out = [];
  for (const f of list) {
    const id = cleanId(f?.id), nick = cleanName(f?.nick);
    if (!id || !nick || seen.has(id)) continue;
    seen.add(id); out.push({ id, nick, added: Number.isFinite(f.added) ? f.added : 0 });
    if (out.length >= HUB.FRIENDS_MAX) break;
  }
  return out;
}
export function sanitizeBlocked(list) {
  if (!Array.isArray(list)) return [];
  return [...new Set(list.map(cleanId).filter(Boolean))].slice(0, HUB.BLOCK_MAX);
}

/** Append { d: 'in'|'out', x: text, t: ms } to a conversation, keeping the last `cap` lines. */
export function pushHistory(arr, entry, cap = HUB.HISTORY_MAX) {
  const out = Array.isArray(arr) ? arr.slice() : [];
  out.push({ d: entry.d === 'out' ? 'out' : 'in', x: cleanText(String(entry.x ?? ''), HUB.DM_MAX), t: Number.isFinite(entry.t) ? entry.t : 0 });
  return out.length > cap ? out.slice(out.length - cap) : out;
}
/** Clean the localStorage blob { friendId: [entries] } - only known friends survive, each capped. */
export function sanitizeHistory(obj, friends) {
  const out = {};
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return out;
  const ok = new Set((friends || []).map((f) => f.id));
  for (const [id, arr] of Object.entries(obj)) {
    if (!ok.has(id) || !Array.isArray(arr)) continue;
    let h = [];
    for (const e of arr.slice(-HUB.HISTORY_MAX)) if (e && typeof e.x === 'string' && e.x) h = pushHistory(h, e);
    out[id] = h;
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ chat command helpers (/w nick text)
const fold = (s) => String(s || '').toLowerCase().normalize('NFC');
/** "/w Some Nick hello there": nicks may contain spaces, so try the longest exact nick first, then a unique prefix of the first word.
 *  rows: [{ id, n }]. Returns { row, text } or null (text may be '' when only a nick was given). */
export function resolveTarget(rows, words) {
  if (!Array.isArray(rows) || !Array.isArray(words) || !words.length) return null;
  for (let k = Math.min(words.length, 4); k >= 1; k--) {
    const cand = fold(words.slice(0, k).join(' '));
    const hit = rows.filter((r) => fold(r.n) === cand);
    if (hit.length === 1) return { row: hit[0], text: words.slice(k).join(' ') };
  }
  const w = fold(words[0]);
  const pre = rows.filter((r) => fold(r.n).startsWith(w));
  if (pre.length === 1) return { row: pre[0], text: words.slice(1).join(' ') };
  return null;
}
