import { describe, expect, it } from "vitest";
import type { Color } from "chess.js";
import type { EngineLine, MoveAnalysis } from "../../shared/coach/types.js";
import { finalizeFact } from "../../shared/coach/types.js";
import { annotationsValidOn } from "./annotations.js";
import { coachReducer, initialCoachState } from "./coachState.js";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const ROOK_BEFORE = "6rk/8/8/8/8/8/6R1/K7 w - - 0 1";
const ROOK_AFTER = "6rk/8/8/8/8/6R1/8/K7 b - - 1 1";
const kidColor = "w";
const deps = {
  variantSeed: 0,
  kidColor: kidColor as Color,
};
const fact = finalizeFact({
  kind: "hanging-piece",
  subject: { type: "n", color: "w", square: "f3" },
  attacker: { type: "r", color: "b", square: "f8" },
  threatMoveSan: "Rxf3",
  threatMoveUci: "f8f3",
});
const rookFact = finalizeFact({
  kind: "hanging-piece",
  subject: { type: "r", color: "w", square: "g3" },
  attacker: { type: "r", color: "b", square: "g8" },
  threatMoveSan: "Rxg3",
  threatMoveUci: "g8g3",
});

describe("coachReducer", () => {
  it("holds on explain text with annotations valid on the displayed board", () => {
    const state = coachReducer(
      initialCoachState,
      {
        type: "GRADED",
        analysis: analysis({
          fenBefore: ROOK_BEFORE,
          moveUci: "g2g3",
          moveSan: "Rg3",
          linesBefore: [
            { uci: "g2c2", san: "Rc2", cp: 0, pv: ["g2c2"], depth: 14 },
          ],
          grade: "mistake",
          facts: [rookFact],
        }),
      },
      deps,
    );

    expect(state.message).toMatchObject({
      kind: "hanging-piece",
      mode: "explain",
      grade: "oops",
      pip: "surprised",
    });
    expect(state.message?.text).toContain("rook");
    expect(state.message?.text).toContain("rook");
    expect(state.annotations).toEqual({
      danger: ["g3"],
      hint: [],
      arrows: [{ from: "g8", to: "g3", kind: "threat" }],
    });
    expect(annotationsValidOn(ROOK_AFTER, state.annotations, "w")).toBe(true);
  });

  it("renders a late coached grade as explanation only without annotations", () => {
    const state = coachReducer(
      initialCoachState,
      {
        type: "GRADED",
        analysis: analysis({ grade: "blunder", facts: [fact], late: true }),
      },
      deps,
    );

    expect(state.message).toMatchObject({
      kind: "hanging-piece",
      mode: "explain",
      grade: "bigoops",
      pip: "surprised",
      late: true,
    });
    expect(state.message?.text).toContain("knight");
    expect(state.annotations).toEqual({ danger: [], hint: [], arrows: [] });
  });

  it("uses a generic reveal when no detector produced a fact", () => {
    const state = coachReducer(
      initialCoachState,
      { type: "GRADED", analysis: analysis({ grade: "blunder", facts: [] }) },
      deps,
    );

    expect(state.message).toMatchObject({
      mode: "explain",
      grade: "bigoops",
      pip: "surprised",
    });
    expect(state.message?.kind).toBeUndefined();
    expect(state.annotations).toEqual({ danger: [], hint: [], arrows: [] });
  });

  it("praises only moves, rate-limits praise, and expires praise", () => {
    const stateAtStart = { ...initialCoachState, lastPraisePly: 0 };
    const praised = coachReducer(
      stateAtStart,
      {
        type: "GRADED",
        analysis: analysis({ ply: 10, grade: "best", isOnlyMove: true }),
      },
      deps,
    );
    expect(praised.message).toMatchObject({
      mode: "praise",
      grade: "great",
      pip: "cheering",
    });
    expect(praised.message?.kind).toBeUndefined();
    expect(praised.message?.text).not.toContain("fork");
    expect(praised.lastPraisePly).toBe(10);

    const rateLimited = coachReducer(
      praised,
      {
        type: "GRADED",
        analysis: analysis({ ply: 12, grade: "best", isOnlyMove: true }),
      },
      deps,
    );
    expect(rateLimited.message).toBeUndefined();
    expect(rateLimited.annotations).toEqual({
      danger: [],
      hint: [],
      arrows: [],
    });

    const expired = coachReducer(praised, { type: "PRAISE_EXPIRED" }, deps);
    expect(expired.message).toBeUndefined();
    expect(expired.lastPraisePly).toBe(10);
  });

  it("keeps ordinary grades silent and clears stale coach output", () => {
    const shown = coachReducer(
      initialCoachState,
      {
        type: "GRADED",
        analysis: analysis({ grade: "mistake", facts: [fact] }),
      },
      deps,
    );
    const silent = coachReducer(
      shown,
      { type: "GRADED", analysis: analysis({ grade: "good", facts: [] }) },
      deps,
    );
    expect(silent.message).toBeUndefined();
    expect(silent.annotations).toEqual({ danger: [], hint: [], arrows: [] });
  });

  it("shows thinking until hint lines arrive, then applies each hint tier", () => {
    const thinking = coachReducer(
      initialCoachState,
      { type: "HINT", tier: 1, fen: START, ply: 0 },
      deps,
    );
    expect(thinking.message?.pip).toBe("thinking");

    const line: EngineLine = {
      uci: "e2e4",
      san: "e4",
      cp: 0,
      pv: ["e2e4"],
      depth: 14,
    };
    const tier1 = coachReducer(
      initialCoachState,
      { type: "HINT", tier: 1, fen: START, ply: 0, lines: [line] },
      deps,
    );
    expect(tier1.message?.mode).toBe("hint1");
    expect(tier1.annotations).toEqual({ danger: [], hint: ["e2"], arrows: [] });

    const captureFen = "q6k/8/8/8/8/8/6P1/R6K w - - 0 1";
    const captureLine: EngineLine = {
      uci: "a1a8",
      san: "Rxa8+",
      cp: 800,
      pv: ["a1a8"],
      depth: 14,
    };
    const tier2 = coachReducer(
      initialCoachState,
      { type: "HINT", tier: 2, fen: captureFen, ply: 0, lines: [captureLine] },
      deps,
    );
    expect(tier2.message?.kind).toBe("missed-capture");
    expect(tier2.message?.mode).toBe("hint2");
    expect(tier2.message?.text).toContain("queen");
    expect(tier2.annotations).toEqual({ danger: [], hint: ["a1"], arrows: [] });

    const tier3 = coachReducer(
      initialCoachState,
      { type: "HINT", tier: 3, fen: captureFen, ply: 0, lines: [captureLine] },
      deps,
    );
    expect(tier3.message?.mode).toBe("hint3");
    expect(tier3.annotations).toEqual({
      danger: [],
      hint: [],
      arrows: [{ from: "a1", to: "a8", kind: "better" }],
    });
  });

  it("describes a confirmed mating idea and stays neutral without one", () => {
    const mateFen = "1R6/4K3/2k4r/P2qQ3/4p3/1N6/6n1/8 w - - 0 1";
    const mateHint = coachReducer(
      initialCoachState,
      {
        type: "HINT",
        tier: 2,
        fen: mateFen,
        ply: 0,
        lines: [
          {
            uci: "b8b6",
            san: "Rb6#",
            mate: 1,
            pv: ["b8b6"],
            depth: 14,
          },
        ],
      },
      deps,
    );
    expect(mateHint.message).toMatchObject({
      mode: "hint2",
      kind: "missed-mate",
    });
    expect(mateHint.message?.text).toContain("checkmate in one move");
    expect(mateHint.message?.text).toContain("rook");

    const quietHint = coachReducer(
      initialCoachState,
      {
        type: "HINT",
        tier: 2,
        fen: START,
        ply: 0,
        lines: [
          {
            uci: "e2e4",
            san: "e4",
            cp: 0,
            pv: ["e2e4"],
            depth: 14,
          },
        ],
      },
      deps,
    );
    expect(quietHint.message?.kind).toBeUndefined();
    expect(quietHint.message?.text).toMatch(/position/);
    expect(quietHint.message?.text).not.toMatch(
      /mate|capture|fork|threat|attack|material|win/i,
    );
  });

  it("clears coach output after a move, dismissal, and a new game", () => {
    const shown = coachReducer(
      initialCoachState,
      {
        type: "GRADED",
        analysis: analysis({ grade: "mistake", facts: [fact] }),
      },
      deps,
    );
    expect(
      coachReducer(shown, { type: "KID_MOVED" }, deps).message,
    ).toBeUndefined();
    expect(coachReducer(shown, { type: "DISMISS" }, deps).annotations).toEqual({
      danger: [],
      hint: [],
      arrows: [],
    });
    expect(coachReducer(shown, { type: "NEW_GAME" }, deps)).toEqual(
      initialCoachState,
    );
  });
});

function analysis(overrides: Partial<MoveAnalysis> = {}): MoveAnalysis {
  return {
    ply: 1,
    fenBefore: START,
    moveUci: "e2e4",
    moveSan: "e4",
    linesBefore: [{ uci: "e2e4", san: "e4", cp: 0, pv: ["e2e4"], depth: 14 }],
    linesAfter: [{ uci: "d7d5", san: "d5", cp: 0, pv: ["d7d5"], depth: 12 }],
    winBefore: 50,
    winAfter: 50,
    drop: 0,
    grade: "good",
    isOnlyMove: false,
    facts: [],
    ...overrides,
  };
}
