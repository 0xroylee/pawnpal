import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { openings } from "../../tools/calibrate/openings.ts";
import type { Match } from "../../tools/calibrate/matches.ts";
import { writeFileAtomic } from "../lib/atomicWrite.ts";
import { parseCliArgs } from "../lib/cli.ts";
import { resolveWasmEngineFiles } from "../lib/engine.ts";
import { canonicalJson, runStage } from "../lib/manifest.ts";
import { playRecordedGames } from "../lib/selfplay.ts";

const flags = parseCliArgs(process.argv.slice(2), ["run-dir"]);
function integer(
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const value = flags[name] === undefined ? fallback : Number(flags[name]);
  if (!Number.isSafeInteger(value) || value < min || value > max)
    throw new Error(`Invalid --${name}`);
  return value;
}
const count = integer("games", 2, 2, 10000);
if (count % 2 !== 0) throw new Error("--games must be even");
const limit = integer("ply-limit", 160, 1, 10000);
const seed = integer("seed", 1, 0, 2147483647);
const openingCount = integer("openings", 1, 1, openings.length);
const matches: Match[] = Array.from({ length: count }, (_, i) => {
  const pair = Math.floor(i / 2);
  const first = ([4, 5, 6, 7] as const)[pair % 4]!;
  const second = ([5, 6, 7, 4] as const)[pair % 4]!;
  return {
    opening: openings[pair % openingCount]!,
    white: i % 2 === 0 ? first : second,
    black: i % 2 === 0 ? second : first,
    seed: seed + pair,
  };
});
const engineFiles = resolveWasmEngineFiles();
const enginePackage = JSON.parse(
  await readFile(engineFiles.at(-1)!, "utf8"),
) as { version: string };
const selectedOpenings = openings.slice(0, openingCount);
const openingDigest = createHash("sha256")
  .update(canonicalJson(selectedOpenings))
  .digest("hex");
const result = await runStage({
  runDir: flags["run-dir"]!,
  stage: "00-selfplay",
  inputs: { files: engineFiles, values: { openings, matches, openingDigest } },
  params: { count, limit, seed, openingCount },
  tools: {
    node: process.version,
    engine: "Stockfish lite-single",
    engineVersion: enginePackage.version,
  },
  produce: async ({ directory }) => {
    const games = await playRecordedGames(matches, limit);
    await writeFileAtomic(
      join(directory, "games.pgn"),
      `${games.join("\n\n")}\n`,
    );
    return { counts: { games: games.length } };
  },
});
console.log(JSON.stringify({ stage: "00-selfplay", skipped: result.skipped }));
