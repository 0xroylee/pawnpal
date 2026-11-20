import type { Color, PieceSymbol, Square } from "chess.js";

export type Grade = "best" | "good" | "inaccuracy" | "mistake" | "blunder";

export function isCoachedGrade(grade: Grade): boolean {
  return grade === "mistake" || grade === "blunder";
}

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

export const COACH_FACT_SCHEMA_VERSION = 1 as const;

export type PieceRef = {
  type: PieceSymbol;
  color: Color;
  square: Square;
};

export type CoachFact = {
  schemaVersion: typeof COACH_FACT_SCHEMA_VERSION;
  kind: FactKind;
  pieces: PieceRef[];
  moves: string[];
  squares: string[];
  betterMoveSan?: string;
  betterMoveUci?: string;
  mateIn?: number;
  subject?: PieceRef;
  attacker?: PieceRef;
  betterMover?: PieceRef;
  targets?: PieceRef[];
  threatMoveSan?: string;
  threatMoveUci?: string;
};

export type CoachFactDraft = Pick<CoachFact, "kind"> &
  Partial<
    Pick<
      CoachFact,
      | "betterMoveSan"
      | "betterMoveUci"
      | "mateIn"
      | "subject"
      | "attacker"
      | "betterMover"
      | "targets"
      | "threatMoveSan"
      | "threatMoveUci"
    >
  >;

export type CoachMode = "nudge" | "explain" | "reveal" | "praise";
export type RephraseMode = CoachMode | "hint";

export function finalizeFact(draft: CoachFactDraft): CoachFact {
  const rolePieces = [
    draft.subject,
    draft.attacker,
    draft.betterMover,
    ...(draft.targets ?? []),
  ].filter((piece): piece is PieceRef => piece !== undefined);
  const pieces = uniqueBy(rolePieces, (piece) =>
    [piece.type, piece.color, piece.square].join(":"),
  );
  const moves = unique(
    [draft.betterMoveSan, draft.threatMoveSan].filter(
      (move): move is string => move !== undefined,
    ),
  );
  const squares = unique([
    ...pieces.map((piece) => piece.square),
    ...[draft.betterMoveUci, draft.threatMoveUci]
      .filter((move): move is string => move !== undefined)
      .flatMap((move) => move.match(/[a-h][1-8]/g) ?? []),
  ]);

  return {
    ...draft,
    schemaVersion: COACH_FACT_SCHEMA_VERSION,
    pieces,
    moves,
    squares,
  };
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function uniqueBy<T>(values: T[], keyFor: (value: T) => string): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = keyFor(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

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
