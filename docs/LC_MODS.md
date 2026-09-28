# Lethal Company mods in TFG

TFG ships JS re-implementations of the most popular Lethal Company (Thunderstore) mods. Since the
"built-in mods" round (2026-09-28) the good QoL / content ones are **part of the base game** as
**TFG FEATURES**; cheats, jokes and difficulty presets stay **optional mods** (off by default).
Nothing from Thunderstore is downloaded or executed: every mod is a design reference rebuilt on
`window.KefalAPI` (`src/mods/modapi.js`), shipped as `public/mods/<id>.js` and listed in
`public/mods/index.json`.

## 0. How it works (for developers)

| Concept | Where | Notes |
|---|---|---|
| `KefalAPI.defineMod({ id, name, init(api, cfg), config, ... })` | `src/mods/modapi.js` | same API for built-ins and optional mods |
| **Built-in feature**: `builtin: true` | mod def | always initialised, on by default, one switch each. Every handler registered with `api.on(ev, fn)` is gated by `featureOn(id)` (except `boot`, `netReady`, `sessionEnd`, which install patches; patched code checks `api.enabled()` itself). `api.onAlways(ev, fn)` registers an ungated handler. Only bundled files can be built-ins (imported mods never are). |
| `scope: 'host'` (default) | mod def | CREW feature: the host's switch wins. The host writes `config.features` in `configure`; clients get it in the `welcome` config; live changes (terminal `FEATURES <name> ON/OFF`, host only) are pushed with the `tfg-features` mod message. |
| `scope: 'local'` | mod def | PERSONAL feature (HUD, cameras, lore, casino...): each player's own switch. |
| `category` | mod def | `content` / `horror` / `social` / `qol` / `hud`: groups the MODS screen. |
| `requires: ['other-id']` | mod def | the feature is off unless the other one is on (control-company-lite needs spectate-enemies). |
| Content gating | `ModManager.applyContentGates()` | items / creatures / moons / store entries registered through a built-in's scoped API are recorded; when the feature is off their spawn weights are zeroed, store entries pulled and moons hidden from `MOON_ORDER` (definitions stay, so saves / lobbies on them still load). |
| Join check | `ModManager.gateJoin()` (host, top of `hostOnPlayerJoin`) | rejects **before** any world data: (1) late joiners when *Late Join* is off and the ship is not in orbit, (2) players missing an optional **content** mod the host runs (auto-detected: the mod registered items / creatures / moons). |
| Missing moon guard | `ModManager.missingMoon()` (from `loadMapFor`), `hostStart` reset, `hostFinishLanding` abort | an unknown moon id never TypeErrors any more: clients leave with a clear message, the host resets / aborts the landing. |
| MODS screen | `src/mods/modscreen.js` (`mm.buildScreen(ui)`, called by `ui.screen_mods`) | two tabs: **TFG FEATURES** (by category, CREW / PERSONAL badges) and **OPTIONAL MODS** (CHEAT / JOKE and CONTENT badges), per-mod settings, import. |
| Migration | `ModManager.migrate()` (`featuresV: 1` in `kefal.mods.v1`) | built-ins that used to be optional: a stored "off" from that era is reset once, so they really are on by default. |

API v2 additions: `api.MOON_ORDER`, `api.RNG`, `api.hashString`, `api.G` (physics groups), `api.FACILITY_Y`,
`api.itemDef`, `api.createCreatureModel`, `api.emit(ev, ...)` (cross-mod events, e.g. `tfg:catRescued`,
`tfg:logRead`), `api.registerSound(name, gen)` + `api.playSound(name, opts)` (procedural WebAudio buffers),
`api.reward(to, xp, coin, reason)` (host), `api.featureOn(id)`, `api.isHost`, `api.onAlways`, and for built-ins
`api.enabled()`. `api.registerMoon(def, { hidden: true })` registers a moon that loads but is not routable.

## 1. TFG FEATURES (built into the game, on by default)

