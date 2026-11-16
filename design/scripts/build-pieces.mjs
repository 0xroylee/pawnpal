// Generates the "pawnpal" friendly piece set (Pip's style) into design/assets/pieces/pawnpal/.
// 45×45 viewBox, file names wK.svg … bP.svg, same as cburnett, so react-chessboard can swap sets.
// Run: node design/scripts/build-pieces.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'pieces', 'pawnpal');
mkdirSync(out, { recursive: true });

const SIDES = {
  w: { body: '#FFF4DE', line: '#2E2A40', face: '#2E2A40', cheek: '#FFAD98', glint: '#FFFFFF' },
  b: { body: '#4A4566', line: '#1E1B2E', face: '#FFF4DE', cheek: '#FF8E78', glint: '#4A4566' },
};
const GOLD = '#FFC233';
const CORAL = '#FF6B4A';

const svg = (side, label, inner) => {
  const c = SIDES[side];
  const s = `stroke="${c.line}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45" role="img" aria-label="${label}">${inner(c, s)}</svg>\n`;
};

const base = (c, s, x = 10, w = 25) => `<rect x="${x}" y="36" width="${w}" height="5" rx="2.5" fill="${c.body}" ${s}/>`;

// Front-facing face centred on (cx, cy).
const face = (c, cx, cy, { cheeks = true, gap = 2.3 } = {}) =>
  `<circle cx="${cx - gap}" cy="${cy}" r="1.3" fill="${c.face}"/><circle cx="${cx + gap}" cy="${cy}" r="1.3" fill="${c.face}"/>` +
  `<path d="M${cx - 1.7} ${cy + 2.3} Q${cx} ${cy + 3.7} ${cx + 1.7} ${cy + 2.3}" fill="none" stroke="${c.face}" stroke-width="1.1" stroke-linecap="round"/>` +
  (cheeks ? `<ellipse cx="${cx - 4}" cy="${cy + 1.9}" rx="1.4" ry="0.9" fill="${c.cheek}" opacity=".8"/><ellipse cx="${cx + 4}" cy="${cy + 1.9}" rx="1.4" ry="0.9" fill="${c.cheek}" opacity=".8"/>` : '');

