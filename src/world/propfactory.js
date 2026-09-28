// Single entry point for props: procedural props (models/props.js) or downloaded GLB props ("ext:<id>").
import { createProp } from '../models/props.js';
import { extInstance } from './extmodels.js';

export function createAnyProp(id, opts = {}) {
  if (id.startsWith('ext:')) {
    const o = extInstance(id.slice(4), { scale: opts.scale || 1 });
    if (o) return o;
    return createProp('crate_wood', opts);
  }
  return createProp(id, opts);
}
