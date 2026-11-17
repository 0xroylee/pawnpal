import { describe, expect, it } from "vitest";
import { selectionReducer, type SelectionState } from "./selection.js";

const empty: SelectionState = { selected: null, targets: [] };
const rules = {
  kidColor: "w" as const,
  legalTargets: (square: string) => (square === "e2" ? ["e3", "e4"] : ["d4"]),
};

describe("selectionReducer", () => {
  it("selects a friendly piece and exposes its legal targets", () => {
    expect(
      selectionReducer(empty, { square: "e2", pieceColor: "w" }, rules),
    ).toEqual({
      selected: "e2",
      targets: ["e3", "e4"],
    });
  });

  it("reselects another friendly piece, then emits a legal move", () => {
    const selected = selectionReducer(
      empty,
      { square: "e2", pieceColor: "w" },
      rules,
    );
    const reselected = selectionReducer(
      selected,
      { square: "d2", pieceColor: "w" },
      rules,
    );
    expect(reselected.selected).toBe("d2");

    const moved = selectionReducer(selected, { square: "e4" }, rules);
    expect(moved).toEqual({
      selected: null,
      targets: [],
      move: { from: "e2", to: "e4" },
    });
  });

  it("clears selection after an illegal target or a tap on an opponent piece", () => {
    const selected = selectionReducer(
      empty,
      { square: "e2", pieceColor: "w" },
      rules,
    );
    expect(selectionReducer(selected, { square: "e5" }, rules)).toEqual(empty);
    expect(
      selectionReducer(selected, { square: "e3", pieceColor: "b" }, rules),
    ).toEqual({
      selected: null,
      targets: [],
      move: { from: "e2", to: "e3" },
    });
  });

  it("does not select or move when the board is locked", () => {
    const selected = selectionReducer(
      empty,
      { square: "e2", pieceColor: "w" },
      {
        ...rules,
        interactive: false,
      },
    );
    expect(selected).toEqual(empty);
  });
});
