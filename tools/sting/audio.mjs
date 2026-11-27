// Synthesises the storybook soundtrack: a 96 BPM music-box tune, the narration
// from out/narration/ (run narrate.mjs first) with the music ducked under it,
// and storybook SFX. Writes tools/sting/out/audio-raw.wav (48 kHz stereo float).
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL("./", import.meta.url));
const story = JSON.parse(await readFile(`${here}story.json`, "utf8"));
const SR = 48000;
const DUR = 1800 / (60000 / 1001); // 1800 master frames at 59.94 fps
const N = Math.round(SR * DUR);
const TAU = Math.PI * 2;
const bus = () => ({
  L: new Float32Array(N),
  R: new Float32Array(N),
  verb: new Float32Array(N),
});
const music = bus();
const sfx = bus();
const voice = new Float32Array(N);

let seed = 0x2545f491;
function rnd() {
  seed ^= seed << 13;
  seed >>>= 0;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  seed >>>= 0;
  return seed / 0x100000000;
}
const noise = () => rnd() * 2 - 1;
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
function lp() {
  let y = 0;
  return (x, a) => (y += a * (x - y));
}
const coef = (fc) => 1 - Math.exp((-TAU * fc) / SR);

function add(b, t0, len, fn, { gain = 1, pan = 0, verb = 0 } = {}) {
  const s0 = Math.round(t0 * SR);
  const i0 = Math.max(0, s0);
  const i1 = Math.min(N, Math.round((t0 + len) * SR));
  const gl = gain * Math.cos(((pan + 1) * Math.PI) / 4);
  const gr = gain * Math.sin(((pan + 1) * Math.PI) / 4);
  for (let i = i0; i < i1; i++) {
    const v = fn((i - s0) / SR);
    b.L[i] += v * gl;
    b.R[i] += v * gr;
    if (verb) b.verb[i] += v * gain * verb;
  }
}

// ------------------------------------------------------------------ instruments

function musicBox(b, t0, m, g = 0.1, pan = 0) {
  const f = mtof(m) * 2 ** ((rnd() - 0.5) * 0.006); // tines are never perfectly in tune
  add(
    b,
    t0,
    2.2,
    (t) => {
      const a = Math.min(1, t / 0.006);
      return (
        a *
        (Math.sin(TAU * f * t) * Math.exp(-t * 2.2) +
          0.35 * Math.sin(TAU * f * 3.01 * t) * Math.exp(-t * 6) +
          0.12 * Math.sin(TAU * f * 5.4 * t) * Math.exp(-t * 14))
      );
    },
    { gain: g, pan, verb: 0.45 },
  );
}
function marimba(b, t0, m, g = 0.12, pan = 0) {
  const f = mtof(m);
  add(
    b,
    t0,
    1.2,
    (t) => {
      const a = Math.min(1, t / 0.003);
      return (
        a *
        (Math.sin(TAU * f * t) * Math.exp(-t * 4.5) +
          0.3 * Math.sin(TAU * f * 3.93 * t) * Math.exp(-t * 18))
      );
    },
    { gain: g, pan, verb: 0.25 },
  );
}
function pizz(b, t0, m, g = 0.16) {
  const f = mtof(m);
  const fl = lp();
  let ph = 0;
  add(
    b,
    t0,
    0.8,
    (t) => {
      ph += f / SR;
      const tri = 1 - 4 * Math.abs((ph % 1) - 0.5);
      return (
        fl(tri, coef(900 * Math.exp(-t * 3) + 200)) *
        Math.min(1, t / 0.004) *
        Math.exp(-t * 5)
      );
    },
    { gain: g, verb: 0.15 },
  );
}
function pad(b, t0, notes, len, g = 0.03) {
  notes.forEach((m, j) => {
    const f = mtof(m);
    add(
      b,
      t0,
      len + 0.8,
      (t) => {
        const env =
          Math.min(1, t / 0.6) * (t > len ? Math.exp(-(t - len) * 4) : 1);
        return (
          (Math.sin(TAU * f * t) + 0.25 * Math.sin(TAU * f * 2 * t + 0.4)) *
          env *
          (0.85 + 0.15 * Math.sin(TAU * 0.3 * t + j))
        );
      },
      { gain: g, pan: (j - 1) * 0.4, verb: 0.5 },
    );
  });
}
function celesta(b, t0, m, g = 0.08, pan = 0) {
  const f = mtof(m);
  add(
    b,
    t0,
    2.5,
    (t) =>
      Math.min(1, t / 0.002) *
      (Math.sin(TAU * f * t) * Math.exp(-t * 2.6) +
        0.3 * Math.sin(TAU * f * 2 * t) * Math.exp(-t * 4) +
        0.12 * Math.sin(TAU * f * 3 * t) * Math.exp(-t * 7)),
    { gain: g, pan, verb: 0.6 },
  );
}
function wood(b, t0, f0, decay, g) {
  add(
    b,
    t0,
    0.15,
    (t) =>
      (Math.sin(TAU * f0 * t) * 0.7 + Math.sin(TAU * f0 * 2.31 * t) * 0.3) *
        Math.exp(-t * decay) +
      (t < 0.002 ? noise() * 0.5 : 0),
    { gain: g, verb: 0.12 },
  );
}
function swish(b, peak, g, rise = 0.45) {
  const f1 = lp();
  const f2 = lp();
  add(
    b,
    peak - rise,
    rise + 0.3,
    (t) => {
      const x = t / rise;
      const env =
        x <= 1 ? Math.sin((Math.PI / 2) * x) ** 2 : Math.exp(-(t - rise) * 12);
      const fc = 700 + 3000 * Math.sin(Math.PI * Math.min(1, x * 0.9));
      const n = noise();
      const crinkle = rnd() < 0.004 ? 3 : 1;
      return f2(n - f1(n, coef(fc * 0.4)), coef(fc)) * env * crinkle;
    },
    { gain: g, verb: 0.2 },
  );
}
function thump(b, t0, g) {
  let ph = 0;
  add(
    b,
    t0,
    0.4,
    (t) => {
      ph += (TAU * (70 + 50 * Math.exp(-t * 30))) / SR;
      return (
        Math.sin(ph) * Math.exp(-t * 14) + noise() * 0.12 * Math.exp(-t * 40)
      );
    },
    { gain: g, verb: 0.2 },
  );
}
const tick = (b, t0, g) => wood(b, t0, 2100, 260, g);

