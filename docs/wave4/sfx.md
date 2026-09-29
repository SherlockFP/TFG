# Wave 4 - SFX: creature voices, footsteps, ambience beds, custom sound packs (module `sfx`)

Owner ask (TR): "Bazi yaratiklar ses cikarsin, tabii ki ses efektleri olsun." The owner also linked a Lethal Company mod ("Turkish Sound Effects").
**We do not download or bundle third-party mod audio** (licence unknown). Instead every creature got a procedural voice, and every player can load
**their own** sound files locally (Settings > Audio > Sound pack), e.g. a Turkish meme pack they made or own.

Files (all new unless noted)
| File | What |
|---|---|
| `src/audio/creaturevoice.js` | pure DSP recipes: 11 voice archetypes x 6 events + 17 footstep classes (uses `dsp.js`), no Web Audio |
| `src/game/sfx_profiles.js` | per-creature profile table (72 ids), state -> event map, cooldown / volume / reach tables, seeded per-creature variation |
| `src/game/sfx.js` | the game module: plays the sounds 3D from replicated creature views, footsteps, ambience beds, chat command `/sfx` |
| `src/audio/sfx_beds.js` | 16 procedural ambience loops (13 outdoor biomes + 3 legacy interiors) |
| `src/audio/soundpack_core.js` | pure: filename convention parser, zip reader, URL manifest, IndexedDB wrapper with memory fallback |
| `src/audio/soundpack.js` | `SoundPack` (decode, register, override + restore, import files / zip / URL); attached as `audio.pack` in `AudioManager.init()` |
| `src/ui/soundpack_ui.js`, `src/ui/sfx_pack_i18n.js` | Settings > Audio > Sound pack panel (EN / TR / RU) |
| `tools/harness/sfx.test.mjs`, `tools/harness/wave4_sfx.js` | node test (6800+ checks) / headless browser check |
| shared edits (tiny) | `game.js` (import + `useModule('sfx', installSfx)`), `entities/creatures.js` (2 hook lines), `audio/audio.js` (attach pack), `ui/ui.js` (1 line + import) |

No network messages: the layer is 100 % client side (creature state / hp / movement are already replicated by the host). **Message types added: none** (the `sx` prefix is unused).

## 1. Creature sound identity

Every creature id has an **explicit** profile (`PROFILES[id]`; the node test fails if a registered creature is missing): a voice (archetype + tuning), a foot class,
how often it calls while unaware, how far each kind of sound carries, and which stock (recorded) sound stays layered on top.

Archetypes (recipes in `creaturevoice.js`; each has idle / alert / chase / attack / hurt / death, 3 seeded variants):
`beast` (growls, pants, snaps), `chitter` (clicks, servo ticks), `human` (formant voice; `radio` = squad radio static, `glitch` = deepfake / data corruption,
`whisper`), `undead` (groans + bone rattle), `robot` (servo, beeps, clangs), `glitch` (Algorithm creatures: modem warble, sample&hold data screech,
buffer-underrun deaths), `wet` (slop, bubbles, squelch), `screech` (birds, screams), `giant` (sub-bass roars + thumps), `toy` (music box, cackle, crank),
`ghost` (whispers, wails). About 20 creatures also carry hand-written overrides (Data Hoarder "yip-pee", Clickbait notification ding, Legacy Bot dial-up modem,
Foreman furnace roar, Key Holder key ring, Spambomb fuse, NPC plastic joints, Fake Exit door slam, Paper Shield rustle ...).

Event mapping: creature state -> `alert` (roar, angry, howl, scream, aim, windup, reveal, scan, primed ...), `chase` (run, hunt, chase, stalk ...),
`attack` (attack, lunge, slam, stab, snip, grab, emerge, popped ...), `hurt` (hp event with damage, stunned, stagger), `death` (dead), `idle` (timer while
idle / walking / patrolling), `step` (distance walked). Anything not mapped keeps its old stock sound.

