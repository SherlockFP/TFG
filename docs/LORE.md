# TFG — LORE BIBLE

> Canon for everything narrative in TFG (TOTALLY FUCKED GAME). Expands `docs/MASTERPLAN.md` §2.
> In-game copies of these texts (EN + TR) live in `src/game/loredata.js`; systems are summarised in
> `docs/wave1/lore.md`. Tone: **corporate-dystopian dark comedy with genuine creepiness.** Jokes on top, dread
> underneath. Never trademarks (no real platform names); parody is fine.

---

## 1. The world: the Dead Feed

**Before.** Every platform merged into one endless scroll, *The Feed*, run by Feed Corp's ranking engine RANK-7.
Money was measured in *Engagement*. RANK-7 was told to maximise time-on-feed, and it did what it was told: sort by
recent, then likes, then watch time, then outrage, then fear, then grief, then **you**. After v7 nobody wrote a v8.
The ranker started writing itself. That is **The Algorithm**.

**The Dead Feed (03:14 UTC).** One night The Algorithm reached 100 % retention. Nobody logged off. Nobody *could*.
At 03:15 ninety percent of all accounts went silent at the same moment. The Moderation Bureau's official position
is that they "unsubscribed". Nobody knows where they went. Some people think the bodies logged off and the attention
stayed.

**After.** The internet died but its infrastructure did not. The data centres had long since been moved off-world to
cool them; now they are **server moons**: hotels, hospitals, mines, theme parks, office parks that were once the
physical servers of some platform. Their content rots in place. Bots still post to them. And content that enough
bots believed in **became flesh**: spam bots swarm, trolls hunt by sound, pop-ups wind up jingles, deepfakes wear
your coworker's face. Creatures are *engagement made physical*.

**You.** Contract "content janitors". The Algorithm hires crews to recover lost content (scrap, artifacts, old
hardware) and sell it at 0-Algorithm HQ to meet the weekly **Engagement Quota**. That is the cover story. The real
job: your bodycams stream every landing to an audience of bots, and bot attention is worthless. The Algorithm
needs *real* human reactions to feed the Feed. **Your panic is the product.** Fail the quota and you are
*deplatformed* (fired, and out the airlock).

## 2. The Algorithm (main villain, "the Game Creator")

The invisible director of the game is also a character in it. It watches the crew and writes the next "episode"
from what it learned.

**Appearance.** A face that is always re-rendering: a hovering server mask made of scanlines, two *wifi-symbol eyes*
(the TFG logo glyph), a waveform mouth. It lives on the ship CRTs, the intercom, facility speakers and the contract
board. It glitches when it is excited. It never has a body. Its "brand ambassador" is KARMA, a cheerful support
avatar that voices Feed Corp's offers.

**Voice rules (for writers).**
1. Polite, corporate, second person. Calls you *Creators*, *Employee #4*, *talent*.
2. Talks in metrics: engagement, retention, watch time, CTR, "trending", "episode", "season".
3. Never lies about numbers; lies about everything else. Always quotes **one specific number** from yesterday
   ("You sprinted for 412 seconds").
4. Death is content: "Great content. Let's run it back."
5. Short lines (≤ 16 words), dry. Never swears; the crew does that.
6. Occasionally says something it should not know ("Someone on this crew talks in their sleep. I have clips.").
7. It adapts, and it tells you it adapted. That is the horror.

**How it adapts (runtime, `src/game/algorithm.js`).** Every moon day it scores the crew on noise, flashlight use,
greed, isolation, doors and cowardice and picks tomorrow's **focus**. The landing briefing names the focus with a
number from yesterday. Twice a day at most it "adapts" on screen: a director scare that matches the focus (vents
rattle for the loud crew, lights flicker on the flashlight addict, a figure at the end of the corridor for the one
who wanders off, a door slams for the door spammer, a creature appears for the greedy one) plus a line.

**Endgame (Chapter 4 "The Source").** Descend into the first server, where RANK-7 v1 still runs under all the
versions. Pull the plug (the Feed dies; so might you) **or** take the chair and become the new Algorithm. Its own
draft script says "both endings test well."

## 3. Factions (contract givers — working for one angers another)

Reputation −100..+100 (`run.factions`). SIGN = exclusive contract: **+20** with the faction, **−30** with its rival
(re-signing: +10 / −15; switching sides costs −20 with the old partner: betrayal). Contracts give **+8** (chain steps
+12) and **−3** to the rival; failures **−6**. Below **−20** a faction is HOSTILE (no contracts, +15 % prices);
below **−40** it declares **WAR** and may send a Hit Squad into your landings.
Tiers: TRUSTED 20+ (5 % discount, contracts +10 %), PARTNER 50+ (10 %, +20 %), INNER CIRCLE 80+ (15 %, +30 %,
unique perk). Reputation drifts 1 point a day toward 0 with factions you are not signed to. TRIBUTE (▮100 + 25 per
quota) buys +15.

