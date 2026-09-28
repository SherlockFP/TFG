# RESEARCH — Lethal Company & R.E.P.O. Design Analysis for KEFAL COMPANY

> Compiled from wikis (lethal-company.fandom.com, lethal.miraheze.org, lethalcompany.wiki.fextralife.com,
> repo-2025horror.fandom.com), guides (GameRant, Dot Esports, TheGamer, ProGameGuides, GameSpot), Steam
> discussions, and dev-interview coverage (PC Gamer, PushToTalk). Numbers are community-datamined and may
> drift slightly between game patches; treat as "close enough to steal."

## 1. Lethal Company

### 1.1 Core loop, day timer, ship rules
- A moon "day" runs **700 seconds (~11m40s)** of real time, clock starts at 7:40 AM and runs to midnight
  the instant the ship lands; the autopilot **departs automatically at midnight** whether or not the crew
  is aboard — anyone left outside is killed. [lethal-company.fandom.com/wiki/Time]
- Common player heuristic: head back to the ship by ~3 PM on easy days, ~1 PM on hard/late-quota days,
  because outdoor night creatures start rolling in before dusk. [lethalcompany.wiki.fextralife.com]
- Loop: **Orbit → terminal routes to a moon → land → scavenge (outside terrain + inside facility) → haul
  scrap back to ship → take off (lever or auto-midnight) → return to Company → sell → repeat** for 3 days
  + a deadline day, 4 cycles total per quota. [lethal.miraheze.org/wiki/Quota]

### 1.2 Quota formula (how it grows)
- First quota is **130 credits**. [lethal-company.fandom.com/wiki/Profit_Quota]
- Growth is **quadratic**: `nextQuota = floor(currentQuota + 100 * (1 + (quotaIndex-1)^2/16) * rand(0.5–1.5))`.
  Because the *increase* scales quadratically, the quota itself scales roughly cubically over a long
  campaign — pressure rises slowly at first, then compounds hard. [stardewprofit.com/guides/lethal-company/quota-formula-explained]
- Buying ship furniture "quietly reduces how much the next quota rises," a soft catch-up mechanic for
  crews that reinvest instead of hoarding. [lethalcompany.wiki.fextralife.com]

### 1.3 Buy-rate schedule (the single best "why did I wait" lesson)
The Company's payout percentage for sold scrap **climbs as the deadline approaches**, not a flat rate:

| Days left in cycle | Buy rate |
|---|---|
| 3 days left | ~30% |
| 2 days left | ~53% |
| 1 day left | ~77% |
| Deadline day (0 left) | **100%** |

