// QA night 2, run D: creature eye tells in the dark, ONE TYPE AT A TIME with heap logs (the 4-at-once version killed the renderer: 6.5 GB, OOM).
//   bash run.sh d "/?autohost=local&code=T4&name=Tester"     (prepend qa_night2_lib.js)
const mem = () => Math.round((performance.memory?.usedJSHeapSize || 0) / 1e6);
const lg = (m) => console.log('QA: ' + m + ' heapMB=' + mem());
await step('land', () => land('hamsi', false));
await step('room', async () => { const s = await toRoom((r) => r.type !== 'entrance'); return s && s.type; });
const SEQ = [['hound', true], ['scuttler', false], ['hound', false], ['stalker', false], ['mannequin', false], ['crawler', false]];   // [type, creatureRead disabled]
const CR = g.creatureRead;
for (const [ty, off] of SEQ) {
  await step('eye_' + ty + (off ? '_noread' : ''), async () => {
    g.creatureRead = off ? null : CR; console.log('QA: creatureRead ' + (off ? 'OFF' : 'on'));
    lg('spawn ' + ty); R['sp_' + ty + off] = eyeSpawn([ty]); await sleep(200);
    lg('spawned; ticking'); for (let i = 0; i < 6; i++) { kefal.tick(5, 1 / 30, false); await sleep(20); }
    lg('ticked 30'); const fz = freezeCreatures([ty]); R['fz_' + ty + off] = fz; lg('frozen ' + JSON.stringify(fz));
    try {
      const sc = g.scene, lights = []; sc.traverse((o) => { if (o.isLight) lights.push(o.type); }); R['lights_' + ty] = lights.length;
      const v = [...g.creatures.views.values()].find((x) => x.type === ty);
      if (v) {
        const info = []; let bad = 0, big = 0, n = 0, maxScale = 0;
        v.root.traverse((o) => { n++; const sc3 = o.scale; if (![sc3.x, sc3.y, sc3.z, o.position.x, o.position.y, o.position.z].every(Number.isFinite)) bad++; maxScale = Math.max(maxScale, Math.abs(sc3.x), Math.abs(sc3.y), Math.abs(sc3.z)); if (o.geometry) { o.geometry.computeBoundingSphere?.(); const r = o.geometry.boundingSphere?.radius; if (!(Number.isFinite(r)) || r > 50) big++; } });
        R['view_' + ty] = { nodes: n, bad, big, maxScale: +maxScale.toFixed(2), pos: v.pos && [v.pos.x, v.pos.y, v.pos.z].map((x) => +x.toFixed(1)), state: v.state, tell: v.model?.parts?.tellKind, root: [v.root.position.x, v.root.position.y, v.root.position.z, v.root.scale.x].map((x) => +x.toFixed(2)) };
      } else R['view_' + ty] = 'no view';
      const inf = g.engine.renderer.info; R['info_' + ty] = { calls: inf.render.calls, tris: inf.render.triangles, geos: inf.memory.geometries, tex: inf.memory.textures, progs: inf.programs?.length };
      console.log('QA: INSPECT ' + ty + ' ' + JSON.stringify({ l: R['lights_' + ty], v: R['view_' + ty], i: R['info_' + ty] }));
    } catch (e) { console.log('QA: inspect err ' + String(e).slice(0, 120)); }
    kefal.tick(1, 1 / 30, true); lg('one frame rendered'); await sleep(300);
    kefal.tick(2, 1 / 30, true); lg('three frames rendered');
    await shot('n2_eye_' + ty + (off ? '_noread' : '') + '.jpg'); lg('shot ' + ty);
    for (const c of [...g.creatures.host.values()]) { try { c.hp = 0; c.dead = true; g.creatures.host.delete(c.id); } catch { /* ignore */ } }
    kefal.tick(5, 1 / 30, false); lg('cleaned');
  });
}
R.errs = 'see LOGS';
return R;
