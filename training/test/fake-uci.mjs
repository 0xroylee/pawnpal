#!/usr/bin/env node
import { createInterface } from "node:readline";
import { Chess } from "chess.js";

let multiPv = 1;
let chess = new Chess();

function toUci(move) {
  return `${move.from}${move.to}${move.promotion ?? ""}`;
}

const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on("line", (line) => {
  if (line === "uci") {
    process.stdout.write(
      "id name PawnPal Fake UCI\noption name MultiPV type spin default 1 min 1 max 16\nuciok\n",
    );
  } else if (line === "isready") {
    process.stdout.write("readyok\n");
  } else if (line.startsWith("setoption name MultiPV value ")) {
    multiPv = Math.max(
      1,
      Number(line.slice("setoption name MultiPV value ".length)) || 1,
    );
  } else if (line.startsWith("position fen ")) {
    const value = line.slice("position fen ".length);
    const movesIndex = value.indexOf(" moves ");
    const fen = movesIndex < 0 ? value : value.slice(0, movesIndex);
    const moves =
      movesIndex < 0 ? [] : value.slice(movesIndex + 7).split(/\s+/);
    try {
      chess = new Chess(fen);
      for (const move of moves) chess.move(move);
    } catch {
      chess = new Chess();
    }
  } else if (line.startsWith("go ")) {
    const moves = chess.moves({ verbose: true }).slice(0, multiPv);
    for (const [index, move] of moves.entries()) {
      process.stdout.write(
        `info depth 1 multipv ${index + 1} score cp 0 pv ${toUci(move)}\n`,
      );
    }
    process.stdout.write(`bestmove ${moves[0] ? toUci(moves[0]) : "0000"}\n`);
  } else if (line === "quit") {
    input.close();
    process.exit(0);
  }
});
