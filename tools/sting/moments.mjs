// Finds and verifies the chess facts behind the 20 s cut:
//  1. the threat Pip warns about after 9...Re8 (what Black wins if White passes)
//  2. a second review moment after 10.Re1: a weak computer move and a missed capture
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { Chess } from "chess.js";
import stockfish from "stockfish";

const engine = spawn(process.execPath, [stockfish.findEngine("lite-single")], {
  stdio: ["pipe", "pipe", "inherit"],
});
const out = createInterface({ input: engine.stdout });
const send = (s) => engine.stdin.write(s + "\n");
function search(fen, depth = 14, multipv = 1) {
  return new Promise((resolve) => {
    const lines = {};
    const on = (l) => {
      const m = l.match(
        / depth (\d+) .*multipv (\d+) score (cp|mate) (-?\d+).* pv (.+)$/,
      );
      if (m) lines[m[2]] = { [m[3]]: +m[4], pv: m[5].split(" ") };
      if (l.startsWith("bestmove")) {
        out.off("line", on);
        resolve(Object.values(lines));
      }
    };
    out.on("line", on);
    send(`setoption name MultiPV value ${multipv}`);
    send(`position fen ${fen}`);
    send(`go depth ${depth}`);
  });
}
const cpOf = (l) => (l.mate !== undefined ? (l.mate > 0 ? 1000 : -1000) : l.cp);
const san = (fen, uci) =>
  new Chess(fen).move({
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci[4],
  }).san;
const pvSan = (fen, pv) => {
  const g = new Chess(fen);
  return pv
    .slice(0, 6)
    .map(
      (u) =>
        g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }).san,
    )
    .join(" ");
};

send("uci");
const base = new Chess();
for (const m of "e4 e5 Nf3 Nc6 Bc4 d6 Nc3 g6 d4 exd4 Nxd4 Bg7 Be3 Nf6 O-O O-O h3 Re8".split(
  " ",
))
  base.move(m);
const FEN = base.fen();

// 1. Threat: give Black the move in the same position.
const passFen = FEN.replace(" w ", " b ");
const [threat] = await search(passFen, 18);
console.log(
  "THREAT if White passes:",
  pvSan(passFen, threat.pv),
  "eval for Black",
  cpOf(threat),
);

// 2. After 10.Re1, rank Black replies by how much they hand White.
const g = new Chess(FEN);
g.move("Re1");
const fenB = g.fen();
const [bestB] = await search(fenB, 14);
const replies = [];
for (const m of g.moves({ verbose: true })) {
  const h = new Chess(fenB);
  h.move(m.san);
  const [w] = await search(h.fen(), 12);
  replies.push({
    san: m.san,
    fen: h.fen(),
    white: cpOf(w),
    best: w.pv[0],
    line: pvSan(h.fen(), w.pv),
  });
}
replies.sort((a, b) => b.white - a.white);
console.log(
  "Black best after Re1:",
  san(fenB, bestB.pv[0]),
  "eval for White",
  -cpOf(bestB),
);
for (const r of replies.slice(0, 10))
  console.log(
    `  ...${r.san.padEnd(6)} White ${String(r.white).padStart(5)}  best ${san(r.fen, r.best).padEnd(6)} ${r.line}`,
  );
send("quit");
