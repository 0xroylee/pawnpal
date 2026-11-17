// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { MoveAnalysis } from "../../shared/coach/types.ts";
import { DebugPanel } from "./DebugPanel.js";

afterEach(cleanup);

describe("DebugPanel", () => {
  it("shows grade details, child-perspective scores, and reached depths", () => {
    const analysis: MoveAnalysis = {
      ply: 1,
      fenBefore: "position-before",
      moveUci: "e2e4",
      moveSan: "e4",
      linesBefore: [
        { uci: "e2e4", san: "e4", mate: 3, pv: ["e2e4"], depth: 8 },
      ],
      linesAfter: [
        { uci: "e7e5", san: "e5", cp: 120, pv: ["e7e5"], depth: 10 },
      ],
      winBefore: 72.4,
      winAfter: 61.2,
      drop: 11.2,
      grade: "blunder",
      isOnlyMove: true,
      late: true,
      facts: [],
    };
    render(<DebugPanel analyses={{ 1: analysis }} kidColor="w" />);

    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.getByTestId("debug-grade").textContent).toBe("blunder");
    expect(screen.getByText("#3")).toBeTruthy();
    expect(screen.getByText("-120 cp")).toBeTruthy();
    expect(screen.getByText("72.4%")).toBeTruthy();
    expect(screen.getByText("61.2%")).toBeTruthy();
    expect(screen.getByText("11.2")).toBeTruthy();
    expect(screen.getByText("8 / 10")).toBeTruthy();
    expect(screen.getAllByText("Yes")).toHaveLength(2);
  });
});
