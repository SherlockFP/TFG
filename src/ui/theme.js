// UI2 art direction entry point: "company-issued equipment" (docs/wave4/ui2.md). Importing this file loads src/ui/theme.css
// and turns the layer on by adding class `tfg-ui` to <html>. Remove the class in devtools to compare with the old look.
// UI3 (wave 5): src/ui/ui3.css + class `tfg-ui3` = HUD overlap fixes and the remaining panels on the ui2 look (docs/wave5/ui3.md).
// Remove `tfg-ui3` to see the state before (ui2_shots.mjs --both3 does this from the same page state).
import './theme.css';
import './ui3.css';

if (typeof document !== 'undefined') document.documentElement.classList.add('tfg-ui', 'tfg-ui3');
// ARTDIR (wave 6): identity layer (logo kit, stamped panel headers, loading / death / report art). Class `tfg-artdir`, docs/wave6/artdir.md.
import './artdir.css';
import { initArtdir } from './artdir.js';
initArtdir();
