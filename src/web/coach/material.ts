import { Chess, type Color, type PieceSymbol, type Square } from "chess.js";

export const PIECE_VALUES: Record<PieceSymbol, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

export function pieceValue(type: PieceSymbol): number {
  return PIECE_VALUES[type];
}

export function materialFromKid(fen: string, kidColor?: Color): number {
  const chess = new Chess(fen);
  return materialBalance(chess, kidColor ?? chess.turn());
}

export function materialAlongPv(
  fen: string,
  pv: string[],
  plies: number,
  kidColor?: Color,
): number {
  const chess = new Chess(fen);
  const perspective = kidColor ?? chess.turn();
  const before = materialBalance(chess, perspective);
  const limit = Math.min(pv.length, Math.max(0, Math.floor(plies)));

  for (const uci of pv.slice(0, limit)) {
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) {
      throw new Error(`Invalid UCI move in principal variation: ${uci}`);
    }
    chess.move({
      from: uci.slice(0, 2) as Square,
      to: uci.slice(2, 4) as Square,
      ...(uci[4] ? { promotion: uci[4] as PieceSymbol } : {}),
    });
  }

  return materialBalance(chess, perspective) - before;
}

function materialBalance(chess: Chess, perspective: Color): number {
  let white = 0;
  let black = 0;
  for (const rank of chess.board()) {
    for (const piece of rank) {
      if (!piece) continue;
      if (piece.color === "w") white += PIECE_VALUES[piece.type];
      else black += PIECE_VALUES[piece.type];
    }
  }
  const whiteAdvantage = white - black;
  return perspective === "w" ? whiteAdvantage : -whiteAdvantage;
}