Holding the same haul to the last day is worth **>3×** selling it early — "it costs nothing but patience,"
but risks losing everything if the crew wipes before selling. [lethalcompany.wiki.fextralife.com/Lethal_Company_Beginner's_Guide]

### 1.4 Terminal, UI, scan
- Terminal is a typed-command computer: `SCAN`, `HELP`, `MOONS` (list + hazard %), `STORE`, `STORAGE`
  (stored ship furniture), `VIEW MONITOR` (map/cameras), `BESTIARY` / `<creature> INFO`, route selection,
  and **two-digit codes** shown on the radar map that remotely toggle secure blast doors or temporarily
  disable turrets/mines. [gamerevolution.com; lethal-company.fandom.com/wiki/Terminal]
- `SCAN` (bound to a handheld scanner too) shows item count and an **approximate** total value; the real
  value is roughly `shown × 0.41` (host) or `× 0.5` (client) — deliberately fuzzy so players can't min-max
  perfectly. Bodies, apparatuses, shotguns/knives count toward scan; keys/shells don't. [gamerevolution.com]
- Bestiary entries unlock per-creature after you scan that creature at least once — ties the "learn the
  rule" loop directly to the scan mechanic. [lethal-company.fandom.com/wiki/Bestiary]

### 1.5 Player stats
- **HP 100.** Below 20 = critically injured (regenerates back up to 20 only); below 10 = limping, can't
  sprint. [Player_Stats, miraheze]
- **Stamina**: sprinting/jumping drains it; below 0.1 = exhausted (can't sprint/jump); needs to refill to
  0.2 before jumping again, 0.3 before sprinting again. [miraheze/Player_Stats]
- **Weight**: every 10 lb of carried items adds ~9.52% stamina drain + move-speed penalty; **105 lb = 100%
  penalty** (half speed, stamina lasts half as long). Weight does **not** affect jump height or fall
  damage. [miraheze/Player_Stats]
- **Inventory**: 4 slots; two-handed scrap (shotgun, apparatus, etc.) occupies both hands and blocks the
  other 3 slots while held.
- **Fall damage** is velocity-based, not distance-based, with hard breakpoints: 30 dmg / 50 dmg / 80 dmg /
  **100 dmg (instant kill)** at rising fall-velocity thresholds. [lethal.miraheze.org/wiki/Damage]

### 1.6 Death, bodies, fines
- Dying leaves a scannable corpse that tells you the cause of death (explosion, gravity/fall, gunfire,
  strangulation, etc.) — diegetic feedback, not a UI popup. [lethal-company.fandom.com/wiki/Employee]
- On return to orbit, unrecovered bodies cost **20% of current team credits each**; a body physically
  carried back (or teleported via terminal) only costs **8%**:
  `totalFine = floor(credits*0.20)*unrecovered + floor(credits*0.08)*recovered`. [lethal.miraheze.org/wiki/Body]
  This is a great "greed vs. loyalty" lever — do you spend the last two minutes dragging a corpse or
  grabbing one more item?

### 1.7 Weather
| Weather | Effect |
|---|---|
| Rainy | Dark quicksand patches appear; sinking fully = instant death, no body, items deleted |
| Stormy | Lightning can strike/damage metal objects and players carrying them; can disable ship power |
| Foggy | Light fog reduces visibility; heavy fog nearly blinds you at range |
| Flooded | Deep water slows movement, disables sprint, drains stamina without regen; worsens sharply after 5 PM |
| Eclipsed | Night-only outdoor creatures can spawn at **any** time of day; spawn rates spike indoors+outdoors — by far the most dangerous, "no additional benefit" | [lethalcompany.wiki.gg/wiki/Weather; twinfinite.net]

### 1.8 Moons (tier / cost / hazard / interior)
| Moon | Access | Cost | Hazard | Interior |
|---|---|---|---|---|
| Experimentation, Assurance, Vow | Free | 0 | D–C | Factory |
| Offense, March, Adamance | Free | 0 | B | Mineshaft/Factory |
| Rend | Paid | 550 | A | Mansion |
| Dine | Paid | 600 | S | Mansion |
| Titan | Paid | 700 | S+ | Factory |
| Embrion | Hidden | 150 | S | Factory |
| Artifice | Hidden | 1500 | S++ | Mineshaft | [lethal.miraheze.org/wiki/Moons]

Note the pattern: **free early moons, paid mid-tier, expensive/hidden late moons** — cost gates pacing
more than raw difficulty does, since a broke crew literally cannot reach the hardest content yet.

### 1.9 Interiors
Three base kits — **Factory** (industrial, wide rooms, catwalks), **Mansion** (tight corridors, many small
rooms, better loot density), **Mineshaft** (vertical, narrow tunnels, elevators) — each proc-generated from
tile modules, reused across moons with different exterior/weather/creature dressing.

### 1.10 Monsters — power level & spawn budget system
Every moon has a **power budget** (Max Indoor Power / Max Outdoor Power / Diversity Power). Each creature
has a power level; the moon keeps rolling weighted spawns until the budget category is full, so a moon
never "runs out" of danger, it just runs out of *budget*. [lethalcompany.wiki.fextralife.com/Lethal_Company_Enemies; lethal.miraheze.org/wiki/Mechanics]

| Creature | Power Lv | Max ct | Rule to learn / behavior |
|---|---|---|---|
| Bracken | 3 | 1 | Stalks from behind, snaps neck if you stop looking/get cornered; backs off if you turn and stare at it |
| Coil-Head (mannequin) | 1 | 5 | Only moves when unobserved; loud noise/bright light forces a long "reset" freeze; stun grenade works |
| Jester | 3 | 1 | Harmless wind-up toy until it spots you, then winds its crank and, once popped, hunts everyone in the facility — evacuate, don't fight |
| Eyeless Dog | 2 | 8 | Blind, hunts by **sound** (sprinting, items, voice chat); roars alert nearby packmates in a chain reaction; clumsy about exact location |
| Hygrodere (blob) | 1 | 2 | Unkillable ooze, slow, drawn to heat/oxygen, can't climb — stand on something tall |
| Forest Keeper | 3 | 3 | Child-like giant, eats anything interesting, sees far, can't fit small spaces — use cover/overhangs |
| Kidnapper Fox | 1 | 1 | Ambushes from Vain Shroud plants with a long sticky tongue-grab; tongue is fragile and can be shot/struck to break the grab |
| Earth Leviathan | 2 | 3 | Burrows, detects vibration/footsteps; if you hear rumbling, retreat — it can't be outrun in a straight line |
| Bunker Spider | 2 | 1 | Waits in webs over doorways; freezes if surprised; webs slow you but break with any blunt tool |
| Baboon Hawk | 0.5 | 15 | Timid solo, dangerous in packs; act big/stay grouped to deter |
| Masked | 1 | 10 | Mimics a crewmate's name tag/appearance, hunts the real players | [Bestiary + Enemies table, sources above]

Hazards: **turret** sweeps a cone and fires (50 dmg to healthy players, instant-kill under 50 HP), disabled
via terminal door-code system; **mines** click underfoot and detonate on release/step-off, also
terminal-disarmable; both are handled through the same 2-digit code UI as doors, unifying "read the map,
type the code" as one skill across hazards. [lethal.miraheze.org/wiki/Damage]

### 1.11 Items & store
Sample always-available equipment prices: Walkie-talkie 10¢, Flashlight 15¢, Shovel 30¢, Lockpicker 20¢,
Pro-flashlight 28¢, Stun grenade 30¢, Boombox 60¢, TZP-Inhalant 80¢, Zap gun 400¢, Jetpack 900¢, Extension
ladder 60¢, Radar-booster 60¢, Spray paint 50¢, Belt bag 45¢. Ship upgrades and cosmetic decorations rotate
daily in stock; suits are one-time buys 60¢–900¢. [lethal.miraheze.org/wiki/Store] Scrap items themselves
number ~70+ (bolts, gold bars, lamps, ducks, etc.) with wide, RNG'd value ranges per moon rarity tier.

### 1.12 What makes the videos go viral
- **Proximity voice chat + panic screaming** is the single biggest clip generator — fear reactions are
  real, audible, and instantly shareable. [tech.yahoo.com]
- Movement/stamina/inventory are "bad on purpose" (heavy, clumsy, slow-turning) so failure feels
  earned/funny rather than like a bug. [finance.yahoo.com]
- Comedy and horror are **stacked, not separated** — a Jester chase and a "who forgot the shovel" argument
  happen in the same 30 seconds. Zeekerss (dev) has said his games were "always funny accidentally," and
  later leaned into it deliberately. [pushtotalk.gg; PC Gamer interview]
- Bestiary flavor text is written in-character by an unreliable in-universe narrator ("Sigurd"), riddled
  with typos and jokes — cheap narrative texture that becomes quotable/memeable on its own.

## 2. R.E.P.O.

### 2.1 Physics grab/carry & fragile valuables
- Hold **LMB** to grip an item with a physics tractor-beam; **scroll wheel** adjusts hold distance so you
  can thread doorways without clipping the object on geometry. An October update added a **tumble-launch**
  throw mechanic for flinging carried objects/monsters. [dlcompare.co.uk; steamcommunity guides]
- Valuables have real physics and **lose monetary value from impacts** — drop them from height or slam
  them into a wall and you hear a distinct crack as the price drops, sometimes to near-zero.
  [game8.co; steamcommunity guide 3561257961]
- The hover **C.A.R.T.** (and smaller Pocket C.A.R.T.) is a safe zone — items placed inside take no impact
  damage, incentivizing a "designated mule" co-op role.

### 2.2 Extraction points & haul goals
- Per-level quota = `totalLevelLootValue × 0.7 × difficultyCurve(level)`, where the curve runs roughly
  **0.4 at level 1 → 0.7 by level 10 → 1.0 by level 20+** (then flat). Levels spawn well over quota in
  total value, so there's always a buffer if you're willing to take more risk. [community datamine via search]
- Loot is carried to a **truck/extraction point**; multiple extractions can occur per level. On the
  **final extraction**, the truck emits large silent "pings" that pull every monster on the map toward it
  — a scripted late-run climax where the safest place becomes briefly the most dangerous.
  [repo-2025horror.fandom.com/wiki/Final_Extraction]

### 2.3 Shop upgrades & prices (Service Station, between levels)
| Upgrade | Effect | Price range |
|---|---|---|
| Health | +20 max HP | $4K–18K |
| Stamina | +10 stamina | $2K–14K |
| Strength | Lift heavier/bigger items (13 total needed to solo-lift everything) | $6K–45K |
| Range | Grab range + max hold distance | $6K–32K |
| Tumble Launch | Throw distance | $4K–5K |
| Extra Jump | +1 air jump, stackable | $10K–18K | [repo-2025horror.fandom.com/wiki/Upgrades; switchbladegaming.com]

Weapons/tools: Gun $46K, Shotgun $92K (unlimited ammo, big recoil), Tranq Gun $17K (non-lethal stun),
Sledgehammer $44–48K, Baseball Bat $24–29K, Frying Pan $24–27K; explosives/utility all cheap at ~$3K
(Grenade, Stun Grenade, Shockwave Grenade, Stun Mine) plus the novelty **Rubber Duck** bomb ($16K, bounces
before detonating — "dangerous and hilarious" per its own shop description); Cart $41–45K, Pocket Cart
$17–18K. [thegamer.com; dotesports.com]

### 2.4 Death, revival via head, monsters
- On death a player becomes a detached, draggable **head**; teammates carry it to an extraction point (or
  the truck) to revive them mid-run — a concrete, physical "rescue" objective instead of a menu respawn.
  [gamesradar.com; gamerblurb.com]
- 29 monsters split into **Danger Level 1–3**, each with tracked **HP, per-hit damage, detection type
  (line-of-sight cone / proximity / touch / sound), a "strength breakpoint" (upgrade level needed to stun
  it by grabbing), and a weight/mass class**. Selected examples:

| Monster | Danger | HP | Detection | Notable rule |
|---|---|---|---|---|
| Gnome | 1 | 20 | LoS/proximity/touch | Trivial, dies to a toss, no orb drop |
| Peeper | 1 | 30 | Line of sight only | Never triggers combat directly, but its gaze alone deals DoT — break sightlines |
| Shadow Child | 1 | 150 | **Eye contact only** | Ignore/avoid looking at it; teleports instead of pathing |
| Huntsman | 3 | 250 | **Sound + touch, completely blind** | 5× normal hearing radius; can't tell player noise from monster noise; stay crouched (silent) |
| Loom | 3 | 500 | Proximity/touch, **always knows your position** | Line-of-sight stealth doesn't work on it; must be out-maneuvered physically |
| Birthday Boy | 1 | 150 | Ignores you until a balloon pops | Passive unless provoked — don't pop the balloons |
| Bella | 1 | 200 | Blocks path / touch | Ignores you unless you obstruct or grab it |
| Tick | 1 | 10→100 (inflates) | Only when holding something (tractor beam) | Harmless empty-handed; escalates the more loot you're carrying | [repo-2025horror.fandom.com/wiki/Monsters]

- **Detection cone scales with player stance**: standing needs ~1s in view to be spotted, crouched ~2.5s,
  fully hidden ~5s — stance is a real, continuous risk dial, not a binary stealth toggle.
- **Action/"Leave" timer**: every monster sharing a room with a player increments a shared timer at a rate
  equal to its danger level (stacks with multiple monsters); once it caps, all active monsters are forced
  to retreat several rooms away before resuming patrol — a built-in "heat cools down" mechanic so pressure
  doesn't spiral forever.
- **Spawn count scales with dungeon depth** (e.g. levels 1–2: 1/0/1 by danger tier; levels 20+: 3/4/4), and
  **idle time before monsters activate shrinks with depth** (240–360s on level 1 down to 0s by level 11+),
  with a random 20% chance per level to slash idle time to near-zero early — an escalating "grace period"
  players slowly lose as runs get harder.
- **Despawn/respawn timers shrink as a run's wall-clock time grows** (4–5 min respawn in the first 10
  minutes of a level, down to ~1 second after 50 minutes or immediately after the final extraction is
  triggered) — pressure ratchets up automatically the longer a team dawdles on one level.
  [repo-2025horror.fandom.com/wiki/Monsters]
- Dead monsters drop **Soul Orbs** (extra currency), invulnerable for a few seconds after spawning, then
  fragile like any other valuable — greed bait right after a kill.

### 2.5 Proximity voice with robot pitch
- All players speak through a robotic voice filter whose **pitch is driven by head look-angle**: looking
  up = higher/faster voice, looking down = lower/slower — a purely physical, skill-free control players
  discovered was hilarious and now perform deliberately. Widely cited as the mechanic that "got the game
  on the map." [repogame.fandom.com/wiki/Player_Character; hardcoregamer.com]
- Voice is proximity-limited like Lethal Company; wandering out of range silently cuts communication,
  forcing players back together.

### 2.6 Level types
Four maps at review time: **Headman Manor** (mansion, narrow multi-floor corridors — hardest, easy to get
trapped), **McJannek Station** (arctic base, open sightlines — friendliest for new teams), **Swiftbroom
Academy** (wizard-school castle, alchemy/magic-themed loot), **Museum of Human Art** (large open floors,
crawl vents as escape routes, many pits in later rooms). [repo-game.org/en/repogame-maps; dotesports.com]

### 2.7 What makes it funny
Ragdoll physics on every player and monster interaction; the pitch-shifted voice chat; valuables that
crack and shatter for real money loss (schadenfreude when a teammate faceplants your gold statue); a
literal exploding **rubber duck** as a purchasable weapon; reviving a friend by dragging their disembodied
head across the map. The comedy is **systemic** (physics + voice + economy), not scripted — it emerges
from mechanics interacting, which is why every group's clips are different.

## 3. What makes these games good (and where they fall short)

### 3.1 Concrete, transferable design lessons
- **Tension/release cadence beats constant tension.** Both games force calm exploration → detection →
  panic → escape/relief, on a loop measured in seconds, not minutes. A monster's "leave" state (R.E.P.O.)
  and a moon's power budget going empty (LC) both exist to *guarantee* the release half of the cycle.
- **Sound is the primary information channel, sight is secondary.** Darkness/fog forces players to listen;
  footsteps, breathing, and creature audio are spatialized and readable well before anything is visible.
  This makes cheap, low-poly visuals a non-issue — the horror lives in the mix, not the mesh.
- **One learnable rule per monster, always fair.** Every creature above has exactly one core behavior a
  player can internalize (don't look / do look / stay quiet / don't corner it / break line of sight). No
  monster is "unfair RNG death" once you know its rule — mastery is legible and teachable to new players
  in one sentence.
- **Greed vs. fear is an explicit economic lever, not just vibes.** LC's buy-rate schedule (30→53→77→100%)
  and R.E.P.O.'s escalating late-level danger both make "stay longer, cash out later" a real, quantified
  bet, not a vague feeling.
- **Proximity voice chat is simultaneously a mechanic and a comedy engine.** It's gameplay-relevant (noise
  attracts hounds/Huntsman; you lose contact if you split up) *and* it's the source of the funniest clips,
  for free, with no scripted content.
