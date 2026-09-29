// Graphics quality presets (wave 7 perf2). Pure tables + one live object (QUALITY) that the hot paths read; no THREE import so node tests can load it.
// settings.quality = 'auto' | 'low' | 'medium' | 'high'; settings.qualityAuto = the level the first-boot fps probe picked (null = not probed yet).
// Medium == the look the game always had. Low targets ~60% of Medium's draw calls / triangles (short far plane + denser fog, half the instanced decor,
// small props beyond 85 m switched off (distcull.js; Medium 170 m: past the fog wall, no visible change; High off), no bloom / outlines, 240p, fewer particles, distant creatures animate at 1/3 rate). There are no shadow maps in this renderer (shadowMap is off), so no shadow knob.

export const LEVELS = ['low', 'medium', 'high'];

/** renderHeight/outlines are written into the user settings when a preset is chosen (they stay individually tweakable);
 *  everything else is read live from QUALITY. */
export const PRESETS = {
  low:    { renderHeight: 240, outlines: false, bloom: 0, far: 230, propFar: 85, fogMul: 1.5, particles: 0.5, particleCap: 240, decor: 0.5, lodFar: 28, lodSkip: 3 },
  medium: { renderHeight: 360, outlines: true,  bloom: 1, far: 420, propFar: 170, fogMul: 1,   particles: 1,   particleCap: 600, decor: 1,   lodFar: 60, lodSkip: 2 },
  high:   { renderHeight: 480, outlines: true,  bloom: 1, far: 420, propFar: 0, fogMul: 0.9, particles: 1.25, particleCap: 600, decor: 1,   lodFar: 0,  lodSkip: 1 },
};

/** live values; mutated in place by applyQualityLevel (never replaced, so importers keep a valid reference) */
export const QUALITY = { level: 'medium', ...PRESETS.medium };

export function isLevel(l) { return LEVELS.includes(l); }

/** settings -> concrete level ('auto' uses the probe result, else medium) */
export function resolveLevel(s) {
  const q = s?.quality;
  if (isLevel(q)) return q;
  return isLevel(s?.qualityAuto) ? s.qualityAuto : 'medium';
}

export function applyQualityLevel(level) {
  const l = isLevel(level) ? level : 'medium';
  Object.assign(QUALITY, PRESETS[l], { level: l });
  return QUALITY;
}

/** choose a preset into the user settings (resolution + outlines) and the live table; returns the level */
export function chooseQuality(settings, choice) {
  settings.quality = choice === 'auto' || isLevel(choice) ? choice : 'auto';
  const l = resolveLevel(settings);
  settings.renderHeight = PRESETS[l].renderHeight;
  settings.outlines = PRESETS[l].outlines;
  applyQualityLevel(l);
  return l;
}

/** average fps of the probe -> level. High only with real headroom (uncapped / high-refresh), because the menu scene is light. */
export function levelFromFps(fps) {
  if (!(fps > 0)) return 'medium';
  if (fps < 40) return 'low';
  if (fps >= 100) return 'high';
  return 'medium';
}

/** frame-time collector: feed raw frame deltas (s); done after `dur` seconds of usable frames (after `warm` s). Ignores hitches > 0.5 s (tab switch). */
export class FpsProbe {
  constructor(dur = 3, warm = 0.6) { this.dur = dur; this.warm = warm; this.t = 0; this.n = 0; this.sum = 0; this.done = false; this.fps = 0; }
  push(dt) {
    if (this.done || !(dt > 0) || dt > 0.5) return this.done;
    this.t += dt;
    if (this.t > this.warm) { this.n++; this.sum += dt; }
    if (this.sum >= this.dur) { this.fps = this.n / this.sum; this.done = true; }
    return this.done;
  }
  level() { return levelFromFps(this.fps); }
}

/** deterministic thinning of a decor list by density 0..1 (index-hash based: stable between calls, keeps >= 1 item of a non-empty list) */
export function thinDecor(list, density = QUALITY.decor) {
  if (!list || density >= 1 || list.length === 0) return list;
  const keep = [];
  const d = Math.max(0, density);
  for (let i = 0; i < list.length; i++) {
    const h = ((Math.imul(i + 1, 2654435761) >>> 8) & 0xffff) / 0x10000;
    if (h < d) keep.push(list[i]);
  }
  return keep.length ? keep : [list[0]];
}
