// Pure atomic casino ledger. Chips are bought with crew Credits, never gifted.
export const MAX_CHIPS = 100000;
export const BETS = [5, 10, 25];
export function transact(run, peer, d, rand = Math.random) {
  if (!run || typeof peer !== 'string' || !peer || ['__proto__','constructor','prototype'].includes(peer) || !d || typeof d !== 'object' || !Number.isSafeInteger(run.credits) || run.credits < 0) return null;
  const ledger = run.casino13 ||= { wallets: {} };
  const w = Object.hasOwn(ledger.wallets, peer) ? ledger.wallets[peer] : (ledger.wallets[peer] = { chips: 0, round: null, seq: 0 });
  if (!Number.isSafeInteger(d.seq) || d.seq !== w.seq) return null;
  const amount = d.amount;
  let result;
  if (d.action === 'buy') {
    if (![10, 25, 50].includes(amount) || run.credits < amount || w.chips + amount > MAX_CHIPS) return null;
    run.credits -= amount; w.chips += amount; result = { kind: 'bought', paid: amount };
  } else if (d.action === 'redeem') {
    if (w.round || !Number.isSafeInteger(amount) || amount <= 0 || amount > w.chips) return null;
    w.chips -= amount; run.credits += amount; result = { kind: 'redeemed', paid: amount };
  } else if (d.action === 'cash') {
    if (!w.round) return null;
    const paid = w.round.pot; w.chips = Math.min(MAX_CHIPS, w.chips + paid); w.round = null; result = { kind: 'cashed', paid };
  } else if (d.action === 'push') {
    if (!w.round || w.round.step >= 3) return null;
    const round = w.round, success = rand() < [0.65, 0.55, 0.45][round.step];
    if (success) { round.step++; round.pot *= 2; result = { kind: 'safe', paid: round.pot }; }
    else { w.round = null; result = { kind: 'bust', paid: 0 }; }
  } else if (d.action === 'play') {
    if (w.round || !BETS.includes(amount) || w.chips < amount || !['slots', 'wheel', 'packet'].includes(d.game)) return null;
    if (d.game === 'wheel' && !['red', 'black'].includes(d.choice)) return null;
    w.chips -= amount;
    if (d.game === 'packet') { w.round = { step: 0, pot: amount }; result = { kind: 'started', paid: amount }; }
    else if (d.game === 'wheel') { const n = Math.floor(rand() * 37); const color = n === 0 ? 'zero' : n % 2 ? 'red' : 'black'; const paid = color === d.choice ? amount * 2 : 0; w.chips = Math.min(MAX_CHIPS, w.chips + paid); result = { kind: color, paid, n }; }
    else { const reels = Array.from({ length: 3 }, () => Math.floor(rand() * 6)); const mult = reels.every(x => x === reels[0]) ? (reels[0] === 5 ? 12 : 6) : reels[0] === reels[1] ? 2 : 0; const paid = amount * mult; w.chips = Math.min(MAX_CHIPS, w.chips + paid); result = { kind: paid ? 'win' : 'loss', paid, reels }; }
  } else return null;
  w.seq++; return { ...result, wallet: { ...w, round: w.round && { ...w.round } }, credits: run.credits };
}
