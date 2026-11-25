import { expect, it } from "vitest";
import type { MoveAnalysis } from "../coach/types.js";
import { reviewMoments } from "./moments.js";
import type { GameState } from "./types.js";

const fen = "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1";
const retry = {
  moveUci: "e2e3",
  moveSan: "e3",
  grade: "blunder",
  usedShowMe: false,
  revealed: false,
} as const;

function analysis(
  ply: number,
  overrides: Partial<MoveAnalysis> = {},
): MoveAnalysis {
  return {
    ply,
    fenBefore: fen,
    moveUci: "e2e4",
    moveSan: "e4",
    grade: "good",
    linesBefore: [],
    linesAfter: [],
    winBefore: 50,
    winAfter: 50,
    drop: 0,
    isOnlyMove: false,
    facts: [],
    ...overrides,
  };
}

function game(
  analyses: MoveAnalysis[],
  length = analyses.at(-1)?.ply ?? 0,
): GameState {
  return {
    phase: "over",
    fen,
    startFen: fen,
    kidColor: "w",
    history: Array.from({ length }, (_, index) => ({
      uci: index % 2 ? "e8e7" : "e2e4",
      san: index % 2 ? "Ke7" : "e4",
      color: index % 2 ? "b" : "w",
      from: index % 2 ? "e8" : "e2",
      to: index % 2 ? "e7" : "e4",
    })),
    gameToken: 1,
    turnToken: length + 1,
    analyses: Object.fromEntries(analyses.map((item) => [item.ply, item])),
    pendingGrades: {},
    offerTryAgain: true,
    hintTier: 0,
  };
}

it("ranks standing moments, reserves a great move, and shows them in play order", () => {
  const review = reviewMoments(
    game(
      [
        analysis(1, { grade: "blunder", drop: 31 }),
        analysis(3, { grade: "mistake", drop: 24 }),
        analysis(5, { grade: "blunder", drop: 40 }),
        analysis(7, { grade: "blunder", drop: 45 }),
        analysis(9, { attempts: [retry] }),
        analysis(11, { isOnlyMove: true }),
        analysis(13, { grade: "blunder", drop: 33 }),
      ],
      15,
    ),
  );
  expect(review.clean).toBe(false);
  expect(review.moments.map(({ analysis }) => analysis.ply)).toEqual([
    1, 5, 7, 11, 13,
  ]);
  expect(review.counts).toEqual({
    great: 1,
    good: 1,
    mistakes: 1,
    blunders: 4,
    hints: 0,
  });
});

it("includes a successful retry without counting the taken-back blunder", () => {
  const review = reviewMoments(
    game([
      analysis(1, { attempts: [retry], hintTier: 2 }),
      analysis(3, { grade: "mistake" }),
      analysis(5, { attempts: [{ ...retry, revealed: true }] }),
    ]),
  );
  expect(review.moments.map(({ kind }) => kind)).toEqual(["fixed", "mistake"]);
  expect(review.counts).toMatchObject({ blunders: 0, hints: 2 });
});

it("celebrates a clean game and includes only its best great move", () => {
  const review = reviewMoments(
    game([
      analysis(1, { attempts: [retry] }),
      analysis(3, { isOnlyMove: true }),
      analysis(5, { isOnlyMove: true }),
    ]),
  );
  expect(review.clean).toBe(true);
  expect(review.moments.map(({ analysis }) => analysis.ply)).toEqual([3]);
  expect(reviewMoments(game([])).moments).toEqual([]);
});
