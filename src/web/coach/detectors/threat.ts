import { attackedPiecesFrom, pieceAt } from "../boardQueries.js";
import type { Square } from "chess.js";
import { finalizeFact } from "../../../shared/coach/types.js";
import { pieceValue } from "../material.js";
import { afterLines, type DetectorContext } from "./context.js";
import { betterMoveFact, firstUci, playUci, replyColor } from "./utils.js";

export function threat(context: DetectorContext) {
  if (!context.after) return [];
  const line = afterLines(context)[0];
  if (!line) return [];
  const uci = firstUci(line);
  const reply = playUci(context.after, uci);
  if (!reply) return [];

  const color = replyColor(context);
  const candidates = [];
  if (reply.move.captured) {
    const target = pieceAt(context.after.fen(), captureSquare(reply.move));
    if (target?.color === context.kidColor) candidates.push(target);
  }
  candidates.push(
    ...attackedPiecesFrom(reply.position.fen(), reply.move.to).filter(
      (piece) => piece.color === context.kidColor,
    ),
  );
  const target = candidates
    .filter((piece) => piece.color === context.kidColor)
    .sort((left, right) => pieceValue(right.type) - pieceValue(left.type))[0];
  if (!target) return [];

  const attacker = pieceAt(context.after.fen(), reply.move.from);
  if (!attacker || attacker.color !== color) return [];
  return [
    finalizeFact({
      kind: "threat",
      ...betterMoveFact(context),
      attacker,
      targets: [target],
      threatMoveSan: reply.move.san,
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
