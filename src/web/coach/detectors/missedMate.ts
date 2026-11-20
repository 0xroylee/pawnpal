import { pieceAt } from "../boardQueries.js";
import { finalizeFact } from "../../../shared/coach/types.js";
import { afterLines, beforeLines, type DetectorContext } from "./context.js";
import { firstUci, mateForKid, playUci } from "./utils.js";

export function missedMate(context: DetectorContext) {
  const lineBefore = beforeLines(context)[0];
  if (!lineBefore) return [];

  const mateBefore = mateForKid(lineBefore, context.before, context.kidColor);
  if (mateBefore !== 1 && mateBefore !== 2) return [];

  const lineAfter = context.after ? afterLines(context)[0] : undefined;
  const mateAfter =
    lineAfter &&
    context.after &&
    mateForKid(lineAfter, context.after, context.kidColor);
  if (mateAfter !== undefined && mateAfter > 0 && mateAfter <= mateBefore - 1) {
    return [];
  }

  const uci = firstUci(lineBefore);
  const bestMove = playUci(context.before, uci);
  if (!bestMove) return [];
  const subject = pieceAt(context.before.fen(), bestMove.move.from);
  if (!subject) return [];

  return [
    finalizeFact({
      kind: "missed-mate",
      betterMoveSan: bestMove.move.san,
      betterMoveUci: uci,
      mateIn: mateBefore,
      subject,
      betterMover: subject,
    }),
  ];
}
