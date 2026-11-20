import { describe, expect, it } from "vitest";
import {
  attackedPiecesFrom,
  isFork,
  kidMate,
  pieceAt,
} from "./boardQueries.js";

const forkFen = "8/3k1q2/8/4N3/8/8/8/4K3 w - - 0 1";

describe("coach board queries", () => {
  it("looks up pieces and lists attacked enemy pieces", () => {
    expect(pieceAt(forkFen, "e5")).toEqual({
      type: "n",
      color: "w",
      square: "e5",
    });
    expect(pieceAt(forkFen, "a1")).toBeUndefined();
    expect(attackedPiecesFrom(forkFen, "e5")).toEqual([
      { type: "k", color: "b", square: "d7" },
      { type: "q", color: "b", square: "f7" },
    ]);
  });

  it("recognizes a king plus a piece as a fork", () => {
    expect(isFork(forkFen, "e5", "b")).toBe(true);
    expect(isFork(forkFen, "e5", "w")).toBe(false);
  });

  it("extracts mate scores and ignores centipawn or missing scores", () => {
    expect(kidMate({ mate: 2 })).toBe(2);
    expect(kidMate({ mate: -3 })).toBe(-3);
    expect(kidMate({ cp: 120 })).toBeUndefined();
    expect(kidMate(undefined)).toBeUndefined();
  });
});
