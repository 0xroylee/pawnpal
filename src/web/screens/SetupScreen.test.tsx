// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
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
    const picker = screen.getByRole("combobox", { name: "Opponent level" });
    expect(screen.getAllByRole("option")).toHaveLength(8);
    fireEvent.change(picker, { target: { value: "8" } });
    expect(
      screen.getByRole("img", { name: "8 out of 8 difficulty stars" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Play!" }));
    expect(onStart).toHaveBeenCalledWith({ kidColor: "random", level: 8 });
  });
});
