import { describe, expect, it } from "vitest";
import { legalTargets, needsPromotion } from "./rules.js";

describe("board rules", () => {
  it("lists only legal target squares for a selected piece", () => {
    const targets = legalTargets(
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      "e2",
    );
    expect(targets).toEqual(["e3", "e4"]);
  });

  it("identifies moves that need promotion selection", () => {
    expect(needsPromotion("7k/4P3/8/8/8/8/8/K7 w - - 0 1", "e7", "e8")).toBe(
      true,
    );
    expect(
      needsPromotion(
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        "e2",
        "e4",
      ),
    ).toBe(false);
  });
});
