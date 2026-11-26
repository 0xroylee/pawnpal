import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Chess } from "chess.js";
import { createEngineClient } from "../../src/web/engine/EngineClient.js";
import { NodeStockfishTransport } from "../../src/web/engine/nodeTransport.js";
import { createReplayTransport } from "../../src/web/engine/replayTransport.js";
import {
  COACH_FACT_SCHEMA_VERSION,
  type EngineLine,
} from "../../src/shared/coach/types.ts";
import { parsePgnGame, readPgnGames } from "./pgnStream.ts";
import { runStage } from "./manifest.ts";
import { readJsonl, writeJsonl } from "./jsonl.ts";
import {
  analyzeGame,
  InvalidPgnError,
  type PositionRecord,
} from "./positions.ts";

const detectorFixturePath = fileURLToPath(
  new URL("../../tests/fixtures/coach/detectors.json", import.meta.url),
);
const gamesFixturePath = fileURLToPath(
  new URL("../fixtures/games.pgn", import.meta.url),
);
const engineFixturesEnabled = process.env.PAWNPAL_ENGINE_FIXTURES === "1";

async function createRunDir(): Promise<string> {
  const root = join(process.cwd(), "training/runs");
  await mkdir(root, { recursive: true });
  return mkdtemp(join(root, "positions-"));
}

async function collect<T>(records: AsyncIterable<T>): Promise<T[]> {
  const result: T[] = [];
  for await (const record of records) result.push(record);
  return result;
}

describe("analyzeGame", () => {
  it("uses recorded engine lines and adds schema-versioned detector facts", async () => {
    const fixtureFile = JSON.parse(
      await readFile(detectorFixturePath, "utf8"),
    ) as {
      id: string;
      fen: string;
      move: string;
      recorded: {
        white: { linesBefore: EngineLine[]; linesAfter: EngineLine[] };
      };
    }[];
    const fixture = fixtureFile.find(
      (candidate) => candidate.id === "allowed-fork-1",
    );
    expect(fixture).toBeDefined();
    if (!fixture)
      throw new Error("Expected the allowed-fork-1 detector fixture");

    const board = new Chess(fixture.fen);
    const move = board.move({
      from: fixture.move.slice(0, 2),
      to: fixture.move.slice(2, 4),
      ...(fixture.move[4] ? { promotion: fixture.move[4] } : {}),
    });
    const pgn = [
      `[Event "${fixture.id}"]`,
      '[SetUp "1"]',
      `[FEN "${fixture.fen}"]`,
      '[WhiteElo "900"]',
      '[BlackElo "1600"]',
      "",
      `1. ${move.san} *`,
    ].join("\n");
    const game = parsePgnGame(pgn);
    const engine = createEngineClient(
      createReplayTransport({
        positions: [
          { fen: fixture.fen, lines: fixture.recorded.white.linesBefore },
          { fen: board.fen(), lines: fixture.recorded.white.linesAfter },
        ],
      }),
      { threads: 1 },
    );

    await engine.init();
    try {
      const records = await collect(
        analyzeGame(game, engine, {
          depthBefore: 14,
          multiPvBefore: 3,
          depthAfter: 12,
          multiPvAfter: 2,
          pvPlies: 8,
        }),
      );

      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({
        gameId: game.id,
        ply: 1,
        kidColor: "w",
        fenBefore: fixture.fen,
        moveUci: fixture.move,
        moveSan: move.san,
        linesBefore: fixture.recorded.white.linesBefore,
        linesAfter: fixture.recorded.white.linesAfter,
      });
      expect(records[0]?.facts.length).toBeGreaterThan(0);
      expect(
        records[0]?.facts.every(
          (fact) => fact.schemaVersion === COACH_FACT_SCHEMA_VERSION,
        ),
      ).toBe(true);
    } finally {
      engine.terminate();
    }
  });

  it("extracts only rated kid moves and both colors when both ratings qualify", async () => {
    const makeGame = (whiteElo: number, blackElo: number) =>
      parsePgnGame(
        [
          '[Event "Two ply fixture"]',
          `[WhiteElo "${whiteElo}"]`,
          `[BlackElo "${blackElo}"]`,
          "",
          "1. e4 e5 *",
        ].join("\n"),
      );
    const engine = {
      newGame: async () => undefined,
      analyze: async (fen: string) => {
        const board = new Chess(fen);
        const move = board.moves({ verbose: true })[0];
        if (!move) return [];
        const uci = `${move.from}${move.to}${move.promotion ?? ""}`;
        return [{ uci, san: move.san, cp: 0, pv: [uci], depth: 1 }];
      },
    };

    const blackOnly = await collect(
      analyzeGame(makeGame(1600, 900), engine, {
        depthBefore: 14,
        multiPvBefore: 3,
        depthAfter: 12,
        multiPvAfter: 2,
        pvPlies: 8,
      }),
    );
    const bothSides = await collect(
      analyzeGame(makeGame(900, 900), engine, {
        depthBefore: 14,
        multiPvBefore: 3,
        depthAfter: 12,
        multiPvAfter: 2,
        pvPlies: 8,
      }),
    );

    expect(blackOnly.map((record) => [record.ply, record.kidColor])).toEqual([
      [2, "b"],
    ]);
    expect(bothSides.map((record) => [record.ply, record.kidColor])).toEqual([
      [1, "w"],
      [2, "b"],
    ]);
  });

  it("marks malformed PGN as a skippable load error", async () => {
    const malformed = parsePgnGame(
      '[Event "invalid"]\n[SetUp "1"]\n[FEN "bad"]\n\n*',
    );
    const engine = { newGame: async () => undefined, analyze: async () => [] };
    await expect(
      collect(
        analyzeGame(malformed, engine, {
          depthBefore: 14,
          multiPvBefore: 3,
          depthAfter: 12,
          multiPvAfter: 2,
          pvPlies: 8,
        }),
      ),
    ).rejects.toBeInstanceOf(InvalidPgnError);
  });
});

describe.skipIf(!engineFixturesEnabled)("WASM position fixture smoke", () => {
  it("writes position records and a manifest for two synthetic games", async () => {
    const runDir = await createRunDir();
    const engine = createEngineClient(new NodeStockfishTransport(), {
      threads: 1,
      timeoutMs: 30_000,
    });
    await engine.init();

    try {
      const games = await collect(readPgnGames(gamesFixturePath, { limit: 2 }));
      const run = await runStage({
        runDir,
        stage: "01-positions",
        inputs: { files: [gamesFixturePath] },
        params: {
          depthBefore: 6,
          multiPvBefore: 3,
          depthAfter: 6,
          multiPvAfter: 2,
          pvPlies: 8,
        },
        tools: { engine: "WASM fixture" },
        produce: async ({ directory }) => {
          const records = [];
          for (const game of games) {
            for await (const record of analyzeGame(game, engine, {
              depthBefore: 6,
              multiPvBefore: 3,
              depthAfter: 6,
              multiPvAfter: 2,
              pvPlies: 8,
            })) {
              records.push(record);
            }
          }
          await writeJsonl(join(directory, "positions.jsonl"), records);
          return { counts: { games: games.length, positions: records.length } };
        },
      });
      const records = await collect(
        readJsonl<PositionRecord>(
          join(runDir, "01-positions", "positions.jsonl"),
        ),
      );

      expect(run.skipped).toBe(false);
      expect(run.manifest.status).toBe("complete");
      expect(records.length).toBeGreaterThan(0);
      expect(
        records.every((record) => record.gameId && record.linesBefore),
      ).toBe(true);
    } finally {
      engine.terminate();
      await rm(runDir, { recursive: true, force: true });
    }
  });
});
