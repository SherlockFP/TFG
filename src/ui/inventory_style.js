// Styles for the wave-1 inventory: hotbar tier frames + [I] bag tag (hud.js), the I panel (inventory_panel.js),
// the loot feed and tooltips. Injected once as <style id="tfg-inv-style"> so style.css stays untouched.
import { TIERS } from '../game/tiers.js';

const tierVars = Object.values(TIERS).map((T) => `.tier-${T.id}{--tc:${T.color}}`).join('');

const CSS = `
${tierVars}
/* ---------------- hotbar ---------------- */
.hud-inv .inv-slot.tier { border-color: color-mix(in srgb, var(--tc) 78%, transparent); box-shadow: inset 0 -20px 24px -16px var(--tc); }
.hud-inv .inv-slot.tier.active { border-color: #fff; box-shadow: 0 0 10px rgba(255,160,90,0.6), inset 0 -20px 24px -14px var(--tc), inset 0 -3px 0 var(--tc); }
.hud-inv .inv-slot.tier-epic, .hud-inv .inv-slot.tier-legendary, .hud-inv .inv-slot.tier-mythic { animation: tinvSlotGlow 2.4s ease-in-out infinite; }
.hud-inv .inv-slot.tier::before { content: ''; position: absolute; right: 3px; bottom: 3px; width: 6px; height: 6px; background: var(--tc); box-shadow: 0 0 6px var(--tc); transform: rotate(45deg); }
@keyframes tinvSlotGlow { 50% { box-shadow: inset 0 -26px 30px -14px var(--tc), 0 0 8px color-mix(in srgb, var(--tc) 55%, transparent); } }
.inv-bagtag { width: 58px; height: 70px; border: 2px solid rgba(255,138,61,0.28); background: rgba(0,0,0,0.3); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; line-height: 1; color: #ffd9b8; opacity: 0.85; }
.inv-bagtag kbd { font-family: var(--font); font-size: 17px; border: 1px solid rgba(255,190,140,0.6); border-bottom-width: 3px; border-radius: 3px; padding: 1px 6px 0; color: #fff3e6; }
.inv-bagtag .bt-l { font-size: 13px; letter-spacing: 1px; opacity: 0.7; }
.inv-bagtag .bt-n { font-size: 16px; }
.inv-bagtag.full .bt-n { color: #ff6a4a; }

/* ---------------- loot feed (left dock) ---------------- */
.tinv-feed { display: flex; flex-direction: column; gap: 4px; align-items: flex-start; }
.tinv-feed-line { display: flex; align-items: center; gap: 8px; padding: 3px 12px 3px 4px; background: linear-gradient(90deg, rgba(8,4,2,0.82), rgba(8,4,2,0.35) 80%, transparent); border-left: 3px solid var(--tc, #9aa39a);
  font-size: 19px; line-height: 1.05; color: #ffd9b8; animation: tinvFeedIn 0.28s ease-out both; text-shadow: 1px 1px 0 #000; }
.tinv-feed-line.out { animation: tinvFeedOut 0.5s ease-in both; }
.tinv-feed-line .ico { width: 34px; height: 34px; image-rendering: pixelated; }
.tinv-feed-line b { color: var(--tc); font-weight: normal; }
.tinv-feed-line i { font-style: normal; font-size: 15px; opacity: 0.75; margin-left: 4px; }
.tinv-feed-line .tinv-feed-hint { display:block; max-width:240px; margin:3px 0 0; white-space:normal; font-size:14px; line-height:1.2; opacity:.9; }
.tinv-feed-line.tier-epic, .tinv-feed-line.tier-legendary, .tinv-feed-line.tier-mythic { background: linear-gradient(90deg, color-mix(in srgb, var(--tc) 30%, rgba(8,4,2,0.85)), rgba(8,4,2,0.35) 80%, transparent); }
@keyframes tinvFeedIn { from { opacity: 0; transform: translateX(-24px); } to { opacity: 1; transform: none; } }
@keyframes tinvFeedOut { to { opacity: 0; transform: translateX(-16px); } }

/* ---------------- panel ---------------- */
.overlay .menu-frame.tinv { width: auto; max-width: 97vw; min-width: min(900px, 96vw); max-height: 94vh; }
.tinv { --cell: 50px; --gap: 3px; user-select: none; }
.tinv .cp-body { display: flex; gap: 18px; align-items: stretch; padding: 12px 18px 12px; overflow: visible; }
.tinv-col { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.tinv-doll { width: 236px; flex-shrink: 0; }
.tinv-mid { flex: 1; align-items: center; }
.tinv-sheet { width: 250px; flex-shrink: 0; }
.tinv-sec { font-family: var(--cond); font-weight: bold; text-transform: uppercase; font-size: 17px; letter-spacing: 2px; color: var(--ph-dim); display: flex; align-items: center; gap: 8px; width: 100%; white-space: nowrap; }
.tinv-sec::after { content: ''; flex: 1; height: 1px; background: var(--ph-line); }
.tinv-sec em { font-style: normal; color: var(--ph); letter-spacing: 1px; font-size: 16px; }
.tinv-dollbox { position: relative; width: 236px; height: 344px; border: 1px solid var(--ph-line); background: radial-gradient(ellipse 60% 55% at 50% 45%, rgba(255,138,61,0.09), transparent 70%), rgba(0,0,0,0.28); }
.tinv-dollbox svg.tinv-body { position: absolute; left: 50%; top: 18px; width: 120px; height: 250px; transform: translateX(-50%); color: rgba(255,170,110,0.11); filter: drop-shadow(0 0 6px rgba(255,138,61,0.18)); }
.tinv-eq { position: absolute; display: flex; flex-direction: column; align-items: center; gap: 3px; }
.tinv-eq .tinv-eqlbl { font-size: 13px; letter-spacing: 1px; color: var(--ph-dim); text-transform: uppercase; white-space: nowrap; }
.tinv-slot { position: relative; border: 2px dashed rgba(255,190,140,0.28); background: rgba(0,0,0,0.42); display: flex; align-items: center; justify-content: center; }
.tinv-slot .tinv-ghost { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 30px; color: rgba(255,190,140,0.16); pointer-events: none; }
.tinv-slot.drop-ok { border-color: #7dff7d; border-style: solid; background: rgba(60,255,110,0.12); }
.tinv-slot.drop-swap { border-color: #ffd23f; border-style: solid; background: rgba(255,210,63,0.12); }
.tinv-slot.drop-bad { border-color: #ff4a3a; border-style: solid; background: rgba(255,74,58,0.12); }
.tinv-eq-armor { left: 76px; top: 100px; } .tinv-eq-armor .tinv-slot { width: 80px; height: 100px; }
.tinv-eq-trinket1 { left: 10px; top: 30px; } .tinv-eq-trinket2 { right: 10px; top: 30px; }
.tinv-eq-trinket1 .tinv-slot, .tinv-eq-trinket2 .tinv-slot { width: 58px; height: 58px; }
.tinv-eq-bag { right: 10px; top: 242px; } .tinv-eq-bag .tinv-slot { width: 72px; height: 72px; }
.tinv-eq-hint { position: absolute; left: 10px; bottom: 8px; width: 100px; font-size: 13px; line-height: 1.15; color: var(--ph-dim); }

.tinv-gridwrap { position: relative; padding: 6px; border: 1px solid var(--ph-line); background: rgba(0,0,0,0.35); box-shadow: inset 0 0 22px rgba(0,0,0,0.6); }
.tinv-grid { position: relative; display: grid; gap: var(--gap); }
.tinv-cell { width: var(--cell); height: var(--cell); background: rgba(255,160,90,0.045); border: 1px solid rgba(255,160,90,0.12); }
.tinv-cell.c-ok { background: rgba(60,255,110,0.2); border-color: rgba(125,255,125,0.7); }
.tinv-cell.c-swap { background: rgba(255,210,63,0.2); border-color: rgba(255,210,63,0.7); }
.tinv-cell.c-bad { background: rgba(255,74,58,0.22); border-color: rgba(255,74,58,0.7); }
.tinv-items { position: absolute; left: 6px; top: 6px; pointer-events: none; }
.tinv-items .ivi { pointer-events: auto; }
.tinv-empty { position: absolute; inset: 6px; display: flex; align-items: center; justify-content: center; color: var(--ph-dim); font-size: 18px; letter-spacing: 1px; pointer-events: none; opacity: 0.6; text-align: center; }

.ivi { position: absolute; --tc: #8a8278; border: 2px solid color-mix(in srgb, var(--tc) 70%, transparent); cursor: grab; overflow: hidden;
  background: radial-gradient(ellipse 75% 70% at 50% 58%, color-mix(in srgb, var(--tc) 26%, transparent), rgba(0,0,0,0.5) 78%), rgba(10,6,3,0.75);
  box-shadow: inset 0 0 0 1px rgba(0,0,0,0.6), inset 0 -12px 16px -12px var(--tc); transition: transform 0.08s, filter 0.08s; }
.ivi:hover { filter: brightness(1.25); z-index: 2; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.6), inset 0 -14px 18px -10px var(--tc), 0 0 12px color-mix(in srgb, var(--tc) 60%, transparent); }
.ivi.plain { --tc: #6a625a; }
.ivi .ico { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); image-rendering: pixelated; pointer-events: none; opacity: 0; transition: opacity 0.2s; }
.ivi .ico.ok { opacity: 1; }
.ivi .iv-v { position: absolute; right: 3px; bottom: 1px; font-size: 14px; color: #fff3e6; text-shadow: 1px 1px 0 #000, -1px 0 0 #000; pointer-events: none; }
.ivi .iv-c { position: absolute; right: 3px; top: 1px; font-size: 14px; color: #fff; text-shadow: 1px 1px 0 #000; pointer-events: none; }
.ivi .iv-bat { position: absolute; left: 4px; right: 4px; bottom: 3px; height: 3px; background: #2a1608; pointer-events: none; }
.ivi .iv-bat div { height: 100%; background: var(--green); }
.ivi .iv-pip { position: absolute; left: 4px; top: 4px; width: 7px; height: 7px; background: var(--tc); transform: rotate(45deg); box-shadow: 0 0 6px var(--tc); pointer-events: none; }
.ivi.t-epic, .ivi.t-legendary { animation: tinvGlow 2.2s ease-in-out infinite; }
.ivi.t-mythic { animation: tinvGlow 1.6s ease-in-out infinite; }
.ivi.t-mythic::after, .ivi.t-legendary::after { content: ''; position: absolute; inset: -40%; background: linear-gradient(115deg, transparent 42%, rgba(255,255,255,0.22) 50%, transparent 58%); animation: tinvSheen 3.2s linear infinite; pointer-events: none; }
@keyframes tinvGlow { 50% { box-shadow: inset 0 0 0 1px rgba(0,0,0,0.6), inset 0 -18px 24px -8px var(--tc), 0 0 10px color-mix(in srgb, var(--tc) 50%, transparent); } }
@keyframes tinvSheen { from { transform: translateX(-60%); } to { transform: translateX(60%); } }
.ivi.dragging { opacity: 0.25; filter: grayscale(1); }
.ivi.pending { opacity: 0.6; }
.tinv-slot .ivi { position: absolute; inset: 2px; }
.tinv-drag { position: fixed; z-index: 100; pointer-events: none; opacity: 0.92; transform: translate(-50%, -50%) scale(1.06); filter: drop-shadow(0 6px 10px rgba(0,0,0,0.7)); }
.tinv-drag .ivi { position: relative; cursor: grabbing; }

.tinv-hotrow { display: flex; gap: 8px; justify-content: center; }
.tinv-hot { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.tinv-hot .tinv-slot { width: 66px; height: 66px; border-style: solid; border-color: rgba(255,138,61,0.35); }
.tinv-hot.active .tinv-slot { border-color: #fff3e6; box-shadow: 0 0 10px rgba(255,160,90,0.45); }
.tinv-hot .tinv-hk { font-size: 14px; color: var(--ph-dim); }
.tinv-bar { width: 100%; display: flex; align-items: center; gap: 10px; font-size: 17px; color: var(--ph-dim); }
.tinv-wbar { flex: 1; height: 8px; background: rgba(0,0,0,0.5); border: 1px solid var(--ph-line); position: relative; }
.tinv-wbar div { position: absolute; left: 0; top: 0; bottom: 0; background: linear-gradient(90deg, #7dff7d, #ffd23f 60%, #ff5a3a); }
.tinv-wbar span { position: absolute; top: -3px; bottom: -3px; width: 2px; background: rgba(255,255,255,0.4); }
.tinv .btn.tinv-btn { font-size: 19px; padding: 1px 12px; border-color: var(--ph-dim); }

.tinv-stats { display: grid; grid-template-columns: 1fr auto; gap: 3px 10px; font-size: 18px; line-height: 1.1; }
.tinv-stats .k { color: var(--ph-dim); text-transform: uppercase; font-size: 15px; letter-spacing: 1px; align-self: center; }
.tinv-stats .v { color: var(--ph-hi); text-align: right; }
.tinv-stats .v.up { color: #7dff7d; } .tinv-stats .v.down { color: #ff7a5a; }
.tinv-legend { display: flex; flex-wrap: wrap; gap: 4px 10px; font-size: 14px; }
.tinv-legend span { display: inline-flex; align-items: center; gap: 4px; color: var(--tc); }
.tinv-legend span::before { content: ''; width: 7px; height: 7px; background: var(--tc); transform: rotate(45deg); box-shadow: 0 0 5px var(--tc); }
.tinv-msg { min-height: 20px; font-size: 17px; color: #ffd23f; text-align: center; }
.tinv-msg.bad { color: #ff6a4a; }

/* ---------------- tooltip ---------------- */
.tinv-tip { position: fixed; z-index: 120; pointer-events: none; width: 300px; padding: 0 0 8px; color: #ffd9b8; font-size: 18px; line-height: 1.15;
  background: repeating-linear-gradient(0deg, rgba(0,0,0,0.2) 0 1px, transparent 1px 3px), rgba(10,6,3,0.96);
  border: 1px solid color-mix(in srgb, var(--tc) 60%, #000); border-top: 3px solid var(--tc); box-shadow: 0 10px 30px rgba(0,0,0,0.8), 0 0 18px color-mix(in srgb, var(--tc) 25%, transparent); }
.tinv-tip .tt-head { display: flex; gap: 10px; align-items: center; padding: 8px 10px 6px; background: linear-gradient(180deg, color-mix(in srgb, var(--tc) 22%, transparent), transparent); }
.tinv-tip .tt-head .ico { width: 48px; height: 48px; image-rendering: pixelated; flex-shrink: 0; }
.tinv-tip .tt-name { color: var(--tc); font-size: 22px; line-height: 1; text-shadow: 0 0 8px color-mix(in srgb, var(--tc) 50%, transparent); }
.tinv-tip .tt-kind { font-size: 14px; letter-spacing: 1px; text-transform: uppercase; color: rgba(255,217,184,0.65); margin-top: 3px; }
.tinv-tip .tt-kind b { color: var(--tc); font-weight: normal; }
.tinv-tip .tt-rows { display: grid; grid-template-columns: 1fr auto; gap: 1px 10px; padding: 4px 12px; border-top: 1px solid rgba(255,150,70,0.18); }
.tinv-tip .tt-rows .k { color: rgba(255,217,184,0.6); font-size: 16px; }
.tinv-tip .tt-rows .v { text-align: right; }
.tinv-tip .tt-rows .v s { opacity: 0.45; margin-right: 4px; }
.tinv-tip .tt-rows .v.up { color: #7dff7d; }
.tinv-tip .tt-aff { padding: 3px 12px; color: #8fb8ff; font-size: 17px; border-top: 1px solid rgba(255,150,70,0.18); }
.tinv-tip .tt-flags { padding: 4px 12px 0; display: flex; flex-wrap: wrap; gap: 4px; }
.tinv-tip .tt-flags span { font-size: 13px; letter-spacing: 1px; padding: 1px 5px; border: 1px solid currentColor; text-transform: uppercase; }
.tinv-tip .tt-desc { padding: 5px 12px 0; font-size: 15px; color: rgba(255,217,184,0.7); font-style: italic; }
.tinv-tip .tt-keys { padding: 6px 12px 0; font-size: 13px; color: rgba(255,217,184,0.45); letter-spacing: 0.5px; }
`;

export function ensureInventoryStyles() {
  if (typeof document === 'undefined' || document.getElementById('tfg-inv-style')) return;
  const s = document.createElement('style');
  s.id = 'tfg-inv-style';
  s.textContent = CSS;
  document.head.appendChild(s);
}
