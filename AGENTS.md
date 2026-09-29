# AGENTS.md — handoff guide for the next AI / developer

> Read this first. It explains what **TFG — TOTALLY FUCKED GAME** is, how the code is organised, how to run
> and test it, what state everything is in, and what to do next. Keep it updated when you finish work.
> The owner (the user) writes in **Turkish**; answer in Turkish. UI text is English with Turkish translations.

## 0. START HERE (new AI / developer taking over)

> **Newest summary: read `docs/HANDOFF.md` first** (identity, owner rules, architecture, workflow, current state, wave 5 plan in `docs/MASTERPLAN.md` §25-§26).
**Project folder:** `D:\KefalCompany` (Windows). Dev server: `npm run dev` → http://localhost:5173.

Reading order (≈15 min):
1. **This file** top to bottom — especially §5.2 (work that was in progress at handoff) and §6 (what to do next).
2. `docs/CRITIQUE.md` — honest list of what feels bad and what is planned (update it after every round).
3. `docs/THEME.md` — TFG naming bible (display names; ids stay "kefal").
4. `docs/BUGS.md` — verified bug list (fixed ones are listed in §5.4 here; the rest are open).
5. Skim `src/game/game.js` (orchestrator), `src/game/host.js` (host rules), `src/game/actions.js` (player actions).
6. Only when doing audio: `docs/AUDIO_AUDIT.md`. Only when doing mods: `docs/LC_MODS.md` + `src/mods/modapi.js`.

First 30 minutes checklist:
- [ ] `npm install && npm run dev`, open `http://localhost:5173/?autohost=local&code=T1&name=Tester`
- [ ] Syntax check: `for f in $(find src public/mods -name "*.js"); do node --check $f || echo FAIL $f; done`
- [ ] Run the smoke test in §5.5 (must print `errs: []`) — if `setpieces.js` crashes see §5.2
- [ ] `git init && git add -A && git commit -m "handoff snapshot"` (there is no git history yet!)
- [ ] Tell the owner (in Turkish) what you will do next, then work in small fast rounds (§2)

### Türkçe özet (sahibi için)
Proje klasörü `D:\KefalCompany`. Yeni AI önce bu dosyayı (AGENTS.md), sonra `docs/CRITIQUE.md`, `docs/THEME.md`,
`docs/BUGS.md` dosyalarını okumalı. Yapılanlar §5.1'de, devralındığı an yarım kalan işler §5.2'de, eksikler ve
bilinen sorunlar §5.3'te, sıradaki işler öncelik sırasıyla §6'da. Yeni AI'a şunu demen yeterli:
"D:\KefalCompany projesindeki AGENTS.md dosyasını oku ve §6'daki yol haritasından devam et."

### Git / deploy (read before pushing!)
- Work on **`main`** — it tracks `origin` = https://github.com/SherlockFP/TFG and **Render auto-deploys it**
  (static site, `render.yaml`). Every push to `main` = live update for the players.
- Local **`master`** is an archive of the full dev history. It contains ~2.5 GB of raw downloads (`tools/raw/`) in
  its first commit — **never push `master`** (GitHub rejects it). `main` started as one clean commit of the same tree.
- `tools/raw/` (raw itch.io downloads) is git-ignored; only processed assets under `public/assets/ext/` are committed.

## 1. What the game is
Browser co-op PSX-style horror scavenging game: **Lethal Company + R.E.P.O.** core loop with an **MMO-style
progression layer** (levels, skill points, personal currency "Clout" ◈, black market, bounties, achievements),
**minigames**, **mods**, **proximity voice chat** (push-to-talk **V**) with mouth animation, and **serverless P2P
multiplayer** (Trystero/WebRTC, lobby browser, join by 6-letter code).

Theme: **internet content / "dead internet"** (the user dropped the original fish/"Kefal" theme). You scavenge lost
content from abandoned server moons and sell it to **The Algorithm** to meet the **Engagement Quota**. Creatures are
internet horrors (Lurker, Web Crawler, NPC, Deepfake, Troll, Pop-up, AI Slop, The Worm…). Fish art is reused through
"phishing" puns (Phish Dayı the black-market merchant, FLAPPY PHISH arcade, PHISHING minigame).
**Full naming bible: `docs/THEME.md`.** Internal ids (item/creature/moon/prop/sound ids, `kefal.*` localStorage
keys, `window.KefalAPI`, the folder name) intentionally still say "kefal" — do NOT rename ids (saves + mods break).

## 2. Owner preferences (important)
- Wants **speed**: small, fast iterations; don't run long multi-agent rounds unless asked; estimate and ship.
- Wants the game to feel **premium and fun, not "low budget"**: goals, replayability, juice, good UI.
- Name is **TFG / TOTALLY FUCKED GAME**; use "TFG" everywhere.
- Main menu = **Call of Duty: Black Ops 1 style** CRT-monitor room (done: `src/ui/crtmenu.js`).
- R.E.P.O.-like extras: push-to-talk on **V** (default), emotes + animations (done: `src/game/emotes.js`), expressive faces.
- Audio issues were reported ("no sound in headphones"); the owner said **gameplay first, audio later**.
  Deferred audio findings: `docs/AUDIO_AUDIT.md` (21 confirmed issues, e.g. output-device loss, BT hands-free).
- Keep an honest running critique: `docs/CRITIQUE.md` (update it each round).

## 3. Run / build / test
```bash
npm install
npm run dev          # http://localhost:5173  (HMR is OFF by default; reload manually. KEFAL_HMR=1 to enable)
npm run dev:https    # self-signed HTTPS (needed for microphone when friends join over LAN)
npm run build        # static build in dist/ (can be uploaded to itch.io as HTML5)
```
Dev helpers (URL params, see `src/main.js`):
- `?autohost=local&code=ABC123&name=Hasan` → auto-host (network `local` = BroadcastChannel between tabs on one PC;
  `nostr`/`mqtt`/`torrent` = real internet P2P). `?name=` uses a throwaway in-memory profile (not saved).
- `?autojoin=ABC123&net=local&name=Can` → auto-join.
- Console: `kefal` = the App, `kefal.game` = Game, `kefal.tick(n, dt, render)` advances the simulation manually
  (background/hidden browser tabs pause requestAnimationFrame — use tick or the 20 Hz hidden-tab fallback loop).
  `window.THREE` is exposed. Example: `kefal.game.net.request('lever')` lands the ship (landing takes ~9 s real time).
- Syntax check everything: `for f in $(find src -name "*.js"); do node --check $f; done`
- No test framework; verification = node --check + browser playtests (screenshots) + small scripted checks via `kefal`.

## 4. Architecture (≈36k lines, plain ES modules, Vite, three.js 0.186, Rapier, Trystero 0.25)
| Path | Role |
|---|---|
| `src/main.js` | App: boot (physics, ext assets, models, mods), CRT menu, host/join, key handling, main loop, audio unlock |
| `src/core/` | `engine.js` renderer + PSX post (low-res RT, vertex snap via ShaderChunk patch, outlines, dithering, bloom), `input.js`, `rng.js` (seeded RNG — world gen must only use this), `save.js` (settings/profile/run saves + migrations), `i18n.js` (EN keys → TR / RU, `src/i18n/*` dictionaries), `util.js`, `events.js` |
| `src/physics/physics.js` | Rapier wrapper: static boxes/trimesh, item bodies, kinematic capsules, character controller, raycasts, groups `G` |
| `src/render/` | `lightpool.js` (constant-count point/spot lights reassigned per frame + halos + beam cones — never change light COUNT or `visible`, that recompiles shaders), `textures.js` (procedural pixel textures) |
| `src/world/` | `facility.js` (procedural interior: layout → geometry/colliders/props/doors/lights/nav, `mergeStaticMeshes`), `nav.js` (grid A*), `terrain.js` (outdoor moon), `ship.js` (ship always at world origin), `company.js` (HQ), `environment.js` (sky/fog/weather/day-night), `geobuilder.js` (merged quads, `levelTexture` prefers downloaded PSX textures), `extmodels.js` + `propfactory.js` (downloaded GLB props `ext:<id>`) |
| `src/entities/` | `localplayer.js` (FPS controller, stamina, weight, fall damage), `remote.js` (avatars, interpolation, emotes, mouth), `items.js` (world items, physics ownership transfer for the REPO grab beam, fragile value), `creatures.js` (host AI `BEHAVIORS` + client `CreatureView`s, hazards) |
| `src/game/` | `game.js` orchestrator (net handlers, map load/unload, loop), `host.js` (host-only run logic mixed into Game: phases, quota, economy, spawning, request handlers, `later()` timers), `actions.js` (local player actions: interact, inventory, combat, scan, minigames, damage/death/spectate), `terminal.js` (ship terminal commands), data tables `items.js` / `creatures.js` / `moons.js` / `progression.js`, `profile.js` (XP/levels/coins/bounties), `screens.js` (ship CRT screens), `emotes.js`, `objectives.js` (HUD objective tracker), `extcontent.js` (items/creatures from downloaded models), plus new feature modules (see §6) |
| `src/net/` | `transport.js` (Trystero or BroadcastChannel), `lobby.js` (serverless lobby discovery), `session.js` (request/broadcast envelope), `voice.js` (proximity voice, walkie, clip capture for "skinwalker" mimicry) |
| `src/ui/` | `ui.js` (menus/panels), `hud.js` (visor HUD), `crtmenu.js` (Black Ops CRT main menu), `style.css`, `icons.js` (item thumbnails, used by the inventory) |
| `src/models/` | procedural models: `avatar.js` (player + first-person arms, face canvas with mouth), `creatures.js`, `items.js`, `props.js`, `modelkit.js` |
| `src/audio/` | `audio.js` (WebAudio manager), `sfxlib.js`/`dsp.js` (191 procedural sounds), `extassets.js` (downloaded OGG sounds + texture overrides) |
| `src/minigames/` | DOM/canvas minigames: arcade, fishing, safe, fuse, lockpick, slots (common API `create*(opts) → {el, update, destroy}`) |
| `src/render/particles.js` | pooled PSX particles (blood/sparks/goo/dust/death) — `game.particles.burst()` |
| `tools/apply_hooks.py` | applies agent integration hooks from workflow journals (see §5.6) |
| `src/mods/modapi.js` + `src/mods/modscreen.js` + `public/mods/*.js` | mod system (`KefalAPI` / `ViralAPI` v2): 24 **TFG FEATURES** = built-in LC mod ports (on by default, per-feature switches, host-authoritative `config.features`, terminal `FEATURES`) + 10 optional cheat/joke mods. See `docs/LC_MODS.md` |
| `public/assets/ext/` | downloaded CC0/free packs (1159 textures, 452 sounds, 284 GLBs) + `manifest.json`; licenses in `CREDITS.md` |

**Networking model:** host is authoritative for world state (items, creatures, doors, economy, time); each peer owns
its own player (movement, HP). Clients call `game.net.request(action, data)` → host handler (`net.handle`); host
broadcasts events (`it`, `cev`, `door`, `phase`, `gs`, `xp`, `sys`, `fx`, `hurt`, …). World generation is deterministic
from the run seed on every peer. `applyRunState` mutates `game.run` in place (host code may hold references).

## 5. Status at handoff (2026-09-28, ~20:00)

### 5.1 DONE — works and was checked in the browser
**Core loop (Lethal Company):** ship in orbit → terminal (MOONS/ROUTE/STORE/BUY/SCAN…) → lever lands (~9 s) →
procedural facility (3 interior themes: factory, mansion, **mineshaft**) + outdoor moon + HQ ("0-Algorithm HQ") →
scrap pickup/carry/weight/drop, REPO-style grab beam for big items (physics ownership transfer), fragile value loss →
sell on the HQ counter + bell (buy rate by days left, `run.favor` multiplier) → quota / 3-day deadline / fines for
deaths (less if the body is carried back) / all-dead loses scrap / fired = run reset, personal progression kept.
Death → spectate → revive in orbit. Midnight auto-takeoff, left-behind players die.

**Progression (MMO layer):** XP/levels/ranks (Lurker … Internet Legend), skill points (TAB), Clout ◈ currency,
black market (Phish Dayı), soulbound gear, bounties, **achievements + titles on name tags + daily login streak**
(`achievements.js`), **affixed weapon loot** with rarity/prefix/suffix (`loot.js`), **boss The Foreman** (`bosses.js`,
indoor, slam telegraph, stun guard, loot drop, HP bar; HP 1100).

**World variety:** set pieces (catwalks, steam vents, flooded rooms, dark corridors, blood trails — `setpieces.js`),
mineshaft interior on 88-Chatroom (`mineshaft.js`), outdoor outposts with lockable supply crates (`outposts.js`),
weather, day/night, 7 moons, 17 creatures + hazards (turrets, mines, fake exit), mimics (door mimic, voice
"skinwalker" mimic using recorded voice clips, crewmate mimic).

