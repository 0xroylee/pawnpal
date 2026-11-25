import type { Color } from "chess.js";
import type { Difficulty } from "./difficulty.js";
import type {
  AttemptRecord,
  EngineLine,
  MoveAnalysis,
} from "../coach/types.js";

export type GamePhase =
  | "setup"
  | "kidToMove"
  | "grading"
  | "nudge"
  | "reveal"
  | "opponentToMove"
  | "over";
export type MoveEnding =
  "checkmate" | "stalemate" | "threefold" | "fifty-move" | "insufficient";
export type GameResult = {
  winner: "kid" | "opponent" | "draw";
  reason: MoveEnding | "resign";
};
export type HintTier = 0 | 1 | 2 | 3;
export type GameMove = {
  san: string;
  uci: string;
  from: string;
  to: string;
  color: Color;
  ending?: MoveEnding;
};
type PendingGrade = {
  turnToken: number;
  hintTier: HintTier;
  attempts?: AttemptRecord[];
};
type RetryTurn = {
  original: MoveAnalysis;
  attempts: AttemptRecord[];
  reveal?: MoveAnalysis;
};
export type GameState = {
  phase: GamePhase;
  fen: string;
  startFen: string;
  kidColor: Color;
  level?: Difficulty;
  history: GameMove[];
  lastMove?: { from: string; to: string };
  checkSquare?: string;
  result?: GameResult;
  gameToken: number;
  turnToken: number;
  analyses: Record<number, MoveAnalysis>;
  hintTier: HintTier;
  pendingGrades: Record<number, PendingGrade>;
  offerTryAgain: boolean;
  retry?: RetryTurn;
  preAnalysis?: { fen: string; lines: EngineLine[] };
};
