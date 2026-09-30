# Wave16 Archive Intake readability

Wave15's natural sale camera made the folded receipt dominate the frame and crop its drum, while the counter body and usable tray were too dark. This pass changes only the static visual layer in `src/world/port14.js`.

The intake body and tray now use two dedicated muted mint-gray Lambert materials with a small emissive floor. This improves their visibility without adding lights or changing the palette elsewhere. The receipt drum is lower, smaller and offset to the right; its ribbon is narrower and shorter, leaving the center of the usable tray readable. The existing staffed window and localized archive signs remain.

All physical counter, bell, drop-zone, booth and bin geometry is unchanged. Map colliders, all four vessel approaches, sale accounting, pending receipt hook, map disposal and the company's 17 pooled emitters retain their existing contracts. The two new material keys add at most two static batches; no texture or dynamic light is added.

Validation: `source /workspace/.tfg-tools/activate.sh; node tools/harness/world15.test.mjs` passed actual builder collision corridors, all four hull routes, real Rapier capsule approach, clerk access, real host sale accounting, empty-tray repeat prevention, receipt processing and lifecycle disposal.

Shared QA captured `/tmp/tfg-qa16/05-intake-matched.png` at the established sale camera. Parent visual inspection confirms a clearer tray/body and a receipt mechanism entirely visible on the right. The touchdown overlay was still active, so this image supports surface readability and reduced cropping rather than a clean, unobstructed composition claim. Native gameplay also verified an actual E-triggered copper sale: raw value 30 at 34% produced exactly 10 in the ledger. No source changes were needed after this check.
