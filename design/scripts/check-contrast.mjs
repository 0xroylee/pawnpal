// Checks WCAG contrast for the color pairs pawnpal actually uses.
// Run: node design/scripts/check-contrast.mjs   (exits 1 if any pair fails)
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'tokens.css'), 'utf8');
const root = css.slice(css.indexOf(':root'), css.indexOf('}', css.indexOf(':root')));
const tokens = Object.fromEntries([...root.matchAll(/--(pp-[\w-]+):\s*(#[0-9a-f]{6})\b/gi)].map((m) => [m[1], m[2]]));

const hex = (name) => {
  if (name.startsWith('#')) return name;
  if (!tokens[name]) throw new Error(`unknown token ${name}`);
  return tokens[name];
};
const lum = (h) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [x, y] = [lum(hex(a)), lum(hex(b))].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

// [foreground, background, minimum, where]
// 4.5 = normal text, 3 = large/bold text (≥ 18.66px bold) or UI graphics.
const PAIRS = [
  ['pp-ink', 'pp-surface', 4.5, 'body text on cards'],
  ['pp-ink', 'pp-paper', 4.5, 'body text on background'],
  ['pp-ink-2', 'pp-surface', 4.5, 'secondary text on cards'],
  ['pp-ink-2', 'pp-paper', 4.5, 'secondary text on background'],
  ['pp-ink', 'pp-surface-sunken', 4.5, 'result checklist'],
  ['#ffffff', 'pp-blue', 4.5, 'primary button label'],
  ['pp-ink', 'pp-sun', 4.5, 'reward button label'],
  ['pp-ink', 'pp-sun-soft', 4.5, 'suggestion banner'],
  ['pp-oops', 'pp-sun-soft', 4.5, '"NEW BADGE" label'],
  ['#ffffff', 'pp-great', 3, 'Great! icon'],
  ['#ffffff', 'pp-good', 3, 'Good icon'],
  ['pp-ink', 'pp-oops-fill', 3, 'Oops icon'],
  ['#ffffff', 'pp-bigoops', 3, 'Big oops icon'],
  ['pp-ink', 'pp-great-soft', 4.5, 'grade chip label'],
  ['pp-ink', 'pp-bigoops-soft', 4.5, 'grade chip label'],
  ['pp-ink', 'pp-hl-danger', 3, '"!" danger badge'],
  ['pp-board-coord-on-light', 'pp-board-light', 3, 'coordinates (bold, incidental)'],
  ['pp-board-coord-on-dark', 'pp-board-dark', 3, 'coordinates (bold, incidental)'],
  ['pp-arrow-better', 'pp-board-light', 3, 'better arrow on light square'],
  ['pp-arrow-halo', 'pp-board-dark', 3, 'arrow halo on dark square'],
  ['pp-blue', 'pp-surface', 3, 'focus ring on cards'],
];

let failed = 0;
for (const [fg, bg, min, where] of PAIRS) {
  const r = ratio(fg, bg);
  const ok = r >= min;
  if (!ok) failed++;
  console.log(`${ok ? 'pass' : 'FAIL'}  ${r.toFixed(2).padStart(5)}:1  (≥ ${min})  ${fg} on ${bg} — ${where}`);
}
console.log(failed ? `\n${failed} pair(s) below minimum` : '\nall pairs pass');
process.exit(failed ? 1 : 0);
