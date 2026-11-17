import { Chess, type Square } from "chess.js";

export function legalTargets(fen: string, square: string): string[] {
  try {
    return new Chess(fen)
      .moves({ square: square as Square, verbose: true })
      .map((move) => move.to);
  } catch {
    return [];
  }
}

export function needsPromotion(fen: string, from: string, to: string): boolean {
  try {
    return new Chess(fen)
      .moves({ square: from as Square, verbose: true })
      .some((move) => move.to === to && Boolean(move.promotion));
  } catch {
    return false;
  }
}
