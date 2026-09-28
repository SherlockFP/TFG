# Wave 2 - ANOMALY (STATIC exposure, mutations, dice, power-ups) - module `anomaly`

MASTERPLAN #23. `game.anomaly` (installed with `this.useModule('anomaly', installAnomaly)`). Owner-facing summary in Turkish at the end.

## Files
| File | Role |
|---|---|
| `src/game/anomaly.js` | install: buff registry (max 3 mutations + 3 power-ups, no stacking), stats hook, net (`an` request, `anfx` host->all, `anst` stage sync), screen static (engine noise/warp with ownership + tinted CSS overlay), remote auras |
| `src/game/static.js` | exposure 0-100 per player, hot zones (seeded rooms), hot items, breach leak, Signal Counter, Decon Shower (ship), Antivirus / Faraday / recipes, collapse + hallucinations |
| `src/game/mutations.js` | 5 good + 5 bad mutations (data + effects), Mute hook |
| `src/game/powerups.js` | 6 power-ups, holographic pickups (host-placed), elite / boss drops, Viral / Ad-Free / Overclock / Cloud Save / Double XP hooks |
| `src/game/dice.js` | Loot Box Shrine (offer -> d20 -> outcome table) + physical Cursed Die (host reads the resting face) |
| `src/models/anomaly.js` | shrine + numbered d20, d6 die, hologram, Decon booth, haze, aura, item models |
| `src/ui/buffbar.js` | left HUD dock: STATIC meter (only while > 0 / counter held) + buff/debuff bar with icons and timers |
| `tools/harness/anomaly_core.test.mjs` | node test of the pure logic (PASS); `tools/harness/wave2_anomaly.js` browser feature script (see Testing) |
Shared-file edits: `src/game/game.js` (the two slot lines only), `src/game/magic.js` (1 line: voice casts fizzle while Mute is active).

## STATIC (the numbers)
Sources (per second, before resistance): hot room (seeded: the containment `core` room first, then generator / server / boiler / lab / reactor) core 2.2, generator 1.7,
server 1.5, other 1.3, falling to 0 over 3 m outside the room (the Signal Counter senses 8 m); containment breach x1.5 in zones and +0.3/s in the whole facility
(failure +0.6/s); carried hot items GPU 0.4, Reactor Core 0.35, Crypto Rig 0.25, containment core 0.45, Legacy Core 0.5 (on the floor within 4 m: half);
glitch-biome moons +0.16/s outdoors; Overclock power-up +0.8/s. **Early game: x0.5 at quota 0, x0.7 at quota 1**. 1 hot room at quota 0-1, 2 later.
Cleaning: ship -3.0/s, Decon Shower (3.5 s in the booth) -> 0 and purges bad mutations, Antivirus Shot -60 + purge + 15 s immunity, Almond Water -20, out of a source: facility -0.25/s, outdoors -0.5/s.
Resistance: Faraday Suit (SUIT slot) x0.32 (-3% per tier step). Time in a hot room to reach Buzzing / Glitching / Corrupted / DELETED at quota 0: core 23/45/68/91 s, generator 29/59/88/118 s.

| Stage | At | Effect |
|---|---|---|
| Clean | 0-24 | nothing |
| Buzzing | 25 | light screen static, +10% speed |
| Glitching | 50 | max HP -15, host rolls the mutation dice every 60 s (first after 20 s, 50/50 good/bad, 40/60 at Corrupted) |
| Corrupted | 75 | 2 dmg / 3 s DoT (never below 12 HP), audio hallucinations, +25% damage dealt |
| DELETED | 100 | 6 s collapse countdown (HUD + alarm) then death "deleted by static"; warning at 90; Antivirus / Decon / Cloud Save cancels it |

Readability: HUD meter only when > 0, colour by stage, ticks at 25/50/75, rate arrow, resist/immune chips; Signal Counter (held) clicks 0.7 + 17 x level per s and shows the source level;
hot rooms have a faint green-cyan haze + crackle; crewmates at Glitching+ get an aura (Beacon = gold pulse).

## Mutations (temporary, 50-140 s, cleared at takeoff / death)
Good: Overclocked Legs (+25% speed, +20% jump; stamina regen x0.5) - Night Vision (gamma boost; scan range -30%) - Thick Skin (+20% armor; -10% speed) - Magnet Hands (loose scrap within 3.5 m auto-picks, also hot / cursed items) - Echolocation (every 5 s ping shows creatures within 26 m through walls; the ping makes noise).
Bad: Lag (0.45 s freeze every 5-10 s, -10% speed) - Mute (voice spells fizzle) - Glass Bones (+50% damage taken) - Beacon (steady noise + glow) - Jitter (aim twitch + shake).

