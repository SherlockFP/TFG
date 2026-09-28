# Bug hunt: confirmed findings

## [critical] (economy) Host setTimeouts keep running after leaving the game and overwrite the save with an empty ship
- src/game/host.js:277
- fix: Route every host timer through a helper such as `this.later(fn, ms)` that stores the ids in `this._timers`, and clear them all in destroy(). Also set `this.destroyed = true` in destroy() and return early from hostSave, hostFinishTakeoff, hostFinishLanding and the sell callback when it is set.
- verified fix: 1. **Track and cancel host timers.** Add `later(fn, ms) { const id = setTimeout(() => { this._timers?.delete(id); if (!this.destroyed) fn(); }, ms); (this._timers ||= new Set()).add(id); return id; }`. Use it in place of the bare `setTimeout` at host.js:252, 278, 358 and 763.
2. **Mark the game dead.** At the top of `destroy()` (game.js:776), set `this.destroyed = true` and clear every id in `this._timers`.
3. **Guard the save.** Add `if (this.destroyed) return;` at the top of `hostSave`, `hostFinishTakeoff`, `hostFinishLanding` and the sell callback.
4. **Make being fired persistent before any delay.** In `hostEvaluateQuota`'s fired branch (host.js:355), build `const fresh = newRun(); rollForecast(fresh);` and save it right away: `const { phase, ...rest } = fresh; saveRun(this.saveSlot, { ...rest, shipItems: [], crew: [...] });`. Then set `this.hostData.firedRun = fresh` and let the delayed callback only apply it (remove items, set `this.run`, broadcast `gs`/phase, send `tp`). Also skip the save in main.js:214 when `game.run.phase === 'fired'`, or have `hostSave` write the pending fresh run in that phase. Without this, cancelling the fired timer lets a host who quits during the fired screen keep the failed run.
5. **Optional, since the same save-scum already exists by quitting during the `moon` phase:** when leaving during `takeoff`, apply the day advance (`daysLeft`/`day`/fines) to the run before `leaveGame`'s `hostSave`, instead of silently skipping it. | Keep track of pending host timers, and when leaving, run the ones that commit state instead of dropping them.

1. In host.js, add a helper:
   `later(fn, ms, flush = false) { const rec = { fn, flush }; rec.id = setTimeout(() => { this._timers.delete(rec); if (!this.destroyed) fn(); }, ms); (this._timers ||= new Set()).add(rec); }`

2. Use the helper for every host timer:
   - landing (host.js:252): `later(..., 9000)` (cancel on leave)
   - takeoff (host.js:278): `later(..., 7000)` (cancel on leave; this is the same as quitting mid-day, which already works that way)
   - fired reset (host.js:358): `later(..., 8000, true)` (flush)
   - sell commit (host.js:763): `later(..., 2600, true)` (flush)

3. Add `hostFlushTimers() { for (const r of [...(this._timers || [])]) { clearTimeout(r.id); this._timers.delete(r); if (r.flush) { try { r.fn(); } catch (e) { console.warn(e); } } } }`.

4. In main.js leaveGame, call `this.game.hostFlushTimers()` before `hostSave()`, while the items and session are still alive. 

## [critical] (economy) Host screen pre-selects slot 1 with data:null, so START silently overwrites the existing save
- src/ui/ui.js:141
- fix: Initialise from storage, e.g. `let chosen = { slot: 1, data: listRuns()[0].data };`, or ask for confirmation before starting a new run on an occupied slot.
- verified fix: The reviewer's fix works. A sturdier version reads the save at START time, so storage is the only source of truth and a stale or unclicked `chosen.data` cannot reach hostInit. In src/ui/ui.js, add loadRun to the import on line 6: `import { listRuns, loadRun, deleteRun, saveSettings, saveProfile, DEFAULT_KEYS } from '../core/save.js';`. Then on line 163 pass `slot: chosen.slot, runData: loadRun(chosen.slot)` instead of `runData: chosen.data`. `chosen` can stay `{ slot: 1 }`, and the `data` bookkeeping in the click and delete handlers is no longer needed. Optional safety net: if the player means to start fresh on an occupied slot, require an explicit 'New run' action plus confirm() rather than doing it implicitly. | In src/ui/ui.js, read the save from storage when START is pressed instead of trusting the cached `chosen.data`. Import loadRun from '../core/save.js' (line 6), then change line 163 to pass `runData: loadRun(chosen.slot)`, or equivalently `hostInit(loadRun(slot) ?? runData, slot)`. This way the highlighted slot is always the one that loads, the initial `data: null` state goes away, and the data can never be stale. It also covers the dev path main.js:113 (?autohost uses slot 3 with no runData), which currently wipes slot 3 on every autohost. For the UI side on its own, seeding line 141 with `let chosen = { slot: 1, data: listRuns()[0].data };` is also enough. The Delete handler at ui.js:153 already sets chosen.data = null, and with the START-time loadRun a deleted slot correctly gives null (a new run). Optionally, add a confirm() when the user deliberately starts a New run on an occupied slot.

## [critical] (ui) Host screen pre-selects slot 1 without its save data, so START silently overwrites the saved run
- src/ui/ui.js:141
- fix: Initialise from storage: `const runs = listRuns(); let chosen = { slot: 1, data: runs[0].data };`. Alternatively, resolve data at START with `listRuns().find(r => r.slot === chosen.slot)?.data` and use it unless the user explicitly picked 'New run'. Show a confirm before hosting a new run over a non-empty slot.
- verified fix: In src/ui/ui.js, import `loadRun` from '../core/save.js' next to listRuns and deleteRun. At START (ui.js:163), read the slot fresh instead of trusting the cached `chosen.data`: `slot: chosen.slot, runData: loadRun(chosen.slot)`. This covers the default pre-selection and any stale cached data. Delete already removes the localStorage key, so loadRun returns null after a delete and a new run starts as intended. Optionally, make the pre-selection match the saves: `const runs = listRuns(); let chosen = { slot: 1, data: runs[0].data };`. Optionally, add a separate 'New run' action that asks for confirmation before overwriting a non-empty slot. | The reviewer's fix works. The simplest robust version reads the slot again from storage at START, so the save shown is always the one used, including after a Delete. Import loadRun in ui.js and change line 163 to pass `runData: loadRun(chosen.slot)` (or `listRuns().find(r => r.slot === chosen.slot)?.data`). An equivalent option is to initialise `let chosen = { slot: 1, data: listRuns()[0].data };` at ui.js:141. As an optional extra, add an explicit 'New run' action that deletes the slot, or asks for confirmation, before starting fresh on a slot that already has a save. Right now the only way to start a new run on a used slot is the Delete button.

## [critical] (world) Generator room (reactor, guaranteed fuse box, scrap, vent) attaches to the vault and is sealed in 63-89% of moons
- src/world/facility.js:148
- fix: In attach(), also reject outside cells that belong to a special room. In the perimeter loop use: `const ro = roomOf[idx(ox, oz)]; if (ro >= 0 && ['entrance','vault','generator'].includes(rooms[ro].type)) continue;` in place of the `roomOf === 0` test. Optionally leave vault/generator rooms out of scrapSpots used for keys. Every peer runs the same code, so determinism holds.
- verified fix: In D:\KefalCompany\src\world\facility.js, attach() (line 148), replace:
`if (!c || roomOf[idx(ox, oz)] === 0) continue;`
with:
`if (!c) continue; { const ro = roomOf[idx(ox, oz)]; if (ro >= 0 && ['entrance', 'vault', 'generator'].includes(rooms[ro].type)) continue; }`

This stops the generator from attaching to a vault and stops vault 2 from chaining onto vault 1. Every vault door then opens onto an ordinary cell, so the keypad side chosen at lines 803-807 is always the reachable side, and the generator's door becomes a normal door, blast door or arch. Every peer runs the same code, so determinism holds. I checked this over 2000 seeds per moon: 0% of generators end up behind a vault or unreachable.

Correct the write-up as well:
- Lower the severity to high.
- Drop the fuse-box and power soft-lock consequence (host.js:114-117 and director.js:518-522 show a sealed reactor cannot cause a lasting blackout).
- Say "hidden, and only reachable by a through-wall keypad prompt" instead of "can never reach".

Optional, a separate issue: the actions.js:192 LOS tolerance of 0.6 m lets any keypad or fuse box within about 0.45 m of the far side of a 0.3 m wall be used through that wall. | Downgrade to medium. Consequence: the reactor room sits behind one or two vault cracks, and the inner vault door's keypad is placed on the unseen generator side. It can only be used through the wall, because actions.js:192 allows 0.6 m of line-of-sight slack.

Fix in facility.js attach(), line 148: replace `if (!c || roomOf[idx(ox, oz)] === 0) continue;` with `const ro = roomOf[idx(ox, oz)]; if (!c || (ro >= 0 && (rooms[ro].type === 'entrance' || rooms[ro].type === 'vault' || rooms[ro].type === 'generator'))) continue;`. This also stops vault 2 from chaining onto vault 1. If no candidate is left, the existing fallback at line 165 (random 'small' room) still works.

Optional hardening:
- At line 677, leave generator rooms out of room vents, as is already done for vaults.
- Separately, tighten the line-of-sight slack in findInteraction (actions.js:192), e.g. `hit.distance > along - 0.15`, so interactables can't be used through 0.3 m walls. Do this after the layout fix, or those seeds become truly sealed.

Every peer runs the same code, so determinism holds.

## [major] (economy) Ringing the sell bell twice within 2.6 s sells the same scrap twice
- src/game/host.js:762
- fix: Mark the items (`it.selling = true`) and skip marked items in the inZone filter, or keep a `hostData.selling` flag that makes hostSell return while a sale is pending. In the timer, credit only items that still exist.
- verified fix: Your fix is correct. Here is a fuller version so it also covers the XP, coin and bounty payouts and items that disappear before the timer fires.

In host.js `hostSell`:
- Skip already-claimed items in the filter: `if (it.state !== 'world' || it.selling || ...) continue;`
- After the empty-zone check, mark each one: `for (const it of inZone) it.selling = true;`
- In the `setTimeout`, credit only items that still exist and are still marked:
  - `const live = inZone.filter((it) => this.items.get(it.id) === it);`
  - Rebuild `total` and `list` from `live`.
  - If `!live.length`, return early.
  - Then broadcast `'rm'` for each item in `live` and pay credits, sold, XP, coin and bounty from the new `total`.
- Also guard the timer body with `if (this.run.phase !== 'company') { for (const it of inZone) it.selling = false; return; }`, so a sale that resolves after take-off does not pay.

A simpler option is a global `this._selling` flag: set it when the sale is scheduled and clear it in the timer, and have `hostSell` return early with the "sale in progress" message while it is set. The per-item mark is better because a second ring then sells only scrap added after the first ring. | In hostSell, skip items already being sold: add `|| it.selling` to the filter at host.js:753, then set `it.selling = true` for each item in inZone. Better still, also keep a `this.hostData.sellPending` flag: return early when it is set, set it before the setTimeout, and clear it in the timer. Inside the timer, recompute the payout from the items that still exist instead of using the precomputed `total`. Something like: `const live = inZone.filter(it => this.items.get(it.id)); const total = live.reduce((s, it) => s + Math.round(it.value * rate), 0);` then send 'rm' only for `live` and credit that total. This also covers items lost in the window, for example consumed or removed by a phase change. Optionally, make the 'pick' and 'grab' handlers (host.js:109 and :131) refuse items with `it.selling`, so nobody can grab scrap that is about to disappear.

## [major] (economy) No all-dead handling at the company: dying there soft-locks the run
- src/game/host.js:578
- fix: Run the all-dead check in the company phase too (call hostBeginTakeoff('alldead') after 4 s). Alternatively, respawn dead players in the ship while at the company, and/or add a collider or kill-plane teleport for the sea.
- verified fix: Respawn at the company instead of forcing a takeoff, and stop the sea from killing players outright.
1. **Respawn while at the company.** Do this client-side, since each peer owns its own player. In game.js update, after the dead check (around line 577), add: `if (p.dead && this.run?.phase === 'company' && (this.deadT || 0) > 4) this.respawn();`. respawn() already sends pst {dead:false} and calls spawnInShip(). If you'd rather keep it host-driven, add the all-dead timer to the company branch at host.js:579 and broadcast a 'respawn' event instead of calling hostBeginTakeoff.
2. **Make the sea a teleport, not a death.** In localplayer.js, before line 222, add: `if (this.game.run?.phase === 'company' && this.pos.y < (this.game.world.company?.groundY ?? -1.25) - 5) { this.game.spawnInShip(); this.vel.set(0,0,0); this.minVelY = 0; }`. You can instead teleport the player to fishPos, optionally with a small splash or damage. Also consider adding invisible rail colliders along the dock sides and the open south edge from x=-1.5 to 15 at z of about 49.
3. **If you keep the auto-takeoff approach**, add it in the company branch, but on deadline day do not let hostFinishTakeoff call hostEvaluateQuota when the takeoff reason is 'alldead'. Otherwise the crew gets fired with scrap still unsold. | In `hostUpdate` (host.js), move the all-dead check out of the `phase === 'moon'` block so the company phase runs it too. For example, replace the company branch with this:

```js
} else if (run.phase === 'company') {
  const ps = this.aiPlayers();
  if (ps.length && ps.every((p) => p.dead)) {
    hd.allDeadT += dt;
    if (hd.allDeadT > 4) {
      hd.allDeadT = 0;
      this.net.broadcast('sys', { text: 'All crew lost. The autopilot is returning to orbit.', kind: 'bad' });
      this.hostBeginTakeoff('alldead');
    }
  } else hd.allDeadT = 0;
  this.creatures.hostUpdate(dt);
}
```

Better still, put this check in a shared helper that both branches call. `hostFinishTakeoff` already sets `allDead=false` for the company, so ship scrap is kept.

Optional: add a sea kill-plane so falling off the pier does not mean falling for many seconds to y=-380. In localplayer.js next to line 222, add `if (this.game.world.company && this.pos.y < this.game.world.company.groundY - 4) this.game.damageLocal(999, 'drown', null)` and add a 'drown' entry to deathText. Alternatively, teleport the player back onto the dock with a little damage.

## [major] (economy) Scrap already stored in the ship is 'collected' again every day (XP, bounty and summary farming)
- src/game/host.js:249
- fix: When landing, seed the set with what is already aboard: `this.hostData.collected = new Set([...this.items.inShipItems()].map(it => it.id));`, and do the same in hostInit.
- verified fix: In host.js hostLever (orbit branch), replace line 250 `this.hostData.collected = new Set();` with `this.hostData.collected = new Set([...this.items.all()].map((it) => it.id));`. In orbit, every existing item is already the crew's stash (in the ship or in a crew member's hands), so only scrap spawned on the new moon can count as collected. No change is needed in hostInit, because the lever always replaces the set before the 'moon'-phase collect loop can run. | Keep the 'already collected' state on the item itself, not in a set that is reset every day.
- In host.js:565, replace `hd.collected.has(it.id)` with `it.secured`.
- In host.js:566, replace `hd.collected.add(it.id)` with `it.secured = true`.
- Delete host.js:250 (`this.hostData.collected = new Set();`) and the `collected: new Set()` field in hostInit (host.js:38), since neither is needed any more.

With the flag, an item is credited once in its whole lifetime, whether it sits in the ship, is held through landing, or leaves the ship and comes back. Items removed by sale or by the all-dead wipe are gone anyway.

For items restored from a save (host.js:43-45), set the flag after spawning. For example, keep the id and do `this.items.get(id).secured = true`. This stops a reloaded stash from inflating the day's 'Collected' total.

If the flag should survive a host save/reload, carry it through serialize and shipItems (host.js:372) as `sec: 1`. That is optional, because restored items are treated as secured anyway.

## [major] (economy) Quitting mid-day saves the day's scrap without spending the day (save-scum exploit)
- src/main.js:214
- fix: Only persist the run in leaveGame when phase is 'orbit' (or 'company', where no day is spent). Otherwise keep the last orbit save, which is what Lethal Company does. Alternatively, when loading a save made mid-moon, apply the day end (decrement daysLeft and drop that day's scrap).
- verified fix: (a) In src/main.js leaveGame, save only in safe phases:
`if (this.game.isHost && ['orbit','company'].includes(this.game.run?.phase)) this.game.hostSave();`
In any other phase (landing, moon, takeoff, fired), keep the last save.

(b) So orbit purchases survive under (a), add a save in host.js hostLever just before `this.hostSetPhase('landing')` at line 251. At that point the run is still in its orbit state. Calling hostSave() after the terminal buy/upgrade in terminal.js (lines 287/301/315) also works.

(c) Close the firing loophole:
- In hostFinishTakeoff, change line 337 to `if (this.run.phase !== 'fired') this.hostSave();`
- In the fired branch of hostEvaluateQuota, save the new run right away instead of after the 8 s timeout. Build `fresh` synchronously, then call `saveRun(this.saveSlot, { ...freshWithoutPhase, shipItems: [], crew })`, or keep a `this.pendingRun` that hostSave writes out while phase is 'fired'.
- Then quitting during the fired screen can't restore the run from before the firing.

An alternative to (a)+(b): store `midDay: true` in the save when the phase is moon, landing or takeoff. hostInit would then apply the day end on load: decrement daysLeft and day, drop the saved scrap that was not already in the ship at the orbit save, and apply the 'all dead' penalty. That is harder to get right, so (a)+(b)+(c) is the recommended fix. | Save a start-of-day snapshot. When quitting mid-day, persist that snapshot with the day counted as spent, not the live state.

1) In `hostLever` (src/game/host.js, orbit branch), just before `hostSetPhase('landing')`, save first (this also keeps orbit purchases and route changes), then keep a copy:
   this.hostSave();
   this.hostData.dayStartSave = loadRun(this.saveSlot);   // import loadRun from '../core/save.js'

2) Add a method to hostMethods:
   hostSaveOnQuit() {
     const ph = this.run.phase;
     if (ph === 'orbit' || ph === 'company') return this.hostSave();
     if (ph === 'fired') return; // the save from host.js:337 stays; the next evaluation fires them again
     const snap = this.hostData?.dayStartSave;
     if (!snap) return;          // new run, nothing saved yet: leave the slot as is
     const moon = MOONS[snap.moon];
     if (!moon?.company) {       // quitting on a moon counts as a spent day with nothing brought back
       snap.daysLeft = Math.max(0, snap.daysLeft - 1);
       snap.day += 1;
       if (snap.daysLeft <= 0) snap.moon = 'hq';
     }
     saveRun(this.saveSlot, snap); // ship i

## [major] (economy) Deadline auto-route to HQ never happens (stale `run` reference after hostSetPhase)
- src/game/host.js:333
- fix: Use `this.run.moon = 'hq'` (re-read this.run after any broadcast), or put `moon: 'hq'` in the hostSetPhase('orbit', {...}) extra when daysLeft <= 0. More generally, make applyRunState mutate this.run in place with Object.assign(this.run, d) so host-side references do not go stale.
- verified fix: In hostFinishTakeoff, add the HQ route to the orbit phase change itself so it lands on whichever object this.run is and reaches clients together with the phase:

  const deadline = !moon.company && run.daysLeft <= 0;
  this.hostSetPhase('orbit', { daysLeft: run.daysLeft, day: run.day, credits: run.credits, forecast: run.forecast, powerOn: true, ...(deadline ? { moon: 'hq' } : {}) });
  if (moon.company && this.run.daysLeft <= 0) this.hostEvaluateQuota();
  else if (deadline) {
    this.net.broadcast('sys', { text: 'Deadline reached. Route to 0-Kefal HQ and sell!', kind: 'bad' });
    this.env.setSpace(this.planetColorFor('hq'));
  }
  this.hostSave();

The alternative is to replace `run.moon = 'hq'` with `this.run.moon = 'hq'` (plus the env.setSpace call). To stop this kind of stale reference in the future, applyRunState (game.js:203) could mutate in place with `if (this.run) Object.assign(this.run, d); else this.run = { ...d };`. That keeps any `const run = this.run` alias in host.js and terminal.js valid across a self-broadcast. The HUD holds the same reference through setRun, so it would stay in sync too. | The claim's fix works, but this version is better. In host.js:329, put the moon in the phase payload so it is applied atomically and every peer's onPhase('orbit') recolors space for HQ:

```js
const deadline = !moon.company && run.daysLeft <= 0;
this.hostSetPhase('orbit', { daysLeft: run.daysLeft, day: run.day, credits: run.credits, forecast: run.forecast, powerOn: true, ...(deadline ? { moon: 'hq' } : {}) });
```

Then drop the `run.moon = 'hq'; this.broadcastRun(['moon'])` lines and keep only the 'sys' message in that branch. With the minimal `this.run.moon = 'hq'` fix, the space backdrop keeps the old moon's color, because only onPhase and the terminal route call env.setSpace.

If applyRunState is changed to mutate in place with Object.assign(this.run, d), capture `const prevCredits = this.run?.credits` before the assign. Otherwise the credits pulse check at game.js:204 compares the object with itself and never fires.

## [major] (economy) A host left behind at takeoff is counted twice in deaths and fined twice
- src/game/host.js:297
- fix: Build `deaths` before hurting the left-behind players, i.e. move line 297 above line 289, or dedupe by id when building the list.
- verified fix: In hostFinishTakeoff (src/game/host.js), build the `deaths` list before the loop that hurts left-behind players, so the host's same-call death push can't be counted a second time:

```js
const aboard = players.filter((p) => !p.dead && p.inShip);
const leftBehind = players.filter((p) => !p.dead && !p.inShip);
const deaths = hd.dayStats.deaths.concat(leftBehind.map((p) => ({ id: p.id, name: this.playerName(p.id), cause: 'left' })));
for (const p of leftBehind) this.hostHurtPlayer(p.id, 999, 'left');
```

Then delete the old `const deaths = ...` line (host.js:298). Deduplicating by id also works, but taking the snapshot first is simpler. | In hostFinishTakeoff (src/game/host.js), move the deaths line above the hurt loop: `const deaths = hd.dayStats.deaths.concat(leftBehind.map((p) => ({ id: p.id, name: this.playerName(p.id), cause: 'left' })));` should come before `for (const p of leftBehind) this.hostHurtPlayer(p.id, 999, 'left');`. concat returns a new array, so the synchronous self-hurt that pushes onto hd.dayStats.deaths inside hostOnPlayerDied no longer adds a second entry. If you want a safeguard as well, build the list with a filter that skips any leftBehind id already in hd.dayStats.deaths with cause 'left'.

## [major] (economy) Scrap carried by remote crew left behind at takeoff is not lost: it drops into the void and is teleported into the ship
- src/game/host.js:289
- fix: In hostFinishTakeoff, broadcast `{e:'rm'}` for every non-soulbound item whose `holder` is a left-behind player before hurting them. Also make the 'drop' handler ignore requests while phase is 'orbit' or 'fired', and make the void rescue remove the item instead of teleporting it when no map is loaded.
- verified fix: 1) Main fix, in hostFinishTakeoff before the hurt loop at host.js:290. Remove everything held by left-behind players so that die() finds empty slots:
```js
const lb = new Set(leftBehind.map((p) => p.id));
for (const it of [...this.items.all()]) if (it.holder && lb.has(it.holder) && !it.soulbound) this.net.broadcast('it', { e: 'rm', id: it.id });
for (const p of leftBehind) this.hostHurtPlayer(p.id, 999, 'left');
```
Why this works:
- The 'rm' is broadcast on the same ordered channel before the sendTo 'hurt'. On the client, the 'rm' handler (items.js:178-184) calls onItemDropped, which clears the slot (actions.js:366-369). die() then sends no 'drop' requests.
- For the host, the calls are synchronous, so the same thing happens.
- This matches what already happens to the host's own left-behind items: they are dropped outside the ship and then removed by unloadMap.

