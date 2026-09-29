// Ship hardpoints (pure data, shared by world/ship.js and game/shipyard*.js).
// The Starter Pod core is x -7..7, z -3.5..3.5, h 3.4 (world/ship.js). Modules are rooms bolted OUTSIDE that box. The core walls carry
// three permanent doorway gaps (one on the +x wall, two on the -z wall) that are filled by a "seal" (a plain wall block, ship.hardpoints[id])
// until a module is installed there; the gaps sit between the props that already stand on those walls (cupboard / suit rack, arcade / workbench,
// monitor bank / quota screen), so no existing prop had to move. Chained sockets (R2, N3, N4) hang off the far wall of the module in front of them.
//
//   wall: '+x' | '-z'    c: doorway centre along the wall (z for '+x', x for '-z')    w: doorway width    h: doorway height
//   room: footprint of the module room in world space (x0..x1, z0..z1); floor y = 0, ceiling y = ROOM_H
//   door: where the aisle enters the room from the parent side (for chained sockets = the doorway in the parent room's far wall)
export const DOOR_H = 2.4;
export const ROOM_H = 3.4;
export const WALL_T = 0.25;          // hull skin thickness between the core and a module

export const CORE_GAPS = {
  R1: { wall: '+x', c: -1.125, w: 0.95, h: DOOR_H },
  N1: { wall: '-z', c: -5.4, w: 1.2, h: DOOR_H },
  N2: { wall: '-z', c: 2.25, w: 1.2, h: DOOR_H },
};

// side: which way the room grows; axis: aisle direction (the chain continues along it)
export const SOCKETS = {
  R1: { kind: 'core', gap: 'R1', dir: [1, 0], room: { x0: 7.25, x1: 12.75, z0: -3.75, z1: 3.75 }, aisle: -1.125, parent: null, group: 'rear', label: 'REAR 1' },
  R2: { kind: 'chain', dir: [1, 0], room: { x0: 13.0, x1: 17.5, z0: -3.75, z1: 3.75 }, aisle: -1.125, parent: 'R1', group: 'rear', label: 'REAR 2' },
  N1: { kind: 'core', gap: 'N1', dir: [0, -1], room: { x0: -7.9, x1: -2.9, z0: -8.75, z1: -3.75 }, aisle: -5.4, parent: null, group: 'north', label: 'NORTH 1' },
  N2: { kind: 'core', gap: 'N2', dir: [0, -1], room: { x0: 0.0, x1: 4.5, z0: -8.75, z1: -3.75 }, aisle: 2.25, parent: null, group: 'north', label: 'NORTH 2' },
  N3: { kind: 'chain', dir: [0, -1], room: { x0: -7.9, x1: -2.9, z0: -13.5, z1: -9.0 }, aisle: -5.4, parent: 'N1', group: 'north', label: 'NORTH 3' },
  N4: { kind: 'chain', dir: [0, -1], room: { x0: 0.0, x1: 4.5, z0: -13.5, z1: -9.0 }, aisle: 2.25, parent: 'N2', group: 'north', label: 'NORTH 4' },
  DECK: { kind: 'roof', room: { x0: -6.6, x1: -0.6, z0: -3.2, z1: 3.2 }, group: 'roof', label: 'DECK' },
  TURRET: { kind: 'roof', room: { x0: 1.4, x1: 4.2, z0: -1.6, z1: 1.6 }, group: 'roof', label: 'ROOF' },
};
export const SOCKET_IDS = Object.keys(SOCKETS);
/** width of the doorway that joins a chained room to its parent (through the parent room's far wall) */
export const CHAIN_DOOR = { w: 1.4, h: DOOR_H };
