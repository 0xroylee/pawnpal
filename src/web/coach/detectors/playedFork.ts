import { attackedPiecesFrom, isFork } from "../boardQueries.js";
import { finalizeFact } from "../../../shared/coach/types.js";
import { materialAlongPv } from "../material.js";
import { afterLines, type DetectorContext } from "./context.js";
import { opposite } from "./utils.js";

export function playedFork(context: DetectorContext) {
  if (!context.after || !context.move) return [];
  const line = afterLines(context)[0];
  if (
    !line ||
    !isFork(context.after.fen(), context.move.to, opposite(context.kidColor))
  ) {
    return [];
  }
  if (materialAlongPv(context.after.fen(), line.pv, 4, context.kidColor) < 2) {
    return [];
  }

  const subject = context.after.get(context.move.to);
  if (!subject) return [];
  const targets = attackedPiecesFrom(
    context.after.fen(),
    context.move.to,
  ).filter((piece) => piece.color === opposite(context.kidColor));
  return [
    finalizeFact({
      kind: "played-fork",
      subject: { ...subject, square: context.move.to },
      targets,
    }),
  ];
}
