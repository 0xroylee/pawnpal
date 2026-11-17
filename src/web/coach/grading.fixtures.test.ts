import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import type { EngineLine, Grade } from "../../shared/coach/types.ts";
import fixtures from "../../../tests/fixtures/coach/grading.json";
import {
  mirrorFen,
  mirrorSan,
  mirrorUci,
} from "../../../tests/unit/coach/mirror.js";
import { gradeMove } from "./grade.js";
import { defaultGradeConfig } from "./gradeConfig.js";

type RecordedAnalysis = {
  linesBefore: EngineLine[];
  linesAfter: EngineLine[];
  depths: { before: number[]; after: number[] };
};

type GradingFixture = {
  id: string;
  fen: string;
  move: string;
  kidColor: "w" | "b";
  expect: {
    grade: Grade;
    isOnlyMove?: boolean;
    cappedByWinning?: boolean;
  };
  tags: string[];
  smoke?: boolean;
  recorded?: { white: RecordedAnalysis; mirrored: RecordedAnalysis };
};

describe("recorded grading fixtures", () => {
  it("covers the required grading categories", () => {
    const fixturesByTag = (tag: string) =>
      (fixtures as GradingFixture[]).filter((fixture) =>
        fixture.tags.includes(tag),
      ).length;

    expect(fixtures).toHaveLength(30);
    expect(fixturesByTag("opening")).toBeGreaterThanOrEqual(6);
    expect(fixturesByTag("hanging-queen")).toBeGreaterThanOrEqual(5);
    expect(fixturesByTag("missed-mate-in-1")).toBeGreaterThanOrEqual(4);
    expect(fixturesByTag("only-move")).toBeGreaterThanOrEqual(4);
    expect(fixturesByTag("winning-cap")).toBeGreaterThanOrEqual(4);
    expect(fixturesByTag("inaccuracy")).toBeGreaterThanOrEqual(4);
    expect(fixturesByTag("mistake")).toBeGreaterThanOrEqual(3);
  });

  it.each(fixtures.map((fixture) => [fixture.id, fixture] as const))(
    "%s grades the same from either color's perspective",
    (_id, rawFixture) => {
      const fixture = rawFixture as GradingFixture;
      if (!fixture.recorded) {
        throw new Error(`Fixture ${fixture.id} has not been recorded`);
      }
      const move = new Chess(fixture.fen).move({
        from: fixture.move.slice(0, 2),
        to: fixture.move.slice(2, 4),
        ...(fixture.move[4] ? { promotion: fixture.move[4] } : {}),
      });
      const mirroredFen = mirrorFen(fixture.fen);
      const mirroredUci = mirrorUci(fixture.move);
      const mirroredSan = mirrorSan(fixture.fen, move.san);
      const mirroredColor = fixture.kidColor === "w" ? "b" : "w";
      const whiteAnalysis = gradeMove({
        ply: 1,
        fenBefore: fixture.fen,
        move: { uci: fixture.move, san: move.san },
        kidColor: fixture.kidColor,
        linesBefore: fixture.recorded.white.linesBefore,
        linesAfter: fixture.recorded.white.linesAfter,
      });
      const mirroredAnalysis = gradeMove({
        ply: 1,
        fenBefore: mirroredFen,
        move: { uci: mirroredUci, san: mirroredSan },
        kidColor: mirroredColor,
        linesBefore: fixture.recorded.mirrored.linesBefore,
        linesAfter: fixture.recorded.mirrored.linesAfter,
      });

      expect(whiteAnalysis.grade).toBe(fixture.expect.grade);
      expect(mirroredAnalysis.grade).toBe(fixture.expect.grade);
      expect(mirroredAnalysis.grade).toBe(whiteAnalysis.grade);
      for (const [label, analysis] of [
        ["white", whiteAnalysis],
        ["mirrored", mirroredAnalysis],
      ] as const) {
        for (const threshold of gradeThresholds(fixture, analysis)) {
          expect(
            Math.abs(analysis.drop - threshold),
            `${fixture.id} ${label} drop is too close to threshold ${threshold}`,
          ).toBeGreaterThanOrEqual(1.5);
        }
      }
      if (fixture.expect.isOnlyMove !== undefined) {
        expect(whiteAnalysis.isOnlyMove).toBe(fixture.expect.isOnlyMove);
        expect(mirroredAnalysis.isOnlyMove).toBe(fixture.expect.isOnlyMove);
      }
      if (fixture.tags.includes("winning-cap")) {
        expect(whiteAnalysis.winAfter).toBeGreaterThanOrEqual(85);
        expect(mirroredAnalysis.winAfter).toBeGreaterThanOrEqual(85);
        expect(["best", "good", "inaccuracy"]).toContain(whiteAnalysis.grade);
        expect(["best", "good", "inaccuracy"]).toContain(
          mirroredAnalysis.grade,
        );
      }
      if (fixture.expect.cappedByWinning) {
        expect(whiteAnalysis.drop).toBeGreaterThanOrEqual(10);
        expect(whiteAnalysis.winAfter).toBeGreaterThanOrEqual(85);
        expect(whiteAnalysis.grade).toBe("inaccuracy");
        expect(mirroredAnalysis.drop).toBeGreaterThanOrEqual(10);
        expect(mirroredAnalysis.winAfter).toBeGreaterThanOrEqual(85);
        expect(mirroredAnalysis.grade).toBe("inaccuracy");
      }
    },
  );
});

function gradeThresholds(
  fixture: GradingFixture,
  analysis: ReturnType<typeof gradeMove>,
): number[] {
  const { thresholds } = defaultGradeConfig;
  switch (fixture.expect.grade) {
    case "best":
      return analysis.moveUci === analysis.linesBefore[0]?.uci
        ? []
        : [thresholds.best];
    case "good":
      return [thresholds.best, thresholds.good];
    case "inaccuracy":
      return fixture.tags.includes("winning-cap") ||
        fixture.expect.cappedByWinning
        ? [thresholds.good]
        : [thresholds.good, thresholds.inaccuracy];
    case "mistake":
      return [thresholds.inaccuracy, thresholds.mistake];
    case "blunder":
      return [thresholds.mistake];
  }
}
