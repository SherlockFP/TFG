// LABYR12 echo shell (Dark Web): ONE LineSegments mesh built once from the facility layout, drawn only by sonar pulses.
//   geometry  every closed wall edge of every floor cell as a 1 m wireframe grid (5 verticals + 5 horizontals), a 2 m floor grid, doorway outlines (amber tell)
//   shader    up to 4 pulses { x, y, z, age, radius }: a line is lit when the wave front has reached it (front = age * speed), the leading ring is the brightest, everything
//             behind it fades with age and range. depthTest on (walls hide what is behind them), additive, no fog, no lights: constant scene cost, ONE draw call.
//   runtime   lab.echo.setPulses([{ x, y, z, age, radius }]) every frame (game/labyr12.js); nothing else touches it.
import * as THREE from 'three';
import { layoutKit } from './common.js';
import { KNOCK } from '../../game/labyr12_core.js';

const INWARD = [[-1, 0], [0, -1], [1, 0], [0, 1]];
const OFF = 0.045;                                    // lines float this far in front of the wall (depth test vs the real wall mesh)

const VERT = `
attribute float aKind;
varying vec3 vW; varying float vKind;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vKind = aKind; gl_Position = projectionMatrix * viewMatrix * w; }`;
const FRAG = `
uniform vec4 uP[4]; uniform float uR[4]; uniform float uLife; uniform float uSpeed;
varying vec3 vW; varying float vKind;
void main() {
  float lit = 0.0, ringMax = 0.0;
  for (int i = 0; i < 4; i++) {
    float age = uP[i].w;
    if (age < 0.0 || age >= uLife) continue;
    float front = min(uR[i], age * uSpeed);
    float d = distance(vW, uP[i].xyz);
    if (d > front + 1.4) continue;
    float k = 1.0 - age / uLife;
    float fade = k * k;
    float ring = exp(-((d - front) * (d - front)) / 2.4);
    float body = d <= front ? 0.5 * (1.0 - min(1.0, d / uR[i])) : 0.0;
    lit = max(lit, (ring * 1.2 + body) * fade);
    ringMax = max(ringMax, ring * fade);
  }
  if (lit < 0.02) discard;
  vec3 base = vKind > 0.5 ? vec3(1.0, 0.62, 0.16) : vec3(0.16, 0.95, 0.85);      // amber = doorway, cyan = wall
  vec3 col = mix(base, vec3(1.0), clamp(ringMax * 0.8, 0.0, 0.85));
  gl_FragColor = vec4(col * min(1.0, lit) , 1.0);
}`;

/**
 * Build the echo shell for a facility layout. ctx: { layout, Y }. Returns { mesh, mat, segments, setPulses(list), dispose() }.
 * Deterministic and layout-only (no rng); ~10 segments per wall edge.
 */
export function buildEcho(ctx) {
  const L = ctx.layout, K = layoutKit(L), Y = ctx.Y, C = K.C;
  const P = [], KD = [];
  const seg = (ax, ay, az, bx, by, bz, kind = 0) => { P.push(ax, ay, az, bx, by, bz); KD.push(kind, kind); };
  let walls = 0, doors = 0;
  for (let z = 0; z < K.H; z++) for (let x = 0; x < K.W; x++) {
    const i = L.idx(x, z);
    if (!L.cells[i]) continue;
    const h = L.heightOf[i] || L.corridorH || 3.2, x0 = K.wx(x), z0 = K.wz(z);
    // floor grid: two lines each way (a 2 m lattice), lit like a scanned floor
    for (const u of [1, 3]) { seg(x0 + u, Y + 0.03, z0, x0 + u, Y + 0.03, z0 + C); seg(x0, Y + 0.03, z0 + u, x0 + C, Y + 0.03, z0 + u); }
    for (let d = 0; d < 4; d++) {
      const k = K.ek(x, z, d), nx = x + [1, 0, -1, 0][d], nz = z + [0, 1, 0, -1][d];
      const info = L.edgeInfo.get(k);
      const open = L.open.has(k) && K.inb(nx, nz) && L.cells[L.idx(nx, nz)];
      if (open && !info) continue;                                    // plain opening between two cells: nothing to draw
      const [ex, ez] = K.edgeCenter(x, z, d), [ix, iz] = INWARD[d];
      const tx = d % 2 === 0 ? 0 : 1, tz = d % 2 === 0 ? 1 : 0;       // along the wall
      const px = ex + ix * OFF, pz = ez + iz * OFF;
      const at = (u, y) => [px + tx * u, Y + y, pz + tz * u];
      if (info) {                                                     // doorway: amber frame (posts + lintel) and the sill
        const w = (info.width || 2.6) / 2, dh = Math.min(h - 0.1, info.doorH || 2.5);
        for (const s of [-1, 1]) { const a = at(s * w, 0.03), b = at(s * w, dh); seg(...a, ...b, 1); }
        seg(...at(-w, dh), ...at(w, dh), 1); seg(...at(-w, 0.03), ...at(w, 0.03), 1);
        doors++;
        if (open) continue;                                           // arches / open doors: only the frame; a shut door also shows its wall grid below
      }
      walls++;
      for (const u of [-C / 2 + 0.03, -1, 0, 1, C / 2 - 0.03]) seg(...at(u, 0.03), ...at(u, h - 0.03));
      for (const f of [0.03, h * 0.25, h * 0.5, h * 0.75, h - 0.03]) seg(...at(-C / 2, f), ...at(C / 2, f));
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('aKind', new THREE.Float32BufferAttribute(KD, 1));
  geo.userData.shared = false;
  const uP = Array.from({ length: 4 }, () => new THREE.Vector4(0, 0, 0, -1));
  const uR = [26, 26, 26, 26];
  const mat = new THREE.ShaderMaterial({
    uniforms: { uP: { value: uP }, uR: { value: uR }, uLife: { value: KNOCK.life }, uSpeed: { value: KNOCK.speed } },
    vertexShader: VERT, fragmentShader: FRAG,
    transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, fog: false,
  });
  const mesh = new THREE.LineSegments(geo, mat);
  mesh.name = 'dw_echo'; mesh.frustumCulled = false; mesh.matrixAutoUpdate = false; mesh.renderOrder = 3; mesh.userData.noMerge = true; mesh.userData.setPiece = true;
  ctx.group.add(mesh);
  return {
    mesh, mat, segments: P.length / 6, walls, doors,
    /** pulses = [{ x, y, z, age, radius }] (max 4, extras ignored); unused slots are switched off (age -1) */
    setPulses(list) {
      for (let i = 0; i < 4; i++) {
        const p = list[i];
        if (p) { uP[i].set(p.x, p.y, p.z, p.age); uR[i] = p.radius; } else uP[i].w = -1;
      }
    },
    dispose() { try { geo.dispose(); mat.dispose(); } catch { /* gone */ } },
  };
}
