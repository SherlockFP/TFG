// Number-aware safety-net translation (wave 8 i18n8) for text that is built from a literal plus numbers and cannot go through tf() at the call
// site (minigame canvas text, terminal lines): exact key first, then the same text with its numbers as {} ("HI 120" -> key "HI {}").
// English (the source language) returns the text untouched. Results are cached per language.
import { t, getLang, onLangChange } from '../core/i18n.js';

const NUMRE = /\d+(?:[.,]\d+)?/g;
const cache = new Map();
onLangChange(() => cache.clear());

export function tNum(text) {
  if (typeof text !== 'string' || !text || getLang() === 'en') return text;
  const hit = cache.get(text);
  if (hit !== undefined) return hit;
  let out = t(text);
  if (out === text) {
    const nums = text.match(NUMRE);
    if (nums) {
      const key = text.replace(NUMRE, '{}');
      const b = t(key);
      if (b !== key) { let i = 0; out = b.replace(/\{\}/g, () => nums[i++] ?? ''); }
    }
  }
  if (cache.size > 800) cache.clear();
  cache.set(text, out);
  return out;
}
