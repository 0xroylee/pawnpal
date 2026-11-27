// Pawnpal 12 s sting. seek(f) draws frame f (29.97 fps numbering, fractional
// frames allowed) as a pure function of f. No timers, transitions or randomness.

import { Chess } from "/node_modules/chess.js/dist/esm/chess.js";

const stage = document.getElementById("stage");

// ---------------------------------------------------------------- constants

const C = {
  paper: "#FAF7F2",
  surface: "#FFFFFF",
  sunken: "#F3EFE7",
  line: "#E7E1D6",
  ink: "#2E2A40",
  ink2: "#5E5A70",
  ink3: "#8C889C",
  blue: "#2563EB",
  blueEdge: "#1A49B8",
  ice: "#E8EFFF",
  haze: "#C7D7F7",
  sky0: "#1A49B8",
  sky1: "#6F95E8",
  sun: "#FFC233",
  good: "#13855A",
  oops: "#F59E0B",
  bigoops: "#D23C41",
  coral: "#FF6B4A",
  threat: "#F97316",
  light: "#EDEFD6",
  dark: "#74985A",
};

const T = {
  name: "Pawnpal",
  tagline: "Learn chess with an AI coach",
  warn: "Look at what the rook can attack.",
  pip: "Can your knight stay safe here?",
  hint1: "Take a look at your rook.",
  hint2: "Your pawn needs protection.",
  hint3: "Try the move shown by the arrow.",
  praise: "That's better. Your pawn is safe now.",
  review1: "Nice save. Your pawn can stay on the board.",
  review2: "Your pawn could have won the opponent's bishop there.",
};

// Verified by tools/sting/position.mjs: 10.Nf5 is a blunder, Re1 is best.
const FEN =
  "r1bqr1k1/ppp2pbp/2np1np1/8/2BNP3/2N1B2P/PPP2PP1/R2Q1RK1 w - - 1 10";

const A = { pieces: {}, pips: {} }; // SVG assets
let PRE, P0, P1, P2, M2, KN; // board positions and the knight's legal targets

// ---------------------------------------------------------------- math

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = {
  lin: (t) => t,
  in2: (t) => t * t,
  in3: (t) => t * t * t,
  out2: (t) => 1 - (1 - t) ** 2,
  out3: (t) => 1 - (1 - t) ** 3,
  out5: (t) => 1 - (1 - t) ** 5,
  io: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  sine: (t) => 0.5 - 0.5 * Math.cos(Math.PI * t),
  // Beta(2,4) CDF: velocity peaks a quarter of the way through.
  b24: (t) => 1 - (1 - t) ** 5 - 5 * t * (1 - t) ** 4,
};
const E = (e) => (typeof e === "function" ? e : ease[e]);

// Segment-eased keyframes: [[frame, value, easeIntoNext?], ...].
function kf(f, table, e = "io") {
  if (f <= table[0][0]) return table[0][1];
  for (let i = 0; i < table.length - 1; i++) {
    const [a, va, ea] = table[i];
    const [b, vb] = table[i + 1];
    if (f <= b) return lerp(va, vb, E(ea ?? e)(clamp((f - a) / (b - a))));
  }
  return table[table.length - 1][1];
}

// Monotone cubic (Fritsch–Carlson) through keyframes. Before the first key
// the value holds; after the last it continues at the end slope when
// `extend` is set, so drifts keep moving.
function spline(table, { s0, s1, extend = false, before = false } = {}) {
  const xs = table.map((p) => p[0]);
  const ys = table.map((p) => p[1]);
  const n = xs.length;
  const d = [];
  for (let i = 0; i < n - 1; i++)
    d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  const m = new Array(n);
  m[0] = s0 ?? d[0];
  m[n - 1] = s1 ?? d[n - 2];
  for (let i = 1; i < n - 1; i++)
    m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const tau = 3 / Math.sqrt(s);
      m[i] = tau * a * d[i];
      m[i + 1] = tau * b * d[i];
    }
  }
  return (f) => {
    if (f <= xs[0]) return before ? ys[0] + m[0] * (f - xs[0]) : ys[0];
    if (f >= xs[n - 1])
      return extend ? ys[n - 1] + m[n - 1] * (f - xs[n - 1]) : ys[n - 1];
    let i = 0;
    while (f > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i];
    const t = (f - xs[i]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * ys[i] +
      (t3 - 2 * t2 + t) * h * m[i] +
      (-2 * t3 + 3 * t2) * ys[i + 1] +
      (t3 - t2) * h * m[i + 1]
    );
  };
}

// Exponential ease-out from v0 (frame f0) to v1 (frame f1); each frame covers
// k of the remaining distance, normalised so it lands exactly on f1.
function settle(f, f0, f1, v0, v1, k = 0.16) {
  if (f <= f0) return v0;
  if (f >= f1) return v1;
  const r = 1 - k;
  return lerp(v0, v1, (1 - r ** (f - f0)) / (1 - r ** (f1 - f0)));
}

const vel = (fn, f) => (fn(f + 0.25) - fn(f - 0.25)) * 2;

function hex(c) {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a, b, t) {
  const x = hex(a);
  const y = hex(b);
  return `rgb(${x.map((v, i) => Math.round(lerp(v, y[i], clamp(t)))).join(",")})`;
}
const px = (v) => `${v.toFixed(3)}px`; // sub-pixel precision so slow moves never step

// ---------------------------------------------------------------- filters

let filters = [];
// Directional Gaussian blur (SVG feGaussianBlur with separate x/y).
function smear(sx, sy) {
  if (sx < 0.05 && sy < 0.05) return "";
  const id = `f${filters.length}`;
  filters.push(
    `<filter id="${id}" filterUnits="userSpaceOnUse" x="-1600" y="-1600" width="4300" height="4300" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="${sx.toFixed(2)} ${sy.toFixed(2)}"/></filter>`,
  );
  return `url(#${id})`;
}
const blur = (r) => (r < 0.05 ? "" : `blur(${r.toFixed(2)}px)`);
const flt = (...parts) => {
  const s = parts.filter(Boolean).join(" ");
  return s ? `filter:${s};` : "";
};

// ---------------------------------------------------------------- art

function cursor(x, y, { rot = 0, scale = 1, op = 1, sy = 0, sx = 0 } = {}) {
  return `<div class="abs" style="left:${px(x - 4)};top:${px(y - 3)};width:34px;height:42px;transform-origin:4px 3px;transform:rotate(${rot.toFixed(2)}deg) scale(${scale.toFixed(3)});opacity:${op};${flt(smear(sx, sy))}">
  <svg width="34" height="42" viewBox="0 0 34 42" style="overflow:visible;filter:drop-shadow(0 2px 2.5px rgba(0,0,0,.3))"><path d="M4 3 L4 32 L10.7 25.6 L15.2 36.2 L20.2 34.1 L15.7 23.7 L24.9 23.7 Z" fill="#000" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/></svg></div>`;
}

// One-colour Pip line mark. viewBox covers Pip from head to base.
function pipMark(color, size, { sw = 3.6, eye = 1 } = {}) {
  const h = size;
  const w = (size * 88) / 128;
  const ey = (cx) =>
    `<ellipse cx="${cx}" cy="38" rx="3.9" ry="${(3.9 * eye).toFixed(2)}" fill="${color}"/>`;
  return `<svg width="${w.toFixed(2)}" height="${h.toFixed(2)}" viewBox="16 6 88 128" style="display:block;overflow:visible"><g fill="none" stroke="${color}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round">
  <rect x="24" y="112" width="72" height="17" rx="8.5"/>
  <path d="M37 114 C37 96 46 85 49 72 H71 C74 85 83 96 83 114 Z"/>
  <circle cx="60" cy="38" r="28"/>
  <rect x="38" y="64" width="44" height="12" rx="6" fill="${color}"/>
  <path d="M67 74 Q77 82 82 95 L72 91 Q70 83 63 76 Z" fill="${color}"/>
  <path d="M52 47 Q60 54 68 47"/></g>${ey(50)}${ey(70)}</svg>`;
}

// Full-colour Pip from design/assets/pip/pip-happy.svg; eye = blink scale.
function pipFull(w, h, eye = 1, extra = "", expr = "happy") {
  let k = 0;
  const body = (A.pips[expr] ?? A.pip).replace(/<g class="eye">/g, () => {
    const cx = k++ === 0 ? 50 : 70;
    return `<g transform="translate(${cx} 38) scale(1 ${eye.toFixed(3)}) translate(${-cx} -38)">`;
  });
  return `<svg width="${w}" height="${h}" viewBox="0 0 120 140" ${extra}>${body}</svg>`;
}

const sqc = (s, sq) => [
  (s.charCodeAt(0) - 97 + 0.5) * sq,
  (8 - +s[1] + 0.5) * sq,
];

function arrow(from, to, sq, color, dashed) {
  const [x0, y0] = sqc(from, sq);
  const [x1, y1] = sqc(to, sq);
  const dx = x1 - x0;
  const dy = y1 - y0;
  const L = Math.hypot(dx, dy);
  const ux = dx / L;
  const uy = dy / L;
  const hl = sq * 0.42;
  const hw = sq * 0.4;
  const bx = x1 - ux * (hl + sq * 0.08);
  const by = y1 - uy * (hl + sq * 0.08);
  const tx = x1 - ux * sq * 0.08;
  const ty = y1 - uy * sq * 0.08;
  const head = `${tx},${ty} ${bx - uy * hw * 0.5},${by + ux * hw * 0.5} ${bx + uy * hw * 0.5},${by - ux * hw * 0.5}`;
  const sx = x0 + ux * sq * 0.18;
  const sy = y0 + uy * sq * 0.18;
  const lw = sq * 0.15;
  const dash = dashed ? `stroke-dasharray="${sq * 0.22} ${sq * 0.16}"` : "";
  return `<g opacity="0.92"><line x1="${sx}" y1="${sy}" x2="${bx}" y2="${by}" stroke="#fff" stroke-width="${lw + sq * 0.08}" stroke-linecap="round" ${dash}/><polygon points="${head}" fill="#fff" stroke="#fff" stroke-width="${sq * 0.08}" stroke-linejoin="round"/>
  <line x1="${sx}" y1="${sy}" x2="${bx + ux * 2}" y2="${by + uy * 2}" stroke="${color}" stroke-width="${lw}" stroke-linecap="${dashed ? "butt" : "round"}" ${dash}/><polygon points="${head}" fill="${color}"/></g>`;
}

