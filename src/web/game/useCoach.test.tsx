// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { StrictMode, type PropsWithChildren } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { finalizeFact, type MoveAnalysis } from "../../shared/coach/types.js";
import { gameReducer, initialGame, type GameState } from "./reducer.js";
import { useCoach } from "./useCoach.js";

const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const bestLine = {
  uci: "d2d4",
  san: "d4",
  cp: 20,
  pv: ["d2d4"],
  depth: 8,
};

function startGame() {
  return gameReducer(initialGame(), {
    type: "NEW_GAME",
    kidColor: "w",
    fen,
  });
}

function analysis(overrides: Partial<MoveAnalysis> = {}): MoveAnalysis {
  return {
    ply: 1,
    fenBefore: fen,
    moveUci: "e2e4",
    moveSan: "e4",
    linesBefore: [bestLine],
    linesAfter: [{ ...bestLine, uci: "e7e5", san: "e5" }],
    winBefore: 55,
    winAfter: 55,
    drop: 0,
    grade: "mistake",
    isOnlyMove: false,
    facts: [],
    ...overrides,
  };
}

describe("useCoach", () => {
  afterEach(() => vi.useRealTimers());

  it("shows a thinking state until matching pre-analysis lines arrive", async () => {
    const started = startGame();
    const hinted = gameReducer(started, { type: "HINT", tier: 1 });
    const { result, rerender } = renderHook(({ state }) => useCoach(state), {
      initialProps: { state: hinted },
    });

    await waitFor(() =>
      expect(result.current.coach.message).toMatchObject({
        mode: "hint1",
        pip: "thinking",
        text: "Pip is thinking",
      }),
    );

    const ready = gameReducer(started, {
      type: "PRE_ANALYSIS_READY",
      fen: started.fen,
      lines: [bestLine],
    });
    const readyHint = gameReducer(ready, { type: "HINT", tier: 1 });
    rerender({ state: readyHint });

    await waitFor(() =>
      expect(result.current.coach.annotations.hint).toEqual(["d2"]),
    );
    expect(result.current.coach.message?.pip).toBe("encouraging");
  });

  it("clears hint text and annotations after the kid moves", async () => {
    const started = startGame();
    const ready = gameReducer(started, {
      type: "PRE_ANALYSIS_READY",
      fen: started.fen,
      lines: [{ ...bestLine, uci: "e2e4", san: "e4" }],
    });
    const hinted = gameReducer(ready, { type: "HINT", tier: 1 });
    const { result, rerender } = renderHook(({ state }) => useCoach(state), {
      initialProps: { state: hinted },
    });
    await waitFor(() =>
      expect(result.current.coach.annotations.hint).toEqual(["e2"]),
    );

    const moved = gameReducer(hinted, {
      type: "KID_MOVE",
      from: "e2",
      to: "e4",
    });
    rerender({ state: moved });

    await waitFor(() => expect(result.current.coach.message).toBeUndefined());
    expect(result.current.coach.annotations).toEqual({
      danger: [],
      hint: [],
      arrows: [],
    });
  });

  it("turns a newly stored mistake grade into one coach message", async () => {
    const started = startGame();
    const moved = gameReducer(started, {
      type: "KID_MOVE",
      from: "e2",
      to: "e4",
    });
    const fact = finalizeFact({
      kind: "hanging-piece",
      subject: { type: "p", color: "w", square: "e4" },
      attacker: { type: "q", color: "b", square: "d8" },
      threatMoveSan: "Qh4+",
      threatMoveUci: "d8h4",
    });
    const graded = {
      ...moved,
      analyses: { 1: analysis({ facts: [fact] }) },
    };
    const { result, rerender } = renderHook(({ state }) => useCoach(state), {
      initialProps: { state: moved },
    });

    rerender({ state: graded });
    await waitFor(() =>
      expect(result.current.coach.message).toMatchObject({
        mode: "explain",
        kind: "hanging-piece",
        grade: "oops",
      }),
    );
    expect(result.current.coach.annotations.danger).toEqual(["e4"]);
    expect(result.current.coach.annotations.arrows).toEqual([]);
  });

  it("rotates variants across successive grades under StrictMode", async () => {
    const fact = finalizeFact({
      kind: "hanging-piece",
      subject: { type: "n", color: "w", square: "f3" },
      attacker: { type: "r", color: "b", square: "f8" },
      threatMoveSan: "Rxf3",
      threatMoveUci: "f8f3",
    });
    const analysisAt1 = analysis({ ply: 1, facts: [fact] });
    const analysisAt3 = analysis({ ply: 3, facts: [fact] });
    const analysisAt5 = analysis({ ply: 5, facts: [fact] });
    const moves = [
      { san: "e4", uci: "e2e4", from: "e2", to: "e4", color: "w" as const },
      { san: "e5", uci: "e7e5", from: "e7", to: "e5", color: "b" as const },
      { san: "Nf3", uci: "g1f3", from: "g1", to: "f3", color: "w" as const },
      { san: "Nc6", uci: "b8c6", from: "b8", to: "c6", color: "b" as const },
      { san: "Bb5", uci: "f1b5", from: "f1", to: "b5", color: "w" as const },
    ];
    const stateAt = (
      ply: number,
      analyses: Record<number, MoveAnalysis>,
    ): GameState => ({
      ...startGame(),
      phase: "kidToMove",
      history: moves.slice(0, ply),
      turnToken: ply + 1,
      analyses,
    });
    const rng = vi.fn(() => 0);
    const wrapper = ({ children }: PropsWithChildren) => (
      <StrictMode>{children}</StrictMode>
    );
    const { result, rerender } = renderHook(
      ({ state }) => useCoach(state, rng),
      {
        initialProps: { state: stateAt(1, { 1: analysisAt1 }) },
        wrapper,
      },
    );
    await waitFor(() => expect(result.current.coach.message).toBeDefined());
    const first = result.current.coach.message!.text;

    rerender({ state: stateAt(3, { 1: analysisAt1, 3: analysisAt3 }) });
    await waitFor(() =>
      expect(result.current.coach.message?.text).not.toBe(first),
    );
    const second = result.current.coach.message!.text;

    rerender({
      state: stateAt(5, {
        1: analysisAt1,
        3: analysisAt3,
        5: analysisAt5,
      }),
    });
    await waitFor(() =>
      expect(result.current.coach.message?.text).not.toBe(second),
    );
    expect(result.current.coach.message?.text).toBe(first);
    expect(rng).toHaveBeenCalled();
  });

  it("expires only praise after two and a half seconds", async () => {
    vi.useFakeTimers();
    const started = startGame();
    const state = {
      ...started,
      analyses: {
        5: analysis({ ply: 5, grade: "best", isOnlyMove: true }),
      },
    };
    const { result } = renderHook(() => useCoach(state));

    await act(async () => Promise.resolve());
    expect(result.current.coach.message?.mode).toBe("praise");
    act(() => vi.advanceTimersByTime(2499));
    expect(result.current.coach.message?.mode).toBe("praise");
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.coach.message).toBeUndefined();
  });
});
