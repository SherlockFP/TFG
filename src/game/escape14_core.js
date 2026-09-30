export const ID = 'e14_warden';
export const TUNE = Object.freeze({ quota: 2, attempt: 35, warning: 2.2, windup: 1.1, reach: 1.8, chase: 12, lost: 2.2, search: 6, rest: 8, speed: 5.6, hideMax: 20, inspect: 3 });
export function mayHide({ alive, distance, vertical, occupied, giant, trolley, reviving, downed, blocked }) {
  return alive && distance <= 2.5 && vertical <= 1.8 && !occupied && !giant && !trolley && !reviving && !downed && !blocked;
}
export function nextPursuit({ state, t, visible, hidden, distance, lost = 0 }) {
  if (state === 'warning') return t >= TUNE.warning ? 'chase' : null;
  if (state === 'chase') return hidden || lost >= TUNE.lost || t >= TUNE.chase ? 'search' : visible && distance <= TUNE.reach ? 'windup' : null;
  if (state === 'windup') return !visible || hidden || distance > TUNE.reach + 0.7 ? 'search' : t >= TUNE.windup ? 'strike' : null;
  if (state === 'search') return t >= TUNE.search ? 'rest' : null;
  if (state === 'rest') return t >= TUNE.rest ? 'watch' : null;
  return null;
}
export function attackConnects({ visible, hidden, distance, safe, age }) { return visible && !hidden && !safe && age >= 3 && distance <= TUNE.reach; }
export const mayStart = ({ quota, used, boss, mission, hides, phase }) => quota >= TUNE.quota && !used && !boss && !mission && hides >= 2 && phase === 'moon';
