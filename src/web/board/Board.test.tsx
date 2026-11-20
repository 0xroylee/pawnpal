// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { BoardAnnotations } from "../coach/annotations.js";
import { Board } from "./Board.js";

describe("Board", () => {
  it("fills the square wrapper and leaves image sizing to its context", () => {
    const { container } = render(
      <Board
        fen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
        orientation="white"
        interactive
        onMove={vi.fn()}
      />,
    );
    const square = container.querySelector(
      '[data-square="e2"] .pp-sq',
    ) as HTMLElement;
    const image = square.querySelector(
      "[data-piece] > img",
    ) as HTMLImageElement;

    expect(square.style.width).toBe("100%");
    expect(square.style.height).toBe("100%");
    expect(square.style.flex).toBe("1 1 auto");
    expect(image.style.width).toBe("");
    expect(image.style.height).toBe("");
    expect(image.draggable).toBe(false);
  });

  it("uses Meadow board and coordinate colors on each square", () => {
    const { container } = render(
      <Board
        fen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
        orientation="white"
        interactive
        onMove={vi.fn()}
      />,
    );
    const light = container.querySelector(
      '[data-square="a2"] .pp-sq',
    ) as HTMLElement;
    const dark = container.querySelector(
      '[data-square="a1"] .pp-sq',
    ) as HTMLElement;

    expect(light.style.backgroundColor).toBe("var(--pp-board-light)");
    expect(light.style.color).toBe("var(--pp-board-coord-on-light)");
    expect(dark.style.backgroundColor).toBe("var(--pp-board-dark)");
    expect(dark.style.color).toBe("var(--pp-board-coord-on-dark)");
  });

  it("renders danger badges, hint tints, and annotated arrows", () => {
    const annotations: BoardAnnotations = {
      danger: ["e4"],
      hint: ["e2"],
      arrows: [{ from: "e2", to: "e4", kind: "better" }],
    };
    const { container } = render(
      <Board
        fen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
        orientation="white"
        interactive
        annotations={annotations}
        onMove={vi.fn()}
      />,
    );

    expect(
      container.querySelector('[data-square="e4"] .pp-sq.is-danger'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-square="e4"] .pp-sq__badge')?.textContent,
    ).toBe("!");
    expect(
      container.querySelector('[data-square="e2"] .pp-sq.is-hint'),
    ).not.toBeNull();
    expect(
      container.querySelector('.pp-board > svg [data-arrow-kind="better"]'),
    ).not.toBeNull();
  });

  it("sizes the board from viewport space between the kit minimum and target", () => {
    const { container } = render(
      <Board
        fen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
        orientation="white"
        interactive
        onMove={vi.fn()}
      />,
    );
    const board = container.querySelector(".pp-board") as HTMLElement;

    expect(board.style.display).toBe("block");
    expect(board.style.width).toBe("");
    expect(board.style.maxWidth).toBe("");
  });

  it("shows legal move dots and emits one move after tap-tap", () => {
    const onMove = vi.fn();
    const { container } = render(
      <Board
        fen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
        orientation="white"
        interactive
        onMove={onMove}
      />,
    );

    fireEvent.click(container.querySelector('[data-square="e2"]')!);
    expect(
      container.querySelector('[data-square="e3"] .pp-sq.has-dot'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-square="e4"] .pp-sq.has-dot'),
    ).not.toBeNull();
    fireEvent.click(container.querySelector('[data-square="e4"]')!);

    expect(onMove).toHaveBeenCalledOnce();
    expect(onMove).toHaveBeenCalledWith({ from: "e2", to: "e4" });
  });

  it("clears an illegal tap target without emitting a move", () => {
    const onMove = vi.fn();
    const { container } = render(
      <Board
        fen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
        orientation="white"
        interactive
        onMove={onMove}
      />,
    );
    fireEvent.click(container.querySelector('[data-square="e2"]')!);
    fireEvent.click(container.querySelector('[data-square="e5"]')!);

    expect(onMove).not.toHaveBeenCalled();
    expect(
      container.querySelector('[data-square="e3"] .pp-sq.has-dot'),
    ).toBeNull();
  });

  it("opens the promotion picker and emits the chosen knight move", () => {
    const onMove = vi.fn();
    const { container } = render(
      <Board
        fen="7k/4P3/8/8/8/8/8/K7 w - - 0 1"
        orientation="white"
        interactive
        onMove={onMove}
      />,
    );
    fireEvent.click(container.querySelector('[data-square="e7"]')!);
    fireEvent.click(container.querySelector('[data-square="e8"]')!);

    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Knight" }));
    expect(onMove).toHaveBeenCalledWith({
      from: "e7",
      to: "e8",
      promotion: "n",
    });
  });
});
