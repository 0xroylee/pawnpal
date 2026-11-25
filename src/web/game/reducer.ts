import { Chess, type Color, type Square } from "chess.js";
import {
  isCoachedGrade,
  type EngineLine,
  type MoveAnalysis,
} from "../../shared/coach/types.js";

import { replayGame } from "../../shared/game/record.js";
import type { Difficulty } from "../../shared/game/difficulty.js";
import type {
  GameState,
  HintTier,
  MoveEnding,
  GameMove,
  GameResult,
} from "../../shared/game/types.js";

export { gameRecord } from "../../shared/game/record.js";
export type {
  GamePhase,
  GameState,
  HintTier,
  MoveEnding,
  GameMove,
  GameResult,
} from "../../shared/game/types.js";

export type GameAction =
  | {
      type: "NEW_GAME";
      kidColor: Color | "random";
      fen?: string;
      level?: Difficulty;
      rng?: () => number;
      offerTryAgain?: boolean;
    }
  | { type: "RESTORE_GAME"; saved: GameState }
  | { type: "KID_MOVE"; from: string; to: string; promotion?: string }
  | { type: "HINT"; tier: Exclude<HintTier, 0> }
  | { type: "OPPONENT_MOVE"; uci: string; turnToken: number }
  | { type: "PRE_ANALYSIS_READY"; fen: string; lines: EngineLine[] }
  | {
      type: "GRADE_READY";
      ply: number;
      turnToken: number;
      analysis: MoveAnalysis;
    }
  | { type: "GRADE_TIMEOUT"; ply: number; turnToken: number }
  | { type: "KEEP_MOVE" }
  | { type: "TRY_AGAIN" }
  | { type: "SHOW_ME" }
  | { type: "REVEAL_OK" }
  | { type: "RESIGN" }
  | { type: "PLAY_AGAIN" };

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const DEFAULT_OFFER_TRY_AGAIN = true;

export function initialGame(): GameState {
  return {
    phase: "setup",
    fen: START_FEN,
    startFen: START_FEN,
    kidColor: "w",
    history: [],
    gameToken: 0,
    turnToken: 0,
    analyses: {},
    hintTier: 0,
    pendingGrades: {},
    offerTryAgain: DEFAULT_OFFER_TRY_AGAIN,
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
        ...(action.level === undefined ? {} : { level: action.level }),
        history: [],
        gameToken: state.turnToken + 1,
        turnToken: state.turnToken + 1,
        analyses: {},
        hintTier: 0,
        pendingGrades: {},
        offerTryAgain: action.offerTryAgain ?? DEFAULT_OFFER_TRY_AGAIN,
      };
    }
    case "RESTORE_GAME": {
      const turnToken = Math.max(state.turnToken, action.saved.turnToken) + 1;
      const pendingGrades = { ...action.saved.pendingGrades };
      const ply = action.saved.history.length;
      if (action.saved.phase === "grading" && pendingGrades[ply]) {
        pendingGrades[ply] = { ...pendingGrades[ply], turnToken };
      }
      return {
        ...action.saved,
        turnToken,
        gameToken: turnToken,
        pendingGrades,
      };
    }
    case "KID_MOVE": {
      if (state.phase !== "kidToMove") return state;
      const moved = applyMove(state, action.from, action.to, action.promotion);
      if (moved === state) return state;
      const ply = moved.history.length;
      const grading: GameState = {
        ...moved,
        hintTier: 0,
        pendingGrades: {
          ...state.pendingGrades,
          [ply]: {
            turnToken: moved.turnToken,
            hintTier: state.hintTier,
            attempts: state.retry?.attempts,
          },
        },
        retry: moved.phase === "over" ? undefined : state.retry,
      };
      const original = state.retry?.original;
      if (
        grading.phase === "grading" &&
        original &&
        !state.retry?.reveal &&
        moved.history.at(-1)?.uci === original.moveUci
      ) {
        return completeGrade(grading, ply, moved.turnToken, original);
      }
      return grading;
    }
    case "HINT": {
      if (
        state.phase !== "kidToMove" ||
        state.hintTier >= 3 ||
        action.tier !== state.hintTier + 1
      ) {
        return state;
      }
      return { ...state, hintTier: action.tier };
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
    case "GRADE_READY":
      return completeGrade(
        state,
        action.ply,
        action.turnToken,
        action.analysis,
      );
    case "KEEP_MOVE":
      return state.phase === "nudge"
        ? { ...state, phase: "opponentToMove" }
        : state;
    case "TRY_AGAIN":
      return state.phase === "nudge" ? takeBack(state, "retry") : state;
    case "SHOW_ME":
      return state.phase === "nudge" ? takeBack(state, "show") : state;
    case "REVEAL_OK":
      return state.phase === "reveal"
        ? { ...state, phase: "kidToMove" }
        : state;
    case "GRADE_TIMEOUT": {
      if (
        state.phase !== "grading" ||
        action.ply !== state.history.length ||
        action.turnToken !== state.turnToken
      ) {
        return state;
      }
      return { ...state, phase: "opponentToMove", retry: undefined };
    }
    case "RESIGN": {
      if (state.phase === "setup" || state.phase === "over") return state;
      return {
        ...state,
        phase: "over",
        result: { winner: "opponent", reason: "resign" },
        retry: undefined,
        turnToken: state.turnToken + 1,
      };
    }
    case "PLAY_AGAIN":
      return {
        ...initialGame(),
        gameToken: state.turnToken + 1,
        turnToken: state.turnToken + 1,
      };
  }
}

