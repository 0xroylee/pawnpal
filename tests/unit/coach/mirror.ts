import { Chess } from "chess.js";

const CASTLING_ORDER = "KQkq";

export function mirrorFen(fen: string): string {
  const fields = fen.trim().split(/\s+/);
  if (fields.length !== 6) throw new Error("FEN must contain six fields");
  const [board, turn, castling, enPassant, halfmove, fullmove] = fields;
  const ranks = board!.split("/");
  if (ranks.length !== 8) throw new Error("FEN board must contain eight ranks");
  const mirroredBoard = ranks
    .reverse()
    .map((rank) => [...rank].map(swapPieceColor).join(""));
  const mirroredCastling =
    castling === "-"
      ? "-"
      : [...CASTLING_ORDER]
          .filter((right) => castling.includes(swapCastlingColor(right)))
          .join("") || "-";
  const mirroredEnPassant =
    enPassant === "-" ? "-" : `${enPassant![0]}${9 - Number(enPassant![1])}`;
  return [
    mirroredBoard.join("/"),
    turn === "w" ? "b" : "w",
    mirroredCastling,
    mirroredEnPassant,
    halfmove,
    fullmove,
  ].join(" ");
}

export function mirrorUci(uci: string): string {
  return uci.replace(/[1-8]/g, (rank) => String(9 - Number(rank)));
}

export function mirrorSan(fenBefore: string, san: string): string {
  const move = new Chess(fenBefore).move(san);
  const mirroredPosition = new Chess(mirrorFen(fenBefore));
  return mirroredPosition.move(mirrorUci(move.lan)).san;
}

function swapPieceColor(piece: string): string {
  return piece.toLowerCase() === piece
    ? piece.toUpperCase()
    : piece.toLowerCase();
}

function swapCastlingColor(right: string): string {
  return right.toLowerCase() === right
    ? right.toUpperCase()
    : right.toLowerCase();
}
