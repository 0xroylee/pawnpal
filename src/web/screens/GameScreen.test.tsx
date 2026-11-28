// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { finalizeFact, type MoveAnalysis } from "../../shared/coach/types.js";
import { gameReducer, initialGame } from "../game/reducer.js";
import { GameScreen } from "./GameScreen.js";

afterEach(cleanup);

describe("GameScreen", () => {
  it("uses a neutral computer opponent and icon-based game controls", () => {
    const state = gameReducer(initialGame(), {
      type: "NEW_GAME",
      kidColor: "w",
    });
    const { container, rerender } = render(
      <GameScreen
        state={state}
        dispatch={vi.fn()}
        muted={false}
        onToggleSound={vi.fn()}
      />,
    );
    const home = screen.getByRole("button", { name: "Home" });
    const giveUp = screen.getByRole("button", {
      name: /^Give up$/,
    });
    const sound = screen.getByRole("button", { name: "Mute sounds" });

    for (const place of ["top", "board"]) {
      const opponent = container.querySelector(
        `.pp-game__opponent--${place}`,
      ) as HTMLElement;
      expect(within(opponent).getByText("Computer")).toBeTruthy();
      expect(
        opponent.querySelector(".pp-avatar svg.lucide-bot"),
      ).not.toBeNull();
    }
    expect(
      container.querySelector(".pp-game__topbar .pp-game__opponent--top"),
    ).not.toBeNull();
    expect(home.className).toContain("pp-btn--secondary");
    expect(home.className).toContain("pp-btn--sm");
    expect(home.className).toContain("pp-game__home");
    expect(giveUp.className).toContain("pp-btn--ghost");
    expect(
      home.querySelector("svg.lucide-house[aria-hidden='true']"),
    ).not.toBeNull();
    expect(
      giveUp.querySelector("svg.lucide-flag[aria-hidden='true']"),
    ).not.toBeNull();
    expect(sound.className).toContain("pp-iconbtn");
    expect(
      sound.querySelector("svg.lucide-volume-2[aria-hidden='true']"),
    ).not.toBeNull();
    expect(
      container.querySelector(".pp-game")?.getAttribute("style"),
    ).toContain("padding-bottom: var(--pp-safe-bottom)");

    rerender(
      <GameScreen
        state={state}
        dispatch={vi.fn()}
        muted
        onToggleSound={vi.fn()}
      />,
    );
    expect(
      screen
        .getByRole("button", { name: "Turn sounds on" })
        .querySelector("svg.lucide-volume-x[aria-hidden='true']"),
    ).not.toBeNull();
  });

  it("requires confirmation before resigning", () => {
    const dispatch = vi.fn();
    const state = gameReducer(initialGame(), {
      type: "NEW_GAME",
      kidColor: "w",
    });
    render(
      <GameScreen
        state={state}
        dispatch={dispatch}
        muted={false}
        onToggleSound={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^Give up$/ }));
    expect(screen.getByText("Really give up?")).toBeTruthy();
    expect(dispatch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Yes, give up" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "RESIGN" });
  });

  it("shows and announces the localized checkmate result", () => {
    const dispatch = vi.fn();
    const state = {
      ...initialGame(),
      phase: "over" as const,
      result: { winner: "kid" as const, reason: "checkmate" as const },
    };
    const { container } = render(
      <GameScreen
        state={state}
        dispatch={dispatch}
        muted={true}
        onToggleSound={vi.fn()}
      />,
    );

    expect(container.querySelector(".pp-result h2")?.textContent).toBe(
      "You win by checkmate!",
    );
    expect(container.querySelector(".pp-game__live")?.textContent).toBe(
      "You win by checkmate!",
    );
    fireEvent.click(screen.getByRole("button", { name: "Play again" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "PLAY_AGAIN" });
  });

  it("announces the opponent's last move with a translated piece name", () => {
    let state = gameReducer(initialGame(), { type: "NEW_GAME", kidColor: "w" });
    state = gameReducer(state, { type: "KID_MOVE", from: "e2", to: "e4" });
    state = gameReducer(state, {
      type: "GRADE_TIMEOUT",
      ply: state.history.length,
      turnToken: state.turnToken,
    });
    state = gameReducer(state, {
      type: "OPPONENT_MOVE",
      uci: "b8c6",
      turnToken: state.turnToken,
    });
    const { container } = render(
      <GameScreen
        state={state}
        dispatch={vi.fn()}
        muted
        onToggleSound={vi.fn()}
      />,
    );

    expect(container.querySelector(".pp-game__live")?.textContent).toBe(
      "Computer moved its knight to c6.",
    );
  });

  it("locks the board while grading and shows the dev panel only in dev mode", () => {
    let state = gameReducer(initialGame(), { type: "NEW_GAME", kidColor: "w" });
    state = gameReducer(state, { type: "KID_MOVE", from: "e2", to: "e4" });
    const analysis: MoveAnalysis = {
      ply: 1,
      fenBefore: state.startFen,
      moveUci: "e2e4",
      moveSan: "e4",
      linesBefore: [{ uci: "e2e4", san: "e4", cp: 30, pv: ["e2e4"], depth: 8 }],
      linesAfter: [
        { uci: "e7e5", san: "e5", cp: -30, pv: ["e7e5"], depth: 12 },
      ],
      winBefore: 52.8,
      winAfter: 52.8,
      drop: 0,
      grade: "best",
      isOnlyMove: false,
      facts: [],
    };
    state = { ...state, analyses: { 1: analysis } };
    const { container, rerender } = render(
      <GameScreen
        state={state}
        dispatch={vi.fn()}
        muted
        onToggleSound={vi.fn()}
        dev
      />,
    );

    expect(
      container.querySelector(".pp-board")?.classList.contains("is-locked"),
    ).toBe(true);
    expect(container.querySelector(".pp-game__live")?.textContent).toBe(
      "Computer is thinking",
    );
    expect(screen.getByTestId("debug-grade").textContent).toBe("best");

    rerender(
      <GameScreen
        state={state}
        dispatch={vi.fn()}
        muted
        onToggleSound={vi.fn()}
      />,
    );
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("shows a Hint button in the kid row and requests the first tier", () => {
    const dispatch = vi.fn();
    const state = gameReducer(initialGame(), {
      type: "NEW_GAME",
      kidColor: "w",
    });
    const { container } = render(
      <GameScreen
        state={state}
        dispatch={dispatch}
        muted
        onToggleSound={vi.fn()}
      />,
    );
    const kidRow = container.querySelector(
      ".pp-player:not(.pp-game__opponent)",
    ) as HTMLElement;
    const hint = within(kidRow).getByRole("button", { name: "Hint" });

    expect((hint as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(hint);
    expect(dispatch).toHaveBeenCalledWith({ type: "HINT", tier: 1 });
  });

  it("shows More help after the first tier and requests the next tier", () => {
    const dispatch = vi.fn();
    const state = {
      ...gameReducer(initialGame(), { type: "NEW_GAME", kidColor: "w" }),
      hintTier: 1 as const,
    };
    const { container } = render(
      <GameScreen
        state={state}
        dispatch={dispatch}
        muted
        onToggleSound={vi.fn()}
      />,
    );
    const kidRow = container.querySelector(
      ".pp-player:not(.pp-game__opponent)",
    ) as HTMLElement;
    const moreHelp = within(kidRow).getByRole("button", { name: "More help" });
    fireEvent.click(moreHelp);
    expect(dispatch).toHaveBeenCalledWith({ type: "HINT", tier: 2 });
  });

  it.each([
    ["the kid turn has ended", "b" as const, 0],
    ["the last hint tier is used", "w" as const, 3],
  ])("disables hints when %s", (_reason, kidColor, hintTier) => {
    const dispatch = vi.fn();
    const started = gameReducer(initialGame(), {
      type: "NEW_GAME",
      kidColor,
    });
    const state = { ...started, hintTier: hintTier as 0 | 1 | 2 | 3 };
    const { container } = render(
      <GameScreen
        state={state}
        dispatch={dispatch}
        muted
        onToggleSound={vi.fn()}
      />,
    );
    const kidRow = container.querySelector(
      ".pp-player:not(.pp-game__opponent)",
    ) as HTMLElement;
    const hintButton = within(kidRow).getByRole("button", {
      name: hintTier === 0 ? "Hint" : "More help",
    }) as HTMLButtonElement;
    expect(hintButton.disabled).toBe(true);
  });

  it("shows the coach bubble, board annotations, and live announcement for a mistake", async () => {
    let state = gameReducer(initialGame(), { type: "NEW_GAME", kidColor: "w" });
    state = gameReducer(state, { type: "KID_MOVE", from: "e2", to: "e4" });
    const fact = finalizeFact({
      kind: "hanging-piece",
      subject: { type: "p", color: "w", square: "e4" },
      attacker: { type: "q", color: "b", square: "d8" },
      threatMoveSan: "Qh4+",
      threatMoveUci: "d8h4",
    });
    const analysis: MoveAnalysis = {
      ply: 1,
      fenBefore: state.startFen,
      moveUci: "e2e4",
      moveSan: "e4",
      linesBefore: [{ uci: "d2d4", san: "d4", cp: 20, pv: ["d2d4"], depth: 8 }],
      linesAfter: [{ uci: "e7e5", san: "e5", cp: -20, pv: ["e7e5"], depth: 8 }],
      winBefore: 55,
      winAfter: 30,
      drop: 25,
      grade: "mistake",
      isOnlyMove: false,
      facts: [fact],
    };
    state = { ...state, analyses: { 1: analysis } };
    const dispatch = vi.fn();
    const { container } = render(
      <GameScreen
        state={state}
        dispatch={dispatch}
        muted
        onToggleSound={vi.fn()}
      />,
    );

    await waitFor(() =>
      expect(
        container.querySelector(
          '[data-testid="coach-text"][data-fact-kind="hanging-piece"][data-mode="explain"]',
        ),
      ).not.toBeNull(),
    );
    const message =
      container.querySelector('[data-testid="coach-text"]')?.textContent ?? "";
    expect(container.querySelector(".pp-grade--oops")).not.toBeNull();
    expect(
      container.querySelector(
        '[data-square="e4"] .pp-sq.is-danger .pp-sq__badge',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector('.pp-board__arrows [data-arrow-kind="better"]'),
    ).toBeNull();
    expect(container.querySelector(".pp-game__live")?.textContent).toContain(
      message,
    );
  });

  it("holds the board for a nudge and gives the explanation when the kid keeps the move", async () => {
    let moved = gameReducer(initialGame(), { type: "NEW_GAME", kidColor: "w" });
    moved = gameReducer(moved, { type: "KID_MOVE", from: "e2", to: "e4" });
    const fact = finalizeFact({
      kind: "hanging-piece",
      subject: { type: "p", color: "w", square: "e4" },
      attacker: { type: "q", color: "b", square: "d8" },
      threatMoveSan: "Qh4+",
      threatMoveUci: "d8h4",
    });
    const analysis: MoveAnalysis = {
      ply: 1,
      fenBefore: moved.startFen,
      moveUci: "e2e4",
      moveSan: "e4",
      linesBefore: [{ uci: "d2d4", san: "d4", cp: 20, pv: ["d2d4"], depth: 8 }],
      linesAfter: [{ uci: "e7e5", san: "e5", cp: -20, pv: ["e7e5"], depth: 8 }],
      winBefore: 55,
      winAfter: 30,
      drop: 25,
      grade: "mistake",
      isOnlyMove: false,
      facts: [fact],
    };
    const state = gameReducer(moved, {
      type: "GRADE_READY",
      ply: 1,
      turnToken: moved.turnToken,
      analysis,
    });
    const dispatch = vi.fn();
    const { container, rerender } = render(
      <GameScreen
        state={state}
        dispatch={dispatch}
        muted
        onToggleSound={vi.fn()}
      />,
    );

    await waitFor(() =>
      expect(
        container.querySelector(
          '[data-testid="coach-text"][data-mode="nudge"]',
        ),
      ).not.toBeNull(),
    );
    expect(
      container.querySelector(".pp-board")?.classList.contains("is-locked"),
    ).toBe(true);
    expect(container.querySelector(".pp-game__live")?.textContent).toContain(
      "Listen to Pip",
    );
    expect(
      container.querySelector('[data-square="e4"] .is-danger'),
    ).not.toBeNull();
    expect(
      container.querySelector('.pp-board__arrows [data-arrow-kind="better"]'),
    ).toBeNull();

    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Show me" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Keep my move" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "KEEP_MOVE" });
    rerender(
      <GameScreen
        state={gameReducer(state, { type: "KEEP_MOVE" })}
        dispatch={dispatch}
        muted
        onToggleSound={vi.fn()}
      />,
    );
    expect(
      container.querySelector(
        '[data-testid="coach-text"][data-mode="explain"]',
      ),
    ).not.toBeNull();
  });

  it("shows a late coach message after the reply without stale annotations", async () => {
    let state = gameReducer(initialGame(), { type: "NEW_GAME", kidColor: "w" });
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
    const fact = finalizeFact({
      kind: "hanging-piece",
      subject: { type: "p", color: "w", square: "e4" },
      attacker: { type: "q", color: "b", square: "d8" },
      threatMoveSan: "Qh4+",
      threatMoveUci: "d8h4",
    });
    const late = gameReducer(state, {
      type: "GRADE_READY",
      ply: 1,
      turnToken: state.pendingGrades[1]!.turnToken,
      analysis: {
        ply: 1,
        fenBefore: state.startFen,
        moveUci: "e2e4",
        moveSan: "e4",
        linesBefore: [
          { uci: "d2d4", san: "d4", cp: 20, pv: ["d2d4"], depth: 8 },
        ],
        linesAfter: [
          { uci: "e7e5", san: "e5", cp: -20, pv: ["e7e5"], depth: 8 },
        ],
        winBefore: 55,
        winAfter: 30,
        drop: 25,
        grade: "mistake",
        isOnlyMove: false,
        facts: [fact],
      },
    });
    const { container } = render(
      <GameScreen
        state={late}
        dispatch={vi.fn()}
        muted
        onToggleSound={vi.fn()}
      />,
    );

    await waitFor(() =>
      expect(
        container.querySelector(
          '[data-testid="coach-text"][data-mode="explain"]',
        ),
      ).not.toBeNull(),
    );
    expect(container.querySelector(".pp-board .pp-sq.is-danger")).toBeNull();
    expect(container.querySelector(".pp-board .pp-sq.is-hint")).toBeNull();
    expect(
      container.querySelector(".pp-board__arrows [data-arrow-kind]"),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "OK" })).toBeTruthy();
  });
});
