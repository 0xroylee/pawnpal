import { describe, expect, it } from "vitest";
import { finalizeFact } from "./types.ts";
import { shouldCallLlm } from "./rephrasePolicy.ts";

const castlingFact = finalizeFact({
  kind: "hanging-piece",
  betterMover: { type: "k", color: "w", square: "e1" },
  betterMoveSan: "O-O",
  betterMoveUci: "e1g1",
});

describe("shouldCallLlm", () => {
  it("blocks castling preflight for nudge and hint while allowing other modes", () => {
    const base = {
      fact: castlingFact,
      templateText: "A safe idea was available.",
      kidColor: "w" as const,
      kidAge: 8,
      language: "en" as const,
    };

    expect(shouldCallLlm({ ...base, mode: "nudge" })).toBe(false);
    expect(shouldCallLlm({ ...base, mode: "hint" })).toBe(false);
    expect(shouldCallLlm({ ...base, mode: "explain" })).toBe(true);
  });

  it("allows nudge when the better move is not castling", () => {
    expect(
      shouldCallLlm({
        fact: finalizeFact({
          kind: "missed-capture",
          betterMoveSan: "Nxe5",
          betterMoveUci: "f3e5",
        }),
        mode: "nudge",
        templateText: "There was another idea.",
        kidColor: "w",
        language: "en",
      }),
    ).toBe(true);
  });
});