## Power-ups (pickups: 45% none / 40% one / 15% two per landing, elites 30%, bosses 100%, dice)
| Power-up | Duration | Effect | Cost |
|---|---|---|---|
| Double XP Weekend | 180 s | XP x2 (x1.5 on a Double XP daily event) | -8% speed |
| Premium Trial | 60 s | +30% speed, +25% stamina regen | then Free Tier: 20 s of -20% speed |
| Ad-Free | 20 s | creatures cannot see you (host `canSee`), they still hear | your attacks -30% |
| Overclock | 30 s | +35% attack speed, +15% speed | +0.8 STATIC/s |
| Cloud Save | until used / takeoff | blocks the next lethal hit or DELETION, restores 50% HP | 10 s of Lag |
| Viral | 45 s | hits splash 50% to up to 4 creatures within 5 m | each chain is noisy |
Pickup odds: Double XP 26%, Premium 17%, Ad-Free 17%, Overclock 17%, Viral 13%, Cloud Save 10%.

## Dice
**Loot Box Shrine**: ~35% of landings, 1 per map, deterministic (`run.seed`), 3 rolls per shrine, credit price (40 + 20 x quota) x (1 + 0.5 x rolls), creatures hear the machine. Offer: CREDITS (+0),
SCRAP in hand (bonus +1 per 40 value, max +3, the item is consumed), BLOOD (-30 HP, +2), STATIC (+30 exposure, +3). Final = natural d20 + bonus clamped 2..19; natural 1 = curse, natural 20 = mythic always.
Credits odds: 5% curse (Deepfake spawns + Beacon 60 s + 15 static) / 30% debuff (1 bad mutation) / 35% buff (a good mutation or Overclock / Premium / Ad-Free) / 25% jackpot (two good mutations, or Cloud Save + Double XP, or an epic item + Viral + credits) / 5% mythic (mythic item, heal, clean and Double XP for the whole crew).
The d20 is animated on every peer (suspense ticks, face turns to each viewer); the host applies the result 4 s later. The Algorithm comments.
**Cursed Die** (scrap, cursed, 3 uses, 12 s cooldown): a physical d6 (LMB throws). When it rests (>= 0.7 s, flat) the HOST reads the top face from its rotation: 1 blackout 25 s, 2 spam swarm (3-5 bots),
3 loot shower (3 scrap), 4 heal +40 / -25 static, 5 Overclocked Legs 45 s, 6 static burst +30 and Jitter. Area effects hit everyone within 9 m. Rolls in the ship do nothing.

## Testing
`node tools/harness/anomaly_core.test.mjs` -> PASS (die faces, bands, outcome tables, stage thresholds, zone falloff, planning, odds).
`tools/harness/wave2_anomaly.js` (headless body) exercises exposure in a hot zone / decay in the ship, a mutation, forced shrine rolls, Cursed Die faces and a power-up pickup;
it was written but NOT executed in this session (budget freeze), only `smoke_land.js` was run. Debug: `kefal.game.anomaly.debug()`, `.setExposure(n)`, `.grant('m_legs', 60)`, `.force.roll(20)`, `.force.face(3)`.

## Known issues
Not hand-played: numbers are from the node model, Decon booth placement in the ship (x -0.1, z 2.92, +z wall) is unchecked visually, Magnet Hands / Echolocation / Lag feel is blind, hallucinations are audio only.
2-player paths (`anst` relay, host-owned die) untested. Night Vision uses the post-process gamma/vignette uniforms (nothing else writes them). Cloud Save only intercepts hits that go through `localHurt` (falls / void bypass it).

## Owner note (Turkish)
Yeni "Anomali" sistemi: sıcak odalarda (çekirdek, jeneratör, sunucu) **STATİK** birikir; 25 vızıltı (+%10 hız), 50 glitch (mutasyon zarı, -15 can), 75 bozulma (+%25 hasar ama can yanar), 100 silinme (6 sn içinde
gemiye dön / Antivirüs kullan). Gemide, Dekon Duşu ve Antivirüs ile temizlenir; Faraday Kıyafeti korur; Sinyal Sayacı tıklayarak uyarır. 10 mutasyon (5 iyi, 5 kötü), 6 geçici güç artışı (Çifte XP, Premium, Reklamsız,
Hız Aşırtma, Bulut Kaydı, Viral), her birinin bir bedeli var. Nadir Loot Kutusu Sunağı'nda kredi/hurda/can/statik adayıp d20 atılır; atılabilen Lanetli Zar düştüğü yüze göre çevresindekilere etki eder.
