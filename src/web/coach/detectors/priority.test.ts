import { describe, expect, it } from "vitest";
import { finalizeFact, type FactKind } from "../../../shared/coach/types.js";
import { selectFact } from "./priority.js";

function fact(kind: FactKind) {
  return finalizeFact({ kind });
}

describe("selectFact", () => {
  it("selects the highest-priority fact regardless of input order", () => {
    expect(
      selectFact([
        fact("played-fork"),
        fact("threat"),
        fact("missed-capture"),
        fact("allowed-fork"),
        fact("missed-mate"),
        fact("allowed-mate"),
      ])?.kind,
    ).toBe("allowed-mate");
  });

  it("skips played forks and chooses the next eligible fact", () => {
    expect(selectFact([fact("played-fork")])).toBeUndefined();
    expect(selectFact([fact("played-fork"), fact("threat")])?.kind).toBe(
      "threat",
    );
  });
});
