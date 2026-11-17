// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { gameReducer, initialGame } from "./reducer.js";
import { useOpponent, type EngineLike } from "./useOpponent.js";

function opponentTurn() {
  return gameReducer(initialGame(), { type: "NEW_GAME", kidColor: "b" });
}

describe("useOpponent", () => {
  afterEach(() => vi.useRealTimers());

  it("plays one move after the minimum thinking delay and configures once", async () => {
    vi.useFakeTimers();
    const dispatch = vi.fn();
    const engine: EngineLike = {
      newGame: vi.fn().mockResolvedValue(undefined),
      setOptions: vi.fn().mockResolvedValue(undefined),
      bestMove: vi.fn().mockResolvedValue("e7e5"),
    };

    renderHook(() =>
      useOpponent(opponentTurn(), dispatch, { engine, rng: () => 0 }),
    );
    await act(async () => Promise.resolve());
    expect(engine.setOptions).toHaveBeenCalledTimes(1);
    expect(engine.bestMove).toHaveBeenCalledWith(opponentTurn().fen, {
      depth: 8,
    });

    await act(async () => vi.advanceTimersByTimeAsync(399));
    expect(dispatch).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(dispatch).toHaveBeenCalledOnce();
    expect(dispatch).toHaveBeenCalledWith({
      type: "OPPONENT_MOVE",
      uci: "e7e5",
      turnToken: opponentTurn().turnToken,
    });
  });

  it("does not dispatch a delayed reply after Play again", async () => {
    vi.useFakeTimers();
    let resolveMove!: (move: string) => void;
    const pendingMove = new Promise<string>((resolve) => {
      resolveMove = resolve;
    });
    const dispatch = vi.fn();
    const engine: EngineLike = {
      newGame: vi.fn().mockResolvedValue(undefined),
      setOptions: vi.fn().mockResolvedValue(undefined),
      bestMove: vi.fn().mockReturnValue(pendingMove),
    };
    const { rerender } = renderHook(
      ({ state }) => useOpponent(state, dispatch, { engine, rng: () => 0 }),
      { initialProps: { state: opponentTurn() } },
    );

    await act(async () => Promise.resolve());
    const reset = gameReducer(opponentTurn(), { type: "PLAY_AGAIN" });
    rerender({ state: reset });
    await act(async () => {
      resolveMove("e7e5");
      await Promise.resolve();
    });
    await act(async () => vi.advanceTimersByTimeAsync(1000));

    expect(dispatch).not.toHaveBeenCalled();
  });
});
