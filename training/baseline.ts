import { mkdir, readFile, writeFile } from "node:fs/promises";
import { arch, cpus, totalmem } from "node:os";
import { join } from "node:path";
import {
  buildRephraseRequest,
  type PromptVersion,
} from "../src/shared/coach/promptBuilder.ts";
import { stripThinking } from "../src/shared/coach/validateRephrase.ts";
import type { RephraseResult } from "../src/shared/coach/types.ts";
import { createLlmClient } from "../src/server/llm/client.ts";
import { rephrase } from "../src/server/llm/rephrase.ts";
import {
  loadBaselineCases,
  sha256,
  type BaselineCase,
} from "./baseline-cases.ts";

const ollama = "http://127.0.0.1:11434";
const baseUrl = `${ollama}/v1`;
const timeoutMs = 3000;
const models = ["qwen3:1.7b-q4_K_M", "qwen3:4b-q4_K_M"] as const;
const variants = ["unchanged", "no-think"] as const;
const preferenceCount = 50;

type Variant = (typeof variants)[number] | "reasoning-off";
type ChatClient = Pick<ReturnType<typeof createLlmClient>, "chat">;
type Outcome = {
  caseId: string;
  elapsedMs: number;
  candidate?: string;
  result: RephraseResult;
};

function withVariant(client: ChatClient, variant: Variant): ChatClient {
  if (variant === "unchanged") return client;
  if (variant === "reasoning-off")
    return {
      chat: (request) => client.chat({ ...request, reasoning_effort: "none" }),
    };
  return {
    chat: (request) =>
      client.chat({
        ...request,
        messages: [
          request.messages[0],
          {
            ...request.messages[1],
            content: `${request.messages[1].content}\n/no_think`,
          },
        ],
      }),
  };
}

export async function measureCase(
  testCase: BaselineCase,
  model: string,
  variant: Variant,
  client: ChatClient,
  promptVersion: PromptVersion = 1,
  onSent?: (content: string) => void,
): Promise<Outcome> {
  const variantClient = withVariant(
    onSent
      ? {
          chat: (request) => {
            onSent(request.messages[1].content);
            return client.chat(request);
          },
        }
      : client,
    variant,
  );
  let candidate: string | undefined;
  let sent = false;
  const started = performance.now();
  const result = await rephrase({
    model,
    input: testCase.input,
    client: {
      async chat(request) {
        sent = true;
        const experimental =
          promptVersion === 1
            ? request
            : {
                ...request,
                messages: buildRephraseRequest(testCase.input, {
                  model,
                  promptVersion,
                }).messages,
              };
        const response = await variantClient.chat(experimental);
        candidate = stripThinking(response.text);
        return response;
      },
    },
  });
  const elapsedMs = performance.now() - started;
  if (!sent) throw new Error(`Case ${testCase.id} never reached the model`);
  return { caseId: testCase.id, elapsedMs, candidate, result };
}

export function summarize(outcomes: Outcome[]) {
  if (outcomes.length === 0) throw new Error("No baseline outcomes to score");
  const elapsed = outcomes
    .map(({ elapsedMs }) => elapsedMs)
    .sort((a, b) => a - b);
  const midpoint = Math.floor(elapsed.length / 2);
  const medianMs =
    elapsed.length % 2 === 0
      ? (elapsed[midpoint - 1]! + elapsed[midpoint]!) / 2
      : elapsed[midpoint]!;
  const fallbackReasons: Record<string, number> = {};
  let accepted = 0;
  for (const { result } of outcomes) {
    if (result.source === "llm") {
      accepted++;
    } else {
      const reason = result.reason ?? "unspecified";
      fallbackReasons[reason] = (fallbackReasons[reason] ?? 0) + 1;
    }
  }
  return {
    accepted,
    total: outcomes.length,
    passRate: accepted / outcomes.length,
    medianMs,
    p95Ms: elapsed[Math.ceil(elapsed.length * 0.95) - 1]!,
    fallbackReasons,
  };
}

type Measurement = ReturnType<typeof summarize> & {
  model: string;
  variant: Variant;
  outcomes: Outcome[];
};

