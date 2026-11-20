// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BoardOverlay } from "./BoardOverlay.js";

describe("BoardOverlay", () => {
  it("renders each annotated arrow with halo and color strokes", () => {
    const { container } = render(
      <BoardOverlay
        orientation="white"
        arrows={[
          { from: "e2", to: "e4", kind: "better" },
          { from: "b8", to: "c6", kind: "threat" },
        ]}
      />,
    );

    const svg = container.querySelector("svg.pp-board__arrows")!;
    const arrows = Array.from(svg.querySelectorAll("g[data-arrow-kind]"));
    expect(svg.getAttribute("viewBox")).toBe("0 0 8 8");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(
      arrows.map((arrow) => arrow.getAttribute("data-arrow-kind")),
    ).toEqual(["better", "threat"]);
    expect(
      arrows.map((arrow) => [
        arrow.getAttribute("data-arrow-from"),
        arrow.getAttribute("data-arrow-to"),
      ]),
    ).toEqual([
      ["e2", "e4"],
      ["b8", "c6"],
    ]);
    expect(arrows[0].querySelectorAll("line")).toHaveLength(2);
    expect(arrows[0].querySelectorAll("polygon")).toHaveLength(2);
    expect(
      arrows[1].querySelector("line[stroke-dasharray='0.17 0.13']"),
    ).not.toBeNull();
  });
});
