// Spell words: diacritic-insensitive keyword matching + Web Speech API listener (push-to-talk V).
// Pure helpers (normalizeWord / matchSpellWords) have no DOM dependency so node tests can import them.

// Turkish-aware folding: İ/I/ı -> i, ş -> s, ç -> c, ğ -> g, ö -> o, ü -> u, then strip any remaining accents.
const FOLD = { 'ı': 'i', 'İ': 'i', 'I': 'i', 'ş': 's', 'Ş': 's', 'ç': 'c', 'Ç': 'c', 'ğ': 'g', 'Ğ': 'g', 'ö': 'o', 'Ö': 'o', 'ü': 'u', 'Ü': 'u', 'â': 'a', 'î': 'i', 'û': 'u', 'ё': 'е', 'Ё': 'е' };

/** "İTTT!" -> "it", "Işık" -> "isik", "SUUUS" -> "sus" (letter runs collapse, so shouted elongations still match). */
export function normalizeWord(w) {
  let s = '';
  for (const ch of String(w || '')) s += FOLD[ch] ?? ch;
  s = s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9а-я]/g, '');   // latin + cyrillic (ru spell words)
  return s.replace(/(.)\1+/g, '$1');
}

export function tokenize(text) {  // normalised tokens (debug / tests)
  return String(text || '').split(/[\s,.;:!?¡¿"'`*~✦()[\]{}<>/\\|-]+/).map(normalizeWord).filter(Boolean);
}

function lev(a, b) {
  if (Math.abs(a.length - b.length) > 1) return 9;
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

/** Build a lookup from spell defs: [{ id, words: { en: [...], tr: [...], ru: [...] } }] -> { en: Map(word -> id), tr: Map, ru: Map } */
export function buildLexicon(spells) {
  const lex = { en: new Map(), tr: new Map(), ru: new Map() };
  for (const sp of spells) {
    for (const lang of ['en', 'tr', 'ru']) for (const w of sp.words[lang] || []) lex[lang].set(normalizeWord(w), sp.id);
  }
  return lex;
}

// real words one letter away from a spell word that must never cast it ("firewall" is a creature players shout about)
const NEAR_MISS = new Set(['firewal', 'blank', 'bling', 'blinds', 'field', 'shiel', 'lemon', 'human', 'women', 'kalan', 'kaplan', 'front', 'meter', 'totes', 'decay']);   // wave 2: front / meter / totes / decay sit one letter from frost / meteor / totem / decoy
function lookup(tok, maps) {
  for (const m of maps) { const id = m.get(tok); if (id) return id; }
  if (tok.length < 5 || NEAR_MISS.has(tok)) return null;   // short words (it, sus, cek) must be exact
  for (const m of maps) for (const [w, id] of m) if (w.length >= 5 && lev(tok, w) <= 1) return id;
  return null;
}

/**
 * Spell ids found in `text`, in spoken order (no duplicates).
 * mode 'chat': the whole message must be ONE spell word (any language).
 * mode 'voice': any spell word anywhere; lang 'en' only listens for English words (the Turkish "it" is far too common
 * in English speech), lang 'tr' accepts Turkish + English words (Turkish recognisers often write the English ones), lang 'ru' Russian + English.
 */
export function matchSpellWords(text, lex, opts = {}) {
  return findSpellWords(text, lex, opts).map((m) => m.id);
}

/** Like matchSpellWords but returns [{ id, w }] with the original (display) word, e.g. { id: 'push', w: 'İT' }. */
export function findSpellWords(text, lex, { mode = 'voice', lang = 'en' } = {}) {
  const raw = String(text || '').split(/\s+/).map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')).filter((w) => normalizeWord(w));
  if (mode === 'chat') {
    if (raw.length !== 1) return [];
    const id = lookup(normalizeWord(raw[0]), [lex.en, lex.tr, lex.ru]);
    return id ? [{ id, w: raw[0] }] : [];
  }
  const maps = lang === 'tr' ? [lex.tr, lex.en] : lang === 'ru' ? [lex.ru, lex.en] : [lex.en];
  const out = [];
  for (const w of raw) { const id = lookup(normalizeWord(w), maps); if (id && !out.some((m) => m.id === id)) out.push({ id, w }); }
  return out;
}

/** Is this normalised word only a Turkish spell word (for Turkish-aware upper-casing: "it" -> "İT")? */
export function isTurkishWord(w, lex) { const n = normalizeWord(w); return lex.tr.has(n) && !lex.en.has(n); }

export const speechSupported = () => typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);

/**
 * Push-to-talk speech listener. start() while V is held, stop() on release (a short grace lets the final result in).
 * onText(text, final, resultIndex) is called for interim and final transcripts; onError(code) for fatal errors.
 */
export class VoiceListener {
  constructor({ onText, onError, onState } = {}) {
    this.onText = onText; this.onError = onError; this.onState = onState;
    this.rec = null; this.active = false; this.wanted = false; this.dead = false; this.lang = 'en-US';
    this.stopT = null;
  }
  ensure() {
    if (this.rec || this.dead) return this.rec;
    const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
    if (!SR) { this.dead = true; return null; }
    try {
      const r = new SR();
      r.continuous = true; r.interimResults = true; r.maxAlternatives = 1;
      r.onresult = (e) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i];
          this.onText?.(res[0]?.transcript || '', !!res.isFinal, i + (this.session || 0) * 1000);
        }
      };
      r.onerror = (e) => {
        const code = e?.error || 'error';
        if (code === 'not-allowed' || code === 'service-not-allowed' || code === 'audio-capture') { this.dead = true; this.wanted = false; }
        if (code !== 'no-speech' && code !== 'aborted') this.onError?.(code);
      };
      r.onend = () => {
        this.active = false; this.onState?.(false);
        // Chrome ends a continuous session on its own after silence: restart while the key is still held
        if (this.wanted && !this.dead) { try { this.session = (this.session || 0) + 1; r.start(); this.active = true; this.onState?.(true); } catch { /* already started */ } }
      };
      this.rec = r;
    } catch (e) { this.dead = true; this.onError?.(String(e?.message || e)); }
    return this.rec;
  }
  start(lang) {
    clearTimeout(this.stopT); this.stopT = null;
    this.wanted = true;
    const r = this.ensure();
    if (!r || this.active) return !!r;
    this.lang = lang || 'en-US';
    r.lang = this.lang;
    try { this.session = (this.session || 0) + 1; r.start(); this.active = true; this.onState?.(true); } catch { /* start() twice throws; harmless */ }
    return true;
  }
  stop(grace = 700) {
    this.wanted = false;
    if (!this.rec || !this.active || this.stopT) return;
    this.stopT = setTimeout(() => { this.stopT = null; if (!this.wanted) { try { this.rec.stop(); } catch { /* ignore */ } } }, grace);
  }
  dispose() {
    clearTimeout(this.stopT);
    this.wanted = false; this.dead = true;
    if (this.rec) { this.rec.onend = null; this.rec.onresult = null; this.rec.onerror = null; try { this.rec.abort(); } catch { /* ignore */ } }
    this.rec = null;
  }
}
