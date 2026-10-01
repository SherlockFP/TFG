// Route names are independent keys. Never match across concatenated name/ID fields.
export function normalizeMoonQuery30(value) {
  return String(value || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/ı/g, 'i').replace(/[^\p{L}\p{N}]/gu, '');
}

export function moonQueryKeys30(m, translated = []) {
  const names = [m?.name, m?.$name, m?.short, ...translated].filter(Boolean);
  return [...new Set([m?.id, ...names, ...names.map(n => String(n).replace(/^[\da-z]+\s*[-–—]\s*/i, ''))]
    .map(normalizeMoonQuery30).filter(Boolean))];
}

// Exact IDs win; otherwise equally good matches are choices, never an arbitrary first result.
export function resolveMoonQuery30(query, moons, sector = [], translated = () => []) {
  const raw = String(query || '').trim(), explicit = raw.startsWith('#');
  const slot = explicit ? /^#\s*(\d+)$/.exec(raw) : /^([1-9])$/.exec(raw);
  const list = moons.filter(m => m && !m.stale && !m.deadletter && !m.deadletter24);
  if (slot && Number(slot[1]) > 0) {
    const m = sector[Number(slot[1]) - 1];
    if (m && list.some(x => x.id === m.id)) return { moon: m, choices: [m] };
  }
  // Any explicit invalid/missing slot must not become a numeric-name match.
  if (explicit) return { moon: null, choices: [] };
  const q = normalizeMoonQuery30(raw);
  if (!q) return { moon: null, choices: [] };
  const exactIds = list.filter(m => normalizeMoonQuery30(m.id) === q);
  if (exactIds.length) return { moon: exactIds.length === 1 ? exactIds[0] : null, choices: exactIds };
  const keyed = list.map(m => ({ m, keys: moonQueryKeys30(m, translated(m)) }));
  for (const match of [k => k === q, k => k.startsWith(q), k => k.includes(q)]) {
    const choices = keyed.filter(x => x.keys.some(match)).map(x => x.m);
    if (choices.length) return { moon: choices.length === 1 ? choices[0] : null, choices };
  }
  return { moon: null, choices: [] };
}

// A displayed short command is tested against the same live directory as typed input.
export function shortMoonAlias30(m, moons, sector = [], translated = () => []) {
  const stem = normalizeMoonQuery30(m.short || String(m.name || '').replace(/^[\da-z]+\s*[-–—]\s*/i, ''));
  for (let n = Math.min(3, stem.length); n <= stem.length; n++) {
    const q = stem.slice(0, n);
    if (resolveMoonQuery30(q, moons, sector, translated).moon?.id === m.id) return q;
  }
  return m.id;
}
