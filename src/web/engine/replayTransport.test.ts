import { describe, expect, it } from "vitest";
import type { EngineLine } from "../../shared/coach/types.js";
import { createEngineClient } from "./EngineClient.js";
import { FakeTransport } from "./transport.js";
import { createReplayTransport } from "./replayTransport.js";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const RECORDED_LINES: EngineLine[] = [
  {
    uci: "e2e4",
    san: "e4",
    cp: 28,
    pv: ["e2e4", "e7e5"],
    depth: 14,
  },
  {
    uci: "d2d4",
    san: "d4",
    mate: 3,
    pv: ["d2d4", "d7d5"],
    depth: 14,
  },
];

const recording = { positions: [{ fen: START, lines: RECORDED_LINES }] };

describe("createReplayTransport", () => {
  it("answers the UCI handshake and replays recorded lines across FEN counters", async () => {
    const transport = createReplayTransport(recording) as FakeTransport;
    const client = createEngineClient(transport, { threads: 1 });
    await client.init();

    const lines = await client.analyze(
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 7 42",
      { depth: 14, movetimeMs: 1500, multiPv: 2 },
    );

    expect(transport.sent).toContain("uci");
    expect(transport.sent).toContain("isready");
    expect(transport.sent).toContain("go depth 14 movetime 1500");
    expect(lines).toEqual(RECORDED_LINES);
  });

  it("truncates replay output to the requested MultiPV count", async () => {
    const transport = createReplayTransport(recording);
    const client = createEngineClient(transport, { threads: 1 });
    await client.init();

    await expect(client.analyze(START, { multiPv: 1 })).resolves.toEqual([
      RECORDED_LINES[0],
    ]);
  });

  it("returns no analysis for an unrecorded FEN", async () => {
    const transport = createReplayTransport(recording);
    const client = createEngineClient(transport, { threads: 1 });
    await client.init();

    await expect(
      client.analyze("8/8/8/8/8/8/4k3/7K w - - 0 1"),
    ).resolves.toEqual([]);
  });

  it("returns no move when a search is stopped", async () => {
    const transport = createReplayTransport(recording) as FakeTransport;
    const replies: string[] = [];
    transport.onLine((line) => replies.push(line));

    transport.send("stop");
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    expect(replies).toEqual(["bestmove (none)"]);
  });
});