// ------------------------------------------------------------------ music (96 BPM)

// Played, not programmed: every note lands a little early or late, a little
// louder or softer, offbeats swing slightly, and the last bar slows down.
const human = (t, g, amt = 0.014) => [
  t + (rnd() - 0.5) * 2 * amt,
  g * (0.8 + 0.4 * rnd()),
];
const BEAT = 60 / 96;
const BAR = 4 * BEAT;
const CH = {
  C: [48, 60, 64, 67],
  Am: [45, 57, 60, 64],
  F: [41, 57, 60, 65],
  G: [43, 55, 59, 62],
};
const bars = ["C", "Am", "F", "G", "Am", "F", "C", "G", "C", "F", "G", "C"];
const tune = {
  C: [72, 76, 79, 76],
  Am: [72, 69, 72, 76],
  F: [77, 76, 72, 69],
  G: [74, 71, 74, 79],
};
bars.forEach((name, k) => {
  const t0 = k * BAR;
  const [root, ...tones] = CH[name];
  const last = k === bars.length - 1;
  const at = (beats) => t0 + beats * BEAT * (last ? 1 + beats * 0.06 : 1); // ritardando on the last bar
  pad(music, t0, tones, last ? DUR - t0 : BAR, 0.022);
  const arp = [
    tones[0] + 12,
    tones[1] + 12,
    tones[2] + 12,
    tones[1] + 24,
    tones[2] + 12,
    tones[1] + 12,
    tones[0] + 12,
    tones[1] + 12,
  ];
  const n = last ? 4 : 8;
  for (let i = 0; i < n; i++) {
    const swing = i % 2 ? 0.035 : 0;
    const [t, g] = human(at(i / 2 + swing), i % 2 ? 0.045 : 0.065);
    musicBox(music, t, arp[i], g, i % 2 ? 0.3 : -0.3);
  }
  if (k >= 1 && !last) {
    const [p1, g1] = human(at(0), 0.16);
    const [p2, g2] = human(at(2), 0.13);
    pizz(music, p1, root, g1);
    pizz(music, p2, root + 7, g2);
    tune[name].forEach((m, i) => {
      const [t, g] = human(at(i), 0.07, 0.018);
      marimba(music, t, m, g, 0.15);
    });
  }
  if (k >= 4 && k <= 6)
    for (let i = 0; i < 4; i++) {
      const [t, g] = human(at(i + 0.5), 0.025);
      tick(music, t, g);
    } // "thinking" ticks
});
[84, 88, 91, 96].forEach((m, i) =>
  musicBox(music, 11 * BAR + 0.15 + i * (0.13 + i * 0.02), m, 0.07),
);

