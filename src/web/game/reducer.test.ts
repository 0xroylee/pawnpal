import endings from "../../../tests/fixtures/endings.json";
import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import type { MoveAnalysis } from "../../shared/coach/types.ts";
import {
  gameRecord,
  gameReducer,
  initialGame,
  type GameState,
} from "./reducer.js";

const standardFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const sampleLines = [
  { uci: "e2e4", san: "e4", cp: 20, pv: ["e2e4"], depth: 8 },
];

function analysis(ply: number, moveUci: string): MoveAnalysis {
  return {
    ply,
    fenBefore: standardFen,
    moveUci,
    moveSan: "e4",
    linesBefore: sampleLines,
    linesAfter: sampleLines,
    winBefore: 55,
    winAfter: 55,
    drop: 0,
    grade: "best",
    isOnlyMove: false,
    facts: [],
  };
}

function kidMove(state: GameState, uci: string): GameState {
  return gameReducer(state, {
    type: "KID_MOVE",
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci[4],
  });
}

function gradeCurrent(
  state: GameState,
  grade: MoveAnalysis["grade"],
): GameState {
  const ply = state.history.length;
  const move = state.history[ply - 1]!;
  return gameReducer(state, {
    type: "GRADE_READY",
    ply,
    turnToken: state.turnToken,
    analysis: { ...analysis(ply, move.uci), moveSan: move.san, grade },
  });
}

describe("Try Again", () => {
  const start = () =>
    gameReducer(initialGame(), { type: "NEW_GAME", kidColor: "w" });

  it("restores the turn, takes back a second miss, and records only the move that stands in PGN", () => {
    const initial = start();
    const first = gradeCurrent(kidMove(initial, "e2e4"), "blunder");
    expect(first.phase).toBe("nudge");
    expect(gameRecord(first).analyses).toEqual({});
    const replayed = new Chess();
    replayed.loadPgn(gameRecord(first).pgn);
    expect(replayed.history()).toEqual([]);

    const retry = gameReducer(first, { type: "TRY_AGAIN" });
    expect(retry).toMatchObject({
      phase: "kidToMove",
      fen: initial.fen,
      history: [],
      analyses: {},
      gameToken: initial.gameToken,
    });
    expect(retry.turnToken).toBeGreaterThan(first.turnToken);
    expect(gameReducer(retry, { type: "TRY_AGAIN" })).toBe(retry);

    const reveal = gradeCurrent(kidMove(retry, "d2d4"), "mistake");
    expect(reveal).toMatchObject({
      phase: "reveal",
      fen: initial.fen,
      history: [],
    });
    expect(
      gameReducer(reveal, {
        type: "OPPONENT_MOVE",
        uci: "e7e5",
        turnToken: reveal.turnToken,
      }),
    ).toBe(reveal);
    const next = gameReducer(reveal, { type: "REVEAL_OK" });
    const released = gradeCurrent(kidMove(next, "g1f3"), "blunder");

    expect(released.phase).toBe("opponentToMove");
    const record = gameRecord(released);
    replayed.loadPgn(record.pgn);
    expect(replayed.history()).toEqual(["Nf3"]);
    expect(record.analyses[1]?.attempts).toEqual([
      {
        moveUci: "e2e4",
        moveSan: "e4",
        grade: "blunder",
        usedShowMe: false,
        revealed: false,
      },
      {
        moveUci: "d2d4",
        moveSan: "d4",
        grade: "mistake",
        usedShowMe: false,
        revealed: true,
      },
    ]);
  });

  it("uses the original grade when the kid retries the same move", () => {
    const first = gradeCurrent(kidMove(start(), "e2e4"), "mistake");
    const retry = gameReducer(first, { type: "TRY_AGAIN" });
    const kept = kidMove(retry, "e2e4");
    expect(kept.phase).toBe("opponentToMove");
    expect(kept.analyses[1]).toMatchObject({
      moveUci: "e2e4",
      grade: "mistake",
      attempts: [{ moveUci: "e2e4", revealed: false, usedShowMe: false }],
    });
  });

  it("records Show me and rejects a stale grade for the same move and ply after reveal", () => {
    const first = gradeCurrent(kidMove(start(), "e2e4"), "mistake");
    const reveal = gameReducer(first, { type: "SHOW_ME" });
    expect(reveal.phase).toBe("reveal");
    expect(reveal.fen).toBe(first.startFen);
    const retried = kidMove(gameReducer(reveal, { type: "REVEAL_OK" }), "e2e4");
    expect(retried.phase).toBe("grading");
    expect(
      gameReducer(retried, {
        type: "GRADE_READY",
        ply: 1,
        turnToken: first.turnToken,
        analysis: first.analyses[1]!,
      }),
    ).toBe(retried);
    const released = gradeCurrent(retried, "mistake");
    expect(released.phase).toBe("opponentToMove");
    expect(released.analyses[1]?.attempts).toMatchObject([
      { moveUci: "e2e4", usedShowMe: true, revealed: true },
    ]);
  });

  it("continues immediately when Try Again is off", () => {
    const disabled = gameReducer(initialGame(), {
      type: "NEW_GAME",
      kidColor: "w",
      offerTryAgain: false,
    });
    const released = gradeCurrent(kidMove(disabled, "e2e4"), "blunder");
    expect(released.phase).toBe("opponentToMove");
    expect(released.analyses[1]).not.toHaveProperty("late");
  });

  it("keeps attempts on a retry whose grade arrives late", () => {
    const first = gradeCurrent(kidMove(start(), "e2e4"), "blunder");
    const retry = gameReducer(first, { type: "TRY_AGAIN" });
    const moved = kidMove(retry, "d2d4");
    const released = gameReducer(moved, {
      type: "GRADE_TIMEOUT",
      ply: 1,
      turnToken: moved.turnToken,
    });
    expect(released.phase).toBe("opponentToMove");
    expect(gameRecord(released).attempts[1]).toMatchObject([
      { moveUci: "e2e4" },
    ]);
    const late = gradeCurrent(released, "blunder");
    expect(late.phase).toBe("opponentToMove");
    expect(late.analyses[1]).toMatchObject({
      late: true,
      attempts: [{ moveUci: "e2e4" }],
    });
  });
});

