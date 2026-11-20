import { pieceAt } from "../boardQueries.js";
import type { Square } from "chess.js";
import { finalizeFact } from "../../../shared/coach/types.js";
import { materialAlongPv, pieceValue } from "../material.js";
import { see } from "../see.js";
import { afterLines, type DetectorContext } from "./context.js";
import { betterMoveFact, firstUci, playUci, replyColor } from "./utils.js";

export function hangingPiece(context: DetectorContext) {
  if (!context.after) return [];
  const line = afterLines(context)[0];
  if (!line) return [];
  const uci = firstUci(line);
  const capture = playUci(context.after, uci);
  if (!capture?.move.captured) return [];

  const victimSquare = captureSquare(capture.move);
  const victim = pieceAt(context.after.fen(), victimSquare);
  if (!victim || victim.color !== context.kidColor) return [];
  if (see(context.after.fen(), victimSquare, replyColor(context)) < 2)
    return [];
  if (
    materialAlongPv(context.after.fen(), line.pv, 2, context.kidColor) >
    -(pieceValue(victim.type) - 1)
  ) {
    return [];
  }

  const attacker = pieceAt(context.after.fen(), capture.move.from);
  if (!attacker) return [];
  return [
    finalizeFact({
      kind: "hanging-piece",
      ...betterMoveFact(context),
      subject: victim,
      attacker,
      threatMoveSan: capture.move.san,
      threatMoveUci: uci,
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
