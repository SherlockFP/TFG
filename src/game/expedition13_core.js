export const DRONE_COST = 35, DRONE_TIME = 45;
export const SIGNAL_PARCEL_VALUE = 65;
export function bandTarget(seed, i) { return 1 + ((Math.imul(seed | 0, 31) + i * 7) >>> 0) % 3; }
export function createFieldJob(token, kind) { return { token, kind, accepted: false, values: [0,0,0], dials: [1,1,1], done: false, parcel: false, drone: null, scare: false }; }
export function tuneFieldJob(state, i, op, seed) {
  if (!state?.accepted || state.done || !Number.isInteger(i) || i < 0 || i > 2 || state.values[i]) return { ok:false };
  if (state.kind === 'signal') {
    if (op === 'dial') { state.dials[i] = state.dials[i] % 3 + 1; return { ok:true }; }
    if (op !== 'seal' || state.dials[i] !== bandTarget(seed, i)) return { ok:false, mismatch:true };
  } else if (op !== 'relay') return { ok:false };
  state.values[i] = 1; state.done = state.values.every(Boolean); return { ok:true, completed:true };
}
export function hireFieldDrone(state, run) {
  const industry = run.industry13;
  if (!state?.accepted || state.kind !== 'vault' || state.done || state.drone || industry?.robot || industry?.report || (run.credits | 0) < DRONE_COST) return false;
  run.credits -= DRONE_COST; state.drone = { elapsed:0 }; return true;
}
export function tickFieldDrone(state, dt) {
  if (!state?.drone || state.done || !(dt > 0)) return false;
  state.drone.elapsed = Math.min(DRONE_TIME, state.drone.elapsed + Math.min(dt, 0.25));
  // Physical checking takes 15s per relay; no offline clock or instant bypass.
  for (let i=0;i<3;i++) if (state.drone.elapsed >= (i+1)*15) state.values[i] = 1;
  state.done = state.values.every(Boolean); return state.done;
}
