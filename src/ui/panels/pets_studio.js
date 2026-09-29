// PET studio (polish4): a tiny private WebGL renderer for the PET panel - a rotating "turntable" of the selected pet plus small portraits for the stable list.
// Own scene / own lights (never touches the game scene, so the constant light count is untouched); one context, disposed with the panel.
import * as THREE from 'three';
import { createPetModel } from '../../models/pets.js';
import * as C from '../../game/pets_core.js';

const skinOf = (pet) => ({ c: pet.sk?.c, h: pet.sk?.h, v: pet.sk?.v, s: pet.sk?.s });
export const petSig = (pet) => `${pet.sp}|${C.stageOf(pet)}|${pet.sh ? 1 : 0}|${pet.sk?.c}|${pet.sk?.h}|${pet.sk?.v}|${pet.sk?.s}`;

export function createPetStudio(size = 210) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size; canvas.className = 'pt-studio';
  let renderer = null, model = null, raf = 0, dead = false, sig = '', last = 0, cur = null;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, preserveDrawingBuffer: true, powerPreference: 'low-power', stencil: false });
    renderer.setPixelRatio(1); renderer.setSize(size, size, false); renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
  } catch (e) { console.warn('[pets] studio unavailable', e); renderer = null; }
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x6a5a48, 1.6));
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.0); sun.position.set(2.5, 4, 3); scene.add(sun);
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.66, 0.05, 20), new THREE.MeshLambertMaterial({ color: 0x2a1c10 }));
  floor.position.y = -0.03; scene.add(floor);
  const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 30);
  const holder = new THREE.Group(); scene.add(holder);

  function setModel(pet) {
    if (!renderer || !pet) return false;
    const s = petSig(pet);
    if (s === sig && model) return true;
    sig = s;
    if (model) { holder.remove(model.root); try { model.dispose(); } catch { /* */ } model = null; }
    try { model = createPetModel(pet.sp, C.stageOf(pet), { shiny: !!pet.sh, skin: skinOf(pet) }); } catch (e) { console.warn('[pets] studio model', e); return false; }
    holder.add(model.root);
    holder.rotation.y = 0.6;
    const box = new THREE.Box3().setFromObject(model.root), sz = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
    const h = Math.max(sz.y, sz.x * 0.8, sz.z * 0.8, 0.1);
    const k = 0.95 / h;                                    // fit ~0.95 m of pet into the frame
    model.root.scale.multiplyScalar(k);
    model.root.position.set(-ctr.x * k, -box.min.y * k, -ctr.z * k);
    cam.position.set(0, 0.62, 2.35); cam.lookAt(0, 0.44, 0);
    return true;
  }
  function draw(dt) {
    if (!renderer || !model) return;
    try { model.update?.(dt, { anim: 'idle', speed: 0, mood: cur ? C.moodOf(cur) : 'happy' }); } catch { /* cosmetic */ }
    renderer.render(scene, cam);
  }
  function loop(now) {
    if (dead) return;
    raf = requestAnimationFrame(loop);
    if (!canvas.isConnected) return;                        // panel closed / re-rendering: idle until it is back (dispose() ends the loop)
    const dt = Math.min(0.1, last ? (now - last) / 1000 : 0.016); last = now;
    holder.rotation.y += dt * 0.9;
    draw(dt);
  }
  return {
    canvas, ok: !!renderer,
    show(pet) { cur = pet; return setModel(pet); },
    start() { if (renderer && !raf && !dead) raf = requestAnimationFrame(loop); },
    /** small still portrait of a pet (data URL, '' when the studio is unavailable) */
    portrait(pet, px = 64) {
      if (!renderer || !pet) return '';
      const keep = { cur, sig, rot: holder.rotation.y };
      try {
        if (!setModel(pet)) return '';
        holder.rotation.y = 0.5;
        cur = pet; draw(0.016);
        const c2 = document.createElement('canvas'); c2.width = c2.height = px;
        c2.getContext('2d').drawImage(canvas, 0, 0, px, px);
        return c2.toDataURL('image/png');
      } catch { return ''; }
      finally { cur = keep.cur; holder.rotation.y = keep.rot; }
    },
    dispose() {
      dead = true; if (raf) cancelAnimationFrame(raf); raf = 0;
      if (model) { try { model.dispose(); } catch { /* */ } model = null; }
      try { floor.geometry.dispose(); floor.material.dispose(); } catch { /* */ }
      if (renderer) { try { renderer.dispose(); renderer.forceContextLoss(); } catch { /* */ } renderer = null; }
      canvas.remove();
    },
  };
}
