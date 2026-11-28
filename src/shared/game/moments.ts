import { isCoachedGrade, type MoveAnalysis } from "../coach/types.ts";
import type { GameState } from "./types.js";

export function standingAnalyses({ analyses, history, kidColor }: GameState) {
  return history.flatMap((move, index) => {
    const analysis = analyses[index + 1];
    return move.color === kidColor && analysis?.moveUci === move.uci
      ? [analysis]
      : [];
  });
}

export function fixedMistake(analysis: MoveAnalysis) {
  if (isCoachedGrade(analysis.grade)) return undefined;
  if (
    analysis.attempts?.some((attempt) => attempt.revealed || attempt.usedShowMe)
  )
    return undefined;
  return analysis.attempts?.find(
    (attempt) =>
      isCoachedGrade(attempt.grade) && attempt.moveUci !== analysis.moveUci,
  );
}

export function isGreatMove(analysis: MoveAnalysis) {
  return (
    !isCoachedGrade(analysis.grade) &&
    (analysis.isOnlyMove ||
      analysis.facts.some((fact) => fact.kind === "played-fork"))
  );
}

export type ReviewMoment = {
  kind: "blunder" | "mistake" | "fixed" | "great";
  analysis: MoveAnalysis;
};

export function reviewMoments(state: GameState) {
  const analyses = standingAnalyses(state);
  const byDrop = (a: MoveAnalysis, b: MoveAnalysis) =>
    b.drop - a.drop || a.ply - b.ply;
  const blunders = analyses
    .filter((analysis) => analysis.grade === "blunder")
    .sort(byDrop);
  const mistakes = analyses
    .filter((analysis) => analysis.grade === "mistake")
    .sort(byDrop);
  const great = analyses
    .filter(isGreatMove)
    .sort(
      (a, b) => Number(b.isOnlyMove) - Number(a.isOnlyMove) || a.ply - b.ply,
    );
  const fixed = analyses.filter(fixedMistake);
  const clean = blunders.length === 0 && mistakes.length === 0;
  const moments: ReviewMoment[] = clean
    ? great.slice(0, 1).map((analysis) => ({ kind: "great", analysis }))
    : [
        ...blunders.map((analysis) => ({ kind: "blunder" as const, analysis })),
        ...mistakes.map((analysis) => ({ kind: "mistake" as const, analysis })),
        ...fixed
          .filter((analysis) => analysis !== great[0])
          .map((analysis) => ({ kind: "fixed" as const, analysis })),
      ].slice(0, great.length ? 4 : 5);
  if (!clean && great[0]) {
    const highlighted = new Set(moments.map(({ analysis }) => analysis));
    moments.push(
      ...great
        .filter((analysis) => !highlighted.has(analysis))
        .slice(0, 5 - moments.length)
        .map((analysis) => ({ kind: "great" as const, analysis })),
    );
  }
  return {
    clean,
    moments: moments.sort((a, b) => a.analysis.ply - b.analysis.ply),
    counts: {
      great: great.length,
      good: analyses.length - great.length - blunders.length - mistakes.length,
      mistakes: mistakes.length,
      blunders: blunders.length,
      hints: state.history.reduce<number>(
        (count, _, index) =>
          count +
          (state.analyses[index + 1]?.hintTier ??
            state.pendingGrades[index + 1]?.hintTier ??
            0),
        state.hintTier,
      ),
    },
  };
}
