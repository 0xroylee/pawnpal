import { Chess } from "chess.js";
import { describe, expect, it, vi } from "vitest";
import type { EngineLine } from "./EngineClient.js";
import { chooseMove, configureOpponent, samplingPolicies } from "./levels.js";

function line(uci: string, cp: number): EngineLine {
  return { uci, cp, san: uci, pv: [uci], depth: 2 };
}

function fakeEngine(lines: EngineLine[]) {
  return {
    analyze: vi.fn().mockResolvedValue(lines),
    bestMove: vi.fn().mockResolvedValue("e2e4"),
    setOptions: vi.fn().mockResolvedValue(undefined),
  };
}

describe("opponent move selection", () => {
  it("samples with higher probability for better moves and repeats with the same RNG", async () => {
    const fen = new Chess().fen();
    const engine = fakeEngine([line("e2e4", 100), line("d2d4", 0)]);
    const draws = (value: number) =>
      vi.fn().mockReturnValueOnce(0.99).mockReturnValue(value);
    for (const value of [0.1, 0.9]) {
      const first = await chooseMove(fen, 3, draws(value), engine);
      expect(first).toBe(value === 0.1 ? "e2e4" : "d2d4");
      expect(await chooseMove(fen, 3, draws(value), engine)).toBe(first);
    }
  });

  it("selects a scored slip within the configured loss range", async () => {
    const [min, max] = samplingPolicies[4].slipLoss!;
    const engine = fakeEngine([
      line("e2e4", 50),
      line("d2d4", 51 - min),
      line("g1f3", 50 - min),
      line("a2a4", 49 - max),
    ]);
    expect(await chooseMove(new Chess().fen(), 4, () => 0, engine)).toBe(
      "g1f3",
    );
  });

  it("gives a capture an edge at the beginner levels", async () => {
    const fen = "4k3/8/8/4p3/3P4/8/8/4K3 w - - 0 1";
    const engine = fakeEngine([line("d4e5", 0), line("d4d5", 0)]);
    expect(await chooseMove(fen, 3, () => 0.51, engine)).toBe("d4e5");
    expect(await chooseMove(fen, 4, () => 0.51, engine)).toBe("d4d5");
  });

  it("bypasses scoring for the first level's unrestricted slip", async () => {
    const board = new Chess();
    const engine = fakeEngine([]);
    expect(await chooseMove(board.fen(), 1, () => 0, engine)).toBe(
      board.moves({ verbose: true })[0]!.lan,
    );
    expect(engine.analyze).not.toHaveBeenCalled();
  });

  it("enables Stockfish's limit for Dragon and disables it for a custom level", async () => {
    const engine = fakeEngine([]);
    await configureOpponent(engine, 8);
    expect(engine.setOptions).toHaveBeenLastCalledWith({
      "Skill Level": 20,
      UCI_LimitStrength: true,
      UCI_Elo: 1350,
    });
    expect(await chooseMove(new Chess().fen(), 8, () => 0, engine)).toBe(
      "e2e4",
    );
    expect(engine.analyze).not.toHaveBeenCalled();
    await configureOpponent(engine, 3);
    expect(engine.setOptions).toHaveBeenLastCalledWith({
      "Skill Level": 20,
      UCI_LimitStrength: false,
    });
  });
});
