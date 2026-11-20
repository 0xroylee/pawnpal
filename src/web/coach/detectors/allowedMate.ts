import { pieceAt } from "../boardQueries.js";
import { finalizeFact } from "../../../shared/coach/types.js";
import { Chess, type Color, type Square } from "chess.js";
import { afterLines, beforeLines, type DetectorContext } from "./context.js";
import { betterMoveFact, firstUci, mateForKid, playUci } from "./utils.js";

export function allowedMate(context: DetectorContext) {
  if (!context.after) return [];
  const lineAfter = afterLines(context)[0];
  const lineBefore = beforeLines(context)[0];
  if (!lineAfter) return [];

  const mateAfter = mateForKid(lineAfter, context.after, context.kidColor);
  if (mateAfter === undefined || mateAfter < -3 || mateAfter > -1) return [];
  const mateBefore =
    lineBefore && mateForKid(lineBefore, context.before, context.kidColor);
  if (mateBefore !== undefined && mateBefore >= -3 && mateBefore <= -1) {
    return [];
  }

  const uci = firstUci(lineAfter);
  const played = playUci(context.after, uci);
  if (!played) return [];
  const attacker = pieceAt(context.after.fen(), played.move.from);
  const subject = kingRef(context.after.fen(), context.kidColor);
  if (!attacker || !subject) return [];

  return [
    finalizeFact({
      kind: "allowed-mate",
      ...betterMoveFact(context),
      subject,
      attacker,
      threatMoveSan: played.move.san,
      threatMoveUci: uci,
      mateIn: Math.abs(mateAfter),
    }),
  ];
}

function kingRef(fen: string, color: Color) {
  const board = new Chess(fen);
  const pieces = board.board();
  for (let row = 0; row < pieces.length; row += 1) {
    for (let file = 0; file < pieces[row]!.length; file += 1) {
      const piece = pieces[row]![file];
      if (piece?.type === "k" && piece.color === color) {
        const square = `${String.fromCharCode(97 + file)}${8 - row}` as Square;
        return pieceAt(fen, square);
      }
    }
  }
  return undefined;
}