- **Co-op roles emerge from tools, not job-assignment UI.** The "radar/camera operator" role in LC isn't a
  class you pick — it falls out naturally from the terminal + monitor + walkie-talkie existing as ship-only
  tools. Design the *station*, let the role emerge.
- **Short runs, hard failure, near-zero reload friction.** An LC day is ~12 minutes; a R.E.P.O. level is a
  similar scale. Losing a run costs minutes, not hours, so players tolerate brutal difficulty because the
  next attempt is always close.
- **Lo-fi aesthetics are a force-multiplier, not a limitation.** Low resolution, thick fog, and simple
  lighting all *reduce* what needs to be rendered clearly, which both cuts art cost and increases dread
  (imagination fills what you can't quite see).
- **Diegetic UI over menus.** Terminal commands, scan overlays, bestiary unlocked by scanning, cause-of-
  death readable off a corpse — information arrives through in-world objects, reinforcing immersion.
- **Physical, not abstract, stakes.** A body you drag back for a lower fine; a head you carry to revive a
  friend; a vase that visibly cracks. Mechanical consequences with a physical carrier are more memorable
  than a health-bar tick or a stat penalty.

### 3.2 Pitfalls / common criticisms (relevant to our MMO layer)
- **No persistent progression, and no scaling down for smaller crews** are LC's two most-repeated
  complaints: quota rises without bound until a wipe is inevitable, and a 2-player crew faces the same
  spawn budget/creature stats tuned for a full 4-player lobby, which reviewers call "needlessly punishing"
  rather than fair. [steamcommunity discussions; multiple reviews]
- **No save state** between firings in LC means a bad run can erase an entire campaign's momentum — this
  is explicitly the gap our profile/XP/skill-point layer is designed to fill, so we should keep it.
- **Repetitiveness over long sessions** is cited for both games — the *moment-to-moment* loop (grab loot,
  avoid monster, extract) doesn't itself evolve; only numbers get bigger. Content variety (new
  moons/levels/monsters) has to keep pace with player hours or fatigue sets in fast.