async function ollamaMetadata() {
  async function get(path: string): Promise<unknown> {
    const response = await fetch(`${ollama}${path}`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok)
      throw new Error(`Ollama ${path} returned HTTP ${response.status}`);
    return response.json();
  }
  const [version, tags] = await Promise.all([
    get("/api/version"),
    get("/api/tags"),
  ]);
  const { models: installed } = tags as {
    models: { name: string; digest: string }[];
  };
  const digests = models.map((name) => {
    const model = installed.find((item) => item.name === name);
    if (!model?.digest)
      throw new Error(`Missing local model. Run ollama pull ${name}`);
    return { name, digest: model.digest };
  });
  return { version: (version as { version: string }).version, digests };
}

const jsonl = (rows: readonly unknown[]) =>
  rows.map((row) => JSON.stringify(row)).join("\n") + "\n";
const percent = (rate: number) => `${(rate * 100).toFixed(1)}%`;

export async function runBaseline(reasoningOff = false) {
  const startedAt = new Date().toISOString();
  const runId = `${reasoningOff ? "ollama-reasoning-off" : "baseline"}-${startedAt.replace(/[:.]/g, "-")}`;
  const [{ cases, fixtures }, metadata] = await Promise.all([
    loadBaselineCases(),
    ollamaMetadata(),
  ]);
  const runDirectory = join("training", "runs", runId);
  await mkdir(runDirectory, { recursive: true });
  const caseData = jsonl(cases);
  await writeFile(join(runDirectory, "cases.jsonl"), caseData);
  const measurements: Measurement[] = [];
  const client = createLlmClient({ baseUrl, timeoutMs });
  const warmupClient = createLlmClient({ baseUrl, timeoutMs: 60_000 });

  for (const model of models) {
    for (const variant of reasoningOff
      ? (["reasoning-off"] as const)
      : variants) {
      const warmup = buildRephraseRequest(cases[0]!.input, { model });
      await withVariant(warmupClient, variant).chat(warmup);
      const outcomes: Outcome[] = [];
      for (const testCase of cases) {
        outcomes.push(await measureCase(testCase, model, variant, client));
        if (outcomes.length % 25 === 0) {
          console.log(`${model} ${variant} ${outcomes.length}/${cases.length}`);
        }
      }
      const stats = summarize(outcomes);
      const file = `${model.replace(":", "-")}-${variant}.jsonl`;
      await writeFile(join(runDirectory, file), jsonl(outcomes));
      measurements.push({ model, variant, outcomes, ...stats });
      console.log(
        `${model} ${variant} passed ${stats.accepted}/${stats.total}`,
      );
    }
  }

  const small = measurements
    .filter(({ model }) => model === models[0])
    .sort((a, b) => b.passRate - a.passRate || a.medianMs - b.medianMs)[0]!;
  const decision =
    small.passRate >= 0.9 ? "pending-human-preference" : "fine-tuning-eligible";
  if (decision === "pending-human-preference") {
    await writePreferencePairs(runDirectory, cases, small);
  }
  const machine = {
    cpu: cpus()[0]?.model,
    arch: arch(),
    memoryGiB: totalmem() / 2 ** 30,
  };
  await writeFile(
    join(runDirectory, "manifest.json"),
    JSON.stringify(
      {
        runId,
        startedAt,
        finishedAt: new Date().toISOString(),
        machine,
        node: process.version,
        ollama: metadata,
        fixtures,
        caseCount: cases.length,
        caseSha256: sha256(caseData),
        timeoutMs,
        measurements: measurements.map(({ model, variant, outcomes }) => ({
          model,
          variant,
          ...summarize(outcomes),
        })),
        decision,
      },
      null,
      2,
    ) + "\n",
  );

  const followupHeader = "## Ollama reasoning disabled";
  const report = [
    reasoningOff ? followupHeader : "# Pip model baseline",
    "",
    `Run \`${runId}\` used Ollama ${metadata.version} on ${machine.cpu ?? machine.arch} with ${machine.memoryGiB} GiB of memory.`,
    "Each row used the same 100 distinct facts replayed from recorded Stockfish fixtures. The benchmark warmed each model and used a three-second request timeout. Latency includes fallbacks.",
    "",
    "| Ollama model | Prompt | Accepted | Pass rate | Median | p95 | Fallbacks |",
    "| --- | --- | ---: | ---: | ---: | ---: | --- |",
    ...measurements.map((row) => {
      const reasons = Object.entries(row.fallbackReasons)
        .sort()
        .map(([reason, count]) => `\`${reason}\` × ${count}`)
        .join(", ");
      const prompt =
        row.variant === "reasoning-off"
          ? "`reasoning_effort: none`"
          : row.variant === "no-think"
            ? "`/no_think`"
            : "Unchanged";
      return `| \`${row.model}\` | ${prompt} | ${row.accepted}/${row.total} | ${percent(row.passRate)} | ${Math.round(row.medianMs)} ms | ${Math.round(row.p95Ms)} ms | ${reasons || "None"} |`;
    }),
    "",
    reasoningOff ? "### Training decision" : "## Training decision",
    "",
    `The best 1.7B result passed ${percent(small.passRate)}. It ${small.passRate >= 0.8 ? "met" : "fell below"} the [spec 08](specs/08-llm-rephrasing.md) target of 80% and ${small.passRate >= 0.9 ? "met" : "fell below"} the [spec 13](specs/13-train-coach-model.md) threshold of 90%.`,
    decision === "pending-human-preference"
      ? "The skip-training decision is pending human review. Use the 50 blinded comparisons in the run directory. A majority for the model clears the gate."
      : "Fine-tuning remains eligible under spec 13.",
    "",
    reasoningOff ? "### Reproduce the run" : "## Reproduce the run",
    "",
    `Start Ollama on loopback, pull both exact tags above, install the locked dependencies with \`bun install --frozen-lockfile\`, and run \`bun run node training/run-baseline.mjs${reasoningOff ? " --ollama-no-thinking" : ""}\` from the repository root.`,
    `The local output in \`${runDirectory}\` contains the case list, per-case outcomes, fixture hashes, and full model digests. The case list SHA-256 is \`${sha256(caseData)}\`.`,
    "",
  ].join("\n");
  const reportPath = "docs/llm-models.md";
  const [baseline, existingFollowup] = (
    await readFile(reportPath, "utf8").catch(() => "")
  ).split(followupHeader);
  const fullReport = reasoningOff
    ? [baseline?.trimEnd(), report.trimEnd()].filter(Boolean).join("\n\n") +
      "\n"
    : report +
      (existingFollowup ? `\n${followupHeader}${existingFollowup}` : "");
  await writeFile(reportPath, fullReport);
  console.log(`Wrote docs/llm-models.md and ${runDirectory}`);
}

