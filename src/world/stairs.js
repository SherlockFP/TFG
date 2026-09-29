// Shared STAIR + LADDER helper (wave 5 "stairs", MASTERPLAN 25.10).
//
// Why: stepped box colliders stall Rapier's autostep whenever the player presses sideways into a wall / rail
// (the usual case in a narrow stairwell): reproduced in tools/harness/stairs.test.mjs (old stepped stairs make
// 0 progress at 5 m/s with a 0.3 lateral input, the ramp reaches the top). So every stair now has
//   * VISUAL steps (full-column boxes, no collider) - the builder draws them into its own merged mesh,
//   * ONE inclined ramp collider (Rapier cuboid, pitched) whose slope is below the character controller's
//     max climb angle (src/physics/physics.js createController: 50 deg climb, 60 deg slide, autostep 0.42),
//   * flat landing slabs at the bottom / top (flush with the ramp ends, so no lip at all),
//   * a few coarse "skirt" boxes under the ramp so nobody walks into the hollow below the visual steps.
// Pure math (no three / rapier import): planStairs() works in a builder-local frame, colliders are handed to the
// caller as boxes { cx, cy, cz, sx, sy, sz } (+ q = quaternion for the ramp). physics.addStaticBox accepts a
// quaternion object in place of rotY, so existing `addBox(x, y, z, sx, sy, sz, rot)` callbacks pass it through.

/** Real limits of the local player controller (src/physics/physics.js createController, src/entities/localplayer.js). */
export const LIMITS = { stepHeight: 0.42, maxSlopeDeg: 50, slideDeg: 60, radius: 0.34, height: 1.8, walk: 5.0, sprint: 8.2 };
/** we design below this (safety margin under the 50 deg controller limit) */
export const DESIGN_MAX_SLOPE_DEG = 47;

const DEG = 180 / Math.PI;
const r3 = (v) => Math.round(v * 1000) / 1000;

/** test hook: when globalThis.__TFG_STAIR_LOG is an array every planned stair is pushed there */
function logPlan(p) { try { const l = globalThis.__TFG_STAIR_LOG; if (Array.isArray(l)) l.push(p); } catch { /* no global */ } }

const DIRS = { 'x+': [1, 0], 'x-': [-1, 0], 'z+': [0, 1], 'z-': [0, -1] };

/** quaternion for "yaw about Y by `yaw`" composed with "pitch up by `pitch` about local X" (+z local rises) */
export function rampQuat(dx, dz, pitch, frameRot = 0) {
  const th = Math.atan2(dx, dz) + frameRot;
  const hy = th / 2, hp = -pitch / 2;
  const sy = Math.sin(hy), cy = Math.cos(hy), sp = Math.sin(hp), cp = Math.cos(hp);
  // q = qY(th) * qX(-pitch)
  return { x: cy * sp, y: sy * cp, z: -sy * sp, w: cy * cp };
}

/**
 * Plan one straight flight in a local frame.
 * o: { x, z       bottom-edge centre of the flight (where the first step begins)
 *      y          floor height at the bottom (top of the floor the player stands on)
 *      dir        'x+' | 'x-' | 'z+' | 'z-' (direction of climbing)
 *      width      clear width, rise total height gained, run total horizontal length
 *      n          number of visual steps (default: ~0.2 m risers)
 *      baseY      bottom of the visual step columns (default y)
 *      landing    length of the flat landing slabs (default 0.6; 0 = none), bottomLanding / topLanding: false to skip one
 *      th         ramp / landing thickness (0.2)
 *      skirt      false to leave the hollow below the ramp open (open catwalk stairs) }
 * Returns { steps, ramp, boxes, slopeDeg, riser, tread, ... }; steps are visuals only.
 */
