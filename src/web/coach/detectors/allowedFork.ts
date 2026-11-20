import { attackedPiecesFrom, isFork, pieceAt } from "../boardQueries.js";
import { finalizeFact } from "../../../shared/coach/types.js";
import { materialAlongPv } from "../material.js";
import { afterLines, type DetectorContext } from "./context.js";
import { betterMoveFact, firstUci, playUci } from "./utils.js";

export function allowedFork(context: DetectorContext) {
  if (!context.after) return [];
  const line = afterLines(context)[0];
  if (!line) return [];
  const uci = firstUci(line);
  const forkMove = playUci(context.after, uci);
  if (
    !forkMove ||
    !isFork(forkMove.position.fen(), forkMove.move.to, context.kidColor)
  ) {
    return [];
  }
  if (materialAlongPv(context.after.fen(), line.pv, 4, context.kidColor) > -2) {
    return [];
  }

  const attacker = pieceAt(context.after.fen(), forkMove.move.from);
  if (!attacker) return [];
  const targets = attackedPiecesFrom(
    forkMove.position.fen(),
    forkMove.move.to,
  ).filter((piece) => piece.color === context.kidColor);

  return [
    finalizeFact({
      kind: "allowed-fork",
      ...betterMoveFact(context),
      attacker,
      targets,
      threatMoveSan: forkMove.move.san,
      threatMoveUci: uci,
    }),
  ];
}
