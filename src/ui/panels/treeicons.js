// Vector icons for roles + keystones (canvas paths, so they render the same everywhere: no emoji fonts needed).
// drawIcon(ctx, name, cx, cy, size, color, lineWidth) draws inside a box of +-size; iconCanvas() makes a DOM canvas.
const TAU = Math.PI * 2;
const ICONS = {
  eye(c) {
    c.beginPath(); c.moveTo(-1, 0); c.quadraticCurveTo(0, -1.05, 1, 0); c.quadraticCurveTo(0, 1.05, -1, 0); c.closePath(); c.stroke();
    c.beginPath(); c.arc(0, 0, 0.34, 0, TAU); c.fill();
    c.beginPath(); c.arc(0, 0, 0.6, 0, TAU); c.globalAlpha *= 0.35; c.stroke();
  },
  blades(c) {
    c.beginPath(); c.moveTo(-0.85, -0.85); c.lineTo(0.7, 0.7); c.moveTo(0.85, -0.85); c.lineTo(-0.7, 0.7); c.stroke();
    c.beginPath(); c.moveTo(0.35, 0.95); c.lineTo(0.95, 0.35); c.moveTo(-0.35, 0.95); c.lineTo(-0.95, 0.35); c.stroke();
  },
  moon(c) {
    c.save(); c.beginPath(); c.rect(-2, -2, 4, 4); c.arc(0.4, -0.12, 0.7, 0, TAU); c.clip('evenodd');
    c.beginPath(); c.arc(0, 0, 0.9, 0, TAU); c.fill(); c.restore();
    c.beginPath(); c.arc(0.55, -0.55, 0.09, 0, TAU); c.fill();
  },
  cross(c) {
    c.beginPath(); c.moveTo(-0.28, -0.9); c.lineTo(0.28, -0.9); c.lineTo(0.28, -0.28); c.lineTo(0.9, -0.28); c.lineTo(0.9, 0.28); c.lineTo(0.28, 0.28);
    c.lineTo(0.28, 0.9); c.lineTo(-0.28, 0.9); c.lineTo(-0.28, 0.28); c.lineTo(-0.9, 0.28); c.lineTo(-0.9, -0.28); c.lineTo(-0.28, -0.28); c.closePath(); c.fill();
  },
  gear(c) {
    c.beginPath();
    const pt = (deg, r) => c.lineTo(Math.cos((deg * Math.PI) / 180) * r, Math.sin((deg * Math.PI) / 180) * r);
    for (let i = 0; i < 8; i++) { const a = i * 45; pt(a - 9, 0.96); pt(a + 9, 0.96); pt(a + 15, 0.68); pt(a + 30, 0.68); }
    c.closePath(); c.stroke();
    c.beginPath(); c.arc(0, 0, 0.3, 0, TAU); c.stroke();
  },
  crate(c) {
    c.strokeRect(-0.8, -0.8, 1.6, 1.6);
    c.beginPath(); c.moveTo(-0.8, -0.8); c.lineTo(0.8, 0.8); c.moveTo(0.8, -0.8); c.lineTo(-0.8, 0.8); c.stroke();
  },
  drop(c) {
    c.beginPath(); c.moveTo(0, -1); c.bezierCurveTo(0.95, 0.1, 0.7, 0.95, 0, 0.95); c.bezierCurveTo(-0.7, 0.95, -0.95, 0.1, 0, -1); c.fill();
  },
  mule(c) {
    c.beginPath(); c.moveTo(-0.5, -0.35); c.lineTo(0.5, -0.35); c.lineTo(0.9, 0.85); c.lineTo(-0.9, 0.85); c.closePath(); c.stroke();
    c.beginPath(); c.arc(0, -0.55, 0.3, Math.PI, 0); c.stroke();
  },
  shard(c) {
    c.beginPath(); c.moveTo(0, -1); c.lineTo(0.62, -0.05); c.lineTo(0.05, 1); c.lineTo(-0.62, -0.1); c.closePath(); c.stroke();
    c.beginPath(); c.moveTo(0, -1); c.lineTo(0.12, -0.05); c.lineTo(-0.2, 0.42); c.stroke();
  },
  ghost(c) {
    c.beginPath(); c.moveTo(-0.72, 0.85); c.lineTo(-0.72, -0.1); c.arc(0, -0.1, 0.72, Math.PI, TAU); c.lineTo(0.72, 0.85);
    c.lineTo(0.36, 0.55); c.lineTo(0, 0.85); c.lineTo(-0.36, 0.55); c.closePath(); c.stroke();
    c.beginPath(); c.arc(-0.27, -0.12, 0.11, 0, TAU); c.arc(0.27, -0.12, 0.11, 0, TAU); c.fill();
  },
  coin(c) {
    c.beginPath(); c.arc(0, 0, 0.85, 0, TAU); c.stroke();
    c.beginPath(); c.arc(0, 0, 0.5, 0, TAU); c.globalAlpha *= 0.5; c.stroke(); c.globalAlpha *= 2;
    c.beginPath(); c.moveTo(0, -0.28); c.lineTo(0, 0.28); c.moveTo(-0.28, 0); c.lineTo(0.28, 0); c.stroke();
  },
  lungs(c) {
    c.beginPath(); c.ellipse(-0.46, 0.22, 0.36, 0.62, -0.18, 0, TAU); c.stroke();
    c.beginPath(); c.ellipse(0.46, 0.22, 0.36, 0.62, 0.18, 0, TAU); c.stroke();
    c.beginPath(); c.moveTo(0, -0.95); c.lineTo(0, -0.25); c.lineTo(-0.34, 0.05); c.moveTo(0, -0.25); c.lineTo(0.34, 0.05); c.stroke();
  },
  bolt(c) {
    c.beginPath(); c.moveTo(0.25, -1); c.lineTo(-0.6, 0.15); c.lineTo(-0.05, 0.15); c.lineTo(-0.28, 1); c.lineTo(0.6, -0.2); c.lineTo(0.06, -0.2); c.closePath(); c.fill();
  },
  wolf(c) {
    c.beginPath(); c.moveTo(-0.85, -0.9); c.lineTo(-0.4, -0.3); c.lineTo(0.4, -0.3); c.lineTo(0.85, -0.9); c.lineTo(0.9, 0.1); c.lineTo(0.0, 0.98); c.lineTo(-0.9, 0.1); c.closePath(); c.stroke();
    c.beginPath(); c.arc(-0.33, 0.05, 0.1, 0, TAU); c.arc(0.33, 0.05, 0.1, 0, TAU); c.fill();
    c.beginPath(); c.moveTo(-0.12, 0.6); c.lineTo(0.12, 0.6); c.lineTo(0, 0.75); c.closePath(); c.fill();
  },
  dot(c) { c.beginPath(); c.arc(0, 0, 0.5, 0, TAU); c.fill(); },
};

export function drawIcon(ctx, name, cx, cy, size, color, lw = 2) {
  const f = ICONS[name] || ICONS.dot;
  ctx.save();
  ctx.translate(cx, cy); ctx.scale(size, size);
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = lw / size; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  f(ctx);
  ctx.restore();
}

/** A DOM <canvas> with the icon (glow optional), for cards / chips. */
export function iconCanvas(name, px = 64, color = '#ffb347', glow = true) {
  const dpr = Math.min(2, (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1);
  const c = document.createElement('canvas');
  c.width = Math.round(px * dpr); c.height = Math.round(px * dpr);
  c.style.width = px + 'px'; c.style.height = px + 'px';
  const x = c.getContext('2d');
  x.scale(dpr, dpr);
  if (glow) { x.shadowColor = color; x.shadowBlur = px * 0.22; }
  drawIcon(x, name, px / 2, px / 2, px * 0.36, color, Math.max(1.6, px / 24));
  return c;
}
