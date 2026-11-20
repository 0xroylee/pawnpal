import { Chess, type Color, type Square } from "chess.js";
import type {
  EngineLine,
  EngineScore,
  PieceRef,
} from "../../shared/coach/types.ts";
import { pieceValue } from "./material.js";

export function pieceAt(fen: string, square: Square): PieceRef | undefined {
  const piece = new Chess(fen).get(square);
  return piece ? { ...piece, square } : undefined;
}

export function attackedPiecesFrom(fen: string, square: Square): PieceRef[] {
  const chess = new Chess(fen);
  const attacker = chess.get(square);
  if (!attacker) return [];

  const attacked: PieceRef[] = [];
  const board = chess.board();
  for (let row = 0; row < 8; row += 1) {
    for (let file = 0; file < 8; file += 1) {
      const piece = board[row]![file];
      if (!piece || piece.color === attacker.color) continue;
      const target = `${String.fromCharCode(97 + file)}${8 - row}` as Square;
      if (chess.attackers(target, attacker.color).includes(square)) {
        attacked.push({ type: piece.type, color: piece.color, square: target });
      }
    }
  }
  return attacked;
}

export function isFork(
  fen: string,
  square: Square,
  victimColor: Color,
): boolean {
  const targets = attackedPiecesFrom(fen, square).filter(
    (piece) => piece.color === victimColor,
  );
  if (targets.some((piece) => piece.type === "k")) {
    return targets.some((piece) => piece.type !== "k");
  }
  return targets.filter((piece) => pieceValue(piece.type) >= 3).length >= 2;
}

export function kidMate(
  score: EngineLine | EngineScore | undefined,
): number | undefined {
  return score && "mate" in score && typeof score.mate === "number"
    ? score.mate
    : undefined;
}
