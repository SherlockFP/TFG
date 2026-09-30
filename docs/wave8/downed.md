# Downed (wave 8, module `src/game/downed.js`)

Owner decision: no instant death by default. 0 HP puts you DOWN; a crewmate gets you up; only a bleed-out is death. True one-hit kills exist on Hard only.

## Rules (numbers in `RULES`)
| | Casual | Standard | Hard |
|---|---|---|---|
| Lethal hit | down | down | dies (module does nothing) |
| Bleed-out | 30 s | 20 s | - |
| Second down within 60 s | duration x0.5 (15 s) | x0.5 (10 s) | - |
| Revive | hold E 3 s, back at 30 % HP | same | - |

* Downed: crawl 0.9 m/s, no jump/sprint, eye 0.45 m, no item use / hotbar / interact (`game.localActions` skipped, `useItem` handled), audio lowpass 620 Hz, red pulsing vignette, hp pinned to 1 (low-HP heartbeat plays), bleed bar + hint in the bottom dock.
* Damage while down is ignored; creatures also stop targeting you (`game.aiPlayers` reports downed players as dead). True deaths stay instant: `void`, `left` (locked out), `ejected`, `sandkefal`, `giant` (`TRUE_DEATH`).
* Reviver: aim at the body (prompt `HOLD [E] TO REVIVE`), hold 3 s within 2.6 m. Being hit (`localHurt`) resets progress. One reviver at a time; letting go drains progress 1.5/s; bleeding pauses while held. Everybody sees a marker with name, bleed seconds and a progress ring over the downed player.
* Solo (no crewmate who is alive and not down): one self-revive per landing when a medkit or adrenaline is carried (consumed, back at 30 %), otherwise death exactly as before.
* Solo self-stand-up (backlog 7): the FIRST down per landing when solo goes down normally (Standard 20 s / Casual 30 s bleed) and shows "Get up... hold [E]": holding E `RULES.selfS` = 6 s (damage resets it, creatures still ignore you) sends `dnreq {k:'self'}`; host re-checks nobody else is up and broadcasts `up` at `selfHp` 25 %. A second solo down in the same landing = the medkit path above, else death as before. Algorithm one-liner via `maybeSay`. Not offered while a crewmate is up. Test: 38 checks.
* Second Wind perk still triggers first. Ship reaching orbit picks everybody up at 50 %.
* Bleed-out: host sends `bleed`, the victim runs `game.die(cause)` with the original cause: loot drops, body item, spectator, ghost replay all as before.
* Balance: `balance_rules.instakillHere()` - the INSTAKILL_OK allowlist (jester, worm, mimic door, mine, ambusher) only kills in one hit on Hard; elsewhere those hits are capped like any other.

## Net (prefix `dn`)
* `dnreq` client -> host: `{k:'down',p,c}`, `{k:'hold',id}` (5 Hz while holding), `{k:'stop',id}`.
* `dn` host -> all (`msg:dn`, sender must be host): `on {id,dur,fast,p,c}`, `pg {id,p,by,l}`, `up {id,by,hp}`, `bleed {id,c}`, `clear`, `say {s,v}`.
* Pose: `ps` flags bit 64 (game.js netSend) -> remote avatar lies face-down (`remoteAvatar` hook).
* If the host never confirms a down within 3 s, the local player dies as before.

## Hooks for other systems
Mods events on every peer: `tfg:downed {id,name,cause,fast}`, `tfg:revived {id,name,by,self}`. The Algorithm says one line (`game.lore.say`), at most once per 90 s (50 % on down, 40 % on revive). `game.downed.isDowned(id?)`.

## Shared-file edits
`localplayer.js` (crouch/sprint/speed/jump/eye, 5 one-line changes on `this.downed`), `game.js` (import + slot + flag 64), `balance_rules.js` + `balance.js` (`instakillHere`).

## Test
`node tools/harness/downed.test.mjs` (31 checks: rules, DownBook, glue on a stub game), plus balance_rules, hardmode_install/rules, gameplay2, movefix, `npm run build`. Manual: two players, let a creature take you to 0 HP; second player looks at you and holds E.

## Known gaps
No creature dragging; Revive Pulse / healing does not stand you up; medic has no faster hold; marker only shows on screen (no off-screen arrow); pose, ring HUD and audio muffle were not seen in a browser.
