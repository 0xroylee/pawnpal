// Generates design/tokens.json from the :root block of design/tokens.css.
// Run: node design/scripts/build-tokens-json.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(dir, 'tokens.css'), 'utf8');

const block = (selector) => {
  const start = css.indexOf(selector);
  const open = css.indexOf('{', start);
  return css.slice(open + 1, css.indexOf('\n}', open));
};
const read = (text) =>
  Object.fromEntries([...text.matchAll(/--pp-([\w-]+):\s*([^;]+);/g)].map(([, k, v]) => [k, v.replace(/\s+/g, ' ').trim()]));

const json = {
  $comment: 'Generated from tokens.css by scripts/build-tokens-json.mjs. Do not edit by hand.',
  base: read(block(':root')),
  bandOlder: read(block(".pp-app[data-band='older']")),
};
writeFileSync(join(dir, 'tokens.json'), JSON.stringify(json, null, 2) + '\n');
console.log(`wrote ${Object.keys(json.base).length} base tokens, ${Object.keys(json.bandOlder).length} older-band overrides`);