2) Optional safety net. Do NOT reject drops by phase, because client drops are optimistic. Instead, in the 'drop' handler (host.js:122), turn a drop that lands outside the ship while in orbit into a removal:
```js
if ((this.run.phase === 'orbit' || this.run.phase === 'fired') && d.p && !insideShip(new THREE.Vector3().fromArray(d.p), 0.5)) { this.net.broadcast('it', { e: 'rm', id: it.id }); return; }
```
'rm' still clears the requester's slot through onItemDropped, so nothing gets stuck.

3) Leave the void rescue at items.js:272 alone. If it is changed at all, only the host may remove the item, by broadcasting {e:'rm'} when `!this.game.world.moonId`. A local-only dispose would desync the peers. | 1) In `hostFinishTakeoff`, before the `hurt` loop at `host.js:290`, remove everything the left-behind players are carrying:
`const lbIds = new Set(leftBehind.map(p => p.id)); for (const it of [...this.items.all()]) if (it.holder && lbIds.has(it.holder) && !it.soulbound) this.net.broadcast('it', { e: 'rm', id: it.id });`
Include every non-soulbound item, tools too, because the host's own left-behind path already loses all of them through `unloadMap`. The client's later `'drop'` requests then find no item and are ignored, and `rm` clears the client's slots through `onItemDropped(...,true)`.
2) Do NOT block `'drop'` in orbit. Block only drops that would land outside the ship when no map is loaded. In the `'drop'` handler, add:
`if (!this.world.moonId && !insideShip(new THREE.Vector3().fromArray(d.p), 1)) { this.net.broadcast('it', { e: 'rm', id: it.id }); return; }`
3) Optionally, make the void rescue in `ent

## [major] (economy) Held items are not saved: tools and scrap in players' hands disappear on reload
- src/game/host.js:371
- fix: Also serialise non-soulbound items with `state === 'held'` whose holder is aboard or alive, saving them at a ship storage position (e.g. the terminal-buy drop spot), so hostInit restores them in the ship.
- verified fix: In hostSave (src/game/host.js:371), append held items after the inShipItems list, but only for holders who are in the ship:

```js
const aboard = (id) => id === this.selfId ? (!this.player.dead && this.player.inShip) : (() => { const r = this.remotes.get(id); return r && !r.dead && insideShip(r.pos); })();
const ser = (it, p, q) => ({ ty: it.type, v: it.value, bv: it.baseValue, p, q, b: it.battery ?? undefined, c: it.charges ?? undefined, am: it.ammo ?? undefined });
const shipItems = this.items.inShipItems().filter((it) => !it.soulbound && it.type !== 'body').map((it) => ser(it, it.obj.position.toArray(), it.obj.quaternion.toArray()));
let k = 0;
for (const it of this.items.all()) {
  if (it.state !== 'held' || !it.holder || it.soulbound || it.type === 'body') continue;
  if (this.run.phase !== 'orbit' && !aboard(it.holder)) continue; // do not save items carried outside the ship
  shipItems.push(ser(it, [4.5 + (k % 3) * 0.5, 1.2 + Math.floor(k / 3) * 0.3, -2 + (k % 2) * 0.6], [0, 0, 0, 1])); k++;
}
```

(The spot is the terminal-buy storage area; a held item's obj.position is hand-local and must not be used.) In orbit, every living player has respawned in the ship, so all held items count. In moon, company, landing or takeoff, the in-ship check (the same `aboard` rule hostFinishTakeoff uses at host.js:288/296) stops the "quit while holding scrap in the facility" exploit. | In hostSave (host.js:371), also serialise held items, but only those whose holder is alive and physically inside the ship. Put them at the store's drop spot:

```js
hostSave() {
  const ser = (it, p) => ({ ty: it.type, v: it.value, bv: it.baseValue, p, q: it.obj.quaternion.toArray(), b: it.battery ?? undefined, c: it.charges ?? undefined, am: it.ammo ?? undefined });
  const shipItems = this.items.inShipItems().filter((it) => !it.soulbound && it.type !== 'body').map((it) => ser(it, it.obj.position.toArray()));
  const safe = new Set(this.aiPlayers().filter((p) => !p.dead && p.inShip).map((p) => p.id));
  let k = 0;
  for (const it of this.items.all()) {
    if (it.state !== 'held' || it.soulbound || it.type === 'body' || !safe.has(it.holder)) continue;
    shipItems.push(ser(it, [4.5 + (k % 3) * 0.5, 1.2 + Math.floor(k / 3) * 0.3, -2 + (k % 2) * 0.6])); // terminal-buy storage spot
    k++;
  }
  ...
}
```

Checking `inShip` (not just "alive") keeps out items held by players left behind at takeoff, whose death is only applied asynchronously, and items held on the moon when the host qui

## [major] (economy) Completed but unclaimed bounties become invisible after the daily rollover and block the 3 bounty slots forever
**FIXED (round 3)** - hook for profile.js: done-but-unclaimed bounties are auto-claimed at the daily rollover; only active bounties count toward the 3-slot cap.
- src/game/profile.js:96
- fix: In openBounties, also render p.bounties entries whose id is not on the current board, each with a Claim button, or auto-claim done bounties during rollover.
- verified fix: The claim's fix is correct. Either option works, or both together:
(a) Auto-claim at rollover in src/game/profile.js refreshBounties. Replace line 96 with:
`const carry = (p.bounties || []).filter((b) => b.done && !b.claimed); p.bounties = []; for (const b of carry) { b.claimed = true; this.addXp(b.xp, 'Bounty complete'); this.addCoins(b.coin, 'Bounty'); }`
Unaccepted and unfinished bounties are still dropped, as before.
(b) Or, in src/ui/ui.js openBounties, after the `for (const b of board)` loop, render the leftovers:
`for (const x of p.bounties.filter((x) => !board.some((b) => b.id === x.id))) list.appendChild(el('div', { class: 'bounty-row' }, el('span', {}, bountyText(x) + ' (expired board)'), el('span', { class: 'b-rew' }, `+${x.xp} XP · ◈${x.coin}`), x.done ? this.button(t('Claim'), () => { prog.claim(x); render(); }, 'small primary') : el('span', { class: 'dim' }, `${x.progress}/${x.n}`)));`
Option (b) also frees saves that are already stuck without waiting for the next rollover. Option (a) frees them at the next daily refresh. | Either option below works. Option A is the smallest and keeps the reward visible.

(A) UI fix, in src/ui/ui.js openBounties after the `for (const b of board)` loop (around line 593):
```js
for (const x of p.bounties.filter((x) => x.done && !board.some((b) => b.id === x.id))) {
  list.appendChild(el('div', { class: 'bounty-row' },
    el('span', {}, bountyText(x) + ' (expired board)'),
    el('span', { class: 'b-rew' }, `+${x.xp} XP · ◈${x.coin}`),
    this.button(t('Claim'), () => { prog.claim(x); render(); }, 'small primary')));
}
```
This is safe with `claim()` as written, which filters by object identity.

(B) Auto-claim at rollover, in src/game/profile.js refreshBounties:
```js
const carry = (p.bounties || []).filter((b) => b.done && !b.claimed);
p.bounties = [];
for (const b of carry) { this.addXp(b.xp, 'Bounty complete'); this.addCoins(b.coin, 'Bounty'); }
```
Either way, finished bounties should never occupy one of the 3 slots once they are off the board. Optionally, `accept()` could count only `!b.done` entries toward the limit, so a finished but unclaimed bounty never blocks accepting a new one.

## [major] (economy) quotaMul compounds every cycle (exponential quotas with the Hardcore mod)
- src/game/host.js:348
- fix: Scale only the increase: `const next = nextQuota(prev, run.quotaIndex); run.quota = Math.round(prev + (next - prev) * (this.config.quotaMul || 1));`.
- verified fix: Keep the reviewer's fix and scale only the growth. At src/game/host.js:347-348, replace the quota line with:

const prev = run.quota;
const next = nextQuota(prev, run.quotaIndex);
run.quota = Math.round(prev + (next - prev) * (this.config.quotaMul || 1));

## [major] (economy) Being fired is only saved 8 s later: closing the tab during the FIRED screen keeps the failed run
- src/game/host.js:336
- fix: In the fired branch, persist the outcome immediately (saveRun(slot, fresh run) or deleteRun(slot)) before the cinematic, and skip the hostSave at host.js:336 when `this.run.phase === 'fired'`.
- verified fix: In hostEvaluateQuota's fail branch, create the fresh run up front and persist it before the cinematic. Then make hostSave itself refuse to write while the phase is 'fired'. That one guard also covers main.js:214 leaveGame and any other caller, so no per-call-site check is needed.

```js
// host.js hostEvaluateQuota, else-branch
} else {
  const fresh = newRun();
  rollForecast(fresh);
  const { phase: _p, ...freshSave } = fresh;
  saveRun(this.saveSlot, { ...freshSave, shipItems: [], crew: [this.profile.name, ...[...this.remotes.values()].map((r) => r.name)] });
  this.net.broadcast('fired', { quotaIndex: run.quotaIndex, sold: run.sold, quota: run.quota, days: run.day });
  this.hostSetPhase('fired');
  const game = this;
  setTimeout(() => {
    if (game.run !== run) return;              // game destroyed / already reset
    for (const it of [...game.items.all()]) game.net.broadcast('it', { e: 'rm', id: it.id });
    game.run = fresh;
    game.net.broadcast('gs', fresh);
    game.hostSetPhase('orbit');
    game.hostSave();
    for (const r of [...game.remotes.keys(), game.selfId]) game.net.sendTo(r, 'tp', { p: game.ship.spawns[0].toArray(), yaw: Math.PI / 2 });
  }, 8000);
}

// host.js hostSave
hostSave() {
  if (this.run?.phase === 'fired') return;     // outcome already persisted in hostEvaluateQuota
  ...
}
```

Game.destroy() should also mark the game destroyed (for example `this.run = null` or `this._destroyed = true`) so the 8 s timer (and the 7 s/9 s phase timers) exit early instead of acting on a torn-down game. You could instead call deleteRun(slot) in the fail branch, but that erases the slot the player picked, so saving the fresh run matches the in-game behaviour better.

## [major] (items) Scrap held by left-behind remote players falls into the void and reappears inside the ship
- src/entities/items.js:272
- fix: 1) In hostFinishTakeoff, before hurting left-behind players, broadcast {e:'rm'} for every non-soulbound item whose holder is a left-behind player. 2) In the 'drop' handler, if run.phase is 'orbit' or 'fired' and the drop point is not insideShip, broadcast 'rm' instead of 'drop'. 3) Change the out-of-world failsafe so the host removes the item (broadcast rm) or restores its last resting position, never (0,1,0) inside the ship.
- verified fix: 1) Main fix. In `hostFinishTakeoff`, right after computing `leftBehind` and before the `hostHurtPlayer` loop (host.js:290), add:
`for (const it of [...this.items.all()]) if (it.holder && leftBehind.some(p => p.id === it.holder)) this.net.broadcast('it', { e: 'rm', id: it.id });`
Soulbound gear is already consumed by `die()`. The 'rm' reaches B before 'hurt' because the channel is ordered, and `onItemDropped(..., true)` clears B's slots, so `die()` has nothing left to drop. If a drop request arrives late anyway, it is ignored because `items.get` returns undefined.

2) Hardening in the 'drop' handler (host.js:122):
`if (['takeoff','orbit','fired'].includes(this.run.phase) && !insideShip(new THREE.Vector3().fromArray(d.p), 0.5)) { this.net.broadcast('it', { e: 'rm', id: it.id }); return; }`
Include 'takeoff', because the outdoor and company colliders are already unloaded then (game.js:232 `unloadColliders`).

3) Out-of-world failsafe (items.js:272). Do not teleport to (0,1,0). The branch runs on whichever peer simulates the item, which includes a client that owns it through the grab beam. So:
- If `net.selfId === net.hostId`, broadcast `{e:'rm'}` when `run.phase` is not 'moon' or 'company'. During 'moon' or 'company', move the item back to its last resting position, recorded while the body is asleep and y > -400.
- If a client owns the item, send `request('release', { id, p: lastRest, ... })` and let the host decide.

"Restore last resting position" on its own is not enough in orbit, because that position is in the void and the item would fall and reset forever. Removing the item there is the only correct outcome.

Without fix 3, any scrap that falls out of the world during a normal moon day also shows up in the ship, which is free transport. | Keep the reviewer's fix 1 as the main change. Adjust fixes 2 and 3:

(1) In `hostFinishTakeoff` (host.js:289-290), before the `hostHurtPlayer` loop, run:
`for (const it of [...this.items.all()]) if (it.holder && leftBehind.some(p => p.id === it.holder) && !it.soulbound) this.net.broadcast('it', { e: 'rm', id: it.id });`
Because the 'rm' is sent before 'hurt', B's `onItemDropped` clears its slots, and `die()` then finds nothing to drop. Any late 'drop' request fails at `items.get()`. This also covers `hostOnPlayerLeave` dropping at a stale facility position if B disconnects before sending its drops.

(2) Optional defense for the 'drop' handler: when `run.phase` is 'orbit' or 'fired', validate the position with `insideSh

## [major] (items) Items of a disconnecting player are dropped at the ship center, not where the player was
- src/game/game.js:129
- fix: Call hostOnPlayerLeave(id) before disposing and deleting the remote, or pass the captured position: `const pos = r?.pos.clone(); ...; if (this.isHost) this.hostOnPlayerLeave(id, pos)`. Also hoist the lookup out of the per-item loop.
- verified fix: Fix in two files.

**`game.js` `peerLeave` handler:** capture the position before disposing the remote.
```js
const r = this.remotes.get(id);
const pos = r ? r.pos.clone() : null;
if (r) { ...; r.dispose(); this.remotes.delete(id); }
this.voice.removePeer(id);
if (this.isHost) this.hostOnPlayerLeave(id, pos);
```

**`host.js` `hostOnPlayerLeave(id, pos)`:**
```js
const base = pos || this.remotes.get(id)?.pos || null;
for (const it of this.items.all()) {
  if (it.holder === id) {
    const p = base || it.obj.getWorldPosition(new THREE.Vector3());
    this.net.broadcast('it', { e: 'drop', id: it.id, p: [p.x, p.y + 1, p.z], q: [0, 0, 0, 1] });
  }
  ...
}
```
If you want the smallest change, moving the `hostOnPlayerLeave(id)` call above `r.dispose()` / `remotes.delete(id)` also fixes it. In that case, still replace the hard-coded `(0,1,0)` fallback so it does not land inside the ship.

## [major] (items) Ringing the sell bell twice within 2.6 s pays for the same scrap twice
- src/game/host.js:763
- fix: Mark items when they are queued (for example `it.selling = true`, skipped in the inZone filter) or hold a hostData.sellPending lock until the timeout fires. Another option is to broadcast 'rm' immediately and pay after the animation delay.
- verified fix: The proposed fix is right. Below is a complete version in host.js hostSell and the 'pick' handler:

1) In the inZone filter at host.js:753, also skip items already queued: `if (it.state !== 'world' || it.selling || !isSellable(it.def) || it.soulbound || it.type === 'body') continue;`
2) Right after inZone is built and is not empty, mark the items: `for (const it of inZone) it.selling = true;`. A second ring then finds nothing new and gets the "Place scrap on the counter first" message.
3) In the 'pick' handler (host.js:106-109), reject queued items with `|| it.selling`. Otherwise a player can lift scrap during the tentacle animation, is paid for it anyway, and then has it deleted from their hands.
4) In the setTimeout, pay only for items that still exist, so a run reset or wipe during the 2.6 s window cannot pay for items that are already gone:
`const sold = inZone.filter((it) => this.items.get(it.id) === it); if (!sold.length) return;`
Then compute `total` and `list` from `sold` inside the callback, `rm` each item in `sold`, and add to credits and sold as before.

A simpler alternative is a `this.hostData.sellPending` boolean: set it when a sale is queued, return early at the top of hostSell while it is true, and clear it at the end of the timeout. That fixes the double payment on its own, but it leaves the pick-during-animation behavior unchanged. | In host.js hostSell, add `|| it.selling` to the skip condition at line 753. After building inZone, set `for (const it of inZone) it.selling = true;`. Optionally, have the H('pick') handler refuse items with `it.selling` so nobody can grab them during the tentacle animation. Also recompute the payout inside the timeout from items that still exist: `const live = inZone.filter(it => this.items.get(it.id));` and sum only those. That covers items destroyed or removed in the 2.6 s window (fragile break, run reset). Also bail out if `this.run.phase !== 'company'` when the timer fires. A simpler alternative is a `this.hostData.sellPending` boolean: set it before the setTimeout, clear it inside the callback, and return early from hostSell while it is set. It also blocks the double payment, but it ignores legitimate second rings for newly placed scrap until the timer clears.

## [major] (items) Ship charger does nothing for the host's own items; the host's copy of client batteries goes stale
- src/game/host.js:219
- fix: In the charge handler, apply the state on the host directly before or while broadcasting, for example `this.items.onState({ id: it.id, b: full }); this.net.send('itst', { id: it.id, b: full });`. Alternatively, have host-originated 'itst' carry a flag that bypasses the self filter.
- verified fix: In host.js, change the 'charge' handler at lines 215-221 to:
```js
const mul = clamp(Number(d.mul) || 1, 1, 4); // mul comes from the client, so clamp it
const full = it.def.battery ? Math.round(it.def.battery * mul) : null;
if (full) { this.items.onState({ id: it.id, b: full }); this.net.broadcast('itst', { id: it.id, b: full }, false); }
```
The `onState` call applies the new battery value on the host, which the game.js:142 self-filter otherwise drops. Passing `false` to `broadcast` sends it only to the other peers. That is the same as `net.send`, but it keeps the host-to-all intent visible.

The clamp is an optional extra hardening step, separate from this bug: without it, a client can send any `mul` and get an unlimited battery. The upper bound of 4 is a placeholder; set it to the highest `batteryMul` that upgrades can legitimately reach. | In src/game/host.js, change the charge handler (lines 215-221) to:
```js
H('charge', (d, from) => {
  const it = this.items.get(d.id);
  if (!it || it.holder !== from) return;
  const full = it.def.battery ? Math.round(it.def.battery * clamp(d.mul || 1, 1, 3)) : null;
  if (full) { this.items.onState({ id: it.id, b: full }); this.net.send('itst', { id: it.id, b: full }); }
  this.net.broadcast('fx', { ... });
});
```
The key change is the explicit `this.items.onState(...)` on the host, because game.js:142 drops self-originated `itst`. The clamp on `mul` is optional hardening.

## [major] (items) Stale prevVel causes false impacts on every throw and every grab-beam release (fragile value loss, noise)
- src/entities/items.js:264
- fix: Whenever a body is created or authority changes, set prevVel to the body's starting velocity: in makeBody after setLinvel `this.prevVel.set(...linvel or 0)`, and in the 'own' case `it.prevVel.fromArray(d.lv || [0,0,0])` (also in applyAuthority). Add a short grace period (`impactCooldown = 0.2`). Beam-driven acceleration on the owning client should also be excluded, for example by comparing against the velocity after the beam's setLinvel or by using contact force events.
- verified fix: Re-seed prevVel from the body's real velocity every time a body is created, changes owner, or has its velocity set by force.

1) In makeBody (items.js:76), after the setLinvel line: `const v0 = body.linvel(); this.prevVel.set(v0.x, v0.y, v0.z);`. This covers both the thrown case and the zero-velocity case.
2) In the 'own' case (items.js:197-205), inside `if (it.body)` after the setLinvel/setAngvel block: `const v0 = it.body.linvel(); it.prevVel.set(v0.x, v0.y, v0.z);`. Do not use d.lv||0. The grab event has no lv, and a body just switched from kinematic can keep a non-zero velocity. This covers the host taking the item back on release and a client taking ownership on grab.
3) In the 'tp' case (items.js:211), after setLinvel(0): `it.prevVel.set(0,0,0);`.

A grace cooldown is optional and is not needed. If low-frame-rate beam steering should be kept from counting as a hit, handle that separately. For example, in GrabBeam.physicsStep, while the item is being beamed, set it.prevVel from the velocity just written. | Give `WorldItem` a helper that copies the body's real velocity into `prevVel`, and call it wherever a body's velocity or authority is set by code rather than by the simulation. Add to `WorldItem`:
`syncVel() { if (!this.body) return; const v = this.body.linvel(); this.prevVel.set(v.x, v.y, v.z); }`

Call it in these places:
1. items.js:76, at the end of `makeBody` after the optional `setLinvel`: `this.syncVel();`
2. items.js:204, in the 'own' case, after the lv/av block and still inside `if (it.body)`: `it.syncVel();`. This also covers the no-lv 'own' sent at host.js:95.
3. items.js:211, in the 'tp' case, after `setLinvel(0)`: `it.prevVel.set(0, 0, 0);`
4. items.js:272, in the fall-out reset, after `setLinvel(0)`: `it.prevVel.set(0, 0, 0);`

Optionally, also set `impactCooldown = Math.max(impactCooldown, 0.1)` in `makeBody` and in the 'own' case, so the first physics step after a drop can settle. Do not rely on a long grace period instead of the resync.

Separate, lower-priority hardening: the owner's `update` also sees beam-driven velocity changes. `GrabBeam.physicsStep` can change linvel by up to k*18 per substep, and at low FPS with several substeps per frame that can pass 4.2. Fix this by skipping impact detection while `game.grab?.item === it`, or by calling `it.syncVel()` at the end of `GrabBeam.physicsStep`.

## [major] (items) A quick LMB tap on a big item leaves it owned by the client forever, so no one else can grab it
- src/game/actions.js:42
- fix: Track the pending request (`this.requested = it.id` in start) and always send 'release' in stop() for an item that was requested. The reliable ordered channel means the host processes grab before release, so `owner === from` passes. Another option: in onEvent 'own', if o === selfId and game.grab.item !== it, immediately request release.
- verified fix: The proposed fix works. The simplest version drops the client-side guard in GrabBeam.stop (actions.js:42) and always sends 'release' for the item that was grabbed:

  stop(throwIt = false) { const it = this.item; this.item = null; ...; if (!it || !it.body) return; const t = ...; this.game.net.request('release', { id: it.id, p: [...], q: [...], lv: [...], av: [...] }); }

The host's 'release' handler (host.js:136-138) already rejects the request unless it.owner === from, and grab/release share one ordered, reliable channel. So a release sent while the grab is still pending is applied right after the grab, and a release for a rejected grab is ignored. Note that while the request is pending, the client's body is still kinematic, so p/q are its interpolated proxy pose and lv/av are about 0. That is acceptable: the item stays put rather than being thrown.

For extra robustness, also add a check in ItemManager.onEvent 'own' (items.js:193-206): if d.o === net.selfId && this.game.grab?.item !== it, call this.game.net.request('release', { id: it.id }) with its current pose. Ownership that was granted but is no longer wanted then always gets handed back, whatever the timing. | The fix idea is right but needs three changes.

1) Send the release even when ownership hasn't arrived yet. When the item isn't owned yet, send only the id. The client's body is then a kinematic proxy with an old pose, and sending that p/q/lv/av would snap the host's item back to it. The host's 'own' handler already skips pose and velocity when they're missing (`if (d.p)`, `if (d.lv)`).

In stop():
```js
if (it.owner === this.game.selfId) this.game.net.request('release', { id: it.id, p:[...], q:[...], lv:[...], av:[...] });
else if (this.pendingId === it.id) this.game.net.request('release', { id: it.id });
this.pendingId = null;
```
Also set `this.pendingId = it.id` in start(). Move the `!it.body` early return below this send, or keep it: a missing body means the item was picked up, and 'held' already clears owner.

2) Add a safety net in ItemManager.onEvent case 'own', after `it.owner = d.o || null`:
```js
if (d.o && d.o === this.game.net.selfId && this.game.grab?.item !== it) this.game.net.request('release', { id: it.id });
```
This covers any other path where the beam is gone before ownership arrives.

3) In GrabBeam.start(it), stop the previous grab first: `if (this.item && this.item !== it) this.stop(); this.hum?.stop(0.1);`. Today, pressing E on a big item starts a grab through findInter

