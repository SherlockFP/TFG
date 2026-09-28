# Wave 2 - DETAILED COMBAT (module `combat`)

Owner ask (MASTERPLAN #19): sword / rocket style weapon systems. Installed with `this.useModule('combat', installCombat)` in `game.js`.
**Status: written in a budget-capped session. `node --check`, `npm run build` and `smoke_land.js` were run; the feature script
`tools/harness/wave2_combat.js` was written but NOT run - nothing here has been hand-played or browser-verified yet.**

## Files
| File | What |
|---|---|
| `src/game/combat_kit.js` | shared plumbing: fx channel `{k:'cb'}`, procedural sound helper, VFX (ring / bolt / beam), host helpers (`explode`, `fling`, `slow`, `bleed`), movement-modifier wrap of `player.update`, RMB hooks |
| `src/game/combat.js` | melee system for ALL melee weapons: combos, heavy, block / parry, backstab, stamina, hit-stop, view-model arcs, host `cbhit` / `cbparry` |
| `src/game/combat_weapons.js` | 6 new melee + 5 ranged / tech weapons + 4 ammo defs, rockets (+ rocket jump), grenades, hitscan, Grav-Tool |
| `src/game/spells_ext.js` | ZAP, FROST, METEOR, DECOY, TOTEM (+ skillbooks, glyphs); Blood Magic lives in `magic.js` |
| `src/game/role_skills.js` | 12 role abilities on Y / U + cooldown HUD |
| `src/models/combat_wave2.js` | procedural models (weapons, ammo, rocket, grenade, mini-turret, totem) |
| `tools/harness/wave2_combat.js` | headless feature check (**not run yet**) |

## Shared-file edits (all small)
* `game.js`: the two `combat` placeholder lines only.
* `actions.js`: `tierDmg` is now `export`ed (the melee path reuses it, so tier damage is still applied once, relative to `def.tier`).
* `magic.js`: `registerSpellData()` export + `let LEX`; hook registry `game.magic.ext` (`prep` / `fx` / `host` / `cost` per spell id) called from `cast`,
  `applyFx` (default branch) and `onHostSpell`; `game.magic.kit` (VFX helpers), `bloodMagic` / `hpCost`; **Blood Magic keystone** (`rpg.has('bloodmagic')`:
  spells cost `ceil(mana / 2)` HP, refused when HP <= cost + 2, mana bar hidden).
* `spellbook.js`: `registerGlyph()`, hides the mana bar under Blood Magic, wheel shows HP cost. `magic_voice.js`: 4 words added to `NEAR_MISS`.

## Melee controls
| Input | Effect |
|---|---|
| LMB tap | light attack; taps chain a 3-hit combo (R slash, L slash, overhead / lunge finisher x1.3-1.5). Combo window 0.55 s, a tap during a swing is buffered |
| LMB hold (>0.22 s) | charge (bar above the hotbar, "ding" at full), release = heavy attack: dmg x1.9-2.2 (x0.6..1.0 by charge), stagger 0.7-1.2 s, cleave |
| RMB hold | **block** (decision: RMB is scan, so scan is now an RMB *tap* < 0.22 s while a melee weapon is held; other items keep instant scan). Blocks frontal creature melee hits: -30..80 % by weapon class, costs stamina (40 % of the hit); stamina out = guard break (0.6 s stun). Unblockable: hazards, instant-kill (999) moves |
| RMB just before the hit | **parry** = first 0.28 s of the guard (0.18-0.32 by class, shortened when mashing): hit negated, attacker stunned 2.2 s (boss 1 s), slow-mo flash, +12 stamina, next hit within 2.5 s x1.6 (riposte) |
| behind a creature | backstab x1.5 (Twin Daggers x2, dagger class 1.75); host recomputes from creature yaw |

Movement while charging x0.75, blocking x0.62, swinging x0.88. Stamina per swing `(2 + weight/2) x class`, heavy x2.4 (tired swings do x0.7).
Hit-stop `0.035 + weight x 0.004` s (heavy x1.6, crit x1.3) and camera kick scale with weapon weight. Classes: club (pipe, bat, nail bat, crowbar, stop sign), sword
(machete, katana, longsword), dagger (knife, twin daggers), axe (shovel, war axe), great (greatsword), hammer (sledge, war hammer), spear.
Light chain averages ~0.95 x `def.cd` and ~1.1 x damage, so old dps stays within ~15 %.

## New weapons (Company Store; `price` in credits, tier via `def.tier`)
| id | tier | price | dmg / cd / reach | notes |
|---|---|---|---|---|
| longsword | rare | 420 | 28 / 0.5 / 2.5 | block 70 %, best parry |
| greatsword | epic | 820 | 46 / 0.9 / 2.9 (2H) | cleaves up to 4 (heavy 5), wide arcs |
| twindaggers | rare | 380 | 11 / 0.26 / 1.7 | backstab x2, second blade + off-hand shown |
| spear | rare | 360 | 25 / 0.62 / 3.3 | thrusts pierce 2-3 in a line |
| waraxe | epic | 700 | 38 / 0.8 / 2.3 | bleed 5 dps x 4 s (heavy x1.6) |
| warhammer | epic | 760 | 52 / 1.15 / 2.5 (2H) | heavy slam stun up to 2.5 s |
| rocketlauncher | epic | 1200 | 80 splash R 4.2 / 1.4 | rocket 24 m/s, knockback 14, mag 1, `rockets` (crate of 3, 75) |
| grenadelauncher | epic | 900 | 55 splash R 3.6 / 0.75 | bouncing grenades, fuse 1.7 s, mag 4, `grenades40` (6, 60) |
| smg | rare | 480 | 5 / 0.09 (auto), spread 0.06 | mag 30, `smgammo` (60, 40) |
| rifle | rare | 560 | 34 / 0.6, spread 0.002 (2H) | mag 8, `rifleammo` (16, 36) |
| gravtool | epic | 950 (Tools) | - | LMB hold: grab a loose item / small creature (hp <= 200, no boss / hazard) at <= 16 m, hold it 3.4 m ahead; RMB punt: items fly 9-30 m/s and hurt what they hit (4 + weight x speed x 0.12, max 45), creatures fly 24 m/s and slam walls for 26 |

Rocket jump: the shooter's own blast pushes `15 x falloff` m/s (vertical cap 12.5) and costs `28 x falloff` HP (never lethal; enemies take 80 at the same spot); no crew damage.
Reload = R (wraps `game.reload`), ammo read from hotbar + bag boxes; ammo readout above the hotbar. Ranged instance tier uses `weapons.js relMul(it)`.

## Spells (extend `game.magic`; voice V / chat word / hold-C wheel; Blood Magic aware)
| id | say (EN / TR) | mana | cd | book tier | effect |
|---|---|---|---|---|---|
| zap | ZAP / ŞİMŞEK | 30 | 9 | rare | bolt to the aimed enemy, 4 chain jumps (6.5 m), 26 dmg, -20 % per jump, 0.4 s stun |
| frost | FROST / BUZ | 35 | 16 | epic | 7 m nova: slow 65 % for 5 s (boss 35 %), 8 dmg, 0.5 s freeze |
| meteor | METEOR | 60 | 40 | legendary | telegraph ring + falling meteor at the aim point, lands after 1.7 s: R 6.5, 90 dmg, knockback, noise 4 |
| decoy | DECOY / KOPYA | 30 | 30 | rare | a fake you for 10 s; the host adds it to `aiPlayers()` (noise 1.4 / voice 0.6), 80 hp; `hostHurtPlayer` on it damages the decoy |
| totem | TOTEM | 25 (recast free) | 5 | rare | place a return point, cast again to teleport back |

Skillbooks `skillbook_<id>` are world books (magic.js pool) and Clout items in the Store Magic tab (rare 400 / epic 900 / legendary 2000).
Spell power scales damage; `bonus('cooldown')` scales cooldowns.

## Role skills (Y / U; HUD icons with cooldown sweep; base cooldown, scaled by `bonus('cooldown')`)
* scout: Dash 9 s (0.22 s burst), Sonar Pulse 25 s (markers through walls, 6 s, 35 m)
* hauler: Ground Slam 14 s (R 5, 24 dmg, 1.2 s stun), Adrenaline Lift 40 s (no weight slow, +12 % speed, 8 s)
* technician: Mini-Turret 45 s (25 s life, 4 dmg / 0.5 s, 14 m, max 2, makes noise), Overclock 30 s (lockpick / fuse / safe minigames succeed instantly, 8 s)
* medic: Heal Beam 8 s (~35 HP x (1 + reviveSpeed), self 60 %), Revive Pulse 120 s (heals 10 m, revives ONE dead crewmate whose body is within 12 m at 30 % HP and removes their death fine)
* occultist: Mana Surge 45 s (+60 mana, or +40 HP with Blood Magic), Soul Link 40 s (up to 3 crew within 14 m; damage is split evenly, 10 s)
* enforcer: Charge 12 s (0.4 s rush, 20 dmg + stagger to everything crossed), War Cry 30 s (8 m stagger 1.5 s, noise 3.5)

## Net (new request types are `cb*`; broadcasts are `{ k: 'cb', t: <sub> }` on the stock `fx` channel)
Requests: `cbhit {w,k,s,c,mul,ex,hits:[{i,c}]}` (host recomputes `def.dmg x tierDmg x class mult x charge x mul x crit x backstab x riposte`, affix, then the stock `hit` handler for
knockback; per-player rate limit, distance and holder checks), `cbparry {cid,w}`, `cbshot {id,cid,crit,mul}`, `cbboom {w,p,cid,rid,mul}`,
`cbgrav {op: cgrab|aim|drop|punt|ihit}`, `cbskill {op: slam|charge|cry|turret|heal|revive|link|linkdmg}`. Spells reuse magic's `spell` request
(+ follow-ups `fx {k:'spell', s:'cbx', t: zap|frost|meteorhit|decoyoff}`).
fx subs: parry, bleed, slam, snd, tr, rocket, grenade, boom, sonar, slam2, cry, heal, pulse, revive, link, linkhit, turret, turretoff, tshot.

## Known issues / not done
* **Nothing hand-played**: all arcs, guard poses and numbers are unverified by eye and the feature script has not been run. Expect tuning (arc sign conventions, hit timing, guard pose).
* Two real players over the internet not tested (host path only). Remote players see swings only through the stock `swingAnim` replication (no combo / guard poses on avatars).
* Weapon melee no longer hurts crewmates (the old 35 % friendly fire of `resolveMelee` is not reproduced).
* The parry window is client-timed against host `hurt` messages (latency eats some of the 0.28 s); hazards and projectiles are never blockable.
* No moon loot entries for the new weapons (Store only); no reload animation; the Grav-Tool beam is drawn for the holder only; decoys / mini-turrets are host-side fake players / sims (some host code may treat the decoy id like a peer).
* Sounds are quick procedural placeholders. Blood Magic HP cost is 0.5 HP per mana point (untuned).
