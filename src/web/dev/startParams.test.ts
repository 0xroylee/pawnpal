import { describe, expect, it } from "vitest";
import { parseStartParams } from "./startParams.js";

describe("parseStartParams", () => {
  it("accepts a valid FEN in dev mode and defaults color to its active side", () => {
    expect(
      parseStartParams(
        "?fen=4k3%2F8%2F8%2F8%2F8%2F8%2F8%2F4K3%20b%20-%20-%200%201",
        true,
      ),
    ).toEqual({
      fen: "4k3/8/8/8/8/8/8/4K3 b - - 0 1",
      color: "b",
    });
  });

  it("ignores invalid positions and production query strings", () => {
    expect(parseStartParams("?fen=not-a-fen", true)).toBeNull();
    expect(
      parseStartParams(
        "?fen=4k3%2F8%2F8%2F8%2F8%2F8%2F8%2F4K3%20b%20-%20-%200%201",
        false,
      ),
    ).toBeNull();
    expect(parseStartParams("?color=b", true)).toBeNull();
  });
});