const PIECES = {
  P: ['pawn', (c, s) =>
    base(c, s, 12, 21) +
    `<path d="M15.2 36.5 C15.2 29.8 19.2 26.8 20.3 23 H24.7 C25.8 26.8 29.8 29.8 29.8 36.5 Z" fill="${c.body}" ${s}/>` +
    `<rect x="17.5" y="21" width="10" height="3.2" rx="1.6" fill="${c.body}" ${s}/>` +
    `<circle cx="22.5" cy="14.4" r="7.2" fill="${c.body}" ${s}/>` +
    face(c, 22.5, 14.6)],

  R: ['rook', (c, s) =>
    base(c, s) +
    `<path d="M14 36.5 L15.5 20 H29.5 L31 36.5 Z" fill="${c.body}" ${s}/>` +
    `<path d="M12.5 20.5 V11.5 H16.5 V14.5 H20.5 V11.5 H24.5 V14.5 H28.5 V11.5 H32.5 V20.5 Z" fill="${c.body}" ${s}/>` +
    face(c, 22.5, 25.5)],

  B: ['bishop', (c, s) =>
    base(c, s, 11, 23) +
    `<path d="M16.5 36.5 C16.5 31 19 29 19.5 26.5 H25.5 C26 29 28.5 31 28.5 36.5 Z" fill="${c.body}" ${s}/>` +
    `<path d="M22.5 6.5 C27.5 11 30.2 15 30.2 18.6 C30.2 22.6 26.9 24.8 22.5 24.8 C18.1 24.8 14.8 22.6 14.8 18.6 C14.8 15 17.5 11 22.5 6.5 Z" fill="${c.body}" ${s}/>` +
    `<rect x="17.5" y="23.8" width="10" height="3.2" rx="1.6" fill="${c.body}" ${s}/>` +
    `<circle cx="22.5" cy="5.2" r="2.1" fill="${c.body}" ${s}/>` +
    `<path d="M25 10.8 L22 14.6" fill="none" ${s}/>` +
    face(c, 22.5, 18.4)],

  N: ['knight', (c, s) =>
    base(c, s) +
    `<path d="M14.5 36.5 C14.5 31 17 28.5 19.5 26.5 C17.5 27 14 27.5 12 26 C10 24.5 10 21.5 11.5 20 L18 12.5 C19 11 20.5 10 21.5 9.5 L22 5.5 L25.5 9 C30.5 10.5 33.5 15 33.5 21 C33.5 28 31 31 31 36.5 Z" fill="${c.body}" ${s}/>` +
    `<path d="M25.5 9 C30.5 10.5 33.5 15 33.5 21 C33.5 28 31 31 31 36.5 L27.4 36.5 C27.8 31.5 29.6 28 29.6 22 C29.6 16.8 27.8 12.8 24.4 10.6 Z" fill="${CORAL}" ${s}/>` +
    `<circle cx="20.6" cy="15.2" r="1.5" fill="${c.face}"/><circle cx="21.1" cy="14.7" r=".5" fill="${c.glint}"/>` +
    `<circle cx="13.2" cy="22.2" r=".8" fill="${c.face}"/>` +
    `<path d="M13.6 25 Q15.6 26.1 17.6 25.2" fill="none" stroke="${c.face}" stroke-width="1.1" stroke-linecap="round"/>` +
    `<ellipse cx="19.6" cy="19.6" rx="1.7" ry="1" fill="${c.cheek}" opacity=".8"/>`],

  Q: ['queen', (c, s) =>
    base(c, s) +
    `<path d="M13.5 36.5 C13.5 30 17.5 27.5 19 24.5 H26 C27.5 27.5 31.5 30 31.5 36.5 Z" fill="${c.body}" ${s}/>` +
    `<rect x="17.5" y="23" width="10" height="3.2" rx="1.6" fill="${c.body}" ${s}/>` +
    `<circle cx="22.5" cy="17.6" r="6.4" fill="${c.body}" ${s}/>` +
    `<path d="M16 13.6 L14.6 6.8 L18.7 10.2 L22.5 5 L26.3 10.2 L30.4 6.8 L29 13.6 Z" fill="${GOLD}" ${s}/>` +
    `<circle cx="14.6" cy="6.2" r="1.4" fill="${GOLD}" ${s}/><circle cx="22.5" cy="4.3" r="1.4" fill="${GOLD}" ${s}/><circle cx="30.4" cy="6.2" r="1.4" fill="${GOLD}" ${s}/>` +
    face(c, 22.5, 18.2)],

  K: ['king', (c, s) =>
    base(c, s) +
    `<path d="M13 36.5 C13 30 17 27.5 18.5 24.5 H26.5 C28 27.5 32 30 32 36.5 Z" fill="${c.body}" ${s}/>` +
    `<rect x="17" y="23" width="11" height="3.2" rx="1.6" fill="${c.body}" ${s}/>` +
    `<circle cx="22.5" cy="17.6" r="6.4" fill="${c.body}" ${s}/>` +
    `<path d="M16.3 13.8 L15.8 8.6 L19.2 10.8 L22.5 8 L25.8 10.8 L29.2 8.6 L28.7 13.8 Z" fill="${GOLD}" ${s}/>` +
    `<path d="M21.3 1.6 H23.7 V3.6 H25.7 V6 H23.7 V8.6 H21.3 V6 H19.3 V3.6 H21.3 Z" fill="${GOLD}" ${s}/>` +
    face(c, 22.5, 18.2)],
};

let n = 0;
for (const side of ['w', 'b']) {
  for (const [code, [name, draw]] of Object.entries(PIECES)) {
    const label = `${side === 'w' ? 'white' : 'black'} ${name}`;
    writeFileSync(join(out, `${side}${code}.svg`), svg(side, label, draw));
    n++;
  }
}
console.log(`wrote ${n} pieces to ${out}`);
