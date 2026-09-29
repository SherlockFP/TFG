# Wave 6 - algo2: the Algorithm's live stream (hype, ghost replay, glitch exploits)

Module `algo2` (`src/game/algo2.js` glue, `algo2_core.js` pure rules, `algo2_view.js` rendering, `algo2_i18n.js` EN/TR/RU + chat pools). Installed in `game.js` at `[import:algo2]` / `[slot:algo2]` right after algo1. MASTERPLAN §21, §23.3, §23.5, §23.6. Builds on `algo1` (viewer counter, `tfg:viewers`).

## 1. Live stream hype (§23.3)
- Host keeps **hype** per facility day (reset when the moon is populated). Acts and their base points (`HYPE.pts`; each repeat of the same act is worth x0.75, floor 25 %, plus a per-act cooldown):
  near-death escape 12 (algo1 event), dodging a locked NPC shot 10 (aimtell aim `lock -> idle`, target > 1.1 m from the locked point), fake-closet knock 12 (host spy on the `hrfx` knock broadcast), extraction with < 10 s left on the clock 18 (a player who was outside within 30 s is aboard at takeoff), shutting a door with a chaser within 6 m and the shutter within 4.5 m 8, boss hit 4 (algo1 event), sprint-away 6 (algo1 event), glitch use 5, death 3.
- The new acts also raise the algo1 viewer count (`VIEW_GAIN` gets `dodge/door_shut/closet/late_extract/glitch`, extended at runtime from algo2).
- **Tiers** (`HYPE.tiers` 25 / 60 / 110): bronze, silver, gold. **Payout at extraction** (wrapper on `hostFinishTakeoff`, only players aboard, never when everyone died): Clout `30/80/160 + 15/30/50 per quota index (max 6)` + XP `20/50/100`; silver adds a **sponsor drop** crate (`supply`, uncommon), gold a rare one. Crates are personal profile crates (`daily_core.grantCrate`, opened in DAILY [B]).
- **Wants more show:** silver or better (and quota > 0) sets `run.a2.want = 1`; next landing the host adds ONE small creature (power <= 1.5, from the moon's table) and the intercom says so.
- **Fake chat:** corner panel (`hudDock('left','a2feed')`, `.a2-feed`): tier + 10-segment hype bar + last 4 lines (EN/TR/RU pools in `algo2_i18n.js`, 16 fake handles, dark humour, <= 46 chars). Client side only, rate-limited (>= 1.1 s apart, max 4 per 8 s, ambient line every 9-18 s). Setting: Settings > Gameplay > HUD > "Live stream chat feed" (`settings.a2Feed`, default on; hides the whole panel).

## 2. Ghost replay (§23.5)
- Host records every player in the facility at 10 Hz (ring of 101 samples = 10 s; cleared while dead / in the ship / outside). On death (`hostOnPlayerDied` wrapper, not `left`) the last track is **packed** (`packTrack`: 0.1 m / 1/256-turn deltas, 8 base64 chars per sample, ~800 chars, JSON < 900) into `run.a2.ghosts[moon]` with name, day, the death offset from the entrance and the value of scrap they were carrying. Max 3 per moon (oldest dropped), plays once, only on a later day, expires after 8 days. Saved with the run.
- **The facility layout changes every landing** (the seed is random per lever), so the ghost is not placed at the old world coordinates: the anchor is the nearest real spot (vent / scrap spot, >= 12 m from the entrance, ghosts >= 6 m apart) to `entrance + recorded offset`, and the 10 s path replays relative to it (looping with a 2.5 s hold).
- On `moonPopulated` the host takes the ghosts, picks anchors, broadcasts them (`gh`), spawns one scrap cache next to each ghost whose owner carried loot, and (quota > 0, first 150 s of the day) sends a creature noise (loudness 0.45) at every ghost anchor every 6 s: creatures drift toward it. Quota 0: cosmetic only, no lure.
- Cheap rendering: max 3 avatar clones (`createAvatar`, ONE shared translucent `MeshBasicMaterial`), culled beyond 70 m, animated only inside 45 m, a beam + gem "dropped loot" marker (one shared additive material) and a canvas name label. No lights.

## 3. Glitch exploits v1 (§23.6)
- 1-3 per landing, seeded from `run.seed` + day (every peer computes the same plan from the facility spots; `planGlitches` sorts the pool): a **wall** (two flickering panels far apart; E steps you through to the other one, 16-50 m away in another room, reusable up to 8 times), a **duplication shelf** (hold a scrap item, E copies it once), a **freeze pixel** (E stuns non-boss creatures within 16 m for 5 s, once). The host validates distance, holder and item; effects run on the host (`a2req` -> `a2s` `tp` / `fz` / item spawn).
- **Patch meter** (crew-wide, `run.a2.patch`): wall +16, dup +40, freeze +30; cools by 25 per landing. At 100 % the Algorithm patches: every remaining glitch of the day disappears, 3.5 s later a punishment: **lights out** for 40 s (always this in quota 0) or a **short swarm** (2-3 small creatures + a noise on the crew, never in quota 0; 50/50 with lights; a blackout day gets a swarm instead).
- Visual: one `ShaderMaterial` per glitch kind (band tears, block flicker, scanlines, on/off flicker; shared time uniform), no new lights. Meshes live in the facility group.

## Net (prefix `a2`)
`a2req` client -> host `{op:'use', id, item?}`. `a2s` host -> everyone `{k}`: `h` hype `{h,t,e}` (e = the act, drives the chat), `g` glitch/patch state `{meter,patched,used,wall}`, `gh` ghosts `{list:[{a,tr,n,loot}]}`, `tp` `{to,p,yaw}`, `fz` `{p}`, `pay` `{ids,tier,coin,xp,crate}`, `say` intercom line (English key + vars). Joiners get `h`, `g`, `gh` via `playerJoin`. State: `run.a2 = { ghosts, patch, want }` (host).

## How to test
- `node tools/harness/algo2.test.mjs` (1564 checks: hype maths / cooldowns / diminishing returns, tier payouts, late-extract clock, chat gate + pools + TR/RU coverage, ghost pack/unpack/replay timing/loop/recorder/store/anchors, glitch plan determinism + patch meter rules + punishment).
- `tools/harness/wave6_algo2.js` (headless body: lands, checks glitch meshes + panel, adds hype, uses a glitch, records + kills + pays out + relands to replay the ghost). Debug: `game.algo2.debug.hype('dodge')`, `.glitches()`, `.hostUse({id}, selfId)`, `.ghosts()`, `.store()`.
- Knobs: `HYPE`, `PAY`, `GHOST`, `GLITCH`, `PATCH` in `algo2_core.js`; `game.config.algo2 = false` disables everything, `game.config.algo2Glitch = false` only the glitches.

## Known gaps
- Not hand-played, no 2-player run; ghost / glitch looks not tuned at 1280x720.
- The dodge test is heuristic (target far from the locked point when the shot resolves), not "the shot really missed".
- A ghost has no death pose and no voice; the dropped-loot marker is one fresh scrap cache, not the exact items.
- The wall glitch is a paired hop (teleport), not a real hole in a wall: the facility colliders are static.
- Peers that join mid-day get the state via `playerJoin`; a host migration drops the recorder (the store in `run.a2` survives if the run is saved).
- Hype is per day and not saved.
