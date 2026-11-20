import { describe, expect, it } from "vitest";
import { see } from "./see.js";

describe("static exchange evaluation", () => {
  it("scores an undefended capture", () => {
    expect(see("4k3/8/8/8/4q3/8/4R3/4K3 w - - 0 1", "e4", "w")).toBe(9);
  });

  it("accounts for a recapture and declines an unsafe king capture", () => {
    expect(see("4r1k1/8/8/8/4p3/8/4R3/4K3 w - - 0 1", "e4", "w")).toBe(-4);
    expect(see("4r2k/8/8/8/4p3/4K3/8/8 w - - 0 1", "e4", "w")).toBe(0);
  });

  it("excludes a pinned initial attacker and a pinned recapturer", () => {
    expect(see("k3r3/8/8/8/8/8/4R2b/4K3 w - - 0 1", "h2", "w")).toBe(0);
    expect(see("4k3/8/4p3/3b4/8/8/8/K2RR3 w - - 0 1", "d5", "w")).toBe(3);
  });

  it("returns zero when the target is friendly or has no attacker", () => {
    expect(see("4k3/8/8/8/4p3/8/8/4K3 w - - 0 1", "e4", "w")).toBe(0);
    expect(see("4k3/8/8/8/4p3/8/8/4K3 w - - 0 1", "e4", "b")).toBe(0);
  });
});
