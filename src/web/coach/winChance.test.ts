import { describe, expect, it } from "vitest";
import { toKidScore, winChance } from "./winChance.js";

describe("winChance", () => {
  it.each([
    [{ cp: 0 }, 50],
    [{ cp: 100 }, 59.1],
    [{ cp: -300 }, 24.9],
    [{ cp: 1000 }, 97.5],
    [{ cp: -1000 }, 2.5],
    [{ mate: 2 }, 100],
    [{ mate: -3 }, 0],
  ] as const)("converts %o into win chance", (score, expected) => {
    expect(winChance(score)).toBeCloseTo(expected, 1);
  });

  it("converts engine scores to the kid's perspective", () => {
    expect(
      toKidScore(
        { uci: "e2e4", san: "e4", cp: 120, pv: ["e2e4"], depth: 10 },
        "w",
        "w",
      ),
    ).toEqual({ cp: 120 });
    expect(
      toKidScore(
        { uci: "e7e5", san: "e5", cp: 120, pv: ["e7e5"], depth: 10 },
        "b",
        "w",
      ),
    ).toEqual({ cp: -120 });
    expect(
      toKidScore(
        { uci: "e7e5", san: "e5", mate: 3, pv: ["e7e5"], depth: 10 },
        "b",
        "w",
      ),
    ).toEqual({ mate: -3 });
  });
});
