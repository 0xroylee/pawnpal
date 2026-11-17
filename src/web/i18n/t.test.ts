import { describe, expect, it } from "vitest";
import { t } from "./t.js";

describe("t", () => {
  it("returns the English message for a known key", () => {
    expect(t("setup.play")).toBe("Play!");
  });

  it("replaces named placeholders and preserves missing values", () => {
    expect(t("game.hello", { name: "Ari" })).toBe("Hi, Ari!");
    expect(t("game.hello")).toBe("Hi, {name}!");
  });
});
