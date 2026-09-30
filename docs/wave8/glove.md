# glove: first-person hand fix (wave 8)
Problem: light-grey mitten + fat sleeve filled the bottom-right (docs/wave8/qa_shots/shotfix_torch.jpg).
Change (src/models/avatar.js createViewModel, VM_REST, VM_ARM):
- glove dark work glove #26282c (was A2.GLOVE light grey), smaller (sphere 0.05 vs 0.062); cuff is now a separate ring in the SUIT material (setSuitColor / outfits still recolour it).
- sleeve radii 0.088/0.076 -> 0.07/0.06 (upper), 0.074/0.064 -> 0.058/0.05 (forearm); VM_ARM rFore/rUpper reduced to match so the grip pushout solver stays consistent.
- rest pose onehand/none base 0.26,-0.42 -> 0.27,-0.42 (a touch right; lower moved medkit off-screen in fpbody_offline, so y kept).
- item grip offsets untouched: tools/harness/fpbody_offline.mjs still reports bad=3 (same 3 as before, 0 penetration/behind-camera).
Shots: tools/harness/glove_shots.js -> glove_torch/shovel/scrap.jpg. Tests: artpass, shotfix, cosm5, feel, fpbody_offline/body_offline.
