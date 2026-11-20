import { readFile } from "node:fs/promises";
import { Chess, type Color } from "chess.js";
import { describe, expect, it } from "vitest";
import type {
  EngineLine,
  FactKind,
  MoveAnalysis,
  PieceRef,
} from "../../../shared/coach/types.ts";
import { annotationsForHeld, annotationsValidOn } from "../annotations.js";
import { pieceAt } from "../boardQueries.js";
import messages from "../../i18n/en.json";
import {
  betterMoverIsThreatenedPiece,
  factParams,
  messageKeys,
  pieceWord,
  renderMessage,
} from "../templates.js";
import { buildContext } from "./context.js";
import { runDetectors } from "./index.js";
import { mirrorFen, mirrorUci } from "../../../../tests/unit/coach/mirror.js";

type RecordedAnalysis = {
  linesBefore: EngineLine[];
  linesAfter: EngineLine[];
  depths: { before: number[]; after: number[] };
};

type Fixture = {
  id: string;
  fen: string;
  move: string;
  kidColor: Color;
  expect: { kinds: FactKind[]; mirroredKinds?: FactKind[] } | { none: true };
  recorded: { white: RecordedAnalysis; mirrored: RecordedAnalysis };
};

const fixtures = JSON.parse(
  await readFile(
    new URL("../../../../tests/fixtures/coach/detectors.json", import.meta.url),
    "utf8",
  ),
) as Fixture[];

describe("recorded detector fixtures", () => {
  it.each(fixtures)(
    "matches expected facts for $id in both colors",
    (fixture) => {
      const variants = [
        {
          fen: fixture.fen,
          moveUci: fixture.move,
          kidColor: fixture.kidColor,
          recorded: fixture.recorded.white,
          expectedKinds: "none" in fixture.expect ? [] : fixture.expect.kinds,
        },
        {
          fen: mirrorFen(fixture.fen),
          moveUci: mirrorUci(fixture.move),
          kidColor: opposite(fixture.kidColor),
          recorded: fixture.recorded.mirrored,
          expectedKinds:
            "none" in fixture.expect
              ? []
              : (fixture.expect.mirroredKinds ?? fixture.expect.kinds),
        },
      ];

      for (const variant of variants) {
        const before = new Chess(variant.fen);
        const played = before.move(uciMove(variant.moveUci));
        const analysis: MoveAnalysis = {
          ply: 1,
          fenBefore: variant.fen,
          moveUci: variant.moveUci,
          moveSan: played.san,
          linesBefore: variant.recorded.linesBefore,
          linesAfter: variant.recorded.linesAfter,
          winBefore: 50,
          winAfter: 0,
          drop: 50,
          grade: "mistake",
          isOnlyMove: false,
          facts: [],
        };
        const context = buildContext({ analysis, kidColor: variant.kidColor });
        const facts = runDetectors(context);
        expect(
          facts.map((fact) => fact.kind).sort(),
          `${fixture.id} (${variant.kidColor})`,
        ).toEqual([...variant.expectedKinds].sort());
        for (const fact of facts) {
          const displayedFen = applyMove(analysis.fenBefore, analysis.moveUci);
          const heldAnnotations = annotationsForHeld(
            fact,
            displayedFen,
            variant.kidColor,
          );
          expect(
            annotationsValidOn(displayedFen, heldAnnotations, variant.kidColor),
            `${fixture.id} (${variant.kidColor}) ${fact.kind} held annotations`,
          ).toBe(true);
          if (
            fact.kind === "missed-mate" ||
            fact.kind === "missed-capture" ||
            fact.kind === "missed-fork"
          ) {
            expect(heldAnnotations).toEqual({
              danger: [],
              hint: [],
              arrows: [],
            });
          }
          assertFactConsistent(fact, analysis, fixture.id, variant.kidColor);
          assertRenderedRoles(
            fact,
            variant.fen,
            variant.kidColor,
            analysis.linesBefore[0]?.uci,
            analysis.moveUci,
          );
        }
      }
    },
  );
});

