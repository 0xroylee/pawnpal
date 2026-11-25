// Generates Pip the Pawn SVGs, one per expression, into design/assets/pip/.
// Run: node design/scripts/build-pip.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'pip');
mkdirSync(out, { recursive: true });

const C = {
  ink: '#2E2A40',
  body: '#FFF4DE',
  shade: '#F2DDB6',
  scarf: '#FF6B4A',
  scarfDark: '#E04E30',
  cheek: '#FFAD98',
  gold: '#FFC233',
};

const stroke = `stroke="${C.ink}" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"`;

const body = `
  <ellipse cx="60" cy="133" rx="36" ry="5" fill="${C.ink}" opacity=".08"/>
  <rect x="24" y="112" width="72" height="17" rx="8.5" fill="${C.body}" ${stroke}/>
  <path d="M37 114 C37 96 46 85 49 72 H71 C74 85 83 96 83 114 Z" fill="${C.body}" ${stroke}/>
  <path d="M70 76 C73 88 79 97 80 112 H71 C71 98 70 86 66 76 Z" fill="${C.shade}"/>
  <circle cx="60" cy="38" r="28" fill="${C.body}" ${stroke}/>
  <path d="M82 26 A26 26 0 0 1 72 62 A28 28 0 0 0 82 26 Z" fill="${C.shade}"/>
  <ellipse cx="49" cy="24" rx="7" ry="4" fill="#fff" opacity=".7" transform="rotate(-20 49 24)"/>
  <rect x="38" y="64" width="44" height="12" rx="6" fill="${C.scarf}" ${stroke}/>
  <path d="M67 74 Q77 82 82 95 L72 91 Q70 83 63 76 Z" fill="${C.scarfDark}" ${stroke}/>`;

const cheeks = `
  <ellipse cx="43" cy="47" rx="4.5" ry="3" fill="${C.cheek}" opacity=".85"/>
  <ellipse cx="77" cy="47" rx="4.5" ry="3" fill="${C.cheek}" opacity=".85"/>`;

const eye = (x, y, r = 3.6) =>
  `<g class="eye"><circle cx="${x}" cy="${y}" r="${r}" fill="${C.ink}"/><circle cx="${x + r * 0.35}" cy="${y - r * 0.35}" r="${r * 0.32}" fill="#fff"/></g>`;

const sparkle = (x, y, s = 1) =>
  `<path transform="translate(${x} ${y}) scale(${s})" d="M0 -8 C1 -2 2 -1 8 0 C2 1 1 2 0 8 C-1 2 -2 1 -8 0 C-2 -1 -1 -2 0 -8 Z" fill="${C.gold}" stroke="${C.ink}" stroke-width="1.5" stroke-linejoin="round"/>`;

const faces = {
  happy: `
    ${eye(50, 38)}${eye(70, 38)}
    <path d="M52 47 Q60 54 68 47" fill="none" ${stroke}/>
    ${cheeks}`,

  thinking: `
    ${eye(53, 35, 3.4)}${eye(73, 35, 3.4)}
    <path d="M66 27 L76 25" fill="none" ${stroke}/>
    <path d="M54 50 Q58 48 62 50 T68 49" fill="none" ${stroke}/>
    <circle cx="98" cy="20" r="3" fill="${C.ink}" opacity=".35"/>
    <circle cx="106" cy="11" r="4" fill="${C.ink}" opacity=".35"/>
    ${cheeks}`,

  surprised: `
    ${eye(50, 37, 4.8)}${eye(70, 37, 4.8)}
    <path d="M44 27 Q50 23 56 27" fill="none" ${stroke}/>
    <path d="M64 27 Q70 23 76 27" fill="none" ${stroke}/>
    <ellipse cx="60" cy="50" rx="4" ry="5" fill="${C.ink}"/>`,

  cheering: `
    <path d="M45 39 Q50 33 55 39" fill="none" ${stroke}/>
    <path d="M65 39 Q70 33 75 39" fill="none" ${stroke}/>
    <path d="M50 45 Q60 59 70 45 Z" fill="${C.ink}" ${stroke}/>
    <ellipse cx="60" cy="51.5" rx="4.5" ry="2.5" fill="${C.scarf}"/>
    ${cheeks}
    ${sparkle(14, 30, 1.1)}${sparkle(106, 22, 0.9)}${sparkle(100, 52, 0.6)}`,

  encouraging: `
    ${eye(50, 38)}${eye(70, 38)}
    <path d="M44 29 Q49 27 54 29" fill="none" ${stroke}/>
    <path d="M66 29 Q71 27 76 29" fill="none" ${stroke}/>
    <path d="M50 47 Q60 55 70 47" fill="none" ${stroke}/>
    ${cheeks}
    <path transform="translate(102 22)" d="M0 4 C-6 -2 -10 2 -6 7 L0 12 L6 7 C10 2 6 -2 0 4 Z" fill="${C.scarf}" stroke="${C.ink}" stroke-width="1.5" stroke-linejoin="round"/>`,
};

for (const [name, face] of Object.entries(faces)) {
  const blink = name === 'happy' ? `
  <style>
    @media (prefers-reduced-motion: no-preference) {
      .eye { transform-box: fill-box; transform-origin: center; animation: blink 5s infinite; }
      @keyframes blink { 0%, 94%, 100% { transform: scaleY(1); } 96% { transform: scaleY(.1); } }
    }
  </style>` : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 140" role="img" aria-label="Pip the Pawn, ${name}">${blink}${body}${face}\n</svg>\n`;
  writeFileSync(join(out, `pip-${name}.svg`), svg);
}
console.log(`wrote ${Object.keys(faces).length} Pip SVGs to ${out}`);
