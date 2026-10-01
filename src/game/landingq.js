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
    this.enabled = true; this.afterPrewarm = []; this.clearCleanups = new Set(); this.jobs = []; this.wait = 0; this.last = []; this.running = false; this.flushing = false; this._inJob = false; this._ins = 0;
  }
  get pending() { return this.jobs.length; }
  /** queue one job; the first one of a batch arms the start delay (title card + thrusters get a frame first) */
  add(name, fn) { if (!this.jobs.length && !this.running && !this.flushing) { this.wait = this.startDelay; this.last = []; } this.jobs.push({ name, fn }); }
  /** a handler that is itself running as a job splits its work: the parts run NEXT, in the order added (before the jobs queued behind it, so later
   *  handlers + prewarm still see the finished result). Outside a job (instant load) it just runs fn now. */
  addNext(name, fn, { yieldFrame = false } = {}) { if (!this._inJob) { fn(); return; } this.jobs.splice(this._ins++, 0, { name, fn, yieldFrame }); }
  /** Pending detached builds release their owned resources if the map goes away. */
  onClear(fn) { this.clearCleanups.add(fn); return () => this.clearCleanups.delete(fn); }
  _run(job) {
    const t = this.now(), pj = this._inJob, pi = this._ins;
    this._inJob = true; this._ins = 0;
    try { job.fn(); } catch (e) { console.warn('[landingq] ' + job.name, e); } finally { this._inJob = pj; this._ins = pi; }
    this.last.push({ name: job.name, ms: Math.round((this.now() - t) * 10) / 10 });
  }
  /** per-frame pump: at least one job, then more while this frame's budget lasts */
  tick(dt) {
    if (!this.jobs.length || this.flushing) return;
    if (this.wait > 0) { this.wait -= dt; return; }
    const t0 = this.now(), budget = Math.min(60, Math.max(this.budgetMs, dt * 500));   // slow frames (weak GPU / software GL) get a bigger slice so the queue still ends inside the descent
    this.running = true;
    try { while (this.jobs.length && this.now() - t0 < budget) { const job = this.jobs.shift(); this._run(job); if (job.yieldFrame) break; } } finally { this.running = false; }
  }
  /** run everything that is left right now, in order (a job may add more jobs) */
  flush() {
    if (this.flushing) return 0;
    this.flushing = true; let n = 0;
    try { while (this.jobs.length) { this._run(this.jobs.shift()); n++; } } finally { this.flushing = false; }
    return n;
  }
  clear() { this.jobs.length = 0; this.wait = 0; const cleanups = [...this.clearCleanups]; this.clearCleanups.clear(); for (const f of cleanups) { try { f(); } catch (e) { console.warn('[landingq] clear cleanup', e); } } for (const f of this.afterPrewarm.splice(0)) { try { f(); } catch { /* ignore */ } } }   // [perf6] a cleared landing still removes its warm group
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
    const done = () => { for (const f of q.afterPrewarm.splice(0)) { try { f(); } catch (err) { console.warn('[landingq] afterPrewarm', err); } } };   // [perf6] the warm set's hidden group goes away once compiled
    if (!r || !e.scene || !e.camera) { done(); return; }
    const prev = r.getRenderTarget();
    try { r.setRenderTarget(e.rt || null); const p = (r.compileAsync || r.compile).call(r, e.scene, e.camera); if (p?.then) p.then(done, done); else done(); } catch (err) { console.warn('[landingq] prewarm', err); done(); } finally { r.setRenderTarget(prev); }
  };
  q.dispose = () => { q.clear(); off?.(); };
  return q;
}
