// Per-ringer restraint: friends cannot lose currency, die, or have their sale blocked by a griefer.
export function ringDiscipline(state, now, delivered = false) {
  const s = { count: 0, at: now, until: 0, ...state };
  if (delivered) return { count: 0, at: now, until: 0, event: 'calm' };
  if (s.until > now) return { ...s, event: 'paused' };
  s.count = Math.max(0, s.count - Math.floor(Math.max(0, now-s.at)/8)) + 1;
  s.at = now;
  if (s.count >= 6) return { count: 0, at: now, until: now+8, event: 'paused' };
  return { ...s, event: s.count === 4 ? 'warn' : null };
}