- **R.E.P.O.'s grind-vs-reward balance** for Service Station upgrades has drawn "just a to-do list" style
  complaints — upgrades that are purely numeric (+20 HP, +10 stamina) feel like a chore once the novelty
  wears off unless paired with build-defining choices (our skill trees + soulbound gear should aim higher
  than flat stat stacking).
- **Difficulty has no ceiling by design** (quota literally cannot be met forever) — intentional in LC as a
  "how far can you go" score-attack framing, but it means there is no traditional "win," which some
  players find unsatisfying. Worth deciding explicitly whether KEFAL COMPANY wants a true endless ladder or
  a soft "prestige and reset" structure for the MMO layer.

## 4. Recommendations for KEFAL COMPANY

### 4.1 Concrete numbers to steal/adapt
| System | LC / R.E.P.O. reference | Suggested KEFAL number |
|---|---|---|
| Day length | LC: 700s (~11m40s) | Keep **~12 min** (PLAN already targets this) — matches proven pacing |
| Starting quota | LC: 130 credits | **150 credits** first quota (round, easy mental math) |
| Quota growth | LC: `floor(q + 100*(1+(n-1)^2/16)*rand(0.5-1.5))` | `floor(q + 90*(1 + moonTierAvg*0.25 + (n-1)^2/18) * rand(0.6-1.3))` — ties growth to *both* cycle count and how hard a moon tier the crew is farming, matching PLAN's `danger = moonTier + quotaIndex*0.35` |
| Buy-rate curve | LC: 30/53/77/100% over 3+deadline days | Same **4-point curve** (day1 ≈30%, day2 ≈50%, day3 ≈75%, deadline 100%) — directly reinforces PLAN §3's "buy rate rises as deadline nears" |
| Stamina | LC: exhausted <0.1, refill gates at 0.2/0.3 | Use a **0–100 stamina bar**, sprint drains ~18/sec, walk regens ~12/sec, hard "winded" state below 10 (no sprint) |
| Weight penalty | LC: 10lb≈9.5% penalty, 105lb=100% | With a 4-slot inventory, set **soft cap ~60lb** (noticeable slow) and **hard cap ~120lb** (half speed/stamina) so STR skill point investment has a clear payoff curve |
| Fall damage | LC: 30/50/80/100 by velocity tier | Keep **velocity-based, not height-based**, 4 tiers, top tier lethal — cheap to implement in Rapier via contact impulse magnitude |
| Death fine | LC: 20% unrecovered / 8% recovered | **15% unrecovered / 5% recovered** of *team credits* (not personal Kefal Coins) — keeps the "drag the body back" tension without being as brutal, since we also have MMO-layer stakes |
| Monster spawn budget | LC power levels 0.5–4, moon power caps; R.E.P.O. danger 1–3 + depth-scaled counts | Adopt **indoor/outdoor power budgets per moon tier** (PLAN §6 creature list), plus an **idle-timer that shrinks with quotaIndex** (R.E.P.O. pattern: long grace period early game, ~0 by late game) |
| Loot value bands | LC scrap wide RNG range; R.E.P.O. valuables scale with level curve (0.4→1.0) | 4 rarity bands matching PLAN's scan rarity colors: **Common 10–40, Uncommon 40–120, Rare 120–350, Legendary 350–900** Kefal credits, weighted spawn odds shifting toward higher bands on higher-tier moons |
| Respawn/despawn pacing | R.E.P.O.: 4–5 min → ~1 sec as level time elapses | Have monster **re-spawn cooldown shrink as the in-moon clock approaches midnight**, so lingering too long is punished by density, not just the ship leaving |

