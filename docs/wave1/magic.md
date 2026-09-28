# Wave 1 — MAGIC (spells you cast by speaking)

Owner request: *"oyuna büyü ekleyelim, konuştukça yaratıkları ittirme gücü gibi, belirli şeyleri söyleyince sesde olsun,
skillbook gibi"*. Spells are cast by **saying the word** (hold V), **typing it in chat**, or with the **hold-C wheel**.
Spells are learned from **skillbooks**. Only PUSH is known from the start.

## Files
| File | Role |
|---|---|
| `src/game/magic.js` | module: spell table, skillbook items, casting, mana/cooldowns, host effects, per-peer effects, VFX, procedural sounds |
| `src/game/magic_voice.js` | word matching (Turkish-aware, diacritic-insensitive, letter-run folding, 1-typo fuzzy for long words) + Web Speech API push-to-talk listener |
| `src/ui/panels/spellbook.js` | mana bar + spell slots (bottom HUD dock), hold-C spell wheel, NEW SPELL LEARNED banner, pixel spell glyphs |
| `src/models/skillbook.js` | procedural grimoire model (tier-coloured cover, glowing rune) — also becomes the inventory icon |
| `tools/harness/wave1_magic.js` | headless check (chat TR/EN, voice matcher, PUSH knockback, BLINK safety, skillbook learning, gates, fire/hush/lumen) |

Shared-file edits: `src/game/game.js` (the two placeholder lines only), `src/ui/ui.js` (+1 line: "Voice spells" checkbox in
Settings > Voice, `settings.voiceSpells`, default on).

## Spells
| id | Say (EN / TR) | Mana | CD | Book tier | Effect |
|---|---|---|---|---|---|
| push | PUSH / İT | 15 | 4 s | known | 44° cone, 7.5 m: creatures knocked back ~3 m + staggered 1.1 s + 4 dmg (host, nav + physics-ray checked; hitting a wall = SLAM 10 dmg + longer stun), loose items flung, crewmates shoved |
| lumen | LUMEN / IŞIK | 20 | 15 s | uncommon | floating orb follows the caster 45 s (LightPool emitter group `magic`, works in blackouts) |
| heal | HEAL / ŞİFA | 35 | 25 s | uncommon | +30 HP to the caster and every crewmate within 8 m |
| pull | PULL / ÇEK | 12 | 3 s | rare | the loose item under the crosshair (≤18 m, LOS) flies into your arms on a ballistic arc (no impact damage on landing) |
| hush | HUSH / SUS | 25 | 22 s | rare | 8 s: host zeroes the caster's footstep/voice noise and swallows noises within 4 m of them |
| blink | BLINK / SIÇRA | 20 | 6 s | epic | teleport ≤7 m forward: 3 wall rays, floor ray, headroom ray, nav-walkable (indoor) / play area (outdoor); no ledge hops or pits |
| shield | SHIELD / KALKAN | 30 | 30 s | epic | absorbs 45 damage for 10 s through the `localHurt` hook (not 999 instant kills); bubble visible to others |
| fire | FIRE / ATEŞ | 40 | 10 s | legendary | 24 m/s fireball, host collision, 3.5 m splash (38 dmg falloff) + 3 s burn (6 dps); shoves items/players, no crew damage |

Mana: 100, regen 2.5/s (≈20 pushes from full, then you wait). Spells are tools, not a win button: bosses, giants, The
Worm, hazards and webs are immune to PUSH; latched/ceiling leechers too.

