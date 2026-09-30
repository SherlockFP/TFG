// [perf5] write-if-changed DOM helpers for per-frame HUD code: a style / textContent write with the same value still costs a style
// invalidation in the browser, so callers that refresh every frame go through these. Only for elements the caller owns exclusively.
export function setText(el, v) { if (el && el._tx !== v) { el._tx = v; el.textContent = v; } }
export function setHTML(el, v) { if (el && el._hx !== v) { el._hx = v; el.innerHTML = v; } }
export function setStyle(el, k, v) { if (!el) return; const c = el._sc || (el._sc = {}); if (c[k] !== v) { c[k] = v; el.style[k] = v; } }
export function setClass(el, name, on) { if (!el) return; const c = el._cc || (el._cc = {}), b = !!on; if (c[name] !== b) { c[name] = b; el.classList.toggle(name, b); } }
