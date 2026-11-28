// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SetupScreen } from "./SetupScreen.js";

describe("SetupScreen", () => {
  it("offers the three color choices and starts with the selected choice", () => {
    const onStart = vi.fn();
    render(<SetupScreen onStart={onStart} />);

    fireEvent.click(screen.getByRole("button", { name: "Surprise me" }));
    expect(
      screen
        .getByRole("button", { name: "Surprise me" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    const picker = screen.getByRole("group", { name: "Pick your opponent" });
    expect(within(picker).getAllByRole("button")).toHaveLength(8);
    fireEvent.click(within(picker).getByRole("button", { name: /Dragon/ }));
    expect(screen.getByRole("img", { name: "Level 8 of 8" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Play!" }));
    expect(onStart).toHaveBeenCalledWith({ kidColor: "random", level: 8 });
  });
});
