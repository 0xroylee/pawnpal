import { join } from "node:path";
import { parseCliArgs } from "../lib/cli.ts";
import { filterCandidates } from "../lib/filter.ts";
import { readJsonl, writeJsonl } from "../lib/jsonl.ts";
import { runStage } from "../lib/manifest.ts";
import type { PromptRecord } from "../lib/prompts.ts";
import { makeTrainingPair } from "../lib/trainingData.ts";

type CandidateRow = {
  promptId: string;
  gameId: string;
  ply: number;
  mode: PromptRecord["mode"];
  kidAge: number;
  candidateIndex: number;
  text?: string;
  error?: string;
  fixtureId?: string;
  expectedReason?: string;
};

const flags = parseCliArgs(process.argv.slice(2), [
  "input",
  "candidates",
  "run-dir",
]);
const inputPath = flags.input;
const candidatesPath = flags.candidates;
const runDir = flags["run-dir"];
if (!inputPath || !candidatesPath || !runDir) {
  throw new Error("Required flags: --input, --candidates, and --run-dir");
}

const result = await runStage({
  runDir,
  stage: "04-filter",
  inputs: { files: [inputPath, candidatesPath] },
  params: { nearDuplicateThreshold: 0.8, maxKeptPerPrompt: 2 },
  tools: { node: process.version },
  produce: async ({ directory }) => {
    const candidateIterator =
      readJsonl<CandidateRow>(candidatesPath)[Symbol.asyncIterator]();
    let currentCandidate = await candidateIterator.next();
    const keptRows: Record<string, unknown>[] = [];
    const droppedRows: Record<string, unknown>[] = [];
    let prompts = 0;
    let candidateErrors = 0;

    for await (const prompt of readJsonl<PromptRecord>(inputPath)) {
      prompts += 1;
      const promptCandidates: CandidateRow[] = [];
      while (
        !currentCandidate.done &&
        currentCandidate.value.promptId === prompt.id
      ) {
        promptCandidates.push(currentCandidate.value);
        currentCandidate = await candidateIterator.next();
      }

      const textRows = promptCandidates.filter(
        (candidate): candidate is CandidateRow & { text: string } =>
          typeof candidate.text === "string",
      );
      candidateErrors += promptCandidates.filter(
        (candidate) => candidate.error !== undefined,
      ).length;
      const filtered = filterCandidates(
        prompt,
        textRows.map((candidate) => candidate.text),
      );

      for (const text of filtered.kept) {
        const source = textRows.find((candidate) => {
          return (
            candidate.text === text ||
            candidate.text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim() ===
              text
          );
        });
        keptRows.push({
          ...makeTrainingPair(prompt, text),
          promptId: prompt.id,
          ply: prompt.ply,
          ...(source?.fixtureId ? { fixtureId: source.fixtureId } : {}),
        });
      }

      for (const dropped of filtered.dropped) {
        const source = textRows.find(
          (candidate) =>
            candidate.text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim() ===
            dropped.text,
        );
        droppedRows.push({
          promptId: prompt.id,
          gameId: prompt.gameId,
          ply: prompt.ply,
          mode: prompt.mode,
          kidAge: prompt.kidAge,
          text: dropped.text,
          reason: dropped.reason,
          ...(source?.fixtureId ? { fixtureId: source.fixtureId } : {}),
          ...(source?.expectedReason
            ? { expectedReason: source.expectedReason }
            : {}),
        });
      }
    }

    if (!currentCandidate.done) {
      throw new Error(
        `No prompt found for candidate ${currentCandidate.value.promptId}`,
      );
    }

    await writeJsonl(join(directory, "filtered.jsonl"), keptRows);
    await writeJsonl(join(directory, "dropped.jsonl"), droppedRows);
    return {
      counts: {
        prompts,
        candidatesKept: keptRows.length,
        candidatesDropped: droppedRows.length,
        candidateErrors,
      },
    };
  },
});

console.log(JSON.stringify({ stage: "04-filter", skipped: result.skipped }));
