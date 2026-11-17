import { readFile } from "node:fs/promises";
import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import { createEngineClient } from "../../src/web/engine/EngineClient.js";
import { NodeStockfishTransport } from "../../src/web/engine/nodeTransport.js";

const positions = JSON.parse(
  await readFile(
    new URL("../fixtures/positions.json", import.meta.url),
    "utf8",
  ),
) as string[];

describe("Node Stockfish adapter", () => {
  it("returns a legal move for each fixed position", async () => {
    const engine = createEngineClient(new NodeStockfishTransport(), {
      threads: 1,
    });
    await engine.init();

    try {
      for (const fen of positions) {
        const move = await engine.bestMove(fen, { depth: 2 });
        const chess = new Chess(fen);
        expect(
          chess.moves({ verbose: true }).map((candidate) => candidate.lan),
        ).toContain(move);
      }
    } finally {
      engine.terminate();
    }
  }, 120_000);
});