describe("gameReducer", () => {
  it("starts with the requested color and lets the side to move act first", () => {
    const white = gameReducer(initialGame(), {
      type: "NEW_GAME",
      kidColor: "w",
    });
    const black = gameReducer(initialGame(), {
      type: "NEW_GAME",
      kidColor: "b",
    });

    expect(white.phase).toBe("kidToMove");
    expect(black.phase).toBe("opponentToMove");
  });

  it("accepts a legal kid move and rejects illegal or out-of-turn moves by identity", () => {
    const playing = gameReducer(initialGame(), {
      type: "NEW_GAME",
      kidColor: "w",
    });
    const moved = gameReducer(playing, {
      type: "KID_MOVE",
      from: "e2",
      to: "e4",
    });

    expect(moved.phase).toBe("grading");
    expect(moved.history[0]).toMatchObject({
      san: "e4",
      uci: "e2e4",
      from: "e2",
      to: "e4",
    });
    expect(moved.history[0]).not.toHaveProperty("ending");
    expect(
      gameReducer(playing, { type: "KID_MOVE", from: "e2", to: "e5" }),
    ).toBe(playing);
    expect(
      gameReducer(playing, { type: "KID_MOVE", from: "z9", to: "e5" }),
    ).toBe(playing);
    expect(gameReducer(moved, { type: "KID_MOVE", from: "d2", to: "d4" })).toBe(
      moved,
    );
    expect(
      gameReducer(moved, {
        type: "OPPONENT_MOVE",
        uci: "e7e5",
        turnToken: moved.turnToken,
      }),
    ).toBe(moved);
  });

  it("stores only pre-analysis for the current kid-to-move position", () => {
    const playing = gameReducer(initialGame(), {
      type: "NEW_GAME",
      kidColor: "w",
    });
    const lines = sampleLines;
    const ready = gameReducer(playing, {
      type: "PRE_ANALYSIS_READY",
      fen: playing.fen,
      lines,
    });
    expect(ready.preAnalysis).toEqual({ fen: playing.fen, lines });
    expect(
      gameReducer(playing, {
        type: "PRE_ANALYSIS_READY",
        fen: "stale-fen",
        lines,
      }),
    ).toBe(playing);
  });

  it("stores a grade by ply and releases the opponent", () => {
    let state = gameReducer(initialGame(), {
      type: "NEW_GAME",
      kidColor: "w",
    });
    state = gameReducer(state, { type: "KID_MOVE", from: "e2", to: "e4" });
    state = gameReducer(state, {
      type: "GRADE_READY",
      ply: 1,
      turnToken: state.pendingGrades[1]?.turnToken ?? state.turnToken,
      analysis: analysis(1, "e2e4"),
    });

    expect(state.phase).toBe("opponentToMove");
    expect(state.analyses[1]).toMatchObject({ moveUci: "e2e4", grade: "best" });
  });

  it.each(["mistake", "blunder"] as const)(
    "holds an on-time %s grade for coaching",
    (grade) => {
      let state = gameReducer(initialGame(), {
        type: "NEW_GAME",
        kidColor: "w",
      });
      state = gameReducer(state, { type: "KID_MOVE", from: "e2", to: "e4" });
      state = gameReducer(state, {
        type: "GRADE_READY",
        ply: 1,
        turnToken: state.pendingGrades[1]?.turnToken ?? state.turnToken,
        analysis: { ...analysis(1, "e2e4"), grade },
      });

      expect(state.phase).toBe("nudge");
      expect(state.history).toHaveLength(1);
      expect(state.analyses[1]).toMatchObject({ grade, moveUci: "e2e4" });
      expect(state.analyses[1]).not.toHaveProperty("late");
    },
  );

  it.each(["best", "good", "inaccuracy"] as const)(
    "does not hold an on-time %s grade",
    (grade) => {
      let state = gameReducer(initialGame(), {
        type: "NEW_GAME",
        kidColor: "w",
      });
      state = gameReducer(state, { type: "KID_MOVE", from: "e2", to: "e4" });
      state = gameReducer(state, {
        type: "GRADE_READY",
        ply: 1,
        turnToken: state.pendingGrades[1]?.turnToken ?? state.turnToken,
        analysis: { ...analysis(1, "e2e4"), grade },
      });

      expect(state.phase).toBe("opponentToMove");
    },
  );

  it("releases a held grade with KEEP_MOVE and preserves the turn token", () => {
    let held = gameReducer(initialGame(), { type: "NEW_GAME", kidColor: "w" });
    held = gameReducer(held, { type: "KID_MOVE", from: "e2", to: "e4" });
    held = gameReducer(held, {
      type: "GRADE_READY",
      ply: 1,
      turnToken: held.pendingGrades[1]?.turnToken ?? held.turnToken,
      analysis: { ...analysis(1, "e2e4"), grade: "mistake" },
    });
    const turnToken = held.turnToken;
    const released = gameReducer(held, { type: "KEEP_MOVE" });

    expect(held.phase).toBe("nudge");
    expect(released.phase).toBe("opponentToMove");
    expect(released.turnToken).toBe(turnToken);
    expect(released.history).toBe(held.history);
    expect(released.analyses).toBe(held.analyses);
    const setup = initialGame();
    expect(gameReducer(setup, { type: "KEEP_MOVE" })).toBe(setup);
  });

  it("rejects turn-changing actions while coaching and supports resign or replay", () => {
    let held = gameReducer(initialGame(), { type: "NEW_GAME", kidColor: "w" });
    held = gameReducer(held, { type: "KID_MOVE", from: "e2", to: "e4" });
    held = gameReducer(held, {
      type: "GRADE_READY",
      ply: 1,
      turnToken: held.pendingGrades[1]?.turnToken ?? held.turnToken,
      analysis: { ...analysis(1, "e2e4"), grade: "blunder" },
    });
    const rejected = [
      gameReducer(held, { type: "KID_MOVE", from: "d2", to: "d4" }),
      gameReducer(held, { type: "HINT", tier: 1 }),
      gameReducer(held, {
        type: "OPPONENT_MOVE",
        uci: "e7e5",
        turnToken: held.turnToken,
      }),
      gameReducer(held, {
        type: "GRADE_TIMEOUT",
        ply: 1,
        turnToken: held.turnToken,
      }),
      gameReducer(held, {
        type: "PRE_ANALYSIS_READY",
        fen: held.fen,
        lines: sampleLines,
      }),
    ];

    expect(rejected.every((next) => next === held)).toBe(true);
    expect(gameReducer(held, { type: "RESIGN" })).toMatchObject({
      phase: "over",
      result: { winner: "opponent", reason: "resign" },
    });
    expect(gameReducer(held, { type: "PLAY_AGAIN" })).toMatchObject({
      phase: "setup",
    });
  });

  it.each([
    [
      "a missing history entry",
      () => {
        const start = gameReducer(initialGame(), {
          type: "NEW_GAME",
          kidColor: "w",
        });
        return gameReducer(start, { type: "KID_MOVE", from: "e2", to: "e4" });
      },
      2,
      analysis(2, "d2d4"),
    ],
    [
      "an opponent ply",
      () => {
        let state = gameReducer(initialGame(), {
          type: "NEW_GAME",
          kidColor: "w",
        });
        state = gameReducer(state, {
          type: "KID_MOVE",
          from: "e2",
          to: "e4",
        });
        state = gameReducer(state, {
          type: "GRADE_TIMEOUT",
          ply: 1,
          turnToken: state.turnToken,
        });
        return gameReducer(state, {
          type: "OPPONENT_MOVE",
          uci: "e7e5",
          turnToken: state.turnToken,
        });
      },
      2,
      analysis(2, "e7e5"),
    ],
    [
      "a mismatched UCI",
      () => {
        const start = gameReducer(initialGame(), {
          type: "NEW_GAME",
          kidColor: "w",
        });
        return gameReducer(start, { type: "KID_MOVE", from: "e2", to: "e4" });
      },
      1,
      analysis(1, "e2e3"),
    ],
    [
      "a mismatched analysis ply",
      () => {
        const start = gameReducer(initialGame(), {
          type: "NEW_GAME",
          kidColor: "w",
        });
        return gameReducer(start, { type: "KID_MOVE", from: "e2", to: "e4" });
      },
      1,
      analysis(2, "e2e4"),
    ],
  ] as const)(
    "rejects GRADE_READY with %s by identity",
    (_name, createState, ply, grade) => {
      const state = createState();
      expect(
        gameReducer(state, {
          type: "GRADE_READY",
          ply,
          turnToken: state.turnToken,
          analysis: grade,
        }),
      ).toBe(state);
    },
  );

  it("tracks hint tiers, resets after the move, and stores the tier on its grade", () => {
    let state = gameReducer(initialGame(), {
      type: "NEW_GAME",
      kidColor: "w",
    });
    state = gameReducer(state, { type: "HINT", tier: 1 });
    state = gameReducer(state, { type: "HINT", tier: 2 });
    expect(state.hintTier).toBe(2);

    state = gameReducer(state, { type: "KID_MOVE", from: "e2", to: "e4" });
    expect(state.hintTier).toBe(0);
    state = gameReducer(state, {
      type: "GRADE_READY",
      ply: 1,
      turnToken: state.pendingGrades[1]?.turnToken ?? state.turnToken,
      analysis: analysis(1, "e2e4"),
    });
    expect(state.analyses[1]?.hintTier).toBe(2);
  });

  it("ignores hints outside the kid turn and rejects skipped tiers", () => {
    const start = gameReducer(initialGame(), {
      type: "NEW_GAME",
      kidColor: "w",
    });
    expect(gameReducer(start, { type: "HINT", tier: 2 })).toBe(start);

    const hinted = gameReducer(start, { type: "HINT", tier: 1 });
    expect(gameReducer(hinted, { type: "HINT", tier: 3 })).toBe(hinted);
    const moved = gameReducer(start, {
      type: "KID_MOVE",
      from: "e2",
      to: "e4",
    });
    expect(gameReducer(moved, { type: "HINT", tier: 1 })).toBe(moved);
  });

  it("releases the opponent at the matching timeout and ignores stale timeouts", () => {
    let state = gameReducer(initialGame(), {
      type: "NEW_GAME",
      kidColor: "w",
    });
    state = gameReducer(state, { type: "KID_MOVE", from: "e2", to: "e4" });
    expect(
      gameReducer(state, {
        type: "GRADE_TIMEOUT",
        ply: 1,
        turnToken: state.turnToken - 1,
      }),
    ).toBe(state);
    state = gameReducer(state, {
      type: "GRADE_TIMEOUT",
      ply: 1,
      turnToken: state.turnToken,
    });
    expect(state.phase).toBe("opponentToMove");
  });

  it("stores a delayed grade as late after the game has moved on", () => {
    let state = gameReducer(initialGame(), {
      type: "NEW_GAME",
      kidColor: "w",
    });
    state = gameReducer(state, { type: "KID_MOVE", from: "e2", to: "e4" });
    state = gameReducer(state, {
      type: "GRADE_TIMEOUT",
      ply: 1,
      turnToken: state.turnToken,
    });
    state = gameReducer(state, {
      type: "OPPONENT_MOVE",
      uci: "e7e5",
      turnToken: state.turnToken,
    });
    state = gameReducer(state, { type: "KID_MOVE", from: "g1", to: "f3" });
    state = gameReducer(state, {
      type: "GRADE_READY",
      ply: 1,
      turnToken: state.pendingGrades[1]?.turnToken ?? state.turnToken,
      analysis: analysis(1, "e2e4"),
    });

    expect(state.phase).toBe("grading");
    expect(state.analyses[1]).toMatchObject({ moveUci: "e2e4", late: true });
  });

  it("never holds a grade for a game-ending kid move", () => {
    let state = gameReducer(initialGame(), {
      type: "NEW_GAME",
      kidColor: "w",
      fen: "7k/5Q2/6K1/8/8/8/8/8 w - - 0 1",
    });
    state = gameReducer(state, { type: "KID_MOVE", from: "f7", to: "g7" });
    expect(state.phase).toBe("over");
    state = gameReducer(state, {
      type: "GRADE_READY",
      ply: 1,
      turnToken: state.pendingGrades[1]?.turnToken ?? state.turnToken,
      analysis: {
        ...analysis(1, "f7g7"),
        moveSan: "Qg7#",
        grade: "blunder",
      },
    });

    expect(state.phase).toBe("over");
    expect(state.history[0]?.ending).toBe("checkmate");
    expect(state.analyses[1]).toMatchObject({ grade: "blunder", late: true });
  });

  it("requires an explicit promotion choice and applies the selected knight", () => {
    const start = gameReducer(initialGame(), {
      type: "NEW_GAME",
      kidColor: "w",
      fen: "7k/4P3/8/8/8/8/8/K7 w - - 0 1",
    });
    expect(gameReducer(start, { type: "KID_MOVE", from: "e7", to: "e8" })).toBe(
      start,
    );

    const promoted = gameReducer(start, {
      type: "KID_MOVE",
      from: "e7",
      to: "e8",
      promotion: "n",
    });
    expect(promoted.history[0]).toMatchObject({ san: "e8=N", uci: "e7e8n" });
    expect(promoted.fen.startsWith("4N2k/8/")).toBe(true);
  });

  it.each(Object.entries(endings))(
    "detects %s from chess rules",
    (reason, fixture) => {
      const testFixture = fixture as {
        kidColor: "w" | "b";
        fen: string;
        moves: string[];
        winner: "kid" | "opponent" | "draw";
      };
      let state = gameReducer(initialGame(), {
        type: "NEW_GAME",
        kidColor: testFixture.kidColor,
        fen: testFixture.fen,
      });
      for (const uci of testFixture.moves) {
        if (state.phase === "grading") {
          state = gameReducer(state, {
            type: "GRADE_TIMEOUT",
            ply: state.history.length,
            turnToken: state.turnToken,
          });
        }
        const action =
          state.phase === "kidToMove"
            ? {
                type: "KID_MOVE" as const,
                from: uci.slice(0, 2),
                to: uci.slice(2, 4),
                ...(uci[4] ? { promotion: uci[4] } : {}),
              }
            : {
                type: "OPPONENT_MOVE" as const,
                uci,
                turnToken: state.turnToken,
              };
        state = gameReducer(state, action);
      }
      const expectedReason = reason === "fifty-move" ? "fifty-move" : reason;
      expect(state.phase).toBe("over");
      expect(state.result).toMatchObject({
        reason: expectedReason,
        winner: testFixture.winner,
      });
      expect(state.history.at(-1)?.ending).toBe(reason);
      for (const move of state.history.slice(0, -1)) {
        expect(move).not.toHaveProperty("ending");
      }
    },
  );

  it("records checkmate by a Black kid as the kid's move ending", () => {
    const fixture = endings.checkmate as {
      fen: string;
      moves: string[];
    };
    let state = gameReducer(initialGame(), {
      type: "NEW_GAME",
      kidColor: "b",
      fen: fixture.fen,
    });
    for (const uci of fixture.moves) {
      if (state.phase === "grading") {
        state = gameReducer(state, {
          type: "GRADE_TIMEOUT",
          ply: state.history.length,
          turnToken: state.turnToken,
        });
      }
      const action =
        state.phase === "kidToMove"
          ? {
              type: "KID_MOVE" as const,
              from: uci.slice(0, 2),
              to: uci.slice(2, 4),
              ...(uci[4] ? { promotion: uci[4] } : {}),
            }
          : {
              type: "OPPONENT_MOVE" as const,
              uci,
              turnToken: state.turnToken,
            };
      state = gameReducer(state, action);
    }

    expect(state.history.at(-1)).toMatchObject({
      color: "b",
      ending: "checkmate",
    });
    expect(state.result).toEqual({ winner: "kid", reason: "checkmate" });
  });

  it("rejects stale engine replies after a new game starts", () => {
    const playing = gameReducer(initialGame(), {
      type: "NEW_GAME",
      kidColor: "w",
    });
    const awaiting = gameReducer(playing, {
      type: "KID_MOVE",
      from: "e2",
      to: "e4",
    });
    const nextGame = gameReducer(awaiting, { type: "PLAY_AGAIN" });

    expect(
      gameReducer(nextGame, {
        type: "OPPONENT_MOVE",
        uci: "e7e5",
        turnToken: awaiting.turnToken,
      }),
    ).toBe(nextGame);
  });

  it("resigns a live game as a loss", () => {
    const playing = gameReducer(initialGame(), {
      type: "NEW_GAME",
      kidColor: "w",
    });
    const resigned = gameReducer(playing, { type: "RESIGN" });
    expect(resigned.phase).toBe("over");
    expect(resigned.result).toEqual({ winner: "opponent", reason: "resign" });
  });

  it.each(["grading", "opponentToMove"] as const)(
    "resigning from %s preserves history without a move ending",
    (phase) => {
      let state = gameReducer(initialGame(), {
        type: "NEW_GAME",
        kidColor: "w",
      });
      state = gameReducer(state, { type: "KID_MOVE", from: "e2", to: "e4" });
      if (phase === "opponentToMove") {
        state = gameReducer(state, {
          type: "GRADE_READY",
          ply: 1,
          turnToken: state.pendingGrades[1]?.turnToken ?? state.turnToken,
          analysis: analysis(1, "e2e4"),
        });
      }
      const history = state.history;
      const resigned = gameReducer(state, { type: "RESIGN" });

      expect(resigned.history).toBe(history);
      expect(resigned.history.every((move) => !("ending" in move))).toBe(true);
      expect(resigned.result).toEqual({ winner: "opponent", reason: "resign" });
    },
  );

  it("accepts a grade at most once for both on-time and late replies", () => {
    let state = gameReducer(initialGame(), {
      type: "NEW_GAME",
      kidColor: "w",
    });
    state = gameReducer(state, { type: "KID_MOVE", from: "e2", to: "e4" });
    state = gameReducer(state, {
      type: "GRADE_READY",
      ply: 1,
      turnToken: state.pendingGrades[1]?.turnToken ?? state.turnToken,
      analysis: analysis(1, "e2e4"),
    });
    state = gameReducer(state, { type: "RESIGN" });
    const resigned = state;
    const blunder = { ...analysis(1, "e2e4"), grade: "blunder" as const };

    expect(
      gameReducer(state, {
        type: "GRADE_READY",
        ply: 1,
        turnToken: state.turnToken,
        analysis: blunder,
      }),
    ).toBe(resigned);
    expect(state.analyses[1]?.grade).toBe("best");
    expect(state.analyses[1]).not.toHaveProperty("late");

    state = gameReducer(initialGame(), { type: "NEW_GAME", kidColor: "w" });
    state = gameReducer(state, { type: "KID_MOVE", from: "e2", to: "e4" });
    state = gameReducer(state, {
      type: "GRADE_TIMEOUT",
      ply: 1,
      turnToken: state.turnToken,
    });
    state = gameReducer(state, {
      type: "OPPONENT_MOVE",
      uci: "e7e5",
      turnToken: state.turnToken,
    });
    state = gameReducer(state, { type: "KID_MOVE", from: "g1", to: "f3" });
    state = gameReducer(state, {
      type: "GRADE_READY",
      ply: 1,
      turnToken: state.pendingGrades[1]?.turnToken ?? state.turnToken,
      analysis: analysis(1, "e2e4"),
    });
    const late = state;

    expect(
      gameReducer(state, {
        type: "GRADE_READY",
        ply: 1,
        turnToken: state.pendingGrades[1]?.turnToken ?? state.turnToken,
        analysis: blunder,
      }),
    ).toBe(late);
    expect(state.analyses[1]).toMatchObject({ grade: "best", late: true });
  });

  it("clears stored analyses when starting or replaying a game", () => {
    let state = gameReducer(initialGame(), { type: "NEW_GAME", kidColor: "w" });
    state = gameReducer(state, { type: "KID_MOVE", from: "e2", to: "e4" });
    state = gameReducer(state, {
      type: "GRADE_READY",
      ply: 1,
      turnToken: state.pendingGrades[1]?.turnToken ?? state.turnToken,
      analysis: analysis(1, "e2e4"),
    });

    expect(
      gameReducer(state, { type: "NEW_GAME", kidColor: "w" }).analyses,
    ).toEqual({});
    expect(gameReducer(state, { type: "PLAY_AGAIN" }).analyses).toEqual({});
  });

  it("chooses either color from the supplied random source", () => {
    expect(
      gameReducer(initialGame(), {
        type: "NEW_GAME",
        kidColor: "random",
        rng: () => 0.1,
      }).kidColor,
    ).toBe("w");
    expect(
      gameReducer(initialGame(), {
        type: "NEW_GAME",
        kidColor: "random",
        rng: () => 0.9,
      }).kidColor,
    ).toBe("b");
  });

  it("uses a supplied FEN and validates it before starting", () => {
    const whiteTurn = gameReducer(initialGame(), {
      type: "NEW_GAME",
      kidColor: "w",
      fen: standardFen,
    });
    const blackTurn = gameReducer(initialGame(), {
      type: "NEW_GAME",
      kidColor: "b",
      fen: standardFen.replace(" w ", " b "),
    });
    const invalid = gameReducer(initialGame(), {
      type: "NEW_GAME",
      kidColor: "w",
      fen: "not a fen",
    });

    expect(whiteTurn.fen).toBe(standardFen);
    expect(whiteTurn.phase).toBe("kidToMove");
    expect(blackTurn.phase).toBe("kidToMove");
    expect(invalid.phase).toBe("setup");
  });
});