export async function runPromptAblation() {
  const startedAt = new Date().toISOString();
  const runId = `prompt-ablation-${startedAt.replace(/[:.]/g, "-")}`;
  const [{ cases, fixtures }, metadata] = await Promise.all([
    loadBaselineCases(),
    ollamaMetadata(),
  ]);
  const runDirectory = join("training", "runs", runId);
  await mkdir(runDirectory, { recursive: true });
  const caseData = jsonl(cases);
  await writeFile(join(runDirectory, "cases.jsonl"), caseData);
  const client = createLlmClient({ baseUrl, timeoutMs });
  const warmupClient = createLlmClient({ baseUrl, timeoutMs: 60_000 });
  const measurements = [];
  for (const model of models) {
    for (const promptVersion of [1, 3] as const) {
      const warmup = buildRephraseRequest(cases[0]!.input, {
        model,
        promptVersion,
      });
      await withVariant(warmupClient, "reasoning-off").chat(warmup);
      const outcomes: Outcome[] = [];
      const rows = [];
      for (const testCase of cases) {
        let userContent = "";
        const outcome = await measureCase(
          testCase,
          model,
          "reasoning-off",
          client,
          promptVersion,
          (content) => {
            userContent = content;
          },
        );
        outcomes.push(outcome);
        rows.push({
          ...outcome,
          mode: testCase.input.mode,
          promptVersion,
          userContent,
          userContentSha256: sha256(userContent),
        });
        if (outcomes.length % 25 === 0)
          console.log(
            `${model} v${promptVersion} ${outcomes.length}/${cases.length}`,
          );
      }
      await writeFile(
        join(
          runDirectory,
          `${model.replace(":", "-")}-v${promptVersion}.jsonl`,
        ),
        jsonl(rows),
      );
      const byMode = Object.fromEntries(
        [...new Set(cases.map(({ input }) => input.mode))].map((mode) => [
          mode,
          summarize(
            outcomes.filter((_, index) => cases[index]!.input.mode === mode),
          ),
        ]),
      );
      measurements.push({
        model,
        promptVersion,
        ...summarize(outcomes),
        byMode,
      });
    }
  }
  const machine = {
    cpu: cpus()[0]?.model,
    arch: arch(),
    memoryGiB: totalmem() / 2 ** 30,
  };
  await writeFile(
    join(runDirectory, "manifest.json"),
    JSON.stringify(
      {
        runId,
        startedAt,
        finishedAt: new Date().toISOString(),
        machine,
        node: process.version,
        ollama: metadata,
        fixtures,
        caseCount: cases.length,
        caseSha256: sha256(caseData),
        timeoutMs,
        reasoning_effort: "none",
        measurements,
      },
      null,
      2,
    ) + "\n",
  );
  const lines = [
    "# Prompt ablation",
    "",
    "Version 3 omits the reference note in nudge and hint as well as move fields; both changes may affect results.",
    "",
    `Run: ${runId}; case SHA-256: ${sha256(caseData)}.`,
    "",
    "| Model | Version | Mode | Accepted | Pass rate | Median | p95 | Fallbacks |",
    "| --- | --- | --- | ---: | ---: | ---: | ---: | --- |",
  ];
  for (const row of measurements) {
    for (const [mode, stats] of [
      ["all", row],
      ...Object.entries(row.byMode),
    ] as const) {
      const reasons =
        Object.entries(stats.fallbackReasons)
          .map(([reason, count]) => `${reason}: ${count}`)
          .join(", ") || "None";
      lines.push(
        `| ${row.model} | ${row.promptVersion} | ${mode} | ${stats.accepted}/${stats.total} | ${percent(stats.passRate)} | ${Math.round(stats.medianMs)} ms | ${Math.round(stats.p95Ms)} ms | ${reasons} |`,
      );
    }
  }
  await writeFile(join(runDirectory, "ablation.md"), lines.join("\n") + "\n");
  console.log(`Wrote ${runDirectory}`);
}