### 4.2 10+ small, cheap features that buy a lot of "feel"
1. **Scan value fuzzing** — show an approximate scrap value (±20–40%), not the exact number, like LC's
   host/client multiplier trick. Costs nothing, adds constant low-grade tension to every scan.
2. **Corpse-carry fine discount** — LC's exact 20%/8% split. Cheap economic hook, huge emotional payoff
   ("we're not leaving him") for zero new mechanics beyond item-carry you already have.
3. **Two-digit terminal codes shared across doors/turrets/mines** — one UI pattern (read map → type code)
   reused for three different hazards; minimizes new systems while maximizing "camera operator" relevance.
4. **Buy-rate schedule with a visible countdown** — showing the live % on the HQ sell screen turns every
   sale into a bet; pairs naturally with PLAN's existing "buy rate rises as deadline nears."
5. **Monster "leave" cooldown** — a shared per-room exposure timer (R.E.P.O.-style) that forces creatures
   to retreat after sustained proximity, guaranteeing the tension always has a release valve.
6. **Physical revival objective** — carrying a downed teammate's tag/head/beacon to a fixed point to revive
   them mid-run (if we want in-run revival at all) is far more memorable than a respawn menu.
7. **Fragile physics valuables with a "safe zone"** — R.E.P.O.'s cart-is-safe rule; give our ship/cart an
   explicit no-damage volume so players *choose* to risk carrying loot exposed vs. stowing it early.