## [major] (items) Starting the grab beam while it is already active leaks a looping hum and never releases the first item
- src/game/actions.js:28
- fix: Start with `if (this.item === it) return; if (this.item) this.stop();`. Consider making E toggle the beam (stop if already grabbing), because an E-started grab never gets a mouseUp to end it.
- verified fix: In GrabBeam.start (src/game/actions.js:28) add these lines first:

```js
if (this.item === it) return;
if (this.item) this.stop();
```

Optionally, make E toggle the beam in findInteraction's big-item action (actions.js:170):

```js
action: () => this.grab.item ? this.grab.stop() : this.grab.start(it)
```

With the toggle, E can both start and end a grab. | In GrabBeam.start (src/game/actions.js:28), add a guard as the first line: `if (this.item === it) return; if (this.item) this.stop();`. The rest of start stays as it is.

stop() already stops the hum and sends 'release' when this client owns the old item, so the old item is let go properly before the new grab.

Also make E a toggle in findInteraction (actions.js:170): `action: () => (this.grab.item === it ? this.grab.stop() : this.grab.start(it))`. This gives an E-started grab a way to release without LMB.

With the same-item early return, an LMB click on an item you already grabbed does nothing, and the following mouseUp still stops the beam. Clicking to let go of an E-grab therefore still works.

Defensive extra: before assigning the new hum, run `this.hum?.stop(0.1)`, so no future caller can leak it.

## [major] (items) Medkit exploit: drop it mid-heal and you are still healed but the medkit is never consumed
- src/game/actions.js:506
- fix: In useHeldHold, cancel when `this.healing.it !== this.player.heldItem()` or the item no longer exists. Clear this.healing in dropItem, switchSlot and onItemDropped. Ideally apply the heal only after the host confirms the consume (the 'rm' event).
- verified fix: Put the check inside useHeldHold (src/game/actions.js:506) so every path is covered, not only dropItem and switchSlot:

```js
if (this.healing) {
  const it = this.healing.it;
  if (this.player.heldItem() !== it || !this.items.get(it.id) || it.holder !== this.selfId) { this.healing = null; return; }
  this.healing.t += dt;
  if (this.healing.t > 1.5) { /* existing heal + consume */ }
}
```

Also:
- Set `this.healing = null` in dropItem and switchSlot so the heal sound or UI state resets immediately.
- Optionally make the heal authoritative: have the host's 'consume' handler (or a dedicated 'heal' request) reply to the requester, and apply the HP only when the item's 'rm' event arrives. This stops a delayed or rejected consume from still granting HP. | The proposed fix is correct in principle; the key part is a held-item check.
- In useHeldHold, at the start of the `if (this.healing)` block, add: `if (this.player.heldItem() !== this.healing.it || !this.items.get(this.healing.it.id)) { this.healing = null; return; }`. This works because heldItem() returns the same WorldItem object from items.get.
- Also set `this.healing = null` in dropItem, and in switchSlot next to the existing `swingCharge = 0`.
- Changing onItemDropped is optional; the per-frame check above already covers remote removal.
- Optional hardening: apply the HP only when the item's 'rm' event arrives from the host, so a rejected consume never heals.

## [major] (items) Scrap already in the ship is counted as 'collected' again every day (repeat XP, bounty progress, inflated day summary)
- src/game/host.js:250
- fix: At landing, seed the set with every item that already exists: `this.hostData.collected = new Set([...this.items.all()].map((i) => i.id));`. All moon loot is spawned after landing, so anything existing earlier is old. Alternatively, keep a permanent `it.collected` flag on the host.
- verified fix: host.js:250 — replace `this.hostData.collected = new Set();` with `this.hostData.collected = new Set([...this.items.all()].map((i) => i.id));`. This marks everything that exists before the moon is populated as already secured. Moon loot, monster drops and purchases spawn later, so they are still counted once. The host.js:38 initialisation can stay, because the reset at landing replaces it. Alternative that also survives host migration: set a permanent `it.secured = true` flag on the item in the collect tick (host.js:566) and skip items that have it, in place of the per-day Set. | The reviewer's fix works as written. In host.js:250, replace `this.hostData.collected = new Set();` with `this.hostData.collected = new Set([...this.items.all()].map((i) => i.id));`. items.all() returns a Map values iterator, so the spread is needed. This also covers scrap a crew member was still holding at the previous takeoff; it has already been counted in shipValue and should not pay out again. The alternative is a permanent host-side flag: set `it.collected = true` in the collect loop and skip items that already have it. That also survives a mid-day host re-init, but the Set seeding is the smaller change.

## [major] (items) hostSave only persists world items in the ship; everything players are holding is lost on reload
- src/game/host.js:372
- fix: In hostSave, also serialize items held by players (holder not starting with 'c:', not soulbound, not body), giving them a position on the ship floor or storage spot. Alternatively, keep a per-player inventory list in the save and re-grant it.
- verified fix: In hostSave (src/game/host.js:371), add held items after the world items. Only include items whose holder is a living player standing inside the ship. Spread them over the ship spawn points so they don't stack:

```js
hostSave() {
  const ser = (it, p, q) => ({ ty: it.type, v: it.value, bv: it.baseValue, p, q, b: it.battery ?? undefined, c: it.charges ?? undefined, am: it.ammo ?? undefined });
  const keep = (it) => !it.soulbound && it.type !== 'body';
  const shipItems = this.items.inShipItems().filter(keep).map((it) => ser(it, it.obj.position.toArray(), it.obj.quaternion.toArray()));
  const aboard = new Set(this.aiPlayers().filter((p) => !p.dead && (p.inShip || this.run.phase === 'orbit')).map((p) => p.id));
  let k = 0;
  for (const it of this.items.all()) {
    if (it.state !== 'held' || !keep(it) || !it.holder || it.holder.startsWith?.('c:') || !aboard.has(it.holder)) continue;
    const s = this.ship.spawns[k % this.ship.spawns.length];
    shipItems.push(ser(it, [s.x + ((k >> 3) % 3) * 0.35 - 0.35, 0.4 + Math.floor(k / 24) * 0.4, s.z], [0, 0, 0, 1]));
    k++;
  }
  const { phase, ...rest } = this.run;
  saveRun(this.saveSlot, { ...rest, shipItems, crew: [this.profile.name, ...[...this.remotes.values()].map((r) => r.name)] });
}
```

This saves carried tools and scrap as items on the ship floor, so the reload in orbit gets them back. Items carried outside the ship during a mid-moon quit are still dropped, which matches how takeoff handles them. An alternative is to add a per-player `inv: {name: [items]}` map to the save and re-grant it with hostSpawn(..., {holder}) when a player with that name joins. That keeps items in hand but is more complex because peer ids change between sessions. | In host.js `hostSave()`, build the list from all items instead of `inShipItems()`. Keep an item if either:
- it is in the world inside the ship (`it.state === 'world' && insideShip(it.obj.position)`), or
- it is held by a player (`it.state === 'held' && it.holder && !String(it.holder).startsWith('c:')`).

In both cases also require `!it.soulbound && it.type !== 'body'`.

Do not use `it.obj.position` for held items: it is hand-local or stale. Give each one a fixed spot inside the ship bounds and spread them out, for example:
`p = [SHIP.x0 + 1.5 + (i % 6) * 0.5, 0.6, SHIP.z0 + 1.0 + Math.floor(i / 6) * 0.5]`
with `q = [0, 0, 0, 1]`, clamped to stay within SHIP.x1 and SHIP.z1.

Keep battery, charges and ammo (`b`, `c`, `am`) as they are today. Soulbound gear needs not

## [major] (items) Quitting mid-day saves the ship's scrap without using up the day (save-scum exploit)
- src/main.js:214
- fix: Persist only at orbit. Cache the last orbit-time save payload in hostData and write that on leaveGame when run.phase is not orbit. Alternatively, when quitting mid-day, apply the day penalty (daysLeft-1, fines) and drop items that were not in the ship at the last orbit save.
- verified fix: 1) main.js:214: save only in orbit.
`if (this.game.isHost && this.game.run?.phase === 'orbit') this.game.hostSave();`
Quitting mid-day then resumes from the last save on disk, which is the one written at host.js:337 when the ship returned to orbit, or the one written at 772 after a company sale. Company visits do not use a day, so resuming from the sale save is harmless.

2) host.js hostLever, orbit branch: call `this.hostSave();` right before `this.hostSetPhase('landing')`. Without this, terminal purchases and upgrades made in orbit are never written, because leaveGame was their only save. With it, a mid-day quit rolls back cleanly to the moment of landing.