**Horror pacing:** horror director (`director.js`: tension/relief, shadow figures, blackouts, heartbeat on chase,
boss-aware), creature AI with sound-based hunting.

**Social / REPO extras:** proximity voice chat (HRTF, push-to-talk **V** default, walkie radio, mic consent panel),
mouth animation, 16 emotes (hold **B** wheel, Z/X quick emotes, third-person emote camera), pings (P / MMB),
ship features (`shipfeatures.js`: loud horn, floodlight, disco ball, teleporter, **mirror**, cupboard), chat.

**Multiplayer:** Trystero P2P (Nostr/MQTT/torrent) + BroadcastChannel local mode, serverless lobby browser,
6-letter join codes, host-authoritative world, deterministic seeded world gen. Verified: 2 tabs locally + a real
Nostr session (voice path with a synthetic stream).

**UI:**
- Black Ops 1 style **CRT room main menu** (`crtmenu.js`).
- Visor HUD with objectives tracker (`objectives.js`) and inventory **item icons** (`icons.js` → `hud.setInventory`).
- End-of-day **PERFORMANCE REPORT**: count-up rows, S–F grade stamp, crew badges (`ui.showDaySummary`).
- **QUOTA MET** confetti cinematic (host event `quotamet`) and **DEPLATFORMED** terminal/glitch cinematic (`ui.showFired`).
- Death overlay with the cause ("You blinked.") and a tip.
- Terminal, market, settings (audio output device picker, test sound, meter), TR/EN i18n.

**Feel / visuals:** PSX pipeline (low-res, vertex snap, dithering, outlines), bloom, light halos + beam cones,
**hit particles** (`render/particles.js`: blood/sparks/goo/dust/death), **hitstop** (`game.hitstopT`),
**knockback** (host `hit` handler), camera shake, hit flash.

**Mods:** `KefalAPI` v2. 24 LC mod ports are built in as TFG FEATURES (on by default, switch per feature; host decides crew features, terminal `FEATURES`), incl. 11 new ones: Late Join, Push Company, Needy Cats, Sell Bodies, Spectate Enemies, Control Company Lite, Helmet Cameras, Employee Assignments, Story Logs, General Improvements, Weather Tweaks. 10 optional cheat/joke mods. The 3 mod bugs from BUGS.md (roulette payout, reserved-slots welcome, content-mod enforcement) are fixed. List: `docs/LC_MODS.md`.

**Theme:** fully re-themed to TFG / internet content (display names only — ids unchanged, see `docs/THEME.md`).

**Bug hunt:** 87 verified findings in `docs/BUGS.md`; ~35 critical/major fixed (list in §5.4).

### 5.2 IN PROGRESS at handoff time (check these first!)
- Three background "fix" agents (Claude Code workflow subagents) were **still editing** these files when this was
  written: `src/world/setpieces.js` (label `fix:setpieces`), `src/world/outposts.js` (`fix:outposts`),
  `src/world/mineshaft.js` (`fix:mineshaft`). If the session ended mid-edit a file may be broken.
  - Last smoke test caught setpieces.js **mid-edit**: `TypeError … reading 'color'` in `SetPieces.updateSparks`
    (`s.glowMat` undefined, around line 555). If it still happens, fix it (spark objects need `glowMat`/`lit`/`dim`
    set where they are built, or guard `s.glowMat?.color`).
  - Their integration hooks (if any) are in the workflow journals; apply with
    `PYTHONIOENCODING=utf-8 python tools/apply_hooks.py wf_c18bf06d-d15 fix:setpieces` and
    `… wf_c2bb065f-00c fix:outposts` / `fix:mineshaft` (safe to re-run; already-present code is skipped).
    If the journals are gone, just review the three files by hand and run the smoke test below.
- Already applied from finished agents: every `build:*` hook, `fix:achievements`, `fix:director`, `fix:ship`,
  `fix:pings`. `fix:loot` needed no hooks (it edited bosses.js/loot.js directly).

### 5.3 MISSING / KNOWN PROBLEMS (honest list)
**Not verified by hand (only "no console errors" scripted tests):** Foreman fight feel/balance, crate lockpicking,
achievements panel UI, set-piece balance (steam damage, flooding), outposts on every biome, emote sync between
2 real players, all new modules with **2+ real players over the internet** (only local host tested).
**Bugs still open:** `docs/BUGS.md` remaining items — generator room can attach to the vault (facility.js `attach`),
minor findings, mod issues (lethal-casino roulette payout timing, reserved-slots vs host config, content-mod
enforcement). Boss review leftovers: leash re-engage stall when hit while walking home; loot drops could clip
through walls (DROP_TRIES added, not verified); shared `_v` passed to delayed audio.
**Audio:** owner reported "no sound in headphones" — deferred on request. 21 confirmed issues in
`docs/AUDIO_AUDIT.md` (device loss, BT hands-free profile, meter after destination…). Real microphones untested.
**UI:** host/join/settings/character submenus still look like web forms (should match the CRT room); no 3D
character preview; no loading tips; `▮` credit glyph renders as a wide block in the pixel font; scan labels,
store and sale list don't use item icons yet.
**Feel:** no LC-style 3D scan wave; first-person weapon poses/swing arcs weak; no particles on item break/pickup;
footstep/impact variety thin.
**Replayability:** no daily moon events (risk/reward modifiers), no collection log, favor multiplier not shown in UI.
**Re-theme leftovers:** some models still fish-flavoured (merchant head, fish hat), arcade sprite/"TFG JUMP" text,
poster/sign textures in `src/render/textures.js`, slot machine symbols.
**Balance:** day length 720 s, quota growth, creature power budget, early instant deaths near the entrance,
affix sell bonus (CAP.valuePct 1 → up to ~6× value on legendary).
**Infra:** the project is **not a git repository** — run `git init` + first commit before big changes.
`npm run build` was not re-verified after the latest modules. No automated tests.

### 5.4 Bugs fixed this session (for reference)
Host timers surviving leave (`later()` + `destroyed`), host slot overwriting saves (`loadRun` at START), double
sell, all-dead at HQ soft-lock, scrap re-collected every day (`it.collected` persisted), mid-day quit save-scum
(only save in orbit/company), stale run ref (in-place run state), left-behind double death + their held scrap
teleporting into the ship, held items not saved, quotaMul compounding, fired run persisted immediately, charger for
host items, stale prevVel false impacts, grab-beam quick tap / double start, medkit exploit, leech latch cleanup +
black spectator view, turret cone/'off' state, yoinker freeze on unreachable scrap, HUD injection via network
numbers, chat click pointer-lock, pointer re-capture after leaving, DECEASED overlay leaking, fuse-box XP farm, HQ
fishing farm (6/day), LightPool `visible` toggling (shader recompiles), nav crossing walls beside doors, unlocked
doors staying blocked in nav, lamp post inside the ship, host-dropped items invisible, ghost players from rejected
peers, leaver items dropped at ship centre, host tab hidden freezing the world, buyRnd sync, boss double-stun
cancel, affix normalisation overwritten, death/level-up banners overlapping, generator/vault attach
seal (attach rejects entrance/vault/generator rooms), setpieces spark `glowMat` guard.

### 5.7 Second handoff round (2026-09-28, ~21:30) — §6-1 + §6-3 start
Stabilised: all `src` + `public/mods` files pass `node --check` (0 fail), `npm run build` succeeds
(chunk warnings only), git initialised (`78e1dd3 handoff snapshot`, `.gitignore` for node_modules/dist).
setpieces.js crash point guarded with `s.glowMat?.color`; spark builder already sets `glowMat`, so the
mid-edit crash from §5.2 should be gone — needs the browser smoke test (§5.5) to confirm.
`src/world/mineshaft.js` was still being edited by a background agent at snapshot time (unstaged diff).
Generator/vault attach bug fixed per `docs/BUGS.md` verified fix (`1edbfb9`). Still open: browser smoke
test, 2-tab hand playtest (§6-2), remaining BUGS.md items.

### 5.8 Round 3 stability pass (bug fixer)
- Run sync is generic: `broadcastRun()` without keys diff-syncs every top-level `run` field once per second (host.js),
  so new fields added to `game.run` reach clients automatically. `run.dailyEvent` rides the landing phase message.
- Session (net/session.js): host-only message types are ignored from non-hosts; the host relays client broadcasts
  (`net.relayTypes`) to peers without a direct link; host broadcasts `pleft` for ghost cleanup.
- Early-game fairness: 90 s / 25 m walking-distance no-spawn zone around facility doors (`hostEarlySafeFilter`,
  `NavGrid.distanceField`). `hostSpawnCreatureIndoor` returns true/false; power is only charged on success.
- Per-day resets in hostLever: pressureStage, moonT, fuseDone. Blackout daily event = real `hostSetPower(false)`.
- Pickfail restores the host transform; grenades tick in every phase; item music/glow torn down (`updateItemFx`);
  late-join item state; jetpack LMB/battery; harbour/orbit void safety net; local player sub-steps long frames.
- BUGS.md entries fixed this round are marked `**FIXED (round 3)**`. Still open: creature-AI minors in
  entities/creatures.js (lurker anger, aggro on chasers, A* throttling, initial loop sounds), ui.js key-rebind leak
  and lobby HTML entities, TURN server option, the 3 [mods] items.

### 5.9 Round 3 - interior themes + hazards (dungeons agent)
- `src/world/interiors/`: registry `index.js` (INTERIOR_THEMES, INTERIORS[id], getInterior, INTERIOR_NAMES, interiorFootstep/Ambience/Atmosphere) + one file per theme: `office.js` (Corporate Intranet, wing plan, cubicles, elevator hub), `backrooms.js` (Level 0, 'open' plan, poolrooms), `serverfarm.js` (Cloud Storage, rack aisles + cable trays, core chamber), `sewer.js` (Comment Sewer, water channels, cistern), `hospital.js` (Telehealth Clinic, wards, morgue, operating theatre). `hazards.js`: laser grids (alarm = host noise), breaker rooms, cave-ins, vent shortcuts, toxic sludge (net: spHz / spHzB / spHzState via setpieces.js).
- `facility.js generateLayout(seed, theme, size)`: unknown theme -> factory, size clamped 0.5..2.6 (MAX_FACILITY_SIZE), per-theme layout rules (plan rooms|wings|open, door/blast odds, loops, hub landmark room, room shapes), island repair (every cell reachable). Verified in node: 100 seeds x 8 themes x sizes 0.8-2.6, 0 failures.
- Open: no true multi-level floors (2D nav grid). Breaker-room lamp bulbs still look lit while dark. Hazard feel/balance not yet playtested in the browser.

### 5.9b Wave 2 - combat module (`src/game/combat*.js`, `spells_ext.js`, `role_skills.js`; details `docs/wave2/combat.md`; NOT hand-played)
Melee combos + charged heavy + block / parry for every melee weapon (RMB hold = block, RMB tap = scan while a melee weapon is held), backstab, 6 new melee weapons, rocket /
grenade launcher (rocket jump), SMG, rifle, Grav-Tool, spells ZAP / FROST / METEOR / DECOY / TOTEM, Blood Magic keystone in `magic.js`, role skills on **Y / U**. Net types `cb*`.
The headless feature script `tools/harness/wave2_combat.js` exists but was not run.

### 5.9c Wave 2 - nickname + avatar (PROFILE; `docs/wave2/profile.md`; build + node test only, NOT hand-played)
PROFILE entry on the CRT menu + "Edit profile" in the CHARACTER sheet: validated nickname (2-16, slur filter EN/TR/RU, no look-alike of a host / crewmate)
and a 16x16 pixel editor or 3D snapshot avatar (64x64 PNG <= 6 KB) with frames. Sync: `helloData.av` (258 chars) + unique `pf` message; shown on the menu card,
lobby browser, TAB list, chat, day summary and above name tags (setting `tagAvatars`). Files: `src/ui/avatarpic.js`, `src/ui/panels/profile.js`, `src/core/profilename.js`,
`src/game/profilesync.js`, test `tools/harness/profile.test.mjs`.

### 5.9d Wave 3 - avatar2 (rounded "TFG Employee" body; `docs/wave3/avatar2.md`; build + node test only, NOT hand-played)
`src/models/avatar2.js` + dispatch in `createAvatar` (setting `classicAvatar`, Settings > Video > Character). Same API/anchors; suits via `rig.attach` frames. Test: `tools/harness/avatar2.test.mjs`. Needs a browser eyeball pass (grips, charpreview, fpbody).