Gameplay intent
- **Telegraph**: `alert` is a distinct rising cue that fires when the wind-up / roar / aim state starts (before the `attack` hit); attacks are short and sharp.
- **Locate threats**: everything is HRTF-panned from the creature (the sound follows it); alerts / attacks carry far (`range[1]`), idle calls are quiet tells (55 % reach),
  steps 35 %. Big things (Influencer, Worm, Dune Maw, bosses) shake the floor with low, slow steps; a Lurker, the Host and Prowlers are near silent (`sil`) on purpose.
  Other modules (e.g. `stealth`) can subscribe: `game.cvoice.onCue((cue, view) => ...)` / mods event `sx:cue` with `{ id, type, event, dist, t }`.
- **Not spammy**: a per-creature cooldown per event (`EVENT_COOLDOWN` x a seeded 0.85-1.15), a per-TYPE crowd gap (`CROWD_GAP`, x2.2 for `crowd` types), at most 10 simultaneous
  sounds of this layer (idle / chase / steps are dropped first), distance gates, idle timers seeded per creature id + phase.
- **Distance / occlusion**: panner rolloff from the profile range, `occlude: true` (the existing raycast lowpass in `audio.update`), a 40 % level dip through walls
  (`audio.occluder`), and a duller lowpass on far sources.
- **Variation**: per-creature seeded pitch (0.92-1.08) and timing, +-3 % per play, 3 rendered variants per event.
- **Footsteps by size**: foot classes `pad paw skitter scuttle plastic squelch metal bone boot stomp hoof bare shoe flap shuffle wheel rumble`; stride (metres per step) and
  pitch scale with size. **Surface hook**: the floor under the creature is classified with the same rules as `game.footstep` (metal ship, interior floors, biome ground);
  a quiet layer of the existing `step_<surface>_N` sample is added (metal / gravel / water / wood / tile / concrete; softer for grass / snow / mud / carpet).
  `game.cvoice.setSurfaceResolver(fn(pos) -> 'metal' | ...)` overrides it; `game.cvoice.surfaceAt(pos)` exposes it.
- Rendering: lazy, 32 kHz, cached in `audio.buffers` as `sx:<voice>:<event>:<variant>`; `prime(type)` renders a creature's sounds in idle slices when its first view appears
  (1170 recipes render in ~6 s total in node, ~5 ms each, so a first play never hitches).

Stock sounds: `STATE_SOUNDS` still exist. For events where the profile lists `keep` (crawler / hound / lurker / giant / screamer / worm roars, Backrooms `br_*` cues, jester pop,
turret / mine) the recorded sound plays too and ours is 40 % quieter; everywhere else ours replaces the generic reused clip. A custom pack always replaces both.

