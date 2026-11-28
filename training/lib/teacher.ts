import { createHash } from "node:crypto";
import type { ChatCompletionRequest } from "../../src/shared/coach/promptBuilder.ts";
import type { CoachFact, RephraseMode } from "../../src/shared/coach/types.ts";
import { LlmError, type LlmErrorCode } from "../../src/server/llm/client.js";
import { writeJsonl } from "./jsonl.ts";
import type { PromptRecord } from "./prompts.ts";

export type GoldExample = {
  id: string;
  fact: CoachFact;
  mode: RephraseMode;
  kidColor: "w" | "b";
  text: string;
  reviewed: false;
  sourceFixture?: string;
};

export type Candidate = { text: string } | { error: LlmErrorCode };
export type CandidateSuccess = Extract<Candidate, { text: string }>;
export type CandidateCache = {
  get(key: string): ReadonlyMap<number, CandidateSuccess> | undefined;
  put(
    key: string,
    index: number,
    success: CandidateSuccess,
    meta: { promptId: string },
  ): Promise<void>;
};

export function memoryCandidateCache(): CandidateCache {
  const values = new Map<string, Map<number, CandidateSuccess>>();
  return {
    get(key) {
      return values.get(key);
    },
    async put(key, index, success) {
      const candidates = values.get(key) ?? new Map();
      candidates.set(index, { ...success });
      values.set(key, candidates);
    },
  };
}

export type CandidateCacheContext = {
  model: string;
  voiceGuide: string;
  gold: GoldExample[];
  n: 2 | 3;
  teacherIdentity?: string;
};

type TeacherClient = {
  chat(request: ChatCompletionRequest): Promise<{ text: string; raw: unknown }>;
};

export async function generateCandidates(
  prompt: PromptRecord,
  deps: {
    client: TeacherClient;
    model: string;
    teacherIdentity?: string;
    voiceGuide: string;
    gold: GoldExample[];
    n: 2 | 3;
    cache: CandidateCache;
  },
): Promise<Candidate[]> {
  const cacheKey = candidateInputHash(prompt, deps);

  const request = teacherRequest(
    prompt,
    deps.model,
    deps.voiceGuide,
    deps.gold,
  );
  const candidates: Candidate[] = [];
  for (let index = 0; index < deps.n; index += 1) {
    const cachedSuccess = deps.cache.get(cacheKey)?.get(index);
    if (cachedSuccess) {
      candidates.push({ ...cachedSuccess });
      continue;
    }

    let response: { text: string; raw: unknown };
    try {
      response = await deps.client.chat(request);
    } catch (error) {
      candidates.push({
        error: error instanceof LlmError ? error.code : "network",
      });
      continue;
    }

    const success = { text: response.text };
    await deps.cache.put(cacheKey, index, success, { promptId: prompt.id });
    candidates.push(success);
  }

  return candidates;
}

export function candidateInputHash(
  prompt: PromptRecord,
  context: CandidateCacheContext,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        prompt: prompt.requestJson,
        model: context.model,
        n: context.n,
        teacherIdentity: context.teacherIdentity ?? null,
        voiceGuide: context.voiceGuide,
        gold: context.gold,
      }),
    )
    .digest("hex");
}

export async function writeCandidateRows<T extends object>(
  outputPath: string,
  records: AsyncIterable<T> | Iterable<T>,
): Promise<{ candidates: number; errors: number }> {
  let candidates = 0;
  let errors = 0;
  async function* countedRecords(): AsyncGenerator<T> {
    for await (const record of records) {
      candidates += 1;
      if ((record as { error?: unknown }).error !== undefined) errors += 1;
      yield record;
    }
  }

  await writeJsonl(outputPath, countedRecords());
  if (errors > 0) {
    throw new Error(
      `${errors} teacher candidate request(s) failed; see candidates.jsonl.`,
    );
  }
  return { candidates, errors };
}

function teacherRequest(
  prompt: PromptRecord,
  model: string,
  voiceGuide: string,
  gold: GoldExample[],
): ChatCompletionRequest {
  const examples = gold.slice(0, 20).map(
    (example) =>
      `Facts → ${JSON.stringify({
        fact: example.fact,
        mode: example.mode,
        kidColor: example.kidColor,
      })}\nPip says → ${example.text}`,
  );
  const additions = [
    `Pip voice guide:\n${voiceGuide}`,
    `Gold examples:\n${examples.join("\n\n")}`,
  ];

  return {
    ...prompt.request,
    model,
    messages: [
      {
        role: "system",
        content: [prompt.request.messages[0].content, ...additions].join(
          "\n\n",
        ),
      },
      prompt.request.messages[1],
    ],
  };
}