### 5.10 Round 3 - content wave (11 builders, integrated; NOT yet browser-verified)
- **Endless moons** `src/game/moongen.js`: every quota opens a new SECTOR of 3-5 generated moons (pure fn of run.runId + quotaIndex,
  registered into MOONS at `applyRunState` via `ensureSector`), 10 biomes (4 new in `world/outdoor_biomes.js`), map scale up to 1.5x,
  13 modifiers, 3 new outposts, terminal SECTOR/MAP/INFO, fuzzy ROUTE. Interiors picked from all 8 registered themes.
- **Interiors** see §5.9. **Loot:** `items.js scrapTableFor/bigTableFor(theme)` used by host populate + random scrap; 25 new scrap,
  2 big valuables, 5 store tools (ladder, signal booster, hype inhaler, belt bag, adblock spray); affix sell bonus capped at 2x.
- **Creatures:** 7 new (Moderator, Customer Support + Ticket Swarm, Editor, Tamagotchi, Parasocial, Clickbait, Reply Guy), Legacy Bot
  world boss, variants + elite affixes; host uses `spawnTable(moon, zone, run)` + `canSpawnMore` caps.
- **Uplink Van** `entities/cruiser.js` (BUY VAN, 4 seats, cargo bed). **Meta** `game/prestige.js` installMeta: codex, 20 daily
  events, weekly challenge, rebirth, mastery, crews, Service Record panel (J). **Mods:** 24 LC ports built in as TFG FEATURES.
- **Feel:** per-weapon arcs/trails, surface footsteps (carpet/tile/water/gravel), ScanFx 3D scan wave, camera juice, Reduce motion.
- **UI:** every menu CRT-styled, gamepad nav, CRT dialogs, loading screen + landing briefing card, compass, event chips, report queue.
- **Assets:** 29 Blender props + 74 CC0 models, 26 textures, 25 sounds; theme ambience loops + one-shots (`extassets.js`).
- Integration wiring: interior names come from `interiors/index.js INTERIOR_NAMES` (HUD brief, codex, terminal, moongen);
  interior carpet/tile floors use the new feel footstep sets; interior ambience prefers the shipped theme loops.

### 5.13 Wave 2 - GRENADES (module `grenades`, docs/wave2/grenades.md)
Hold-LMB throw for every grenade (dotted arc with predicted bounce, cook, deterministic ball sim on all peers, host-authoritative boom): stun / cryo / molotov / EMP / crafted decoy
moved onto it; new flashbang, smoke, decoy beacon, sticky charge (store + workbench) and RARE bombs (gravity well, blackout, confetti, glitch, cluster: chest / boss / world drops only).
Net `grth` (request) + `grfx` (broadcast). Pure rules `src/game/grenades_core.js` + `node tools/harness/grenades.test.mjs`. Shared edits: game.js slot lines only (instance wraps listed in the doc).
Headless feature script `tools/harness/wave2_grenades.js` passed once (host only); aim preview / cook bar, smoke blocking check and 2-player play are NOT verified.
### 5.12 Wave 2 - ANOMALY system (`game.anomaly`, docs/wave2/anomaly.md)
STATIC exposure per player (hot rooms / hot items / breach; Buzzing 25, Glitching 50, Corrupted 75, DELETED 100), Decon Shower in the ship, Antivirus Shot, Faraday Suit, Signal Counter,
10 mutations, 6 temporary power-ups (holographic pickups), Loot Box Shrine (d20) + throwable Cursed Die, left-dock buff bar. Net types `an` / `anfx` / `anst`. Shared edits: game.js slot lines, magic.js (Mute hook).
Verified: node test (`tools/harness/anomaly_core.test.mjs`), build, smoke_land. NOT hand-played; `tools/harness/wave2_anomaly.js` was written but not executed (budget freeze).
### 5.13 Wave 2 - CREATURE EMOTES (module `cemotes`, docs/wave2/cemotes.md)
Every creature emotes (body language layer + internet-style bubble), gloats after killing a player (chat line + victim camera on the killer) and reacts to player emotes by personality (dance-along = safe passage, taunt = enrage, mimic copies, shy flees, bosses laugh). Net type `ce` (HOST_ONLY). Only game.js slot lines are shared. Verified: `node tools/harness/cemotes.test.mjs` (data + fake-game simulation), build, one headless run (`wave2_cemotes.js`); NOT hand-played.
### 5.13 Wave 2 - MIRROR DIMENSION (module `mirror`, docs/wave2/mirror.md; node-tested + builds, NOT run in a browser)
~25% of outdoor maps from sector 1 carry a portal mirror (E to step in / out). Inside: host-owned membership, flipped screen + mirrored A/D / mouse X, dark ASCII post look (own shader program, safe fallback), wraith / flame fiend /
mirror copy / zombie fodder waves (cap 50), XP crystals + 3-card level-ups (8 temporary upgrades), Reflection Meter -> chests + power-ups. Owner rules: 3:00 countdown then OVERTIME (+1 level / 20 s), a death = sit out one round
(respawn while a crewmate inside lives), everyone inside dead = SHATTERED (real death), day end = lost in the reflection. Hooks: game.js slots + 6 `[mirror]` lines in engine.js; the rest are instance wraps. `tools/harness/mirror.test.mjs` PASS.
### 5.14 Wave 2 - FOOD & DRINKS (module `food`, docs/wave2/food.md; node-tested only, NOT browser-verified)
14 optional consumables (`fd_*`, store tab Food) with temporary buffs through the anomaly buff registry, drunk stacking (sway / drift / lag / slur / hiccups / harmless blackout), eat / drink animations, CHEERS!, Party Cake sharing, offer with H, ship mess table (Well Fed), vending machines / fridges. Tests: `tools/harness/food.test.mjs`, `food_install.test.mjs`.
### 5.14 Wave 2 - PETS (module `pets`, docs/wave2/pets.md; first cut, node-tested only)
9 species / 3 evolutions / shiny / skins / eggs+incubator / capture odds / PET panel (N, terminal PETS), profile.pets. NOT done: host-simulated fetch/attack/guard/role abilities + net sync (design in the doc).
**[finish] wave 3 (docs/wave3/finish.md, node-tested + build only, NOT browser-run):** host-simulated fetch / attack / guard / role abilities (`pets_sim.js` pure + `pets_net.js` glue: net types `ptinfo` / `ptst` / `ptev`, request `pt`), keys O / Shift+O / L, Pet Carrier capture, ship incubator prop (`pets_incubator.js`). Still missing: pet achievements (chest / boss egg drops: wave 4 polish4).

### 5.11 Wave 2 - HQ FORGE (module `forge`, see docs/wave2/forge.md)
THE MONETIZER (+1..+9, overclocks), Ascension Altar (tier up, workbench capped at Rare), Shard Exchange, 6 shard items + Backup Drive, weapon glow (+3/+5/+7/+9), creature tiers
(Uncommon..Mythic: HP/dmg/XP mul on top of balance.scale, aura/nameplate, shard drops). Pure rules `src/game/enhance.js` + `node tools/harness/forge_rules.test.mjs`. Hooks in shared files are
marked `[forge]`. Only node test + build + one smoke were run; `tools/harness/wave2_forge.js` is written but NOT run yet.
### 5.13 Wave 2 - PLAYER TRADING + icons for every item (module `trade`, docs/wave2/trade.md)
E on a crewmate (<= 4 m) / N / `/trade <name>` / terminal `TRADE` -> 10 s popup (N accept, M decline) -> CRT trade window (your inventory with generated icons, 9-slot offers + Clout, LOCK -> ACCEPT -> 3 s countdown, any change resets the locks, tooltips + comparison, TRADE COMPLETE).
Host-authoritative atomic swap (`trade_core.js` pure rules + state machine, `trade_host.js`), net types `trreq/tracc/troff/trlock/trok/trcx/trca` + host `trs/trm/trc`; Clout debited by the giver's client, paid via the reward path (`Trade:` reason is exempt from the multiplier).
Icons: `ui/icons.js` never leaves a blank icon (generated glyph fallbacks in `ui/iconatlas.js`, soft-cache retry, id-matching bug fixed), terminal `ICONAUDIT` / `game.trade.iconAudit()`. Verified: node test `tools/harness/trade.test.mjs` (86 checks), node --check, build, i18n audit for the trade files.
NOT verified: any browser run (window layout, drag & drop, popup, glyph look, real 2-player P2P); `tools/harness/wave2_trade.js` is written but NOT run.
### 5.13 Wave 2 - THE ADMINISTRATOR + THE BOARD (module `boardgame`, docs/wave2/boardgame.md)
Rare (~4 % per landing, once a day, quota >= 1) tall grey-suit entity; stare at its face for 2 s and you + crew within 10 m are sent to a dice-and-cards board (24-tile ring, 12 turns, LOOT / TRAP / CARD / DUEL / SHORTCUT / EXIT). Fail = most valuable item + 90 % HP. Pure rules `src/game/board_rules.js` + `node tools/harness/board.test.mjs` (PASS). NOT browser-tested (headless run cancelled); hooks marked `[boardgame]` in game.js.
### 5.14 Wave 2 - MAPS2 (module `maps2`, docs/wave2/maps2.md) - PARTIAL
**[finish] wave 3 (docs/wave3/finish.md): challenge rooms are LIVE (`M2_CHALLENGE_ON = true`; physics plate / gamble lever / arena waves / co-op levers + colour code / treasure collapse), Collapse + Migration events, stateful drawers / PCs / radios / phones (`maps2_world|challenge|events|furniture|rules|text2.js`). Fixed a wave-2 bug: the extra furniture was never placed. Not browser-verified.**
Story rooms (party / last stand / nursery / streamer shrine / flooded break room, readable lore notes), a triangle liminal room, per-room light switches, void windows, extra furniture; retyped from the normal layout with an own RNG fork (`globalThis.__kefalM2Off` disables). Challenge rooms are built but switched off (`M2_CHALLENGE_ON`), events / interactable state / outdoor landmarks NOT done. Node test `tools/harness/maps2.test.mjs`; not seen in a browser.
### 5.11 Localization wave (EN / TR / RU) — see docs/wave2/i18n.md
`core/i18n.js` is multi-language (`t`, `tf` with `{x}` / `{@x}`, `L`, `sysMsg`, `addTranslations(map, lang = 'tr')`, `localizeDeep`);
bulk dictionaries live in `src/i18n/tr_*.js` / `ru_*.js`; `src/i18n/display.js` localises item / creature / moon / ... names through
getters (ids untouched, `def.$name` = English). Host -> client text uses `sysMsg` / keyed terminal `reply`. Picker in title + Settings,
`navigator.language` default, RU voice-spell words, Cyrillic font fallback (`TFG Cyr VT`). Audit: `node tools/i18n_audit.mjs`
(re-run after merges; target 0 missing TR/RU); codemod: `tools/i18n_wrap.mjs`. Gaps: passive tree texts, some minigame HUD strings,
long lore bodies (RU), wave-2 files merged later.
+ The Algorithm's Revolver (Russian-roulette power-ups, `src/game/roulette.js`, net `rr` / `rrfx`, docs/wave2/anomaly.md): tables replace ~half the shrine spawns (quota >= 1) + a ship bonus table; node test `tools/harness/roulette.test.mjs` PASS, `wave2_roulette.js` run once (solo path PASS); 2+ player pass/forced flow only covered by the node test.

### 5.13 Wave 2 - ITEM DURABILITY (module `durability`, docs/wave2/durability.md)
Weapons (per swing / hit / shot) and worn armour (per damage taken) wear out: Common / Uncommon items shatter (one scrap shard left), Rare+ or forged items become BROKEN (cannot attack, x0.3 sell value) until repaired
(workbench REPAIR tab, Repair Kit +40 %, HQ mechanic bench; every full repair ages the max by 5 %, floor 60 %). Bar under hotbar / grid icons, tooltip row, BROKEN overlay. Pure rules `src/game/durability_core.js`
+ `node tools/harness/durability.test.mjs`; browser proof `tools/harness/wave2_durability.js` (35/35, host path only). Item fields `it.dur` / `it.dr` (`du` / `dr` on `sp`, serialize, saveFields). Net types `duw` `dukit` `durep` `dus` `dubrk` `dures`.
Hooks in shared files are marked `[durability]`. NOT verified: client prediction / `duw` flush with a real second player, HQ mechanic bench placement + panel by eye.

### 5.13 Wave 2 - SKELETONS + tier looks for every creature (module `skeletons`, docs/wave2/skeletons.md)
DELETED USERS family (Bone Walker: collapses + rebuilds once unless the skull is smashed, Bone Archer: visible wind-up + projectiles, Bone Knight: frontal shield, Bone Swarm: skull hands) with glitchy
username tags, spawn weights (mansion / hospital / backrooms / mineshaft + night outdoors), plus a GENERIC per-tier armour / colour layer (`src/render/tierlooks.js`, hooked in `creature_tiers.js`) that dresses every
creature Uncommon..Mythic (scrap -> iron -> runes -> gold + cape -> glitch shader + crown + halo). Node test `tools/harness/skeletons.test.mjs`, build, ONE headless run + one screenshot (host rules + 26 tiered views verified). Not hand-played; tags / poses unseen.

