import { Chess, type Color, type Square } from "chess.js";

export type GamePhase = "setup" | "kidToMove" | "opponentToMove" | "over";
export type GameResult = {
  winner: "kid" | "opponent" | "draw";
  reason:
    | "checkmate"
    | "stalemate"
    | "threefold"
    | "fifty-move"
    | "insufficient"
    | "resign";
};
export type GameMove = {
  san: string;
  uci: string;
  from: string;
  to: string;
  color: Color;
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
    const entry: GameMove = {
      san: move.san,
      uci: `${move.from}${move.to}${move.promotion ?? ""}`,
      from: move.from,
      to: move.to,
      color: move.color,
    };
    const history = [...state.history, entry];
    const result = findResult(chess, move.color, state.kidColor);
    const checkSquare = chess.isCheck()
      ? chess.findPiece({ color: chess.turn(), type: "k" })[0]
      : undefined;
    return {
      ...state,
      phase: result
        ? "over"
        : chess.turn() === state.kidColor
          ? "kidToMove"
          : "opponentToMove",
      fen: chess.fen(),
      history,
      lastMove: { from: move.from, to: move.to },
      ...(checkSquare ? { checkSquare } : { checkSquare: undefined }),
      ...(result ? { result } : { result: undefined }),
      turnToken: state.turnToken + 1,
    };
  } catch {
    return state;
  }
}

function findResult(
  chess: Chess,
  mover: Color,
  kidColor: Color,
): GameResult | undefined {
  if (chess.isCheckmate()) {
    return {
      winner: mover === kidColor ? "kid" : "opponent",
      reason: "checkmate",
    };
  }
  if (chess.isStalemate()) return { winner: "draw", reason: "stalemate" };
  if (chess.isThreefoldRepetition())
    return { winner: "draw", reason: "threefold" };
  if (chess.isDrawByFiftyMoves())
    return { winner: "draw", reason: "fifty-move" };
  if (chess.isInsufficientMaterial())
    return { winner: "draw", reason: "insufficient" };
  return undefined;
}

function opposite(color: Color): Color {
  return color === "w" ? "b" : "w";
}
