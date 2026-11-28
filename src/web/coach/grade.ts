import type { Color } from "chess.js";
import type { EngineLine, MoveAnalysis } from "../../shared/coach/types.ts";
import { defaultGradeConfig, type GradeConfig } from "./gradeConfig.js";
import { toKidScore, winChance } from "./winChance.js";
import type { MoveEnding } from "../game/reducer.js";

export type GradeMoveInput = {
  ply: number;
  fenBefore: string;
  move: { uci: string; san: string };
  kidColor: Color;
  linesBefore: EngineLine[];
  linesAfter: EngineLine[];
  ending?: MoveEnding;
};

export class GradingError extends Error {
  readonly code = "no-lines";

  constructor(message = "The pre-move analysis has no lines") {
    super(message);
    this.name = "GradingError";
  }
}

export function gradeMove(
  input: GradeMoveInput,
  config: GradeConfig = defaultGradeConfig,
): MoveAnalysis {
  const bestLine = input.linesBefore[0];
  if (!bestLine) throw new GradingError();

  const winBefore = winChance(
    toKidScore(bestLine, input.kidColor, input.kidColor),
  );
  const afterLine = input.linesAfter[0];
  const winAfter =
    input.ending === "checkmate"
      ? 100
      : input.ending
        ? 50
        : afterLine
          ? winChance(
              toKidScore(afterLine, opposite(input.kidColor), input.kidColor),
            )
          : winBefore;
  const drop = winBefore - winAfter;
  const playedBest = input.move.uci === bestLine.uci;

  let grade: MoveAnalysis["grade"];
  if (playedBest || drop < config.thresholds.best) {
    grade = "best";
  } else if (drop < config.thresholds.good) {
    grade = "good";
  } else if (drop < config.thresholds.inaccuracy) {
    grade = "inaccuracy";
  } else if (drop < config.thresholds.mistake) {
    grade = "mistake";
  } else {
    grade = "blunder";
  }

  if (winAfter >= config.winningCap && grade !== "best" && grade !== "good") {
    grade = "inaccuracy";
  }

  // Win chance barely moves in a lopsided game, so also look at the material
  // the move gives away. Skip the engine's own candidate lines (depth noise)
  // and mate scores (win chance already handles those).
  const listed = input.linesBefore.some((l) => l.uci === input.move.uci);
  const loss =
    afterLine && !input.ending && !listed
      ? centipawnLoss(bestLine, afterLine, input.kidColor)
      : undefined;
  if (loss !== undefined) {
    if (loss >= config.materialFloor.blunder) grade = "blunder";
    else if (loss >= config.materialFloor.mistake && grade !== "blunder")
      grade = "mistake";
  }

  const secondLine = input.linesBefore[1];
  const isOnlyMove =
    playedBest &&
    secondLine !== undefined &&
    winBefore -
      winChance(toKidScore(secondLine, input.kidColor, input.kidColor)) >=
      config.onlyMoveGap;

  return {
    ply: input.ply,
    fenBefore: input.fenBefore,
    moveUci: input.move.uci,
    moveSan: input.move.san,
    linesBefore: input.linesBefore,
    linesAfter: input.linesAfter,
    winBefore,
    winAfter,
    drop,
    grade,
    isOnlyMove,
    facts: [],
  };
}

function centipawnLoss(
  before: EngineLine,
  after: EngineLine,
  kidColor: Color,
): number | undefined {
  const scoreBefore = toKidScore(before, kidColor, kidColor);
  const scoreAfter = toKidScore(after, opposite(kidColor), kidColor);
  if ("mate" in scoreBefore || "mate" in scoreAfter) return undefined;
  return scoreBefore.cp - scoreAfter.cp;
}

function opposite(color: Color): Color {
  return color === "w" ? "b" : "w";
}
