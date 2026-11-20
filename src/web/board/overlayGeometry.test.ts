import { describe, expect, it } from "vitest";
import { arrowShape, squareCenter } from "./overlayGeometry.js";

describe("overlayGeometry", () => {
  it("maps square centers in both board orientations", () => {
    expect(squareCenter("a8", "white")).toEqual([0.5, 0.5]);
    expect(squareCenter("h1", "white")).toEqual([7.5, 7.5]);
    expect(squareCenter("a8", "black")).toEqual([7.5, 7.5]);
    expect(squareCenter("h1", "black")).toEqual([0.5, 0.5]);
    expect(squareCenter("e4", "white")).toEqual([4.5, 4.5]);
    expect(squareCenter("e4", "black")).toEqual([3.5, 3.5]);
  });

  it("ports the kit arrow shaft, tip, and head geometry", () => {
    const arrow = arrowShape("a1", "h8", "white");
    const diagonal = 1 / Math.sqrt(2);

    expect(arrow.shaftStart[0]).toBeCloseTo(0.5 + diagonal * 0.12);
    expect(arrow.shaftStart[1]).toBeCloseTo(7.5 - diagonal * 0.12);
    expect(arrow.tip[0]).toBeCloseTo(7.5 - diagonal * 0.08);
    expect(arrow.tip[1]).toBeCloseTo(0.5 + diagonal * 0.08);
    expect(arrow.headBase[0]).toBeCloseTo(7.5 - diagonal * 0.48);
    expect(arrow.headBase[1]).toBeCloseTo(0.5 + diagonal * 0.48);
    expect(arrow.headLeft[0]).toBeCloseTo(arrow.headBase[0] + diagonal * 0.28);
    expect(arrow.headLeft[1]).toBeCloseTo(arrow.headBase[1] + diagonal * 0.28);
    expect(arrow.headRight[0]).toBeCloseTo(arrow.headBase[0] - diagonal * 0.28);
    expect(arrow.headRight[1]).toBeCloseTo(arrow.headBase[1] - diagonal * 0.28);
    expect(arrow.colorShaftEnd[0]).toBeCloseTo(
      arrow.headBase[0] + diagonal * 0.02,
    );
    expect(arrow.colorShaftEnd[1]).toBeCloseTo(
      arrow.headBase[1] - diagonal * 0.02,
    );
  });

  it("mirrors arrow coordinates with the black orientation", () => {
    const white = arrowShape("a1", "h8", "white");
    const black = arrowShape("a1", "h8", "black");

    expect(black.shaftStart[0]).toBeCloseTo(8 - white.shaftStart[0]);
    expect(black.shaftStart[1]).toBeCloseTo(8 - white.shaftStart[1]);
    expect(black.tip[0]).toBeCloseTo(8 - white.tip[0]);
    expect(black.tip[1]).toBeCloseTo(8 - white.tip[1]);
  });
});