function completeGrade(
  state: GameState,
  ply: number,
  turnToken: number,
  graded: MoveAnalysis,
): GameState {
  const pending = state.pendingGrades[ply];
  const move = state.history[ply - 1];
  if (
    !pending ||
    pending.turnToken !== turnToken ||
    move?.uci !== graded.moveUci ||
    move.color !== state.kidColor ||
    graded.ply !== ply ||
    state.result?.reason === "resign"
  ) {
    return state;
  }

  const onTime = state.phase === "grading" && turnToken === state.turnToken;
  const analysis = { ...graded, hintTier: pending.hintTier };
  delete analysis.late;
  if (!onTime) analysis.late = true;
  if (pending.attempts) analysis.attempts = pending.attempts;
  const pendingGrades = { ...state.pendingGrades };
  delete pendingGrades[ply];
  const recorded: GameState = {
    ...state,
    pendingGrades,
    analyses: { ...state.analyses, [ply]: analysis },
  };
  if (!onTime) return recorded;
  if (state.offerTryAgain && isCoachedGrade(analysis.grade)) {
    if (!state.retry) return { ...recorded, phase: "nudge" };
    if (
      !state.retry.reveal &&
      analysis.moveUci !== state.retry.original.moveUci
    ) {
      return takeBack(recorded, "reveal");
    }
  }
  return { ...recorded, phase: "opponentToMove", retry: undefined };
}

function takeBack(
  state: GameState,
  next: "retry" | "show" | "reveal",
): GameState {
  const ply = state.history.length;
  const analysis = state.analyses[ply];
  const chess = replay(state);
  if (!analysis || !chess?.undo()) return state;

  const history = state.history.slice(0, -1);
  const last = history.at(-1);
  const analyses = { ...state.analyses };
  delete analyses[ply];
  const revealed = next !== "retry";
  const attempts = [
    ...(state.retry?.attempts ?? []),
    {
      moveUci: analysis.moveUci,
      moveSan: analysis.moveSan,
      grade: analysis.grade,
      usedShowMe: next === "show",
      revealed,
    },
  ];

  return {
    ...state,
    phase: revealed ? "reveal" : "kidToMove",
    fen: chess.fen(),
    history,
    analyses,
    lastMove: last && { from: last.from, to: last.to },
    checkSquare: kingInCheck(chess),
    preAnalysis: undefined,
    hintTier: 0,
    turnToken: state.turnToken + 1,
    retry: {
      original: state.retry?.original ?? analysis,
      attempts,
      reveal: revealed ? analysis : undefined,
    },
  };
}

function replay(state: GameState): Chess | null {
  try {
    return replayGame(state);
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
    const checkSquare = kingInCheck(chess);
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

function kingInCheck(chess: Chess): Square | undefined {
  return chess.isCheck()
    ? chess.findPiece({ color: chess.turn(), type: "k" })[0]
    : undefined;
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
