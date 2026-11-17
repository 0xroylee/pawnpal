// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import endings from "../../../tests/fixtures/endings.json";
import type { EngineLine } from "../../shared/coach/types.ts";
import {
  createAnalysisPipeline,
  type AnalystLike,
} from "../coach/analysisPipeline.js";
import { defaultGradeConfig } from "../coach/gradeConfig.js";
import {
  gameReducer,
  initialGame,
  type GameAction,
  type GameState,
} from "./reducer.js";
import { useGrading, type GradingPipeline } from "./useGrading.js";

const lines: EngineLine[] = [
  { uci: "d2d4", san: "d4", cp: 20, pv: ["d2d4"], depth: 9 },
  { uci: "g1f3", san: "Nf3", cp: 10, pv: ["g1f3"], depth: 9 },
];

const analyst: AnalystLike = {
  analyze: vi.fn(),
  stop: vi.fn().mockResolvedValue(undefined),
  newGame: vi.fn().mockResolvedValue(undefined),
};

function gradingState() {
  const start = gameReducer(initialGame(), {
    type: "NEW_GAME",
    kidColor: "w",
  });
  return gameReducer(start, { type: "KID_MOVE", from: "e2", to: "e4" });
}

function playThrough(
  fen: string,
  kidColor: "w" | "b",
  moves: string[],
): GameState {
  let state = gameReducer(initialGame(), {
    type: "NEW_GAME",
    kidColor,
    fen,
  });
  for (const uci of moves) {
    if (state.phase === "grading") {
      state = gameReducer(state, {
        type: "GRADE_TIMEOUT",
        ply: state.history.length,
        turnToken: state.turnToken,
      });
    }
    const action: GameAction =
      state.phase === "kidToMove"
        ? {
            type: "KID_MOVE",
            from: uci.slice(0, 2),
            to: uci.slice(2, 4),
            ...(uci[4] ? { promotion: uci[4] } : {}),
          }
        : {
            type: "OPPONENT_MOVE",
            uci,
            turnToken: state.turnToken,
          };
    state = gameReducer(state, action);
  }
  return state;
}

