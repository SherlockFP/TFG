# KEFAL COMPANY — Game Design & Technical Plan

> Co-op PSX-style horror scavenging game in the browser. Lethal Company + R.E.P.O. core loop,
> with MMORPG-style personal progression (levels, stats, gear, bounties), minigames and mods.
> Stack: Three.js (render) · Rapier (physics) · Trystero (serverless WebRTC P2P) · Vite.

## 1. Pitch
You are a contract worker for **KEFAL COMPANY**, a fish-themed megacorp. Your crew rides an old
autopilot ship to abandoned moons (named after Turkish fish), loots derelict facilities, and sells the
scrap to The Company to meet an ever-rising **profit quota**. Fail the quota → you're fired (ejected).
Between runs *you* keep leveling: XP, skill points, personal gear bought at the Black Market, bounties,
cosmetics. The deeper you go (higher tier moons, later quotas) the nastier it gets.

## 2. Pillars (what makes LC / REPO work — see RESEARCH.md)
1. **Greed vs. fear** — every extra minute inside is more loot and more risk. Midnight = ship leaves.
2. **Sound is gameplay** — creatures telegraph with audio; you are heard too (sprint, items, *your voice*).
3. **Learnable creature rules** — each monster has one rule to master (don't look / do look / be quiet...).
4. **Proximity voice chat & physical comedy** — mouths move when you talk, ragdolls, dropping the vase.
5. **Darkness & limited info** — flashlight batteries, fog, the ship radar operator guiding the team.
6. **Short sessions, escalating stakes** — 3 days per quota, quota rises, moons get harder.
7. **Lo-fi PSX look** — low resolution, vertex jitter, dithering, posterized colors, thick fog, outlines.

## 3. Core loop
```
ORBIT (ship)  ──terminal: route moon, buy items, arcade──▶ pull lever
LANDING (seeded moon + facility generated identically on all peers)
MOON DAY 08:00 → 24:00 (≈12 real minutes)
   outside: terrain, weather, outdoor creatures at night, ponds (fishing)
   inside (main entrance / fire exit): procedural facility, scrap, creatures,
   vaults (safe minigame), fuse boxes (wire minigame), locked doors (keys/lockpick),
   reactor core (big value, pulling it cuts the power)
   carry loot back to the ship (4-slot inventory + physics carry for big valuables)
TAKEOFF (lever or auto at midnight; anyone outside dies, all dead = loot on board lost)
COMPANY HQ (moon 0): sell counter (buy rate rises as deadline nears), Black Market vendor,
   casino (slots), quest board (bounties), fishing dock
DEADLINE: after 3 days → sold ≥ quota ? new higher quota : FIRED (run over, profile kept)
```

## 4. Progression (MMO layer)
| Layer | Scope | Contents |
|---|---|---|
| Run (host save) | shared | team credits, quota #, days left, ship scrap & tools, ship upgrades |
| Profile (local) | personal, persistent | level 1–50, XP, skill points, Kefal Coins (personal currency), gear loadout, cosmetics, bestiary, stats |

* **XP**: bringing scrap to the ship (value share), selling, creature kills (by threat & level), minigames, surviving a day, meeting quota, bounties.
* **Level up** → +1 skill point, rank title (Intern → Trainee → Part-timer → Employee → Senior → Supervisor → Manager → Director → Kefal Lord).
* **Skills**: VIT (+HP), END (+stamina/regen), STR (+carry, melee dmg), AGI (+speed), LCK (+loot value, crit), TEC (+battery, scan range, easier minigames).
* **Kefal Coins** (personal): from kills, bounties, minigames, 10% bonus of every sale. Spent at the **Black Market**
  (Company HQ) on soulbound gear: weapons, armor (helmet/vest), perks, cosmetics (suits, hats). Soulbound gear
  is auto-given on every landing, can't be sold, never lost.
* **Credits** (team): terminal store (tools/consumables), moon routing fees, ship upgrades.
* **Difficulty curve**: `danger = moonTier + quotaIndex*0.35`. Scales creature level (HP/dmg), spawn budget,
  elite chance, loot value multiplier, quota growth.

## 5. Moons
| Moon | Tier | Cost | Biome | Interior | Notes |
|---|---|---|---|---|---|
| 0-Kefal HQ | – | 0 | industrial pier | – | sell / market / casino / bounties / fishing |
| 7-Hamsi | 1 | 0 | grassy hills | factory (small) | tutorial-friendly |
| 12-Lüfer | 1 | 0 | swamp forest, rain-prone | factory | ponds |
| 33-Palamut | 2 | 150 | snow | mansion | hounds at night |
| 56-Levrek | 2 | 200 | red desert canyon | factory (large) | sand kefal (leviathan) |
| 85-Çipura | 3 | 450 | storm moor | mansion (large) | elites |
| 99-Orkinos | 4 | 900 | black forest, eclipse | huge mixed | everything, best loot |

Weather: Clear · Rainy (mud) · Foggy · Stormy (lightning hits metal items) · Eclipsed (outdoor creatures from start).

## 6. Creatures (rule to learn)
| Id | Name | Where | Rule |
|---|---|---|---|
| scuttler | Scuttler | inside | pack trash mob, killable XP fodder |
| yoinker | Yoinker | inside | steals scrap to its nest; aggressive if you hold its loot |
| crawler | Crawler | inside | charges fast in straight lines, poor turning — sidestep |
| lurker | Lurker | inside | stalks from behind; look at it and it backs off; corner it and it snaps |
| mannequin | Mannequin | inside | only moves when nobody looks at it |
| sludge | Sludge | inside | slow, unkillable blob; calmed by boombox music |
| jester | Music Box | inside | follows, winds up (melody), pops → chases everyone; get outside |
| spider | Spider | inside | webs slow you, ambush, killable, drops silk |
| leech | Ceiling Leech | inside | drops on your head, blinds + DoT; hit it off |
| screamer | Screamer | inside | nearly invisible in dark; flashlight reveals; scream stuns |
| mimic | Mimic | both | looks like a crewmate (random name tag), goes for you |
| hound | Blind Hound | outside | blind; hunts by sound — sprinting, items, **voice chat** |
| giant | Giant | outside | sees you, grabs & eats; slow turning |
| sandkefal | Sand Kefal | outside (desert) | rumble → erupts from ground under you, huge dmg |
| turret / mine | hazards | inside | turret sweeps & shoots; mines click on step, blow on release; terminal codes disable |

Elites: glowing eyes, +level, better drops. Kills drop sellable trophies (MMO loot).

## 7. Items
* **Scrap** (value range, weight lb, 1-/2-handed): bolt, axle, bell, register, goldbar, duck, robot, lamp, canned,
  figurine, mug, teeth, airhorn, clownhorn, painting, pickles, bottles, trophy, perfume, flask, cog, phone, pot,
  steering, tv, magnify, skull, ring, reactor (apparatus)
* **Physics valuables** (REPO-style, grab beam, fragile — value drops on impacts): vase, statue, amphora, server, aquarium
* **Fish** (fishing): fish_kefal, fish_lufer, fish_levrek, fish_golden, fish_boot, fish_eel
* **Creature drops**: drop_scuttler, drop_spider, drop_crawler, drop_hound, drop_lurker, drop_giant
* **Tools / shop**: flashlight, proflash, walkie, shovel, pipe, stopsign, machete, sledge, taser, harpoon, shotgun,
  shells, stungrenade, medkit, adrenaline, boombox, spraypaint, glowstick, rod, key, lockpick, jetpack
* Inventory: 4 slots (mods can change), weight slows you, STR offsets. Scan (RMB) shows scrap values with rarity colors.

## 8. Minigames
Arcade cabinet "KEFAL JUMP" (ship) · Fishing (ponds, HQ dock) · Vault keypad memory (facility vaults) ·
Fuse box wires (restore power / open blast doors) · Lockpick timing (locked doors) · Slots (HQ casino, personal coins).

## 9. Multiplayer
* **Transport**: Trystero WebRTC mesh (Nostr signaling by default; MQTT/BitTorrent selectable) —
  no game server. Local transport (BroadcastChannel) for same-PC multi-tab testing.
* **Lobby browser**: everyone browsing joins a discovery room; hosts announce `{name, players, max, phase, moon,
  quota, mods, version, locked}` every 2 s; entries expire after 7 s. Private lobbies join by 6-char code.
* **Authority**: host simulates world (creatures, item physics, doors, time, economy). Each client is
  authoritative for its own movement and sends requests (pickup, drop, hit, use, terminal cmd). Physics items
  being grabbed transfer ownership to the grabber. Generation is deterministic from the host seed.
* **Voice**: mic stream to all peers; received streams → WebAudio HRTF panner at speaker's head,
  distance + wall occlusion lowpass, walkie-talkie radio filter, dead-can-hear-living rules.
  Analyser RMS drives the avatar's mouth (visor face). Voice loudness is "noise" for creatures.
* Text chat, emotes, spectator mode when dead, join mid-game (full state sync).

## 10. Rendering (PSX)
Internal low-res target (240/360/480p selectable), nearest upscale; vertex snapping in all materials;
Bayer dithering + color depth reduction + depth-based outlines in a post pass; exponential fog; constant-size
light pools (no shader recompiles); canvas pixel-art textures (64–128 px, nearest); visor HUD overlay.

## 11. Mods
`window.KefalAPI` — registerItem / registerCreature / registerMoon / registerCommand / on(event) / config.
Mods live in `public/mods/*.js` (listed in `mods/index.json`) or are imported from file in the Mods menu
(stored locally). Lobby shows required mods; mismatched peers are warned. Bundled examples:
more-players, big-heads, hardcore, disco-facility, kefal-shark (custom creature), extra-slots, infinite-sprint.

## 12. Code layout
```
src/
  main.js            bootstrap
  core/              engine (renderer, PSX post), input, rng, events, save, settings, i18n
  physics/           Rapier wrapper, character controller
  audio/             audio manager, sfxlib (procedural), voice
  net/               transports (trystero, local), lobby directory, session (host/client)
  world/             facility gen, terrain gen, ship, company HQ, nav grid, lighting, weather
  entities/          player controller, avatars, items, creatures (+ AI), hazards
  game/              game state (phases, quota, economy), data tables, progression, terminal
  models/            procedural models: avatar, creatures, items, props
  render/            textures, materials
  minigames/         DOM/canvas minigames
  ui/                menus, lobby browser, HUD, chat, terminal UI, character sheet, market
  mods/              mod API + loader
public/assets/ext    downloaded CC0 assets (see CREDITS.md)
public/mods          example mods
```

## 13. Milestones
M1 engine+PSX+player · M2 world gen · M3 items/inventory/scan/carry · M4 networking+lobby+voice ·
M5 creatures+combat · M6 economy/quota/terminal/progression/market · M7 minigames · M8 audio pass ·
M9 mods · M10 polish, multi-tab testing, build.
