// Picks and verifies the film's chess position with chess.js and Stockfish.
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { Chess } from "chess.js";
import stockfish from "stockfish";

const line = process.argv[2];
const mistake = process.argv[3];
const board = new Chess();
for (const san of line.split(" ")) board.move(san);
const fen = board.fen();

const engine = spawn(process.execPath, [stockfish.findEngine("lite-single")], {
  stdio: ["pipe", "pipe", "inherit"],
});
const out = createInterface({ input: engine.stdout });
const send = (s) => engine.stdin.write(s + "\n");
function search(position, multipv) {
  return new Promise((resolve) => {
    const lines = {};
    const on = (l) => {
      const m = l.match(
        / depth (\d+) .*multipv (\d+) score (cp|mate) (-?\d+).* pv (\S+)/,
      );
      if (m) lines[m[2]] = { depth: +m[1], [m[3]]: +m[4], uci: m[5] };
      if (l.startsWith("bestmove")) {
        out.off("line", on);
        resolve(Object.values(lines));
      }
    };
    out.on("line", on);
    send(`setoption name MultiPV value ${multipv}`);
    send(`position fen ${position}`);
    send("go depth 18");
  });
}
const CP = 0.00368208;
const win = (s) =>
  "mate" in s
    ? s.mate > 0
      ? 100
      : 0
    : 50 +
      50 *
        (2 / (1 + Math.exp(-CP * Math.max(-1000, Math.min(1000, s.cp)))) - 1);
send("uci");
const before = await search(fen, 3);
const after = new Chess(fen);
const mv = after.move(mistake);
const reply = await search(after.fen(), 1);
const wb = win(before[0]);
const wa = win({
  ...(reply[0].mate !== undefined
    ? { mate: -reply[0].mate }
    : { cp: -reply[0].cp }),
});
const toSan = (uci) =>
  new Chess(fen).move({
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci[4],
  }).san;
console.log(
  JSON.stringify(
    {
      fen,
      moveNumber: board.moveNumber(),
      mistake: mv.san,
      mistakeUci: mv.from + mv.to,
      best: before.map((l) => ({
        san: toSan(l.uci),
        uci: l.uci,
        cp: l.cp,
        mate: l.mate,
        depth: l.depth,
      })),
      replyToMistake: new Chess(after.fen()).move({
        from: reply[0].uci.slice(0, 2),
        to: reply[0].uci.slice(2, 4),
      }).san,
      afterMistakeCpForMover:
        reply[0].mate !== undefined
          ? { mate: -reply[0].mate }
          : { cp: -reply[0].cp },
      winBefore: +wb.toFixed(1),
      winAfter: +wa.toFixed(1),
      drop: +(wb - wa).toFixed(1),
    },
    null,
    1,
  ),
);
send("quit");
