// Functional ordinary lamps share one restrained work-light palette. Intentional liminal palettes remain authored.
export const WORKLIGHT38=0xe6ded0;
export function neutralLighting38(layout){return !['backrooms','nullreception','darkweb','funhouse'].includes(layout?.theme);}
export function normalizeLights38(layout,emitters){
 if(!neutralLighting38(layout))return;
 for(const e of emitters){if(e.group==='facility'){e.color=WORKLIGHT38;e.flicker=0;}else if(e.group==='exit'){e.color=0xc6cbb7;e.flicker=0;}}
}
