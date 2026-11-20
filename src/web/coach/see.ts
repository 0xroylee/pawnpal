import {
  Chess,
  type Color,
  type Piece,
  type PieceSymbol,
  type Square,
} from "chess.js";

const PIECE_VALUES: Record<PieceSymbol, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 100,
};

export function see(fen: string, square: Square, side: Color): number {
  const chess = new Chess(fen);
  const target = chess.get(square);
  if (!target || target.color === side || target.type === "k") return 0;

  const firstAttacker = leastValuableAttacker(chess, square, side);
  if (!firstAttacker) return 0;
  const firstAttackerPiece = chess.get(firstAttacker);
  if (!firstAttackerPiece) return 0;

  const gains = [
    PIECE_VALUES[target.type] + promotionBonus(firstAttackerPiece, square),
  ];
  captureOn(chess, firstAttacker, square);

  let nextSide = opposite(side);
  let depth = 0;
  while (depth < 30) {
    const attacker = leastValuableAttacker(chess, square, nextSide);
    if (!attacker) break;
    const victim = chess.get(square);
    if (!victim) break;
    depth += 1;
    gains[depth] = PIECE_VALUES[victim.type] - gains[depth - 1]!;
    captureOn(chess, attacker, square);
    nextSide = opposite(nextSide);
  }

  while (depth > 0) {
    gains[depth - 1] = -Math.max(-gains[depth - 1]!, gains[depth]!);
    depth -= 1;
  }
  return gains[0]!;
}

function leastValuableAttacker(
  chess: Chess,
  target: Square,
  color: Color,
): Square | undefined {
  const candidates = chess
    .attackers(target, color)
    .map((square) => ({ square, piece: chess.get(square) }))
    .filter((candidate): candidate is { square: Square; piece: Piece } =>
      Boolean(candidate.piece),
    )
    .sort(
      (left, right) =>
        PIECE_VALUES[left.piece.type] - PIECE_VALUES[right.piece.type],
    );

  for (const candidate of candidates) {
    if (captureIsLegal(chess, candidate.square, target, color)) {
      return candidate.square;
    }
  }
  return undefined;
}

function captureIsLegal(
  chess: Chess,
  from: Square,
  target: Square,
  color: Color,
): boolean {
  const trial = new Chess(chess.fen());
  const attacker = trial.remove(from);
  if (!attacker || attacker.color !== color) return false;
  trial.remove(target);
  const promoted: Piece =
    attacker.type === "p" && (target[1] === "1" || target[1] === "8")
      ? { type: "q", color: attacker.color }
      : attacker;
  if (!trial.put(promoted, target)) return false;
  const kingSquare =
    attacker.type === "k" ? target : trial.findPiece({ type: "k", color })[0];
  return Boolean(
    kingSquare && trial.attackers(kingSquare, opposite(color)).length === 0,
  );
}

function captureOn(chess: Chess, from: Square, target: Square): void {
  const attacker = chess.remove(from);
  chess.remove(target);
  if (!attacker) throw new Error(`No attacker on ${from}`);
  const promoted: Piece =
    attacker.type === "p" && (target[1] === "1" || target[1] === "8")
      ? { type: "q", color: attacker.color }
      : attacker;
  if (!chess.put(promoted, target)) {
    throw new Error(`Could not place exchange attacker on ${target}`);
  }
}

function promotionBonus(piece: Piece, target: Square): number {
  return piece.type === "p" && (target[1] === "1" || target[1] === "8")
    ? PIECE_VALUES.q - PIECE_VALUES.p
    : 0;
}

function opposite(color: Color): Color {
  return color === "w" ? "b" : "w";
}
