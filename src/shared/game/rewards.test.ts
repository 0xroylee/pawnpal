import { expect, it } from "vitest";
import { finalizeFact, type MoveAnalysis } from "../coach/types.js";
import { fixedCount, gameBadges, starsForGame } from "./rewards.js";
import type { GameState } from "./types.js";

const fen = "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1";
const standing: MoveAnalysis = {
  ply: 1,
  fenBefore: fen,
  moveUci: "e2e4",
  moveSan: "e4",
  linesBefore: [],
  linesAfter: [],
  winBefore: 50,
  winAfter: 50,
  drop: 0,
  grade: "good",
  isOnlyMove: false,
  facts: [],
};
const retry = {
  grade: "blunder",
  moveUci: "e2e3",
  moveSan: "e3",
  usedShowMe: false,
  revealed: false,
} as const;

function game(
  moves: number,
  result: GameState["result"],
  analysis: MoveAnalysis = standing,
): GameState {
  return {
    phase: "over",
    fen,
    startFen: fen,
    kidColor: "w",
    result,
    history: Array.from({ length: moves }, () => ({
      color: "w",
      uci: "e2e4",
      san: "e4",
      from: "e2",
      to: "e4",
    })),
    gameToken: 1,
    turnToken: moves,
    hintTier: 0,
    pendingGrades: {},
    offerTryAgain: true,
    analyses: Object.fromEntries(
      Array.from({ length: moves }, (_, index) => [
        index + 1,
        { ...analysis, ply: index + 1 },
      ]),
    ),
  };
}

it("counts finishing, a clean blunder record and a result separately", () => {
  const loss = { winner: "opponent", reason: "resign" } as const;
  expect(starsForGame(game(9, loss, { ...standing, grade: "blunder" }))).toBe(
    0,
  );
  expect(starsForGame(game(9, loss, { ...standing, attempts: [retry] }))).toBe(
    1,
  );
  expect(starsForGame(game(10, loss))).toBe(2);
  expect(starsForGame(game(20, { winner: "draw", reason: "stalemate" }))).toBe(
    3,
  );
  expect(starsForGame(game(20, undefined))).toBeNull();
});

it("recognizes all eight achievements independently of previously awarding them", () => {
  const won = game(
    20,
    { winner: "kid", reason: "checkmate" },
    { ...standing, attempts: [retry] },
  );
  won.analyses[1] = {
    ...won.analyses[1]!,
    winBefore: 50,
    winAfter: 24,
    facts: [finalizeFact({ kind: "played-fork" })],
  };
  expect(fixedCount(won)).toBe(20);
  expect(gameBadges(won, 3, 2, 5)).toEqual([
    "first-game",
    "first-win",
    "first-checkmate",
    "clean-game",
    "comeback",
    "fork-finder",
    "try-again-hero",
    "level-up",
  ]);
  delete won.analyses[2];
  expect(gameBadges(won, 3, 3, 4)).toEqual([
    "first-game",
    "first-win",
    "first-checkmate",
    "comeback",
    "fork-finder",
  ]);
});
