// Single entry point for props: procedural props (models/props.js) or downloaded GLB props ("ext:<id>").
import { createProp } from '../models/props.js';
import { extInstance } from './extmodels.js';
import { createProp2 } from '../models/props2.js';   // [maps2]
import { createProp5 } from '../models/maps5_props.js';   // [maps5]
import { createPropSt } from '../models/studio_props.js';   // [repomaps]

export function createAnyProp(id, opts = {}) {
  if (id.startsWith('m2:')) return createProp2(id.slice(3), opts);   // [maps2]
  if (id.startsWith('m5:')) return createProp5(id.slice(3), opts);   // [maps5]
  if (id.startsWith('st:')) return createPropSt(id.slice(3), opts);   // [repomaps]
  if (id.startsWith('ext:')) {
    const o = extInstance(id.slice(4), { scale: opts.scale || 1 });
    if (o) return o;
    return createProp('crate_wood', opts);
  }
  return createProp(id, opts);
}