// ------------------------------------------------------------------ SFX

const typing = (t0, t1) => {
  for (let t = t0; t <= t1; t += 0.034 + 0.012 * rnd())
    tick(sfx, t, 0.01 + 0.01 * rnd());
};
for (let i = 0; i < 6; i++)
  musicBox(sfx, 0.1 + i * 0.07, 79 + [0, 4, 7, 12, 16, 19][i], 0.05); // once upon a time
swish(sfx, 1.65, 0.3, 0.45); // the hard cover opens
thump(sfx, 2.1, 0.32); // ...and lands on the table
swish(sfx, 3.375, 0.26, 0.55); // the title page turns
wood(sfx, 5.0, 700, 80, 0.1);
wood(sfx, 5.3, 380, 45, 0.3); // ...Re8
marimba(sfx, 5.42, 57, 0.12); // a warning
marimba(sfx, 5.55, 56, 0.1);
marimba(sfx, 5.9, 84, 0.1); // Pip pops up
typing(5.95, 6.8);
wood(sfx, 8.15, 820, 70, 0.18);
wood(sfx, 8.85, 360, 45, 0.38); // Nf5
marimba(sfx, 9.05, 67, 0.13); // uh-oh
marimba(sfx, 9.22, 63, 0.13);
for (const [a, b] of [
  [11.2, 12.25],
  [17.35, 18.4],
  [22.8, 23.85],
])
  swish(sfx, (a + b) / 2, 0.3, 0.55); // page turns
for (let t = 12.35; t <= 13.3; t += 0.055) tick(sfx, t, 0.028); // depth ticks
[0, 1, 2, 3].forEach((i) => celesta(sfx, 12.7 + i * 0.25, 79 - i * 3, 0.05)); // win chance falls
marimba(sfx, 13.7, 45, 0.2); // Blunder
pizz(sfx, 13.7, 33, 0.18);
swish(sfx, 14.5, 0.12, 0.25); // the facts card
for (let i = 0; i < 12; i++)
  musicBox(sfx, 14.95 + i * 0.035, 84 + (i % 4) * 3, 0.025); // facts stream into the model
celesta(sfx, 15.5, 76, 0.07);
celesta(sfx, 15.5, 83, 0.05);
typing(15.93, 16.7);
wood(sfx, 18.65, 1500, 120, 0.1); // Try again
wood(sfx, 18.7, 820, 70, 0.12);
wood(sfx, 19.0, 380, 45, 0.25);
[19.4, 19.95, 20.45].forEach((t, i) => {
  wood(sfx, t, 1500, 120, 0.1); // More help
  marimba(sfx, t + 0.05, [84, 88, 91][i], 0.08);
});
wood(sfx, 20.75, 820, 70, 0.18);
wood(sfx, 21.15, 380, 45, 0.34); // Re1
celesta(sfx, 21.2, 84, 0.09); // ✓
celesta(sfx, 21.32, 91, 0.08);
for (let i = 0; i < 5; i++)
  musicBox(sfx, 21.4 + i * 0.06, 84 + [0, 4, 7, 12, 16][i], 0.035); // Pip cheers
wood(sfx, 25.2, 1500, 120, 0.1); // Next
swish(sfx, 25.4, 0.1, 0.25);
swish(sfx, 27.1, 0.32, 0.5); // the book closes
thump(sfx, 27.6, 0.4);
celesta(sfx, 27.65, 72, 0.06);
celesta(sfx, 27.65, 79, 0.05);

// ------------------------------------------------------------------ narration

