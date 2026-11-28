import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { createLlmClient } from "../../src/server/llm/client.js";
import { mockOpenAi } from "../../src/server/llm/mockOpenAi.js";
import { buildRephraseRequest } from "../../src/shared/coach/promptBuilder.ts";
import { finalizeFact } from "../../src/shared/coach/types.ts";
import { runStage } from "./manifest.ts";
import type { PromptRecord } from "./prompts.ts";
import { openCandidateStore } from "./candidateStore.ts";
import {
  generateCandidates,
  memoryCandidateCache,
  writeCandidateRows,
  type GoldExample,
} from "./teacher.ts";

const fact = finalizeFact({
  kind: "missed-capture",
  subject: { type: "n", color: "w", square: "f3" },
  betterMover: { type: "n", color: "w", square: "f3" },
  targets: [{ type: "r", color: "b", square: "e5" }],
  betterMoveSan: "Nxe5",
  betterMoveUci: "f3e5",
});

const gold: GoldExample = {
  id: "gold-fixture-01",
  fact,
  mode: "explain",
  kidColor: "w",
  text: "Your position has a helpful idea.",
  reviewed: false,
};

function makePrompt(index = 0): PromptRecord {
  const input = {
    fact,
    mode: "explain" as const,
    templateText: `Prompt ${index}: your knight had a chance to capture a rook.`,
    kidColor: "w" as const,
    kidAge: 8,
    language: "en" as const,
  };
  const request = buildRephraseRequest(input, {
    model: "fixture-prompt-model",
  });
  return {
    id: `fixture-game-${index}:4:explain:8`,
    gameId: `fixture-game-${index}`,
    ply: 4,
    mode: "explain",
    kidAge: 8,
    kidColor: "w",
    fact,
    templateText: input.templateText,
    request,
    requestJson: JSON.stringify(request),
  };
}

function clientFor(mock: ReturnType<typeof mockOpenAi>) {
  return createLlmClient({
    baseUrl: "http://mock.local/v1",
    fetch: mock.app.request.bind(mock.app),
  });
}

describe("generateCandidates", () => {
  it("adds voice and gold context, then caches candidates by input hash", async () => {
    const mock = mockOpenAi({
      replies: [
        { text: "Look for a calm idea." },
        { text: "Find a helpful idea." },
      ],
    });
    const prompt = makePrompt();
    const deps = {
      client: clientFor(mock),
      model: "fixture-teacher-model",
      voiceGuide: "Pip is kind and brief.",
      gold: [gold],
      n: 2 as const,
      cache: memoryCandidateCache(),
    };

    const candidates = await generateCandidates(prompt, deps);
    const repeated = await generateCandidates(prompt, deps);
    const firstRequest = JSON.parse(mock.requests[0]?.body ?? "{}");

    expect(candidates).toEqual([
      { text: "Look for a calm idea." },
      { text: "Find a helpful idea." },
    ]);
    expect(repeated).toEqual(candidates);
    expect(mock.requests).toHaveLength(2);
    expect(firstRequest.model).toBe("fixture-teacher-model");
    expect(firstRequest.messages[0].content).toContain(
      prompt.request.messages[0].content,
    );
    expect(firstRequest.messages[0].content).toContain(
      "Pip is kind and brief.",
    );
    expect(firstRequest.messages[0].content).toContain("Facts →");
    expect(firstRequest.messages[0].content).toContain("Pip says →");
    expect(firstRequest.messages[1]).toEqual(prompt.request.messages[1]);
  });

  it("records client errors as candidates without throwing", async () => {
    const mock = mockOpenAi({
      replies: [{ status: 503 }, { text: "Try a calm idea." }],
    });
    const candidates = await generateCandidates(makePrompt(), {
      client: clientFor(mock),
      model: "fixture-teacher-model",
      voiceGuide: "",
      gold: [],
      n: 2,
      cache: memoryCandidateCache(),
    });

    expect(candidates).toEqual([
      { error: "http" },
      { text: "Try a calm idea." },
    ]);
  });

  it("retries failed candidate slots without repeating cached successes", async () => {
    const mock = mockOpenAi({
      replies: [
        { status: 503 },
        { text: "Try a calm idea." },
        { text: "Look for a new idea." },
      ],
    });
    const prompt = makePrompt();
    const deps = {
      client: clientFor(mock),
      model: "fixture-teacher-model",
      voiceGuide: "Pip is kind and brief.",
      gold: [gold],
      n: 2 as const,
      cache: memoryCandidateCache(),
    };

    const first = await generateCandidates(prompt, deps);
    const retry = await generateCandidates(prompt, deps);

    expect(first).toEqual([{ error: "http" }, { text: "Try a calm idea." }]);
    expect(retry).toEqual([
      { text: "Look for a new idea." },
      { text: "Try a calm idea." },
    ]);
    expect(mock.requests).toHaveLength(3);
  });
});

