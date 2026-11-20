import { Chess, type Color, type Square } from "chess.js";
import type { CoachFact, CoachMode } from "../../shared/coach/types.ts";
import { pieceAt } from "./boardQueries.js";

export type BoardArrow = {
  from: string;
  to: string;
  kind: "better" | "threat";
};

export type BoardAnnotations = {
  danger: string[];
  hint: string[];
  arrows: BoardArrow[];
};

export type AnnotationMode = CoachMode | "hint1" | "hint2" | "hint3";
export type BetterMove = { from: string; to: string };

export function annotationsFor(
  fact: CoachFact | undefined,
  mode: AnnotationMode,
  better?: BetterMove,
): BoardAnnotations {
  const empty: BoardAnnotations = { danger: [], hint: [], arrows: [] };

  if (mode === "praise") return empty;
  if (mode === "hint1" || mode === "hint2") {
    const move = better ?? factMove(fact?.betterMoveUci);
    return move ? { ...empty, hint: [move.from] } : empty;
  }
  if (mode === "hint3") {
    const move = better ?? factMove(fact?.betterMoveUci);
    return move ? { ...empty, arrows: [{ ...move, kind: "better" }] } : empty;
  }

  const danger = dangerSquares(fact);
  const arrows = mode === "nudge" ? [] : threatArrows(fact);
  if (mode === "reveal") {
    const move = better ?? factMove(fact?.betterMoveUci);
    if (move) arrows.push({ ...move, kind: "better" });
  }
  return { danger, hint: [], arrows };
}

export function annotationsForHeld(
  fact: CoachFact | undefined,
  displayedFen: string,
  kidColor: Color,
): BoardAnnotations {
  const empty: BoardAnnotations = { danger: [], hint: [], arrows: [] };
  if (
    !fact ||
    fact.kind === "missed-mate" ||
    fact.kind === "missed-capture" ||
    fact.kind === "missed-fork"
  ) {
    return empty;
  }

  const danger = [fact.subject, ...(fact.targets ?? [])]
    .filter((piece) => piece?.color === kidColor)
    .filter(
      (piece) =>
        piece && isSamePiece(pieceAt(displayedFen, piece.square), piece),
    )
    .map((piece) => piece!.square);
  const arrows = heldThreatArrow(fact, displayedFen, kidColor);

  return { danger: [...new Set(danger)], hint: [], arrows };
}

export function annotationsValidOn(
  fen: string,
  annotations: BoardAnnotations,
  kidColor: Color,
): boolean {
  const chess = new Chess(fen);
  if (
    annotations.danger.some(
      (square) => pieceAt(fen, square as Square)?.color !== kidColor,
    ) ||
    annotations.hint.some(
      (square) => pieceAt(fen, square as Square)?.color !== kidColor,
    )
  ) {
    return false;
  }

  return annotations.arrows.every((arrow) => {
    if (arrow.kind !== "threat") return false;
    const from = arrow.from as Square;
    const to = arrow.to as Square;
    const attacker = chess.get(from);
    const target = chess.get(to);
    return (
      attacker !== undefined &&
      attacker.color !== kidColor &&
      target !== undefined &&
      target.color === kidColor &&
      chess.attackers(to, attacker.color).includes(from)
    );
  });
}

function dangerSquares(fact: CoachFact | undefined): string[] {
  if (!fact) return [];
  const squares = [
    ...(fact.subject ? [fact.subject.square] : []),
    ...(fact.targets ?? []).map((target) => target.square),
  ];
  return [...new Set(squares)];
}

function threatArrows(fact: CoachFact | undefined): BoardArrow[] {
  if (!fact) return [];
  const fromTo = factMove(fact.threatMoveUci);
  if (fromTo) return [{ ...fromTo, kind: "threat" }];

  const target = fact.subject ?? fact.targets?.[0];
  if (fact.attacker && target) {
    return [{ from: fact.attacker.square, to: target.square, kind: "threat" }];
  }
  return [];
}

function heldThreatArrow(
  fact: CoachFact,
  fen: string,
  kidColor: Color,
): BoardArrow[] {
  const from = (fact.threatMoveUci?.slice(0, 2) ?? fact.attacker?.square) as
    Square | undefined;
  if (!from) return [];
  const attacker = pieceAt(fen, from);
  if (!attacker || attacker.color === kidColor) return [];
  if (fact.attacker && !isSamePiece(attacker, fact.attacker)) return [];

  const chess = new Chess(fen);
  const targets = [fact.subject, ...(fact.targets ?? [])].filter(
    (piece) => piece?.color === kidColor,
  );
  const target = targets.find((piece) => {
    if (!piece || !isSamePiece(pieceAt(fen, piece.square), piece)) return false;
    return chess.attackers(piece.square, attacker.color).includes(from);
  });
  return target ? [{ from, to: target.square, kind: "threat" }] : [];
}

function isSamePiece(
  left: { type: string; color: Color } | undefined,
  right: { type: string; color: Color },
): boolean {
  return left?.type === right.type && left.color === right.color;
}

function factMove(uci: string | undefined): BetterMove | undefined {
  if (!uci || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) return undefined;
  return { from: uci.slice(0, 2), to: uci.slice(2, 4) };
}