function fakePipeline(): GradingPipeline {
  return {
    preAnalyze: vi.fn().mockResolvedValue(lines),
    analyzeKidMove: vi.fn().mockResolvedValue({
      linesBefore: lines,
      linesAfter: lines,
    }),
    reset: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn(),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}

describe("useGrading", () => {
  afterEach(() => vi.useRealTimers());

  it("pre-analyzes a kid turn and dispatches its matching FEN", async () => {
    const dispatch = vi.fn();
    const pipeline = fakePipeline();
    const state = gameReducer(initialGame(), {
      type: "NEW_GAME",
      kidColor: "w",
    });
    renderHook(() =>
      useGrading(state, dispatch, { analyst, pipeline: () => pipeline }),
    );

    await act(async () => Promise.resolve());
    expect(pipeline.preAnalyze).toHaveBeenCalledWith(state.fen);
    expect(dispatch).toHaveBeenCalledWith({
      type: "PRE_ANALYSIS_READY",
      fen: state.fen,
      lines,
    });
  });

  it("releases the opponent at 1500 ms, not 1499, and accepts the later grade", async () => {
    vi.useFakeTimers();
    let resolveAnalysis!: (value: {
      linesBefore: EngineLine[];
      linesAfter: EngineLine[];
    }) => void;
    const pending = new Promise<{
      linesBefore: EngineLine[];
      linesAfter: EngineLine[];
    }>((resolve) => {
      resolveAnalysis = resolve;
    });
    const dispatch = vi.fn();
    const pipeline = fakePipeline();
    vi.mocked(pipeline.analyzeKidMove).mockReturnValue(pending);
    const state = gradingState();
    const { rerender } = renderHook(
      ({ currentState }) =>
        useGrading(currentState, dispatch, {
          analyst,
          pipeline: () => pipeline,
        }),
      { initialProps: { currentState: state } },
    );

    await act(async () => vi.advanceTimersByTimeAsync(1499));
    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "GRADE_TIMEOUT" }),
    );
    await act(async () => vi.advanceTimersByTimeAsync(1));
    const timeout = {
      type: "GRADE_TIMEOUT",
      ply: 1,
      turnToken: state.turnToken,
    } as const;
    expect(dispatch).toHaveBeenCalledWith(timeout);

    const released = gameReducer(state, timeout);
    const replied = gameReducer(released, {
      type: "OPPONENT_MOVE",
      uci: "e7e5",
      turnToken: released.turnToken,
    });
    rerender({ currentState: replied });
    await act(async () => {
      resolveAnalysis({ linesBefore: lines, linesAfter: lines });
      await pending;
    });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "GRADE_READY", ply: 1 }),
    );
  });

  it("does not interrupt fallback analysis when the next kid turn starts", async () => {
    vi.useFakeTimers();
    const fallback = deferred<EngineLine[]>();
    const post = deferred<EngineLine[]>();
    const moveState = gradingState();
    const dispatch = vi.fn();
    const liveAnalyst: AnalystLike = {
      analyze: vi
        .fn()
        .mockReturnValueOnce(fallback.promise)
        .mockReturnValueOnce(post.promise)
        .mockResolvedValueOnce(lines),
      stop: vi.fn().mockResolvedValue(undefined),
      newGame: vi.fn().mockResolvedValue(undefined),
    };
    const pipeline = createAnalysisPipeline(liveAnalyst);
    const { rerender } = renderHook(
      ({ currentState }) =>
        useGrading(currentState, dispatch, {
          analyst: liveAnalyst,
          pipeline: () => pipeline,
        }),
      { initialProps: { currentState: moveState } },
    );

    await act(async () => Promise.resolve());
    expect(liveAnalyst.analyze).toHaveBeenCalledOnce();
    expect(liveAnalyst.analyze).toHaveBeenNthCalledWith(
      1,
      expect.any(String),
      defaultGradeConfig.analysis.fallback,
    );

    await act(async () => vi.advanceTimersByTimeAsync(1500));
    const timedOut = gameReducer(moveState, {
      type: "GRADE_TIMEOUT",
      ply: 1,
      turnToken: moveState.turnToken,
    });
    const nextKidTurn = gameReducer(timedOut, {
      type: "OPPONENT_MOVE",
      uci: "e7e5",
      turnToken: timedOut.turnToken,
    });
    rerender({ currentState: nextKidTurn });
    await act(async () => Promise.resolve());

    expect(liveAnalyst.analyze).toHaveBeenCalledOnce();
    expect(liveAnalyst.stop).not.toHaveBeenCalled();

    await act(async () => {
      fallback.resolve(lines.map((entry) => ({ ...entry, depth: 8 })));
      await fallback.promise;
      await Promise.resolve();
    });
    expect(liveAnalyst.analyze).toHaveBeenCalledTimes(2);
    expect(liveAnalyst.analyze).toHaveBeenNthCalledWith(
      2,
      moveState.fen,
      defaultGradeConfig.analysis.postAnalyze,
    );
    expect(liveAnalyst.stop).not.toHaveBeenCalled();

    await act(async () => {
      post.resolve(lines.map((entry) => ({ ...entry, depth: 12 })));
      await post.promise;
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(liveAnalyst.analyze).toHaveBeenCalledTimes(3);
    expect(liveAnalyst.analyze).toHaveBeenNthCalledWith(
      3,
      nextKidTurn.fen,
      defaultGradeConfig.analysis.preAnalyze,
    );
    expect(liveAnalyst.stop).not.toHaveBeenCalled();
    const gradeReady = dispatch.mock.calls.find(
      ([action]) => action.type === "GRADE_READY",
    )?.[0];
    expect(gradeReady?.analysis.linesBefore[0].depth).toBe(8);
  });

  it("does not dispatch a grade after the hook is cleaned up", async () => {
    let resolveAnalysis!: (value: {
      linesBefore: EngineLine[];
      linesAfter: EngineLine[];
    }) => void;
    const pending = new Promise<{
      linesBefore: EngineLine[];
      linesAfter: EngineLine[];
    }>((resolve) => {
      resolveAnalysis = resolve;
    });
    const dispatch = vi.fn();
    const pipeline = fakePipeline();
    vi.mocked(pipeline.analyzeKidMove).mockReturnValue(pending);
    const { unmount } = renderHook(() =>
      useGrading(gradingState(), dispatch, {
        analyst,
        pipeline: () => pipeline,
      }),
    );

    unmount();
    await act(async () => {
      resolveAnalysis({ linesBefore: lines, linesAfter: lines });
      await pending;
    });

    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "GRADE_READY" }),
    );
  });

  it("times out immediately when the analyst is unavailable", () => {
    const dispatch = vi.fn();
    const state = gradingState();
    renderHook(() => useGrading(state, dispatch, { analyst: null }));
    expect(dispatch).toHaveBeenCalledWith({
      type: "GRADE_TIMEOUT",
      ply: state.history.length,
      turnToken: state.turnToken,
    });
  });

  it("grades a kid checkmate from its recorded ending without a timer", async () => {
    vi.useFakeTimers();
    const dispatch = vi.fn();
    const pipeline = fakePipeline();
    const fixture = endings.checkmate as { fen: string; moves: string[] };
    const state = playThrough(fixture.fen, "b", fixture.moves);
    const { unmount } = renderHook(() =>
      useGrading(state, dispatch, { analyst, pipeline: () => pipeline }),
    );

    await act(async () => Promise.resolve());
    expect(pipeline.analyzeKidMove).toHaveBeenCalledWith(
      expect.any(String),
      state.fen,
      { terminal: true },
    );
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "GRADE_READY",
        analysis: expect.objectContaining({ winAfter: 100 }),
      }),
    );
    await act(async () => vi.advanceTimersByTimeAsync(1500));
    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "GRADE_TIMEOUT" }),
    );
    unmount();
  });

  it("grades a kid threefold draw as 50 from its recorded ending", async () => {
    const dispatch = vi.fn();
    const pipeline = fakePipeline();
    const fixture = endings.threefold as { fen: string; moves: string[] };
    const state = playThrough(fixture.fen, "b", fixture.moves);
    renderHook(() =>
      useGrading(state, dispatch, { analyst, pipeline: () => pipeline }),
    );

    await act(async () => Promise.resolve());
    expect(pipeline.analyzeKidMove).toHaveBeenCalledWith(
      expect.any(String),
      state.fen,
      { terminal: true },
    );
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "GRADE_READY",
        analysis: expect.objectContaining({ winAfter: 50 }),
      }),
    );
  });

  it("does not re-grade a kid move when resigning while the opponent thinks", async () => {
    const dispatch = vi.fn();
    const pipeline = fakePipeline();
    const started = gameReducer(initialGame(), {
      type: "NEW_GAME",
      kidColor: "w",
    });
    const { rerender } = renderHook(
      ({ currentState }) =>
        useGrading(currentState, dispatch, {
          analyst,
          pipeline: () => pipeline,
        }),
      { initialProps: { currentState: started } },
    );

    const moved = gameReducer(started, {
      type: "KID_MOVE",
      from: "e2",
      to: "e4",
    });
    rerender({ currentState: moved });
    await act(async () => Promise.resolve());
    const gradeReady = dispatch.mock.calls
      .map(([action]) => action as GameAction)
      .find(
        (action): action is Extract<GameAction, { type: "GRADE_READY" }> =>
          action.type === "GRADE_READY",
      );
    expect(gradeReady).toBeDefined();
    const graded = gameReducer(moved, gradeReady!);
    rerender({ currentState: graded });
    const resigned = gameReducer(graded, { type: "RESIGN" });
    rerender({ currentState: resigned });
    await act(async () => Promise.resolve());

    expect(pipeline.analyzeKidMove).toHaveBeenCalledOnce();
    expect(
      dispatch.mock.calls.filter(([action]) => action.type === "GRADE_READY"),
    ).toHaveLength(1);
  });

  it("drops an in-flight grade and timer when the kid resigns", async () => {
    vi.useFakeTimers();
    const pending = deferred<{
      linesBefore: EngineLine[];
      linesAfter: EngineLine[];
    }>();
    const dispatch = vi.fn();
    const pipeline = fakePipeline();
    vi.mocked(pipeline.analyzeKidMove).mockReturnValue(pending.promise);
    const state = gradingState();
    const { rerender } = renderHook(
      ({ currentState }) =>
        useGrading(currentState, dispatch, {
          analyst,
          pipeline: () => pipeline,
        }),
      { initialProps: { currentState: state } },
    );
    const resigned = gameReducer(state, { type: "RESIGN" });
    rerender({ currentState: resigned });

    await act(async () => {
      pending.resolve({ linesBefore: lines, linesAfter: lines });
      await pending.promise;
    });
    await act(async () => vi.advanceTimersByTimeAsync(1500));

    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "GRADE_READY" }),
    );
    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "GRADE_TIMEOUT" }),
    );
  });

  it("does not analyze the previous move when the kid resigns on their turn", async () => {
    const dispatch = vi.fn();
    const pipeline = fakePipeline();
    const started = gameReducer(initialGame(), {
      type: "NEW_GAME",
      kidColor: "b",
    });
    const opponentMoved = gameReducer(started, {
      type: "OPPONENT_MOVE",
      uci: "e2e4",
      turnToken: started.turnToken,
    });
    const resigned = gameReducer(opponentMoved, { type: "RESIGN" });
    renderHook(() =>
      useGrading(resigned, dispatch, { analyst, pipeline: () => pipeline }),
    );

    await act(async () => Promise.resolve());
    expect(pipeline.analyzeKidMove).not.toHaveBeenCalled();
  });

  it("drops an in-flight grade and resets after play again", async () => {
    const pending = deferred<{
      linesBefore: EngineLine[];
      linesAfter: EngineLine[];
    }>();
    const dispatch = vi.fn();
    const pipeline = fakePipeline();
    vi.mocked(pipeline.analyzeKidMove).mockReturnValue(pending.promise);
    const state = gradingState();
    const { rerender } = renderHook(
      ({ currentState }) =>
        useGrading(currentState, dispatch, {
          analyst,
          pipeline: () => pipeline,
        }),
      { initialProps: { currentState: state } },
    );
    const nextGame = gameReducer(state, { type: "PLAY_AGAIN" });
    rerender({ currentState: nextGame });

    await act(async () => {
      pending.resolve({ linesBefore: lines, linesAfter: lines });
      await pending.promise;
    });

    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "GRADE_READY" }),
    );
    expect(pipeline.reset).toHaveBeenCalledOnce();
  });

  it("resets the analysis pipeline during setup and disposes it on unmount", () => {
    const pipeline = fakePipeline();
    const state = initialGame();
    const { unmount } = renderHook(() =>
      useGrading(state, vi.fn(), {
        analyst,
        pipeline: () => pipeline,
      }),
    );
    expect(pipeline.reset).toHaveBeenCalledOnce();
    unmount();
    expect(pipeline.dispose).toHaveBeenCalledOnce();
  });
});
