import { Chess, type Color, type Square } from "chess.js";
import { describe, expect, it } from "vitest";
import type { EngineLine, FactKind } from "../../../src/shared/coach/types.js";
import { isCoachedGrade } from "../../../src/shared/coach/types.js";
import {
  annotationsFor,
  annotationsForHeld,
  annotationsValidOn,
  type BoardArrow,
} from "../../../src/web/coach/annotations.js";
import {
  buildContext,
  runDetectors,
} from "../../../src/web/coach/detectors/index.js";
import { selectFact } from "../../../src/web/coach/detectors/priority.js";
import {
  coachReducer,
  initialCoachState,
} from "../../../src/web/coach/coachState.js";
import { gradeMove } from "../../../src/web/coach/grade.js";
import {
  messageKeys,
  renderMessage,
  type MessageKey,
  type TemplateMode,
} from "../../../src/web/coach/templates.js";
import detectorFixtures from "../../fixtures/coach/detectors.json";
import e2ePositions from "../../fixtures/coach/e2e-detectors.json";

type RecordedAnalysis = { linesBefore: EngineLine[]; linesAfter: EngineLine[] };
type DetectorFixture = {
  id: string;
  fen: string;
  move: string;
  kidColor: Color;
  recorded?: { white: RecordedAnalysis };
};
type E2EPosition = {
  kind: FactKind;
  fixture: string;
  mode: "explain";
  dangerSquares: string[];
  arrows: BoardArrow[];
  pieceWords: { explain: string[]; reveal: string[] };
  debugOnly?: boolean;
};

const fixtures = detectorFixtures as DetectorFixture[];
const positions = e2ePositions as E2EPosition[];

describe("coach detector E2E positions", () => {
  it.each(positions)("replays the recorded $kind fact", (position) => {
    const fixture = fixtures.find(({ id }) => id === position.fixture);
    expect(fixture, `${position.fixture} fixture`).toBeDefined();
    if (!fixture?.recorded) {
      throw new Error(`Fixture ${position.fixture} has no recorded lines`);
    }

    const after = new Chess(fixture.fen);
    const move = after.move({
      from: fixture.move.slice(0, 2),
      to: fixture.move.slice(2, 4),
      ...(fixture.move[4] ? { promotion: fixture.move[4] } : {}),
    });
    const analysis = gradeMove({
      ply: 1,
      fenBefore: fixture.fen,
      move: { uci: fixture.move, san: move.san },
      kidColor: fixture.kidColor,
      linesBefore: fixture.recorded.white.linesBefore,
      linesAfter: fixture.recorded.white.linesAfter,
    });
    const facts = runDetectors(
      buildContext({ analysis, kidColor: fixture.kidColor }),
    );
    const fact = position.debugOnly
      ? facts.find((candidate) => candidate.kind === position.kind)
      : selectFact(facts);

    if (position.debugOnly) {
      expect(analysis.isOnlyMove).toBe(true);
    } else {
      expect(isCoachedGrade(analysis.grade)).toBe(true);
      expect(analysis.grade).toBe("blunder");
    }
    expect(fact?.kind).toBe(position.kind);

    const annotations = position.debugOnly
      ? annotationsFor(fact, "praise")
      : annotationsForHeld(fact, after.fen(), fixture.kidColor);
    expect(
      annotationsValidOn(after.fen(), annotations, fixture.kidColor),
      `${position.fixture} held annotations on the displayed board`,
    ).toBe(true);
    expect([...annotations.danger].sort()).toEqual(
      [...position.dangerSquares].sort(),
    );
    expect(sortArrows(annotations.arrows)).toEqual(sortArrows(position.arrows));

    for (const mode of ["explain", "reveal"] as const) {
      expectVariantWords(position, fact, mode);
    }
  });

  it("uses a past-tense hanging-piece explanation after Rxg3 is applied", () => {
    const fixture = fixtures.find(({ id }) => id === "hanging-piece-7");
    expect(fixture).toBeDefined();
    if (!fixture?.recorded) throw new Error("Missing hanging-piece-7 lines");

    const after = new Chess(fixture.fen);
    const played = playUci(after, fixture.move);
    const graded = gradeMove({
      ply: 1,
      fenBefore: fixture.fen,
      move: { uci: fixture.move, san: played.san },
      kidColor: fixture.kidColor,
      linesBefore: fixture.recorded.white.linesBefore,
      linesAfter: fixture.recorded.white.linesAfter,
    });
    const facts = runDetectors(
      buildContext({ analysis: graded, kidColor: fixture.kidColor }),
    );
    expect(selectFact(facts)?.kind).toBe("hanging-piece");

    const reply = playUci(after, fixture.recorded.white.linesAfter[0]!.uci);
    expect(reply.san).toBe("Rxg3");
    expect(after.get("g2")).toBeUndefined();
    expect(after.get("g3")).toMatchObject({ type: "r", color: "b" });

    const coach = coachReducer(
      initialCoachState,
      {
        type: "GRADED",
        analysis: { ...graded, facts, late: true },
      },
      { variantSeed: 0, kidColor: fixture.kidColor },
    );
    expect(coach.message).toMatchObject({ mode: "explain", late: true });
    expect(coach.message?.text).toBe(
      "That move left your rook open to capture.",
    );
    expect(coach.message?.text).not.toMatch(/can capture|is under attack/i);
    expect(coach.annotations).toEqual({ danger: [], hint: [], arrows: [] });
  });
});

function expectVariantWords(
  position: E2EPosition,
  fact: ReturnType<typeof selectFact>,
  mode: Extract<TemplateMode, "explain" | "reveal">,
): void {
  const keys = messageKeys(position.kind, mode);
  expect(keys.length, `${position.kind}.${mode} variants`).toBeGreaterThan(0);
  for (const key of keys) {
    const message = renderMessage({
      kind: position.kind,
      mode,
      fact,
      kidColor: "w",
      picker: { pick: () => key as MessageKey },
    });
    for (const word of position.pieceWords[mode]) {
      expect(message.text.toLowerCase(), `${key} contains ${word}`).toContain(
        word,
      );
    }
    expect(message.text, `${key} has no square coordinates`).not.toMatch(
      /\b[a-h][1-8]\b/,
    );
  }
}

function sortArrows(arrows: BoardArrow[]): BoardArrow[] {
  return [...arrows].sort((left, right) =>
    `${left.kind}:${left.from}:${left.to}`.localeCompare(
      `${right.kind}:${right.from}:${right.to}`,
    ),
  );
}

function playUci(chess: Chess, uci: string) {
  return chess.move({
    from: uci.slice(0, 2) as Square,
    to: uci.slice(2, 4) as Square,
    ...(uci[4] ? { promotion: uci[4] as "q" | "r" | "b" | "n" } : {}),
  });
}