export function planStairs(o) {
  const dir = Array.isArray(o.dir) ? o.dir : DIRS[o.dir];
  if (!dir) throw new Error('stairs: bad dir ' + o.dir);
  const [dx, dz] = dir;
  const { x, z, y, width, rise, run } = o;
  const n = Math.max(1, o.n || Math.round(rise / 0.2));
  const th = o.th ?? 0.2, landing = o.landing ?? 0.6, baseY = o.baseY ?? y;
  const riser = rise / n, tread = run / n;
  const pitch = Math.atan2(rise, run), len = Math.hypot(run, rise);
  const axisX = dx !== 0;
  const at = (a) => [x + dx * a, z + dz * a];                                  // point at `a` metres along the flight
  const box = (a0, a1, yb, yt, w, kind) => {                                   // AABB spanning along a0..a1, y yb..yt
    const [cx, cz] = at((a0 + a1) / 2), l = Math.abs(a1 - a0);
    return { kind, cx: r3(cx), cy: r3((yb + yt) / 2), cz: r3(cz), sx: r3(axisX ? l : w), sy: r3(yt - yb), sz: r3(axisX ? w : l) };
  };
  const steps = [];
  for (let i = 0; i < n; i++) {
    const top = y + riser * (i + 1), b = box(tread * i, tread * (i + 1), baseY, top, width, 'step');
    steps.push({ ...b, y0: baseY, top });
  }
  // ramp: top surface runs from (0, y) to (run, y + rise); the cuboid hangs `th` below that surface
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const [mx, mz] = at(run / 2), my = y + rise / 2;
  const ramp = {
    kind: 'ramp',
    cx: r3(mx + dx * sp * th / 2), cy: r3(my - cp * th / 2), cz: r3(mz + dz * sp * th / 2),   // centre = surface mid - normal * th/2
    sx: r3(width), sy: r3(th), sz: r3(len),                                   // local axes: x across, y thickness, z along the slope
    q: rampQuat(dx, dz, pitch, 0), pitch, len,
  };
  const boxes = [];
  if (landing > 0.01 && o.bottomLanding !== false) boxes.push(box(-landing, 0, y - th, y, width, 'landing'));
  if (landing > 0.01 && o.topLanding !== false) boxes.push(box(run, run + landing, y + rise - th, y + rise, width, 'landing'));
  if (o.skirt !== false) {
    const seg = Math.min(1.2, Math.max(0.5, 0.6 / Math.max(0.2, Math.tan(pitch))));
    const ns = Math.max(1, Math.ceil(run / seg)), drop = th / cp + 0.04;
    for (let k = 0; k < ns; k++) {
      const a0 = (run * k) / ns, a1 = (run * (k + 1)) / ns;
      const top = y + (rise * a0) / run - drop;                                // ramp underside at the low end of the segment
      if (top - baseY > 0.05) boxes.push(box(a0, a1, baseY, top, width, 'skirt'));
    }
  }
  const plan = {
    x, z, y, dir: [dx, dz], width, rise, run, n, riser: r3(riser), tread: r3(tread), th, landing,
    slopeDeg: pitch * DEG, steps, ramp, boxes,
    top: { y: y + rise, at: at(run), landing: landing > 0.01 && o.topLanding !== false },
    bottom: { y, at: at(0), landing: landing > 0.01 && o.bottomLanding !== false },
    tag: o.tag || null,
  };
  logPlan(plan);
  return plan;
}

/** local -> world for a frame rotation (same maths as worlds2_solids rot2 / three rotation.y) */
export const rot2 = (x, z, r) => { const c = Math.cos(r), s = Math.sin(r); return [x * c + z * s, -x * s + z * c]; };

/** ramp collider of a plan expressed in a yawed frame { x, z, rot }: returns args for addBox(x, y, z, sx, sy, sz, quat) */
export function rampWorld(plan, frame = { x: 0, z: 0, rot: 0 }) {
  const rp = plan.ramp, [wx, wz] = rot2(rp.cx, rp.cz, frame.rot);
  const q = frame.rot ? rampQuat(plan.dir[0], plan.dir[1], rp.pitch, frame.rot) : rp.q;
  return { x: frame.x + wx, y: rp.cy, z: frame.z + wz, sx: rp.sx, sy: rp.sy, sz: rp.sz, q };
}

/**
 * Emit a plan through callbacks: vis(step) for every visual step, col(box) for AABB colliders (landings, skirts),
 * ramp(rampBox) for the inclined collider (rampBox has q). Returns the number of colliders created.
 */
