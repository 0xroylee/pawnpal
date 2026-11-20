import { describe, expect, it } from "vitest";
import { finalizeFact } from "../../shared/coach/types.js";
import {
  annotationsFor,
  annotationsForHeld,
  annotationsValidOn,
} from "./annotations.js";

const hangingFact = finalizeFact({
  kind: "hanging-piece",
  subject: { type: "n", color: "w", square: "f3" },
  attacker: { type: "r", color: "b", square: "f8" },
  threatMoveSan: "Rxf3",
  threatMoveUci: "f8f3",
  betterMoveSan: "Ne5",
  betterMoveUci: "f3e5",
});

describe("annotationsFor", () => {
  it("maps nudge to danger only and explain to a dashed threat arrow", () => {
    expect(annotationsFor(hangingFact, "nudge")).toEqual({
      danger: ["f3"],
      hint: [],
      arrows: [],
    });
    expect(annotationsFor(hangingFact, "explain")).toEqual({
      danger: ["f3"],
      hint: [],
      arrows: [{ from: "f8", to: "f3", kind: "threat" }],
    });
  });

  it("adds the better move in reveal mode and stays clear for praise", () => {
    expect(annotationsFor(hangingFact, "reveal")).toEqual({
      danger: ["f3"],
      hint: [],
      arrows: [
        { from: "f8", to: "f3", kind: "threat" },
        { from: "f3", to: "e5", kind: "better" },
      ],
    });
    expect(annotationsFor(hangingFact, "praise")).toEqual({
      danger: [],
      hint: [],
      arrows: [],
    });
  });

  it("uses one from-square tint for the first two hint tiers", () => {
    expect(
      annotationsFor(undefined, "hint1", { from: "e2", to: "e4" }),
    ).toEqual({ danger: [], hint: ["e2"], arrows: [] });
    expect(
      annotationsFor(hangingFact, "hint2", { from: "f3", to: "e5" }),
    ).toEqual({ danger: [], hint: ["f3"], arrows: [] });
  });

  it("uses a solid better arrow for tier three and for a fact-free reveal", () => {
    expect(
      annotationsFor(undefined, "hint3", { from: "e2", to: "e4" }),
    ).toEqual({
      danger: [],
      hint: [],
      arrows: [{ from: "e2", to: "e4", kind: "better" }],
    });
    expect(
      annotationsFor(undefined, "reveal", { from: "e2", to: "e4" }),
    ).toEqual({
      danger: [],
      hint: [],
      arrows: [{ from: "e2", to: "e4", kind: "better" }],
    });
  });
});

describe("held board annotations", () => {
  const afterRookMove = "6rk/8/8/8/8/6R1/8/K7 b - - 1 1";
  const heldHangingFact = finalizeFact({
    kind: "hanging-piece",
    subject: { type: "r", color: "w", square: "g3" },
    attacker: { type: "r", color: "b", square: "g8" },
    threatMoveSan: "Rxg3",
    threatMoveUci: "g8g3",
    betterMoveSan: "Rc2",
    betterMoveUci: "g2c2",
  });

  it("keeps only annotations that refer to pieces on the displayed board", () => {
    const annotations = annotationsForHeld(heldHangingFact, afterRookMove, "w");

    expect(annotations).toEqual({
      danger: ["g3"],
      hint: [],
      arrows: [{ from: "g8", to: "g3", kind: "threat" }],
    });
    expect(annotationsValidOn(afterRookMove, annotations, "w")).toBe(true);
    expect(
      annotationsValidOn(
        afterRookMove,
        annotationsFor(heldHangingFact, "reveal", {
          from: "g2",
          to: "c2",
        }),
        "w",
      ),
    ).toBe(false);
  });

  it("omits annotations for opportunities that belonged to the previous position", () => {
    const missedFork = finalizeFact({
      kind: "missed-fork",
      subject: { type: "n", color: "w", square: "f3" },
      targets: [
        { type: "r", color: "b", square: "e8" },
        { type: "q", color: "b", square: "d5" },
      ],
      betterMoveSan: "Nd4",
      betterMoveUci: "f3d4",
    });

    expect(annotationsForHeld(missedFork, afterRookMove, "w")).toEqual({
      danger: [],
      hint: [],
      arrows: [],
    });
  });
});
