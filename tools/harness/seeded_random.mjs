// Side-effect import for node tests whose modules call Math.random at run time: import this FIRST so every run is
// deterministic (mulberry32). Seed with TFG_TEST_SEED to explore other rolls.
let a = (Number(process.env.TFG_TEST_SEED) || 2) >>> 0;   // default seed 2: a roll where every scripted scenario plays out (other seeds can legitimately differ, e.g. AutoMod deletes the body before it flags)
Math.random = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