export function emitStairs(plan, { vis, col, ramp }) {
  if (vis) for (const s of plan.steps) vis(s);
  let n = 0;
  if (col) for (const b of plan.boxes) { col(b); n++; }
  if (ramp) { ramp(plan.ramp); n++; }
  return n;
}

/** height of the ramp surface at `a` metres along the flight (for tests / footstep logic) */
export function surfaceHeight(plan, a) { return plan.y + plan.rise * Math.min(1, Math.max(0, a / plan.run)); }

/**
 * Static checks for a plan. Returns a list of problems (empty = fine).
 * slope <= DESIGN_MAX_SLOPE_DEG, visual riser <= stepHeight, ramp flush with both landings (no lip),
 * width wide enough for the capsule, top platform present.
 */
export function checkStairs(plan, { needTopLanding = false } = {}) {
  const errs = [];
  if (!(plan.slopeDeg <= DESIGN_MAX_SLOPE_DEG)) errs.push(`slope ${plan.slopeDeg.toFixed(1)} > ${DESIGN_MAX_SLOPE_DEG}`);
  if (!(plan.riser <= LIMITS.stepHeight * 0.8)) errs.push(`riser ${plan.riser} > ${(LIMITS.stepHeight * 0.8).toFixed(2)}`);
  if (!(plan.width >= LIMITS.radius * 2 + 0.3)) errs.push(`width ${plan.width} too narrow`);
  // the ramp surface passes through (0, y) and (run, y+rise): entry / exit lips are 0 by construction; verify the numbers
  const rp = plan.ramp, cp = Math.cos(rp.pitch), sp = Math.sin(rp.pitch);
  const [dx, dz] = plan.dir;
  const along = (rp.cx - plan.x) * dx + (rp.cz - plan.z) * dz;               // ramp centre along the flight
  const surfMid = rp.cy + cp * plan.th / 2, surfAlong = along - sp * plan.th / 2;
  if (Math.abs(surfAlong - plan.run / 2) > 0.01 || Math.abs(surfMid - (plan.y + plan.rise / 2)) > 0.01) errs.push('ramp surface not through both landings');
  if (needTopLanding && !plan.top.landing) errs.push('no top landing');
  return errs;
}

// ------------------------------------------------------------------------------------------------ ladders
/**
 * A ladder = a climb volume (vertical cylinder r around x,z between y0 and top) + the direction the climber faces.
 * `face` is the unit horizontal vector from the climber towards the ladder. Same shape as archive.ladder.
 */
export function makeLadder({ x, z, y0, top, r = 0.6, face }) { return { x, z, y0, top, r, face }; }

/**
 * One frame of ladder climbing. st = { climbing }, in = { pos:{x,y,z}, yaw, up, down, grounded }.
 * Returns { inVol, climbing, vy } where vy is the vertical velocity to apply this frame (net of gravity) or null.
 * Rules: press up while facing the ladder inside the volume to grab it; up/down move at `speed`, release = hold;
 * stepping down onto the floor (y0 + 0.3) lets go; leaving the volume lets go.
 */
export function ladderStep(L, st, inp, speed, dt, gravity = 19.6) {
  const dxp = inp.pos.x - L.x, dzp = inp.pos.z - L.z;
  const inVol = Math.hypot(dxp, dzp) < L.r && inp.pos.y > L.y0 - 0.25 && inp.pos.y < L.top;
  if (!inVol) return { inVol: false, climbing: false, vy: null };
  let climbing = !!st.climbing;
  const fx = -Math.sin(inp.yaw), fz = -Math.cos(inp.yaw);
  if (!climbing && inp.up && fx * L.face.x + fz * L.face.z > 0.35) climbing = true;
  let vy = null;
  if (climbing) {
    vy = (inp.up ? speed : inp.down ? -speed : 0) + gravity * Math.min(dt, 1 / 20);   // cancels this frame's gravity: net = the climb speed
    if (inp.down && inp.grounded && inp.pos.y < L.y0 + 0.3) climbing = false;
  }
  return { inVol: true, climbing, vy };
}
