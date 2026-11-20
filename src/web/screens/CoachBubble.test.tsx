// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CoachMessage } from "../coach/coachState.js";
import { CoachBubble } from "./CoachBubble.js";

describe("CoachBubble", () => {
  it("renders a graded coach message with Pip, fact metadata, and dismiss action", () => {
    const onDismiss = vi.fn();
    const message: CoachMessage = {
      text: "The queen can capture your pawn. Move your pawn to safety.",
      mode: "reveal",
      kind: "hanging-piece",
      grade: "oops",
      pip: "surprised",
    };
    const { container } = render(
      <CoachBubble message={message} onDismiss={onDismiss} />,
    );

    expect(container.querySelector(".pp-coach")).not.toBeNull();
    expect(container.querySelector(".pp-bubble")).not.toBeNull();
    expect(
      screen.getByRole("img", { name: "Pip, your chess coach" }),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '.pp-bubble__text[data-fact-kind="hanging-piece"][data-mode="reveal"]',
      )?.textContent,
    ).toBe(message.text);
    expect(container.querySelector(".pp-grade--oops")?.textContent).toContain(
      "Oops",
    );
    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("renders compact hint messages without a duplicate More help action", () => {
    const message: CoachMessage = {
      text: "Take a look at your pawn.",
      mode: "hint1",
      pip: "encouraging",
    };
    const { container } = render(
      <CoachBubble message={message} onDismiss={vi.fn()} />,
    );

    expect(container.querySelector(".pp-bubble--compact")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "More help" })).toBeNull();
  });

  it("shows the typing dots while a hint waits for analysis", () => {
    const { container } = render(
      <CoachBubble
        message={{
          text: "Pip is thinking",
          mode: "hint1",
          pip: "thinking",
        }}
        onDismiss={vi.fn()}
      />,
    );

    const typing = container.querySelector(".pp-typing");
    expect(typing?.getAttribute("aria-label")).toBe("Pip is thinking");
    expect(typing?.querySelectorAll("i")).toHaveLength(3);
  });
});
