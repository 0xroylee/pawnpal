import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createLlmClient } from "../../src/server/llm/client.js";
import { parseCliArgs } from "../lib/cli.ts";
import { openCandidateStore } from "../lib/candidateStore.ts";
import { readJsonl } from "../lib/jsonl.ts";
import { runStage } from "../lib/manifest.ts";
import {
  candidateInputHash,
  generateCandidates,
  memoryCandidateCache,
  type Candidate,
  type CandidateCache,
  type GoldExample,
  writeCandidateRows,
} from "../lib/teacher.ts";
import type { PromptRecord } from "../lib/prompts.ts";

type CandidateFixture = {
  id: string;
  text?: string;
  error?: Extract<Candidate, { error: string }>["error"];
  expectedReason?: string;
};

type CandidateRow = {
  promptId: string;
  gameId: string;
  ply: number;
  mode: PromptRecord["mode"];
  kidAge: number;
  candidateIndex: number;
  cacheKey?: string;
  text?: string;
  error?: Extract<Candidate, { error: string }>["error"];
  fixtureId?: string;
  expectedReason?: string;
};

const flags = parseCliArgs(process.argv.slice(2), ["input", "run-dir"]);
const inputPath = flags.input;
const runDir = flags["run-dir"];
if (!inputPath || !runDir) {
  throw new Error("Required flags: --input and --run-dir");
}

const fixturePath = flags["fixture-candidates"];
const model = flags.model ?? (fixturePath ? "fixture-model" : undefined);
const n = flags.n === undefined ? 2 : Number(flags.n);
if (!model)
  throw new Error("--model is required when not using fixture candidates");
if (n !== 2 && n !== 3) throw new Error("--n must be 2 or 3");

const voiceGuidePath = flags["voice-guide"];
const baseUrl = flags["base-url"];
if (!fixturePath && (!voiceGuidePath || !baseUrl)) {
  throw new Error("Real teacher mode requires --voice-guide and --base-url");
}

const goldPath = flags.gold;
const inputFiles = [inputPath];
if (goldPath) inputFiles.push(goldPath);
if (fixturePath) inputFiles.push(fixturePath);
if (voiceGuidePath) inputFiles.push(voiceGuidePath);

const params = {
  model,
  n,
  fixtureMode: Boolean(fixturePath),
  baseUrl: baseUrl ?? null,
};
const result = await runStage({
  runDir,
  stage: "03-teacher",
  inputs: { files: inputFiles },
  params,
  tools: { node: process.version },
  produce: async ({ directory }) => {
    const store = fixturePath
      ? undefined
      : await openCandidateStore(join(directory, "progress.jsonl"));
    const cache: CandidateCache = store ?? memoryCandidateCache();

    try {
      const gold =
        fixturePath || !goldPath
          ? []
          : await collect(readJsonl<GoldExample>(goldPath));
      const voiceGuide = voiceGuidePath
        ? await readFile(voiceGuidePath, "utf8")
        : "";
      const client =
        fixturePath || !baseUrl
          ? undefined
          : createLlmClient({
              baseUrl,
              apiKey: process.env.PAWNPAL_LLM_API_KEY,
            });
      const fixtures = fixturePath
        ? await collect(readJsonl<CandidateFixture>(fixturePath))
        : undefined;
      const outputPath = join(directory, "candidates.jsonl");
      let prompts = 0;

      async function* records() {
        for await (const prompt of readJsonl<PromptRecord>(inputPath)) {
          prompts += 1;
          let candidates: Candidate[];
          const cacheKey = fixtures
            ? undefined
            : candidateInputHash(prompt, {
                model,
                teacherIdentity: baseUrl,
                voiceGuide,
                gold,
                n: n as 2 | 3,
              });
          if (fixtures) {
            candidates = fixtures.map((fixture) =>
              fixture.error
                ? { error: fixture.error }
                : { text: fixture.text ?? "" },
            );
          } else {
            if (!client) throw new Error("Teacher client was not configured");
            candidates = await generateCandidates(prompt, {
              client,
              model,
              teacherIdentity: baseUrl,
              voiceGuide,
              gold,
              n: n as 2 | 3,
              cache,
            });
          }

          for (const [candidateIndex, candidate] of candidates.entries()) {
            const fixture = fixtures?.[candidateIndex];
            yield {
              promptId: prompt.id,
              gameId: prompt.gameId,
              ply: prompt.ply,
              mode: prompt.mode,
              kidAge: prompt.kidAge,
              candidateIndex,
              ...(cacheKey ? { cacheKey } : {}),
              ...candidate,
              ...(fixture?.id ? { fixtureId: fixture.id } : {}),
              ...(fixture?.expectedReason
                ? { expectedReason: fixture.expectedReason }
                : {}),
            } satisfies CandidateRow;
          }
        }
      }

      const written = await writeCandidateRows(outputPath, records());
      return {
        counts: {
          prompts,
          candidates: written.candidates,
          candidateErrors: written.errors,
        },
      };
    } finally {
      await store?.close();
    }
  },
});

console.log(JSON.stringify({ stage: "03-teacher", skipped: result.skipped }));

async function collect<T>(records: AsyncIterable<T>): Promise<T[]> {
  const result: T[] = [];
  for await (const record of records) result.push(record);
  return result;
}
