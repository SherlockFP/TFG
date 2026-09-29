// UI3: pure label layout for the HUD compass tape. Two markers on (nearly) the same bearing (SHIP + ENTRANCE when you stand on the line
// between them) used to print their captions on top of each other; spreadLabels() pushes overlapping captions apart sideways, keeps them
// inside the tape, and never reorders them. labels: [{ tx, tw }] (centre x, width); mutates and returns the same array.
export function spreadLabels(labels, W, gap = 8) {
  labels.sort((a, b) => a.tx - b.tx);
  const clampX = (l) => { l.tx = Math.min(W - l.tw / 2 - 2, Math.max(l.tw / 2 + 2, l.tx)); };
  for (const l of labels) clampX(l);
  for (let it = 0; it < 8; it++) {
    let moved = false;
    for (let i = 1; i < labels.length; i++) {
      const a = labels[i - 1], b = labels[i], over = (a.tw + b.tw) / 2 + gap - (b.tx - a.tx);
      if (over > 0.5) { a.tx -= over / 2; b.tx += over / 2; moved = true; }
    }
    for (const l of labels) clampX(l);
    if (!moved) break;
  }
  return labels;
}
