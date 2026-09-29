// UI2 art direction entry point: "company-issued equipment" (docs/wave4/ui2.md). Importing this file loads src/ui/theme.css
// and turns the layer on by adding class `tfg-ui` to <html>. Remove the class in devtools to compare with the old look.
import './theme.css';

if (typeof document !== 'undefined') document.documentElement.classList.add('tfg-ui');
