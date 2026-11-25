import { Chess } from "chess.js";

// Positions are kept in a fixed order. Each entry starts at the normal board.
const lines = [
  "e4 e5 Nf3 Nc6 Bb5 a6",
  "e4 e5 Nf3 Nc6 Bb5 Nf6",
  "e4 e5 Nf3 Nc6 Bc4 Bc5",
  "e4 e5 Nf3 Nc6 Bc4 Nf6",
  "e4 e5 Nf3 Nc6 d4 exd4",
  "e4 e5 Nf3 Nc6 Nc3 Nf6",
  "e4 e5 Nf3 Nf6",
  "e4 e5 Nf3 d6",
  "e4 e5 Nc3 Nf6",
  "e4 e5 f4 exf4",
  "e4 e5 Bc4 Nf6",
  "e4 e5 d4 exd4",
  "e4 c5 Nf3 d6 d4 cxd4",
  "e4 c5 Nf3 Nc6 d4 cxd4",
  "e4 c5 Nf3 e6 d4 cxd4",
  "e4 c5 c3 Nf6",
  "e4 c5 Nc3 Nc6",
  "e4 c5 Nf3 a6",
  "e4 c5 d4 cxd4",
  "e4 e6 d4 d5 e5 c5",
  "e4 e6 d4 d5 Nd2 Nf6",
  "e4 e6 d4 d5 Nc3 Bb4",
  "e4 e6 d4 d5 exd5 exd5",
  "e4 c6 d4 d5 e5 Bf5",
  "e4 c6 d4 d5 Nc3 dxe4",
  "e4 c6 d4 d5 exd5 cxd5",
  "e4 d5 exd5 Qxd5",
  "e4 d5 exd5 Nf6",
  "e4 d6 d4 Nf6 Nc3 g6",
  "e4 g6 d4 Bg7",
  "e4 Nf6 e5 Nd5",
  "d4 d5 c4 e6 Nc3 Nf6",
  "d4 d5 c4 e6 Nc3 c6",
  "d4 d5 c4 dxc4",
  "d4 d5 c4 c6 Nc3 Nf6",
  "d4 d5 Nf3 Nf6 Bf4 e6",
  "d4 d5 e4 dxe4",
  "d4 Nf6 c4 e6 Nc3 Bb4",
  "d4 Nf6 c4 e6 Nf3 b6",
  "d4 Nf6 c4 e6 Nf3 Bb4+",
  "d4 Nf6 c4 g6 Nc3 Bg7",
  "d4 Nf6 c4 g6 Nc3 d5",
  "d4 Nf6 c4 c5 d5 b5",
  "d4 f5 c4 Nf6",
  "c4 e5 Nc3 Nf6",
  "c4 c5 Nc3 Nc6",
  "c4 Nf6 Nc3 e6",
  "Nf3 d5 c4 d4",
  "Nf3 Nf6 g3 g6",
  "b3 e5 Bb2 Nc6",
];

export const openings = lines.map((line) => {
  const board = new Chess();
  for (const move of line.split(" ")) board.move(move);
  return board.fen();
});

if (
  openings.length !== 50 ||
  new Set(openings.map((fen) => fen.split(" ").slice(0, 4).join(" "))).size !==
    50
) {
  throw new Error("Calibration requires 50 distinct opening positions");
}
