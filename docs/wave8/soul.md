# Wave 8 - SOUL (module `soul`, `src/game/soul.js` + `soul_core.js`)

Owner: "the game has no soul - add theme, decoration, polish". Direction from `docs/CRITIQUE_W8.md` plan 8B (fill the space, give it colour, problem 4: wide, empty, grey).
Identity used: a company crew surviving inside the live stream of The Algorithm; corporate horror + dark humour; PSX + CRT company-issued look. Voice rules: `docs/wave8/studio_style.md`.
Everything is local presentation: no net messages, no host state, no new THREE lights (`game.soul`, install via `this.useModule('soul', installSoul)`).

## What it does

1. **One colour identity per moon.** `PALETTES` (soul_core.js) patch `BIOMES[<moon biome>]` at install (sky / fog / night / sun / dusk / fogDensity / hemisphere ground + white mix / terrain vertex tints) and set the post `uSat` grade in moon phase.
   Dialup = sodium amber + plum night, Forum = bile green, Guestbook = cold teal + red dusk, Chatroom = blood terracotta + rose dusk, Creepypasta = bruised violet, 404 = black + dead red sun, HQ = fluorescent teal.
   Generated sectors / other maps get a seeded hue shift of their own biome on `mapLoaded` (`paletteFor`). Fog is a little thinner on the named moons so hills read. `environment.js` got 3 tiny reads (`b.dusk`, `b.hemiW`, `b.hemiG`).
2. **Story beats** (`planBeats` + `buildBeats`): a beat every ~25 m along the ship -> entrance path (first one = sponsor sign, then a shuffled bag), plus a small off-path beat (body bag / drone / crate) between each pair.
   Kinds: Algorithm sponsor sign (dark-joke text), last-crew camp (tent, fire ring, lantern, hand-written note), Company crate stack ("deductible"), body bag with tag, tire ruts + lost handcart, crashed camera drone, quarantine tape.
   Seeded by (moon, seed); ground-snapped per part (skirt below every grounded box so slopes never float); colliders for solid parts only; avoids ship / entrance / fire exits / ponds / lakes / flood / trees / scrap spots / mapart's own specs (built on the first update so mapart has placed its billboards).
3. **Ship soul** (positions in `world/shiplayout.js` `SOUL`, checked by `ship2_overlap.test.mjs` through `fixtureBoxes`): whiteboard on the cockpit bulkhead with REAL numbers (days on the feed = `run.day`, deplatformed = `profile.stats.deaths`, best haul = `profile.stats.bestHaul` written by the module on each sale, quotas met = `run.quotaIndex`, tally marks), a shelf with three crew mugs and a plant that grows with quotas met (7 stages, flowers at 6), a Company motivational poster (3 variants by run id) on the cockpit face, three sticky notes.
4. **Moments** (each short, none is a permanent HUD widget):
   - touchdown title card (moon name + Algorithm one-liner + day), dust ring around the ship; any key / click skips it (4.2 s otherwise);
   - sale: scrap rows slide in, the total counts up with ticks, register "cha-ching", Algorithm reaction line inside the sale panel (good / ok / bad by haul vs what the quota still needs), "New best haul";
   - quota met: a Company PA line 9 s after the existing ceremony;
   - pickup pop: a tiny "+▮N" rises from the crosshair for scrap worth >= 20 with a pitched tick;
   - low HP: soft high-shelf cut on the master tone stage (the heartbeat + red vignette stay in `feel.js`, the downed lowpass in `downed.js`).
5. **Voice**: 6 walking lines, 7 beat lines, 6 Company PA lines, 5 sale reactions, 1 quota line, 8 touchdown one-liners (EN/TR/RU in `TX`). One shared gate: <= 1 line per 45 s, never while chased / downed / dead, never over a running intercom line. Sale reactions that lose the gate stay as panel text. Ambient lines: first walk line after 22 s outdoors, then every ~75-100 s; PA in orbit 28 s after arrival, then every 150 s, and once at HQ.

## Knobs
`PALETTES` (colours, `fogDensity`, `sat`), `BEAT` (first / gap / jitter / lateral / clearances), `BEAT_R`, `VOICE` (gap 45, firstAfter 22, walkEvery 75, beatNear 9), `saleGrade` thresholds, `SOUL` (ship positions), `TX` (all text). No settings toggle was added.

## Tests
`node tools/harness/soul.test.mjs` (palettes distinct, beats seeded / snapped / spaced / clear, colliders grounded, voice gate, EN/TR/RU + style rules, ship wiring), `ship2_overlap.test.mjs` (0), `geomfix.test.mjs` (soul added to its module pass: 0 new; the 2 `blocking doors:museum` are older and interior-side), `mapart*.test.mjs`, `npm run build`.

## Unverified
- Colours are judged from numbers and one screenshot pass, not a playtest: check the six moons at day / dusk / night, especially hamsi (amber may read too orange) and orkinos (dark enough to lose the beats?).
- Canvas text legibility of sponsor signs / notes at distance; sticky notes and the whiteboard font fall back to Comic Sans / cursive.
- Beat colliders vs the player capsule and creatures (tent 2.1 m box, crate stack) were only checked as boxes on the ground.
- Muffle strength on real headphones; the interplay with `downed.js` lowpass (both run: the shelf is on `audio.tone`, the lowpass sits after it).
- 2-player: nothing is networked, so each peer gets its own line timing (the beats themselves are identical from the seed).
- Language switch rebuilds the ship texts only; the beats keep the language of the map load.

## Remaining / not done (lead stopped the task for quota)
- NO real-browser verification: the one headless run (`tools/harness/wave8_soul.js`, tiles ship whiteboard / poster / two moons into one screenshot) died with "browser closed" behind a busy shared lock, so nothing here has been seen by eye: palettes, beat geometry facing / scale, whiteboard / poster / note orientation on the bulkhead, title card layout, sale count-up in the real panel, pickup pop. Run it first: `flock /tmp/tfg-browser.lock node tools/harness/headless.mjs --port PORT --script tools/harness/wave8_soul.js --shot out.png --wait 4000`.
- `tools/harness/ship2_install.test.mjs` did not finish within 100 s here (not compared against a clean tree; `ship2_overlap.test.mjs` = 26/26 and geomfix = 0 new).
- geomfix's existing `blocking doors:museum: 2` is unrelated (present without soul).
- Not built: staged "scrap slides across the counter" in 3D at HQ (only the panel rows slide), a separate quota-failed ceremony (the existing FIRED cinematic + `quota_fail` intercom line are untouched), before / after screenshots.
