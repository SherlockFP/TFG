// Faceted fleet illustrations use the same core, fitted sockets and paint as
// the purchased hull. SVG owns no renderer, lights, simulation or GPU resources.
import { SHIP } from '../world/ship.js';
import { SOCKETS, ROOM_H } from '../world/hardpoints.js';
import { DECK } from '../world/shiplayout.js';
import { sanitize, paintHex } from './shipyard_core.js';
import { escapeHtml } from '../core/util.js';

const ink = '#202725';
const project = ([x, y, z]) => [132 + (x * .85 + z * .68) * 9.7, 117 + (-x * .24 + z * .42 - y * .95) * 9.7];
const points = ps => ps.map(p => project(p).map(n => n.toFixed(2)).join(',')).join(' ');
const color = hex => '#' + hex.toString(16).padStart(6, '0');

export function fleetPreview13(raw, label = '') {
  const state = sanitize(raw), paint = color(paintHex(state.paint.c1)), faces = [];
  function face(ps, fill, part, opacity = 1) {
    const depth = ps.reduce((n, [x, y, z]) => n + x * .8 - z - y * .65, 0) / ps.length;
    faces.push({ ps, fill, part, depth, opacity });
  }
  function hull(r, y0, y1, part, glass = false) {
    const { x0, x1, z0, z1 } = r;
    face([[x0,y1,z0],[x1,y1,z0],[x1,y1,z1],[x0,y1,z1]], glass ? '#56666a' : '#b0b1a5', part);
    face([[x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0]], glass ? '#38515b' : '#69716a', part, glass ? .65 : 1);
    face([[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]], glass ? '#476069' : '#80847b', part, glass ? .65 : 1);
    if (!glass) {
      const y = y0 + (y1 - y0) * .58;
      face([[x0,y,z1+.015],[x1,y,z1+.015],[x1,y+.25,z1+.015],[x0,y+.25,z1+.015]], paint, part + ':paint');
      face([[x0-.015,y,z0],[x0-.015,y,z1],[x0-.015,y+.25,z1],[x0-.015,y+.25,z0]], paint, part + ':paint');
      // Worn roof seams keep the slabs readable without bright emissive panels.
      for (let x = x0 + 1.4; x < x1 - .4; x += 2.3) face([[x,y1+.015,z0+.25],[x+.055,y1+.015,z0+.25],[x+.055,y1+.015,z1-.25],[x,y1+.015,z1-.25]], '#777e75', part + ':seam');
    }
  }
  hull(SHIP, -.3, SHIP.h + .45, 'core');
  for (const [socket, fitted] of Object.entries(state.m)) {
    const room = SOCKETS[socket].room;
    if (socket === 'DECK') {
      hull(room, 3.9, 4.04, socket + ':' + fitted.id);
      hull(room, 4.04, 6.95, socket + ':canopy', true);
      for (const x of [room.x0+.2, room.x1-.2]) for (const z of [room.z0+.2, room.z1-.2]) hull({x0:x-.07,x1:x+.07,z0:z-.07,z1:z+.07},3.9,6.95,socket+':post');
    } else if (socket === 'TURRET') {
      hull(room, 3.9, 4.5, socket + ':' + fitted.id);
      hull({x0:room.x0+.3,x1:room.x1-.3,z0:-.5,z1:.5},4.5,5.2,socket+':mount');
    } else hull(room, -.2, ROOM_H + .2, socket + ':' + fitted.id);
  }
  if (state.deck.t) hull(DECK, DECK.y, DECK.y + DECK.h, 'upper-deck', true);
  // Native front cockpit, faceted chin, hull legs and two rear thrusters.
  face([[-7.27,1.15,-2.4],[-7.27,1.15,2.4],[-7.27,2.75,2.4],[-7.27,2.75,-2.4]], '#26393e', 'cockpit');
  face([[-8.9,-.4,-2.1],[-8.9,-.4,2.1],[-7.27,1.15,2.4],[-7.27,1.15,-2.4]], '#8b9085', 'nose');
  face([[-8.9,-.4,2.1],[-7.27,-.6,2.4],[-7.27,1.15,2.4]], '#5b665f', 'nose');
  for (const x of [-5.5,5.5]) for (const z of [-3.9,3.9]) {
    hull({x0:x-.13,x1:x+.13,z0:z-.13,z1:z+.13},-1.75,-.4,'leg');
    hull({x0:x-.5,x1:x+.5,z0:z-.5,z1:z+.5},-1.82,-1.7,'foot');
  }
  for (const z of [-2.2,2.2]) hull({x0:4.85,x1:6.3,z0:z-.62,z1:z+.62},-1.7,-.65,'thruster');
  const d0 = SHIP.door.x - SHIP.door.width/2, d1 = SHIP.door.x + SHIP.door.width/2;
  face([[d0,0,3.78],[d1,0,3.78],[d1,2.6,3.78],[d0,2.6,3.78]], '#303b35', 'airlock');
  face([[d0,2.58,3.8],[d1,2.58,3.8],[d1,2.78,3.8],[d0,2.78,3.8]], paint, 'airlock:stripe');
  for (let i=0;i<4;i++) hull({x0:d0-.2,x1:d1+.2,z0:4+i*.4,z1:4.5+i*.4},-.2-i*.3,-i*.3,'step');
  hull({x0:-6.9,x1:-6.82,z0:-3.42,z1:-3.34},3.85,5.4,'antenna');
  const projected = faces.flatMap(f=>f.ps.map(project)), xs=projected.map(p=>p[0]), ys=projected.map(p=>p[1]);
  const x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys), k=Math.min(1,344/(x1-x0),168/(y1-y0));
  // Saved extended wings remain visible, while the standard fleet shares scale.
  const tx=k<1?180-(x0+x1)*k/2:x0<8?8-x0:x1>352?352-x1:0;
  const ty=k<1?96-(y0+y1)*k/2:y0<12?12-y0:y1>180?180-y1:0;
  const art = faces.sort((a,b)=>b.depth-a.depth).map(f => `<polygon data-part="${f.part}" points="${points(f.ps)}" fill="${f.fill}" fill-opacity="${f.opacity}" stroke="${ink}" stroke-width=".65" stroke-linejoin="miter"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 190" role="img" aria-label="${escapeHtml(label)}" style="display:block;width:100%;height:auto;max-height:168px"><title>${escapeHtml(label)}</title><rect width="360" height="190" fill="#191e20"/><path d="M18 155H342M18 167H342M18 179H342M36 144V183M84 144V183M132 144V183M180 144V183M228 144V183M276 144V183M324 144V183" fill="none" stroke="#303937" stroke-width=".65"/><path d="M10 28V10H28M332 10H350V28M350 162V180H332M28 180H10V162" fill="none" stroke="#5b6258"/><g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${k.toFixed(4)})">${art}</g></svg>`;
}
