import { isCoachedGrade } from "../coach/types.ts";
import { fixedMistake, standingAnalyses } from "./moments.ts";
import type { GameState } from "./types.js";

export const badgeIds = [
  "first-game",
  "first-win",
  "first-checkmate",
  "clean-game",
  "comeback",
  "fork-finder",
  "try-again-hero",
  "level-up",
] as const;
export type BadgeId = (typeof badgeIds)[number];
export type Badge = { id: BadgeId; earnedAt: string };

export function fixedCount(state: GameState) {
  return standingAnalyses(state).filter(fixedMistake).length;
}

export function starsForGame(state: GameState): number | null {
  if (!state.result) return null;
  const moves = state.history.filter((move) => move.color === state.kidColor);
  const finished = state.result.reason !== "resign" || moves.length >= 10;
  const avoidedBlunders = standingAnalyses(state).every(
    ({ grade }) => grade !== "blunder",
  );
  const wonOrDrew = state.result.winner !== "opponent";
  return Number(finished) + Number(avoidedBlunders) + Number(wonOrDrew);
}

export function gameBadges(
  state: GameState,
  level: number,
  previousWin: number | null,
  totalFixed: number,
) {
  if (!state.result) return [];
  const analyses = standingAnalyses(state);
  const kidMoves = state.history.filter(
    (move) => move.color === state.kidColor,
  );
  const standingUciAt = (index: number) => {
    const analysis = state.analyses[index + 1];
    return analysis?.moveUci === state.history[index]?.uci;
  };
  const won = state.result.winner === "kid";
  const clean =
    kidMoves.length >= 20 &&
    state.history.every(
      (move, index) =>
        move.color !== state.kidColor || move.ending || standingUciAt(index),
    ) &&
    analyses.every(({ grade }) => !isCoachedGrade(grade));
  const earned: Record<BadgeId, boolean> = {
    "first-game": true,
    "first-win": won,
    "first-checkmate": won && state.result.reason === "checkmate",
    "clean-game": clean,
    comeback:
      won &&
      analyses.some(
        ({ winBefore, winAfter }) => winAfter < 25 && winAfter < winBefore,
      ),
    "fork-finder": analyses.some(({ facts }) =>
      facts.some((fact) => fact.kind === "played-fork"),
    ),
    "try-again-hero": totalFixed >= 5,
    "level-up": won && previousWin !== null && level > previousWin,
  };
  return badgeIds.filter((id) => earned[id]);
}
