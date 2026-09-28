# TFG — re-theme bible (replaces the fish / "Kefal" theme)

The user asked to drop the fish theme and make the game about **internet content of every kind**.
New identity: **TFG** — "lethal" → "viral" (viral content + virus). *"Engagement is love."*

**Premise.** The internet died. Its content is rotting on abandoned server moons. You are a contract
content janitor for **The Algorithm**, a hungry megacorp that buys *lost content* (memes, viral
artifacts, cursed files, old hardware) to feed its **Engagement Quota**. Fail the quota → you get
*deplatformed* (fired / ejected). The creatures are internet horrors given flesh.

**Rule for implementers:** internal ids (item ids, creature ids, moon ids, prop ids, sound names,
localStorage keys, `KefalAPI`) stay as they are, so saves and mods keep working. Only display names,
lore, UI strings, textures with text/logos, and visible models/sprites change. Add `ViralAPI` as an alias
of `KefalAPI`. Avoid real trademarks (no YouTube/Twitter/TikTok names or logos) — parody is fine.

## Names
| Old | New |
|---|---|
| KEFAL COMPANY | **TFG** |
| "Quota is love." | "Engagement is love." |
| The Company | **The Algorithm** |
| 0-Kefal HQ | **0-Algorithm HQ** |
| Profit quota | **Engagement quota** |
| Credits ▮ (team) | Credits ▮ (unchanged name) |
| Kefal Coins ◈ (personal) | **Clout** ◈ |
| Kefal Dayı (black-market merchant) | **Modem Dayı** — old man with a CRT-monitor head (pixel face) |
| KEFAL OS (terminal) | **TFG OS** |
| Fired | **Deplatformed** (keep "FIRED" as the big word, add "YOU HAVE BEEN DEPLATFORMED") |
| Employee ranks | Lurker, Newbie, Poster, Regular, Moderator, Admin, Influencer, Viral, Main Character, Internet Legend |
| Bestiary field notes by "Sigurd Kefaloğlu" | field notes by "u/throwaway_janitor" |

## Moons (ids unchanged)
| id | New name | Short | Flavor |
|---|---|---|---|
| hq | 0-Algorithm HQ | HQ | Where content is sold. The Algorithm hungers. |
| hamsi | 56K-Dialup | Dialup | Rolling hills of the early web. A small abandoned web host. |
| lufer | 12-Forum | Forum | Swampy old message board. Ponds full of phish. |
| palamut | 33-Guestbook | Guestbook | Frozen personal homepage manor. Trolls roam at night. |
| levrek | 88-Chatroom | Chatroom | Red desert of dead chatrooms. Something digs under the sand. |
| cipura | 666-Creepypasta | Creepypasta | Storm-battered moor. A haunted homepage. Elites roam. |
| orkinos | 404-Not Found | 404 | Black forest under a dead sun. Everything lives here. |

Interiors: factory → **Data Center**, mansion → **Haunted Homepage**, mineshaft → **Deep Web Mine**.

## Creatures (ids unchanged)
| id | New name | Hook |
|---|---|---|
| scuttler | Spam Bot | swarms, cheap XP |
| yoinker | Data Hoarder | steals scrap to its nest ("Yippee!") |
| crawler | Web Crawler | charges in straight lines |
| lurker | Lurker | stalks behind you; look at it and it backs off |
| mannequin | NPC | only moves when nobody is looking |
| sludge | AI Slop | slow unkillable blob; calmed by music |
| jester | Pop-up | winds up a jingle, then chases everyone |
| spider | Web Spider | webs + ambush |
| leech | Leecher | drops on your head from the ceiling |
| screamer | Screamer | invisible until lit; its scream stuns |
| mimic | Deepfake | wears a crewmate's face and voice |
| hound | Troll | blind, hunts by sound (don't feed it) |
| giant | Influencer | huge, wants you in its content |
| sandkefal | The Worm | computer worm under the sand |
| turret | Firewall Turret | disable with terminal code |
| mine | Clickbait Mine | click. don't step off. |
| mimicdoor | Fake Exit (Dark Pattern) | not every EXIT is real |
| skeleton | Dead Account | still online |
| robot | Captcha Bot | "prove you are human" — punches |
| foreman (boss) | **THE ADMIN** | ban-hammer boss |

## Items (display names; ids unchanged)
Scrap: bolt=Old Router · axle=Server Blade · bell=Notification Bell · register=Ad Revenue Machine ·
goldbar=Gold Subscriber Plaque · duck=Rubber Debug Duck · robot=Chatbot Toy · lamp=Lava Lamp ·
canned=Energy Drink · figurine=Shiba Figurine · mug=Mod's Mug · teeth=Chattering Teeth ·
airhorn=MLG Airhorn · clownhorn=Clown Horn · painting=Cursed Image · pickles=Jar of Pickles ·
bottles=Energy Drink Pack · trophy=Participation Trophy · perfume=Clout Cologne · flask=Suspicious Liquid ·
cog=Loading Spinner · phone=Brick Phone · pot=Cooking Pot · steering=Gamer Wheel · tv=CRT Monitor ·
magnify=Clickbait Lens · skull=Skull Emoji · ring=Verified Ring · reactor=Main Server Core.
Big: vase=Vaporwave Bust · statue=Shiba Statue · amphora=Retro Console · server=Server Rack · aquarium=Screensaver Aquarium.
Fishing ("PHISHING"): fish_kefal=Catfish · fish_lufer=Boosted Bass · fish_levrek=Clickbait Trout ·
fish_golden=Golden Phish · fish_boot=Old Boot · fish_eel=Glitch Eel.
Drops: drop_scuttler=Spam Chip · drop_spider=Web Silk · drop_crawler=Crawler Claw · drop_hound=Troll Fang ·
drop_lurker=Lurker Mask · drop_giant=Influencer Tooth.
Weapons/tools keep their names except: harpoon="Report Harpoon", shotgun="Double Barrel", rod="Phishing Rod".
Cosmetics: hat 'kefal' → **Cat Ears**, suit 'kefal' → **Glitch** (RGB noise suit).

## Minigames
| Old | New |
|---|---|
| KEFAL JUMP (arcade) | **PACKET JUMP** — a little envelope/data packet flapping through firewalls |
| Fishing | **PHISHING** — catch phish |
| KEFAL CASINO slots | **GACHA MACHINE** — symbols: like, heart, fire, skull 💀, crown, 7, golden like (jackpot) |
| Vault keypad | Password cracker (same mechanics) |
| Fuse box | Router rewiring (same mechanics) |

## Visual identity
Logo: **TFG** in chunky pixel type with a small "wifi eye" glyph (an eye whose iris is a wifi
symbol). Palette stays amber-on-dark + terminal green, add hot magenta as an accent for "viral" moments.
Posters: "ENGAGEMENT IS LOVE", "THE ALGORITHM IS WATCHING", "DO NOT FEED THE TROLLS", "404: SAFETY NOT FOUND",
"LIKE. SHARE. SURVIVE.", missing-person poster "HAVE YOU SEEN THIS MODERATOR?".
