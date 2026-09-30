// Machine-specific cues: thermal feed motor vs a clear two-tone verification scan.
export function renderThreat13Sound(kind, sr) {
  const durations = { c13_print_load: 1.4, c13_print_fire: 0.45, c13_checksum_scan: 1.6, c13_checksum_clear: 0.4 };
  const dur = durations[kind], out = new Float32Array(Math.floor(sr * dur));
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / sr, u = t / dur, fade = Math.min(1, t / 0.008, (dur - t) / 0.02);
    let v;
    if (kind === 'c13_print_load') { phase += (130 + 230 * u) / sr; v = Math.sin(2 * Math.PI * phase) * (0.18 + 0.08 * Math.sin(t * 60)) + Math.sin(t * Math.PI * 2800) * Math.max(0, Math.sin(t * 32)) ** 16 * 0.15; }
    else if (kind === 'c13_print_fire') v = (Math.sin(t * Math.PI * 110) + Math.sin(t * Math.PI * 1730) * 0.35) * Math.exp(-t * 12) * 0.5;
    else { const f = kind === 'c13_checksum_scan' ? (Math.floor(t * 5) % 2 ? 740 : 554) : 370; v = Math.sin(2 * Math.PI * f * t) * 0.28 * (kind === 'c13_checksum_scan' ? Math.max(0, Math.sin(t * Math.PI * 5)) : Math.exp(-t * 9)); }
    out[i] = v * fade;
  }
  return out;
}
export function ensureThreat13Sounds(game) {
  const a = game.audio;
  if (!a?.ctx || !a.buffers) return false;
  for (const id of ['c13_print_load', 'c13_print_fire', 'c13_checksum_scan', 'c13_checksum_clear']) if (!a.buffers.has(id)) { const data = renderThreat13Sound(id, a.ctx.sampleRate), b = a.ctx.createBuffer(1, data.length, a.ctx.sampleRate); b.copyToChannel(data, 0); a.buffers.set(id, b); }
  return true;
}
