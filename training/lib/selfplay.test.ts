import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { openings } from "../../tools/calibrate/openings.ts";
import { playRecordedGames } from "./selfplay.ts";
import { splitByGame } from "./split.ts";
import { parsePgnGame } from "./pgnStream.ts";

describe("self-play PGN", () => {
  it("records legal capped games with target ratings and both colors", async () => {
    const games = await playRecordedGames(
      [
        { opening: openings[0]!, white: 4, black: 5, seed: 1 },
        { opening: openings[0]!, white: 5, black: 4, seed: 1 },
      ],
      8,
    );
    expect(games).toHaveLength(2);
    for (const [index, pgn] of games.entries()) {
      const game = parsePgnGame(pgn);
      expect(game.whiteElo).toBe(index === 0 ? 700 : 850);
      expect(game.blackElo).toBe(index === 0 ? 850 : 700);
      expect(game.headers.Result).toBe("1/2-1/2");
      expect(game.headers.Termination).toBe("ply limit");
      const board = new Chess();
      board.loadPgn(pgn);
      expect(board.history()).toHaveLength(8);
    }
    expect(parsePgnGame(games[0]!).site).not.toBe(parsePgnGame(games[1]!).site);
  }, 30000);
  it("keeps a naturally finished game in the same split when the cap increases", async () => {
    const match = {
      opening: openings[0]!,
      white: 4 as const,
      black: 5 as const,
      seed: 1,
    };
    const first = parsePgnGame((await playRecordedGames([match], 160))[0]!);
    const second = parsePgnGame((await playRecordedGames([match], 161))[0]!);
    expect(first.headers.Termination).toBe("normal");
    expect(second.headers.Termination).toBe("normal");
    expect(first.id).toBe(second.id);
    const splits = splitByGame([{ gameId: first.id }, { gameId: second.id }], {
      seed: 1,
      ratios: [0.7, 0.15, 0.15],
    });
    expect(
      Object.values(splits)
        .map((records) => records.length)
        .sort(),
    ).toEqual([0, 0, 2]);
  }, 120000);
});