3) Related hole in the fired path. On deadline day at the company, hostFinishTakeoff calls hostEvaluateQuota before its hostSave at line 337. In the fired branch, the run is not replaced until an 8-second setTimeout (358-367), so line 337 writes the old run (sold < quota, daysLeft 0, moon hq). Quitting or closing the tab during those 8 seconds resumes that run, and the crew can sell leftover ship scrap and be evaluated again instead of being fired.
Fix: in the fired branch, build the fresh run immediately and write it with `saveRun(this.saveSlot, { ...freshWithoutPhase, shipItems: [] })`. Also skip the line-337 hostSave when `this.run.phase === 'fired'`. | Put the guard inside hostSave so every path to a save is covered: leaveGame, hostSell and the mod's hostSave call.
1) Move the item serialisation into a helper: `serializeShipItems() { return this.items.inShipItems().filter(it => !it.soulbound && it.type !== 'body').map(it => ({ ty: it.type, v: it.value, bv: it.baseValue, p: it.obj.position.toArray(), q: it.obj.quaternion.toArray(), b: it.battery ?? undefined, c: it.charges ?? undefined, am: it.ammo ?? undefined })); }`
2) In hostLever, when leaving orbit (host.js:245-251, before hostSetPhase('landing')), take a snapshot: `this.hostData.orbitShipItems = this.serializeShipItems();`
3) In hostSave: `const midDay = ['landing','moon','takeoff'].includes(this.run.phase); const shipItems = midDay && this.hostData.orbitShipItems ? this.hostData.orbitShipItems : this.serializeShipItems();`. The 'company' and 'orbit' phases keep saving the current state, so saves after a sale are still correct.
4) (Optional) To stop players from re-rolling a bad moon for free, also write the lost day in a mid-day save: `const saved = { ...rest }; if (midDay && !MOONS[this.run.moon]?.company) { saved.daysLeft = Math.max(0, sa

## [major] (creatures) Leech latch is only released on melee kill, victim death or leech self-release; other exits leave the victim blinded and their melee locked onto the leech permanently
- src/entities/creatures.js:396
- fix: Release the latch centrally on the host. In kill() and in damage() before setState('stunned'), add: if (c.type==='leech' && c.state==='latched' && c.extra){ this.game.hostLatch(c, c.extra, false); c.extra = 0; }. Clear c.target at the same time, and reset c.pos.y to layout.y for a stunned leech that was on the ceiling or falling. On the client, reset player.latched = null and engine.fx.blind = 0 in onPhase('takeoff'/'orbit') or unloadMap. As a safety net, in resolveMelee, if p.latched refers to a creature view that no longer exists or is dead, clear p.latched and fall through to the normal hit.
- verified fix: Host side (creatures.js). Add a helper to CreatureManager: `releaseLatch(c){ if (c.type==='leech' && c.extra){ this.game.hostLatch(c, c.extra, false); c.extra = 0; } }`.
- Call it as the first line of kill(), before c.setState('dead'). This also makes host.js:200 redundant, though keeping it is harmless because c.extra is now 0.
- In damage(), call it just before the stun setState: `if (opts.stun){ if (c.type==='leech' && c.state==='latched') { this.releaseLatch(c); c.pos.y = this.game.world.facility?.layout.y ?? c.pos.y; c.data.climb = 10; } c.stunT = ...; ... }`.
- In clearAll(), call it for every host creature before `this.host.clear()`, so the latch-off broadcast goes out while peers are still connected.

Client side (game.js unloadMap, which runs on every peer at orbit): add `this.player.latched = null; for (const r of this.remotes.values()) r.latched = false;`. This also fixes the host's aiPlayers flag. Blindness decays by itself (actions.js:132).

Safety net (actions.js resolveMelee): replace the latched branch with `const lv = p.latched && this.creatures.views.get(p.latched); if (p.latched && (!lv || lv.state === 'dead')) p.latched = null; if (p.latched) { ...existing hit... return; }`, so a stale latch falls through to the normal hit instead of hitting a missing or dead creature.

Optionally, in the leech 'fall' branch (creatures.js:795), skip or release a leech whose c.extra is still set to someone else. This avoids the double-latch overwrite if a stale extra ever survives. | Host side, in src/entities/creatures.js:
- Add a helper:
  releaseLatch(c){ if (c.type==='leech' && c.extra){ this.game.hostLatch(c, c.extra, false); c.extra = 0; } }
- In damage(), call it inside the stun branch before setState, only when c.state==='latched':
  if (opts.stun) { c.stunT = ...; if (c.type==='leech' && c.state==='latched') this.releaseLatch(c); if (c.type!=='mine' && c.type!=='turret') c.setState('stunned'); }
- In kill(), call this.releaseLatch(c) as the first line, before c.dead=true and setState('dead'). The state check is not needed here, since any leech that still has an extra should be released on death.
- Once c.extra is 0, host.js:200 becomes a no-op.

Client side:
- In CreatureManager.onEvent: for case 'die', and for case 'rm' before deleting the view, add:
  if (this.game.player.latched === d.id) this.game.player.latched = null;
- In clearAll(), set this.game.player.latched = null.
- For remotes, clear r.latched in the same places:
  for (const r of 

## [major] (creatures) Turret shoots any player within 20 m and in line of sight in any direction once alerted, and gets stuck in 'off' after being disabled
- src/entities/creatures.js:932
- fix: When disabledT reaches 0, set the state back to 'idle': if (c.state==='off') c.setState('idle'). Keep a cone or FOV check in every state (for example ±60° from headYaw for alert/fire), keep tracking the same target (c.target) instead of taking the first in the list, and only roll a hit when |angleDiff(c.extra, want)| < ~0.2 so the head has to turn before it can hurt someone.
- verified fix: In BEHAVIORS.turret (src/entities/creatures.js:922-953):
1) Right after the disabledT early-return, add `if (c.state === 'off') { c.setState('idle'); c.data.shot = 0; }`. The state is then idle before the scan loop, so the idle cone check applies on the first tick after re-enable.
2) Replace the target scan. First keep the current target if it is still valid: find p with p.id===c.target, distance ≤ 20, |angleDiff(headYaw, a)| ≤ 1.0 (about ±57°) and LOS. Only if that fails, scan the others with the narrow 0.5 rad cone check in every state, not just idle. Store c.target = seen.id, and set c.target = null in the !seen branch.
3) In the fire branch, compute `const aimed = Math.abs(want - c.extra) < 0.2;`. `want` and `c.extra` are both relative to c.yaw. Keep the fire sound and the cooldown, but only call M.attack when `aimed && Math.random() < 0.75`. | (b) Directly after line 923, add `if (c.state === 'off') c.setState('idle');`. It must come after the disabledT branch returns, so it runs on the first tick where disabledT <= 0. It must also come before the perception loop, so the idle cone check applies again and the turret re-arms through idle, then alert (0.9 s), then fire, the same way mine.js does at line 956. A setState('idle') placed inside the disabledT branch before the return would be overwritten by the setState('off') on the same tick.

(a) Make the target sticky. Try `players.find(p => p.id === c.target)` first. Accept it if it is within 20 m, has line of sight, and |angleDiff(headYaw, a)| < ~1.2. Otherwise fall back to scanning with the cone check applied in every state: the ±0.5 rad cone while idle, and a wider cone of about ±1.2 rad around headYaw in alert and fire. Set c.target = seen.id. When the target changes while in 'fire', drop back to 'alert' so the 0.9 s delay applies again. In the fire branch, roll the 75% hit only when Math.abs(angleDiff(c.extra, want)) < 0.2. Otherwise still play turret_fire as a miss, or hold fire, while the head turns at 3 rad/s. Clear c.target when returning to idle, including the !seen path at line 937.

## [major] (creatures) When the host is left behind at takeoff, the host's death is counted twice, doubling the fine
- src/game/host.js:297
- fix: Build `deaths` before hurting the left-behind players, or dedupe by id: const deaths = [...hd.dayStats.deaths]; for (const p of leftBehind) if (!deaths.some(d=>d.id===p.id)) deaths.push({...}); and only after that call hostHurtPlayer. Alternatively, skip the push in hostOnPlayerDied when cause==='left'.
- verified fix: In host.js hostFinishTakeoff, build the deaths list before hurting anyone. `concat` returns a new array, so the synchronous push that the host's own death triggers can no longer change it:
  const leftBehind = players.filter((p) => !p.dead && !p.inShip);
  const deaths = hd.dayStats.deaths.concat(leftBehind.map((p) => ({ id: p.id, name: this.playerName(p.id), cause: 'left' })));
  for (const p of leftBehind) this.hostHurtPlayer(p.id, 999, 'left');
Then delete the old line 298. Another fix that also works: in hostOnPlayerDied, skip the dayStats push when d.cause === 'left'. That also keeps late 'left' messages from remote players out of the old stats. Deduplicating by id works too. | Simplest fix in src/game/host.js hostFinishTakeoff: move line 290 (`for (const p of leftBehind) this.hostHurtPlayer(p.id, 999, 'left');`) to after line 298 (`const deaths = hd.dayStats.deaths.concat(...)`). concat returns a new array, so the host's synchronous push into hd.dayStats.deaths during its own death no longer changes `deaths`. To also guard against other same-tick paths, dedupe by id: `const deaths = [...hd.dayStats.deaths]; for (const p of leftBehind) if (!deaths.some(d => d.id === p.id)) deaths.push({ id: p.id, name: this.playerName(p.id), cause: 'left' });`

## [major] (creatures) 'Scrap secured' XP, collect-bounty progress and the day's 'collected' total are re-awarded every day for scrap already sitting in the ship
- src/game/host.js:249
- fix: Mark items as secured for good, for example it.secured = true on the host the first time they are counted, and skip items with that flag. Or seed the set at landing: hd.collected = new Set(this.items.inShipItems().map(it => it.id)) (and also include items held by players who are in the ship). Reset only dayStats per day.
- verified fix: Use a permanent flag on the host item instead of relying only on the per-day set. In host.js hostUpdate (~line 565), skip already-secured items and mark each item the first time it is counted:
  if (it.secured || hd.collected.has(it.id) || !isSellable(it.def) || it.soulbound || it.type === 'body') continue;
  it.secured = true; hd.collected.add(it.id); hd.dayStats.collected += it.value; ...
Never clear `secured`. This also stops the cross-day exploit where a player carries banked scrap out of the ship and back in. Also mark scrap restored from a save as already secured. In hostInit (host.js:43-45), capture the generated id and then set the flag:
  const id = this.items.hostSpawnId?.() || ('i' + ...); this.items.onEvent({ e: 'sp', id, ... }); const r = this.items.get(id); if (r) r.secured = true;
Without this, restored ship scrap is added to dayStats.collected again on the first landing after a reload.
The alternative of seeding `hd.collected` at the lever pull is weaker. It misses scrap a player holds through orbit and drops in the ship after landing. It also does not survive the carry-out-and-back pattern across days unless the seed includes held items.
Keep resetting only dayStats per day. The per-day `collected` set can stay or be removed, because the flag already covers it. | Use a persistent per-item flag on the host rather than the per-day set. In host.js:564-568 change the check to `if (it.secured || !isSellable(it.def) || it.soulbound || it.type === 'body') continue; it.secured = true; hd.dayStats.collected += it.value; if (it.lastHolder) ...broadcast xp...`. Keep resetting dayStats per day, and drop hd.collected or leave it unused. Also mark restored save items as already secured so they don't inflate day 1's 'collected'. In hostInit (host.js:43-45), after `this.items.onEvent({e:'sp', ...})`, set `const it = this.items.get(id); if (it) it.secured = true;`, capturing the generated id in a local first. The flag lives only on the host's item object. That is enough, because only the host runs this loop and ship items keep the same object across days, since unloadMap does not dispose them.

## [major] (creatures) Yoinker freezes permanently when the nearest loose scrap is unreachable (vault or locked room): follow() treats 'no path' as 'arrived'
- src/entities/creatures.js:495
- fix: Have goTo return whether a path exists. In the yoinker, if it doesn't, add the item id to c.data.skip (a Set) and wander instead. Pass the skip set into hostFindLooseScrap and skip those items. More generally, make follow() return a distinct 'no path' result (for example null) instead of true, so callers can pick a fallback instead of treating it as arrival.
- verified fix: 1. **Fix only the yoinker; leave follow()'s return value alone.** In creatures.js:679, use:
   `if (item) { M.goTo(c, item.obj.position.x, item.obj.position.z); if (!c.path) { (c.data.skip ||= new Map()).set(item.id, c.t + 20); M.wander(c, 12); } else c.data.want = item.id; c.setState('walk'); }`
   Store the skip on an absolute clock such as a performance.now()-based deadline or a game time, not c.t, because c.t resets on every setState. Give each entry a 20-30 s expiry so vault loot becomes a target again once the vault is opened.
2. **Make the scrap search respect the skip list.** Change hostFindLooseScrap (host.js:670) to take c and skip items whose c.data.skip entry has not expired yet: `const sk = c.data.skip?.get(it.id); if (sk && sk > now) continue;`.
3. **Unblock doors when they are unlocked.** Fix game.js:353 so an unlocked door clears its nav block. Check `door.kind === 'door'` without requiring `door.locked`, or capture wasLocked before line 351 overwrites door.locked, for example:
   `if (door.kind === 'blast' || door.kind === 'vault' || door.kind === 'door') { if (door.open || (door.kind === 'door' && !door.locked)) nav.blockedEdges.delete(door.info.key); else if (door.kind !== 'door' || door.locked) nav.blockedEdges.add(door.info.key); }`
   Without this, keyed doors stay blocked for the rest of the day and the skip list will never find those items reachable.
4. **Optional:** have goTo return `!!c.path` so callers can branch on it. Do not change follow() to return null unless every `if (M.follow(...)) setState('idle')` caller (lines 578, 620, 630, 747, 818, 834, 864, 893) is updated too. Otherwise wandering creatures whose random target is in a sealed component get stuck in 'walk' permanently. | Keep follow()'s current semantics, where a null path returns true (callers rely on it to leave 'walk'), and fix this in goTo and the yoinker instead:
1) creatures.js:471 goTo: return whether a path exists. After setting c.path, `return !!c.path;` (for the outdoor branch, return true).
2) creatures.js:677-680 yoinker idle branch:
   const skip = c.data.skip || (c.data.skip = new Map()); // itemId -> expiry time
   const item = g.hostFindLooseScrap(c.pos, 22, c, skip);
   if (item && M.goTo(c, item.obj.position.x, item.obj.position.z)) { c.data.want = item.id; c.setState('walk'); }
   else { if (item) skip.set(item.id, g.time + 20); c.data.want = null; M.wander(c, 12); c.setState('walk'); }
3) host.js:670 hostFindLooseScrap(pos, r, c, skip): in the loo

## [major] (ui) Any peer can inject HTML/script into other players' HUD and summary screens (XSS over P2P)
- src/ui/hud.js:91
- fix: Coerce in onState: `if (d.am !== undefined) it.ammo = Number(d.am) | 0; if (d.c !== undefined) it.charges = Number(d.c) | 0; if (d.b !== undefined) it.battery = +d.b || 0; it.on = !!d.on`. In hud.setInventory/showDaySummary/showFired/showSale, wrap every interpolated value with Number() or escapeHtml(). Drop 'summary'/'fired'/'sell'/'phase'/'gs' messages whose `from !== net.hostId`.
- verified fix: 1) items.js onState (lines 222-225). Coerce each field only when it is present:
`if (d.on !== undefined) it.on = !!d.on; if (d.b !== undefined) it.battery = Number(d.b) || 0; if (d.c !== undefined) it.charges = Number(d.c) | 0; if (d.am !== undefined) it.ammo = Number(d.am) | 0;`
Do not reset `on` when the field is missing.

2) Escape or coerce at every sink:
- hud.js:91: use `${Number(it.ammo) || 0}/${Number(d.ammo)}` and `${Number(it.charges) | 0}`.
- ui.js showDaySummary (608-614): wrap d.collected, d.shipValue, d.kills, d.fines, d.sold, d.quota and d.daysLeft with Number(...) || 0. Guard d.deaths with Array.isArray.
- showFired (622): wrap d.sold, d.quota, d.days and d.quotaIndex.
- showSale (628-629): wrap x.v, d.total and d.rate with Number(). Guard d.list with Array.isArray.
Alternatively, build these nodes with el() and text children instead of the html option.

3) Optional extra layer: gate host-only types ('summary', 'fired', 'sell', 'phase', 'gs', 'cev', 'door', 'hurt', 'xp', 'sys', 'tp', 'stun', 'slow', 'hold') with `from === net.hostId` in Session.receive or in the handlers. This only works if hostId cannot be taken over. In session.js:61 and 82, set hostId only while it is null (for example `if (d.host && !this.isHost && !this.hostId) this.hostId = from;`, and accept 'welcome' only when `!this.hostId || from === this.hostId`). Do not host-gate 'itst', because clients send it legitimately. | 1. src/entities/items.js onState: `if (d.on !== undefined) it.on = !!d.on; if (d.b !== undefined) it.battery = +d.b || 0; if (d.c !== undefined) it.charges = Number(d.c) | 0; if (d.am !== undefined) it.ammo = Number(d.am) | 0;` Keep the on-guard so partial updates do not switch flashlights off.
2. Apply the same coercion in the WorldItem constructor (items.js:19-23) for v, bv, b, c and am, e.g. `this.ammo = data.am != null ? Number(data.am) | 0 : (this.def.ammo ?? null)`. This covers 'it' spawns and the welcome item list.
3. Escape at the sinks, which fixes the problem whatever the sender does. In hud.setInventory, use `${Number(it.ammo) | 0}` and `${Number(it.charges) | 0}`. In ui.showDaySummary, showFired and showSale, wrap every numeric field in Number(...) or escapeHtml(...): collected, shipValue, kills, fines, sold, quota, daysLeft, days, quotaIndex, x.v and total. Also guard `d.list` and `d.deaths` with Array.isArray.
4. Optionally, as defense in depth, drop host-only messages (summary, fired, sell, phase, gs, sys, it, cev, door, hurt, xp, tp, stun…)

## [major] (ui) Clicking the game view while chat is open locks the pointer with input disabled (chat soft-lock)
- src/main.js:125
- fix: In the canvas click handler: `if (this.ui.chatOpen) { this.ui.closeChat(); return; }`. In openChat, when already open, just `this.chatIn.focus()` instead of returning. In the main.js Escape branch add `if (this.ui.chatOpen) { this.ui.closeChat(); return; }`. In the chatIn keydown, `if (e.key === 'Tab') e.preventDefault();`.
- verified fix: Fix the state once, where pointer lock changes, instead of patching each lock() caller.

(1) In main.js bindKeys input.onLockChange, add as the first line after `if (!g) return;`:
`if (locked && this.ui.chatOpen) this.ui.closeChat();`
closeChat's own lock() returns early because the pointer is already locked. This covers the canvas click, clickHint, closePanel, and minigame/terminal close.

(2) Optionally, in the canvas click handler, add `if (this.ui.chatOpen) { this.ui.closeChat(); return; }`. closeChat already calls lock() from inside the click gesture.

(3) In the main.js window keydown, after the isTyping() check and before the Escape branch, add:
`if (this.ui.chatOpen) { if (e.code === 'Escape') this.ui.closeChat(); else if (e.code === k.chat || e.code === 'KeyT') { e.preventDefault(); this.ui.chatIn.focus(); } return; }`
This recovers when focus has left the field while the pointer is unlocked. It also stops Tab from opening the tab panel while chat is open.

(4) In the chatIn keydown handler (ui.js:38-42), add `if (e.key === 'Tab') e.preventDefault();` so Tab cannot move focus out of the chat field. | Use the proposed changes. At main.js:125-127:
`this.engine.canvas.addEventListener('click', () => { if (!this.game) return; if (this.ui.chatOpen) { this.ui.closeChat(); return; } if (!this.ui.panelOpen && !this.game.minigame && !this.game.terminal.active) input.lock(); });`

`closeChat()` already calls `input.lock()` inside the click gesture, so nothing more is needed there.

In ui.js `openChat`: `if (this.chatOpen) { this.chatIn.focus(); return; }`

In the chat input's keydown handler: `if (e.key === 'Tab') e.preventDefault();`

Optional hardening that covers any other way focus leaves the chat box:
`this.chatIn.addEventListener('blur', () => { if (this.chatOpen) setTimeout(() => { if (this.chatOpen && document.activeElement !== this.chatIn) this.closeChat(); }, 0); });`

## [major] (ui) Leaving a game re-captures the mouse on the title screen (pending pointer lock is never cancelled)
- src/main.js:211
- fix: Track intent in Input: lock() sets `this.wantLock = true`, and unlock() sets `this.wantLock = false` before exiting. In pointerlockchange, `if (this.locked && !this.wantLock) document.exitPointerLock();`. Also add a silent path: `closeChat(silent)` and `terminal.close(silent)`, or null out app.game before closing UI in leaveGame, so no lock is requested during teardown.
- verified fix: Make lock intent explicit in src/core/input.js.

In lock(), set `this.wantLock = true;` as the first line, before the `if (this.locked) return;` early return. In the promise fallback, retry only if intent still holds: `p.catch(() => { if (this.wantLock) try { this.canvas.requestPointerLock(); } catch {} })`.

Change unlock() to: `unlock() { this.wantLock = false; if (document.pointerLockElement) document.exitPointerLock(); }`

In the pointerlockchange listener, after computing this.locked, add: `if (this.locked && !this.wantLock) { document.exitPointerLock(); return; }`. This drops a late grant that arrives after unlock().

For defence in depth, reorder leaveGame in main.js so that input.unlock() runs at the very end of teardown, after closePanel, closeChat and game.destroy() (all of which may call lock()). It must not run before them. Better still, pass a silent flag so no lock is requested during teardown: closeChat(silent), terminal.close(silent) and closeMinigame(silent), with Game.destroy passing true. | Fix it in two places.

(1) Track lock intent in `src/core/input.js`:
```js
lock() {
  this.wantLock = true;
  if (this.locked) return;
  try {
    const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
    if (p && p.catch) p.catch(() => { if (this.wantLock) try { this.canvas.requestPointerLock(); } catch {} });
  } catch { try { this.canvas.requestPointerLock(); } catch {} }
}
unlock() {
  this.wantLock = false;
  if (document.pointerLockElement) document.exitPointerLock();
}
```
Also add this at the top of the `pointerlockchange` handler:
```js
if (document.pointerLockElement === this.canvas && !this.wantLock) { document.exitPointerLock(); return; }
```
Set `wantLock = true` before the `this.locked` early return. Otherwise a `lock()` call made while an unlock is still in progress leaves the flag stale. The retry inside `.catch` must also check `wantLock`, because that retry can run after `leaveGame` has finished.

(2) Stop teardown from asking for the lock in the first place. In `src/ui/ui.js`, make `closeChat` do nothing when the chat isn't open:
```js
closeChat() { const was = this.chatOpen; ...; if (was && this.app.game && !this.panelOpen) this.app.input.lock(); }
```
In `src/main.js` `leaveGame`, call `this.input.unlock()` at the end, after `game.destroy()`, as it does now. With the `wantLock` guard from (1), that final call also cancels the lock requests made by `terminal.close()` and `closeMinigame()` inside `destroy()`.

Sett

## [major] (ui) After a leech death the spectator view stays ~90% black until the next orbit
- src/game/actions.js:131
- fix: In die(), set `this.engine.fx.blind = 0; this.engine.fx.noise = 0;`, or decay fx.blind at the top of updateSpectator. In App.leaveGame, reset `engine.fx.blind = engine.fx.noise = engine.fx.warp = 0; engine.fadeTarget = 0`.
- verified fix: Move the blind update out of the input-gated, alive-only localActions and run it every frame in Game.update (game.js, e.g. right after line 587). Delete actions.js:130-132.
```js
const fx = this.engine.fx;
if (!p.dead && p.latched) fx.blind = damp(fx.blind, 0.9, 3, dt);
else if (fx.blind > 0) fx.blind = Math.max(0, fx.blind - dt * 2);
```
As a simpler alternative, set `this.engine.fx.blind = 0;` in die() next to `p.latched = null`, and still move the decay above the `if (!input.enabled)` return at actions.js:90.

Also reset the global post-fx when leaving a session. In App.leaveGame (main.js, before creating the MenuScene):
```js
const fx = this.engine.fx;
fx.blind = fx.noise = fx.warp = fx.hurt = fx.flash = 0;
this.engine.fadeTarget = 0;
```
Or do the same in Game.destroy(). | The claim's fix is right. The cleaner version:
1. Move the blind decay out of localActions into Game.update so it runs every frame whether or not the player is alive: `if (p.latched && !p.dead) fx.blind = damp(fx.blind, 0.9, 3, dt); else if (fx.blind > 0) fx.blind = Math.max(0, fx.blind - dt);`. Alternatively, set `this.engine.fx.blind = 0; this.engine.fx.noise = 0;` in die() next to `p.latched = null` (actions.js:853).
2. Also reset `this.engine.fx.blind = this.engine.fx.noise = this.engine.fx.warp = 0` in App.leaveGame (main.js:209) or in Game.destroy (game.js:776). MenuScene never touches engine.fx, so without this the title screen stays darkened indefinitely.

## [major] (ui) Done-but-unclaimed bounties become unclaimable after the daily reset and permanently fill the 3-bounty cap
**FIXED (round 3)** - same fix as the economy entry above (profile.js hook).
- src/ui/ui.js:589
- fix: In openBounties, also render `p.bounties.filter(b => b.done && !board.some(x => x.id === b.id))` in a 'Completed' section with Claim buttons, or auto-claim them in refreshBounties on rollover. Make the cap count only active bounties: `p.bounties.filter(b => !b.done).length >= 3`.
- verified fix: In `src/ui/ui.js` `openBounties`, right after the `for (const b of board)` loop (before `wrap.appendChild(list)`), list finished bounties that are not on today's board and give them Claim buttons:

```js
const stale = p.bounties.filter((a) => a.done && !a.claimed && !board.some((x) => x.id === a.id));
for (const a of stale) list.appendChild(el('div', { class: 'bounty-row' }, el('span', {}, bountyText(a) + ' (expired board)'), el('span', { class: 'b-rew' }, `+${a.xp} XP · ◈${a.coin}`), this.button(t('Claim'), () => { prog.claim(a); render(); }, 'small primary')));
```

This also fixes saves that are already stuck, because `claim()` removes the exact object from `p.bounties` by identity.

Alternative: auto-claim in `refreshBounties` at the day change, iterating over a copy because `claim()` reassigns `p.bounties`:

```js
for (const b of (p.bounties || []).filter((b) => b.done && !b.claimed)) this.claim(b);
p.bounties = [];
```

Do this before building the new board. Saves that are already stuck would then recover at the next day change.

Leave `accept()`'s 3-bounty limit as it is. Once old bounties can be claimed, the limit is no longer a permanent lock. | In ui.js openBounties, after the `for (const b of board)` loop, add a completed section: `for (const b of p.bounties.filter(x => x.done && !board.some(y => y.id === x.id))) list.appendChild(el('div', { class: 'bounty-row' }, el('span', {}, bountyText(b)), el('span', { class: 'b-rew' }, `+${b.xp} XP · ◈${b.coin}`), this.button(t('Claim'), () => { prog.claim(b); render(); }, 'small primary')));`. As a simpler alternative, in profile.js refreshBounties on rollover, replace the filter with `const kept = (p.bounties || []).filter(b => !b.claimed && b.done); p.bounties = kept.slice(); for (const b of kept) this.claim(b);` (auto-claim). Optionally also make accept() count only active ones: `p.bounties.filter(x => !x.done).length >= 3`.

## [major] (ui) Fuse box 'run diagnostics' is an unlimited XP/coin/bounty farm
- src/game/host.js:172
- fix: Grant the reward only when power actually goes from off to on (inside the `if (!this.run.powerOn)` branch), or keep `hostData.fuseRewarded = new Set()` keyed by `from` or box id per day. Validate that posOf(from) is within ~3 m of a fuse interactable.
- verified fix: 1) Client, actions.js:1002: send the box id: `this.net.request('fuse', { id: ip.id });`.
2) Host, host.js:172-181:
```js
H('fuse', (d, from) => {
  if (this.run.phase !== 'moon') return;
  const box = (this.world.facility?.interactables || []).find((ip) => ip.type === 'fuse' && ip.id === d.id);
  if (!box) return;
  const p = posOf(from);
  if (p && p.distanceTo(box.pos) > 3.5) return;
  const key = from + '|' + box.id;
  const done = this.hostData.fuseDone || (this.hostData.fuseDone = new Set());
  let rewarded = false;
  if (!this.run.powerOn) {
    this.hostSetPower(true);
    this.net.broadcast('sys', { text: `${this.playerName(from)} restored the power.`, kind: 'good' });
    rewarded = true;               // restoring power is always worth a reward
  } else {
    let opened = 0;
    for (const door of this.world.facility?.doors || []) if (door.kind === 'blast' && !door.open) { this.hostSetDoor(door.id, true); opened++; }
    if (opened) { this.net.broadcast('sys', { text: 'Security override: all secure doors opened.', kind: 'info' }); rewarded = !done.has(key); }
  }
  if (!rewarded) return;
  done.add(key);
  this.net.broadcast('xp', { to: from, xp: 70, coin: 10, reason: 'Fuse box repaired', bounty: { type: 'minigame', target: 'fuse' } });
});
```
3) Reset the set each day next to the other per-day resets in hostLever (host.js:~250): `this.hostData.fuseDone = new Set();`.
Optionally, on the client, change the label/interactable when power is on and there are no closed blast doors, so the minigame isn't offered for nothing. | 1) Client, actions.js:1002: send the box id: `if (res.success) this.net.request('fuse', { id: ip.id });`

2) Host, host.js H('fuse'):
```js
H('fuse', (d, from) => {
  const box = (this.world.facility?.interactables || []).find((ip) => ip.type === 'fuse' && ip.id === d.id);
  if (!box) return;
  const p = posOf(from);
  if (p && p.distanceTo(box.pos) > 4) return;
  let did = false;
  if (!this.run.powerOn) {
    this.hostSetPower(true); did = true;
    this.net.broadcast('sys', { text: `${this.playerName(from)} restored the power.`, kind: 'good' });
  } else {
    for (const door of this.world.facility?.doors || []) if (door.kind === 'blast' && !door.open) { this.hostSetDoor(door.id, true); did = true; }
    if (did) this.net.broadcast('sys', { text: 'Security override: all secure doors opened.', kind: 'info' });
  }
  const hd = this.hostData; hd.fuseRewarded ||= new Set();
  const key = box.id + ':' + from;
  if (!did || hd.fus

## [major] (ui) Unlimited safe fishing at the HQ dock makes every quota trivial
- src/game/actions.js:262
- fix: Host-side: roll the fish on the host instead of trusting d.type, check that the requester holds a rod near a pond, and cap catches (e.g. hostData.fishCount[from] <= 5 per day, with a cooldown). Alternatively, give HQ-caught fish reduced or zero sell value (valueMul 0.1).
- verified fix: Validate and roll the catch on the host, and limit HQ catches with a cap that re-landing cannot reset. In host.js, replace H('fish') with:

H('fish', (d, from) => {
  const ph = this.run.phase;
  if (ph !== 'moon' && ph !== 'company') return;
  const pos = posOf(from); if (!pos) return;
  const ponds = ph === 'company' ? (this.world.company?.interactables || []) : (this.world.outdoor?.interactables || []);
  const pond = ponds.find((ip) => ip.type === 'pond' && pos.distanceTo(ip.pos) < (ip.r || 5) + 4);
  if (!pond) return;
  const hd = this.hostData;
  if (hd.fishDay !== this.run.day) { hd.fishDay = this.run.day; hd.fishCount = {}; }
  const n = hd.fishCount[from] = (hd.fishCount[from] || 0) + 1;
  const now = performance.now();
  hd.fishLast = hd.fishLast || {};
  if (now - (hd.fishLast[from] || 0) < 4000) return;   // anti-spam: at least 4 s between catches
  hd.fishLast[from] = now;
  // accept the client's species only if it is a fish (UX shows it), but devalue HQ catches and cap them
  if (!ITEMS[d.type] || ITEMS[d.type].kind !== 'fish') return;
  let mul = 1 + this.run.quotaIndex * 0.05;
  if (ph === 'company') { if (n > 6) return; mul *= 0.25; }   // HQ dock: few catches per game day, low value
  this.items.hostSpawn(d.type, pos.clone().add(new THREE.Vector3(0, 1, 0)), { holder: d.slot >= 0 ? from : null, valueMul: mul });
});

Why the cap is keyed to run.day: hostFinishTakeoff never increments day or decrements daysLeft for a company visit, so a counter reset on landing could be bypassed by re-landing repeatedly at HQ for free. Simpler option: make HQ fish unsellable. Spawn them with `soulbound: true` or a `noSell` flag and skip that flag in hostSell. They would still count for bounties, XP and progress.fish. | Put all of this in the host 'fish' handler (host.js:182) and don't rely on the client.

(a) Add a phase and eligibility guard. Accept a catch only if run.phase is 'moon' or 'company'. The requester must hold a rod: this.items.all().some(it => it.holder === from && it.type === 'rod'). The requester must also be near a pond: posOf(from) within ip.r + 4 of some interactable with type 'pond' in world.company or world.outdoor.

(b) Add a rate limit: hostData.fishLastT[from], with a minimum of about 8 s between catches.

(c) Cap catches on something that does not reset on HQ round-trips, because those trips do not consume days. Key the counter on the quota cycle, for example hostData.fishCap = {key: run.quotaIndex + ':' + run.day, n: {}}, and res

## [major] (ui) DECEASED/spectate HUD overlay (and chat log) leaks into the next session after leaving while dead
- src/main.js:209
- fix: In leaveGame, or at the start of startGame, call `this.ui.hud.setDead(false); this.ui.hud.setSpectate(null); this.ui.chatLog.innerHTML = '';` and reset engine.fx and fadeTarget. Alternatively, recreate the HUD per session.
- verified fix: In src/main.js `leaveGame()`, after `this.ui.hud.show(false);` add these lines:
  this.ui.hud.setDead(false);      // also hides .hud-spec (hud.js:125)
  this.ui.hud.setSpectate(null);
  this.ui.chatLog.innerHTML = '';
The engine.fx/fadeTarget reset is optional, because timeouts and decay already clear them. Putting the same three lines at the start of `startGame` is equally valid and also covers any other path that creates a new Game. | In main.js, reset the persistent HUD/chat state in `leaveGame()` right after `this.ui.hud.show(false)`. Alternatively, put it at the top of `startGame()` before `hud.show(true)`, which also covers the failed-start path:

```js
this.ui.hud.setDead(false);        // also hides .hud-spec
this.ui.hud.setSpectate(null);
this.ui.chatLog.innerHTML = '';
this.engine.fx.blind = 0; this.engine.fx.noise = 0; this.engine.fadeTarget = 0; // optional hygiene
```

A cleaner option is to add a `HUD.reset()` method that clears dead/spec/big/scan/floats/`run` and to call it from `leaveGame`.

## [major] (world) LightPool toggles light.visible, so the light count changes and every material recompiles its shaders
- src/render/lightpool.js:75
- fix: Never touch .visible on pooled lights. Leave all 10 point and 4 spot lights visible and set intensity = 0 (optionally distance = small) for unused slots. Only the counts affect the program key; intensity is a uniform.
- verified fix: The reviewer's fix is correct as written. In src/render/lightpool.js, line 75 becomes `if (!c) { l.intensity = 0; continue; }` and line 97 becomes `if (!r) { s.intensity = 0; continue; }`. Delete the `l.visible = true;` (line 77) and `s.visible = true;` (line 98) lines, since pooled lights keep their default visible=true. That keeps the program key fixed at 10 point and 4 spot lights (plus the always-visible hemi and sun), so lights.state.version never changes after the first frame and nothing recompiles. Optional: set `l.distance = 0.01` for unused point slots so their attenuation is zero right away. Do not add any other code path that sets .visible, .layers or castShadow on pooled lights, because those change the counts or the shadow-count hash too. | The reviewer's fix is correct. In src/render/lightpool.js:
- Line 75: change to `if (!c) { l.intensity = 0; continue; }`.
- Line 97: change to `if (!r) { s.intensity = 0; continue; }`.
- Delete the `l.visible = true` at :77 and the `s.visible = true` at :98, or leave them since they do nothing. No pooled light should ever be set invisible.

This keeps the light list fixed at 10 point, 4 spot, 1 directional (the sun at intensity 0), 1 hemisphere and 1 ambient. `lights.state.version` then never changes after the first frame, and each material compiles once.

Optional: call `renderer.compile(scene, camera)` once after the ship, facility or moon is built, so first-seen materials compile during loading instead of in play. This also covers materials created later.

Invariant to keep in future edits: never add or remove lights at runtime, never toggle `.visible` on them, and never turn `castShadow` or `.map` on for pooled lights. The shadow and spot-map counts are also in the cache key.

## [major] (world) Nav lets paths cross a doorway edge anywhere along the 4 m edge, so creatures walk through the wall beside doors and arches
- src/world/nav.js:63
- fix: In canStep, when the step crosses a layout edge that has edgeInfo, get the along-edge sub index (bz % sub for x-crossings, bx % sub for z-crossings) and reject it when `Math.abs((along + 0.5) * res - L.cell / 2) > info.width / 2`. That leaves sub-cells 1-2 for doors and arches and 0-3 for blast doors. gridLOS inherits the fix because it calls canStep.
- verified fix: Keep the reviewer's `canStep` change, placed after the `open` and `blockedEdges` checks. The indices are always ≥0 there because `isWalkable(bx,bz)` has already passed:

```js
const info = L.edgeInfo.get(key);
if (info && info.width < L.cell) {
  const along = (bcx !== acx) ? (bz % s) : (bx % s);
  if (Math.abs((along + 0.5) * this.res - L.cell / 2) > info.width / 2) return false;
}
```

Optional, to stop the residual clipping from string-pulled segments: in `gridLOS`, when a step crosses a layout edge that has `edgeInfo`, also work out where the continuous line from a to b crosses that edge. Reject the line of sight when `|along - cell/2| > width/2 - 0.2`, where 0.2 m is a creature radius margin. This keeps smoothed segments inside the actual opening, not just inside the allowed sub-cells. | Two changes in src/world/nav.js.

(1) In canStep, after the blockedEdges check (line 64), add:
  const info = L.edgeInfo.get(key);
  if (info) {
    const along = (bcx !== acx ? bz : bx) % s;
    if (Math.abs((along + 0.5) * this.res - L.cell / 2) > info.width / 2) return false;
  }
With res 1 this leaves sub-cells 1 and 2 for doors, arches and vaults, and sub-cells 0 to 3 for blast doors. A* keeps working (no path lost in simulation).

(2) The canStep change alone still lets smoothed segments clip the frame by up to 0.31 m, so gridLOS also has to test where the real segment crosses each doorway edge. In gridLOS(a, b), before the loop, set:
  const ax = x0 + 0.5, az = z0 + 0.5, bxw = x1 + 0.5, bzw = z1 + 0.5, S = this.sub, L = this.layout;
Then, after each step's canStep checks and before `x0 = nx; z0 = nz;`, do the following when the layout cell changes:
- If the step changes pcx→qcx: set X = max(pcx, qcx) * S and key = L.edgeKey(min(pcx, qcx), pcz, 0). The crossing position is along = az + (X - ax) / (bxw - ax) * (bzw - az) - pcz * S.
- Otherwise (the step changes cz): use the symmetric form with Z = max(pcz, qcz) * S and key = L.edgeKey(pcx, min(pcz, qcz), 1).
- If L.edgeInfo.get(key) exists and Math.abs(along * this.res - L.cell / 2) > info.width / 2 - 0.15, return false.

With both changes, the simulation gives 0 wall crossings and 0 lost paths out of 1151.

## [major] (world) Unlocking a locked door never removes its edge from nav.blockedEdges, so creatures can never path through it
- src/game/game.js:352
- fix: Always recompute for doors: `if (['blast','vault','door'].includes(door.kind)) { const blocked = door.kind === 'door' ? door.locked : !door.open; if (blocked) nav.blockedEdges.add(door.info.key); else nav.blockedEdges.delete(door.info.key); }`
- verified fix: The reviewer's fix is correct. In game.js:352-355, replace the guarded block with:
```
const nav = this.world.facility.nav;
if (door.kind === 'door') { if (door.locked) nav.blockedEdges.add(door.info.key); else nav.blockedEdges.delete(door.info.key); }
else if (door.kind === 'blast' || door.kind === 'vault') { if (door.open) nav.blockedEdges.delete(door.info.key); else nav.blockedEdges.add(door.info.key); }
```
A smaller alternative: capture `const wasLocked = door.locked;` before line 351 and use `(door.kind === 'door' && (door.locked || wasLocked))` in the guard. On the host, though, door.locked is already false before the broadcast (host.js:157), so wasLocked is also false there and this alternative does NOT fix the host. Use the unconditional recompute above. | In src/game/game.js:353, change `if (door.kind === 'blast' || door.kind === 'vault' || (door.kind === 'door' && door.locked)) {` to `if (door.kind === 'blast' || door.kind === 'vault' || door.kind === 'door') {`. The inner line 354 already deletes the edge when `!door.locked && door.kind === 'door'`. The reviewer's version, with blocked = kind==='door' ? locked : !open, is equivalent and also correct.

## [major] (world) Path lamp post can spawn inside the ship cabin, putting a pole collider in the cockpit next to the terminal and lever
- src/world/terrain.js:393
- fix: Skip posts that fall near the ship or any flatten zone, e.g. `if (avoid(p.x + 3.5, p.z + 1, -10)) continue;` or at minimum `if (Math.hypot(p.x + 3.5, p.z + 1) < 16) continue;`. Alternatively start k beyond the ship flatten radius.
- verified fix: The proposed fix works. Optional refinement: offset the post sideways from the path instead of by the fixed world vector (3.5, 1), and only skip it when it lands near the ship.
```js
const e = plan.entrance, L = Math.hypot(e.x, e.z) || 1;
const nx = -e.z / L, nz = e.x / L;
for (let k = 3; k < terrain.pathPts.length - 2; k += 6) {
  const p = terrain.pathPts[k];
  const x = p.x + nx * 3.5, z = p.z + nz * 3.5;
  if (Math.hypot(x, z) < 11) continue;
  placeProp('lamp_post', x, z, rng.float(0, 6.28));
}
```
11 m clears the hull, the nose, the landing legs and the door steps. The fixed +x offset in the current code can also put the post on the path itself when the path runs along ±x. | Use the proposed avoid-based guard in src/world/terrain.js:391-394. `continue` is fine because nothing uses rng after these posts:
```js
for (let k = 3; k < terrain.pathPts.length - 2; k += 6) {
  const p = terrain.pathPts[k];
  const lx = p.x + 3.5, lz = p.z + 1;
  if (Math.hypot(lx, lz) < 16 || Math.hypot(lx - e.x, lz - e.z) < 12) continue; // keep clear of ship hull/nose and entrance building
  placeProp('lamp_post', lx, lz, rng.float(0, 6.28));
}
```
`avoid(lx, lz, -10)` is equivalent here. Do not rely on starting k later: k = 4 still allows a post inside the nose on hamsi.

## [major] (network) Items the host drops or throws turn invisible on the host (the host-local request runs synchronously)
- src/game/actions.js:392
- fix: Hide the item before sending the request: move `it.obj.visible = false` above `this.net.request('drop', ...)` at actions.js:391, or wrap it in `if (!this.isHost)`.
- verified fix: 

## [major] (network) When a player disconnects, everything they held is dropped at (0,2,0), which is inside the ship
- src/game/game.js:129
- fix: Call hostOnPlayerLeave(id, r?.pos.clone()) before `r.dispose()` / `remotes.delete`, and use the passed position (fall back to the last ps position in net.players, never the ship origin). Offset each dropped item slightly. Broadcast {e:'rm'} for soulbound items instead of dropping them.
- verified fix: In game.js peerLeave, capture the position before disposing:

`const r = this.remotes.get(id); const lastPos = r ? r.pos.clone() : null;` and keep the existing toast, dispose and delete.

Then call `if (this.isHost) this.hostOnPlayerLeave(id, lastPos);`.

In host.js, change the signature to `hostOnPlayerLeave(id, lastPos)`. Compute the drop point once:

`const base = (lastPos && lastPos.y > -200) ? lastPos : null;`

(The -200 check guards against a remote that never sent `ps` and is still at y=-1000.)

Inside the loop:
- If `it.holder === id && it.soulbound`, broadcast `{e:'rm', id}` so a rejoin gets a fresh loadout.
- Else if `it.holder === id`:
  - If `base` exists, broadcast a drop at `[base.x + (k%3-1)*0.35, base.y + 1 + 0.25*Math.floor(k/3), base.z + ((k>>1)%2-0.5)*0.35]`, incrementing `k` per item.
  - If there is no known position, broadcast `{e:'rm'}` rather than dropping the item inside the ship.

Keep the existing `owner === id` → `{e:'own', o:null}` release.

Do not use `net.players` as a fallback: session.js deletes that entry before `peerLeave` fires, and it never holds a position. | In game.js, handle the leave before tearing down the remote:

```js
net.on('peerLeave', (id) => {
  const r = this.remotes.get(id);
  if (this.isHost) this.hostOnPlayerLeave(id, r?.pos.clone());
  if (r) { this.ui.toast(...); r.dispose(); this.remotes.delete(id); }
  this.voice.removePeer(id);
});
```

In host.js:

```js
hostOnPlayerLeave(id, pos) {
  const known = pos && pos.y > -500;  // RemotePlayer.pos starts at (0,-1000,0) until a state arrives
  let k = 0;
  for (const it of [...this.items.all()]) {
    if (it.holder === id) {
      if (it.soulbound) { this.net.broadcast('it', { e: 'rm', id: it.id }); continue; }  // loadout respawns it on rejoin
      if (!known) { this.net.broadcast('it', { e: 'rm', id: it.id }); continue; }       // never bank at the ship origin
      const a = k++ * 2.4;
      this.net.broadcast('it', { e: 'drop', id: it.id, p: [pos.x + Math.cos(a) * 0.35, pos.y + 1, pos.z + Math.sin(a) * 0.35], q: [0, 0, 0, 1] });
    }
    if (it.owner === id) this.net.broadcast('it', { e: 'own', id: it.id, o: null });
  }
  this.hostAnnounce();
}
```

Dropping unknown-position items at the ship spawn is fine only in orbit or company phases. In other phases, remove them, or use the last `ps` position cached on the RemotePlayer, which is the same `r.pos`.

## [major] (network) Scrap held by client players left behind at takeoff ends up in the ship
- src/game/host.js:290
- fix: In hostFinishTakeoff, before hurting left-behind players, broadcast {e:'rm'} for every item whose holder is a left-behind player. In the 'drop' handler, when run.phase is 'takeoff' or 'orbit' and d.p is not insideShip, broadcast 'rm' instead of 'drop'. Change the y<-420 reset so it does not put items in the ship: delete them, or return them to their last grounded position, when no map is loaded.
- verified fix: 1. host.js hostFinishTakeoff, before line 290, add:
`const lbIds = new Set(leftBehind.map((p) => p.id)); for (const it of [...this.items.all()]) if (it.holder && lbIds.has(it.holder)) this.net.broadcast('it', { e: 'rm', id: it.id });`
This matches what already happens to the host: every held item is dropped and then deleted by unloadMap, and soulbound items are consumed in die(). Clients clear the slot through onItemDropped, and the later 'drop' requests find no item and return.

2. host.js 'drop' handler (line 122): after the holder check, add:
`if (['takeoff', 'orbit', 'fired'].includes(this.run.phase) && !insideShip(new THREE.Vector3().fromArray(d.p))) { this.net.broadcast('it', { e: 'rm', id: it.id }); return; }`
This covers drops that arrive late or are made while falling after the colliders are removed. insideShip is already imported in host.js.

3. items.js:272, the fell-out-of-world reset. Only teleport to the ship while a map is loaded (`game.world.moonId`). When no map is loaded, send the item to the host for removal instead of resetting it locally: if `game.isHost`, broadcast `{e:'rm'}`; on a client-owned item, stop simulating and let the host remove it. Deleting the item locally in update() without that broadcast would desync peers. | (1) In hostFinishTakeoff, before the hostHurtPlayer loop, remove what left-behind players are holding. That means every item it with it.holder in leftBehind: `this.net.broadcast('it', { e: 'rm', id: it.id })`, soulbound items included, since die() consumes those anyway. Then B's later die() finds its slots already empty; the 'rm' handler in items.js:180 clears the slots through onItemDropped. This matches what already happens to the host's own items.

(2) Keep the drop-handler guard as well. Without it, a client who dies just before hostFinishTakeoff (already dead, so not in leftBehind) still has drop requests in flight that land after the orbit unload and fall into the ship. The guard goes in host.js H('drop'): `if (['takeoff','orbit','fired'].includes(this.run.phase) && !insideShip(new THREE.Vector3().fromArray(d.p), 0.8)) { this.net.broadcast('it', { e: 'rm', id: it.id }); return; }`. The 0.8 margin matters because die() adds a random ±0.5 offset to a player standing against a ship wall.

(3) The y<-420 reset should not be a ship teleport at all, whatever the phase. The same path turns throwing scrap into a moon void into banking it. Only the host can remove an item authoritatively, so do it there. In items.js:

## [major] (network) Ringing the sell bell twice within 2.6 s pays out twice for the same scrap
- src/game/host.js:763
- fix: Track pending sales on the host: skip items with `it.selling`, set `it.selling = true` for items in inZone, and return early if nothing new is on the counter. In the timeout, only pay for items that still exist (`this.items.get(it.id)`) and are not held.
- verified fix: Change hostSell in src/game/host.js as follows:

(1) When building inZone, also skip items already queued: `if (it.state !== 'world' || it.selling || !isSellable(it.def) || it.soulbound || it.type === 'body') continue;`

(2) If inZone is empty, send the existing 'Place scrap on the counter first' message and return. Keep the bell sound. With the new check, a second ring finds nothing new and does not pay.

(3) Set `it.selling = true` on every item in inZone. Then broadcast {pending:true}.

(4) Inside the setTimeout, recompute the sale instead of using the precomputed total:
```js
const rate = buyRate(this.run.daysLeft, this.run.buyRnd);
let total = 0;
const list = [];
for (const it of inZone) {
  const cur = this.items.get(it.id);
  if (!cur) continue;
  if (cur.state !== 'world') { cur.selling = false; continue; }
  const v = Math.round(cur.value * rate);
  total += v;
  list.push({ name: cur.def.name, v });
  this.net.broadcast('it', { e: 'rm', id: cur.id });
}
if (this.run.phase !== 'company' || !list.length) return;
// then add credits/sold, broadcast 'sell', XP and coin, and hostSave as before
```

Items that were picked up during the delay are then neither paid for nor removed from the player's hand. An item that was already removed cannot be paid for twice. The phase check stops a sale from landing after the ship has left the company. Also have the 'drop' handler for items (or the 'held' transition) clear `it.selling`, so a scrap item that was lifted and put back can be queued again by the next ring. | In hostSell (host.js:752-756), skip items that are already being sold: `if (it.selling || it.state !== 'world' || ...) continue;`. After building inZone, set `it.selling = true` for each item. Send the 'Place scrap on the counter first' message only when inZone is empty. Move the value calculation into the timeout so the payout uses only items that are still valid:
```js
setTimeout(() => {
  const rate = buyRate(this.run.daysLeft, this.run.buyRnd);
  let total = 0; const list = [];
  for (const it of inZone) {
    const cur = this.items.get(it.id);
    if (!cur || cur !== it || it.state !== 'world' || it.holder || it.carrier) { it.selling = false; continue; }
    const v = Math.round(it.value * rate); total += v; list.push({ name: it.def.name, v });
    this.net.broadcast('it', { e: 'rm', id: it.id });
  }
  if (!total) return;
  this.run.credits += total; this.run.sold += total; /* ...rest unchanged... */
}, 2600);
```
Also block pickups while a sale

## [major] (network) Rejected peers (lobby full or version mismatch) become 'ghost' players on the host and other clients
- src/game/game.js:447
- fix: Ignore ps, pst, pinfo, is and req messages from peers not in net.players. On the host, only accepted peers are in players; remember rejected ids and drop their traffic. Have the host broadcast an authoritative roster, and have clients create remotes only for roster members. In the client's 'rejected' handler, call net.leave() before showing the alert.
- verified fix: Severity: minor/moderate (transient ghost, plus a possible permanent ghost on a player who joins during the window).
1) main.js:190: leave first and never block before the leave finishes. Use `this.game.on('fatal', (msg) => { this.leaveGame(); setTimeout(() => alert(msg), 300); })`, or better, show a non-blocking in-page modal. net.leave() followed by a synchronous alert() does not work, because Trystero's room.leave() is async (it awaits the leave send and a 99 ms timer before pc.destroy).
2) session.js receive(): on the host, drop all non-hello traffic from peers that were not accepted. Add `if (this.isHost && t !== 'hello' && !this.players.has(from)) return;` before the 'req' and msgHandlers dispatch. This covers ps, pst, pinfo, is, itst, chat and req. An accepted peer's hello always comes before its other traffic on the ordered channel, so accepted peers are not affected. Optionally keep a rejected Set, filled at the two reject sends and cleared in onPeerLeave.
3) Clients: stop creating remotes from peerHello (game.js:126). Have the host broadcast `{t:'pjoin', d:{id, ...info}}` in hostOnPlayerJoin. Clients then create remotes only from the welcome players list and from 'pjoin'. In onPlayerState, onPlayerStatus and the pinfo handler, clients should `if (!this.isHost && !this.remotes.has(from)) return;` instead of calling ensureRemote. A new peer's ps that arrives before its pjoin is simply dropped, which is harmless at 15 Hz.
4) host.js:77: build the welcome players list only from remotes whose id is in this.net.players, so a leftover ghost cannot spread to new joiners. | (1) Main fix, which limits any ghost to about one RTT: on the rejected client, close the link before any blocking UI. In game.js:134, change the handler to `net.on('rejected', (reason) => { this.net.leave(); this.emit('fatal', 'Join rejected: ' + reason); });`. Also clear joinTimeout in destroy(). Better still, replace alert() in main.js:190 with a non-blocking UI message.