| Feature (id) | Port of | Switch | What it does |
|---|---|---|---|
| Late Join (`late-join`) | LateCompany / VeryLateCompany | CREW | Join mid-shift (moon, HQ, landing). Full-state sync + lit items re-applied + shift briefing. Off = join only in orbit. **new** |
| Push Company (`push-company`) | PushCompany | CREW | Look at a crewmate up close, **E** to shove (stamina, cooldown, anti-juggle). Peer-to-peer `tfg-push` message. **new** |
| Needy Cats (`needy-cats`) | NeedyCats | CREW | 7 internet cats roam facilities, meow (draws creatures), hop, purr when carried. Rescue to the ship = XP + Clout, then sell. **new** |
| Sell Bodies (`sell-bodies`) | SellBodies(Fixed) | CREW | Killed creatures leave a carcass item (`corpse_<type>`) worth Credits at HQ; small ones fit a pocket, big ones need the grab beam. **new** |
| Spectate Enemies (`spectate-enemies`) | SpectateEnemies | CREW | Dead: **RMB** toggles crew / creature chase cam, LMB next creature. **new** |
| Control Company (Lite) (`control-company-lite`) | ControlCompany | CREW | Dead + watching a weak creature: **E** possesses it (WASD, Shift, LMB bite, E let go). Host-run, 25 s, 75 s cooldown, reduced damage. **new** |
| Helmet Cameras (`helmet-cameras`) | Helmet Cameras | PERSONAL | Hanging ship monitor with a live night-vision BODYCAM of a crewmate (160x120 render target, ~6 fps, only while you look at it). **E** switches crewmate. **new** |
| Employee Assignments (`employee-assignments`) | EmployeeAssignments | CREW | Personal task each landing (haul, hunt, deep dive, heavy lift, cat rescue, carcass, hoarder). Crew Credits bonus + XP / Clout; dying fails it. **new** |
| Story Logs (`story-logs`) | Wesley's Moons logs / Sigurd's logs | PERSONAL | A moderator laptop in every facility (seed-deterministic); 18 lore DATA LOGS collected per profile (`profile.storyLogs`); terminal `LOGS [n]`. **new** |
| General Improvements (`general-improvements`) | GeneralImprovements (+ DropAllItems) | PERSONAL | Terminal **TAB** autocomplete, LED loot board above the ship door, "+▮ SECURED" pop-ups, hold **G** in the ship to drop all scrap. **new** |
| Weather Tweaks (`weather-tweaks`) | WeatherTweaks | CREW | Combined weathers (Rainy + Foggy, Eclipsed + Stormy...) with bonus scrap value, progressing weather (e.g. Clear > Stormy in the afternoon). `run.wx`; terminal `WEATHER`. **new** |
| Health Metrics (`health-metrics`) | HealthMetrics | PERSONAL | Numeric HP / stamina on the visor. |
| Ship Loot Tracker (`ship-loot-tracker`) | ShipLoot | PERSONAL | Live value of scrap aboard + sell-today projection. |
| Coroner Report (`coroner-report`) | Coroner | PERSONAL | Detailed causes of death + epitaphs in the day report. |
| Hotbar Plus (`hotbar-plus`) | HotbarPlus | CREW | Scrap values on slots, carried total, storm warning; the host can resize the hotbar (default stays 4). |
| Reserved Slots (`reserved-slots`) | ReservedFlashlightSlot / WalkieSlot | CREW | +1 flashlight slot (optional walkie slot). |
| More Players (`more-players`) | MoreCompany / BiggerLobby | CREW | Lobby cap up to 16 (default 8) + extra ship spawn points. |
| Lategame Upgrades (`lategame-upgrades`) | Lategame Upgrades | CREW | Terminal `LGU` shop of tiered crew upgrades. |
| Lethal Things (`lethal-things`) | LethalThings | CREW | 5 scrap items + Signal Flare in the store. |
| Extra Moons Pack (`extra-moons-pack`) | Wesley's / Tolian's Moons, Orion | CREW | 44-Wiki, 403-Forbidden, 500-Mainframe (ids `istavrit` / `kalkan` / `lagos`; always defined on every peer, the per-moon switches only hide them from routing). |
| Faceless Stalker (`herobrine-stalker`) | Herobrine / FacelessStalker | CREW | Rare harmless watcher that vanishes when looked at. |
| Skinwalker Echoes (`skinwalker-echoes`) | Skinwalkers / Mirage | CREW | Creatures replay crewmates' voice clips. |
| Lethal Casino (`lethal-casino`) | LethalCasino | PERSONAL | Roulette table at HQ (Clout bets). |
| Custom Boombox (`custom-boombox`) | Custom Boombox Music | PERSONAL | `/boombox` loads your own track, shared with the crew. |

## 2. OPTIONAL MODS (off by default)