function assertFactConsistent(
  fact: MoveAnalysis["facts"][number],
  analysis: MoveAnalysis,
  fixtureId: string,
  kidColor: Color,
) {
  const afterMoveFen = applyMove(analysis.fenBefore, analysis.moveUci);
  const positions = [
    ...pvPositions(analysis.fenBefore, analysis.linesBefore[0]?.pv),
    ...pvPositions(
      applyMove(analysis.fenBefore, analysis.moveUci),
      analysis.linesAfter[0]?.pv,
    ),
  ];

  for (const piece of fact.pieces) {
    expect(positions.some((fen) => samePiece(fen, piece))).toBe(true);
    expect(fact.squares).toContain(piece.square);
  }
  for (const san of fact.moves) {
    expect(positions.some((fen) => canPlaySan(fen, san))).toBe(true);
  }
  for (const uci of [fact.betterMoveUci, fact.threatMoveUci]) {
    if (!uci) continue;
    expect(fact.squares).toEqual(expect.arrayContaining(uciSquares(uci)));
  }

  if (fact.betterMoveUci) {
    expect(analysis.linesBefore[0]?.pv.slice(0, 8)).toContain(
      fact.betterMoveUci,
    );
  }
  if (fact.threatMoveUci) {
    expect(analysis.linesAfter[0]?.pv.slice(0, 8)).toContain(
      fact.threatMoveUci,
    );
  }

  if (fact.betterMoveUci) {
    const expectedMover = pieceAt(
      analysis.fenBefore,
      fact.betterMoveUci.slice(0, 2) as PieceRef["square"],
    );
    expect(fact.betterMover).toEqual(expectedMover);
    expect(fact.betterMoveUci).toBe(analysis.linesBefore[0]?.uci);
  }

  if (
    fact.kind === "missed-mate" ||
    fact.kind === "missed-fork" ||
    fact.kind === "missed-capture"
  ) {
    expect(fact.subject).toEqual(
      pieceAt(
        analysis.fenBefore,
        fact.betterMoveUci!.slice(0, 2) as PieceRef["square"],
      ),
    );
    for (const target of fact.targets ?? []) {
      expect(pieceAt(analysis.fenBefore, target.square)).toEqual(target);
    }
  }

  if (fact.kind === "hanging-piece") {
    expect(pieceAt(afterMoveFen, fact.subject!.square)).toEqual(fact.subject);
    expect(
      pieceAt(
        afterMoveFen,
        fact.threatMoveUci!.slice(0, 2) as PieceRef["square"],
      ),
    ).toEqual(fact.attacker);
  }

  if (fact.kind === "allowed-mate") {
    expect(fact.subject?.type).toBe("k");
    expect(fact.subject?.color).toBe(kidColor);
    expect(pieceAt(afterMoveFen, fact.subject!.square)).toEqual(fact.subject);
    expect(
      pieceAt(
        afterMoveFen,
        fact.threatMoveUci!.slice(0, 2) as PieceRef["square"],
      ),
    ).toEqual(fact.attacker);
  }

  if (fact.kind === "allowed-fork" || fact.kind === "threat") {
    const attackerSquare = fact.threatMoveUci!.slice(
      0,
      2,
    ) as PieceRef["square"];
    expect(pieceAt(afterMoveFen, attackerSquare)).toEqual(fact.attacker);
    const afterReplyFen = applyMove(afterMoveFen, fact.threatMoveUci!);
    for (const target of fact.targets ?? []) {
      expect(pieceAt(afterReplyFen, target.square)).toEqual(target);
    }
  }

  if (fact.kind === "played-fork") {
    const target = analysis.moveUci.slice(2, 4) as PieceRef["square"];
    expect(fact.subject?.square).toBe(target);
    expect(pieceAt(afterMoveFen, target)).toEqual(fact.subject);
    for (const targetPiece of fact.targets ?? []) {
      expect(pieceAt(afterMoveFen, targetPiece.square)).toEqual(targetPiece);
    }
  }

  if (fixtureId === "missed-mate-in-two-1" && fact.kind === "missed-mate") {
    expect(fact.mateIn).toBe(2);
  }

  if (
    fixtureId === "missed-fork-nonchecking-1" &&
    fact.kind === "missed-fork"
  ) {
    assertNoncheckingFork(fact, analysis.fenBefore, fact.betterMoveUci!);
    assertHintVariantsDoNotClaimCheck(fact);
  }
  if (
    fixtureId === "played-fork-nonchecking-1" &&
    fact.kind === "played-fork"
  ) {
    assertNoncheckingFork(fact, analysis.fenBefore, analysis.moveUci);
    assertHintVariantsDoNotClaimCheck(fact);
  }
  if (
    fixtureId === "allowed-fork-nonchecking-1" &&
    fact.kind === "allowed-fork"
  ) {
    const afterReplyFen = applyMove(afterMoveFen, fact.threatMoveUci!);
    assertNoncheckingFork(fact, afterMoveFen, fact.threatMoveUci!);
    expect(afterReplyFen).toBeTruthy();
  }
}