describe("writeCandidateRows", () => {
  it("keeps error diagnostics, fails the stage, and lets a failed stage rerun", async () => {
    const root = join(process.cwd(), "training/runs");
    await mkdir(root, { recursive: true });
    const runDir = await mkdtemp(join(root, "teacher-failure-"));
    const failingRows = [
      { promptId: "prompt-1", candidateIndex: 0, error: "http" },
      { promptId: "prompt-1", candidateIndex: 1, text: "A calm idea." },
    ];

    try {
      await expect(
        runStage({
          runDir,
          stage: "03-teacher",
          inputs: {},
          params: {},
          tools: {},
          produce: async ({ directory }) => {
            const written = await writeCandidateRows(
              join(directory, "candidates.jsonl"),
              failingRows,
            );
            return { counts: written };
          },
        }),
      ).rejects.toThrow("teacher candidate request(s) failed");

      const failedManifest = JSON.parse(
        await readFile(join(runDir, "03-teacher", "manifest.json"), "utf8"),
      );
      const failedRows = await collectJsonl(
        join(runDir, "03-teacher", "candidates.jsonl"),
      );
      const recovered = await runStage({
        runDir,
        stage: "03-teacher",
        inputs: {},
        params: {},
        tools: {},
        produce: async ({ directory }) => {
          const written = await writeCandidateRows(
            join(directory, "candidates.jsonl"),
            [{ promptId: "prompt-1", candidateIndex: 0, text: "Recovered." }],
          );
          return { counts: written };
        },
      });

      expect(failedManifest.status).toBe("failed");
      expect(failedManifest.outputs["candidates.jsonl"]).toMatch(
        /^[a-f0-9]{64}$/,
      );
      expect(failedRows).toEqual(failingRows);
      expect(recovered.skipped).toBe(false);
      expect(recovered.manifest.status).toBe("complete");
    } finally {
      await rm(runDir, { recursive: true, force: true });
    }
  });
});

describe("durable candidate progress", () => {
  it("preserves completed slots through an interrupted retry", async () => {
    const root = join(process.cwd(), "training/runs");
    await mkdir(root, { recursive: true });
    const runDir = await mkdtemp(join(root, "teacher-progress-"));
    const prompts = [0, 1, 2, 3].map(makePrompt);
    const outputPath = join(runDir, "03-teacher", "candidates.jsonl");

    async function* allPrompts() {
      yield* prompts;
    }

    async function* interruptedBeforePromptTwo() {
      yield prompts[0]!;
      yield prompts[1]!;
      throw new Error("input interrupted before prompt 2");
    }

    const runAttempt = (
      promptSource: () => AsyncIterable<PromptRecord>,
      failPromptIds: ReadonlySet<string>,
    ) => {
      const calls: string[] = [];
      const result = runStage({
        runDir,
        stage: "03-teacher",
        inputs: {},
        params: { model: "fixture-teacher", n: 2 },
        tools: { node: "fixture" },
        lockfile: null,
        produce: async ({ directory }) => {
          const cache = await openCandidateStore(
            join(directory, "progress.jsonl"),
          );
          let activePromptId = "";
          let promptCount = 0;
          const client = {
            async chat() {
              calls.push(activePromptId);
              if (failPromptIds.has(activePromptId)) {
                throw new Error("injected teacher failure");
              }
              return { text: `Candidate for ${activePromptId}.`, raw: {} };
            },
          };

          async function* rows() {
            for await (const prompt of promptSource()) {
              promptCount += 1;
              activePromptId = prompt.id;
              const candidates = await generateCandidates(prompt, {
                client,
                model: "fixture-teacher",
                teacherIdentity: "fixture-teacher",
                voiceGuide: "",
                gold: [],
                n: 2,
                cache,
              });
              for (const [candidateIndex, candidate] of candidates.entries()) {
                yield { promptId: prompt.id, candidateIndex, ...candidate };
              }
            }
          }

          try {
            const written = await writeCandidateRows(
              join(directory, "candidates.jsonl"),
              rows(),
            );
            return {
              counts: {
                prompts: promptCount,
                candidates: written.candidates,
                candidateErrors: written.errors,
              },
            };
          } finally {
            await cache.close();
          }
        },
      });
      return { calls, result };
    };

    try {
      const first = runAttempt(
        allPrompts,
        new Set([prompts[1]!.id, prompts[3]!.id]),
      );
      await expect(first.result).rejects.toThrow(
        "teacher candidate request(s) failed",
      );
      expect(first.calls).toHaveLength(8);
      const afterFirst = await readFile(outputPath, "utf8");

      const second = runAttempt(
        interruptedBeforePromptTwo,
        new Set([prompts[1]!.id]),
      );
      await expect(second.result).rejects.toThrow(
        "input interrupted before prompt 2",
      );
      expect(await readFile(outputPath, "utf8")).toBe(afterFirst);

      const third = runAttempt(allPrompts, new Set());
      const completed = await third.result;

      expect(third.calls).toHaveLength(4);
      expect(third.calls).toEqual([
        prompts[1]!.id,
        prompts[1]!.id,
        prompts[3]!.id,
        prompts[3]!.id,
      ]);
      expect(completed.manifest.status).toBe("complete");
    } finally {
      await rm(runDir, { recursive: true, force: true });
    }
  });
});

async function collectJsonl(path: string): Promise<unknown[]> {
  const { readJsonl } = await import("./jsonl.ts");
  const rows: unknown[] = [];
  for await (const row of readJsonl(path)) rows.push(row);
  return rows;
}
