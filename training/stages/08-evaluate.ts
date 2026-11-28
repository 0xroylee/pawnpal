import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseCliArgs } from "../lib/cli.ts";
import { writeFileAtomic } from "../lib/atomicWrite.ts";
import {
  evaluateGates,
  MODEL_RULES,
  parseEvaluationInput,
  renderReport,
} from "../lib/evaluate.ts";
import { runStage } from "../lib/manifest.ts";

const flags = parseCliArgs(process.argv.slice(2), ["input", "run-dir"]);
const inputPath = flags.input;
const runDir = flags["run-dir"];
if (!inputPath || !runDir) {
  throw new Error("Required flags: --input and --run-dir");
}

const result = await runStage({
  runDir,
  stage: "08-evaluate",
  inputs: { files: [inputPath] },
  params: { report: "report.md" },
  tools: { node: process.version },
  produce: async ({ directory }) => {
    const input: unknown = JSON.parse(await readFile(inputPath, "utf8"));
    const gates = evaluateGates(input);
    const parsed = parseEvaluationInput(input);
    const report = renderReport(input, gates);
    await Promise.all([
      writeFileAtomic(join(directory, "report.md"), report),
      writeFileAtomic(
        join(directory, "gates.json"),
        `${JSON.stringify(gates, null, 2)}\n`,
      ),
    ]);
    return {
      counts: {
        models: parsed.ok ? Object.keys(MODEL_RULES).length : 0,
        shipTrained: Number(gates.shipTrained),
        reasons: gates.reasons.length,
      },
    };
  },
});

console.log(JSON.stringify({ stage: "08-evaluate", skipped: result.skipped }));