function assertHintVariantsDoNotClaimCheck(
  fact: MoveAnalysis["facts"][number],
) {
  for (const key of messageKeys(fact.kind, "hint2")) {
    const message = renderMessage({
      kind: fact.kind,
      mode: "hint2",
      fact,
      picker: { pick: () => key },
      kidColor: fact.subject?.color ?? "w",
    });
    expect(message.text, key).not.toMatch(/\bcheck\b/i);
  }
}

function assertNoncheckingFork(
  fact: MoveAnalysis["facts"][number],
  fen: string,
  uci: string,
) {
  const board = new Chess(fen);
  board.move(uciMove(uci));
  expect(board.isCheck()).toBe(false);
  expect(fact.targets?.length).toBeGreaterThanOrEqual(2);
  expect(fact.targets?.every((target) => target.type !== "k")).toBe(true);
}

function assertRenderedRoles(
  fact: MoveAnalysis["facts"][number],
  fen: string,
  kidColor: Color,
  arrowUci: string | undefined,
  playedMoveUci: string,
) {
  const rolePieces = [
    fact.subject,
    fact.attacker,
    ...(fact.targets ?? []),
  ].filter((piece): piece is PieceRef => piece !== undefined);
  expect(fact.pieces).toEqual(expect.arrayContaining(rolePieces));

  const params = factParams(fact, kidColor, playedMoveUci);
  const roleRefs: Record<string, PieceRef | undefined> = {
    piece:
      (fact.subject?.color === kidColor ? fact.subject : undefined) ??
      fact.targets?.find((piece) => piece.color === kidColor),
    attacker: fact.attacker,
    betterPiece:
      (fact.betterMover?.color === kidColor ? fact.betterMover : undefined) ??
      (fact.subject?.color === kidColor ? fact.subject : undefined) ??
      (fact.attacker?.color === kidColor ? fact.attacker : undefined),
    target: fact.targets?.[0],
  };

  for (const mode of [
    "nudge",
    "explain",
    "reveal",
    "praise",
    "late",
    "hint1",
    "hint2",
    "hint3",
  ] as const) {
    const escape =
      mode === "reveal" &&
      betterMoverIsThreatenedPiece(fact, playedMoveUci, kidColor);
    for (const key of messageKeys(fact.kind, mode, { escape })) {
      const template = messages[key];
      const placeholders = [
        ...template.matchAll(/\{(piece|attacker|betterPiece|target|mateIn)\}/g),
      ];
      for (const [, role] of placeholders) {
        if (role === "mateIn") {
          expect(fact.mateIn).toBeDefined();
          expect(params.mateIn).toBe(numberWord(fact.mateIn!));
          continue;
        }
        const ref = roleRefs[role!];
        expect(
          ref,
          `${fact.kind}.${mode}.${key} has a ${role} role`,
        ).toBeDefined();
        expect(fact.pieces).toContainEqual(ref);
        expect(params[role as keyof typeof params]).toContain(pieceWord(ref!));
      }

      const rendered = renderMessage({
        kind: fact.kind,
        mode,
        fact,
        playedMoveUci,
        picker: { pick: () => key },
        kidColor,
      }).text;
      for (const word of [
        "pawn",
        "knight",
        "bishop",
        "rook",
        "queen",
        "king",
      ]) {
        if (new RegExp(`\\b${word}\\b`, "i").test(rendered)) {
          expect(
            fact.pieces.map(pieceWord),
            `${fact.kind}.${mode}.${key} names ${word}`,
          ).toContain(word);
        }
      }
      if (mode === "reveal" && escape) {
        expect(rendered).toMatch(/safe square|out of danger/i);
        expect(rendered).not.toMatch(/protect your .* with your/i);
      }
      if (
        mode === "reveal" &&
        !escape &&
        fact.betterMover?.color === kidColor &&
        [fact.subject, ...(fact.targets ?? [])].some(
          (piece) =>
            piece?.color === kidColor && piece.type === fact.betterMover!.type,
        ) &&
        template.includes("{betterPiece}")
      ) {
        expect(rendered).toContain(`other ${pieceWord(fact.betterMover)}`);
      }
    }
  }

  if (fact.betterMoveUci) {
    const mover = pieceAt(
      fen,
      fact.betterMoveUci.slice(0, 2) as PieceRef["square"],
    );
    expect(mover).toBeDefined();
    expect(fact.betterMover).toEqual(mover);
    if (arrowUci) {
      expect(fact.betterMoveUci).toBe(arrowUci);
      expect(fact.betterMover?.square).toBe(arrowUci.slice(0, 2));
    }
    expect(fact.pieces).toContainEqual(mover);
    const escape = betterMoverIsThreatenedPiece(fact, playedMoveUci, kidColor);
    for (const key of messageKeys(fact.kind, "reveal", { escape })) {
      if (!messages[key].includes("{betterPiece}")) continue;
      const rendered = renderMessage({
        kind: fact.kind,
        mode: "reveal",
        fact,
        playedMoveUci,
        picker: { pick: () => key },
        kidColor,
      }).text;
      expect(rendered).toContain(pieceWord(mover!));
    }
  }
}

