import { describe, expect, it } from "vitest";
import { finalizeFact } from "../../../src/shared/coach/types.ts";

describe("finalizeFact", () => {
  it("derives the schema and nameable roles, moves, and squares", () => {
    const fact = finalizeFact({
      kind: "hanging-piece",
      subject: { type: "n", color: "w", square: "f3" },
      attacker: { type: "q", color: "b", square: "d8" },
      targets: [{ type: "n", color: "w", square: "f3" }],
      threatMoveSan: "Qxf3+",
      threatMoveUci: "d8f3",
    });

    expect(fact).toEqual({
      schemaVersion: 1,
      kind: "hanging-piece",
      subject: { type: "n", color: "w", square: "f3" },
      attacker: { type: "q", color: "b", square: "d8" },
      targets: [{ type: "n", color: "w", square: "f3" }],
      threatMoveSan: "Qxf3+",
      threatMoveUci: "d8f3",
      pieces: [
        { type: "n", color: "w", square: "f3" },
        { type: "q", color: "b", square: "d8" },
      ],
      moves: ["Qxf3+"],
      squares: ["f3", "d8"],
    });
  });

  it("includes both squares from each UCI move and keeps distinct SAN moves", () => {
    const fact = finalizeFact({
      kind: "missed-capture",
      subject: { type: "b", color: "w", square: "c4" },
      targets: [{ type: "r", color: "b", square: "f7" }],
      betterMoveSan: "Bxf7+",
      betterMoveUci: "c4f7",
      threatMoveSan: "Rf8+",
      threatMoveUci: "a8f8",
    });

    expect(fact.moves).toEqual(["Bxf7+", "Rf8+"]);
    expect(fact.squares).toEqual(["c4", "f7", "a8", "f8"]);
  });
});