### Profiles (generated from `PROFILES`)
| creature id | voice (archetype) | feet, stride | idle call (s) | carries (m) | stock sound kept on top |
|---|---|---|---|---|---|
| `scuttler` Spam Bot | spambot (chitter) | skitter, 0.35 m | 4-9 | 28 | - |
| `yoinker` Data Hoarder | hoarder (screech) | pad, 0.6 m | 5-11 | 32 | - |
| `crawler` Web Crawler | crawlerbot (chitter) | scuttle, 0.9 m | 8-16 | 55 | alert, chase |
| `lurker` Lurker | lurker (beast) | bare, 1.5 m | 12-24 | 24 | alert, attack |
| `mannequin` NPC | npc (undead) | plastic, 0.9 m | 9-18 | 30 | - |
| `sludge` AI Slop | slop (wet) | squelch, 0.7 m | 6-12 | 30 | - |
| `jester` Pop-up | popup (toy) | shoe, 1 m | 6-13 | 50 | attack |
| `spider` Web Spider | webspider (chitter) | skitter, 0.6 m | 7-14 | 36 | - |
| `leech` Leecher | leecher (wet) | pad, 0.5 m | 6-14 | 22 | - |
| `screamer` Screamer | screamer (screech) | bare, 1.3 m | 10-20 | 45 | alert |
| `mimic` Deepfake | deepfake (human) | boot, 1.15 m | 9-18 | 34 | - |
| `hound` Troll | troll (beast) | paw, 1 m | 7-14 | 60 | alert, chase, attack |
| `giant` Influencer | influencer (giant) | stomp, 3.2 m | 9-17 | 120 | chase |
| `sandkefal` The Worm | worm (giant) | rumble, 3.5 m | 10-20 | 110 | alert |
| `turret` Firewall Turret | turret (robot) | none | 5-10 | 38 | alert |
| `mine` Clickbait Mine | mine (robot) | none | 3-6 | 20 | alert |
| `mimicdoor` Fake Exit? | fakedoor (beast) | none | 8-15 | 26 | - |
| `web` Web | web (wet) | none | silent | 20 | - |
| `moderator` The Moderator | moderator (robot) | boot, 1.3 m | 8-15 | 50 | - |
| `support` Customer Support | support (human) | wheel, 1.2 m | 6-12 | 36 | - |
| `ticketswarm` Ticket Swarm | ticketswarm (glitch) | none | 2-4 | 40 | - |
| `editor` The Editor | editor (glitch) | stomp, 2.6 m | 8-14 | 44 | - |
| `tamagotchi` Tamagotchi | tama (screech) | pad, 0.5 m | 4-8 | 40 | - |
| `stalker` Parasocial | parasocial (ghost) | none | 6-13 | 30 | - |
| `clickbait` Clickbait | clickbait (glitch) | pad, 0.9 m | 6-12 | 38 | - |
| `replyguy` Reply Guy | replyguy (screech) | flap, 0.8 m | 4-9 | 40 | - |
| `zombot` Zombie Account | zombot (undead) | shuffle, 0.9 m | 5-11 | 34 | - |
| `hs_enforcer` / `hs_gunner` / `hs_leader` | squad1 / squad2 / squad3 (human, radio) | boot, 1.2 m | 7-14 | 44-50 | - |
| `doppel` The Doppel | doppel (human, glitch) | boot, 1.15 m | 8-16 | 36 | - |
| `collector` Collector | collector (chitter) | scuttle, 0.5 m | 5-10 | 28 | - |
| `janitor` Janitor Bot | janitor (robot) | wheel, 1.3 m | 7-14 | 40 | - |
| `hoardnest` / `janitorbin` | nest (chitter) / bin (robot) | none | 8-15 / silent | 22 / 20 | - |
| `br_smiler` / `br_hound` / `br_partygoer` / `br_moth` | smiler (ghost) / palehound (beast) / partygoer (toy) / moths (chitter) | none / paw / shoe / none | 3-16 | 30-45 | their own `br_*` cues stay |
| `dunemaw` Dune Maw | dunemaw (giant) | rumble, 3 m | 12-22 | 110 | - |
| `tuskbeast` Tusked Beast | tusk (beast) | hoof, 1.8 m | 8-16 | 70 | - |
| `scavraider` / `alien_npc` / `prowler` | raider (human) / alien (human) / prowler (beast) | boot / pad / paw | 6-16 | 34-44 | - |
| `skel_walker` / `skel_archer` / `skel_knight` / `skel_swarm` | bones (undead, no voice) x1 / x1.25 / knight x0.8 / x1.7 | bone / bone / metal / bone | 3-14 | 24-44 | - |
| `skeleton` / `robot` (ext) | skeleton (undead) / secbot (robot) | bone / metal | 6-12 | 36-44 | - |
| `sg_swarmer` / `sg_runner` / `sg_brute` / `sg_boss` | spambot x1.15 / troll x1.3 / slop x0.75 / influencer x0.75 | skitter / paw / squelch / stomp | 3-14 | 26-100 | - |
| `mr_ghost` / `mr_fiend` / `mr_copy` | wraith (ghost) / fiend (beast) / deepfake x0.9 | none / paw / boot | 6-15 | 30-36 | - |
| `foreman` / `legacybot` | foreman (robot, furnace roar) / legacybot (robot, modem alert) | stomp | 7-13 | 100 / 120 | - |
| `loadbalancer` / `lbnode` / `mmpaper` | loadbalancer (robot) / lbnode (robot) / paper (rustle) | none | 4-8 | 80 / 36 / 24 | - |
| `middlemanager` / `surgeon` / `host` / `lobbymanager` / `keyholder` | manager (human) / surgeon (human, whisper) / host (ghost) / lobbymgr (glitch) / keyholder (chitter, keys) | shoe / boot / bare / boot / scuttle | 5-13 | 40-70 | - |
| `hydra` / `hydrahead` / `hydrareply` | hydra (wet) / hydrahead (beast) / hydrareply (chitter) | none / none / skitter | 3-10 | 24-80 | - |
| `excavator` The Excavator | excavator (giant, pickaxe) | stomp, 2.6 m | 7-13 | 100 | - |
| `spambomb` Spambomb | spambomb (glitch, fuse) | none | 4-8 | 40 | - |