## Casting
- **Voice** (`VoiceListener`): Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`) runs only while **V** is held,
  language `tr-TR` / `en-US` from `getLang()`. Interim results cast immediately (each spell at most once per utterance).
  English mode listens for English words only ("it" is too common in English); Turkish mode accepts both.
  The HUD line above the mana bar shows what was heard with the spell word highlighted.
  Requires the player's mic consent (`settings.micConsent === 'yes'`, same rule as voice chat — never grabs the mic
  silently) and `settings.voiceSpells !== false`. Unsupported browsers (Firefox) get one toast and the wheel shows why.
  **Shouting is noise**: a voice cast makes `1.1 + 2.2 × mic level` noise (cap 3.2) → attracts creatures.
- **Chat**: a message that is exactly one spell word (`İT`, `push!`, `ateş`) casts it; every peer rewrites the line to
  `✦ Name: İT!`. Chat casts are a whisper (noise 0.25). Longer messages never cast.
- **Key**: hold **C** → radial of all 8 spells (locked ones show `???` + the book tier); pick with the mouse direction or
  **1-8**; release C (or LMB) casts; Esc cancels. A quick tap re-casts the last selected spell.
- Chat commands: `/spells` (list + voice status), `/voicespells on|off`.

## Network
`cast()` spends mana, sets the cooldown, applies the local effect immediately, then `net.request('spell', fx)`.
Host handler `spell` (registered via the `registerHandlers` mod event): loose anti-spam (per-peer token bucket,
45% of the cooldown, so the max -50% cooldown bonus still passes), position sanity check, host effects (push creatures, hush, fireball projectile), then
`net.broadcast('fx', { k: 'spell', s, c: caster, ... })`. Every other peer applies its part in the mods `fx` event:
items it simulates (PUSH / PULL / blast), its own player (shove, heal), visuals (cone, orb, bubble, fireball, burn).
Host-only follow-ups: `fireboom`, `burn`, `slam`. `profile.spells` (array of ids) is saved through `game.progress.save()`.

## Soft interfaces
- Provides `game.magic = { mana, maxMana, addMana(n), knows(id), learn(id), cast(id, { source }), SPELLS, ORDER,
  SKILLBOOK_IDS, costOf, cooldownOf, cooldownLeft, resetCooldowns, hear(text), openWheel/closeWheel, worldBooks }`.
- Reads `game.rpg?.bonus?.(k)`: `maxMana` (flat), `manaRegen` (flat /s), `spellPower` (fraction, +0.2 = +20% push/heal/
  shield/fire), `cooldown` (fraction reduction, capped at 0.5).
- Voice casts call `game.balance?.noise?.(pos, amount)` if present, else the host `noise` request.
- Skillbooks: `registerItem('skillbook_<id>', { kind: 'skillbook', tier, spell, value })` for lumen, heal, pull, hush,
  blink, shield, fire (sellable; value by tier). LMB (`useItem`) learns + consumes (`consume` request for a held book,
  `game.inventory?.consume?.(type)` otherwise).
- Emits `game.mods.emit('tfg:spell', { id, caster, source })` on the caster's machine for every successful cast.
- Standalone book source until chests/shops land: 30% per landing, one book on a deep scrap spot (seeded from the run
  seed). Turn off with `game.magic.worldBooks = false`.

## Test
```
flock /tmp/tfg-browser.lock node tools/harness/headless.mjs --port 5184 --script tools/harness/wave1_magic.js --shot /tmp/magic.png
```
Result (2026-09-28): errs [], BLINK 8/8 directions stayed walkable with a clear line, skillbook learned + consumed,
fireball 41 dmg on a Web Spider, hush marked on the host, lumen = 1 pool emitter and no new scene light,
chat `İT` / `push` cast, `push it real good` did not, cooldown / mana / unknown-spell gates work.
PUSH via chat `İT`: Web Crawler 2.27 m -> 4.51 m, still on walkable floor, 15 mana, 4 s cooldown.
`smoke_land.js`: errs [] (factory, mineshaft, mansion).

## Known issues / next
- Voice recognition could not be tested headless (no mic); Chrome's service needs network. Real-mic test needed,
  including how Turkish recognisers spell "İT" (short words are exact-match only).
- In the ship the local-only `localHurt` shield can absorb hits that the ship would ignore anyway (harmless).
- Remote players see PUSH/fireball shoves on themselves only if they are inside the caster's cone on their own machine
  (client-trusted, like all player movement).
- The wheel needs pointer lock for the mouse direction (1-8 works everywhere).
- A cast the host rejects (anti-spam) still plays its local visuals for the caster; only debug `resetCooldowns()` can trigger that.
