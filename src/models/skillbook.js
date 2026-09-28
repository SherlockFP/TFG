// Procedural skillbook: a thick grimoire (tier-coloured cover, cream pages, brass corners, glowing rune on the cover).
// Used as the item model (and therefore the inventory icon) of every skillbook_<spell> item.

/** THREE is passed in (mod-model signature: fn(THREE) -> Object3D). */
export function createSkillbookModel(THREE, { cover = 0x6a3fb0, rune = 0xbfe4ff, glyph = 0 } = {}) {
  const root = new THREE.Group();
  root.name = 'skillbook';
  const lam = (c, extra = {}) => new THREE.MeshLambertMaterial({ color: c, ...extra });
  const W = 0.24, H = 0.07, D = 0.32;
  const coverMat = lam(cover);
  const dark = lam(new THREE.Color(cover).multiplyScalar(0.55).getHex());
  // covers + spine
  const top = new THREE.Mesh(new THREE.BoxGeometry(W, 0.014, D), coverMat); top.position.y = H / 2 - 0.007; root.add(top);
  const bot = new THREE.Mesh(new THREE.BoxGeometry(W, 0.014, D), coverMat); bot.position.y = -H / 2 + 0.007; root.add(bot);
  const spine = new THREE.Mesh(new THREE.BoxGeometry(0.02, H, D), dark); spine.position.x = -W / 2 + 0.01; root.add(spine);
  // pages (slightly inset)
  const pages = new THREE.Mesh(new THREE.BoxGeometry(W - 0.03, H - 0.026, D - 0.02), lam(0xe9dcc0));
  pages.position.x = 0.008; root.add(pages);
  // brass corners
  const brass = lam(0xc89a3a);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const sy of [-1, 1]) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.018, 0.036), brass);
    c.position.set(sx * (W / 2 - 0.016), sy * (H / 2 - 0.007), sz * (D / 2 - 0.016));
    root.add(c);
  }
  // clasp
  const clasp = new THREE.Mesh(new THREE.BoxGeometry(0.03, H + 0.006, 0.05), brass); clasp.position.x = W / 2 - 0.004; root.add(clasp);
  // glowing rune on the cover (unlit = reads as emissive under the PSX pipeline; no light is added)
  const runeMat = new THREE.MeshBasicMaterial({ color: rune });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.052, 0.066, 12), runeMat);
  ring.rotation.x = -Math.PI / 2; ring.position.y = H / 2 + 0.0015; root.add(ring);
  const bars = [[0, 0, 0.012, 0.09], [0, 0, 0.09, 0.012]];
  if (glyph % 2) bars.push([0, 0.028, 0.06, 0.01]);
  if (glyph % 3 === 0) bars.push([0.024, -0.02, 0.01, 0.05]);
  for (const [x, z, w, d] of bars) {
    const b = new THREE.Mesh(new THREE.PlaneGeometry(w, d), runeMat);
    b.rotation.x = -Math.PI / 2; b.rotation.z = glyph * 0.4; b.position.set(x, H / 2 + 0.002, z); root.add(b);
  }
  root.userData.rune = runeMat;
  return root;
}