// Grade tile glyphs (white), drawn in a 100x100 box.
function glyph(kind, color = "#fff") {
  if (kind === "star")
    return `<path d="M50 16 L59.6 37.6 L83 39.8 L65.3 55.4 L70.6 78.4 L50 66.4 L29.4 78.4 L34.7 55.4 L17 39.8 L40.4 37.6 Z" fill="${color}" stroke="${color}" stroke-width="6" stroke-linejoin="round"/>`;
  if (kind === "check")
    return `<path d="M27 52 L43 68 L74 34" fill="none" stroke="${color}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>`;
  const txt = kind === "q" ? "?" : "!!";
  return `<text x="50" y="74" text-anchor="middle" font-family="Nunito" font-weight="900" font-size="66" fill="${color}" letter-spacing="${kind === "q" ? 0 : -4}">${txt}</text>`;
}
const TILES = [
  { bg: "#FFFFFF", g: "star", gc: C.sun, edge: true },
  { bg: C.good, g: "check" },
  { bg: C.oops, g: "q" },
  { bg: C.bigoops, g: "x" },
];
function tile(t, size) {
  const shadow = t.edge
    ? `box-shadow:0 0 0 1px ${C.line},0 6px 16px rgba(46,42,64,.10);`
    : `box-shadow:0 6px 16px rgba(46,42,64,.14);`;
  return `<div style="width:${px(size)};height:${px(size)};border-radius:${px((size * 26) / 92)};background:${t.bg};${shadow}"><svg width="100%" height="100%" viewBox="0 0 100 100">${glyph(t.g, t.gc ?? "#fff")}</svg></div>`;
}

function appIcon(size) {
  return `<div style="width:${px(size)};height:${px(size)};border-radius:${px(size * 0.28)};background:linear-gradient(165deg,#3B3656 0%,${C.ink} 45%,#1F1C2E 100%);box-shadow:inset 0 ${px(size * 0.012)} 0 rgba(255,255,255,.18),0 ${px(size * 0.06)} ${px(size * 0.14)} rgba(31,28,46,.25);display:flex;align-items:center;justify-content:center">${pipMark("#fff", size * 0.66, { sw: 3.8 })}</div>`;
}

// ---------------------------------------------------------------- chess UI

const SEL = "rgba(255,214,79,.85)";
const LAST = "rgba(255,214,79,.6)";
const HINT = "rgba(37,99,235,.25)";
const tl = (s, sq) => [(s.charCodeAt(0) - 97) * sq, (8 - +s[1]) * sq];
const ctr = (s, sq) => [
  (s.charCodeAt(0) - 97 + 0.5) * sq,
  (8 - +s[1] + 0.5) * sq,
];
const pieceSvg = (key, x, y, size) =>
  A.pieces[key].replace(
    "<svg ",
    `<svg x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${size.toFixed(2)}" height="${size.toFixed(2)}" `,
  );

function badge(sqn, sq, kind, sc) {
  if (sc <= 0.01) return "";
  const [x, y] = tl(sqn, sq);
  const s = sq * 0.42;
  const bg = kind === "check" ? C.good : C.bigoops;
  return `<g transform="translate(${x + sq * 0.84} ${y + sq * 0.16}) scale(${sc.toFixed(3)})"><rect x="${-s / 2}" y="${-s / 2}" width="${s}" height="${s}" rx="${s * 0.3}" fill="${bg}" stroke="#fff" stroke-width="${sq * 0.04}"/><svg x="${-s / 2}" y="${-s / 2}" width="${s}" height="${s}" viewBox="0 0 100 100">${glyph(kind, "#fff")}</svg></g>`;
}

function dangerRing(sqn, sq, sc = 1, op = 1) {
  const [cx, cy] = ctr(sqn, sq);
  const r = sq * 0.44 * sc;
  return `<g opacity="${op.toFixed(3)}"><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#fff" stroke-width="${sq * 0.13}"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${C.coral}" stroke-width="${sq * 0.07}"/></g>`;
}

// The Pawnpal board. pos maps square -> piece key.
function gameBoard(sq, pos, o = {}) {
  const {
    tints = {},
    outline = [],
    dots = [],
    caps = [],
    rings = [],
    arrows = [],
    hide = [],
    badges = [],
    uid = "b",
    dotOp = 1,
  } = o;
  const S = sq * 8;
  let s = `<defs><clipPath id="bc${uid}"><rect width="${S}" height="${S}" rx="${(sq * 14) / 75}"/></clipPath></defs><g clip-path="url(#bc${uid})">`;
  for (let r = 0; r < 8; r++)
    for (let f = 0; f < 8; f++)
      s += `<rect x="${f * sq}" y="${(7 - r) * sq}" width="${sq + 0.5}" height="${sq + 0.5}" fill="${(f + r) % 2 === 0 ? C.dark : C.light}"/>`;
  for (const [k, c] of Object.entries(tints)) {
    const [x, y] = tl(k, sq);
    s += `<rect x="${x}" y="${y}" width="${sq}" height="${sq}" fill="${c}"/>`;
  }
  for (const k of outline) {
    const [x, y] = tl(k, sq);
    const w = sq * 0.055;
    s += `<rect x="${x + w / 2}" y="${y + w / 2}" width="${sq - w}" height="${sq - w}" fill="none" stroke="${C.blue}" stroke-width="${w}"/>`;
  }
  s += "</g>";
  for (const k of dots) {
    const [cx, cy] = ctr(k, sq);
    s += `<circle cx="${cx}" cy="${cy}" r="${sq * 0.16}" fill="rgba(46,42,64,${(0.22 * dotOp).toFixed(3)})"/>`;
  }
  for (const k of caps) {
    const [cx, cy] = ctr(k, sq);
    s += `<circle cx="${cx}" cy="${cy}" r="${sq * 0.43}" fill="none" stroke="rgba(46,42,64,${(0.22 * dotOp).toFixed(3)})" stroke-width="${sq * 0.08}"/>`;
  }
  for (const [k, sc, op] of rings) s += dangerRing(k, sq, sc, op);
  const pad = sq * 0.04;
  for (const [k, key] of Object.entries(pos)) {
    if (hide.includes(k)) continue;
    const [x, y] = tl(k, sq);
    s += pieceSvg(key, x + pad, y + pad, sq - 2 * pad);
  }
  for (const a of arrows) s += arrow(a[0], a[1], sq, a[2], a[3]);
  for (const [k, kind, sc] of badges) s += badge(k, sq, kind, sc);
  return s;
}

// A piece held by the cursor: lifted, leaning, with a soft shadow.
function heldPiece(key, cx, cy, sq, lift, lean) {
  const s = sq * 0.92;
  const sh = (lift - 1) * sq * 1.6;
  return `<g transform="translate(${cx.toFixed(2)} ${cy.toFixed(2)})"><ellipse cx="${-sq * 0.08 - sh * 0.84}" cy="${sq * 0.36 + sh * 0.25}" rx="${sq * 0.3}" ry="${sq * 0.09}" fill="rgba(46,42,64,${(0.1 + (lift - 1) * 1.2).toFixed(3)})"/><g transform="rotate(${lean.toFixed(2)}) scale(${lift.toFixed(3)})">${pieceSvg(key, -s / 2, -s / 2, s)}</g></g>`;
}

function avatar(kind, size) {
  const g =
    kind === "robot"
      ? `<rect x="11" y="14" width="18" height="14" rx="4" fill="none" stroke="${C.ink}" stroke-width="2.6"/><circle cx="16.5" cy="21" r="1.8" fill="${C.ink}"/><circle cx="23.5" cy="21" r="1.8" fill="${C.ink}"/><path d="M20 14v-4M20 9.5a1 1 0 1 0 0 .1" stroke="${C.ink}" stroke-width="2.4" stroke-linecap="round"/>`
      : `<circle cx="20" cy="15.5" r="5" fill="none" stroke="${C.ink}" stroke-width="2.6"/><path d="M11 30c0-5 4-8 9-8s9 3 9 8" fill="none" stroke="${C.ink}" stroke-width="2.6" stroke-linecap="round"/>`;
  return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:#FFF4DE;box-shadow:0 0 0 2px #fff,0 0 0 3px ${C.line};flex:none"><svg width="${size}" height="${size}" viewBox="0 0 40 40">${g}</svg></div>`;
}

function kidButton(label, { blue = false, sink = 0, h = 56, font = 24 } = {}) {
  const edge = 4 * (1 - sink);
  return `<div style="height:${h}px;padding:0 24px;border-radius:18px;font:800 ${font}px/${h}px Nunito;white-space:nowrap;transform:translateY(${(4 - edge).toFixed(2)}px);background:${blue ? C.blue : "#fff"};color:${blue ? "#fff" : C.ink};box-shadow:0 ${edge.toFixed(2)}px 0 ${blue ? C.blueEdge : C.line}${blue ? "" : `,inset 0 0 0 2px ${C.line}`}">${label}</div>`;
}

