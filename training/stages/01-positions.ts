import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { parseCliArgs } from "../lib/cli.ts";
import { createTrainingEngine } from "../lib/engine.ts";
import { writeJsonl } from "../lib/jsonl.ts";
import { runStage } from "../lib/manifest.ts";
import { readPgnGames } from "../lib/pgnStream.ts";
import {
  analyzeGame,
  DEFAULT_POSITION_ANALYSIS,
  InvalidPgnError,
} from "../lib/positions.ts";

const flags = parseCliArgs(process.argv.slice(2), ["input", "run-dir"]);
const runDir = flags["run-dir"];
if (!runDir) throw new Error("Missing required flag --run-dir");

const input = flags.input;
if (!input) throw new Error("Missing required flag --input");
const limit = flags.limit === undefined ? undefined : Number(flags.limit);
if (limit !== undefined && (!Number.isInteger(limit) || limit < 0)) {
  throw new Error("--limit must be a non-negative integer");
}

const minRating =
  flags["min-rating"] === undefined ? 600 : Number(flags["min-rating"]);
const maxRating =
  flags["max-rating"] === undefined ? 1400 : Number(flags["max-rating"]);
if (
  !Number.isFinite(minRating) ||
  !Number.isFinite(maxRating) ||
  minRating > maxRating
) {
  throw new Error("Invalid rating bounds");
}

let inputPath = input;
if (input === "-") {
  await mkdir(runDir, { recursive: true });
  inputPath = join(runDir, "stdin.pgn");
  await pipeline(process.stdin, createWriteStream(inputPath));
}

const uciCommand = flags["engine-uci"];
const engineSpec = uciCommand ? { uci: uciCommand } : "wasm";
const engineAssets = flags["engine-assets"]
  ?.split(",")
  .map((asset) => asset.trim())
  .filter((asset) => asset !== "");
const tools = {
  node: process.version,
  engine: uciCommand ?? "Stockfish lite-single",
};
const engine = createTrainingEngine({
  engine: engineSpec,
  assets: engineAssets,
  identity: flags["engine-identity"],
});
try {
  await engine.client.init();
  tools.engine = engine.name;
  const engineInputs = await engine.describeInputs();
  const result = await runStage({
    runDir,
    stage: "01-positions",
    inputs: {
      files: [inputPath, ...engineInputs.files],
      directories: engineInputs.directories,
      values: { engine: engineInputs.values },
    },
    params: {
      ...DEFAULT_POSITION_ANALYSIS,
      minRating,
      maxRating,
      limit: limit ?? null,
      engine: uciCommand ?? "wasm",
    },
    tools,
    produce: async ({ directory }) => {
      let selectedGames = 0;
      let skippedGames = 0;
      let positions = 0;

      async function* records() {
        for await (const game of readPgnGames(inputPath, {
          limit,
          minRating,
          maxRating,
        })) {
          selectedGames += 1;
          try {
            for await (const record of analyzeGame(game, engine.client)) {
              positions += 1;
              yield record;
            }
          } catch (error) {
            if (error instanceof InvalidPgnError) {
              skippedGames += 1;
              continue;
            }
            throw error;
          }
        }
      }

      await writeJsonl(join(directory, "positions.jsonl"), records());
      return {
        counts: {
          games: selectedGames,
          skippedGames,
          positions,
        },
      };
    },
  });
  console.log(
    JSON.stringify({ stage: "01-positions", skipped: result.skipped }),
  );
} catch (error) {
  if (engine.failureCause) {
    throw new Error(`Training engine failed: ${engine.failureCause}`, {
      cause: error,
    });
  }
  throw error;
} finally {
  engine.client.terminate();
}
