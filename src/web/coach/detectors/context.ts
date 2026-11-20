import { Chess, type Color, type Square } from "chess.js";
import type {
  CoachFact,
  EngineLine,
  MoveAnalysis,
} from "../../../shared/coach/types.ts";

export type HintAnalysis = { fen: string; lines: EngineLine[] };
export type DetectorAnalysis = MoveAnalysis | HintAnalysis;

export type DetectorMove = {
  uci: string;
  san: string;
  from: Square;
  to: Square;
};

export type DetectorContext = {
  before: Chess;
  after?: Chess;
  move?: DetectorMove;
  analysis: DetectorAnalysis;
  kidColor: Color;
};

export type BuildContextInput = {
  analysis: DetectorAnalysis;
  kidColor: Color;
  fenBefore?: string;
  move?: { uci: string; san?: string };
};

export type Detector = (context: DetectorContext) => CoachFact[];

export function buildContext(input: BuildContextInput): DetectorContext {
  const fenBefore =
    input.fenBefore ??
    ("fenBefore" in input.analysis
      ? input.analysis.fenBefore
      : input.analysis.fen);
  const before = new Chess(fenBefore);
  const moveInput =
    input.move ??
    ("moveUci" in input.analysis
      ? { uci: input.analysis.moveUci, san: input.analysis.moveSan }
      : undefined);

  if (!moveInput) {
    return { before, analysis: input.analysis, kidColor: input.kidColor };
  }

  const after = new Chess(before.fen());
  const played = after.move(uciMove(moveInput.uci));
  return {
    before,
    after,
    move: {
      uci: moveInput.uci,
      san: moveInput.san ?? played.san,
      from: played.from,
      to: played.to,
    },
    analysis: input.analysis,
    kidColor: input.kidColor,
  };
}

export function beforeLines(context: DetectorContext): EngineLine[] {
  return "linesBefore" in context.analysis
    ? context.analysis.linesBefore
    : context.analysis.lines;
}

export function afterLines(context: DetectorContext): EngineLine[] {
  return "linesAfter" in context.analysis ? context.analysis.linesAfter : [];
}

function uciMove(uci: string) {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) {
    throw new Error(`Invalid UCI move: ${uci}`);
  }
  return {
    from: uci.slice(0, 2) as Square,
    to: uci.slice(2, 4) as Square,
    ...(uci[4] ? { promotion: uci[4] as "q" | "r" | "b" | "n" } : {}),
  };
}