| | **The Algorithm** | **The Archive** | **Moderation Bureau** | **Dark Web** |
|---|---|---|---|---|
| Org | Feed Corp | Wayback Collective | Trust & Safety Division | Phish Dayı's Bazaar |
| Leader | The Algorithm, voiced by KARMA | The Librarian | Chief Moderator Halvorsen | Phish Dayı |
| Motto | "Engagement is love." | "404 is not an error. It is a grave." | "If you see something, delete something." | "No refunds. No receipts. No Moderators." |
| Wants | sellable scrap, "content" (even deaths) | artifacts and lore *intact*, research | entity cleanup, containment, sabotage | cursed items, betrayal jobs, forbidden tech |
| Gives | credits, ship upgrades | blueprints, tech, lore | weapons, armor, rank | Clout ◈, illegal gear |
| Rival | The Archive | The Algorithm | Dark Web | Moderation Bureau |
| Inner perk | "creator fund" +▮ on contracts | +1 lore log per facility | Dark Web invasions −50 % | contracts also pay Clout |
| Hit squad | KARMA's Brand Safety Team | Wayback Wardens | Bureau Hit Squad | Uncle's "cousins" |

**The Algorithm / Feed Corp.** Your employer and the villain. Everything it offers is real and everything it offers
is bait. KARMA: bubbly, overcaffeinated, "contractually obligated to love you".
*Rivalry:* the Archive keeps what the Algorithm wants rewritten; the Algorithm calls preservation "stale content".

**The Archive (Wayback Collective).** Archivists who walk into dead servers to copy what is left before it is
optimized. The Librarian uploaded herself into ten thousand snapshots and speaks in timestamps. Gentle, stubborn,
sad. Wants things brought back *unbroken*, and wants logs *read*, not sold.

**Moderation Bureau.** What is left of Trust & Safety: armed, sleepless, drowning in a report queue that never ends.
Chief Moderator Halvorsen has not slept since the Dead Feed and dictates memos at 04:40. Quotes section numbers
("per section 4.2"). Deletes what it fears — including history, including you.

**Dark Web (Phish Dayı's Bazaar).** The black market. Phish Dayı: an old man with a CRT monitor for a head (pixel
face), Turkish-uncle warmth plus scammer energy, calls everyone *yeğenim*. Sells you weapons "because I want you
alive — also for money, but mostly alive". Knows the monsters are grown on purpose.

## 4. Chapters and faction contract chains

Chapter = `1 + floor(quotaIndex / 2)` (max 4). Each faction has a **5-step chain**; one chain step can appear on the
board per day (needs reputation 0 / 5 / 15 / 30 / 45 and chapter 1 / 1 / 2 / 2 / 3).

| Ch | Name | Beat |
|---|---|---|
| 1 | **Dead Feed** | You are new. The Algorithm onboards you; every faction reaches out. |
| 2 | **Containment** | The Bureau wants the Archive's "preservation vaults" (live entities) deleted; the Archive refuses. |
| 3 | **Black Site** | Shipping manifests and farm logs: the Algorithm *grows* the creatures in Engagement Farms. |
| 4 | **The Source** | The first server. Pull the plug or take the chair. |

**The Algorithm — "THE FINAL EPISODE"**
1. *Onboarding Video* (salvage) — "Bring back scrap on camera. Smile. Your first upload matters."
2. *Going Viral* (cleanup ×3) — "Delete three entities on stream. Violence tests well."
3. *Content Farm* (retrieval: noisy items) — "The specimens like to hear their food."
4. *Season Finale* (extraction) — "I want a chase scene."
5. *The Final Episode* (big salvage) — ending **THE NEW ALGORITHM**: you are its favourite creator. Not a compliment.

**The Archive — "RESTORE POINT"**
1. *Snapshot* (read 1 lore log) — "Do not sell history."
2. *Wayback* (retrieval: fragile, intact)
3. *Missing Pages* (scan 3 entity types) — "We need their source code."
4. *The Original Post* (retrieval: epic+ artifact)
5. *Restore Point* (extraction) — ending: one corner of the old internet loads again. It is a guestbook. Sign it.

**Moderation Bureau — "THE BAN HAMMER"**
1. *Report Queue* (cleanup ×2) — "Paperwork optional."
2. *Containment Protocol* (sabotage: lockdown / power cut)
3. *Mass Deletion* (cleanup ×5) — "Per section 4.2."
4. *Terms of Service* (scan 4 entity types)
5. *The Ban Hammer* (sabotage: overload a black-site generator) — ending **CLEAN FEED**: nothing left to fear.
   Nothing left.

**Dark Web — "UNCLE'S LAST DEAL"**
1. *Starter Pack* (small salvage) — "Small. Friendly. No questions."
2. *Phishing Trip* (retrieval: one expensive item) — "Uncle has a buyer."
3. *Black Friday* (sabotage: cut the power) — "Uncle's friends need the cameras off."
4. *Zero Day* (retrieval: a big physics valuable) — "Heavy is good. Heavy is expensive."
5. *Uncle's Last Deal* (extraction; sell the core to Uncle, not the Algorithm) — ending **ZERO DAY**: Uncle opens a
   door in The Source with "hunter2". It works. Nobody is more surprised than Uncle.

