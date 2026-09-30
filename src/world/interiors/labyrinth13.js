import { layoutKit } from './common.js';
import { districtRoutes } from '../districts13.js';
import { LabBuilder } from './lab_kit.js';
import '../../game/districts13_text.js';
const room = (floor, wall, center = []) => ({ floor, wall, ceil: 'metal_dark', lamp: 'wall_lamp', center, wall_: [], clutter: [] });
function theme(id, name, blurb, ember) {
  const floor = ember ? 'tiles_dirty' : 'marble', wall = ember ? 'brick' : 'wall_office';
  return {
    id, name, blurb,
    style: { corridor: { floor, wall, ceil: 'metal_dark', base: 'metal_dark' }, rooms: {
      entrance: room(floor, wall, ['reception_desk']), storage: room(floor, wall, ['shelf_metal']),
      archive: room('wood_floor', wall, ['bookcase']), records: room('carpet_office', wall, ['filing_cabinet']),
      kiln: room('metal_plate', 'brick'), cooling: room('tiles_white', 'concrete_dark'),
      generator: room('metal_plate', 'concrete_dark', ['generator']), vault: room('metal_plate', 'metal_plate'), nest: room(floor, wall),
      registry_hub: room('marble', wall), kiln_hub: room('metal_plate', 'brick'),
    } },
    roomTypes: ember ? [['kiln', 5, true], ['cooling', 5], ['storage', 2]] : [['archive', 5, true], ['records', 5], ['storage', 2]],
    roomHeight: type => type.endsWith('_hub') ? 6.2 : ember ? 4.8 : 3.6,
    layout: { plan: ember ? 'wings' : 'rooms', loops: ember ? 0.32 : 0.65, hub: { type: ember ? 'kiln_hub' : 'registry_hub', w: 4, h: 4 }, hubAlways: true, doorP: 0.22, blastP: 0, lockedP: 0, corridorH: ember ? 4 : 3.2, bigChance: 0.3 },
    lamps: { corridor: 'wall_lamp', every: 3, color: ember ? 0xffb977 : 0x88eed2, flicker: 0.08 }, lampColor: ember ? 0xffb977 : 0x88eed2,
    doorProp: 'door_single', landmarks: ['filing_cabinet'], posters: ['poster_delete', 'poster_safety'], corridorScrap: 0.1,
    footstep: { marble: 'tile', metal_plate: 'metal', wood_floor: 'wood', carpet_office: 'carpet' },
    ambience: { base: 'ambience_facility', vol: 0.35, buzz: 'lights_buzz', buzzVol: 0.05, env: 'facility' },
    atmosphere: { fog: ember ? 0x21130e : 0x061414, density: 0.035 }, noFlood: ['archive', 'records', 'kiln', 'cooling', 'registry_hub', 'kiln_hub'],
    decorate: ctx => decorate(ctx, id, ember),
  };
}
export const LABYRINTH13_THEMES = {
  echoregistry: theme('echoregistry', 'Echo Registry', 'An archive of erased identities. Recover packets in order; the mint trail leads back to reception.', false),
  embercache: theme('embercache', 'Ember Cache', 'A ceramic memory foundry. Calibrate three cooling loops; every wing returns to the central kiln.', true),
};
function decorate(ctx, id, ember) {
  const L = ctx.layout, K = layoutKit(L), B = new LabBuilder(ctx), Y = ctx.Y;
  // Actual connected rooms only; never put the optional objective behind a vault or locked door.
  const routes = districtRoutes(L);
  const rooms = L.rooms.filter(r => routes.distance[L.idx(r.cx, r.cz)] >= 0 && ['archive', 'records', 'kiln', 'cooling', 'storage', 'registry_hub', 'kiln_hub'].includes(r.type)).sort((a, b) => K.roomDist(a) - K.roomDist(b));
  const picked = [0.2, 0.55, 0.9].map(f => rooms[Math.min(rooms.length - 1, Math.floor(f * rooms.length))]).filter((r, i, all) => r && all.indexOf(r) === i);
  const stations = picked.map((r, i) => {
    const R = K.roomRect(r), x = (R.x0 + R.x1) / 2, z = (R.z0 + R.z1) / 2;
    // Compact physical control below the numbered landmark; no footprint blocks the return route.
    B.box('m:metal_dark', x, Y + 1.3, z, 0.5, 0.32, 0.2);
    B.box(ember ? 'g:ffb977' : 'g:88eed2', x, Y + 1.3, z + 0.11, 0.3, 0.17, 0.025);
    // Overhead numbered bars are readable without adding renderer lights or blocking walking.
    B.box('m:metal_dark', x, Y + 2.4, z, 1.5, 0.45, 0.5);
    for (let k = 0; k <= i; k++) B.box(ember ? 'g:ffb977' : 'g:88eed2', x - 0.4 + k * 0.4, Y + 2.4, z + 0.26, 0.15, 0.28, 0.03);
    if (ember) {
      for (const side of [-1, 1]) {
        B.box('m:metal_dark', x + side * 0.45, Y + 1.3, z, 0.32, 0.28, 0.18);
        B.box(side < 0 ? 'g:ffb977' : 'g:88eed2', x + side * 0.45, Y + 1.3, z + 0.1, 0.2, 0.16, 0.025);
      }
      // Suspended clay cylinders / cooling duct silhouettes keep the foundry distinct from offices.
      B.box('m:brick', x + 1.8, Y + 2.7, z, 1.6, 2.6, 1.6);
      B.box('g:ff713c', x + 1.8, Y + 1.7, z + 0.81, 0.9, 0.2, 0.03);
    } else {
      for (const dz of [-1.8, 1.8]) B.box('m:wood_dark', x, Y + 2.7, z + dz, 3.2, 0.4, 0.5);
    }
    return { i, x, y: Y + 1.3, z, room: r.id };
  });
  B.build('labyrinth13-landmarks');
  return { lab: { id, stations } };
}
