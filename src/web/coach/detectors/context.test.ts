import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import type { MoveAnalysis } from "../../../shared/coach/types.ts";
import { buildContext } from "./context.js";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("buildContext", () => {
  it("builds the before and after boards from a graded move", () => {
    const analysis: MoveAnalysis = {
      ply: 1,
      fenBefore: START,
      moveUci: "e2e4",
      moveSan: "e4",
      linesBefore: [],
      linesAfter: [],
      winBefore: 50,
      winAfter: 50,
      drop: 0,
      grade: "best",
      isOnlyMove: false,
      facts: [],
    };

    const context = buildContext({ analysis, kidColor: "w" });

    expect(context.before.fen()).toBe(START);
    expect(context.move).toEqual({
      uci: "e2e4",
      san: "e4",
      from: "e2",
      to: "e4",
    });
    expect(context.after?.get("e4")).toEqual({ type: "p", color: "w" });
  });

  it("leaves move and after absent for hint analysis", () => {
    const context = buildContext({
      analysis: { fen: START, lines: [] },
      kidColor: "w",
    });

    expect(context.before).toBeInstanceOf(Chess);
    expect(context.move).toBeUndefined();
    expect(context.after).toBeUndefined();
  });
});
