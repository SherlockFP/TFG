# Creature emotes (module `cemotes`)

Creatures emote now and then, gloat after killing you, and react to YOUR emotes (Lethal Company style). Generic for every creature, present and future.

Files: `src/game/cemotes.js` (runtime, `game.cemotes`), `src/game/cemotes_data.js` (pure data + math, unit-testable), `tools/harness/cemotes.test.mjs`
(node: personalities, body fx, cooldowns + a fake-game simulation of the whole module), `tools/harness/wave2_cemotes.js` (headless script).
Shared-file edits: `game.js` slot + import lines only. `HOST_ONLY.add('ce')` is done from the module (like anomaly). No `creatures.js` / `CreatureView` edits.

## How it works
- **Body language** (client, every peer): procedural offsets on the `CreatureView` root, applied in the mods `update` event right after `CreatureManager.update`
  (position / yaw are reset by the view every frame, scale + rotation.x/z are saved at emote start and restored at the end). Emotes: `spin hop bow tilt dance laugh flex slump point griddy`.
- **Bubble** (client): pooled sprites (10) with cached canvas textures: LMAO, GG, L, RATIO, o7, =), ?, !!!, pixel skull, 2-frame pixel dancer. Depth-tested (walls hide it), grows with distance, hidden beyond 48 m.
- **Net**: one host -> all type `ce`: `{k:'e', id, e, b, d}` body + bubble; `{k:'win', ..., v: victim, vn, li}` victory (chat line + victim camera); `{k:'note', n, ty}` toast to the emoter. Clients validate ids.
- **Idle emotes** (host, 1 Hz scan): every 45-120 s per creature (x personality rate), only in `idle`/`walk` (never while hunting), only if a player is within 40 m, never for hazards / scare creatures.
- **Victory** (host): wraps `hostHurtPlayer` (remembers the last creature that hurt each player) and `hostOnPlayerDied`. 350 ms after the death the killer freezes for the emote (bosses do not freeze),
  every client plays it, chat shows e.g. "The Lurker hit the griddy on Hasan's corpse." (2 variants per emote, EN + TR via `addTranslations`), and the victim's spectator camera orbits the killer for ~2 s.
  Fallback when no recent hit was recorded: nearest living creature of the death cause type within 12 m.
- **Reactions** (host, polled every 0.15 s from `game.emote` / `remote.emoteNet`): when a player emote STARTS, each creature within 8.5 m (11 m for taunts) with a clear line of sight (own raycast, not the
  stealth-scaled `canSee`) may react after 0.3-0.9 s. Max 6 creatures per emote. "Frozen" = `c.stunT` (the host AI loop skips it), so nothing else needs to know.

## Personality table (`cemotes_data.js`: `ARCH` + `CREATURE_ARCH`; unknown creatures fall back through `guessArch(def)`, or set `def.cemote = 'archetype'`)
Player emote kinds: dance (dance party spin moonwalk ascend cheer hop) - greet (wave bow salute) - taunt (point laugh rage headbang flex rally) - show (flip) - fear (scared) - dead (playdead) - chill (sit) - meh (shrug facepalm).

| archetype | creatures | dance / show | greet | taunt | other |
|---|---|---|---|---|---|
| predator | crawler, spider, hound, lurker, giant, screamer, clickbait, moderator, skeleton, hs_* | `?` head-tilt | `?` | **ENRAGE** (see below) | fear: laughs; play dead: `?` |
| mimic | mimic, doppel | **copies it** (creepy, never frozen) | copies | copies | copies everything |
| partygoer | tamagotchi, sludge (8 s), editor, robot | **JOIN** 6 s | bows back | sulks `L` | fear: laughs |
| swarm | scuttler, ticketswarm, replyguy, zombot | **JOIN** 4.5 s (conga) | bows back | laughs | fear: laughs |
| shy | yoinker, collector | waves, **flees** ~3 s | flees | flees | |
| polite | support, janitor | bows back | bows back | `?` | |
| boss | foreman, legacybot | laughs (bubble), ignores, never frozen | laughs | laughs | |
| stoic | mannequin, jester, sandkefal, stalker, leech, hazards | nothing (mute: no idle / victory emotes either) | | | |

- **JOIN (tactical: dance-off = safe passage)**: the creature dances along, is not hostile for `joinT` s (target dropped, AI skipped) and the emoter gets a green toast. Immune for 25 s afterwards (that player waits 40 s for the same creature), so it cannot be chained.
- **ENRAGE (dangerous: taunt draws it)**: `rage: 'chase'` (crawler, spider, scuttler, skeleton) targets the taunter at once (also steals the target of one chasing a teammate: saves them, costs you);
  `'anger'` (Lurker) +5 anger; `'noise'` (everything else) a loud noise at the taunter that pulls every listener. Per creature 10 s, per player 8 s.
- **Cooldowns** (`CD`): same creature 14 s between reactions, same player+creature 25 s, at most 4 triggering emotes per player per 20 s, victory emote 6 s per creature.

## Verify
`node tools/harness/cemotes.test.mjs` (all 39 known ids explicit; ~42k checks) - `flock /tmp/tfg-browser.lock node tools/harness/headless.mjs --port <p> --script tools/harness/wave2_cemotes.js` (lands, spawns creatures, forces victory / dance / taunt / mimic; ran once: install, idle emote, victory freeze + body layer, dance-along OK; the taunt / mimic checks failed on the OLD stealth-scaled sight test, fixed afterwards and covered by the node simulation only).
Not hand-played: bubble readability in the dark, the victim camera feel, and how often idle emotes fire in a real run.