function numberWord(value: number): string {
  const words: Record<number, string> = {
    1: "one move",
    2: "two moves",
    3: "three moves",
  };
  return words[value] ?? "a few moves";
}

function pvPositions(fen: string, pv: string[] = []): string[] {
  const chess = new Chess(fen);
  const positions = [chess.fen()];
  for (const uci of pv.slice(0, 8)) {
    try {
      chess.move(uciMove(uci));
    } catch {
      break;
    }
    positions.push(chess.fen());
  }
  return positions;
}

function samePiece(fen: string, ref: PieceRef): boolean {
  const piece = new Chess(fen).get(ref.square);
  return piece?.type === ref.type && piece.color === ref.color;
}

function canPlaySan(fen: string, san: string): boolean {
  try {
    new Chess(fen).move(san);
    return true;
  } catch {
    return false;
  }
}

function applyMove(fen: string, uci: string): string {
  const chess = new Chess(fen);
  chess.move(uciMove(uci));
  return chess.fen();
}

function uciMove(uci: string) {
  return {
    from: uci.slice(0, 2) as `${string}${string}`,
    to: uci.slice(2, 4) as `${string}${string}`,
    ...(uci[4] ? { promotion: uci[4] as "q" | "r" | "b" | "n" } : {}),
  };
}

function uciSquares(uci: string): string[] {
  return uci.match(/[a-h][1-8]/g) ?? [];
}

function opposite(color: Color): Color {
  return color === "w" ? "b" : "w";
}