| Mod | Kind | Notes |
|---|---|---|
| Big Heads, Yippee SFX, Disco Facility | joke (local visual / audio) | |
| Infinite Sprint, Night Vision, More Suits | cheat | More Suits unlocks every cosmetic for free (bypasses the Clout economy). |
| Kefal Shark | content joke | registers a creature, so everyone in the lobby needs it (the join check enforces this). |
| Hardcore, Brutal Events, Diversity Horror | difficulty / horror presets | Brutal Events overlaps the base-game daily events; Diversity overlaps the director's heartbeat. |
| Too Many Emotes | not listed in index.json | superseded by the base-game emote wheel (`src/game/emotes.js`). |

## 3. Mod bugs fixed in this round (docs/BUGS.md)

- **lethal-casino roulette payout** used the live bet / bet type / number when the wheel stopped. A wager
  snapshot is now taken when the stake is paid and `settle()` only uses it; the controls are locked while spinning.
- **reserved-slots vs host welcome config**: the host now always writes `config.reservedSlots` (possibly `[]`),
  and a client drops its own value when an (older) host's welcome lacks the key.
- **content mods not enforced**: extra moons are always defined on every peer (built-in), the host rejects
  joiners missing an optional content mod (`gateJoin`), `loadMapFor` guards unknown moons (clean fatal on
  clients), the host resets a saved unknown moon on `hostStart` and aborts `hostFinishLanding`.

## 4. Testing snippets (browser console on `?autohost=local&code=T1&name=Tester`)

```js
const g = kefal.game, mm = kefal.mods;
mm.features().map((d) => d.id + ':' + mm.featureOn(d.id));          // every switch
g.terminal.open(); g.terminal.submit('features'); g.terminal.submit('features push off'); g.terminal.close();
g.run.moon = 'hamsi'; g.player.inShip = true; g.hostLever(g.selfId); g.hostFinishLanding(); kefal.tick(30, 1 / 30);
[...g.items.all()].filter((i) => i.type.startsWith('cat_')).map((i) => i.type);   // needy cats (0-2)
g.run.wx;                                                              // weather-tweaks roll (often null)
```

## 5. Research (2026-09-28)

Source: Thunderstore's Lethal Company package index (`thunderstore.io/c/lethal-company/api/v1/package/`,
~51,000 packages), fetched and filtered with a script on 2026-09-28, sorted by all-time download count.
Pure libraries/APIs/patchers with no direct player-facing effect (BepInExPack, LethalLib, TerminalApi,
LethalConfig, HookGenPatcher, CSync, etc.) are excluded from the table below even when their download
counts are huge, since every dependent mod inflates them. Several entries below are "families" (many
packages doing the same thing, e.g. reserved-slot mods, suit packs, moon packs) — the table lists the
most-downloaded representative of each idea. **These are C#/BepInEx DLLs for the Unity game and cannot
run in our browser/Three.js build; nothing was downloaded or executed.** They're studied purely as
design references so we can re-implement the *features* as native JS mods on `window.KefalAPI`
(see `PLAN.md` §11).

### Top ~40 gameplay mods by downloads