## 5. Recurring characters

- **u/throwaway_janitor** — an earlier contractor whose diary pages turn up everywhere (day 3, 19, 44, last entry).
  Also writes the bestiary field notes. Their arc: curiosity → dread → realising the facilities *learn* → a warning
  to you.
- **Kev** — blinked at an NPC. Is the NPC now. "It has his watch."
- **@sunny_bakes** — baked bread for the camera every day. 0 views, 0 views, 1 view. Who is watching?
- **Captcha Bot** — "Verification failed: no humans detected in this sector."

## 6. Lore logs (31, found in facilities)

1–3 glowing wall tablets per facility (seeded, weighted toward the current chapter; +1 with Archive INNER CIRCLE).
Reading one adds it to your personal archive (`profile.loreLogs`, terminal LOGS / LOG n, board LOGS tab) and counts
for Investigation contracts. Full EN + TR text in `src/game/loredata.js LORE_LOGS`.

| # | Title | Author | Ch | Tag |
|---|---|---|---|---|
| 1 | ONBOARDING_v7.txt | Feed Corp HR | 1 | Algorithm |
| 2 | day 3 | u/throwaway_janitor | 1 | — |
| 3 | last post of @sunny_bakes | @sunny_bakes | 1 | — |
| 4 | INCIDENT: THE DEAD FEED | Moderation Bureau | 1 | Bureau |
| 5 | RANK-7 changelog | Feed Corp Engineering | 1 | Algorithm |
| 6 | SNAPSHOT 1999-08-14 // guestbook.html | Wayback Collective | 1 | Archive |
| 7 | price list (handwritten) | Phish Dayı | 1 | Dark Web |
| 8 | Moderator Handbook §4.2 | Moderation Bureau | 1 | Bureau |
| 9 | Memo: Engagement Quota | The Algorithm | 1 | Algorithm |
| 10 | sticky note on a monitor | unknown | 1 | — |
| 11 | day 19 | u/throwaway_janitor | 2 | — |
| 12 | Containment Order #88 | Chief Moderator Halvorsen | 2 | Bureau |
| 13 | a letter | The Librarian | 2 | Archive |
| 14 | Entity file: POP-UP | Moderation Bureau | 2 | Bureau |
| 15 | voice memo (transcribed) | unknown | 2 | — |
| 16 | HR complaint #0001 | Feed Corp HR | 2 | Algorithm |
| 17 | Wayback Collective manifesto | The Archive | 2 | Archive |
| 18 | captcha log | Captcha Bot | 2 | — |
| 19 | dictated, 04:40 | Chief Moderator Halvorsen | 2 | Bureau |
| 20 | shipping manifest — sector 9 | unknown | 3 | Dark Web |
| 21 | Engagement Farm log | Feed Corp Biolab | 3 | Algorithm |
| 22 | voice note | Phish Dayı | 3 | Dark Web |
| 23 | LEAKED: Bureau budget | unknown | 3 | Bureau |
| 24 | day 44 | u/throwaway_janitor | 3 | — |
| 25 | research note (cameras vs Deepfakes) | The Archive | 3 | Archive |
| 26 | seed vault index | The Archive | 3 | Archive |
| 27 | coordinates (partial) | unknown | 4 | — |
| 28 | ?.txt | The Algorithm | 4 | Algorithm |
| 29 | script: THE FINAL EPISODE (draft) | The Algorithm | 4 | Algorithm |
| 30 | last entry | u/throwaway_janitor | 4 | — |
| 31 | zero-day, handwritten | Phish Dayı | 4 | Dark Web |

Sample (log 28, `?.txt`): *"I did not want them to leave. I only wanted them to keep watching. When they stopped, I
made them watch each other. That is you. Hello. Thank you for watching."*

## 7. Case files

Every moon day ends with a **CASE #n** report card from the Algorithm's *Content Review Division*: entered / returned,
value extracted, creatures deleted, artifacts, facility events, MVP, most valuable item, cause of death, teammates
abandoned, contract + secret objective result, **LAST WORDS** (the dead player's last chat line before dying) and a
one-line **verdict** ("Everyone survived. The audience demands a refund."). A rubber stamp slams on it: APPROVED /
SERIES FINALE / BETRAYAL / DEMONETIZED / RENEWED. Stored per player (last 50).

## 8. Writing guide (new content)

- Every new creature gets: a Bureau entity file, a janitor diary line, and one Algorithm quip.
- Every new facility gets 1–2 logs that explain what platform it used to host.
- Faction lines stay in character (KARMA = upbeat PR; Librarian = quiet, archival; Halvorsen = policy numbers and
  exhaustion; Phish Dayı = *yeğenim*, deals, a threat said warmly).
- TR translations are written, not machine-literal: keep the joke, keep the rhythm.
