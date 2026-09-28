// Load every model in public/assets/ext/manifest.json with three.js' GLTFLoader (in Node, textures
// stripped since there is no image decoder) and check: parses, animation names match the manifest,
// bounding box ~ manifest size, origin at bottom-center.
//   node tools/assets/validate_glb.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/assets/ext/manifest.json'), 'utf8'));

function stripTextures(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const jsonLen = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(buf.subarray(20, 20 + jsonLen)));
  delete json.images; delete json.textures; delete json.samplers;
  for (const m of json.materials || []) {
    if (m.pbrMetallicRoughness) { delete m.pbrMetallicRoughness.baseColorTexture; delete m.pbrMetallicRoughness.metallicRoughnessTexture; }
    delete m.normalTexture; delete m.emissiveTexture; delete m.occlusionTexture;
  }
  let js = new TextEncoder().encode(JSON.stringify(json));
  const pad = (4 - (js.length % 4)) % 4;
  const jsPadded = new Uint8Array(js.length + pad).fill(0x20); jsPadded.set(js);
  const rest = buf.subarray(20 + jsonLen);
  const out = new Uint8Array(12 + 8 + jsPadded.length + rest.length);
  const odv = new DataView(out.buffer);
  out.set(buf.subarray(0, 12)); odv.setUint32(8, out.length, true);
  odv.setUint32(12, jsPadded.length, true); odv.setUint32(16, 0x4E4F534A, true);
  out.set(jsPadded, 20); out.set(rest, 20 + jsPadded.length);
  return out.buffer;
}

const loader = new GLTFLoader();
let bad = 0;
for (const m of manifest.models) {
  const buf = fs.readFileSync(path.join(ROOT, 'public', m.path));
  try {
    const gltf = await loader.parseAsync(stripTextures(buf), '');
    const scene = gltf.scene;
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scene, true);
    const size = box.getSize(new THREE.Vector3());
    const names = gltf.animations.map((a) => a.name);
    const issues = [];
    if (JSON.stringify(names) !== JSON.stringify(m.animations)) issues.push(`anims ${names} != ${m.animations}`);
    const d = [size.x - m.size[0], size.y - m.size[1], size.z - m.size[2]].map(Math.abs);
    if (Math.max(...d) > 0.05 * Math.max(...m.size) + 0.02) issues.push(`size ${size.toArray().map((v) => v.toFixed(2))} vs ${m.size}`);
    if (Math.abs(box.min.y) > 0.03 * size.y + 0.01) issues.push(`minY ${box.min.y.toFixed(3)}`);
    const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
    if (Math.abs(cx) > 0.03 * size.x + 0.01 || Math.abs(cz) > 0.03 * size.z + 0.01) issues.push(`center ${cx.toFixed(2)},${cz.toFixed(2)}`);
    if (issues.length) { bad++; console.log('WARN', m.id, issues.join('; ')); }
  } catch (e) {
    bad++; console.log('FAIL', m.id, e.message);
  }
}
console.log(`checked ${manifest.models.length} models, ${bad} with warnings/failures`);