(2) Host-side filter, in session.js receive() after the hello and reject branches:
`if (this.isHost && t !== 'hello' && from !== this.selfId && !this.players.has(from)) return;`
This drops 'req', 'ps', 'pst', 'pinfo', 'is', 'chat' and 'fx' from unaccepted peers. Trystero multiplexes all actions over one ordered channel, so a legitimate client's hello always arrives before its 'ps'.

(3) Clients, for the lobby-full case: when the host rejects, it also broadcasts a notice to the other peers, e.g. `this.transport.send(

## [major] (network) The world freezes for everyone whenever the host's tab is hidden or its window is covered
- src/main.js:242
- fix: On visibilitychange, when document.hidden && game.isHost, start a ticker in a dedicated Worker (setInterval inside the worker posting 'tick' at 20-30 Hz; main-thread timers are throttled to 1 Hz or less) that calls game.update(dt) without rendering. Stop it and resume rAF when the page is visible again.
- verified fix: Drive a fallback tick from a dedicated Worker, but trigger it when rAF stalls instead of only on visibilitychange. rAF can also be throttled while document.hidden stays false (Safari low-power mode, some occlusion cases). The fallback must also never run in the same period as a real frame.

1) Add src/core/tickworker.js containing `let id; onmessage = (e) => { clearInterval(id); if (e.data > 0) id = setInterval(() => postMessage(0), e.data); };`

2) In App (main.js):
- In the constructor, set `this.lastUpdate = performance.now();`.
- In `loop()`, right after `this.last = now`, set `this.lastUpdate = performance.now();`.
- After `this.game` is created in startGame, add:
  `if (this.game.isHost) { this.ticker = new Worker(new URL('./core/tickworker.js', import.meta.url), { type: 'module' }); this.ticker.onmessage = () => this.bgTick(); this.ticker.postMessage(50); }`
- In leaveGame, add `this.ticker?.terminate(); this.ticker = null;`.

3) Add this method to App:
```
bgTick() {
  const now = performance.now();
  const gap = now - this.lastUpdate;
  if (!this.game || gap < 150) return;   // rAF is alive, do nothing
  const dt = Math.min(gap / 1000, 0.1);
  this.lastUpdate = now;
  this.last = now;   // so the next rAF frame doesn't replay this interval
  try { this.game.update(dt); } catch (e) { console.error(e); }
  this.input.endFrame();
}
```
Do not render in bgTick.

Why this shape:
- The 150 ms guard stops double-stepping while the page is visible.
- Keeping `this.last` in sync means the first rAF frame after the page comes back does not add a second 0.1 s step.
- `input.endFrame()` keeps edge-triggered input consistent.
- Starting the worker only for the host stops the ticker from doing extra work on clients. Optionally, run it on clients too so their 'ps' keeps flowing and their player does not freeze in the host's view. | The proposed direction (a Worker-driven headless tick while the host is hidden) is right, but the fix is incomplete as written. Implement it in src/main.js like this:

1. Create the worker from a Blob, so Vite needs no config:
```js
const src = 'let h;onmessage=e=>{clearInterval(h);if(e.data>0)h=setInterval(()=>postMessage(0),e.data)}';
this.bgTick = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
```

2. Tick only while hidden and hosting:
```js
document.addEventListener('visibilitychange', () => this.bgTick.postMessage(document.hidden && this.game?.isHost ? 50 : 0));
```
Also send the message once from

## [major] (network) The ship charger never recharges the host's own items, and the host keeps stale battery values for clients' items
- src/game/host.js:219
- fix: In the charge handler, apply the change on the host first, e.g. `this.items.onState({ id: it.id, b: full })` (which sets it.battery and calls onItemState), then `this.net.broadcast('itst', { id: it.id, b: full }, false)`.
- verified fix: In host.js:219, replace `if (full) this.net.broadcast('itst', { id: it.id, b: full });` with `if (full) { this.items.onState({ id: it.id, b: full }); this.net.broadcast('itst', { id: it.id, b: full }, false); }`.

## [major] (mods) Roulette pays out on the bet, bet type and number as they are when the wheel stops, not when the stake was taken, which allows unlimited coin farming
- public/mods/lethal-casino.js:209
- fix: In spin(), take a snapshot `const wager = { bet, kind, pick }` after the checks and pass it to settle(result, wager). settle() must use only wager.bet, wager.kind and wager.pick. Also disable the bet, bet-type and number controls while `spinning` is true (early-return in their handlers).
- verified fix: The proposed fix is correct. Details:

1. In spin(), after spendCoins succeeds, take a snapshot: `const wager = { bet, kind, pick, b: BETS[kind] };`.
2. Call settle(result, wager) from both places, line 199 (panel closed) and line 205 (animation end).
3. In settle(), use only `wager.b.win(result, wager.pick)` and `pay = wager.bet * wager.b.pays`. Never read the live `bet`, `kind` or `pick`.
4. As UX hardening, early-return in the '+', '-' and MAX handlers, the bet-kind handlers and numIn's change handler when `spinning` is true (or set `disabled`/`numIn.disabled` while spinning).
5. Optionally clamp '+' to the balance as well: `bet = Math.min(maxBet, game.profile.coins, bet*2)`.

The snapshot (steps 1-3) is the part that actually fixes the exploit. Locking the controls alone would leave the panel-close path at line 199 fragile. Rebuild so the dist/mods copy picks up the change. | In spin(), after spendCoins succeeds, add `const wager = { bet, kind, pick };`. Call settle(result, wager) at both call sites (lines 199 and 205). In settle(result, w), use `const b = BETS[w.kind]; const won = b.win(result, w.pick); const pay = w.bet * b.pays;`. Optionally, for UX, add `if (spinning) return;` to the '-', '+', MAX and bet-type handlers and to the numIn change handler, or set `numIn.disabled = spinning`.

## [major] (mods) reserved-slots: a client-only reservedSlots setting survives the host's welcome config and turns a normal slot into a flashlight-only slot
- src/game/game.js:184
- fix: Engine fix: on a client, rebuild the config from defaults plus the host's config: `this.config = { ...DEFAULT_CONFIG, ...(d.config || {}) }`, where DEFAULT_CONFIG is the constructor's literal hoisted to a constant, so no client-side mod key survives. Or skip the 'configure' emit for non-hosts and emit it only for the host. Mod-side alternative: have the host always write `config.reservedSlots` (possibly []), and on clients ignore reservedSlots unless the welcome config contains it.
- verified fix: Use the defaults-rebuild fix, not the 'skip configure on clients' one. Skipping it would break infinite-sprint.js:16, which sets game.infiniteSprint inside 'configure' on every peer.
- In game.js, hoist the constructor literal from line 47 to `const DEFAULT_CONFIG = { maxPlayers: 4, inventorySlots: 4, quotaMul: 1, dangerMul: 1, dayLengthSec: 720, bigHeads: false };`. In the constructor, use `this.config = { ...DEFAULT_CONFIG };`.
- In onWelcome (game.js:184), change the merge to `this.config = { ...DEFAULT_CONFIG, ...(d.config || {}) };`. Client-only mod keys such as reservedSlots then cannot survive, and the host's config is authoritative.
- Mod-side hardening (optional, also covers hosts on older builds): at reserved-slots.js:27-31, have the host always write the key, e.g. `config.reservedSlots = spec.length ? spec.slice() : [];`. Only bump inventorySlots when spec is non-empty.
- Also optional: in the mod's 'netReady' hook, when !game.isHost, delete game.config.reservedSlots once the welcome arrives unless d.config contains it. For example, wrap game.onWelcome and apply `if (!('reservedSlots' in (d.config||{}))) delete this.config.reservedSlots` after calling the original. | Use only the engine fix that rebuilds the config from defaults. Move the literal at game.js:47 into a module constant, `const DEFAULT_CONFIG = { maxPlayers: 4, inventorySlots: 4, quotaMul: 1, dangerMul: 1, dayLengthSec: 720, bigHeads: false };`. In the constructor, use `this.config = { ...DEFAULT_CONFIG };`. In onWelcome (game.js:184), use `this.config = { ...DEFAULT_CONFIG, ...(d.config || {}) };`. This way no key written by a client-side mod survives the welcome, and a reservedSlots value from a host that has the mod still reaches clients.

Do NOT stop emitting 'configure' on non-hosts. hardcore.js:27 (`game.xpMul`) and infinite-sprint.js:16 (`game.infiniteSprint`) set per-client game fields in that hook, and skipping it would silently break them.

Optional hardening in the mod itself: when the host has the mod, it could always write `config.reservedSlots` (possibly `[]`) so the key is present explicitly in the welcome.

## [major] (mods) Content mods such as extra-moons-pack are never enforced; a client or save without the moon hits a TypeError in loadMapFor or hostFinishLanding
- src/game/game.js:275
- fix: (1) In hostOnPlayerJoin, compare info.mods with a list of content mods that must match (the mod def could declare `required: true`: extra-moons-pack, lethal-things, kefal-shark, herobrine-stalker). Send 'reject' or at least a 'sys' warning naming the missing mods. Include the host's required mod ids in 'welcome' so the client can refuse early. (2) Guard the moon lookups: in loadMapFor, `if (!moon) { this.ui.toast('Unknown moon ' + moonId + ' (missing mod?)','bad'); return; }`. In hostInit and hostLever, if `!MOONS[run.moon]`, reset run.moon to 'hamsi' (or refuse to land with a terminal message).
- verified fix: 1. Fix the crash first, in loadMapFor (game.js:273). Add: `const moon = MOONS[moonId]; if (!moon) { this.emit('fatal', 'The host is on moon "' + moonId + '", which is not installed here. Enable the same mods (and mod settings) as the host.'); return; }`. This makes the client leave cleanly instead of sitting half-initialised. A more robust option is for the host to send the moon definition itself. Moons are pure data built from existing biomes and interiors, so hostSetPhase (host.js:232) and the 'welcome' payload can include `moonDef: MOON_ORDER.indexOf(run.moon) >= 7 ? MOONS[run.moon] : undefined`. The client then calls `if (d.moonDef && !MOONS[d.moonDef.id]) registerMoon(d.moonDef)` before loadMapFor. Unknown creature ids are already filtered by `CREATURES[id]` in the spawners.

2. Host-side validation. In hostInit, right after host.js:35, add: `if (!MOONS[run.moon]) { run.moon = 'hamsi'; rollForecast(run); }`. If daysLeft <= 0, the existing lever check already tells the player to route to HQ. Also guard hostFinishLanding: `const moon = MOONS[this.run.moon]; if (!moon) { this.run.moon = 'hamsi'; this.hostSetPhase('orbit'); this.net.broadcast('sys', { text: 'Unknown moon, autopilot reset.', kind: 'bad' }); return; }`. This way the timer can never leave the phase stuck at 'landing'. Use `moon?.` in hostPopulateMoon and hostSpawnOutdoor as well.

3. Optional join enforcement in hostOnPlayerJoin: compare the host's content mod ids with info.mods, and on a mismatch send `this.net.sendTo(id, 'reject', { reason: 'Missing mods: ' + missing.join(', ') })` before 'welcome'. The client's Session.receive already turns 'reject' into a fatal "Join rejected" message. This is not enough on its own: mod configs can differ, so step 1 is still needed. | The proposed fix needs three corrections:
- Comparing enabledIds is not enough. extra-moons-pack registers each moon behind its own config flag (cfg.istavrit, cfg.kalkan, cfg.lagos). Two peers can have the same 'extra-moons-pack@1' id and still have different moon sets. Compare the actual content (moon ids) instead.
- The rejection must happen before 'welcome' is sent. That means in the hello handling, not after hostOnPlayerJoin has already sent the world.
- The host needs its own guards so a stale save cannot soft-lock.

Concrete changes:

(1) Send the host's moon list in helloData: `moons: MOON_ORDER.slice()`, next to mods (game.js:120). Put it in 'welcome' as well.
- In session.receive's host branch (session.js:62-68), b

## [minor] (economy) The ship door stays open in orbit after being fired and cannot be closed
**FIXED (round 3)** - game.js onPhase(orbit) closes the ship door on every peer.
- src/game/game.js:761
- fix: In the fired reset timer, broadcast `door {id:'ship', open:false}`, or call `this.ship.door.setOpen(false)` in onPhase('orbit').
- verified fix: Minimal and robust: in src/game/game.js onPhase, in the `ph === 'orbit'` branch (line ~233), add `this.ship.door.setOpen(false);`. Every peer, the host included, runs onPhase, so the host's ship.door.open is false again, and hostOnPlayerJoin's `shipDoor` is correct for late joiners. The alternative is to add `this.net.broadcast('door', { id: 'ship', open: false });` in host.js hostEvaluateQuota's reset setTimeout, just before `this.hostSetPhase('orbit')` (line ~364).

Optional hardening for the soft-lock this exposes: in orbit, nothing should be able to kill you and leave you dead. In localplayer.js:222 or the game update loop, if `this.run.phase === 'orbit'` and the player falls below about -50, call `this.spawnInShip()` instead of damageLocal('void').

## [minor] (economy) The Day Report shows days left before the decrement
**FIXED (round 3)** - verified: the summary already uses the post-decrement value.
- src/game/host.js:316
- fix: Build the summary after the daysLeft/day update, or set `daysLeft: moon.company ? run.daysLeft : Math.max(0, run.daysLeft - 1)`.
- verified fix: In `src/game/host.js`, after the `if (!moon.company) { run.daysLeft = ...; run.day += 1; ... }` block (line 324) and before `this.net.broadcast('summary', summary)` (line 328), add `summary.daysLeft = run.daysLeft;`. Alternatively, use `daysLeft: moon.company ? run.daysLeft : Math.max(0, run.daysLeft - 1)` in the literal. Keep `day: run.day` as the value from before the increment. | In src/game/host.js hostFinishTakeoff, add `summary.daysLeft = run.daysLeft;` immediately after the `if (!moon.company) { run.daysLeft = ...; run.day += 1; ... }` block (i.e. before the `this.net.broadcast('summary', summary)` at line 328). Leave `day: run.day` as the pre-increment value so the report still labels the day that was just played. The reviewer's inline alternative `daysLeft: moon.company ? run.daysLeft : Math.max(0, run.daysLeft - 1)` is equivalent.

## [minor] (economy) buyRnd is re-rolled on the host each day but never synced, so clients' terminals show the wrong buying rate
**FIXED (round 3)** - verified: broadcastRun(['buyRnd']) + generic run diff sync.
- src/game/host.js:325
- fix: Add `buyRnd: run.buyRnd` to the hostSetPhase('orbit', {...}) extra, or broadcastRun(['buyRnd']).
- verified fix: host.js:329: `this.hostSetPhase('orbit', { daysLeft: run.daysLeft, day: run.day, credits: run.credits, forecast: run.forecast, powerOn: true, buyRnd: run.buyRnd });`. Clients merge that into `run` through `onPhase` -> `applyRunState`, so terminal.js:141 and 198 pick up the new value. Optional extra: while in the company phase, have the terminal use the host-synced `run.buyRate` when it is set, so it matches the host's bell exactly.

## [minor] (economy) The Loud Horn (▮100) and Brighter Floodlight (▮150) ship upgrades do nothing
**FIXED (round 3)** - verified: shipfeatures.js implements the horn button and the floodlight upgrade.
- src/game/items.js:132
- fix: Implement the effects (e.g. a horn interactable in the ship that plays ship_horn and makes noise, and scaling the ship.flood light distance when the upgrade is owned), or hide these upgrades from STORE/BUY until they work.
- verified fix: 1) Floodlight: first make the base floodlight work, then apply the upgrade. In Game's per-frame update (next to the night check at game.js:561), add something like:
`const f = this.ship.flood; const lit = this.run?.phase === 'moon' && (this.run.time || 0) > 17*60; f.enabled = lit; f.distance = this.run?.upgrades?.lightsplus ? 68 : 34; f.intensity = this.run?.upgrades?.lightsplus ? 3.2 : 2.2;`
LightPool reads e.distance and e.intensity every frame (lightpool.js:67,80,81), so changing them there is enough. Note that lightpool.js:67 also uses distance for culling (maxD = distance + 22), so the doubled range will be visible from farther away.

2) Loud Horn: add a ship interactable (for example a pull cord by the lever), gated on run.upgrades.loudhorn, that sends net.request('horn'). On the host, rate-limit it (for example a 3 s cooldown). Then broadcast fx {k:'snd', s:'ship_horn', p:[ship pos], v:1}; that sound is already defined at sfxlib.js:1017. Also call this.creatures.noise(shipPos, 4) so the horn has the lure tradeoff that other loud items have.

3) Teleporter: either implement the body part or fix the text. To implement it, in hostExecute 'teleport', when the target is dead, find the item with type==='body' that belongs to the target and move it to the ship spawn spot. Use the existing item 'tp' event (entities/items.js:208) to update its position on clients, and skip sending the player 'tp'. Otherwise, remove '(and their body)' from the description at items.js:133.

Alternative for 1 and 2: until they are implemented, filter loudhorn and lightsplus out of the STORE listing (terminal.js:160) and the BUY fuzzy match (terminal.js:169), and have the host reject them in the 'upgrade' op, so credits cannot be spent on upgrades that do nothing. | 1) Floodlight (in the Game per-frame update, e.g. src/game/game.js, or on each 'phase'/'gs' update). Turn the emitter on first, then apply the upgrade:
   const f = this.ship.flood;
   f.enabled = this.run.phase === 'moon' && !this.world.company && /* optionally only at dusk/night from env time */ true;
   f.distance = this.run.upgrades?.lightsplus ? 68 : 34;
   f.intensity = this.run.upgrades?.lightsplus ? 3.0 : 2.2;
   LightPool culls emitters farther than distance + 22, so the longer range follows automatically. Remember the floodlight is dark today even without the upgrade.

2) Loud Horn. Add a 'horn' anchor to the interactables in ship.js:227-236, with a fallback position near the terminal. In actions.js, show t

## [minor] (economy) The Second Wind perk works once per session, not once per day
**FIXED (round 3)** - game.js onPhase(landing) resets secondWindUsed.
- src/game/actions.js:811
- fix: Reset `this.secondWindUsed = false` in onPhase when the phase is 'landing' (or 'orbit').
- verified fix: In src/game/game.js onPhase, add `this.secondWindUsed = false;` inside the `if (ph === 'landing') {` branch (line 214). That clears the flag at the start of every trip, both moon and company. | In src/game/game.js onPhase(), inside the `if (ph === 'landing') {` branch (line 214), add `this.secondWindUsed = false;`. Every peer, including the host, receives the 'phase' broadcast (includeSelf defaults to true), so each player's own flag resets once per landing (per day).

## [minor] (economy) profile.stats.quotasMet is never incremented
**FIXED (round 3)** - verified: achievements.js increments it on the quota-met event.
- src/game/game.js:751
- fix: In onReward: `if (d.quota) { this.profile.stats.quotasMet += 1; this.progress.save(); }`.
- verified fix: Add this in src/game/game.js onReward, after the recipient check on line 754:

`if (d.quota) { this.profile.stats.quotasMet = (this.profile.stats.quotasMet || 0) + 1; this.progress.save(); }`

This is the same as the proposed fix. The `|| 0` guard is optional.

## [minor] (economy) The arcade daily XP cap resets every session
**FIXED (round 3)** - hook for profile.js arcade() (cap stored in profile.stats.arcadeDay/arcadeXp, defaults in save.js).
- src/game/profile.js:83
- fix: Store the arcade day and XP on the persisted profile (e.g. p.stats.arcadeDay and p.stats.arcadeXp).
- verified fix: In Progress.arcade(), keep the cap on the persisted profile: `const s = this.p.stats; const day = Math.floor(Date.now()/86400000); if (s.arcadeDay !== day) { s.arcadeDay = day; s.arcadeXp = 0; } const xp = Math.min(Math.round(score*2), 100 - (s.arcadeXp||0)); if (xp > 0) { s.arcadeXp = (s.arcadeXp||0) + xp; this.addXp(xp, 'Arcade'); } this.save();`. Optionally add `arcadeDay: -1, arcadeXp: 0` to defaultProfile().stats in src/core/save.js:80. The existing stats merge in loadProfile() already carries the fields across reloads. | In Progress.arcade, keep the counters in the persisted stats: `const s = this.p.stats; const day = Math.floor(Date.now()/86400000); if (s.arcadeDay !== day) { s.arcadeDay = day; s.arcadeXp = 0; } const xp = Math.min(Math.round(score*2), 100 - (s.arcadeXp||0)); if (xp > 0) { s.arcadeXp = (s.arcadeXp||0) + xp; this.addXp(xp, 'Arcade'); } this.save();`. Optionally add arcadeDay: -1 and arcadeXp: 0 to defaultProfile().stats in src/core/save.js:80 for clarity (not required, because the merge keeps unknown keys).

## [minor] (items) Host silently drops a rejected pick; the client's predicted item becomes a permanent ghost
**FIXED (round 3)** - host.js answers every rejection with pickfail + host transform; actions.js restores it; distance uses the reported position; psTimer reset on teleports.
- src/game/host.js:112
- fix: Send `pickfail` on every rejection path. In pickup(), store the item's world position and rotation before reparenting, and restore them in onPickFail before makeBody(). Relax the distance check, for example ~10 m, or check it against the client's last reported ps position rather than the damped remote pos.
- verified fix: 1) host.js:110-112: reply on every rejection, and use the last reported position instead of the damped one:
```js
const nak = () => this.net.sendTo(from, 'pickfail', { id: d.id, p: it.obj.position.toArray(), q: it.obj.quaternion.toArray() });
if (it.owner && it.owner !== from) return nak();
const r = from === this.selfId ? null : this.remotes.get(from);
const p = from === this.selfId ? this.player.pos : (r && r.lastUpdate ? r.target : null);
if (p && p.distanceTo(it.obj.position) > 6) return nak();
```

2) actions.js:329-334 onPickFail(d): take the whole payload, not just the id. In game.js:166 change the call to `this.onPickFail(d)`. Before makeBody(), put the item back at the host's position; a pre-pick position saved in pickup() works as a fallback:
```js
if (it && it.holder === this.selfId) {
  it.setHeld(null);
  it.obj.removeFromParent(); this.scene.add(it.obj);
  if (d.p) { it.obj.position.fromArray(d.p); it.obj.quaternion.fromArray(d.q); }
  else if (it._prePick) { it.obj.position.copy(it._prePick.p); it.obj.quaternion.copy(it._prePick.q); }
  it.obj.scale.setScalar(1); it.obj.visible = true; it.makeBody();
}
```
In pickup(), before setHeld, save `it._prePick = { p: it.obj.position.clone(), q: it.obj.quaternion.clone() }`.

3) Close the race at the source. Set `this.psTimer = 0` in useExit (actions.js:292), in the 'tp' handler (game.js:163) and in spawnInShip. netSend then sends the new position in the same frame, ahead of any later 'pick' request on the ordered channel. | host.js pick handler: send the reply on every rejection path, and include the host's authoritative transform. Write it as `const fail = () => { const o = it?.obj; this.net.sendTo(from, 'pickfail', o && it.state === 'world' ? { id: d.id, p: o.position.toArray(), q: o.quaternion.toArray() } : { id: d.id }); };` and then use `fail()` at lines 109, 110 and 112. Keep the 6 m check as it is. It is not the cause, and making it looser does not help with teleports.

game.js:166: pass the whole payload, as `net.on_('pickfail', (d) => this.onPickFail(d.id, d));`.

actions.js `pickup()`: before `refreshHeldVisuals()`, save the world transform with `it.predFrom = { p: it.obj.position.clone(), q: it.obj.quaternion.clone() };`.

actions.js `onPickFail(id, d)`: inside the `holder === selfId` branch, do these steps in order before `makeBody()`:
1. Call `it.setHeld(null)`, then `removeFromParent()`, then `scene.add(it.obj)`.
2. Set the position from `d.p`, falling back to `it.predFrom.p`. Set the 

## [minor] (items) Thrown stun grenades only count down during the 'moon' phase
**FIXED (round 3)** - host.js hostThrowables runs in every phase; re-thrown grenades restart their fuse.
- src/game/host.js:578
- fix: Call hostThrowables(dt) outside the phase branches, or at least in company and orbit too. Also clear hostData.throwables on phase changes.
- verified fix: In src/game/host.js hostUpdate, remove `this.hostThrowables(dt);` from the moon branch (line 578) and call it once, unconditionally, after the phase if/else-if block (e.g. just before the "lobby announce refresh" at line 582):

    } else if (run.phase === 'company') {
      this.creatures.hostUpdate(dt);
    }
    this.hostThrowables(dt);   // fuses tick in every phase (orbit/landing/company/takeoff too)

hostThrowables is safe in every phase. In orbit, creatures.host is empty and the ship colliders still exist for physics.lineOfSight. Do NOT clear hostData.throwables on phase changes: entries for items that unloadMap deleted, or that a player picked up again, already drop out through the `!it || it.state !== 'world'` check at host.js:650 when their fuse runs out. Clearing the list would instead turn a grenade thrown just before takeoff into a permanent dud. Optional: reset `hostData.throwables = []` only where hostData itself is rebuilt (host.js:38). | In host.js hostUpdate, remove `this.hostThrowables(dt);` from line 578. Call it once, unconditionally, after the whole `if (run.phase === 'moon') {...} else if (run.phase === 'company') {...}` chain (just before the lobby announce refresh). It is safe in every phase: `creatures.host` is empty in orbit, and `physics.lineOfSight` still has the ship colliders. Do NOT clear hostData.throwables on phase change. Stale ids for items unloaded with the map are already dropped by `if (!it || it.state !== 'world') continue;`. Optional hardening against an old entry detonating a re-thrown grenade early: in hostArmThrowable, remove any existing entry with the same id before pushing, e.g. `const l = (this.hostData.throwables ||= []); const i = l.findIndex((t) => t.id === it.id); if (i >= 0) l.splice(i, 1); l.push({ id: it.id, t: fuse, type: it.type });`.

## [minor] (items) Item side effects are never torn down: glowstick light emitters and boombox music loops leak
**FIXED (round 3)** - actions.js updateItemFx() stops music / removes glow when the item is gone; glow has its own vector; die() turns boomboxes off; late joiners get onItemState.
- src/entities/items.js:105
- fix: In dispose(): `this.music?.stop(0.2); this.music = null; if (this.glow) { this.mgr.game.lights.remove(this.glow); this.glow = null; }`. In die(), turn off an active boombox before dropping it. In onEvent 'sp', call game.onItemState(it) when d.on is set.
- verified fix: 1. **src/entities/items.js, `WorldItem.dispose()`**: add at the top: `if (this.music) { this.music.stop(0.2); this.music = null; } if (this.glow) { this.mgr.game.lights?.remove(this.glow); this.glow = null; }`. This covers 'rm', `unloadMap`, `clearAll`, the fired wipe and welcome resyncs.

2. **src/game/actions.js:559**: give the emitter its own vector: `it.glow = this.lights.add({ pos: it.obj.getWorldPosition(new THREE.Vector3()), ... })`. Line 594 already copies the world position into `glow.pos` every frame. It then updates the emitter's own vector instead of overwriting `obj.position`, which is a local position while the stick is held.

3. **src/entities/items.js, onEvent 'drop'**: turn the boombox off here instead of only in the local `die()`, so every peer handles it the same way for die, player leave and a normal drop. Right after `it.setHeld(null)`, add: `if (it.type === 'boombox' && it.on) { it.on = false; this.game.onItemState?.(it); }`. You can then remove the local `setItemOn(false)` at actions.js:395, or keep it.

4. **src/entities/items.js, onEvent 'sp'**: after `this.items.set(d.id, it)`, add: `if (it.on) this.game.onItemState?.(it);` so late joiners get the glow and the music. | The fix you proposed is right. Four changes cover it.

1. **src/entities/items.js, `WorldItem.dispose()`**, before `removeBody()`:
```js
this.music?.stop(0.2); this.music = null;
if (this.glow) { this.mgr.game.lights?.remove(this.glow); this.glow = null; }
```
This one change covers the 'rm' event, `clearAll`, and the per-item dispose in `unloadMap`.

2. **src/game/actions.js, `die()`**: in the drop loop, before `net.request('drop', ...)`, add:
```js
if (it.type === 'boombox' && it.on) this.setItemOn(it, false);
```
This matches what `dropItem` already does at line 395.

3. **src/entities/items.js, 'sp' case**: after `this.items.set(d.id, it)`, add:
```js
if (it.on) this.game.onItemState?.(it);
```
Late joiners then get the glow and music.

4. **Related bug at actions.js:559.** Create the emitter with its own vector: `pos: it.obj.getWorldPosition(new THREE.Vector3())`, not `pos: it.obj.position`. Line 594 does `it.glow.pos.copy(it.obj.getWorldPosition(tmp))`. Because the emitter's position is the same object as `obj.position`, that writes world coordinates into the item's local position every frame. It is harmless while the glowstick sits in the scene. Once someone picks the used glowstick up again, its parent is the hand or camera anchor. The model and its light th

## [minor] (items) Jetpack: LMB also melee-swings, and its battery drain is never synced
**FIXED (round 3)** - actions.js: jetpack ignores LMB swing; battery synced on drop/death and when it changed (periodic).
- src/game/actions.js:502
- fix: Add `case 'jetpack': return;` in useHeldPress. Broadcast 'itst' {b} when jetting stops (or include jetting items in the periodic sync), and before a jetpack is dropped.
- verified fix: 1) In `useHeldPress` (src/game/actions.js, inside the switch at ~478), add `case 'jetpack': return;` so LMB never reaches `meleeSwing`.

2) In localplayer.js:174-178, clamp the drain and remember which item is jetting:
```js
if (held && held.type === 'jetpack' && input.mouseDown(0) && (held.battery ?? 0) > 0 && canMove) {
  this.vel.y = Math.min(this.vel.y + 30 * dt, 7);
  held.battery = Math.max(0, held.battery - dt);
  this.jetting = true;
  this.jetItem = held;
} else {
  if (this.jetItem) {
    this.game.net.send('itst', { id: this.jetItem.id, b: Math.round(this.jetItem.battery * 10) / 10 });
    this.jetItem = null;
  }
  this.jetting = false;
}
```
This uses `jetItem` rather than `held`, so the sync still fires after a slot switch.

3) In `dropItem` (actions.js:379), before `this.net.request('drop', ...)`, add:
```js
if (it.battery != null) this.net.send('itst', { id: it.id, b: it.battery });
```
This sends the final value ahead of the drop on the same ordered channel, which also covers boomboxes and flashlights that were turned off.

4) In the periodic sync at actions.js:585, change the condition to `if (it?.on || it === this.player.jetItem)`. That way a player who dies or disconnects mid-flight has leaked at most about 4 s of drain. | (a) In actions.js useHeldPress, add `case 'jetpack': return;` to the switch at line 478. Flying is already handled by localplayer.js:174 via input.mouseDown(0).

(b) In localplayer.js:172-178, clamp the drain and remember which item was burning fuel. Then sync on the stop edge, because the held item can change mid-flight (slot switch or drop while LMB is down), so `held` may already be something else:
```js
const jet = held && held.type === 'jetpack' && input.mouseDown(0) && (held.battery ?? 0) > 0 && canMove;
if (jet) { this.vel.y = Math.min(this.vel.y + 30 * dt, 7); held.battery = Math.max(0, held.battery - dt); this.jetItem = held; }
else if (this.jetItem) { const j = this.jetItem; this.jetItem = null; this.game.net.send('itst', { id: j.id, b: Math.round(j.battery * 10) / 10 }); }
this.jetting = !!jet;
```

(c) As a belt-and-braces measure, in actions.js dropItem (before the `net.request('drop', ...)` at line 391), add `if (it.def.battery && it.battery != null) this.net.send('itst', { id: it.id, b: it.battery });`. Every peer, including the host whose copy is saved, then has the real value before the item leaves your hands.

Alternatively, change the periodic sync at actions.js:585 to `if (it && (it.on || it.type =

## [minor] (creatures) Lurker never gets angry from being stared at: anger only increases on the single tick before it switches to 'flee'
- src/entities/creatures.js:709
- fix: Accumulate anger whenever the lurker is watched, before branching on state: if (watched) c.data.anger += dt*1.6; else decay. Check the anger>6 && d<12 transition to 'angry' in the flee branch as well (or right after the accumulation), not only in the sneak branch.
- verified fix: In the lurker behavior (src/entities/creatures.js), accumulate anger after the 'angry'/'attack' early-returns and before the flee/sneak split, and reset anger when the angry state times out:

```js
// line 695: keep decay only when unwatched (move below `watched`)
const watched = players.some((p) => M.isLookedAt(c, p, 25, 0.82));
if (!watched) c.data.anger = Math.max(0, (c.data.anger || 0) - dt * 0.15);
if (c.state === 'angry') {
  if (d < 1.4) { c.setState('attack'); M.attack(c, tgt, 999, 'lurker'); c.data.anger = 0; c.data.fleeT = 8; return; }
  M.moveToward(c, tgt.pos, dt, c.def.run);
  if (c.t > 14) { c.data.anger = 0; c.setState('flee'); c.data.fleeT = 5; }   // reset so it doesn't instantly re-anger
  return;
}
if (c.state === 'attack') { if (c.t > 1.5) c.setState('flee'); return; }
if (watched) {
  c.data.anger = (c.data.anger || 0) + dt * 1.6;
  if (c.data.anger > 6 && d < 12) { c.setState('angry'); return; }
}
if (watched && c.state !== 'flee') { c.setState('flee'); /* pick away point, fleeT as before */ return; }
if (c.state === 'flee') { ...unchanged... }
```
Also set `c.data.anger = 0` in the sneak-attack path (line 726), to match line 703. Optionally drop or relax the `d < 12` gate, since a lurker that keeps fleeing while watched often ends up more than 12 m away when anger passes 6. | In src/entities/creatures.js, in the lurker behaviour:

1. Delete the unconditional decay on line 695.
2. After the 'attack' early return (line 708), and before the `watched && state !== 'flee'` branch, insert:
```js
if (watched) c.data.anger += dt * 1.6; else c.data.anger = Math.max(0, c.data.anger - dt * 0.15);
if (watched && c.data.anger > 6 && d < 18) { c.setState('angry'); return; }
if (watched && c.state !== 'flee') { c.setState('flee'); /* existing away/goTo/fleeT code */ return; }
```
3. Remove the old `c.data.anger += dt*1.6` and the `anger > 6` check from inside that branch.

Why accumulate after the angry/attack returns rather than "before branching on state": this keeps anger from building while the lurker is already angry or attacking.

The angry check has to run in the flee state too. Otherwise a lurker that keeps fleeing never turns angry.

Consider a larger distance gate than 12 (for example 18), or dropping it while fleeing. At run speed 9.5 the lurker is usually more than 12 m away by the time anger passes 6, so the transition would be delayed until it comes back.

Optionally, reset `c.data.anger = 0` when the angry state times out on line 705.

## [minor] (creatures) Leech spawn spot lookup indexes the filtered array with the unfiltered length, so leeches pile onto ceilingSpots[0], which may be right above a player
**FIXED (round 3)** - host.js picks from the filtered list; spawn returns success and power is only charged on success (director hook).
- src/game/host.js:476
- fix: const cand = fac.ceilingSpots.filter(farEnough); const s = cand[Math.floor(Math.random()*cand.length)]; if (!s) return false;. Do the same for vents: apply farEnough to the scrapSpots fallback or skip the spawn. Have hostSpawnCreatureIndoor return success, and only add def.power in hostSpawnWave when it returns true.
- verified fix: In src/game/host.js hostSpawnCreatureIndoor:
- Leech case: `const cand = fac.ceilingSpots.filter(farEnough); const s = cand[Math.floor(Math.random() * cand.length)]; if (!s) return false; this.creatures.hostSpawn('leech', ...); return true;`
- Vent case: `const vents = fac.ventSpots.filter(farEnough); const pool = vents.length ? vents : fac.scrapSpots.filter(farEnough); const s = pool[Math.floor(Math.random() * pool.length)]; if (!s) return false;`
- Return true after both the scuttler loop and the final hostSpawn.

In hostSpawnWave (host.js:466-467), charge power only on success: `if (this.hostSpawnCreatureIndoor(pick.id)) this.hostData.powerUsed += def.power;`. The existing `guard` of 20 already stops the loop if spawns keep failing.

Make the same change in src/game/director.js:438-439: `if (!game.hostSpawnCreatureIndoor(pick.id)) { H.nextPressureT = H.t + 10; return false; } hd.powerUsed = used + CREATURES[pick.id].power;`. This means a failed pressure spawn neither charges power nor resets calmT or the pressure timer as if it had succeeded. | In src/game/host.js hostSpawnCreatureIndoor:
- Leech: `const cand = fac.ceilingSpots.filter(farEnough); const s = cand[Math.floor(Math.random() * cand.length)]; if (!s) return false;`
- Vents: `const vents = fac.ventSpots.filter(farEnough); const pool = vents.length ? vents : fac.scrapSpots.filter(farEnough); const s = pool[Math.floor(Math.random() * pool.length)]; if (!s) return false;`
- Add `return true` at the end of every successful path: the leech spawn, the scuttler loop and the final hostSpawn.

Charge power only on success, at both call sites:
- host.js:466-467: `if (this.hostSpawnCreatureIndoor(pick.id)) this.hostData.powerUsed += def.power;` The existing `guard` (20 iterations) already bounds the loop when spawns keep failing.
- director.js:438-439: `if (!game.hostSpawnCreatureIndoor(pick.id)) { H.nextPressureT = H.t + 10; return false; }` then `hd.powerUsed = used + CREATURES[pick.id].power;`

Optional hardening: in entities/creatures.js:795, a falling leech should not latch onto a player who already has one (`p.latched`); it should go to 'walk' instead, so leeches that do end up stacked cannot all latch onto the same person.

## [minor] (creatures) 'Aggro onto attacker' does nothing for chaser-based creatures (scuttler, spider, crawler, skeleton, robot): being shot from outside their FOV does not trigger a chase
- src/entities/creatures.js:406
- fix: In damage(), when `by` is a player id (this.game.aiPlayerById(by)) and the creature is not a hazard, set c.target = by, c.lostT = 0, and for chaser-style states (idle/walk) call c.setState('run'). Alternatively, in the chaser idle/walk branch, start the run when c.target resolves to a live player. Do not set c.target to 'explosion' or 'stun'.
- verified fix: Use a one-shot aggro flag. Do not force a state inside damage().

In damage() (creatures.js:405-406), replace the aggro line with:
```js
const attacker = this.game.aiPlayerById(by);
if (attacker) {
  if (!c.target || Math.random() < 0.6) c.target = by;
  c.data.hitBy = by;
  if (c.type === 'spider') c.data.alarm = by; // spider already handles alarm at line 615
}
```
This also stops 'explosion' and 'stun' from being written into c.target.

In chaser() idle/walk (after line 576, before the canSee loop), add:
```js
if (c.data.hitBy) {
  const p = players.find((q) => q.id === c.data.hitBy);
  c.data.hitBy = null;
  if (p && !p.inShip) { c.target = p.id; c.lostT = 0; c.setState('run'); return; }
}
```

Add the same block to the crawler idle/walk branch (after line 628), also setting `c.data.spd = 3`.

Because the flag is consumed only when the behavior runs, a taser stun delays the aggro until the stun ends (line 554 sets idle, then the next tick picks the flag up). A creature that loses its target never re-acquires it through walls.

Optional: also clear `c.target = null` on crawler lines 635 and 639 for consistency. | In CreatureManager.damage() (creatures.js:405-406), only record aggro when the attacker is a real player. Replace line 406 with:

const atk = typeof by === 'string' ? this.game.aiPlayerById(by) : null;
if (atk) { if (!c.target || Math.random() < 0.6) c.target = by; c.data.aggroBy = by; c.data.aggroT = 8; }

This drops the 'explosion' and 'stun' targets. Do not change the state here, so a stun is kept.

Then consume the marker only in the behaviors that need it. Put the check at the top of the idle/walk branch of chaser() (before line 579), of the spider (before line 617) and of the crawler (before line 631):

if (c.data.aggroBy) {
  c.data.aggroT -= dt;
  const p = players.find((q) => q.id === c.data.aggroBy); // spider: M.playersFor(c)
  const id = c.data.aggroBy;
  if (c.data.aggroT <= 0 || !p) c.data.aggroBy = null;
  else if (!p.inShip) { c.data.aggroBy = null; c.target = id; c.lostT = 0; c.setState('run'); /* crawler: c.data.spd = 3; */ return; }
}

Because a stunned creature skips its behavior (line 552-556), the marker survives a taser stun and fires once the creature is back in idle.

Also make the crawler's disengage clear its state the way chaser does:
- line 635: if (!p || p.inShip) { c.target = null; c.lostT = 0; c.setState('idle'); return; }
- line 639: if (c.lostT > 5) { c.target = null; c.lostT = 0; c.setState('idle'); return; }


## [minor] (creatures) Host re-runs A* every frame for creatures that hear a noise or whose target is unreachable
- src/entities/creatures.js:581
- fix: In the hear branch, only re-path if !c.dest or c.dest.distanceTo(n.pos) > 2 (or when c.repath <= 0). In goTo, on failure keep c.path = [] and set c.repath = 1 + Math.random(), and in moveToward only retry when c.repath <= 0 instead of checking `!c.path`.
- verified fix: Add a flat-distance helper and use it in the new guards:
  const flatD = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

1) goTo (creatures.js:471-478): on failure, keep an empty path and wait before retrying:
  if (nav) { const p = nav.findPath(c.pos.x, c.pos.z, x, z); c.pathIdx = 0; if (p) { c.path = p; c.repath = 0.8 + Math.random() * 0.4; } else { c.path = []; c.repath = 1 + Math.random(); } } else { c.path = [{ x, z }]; c.repath = 0.8 + Math.random() * 0.4; }

2) moveToward (523): drop `!c.path` and use the flat distance:
  c.repath -= dt;
  if (c.repath <= 0 || (c.dest && flatD(c.dest, target) > 2.5)) this.goTo(c, target.x, target.z);
  This works on the first call because c.repath starts at 0.
  Optional: also require c.repath < 0.5 for the drift condition, so a moving target behind a locked door cannot force a failed search every ~0.4 s.

3) chaser hear branch (580-581):
  const n = M.hear(c, hearR);
  if (n && (!c.dest || flatD(c.dest, n.pos) > 2)) { M.goTo(c, n.pos.x, n.pos.z); c.setState('walk'); }
  The existing `c.state !== 'run'` check is always true here and can go.

4) hound (852-857): apply the same guard:
  if (n) { const loudish = n.loud > 0.45; c.data.last = n.pos.clone(); c.setState(loudish ? 'run' : 'sniff'); if (!c.dest || flatD(c.dest, n.pos) > 2) M.goTo(c, n.pos.x, n.pos.z); } | In goTo (creatures.js:474-478), on failure store an empty path instead of null and back off longer:
`const p = nav.findPath(...); c.path = p || []; c.pathIdx = 0; c.repath = p ? 0.8 + Math.random() * 0.4 : 1 + Math.random();`
An empty path makes follow() return true, which is the same "stand still" behaviour as today.

In moveToward (line 523), drop the `!c.path` test. c.repath starts at 0 in the HostCreature constructor, so the first call still paths:
`c.repath -= dt; if (c.repath <= 0 || !c.dest || Math.hypot(c.dest.x - target.x, c.dest.z - target.z) > 2.5) this.goTo(c, target.x, target.z);`
(The XZ distance also fixes the same 3D-distance quirk here.)

In the chaser hear branch (line 581), throttle using XZ distance and a timer that this branch decrements itself:
`c.repath -= dt; if (n && c.state !== 'run') { if (!c.dest || c.repath <= 0 || Math.hypot(c.dest.x - n.pos.x, c.dest.z - n.pos.z) > 2) M.goTo(c, n.pos.x, n.pos.z); if (c.path && c.path.length) c.setState('walk'); }`
The `c.path.length` guard stops the idle/walk flip on every tick when the noise is unreachable.

Leech's `!c.path || M.follow(...)` (line 810) keeps working with [], because follow([]) 

## [minor] (ui) TEC 'easier minigames' does nothing: `...opts` overrides the eased difficulty
**FIXED (round 3)** - actions.js spreads opts first; fishing fish difficulty eased too; arcade opts out (noEase).
- src/game/actions.js:942
- fix: Spread first: `factory({ ...opts, container: layer, rng: Math.random, difficulty: clamp((opts.difficulty ?? 0.4) - this.stats.minigameEase, 0, 1), sfx, onDone })`. For fishing, also subtract the ease from fish.difficulty, since createFishing averages the two.
- verified fix: In actions.js:941, put the spread before the computed fields: `const eased = clamp((opts.difficulty ?? 0.4) - this.stats.minigameEase, 0, 1); const mg = factory({ ...opts, container: layer, rng: Math.random, difficulty: eased, sfx: (n) => {...}, onDone: (res) => {...} });`. In startFishing:984, also ease the fish: `fish: { ..., difficulty: Math.max(0, fish.difficulty - this.stats.minigameEase) }`. Otherwise fishing.js:255 averages the eased value with the raw fish difficulty and only half the ease applies. Slots ignores difficulty, so it needs no change. You may want to leave arcade un-eased (pass a flag or skip the ease for kind === 'arcade'), because arcade score feeds progress.arcade and achievements.

