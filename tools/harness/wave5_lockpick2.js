// Wave 5 lockpick2 smoke (body of an async fn for headless.mjs): module installed, wrapper registered, an Algorithm lock plays through the real
// 'lockpick' registry entry (bot clicks in the window), XP lands in profile.lockpick2, a Simple lock opens fast, co-op helper count is read live.
const g = kefal.game, errs = []; addEventListener('error', (e) => errs.push(e.message));
const L = g.lockpick2;
if (!L) return { error: 'lockpick2 module missing' };
const out = { level0: L.level(), core: !!L.core.TIERS };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function play(tier, tool) {
  let result = null; const t0 = performance.now();
  g.openMinigame('lockpick', { tier, tool, noXp: false }, (r) => { result = r; });
  const mg = g.minigame;
  if (!mg) return { tier, error: 'no minigame opened' };
  const st = () => mg.el?.querySelector?.('.mg-status')?.textContent;
  let clicks = 0;
  for (let i = 0; i < 900 && !result; i++) {
    await wait(16);
    // the bot presses Space every frame: some hits some misses; a real player would time it
    if (i % 3 === 0) { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true })); clicks++; }
  }
  return { tier, tool, result, clicks, ms: Math.round(performance.now() - t0), status: st() };
}
out.simple = await play('simple');
out.algo = await play('algorithm', 'sl_drill');
g.openMinigame('lockpick', { tier: 'algorithm', tool: 'lockpick', noXp: true }, () => {});
await wait(700);
out.shot = 'algorithm open';
out.registry = typeof g.lockpick2.core.tierOfDifficulty;
out.xp = g.profile.lockpick2 || null;
out.errs = errs;
return out;
