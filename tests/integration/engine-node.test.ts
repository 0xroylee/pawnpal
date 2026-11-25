import { readFile } from "node:fs/promises";
import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import { createEngineClient } from "../../src/web/engine/EngineClient.js";
import { chooseMove, configureOpponent } from "../../src/web/engine/levels.js";
import { NodeStockfishTransport } from "../../src/web/engine/nodeTransport.js";
import { difficulties } from "../../src/shared/game/difficulty.js";

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
      // Each tested level uses the same single-threaded build as the browser fallback.
      const tactics = [
        { fen: "6k1/1q6/8/8/8/8/8/1R5K w - - 0 1", uci: "b1b7" },
        { fen: "1r5k/8/8/8/8/8/1Q6/6K1 b - - 0 1", uci: "b8b2" },
        { fen: "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1", uci: "a1a8" },
        { fen: "r5k1/5ppp/8/8/8/8/5PPP/6K1 b - - 0 1", uci: "a8a1" },
      ];
      for (const level of difficulties) {
        await engine.newGame();
        await configureOpponent(engine, level);
        for (const fen of positions) {
          const started = performance.now();
          const move = await chooseMove(fen, level, () => 0.8, engine);
          expect(performance.now() - started).toBeLessThan(
            process.env.CI ? 2000 : 1000,
          );
          expect(
            new Chess(fen)
              .moves({ verbose: true })
              .some(({ lan }) => lan === move),
          ).toBe(true);
        }
        if (level < 3) continue;
        for (const { fen, uci } of tactics) {
          for (let draw = 0; draw < 10; draw++) {
            expect(await chooseMove(fen, level, () => draw / 10, engine)).toBe(
              uci,
            );
          }
        }
      }
    } finally {
      engine.terminate();
    }
  }, 120_000);
});