### 5.13 Wave 2 - FPBODY (`game.fpbody`, docs/wave2/fpbody.md; node-verified only, NOT looked at in a browser)
Chat / spell / emote speech bubbles over crewmates, first-person body (own avatar on render layer 2, no head/arms, walk/run/crouch/jump), held-item grip fitting from each model's bounding box + two-hand arm IK + view model drawn over the world (depth range),
and the walking-stutter fixes. **Root cause of "hitching while walking": LocalPlayer's constant `vel.y = -1` stick-to-ground push made the Rapier controller stall ~3 frames every ~0.7 s (7 % of frames) on flat floors; fixed (desired.y = 0 while grounded).**
Also: the tool grip offset in `refreshHeldVisuals` had the wrong sign (weapons ended up behind the camera). Shared-file edits marked `[fpbody]` (avatar.js IK, actions.js hooks, localplayer.js, game.js slot).
`tools/harness/fpbody.js` (browser script) was written but NOT run (lead cancelled the headless runs); node harnesses `fpbody_{offline,body_offline,smoke,walk_offline,stall_offline,terrain_offline}.mjs` did run.
### 5.14 Wave 2 - SECURED LOOT + BREACHING TOOLS (module `secureloot`, docs/wave2/secureloot.md)
Secured containers in facilities (glass case, wall / floor safe, cage / locker, electronic lockbox, vault crate) opened with Glass Cutter / Breaching Drill (Payday-style jam + noise) / Bolt Cutters / Hack Tool / Plasma Torch / lockpick / crowbar / EMP / Code Slip, each with a loud crude melee fallback. Pure rules `src/game/secureloot_core.js` + `node tools/harness/secureloot.test.mjs`; net `slAct` / `slSt`. NOT hand-played; `tools/harness/wave2_secureloot.js` written, not run.
+ Homeworld tycoon (module `homeworld`, docs/wave2/homeworld.md): moon HOME (terminal `ROUTE HOME`), build mode ([E] console / [H]), per-game-day economy, power/cooling limits, away-raid sim + HUD; node test `tools/harness/homeworld.test.mjs` PASS (26), build OK, NOT browser-tested; shared-file hooks marked `[hw]` in game.js / host.js.

### 5.15 Wave 3 - UX batch (docs/wave3/ux.md; build + node tests only, NOT browser-verified)
Unified panel CSS + emoji strip, roles panel layout, pointer-lock re-capture fallback, no FP hands in menu, behind-the-shoulder emote camera, per-weapon melee grips, ship hull door opening, 12 new suits, role skill cooldowns 300 s / revive 600 s (no passive HP regen exists - verified).
### 5.15 Wave 3 - SHIPYARD (module `shipyard`, docs/wave3/shipyard.md; node-tested + builds, NOT run in a browser)
Starter Pod core untouched, 12 modules (Cargo Bay, Garage, Engine Room, Hangar, Workshop, Med Bay, Lab, Bunk Room, Trophy Hall, Lounge, roof Observation Deck + service lift, roof Turret Hardpoint) Mk I-III on 8 sockets (`src/world/hardpoints.js`),
doorways cut into the core walls (seals in `world/ship.js`, `ship.hardpoints`, `SHIP_EXTRA` feeds `insideShip`). Bought with credits (terminal `SHIPYARD`) or built free from ship parts (Hull Plate / Bulkhead / Engine Coil / Hardpoint Bracket: chests, bosses, siege, extraction) fed to the Frame Console (core cabin, +z wall).
State = host profile (`profile.shipyard`, survives fired runs) mirrored in `run.sy`; paint / pattern / theme / name plate; weight = route cost +5 % per module + landing Threat + wider siege hull. Rules `src/game/shipyard_core.js`, models `src/models/shipyard.js`, panel `src/ui/panels/shipyard.js`, tests `tools/harness/shipyard*.test.mjs`.
Gaps: no -x (nose) hardpoint, no furniture placement mode / decals / faction unlocks, never seen in a renderer (see the Unverified list in the doc).

### 5.5 Smoke test (paste in the browser console on `?autohost=local&code=T1&name=Tester`, after ~4 s)
```js
const g = kefal.game, errs = []; addEventListener('error', e => errs.push(e.message));
const res = [];
for (const m of ['hamsi', 'levrek', 'palamut']) {       // factory, mineshaft, mansion
  g.run.daysLeft = 3; g.run.moon = m; g.player.inShip = true; g.hostLever(g.selfId); g.hostFinishLanding();
  for (let i = 0; i < 20; i++) { kefal.tick(10, 1/30, false); await new Promise(r => setTimeout(r, 10)); }
  const s = g.world.facility.scrapSpots[2]; g.player.teleport(new THREE.Vector3(s.x, s.y + 0.2, s.z)); kefal.tick(30, 1/30, true);
  res.push({ m, theme: g.world.facility?.layout?.theme, creatures: g.creatures.host.size, calls: kefal.engine.sceneStats?.calls });
  g.player.teleport(new THREE.Vector3(0, 1, 0)); g.player.inShip = true; g.hostBeginTakeoff('lever'); g.hostFinishTakeoff(); kefal.tick(5, 1/30, false);
}
({ res, errs })
```
Useful debug calls: `g.bosses.hostSpawnForeman(pos)`, `g.creatures.hostSpawn('hound', pos)`,
`g.items.hostSpawn('shovel', pos, { holder: g.selfId })`, `g.ui.showDaySummary({...}, g)`,
`g.ui.showQuotaMet({bonus, surplus, prev, quota, quotaIndex}, g)`, `g.ui.showFired({quotaIndex, sold, quota, days}, g)`,
`g.particles.burst(pos, 'blood')`.

### 5.6 Feature modules — integration state
| Module | State | Notes |
|---|---|---|
| `src/game/pings.js` | ✅ wired (fix version) | MMB / P pings |
| `src/game/director.js` | ✅ wired (fix version) | horror director, boss-aware |
| `src/game/shipfeatures.js` | ✅ wired (fix version + terminal/disco-mod hooks) | horn, floodlight, disco, teleporter, mirror, cupboard |
| `src/game/loot.js` + `bosses.js` | ✅ wired (fix version) | affix weapons + The Foreman |
| `src/game/achievements.js` | ✅ wired (fix version) | achievements, titles, daily login |
| `src/world/setpieces.js` | ⚠️ wired, **fix agent was mid-edit** (§5.2) | catwalks, steam, flooding, dark corridors |
| `src/world/mineshaft.js` | ⚠️ wired, fix agent running | mineshaft interior (88-Chatroom) |
| `src/world/outposts.js` | ⚠️ wired, fix agent running | outdoor outposts + crates |
| `src/render/particles.js` | ✅ new, wired | hit/death particles |
| `src/ui/icons.js` | ✅ wired in inventory | item thumbnails + pixel glyphs |
| `src/entities/cruiser.js` + `src/models/cruiser.js` | ✅ new (hooks: game/localplayer/actions/terminal/i18n) | UPLINK VAN: buyable 4-seat van (terminal BUY VAN, ▮350), Rapier ray-cast vehicle, driver-authoritative 20 Hz stream (`vanst`), host owns seats/cargo (`van` req/msg), cargo bed, ramming, flip-push, dock at takeoff (<38 m) or lost; saved in `run.cruiser`; physics.js gained additive `addPreStep` / `createVehicleBody` / `createVehicleController` |
| `src/game/music.js` (+ `audio/instruments.js`, `game/songbook.js`, `models/instruments.js`, `ui/musicpanel.js`) | ⚠️ wave 2, node-tested only (`tools/harness/music.test.mjs`, `music.sim.test.mjs`); NOT hand-played in a browser | playable Acoustic / Electric Guitar, Keytar, Drum Pad: LMB = play mode, real-note key layouts, chords, songbook follow-along, 'mu' net events, noise + jam session; controls table in `docs/wave2/music.md` |

How hooks work: the agents returned integration hooks (file / anchor / mode / code) in workflow journals under
`C:\Users\Sher\.claude\projects\D--KefalCompany\459d8598-…\subagents\workflows\wf_*/journal.jsonl`
(labels `build:*`, `fix:*`); `tools/apply_hooks.py` applies them. If you add a module by hand, follow the pattern:
install in the Game constructor (or after `installNetHandlers`), `update(dt)` in `Game.update`, `dispose()` in `destroy()`.

### 5.16 Wave 4 - SHIP2 (module `ship2`; docs/wave4/ship2.md; node-tested + builds, NO browser run at all)
- Default ship = "Mini-Skeld": all fixture positions in `src/world/shiplayout.js` (overlap-checked: 5 legacy clips -> 0, `tools/harness/ship2_overlap.test.mjs`), partitions / floor tints / signs / reactor / crates / rounded frames in `src/world/shipdeco.js`, cockpit / hub / engine room / cargo + LOOT BAY (`dropPoint()` for store orders), clerestory windows, rounded nose. Shipyard doorways (R1 / N1 / N2) and the +z door opening untouched; roof is now "aboard" (`insideShip`).
- Hull damage (dent / leak / spark / breach spots, `run.s2`, rules `src/game/ship2_core.js`) from landings, weather, creatures at the hull, raids, sieges; tiers -> flicker, door jam (`host.js` 1 line -> `ship2.doorJam`), takeoff delay, `OUTER_FAULTS.hullx` pre-flight fault in `shipfaults.js`. Outside repair with Wrench / Welding Torch / Repair Kit (store, Tools): hold E + timing ring, host-owned session. Quota 0 = dents only, no effects.
- Roof defence mounts (siege deployables via `debugPlace`, ship power budget), roof ladder, hydroponic planters (`ship2.addPlanterSlot` for shipyard rooms), Hydro Apple food.
- Net: `s2req` / `s2msg` (HOST_ONLY). Tests: `ship2_overlap`, `ship2_hull`, `ship2_install` (+ `wave4_ship2.js` for the browser). First job with a display: walk the ship, repair a spot from the ground, check ladder / rails / signs.

## 6. Roadmap (next steps, in priority order)
1. **Stabilise:** browser smoke test of the round-3 content (§5.8-5.10): land on gen0_0..2 and every interior theme, van,
   new creatures, Service Record (J), MODS screen, scan wave. Fix console errors first. Then finish/verify §5.2.
2. **Hand playtest** the new content with 2 tabs (`?autohost=local` + `?autojoin=CODE&net=local`): boss fight,
   crates, set pieces, achievements panel, report/cinematics in real flow. Fix what feels bad, fast.
3. Close the remaining `docs/BUGS.md` items (start with the generator/vault attach bug).
4. **UI:** restyle host/join/settings/character submenus to the CRT look, 3D character preview, loading tips, icons in
   scan labels/store/sale list, fix the `▮` glyph (custom narrow glyph or different symbol per THEME.md).
5. **Feel:** LC-style 3D scan wave (expanding ring shader + labels popping), better weapon poses/swing arcs,
   particles on item break/pickup, more impact/footstep variety.
6. **Replayability:** daily moon events (risk/reward modifiers shown on the terminal), collection log,
   favor/streak multiplier visible in HUD, weekly challenge seed.
7. **Audio pass** with `docs/AUDIO_AUDIT.md` (only when the owner says so; they deferred it).
8. **Re-theme leftovers** (models/textures/arcade/slots) — keep ids unchanged.
9. **Balance:** day length, quota growth, creature budget, spawn fairness near the entrance, affix value cap.

## 7. Gotchas
- Never change the number of lights in the scene at runtime (constant pools). Don't toggle `light.visible`.
- World generation must be deterministic: only `RNG` from `src/core/rng.js`, never `Math.random`, for anything peers must agree on.
- `hostSave()` is skipped mid-day by design (quitting mid-day loses that day, like Lethal Company).
- Host timers must use `this.later(fn, ms)` so they die with the game.
- `net.broadcast(type, d)` also delivers to the sender; `net.send` does not.
- The Vite dev server has HMR off (agents editing files used to reload the page); reload manually.
- Pointer lock does not work in automated browser panes — drive the game through `kefal.game` / `kefal.tick`.
- Windows console + Python: set `PYTHONIOENCODING=utf-8` when printing game strings (▮ ◈ characters).
- Mods: `window.KefalAPI` (alias target of the old name) — hooks emitted with `mods?.emit(...)` (grep for the list:
  boot, configure, netReady, hostStart, registerHandlers, phase, mapLoaded, moonPopulated, update, stats,
  interactables, daySummary, fx, message, localDeath, levelUp, exit, sessionEnd, playerJoin, useItem, itemState,
  localHurt, chat, remoteAvatar).

