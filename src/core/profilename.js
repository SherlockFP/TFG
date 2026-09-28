// [profile] Nickname rules (pure, no DOM: unit-tested by tools/harness/profile.test.mjs).
// 2-16 characters, trimmed, spaces collapsed, letters / digits / space / . _ - ' only, a small slur filter (EN / TR / RU),
// and no name that looks like an existing one (host / crew impersonation: "Ho5t" vs "Host", Latin/Cyrillic lookalikes).

export const NAME_MIN = 2;
export const NAME_MAX = 16;

const ALLOWED = /[^\p{L}\p{N} ._'-]/gu;

/** Sanitise only (never rejects): strips control / zero-width / emoji, trims, collapses spaces, caps to NAME_MAX. */
function sanitize(raw) {
  return String(raw ?? '').normalize('NFC').replace(ALLOWED, '').replace(/\s+/g, ' ').trim().replace(/^[._'-]+/, '').trim();   // no leading punctuation
}
export function cleanName(raw) {
  const chars = [...sanitize(raw)];
  return chars.length > NAME_MAX ? chars.slice(0, NAME_MAX).join('').trim() : chars.join('');
}

const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', '@': 'a', $: 's', '!': 'i' };
// Cyrillic letters that look like Latin ones -> Latin (impersonation check only)
const CYR2LAT = { а: 'a', е: 'e', о: 'o', р: 'p', с: 'c', х: 'x', у: 'y', к: 'k', м: 'm', н: 'h', т: 't', в: 'b', ѕ: 's', і: 'i', ј: 'j', ё: 'e' };
const TR = { ı: 'i', İ: 'i', ş: 's', ğ: 'g', ü: 'u', ö: 'o', ç: 'c' };

/** Comparison skeleton: lowercase, diacritics + separators gone, leet / lookalikes folded ("H0st_", "Нost" -> "host"). */
export function nameKey(raw, { lookalikes = true } = {}) {
  let s = String(raw ?? '').toLowerCase();
  s = [...s].map((c) => TR[c] || c).join('').normalize('NFD').replace(/[̀-ͯ]/g, '');
  s = s.replace(/й/g, 'и').replace(/ё/g, 'е');            // composed Cyrillic forms that NFD would split
  s = [...s].map((c) => (lookalikes ? (LEET[c] || CYR2LAT[c] || c) : (LEET[c] || c))).join('');
  return s.replace(/[^\p{L}\p{N}]/gu, '').replace(/(.)\1{2,}/gu, '$1$1');   // separators out (digits 2/6/9 stay), "aaaa" -> "aa"
}

// Small hate-slur list. SUB = matched as a substring of the skeleton (long, unambiguous roots); WORD = whole-word only.
const SLUR_SUB = [
  // EN
  'nigger', 'nigga', 'faggot', 'chink', 'tranny', 'retard', 'wetback',
  // TR
  'orospu', 'pezevenk', 'gavat', 'kahpe', 'yavsak', 'amcik', 'yarrak', 'sikik', 'gotveren',
  // RU
  'пидор', 'пидар', 'пидр', 'нигер', 'черножоп', 'ебан', 'ебал', 'блять', 'блядь', 'сучар', 'мразь', 'долбоеб', 'долбоёб', 'уебан', 'хуесос', 'залуп',
];
const SLUR_WORD = ['fag', 'coon', 'paki', 'kike', 'gook', 'spic', 'spick', 'rape', 'rapist', 'nazi', 'ibne', 'amk', 'aq', 'sik', 'сука', 'хуй', 'пизда', 'мудак', 'негр', 'хач'];
const SLUR_SUB_KEYS = SLUR_SUB.map((w) => nameKey(w, { lookalikes: false })).filter((w) => w.length >= 3);
const SLUR_WORD_KEYS = new Set(SLUR_WORD.map((w) => nameKey(w, { lookalikes: false })));
const RESERVED = ['system', 'server', 'host', 'admin', 'administrator', 'moderator', 'mod', 'tfg', 'algorithm', 'company', 'everyone', 'you'];

export function isSlur(raw) {
  const flat = nameKey(raw, { lookalikes: false });
  if (!flat) return false;
  if (SLUR_SUB_KEYS.some((w) => flat.includes(w))) return true;
  if (SLUR_WORD_KEYS.has(flat)) return true;
  for (const part of String(raw).toLowerCase().split(/[ ._'-]+/)) { if (SLUR_WORD_KEYS.has(nameKey(part, { lookalikes: false }))) return true; }
  return false;
}

/**
 * Validate a nickname. `taken` = names that must not be duplicated / imitated (current crew, lobby hosts).
 * `own` = the player's current name (it never conflicts with itself).
 * -> { ok: true, name } | { ok: false, name, reason: 'short' | 'long' | 'chars' | 'slur' | 'reserved' | 'taken' }
 */
export function validateName(raw, { taken = [], own = '' } = {}) {
  const name = cleanName(raw);
  if ([...sanitize(raw)].length > NAME_MAX) return { ok: false, name, reason: 'long' };
  const letters = [...name].filter((c) => /[\p{L}\p{N}]/u.test(c)).length;
  if (letters < NAME_MIN) return { ok: false, name, reason: 'short' };
  const key = nameKey(name);
  if (!key) return { ok: false, name, reason: 'chars' };
  if (isSlur(name)) return { ok: false, name, reason: 'slur' };
  if (RESERVED.includes(key)) return { ok: false, name, reason: 'reserved' };
  const ownKey = own ? nameKey(own) : null;
  for (const other of taken) {
    if (!other) continue;
    const k = nameKey(other);
    if (k && k === key && !(ownKey && k === ownKey && String(other) === String(own))) return { ok: false, name, reason: 'taken' };
  }
  return { ok: true, name };
}

/** English reason strings (run through t() by the caller). */
export const NAME_REASONS = {
  short: 'Name needs at least 2 characters.',
  long: 'Name is too long (max 16 characters).',
  chars: 'Use letters, digits, spaces and . _ - only.',
  slur: 'That name is not allowed.',
  reserved: 'That name is reserved.',
  taken: 'Someone here already uses a name that looks like that.',
};
