import { pieceAt } from "../boardQueries.js";
import type { Square } from "chess.js";
import { finalizeFact } from "../../../shared/coach/types.js";
import { materialAlongPv } from "../material.js";
import { see } from "../see.js";
import { beforeLines, type DetectorContext } from "./context.js";
import { firstUci, mateForKid, playUci } from "./utils.js";

export function missedCapture(context: DetectorContext) {
  const line = beforeLines(context)[0];
  if (!line) return [];
  const uci = firstUci(line);
  if (context.move?.uci === uci) return [];
  const capture = playUci(context.before, uci);
  if (!capture?.move.captured) return [];

  const targetSquare = captureSquare(capture.move);
  const target = pieceAt(context.before.fen(), targetSquare);
  const subject = pieceAt(context.before.fen(), capture.move.from);
  if (!target || !subject || target.color === context.kidColor) return [];
  if (see(context.before.fen(), targetSquare, context.kidColor) < 2) return [];

  const gainsMaterial =
    materialAlongPv(context.before.fen(), line.pv, 2, context.kidColor) >= 2;
  const mates = (mateForKid(line, context.before, context.kidColor) ?? 0) > 0;
  if (!gainsMaterial && !mates) return [];

  return [
    finalizeFact({
      kind: "missed-capture",
      betterMoveSan: capture.move.san,
      betterMoveUci: uci,
      betterMover: subject,
      subject,
      targets: [target],
    }),
  ];
}

function captureSquare(move: {
  from: Square;
  to: Square;
  flags: string;
}): Square {
  return (
    move.flags.includes("e") ? `${move.to[0]}${move.from[1]}` : move.to
  ) as Square;
}
