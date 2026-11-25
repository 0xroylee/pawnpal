// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EngineLine } from "../engine/EngineClient.js";
import { samplingPolicies } from "../engine/levels.js";
import { gameReducer, initialGame } from "./reducer.js";
import { useOpponent, type EngineLike } from "./useOpponent.js";

function opponentTurn() {
  return gameReducer(initialGame(), {
    type: "NEW_GAME",
    kidColor: "b",
    level: 7,
  });
}

const lines: EngineLine[] = [
  { uci: "e2e4", san: "e4", cp: 20, depth: 4, pv: ["e2e4"] },
];

describe("useOpponent", () => {
  afterEach(() => vi.useRealTimers());

  it("plays one move after the minimum thinking delay and configures once", async () => {
    vi.useFakeTimers();
    const dispatch = vi.fn();
    const engine: EngineLike = {
      newGame: vi.fn().mockResolvedValue(undefined),
      setOptions: vi.fn().mockResolvedValue(undefined),
      analyze: vi.fn().mockResolvedValue(lines),
      bestMove: vi.fn(),
    };
    const rng = vi.fn().mockReturnValueOnce(0).mockReturnValue(0.5);

    renderHook(() => useOpponent(opponentTurn(), dispatch, { engine, rng }));
    await act(async () => Promise.resolve());
    expect(engine.setOptions).toHaveBeenCalledTimes(1);
    expect(engine.setOptions).toHaveBeenCalledWith({
      "Skill Level": 20,
      UCI_LimitStrength: false,
    });
    expect(engine.analyze).toHaveBeenCalledWith(
      opponentTurn().fen,
      expect.objectContaining({
        depth: samplingPolicies[7].depth,
        multiPv: samplingPolicies[7].multiPv,
      }),
    );

    await act(async () => vi.advanceTimersByTimeAsync(399));
    expect(dispatch).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(dispatch).toHaveBeenCalledOnce();
    expect(dispatch).toHaveBeenCalledWith({
      type: "OPPONENT_MOVE",
      uci: "e2e4",
      turnToken: opponentTurn().turnToken,
    });
  });

  it("does not dispatch a delayed reply after Play again", async () => {
    vi.useFakeTimers();
    let resolveMove!: (move: EngineLine[]) => void;
    const pendingMove = new Promise<EngineLine[]>((resolve) => {
      resolveMove = resolve;
    });
    const dispatch = vi.fn();
    const engine: EngineLike = {
      newGame: vi.fn().mockResolvedValue(undefined),
      setOptions: vi.fn().mockResolvedValue(undefined),
      analyze: vi.fn().mockReturnValue(pendingMove),
      bestMove: vi.fn(),
    };
    const { rerender } = renderHook(
      ({ state }) => useOpponent(state, dispatch, { engine, rng: () => 0 }),
      { initialProps: { state: opponentTurn() } },
    );

    await act(async () => Promise.resolve());
    const reset = gameReducer(opponentTurn(), { type: "PLAY_AGAIN" });
    rerender({ state: reset });
    await act(async () => {
      resolveMove(lines);
      await Promise.resolve();
    });
    await act(async () => vi.advanceTimersByTimeAsync(1000));

    expect(dispatch).not.toHaveBeenCalled();
  });
});
