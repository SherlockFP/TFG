# TFG

Co-op industrial horror and extraction for the browser. A company crew explores abandoned server moons
inside the Algorithm's hostile broadcast, carries salvage home and invests in vessels, tools and workshops.
PSX visuals, proximity voice chat, minigames and serverless P2P multiplayer.

> "Engagement is love." — The Algorithm

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173 . Build a static version with `npm run build` (output in `dist/`, can be hosted
anywhere — itch.io HTML5, GitHub Pages, any static host).

### Deploy on Render (free static site)

`render.yaml` is a ready Render Blueprint. Push this repo to GitHub, then on render.com choose
**New → Blueprint** and pick the repo (or **New → Static Site** with build command `npm ci && npm run build`,
publish directory `dist`, env `NODE_VERSION=22.12.0`). Every push redeploys. Share the `https://….onrender.com`
URL: one friend hosts (network *Online P2P (Nostr)*), the others join from the lobby browser or with the code.
HTTPS comes for free, so voice chat (microphone) works.

## Multiplayer

* **HOST GAME** creates a lobby with a 6-letter code. Public lobbies appear in every player's **lobby
  browser**; private ones can be joined with the code (+ optional password).
* Networking is peer-to-peer WebRTC (via [Trystero](https://github.com/dmotz/trystero)). No game server is
  needed — the host's browser runs the world. Signaling goes over public Nostr relays by default; MQTT
  brokers and BitTorrent trackers are selectable if one network is blocked.
* **Local** network mode connects tabs on the same PC (great for testing).
* **Proximity voice chat**: allow the microphone. Crewmates hear you in 3D, walls muffle you, your avatar's
  mouth moves while you talk, walkie-talkies work across the map, the dead can't be heard by the living…
  and some creatures can hear *you*. Push-to-talk is available in Settings → Voice.

## How to play

WASD move · Shift sprint · C crouch · Space jump · E interact · LMB use / attack / grab big loot ·
RMB scan · G drop · Q throw · F flashlight · 1-5 slots · R reload · V push-to-talk · Z/X emotes ·
Enter chat · Tab character sheet · Esc menu

Start at **Relay Dock**. The host chooses a vessel at the fleet office, then boards it at the departure
kiosk with the crew. The Packet Courier is the free starter. Buy equipment from a **Field Broker**:
press E, choose **TOOLS**, then collect your order from the blue pickup tray with E.

Use the ship **terminal** for `MOONS`, `ROUTE`, `SCAN`, `BESTIARY` and route information. Pull the **lever**,
explore the facility and outdoors, carry salvage back before midnight, and sell it at the **Archive Intake**
on 0-Algorithm HQ to meet the quota. Production advances after completed field shifts; return to a broker's
physical workshop to calibrate and collect batches. Casino chips, robot surveys, cargo trolleys and optional
late-game archive/pursuit encounters offer other crew choices. Levels, faction work and appearance unlocks
carry progression between runs.

## Project layout

See `docs/PLAN.md` (design + architecture), `docs/RESEARCH.md` (Lethal Company / R.E.P.O. research),
`docs/LC_MODS.md` (which popular LC mods were re-implemented as KEFAL mods).

| Folder | What |
|---|---|
| `src/core` | engine (PSX renderer & post), input, RNG, save, i18n |
| `src/world` | facility generator, terrain, ship, Company HQ, environment/weather, navigation |
| `src/entities` | local/remote players, items, creatures (+ AI) |
| `src/game` | game orchestration, host logic, actions, terminal, progression, data tables |
| `src/net` | transports (Trystero / local), lobby discovery, session, voice chat |
| `src/models` | procedural PSX models (avatar, creatures, items, props) |
| `src/audio` | audio manager + procedural sound library |
| `src/minigames` | vault keypad, fuse box, lockpick, fishing, slots, arcade |
| `src/mods`, `public/mods` | mod API (`window.KefalAPI`) and bundled mods |
| `public/assets/ext` | downloaded free assets (see `CREDITS.md`) |

## Modding

Mods are plain JS files calling `KefalAPI.defineMod({...})`. Drop them in `public/mods/` (and list them in
`public/mods/index.json`) or import a `.js` from the in-game **MODS** menu. See `src/mods/modapi.js` and the
bundled mods for examples (new items, creatures with custom AI and models, moons, terminal commands, HUD
widgets, daily events…).
