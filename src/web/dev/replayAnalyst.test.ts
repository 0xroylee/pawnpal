import { describe, expect, it } from "vitest";
import { replayAnalystFactory } from "./replayAnalyst.js";

describe("replayAnalystFactory", () => {
  it("throws when the replay recording global is missing", () => {
    const descriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "__pawnpalReplay",
    );
    Reflect.deleteProperty(globalThis, "__pawnpalReplay");

    try {
      expect(replayAnalystFactory()).toThrow("Replay recording missing");
    } finally {
      if (descriptor) {
        Object.defineProperty(globalThis, "__pawnpalReplay", descriptor);
      }
    }
  });
});