| # | Mod | Author | Downloads | What it does for the player |
|---|---|---|---|---|
| 1 | MoreCompany | notnotnotswipez | 26.9M | Raises the lobby player cap (well past 4) and throws in dozens of free cosmetics. |
| 2 | TooManyEmotes | FlipMods | 17.9M | 300+ emotes on a radial wheel, emote music, even masked enemies can emote. |
| 3 | Skinwalkers | RugbugRedfern | 17.7M | Monsters secretly record your voice chat and play it back to lure/scare you. |
| 4 | More Suits | x753 | 17.3M | Adds extra unlockable cosmetic suits; became the base library other suit mods hook into. |
| 5 | LateCompany | anormaltwig | 16.8M | Lets players join a lobby after the round has already started. |
| 6 | ReservedFlashlightSlot | FlipMods | 16.3M | Dedicated flashlight hotbar slot, one-key toggle, doesn't eat an inventory slot. |
| 7 | Mimics | x753 | 14.3M | A monster that disguises as something ordinary and turns lethal once you're close. |
| 8 | ReservedWalkieSlot | FlipMods | 12.4M | Dedicated walkie slot; hold a key to talk without equipping it. |
| 9 | Lategame Upgrades | malco | 10.7M | Terminal shop of powerful upgrades (fuel, battery, sprint) for veteran crews. |
| 10 | More Emotes | Sligili | 10.2M | Early "more emotes" pack, later largely superseded by TooManyEmotes. |
| 11 | ShipLoot | tinyhoot | 9.6M | Shows a live running total value of all scrap currently on the ship. |
| 12 | LethalExpansion | HolographicWings | 9.2M | Early large-scale content pack (moons/items/SDK); mostly superseded now. |
| 13 | YippeeMod | sunnobunno | 9.1M | Swaps the Hoarding Bug's chitter for the "yippee" meme sound — pure comic relief. |
| 14 | LethalThings | Evaisa | 8.6M | Grab-bag: new scrap, store items, one enemy, decor, and a map hazard. |
| 15 | EmployeeAssignments | amnsoft | 8.0M | Personal side-quests ("bounties") completable for bonus cash. |
| 16 | TooManySuits | Verity | 7.5M | Adds extra suit-rack pages/slots on top of More Suits. |
| 17 | Coroner | EliteMasterEric | 7.2M | Adds a "cause of death" line to the end-of-day performance report. |
| 18 | Helmet Cameras | RickArg | 7.1M | First-person body-cam feed of a chosen crewmate on the ship monitor. |
| 19 | BetterStamina | FlipMods | 6.6M | Configurable stamina regen/consumption and weight-penalty tuning. |
| 20 | Mirage | qwbarch | 6.3M | Alt voice-mimicry system: everyone hears the *same* faked voice from masked enemies. |
| 21 | AlwaysHearActiveWalkies | Suskitech | 6.3M | Hear walkie chatter even when you aren't holding a walkie. |
| 22 | BiggerLobby | bizzlemip | 5.9M | The original lobby-size mod — the mod that started the 4→40 player trend. |
| 23 | NeedyCats | Jordo | 5.8M | Adds rescuable cats roaming the facility for a small reward. |
| 24 | SpectateEnemies | AllToasters | 5.8M | Dead players can spectate from a monster's point of view, not just teammates. |
| 25 | HotbarPlus | FlipMods | 5.7M | Resizable/configurable hotbar, item energy bars, storm-warning icon. |
| 26 | CoilHeadStare | TwinDimensionalProductions | 5.6M | Coil Head slowly turns to face you even while you're staring at it. |
| 27 | LC Office | Piggy | 5.4M | Adds a new office-themed dungeon interior. |
| 28 | Orion | sfDesat | 5.2M | Adds a brand-new explorable moon. |
| 29 | BuyableShotgunShells | MegaPiggy | 5.1M | Adds shotgun shells to the terminal store. |
| 30 | FlashlightToggle | Renegades | 4.9M | Toggle your flashlight with a rebindable key without equipping it. |
| 31 | MaskedEnemyOverhaul | HomelessGinger | 4.8M | Masked enemy wears a real crewmate's suit/name and can spawn on any moon. |
| 32 | AdditionalSuits | AlexCodesGames | 4.7M | 8 more suits available from the very start — handy for bigger crews. |
| 33 | Boombox Controller | KoderTeh | 4.5M | Load a custom track into the boombox by pasting a link. |
| 34 | LethalCasino | mrgrm7 | 3.9M | Casino at HQ: slot machines and roulette to gamble scrap money. |
| 35 | Wesley's Moons | Magic_Wesley | 3.1M | A large pack of new moons plus a light story/progression mode. |
| 36 | HealthMetrics | matsuura | 3.1M | Adds a simple numeric health counter to the HUD. |
| 37 | Diversity | IntegrityChaos | 3.0M | Overhauls/varies enemy behavior and audio to make the game creepier. |
| 38 | Custom Boombox Music | Steven | 2.8M | Load your own local audio files into the boombox. |
| 39 | Herobrine | Kittenji | 2.6M | Adds a Minecraft-style "Herobrine" stalker entity that haunts the facility. |
| 40 | ShipWindows | TestAccount666 | 2.2M | Adds glass windows to the ship hull so the crew can see outside. |

Honorable mentions that just missed the cut but are worth knowing about: **ControlCompany** (3.4M, play
*as* the monsters against your friends), **PushCompany** (3.1M, shove teammates), **SellBodiesFixed**
(3.0M, sell dead creatures' corpses), **Brutal Company Plus/Minus/Reborn** family (~3.2M combined,
escalating random-event hardcore mode — the direct ancestor of the "brutal-events" port below), and the
**Tolian/Rosie/Starlancer** moon-pack authors (each 1–3M, same "extra moons" idea as Wesley's Moons).
