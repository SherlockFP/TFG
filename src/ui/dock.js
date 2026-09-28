// Shared HUD dock for wave-1 widgets (threat meter, mana bar, facility status, contract tracker, ...), so modules
// never fight over absolute positions. Each module asks for a slot and gets a plain <div> it owns:
//   const box = hudDock('right', 'facility', 20);   // side: 'right' (top-right column) | 'bottom' (above the hotbar) | 'left'
//   box.innerHTML = '...';  ...  box.remove() on dispose
// Items are ordered by `order` (lower = first). Hidden automatically while the HUD root is hidden (menus, death cam).
const SIDES = {
  right: 'position:fixed;right:14px;top:44vh;display:flex;flex-direction:column;align-items:flex-end;gap:6px;pointer-events:none;z-index:6;max-width:300px',
  bottom: 'position:fixed;left:50%;bottom:92px;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:4px;pointer-events:none;z-index:6',
  left: 'position:fixed;left:14px;bottom:170px;display:flex;flex-direction:column;align-items:flex-start;gap:6px;pointer-events:none;z-index:6;max-width:300px',
};
const docks = {};

function dockEl(side) {
  if (docks[side]?.isConnected) return docks[side];
  const d = document.createElement('div');
  d.className = 'hud-dock hud-dock-' + side;
  d.style.cssText = SIDES[side] || SIDES.right;
  (document.getElementById('ui') || document.body).appendChild(d);
  docks[side] = d;
  return d;
}

export function hudDock(side = 'right', id = 'w', order = 50) {
  const d = dockEl(side);
  d.querySelector(`[data-dock-id="${id}"]`)?.remove();
  const box = document.createElement('div');
  box.dataset.dockId = id;
  box.dataset.order = String(order);
  box.className = 'hud-dock-item';
  const after = [...d.children].find((c) => Number(c.dataset.order) > order);
  d.insertBefore(box, after || null);
  return box;
}

/** Hide/show every dock (call from a module's update with the HUD visibility, cheap). */
export function setDocksVisible(v) { for (const d of Object.values(docks)) if (d) d.style.visibility = v ? '' : 'hidden'; }