async function writePreferencePairs(
  runDirectory: string,
  cases: BaselineCase[],
  measurement: Measurement,
) {
  const accepted = measurement.outcomes.filter(
    ({ result }) => result.source === "llm",
  );
  const casesById = new Map(cases.map((item) => [item.id, item]));
  const pairs = Array.from({ length: preferenceCount }, (_, index) => {
    const { caseId, result } =
      accepted[Math.floor((index * accepted.length) / preferenceCount)]!;
    const { input } = casesById.get(caseId)!;
    const modelFirst =
      Number.parseInt(sha256(`preference:${caseId}`)[0]!, 16) % 2 === 0;
    return {
      number: index + 1,
      age: input.kidAge,
      mode: input.mode,
      a: modelFirst ? result.text : input.templateText,
      b: modelFirst ? input.templateText : result.text,
      modelAnswer: modelFirst ? "A" : "B",
    };
  });
  const sheet = [
    "# Pip reply preference",
    "",
    "Choose A, B, or tie. Prefer the reply that fits the coaching mode and speaks more clearly to a child of the stated age.",
    "",
    ...pairs.flatMap(({ number, age, mode, a, b }) => [
      `## ${number}. Age ${age}, ${mode}`,
      "",
      `A. ${a}`,
      "",
      `B. ${b}`,
      "",
      "Preference",
      "",
    ]),
  ].join("\n");
  await Promise.all([
    writeFile(join(runDirectory, "preference.md"), sheet),
    writeFile(
      join(runDirectory, "preference-key.jsonl"),
      jsonl(pairs.map(({ number, modelAnswer }) => ({ number, modelAnswer }))),
    ),
  ]);
}
