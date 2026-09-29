// landingq.js - wave 8 perf4: the LANDING JOB QUEUE.
// Problem (docs/wave8/perf3.md): loadMapFor() built the outdoor map, the facility and then ran ~40 'mapLoaded' handlers (worlds3, repomaps,
// labyrinths, mapart, mining, soul, secureloot, chests ...) in ONE frame = a 2-4 s freeze the moment the lever is pulled, and the first
// materials were compiled by the first frame that saw them (60-230 ms ticks).
// Now (non-instant loads only; a late joiner / resume still builds synchronously): every build step and every mapLoaded handler is one JOB, run in
// the SAME ORDER as before (so seeded results are identical on every peer) but a few ms per frame behind the 9 s descent, and the last job
// pre-compiles the scene's shaders (renderer.compileAsync). Any phase after 'landing' (and hostFinishLanding) FLUSHES the queue first, so nothing
// downstream ever sees a half-built map. unloadMap() clears it (jobs of a map that is already gone never run).
// Timing: game.landQ.last = [{ name, ms }] of the latest landing, game.landQ.report() sorts it (console: kefal.game.landQ.report()).

export class LandingQueue {
  constructor({ budgetMs = 8, startDelay = 0.35, now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) } = {}) {
    this.budgetMs = budgetMs; this.startDelay = startDelay; this.now = now;
    this.enabled = true; this.jobs = []; this.wait = 0; this.last = []; this.running = false; this.flushing = false;
  }
  get pending() { return this.jobs.length; }
  /** queue one job; the first one of a batch arms the start delay (title card + thrusters get a frame first) */
  add(name, fn) { if (!this.jobs.length && !this.running && !this.flushing) { this.wait = this.startDelay; this.last = []; } this.jobs.push({ name, fn }); }
  _run(job) {
    const t = this.now();
    try { job.fn(); } catch (e) { console.warn('[landingq] ' + job.name, e); }
    this.last.push({ name: job.name, ms: Math.round((this.now() - t) * 10) / 10 });
  }
  /** per-frame pump: at least one job, then more while this frame's budget lasts */
  tick(dt) {
    if (!this.jobs.length || this.flushing) return;
    if (this.wait > 0) { this.wait -= dt; return; }
    const t0 = this.now(), budget = Math.min(60, Math.max(this.budgetMs, dt * 500));   // slow frames (weak GPU / software GL) get a bigger slice so the queue still ends inside the descent
    this.running = true;
    try { while (this.jobs.length && this.now() - t0 < budget) this._run(this.jobs.shift()); } finally { this.running = false; }
  }
  /** run everything that is left right now, in order (a job may add more jobs) */
  flush() {
    if (this.flushing) return 0;
    this.flushing = true; let n = 0;
    try { while (this.jobs.length) { this._run(this.jobs.shift()); n++; } } finally { this.flushing = false; }
    return n;
  }
  clear() { this.jobs.length = 0; this.wait = 0; }
  report() { return this.last.slice().sort((a, b) => b.ms - a.ms); }
  get totalMs() { return this.last.reduce((s, j) => s + j.ms, 0); }
}

export function installLandQ(game) {
  const q = new LandingQueue();
  const off = game.mods?.on?.('update', (dt) => q.tick(dt));
  /** compile every material currently in the scene against the engine's render target (program cache key includes the target's colour space);
   *  compileAsync starts the driver compiles and returns without blocking on the link (KHR_parallel_shader_compile) */
  q.prewarm = () => {
    const e = game.engine, r = e?.renderer;
    if (!r || !e.scene || !e.camera) return;
    const prev = r.getRenderTarget();
    try { r.setRenderTarget(e.rt || null); (r.compileAsync || r.compile).call(r, e.scene, e.camera)?.catch?.(() => {}); } catch (err) { console.warn('[landingq] prewarm', err); } finally { r.setRenderTarget(prev); }
  };
  q.dispose = () => { q.clear(); off?.(); };
  return q;
}
