import { describe, expect, it } from "vitest";
import { parseUciLine } from "./uci.js";

describe("parseUciLine", () => {
  it.each([
    ["uciok", { type: "uciok" }],
    ["readyok", { type: "readyok" }],
    [
      "bestmove e2e4 ponder e7e5",
      { type: "bestmove", move: "e2e4", ponder: "e7e5" },
    ],
    ["bestmove (none)", { type: "bestmove", move: null }],
    [
      "info depth 12 seldepth 16 multipv 2 score cp -35 nodes 100 pv e7e5 g1f3",
      {
        type: "info",
        depth: 12,
        multipv: 2,
        score: { cp: -35 },
        pv: ["e7e5", "g1f3"],
      },
    ],
    [
      "info depth 7 score mate -2 pv a2a4",
      {
        type: "info",
        depth: 7,
        multipv: 1,
        score: { mate: -2 },
        pv: ["a2a4"],
      },
    ],
  ])("parses %s", (line, expected) => {
    expect(parseUciLine(line)).toMatchObject(expected);
  });

  it("ignores unrelated UCI output", () => {
    expect(parseUciLine("Stockfish 19 by the Stockfish developers")).toBeNull();
  });
});
