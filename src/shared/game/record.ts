import { Chess } from "chess.js";
import type { AttemptRecord } from "../coach/types.js";
import type { GameState } from "./types.js";

export function replayGame({
  startFen,
  history,
}: Pick<GameState, "startFen" | "history">) {
  const chess = new Chess(startFen);
  for (const move of history) chess.move(move.uci);
  return chess;
}

export function gameRecord(state: GameState) {
  const history =
    state.phase === "grading" || state.phase === "nudge"
      ? state.history.slice(0, -1)
      : state.history;
  const chess = replayGame({ startFen: state.startFen, history });
  if (state.result) {
    const winner = state.result.winner;
    const kidWon = winner === "kid";
    const whiteWon = kidWon === (state.kidColor === "w");
    chess.setHeader(
      "Result",
      winner === "draw" ? "1/2-1/2" : whiteWon ? "1-0" : "0-1",
    );
  }
  const attempts: Record<number, AttemptRecord[]> = Object.fromEntries(
    Object.entries({ ...state.pendingGrades, ...state.analyses }).flatMap(
      ([ply, move]) =>
        Number(ply) <= history.length && move.attempts
          ? [[ply, move.attempts]]
          : [],
    ),
  );
  const analyses = Object.fromEntries(
    Object.entries(state.analyses).filter(
      ([ply]) => Number(ply) <= history.length,
    ),
  );
  return { pgn: chess.pgn(), analyses, attempts };
}
