import { parseCliArgs } from "../lib/cli.ts";
import { readJsonl } from "../lib/jsonl.ts";
import { runStage } from "../lib/manifest.ts";
import {
  writeMlxSplits,
  type FilteredTrainingPair,
} from "../lib/trainingData.ts";

const flags = parseCliArgs(process.argv.slice(2), ["input", "run-dir", "seed"]);
const inputPath = flags.input;
const runDir = flags["run-dir"];
const seed = flags.seed;
if (!inputPath || !runDir || seed === undefined) {
  throw new Error("Required flags: --input, --run-dir, and --seed");
}

const ratios: [number, number, number] = [0.9, 0.05, 0.05];
const result = await runStage({
  runDir,
  stage: "05-split",
  inputs: { files: [inputPath] },
  params: { seed, ratios },
  tools: { node: process.version },
  produce: async ({ directory }) => {
    const records: FilteredTrainingPair[] = [];
    for await (const record of readJsonl<FilteredTrainingPair>(inputPath)) {
      records.push(record);
    }
    const split = await writeMlxSplits(directory, records, { seed, ratios });
    return {
      counts: {
        input: records.length,
        train: split.train.data.length,
        valid: split.valid.data.length,
        test: split.test.data.length,
      },
    };
  },
});

console.log(JSON.stringify({ stage: "05-split", skipped: result.skipped }));
