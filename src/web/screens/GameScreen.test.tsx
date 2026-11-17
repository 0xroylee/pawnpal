// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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

    expect(screen.getByText("Computer")).toBeTruthy();
    expect(screen.queryByText("Pip")).toBeNull();
    expect(
      container.querySelector(".pp-player .pp-avatar svg.lucide-bot"),
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
});
