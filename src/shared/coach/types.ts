import type { Color, PieceSymbol, Square } from "chess.js";

export type Grade = "best" | "good" | "inaccuracy" | "mistake" | "blunder";

export type EngineScore = { cp: number } | { mate: number };

export type EngineLine = {
  uci: string;
  san: string;
  cp?: number;
  mate?: number;
  pv: string[];
  depth: number;
};

export type FactKind =
  | "allowed-mate"
  | "missed-mate"
  | "hanging-piece"
  | "allowed-fork"
  | "missed-capture"
  | "missed-fork"
  | "threat"
  | "played-fork";

export type PieceRef = {
  type: PieceSymbol;
  color: Color;
  square: Square;
};

export type CoachFact = {
  schemaVersion: number;
  kind: FactKind;
  pieces: PieceRef[];
  moves: string[];
  squares: string[];
  betterMoveSan?: string;
  mateIn?: number;
};

export type MoveAnalysis = {
  ply: number;
  fenBefore: string;
  moveUci: string;
  moveSan: string;
  linesBefore: EngineLine[];
  linesAfter: EngineLine[];
  winBefore: number;
  winAfter: number;
  drop: number;
  grade: Grade;
  isOnlyMove: boolean;
  facts: CoachFact[];
  late?: boolean;
  attempts?: unknown[];
  hintTier?: 0 | 1 | 2 | 3;
};
