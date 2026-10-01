# Temporary expedition / permanent Collection boundary

Actual final QA reported Company coins 50 → 200, with credits/XP/level unchanged. The permanent Codex recorded `deadletter24` and `mutedswitch24`, then paid `int_2` Explorer (150 coins, no XP). Native creature death already suppressed campaign kill rewards; this was interior discovery through the unconditional Collection update callback.

Collection now skips recording/evaluation while the expedition is active, phase is `deadletter`, or the still-installed facility carries the explicit `dl24Token` temporary ownership marker. The latter protects asynchronous exit transition frames. Temporary card-stack items are separately excluded. Skipped updates preserve evaluation time, discovery keys and seen-item state; no profile rollback or global currency freeze is used. Normal campaign discovery and milestone rewards resume after the real campaign facility replaces the temporary one.

`tools/harness/collection.test.mjs` installs actual Collection, Achievements and Progress. Its old-boundary negative control reproduces +150/no XP from two temporary themes. The fixed module leaves Codex and coins unchanged, including phase-first exit frames and temporary item callbacks. The normal `letterfield24` / `switchfield24` destinations use the same interior themes without the ownership marker and still record discoveries and pay exactly 150 after exit. The fixture dispatches Collection updates separately from independent daily-login rewards, while retaining the native achievement grant and currency methods. Focused test passed.

The observed Occultist guide timestamp predates the temporary interior timestamps; no mode-induced role/progression producer was demonstrated. No claim of such a leak is made.
