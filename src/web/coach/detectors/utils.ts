import { Chess, type Color, type PieceSymbol, type Square } from "chess.js";
import type { EngineLine } from "../../../shared/coach/types.ts";
import type { CoachFactDraft } from "../../../shared/coach/types.ts";
import { kidMate, pieceAt } from "../boardQueries.js";
import { toKidScore } from "../winChance.js";
import { beforeLines, type DetectorContext } from "./context.js";

export function firstUci(line: EngineLine): string {
  return line.pv[0] ?? line.uci;
}

export function betterMoveFact(
  context: DetectorContext,
): Partial<CoachFactDraft> {
  const line = beforeLines(context)[0];
  if (!line) return {};
  const uci = line.uci;
  const played = playUci(context.before, uci);
  if (!played) return {};
  const betterMover = pieceAt(context.before.fen(), played.move.from);
  if (!betterMover) return {};
  return {
    betterMoveSan: played.move.san,
    betterMoveUci: uci,
    betterMover,
  };
}

export function playUci(board: Chess, uci: string) {
  try {
    const position = new Chess(board.fen());
    const move = position.move(uciMove(uci));
    return { position, move };
  } catch {
    return undefined;
  }
}

export function mateForKid(
  line: EngineLine | undefined,
  position: Chess,
  kidColor: Color,
): number | undefined {
  if (!line) return undefined;
  return kidMate(toKidScore(line, position.turn(), kidColor));
}

export function opposite(color: Color): Color {
  return color === "w" ? "b" : "w";
}

export function replyColor(context: DetectorContext): Color {
  return opposite(context.kidColor);
}

function uciMove(uci: string) {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) {
    throw new Error(`Invalid UCI move: ${uci}`);
  }
  return {
    from: uci.slice(0, 2) as Square,
    to: uci.slice(2, 4) as Square,
    ...(uci[4] ? { promotion: uci[4] as PieceSymbol } : {}),
  };
}
