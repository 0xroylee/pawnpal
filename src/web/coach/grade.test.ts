import { describe, expect, it } from "vitest";
import type { EngineLine } from "../../shared/coach/types.ts";
import { gradeMove, GradingError } from "./grade.js";

const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function cpForWinChance(chance: number): number {
  return Math.round(Math.log(chance / (100 - chance)) / 0.00368208);
}

function line(uci: string, cp: number): EngineLine {
  return { uci, san: uci, cp, pv: [uci], depth: 12 };
}

function inputForDrop(drop: number) {
  const winBefore = 70;
  const winAfter = winBefore - drop;
  return {
    ply: 1,
    fenBefore: fen,
    move: { uci: "e2e4", san: "e4" },
    kidColor: "w" as const,
    linesBefore: [
      line("d2d4", cpForWinChance(winBefore)),
      line("g1f3", cpForWinChance(winBefore - 1)),
    ],
    linesAfter: [line("d7d5", cpForWinChance(100 - winAfter))],
  };
}

describe("gradeMove", () => {
  it.each([
    [1, "best"],
    [3, "good"],
    [7, "inaccuracy"],
    [12, "mistake"],
    [20, "blunder"],
  ] as const)("grades a %i point drop as %s", (drop, grade) => {
    expect(gradeMove(inputForDrop(drop)).grade).toBe(grade);
  });

  it("calls the top engine move best even when its drop is large", () => {
    const input = inputForDrop(20);
    input.move = { uci: "d2d4", san: "d4" };
    expect(gradeMove(input).grade).toBe("best");
  });

  it("converts both evaluations to a Black kid's perspective", () => {
    const analysis = gradeMove({
      ...inputForDrop(15),
      kidColor: "b",
      linesBefore: [line("e7e5", cpForWinChance(70))],
      linesAfter: [line("e2e4", cpForWinChance(45))],
    });
    expect(analysis.winBefore).toBeCloseTo(70, 0);
    expect(analysis.winAfter).toBeCloseTo(55, 0);
    expect(analysis.grade).toBe("blunder");
  });

  it("caps a careless move at inaccuracy while the kid remains clearly winning", () => {
    const input = inputForDrop(15);
    input.linesBefore[0] = {
      uci: "d2d4",
      san: "d4",
      mate: 2,
      pv: ["d2d4"],
      depth: 12,
    };
    input.linesAfter[0] = line("d7d5", cpForWinChance(14));
    const analysis = gradeMove(input);
    expect(analysis.winAfter).toBeGreaterThanOrEqual(85);
    expect(analysis.grade).toBe("inaccuracy");
  });

  it("marks a played forced move and leaves it false when no second line exists", () => {
    const input = inputForDrop(0);
    input.move = { uci: "d2d4", san: "d4" };
    input.linesBefore[1] = line("g1f3", cpForWinChance(50));
    expect(gradeMove(input).isOnlyMove).toBe(true);
    input.linesBefore = [input.linesBefore[0]!];
    expect(gradeMove(input).isOnlyMove).toBe(false);
  });

  it.each(["stalemate", "threefold", "fifty-move", "insufficient"] as const)(
    "uses 50 for a %s ending despite winning-looking post-move lines",
    (ending) => {
      const input = inputForDrop(0);
      input.linesAfter = [line("e7e5", cpForWinChance(14))];
      const analysis = gradeMove({
        ...input,
        ending,
      });

      expect(analysis.winAfter).toBe(50);
      expect(analysis.drop).toBeCloseTo(20, 0);
      expect(analysis.grade).toBe("blunder");
    },
  );

  it("uses 100 for checkmate despite a non-winning post-move line", () => {
    const input = inputForDrop(0);
    input.linesAfter = [line("e7e5", cpForWinChance(99))];
    const analysis = gradeMove({
      ...input,
      ending: "checkmate",
    });

    expect(analysis.winAfter).toBe(100);
  });

  it("does not allow resignation as a move ending", () => {
    expect(() => {
      // @ts-expect-error resignation is not a move ending
      gradeMove({ ...inputForDrop(0), ending: "resign" });
    }).not.toThrow();
  });

  it("rejects an empty pre-move analysis with a typed grading error", () => {
    expect(() =>
      gradeMove({ ...inputForDrop(0), linesBefore: [] }),
    ).toThrowError(GradingError);
    expect(() =>
      gradeMove({ ...inputForDrop(0), linesBefore: [] }),
    ).toThrowError(expect.objectContaining({ code: "no-lines" }));
  });
});

// Win chance flattens near 0% and 100% (and the score is clamped at ±1000 cp),
// so in a lopsided game a big material loss barely moves it. The material
// floor makes sure Pip still speaks when the kid gives material away.
describe("material floor", () => {
  // Engine scores are from the side to move: the kid before the move, the
  // opponent after it.
  function lopsided(before: number, after: number, kidColor: "w" | "b" = "w") {
    return {
      ply: 1,
      fenBefore: fen,
      move: { uci: "a2a3", san: "a3" },
      kidColor,
      linesBefore: [line("d2d4", before), line("g1f3", before - 20)],
      linesAfter: [line("d7d5", -after)],
    };
  }

  it("calls a lost rook a blunder when the kid is already losing", () => {
    const analysis = gradeMove(lopsided(-1463, -2646));
    expect(analysis.drop).toBeLessThan(1);
    expect(analysis.grade).toBe("blunder");
  });

  it("calls a two-pawn loss a mistake when the kid is already losing", () => {
    expect(gradeMove(lopsided(-603, -831)).grade).toBe("mistake");
  });

  it("flags a big material loss even while the kid is clearly winning", () => {
    const analysis = gradeMove(lopsided(1126, 575));
    expect(analysis.winAfter).toBeGreaterThanOrEqual(85);
    expect(analysis.grade).toBe("blunder");
  });

  it("still spares a small slip while the kid is clearly winning", () => {
    expect(gradeMove(lopsided(1126, 1000)).grade).not.toMatch(
      /mistake|blunder/,
    );
  });

  it("grades the same loss the same way for a Black kid", () => {
    expect(gradeMove(lopsided(-1463, -2646, "b")).grade).toBe("blunder");
  });

  it("leaves a move the engine listed among its top lines alone", () => {
    const input = lopsided(-1086, -1425);
    input.move = { uci: "g1f3", san: "Nf3" };
    expect(gradeMove(input).grade).toBe("best");
  });

  it("leaves mate scores to the win-chance rules", () => {
    const input = lopsided(0, 600);
    input.linesBefore[0] = {
      uci: "d2d4",
      san: "d4",
      mate: 2,
      pv: ["d2d4"],
      depth: 12,
    };
    expect(gradeMove(input).grade).toBe("inaccuracy");
  });
});