8. **Voice pitch tied to a physical input** (e.g. look angle, sprint state, or a held item) as a cosmetic
   filter option — R.E.P.O. proved this needs zero "gameplay" purpose to become the most-clipped feature
   in the game.
9. **In-character, typo-ridden bestiary flavor text** written by a recurring fictional field agent —
   near-zero cost (just writing), high memeability, reinforces "learn the rule" via BESTIARY/SCAN.
10. **Loud-item tradeoff** — items like the boombox/airhorn that are useful (lure/distract) but also cut
    monster respawn cooldowns or attract hounds, so "useful" and "risky" are the same button.
11. **Detection-by-stance, not binary stealth** — R.E.P.O.'s standing/crouched/hidden timers (1s / 2.5s /
    5s to be spotted) give stealth a smooth risk dial instead of a hard "seen/not seen" toggle; cheap to
    tune, reads immediately in co-op ("get down!").
12. **Diegetic cause-of-death on corpses** — scanning a body reports what killed them (fall, gunfire,
    creature) instead of a death-log UI; reinforces the scan mechanic's value and world-building for free.
13. **Furniture/upgrades that quietly ease the next quota** — LC's "ship decorations reduce next quota
    growth" is an invisible catch-up mechanic; a cheap knob for us to soften the MMO-layer's late-game
    grind complaints without touching the headline quota formula.