## 8. Docs index
`docs/PLAN.md` original design · `docs/RESEARCH.md` LC/REPO research · `docs/LC_MODS.md` mod ports ·
`docs/THEME.md` TFG naming bible · `docs/BUGS.md` verified bug list · `docs/AUDIO_AUDIT.md` deferred audio issues ·
`docs/CRITIQUE.md` honest critique + plan · `CREDITS.md` asset licenses · `README.md` player-facing readme ·
`docs/REVIEW_WAVE1.md` reviewer report for the wave-1 merge (scores, dead stats, HUD collisions, top-10 fixes; run `tools/harness/wave1_day.js` first, it was written but not executed) ·
`docs/wave1/*.md` per-module notes · `docs/wave2/*.md` wave-2 modules (anomaly, forge, skeletons).  `docs/wave3/*.md` wave-3 modules (backrooms2).

### 5.15 Wave 3 - NET (docs/wave3/net.md; node-tested + one local mp2 run, NOT tested over real WebRTC)
- "Friends drop after a while": transport leave is now a 45 s grace (`peerLost` -> `peerResume`, same player/items), app heartbeat + stall/zombie
  detection, `transport.rejoin()`, 12 KB packet cap, per-peer backpressure (drops `ps/cs/is/sgs`), optional TURN (`VITE_TURN_*` / `localStorage['tfg.turn']`),
  `Game.update` always runs `netSend` (unguarded stage exceptions used to silence a player), hidden-tab catch-up. NETSTATS shows reconnects.
- Tools: `tools/harness/net_session.test.mjs`, `tools/harness/net_collisions.mjs` (0 real handler collisions). Host migration still missing.

### 5.15 Wave 3 - WORLDS2 (module `worlds2`, docs/wave3/worlds2.md; node-tested + builds, NOT browser-verified)
- Soviet panel-block moon `w2sov` (enterable khrushchyovka blocks with stairwells, playgrounds, statues, propaganda billboards, snow/fog) with **RAIDS** (horde hit squads every ~250 s, shrinking with days),
  twin-sun desert `w2sun` (dunes, moisture harvesters, cantina outpost with neutral alien NPCs, sand crawler wreck, Dune Maw / Tusked Beast / Scavenger Raider / Dusk Prowler), **Plasma Blade** (saber class, tier colours, deflects
  blaster bolts) + Blaster Pistol, visible planet fauna on every outdoor moon (instanced herds + flyers, radar dots), **loot -28 %** (early bonus kept), **facility decay** (x0.92 at 14:00 / 16:30 / 19:00 / 21:30 + lockdown pulses)
  and **days-in-run difficulty** (x1.0 until day 4, then +3.5 % spawn / +1.5 % hp / +1 % dmg per day). Shared edits are tiny (moongen, terrain `reserved` + `dunes`, host / progression loot count, combat tracer colour, avatar `trailColor`).
- Tests: `node tools/harness/worlds2.test.mjs` (25) + `worlds2_decor.test.mjs` (10). First job next: land on both moons in a browser (block proportions, sun discs, blade grip / glow, creature animation).

### 5.14 Session handoff (2026-09-28 night, lead) — READ THIS FIRST
- Branch `claude/focused-hawking-32j4um` (pushed) holds everything merged; **`main` (live on Render) was NOT updated** —
  playtest the branch first, then merge to main.
- Plan/program: `docs/MASTERPLAN.md` (§0-§19: lore, pillars, backlog #1-#24, sector cycle/endless, homeworld, pets, early-game
  comfort rules). Review: `docs/REVIEW_WAVE1.md`. Per-module notes: `docs/wave1/*.md`, `docs/wave2/*.md`.
- **Merged modules** (each installed via `this.useModule(name, installX)` slots in `src/game/game.js`): balance/threat/ship door,
  rpg (roles + passive tree K), crafting, magic (voice/chat/C spells), shop + weapons + Stacked Deck, inventory (I, tiers, bags),
  facilitysys (living facility, extraction, locked-door fix), lore (The Algorithm, factions, contracts, case files), horde
  (swarms, hit squads, Doppel + camera, collector, janitor), worldx (landmarks, chests, harvest, lava/ice/jungle), fun
  (cosmetics/Venom, football, crew tasks, echo mode), P2P batching/delta + NETSTATS, bugfix (body carry), combat (combos,
  parry, 11 weapons, spells, role skills Y/U), siege + deployables, anomaly (static, mutations, dice, power-ups) + roulette,
  i18n EN/TR/RU, forge (+1..+9, ascension, shards, creature tiers), menu room (break free, piano, terminal), music,
  gameplay2 (identify, Spambomb, ship faults, auto roles/aptitudes), cemotes, skeletons + tier looks, durability, mirror
  dimension, grenades, trade + icons, profile (nickname/avatar), fpbody (stutter fix, grip fit, chat bubbles, FP legs).
- **Still running / unmerged at handoff** (worktree branches `worktree-agent-*` under `.claude/worktrees/`, merge with
  `git merge --no-edit <branch>`; docs conflicts = keep both sides): Backrooms workflow (4 builders + QA), boardgame
  (Administrator), secureloot, maps2, food, homeworld, pets, cycle (sector boss + endless), avatar2 (character redesign).
  Queued but not started: shipyard (§13), polish/onboarding (§ review top-10), i18n second audit pass.
- **Biggest risk:** almost everything from wave 2 is only node-tested / host-path tested, NOT hand-played and NOT tested with
  2 real players. First job next session: `npm run dev`, play 15 min, run `tools/harness/smoke_land.js` + `tools/harness/mp2.mjs`,
  fix crashes, then merge to `main`.
- Gotcha learned: never `rm -rf node_modules` inside a worktree whose node_modules is a symlink (it wiped the shared install once).

### 5.15 Wave 3 - BACKROOMS2 (modules `backrooms`, `brcreatures`, `liminal`; docs/wave3/backrooms2.md; node-tested + builds, NOT run in a browser)
- Finished the interrupted noclip pocket realm + entities (Smiler / Pale Hound / Partygoer / Moth) and merged them with the Level 0 overhaul (`brlevels`); slots `backrooms`, `brcreatures`, `liminal` are now installed in `game.js`.
- New: `game.liminal` (VHS found-footage overlay in the pocket and in backrooms facilities, procedural 5-scene polaroid painter for `br_polaroid`), RU strings (`src/game/br_i18n_ru.js`), weighted pocket hunters. Tests: `tools/harness/br_pocket.test.mjs`, `br_i18n.test.mjs`.
### 5.15 Wave 3 - cycle2: SECTOR CORE + 3 bosses + KEYSTONE + RAID + ENDLESS glue (module `cycle`, docs/wave3/cycle2.md; node-tested only, NOT run in a browser)
- Quota met on the last day -> SECTOR GATE OPEN -> land on a generated core (`layoutOpts`: 3 wings, labyrinth, locked arena, elites, key holders that drop
  ARENA ACCESS CARDS) -> boss chest + next sector; loss = grace day + retry, 2nd loss = shameful exit. Terminal `CORE`, `CYCLE`, `KEYSTONE`, `RAID`, `GATE`, `ENDLESS`, `CASHOUT`
  (keystone / raid lines in the objectives from sector 2). New bosses: Load Balancer, Middle Manager, Comment Section Hydra + a generic kit engine (surgeon, host, excavator,
  lobby manager, key holder). Endless mode (meter, patch notes, S-rank gates, cash out, leaderboard) wired to `cycle_core.js`. Default ON (`config.cycle !== false`).
- `facility.js generateLayout(seed, theme, size, opts)` got wings / labyrinth / arena / zones options (default output identical); the deepest generated server of every sector (2+) uses wings + maze.
- Wrappers on the host.js flow live in `src/game/cycle.js` (`hostEvaluateQuota / hostLever / hostSetPhase / hostPopulateMoon / hostBeginTakeoff / hostFinishTakeoff / hostUpdate`, `applyRunState`, `onPhase`, the `unlock` handler). Net: `cyx`, `cyreq`. State: `run.cycle`.
- Tests: `node tools/harness/cycle.test.mjs`, `cycle2_plan.test.mjs`, `cycle2_bosses.test.mjs`, `cycle2_flow.test.mjs` (real host flow + fuzz + soft-lock proof), `cycle2_i18n.test.mjs`.
- First job when a browser is available: land on a core of every interior, watch the 3 new boss fights (name card, HP bar, rings), open the arena with cards, run a keystone and a raid with 2 tabs.

### 5.16 Wave 4 - cycle3: GLITCH GATES in full + TROPHY WALL + cycle CASE dossiers + ELEVATOR STOP + relay puzzle + Double shrines (module `cycle3`, docs/wave4/cycle3.md; node-tested + one short headless run, NOT hand-played)
- Closes the cycle2 gap list. Classic **Glitch Gates** (rank E-S, quota 1+; terminal `GATES` / `GATE GO <n>` / `PING`) reuse the Sector Core generator and cycle_inst's `gate` instance (cycle.js got `ext` hooks + `api.arm`); **Red** gates (exit sealed until the boss falls, harder, x2 loot),
  **Hidden** gates (clue + `PING` hot/warm/cold + a glitch tear that a scan pulse reveals + a Sanctum with the three-rules statue puzzle -> mythic chest + title "Glitch Walker"), **Gate Break** (2 days -> SIEGE event from quota 2).
- **Trophy Wall** on the ship's +z wall (12 mounts: 9 bosses, raid, keystone, hidden gate): every boss kill / completion mounts one; E = date / crew / time card. State `run.c3.trophies` (crew-shared) + host `profile.cycle3.trophies` (survives "fired"); crew members keep their own copies.
- **CASE dossiers** (`kind:'cycle'` case records, numbers 90000+, terminal `DOSSIER`, renderer registry in `ui/panels/casefile.js`) for each boss, raid, keystone, hidden / red gate, the Deep Feed and the shameful exit (EN / TR / RU).
- **Elevator Stop** (freight elevator pair, stop between floors, fuse sequence + brace the door lever while something knocks; never lethal, quota 0 never hurts), the **three relays** core puzzle (arena shield), the **Double shrines** mutator. Net: `c3req` / `c3s`; state `run.c3`, `run.c3live`.
- Tests: `node tools/harness/cycle3.test.mjs` (~40k checks), `cycle3_flow.test.mjs` (158, real host flow); browser body `tools/harness/wave4_cycle3.js`. First job with a human: ride the elevator with 2 tabs, look at the cab / statues / relays / wall, play a red + a hidden gate.

