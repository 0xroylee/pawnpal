import { describe, expect, it } from "vitest";
import { materialAlongPv, materialFromKid } from "./material.js";

describe("coach material helpers", () => {
  it("counts material from the side-to-move perspective", () => {
    expect(materialFromKid("4k3/8/8/8/8/8/4P3/4K2q w - - 0 1")).toBe(-8);
  });

  it("returns the material swing along a bounded PV from the requested side", () => {
    const fen = "4k3/8/8/8/4q3/8/4R3/4K3 w - - 0 1";
    expect(materialAlongPv(fen, ["e2e4"], 2)).toBe(9);
    expect(materialAlongPv(fen, ["e2e4"], 0)).toBe(0);
  });

  it("can score a reply line from the kid's perspective", () => {
    const fen = "4k3/8/8/8/4q3/8/4R3/4K3 b - - 0 1";
    expect(materialAlongPv(fen, ["e4e2"], 2, "w")).toBe(-5);
  });
});
