// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { horseyPieces } from "./pieces.js";

describe("horseyPieces", () => {
  it("leaves image sizing to the board, segment, and promotion styles", () => {
    const { container } = render(<>{horseyPieces.wK?.()}</>);
    const image = container.querySelector("img");

    expect(image).not.toBeNull();
    expect(image?.style.width).toBe("");
    expect(image?.style.height).toBe("");
  });
});
