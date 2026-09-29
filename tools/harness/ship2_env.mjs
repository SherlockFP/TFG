// Node DOM stubs so the real ship / props / models can be built without a browser (shared by the ship2 tests).
const cv = () => ({ width: 0, height: 0, getContext: () => new Proxy({}, { get: (t, k) => k === 'measureText' ? () => ({ width: 10 }) : (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop() {} }) : (k === 'getImageData' || k === 'createImageData') ? () => ({ data: new Uint8ClampedArray(1 << 22), width: 64, height: 64 }) : () => {}, set: () => true }), style: {}, addEventListener() {}, querySelector: () => null, children: [], insertBefore() {}, append() {}, appendChild() {}, remove() {}, dataset: {}, classList: { contains: () => false, add() {}, remove() {} }, isConnected: true });
globalThis.document = globalThis.document || { createElement: () => cv(), getElementById: () => null, body: { appendChild() {} }, addEventListener() {}, head: { appendChild() {} } };
globalThis.window = globalThis;
globalThis.localStorage = globalThis.localStorage || { getItem: () => null, setItem() {} };
try { globalThis.navigator = { userAgent: 'node' }; } catch { /* read-only */ }
globalThis.OffscreenCanvas = class { constructor() { return cv(); } };