## [minor] (ui) Terminal loses focus on Tab and ESC can no longer close it
**FIXED (round 3)** - main.js Escape closes the terminal; terminal.js Tab hook keeps focus.
- src/game/terminal.js:47
- fix: In the terminal keydown handler: `if (e.key === 'Tab') { e.preventDefault(); return; }`. In main.js, handle Escape for the terminal globally: `if (g.terminal.active) { g.terminal.close(); e.preventDefault(); return; }`, placed before the isTyping() early-return or in a capture listener.
- verified fix: In terminal.js:47, inside the input's keydown handler right after `e.stopPropagation();`, add:
`if (e.key === 'Tab') { e.preventDefault(); return; }`
This covers Shift+Tab too.

In main.js:133, change the Escape branch to:
`if (e.code === 'Escape') { if (this.ui.panelOpen) { this.ui.closePanel(); e.preventDefault(); } else if (g.terminal.active) { g.terminal.close(); e.preventDefault(); } return; }`
The existing `isTyping()` early-return is fine, because when the terminal input has focus its own handler already handles Escape.

Optional hardening in terminal.js ensureDom: `this.inp.addEventListener('blur', () => { if (this.active) setTimeout(() => this.active && this.inp.focus(), 0); });` | Primary fix, in src/game/terminal.js inside the .term-in keydown handler, before the sfx else-branch: `else if (e.key === 'Tab') { e.preventDefault(); }`. This keeps focus in the terminal; it could later host autocomplete.

Defensive fallback for focus that was lost some other way, such as clicking a HUD element above the overlay: in src/main.js, handle the terminal inside the existing Escape branch, before the panel check: `if (e.code === 'Escape') { if (g.terminal.active) { g.terminal.close(); e.preventDefault(); return; } if (this.ui.panelOpen) {...} return; }`. It does not need to go before the isTyping() return. When .term-in has focus, its own handler already stopPropagation()s, so the event never reaches window and there is no double close.

Optionally, also refocus on stray blur, e.g. `this.inp.addEventListener('blur', () => { if (this.active) setTimeout(() => this.active && document.hasFocus() && this.inp.focus(), 0); })`, so the terminal always keeps its caret while it is open.

## [minor] (ui) Key-rebind capture listener leaks: closing the panel or clicking two binds silently rebinds later keys
- src/ui/ui.js:373
- fix: Keep a single `this.pendingBind` handler: remove the previous one before adding a new one. Remove it in closePanel(), showMenu() and render(). In h, use stopImmediatePropagation and reject or swap a code already used by another action.
- verified fix: In src/ui/ui.js, keep one pending capture handler on the UI instance:
- Add `cancelBind() { if (this.pendingBind) { window.removeEventListener('keydown', this.pendingBind, true); this.pendingBind = null; } }`.
- In the bind click (line 373), call `this.cancelBind()` first. Then set `this.pendingBind = h` and `window.addEventListener('keydown', h, true)`.
- In `h`, call `e.preventDefault(); e.stopImmediatePropagation(); this.cancelBind();`. On Escape, just call `render()`. Otherwise, if another action already uses `e.code`, swap them: `const other = Object.keys(s.keys).find(a => a !== action && s.keys[a] === e.code); if (other) s.keys[other] = s.keys[action];`. Then set `s.keys[action] = e.code; apply(); render();`.
- Call `this.cancelBind()` at the start of `closePanel()` and `showMenu()`, and in the settings tab-switch handler (or at the top of the settingsPanel `render()`). This covers leaving the panel by any route: the Close/BACK buttons, Esc through main.js:134, and tab changes.

## [minor] (ui) hostGame throws a TypeError and leaks a LobbyDirectory when session start fails
**FIXED (round 3)** - main.js startGame returns true/false; hostGame bails out on failure.
- src/main.js:168
- fix: Have startGame return true/false (or rethrow), and in hostGame do `if (!(await this.startGame(...)) || !this.game) return;` before touching the lobby directory.
- verified fix: The reviewer's fix is correct. In startGame, return false from the catch block (after leaveGame()) and return true at the end of a successful start. In hostGame: `const ok = await this.startGame({ ...opts, host: true, code }); if (!ok || !this.game) return;` and put this before the isPublic/startLobbyBrowser block. No extra cleanup is needed, since leaveGame() already calls stopLobbyBrowser(). Optionally, add `.catch(console.error)` at the ui.js:163 and main.js:113 call sites so any future error is not left as an unhandled rejection.

## [minor] (ui) Grab beam and medkit heal stick after any UI interruption (mouse-up is never processed)
**FIXED (round 3)** - actions.js releases grab + heal whenever gameplay input is disabled.
- src/game/actions.js:90
- fix: In the !input.enabled branch: `if (this.grab?.item) this.grab.stop(); this.healing = null;` (and likewise when !input.locked if desired).
- verified fix: 1. **actions.js:90**, in the disabled-input branch:
```js
if (!input.enabled) {
  this.swingCharge = 0;
  this.healing = null;
  if (this.grab.item) this.grab.stop();
  return;
}
```
This matches how `swingCharge` is already reset there. The grab is released as soon as chat, a panel, the terminal or a minigame opens.

2. **`GrabBeam.start`** (actions.js:28): stop any existing grab or hum before starting, so calling `start()` again cannot leak the looping sound. Add this as the first line:
```js
if (this.item) this.stop(); else { this.hum?.stop(0.1); this.hum = null; }
```

3. **Optional, closes the related free-heal exploit:** in `useHeldHold`, drop a heal whose medkit is no longer held:
```js
if (this.healing && this.healing.it !== this.player.heldItem()) this.healing = null;
```
Or clear `this.healing` in `switchSlot` and `dropHeld`. Without this, you can still drop a medkit (G) while holding LMB mid-heal and get the heal without using the medkit, with no UI interruption involved. | In `actions.js` `localActions`, release everything whenever gameplay input is off:

```js
if (!input.enabled) { this.swingCharge = 0; this.healing = null; if (this.grab.item) this.grab.stop(); return; }
```

A more general alternative is to drop the grab whenever LMB is not physically down, after the `mouseUp(0)` block: `if (this.grab.item && !input.mouseButtons.has(0)) this.grab.stop();`. This works because `mouseButtons` is cleared on unlock and on window blur.

Also make `GrabBeam.start()` idempotent, so a re-grab through E or LMB can't orphan the looping hum. Put this at the top of `start(it)`: `if (this.item === it) return; if (this.item) this.stop(); this.hum?.stop(0.1);`. Alternatively, skip the `interact` action when `target.bigItem === this.grab.item`.

## [minor] (ui) Lobby browser shows HTML entities: default lobby 'Name's crew' renders as 'Name&#39;s crew'
- src/ui/ui.js:193
- fix: Drop escapeHtml when the value goes into a text node: `el('div', { class: 'l-name' }, (l.locked ? '🔒 ' : '') + String(l.name || '?'))`, and likewise for l.host and p.name.
- verified fix: The proposed fix is correct. For robustness, since the lobby data comes from untrusted remote peers, wrap the values in String():
- ui.js:193: `el('div', { class: 'l-name' }, (l.locked ? '🔒 ' : '') + String(l.name || '?'))`
- ui.js:194: `el('div', { class: 'l-host' }, 'host: ' + String(l.host || '?') + ` (Lv.${l.level || 1})`)`
- ui.js:115: `el('div', {}, `${p.name} · Lv.${p.level} ${rankOf(p.level)}`)`

Keep escapeHtml everywhere a value is concatenated into an innerHTML string (ui.js:602/606/628/638, hud.js:92/245, terminal.js:88). Those uses are correct. | The fix is correct as proposed. In src/ui/ui.js:
- Line 193: `el('div', { class: 'l-name' }, (l.locked ? '🔒 ' : '') + String(l.name || '?'))`
- Line 194: `el('div', { class: 'l-host' }, 'host: ' + String(l.host || '?') + ` (Lv.${l.level || 1})`)`
- Line 115: `${p.name} · Lv.${p.level} ...` with no `escapeHtml`.

Keep `escapeHtml` in the places that feed `innerHTML`: lines 602, 606, 628 and 638, plus hud.js and terminal.js. Removing it there would create an XSS hole.

## [minor] (ui) Arcade 'daily' XP cap resets on every rejoin
**FIXED (round 3)** - same fix as the economy entry above (profile.js hook).
- src/game/profile.js:83
- fix: Persist the cap in the profile: `const s = this.p.stats; if (s.arcadeDay !== day) { s.arcadeDay = day; s.arcadeXp = 0; }` and update s.arcadeXp.
- verified fix: In Progress.arcade (profile.js:82-85), store the cap on the saved stats object instead of on the Progress instance:
```js
const day = Math.floor(Date.now() / 86400000);
if (s.arcadeDay !== day) { s.arcadeDay = day; s.arcadeXp = 0; }
const xp = Math.min(Math.round(score * 2), 100 - (s.arcadeXp || 0));
if (xp > 0) { s.arcadeXp = (s.arcadeXp || 0) + xp; this.addXp(xp, 'Arcade'); }
this.save();
```
Here `s` is `this.p.stats`, which is already defined at line 80. Optionally, add `arcadeDay: -1, arcadeXp: 0` to the default stats in core/save.js:80. This is not required, because the merge at save.js:96 keeps the new keys anyway. Note that the cap counts XP before `addXp` applies `xpMul`. That behaviour is unchanged by this fix. | In src/game/profile.js arcade(): `const s = this.p.stats; ... const day = Math.floor(Date.now() / 86400000); if (s.arcadeDay !== day) { s.arcadeDay = day; s.arcadeXp = 0; } const xp = Math.min(Math.round(score * 2), 100 - (s.arcadeXp || 0)); if (xp > 0) { s.arcadeXp = (s.arcadeXp || 0) + xp; this.addXp(xp, 'Arcade'); } this.save();` Remove the this.arcadeDay/this.arcadeXp fields. No migration is needed, because loadProfile keeps unknown stats keys.

## [minor] (world) Outdoor main-exit spawn Y is overwritten with terrain height, placing the player 0.18 m inside the entrance landing slab
**FIXED (round 3)** - hook for terrain.js (keep the landing height).
- src/world/terrain.js:279
- fix: Keep the anchor height: `mainExit.spawn.y = Math.max(entDoorPos.y, terrain.heightAt(...)) + 0.05`, or raycast down from above the spawn point against the static colliders.
- verified fix: The proposed fix is correct. In src/world/terrain.js:279, replace
`mainExit.spawn.y = terrain.heightAt(mainExit.spawn.x, mainExit.spawn.z) + 0.1;`
with
`mainExit.spawn.y = Math.max(entDoorPos.y, terrain.heightAt(mainExit.spawn.x, mainExit.spawn.z)) + 0.05;`
The spawn then keeps the anchor height: entranceY + 0.3 (the top of the landing) + 0.05. I simulated this in Rapier 0.21 and it removed the stick at every yaw tested.

A more general alternative is to cast a ray down from spawn.y + 1.5 against G.STATIC and use hit + 0.05, falling back to the terrain height if nothing is hit.

Raise the severity from minor to major (movement soft-stick): at about 28% of entrance orientations the player cannot walk away from the main door after exiting until they jump. | The proposed fix is correct. In src/world/terrain.js:279, replace the line with `mainExit.spawn.y = Math.max(entDoorPos.y, terrain.heightAt(mainExit.spawn.x, mainExit.spawn.z)) + 0.05;`. entDoorPos.y is already the landing top (entranceY + 0.3), so the capsule starts just above the slab. In simulation this removed the stick at every entrance yaw tested. Raise the severity from minor to major: at some seed-dependent entrance yaws, the player cannot walk off the landing after every exit through the main door until they jump.