14. **Idle-then-ramp monster activation** — LC/R.E.P.O. both delay real danger for the first chunk of a
    run (idle timers, low initial power budget), so early exploration always has a safe window before the
    day/level "wakes up" — critical for teaching new players without a separate tutorial mode.

## Sources
- lethal-company.fandom.com/wiki/{Time, Profit_Quota, Terminal, Bestiary, Category:Entities}
- lethal.miraheze.org/wiki/{Moons, Mechanics, Store, Damage, Body, Quota}
- lethalcompany.wiki.fextralife.com/{Lethal_Company_Enemies, Lethal_Company_Beginner's_Guide}
- lethalcompany.wiki.gg/wiki/Weather ; twinfinite.net/guides/all-weather-effects-lethal-company
- gamerevolution.com/guides/958910-lethal-company-computer-commands-list-terminal
- stardewprofit.com/guides/lethal-company/quota-formula-explained
- pushtotalk.gg/p/how-lethal-company-sold-10-million-copies ; pcgamer.com (Zeekerss interviews)
- tech.yahoo.com / finance.yahoo.com (virality coverage)
- repo-2025horror.fandom.com/wiki/{Monsters, Final_Extraction, Upgrades}
- repogame.fandom.com/wiki/Player_Character ; hardcoregamer.com/repo-chat-features
- thegamer.com/repo-weapons-tools-explained-guide ; dotesports.com/indies/news/all-r-e-p-o-items-and-upgrades
- repo-game.org/en/{repogame-maps, repogame-quota, repogame-upgrades}
- steamcommunity.com discussion threads and guides (id 3561257961, 3543163806) for LC/R.E.P.O. criticism and mechanics