### 5.16 Wave 4 - HOST MIGRATION (module `hostmig`, docs/wave4/hostmig.md; node-tested + one 2-tab local run, NOT tested over real WebRTC)
- Host quits / crashes -> dialog "HOST LEFT - Continue with <name> as host? [Continue (new host)] [Leave to menu]" (EN/TR/RU) instead of the fatal "The host has left". All peers elect the same successor (lowest join rank, from the host's `hmx` crew order, unreachable peers ignored); the successor sets `isHost`, rebuilds `hostData`, creature authority (same ids, from `CreatureView.spawnData`), item authority, handlers, re-broadcasts the run; the others re-point `hostId`. Solo case = you become host. Wave-3 grace + resume is untouched (dialog only after 6 s of plain loss, closes on resume).
- Net: `hmx` (host snapshot every 3 s), `hmclaim` (epoch + rank, split-brain rules). Mods event `hostMigrated(game, {oldHostId,newHostId,epoch,self,degraded})`. `hostStart` is NOT re-emitted (would reset cycle / lore state); modules with host-only closure state reset (list in the doc). `config.hostMig=false` turns it off.
- Shared edits: `Session.migrateTo()` + `hostEpoch` (session.js), `hostLeft` handler in game.js, `CreatureView.spawnData` + `hostSpawn opts.id` (creatures.js). Tests: `node tools/harness/hostmig.test.mjs`, `tools/harness/wave4_hostmig_mp.mjs`.
### 5.16 Wave 4 - GUIDE (module `guide`, docs/wave4/guide.md; node-tested + one headless run)
- The Algorithm as an ADVISOR: short in-character tips in the existing intercom box (`game.lore.say`) about features the player has NOT used yet, picked by context (credits -> STORE, skill points -> K, skillbook -> spells, low HP -> food, no light -> flashlight, quota met -> CYCLE/KEYSTONE/RAID ...),
  cooldown ~2.5 min, repeat gap 25 min, max 3 shows per tip, max 14 per session, mutable in Settings > Gameplay > Algorithm tips. Registry of 44 hand-written features (EN/TR/RU how-to) + every terminal command found at runtime (`mods.commands`).
- Terminal: `GUIDE` / `TIPS` / `ALGO TIPS` (things you haven't tried), `GUIDE <name|key|cmd>`, `GUIDE ALL`, `GUIDE MUTE`, `TUTORIAL [STATUS|SKIP|RESTART]`, "did you mean" for unknown words, HELP footer. The lore module's `ALGO` command is wrapped, not replaced.
- Optional 7-step tutorial through the `objectives` hook (move/sprint/crouch, flashlight, scrap, inventory, scan, back to ship, sell): steps complete by themselves in any order, never blocks, +60 XP +25 Clout, veterans skip silently, replay from Settings. State in `profile.guide`; no net messages.
- Files `src/game/guide{,_core,_data}.js`, test `tools/harness/guide.test.mjs`, headless `tools/harness/wave4_guide.js`. Shared edits: 2 lines in `game.js`, settings rows in `ui.js`.
### 5.16 Wave 4 - COSM5: the big cosmetics drop (module `cosm5`, docs/wave4/cosm5.md; node-tested + builds + 2 short headless runs)
### 5.16 Wave 4 - COSM5: the big cosmetics drop (module `cosm5`, docs/wave4/cosm5.md; node-tested + builds; NOT run in a browser: the headless runs were cancelled, scripts wave4_cosm5*.js are for the lead batch)
- 59 procedural cosmetics: 14 suits (incl. animated-shader **Glitch**), 19 hats / head items, 10 back items (jetpack, capes, wings, server rack ...), 10 weapon skins (camo, carbon, damascus, bubblegum, circuit, lava, frost, holo, bone, rusted), 6 emotes. Files: `src/game/cosm5*.js`, `src/models/cosm5_models.js`, `src/render/weaponskins.js`.
- Plugs into the wave-1 wardrobe registries at import (models/cosmetics.js merges the rows like wave 3), emotes.js `EMOTES`, and `ui/panels/wardrobe.js` via `WARDROBE_EXT` (tabs Rotation shop / Weapon skins / Emotes; turntable = charpreview `setProp`). Skins follow the weapon HOLDER (every peer), forge +7 camo has priority.
- Sources: rotating wardrobe shop (8 daily + 1 weekly, seeded by UTC day), boss trophies (`c5drop`, every crew member), secrets (`RULES`), crate pool: **`cosmeticPool(tier)` / `game.cosm5.reward(key)`** for the daily-reward module. Net: `c5look` (compact code `a.s.h.b.k`), `c5drop`.
- Test: `node tools/harness/cosm5.test.mjs`. Harness: `tools/harness/wave4_cosm5.js`, `wave4_cosm5_smoke.js`.
### 5.16 Wave 4 - POLISH4 (module `polish4`, docs/wave4/polish4.md; node-tested + one headless run, hand-feel NOT verified)
- Seeded **pet egg drops** (chests by tier, bosses 35 % Wild / 15 % Glitch, rare elites; day cap 2, pity), **ship decals + floor furniture** with a placement mode (terminal `DECAL`, `FURNITURE PLACE`; state in `profile.shipyard.deco`), **Workshop craft luck** (wraps `rpg.bonus('craftLuck')`), **cantina barter** (E on an alien: daily rotating credit / swap / rare offers, host-validated), **Dune Maw untouchable while buried** (`CreatureView.hidden` + host `damage` guard), **squad flank + obstacle detour** (`hs_*` behaviour wrapper + `goTo` wrapper), **role cooldown floors** (abilities >= 3 min, Revive >= 7 min, HUD m:ss), **PET panel redesign** (portraits + turntable via `ui/panels/pets_studio.js`, XP bar, Summon / Feed / Rename / Release).
- i18n: `tools/i18n_audit.mjs` follows imported dictionaries now; **0 keys missing TR / RU** (was 95 / 404), `polish4_i18n.js`. New `tools/undef_check.mjs` (no-undef scan, clean). Sims after loot x0.7 fine (no NaN, early game comfortable).
- Net types: `p4act`, `p4bt` (requests), `p4msg` (host -> peer). Tests: `tools/harness/polish4.test.mjs`, `polish4_install.test.mjs`, run `tools/harness/wave4_polish4.js`.
- Flashlight is NOT a starting item in this codebase (60 credits at start, flashlight 15 in the store); see the doc for the tutorial writer.
### 5.16 Wave 4 - DAILY (module `daily`; docs/wave4/daily.md; node-tested + builds, browser scripts written but NOT run yet (queue was full), NOT hand-played, NOT tested with 2 real players)
- Retention loop, tasteful (no money, gentle streak): main-menu **DAILY** screen (also in game: **B** / terminal `DAILY`) with a 7-day login calendar (Clout, components, forge shards, day-7 cosmetic crate; one grace day, gentle reset, comeback bonus),
  3 daily + 3 weekly challenges seeded by the local date / ISO week (same set for everybody, one reroll per day), earned crates with a spinning reel reveal (tier colours from `tiers.js`, existing sfx, duplicate protection),
  a free 30-tier monthly season track (cosmetic crates + titles), first win of the day x2 XP / Clout, level-up fanfare + milestone crates, quota celebration + Quota Crate, NEW! badges (CRT menu entry, tabs, HUD chip).
- State in `profile.daily` (local). Rules are pure and node-tested in `src/game/daily_core.js` (`node tools/harness/daily.test.mjs`, service + real cosmetics catalog: `daily_svc.test.mjs`; browser scripts `wave4_daily.js`, `wave4_daily_crate.js`, `wave4_daily_menu.js` are unrun); clock guard = high-water mark + one claim per date. Net: only `dyclaim` (request) / `dymsg` (host -> one client) to deliver parts / shards to the ship in orbit.
- The old automatic login bonus in `achievements.js` stands down when `game.daily` exists; `profile.login` is still mirrored. `FLAT_REASONS` in `profile.js` now also skips multipliers for `Daily*` / `Season*` reasons.
- First job next: play a day, watch the crate reveal at 1280x720 with real audio, tune `QUEST_REWARD` / `SEASON_NEED` against real session lengths, and run 2 players to check `dyclaim`.
### 5.16 Wave 4 - ARCADE: chess + dama + carnival corner (module `arcade`, docs/wave4/arcade.md; node-tested + one headless run, NOT hand-played)
- Chess (full legal rules, perft-verified) and DAMA (Turkish draughts: mandatory + majority captures, flying kings) on one table type with a mode toggle: tables in the ship, on the HQ pier and on the homeworld pad. 2 seats + spectators, host-authoritative, optional AI (easy / normal) for solo. 2D CRT-style overlay (E on the table).
- Carnival corner on the HQ pier: CAN KNOCKDOWN, SHOOTING GALLERY (toy gun), STRENGTH TESTER. 6 credits per round, prizes 4-24 credits, max 80 prize credits per player per game day; results are client-played, host-clamped.
- Files: `game/chess_rules.js`, `draughts_rules.js`, `arcade_core.js`, `arcade.js`, `arcade_booths.js`, `models/arcade.js`, `ui/panels/arcade.js`. Net: `ar` (HOST_ONLY snapshots / go / res), request `arreq`. Tests: `node tools/harness/arcade.test.mjs`; in game `tools/harness/wave4_arcade.js` (`&armode=ship|dama|hq`).
- ROCK-PAPER-SCISSORS between crewmates (E on a crewmate or `/rps [wager] [name]`, keys 1/2/3, Y/N): host-authoritative commit-reveal (`game/arcade_rps.js`, `arcade_rps_ui.js`), best of 3, optional Clout wager (max 25, 60/day winnings cap), hand-sign sprites over the heads.
- Open: no draw offers / clocks / hard AI, ring toss + cosmetic tickets not built, booths only on HQ, nothing tested with 2 real peers (RPS client only driven by fake host events).
### 5.16 Wave 4 - SOCIAL hub (module `social` + App-level hub service `src/net/hub.js`; docs/wave4/social.md; node-tested + 2-3 headless pages on the local transport, NOT tested over real WebRTC)
- Serverless "hub": separate Trystero room `tfg-hub-v1` (`kefal.hub`, lives on the App so it works in the menu). Tiny presence beacons every 10 s (nick, avatar thumb, level, status, public lobby if you host one and allow it),
  stale after 30 s, opt-out in Settings > Gameplay ("Social hub"), never throws into the game. Main menu item **HUB**: ONLINE / LOBBIES (Join through `ui.joinLobby`) / FRIENDS, DM window, ADD FRIEND, INVITE
  (lobby code, never the password), BLOCK. Friends = `profile.friends` (stable id + nick), last 50 DM lines per friend in `localStorage['tfg.social.dm.v1']`.
- In a run: ship phone HUD notice for DMs / invites / radio (`/r`, `/w`, `/invite`, `/accept`, `/decline`, `/hub`) and a private walkie text radio (`/rad`, key ` , `/tune`). Rate limits + `textContent` everywhere.
- Net types: hub room `sop sobye sodm soinv`; game session `sorad` (direct send). Tests: `tools/harness/social.test.mjs`, `tools/harness/wave4_social.mjs`.
- Gaps: identities are self-declared (no signatures), full-mesh room scales to dozens only, no friend-request handshake, no offline DMs, no 3D hub, radio is text (walkie voice already existed).
### 5.16 Wave 4 - maps5: ESTATE 9 + COLD STORAGE, 3 new labyrinths, 10 props, 2 creatures (module `maps5`, docs/wave4/maps5.md; node-tested + builds; headless script written but NOT run)
- Fixed moons `m5est` "E9-Estate of the Departed" (tier 2, 320) and `m5cold` "C0-Cold Storage Vault" (tier 3, 640), biomes `m5estate` / `m5cold` (`world/maps5_data.js`, decor in `world/maps5_estate.js` / `maps5_cold.js`, registered by importing `maps5.js`).
- Labyrinths (pure seeded planners in `game/maps5_core.js`, exported as `game.maps5.generators` for voyage): HEDGE MAZE (15x15, centre chamber prize, exit gate), PAPER ARCHIVE (2 levels, ladder + railed bridges), SERVER STACKS (shifting aisles:
  cycle of spanning trees, walls open-before-close, host-timed `m5sw`, warning strips, walls never close on the local player). Merged collider runs; solvability / determinism / collision flood-fill proven over 200 seeds.
- New: props `m5:*` (propfactory), creatures Hedge Warden (statue -> wake -> corridor hunt) + Cryo Sleeper (frozen -> thaw -> chill), 5 scrap items, zone fog / darkness / ambience, archive ladder (Player.update wrapper), TR + RU strings.
- Shared edits: `game.js` (import + slot), `world/propfactory.js` (`m5:` prefix). Net: `m5sw`, `m5sync`. Tests: `maps5.test.mjs` (18), `maps5_install.test.mjs` (10), headless `wave4_maps5.js` (+ `_shots.mjs` extracts its jpeg views) - first job: run it and LOOK at the 13 views (hedge / rack texture, archive lighting, cave, warning strips).
### 5.16 Wave 4 - STEALTH (module `stealth`; docs/wave4/stealth.md; node-tested + builds, NOT run in a browser: `tools/harness/wave4_stealth.js` is written but unexecuted)
- **Facility variety** on every regular facility (size >= 0.75, not backrooms / cycle cores): 6 maze styles (`world/maze_styles.js`), liminal rooms (cubicle farm, pool room, hall loop), dead-end nooks with a guaranteed prize,
  creaky hatch plates (one-way drop unless you sneak), a latch-controlled locked shortcut (extra edge). `world/facility_variety.js` + 9 `[stealth]` hooks in `facility.js`; `layout.variety` / `fac.variety`; off with `opts.variety === false`.
- **Sneak** (Alt or crouch-walk), noise table + surfaces + HUD NOISE meter + footstep rings (`game/stealth_core.js`, `localplayer.js`), walls / closed doors muffle sound in `CreatureManager.hear()` (`game.stealth.hearDist`).
- **Sound-hunters**: new **The Listener** (`stealth_creatures.js`, tier 2+) and the **Web Crawler** re-wired to the same alert -> hunt -> inspect / search brain. **Noisemaker** grenade kind (shop, 22 credits).
- Net: `stn` (client -> host request, compact rate-limited noise events), `stv` (host -> all, rings). Tests: `stealth_maze.test.mjs` (8000 facilities BFS), `stealth_noise.test.mjs`, `stealth_listener.test.mjs`; headless `tools/harness/wave4_stealth.js`.
- First job with real players: play a facility with a hatch + shortcut, sneak past a Listener, throw a Noisemaker through a door, check the Crawler early-game feel, and the look of cubicle / pool / hall rooms.
### 5.16 Wave 4 - EGGS (module `eggs`; docs/wave4/eggs.md; node-tested + one headless menu run; the moon script `wave4_eggs.js` was NOT run to completion; NOT hand-played, NOT tested over WebRTC)
- Main menu: no hands / viewmodel (the strapped-arm rig is no longer attached to the camera; `stripViewModel` already cleared the game viewmodel + FP layer). The Cell got 10 hidden props
  (`src/ui/menueggs.js`: cassette, CRT ch 7, drawer note, mug counter, knock-the-wall hatch, rotating WANTED poster, the phone's private line, the Algorithm's piano tune, duck behind the door, lamp Morse) + a subtle "Secrets x/19".
- Moons / facilities: rare seeded secrets (`src/game/eggs.js`, `eggs_models.js`): graffiti, shrine (scrap offering -> buff), hidden vending machine, corpse + diary, rubber ducks (counted across runs), frozen statue, payphone, dead-drop bag.
- Meta-secret THE LAST APPEAL (cassette + CRT + diary + statue + 3 ducks, then look inside the opened hatch): title **Cell 07 Alumnus** + hat **Retired CRT** (`hat:crthead`).
- State: `profile.eggs` (`eggs_core.js`, repaired on read). Net: `eggreq` (request), `eggst` + `eggfx` (HOST_ONLY). Tests: `node tools/harness/eggs.test.mjs`, `node tools/harness/eggs_install.test.mjs` (stub-game install), `tools/harness/wave4_eggs_menu.js` (headless_menu.mjs, now with `--shot`), `tools/harness/wave4_eggs.js`.
- Shared files touched (tiny, tagged `[eggs]`): game.js (import + slot), menuroom.js (3 lines), models/cosmetics.js (hat), game/cosmetics.js (unlock rule).
### 5.16 Wave 4 - SFX: creature voices + footsteps + biome beds + custom SOUND PACK (module `sfx`, docs/wave4/sfx.md; node-tested + builds, NOT run in a browser and NOT listened to by a human; tools/harness/wave4_sfx.js is written but unrun)
- Every creature id (72, incl. bosses / Backrooms / skeletons / siege / mirror) has an explicit profile in `src/game/sfx_profiles.js` (voice archetype + tuning, foot class, idle-call interval, reach, keep-stock list); recipes are pure DSP in `src/audio/creaturevoice.js` (11 archetypes x idle / alert / chase / attack / hurt / death + 17 footstep classes). `src/game/sfx.js` plays them 3D from replicated CreatureView state (hooks: `CreatureView.setState` -> `game.sfx.onState` returns `'own'` to mute the stock clip, `'hp'` event -> `onHurt`), with cooldowns, crowd gaps, voice cap, wall dip, seeded pitch / timing. No net messages.
- 16 ambience beds (`src/audio/sfx_beds.js`, layer `sxbed`) per biome + the 3 legacy interiors. `game.sfx.setSurfaceResolver(fn)` = footstep surface hook; `game.sfx.onCue(fn)` / mods event `sx:cue` = for other modules (stealth) to see every creature cue.
- Sound pack: Settings > Audio > Sound pack (`src/ui/soundpack_ui.js`); `audio.pack` (`src/audio/soundpack.js`) loads files / folder / zip / URL, maps them by filename (`creature_<type>_<event>`, `creature_any_<event>`, `voice_<n>`, `ui_*`, `sfx_*`, `step_*`, `amb_*`), stores them in IndexedDB (memory fallback), local only. Naming guide for the owner's Turkish meme pack: docs/wave4/sfx.md. No third-party audio is bundled.
- Tests: `node tools/harness/sfx.test.mjs` (6800+ checks). Browser check: `tools/harness/wave4_sfx.js`.
### 5.16 Wave 4 - HOMEWORLD 2 (module `homeworld2`, docs/wave4/homeworld2.md; node-tested (41 rules + 14 installer tests) + builds; NOT run in a browser: `tools/harness/wave4_homeworld2.js` is written, never executed)
- Ground flicker on the homeworld fixed at the root (PSX vertex snap on huge coplanar quads + 3 cm layer gaps -> `flatLayer` helper: `PSX_NOSNAP` + polygonOffset + 6 cm layers in `world/homeworld_map.js`).
- Press `T` on the homeworld: Satisfactory-lite factory (12 seeded nodes, miners, 60/min belts, smelters, assemblers, splitters, poles + generators with a power budget, Export Dock paying into the classic homeworld storage; economy governor 12/18/26 per dock per minute),
  snap-to-grid rooms (floor / wall / window / door / roof / furniture + 4 room kits, enclosure detector, storage / speed / Clout / greenhouse effects) and trees (real-time growth, Homegrown Apple food, wood). Instanced rendering (~20 draw calls).
- CoC-lite waves: gate (4 things, base value 450), telegraphed countdown while somebody is home, wave power scales with base value, real on-site raid via `homeworld.forceRaid({power})`, loot, lost wave = machines BREAK (repair, never deleted) + 15 min shield, call-early button.
- Ghost raids (`GHOST` / `GHOST GO`, RAID tab): rival / own / imported base snapshots, real sentries + guards, vault crack, capped loot, share codes (PvP flag = opt in). Live crew-vs-crew is not built (no second host).
- Offline catch-up from the same sim (8 h max, 10 %, storage-capped). Net types: `h2act`, `h2msg`. Tests: `node tools/harness/homeworld2.test.mjs` (41). First job next: play it with 2 tabs (belts drag, room walls, wave, ghost raid crack).
### 5.16 Wave 4 - HORROR (module `horror`, docs/wave4/horror.md; node-tested + builds, NOT run in a browser)
- Pay-to-arm traps in corridors / mazes (laser grid, crusher, spike floor, live floor, flame vent; credits via a wall panel, creature-triggered, refunds + kill credit), the OUTBREAK wing (Shamblers, 8-round sidearm + rare ammo box,
  typewriter safe room + item box, Green Herb FOOD item, crest-locked quarantine door), a two-floor dark oak MANSION (foyer, stairs, secret bookcases, Manor Wardens), bigger-on-the-inside CLOSETS (ballroom / warehouse / outbreak / mansion
  pockets at x >= 8000, seamless `portalMap()` teleport), CHALK (arrows / X, 24 per player, synced) + The Forger (scratches, redraws arrows wrong) and the FAKE closet ambush (tells + knock / hook counterplay).
- Files: `src/game/horror*.js` (core rules, maps, pocket / closet / trap / chalk builders, host, creatures, text), `src/models/horror_models.js`. Slot `horror` in `game.js`. Net: `hrReq`, `hrs`, `hrfx`, `hrch`.
  Integrates without generator edits (reads the layout on `mapLoaded`; extension event `horrorPlan`).
- Tests: `node tools/harness/horror.test.mjs`, `horror_build.test.mjs`, `horror_install.test.mjs` (real facility + fake game). Browser script written but NOT run: `tools/harness/wave4_horror.js`.
- First job with a browser: land on `orkinos` day >= 2, look at a trap panel + lane, cross a closet, read the fake closet tells, draw chalk, and check pocket lighting / performance (each pocket ~800 static boxes).
### 5.16 Wave 4 - SURVIVAL (module `survival`, docs/wave4/survival.md; node-tested + builds, NOT run in a browser)
- Foraging (7 seeded plants per biome, hold E, sickle), farming (planter boxes, real-time growth + watering, `game.survival.plantables / growTick` for ship2 / homeworld2 planters), cooking (ship stove + campfire, 1-3 ingredients, timing needle -> quality = item tier), brewing stand (4 tonics), storage crates (wood 6x3 / metal 8x4 / secure 10x5, grid panel with drag and drop, labels + colours, sort, shared, saved in `run['sv:<id>']`; home ones mirrored into the host profile), hunger meter (mild, never lethal) and cold-moon warmth. Healing is food-only: snacks nerfed (pizza 12, box 24, noodles 0.5 hp/s). Net: `svh svplace svst svfarm svcook svbrew svuse svfire svsync` + `svfx`.
- Tests: `node tools/harness/survival.test.mjs`, `node tools/harness/survival_install.test.mjs`. First job in a browser: `tools/harness/wave4_survival.js` (not run): stove / crate / planter positions on the ship, panel layout, plant look, placing kits.

### 5.16 Wave 4 - VOYAGE (module `voyage`, docs/wave4/voyage.md; node-tested + builds, NOT run in a browser)
- `MOON RANDOM` / `SIGNALS` (3 rotating uncharted signals) / random warp at the lever (12 %, crew vote on distress, never in quota 1-2 unless `WARP EARLY`) / `MISSIONS` board with 9 job types / 7 set pieces / 8 new biomes. A voyage moon is a pure function of its id `vy<tier><content>_<seed36>`.
- Shared edits: `moongen.js` (exports + `generateMoonFromKey`), `terrain.js` (`plan.flats`, `buildVoyageWorld` hook), `game.js` slot. Net: `vyreq`, `vyx`, `vyn`. State `run.vy`. Test: `node tools/harness/voyage.test.mjs`.
### 5.16 Wave 4 - CHECKUP (QA pass, docs/wave4/checkup.md; 3 headless runs, cut short by the owner's quota)
- Verified in a browser: boot, orbit panels at 1280x720, terminal route, land/walk/enter facility/pickup, ship door open from outside ([ux] fix works), takeoff + case file, HQ sell, quota met, backrooms pocket, mirror. Zero pageerrors.
- Fixed: objective list overlapping the left HUD dock (`objectives.js fitAboveDock`), "Value extracted ▮0" when scrap was dropped/held at takeoff (`host.js hostFinishTakeoff` final tally), role-skill tile text overlap (`role_skills.js` CSS).
- Not verified (test artifact / time): worlds2 moons, homeworld panel, core boss, ESC/pointer lock with real input, emote cam, MP 60 s. Scripts ready: `tools/harness/wave4_checkup_*` (runner keeps one browser, freezes rAF, real input via `__click/__press`).
### 5.16 Wave 4 - UI2: one art direction "company-issued equipment" (module `ui2`, docs/wave4/ui2.md; build + one headless screenshot run)
- New override layer `src/ui/theme.css` (+ `theme.js`, imported from main.js, adds class `tfg-ui` on `<html>`; remove that class to compare with the old look). Tokens `--t-*`,
  bundled condensed label font (Barlow Condensed / Roboto Condensed Cyrillic, `src/ui/fonts/`), `--font2` and `--cond` now both = that face (Press Start 2P is no longer used for labels).
  Hard edges, plate titles on hazard tape, segmented bars, flat cards, no glow/lift. Panel JS was not rewritten: everything keys off the existing base classes
  (`.menu-frame`, `.cp-head/.cp-sec/.cp-body/.cp-foot`, `.btn*`, `*card*`, `.rl/.pt/.rec/.lb/.crp` roots). New helpers: `src/ui/glyphs.js` (`glyph(name)`, `glyphFromEmoji`), classes `.tfg-plate/.tfg-tag/.tfg-kbd/.tfg-num/.tfg-bar/.tfg-card/.tfg-hazard`.
- Rule for panel authors: use `ui.frame()` / the base classes, `glyph()` instead of emoji, no border-radius/glow/gradient cards/`backdrop-filter`, colours from `--t-*` / `--ph*`.
- Tools: `tools/harness/ui2_shots.mjs` (before/after from ONE page, `--both`), `tools/harness/ui2_glyphs.test.mjs`.

### 5.17 Wave 4 lead handoff (2026-09-29)
- Merged to main: cycle3, hostmig, guide, cosm5, polish4, daily, arcade, social, maps5, stealth, eggs, sfx, ship2, homeworld2, horror, survival, voyage, checkup, ui2 (+ lead viewmodel fix b17bf60).
- IMPORTANT: the sfx module is installed as `game.cvoice` (NOT `game.sfx`): `game.sfx(name, vol)` is the core sound function and was shadowed (every sound call threw). Never give a module a name that is already a Game method.
- Listener run speed lowered 8.8 -> 7.6 m/s (sprint is 8.2) so players can break contact.
- Verified: all node suites + build; browser: boot + hamsi landing with all 55 modules, 0 page errors. NOT browser-verified: almost every wave-4 feature (see each docs/wave4/*.md "not verified" list; harness scripts tools/harness/wave4_*.js are ready). smoke_land.js now exceeds a 400 s timeout under swiftshader (warm-up), give it 900 s.
- Open from checkup: mirror timer over clock/compass, compass SHIP/ENTRANCE overlap, Algorithm LIVE banner over panels, VHS overlay over hotbar, GPU geometry count grows across landings (possible leak), "a Enforcer" grammar.

### 5.18 Wave 5 - SHIP INTERIOR clean-up (docs/wave5/ship_interior.md; browser-verified headless before/after + node overlap test, NOT hand-played)
- `src/world/shiplayout.js` is now THE layout for every in-ship fixture of every module (survival built-ins, arcade chess table, cycle3 trophy wall, food table, polish4 emblem, ship2 pots, mod monitor / loot board via `game.ship.layout.mods`). New fixture = SPOTS entry + box in `fixtureBoxes` + standing spot in `ACCESS`, then `node tools/harness/ship2_overlap.test.mjs` (overlaps / walls / aisles / signs / 0.9 m walker; wave-4 state 28 problems -> 0).
- Fixed: trophy wall over the +z wall props/windows (now on the cockpit bulkhead, 3 merged meshes), stove in the N1 doorway, brew stand in the bulkhead, crate / planter inside the kiosk, chess table inside the workbench, door leaf showing through the cargo wall, double floor + hidden hazard strip + PSX shimmer, T-junction seams (`shipdeco.gridWall`), engine walkway 0.76 -> 0.93 m (`ENGINE_Z` -1.68), hull stripes / KC-07 / shipyard paint over doorways + windows, floating nose ring.
- Browser tour: `tools/harness/ship_tour.js` (pins its own camera, runtime overlap check). Restart vite after edits: the worktree path `.claude/` is excluded from vite's watcher, so a running server serves stale modules.
### 5.19 Wave 5 - HARVEST2: hit trees/rocks instead of hold-E (docs/wave5/harvest2.md; node-tested incl. mock-game host flow + build, NOT run in a browser)
Axe x2 on trees, Pickaxe x2 on rock, weapons x0.6, fists x0.3; host multiplies/validates (range, rate, clamp) via `src/game/harvest2_core.js`; wobble + fx on every hit; new shop tools `tool_axe` / `tool_pickaxe` (durability-wear as melee weapons). No new net types (`wxHit` payload `{s,id,d,c}`). Herbs/chests stay E; ore veins and breakable crates not converted.

### 5.19 Wave 5 - LOCKPICK 2 (docs/wave5/lockpick2.md; node test + build + 1 short headless run, NOT hand-played / 2-player)
- Timing-click lockpicking, 5 lock tiers (Simple 1 pin ... Vault 4 + timer ... Algorithm shuffling), per-profile Lockpicking skill (`profile.lockpick2`: window, auto-seat, silent, one-click), Titanium Pick + Electronic Bypasser in the shop, drill reused (loud via `game.stealth.emit`), co-op pin holding (net `lpReq` / `lpSt`). `MINIGAMES.lockpick` is now a wrapper (module `lockpick2`); rules in `src/game/lockpick2_core.js`, test `node tools/harness/lockpick2.test.mjs`.

### 5.19 Wave 5 - AIMCHASE (docs/wave5/aimchase.md; node test tools/harness/aimchase.test.mjs + build, NOT run in a browser)
- Telegraphed NPC aim: shared `aimtell_core.js` / `aimtell.js` (aim 0.8-1.4 s red laser -> 0.25 s white lock -> shot at the LOCKED point -> 2-4 s cooldown, accuracy by distance/sprint/cover/quota, group limit 1-2) routes hs_gunner/leader, scavraider, moderator, h2_sentry, facility turret, skel_archer; sync rides in creature `extra` string, no new net message. Chase tuning: `chase_tuning.js` (sustained 7.0 < sprint 8.2, burst 2-3 s <= 9.5, fatigue, wide turns, 1-2 s door hesitation) applied in `CreatureManager.follow()`; `chase.js` adds the vignette pulse.

### 5.19 Wave 5 - STAIRS (docs/wave5/stairs.md; node-tested with the real Rapier character controller + builds, NOT run in a browser, NOT hand-played)
- Root cause of "stairs can't be climbed": stepped box colliders stall Rapier's autostep whenever the player presses sideways into a wall / rail (stairwells!). New `src/world/stairs.js` (`planStairs`, `rampWorld`, `checkStairs`, `ladderStep`): visual steps (no collider) + ONE inclined ramp cuboid (slope <= 47 deg, controller climbs 50) + flush landings + skirt boxes under the ramp. `physics.addStaticBox` now accepts a quaternion in place of rotY; `Solids.stairs()` exists in worlds2_solids.js and landmarks.js.
- Ported: worlds2 Soviet blocks, landmark towers + ruins, sand crawler rear ramp, horror mansion grand staircase, facility catwalk `stairs_metal` prop (ramp collider with `q`, `userData.stairs`), archive ladder rules (`ladderStep`). Test: `node tools/harness/stairs.test.mjs` (116 flights over 3 seeds + walk sims; old stepped colliders fail 7/24 wall-hugging runs).

### 5.19 Wave 5 - THE ALGORITHM learns you + Morning Vote + LIVE viewers (module `algo1`, docs/wave5/algo1.md; node-tested + builds, headless run SKIPPED: shared browser lock busy >5 min)
Host tracks 3 habits per landing (favourite wing L/C/R from the entrance, sprint ratio, deaths/near-deaths + causes) and applies ONE capped counter next landing (creature on the favourite wing / noise-hunter `listener` / +1 of the killer / mercy danger x0.9), announced once on the intercom; never in quota 0. Orbit: 3-card rule vote (keys 1/2/3, 15 s, ties -> Algorithm, one loser = half-strength debt next day). Viewer count on the `.algo-live` banner + mods event `tfg:viewers`. Net `a1req` / `a1s`. Tests: `node tools/harness/algo1.test.mjs`; headless script `tools/harness/wave5_algo1.js` written but NOT run.

### 5.19 Wave 5 - ZONES: reclaim the sectors (module `zones`, docs/wave5/zones.md; MASTERPLAN §26 v1; node-tested (zones.test.mjs 1088 checks + zones_host.test.mjs mock host flows) + builds, NOT run in a browser: headless attempt timed out on the shared lock)
Each charted / generated / voyage moon = 3-6 seeded zones (open sectors + facility wings) with a core placed at landing on reachable terrain; clear 28 m for 20 s + hold-plant a Beacon (credits) = owned (crew-colour pillar + ground ring); fortify with existing deployables (turrets, tesla, barricades, spikes, mines, floodlight, shield) from the `ZONES` sector-map panel; daily income (credits + biome material) hard-capped at 25 % of quota, minus defence upkeep, capped offline catch-up; Algorithm votes 1-2 zones per day end (never before quota 2): crew there at dusk = live siege-wave defence, otherwise auto-resolve (defence power vs wave power) -> bonus or infected. Net `znreq` / `znx`, state `run.zn`. Gaps: no browser look, outdoor deployables only (no interior wings / horror traps / homeworld2 walls), raiders ignore barricade collision, dormant zones on rotated sectors, balance on paper.

### 5.19 Wave 5 - UNIFY: one defence core, one maze library, one food rule, two currencies (docs/wave5/unify.md; node-tested (defense_core / mazegen / consumables / wallet tests + every touched system's suite) + builds, NOT run in a browser)
`src/game/defense_core.js` = the single defence table + `getDef` registry (siege deployables, ship2 mounts, zones, homeworld towers / walls, horror traps as facility-only `trap_*`) + `defencePower` / `ratingOf` calculator (zones' old numbers within 8 %) + `pickTarget` / `chainTargets` (deployables, homeworld raid). `src/world/mazegen.js` re-exports the proven planners (maps5_core, maze_styles, backrooms pocket, horror ASCII pockets) with `planMaze` + `checkSolvable`; facility / maps5 callers point at it. `src/game/consumables.js` = the food table + rule check (snack <= 24 HP, cooked meals are the real heal, herbs are food, medicine separate; ramen / cake / meat regen trimmed, snack hunger explicit). `src/game/wallet.js` = Credits + Clout only (HUD wallet row, materials = comp / shard / stash). `DEPS` keeps price / ammo / cap / supply; the combat literals there are overwritten by `applyToDeps` (strip after hardmode merges).

### 5.19 Wave 5 - CHESS3D (docs/wave5/chess3d.md; node-tested, browser run interrupted, layout NOT eyeballed)
Chess / dama tables are now real 3D: camera eases over the table, instanced lathe pieces (12 draw calls), raycast click/drag, glowing legal-move discs, last-move + check marks, HUD promotion picker, animated moves for all peers via the existing `ar` snapshots; the 2D panel is the "Classic view" toggle. Code: `src/game/chess3d.js`, `chess3d_map.js`, `src/models/chess3d.js`. Rules/net unchanged.
### 5.19 Wave 5 - SHIPDECK: Upper Deck for the ship (docs/wave5/shipdeck.md; node-tested incl. a real-controller walk up the stair + builds; NO browser run (lock busy, script tools/harness/wave5_shipdeck.js ready), NOT hand-played / 2-player)
- Shipyard "Upper Deck" (tiered, ▮450 / 800 / 1500 or ship parts): Mk I bare deck on the roof (x -0.5..4, y 4.0) reached from INSIDE by a U-shaped `planStairs` stair in the hub through a ceiling hatch (ship.js `deckHatch` lid), Mk II glass-band cabin + 2 rooms the crew picks (bunk / storage / turret control / lounge, ▮120 each), Mk III glass dome + 4 slots + extra ship2 mount `M6` (+1 power slot). State `profile.shipyard.deck {t, rooms}` (host-authoritative through `syact` ops `deckup` / `deckroom`, mirrored in `run.sy`); module `src/game/shipdeck.js` (polls run.sy, builds `models/shipdeck.js` + colliders from `shiplayout.deckColliders`), panel tab `ui/panels/shipdeck_tab.js` (side cross-section SVG + costs). shiplayout.js stays the authority (WELL / DECK / DECK_SLOTS / deckStairs / deckColliders). To make room: chess table, 3rd ceiling lamp, disco ball, 2 spawns and the roof antenna moved, TURRET roof socket moved aft (x 4.15..6.95), ship2 mounts M1-M5 re-placed (ids kept) + M6. Tests: `ship2_overlap` (26, floor 1 + floor 2 + stair + hatch), `shipdeck.test.mjs` (14: rules + Rapier walk sim), `shipyard_install` (+3). Effects of rooms are small numbers (turret +10% fire rate, +6 rack slots, +60 s Rested, +10% jam) that only count when the matching module exists.
### 5.19 Wave 5 - HARDMODE: Casual / Standard / Hard (module `hardmode` + `src/game/difficulty.js`, docs/wave5/hardmode.md; node-tested (378 checks) + `tools/sim/economy.mjs` (3 modes side by side) + builds, NOT run in a browser)
- ONE lobby setting (Host screen "Difficulty", `game.config.difficulty`, synced in the welcome config); ONE table `difficulty.js TABLE` read by tiny hooks. Casual = old numbers, Standard = MASTERPLAN 25.4, Hard = a notch harder; every pressure rule starts at quota INDEX 3 (quota 0-2 identical in all modes, proven by the sim). Rules: loot value x0.8 (`scrapValueMul`), heavier carry penalty, quota growth x1..1.15 by surplus, ship-door lock warning 90 s (late crew are stranded alive, lose scrap, return hurt), creatures close doors / cut lights, dishes spoil after 3 days (crates = cold storage), single stove + 5 crates, trap-kit price +10% per kit bought today, turret ammo x1.5, forge drop from +5 (Hard) / Backup Drive craft rules. Net: only `hms`. Forge note: the table's "flat risk" did not match the code (drop from +6 + Backup Drive already existed), see the doc. Sim (4 competent): median quotas 9 -> 8 -> 7.
### 5.19 Wave 5 - ONBOARD: "Hiring Day" first start + staged unlocks (module `onboard`, docs/wave5/onboard.md; node-tested (510 checks incl. a full flow on a stub game) + builds + one short headless screenshot run, NOT hand-played / 2-player)
Fresh HOST profiles start in Cell 07 (Company announcement + The Algorithm's first "I'm watching you") -> orientation corridor (walk / crouch under a duct / sprint through a closing shutter / flashlight from locker 07 / mug = first loot / blackout + harmless glimpse / first locked cabinet = `openMinigame('lockpick', {tier:'simple'})`) -> hangar with the Mini-Skeld (board explains TERMINAL / LEVER / DOOR) -> real ship -> first landing with ONE goal (bring 50 scrap) -> return: day summary + The Algorithm's first remark from what you did. Compact merged geometry (~20 draw calls, 0 lights) far from the ship, disposed on boarding; steps are accumulating facts (`onboard_core.js`), guide tutorial steps `move` / `flash` / `scrap` are marked as they happen, guide is muted meanwhile. Skips: veterans / joiners (flag in `profile.onboard`), loaded saves, `?autohost` dev runs (force with `&hiringday=1`), Settings "Skip Hiring Day"; hold Backspace 2 s to skip. Co-op: crew waits in the real ship, cannot pull the lever until the host reaches the lever step. Staged unlocks: forge q1, pets + voyage q2, homeworld q3, glitch gates after the first boss, "gifted" by The Algorithm (`profile.unlocks`, veterans = all, Settings "Unlock everything"); one guard line each in `forge.js`, `pets.js`, `voyage.js`, `cycle3_gates.js`, `terminal.js` (`game.onboard.locked / deny / routeBlocked`). No new net message types.