## [minor] (world) Leech spawn indexes the filtered ceiling-spot list with the unfiltered length, which bypasses the 'far from players' rule
**FIXED (round 3)** - same fix as the creatures entry above.
- src/game/host.js:477
- fix: `const cs = fac.ceilingSpots.filter(farEnough); const s = cs.length ? cs[Math.floor(Math.random() * cs.length)] : null; if (!s) return;`
- verified fix: In host.js:477, replace the line with the following. It draws from the filtered list with the correct length. If every ceiling spot is within 14 m of a player, it picks a random spot from the full list instead of always using ceilingSpots[0], so the power charged at host.js:466 / director.js:438 still produces a leech.

const far = fac.ceilingSpots.filter(farEnough);
const pool = far.length ? far : fac.ceilingSpots;
const s = pool[Math.floor(Math.random() * pool.length)];
if (!s) return;

If you would rather skip the spawn when no far spot exists, `if (!far.length) return;` is acceptable. It spends that power without spawning anything, because powerUsed is never refunded. | Replace host.js:477 with: `const cs = fac.ceilingSpots.filter(farEnough); const pool = cs.length ? cs : fac.ceilingSpots; const s = pool[Math.floor(Math.random() * pool.length)];` Keep the existing `if (!s) return;`. This picks uniformly among the far spots and, like the vent branch, falls back to a random spot only when none are far. The reviewer's version (return when cs is empty) also works, but it spends the power budget without spawning anything. If you use it, refund `this.hostData.powerUsed -= CREATURES.leech.power` before returning, or accept the lost spawn.

## [minor] (world) Company pier's south edge is unguarded and the sea has no collider, so players fall about 375 m to a 'void' death
**FIXED (round 3)** - game.js safetyNets(): falling into the harbour teleports you back to the ship (no death); also guards orbit / FIRED void falls. Geometry unchanged.
- src/world/company.js:25
- fix: Move the south curbs to z = 48.7 and narrow the gap to the dock width (x -4.5..-1.5), and add low side rails on the dock. Alternatively add a sensor or kill plane at the sea height that respawns or drowns the player, instead of relying on the -380 void check.
- verified fix: 1) Catch falls instead of relying on the -380 void check. In LocalPlayer.update (src/entities/localplayer.js, near :222), add: `const cw = this.game.world.company; if (cw && this.pos.y < cw.groundY - 3.5) { this.game.sfx?.('splash', 0.8); this.game.spawnInShip(); this.vel.set(0,0,0); this.minVelY = 0; this.game.ui.toast('The Company fished you out of the harbor.', 'info'); }`. This avoids death, so inventory and scrap are kept. If you want a penalty, instead call damageLocal(20,'fall') after the teleport. Also lower the void threshold for the company to something like -30, so a lethal variant would trigger in about 2 s instead of about 10 s.
2) Company all-dead soft-lock (src/game/host.js:579): in the `run.phase === 'company'` branch, add the same all-dead watchdog as the moon phase. Something like: `const ps = this.aiPlayers(); if (ps.length && ps.every(p => p.dead)) { hd.allDeadT += dt; if (hd.allDeadT > 4) { hd.allDeadT = 0; this.hostBeginTakeoff('alldead'); } } else hd.allDeadT = 0;`. At the company, hostFinishTakeoff already has allDead=false, so no scrap is wiped, and the orbit phase respawns everyone.
3) Geometry (src/world/company.js): move the south curbs to z≈48.7 and make them meet the dock: `box(-24.75, PY+0.4, 48.7, 40.5, 0.8, 0.6)` covers x -45..-4.5 and `box(21.75, PY+0.4, 48.7, 46.5, 0.8, 0.6)` covers x -1.5..45, with matching gb.box visuals. Raise all perimeter curbs to at least 1.1 m so a 0.98 m jump cannot clear them, or add an invisible 2 m collider wall on top. Add rail colliders along both sides of the dock, e.g. `box(-4.6, PY+0.5, 51, 0.15, 1.0, 10)` and `box(-1.4, PY+0.5, 51, 0.15, 1.0, 10)`, leaving the far end open for fishing. Shorten the fallback dock collider at :114 to match the visible deck (z 42..52), e.g. `box(-3, PY-0.15, 47, 3, 0.3, 10)`. | 1) Stop the sea from being lethal. In LocalPlayer.update (src/entities/localplayer.js, next to line 222) or in game.js's per-frame update, add:
`const co = this.game.world.company; if (co && this.game.run?.phase === 'company' && !this.dead && this.pos.y < co.groundY - 3.5) { this.game.sfx('splash', 0.8); this.game.damageLocal(10, 'drown'); if (!this.dead) this.game.spawnInShip(); }`
This teleports the player back to the ship, or to fishPos on the dock, instead of letting them fall to the -380 void check.

2) Remove the soft-lock for any death at the Company. In the company branch of host.js:579-581, add the same all-dead check the moon branch has: if `ps.length && ps.every(p => p.dead)

## [minor] (network) A wrong lobby password fails silently and shows a misleading 'Could not reach the host' after 25 s
**FIXED (round 3)** - game.js shows "Wrong lobby password" 6 s after a password join error; timers cleared on welcome/destroy.
- src/net/transport.js:31
- fix: In installNetHandlers add `net.on('error', (e) => { if (!this.net.connected && /password/i.test(e?.error || '')) { clearTimeout(this.joinTimeout); this.emit('fatal', 'Wrong lobby password.'); } });`.
- verified fix: In src/game/game.js installNetHandlers, add:

```js
net.on('error', (e) => {
  const msg = String(e?.error || e || '');
  if (this.net.isHost || this.net.connected || !/password/i.test(msg) || this._pwFatal) return;
  this._pwFatal = true;
  clearTimeout(this.joinTimeout);
  this.emit('fatal', 'Could not join: the lobby password seems to be wrong (or you entered one for an unlocked lobby).');
});
```

Change the timeout at game.js:95 so it also mentions the password, because in some offer-collision cases only the host sees the decryption error:

```js
this.emit('fatal', 'Could not reach the host. Check the lobby code, password and network mode.')
```

Add `clearTimeout(this.joinTimeout);` at the start of destroy() (game.js:776). | In src/game/game.js installNetHandlers, remember that a password error happened instead of failing right away, and show it through a short grace timer or the existing timeout:

net.on('error', (e) => {
  if (net.isHost || net.connected || this.net !== net) return;
  if (!/password/i.test(e?.error || '')) return;
  if (this._pwErrTimer) return;               // only once; Trystero can report it repeatedly
  this._pwErrTimer = setTimeout(() => {       // grace period, so a stray wrong-password peer can't kick a correct joiner that is about to get 'welcome'
    if (this.net === net && !net.connected) { clearTimeout(this.joinTimeout); this.emit('fatal', 'Wrong lobby password (or this lobby has no password - leave the box empty).'); }
  }, 6000);
});

In onWelcome, next to clearTimeout(this.joinTimeout), add clearTimeout(this._pwErrTimer). Do the same wherever the game is destroyed. The 25 s joinTimeout message at game.js:95 can also check the flag and say 'Wrong lobby password' instead of 'Could not reach the host'.

## [minor] (network) Crewmate voice clips for mimics never decode online, because Trystero delivers binary payloads as Uint8Array
**FIXED (round 3)** - transport.js normalises Uint8Array payloads to ArrayBuffer.
- src/net/transport.js:37
- fix: Normalize in the transport: `bin.onMessage = (data, meta) => { const ab = data instanceof ArrayBuffer ? data : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength); this.onBinary?.(ab, meta?.peerId, meta?.metadata); }`.
- verified fix: The proposed fix is correct as written. In `src/net/transport.js:37`:

`bin.onMessage = (data, meta) => { const ab = data instanceof ArrayBuffer ? data : ArrayBuffer.isView(data) ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) : data; this.onBinary?.(ab, meta?.peerId ?? meta, meta?.metadata); };`

The `ArrayBuffer.isView` guard is optional hardening. Keep the existing `meta?.peerId ?? meta` fallback so peer-id handling does not change. | The proposed transport fix is correct as written. In `src/net/transport.js:37`, replace the line with:

```js
bin.onMessage = (data, meta) => {
  const ab = data instanceof ArrayBuffer ? data : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  this.onBinary?.(ab, meta?.peerId ?? meta, meta?.metadata);
};
```

This keeps the original `?? meta` fallback for the peer id. Optionally, also harden `voice.js` `storeClip` with `if (ArrayBuffer.isView(ab)) ab = ab.buffer.slice(ab.byteOffset, ab.byteOffset + ab.byteLength);` before calling `decodeAudioData`.

## [minor] (network) Late joiners miss some item state: glowstick light and boombox music, yoinker nest ownership, and items carried by creatures
**FIXED (round 3)** - game.js onWelcome applies creatures before items and runs onItemState for lit items; the host derives remote heldNest from its own item state.
- src/entities/items.js:304
- fix: Serialize `nest: it.nest` and restore it in the WorldItem constructor. After creating an 'sp' item with on=true, call `this.game.onItemState?.(it)`. In onWelcome, apply creatures before items. Better still, have the host work out heldNest from its own item state for every player instead of trusting ps.hn.
- verified fix: 1) Nest:
- In src/entities/items.js, add `this.nest = data.nest || null;` to the WorldItem constructor, near line 30.
- In serialize (line 306), add `nest: it.nest || undefined`.
- For more robust anger detection, have the host stop trusting ps.hn for remote players. In game.js:417, work out heldNest for each remote from the host's own items, e.g. `[...this.items.all()].filter(it => it.holder === r.id && it.nest).map(it => it.nest)`. The host already tracks holders through 'held' events and sets it.nest itself (host.js:692).

2) Item state on spawn: in items.js 'sp' (after line 151), add `if (it.on) this.game.onItemState?.(it);`. This gives floor glowsticks their light and starts a playing boombox's music immediately instead of after the next battery sync. It also covers a boombox that is still playing after its holder left. At welcome time, this.lights (a LightPool, game.js:40) and this.audio already exist.

3) Creature carry: in src/game/game.js onWelcome, move the loop `for (const c of d.creatures || []) this.creatures.onEvent(c);` above the items loop (line 189). Alternatively, after both loops, re-run `this.onItemHeld(it, it.holder, null)` for every item whose holder starts with 'c:'.

## [minor] (network) A creature's looping sounds for its current state never start when its view is created, e.g. no jester winding music for late joiners
- src/entities/creatures.js:100
- fix: After the model is built, start the loops for the initial state: e.g. set `this.state = null` and call `this.setState(d.st || 'idle')` (skipping the one-shot STATE_SOUNDS for that first call), or start the LOOPS entries whose state equals d.st.
- verified fix: Make loop handling depend on the state and on volume, then start the loops for the initial state from the constructor.

(1) In the constructor, have startLoops start the loops for the current state:

```js
startLoops() {
  for (const [st, snd, vol] of LOOPS[this.type] || [])
    if (st === '*' || st === this.state) this.setLoop(snd, vol);
}
```

This needs no setState call, so there are no one-shot sounds and no onCreatureState call. It also picks the 'hidden' entry at 0.25 for the sand kefal.

(2) Make setLoop update the volume of a loop that already exists, instead of returning:

```js
setLoop(snd, vol) {
  const h = this.loops.get(snd);
  if (h) { h.setVolume(vol * (this.mgr.game.audio.meta(snd).vol ?? 1), 0.2); return; }
  ...
}
```

(3) In setState, build the wanted loops as a map from sound name to volume, using only the entries for the new state (or '*'):

```js
const want = new Map();
for (const [ls, snd, vol] of loops)
  if (ls === st || ls === '*') want.set(snd, vol);
for (const [snd, vol] of want) this.setLoop(snd, vol);
for (const [ls, snd] of loops)
  if (ls !== '*' && !want.has(snd)) this.stopLoop(snd);
```

With this, the sand kefal plays at 0.25 when hidden, rises to 1.0 in rumble, and stops on emerge. This holds both for views that start mid-state and for later state changes. | In src/entities/creatures.js:142-146, change `startLoops` so it also starts loops for the creature's initial state:
```js
startLoops() {
  for (const [st, snd, vol] of LOOPS[this.type] || []) {
    if (st === '*' || st === this.state) this.setLoop(snd, vol);
  }
}
```
The constructor already calls `startLoops()` after `this.state = d.st || 'idle'` and after `this.root` is set (line 139), so nothing else needs to change. `setLoop` skips any loop already in `this.loops`. The first `setState` to a new state stops loops that no longer apply (lines 163-166). This change plays no one-shot STATE_SOUND and does not call `onCreatureState` on spawn or join.

## [minor] (network) Full-mesh traffic has no relay and no TURN, so a failed client-to-client link silently desyncs players
**FIXED (round 3)** - session.js: clients report direct links, the host relays ps/pst/pinfo/itst/is/chat/fx/modmsg/ping to peers without a link; host broadcasts pleft for ghost cleanup. TURN still not configurable.
- src/net/transport.js:27
- fix: Have each client report its directly connected peer set (in hello or pinfo). On the host, relay client-originated types (ps, pst, pinfo, itst, is, chat, fx) to accepted players missing a direct link to the sender, wrapped as {t:'relay', d:{from, m}}. Expose a TURN option (turnConfig) in settings and pass it to joinRoom.
- verified fix: 1) TURN: in transport.js:27-29, when settings provide TURN servers, add `cfg.turnConfig = settings.turnServers` (Trystero 0.25 appends it to the default STUN list, see peer.mjs). Pass it through makeTransport/Session.
2) Surface the failure: in game.installNetHandlers add `net.on('error', (e) => this.ui.toast('P2P link failed: ' + (e?.error || 'peer unreachable') + ' - a TURN server may be needed', 'bad'))`.
3) Relay (host side):
   - Clients include `links: [...transport.peers]` in hello, and resend it in a periodic 'links' message.
   - For each client-originated message type (ps, pst, pinfo, itst, is, chat, fx) the host receives from sender S, it calls `transport.send({t:'relay', d:{from:S, m:{t,d}}}, X)` for every accepted player X that does not list S in its links.
4) Relay (client side): in Session.receive, when `t==='relay' && from===this.hostId`, unwrap it and call `this.receive(d.m, d.from)`. Only accept relays whose from is the host, and never let a relayed m.t be 'hello', 'req' or 'relay'. When a relayed player first appears, also set `this.players.set(d.from, info)` from a relayed pinfo/hello copy, so that onPlayerState's `net.players.get(from)` gives a name.
5) Leave cleanup (needed even without relay): in hostOnPlayerLeave, `this.net.broadcast('pleft', {id}, false)`. Clients handle 'pleft' by disposing `remotes.get(id)`, calling voice.removePeer(id) and deleting net.players(id), so the frozen ghosts created from the welcome roster get removed.
6) Voice cannot be relayed cheaply. With no TURN configured, accept that A and B cannot hear each other in this case, and say so in the step 2 toast. | 1. **Quickest fix, also covers voice.** In transport.js around line 27, add `if (opts.turnConfig?.length) cfg.turnConfig = opts.turnConfig;`. Thread a user-editable TURN list from settings through makeTransport, Session and game.js. MediaStreams cannot be relayed by the host, so this is the only way to get voice working between peers that can't link.

2. **Report links.** Each client sends `request('links', { ids: [...transport.peers] })` to the host on every onPeerJoin and onPeerLeave (session.js:32-42). The host stores `links[from] = Set`.

3. **Host relays.** In the host's receive path (before dispatch in session.receive, or as a wrapper), when `this.isHost` and `t` is in RELAY = {ps, pst, pinfo, itst, is, chat, fx, modmsg}, forward the message. For each accepted player `q` other than `from` or self, where `links[from]` lacks `q` or `links[q]` lacks `

## [minor] (mods) brutal-events NIGHT SHIFT spawns only one outdoor group on low-tier moons, whatever the severity
- public/mods/brutal-events.js:59
- fix: Reset the budget before each call: `for (let i = 0; i < n; i++) { hd.outPowerUsed = 0; g.hostSpawnOutdoor(); } hd.outPowerUsed = before;`. Or add a `force` parameter to hostSpawnOutdoor that skips the budget check.
- verified fix: The reviewer's fix is correct as written. In public/mods/brutal-events.js:57-60, use `const before = hd.outPowerUsed || 0; for (let i = 0; i < n; i++) { hd.outPowerUsed = 0; g.hostSpawnOutdoor(); } hd.outPowerUsed = before;`. A cleaner option is an opt-in `force` parameter in host.js:508, `hostSpawnOutdoor(force = false)` with `if (!force && this.hostData.outPowerUsed >= budget) return;`. The mod then calls g.hostSpawnOutdoor(true) and saves/restores outPowerUsed as it already does. One correction to the scenario: on lufer (budget 3) the event produces 1-2 groups, not always 1. The cap applies on every moon, not only low-tier ones. | The fix is correct as proposed. In public/mods/brutal-events.js:59 use `for (let i = 0; i < n; i++) { hd.outPowerUsed = 0; g.hostSpawnOutdoor(); } hd.outPowerUsed = before;`. Alternatively, give hostSpawnOutdoor(force) an optional parameter that skips the check at host.js:514. One correction to the scenario: on Lufer the event can spawn up to 2 groups (hound or mimic first, then one more), not always 1. Severity still has no effect there.

## [minor] (mods) too-many-emotes: party-emote music keeps looping forever when that player leaves mid-emote
- public/mods/too-many-emotes.js:86
- fix: Keep a module-level Set of remotes that have tmeMusic. Each update, stop and forget music for any remote not in game.remotes (`if (!game.remotes.has(r.id)) { r.tmeMusic?.stop(0.3); set.delete(r); }`). Or wrap r.dispose in patchRemote so it stops tmeMusic first.
- verified fix: In patchRemote (too-many-emotes.js:57), also wrap dispose so the music stops when the avatar is torn down:
```js
const origDispose = r.dispose;
r.dispose = function () { this.tmeMusic?.stop(0.3); this.tmeMusic = null; return origDispose.call(this); };
```
Every remote goes through patchRemote in the update loop before it can start music at :86, so all music-owning remotes get this wrapper. If you use the Set approach instead, check `game.remotes.get(r.id) !== r`, not `!game.remotes.has(r.id)`, so a rejoin under the same peer id still stops the orphaned handle. | Keep a module-level `const musicOwners = new Set();` in init(). At line 86, after creating the handle, add the remote with `if (r.tmeMusic) musicOwners.add(r);`. In resetRoot, and wherever tmeMusic is set to null, also call `musicOwners.delete(r)`. At the top of the 'update' handler, add:
`for (const r of musicOwners) if (game.remotes.get(r.id) !== r) { r.tmeMusic?.stop(0.3); r.tmeMusic = null; musicOwners.delete(r); }`
This checks object identity rather than only `remotes.has(r.id)`, so it still works if the same id ever maps to a new RemotePlayer. A simpler alternative is to wrap dispose once inside patchRemote: `const od = r.dispose; r.dispose = function () { this.tmeMusic?.stop(0.3); this.tmeMusic = null; return od.call(this); };`. Remotes are patched on the first update after they are created, and peerLeave always calls r.dispose() before deleting the remote.

## [minor] (mods) lethal-things Signal Flare does not attract creatures during its burn: it makes one short noise at the thrower's head
- public/mods/lethal-things.js:101
- fix: In the 'update' handler, when game.isHost, add a host noise at each burning flare's world position every ~2 s: `game.creatures.noise(it.obj.getWorldPosition(v), 1.0)`. For late joiners, call game.onItemState(it) for flares that have `on` after the welcome, or check `it.on && !it.glow` in the update loop.
- verified fix: (a) Make the noise on the host, at the flare's position, for as long as it burns. In the 'update' handler, add `const v = new api.THREE.Vector3();` outside the loop, then inside it add `if (game.isHost && game.time >= (it.kmodNextNoise || 0)) { it.kmodNextNoise = game.time + 2; game.creatures.noise(it.obj.getWorldPosition(v), 1.0); }`. `noise()` clones the position, so reusing `v` is safe. Only the host emits, so peers do not create duplicate noises. Remove the eye-position `net.request('noise', ...)` at line 101. The first host tick after ignition covers it, at the flare's location instead of the thrower's head.

(b) Sync the burnt state so late joiners get it right. In `extinguish()`, have the host run `it.on = false; it.charges = 0; game.net.broadcast('itst', { id: it.id, on: false, c: 0 });`. Both fields travel through `serialize()`/`onState`. In the `useHeldPress` override, treat `it.kmodBurnt || it.charges === 0` as spent. In the `onItemState` override, handle `!it.on` by calling `extinguish()` if `it.glow` is set, and skip ignition when `it.charges === 0`.

(c) Pick up already-lit flares on join. The simplest general fix is in the base game: in `game.onWelcome`, after line 189, add `for (const it of this.items.all()) if (it.on) this.onItemState(it);`. That also fixes glowsticks and boomboxes for late joiners. A mod-only alternative is to scan `game.items.all()` in 'update', throttled to about 1 s, and call `game.onItemState(it)` for `type==='flare' && it.on && !it.glow && it.charges !== 0`.

A joiner will still get a full-length timer, because the remaining time is not synced. That is acceptable, since the host's `itst {on:false}` at burn-out turns the flare off for everyone. | 1) Make the burning flare attract creatures, on the host only. In the `api.on('update', ...)` loop in lethal-things.js, after the `left <= 0` check, add:
```js
if (game.isHost) {
  it.kmodNoiseT = (it.kmodNoiseT || 0) - dt;
  if (it.kmodNoiseT <= 0) {
    it.kmodNoiseT = 1.5; // shorter than a noise's 1.2 s life plus a small gap, so the lure stays close to continuous
    const pos = it.holder ? game.aiPlayerById(it.holder)?.pos : it.obj.getWorldPosition(new api.THREE.Vector3());
    if (pos) game.creatures.noise(pos, 1.0);
  }
}
```
This works because the host's `burning` set already holds every peer's flares: 'itst' leads to `items.onState`, which calls the overridden `game.onItemState`.

2) Late joiners (core fix; it also repairs glowsticks and boomboxes). In src/game/game.

## [minor] (mods) lethal-casino places the roulette table outside the HQ building, not in the casino corner
- public/mods/lethal-casino.js:83
- fix: Place the table relative to the company layout, for example derived from `c.slots[0].position` or from a hall-relative anchor: about x = -11, z = -27 inside the hall next to the slots, checked against nearby colliders. Better, have buildCompany export a `casinoAnchor` that the mod reads.
- verified fix: At lethal-casino.js:83, place the table inside the hall next to the slots. For example: `const s = (c.slots || []).find(Boolean); const pos = new THREE.Vector3(-10.8, PY, s ? s.position.z + 1.6 : -27);`. With no slot object this falls back to about (-10.8, PY, -27), which keeps roughly 1.3 m between the table collider and the slot-machine use spots at x=-13.6. The long-term option is for buildCompany to export a `casinoAnchor` (e.g. new THREE.Vector3(-10.8, PY, bz + 2)) that the mod reads instead of a hard-coded constant. | In lethal-casino.js mapLoaded (line 83), place the table from the company's own layout instead of hard-coded pier coordinates. For example:
  const s = c.slots?.[1]?.position;  // middle slot machine, about (-14.5, PY, -30.8)
  const pos = s ? new THREE.Vector3(s.x + 4, PY, s.z) : new THREE.Vector3(-10.5, PY, -30.8);
With the existing rotation.y = PI/2, the collider (half-extents 0.68 x 1.22) covers x -11.18..-9.82 and z -32..-29.6. That is inside the hall, about 3 m clear of the slot-machine fronts (about x=-14.2), so a player fits between them. It is also clear of the sell counter and sell zone (x about 0, z -35.8), the bounty board (-8, -21.5) and the market stall (x=11). The table's interactable stays about 3.1 m from the slot interactables at x=-13.6, so the prompts do not overlap. Leave the collider and light calls as they are, since they already use pos. Optionally, have buildCompany return a `casinoAnchor` Vector3 and read that instead, so a future layout change cannot move the table out of the hall again.
