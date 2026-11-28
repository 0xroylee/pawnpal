import { createWriteStream } from "node:fs";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { Readable, type Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import * as zlib from "node:zlib";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parsePgnGame,
  readPgnGames,
  splitPgnStream,
  splitPgnText,
} from "./pgnStream.ts";

const fixturePath = fileURLToPath(
  new URL("../fixtures/games.pgn", import.meta.url),
);
const createZstdCompress = Reflect.get(zlib, "createZstdCompress") as
  (() => Transform) | undefined;

async function collect<T>(records: AsyncIterable<T>): Promise<T[]> {
  const result: T[] = [];
  for await (const record of records) result.push(record);
  return result;
}

describe("PGN stream helpers", () => {
  it("splits games across byte chunks and parses metadata", async () => {
    const source = [
      '[Event "First"]\n[WhiteElo "900"]\n[BlackElo "1500"]\n\n1. e4 e5 1-0\n\n',
      '[Event "Second"]\n[Site "fixture:2"]\n\n1. d4 d5 0-1\n',
    ];
    const chunks = source.flatMap((text) =>
      Array.from(Buffer.from(text), (byte) => Buffer.from([byte])),
    );
    const games = await collect(splitPgnStream(Readable.from(chunks)));
    const first = parsePgnGame(games[0] ?? "");

    expect(games).toHaveLength(2);
    expect(first).toMatchObject({
      event: "First",
      whiteElo: 900,
      blackElo: 1500,
    });
    expect(parsePgnGame(games[1] ?? "").site).toBe("fixture:2");
    expect(first.id).toMatch(/^[a-f0-9]{64}$/);
  });

  it("keeps header-looking lines inside a multiline PGN comment", async () => {
    const pgn = `1. e4 {a valid multiline comment
[Event "not a game"]
} e5 *`;
    const games = await collect(splitPgnStream(Readable.from([pgn])));

    expect(games).toEqual([pgn]);
  });

  it("uses the same comment-aware scanner for metadata parsing", () => {
    const pgn = `[Event "Real"]
[WhiteElo "1800"]
[BlackElo "1900"]

1. e4 {a multiline comment
[WhiteElo "900"]
[Event "fake"]
} e5 *`;

    expect(parsePgnGame(pgn)).toMatchObject({
      event: "Real",
      whiteElo: 1800,
      blackElo: 1900,
    });
    expect(splitPgnText(pgn)).toMatchObject({
      headers: { Event: "Real", WhiteElo: "1800", BlackElo: "1900" },
    });
  });

  it("starts the next game after a semicolon comment ends at the line break", async () => {
    const pgn = `[Event "First"]
[WhiteElo "900"]

1. e4 ; comment that mentions [Event "not a header"]
[Event "Second"]
[WhiteElo "1000"]

1. d4 d5 *`;
    const games = await collect(splitPgnStream(Readable.from([pgn])));

    expect(games).toHaveLength(2);
    expect(parsePgnGame(games[0] ?? "").event).toBe("First");
    expect(parsePgnGame(games[1] ?? "").event).toBe("Second");
  });

  it("keeps games rated in range on either side and stops at the requested count", async () => {
    const games = await collect(
      readPgnGames(fixturePath, { minRating: 600, maxRating: 1400 }),
    );
    const limited = await collect(
      readPgnGames(fixturePath, { minRating: 600, maxRating: 1400, limit: 3 }),
    );

    expect(games.length).toBeGreaterThanOrEqual(3);
    expect(games.length).toBeLessThan(12);
    expect(limited).toHaveLength(3);
    expect(
      games.every(
        (game) =>
          (game.whiteElo !== undefined &&
            game.whiteElo >= 600 &&
            game.whiteElo <= 1400) ||
          (game.blackElo !== undefined &&
            game.blackElo >= 600 &&
            game.blackElo <= 1400),
      ),
    ).toBe(true);
  });

  it("reads plain PGN files as a stream", async () => {
    const contents = await readFile(fixturePath, "utf8");
    const games = await collect(readPgnGames(fixturePath, { limit: 1 }));
    expect(games[0]?.pgn).toContain(contents.split("\n")[0] ?? "[Event");
  });

  it("decompresses .pgn.zst inputs when Node provides zstd support", async () => {
    if (!createZstdCompress) return;

    const runRoot = join(process.cwd(), "training/runs");
    await mkdir(runRoot, { recursive: true });
    const directory = await mkdtemp(join(runRoot, "pgn-stream-"));
    const compressedPath = join(directory, "games.pgn.zst");

    try {
      const pgn = await readFile(fixturePath);
      await pipeline(
        Readable.from([pgn]),
        createZstdCompress(),
        createWriteStream(compressedPath),
      );
      const games = await collect(readPgnGames(compressedPath, { limit: 1 }));
      expect(games).toHaveLength(1);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
