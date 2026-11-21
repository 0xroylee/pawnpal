import type { PieceRef } from "./types.ts";

export type PieceWord = { singular: string; plural: string };

type PieceSymbol = PieceRef["type"];

export const PIECE_WORDS = {
  p: { singular: "pawn", plural: "pawns" },
  n: { singular: "knight", plural: "knights" },
  b: { singular: "bishop", plural: "bishops" },
  r: { singular: "rook", plural: "rooks" },
  q: { singular: "queen", plural: "queens" },
  k: { singular: "king", plural: "kings" },
} satisfies Record<PieceSymbol, PieceWord>;