// Partial arrow that grows from the start square.
function growArrow(from, to, sq, color, dashed, t) {
  if (t <= 0.02) return "";
  if (t >= 0.999) return arrow(from, to, sq, color, dashed);
  // The full arrow, clipped to the grown length.
  const [x0, y0] = sqc(from, sq);
  const [x1, y1] = sqc(to, sq);
  const L = Math.hypot(x1 - x0, y1 - y0) * ease.out3(t) + sq * 0.3;
  const ang = (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI;
  return `<defs><clipPath id="ga${from}${to}"><rect x="0" y="${-sq}" width="${L.toFixed(1)}" height="${2 * sq}" transform="translate(${x0} ${y0}) rotate(${ang.toFixed(2)})"/></clipPath></defs><g clip-path="url(#ga${from}${to})">${arrow(from, to, sq, color, dashed)}</g>`;
}

// ---------------------------------------------------------------- storybook

const FPS = 29.97;
let NOW_REAL = 0;
// The scenes were laid out on a 40 s clock; this warp plays them on the 30 s
// narration timeline. [real seconds, scene seconds]
const WARP = spline(
  [
    [0, 0],
    [2.3, 2.6],
    [3.2, 3.7],
    [3.5, 3.9],
    [5.0, 5.9],
    [5.3, 6.25],
    [5.9, 7.0],
    [6.8, 7.9],
    [7.5, 8.6],
    [8.15, 9.45],
    [8.85, 10.35],
    [9.05, 10.6],
    [11.2, 12.4],
    [12.25, 13.15],
    [12.35, 13.6],
    [13.7, 16.2],
    [14.4, 17.4],
    [15.5, 19.0],
    [16.7, 20.4],
    [17.35, 21.4],
    [18.4, 22.15],
    [18.65, 22.75],
    [19.0, 23.2],
    [19.4, 24.2],
    [19.95, 25.3],
    [20.45, 26.3],
    [20.75, 27.0],
    [21.15, 27.55],
    [22.8, 30.9],
    [23.85, 31.65],
    [25.2, 33.7],
    [25.4, 34.0],
    [26.6, 36.0],
    [27.6, 37.0],
    [30.03, 40.04],
  ],
  { extend: true },
);
// Page turns run on real time so every turn gets the same smooth, even motion.
const TLR = {
  open: [1.2, 2.1], // the hard cover swings open
  title: [2.9, 3.85], // the title page turns into chapter 1
  turns: [
    [11.2, 12.25],
    [17.35, 18.4],
    [22.8, 23.85],
  ],
  close: [26.6, 27.6],
};
const PG = { w: 500, h: 700, top: 190, spine: 540 };
const PAPER = "#FFFBF3";
const FADED = "#CFC6B6";
const BSQ = 52.5; // right-page board squares
const BOARD = [PG.spine + 40, PG.top + 80]; // right-page board, world px
const sqW = (s) => {
  const [x, y] = ctr(s, BSQ);
  return [BOARD[0] + x, BOARD[1] + y];
};
const L = (x, y, side) => [
  x + (side === "L" ? PG.spine - PG.w : PG.spine),
  y + PG.top,
]; // page-local -> world
const typed = (text, t, t0, cps = 36) =>
  text.slice(0, clamp(Math.round((t - t0) * cps), 0, text.length));
const popS = (t, t0, from = 0.7) =>
  t < t0
    ? 0
    : kf(
        t,
        [
          [t0, from],
          [t0 + 0.1, 1.06],
          [t0 + 0.2, 1],
        ],
        "out2",
      );

// Read-along paragraph: words darken as the narrator reaches them.
function readAlong(i, _t, { dropCap = false, size = 30 } = {}) {
  const t = NOW_REAL; // narration runs on real time, not the warped scene time
  const line = STORY.lines[i];
  const words = line.text.split(" ");
  const total = line.text.length;
  let c = 0;
  return words
    .map((w, j) => {
      const at = line.start + 0.05 + line.dur * 0.94 * (c / total);
      c += w.length + 1;
      const col = mix(FADED, C.ink, clamp((t - at) / 0.14));
      if (dropCap && j === 0)
        return `<span style="float:left;font:900 ${size * 2.5}px/0.86 Nunito;color:${mix("#B9C9F2", C.blue, clamp((t - at) / 0.14))};margin:4px 8px 0 0">${w[0]}</span><span style="color:${col}">${w.slice(1)}</span>`;
      return `<span style="color:${col}">${w}</span>`;
    })
    .join(" ");
}

function pageBase(side, num, content) {
  const spineShade =
    side === "L"
      ? "linear-gradient(to left,rgba(46,42,64,.18),rgba(46,42,64,0) 70px)"
      : "linear-gradient(to right,rgba(46,42,64,.20),rgba(46,42,64,0) 70px)";
  return `<div class="abs" style="left:0;top:0;width:${PG.w}px;height:${PG.h}px;background:${PAPER};overflow:hidden;border-radius:${side === "L" ? "10px 0 0 10px" : "0 10px 10px 0"}">
    <svg class="abs" style="left:0;top:0" width="${PG.w}" height="${PG.h}"><filter id="pp${side}${num}"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="3" seed="${num * 7 + 3}"/><feColorMatrix values="0 0 0 0 .55  0 0 0 0 .45  0 0 0 0 .3  0 0 0 .07 0"/></filter><rect width="100%" height="100%" filter="url(#pp${side}${num})"/></svg>
    ${content}
    <div class="abs" style="left:0;bottom:22px;width:100%;text-align:center;font:700 16px Nunito;color:${C.ink3}">${num}</div>
    <div class="abs" style="inset:0;background:${spineShade};pointer-events:none"></div>
  </div>`;
}

function chapter(n, title) {
  return `<div class="abs" style="left:50px;top:50px;font:900 17px Nunito;letter-spacing:.2em;color:${C.blue}">CHAPTER ${n}</div>
  <div class="abs" style="left:50px;top:76px;width:410px;font:900 40px/46px Nunito;color:${C.ink}">${title}</div>
  <svg class="abs" style="left:50px;top:132px" width="120" height="10"><path d="M2 5 Q 30 0 60 5 T 118 5" fill="none" stroke="${C.sun}" stroke-width="4" stroke-linecap="round"/></svg>`;
}
const paras = (html) =>
  `<div class="abs" style="left:50px;top:158px;width:405px;font:700 30px/42px Nunito">${html}</div>`;

function pipAt(x, y, w, expr, s = 1, extra = "") {
  const h = (w * 140) / 120;
  return `<div class="abs" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;transform-origin:50% 100%;transform:scale(${s.toFixed(6)});${extra}">${pipFull(w, h, 1, "", expr)}</div>`;
}
function bookBubble(html, { x, y, w, s = 1, op = 1, size = 24 }) {
  if (op <= 0.01 || s <= 0.01) return "";
  return `<div class="abs" style="left:${x}px;top:${y}px;width:${w}px;padding:16px 20px;border-radius:24px;background:#fff;box-shadow:0 0 0 1.5px ${C.line},-6px 5px 14px rgba(46,42,64,.10);font:800 ${size}px/${Math.round(size * 1.3)}px Nunito;color:${C.ink};transform-origin:0 70%;transform:scale(${s.toFixed(6)});opacity:${op.toFixed(3)}">
    <div class="abs" style="left:-9px;top:46px;width:20px;height:20px;background:#fff;transform:rotate(45deg);box-shadow:-1.5px 1.5px 0 ${C.line};border-radius:3px"></div><div style="position:relative">${html}</div></div>`;
}
const caret = `<span style="display:inline-block;width:3px;height:22px;margin-left:2px;vertical-align:-3px;background:${C.blue};border-radius:2px"></span>`;

function pageBoard(pos, opts, held, extra = "", { you = true, help = 0 } = {}) {
  const hp = held
    ? heldPiece(
        held.key,
        held.x - BOARD[0],
        held.y - BOARD[1],
        BSQ,
        held.lift,
        held.lean,
      )
    : "";
  return `<div class="abs" style="left:40px;top:40px;display:flex;align-items:center;gap:10px;font:800 20px Nunito;color:${C.ink}">${avatar("robot", 34)}Computer</div>
  <svg class="abs" style="left:40px;top:80px;overflow:visible;filter:drop-shadow(-6px 5px 10px rgba(46,42,64,.16))" width="420" height="420">${gameBoard(BSQ, pos, opts)}${extra}${hp}</svg>
  ${you ? `<div class="abs" style="left:40px;top:514px;width:420px;display:flex;align-items:center;gap:10px;font:800 20px Nunito;color:${C.ink}">${avatar("you", 34)}You<div style="margin-left:auto">${kidButton("More help", { font: 18, h: 42, sink: help })}</div></div>` : ""}`;
}

// ------------------------------------------------ the cover

function cover() {
  let squares = "";
  for (let i = 0; i < 10; i++)
    squares += `<rect x="${i * 40}" y="0" width="40" height="40" fill="${i % 2 ? "rgba(255,244,222,.16)" : "rgba(255,244,222,.05)"}"/><rect x="${i * 40}" y="40" width="40" height="40" fill="${i % 2 ? "rgba(255,244,222,.05)" : "rgba(255,244,222,.16)"}"/>`;
  const star = (x, y, s) =>
    `<svg class="abs" style="left:${x}px;top:${y}px" width="${s}" height="${s}" viewBox="0 0 100 100">${glyph("star", C.sun)}</svg>`;
  return `<div class="abs" style="left:0;top:0;width:${PG.w}px;height:${PG.h}px;border-radius:6px 14px 14px 6px;background:linear-gradient(160deg,#3B3656 0%,${C.ink} 48%,#1F1C2E 100%);overflow:hidden;box-shadow:inset 6px 0 0 rgba(0,0,0,.25)">
    <div class="abs" style="inset:24px;border:2.5px solid rgba(255,194,51,.55);border-radius:18px"></div>
    <div class="abs" style="left:0;top:92px;width:100%;text-align:center;font:900 76px/1 Nunito;color:#FFF4DE">Sam &amp; Pip</div>
    <div class="abs" style="left:0;top:182px;width:100%;text-align:center;font:800 26px Nunito;letter-spacing:.08em;color:${C.sun}">A PAWNPAL STORY</div>
    <div class="abs" style="left:${250 - 135}px;top:250px;width:270px;height:270px;border-radius:50%;background:radial-gradient(circle,#FFF4DE 0%,#FFE9C4 100%);box-shadow:0 0 0 8px rgba(255,194,51,.25);display:flex;align-items:center;justify-content:center">${pipFull(170, 198, 1, "", "happy")}</div>
    ${star(78, 300, 34)}${star(392, 268, 26)}${star(400, 470, 38)}${star(62, 470, 22)}
    <svg class="abs" style="left:50px;top:578px" width="400" height="80">${squares}</svg>
  </div>`;
}

// The inside of the front board: a patterned endpaper (pastedown), as in a
// real hardcover. The story never starts on the back of the cover.
function pastedown() {
  const motif = `<pattern id="ep" width="84" height="84" patternUnits="userSpaceOnUse"><rect width="84" height="84" fill="#DCE7FF"/>
    <g transform="translate(14 12) scale(.24)" opacity=".55">${A.pieces.wP.replace(/<svg[^>]*>/, "").replace("</svg>", "")}</g>
    <path d="M62 52 L65 59 L72 60 L67 65 L68 72 L62 68 L56 72 L57 65 L52 60 L59 59 Z" fill="#fff" opacity=".8"/></pattern>`;
  return `<div class="abs" style="left:0;top:0;width:${PG.w}px;height:${PG.h}px;border-radius:10px 0 0 10px;overflow:hidden">
    <svg class="abs" style="left:0;top:0" width="${PG.w}" height="${PG.h}"><defs>${motif}</defs><rect width="100%" height="100%" fill="url(#ep)"/></svg>
    <div class="abs" style="inset:0;background:linear-gradient(to left,rgba(46,42,64,.18),rgba(46,42,64,0) 70px)"></div></div>`;
}
// The first leaf: a title page, which turns like paper into chapter 1.
function titlePage() {
  return pageBase(
    "R",
    1,
    `<div class="abs" style="left:0;top:120px;width:${PG.w}px;text-align:center;font:900 64px/1 Nunito;color:${C.ink}">Sam &amp; Pip</div>
    <div class="abs" style="left:0;top:200px;width:${PG.w}px;text-align:center;font:800 20px Nunito;letter-spacing:.14em;color:${C.blue}">A PAWNPAL STORY</div>
    <svg class="abs" style="left:${PG.w / 2 - 60}px;top:236px" width="120" height="10"><path d="M2 5 Q 30 0 60 5 T 118 5" fill="none" stroke="${C.sun}" stroke-width="4" stroke-linecap="round"/></svg>
    <div class="abs" style="left:${PG.w / 2 - 80}px;top:290px">${pipFull(160, 187, 1, "", "happy")}</div>
    <div class="abs" style="left:0;top:560px;width:${PG.w}px;text-align:center;font:700 18px Nunito;color:${C.ink3}">Learn chess with an AI coach</div>`,
  );
}

// ------------------------------------------------ spread A: Pip sees danger

const A_D4 = () => sqW("d4");
const A_F5 = () => sqW("f5");
function Aknight(t) {
  const a = A_D4();
  const b = A_F5();
  if (t <= 9.6) return a;
  if (t >= 10.3) return b;
  const k = ease.io((t - 9.6) / 0.7);
  const c = [lerp(a[0], b[0], 0.5), Math.min(a[1], b[1]) - 90];
  const u = 1 - k;
  return [
    u * u * a[0] + 2 * u * k * c[0] + k * k * b[0],
    u * u * a[1] + 2 * u * k * c[1] + k * k * b[1],
  ];
}
function Acursor(t) {
  const [kx, ky] = A_D4();
  if (t <= 9.45)
    return [
      settle(t * FPS, 8.6 * FPS, 9.15 * FPS, 1120, kx + 8, 0.17),
      settle(t * FPS, 8.6 * FPS, 9.15 * FPS, 1010, ky + 10, 0.17),
    ];
  const [x, y] = Aknight(Math.max(9.45, t - 0.02));
  const d = Math.max(0, t - 10.35) * FPS;
  return [x + 8 + d * 1.4, y + 10 + d * 0.9];
}
function A_left(t) {
  const expr = t >= 10.6 ? "surprised" : "happy";
  const ps = t >= 10.6 ? popS(t, 10.6, 0.9) : 1;
  const bOp = clamp((t - 7.0) / 0.06) * (1 - clamp((t - 9.4) / 0.15));
  return pageBase(
    "L",
    2,
    `${chapter(1, "Pip sees danger")}${paras(`${readAlong(1, t, { dropCap: true })}<div style="height:14px"></div>${readAlong(2, t)}`)}
    ${pipAt(40, 520, 104, expr, ps)}
    ${bookBubble(`${typed(T.warn, t, 7.05)}${t < 8.1 ? caret : ""}`, { x: 170, y: 492, w: 280, s: popS(t, 7.0), op: bOp })}`,
  );
}
function A_right(t) {
  const pos = t >= 10.35 ? P1 : t >= 6.25 ? P0 : PRE;
  const heldK = t >= 9.45 && t < 10.35;
  let held = null;
  if (t >= 5.9 && t < 6.25) {
    const k = ease.io((t - 5.9) / 0.35);
    const [x0, y0] = sqW("f8");
    const [x1] = sqW("e8");
    held = {
      key: "bR",
      x: lerp(x0, x1, k),
      y: y0 - Math.sin(Math.PI * k) * 8,
      lift: 1 + 0.06 * Math.sin(Math.PI * k),
      lean: -6 * Math.sin(Math.PI * k),
    };
  } else if (heldK) {
    const [x, y] = Aknight(t);
    held = {
      key: "wN",
      x,
      y,
      lift: kf(
        t,
        [
          [9.45, 1],
          [9.6, 1.12],
          [10.2, 1.12],
          [10.35, 1],
        ],
        "io",
      ),
      lean: clamp(vel((g) => Aknight(g / FPS)[0], t * FPS) * 0.9, -14, 14),
    };
  }
  const tints =
    t >= 10.35
      ? { d4: LAST, f5: LAST }
      : t >= 9.3
        ? { d4: SEL }
        : t >= 6.25
          ? { f8: LAST, e8: LAST }
          : {};
  const thr = (1 - clamp((t - 9.4) / 0.2)) * (t >= 6.4 ? 1 : 0);
  const extra =
    thr > 0
      ? `<g opacity="${thr.toFixed(3)}">${growArrow("e8", "e4", BSQ, C.threat, true, clamp((t - 6.4) / 0.25))}</g>`
      : "";
  const dotOp =
    t >= 9.3 && t < 10.35
      ? clamp((t - 9.3) / 0.1) * (1 - clamp((t - 10.25) / 0.1))
      : 0;
  const opts = {
    tints,
    dots: KN.dots,
    caps: KN.caps,
    dotOp,
    rings:
      t >= 10.38
        ? [
            [
              "f5",
              kf(
                t,
                [
                  [10.38, 1.5],
                  [10.48, 1],
                ],
                "out3",
              ),
              clamp((t - 10.38) / 0.06),
            ],
          ]
        : [],
    badges:
      t >= 10.6
        ? [
            [
              "f5",
              "x",
              kf(
                t,
                [
                  [10.6, 0],
                  [10.68, 1.2],
                  [10.76, 1],
                ],
                "out2",
              ),
            ],
          ]
        : [],
    hide: t >= 5.9 && t < 6.25 ? ["f8"] : heldK ? ["d4"] : [],
    uid: "pa",
  };
  return pageBase("R", 3, pageBoard(pos, opts, held, extra));
}
function A_cursor(t) {
  if (t < 8.6 || t > 12.0) return "";
  const [x, y] = Acursor(t);
  const sp = Math.hypot(
    vel((g) => Acursor(g / FPS)[0], t * FPS),
    vel((g) => Acursor(g / FPS)[1], t * FPS),
  );
  const scale =
    kf(
      t,
      [
        [9.0, 1],
        [9.15, 1.25],
        [10.25, 1.25],
        [10.5, 1.05],
      ],
      "out3",
    ) *
    kf(
      t,
      [
        [9.4, 1],
        [9.47, 0.88],
        [10.25, 0.88],
        [10.38, 1],
      ],
      "io",
    );
  return cursor(x, y, {
    scale,
    op: clamp((t - 8.6) / 0.08) * (1 - clamp((t - 11.6) / 0.3)),
    sx: sp * 0.04,
    sy: sp * 0.04,
    rot: kf(
      t,
      [
        [8.6, 22],
        [9.1, 0],
      ],
      "out2",
    ),
  });
}

// ------------------------------------------------ spread B: How Pip thinks

const ENG = [
  ["c8", "f5", 13.7],
  ["f6", "e4", 14.0],
  ["e8", "e4", 14.3],
  ["c6", "e5", 14.6],
  ["f6", "h5", 14.85],
];
function B_left(t) {
  const dots = [0, 1, 2]
    .map(
      (i) =>
        `<div class="abs" style="left:${150 + i * 26 + i * i * 4}px;top:${520 - i * 22}px;width:${12 + i * 6}px;height:${12 + i * 6}px;border-radius:50%;background:#fff;box-shadow:0 0 0 1.5px ${C.line};transform:scale(${(0.85 + 0.15 * Math.sin(t * 5 + i)).toFixed(3)})"></div>`,
    )
    .join("");
  const cloud = `<div class="abs" style="left:236px;top:${430}px;width:210px;height:74px;border-radius:37px;background:#fff;box-shadow:0 0 0 1.5px ${C.line};display:flex;align-items:center;justify-content:center;gap:10px;font:900 26px Nunito;color:${C.ink}">${t < 17.3 ? "checking…" : "kind words…"}</div>`;
  return pageBase(
    "L",
    4,
    `${chapter(2, "How Pip thinks")}${paras(`${readAlong(3, t, { dropCap: true })}<div style="height:14px"></div>${readAlong(4, t)}`)}
    ${pipAt(40, 520, 104, "thinking")}${dots}${cloud}`,
  );
}
function B_right(t) {
  // Stockfish panel, then facts -> model -> words
  const out = clamp((t - 17.2) / 0.45);
  let panel = "";
  if (out < 1) {
    const sq = 40;
    let lines = "";
    for (const [a, b, t0] of ENG) {
      const o = clamp((t - t0) / 0.1) * (1 - clamp((t - t0 - 0.3) / 0.15));
      if (o > 0.01)
        lines += `<g opacity="${(o * 0.85).toFixed(3)}">${arrow(a, b, sq, "#BFD3FF", false)}</g>`;
    }
    const best = clamp((t - 15.2) / 0.25);
    if (best > 0) lines += growArrow("g6", "f5", sq, C.threat, true, best);
    const sweep = clamp((t - 13.6) / 1.6);
    const scan =
      sweep > 0 && sweep < 1
        ? `<g clip-path="url(#bceng)"><rect x="0" y="${(sweep * 380 - 60).toFixed(1)}" width="320" height="60" fill="url(#scanB)"/></g>`
        : "";
    const depth = Math.min(18, 1 + Math.trunc(clamp((t - 13.6) / 1.8) * 17.99));
    const win = lerp(52, 12, ease.out3(clamp((t - 14.3) / 1.6)));
    const verdict =
      t >= 16.2
        ? kf(
            t,
            [
              [16.2, 1.5],
              [16.3, 0.94],
              [16.4, 1],
            ],
            "out2",
          )
        : 0;
    panel = `<div class="abs" style="left:30px;top:${px(40 - 260 * ease.in2(out))};width:440px;height:600px;border-radius:30px;background:radial-gradient(circle at 40% 35%,#2A3F86 0%,#1B2550 55%,#11132A 100%);box-shadow:-10px 8px 22px rgba(17,19,42,.28);opacity:${(1 - out).toFixed(3)};${flt(blur(out * 8))}">
      <div class="abs" style="left:26px;top:22px;font:900 22px Nunito;color:#fff">Stockfish is checking <span style="color:#9CC4FF;font-weight:700;font-size:18px">depth ${depth}</span></div>
      <svg class="abs" style="left:26px;top:66px;overflow:visible" width="320" height="320"><defs><linearGradient id="scanB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9CC4FF" stop-opacity="0"/><stop offset=".8" stop-color="#9CC4FF" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity=".6"/></linearGradient></defs>${gameBoard(sq, P1, { tints: { d4: LAST, f5: LAST }, rings: [["f5", 1, 1]], uid: "eng" })}${scan}${lines}</svg>
      <div class="abs" style="left:368px;top:66px;width:24px;height:320px;border-radius:12px;background:#0B0C18;overflow:hidden;box-shadow:0 0 0 2px rgba(255,255,255,.15)"><div class="abs" style="left:0;bottom:0;width:100%;height:${px(3.2 * win)};background:#F3F3F5"></div></div>
      <div class="abs" style="left:28px;top:404px;font:900 72px/1 Nunito;color:#fff">${Math.round(win)}<span style="font-size:36px">%</span></div>
      <div class="abs" style="left:30px;top:484px;font:800 19px Nunito;color:#9CC4FF">your win chance</div>
      ${verdict ? `<div class="abs" style="left:210px;top:418px;transform-origin:0 50%;transform:scale(${verdict.toFixed(3)});display:flex;align-items:center;gap:12px">${tile(TILES[3], 58)}<span style="font:900 30px Nunito;color:#fff">Blunder</span></div>` : ""}
    </div>`;
  }
  let facts = "";
  if (t >= 17.4) {
    const cy = settle(t * FPS, 17.4 * FPS, 17.95 * FPS, 260, 40, 0.2);
    const cb = kf(
      t,
      [
        [17.4, 8],
        [17.7, 0],
      ],
      "out2",
    );
    const iconS =
      t < 17.8
        ? 0
        : kf(
            t,
            [
              [17.8, 0.5],
              [17.95, 1.08],
              [18.1, 1],
              [19.0, 1],
              [19.07, 1.1],
              [19.2, 1],
            ],
            "out2",
          );
    const ripple = clamp((t - 19.0) / 0.35);
    let dots = "";
    for (let i = 0; i < 12; i++) {
      const k = clamp((t - 18.2 - i * 0.045) / 0.28);
      if (k <= 0 || k >= 1) continue;
      dots += `<div class="abs" style="left:${px(250 + Math.sin(i * 2.4) * 40 * (1 - k) - 5)};top:${px(lerp(246, 318, ease.in2(k)) - 5)};width:10px;height:10px;border-radius:5px;background:${i % 3 === 0 ? C.coral : C.blue}"></div>`;
    }
    const row = (k, v) =>
      `<div style="display:flex;gap:14px;font:800 20px/32px Nunito"><span style="width:124px;color:${C.ink3}">${k}</span><span style="color:${C.ink}">${v}</span></div>`;
    const pillS =
      t < 19.3
        ? 0
        : kf(
            t,
            [
              [19.3, 0.6],
              [19.42, 1.05],
              [19.55, 1],
            ],
            "out2",
          );
    facts = `<div class="abs" style="left:40px;top:${px(cy)};width:420px;padding:18px 22px;border-radius:24px;background:#fff;box-shadow:0 0 0 1.5px ${C.line},-8px 6px 18px rgba(46,42,64,.09);${flt(blur(cb))}">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px"><span style="font:900 17px Nunito;letter-spacing:.12em;color:${C.ink2}">CHESS FACTS</span><span style="padding:4px 12px;border-radius:12px;background:${C.coral};color:#fff;font:800 17px Nunito">hanging piece</span></div>
        ${row("piece", "knight · f5")}${row("attacker", "pawn · g6")}${row("checked by", `Stockfish <span style="color:${C.good}">✓</span>`)}</div>
      ${dots}
      <div class="abs" style="left:${250 - 85}px;top:${380 - 85}px;width:170px;height:170px;border-radius:50%;border:3px solid ${C.blue};opacity:${(ripple > 0 && ripple < 1 ? 1 - ripple : 0).toFixed(3)};transform:scale(${(0.6 + ripple * 0.7).toFixed(3)})"></div>
      <div class="abs" style="left:${250 - 56}px;top:${380 - 56}px;transform:scale(${iconS.toFixed(6)})">${appIcon(112)}</div>
      <div class="abs" style="left:40px;top:452px;width:420px;text-align:center;opacity:${clamp((t - 18.0) / 0.15)}"><span style="font:900 24px Nunito;color:${C.ink}">pawnpal-pip</span><span style="font:700 18px Nunito;color:${C.ink2}"> · small AI model · trained on 500 rounds</span></div>
      <div class="abs" style="left:24px;top:512px;width:452px;height:82px;padding:0 18px;border-radius:41px;background:#fff;box-shadow:0 0 0 1.5px ${C.line},-8px 6px 20px rgba(37,99,235,.14);display:flex;align-items:center;gap:12px;transform-origin:50% 0;transform:scale(${pillS.toFixed(6)})">
        <div style="width:52px;height:52px;border-radius:26px;background:#FFF4DE;overflow:hidden;display:flex;justify-content:center;flex:none">${pipFull(44, 52, 1, 'style="margin-top:5px"')}</div>
        <div style="font:800 23px Nunito;color:${C.ink};white-space:nowrap">${typed(T.pip, t, 19.5, 34)}${caret}</div></div>`;
  }
  return pageBase("R", 5, panel + facts);
}

// ------------------------------------------------ spread C: Try again

const TRY = L(232, 590, "L"); // Try again button centre (world)
const HELPW = L(392, 535, "R"); // More help button centre (world)
const C_PRESS = [24.2, 25.3, 26.3];
function Crook(t) {
  const a = sqW("f1");
  const b = sqW("e1");
  if (t <= 27.1) return a;
  if (t >= 27.5) return b;
  const k = ease.io((t - 27.1) / 0.4);
  return [
    lerp(a[0], b[0], k),
    lerp(a[1], b[1], k) - Math.sin(Math.PI * k) * 20,
  ];
}
function Ccursor(t) {
  const seg = (t0, t1, p0, p1) => {
    const k = ease.io(clamp((t - t0) / (t1 - t0)));
    return [lerp(p0[0], p1[0], k), lerp(p0[1], p1[1], k)];
  };
  const tryP = [TRY[0] + 8, TRY[1] + 8];
  const helpP = [HELPW[0] + 8, HELPW[1] + 8];
  const [rx, ry] = sqW("f1");
  if (t <= 23.3)
    return [
      settle(t * FPS, 22.15 * FPS, 22.6 * FPS, 700, tryP[0], 0.18),
      settle(t * FPS, 22.15 * FPS, 22.6 * FPS, 1080, tryP[1], 0.18),
    ];
  if (t <= 26.55) return seg(23.3, 24.05, tryP, helpP);
  if (t <= 27.05) return seg(26.55, 27.0, helpP, [rx + 8, ry + 10]);
  const [x, y] = Crook(t - 0.02);
  const d = Math.max(0, t - 27.55) * FPS;
  return [x + 8 + d * 1.5, y + 10 + d * 0.7];
}
function C_left(t) {
  const expr = t >= 27.6 ? "cheering" : t >= 23.3 ? "thinking" : "encouraging";
  const ps =
    t >= 27.6
      ? popS(t, 27.6, 0.9)
      : t < 22.3
        ? popS(t, 22.15, 0.85) || 0.85
        : 1;
  const msgs = [
    [22.15, T.pip],
    [24.25, T.hint1],
    [25.35, T.hint2],
    [26.35, T.hint3],
    [27.7, T.praise],
  ];
  const cur = msgs.filter((m) => t >= m[0]).pop() ?? msgs[0];
  const sink = kf(
    t,
    [
      [22.7, 0],
      [22.75, 1],
      [22.85, 1],
      [22.95, 0],
    ],
    "io",
  );
  const buttons =
    t < 23.3
      ? `<div style="display:flex;gap:10px;margin-top:12px;opacity:${(1 - clamp((t - 23.0) / 0.25)).toFixed(3)}">${kidButton("Try again", { blue: true, font: 19, h: 44, sink })}${kidButton("Show me", { font: 19, h: 44 })}</div>`
      : "";
  return pageBase(
    "L",
    6,
    `${chapter(3, "Try again")}${paras(`${readAlong(5, t, { dropCap: true })}<div style="height:14px"></div>${readAlong(6, t)}`)}
    ${pipAt(40, 540, 104, expr, ps)}
    ${bookBubble(`${cur[1]}${buttons}`, { x: 170, y: 478, w: 290, s: popS(t, cur[0], cur === msgs[0] ? 0.7 : 0.94) })}`,
  );
}
function C_right(t) {
  const undo = clamp((t - 22.8) / 0.4);
  const heldR = t >= 27.05 && t < 27.55;
  let held = null;
  let hide = [];
  let pos = t >= 27.55 ? P2 : t >= 23.2 ? P0 : P1;
  if (t >= 22.8 && t < 23.2) {
    const [x0, y0] = sqW("f5");
    const [x1, y1] = sqW("d4");
    const k = ease.io(undo);
    held = {
      key: "wN",
      x: lerp(x0, x1, k),
      y: lerp(y0, y1, k) - Math.sin(Math.PI * k) * 30,
      lift: 1 + 0.1 * Math.sin(Math.PI * k),
      lean: -8 * Math.sin(Math.PI * k),
    };
    hide = ["f5"];
  } else if (heldR) {
    const [x, y] = Crook(t);
    held = {
      key: "wR",
      x,
      y,
      lift: kf(
        t,
        [
          [27.05, 1],
          [27.15, 1.12],
          [27.4, 1.12],
          [27.55, 1],
        ],
        "io",
      ),
      lean: clamp(vel((g) => Crook(g / FPS)[0], t * FPS) * 0.9, -14, 14),
    };
    hide = ["f1"];
  }
  const ringOp = 1 - clamp((t - 22.75) / 0.2);
  const tints =
    t >= 27.55
      ? { f1: LAST, e1: LAST }
      : t >= 27.05
        ? { f1: SEL }
        : t >= 24.2
          ? { f1: HINT }
          : t < 22.8
            ? { d4: LAST, f5: LAST }
            : {};
  const arrowOp = 1 - clamp((t - 27.1) / 0.15);
  const extra =
    t >= 26.3 && arrowOp > 0
      ? `<g opacity="${arrowOp.toFixed(3)}">${growArrow("f1", "e1", BSQ, C.blue, false, clamp((t - 26.3) / 0.2))}</g>`
      : "";
  const help = C_PRESS.reduce(
    (a, p0) =>
      Math.max(
        a,
        kf(
          t,
          [
            [p0 - 0.04, 0],
            [p0, 1],
            [p0 + 0.08, 1],
            [p0 + 0.16, 0],
          ],
          "io",
        ),
      ),
    0,
  );
  const opts = {
    tints,
    outline: t >= 24.2 && t < 27.05 ? ["f1"] : [],
    dots: heldR ? ["e1"] : [],
    rings: ringOp > 0 ? [["f5", 1, ringOp]] : [],
    badges: [
      ...(ringOp > 0 ? [["f5", "x", ringOp]] : []),
      ...(t >= 27.6
        ? [
            [
              "e1",
              "check",
              kf(
                t,
                [
                  [27.6, 0],
                  [27.68, 1.2],
                  [27.76, 1],
                ],
                "out2",
              ),
            ],
          ]
        : []),
    ],
    hide,
    uid: "pc",
  };
  return pageBase("R", 7, pageBoard(pos, opts, held, extra, { help }));
}
function C_cursor(t) {
  if (t < 22.15 || t > 29.5) return "";
  const [x, y] = Ccursor(t);
  const sp = Math.hypot(
    vel((g) => Ccursor(g / FPS)[0], t * FPS),
    vel((g) => Ccursor(g / FPS)[1], t * FPS),
  );
  const press = [22.75, ...C_PRESS].reduce(
    (a, p0) =>
      Math.min(
        a,
        kf(
          t,
          [
            [p0 - 0.05, 1],
            [p0, 0.86],
            [p0 + 0.09, 1],
          ],
          "io",
        ),
      ),
    1,
  );
  const grab = kf(
    t,
    [
      [27.0, 1],
      [27.05, 0.88],
      [27.5, 0.88],
      [27.58, 1],
    ],
    "io",
  );
  return cursor(x, y, {
    scale: press * grab,
    op: clamp((t - 22.15) / 0.08) * (1 - clamp((t - 29.0) / 0.4)),
    sx: sp * 0.04,
    sy: sp * 0.04,
  });
}

// ------------------------------------------------ spread D: Looking back

const NEXTW = L(398, 625, "R");
function D_left(t) {
  const m2 = t >= 34.0;
  const chip = m2
    ? `<div style="display:inline-flex;align-items:center;gap:8px;padding:6px 14px 6px 6px;border-radius:20px;background:${C.bigoops};color:#fff;font:800 19px Nunito"><div style="width:28px;height:28px;border-radius:8px;background:rgba(255,255,255,.2)"><svg width="28" height="28" viewBox="0 0 100 100">${glyph("x")}</svg></div>Missed capture</div>`
    : `<div style="display:inline-flex;align-items:center;gap:8px;padding:6px 14px 6px 6px;border-radius:20px;background:${C.good};color:#fff;font:800 19px Nunito"><div style="width:28px;height:28px;border-radius:8px;background:rgba(255,255,255,.2)"><svg width="28" height="28" viewBox="0 0 100 100">${glyph("check")}</svg></div>You fixed it!</div>`;
  const s = m2 ? popS(t, 34.0, 0.92) : 1;
  return pageBase(
    "L",
    8,
    `${chapter(4, "Looking back")}${paras(readAlong(7, t, { dropCap: true }))}
    <div class="abs" style="left:170px;top:400px;transform-origin:0 50%;transform:scale(${s.toFixed(6)})">${chip}</div>
    ${pipAt(40, 540, 104, "happy")}
    ${bookBubble(m2 ? T.review2 : T.review1, { x: 170, y: 452, w: 290, s })}`,
  );
}
function D_right(t) {
  const push = ease.io(clamp((t - 33.8) / 0.4));
  const pv =
    Math.abs(vel((g) => ease.io(clamp((g / FPS - 33.8) / 0.4)), t * FPS)) * 500;
  const sink = kf(
    t,
    [
      [33.66, 0],
      [33.7, 1],
      [33.8, 1],
      [33.88, 0],
    ],
    "io",
  );
  const legend = (dashed, color, label) =>
    `<div style="display:flex;align-items:center;gap:8px"><svg width="36" height="10"><line x1="2" y1="5" x2="34" y2="5" stroke="${color}" stroke-width="6" stroke-linecap="${dashed ? "butt" : "round"}" ${dashed ? 'stroke-dasharray="8 5"' : ""}/></svg>${label}</div>`;
  const moment = (
    n,
    x,
  ) => `<div class="abs" style="left:${px(x)};top:0;width:500px;height:700px">
      <div class="abs" style="left:40px;top:84px;font:800 18px Nunito;color:${C.ink3}">Moment ${n + 1} of 2 · Move ${n === 0 ? 10 : 11}</div>
      <svg class="abs" style="left:58px;top:118px;overflow:visible;filter:drop-shadow(-6px 5px 10px rgba(46,42,64,.16))" width="384" height="384">${
        n === 0
          ? gameBoard(48, P0, {
              arrows: [
                ["d4", "f5", C.threat, true],
                ["f1", "e1", C.blue, false],
              ],
              uid: "d0",
            })
          : gameBoard(48, M2, {
              arrows: [
                ["a2", "a3", C.threat, true],
                ["e4", "f5", C.blue, false],
              ],
              uid: "d1",
            })
      }</svg></div>`;
  return pageBase(
    "R",
    9,
    `<div class="abs" style="left:40px;top:36px;font:900 32px Nunito;color:${C.ink}">Game review</div>
    <div class="abs" style="inset:0;overflow:hidden;${flt(smear(pv * 0.06, 0))}">${moment(0, -500 * push)}${moment(1, 500 * (1 - push))}</div>
    <div class="abs" style="left:58px;top:518px;display:flex;gap:22px;font:800 17px Nunito;color:${C.ink2}">${legend(true, C.threat, "Your move")}${legend(false, C.blue, "Better idea")}</div>
    <div class="abs" style="left:226px;top:${625 - 22}px;display:flex;gap:10px">${kidButton("Previous", { font: 18, h: 44 })}${kidButton("Next", { blue: true, font: 18, h: 44, sink })}</div>`,
  );
}
function D_cursor(t) {
  if (t < 32.9 || t > 35.6) return "";
  const fx = (g) => settle(g, 32.9 * FPS, 33.5 * FPS, 1110, NEXTW[0] + 8, 0.18);
  const fy = (g) => settle(g, 32.9 * FPS, 33.5 * FPS, 1050, NEXTW[1] + 8, 0.18);
  const f = t * FPS;
  const d = Math.max(0, t - 33.9) * FPS;
  const press = kf(
    t,
    [
      [33.65, 1],
      [33.7, 0.86],
      [33.8, 1],
    ],
    "io",
  );
  return cursor(fx(f) + d * 1.3, fy(f) + d, {
    scale: press,
    op: clamp((t - 32.9) / 0.08) * (1 - clamp((t - 35.2) / 0.4)),
    sx: Math.abs(vel(fx, f)) * 0.04,
    sy: Math.abs(vel(fy, f)) * 0.04,
  });
}

const SPREADS = [
  { left: A_left, right: A_right, cursor: A_cursor },
  { left: B_left, right: B_right, cursor: () => "" },
  { left: C_left, right: C_right, cursor: C_cursor },
  { left: D_left, right: D_right, cursor: D_cursor },
];

// ------------------------------------------------ camera and the book

// Gentle pushes toward the board that keep the read-along words in frame.
const camXs = [
  [0, 790],
  [1.24, 790],
  [2.7, 540],
  [3.9, 540],
  [8.7, 540],
  [10.0, 590],
  [11.2, 592],
  [12.3, 540],
  [13.6, 540],
  [14.4, 590],
  [16.8, 592],
  [17.6, 570],
  [20.9, 570],
  [21.4, 540],
  [26.3, 540],
  [27.0, 590],
  [28.8, 592],
  [30.6, 540],
  [36.0, 540],
  [37.3, 790],
  [41, 790],
];
const camYs = [
  [0, 560],
  [2.7, 540],
  [3.9, 540],
  [8.7, 540],
  [10.0, 525],
  [11.2, 525],
  [12.3, 540],
  [14.4, 530],
  [16.8, 530],
  [21.4, 540],
  [27.0, 525],
  [28.8, 525],
  [30.6, 540],
  [36.0, 540],
  [37.3, 590],
  [41, 600],
];
const camSs = [
  [0, 1.1],
  [1.24, 1.0],
  [3.9, 1.0],
  [8.7, 1.0],
  [10.0, 1.08],
  [11.2, 1.09],
  [12.3, 1.0],
  [13.6, 1.0],
  [14.4, 1.07],
  [16.8, 1.08],
  [17.6, 1.04],
  [20.9, 1.05],
  [21.4, 1.0],
  [26.3, 1.0],
  [27.0, 1.08],
  [28.8, 1.09],
  [30.6, 1.0],
  [32.0, 1.01],
  [36.0, 1.03],
  [37.3, 0.9],
  [41, 0.95],
];

// A stiff board (the cover, or the whole read half of the book when closing)
// swinging about the spine joint. It doesn't bend; its thickness shows as an
// edge along the free side while it stands up.
const BW = PG.w + 12; // a board overhangs the pages by 12 px at the fore-edge
const BH = PG.h + 20; // ...and 10 px at head and tail
const onBoard_ = (html, x) =>
  `<div class="abs" style="inset:0;background:#1F1C2E;border-radius:${x ? "16px 0 0 16px" : "0 16px 16px 0"}"><div class="abs" style="left:${x}px;top:10px;width:${PG.w}px;height:${PG.h}px">${html}</div></div>`;
// The board with the cover art (fore-edge margin on the right).
const coverBoard = () => onBoard_(cover(), 0);
function flipper(
  front,
  back,
  t0,
  t1,
  t,
  dir,
  edge = { th: 5, color: "#1F1C2E" },
) {
  // dir -1: swings right to left (opening). dir +1: left to right (closing).
  const p = ease.sine(clamp((t - t0) / (t1 - t0)));
  const ang = 180 * p * dir * -1;
  const r = Math.PI * p;
  // opening (dir -1): the outside faces west as it lifts; closing (dir +1):
  // the inside page turns east, toward the sun, as the block lifts
  const lightF =
    dir < 0
      ? Math.sin(SUN - r) / Math.sin(SUN)
      : Math.sin(r + SUN) / Math.sin(SUN);
  const lightB =
    dir < 0
      ? Math.sin(r - SUN) / Math.sin(SUN)
      : -Math.sin(r + SUN) / Math.sin(SUN);
  const edgeX = PG.spine + (dir < 0 ? BW * Math.cos(r) : -BW * Math.cos(r));
  const shadow = castShadow(
    [
      [PG.spine, 0],
      [edgeX, BW * Math.sin(r)],
    ],
    PG.spine,
  );
  const left = dir < 0 ? PG.spine : PG.spine - BW;
  const origin = dir < 0 ? "0% 50%" : "100% 50%";
  const freeX = dir < 0 ? BW : 0;
  const edgeDiv = `<div class="abs" style="left:${freeX}px;top:0;width:${edge.th}px;height:${BH}px;transform-origin:0 50%;transform:rotateY(90deg);background:${edge.color}"></div>`;
  return `${shadow}<div class="abs" style="left:0;top:0;width:1080px;height:1080px;${lens()}">
    <div class="abs" style="left:${left}px;top:${PG.top - 10}px;width:${BW}px;height:${BH}px;transform-style:preserve-3d;transform-origin:${origin};transform:rotateY(${ang.toFixed(3)}deg)">
      <div class="abs" style="inset:0;backface-visibility:hidden">${front}${sunlit(lightF)}</div>
      <div class="abs" style="inset:0;backface-visibility:hidden;transform:rotateY(180deg)">${back}${sunlit(lightB)}</div>
      ${edgeDiv}
    </div></div>`;
}
// The camera keys above are on the scene clock. Re-time them onto real time
// so the camera glides at an even pace instead of following the warp's speed
// changes, which showed up as small jerks.
function unwarp(scene) {
  let lo = 0;
  let hi = 31;
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    if (WARP(mid) < scene) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
const onReal = (keys) =>
  spline(
    keys.map(([t, v]) => [unwarp(t), v]),
    { extend: false },
  );
const camX = onReal(camXs);
const camY = onReal(camYs);
const camS = onReal(camSs);

// One pinhole camera looks straight down at the book. A point lifted to
// height z shows at c + (x - c) * D / (D - z), where c is the point the camera
// is centred on and D its height. CSS 3D does exactly this with perspective = D
// and perspective-origin = c. D comes from a 32° field of view across the
// 1080 px frame (D = 540 / tan 16° ≈ 1883 px) and shrinks as the camera
// pushes in (zoom s), so turning pages foreshorten (width × cos θ) and grow
// toward the lens by the right amount at every angle.
const FOCAL = 540 / Math.tan((16 * Math.PI) / 180);
const CAM = { cx: 540, cy: 540, s: 1 };
const lens = () =>
  `perspective:${(FOCAL / CAM.s).toFixed(1)}px;perspective-origin:${CAM.cx.toFixed(2)}px ${CAM.cy.toFixed(2)}px`;

// Sunlight from the east (the right of the frame), 50° above the table, so
// every shadow falls to the west (left).
const SUN = (50 * Math.PI) / 180;
const SUN_RUN = 1 / Math.tan(SUN); // shadow length per unit of height
// Light on a face relative to flat paper (1 = same as flat): darker overlay
// below 1, brighter above. Equals 1 exactly when a sheet lies flat, so
// nothing pops when a sheet lands.
const sunTone = (L) =>
  L < 1
    ? `rgba(46,42,64,${Math.min(0.42, 0.36 * (1 - L)).toFixed(3)})`
    : `rgba(255,255,255,${(0.18 * (L - 1)).toFixed(3)})`;
function sunlit(L) {
  return `<div class="abs" style="inset:0;background:${sunTone(L)}"></div>`;
}
// Light that changes smoothly across a face (no banding between curl strips).
const sunlitGrad = (L0, L1, dir) =>
  `<div class="abs" style="inset:0;background:linear-gradient(${dir},${sunTone(L0)},${sunTone(L1)})"></div>`;
// Shadow a lifted sheet casts on the book and table. pts: [x (world), height]
// along the sheet's profile; contact is where it touches the spine.
function castShadow(pts, contact) {
  const zmax = Math.max(...pts.map((q) => q[1]));
  if (zmax < 0.5) return "";
  const xs = pts.map(([x, z]) => x - z * SUN_RUN);
  const lo = Math.min(contact, ...xs);
  const hi = Math.max(contact, ...xs);
  const toLeft = contact - lo > hi - contact;
  const k = clamp(zmax / 90);
  const soft = (3 + zmax * 0.035).toFixed(1);
  return `<div class="abs" style="left:${lo.toFixed(1)}px;top:${PG.top - 4}px;width:${(hi - lo).toFixed(1)}px;height:${PG.h + 8}px;background:linear-gradient(${toLeft ? "to left" : "to right"},rgba(31,36,70,${(0.34 * k).toFixed(3)}),rgba(31,36,70,${(0.14 * k).toFixed(3)}) 85%,rgba(31,36,70,0));filter:blur(${soft}px);pointer-events:none"></div>`;
}

// A paper page turning over the spine. The page is cut into vertical strips
// chained in 3D. The fingers lift the outer edge first; then the sheet swings
// up from the spine while its free edge trails behind in an outward arc and
// floats down last, like real paper. Light and shade follow each strip's angle.
const STRIPS = 20;
function curlAngles(p) {
  const base = 180 * ease.sine(p);
  const lead = p < 0.4 ? 30 * Math.sin(Math.PI * (p / 0.4)) ** 2 : 0; // edge lifted by the fingers
  const trail =
    p > 0.15 ? -50 * Math.sin(Math.PI * ((p - 0.15) / 0.85)) ** 2 : 0; // edge trails the swing
  return Array.from({ length: STRIPS }, (_, i) =>
    clamp(base + (lead + trail) * ((i + 0.5) / STRIPS) ** 1.3, 0, 180),
  );
}
function curlFlip(front, back, t0, t1, t) {
  const p = clamp((t - t0) / (t1 - t0));
  const w = PG.w / STRIPS;
  const ang = curlAngles(p);
  let html = "";
  for (let i = STRIPS - 1; i >= 0; i--) {
    const a = ang[i];
    const rel = i === 0 ? a : a - ang[i - 1];
    // angles at this strip's two edges, so its light blends into its neighbours
    const a0 = clamp(
      i === 0 ? a - (ang[1] - a) / 2 : (ang[i - 1] + a) / 2,
      0,
      180,
    );
    const a1 = clamp(
      i === STRIPS - 1 ? a + (a - ang[i - 1]) / 2 : (a + ang[i + 1]) / 2,
      0,
      180,
    );
    // The printed front turns west (away from the sun) as it lifts; the back
    // turns east (toward it) as it comes over.
    const lf = (d) => Math.sin(SUN - (d * Math.PI) / 180) / Math.sin(SUN);
    const lb = (d) => Math.sin((d * Math.PI) / 180 - SUN) / Math.sin(SUN);
    const face = (content, offset, shade, isBack) =>
      `<div class="abs" style="left:0;top:0;width:${(w + 0.8).toFixed(2)}px;height:${PG.h}px;overflow:hidden;backface-visibility:hidden;${isBack ? "transform:rotateY(180deg);" : ""}"><div class="abs" style="left:${(-offset).toFixed(2)}px;top:0;width:${PG.w}px;height:${PG.h}px">${content}</div>${shade}</div>`;
    // the back face is mirrored, so its gradient runs the other way
    html = `<div class="abs" style="left:${i === 0 ? 0 : w.toFixed(2)}px;top:0;width:${w.toFixed(2)}px;height:${PG.h}px;transform-origin:0 50%;transform:rotateY(${(-rel).toFixed(3)}deg);transform-style:preserve-3d">${face(front, i * w, sunlitGrad(lf(a0), lf(a1), "to right"), false)}${face(back, PG.w - (i + 1) * w, sunlitGrad(lb(a0), lb(a1), "to left"), true)}${html}</div>`;
  }
  // the sheet's profile (x, height) for the shadow it casts westward
  const pts = [[PG.spine, 0]];
  let x = PG.spine;
  let z = 0;
  for (const a of ang) {
    x += w * Math.cos((a * Math.PI) / 180);
    z += w * Math.sin((a * Math.PI) / 180);
    pts.push([x, z]);
  }
  return `${castShadow(pts, PG.spine)}<div class="abs" style="left:0;top:0;width:1080px;height:1080px;${lens()}"><div class="abs" style="left:${PG.spine}px;top:${PG.top}px;width:0;height:${PG.h}px;transform-style:preserve-3d">${html}</div></div>`;
}
const place = (side, html) =>
  `<div class="abs" style="left:${side === "L" ? PG.spine - PG.w : PG.spine}px;top:${PG.top}px;width:${PG.w}px;height:${PG.h}px">${html}</div>`;
const spineShadow = (op) =>
  `<div class="abs" style="left:${PG.spine - 30}px;top:${PG.top}px;width:60px;height:${PG.h}px;background:linear-gradient(to right,rgba(46,42,64,0),rgba(46,42,64,${(0.22 * op).toFixed(3)}) 50%,rgba(46,42,64,0));pointer-events:none"></div>`;

function book(t) {
  const R = NOW_REAL;
  const [o0, o1] = TLR.open;
  const [ti0, ti1] = TLR.title;
  const [c0, c1] = TLR.close;
  // Pages move from the right stack to the left one as they are turned.
  const paper = [TLR.title, ...TLR.turns];
  const done = paper.reduce((n, [a, b]) => n + clamp((R - a) / (b - a)), 0);
  const thL = 1 + 2.4 * done;
  const thR = 11 - 2.4 * done;
  const base = (w) =>
    `<div class="abs" style="left:${PG.spine - (w ? PG.w : 0) - 12}px;top:${PG.top - 10}px;width:${(w ? 2 * PG.w : PG.w) + 24}px;height:${PG.h + 20}px;border-radius:16px;background:#1F1C2E;box-shadow:-30px 14px 34px rgba(31,40,90,.32),-6px 3px 6px rgba(31,40,90,.22)"></div>`;
  const edges = (side, th) => {
    const sgn = side === "L" ? -1 : 1;
    const lines = [];
    for (let k = 1; k <= Math.round(th); k++)
      lines.push(
        `${sgn * k}px ${(k * 0.55).toFixed(2)}px 0 ${k === Math.round(th) ? "#D9CDB5" : k % 2 ? "#EAE1CF" : "#F4EEE1"}`,
      );
    return lines.length
      ? `<div class="abs" style="left:${side === "L" ? PG.spine - PG.w : PG.spine}px;top:${PG.top}px;width:${PG.w}px;height:${PG.h}px;border-radius:${side === "L" ? "10px 0 0 10px" : "0 10px 10px 0"};background:${PAPER};box-shadow:${lines.join(",")}"></div>`
      : "";
  };
  // The last spread's left half, drawn as the flat board that will lift to close the book.
  const closingBoard = (tt) =>
    flipper(
      onBoard_(SPREADS[3].left(tt), 12),
      coverBoard(),
      c0,
      c1,
      Math.min(R, c0),
      1,
      {
        th: 12,
        color:
          "repeating-linear-gradient(to right,#EAE1CF 0 2px,#F4EEE1 2px 4px)",
      },
    );
  const closed = () =>
    base(false) +
    edges("R", 11) +
    `<div class="abs" style="left:${PG.spine}px;top:${PG.top - 10}px;width:${BW}px;height:${BH}px">${coverBoard()}</div>`;
  if (R < o0 || R >= c1) return closed();
  // the hard cover swings open on its joint, showing the endpaper inside
  if (R < o1) {
    const k = clamp((R - o0) / (o1 - o0));
    return (
      base(false) +
      edges("R", 11) +
      place("R", titlePage()) +
      spineShadow(k) +
      flipper(coverBoard(), onBoard_(pastedown(), 12), o0, o1, R, -1)
    );
  }
  // endpaper on the left, title page on the right; then the title page turns
  if (R < ti1) {
    if (R < ti0)
      return (
        base(true) +
        place("L", pastedown()) +
        edges("R", thR) +
        place("R", titlePage()) +
        spineShadow(1)
      );
    const p = (R - ti0) / (ti1 - ti0);
    const under = p > 0.9 ? SPREADS[0].left(t) : pastedown();
    const sheet = 1 - clamp((p - 0.92) / 0.08);
    return (
      base(true) +
      edges("L", thL) +
      place("L", under) +
      edges("R", thR) +
      place("R", SPREADS[0].right(t)) +
      spineShadow(1) +
      `<div class="abs" style="inset:0;opacity:${sheet.toFixed(3)}">${curlFlip(titlePage(), SPREADS[0].left(t), ti0, ti1, R)}</div>`
    );
  }
  // closing: the whole read half lifts as one thick block and lands on the right
  if (R >= c0) {
    const k = clamp((R - c0) / (c1 - c0));
    const block = {
      th: 12,
      color:
        "repeating-linear-gradient(to right,#EAE1CF 0 2px,#F4EEE1 2px 4px)",
    };
    // the shadow the left half cast on the table fades as that half lifts away
    const tableShadow = `<div class="abs" style="left:${PG.spine - PG.w - 12}px;top:${PG.top - 10}px;width:${PG.w + 12}px;height:${PG.h + 20}px;border-radius:16px 0 0 16px;box-shadow:-30px 14px 34px rgba(31,40,90,${(0.32 * (1 - ease.sine(k))).toFixed(3)})"></div>`;
    return (
      tableShadow +
      base(false) +
      edges("R", thR) +
      place("R", SPREADS[3].right(t)) +
      spineShadow(1 - k) +
      flipper(
        onBoard_(SPREADS[3].left(t), 12),
        coverBoard(),
        c0,
        c1,
        R,
        1,
        block,
      )
    );
  }
  let s = 0;
  for (const [a, b] of TLR.turns) {
    if (R >= b) s++;
    else if (R >= a) {
      // In the last frames the sheet is almost flat over the new left page:
      // lay that page underneath and fade the sheet into it, so the landing
      // has no visible handover.
      const p = (R - a) / (b - a);
      const under =
        p <= 0.9
          ? place("L", SPREADS[s].left(t))
          : s + 1 === 3
            ? closingBoard(t)
            : place("L", SPREADS[s + 1].left(t));
      const sheet = 1 - clamp((p - 0.92) / 0.08);
      return (
        base(true) +
        edges("L", thL) +
        edges("R", thR) +
        under +
        place("R", SPREADS[s + 1].right(t)) +
        spineShadow(1) +
        `<div class="abs" style="inset:0;opacity:${sheet.toFixed(3)}">${curlFlip(SPREADS[s].right(t), SPREADS[s + 1].left(t), a, b, R)}</div>`
      );
    }
  }
  // On the last spread the left half is already the board that will lift to
  // close the book, drawn flat, so the close starts without any redraw pop.
  const left = s === 3 ? closingBoard(t) : place("L", SPREADS[s].left(t));
  return (
    base(true) +
    edges("L", thL) +
    edges("R", thR) +
    (s === 3 ? "" : left) +
    place("R", SPREADS[s].right(t)) +
    spineShadow(1) +
    (s === 3 ? left : "") +
    SPREADS[s].cursor(t)
  );
}

// Chrome draws text differently once a 3D layer exists. Keep one tiny 3D layer
// in every frame so the page turns, cover and close never switch modes
// mid-film (that showed as a one-frame pop of all the text).
const KEEP3D = `<div class="abs" style="left:0;top:0;width:2px;height:2px;perspective:2600px"><div style="width:2px;height:2px;transform-style:preserve-3d;transform:rotateY(0.01deg)"></div></div>`;

function frame(f) {
  NOW_REAL = f / FPS;
  const t = WARP(NOW_REAL);
  const cx = camX(NOW_REAL);
  const cy = camY(NOW_REAL);
  const s = camS(NOW_REAL);
  CAM.cx = cx;
  CAM.cy = cy;
  CAM.s = s;
  const endOp = clamp((t - 37.4) / 0.5);
  const lights = [0, 1, 2, 3, 4, 5]
    .map((i) => {
      const x = 120 + i * 170 + Math.sin(t * 0.6 + i) * 20;
      const y = 120 + ((i * 137) % 260) + Math.cos(t * 0.5 + i * 2) * 14;
      return `<div class="abs" style="left:${px(x)};top:${px(y)};width:10px;height:10px;border-radius:5px;background:#fff;opacity:${(0.35 + 0.25 * Math.sin(t * 2 + i)).toFixed(3)};${flt(blur(1.5))}"></div>`;
    })
    .join("");
  return `<div class="abs" style="inset:0;background:radial-gradient(circle at 50% 38%,#F4F7FF 0%,#DCE7FF 48%,#BCCDF1 100%)"></div>${lights}
  <div class="abs" style="left:0;top:0;width:1080px;height:1080px;transform-origin:0 0;transform:translate(540px,540px) scale(${s.toFixed(6)}) translate(${px(-cx)},${px(-cy)})">${KEEP3D}${book(t)}</div>
  <div class="abs" style="left:0;top:930px;width:1080px;text-align:center;opacity:${endOp.toFixed(3)};transform:translateY(${px((1 - ease.out3(endOp)) * 16)})"><span style="font:900 44px Nunito;color:${C.ink}">Pawnpal</span><span style="font:700 26px Nunito;color:${C.ink2}">  ·  Learn chess with an AI coach</span></div>`;
}

window.seek = (f) => {
  filters = [];
  const html = frame(f);
  stage.innerHTML = `<svg width="0" height="0" style="position:absolute"><defs>${filters.join("")}</defs></svg>${html}`;
};

// ---------------------------------------------------------------- setup

let STORY;
async function text(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(url);
  return r.text();
}

window.ready = (async () => {
  await Promise.all([
    document.fonts.load('700 30px "Nunito"'),
    document.fonts.load('800 30px "Nunito"'),
    document.fonts.load('900 40px "Nunito"'),
  ]);
  await document.fonts.ready;
  STORY = JSON.parse(await text("/tools/sting/story.json"));
  if (STORY.lines.some((l) => !l.dur)) throw new Error("run narrate.mjs first");
  const clean = (s) =>
    s
      .replace(/<style>[\s\S]*?<\/style>/, "")
      .replace(/ role="img" aria-label="[^"]*"/, "");
  for (const e of [
    "happy",
    "surprised",
    "thinking",
    "cheering",
    "encouraging",
  ]) {
    const svg = clean(await text(`/design/assets/pip/pip-${e}.svg`));
    A.pips[e] = svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
  }
  A.pip = A.pips.happy;
  for (const c of "wb")
    for (const p of "KQRBNP")
      A.pieces[c + p] = clean(
        await text(`/design/assets/pieces/pawnpal/${c}${p}.svg`),
      );

  const toMap = (game) => {
    const m = {};
    for (const row of game.board())
      for (const c of row) if (c) m[c.square] = c.color + c.type.toUpperCase();
    return m;
  };
  const LINE =
    "e4 e5 Nf3 Nc6 Bc4 d6 Nc3 g6 d4 exd4 Nxd4 Bg7 Be3 Nf6 O-O O-O h3".split(
      " ",
    );
  const after = (extra) => {
    const g = new Chess();
    for (const m of [...LINE, ...extra]) g.move(m);
    return g;
  };
  if (after(["Re8"]).fen() !== FEN) throw new Error("FEN mismatch");
  PRE = toMap(after([]));
  P0 = toMap(after(["Re8"]));
  P1 = toMap(after(["Re8", "Nf5"]));
  P2 = toMap(after(["Re8", "Re1"]));
  M2 = toMap(after(["Re8", "Re1", "Bf5"]));
  const moves = new Chess(FEN).moves({ square: "d4", verbose: true });
  KN = {
    dots: moves.filter((m) => !m.captured).map((m) => m.to),
    caps: moves.filter((m) => m.captured).map((m) => m.to),
  };
  return { lines: STORY.lines.length };
})();
