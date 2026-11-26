import { join } from "node:path";
import { parseCliArgs } from "../lib/cli.ts";
import { readJsonl, writeJsonl } from "../lib/jsonl.ts";
import { runStage } from "../lib/manifest.ts";
import { buildPromptRecords } from "../lib/prompts.ts";
import type { PositionRecord } from "../lib/positions.ts";
import { shouldCallLlm } from "../../src/shared/coach/rephrasePolicy.ts";

const flags = parseCliArgs(process.argv.slice(2), [
  "input",
  "run-dir",
  "model",
]);
const inputPath = flags.input;
const runDir = flags["run-dir"];
const model = flags.model;
if (!inputPath || !runDir || !model) {
  throw new Error("Required flags: --input, --run-dir, and --model");
}

const variantSeed =
  flags["variant-seed"] === undefined ? 0 : Number(flags["variant-seed"]);
if (!Number.isFinite(variantSeed)) {
  throw new Error("--variant-seed must be a finite number");
}

const ages: [number, number, number] = [6, 8, 11];
const params = { model, ages, variantSeed };
const result = await runStage({
  runDir,
  stage: "02-prompts",
  inputs: { files: [inputPath] },
  params,
  tools: { node: process.version },
  produce: async ({ directory }) => {
    let positions = 0;
    let prompts = 0;
    let omittedByPolicy = 0;
    async function* records() {
      for await (const position of readJsonl<PositionRecord>(inputPath)) {
        positions += 1;
        for (const record of buildPromptRecords(position, params)) {
          if (
            !shouldCallLlm({
              fact: record.fact,
              mode: record.mode,
              templateText: record.templateText,
              kidColor: record.kidColor,
              kidAge: record.kidAge,
              language: "en",
            })
          ) {
            omittedByPolicy += 1;
            continue;
          }
          prompts += 1;
          yield record;
        }
      }
    }

    await writeJsonl(join(directory, "prompts.jsonl"), records());
    return { counts: { positions, prompts, omittedByPolicy } };
  },
});

console.log(JSON.stringify({ stage: "02-prompts", skipped: result.skipped }));
