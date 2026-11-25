import { totalmem } from "node:os";
import {
  finalizeFact,
  type RephraseRequestInput,
  type RephraseResult,
} from "../../shared/coach/types.ts";
import type { Library } from "../db/library.ts";
import { createLlmClient } from "./client.ts";
import recommendations from "./recommended-models.json" with { type: "json" };
import { rephrase } from "./rephrase.ts";

export const ollamaBaseUrl = "http://127.0.0.1:11434/v1";
export type LlmSettings = ReturnType<Library["getLlmSettings"]>;
const failures = new Set(["timeout", "http", "network", "bad-response"]);
const example: RephraseRequestInput = {
  fact: finalizeFact({
    kind: "hanging-piece",
    subject: { type: "n", color: "w", square: "f3" },
  }),
  mode: "explain",
  templateText: "Your knight needs a safer spot.",
  kidColor: "w",
  kidAge: 8,
  language: "en",
};

export function suggestModel(ram = totalmem()) {
  return recommendations.find(
    ({ belowGiB }) => belowGiB === null || ram < belowGiB * 1024 ** 3,
  )!.model;
}

function ollamaReasoning(settings: LlmSettings): "none" | undefined {
  return /^http:\/\/(127\.0\.0\.1|localhost):11434\/v1\/?$/i.test(
    settings.baseUrl,
  ) && /^qwen3(?::|$)/i.test(settings.model)
    ? "none"
    : undefined;
}

export class CoachBrain {
  #failures = 0;
  #generation = 0;
  readonly #library: Library;
  readonly #fetcher: typeof globalThis.fetch;

  constructor(library: Library, fetcher = globalThis.fetch) {
    this.#library = library;
    this.#fetcher = fetcher;
  }

  status() {
    const settings = this.#library.getLlmSettings();
    return {
      enabled: settings.enabled && Boolean(settings.model),
      paused: this.#failures >= 3,
      timeoutMs: settings.timeoutMs,
    };
  }

  reset() {
    this.#failures = 0;
    this.#generation++;
  }

  async phrase(input: RephraseRequestInput): Promise<RephraseResult> {
    const settings = this.#library.getLlmSettings();
    if (!settings.enabled || !settings.model || this.#failures >= 3)
      return { source: "template", text: input.templateText };
    const generation = this.#generation;
    const result = await rephrase({
      client: createLlmClient({
        ...settings,
        fetch: this.#fetcher,
        reasoningEffort: ollamaReasoning(settings),
      }),
      model: settings.model,
      input,
      log: (reason) =>
        console.warn(`Pawnpal coach used its built-in message (${reason})`),
    });
    if (generation === this.#generation && this.#failures < 3) {
      this.#failures =
        result.reason && failures.has(result.reason) ? this.#failures + 1 : 0;
    }
    return result;
  }

  configuration(input: LlmSettings): LlmSettings {
    const saved = this.#library.getLlmSettings();
    return input.apiKey === undefined && input.baseUrl === saved.baseUrl
      ? { ...input, apiKey: saved.apiKey }
      : input;
  }

  async models(input: LlmSettings) {
    const settings = this.configuration(input);
    const suggested = suggestModel();
    if (settings.baseUrl === ollamaBaseUrl) {
      try {
        const response = await this.#fetcher(
          "http://127.0.0.1:11434/api/version",
          {
            signal: AbortSignal.timeout(1200),
            redirect: "error",
          },
        );
        if (!response.ok) return { connected: false, models: [], suggested };
      } catch {
        return { connected: false, models: [], suggested };
      }
    }
    try {
      const models = await createLlmClient({
        ...settings,
        fetch: this.#fetcher,
      }).listModels();
      return { connected: true, models, suggested };
    } catch {
      return { connected: false, models: [], suggested };
    }
  }

  async test(input: LlmSettings) {
    const settings = this.configuration(input);
    const start = performance.now();
    const result = await rephrase({
      client: createLlmClient({
        ...settings,
        timeoutMs: 10_000,
        reasoningEffort: ollamaReasoning(settings),
        fetch: this.#fetcher,
      }),
      model: settings.model,
      input: example,
    });
    return { ...result, elapsedMs: Math.round(performance.now() - start) };
  }
}