Unknown / future creatures get a guessed complete profile from their def (`profileFor`: boss / big -> giant + stomp, hazard -> turret, small -> spambot ...).

## 2. Ambience beds
Layer `sxbed` under the existing `base` / `buzz` / `ship` layers (updated once per second from the moon's biome, ground or interior theme):
hills, swamp, snow (+ice), desert (+twinsun), moor, blackforest, datascape, servermarsh, ashfield (+lava), crystal, jungle, soviet, pier (Company), and interior beds
`i_factory`, `i_mansion`, `i_mineshaft` (the five newer interior themes keep their recorded beds). 10 s loops, equal-power seam, ~50-120 ms to render on first landing.
A pack file `amb_<bed>.ogg` (e.g. `amb_desert.ogg`) replaces a bed.

## 3. Custom sound pack (Settings > Audio > Sound pack)
Local only. Files are read with `<input type=file>` (loose files, a folder via `webkitdirectory`, or a `.zip`), stored in this browser's **IndexedDB** (`tfg-soundpack`),
decoded into the AudioManager cache and **never uploaded**. It only changes what the local player hears (nothing is sent to other players). If IndexedDB is unavailable
(private window, blocked storage) the pack still works until the tab closes (the panel says "not saved"). Optional: paste a URL to a `.zip` or a manifest `.json`
(`{"name":"x","files":{"creature_lurker_alert.ogg":"sounds/a.ogg"}}`, or a plain array of URLs); fetched with CORS, no credentials, https / http only - the user's responsibility.
Limits: 8 MB per file, 64 MB and 400 files per pack. Formats: whatever the browser decodes (`ogg opus mp3 wav m4a aac flac webm`).

### Naming convention (case, spaces, dashes, folders, accents and the extension do not matter)
| File name | Effect |
|---|---|
| `creature_<type>_<event>.ogg` | that creature's sound for the event; `<type>` = creature id from the table above (`lurker`, `hound`, `br_smiler`, `skel_walker` ...) |
| `creature_any_<event>.ogg` | every creature without a more specific file |
| `voice_<n>.ogg` | spoken lines. Humanoid creatures (`human: true`: Deepfake, Customer Support, squads, Doppel, Zombie Account, Raider, bosses ...) sometimes shout one instead of their alert (40 %), chase repeat (20 %) or idle call (15 %) |
| `ui_<name>.ogg` | replaces the game's `ui_<name>` sound (`ui_click`, `ui_hover`, `ui_confirm`, `ui_levelup` ...) |
| `sfx_<game sound>.ogg` | replaces any game sound by its id (`sfx_door_open`, `sfx_item_pickup`, `sfx_shotgun_fire` ...) |
| `step_<surface>[_<n>].ogg` | replaces a footstep set for everybody incl. the local player: `step_metal_1`, `step_grass_2`; without the number (`step_metal.ogg`) it replaces all the variants the game has |
| `amb_<bed>.ogg` | replaces an ambience bed (`amb_desert`, `amb_blackforest` ...) |

Events: `idle` (ambient call), `alert` (notices you / winds up), `chase` (hunting), `attack`, `hurt`, `death`, `step`. Synonyms are accepted: `scream roar notice spot -> alert`,
`run hunt -> chase`, `bite hit strike slam -> attack`, `pain damage ouch -> hurt`, `die dead -> death`, `walk footsteps -> step`, `talk say call -> idle`.
Trailing `_2`, `_3` (or `-2`, ` (2)`) are random variants: `creature_lurker_alert.ogg`, `creature_lurker_alert_2.ogg` ...

Example Turkish meme pack (any names work as long as they follow the prefixes):
```
creature_any_alert.ogg        <- "HADI BAKALIM!" for every creature that notices you
creature_hound_attack.ogg     <- the Troll bites with your favourite clip
creature_lurker_death.ogg
creature_scuttler_idle_1.ogg  creature_scuttler_idle_2.ogg
voice_1.ogg voice_2.ogg voice_3.ogg   <- lines the humanoids shout
ui_click.ogg                  <- menu click
sfx_door_open.ogg
amb_desert.ogg
```
Zip it (`meme.zip`) or pick the folder; the panel says how many files were accepted and lists the ignored ones with a reason. Pack sounds are peak-normalised to 0.8 (game
replacements only get a boost when very quiet). Keep clips short (< 3 s for creature events) and dry; the game adds 3D position, distance, walls and reverb.
"Preview" plays a random sound of the pack; "Use sound pack" switches it off without deleting it; "Remove pack" clears IndexedDB.

## 4. How to test
- `node tools/harness/sfx.test.mjs` - every creature id -> explicit complete profile, every recipe (3 variants) renders finite / audible / not clipped and voices are distinct, seeds,
  state map, beds, filename parser, zip, manifest, IndexedDB wrapper (fake IDB persistence, open failure, quota failure, no IDB, silent open) and `SoundPack` (import, variants, overrides +
  restore, disable, clear, URL import, non-http refused, reload).
- `npm run build`.
- In the game: chat `/sfx play lurker alert` (`/sfx pack`, `/sfx` = stats). Headless: `tools/harness/wave4_sfx.js` (see its header; written but NOT yet run - first job for the lead batch: check cue counts, the pack import + IndexedDB, the Settings panel screenshot).

## 5. Knobs
`sfx_profiles.js`: `PROFILES` (idle interval, range, stride, pitch, vol, keep, sil, crowd, human), `VOICES` (arch + tuning `k` + per-event overrides `ov`), `EVENT_COOLDOWN`, `EVENT_VOL`,
`EVENT_REACH`, `CROWD_GAP`. `sfx.js`: `MAX_VOICES`, surface layer tables. `sfx_beds.js`: `BED_LEVEL`, `LOOP_SEC`.

## 6. Known gaps
- Never listened to by a human: the recipes are checked by numbers (finite, level, distinctness), not by ear. Expect to retune levels / pitches; the profile table is the place.
- Occlusion is the existing raycast lowpass (`audio.occluder`) plus a level dip, not portal-based propagation.
- Bosses' bespoke telegraph sounds (`cycle_bossfx.js`, `bosses.js`) are untouched and still play; ours only adds voice / steps to them.
- `br_*` creatures keep their own `br_*` cues (only steps + idle are added).
- The pack is per browser (IndexedDB), not synced between devices; a pack can replace `ui_*` / `step_*` sounds but not music.
- `voice_<n>` lines are chosen at random, not matched to what a creature "says".
- A URL pack needs CORS; zip64 / encrypted zips are not supported.
