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

  it("accepts only the replay analyst in dev mode", () => {
    const fen = "4k3/8/8/8/8/8/8/4K3 b - - 0 1";
    expect(
      parseStartParams(`?fen=${encodeURIComponent(fen)}&analyst=replay`, true),
    ).toEqual({
      fen,
      color: "b",
      analyst: "replay",
    });
    expect(
      parseStartParams(`?fen=${encodeURIComponent(fen)}&analyst=live`, true),
    ).toBeNull();
    expect(
      parseStartParams(`?fen=${encodeURIComponent(fen)}&analyst=replay`, false),
    ).toBeNull();
  });

  it("ignores the replay selector when production has an injected recording", () => {
    const descriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "__pawnpalReplay",
    );
    const recording = { positions: [{ fen: "fixture", lines: [] }] };
    Object.defineProperty(globalThis, "__pawnpalReplay", {
      configurable: true,
      value: recording,
    });

    try {
      expect(
        parseStartParams(
          "?fen=4k3%2F8%2F8%2F8%2F8%2F8%2F8%2F4K3%20b%20-%20-%200%201&analyst=replay",
          false,
        ),
      ).toBeNull();
      expect(Reflect.get(globalThis, "__pawnpalReplay")).toBe(recording);
    } finally {
      if (descriptor) {
        Object.defineProperty(globalThis, "__pawnpalReplay", descriptor);
      } else {
        Reflect.deleteProperty(globalThis, "__pawnpalReplay");
      }
    }
  });
});
