import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { Chess } from "chess.js";
import stockfish from "stockfish";
import type { Difficulty } from "../../src/shared/game/difficulty.js";
import { createEngineClient } from "../../src/web/engine/EngineClient.js";
import {
  chooseLimitedMove,
  chooseMove,
  configureOpponent,
} from "../../src/web/engine/levels.js";
import type { EngineTransport } from "../../src/web/engine/transport.js";

export type Competitor = Difficulty | "anchor";
export type Match = {
  opening: string;
  white: Competitor;
  black: Competitor;
  seed: number;
};
export type MatchResult = { winner: "w" | "b" | "draw"; capped: boolean };
export const plyLimit = 160;
const enginePath = stockfish.findEngine("lite-single");

function createTransport(): EngineTransport {
  // The packaged WASM module retains a singleton. Separate processes give
  // each side its own search state and UCI options.
  const engine = spawn(process.execPath, [enginePath], {
    stdio: ["pipe", "pipe", "inherit"],
  });
  const lines = createInterface({ input: engine.stdout });
  return {
    send(line) {
      engine.stdin.write(`${line}\n`);
    },
    onLine(callback) {
      lines.on("line", callback);
      return () => lines.off("line", callback);
    },
    terminate() {
      lines.close();
      engine.stdin.end();
      engine.kill();
    },
  };
}

function randomGenerator(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export async function createMatchRunner() {
  const engines = {
    w: createEngineClient(createTransport(), { threads: 1 }),
    b: createEngineClient(createTransport(), { threads: 1 }),
  };
  await Promise.all(Object.values(engines).map((engine) => engine.init()));
  return {
    async play(match: Match): Promise<MatchResult> {
      const levels = { w: match.white, b: match.black };
      for (const side of ["w", "b"] as const) {
        const engine = engines[side];
        const level = levels[side];
        await engine.newGame();
        await (level === "anchor"
          ? configureOpponent(engine, 8, 1320)
          : configureOpponent(engine, level));
      }
      const board = new Chess(match.opening);
      const rng = {
        w: randomGenerator(match.seed),
        b: randomGenerator(match.seed ^ 0x8db3b),
      };
      for (let ply = 0; ply < plyLimit; ply++) {
        const side = board.turn();
        const level = levels[side];
        const fen = board.fen();
        const move = await (level === "anchor"
          ? chooseLimitedMove(fen, engines[side])
          : chooseMove(fen, level, rng[side], engines[side]));
        board.move(move);
        if (board.isCheckmate()) return { winner: side, capped: false };
        if (board.isDraw()) return { winner: "draw", capped: false };
      }
      return { winner: "draw", capped: true };
    },
    close() {
      for (const engine of Object.values(engines)) engine.terminate();
    },
  };
}