function readWav(buf) {
  let p = 12;
  let fmt = 0;
  while (p < buf.length) {
    const id = buf.toString("ascii", p, p + 4);
    const size = buf.readUInt32LE(p + 4);
    if (id === "fmt ") fmt = buf.readUInt16LE(p + 8);
    if (id === "data") {
      if (fmt !== 3) throw new Error("expected float WAV");
      const out = new Float32Array(size / 4);
      for (let i = 0; i < out.length; i++)
        out[i] = buf.readFloatLE(p + 8 + i * 4);
      return out;
    }
    p += 8 + size + (size % 2);
  }
  throw new Error("no data chunk");
}
const duck = new Float32Array(N).fill(1);
for (const [i, line] of story.lines.entries()) {
  const v = readWav(await readFile(`${here}out/narration/L${i}.wav`));
  const s0 = Math.round(line.start * SR);
  for (let j = 0; j < v.length && s0 + j < N; j++) voice[s0 + j] += v[j];
  const a = line.start - 0.2;
  const b = line.start + line.dur + 0.3;
  for (
    let k = Math.max(0, Math.round((a - 0.25) * SR));
    k < Math.min(N, Math.round((b + 0.4) * SR));
    k++
  ) {
    const t = k / SR;
    const g = t < a ? (t - (a - 0.25)) / 0.25 : t > b ? 1 - (t - b) / 0.4 : 1;
    duck[k] = Math.min(duck[k], 1 - 0.5 * clamp01(g));
  }
}
function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

// ------------------------------------------------------------------ reverb and mix

function reverb(input, delays) {
  const out = new Float32Array(N);
  const combs = delays.map((d) => ({ buf: new Float32Array(d), i: 0, z: 0 }));
  for (let n = 0; n < N; n++) {
    let s = 0;
    for (const c of combs) {
      const y = c.buf[c.i];
      c.z += 0.35 * (y - c.z);
      c.buf[c.i] = input[n] + c.z * 0.84;
      c.i = (c.i + 1) % c.buf.length;
      s += y;
    }
    out[n] = s / combs.length;
  }
  for (const d of [556, 441]) {
    const buf = new Float32Array(d);
    let i = 0;
    for (let n = 0; n < N; n++) {
      const b = buf[i];
      const y = -out[n] + b;
      buf[i] = out[n] + b * 0.5;
      out[n] = y;
      i = (i + 1) % d;
    }
  }
  return out;
}
// Level the narration (any voice source) to a fixed speech loudness.
let vs = 0;
let vn = 0;
for (let i = 0; i < N; i++)
  if (Math.abs(voice[i]) > 0.01) {
    vs += voice[i] * voice[i];
    vn++;
  }
const voiceGain = 0.11 / Math.sqrt(vs / vn);
for (let i = 0; i < N; i++) voice[i] *= voiceGain;
{
  let ms = 0;
  let mn = 0;
  for (let i = 0; i < N; i++)
    if (duck[i] < 0.99) {
      const m = (music.L[i] + music.R[i]) * 0.5 * duck[i] * 1.4;
      ms += m * m;
      mn++;
    }
  console.log(
    `voice gain ${voiceGain.toFixed(2)}; voice sits ${(20 * Math.log10(0.11 / Math.sqrt(ms / mn))).toFixed(1)} dB above the ducked music`,
  );
}
const verbIn = new Float32Array(N);
for (let i = 0; i < N; i++) verbIn[i] = music.verb[i] * duck[i] + sfx.verb[i];
const vl = reverb(verbIn, [1557, 1617, 1491, 1422, 1277]);
const vr = reverb(verbIn, [1580, 1640, 1514, 1445, 1300]);
const L = new Float32Array(N);
const R = new Float32Array(N);
for (let i = 0; i < N; i++) {
  L[i] = music.L[i] * duck[i] * 1.4 + sfx.L[i] + vl[i] * 0.6 + voice[i];
  R[i] = music.R[i] * duck[i] * 1.4 + sfx.R[i] + vr[i] * 0.6 + voice[i];
}

const data = Buffer.alloc(N * 8);
for (let i = 0; i < N; i++) {
  data.writeFloatLE(L[i], i * 8);
  data.writeFloatLE(R[i], i * 8 + 4);
}
const h = Buffer.alloc(44);
h.write("RIFF", 0);
h.writeUInt32LE(36 + data.length, 4);
h.write("WAVEfmt ", 8);
h.writeUInt32LE(16, 16);
h.writeUInt16LE(3, 20);
h.writeUInt16LE(2, 22);
h.writeUInt32LE(SR, 24);
h.writeUInt32LE(SR * 8, 28);
h.writeUInt16LE(8, 32);
h.writeUInt16LE(32, 34);
h.write("data", 36);
h.writeUInt32LE(data.length, 40);
await mkdir(`${here}out`, { recursive: true });
await writeFile(`${here}out/audio-raw.wav`, Buffer.concat([h, data]));
console.log(`wrote ${(N / SR).toFixed(3)} s`);
