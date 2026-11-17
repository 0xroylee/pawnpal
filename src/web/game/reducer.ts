import { Chess, type Color, type Square } from "chess.js";
import type { EngineLine, MoveAnalysis } from "../../shared/coach/types.ts";

export type GamePhase =
  "setup" | "kidToMove" | "grading" | "opponentToMove" | "over";
export type MoveEnding =
  "checkmate" | "stalemate" | "threefold" | "fifty-move" | "insufficient";
export type GameResult = {
  winner: "kid" | "opponent" | "draw";
  reason: MoveEnding | "resign";
};
export type GameMove = {
  san: string;
  uci: string;
  from: string;
  to: string;
  color: Color;
  ending?: MoveEnding;
};
export type GameState = {
  phase: GamePhase;
  fen: string;
  startFen: string;
  kidColor: Color;
  history: GameMove[];
  lastMove?: { from: string; to: string };
  checkSquare?: string;
  result?: GameResult;
  turnToken: number;
  analyses: Record<number, MoveAnalysis>;
  preAnalysis?: { fen: string; lines: EngineLine[] };
};

export type GameAction =
  | {
      type: "NEW_GAME";
      kidColor: Color | "random";
      fen?: string;
      rng?: () => number;
    }
  | { type: "KID_MOVE"; from: string; to: string; promotion?: string }
  | { type: "OPPONENT_MOVE"; uci: string; turnToken: number }
  | { type: "PRE_ANALYSIS_READY"; fen: string; lines: EngineLine[] }
  | { type: "GRADE_READY"; ply: number; analysis: MoveAnalysis }
  | { type: "GRADE_TIMEOUT"; ply: number; turnToken: number }
  | { type: "RESIGN" }
  | { type: "PLAY_AGAIN" };

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export function initialGame(): GameState {
  return {
    phase: "setup",
    fen: START_FEN,
    startFen: START_FEN,
    kidColor: "w",
    history: [],
    turnToken: 0,
    analyses: {},
  };
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "NEW_GAME": {
      const fen = action.fen ?? START_FEN;
      let chess: Chess;
      try {
        chess = new Chess(fen);
      } catch {
        return state;
      }
      const kidColor: Color =
        action.kidColor === "random"
          ? (action.rng ?? Math.random)() < 0.5
            ? "w"
            : "b"
          : action.kidColor;
      return {
        phase: chess.turn() === kidColor ? "kidToMove" : "opponentToMove",
        fen: chess.fen(),
        startFen: chess.fen(),
        kidColor,
        history: [],
        turnToken: state.turnToken + 1,
        analyses: {},
      };
    }
    case "KID_MOVE": {
      if (state.phase !== "kidToMove") return state;
      return applyMove(state, action.from, action.to, action.promotion);
    }
    case "OPPONENT_MOVE": {
      if (
        state.phase !== "opponentToMove" ||
        action.turnToken !== state.turnToken
      )
        return state;
      const match = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(action.uci);
      if (!match) return state;
      return applyMove(state, match[1], match[2], match[3]);
    }
    case "PRE_ANALYSIS_READY": {
      if (state.phase !== "kidToMove" || action.fen !== state.fen) return state;
      return {
        ...state,
        preAnalysis: { fen: action.fen, lines: action.lines },
      };
    }
    case "GRADE_READY": {
      const move = state.history[action.ply - 1];
      if (
        !move ||
        move.uci !== action.analysis.moveUci ||
        move.color !== state.kidColor ||
        action.analysis.ply !== action.ply ||
        Object.hasOwn(state.analyses, action.ply)
      ) {
        return state;
      }
      const onTime =
        state.phase === "grading" && action.ply === state.history.length;
      const analysis = { ...action.analysis };
      delete analysis.late;
      return {
        ...state,
        phase: onTime ? "opponentToMove" : state.phase,
        analyses: {
          ...state.analyses,
          [action.ply]: onTime ? analysis : { ...analysis, late: true },
        },
      };
    }
    case "GRADE_TIMEOUT": {
      if (
        state.phase !== "grading" ||
        action.ply !== state.history.length ||
        action.turnToken !== state.turnToken
      ) {
        return state;
      }
      return { ...state, phase: "opponentToMove" };
    }
    case "RESIGN": {
      if (state.phase === "setup" || state.phase === "over") return state;
      return {
        ...state,
        phase: "over",
        result: { winner: "opponent", reason: "resign" },
        turnToken: state.turnToken + 1,
      };
    }
    case "PLAY_AGAIN":
      return { ...initialGame(), turnToken: state.turnToken + 1 };
  }
}

function replay(state: GameState): Chess | null {
  try {
    const chess = new Chess(state.startFen);
    for (const move of state.history) {
      chess.move({
        from: move.from as Square,
        to: move.to as Square,
        ...(move.uci[4] ? { promotion: move.uci[4] } : {}),
      });
    }
    return chess;
  } catch {
    return null;
  }
}

function applyMove(
  state: GameState,
  from: string,
  to: string,
  promotion?: string,
): GameState {
  const chess = replay(state);
  if (
    !chess ||
    chess.turn() !==
      (state.phase === "kidToMove" ? state.kidColor : opposite(state.kidColor))
  ) {
    return state;
  }
  const source = from as Square;
  const target = to as Square;
  const legal = chess
    .moves({ square: source, verbose: true })
    .filter((move) => move.to === target);
  if (
    legal.length === 0 ||
    (legal.some((move) => move.promotion) && !promotion)
  )
    return state;

  try {
    const move = chess.move({
      from: source,
      to: target,
      ...(promotion ? { promotion } : {}),
    });
    const ending = findEnding(chess);
    const entry: GameMove = {
      san: move.san,
      uci: `${move.from}${move.to}${move.promotion ?? ""}`,
      from: move.from,
      to: move.to,
      color: move.color,
      ...(ending ? { ending } : {}),
    };
    const history = [...state.history, entry];
    const result = ending
      ? resultForEnding(ending, move.color, state.kidColor)
      : undefined;
    const checkSquare = chess.isCheck()
      ? chess.findPiece({ color: chess.turn(), type: "k" })[0]
      : undefined;
    return {
      ...state,
      phase: result
        ? "over"
        : chess.turn() === state.kidColor
          ? "kidToMove"
          : "grading",
      fen: chess.fen(),
      history,
      lastMove: { from: move.from, to: move.to },
      ...(checkSquare ? { checkSquare } : { checkSquare: undefined }),
      ...(result ? { result } : { result: undefined }),
      preAnalysis: undefined,
      turnToken: state.turnToken + 1,
    };
  } catch {
    return state;
  }
}

function findEnding(chess: Chess): MoveEnding | undefined {
  if (chess.isCheckmate()) return "checkmate";
  if (chess.isStalemate()) return "stalemate";
  if (chess.isThreefoldRepetition()) return "threefold";
  if (chess.isDrawByFiftyMoves()) return "fifty-move";
  if (chess.isInsufficientMaterial()) return "insufficient";
  return undefined;
}

function resultForEnding(
  ending: MoveEnding,
  mover: Color,
  kidColor: Color,
): GameResult {
  if (ending === "checkmate") {
    return {
      winner: mover === kidColor ? "kid" : "opponent",
      reason: ending,
    };
  }
  return { winner: "draw", reason: ending };
}

function opposite(color: Color): Color {
  return color === "w" ? "b" : "w";
}
