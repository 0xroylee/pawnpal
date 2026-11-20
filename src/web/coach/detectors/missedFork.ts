import { attackedPiecesFrom, isFork, pieceAt } from "../boardQueries.js";
import { finalizeFact } from "../../../shared/coach/types.js";
import { materialAlongPv } from "../material.js";
import { beforeLines, type DetectorContext } from "./context.js";
import { firstUci, playUci, opposite } from "./utils.js";

export function missedFork(context: DetectorContext) {
  const line = beforeLines(context)[0];
  if (!line) return [];
  const uci = firstUci(line);
  if (context.move?.uci === uci) return [];
  const forkMove = playUci(context.before, uci);
  if (
    !forkMove ||
    !isFork(
      forkMove.position.fen(),
      forkMove.move.to,
      opposite(context.kidColor),
    )
  ) {
    return [];
  }
  if (materialAlongPv(context.before.fen(), line.pv, 4, context.kidColor) < 2) {
    return [];
  }

  const subject = pieceAt(context.before.fen(), forkMove.move.from);
  if (!subject) return [];
  const targets = attackedPiecesFrom(
    forkMove.position.fen(),
    forkMove.move.to,
  ).filter((piece) => piece.color === opposite(context.kidColor));

  return [
    finalizeFact({
      kind: "missed-fork",
      betterMoveSan: forkMove.move.san,
      betterMoveUci: uci,
      betterMover: subject,
      subject,
      targets,
    }),
  ];
}
