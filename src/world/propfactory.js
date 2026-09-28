// Single entry point for props: procedural props (models/props.js) or downloaded GLB props ("ext:<id>").
import { createProp } from '../models/props.js';
import { extInstance } from './extmodels.js';
import { createProp2 } from '../models/props2.js';   // [maps2]

export function createAnyProp(id, opts = {}) {
  if (id.startsWith('m2:')) return createProp2(id.slice(3), opts);   // [maps2]
  if (id.startsWith('ext:')) {
    const o = extInstance(id.slice(4), { scale: opts.scale || 1 });
    if (o) return o;
    return createProp('crate_wood', opts);
  }
  return createProp(id, opts);
}
