import { createHash } from "node:crypto";
import { Chess } from "chess.js";
import {
  createMatchRunner,
  type Match,
} from "../../tools/calibrate/matches.ts";

const ratings = {
  1: 250,
  2: 400,
  3: 550,
  4: 700,
  5: 850,
  6: 1000,
  7: 1150,
  8: 1350,
} as const;

export async function playRecordedGames(
  matches: Match[],
  plyLimit: number,
): Promise<string[]> {
  const runner = await createMatchRunner();
  try {
    const games: string[] = [];
    for (const match of matches) {
      if (match.white === "anchor" || match.black === "anchor")
        throw new Error("Anchor has no spec 02 target rating");
      const result = await runner.play(match, { plyLimit });
      const board = new Chess(result.startFen);
      for (const move of result.moves) board.move(move);
      const score =
        result.winner === "w"
          ? "1-0"
          : result.winner === "b"
            ? "0-1"
            : "1/2-1/2";
      const id = createHash("sha256")
        .update(
          JSON.stringify({
            opening: match.opening,
            white: match.white,
            black: match.black,
            seed: match.seed,
          }),
        )
        .digest("hex");
      board.setHeader("Event", "pawnpal self-play");
      board.setHeader("Site", id);
      board.setHeader("White", `Level ${match.white}`);
      board.setHeader("Black", `Level ${match.black}`);
      board.setHeader("WhiteElo", String(ratings[match.white]));
      board.setHeader("BlackElo", String(ratings[match.black]));
      board.setHeader("Result", score);
      board.setHeader("Termination", result.capped ? "ply limit" : "normal");
      games.push(board.pgn());
    }
    return games;
  } finally {
    runner.close();
  }
}
