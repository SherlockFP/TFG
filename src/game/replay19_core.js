// One crew-shared recording per landing. All clocks are native simulated time.
export const REPLAY19 = Object.freeze({ warning: 8, live: 12, pulseEvery: 4, loud: 2 });
export const replayToken = run => `${run?.moon}:${run?.seed}:${run?.day}`;
export const newReplay = token => ({ token, rev: 0, used: false, stage: 'idle', start: 0, pulse: -1 });
export function startReplay(s, rev, now, powered) {
  if (!s || s.used || s.stage !== 'idle' || rev !== s.rev || !Number.isFinite(now) || !powered) return false;
  s.used = true; s.stage = 'warning'; s.start = now; s.pulse = -1; s.rev++; return true;
}
export function advanceReplay(s, now, powered) {
  if (!s || !['warning', 'live'].includes(s.stage)) return { changed: false, pulse: false };
  const age = Math.max(0, now - s.start), previous = s.stage;
  if (!powered || age >= REPLAY19.warning + REPLAY19.live) s.stage = 'spent';
  else if (age >= REPLAY19.warning) s.stage = 'live';
  // At most one pulse per update, never catch up multiple noises after a stall.
  const index = Math.floor((age - REPLAY19.warning) / REPLAY19.pulseEvery);
  const pulse = s.stage === 'live' && index > s.pulse;
  if (pulse) s.pulse = index;
  const changed = previous !== s.stage || pulse;
  if (changed) s.rev++;
  return { changed, pulse };
}
