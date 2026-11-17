import endings from "../../../tests/fixtures/endings.json";
import { describe, expect, it } from "vitest";
import { gameReducer, initialGame } from "./reducer.js";

const standardFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

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

    expect(moved.phase).toBe("opponentToMove");
    expect(moved.history[0]).toMatchObject({
      san: "e4",
      uci: "e2e4",
      from: "e2",
      to: "e4",
    });
    expect(
      gameReducer(playing, { type: "KID_MOVE", from: "e2", to: "e5" }),
    ).toBe(playing);
    expect(
      gameReducer(playing, { type: "KID_MOVE", from: "z9", to: "e5" }),
    ).toBe(playing);
    expect(gameReducer(moved, { type: "KID_MOVE", from: "d2", to: "d4" })).toBe(
      moved,
    );
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
    },
  );

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
