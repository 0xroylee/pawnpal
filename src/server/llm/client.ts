import type { ChatCompletionRequest } from "../../shared/coach/promptBuilder.ts";

export type LlmErrorCode = "timeout" | "http" | "network" | "bad-response";

export class LlmError extends Error {
  readonly code: LlmErrorCode;
  readonly status?: number;

  constructor(code: LlmErrorCode, message: string, status?: number) {
    super(message);
    this.name = "LlmError";
    this.code = code;
    if (status !== undefined) this.status = status;
  }
}

type FetchAdapter = typeof globalThis.fetch;

type LlmClientOptions = {
  baseUrl: string;
  apiKey?: string;
  timeoutMs?: number;
  fetch?: FetchAdapter;
};

export function createLlmClient({
  baseUrl,
  apiKey,
  timeoutMs = 3000,
  fetch: fetchAdapter = globalThis.fetch,
}: LlmClientOptions): {
  chat(request: ChatCompletionRequest): Promise<{ text: string; raw: unknown }>;
  listModels(): Promise<string[]>;
} {
  return {
    async chat(request) {
      const raw = await requestJson(
        "POST",
        "chat/completions",
        JSON.stringify(request),
      );
      if (!isRecord(raw)) throw badResponse("Chat response must be an object");
      const choices = raw.choices;
      if (!Array.isArray(choices) || !isRecord(choices[0])) {
        throw badResponse("Chat response must contain a choice");
      }
      const message = choices[0].message;
      if (!isRecord(message) || typeof message.content !== "string") {
        throw badResponse("Chat response must contain message text");
      }
      return { text: message.content, raw };
    },
    async listModels() {
      const raw = await requestJson("GET", "models");
      if (!isRecord(raw) || !Array.isArray(raw.data)) {
        throw badResponse("Models response must contain a data array");
      }
      return raw.data.map((entry) => {
        if (!isRecord(entry) || typeof entry.id !== "string") {
          throw badResponse("Each model must have a string id");
        }
        return entry.id;
      });
    },
  };

  async function requestJson(
    method: "GET" | "POST",
    path: string,
    body?: string,
  ): Promise<unknown> {
    const signal = AbortSignal.timeout(timeoutMs);
    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    const init: RequestInit = {
      method,
      headers,
      signal,
      ...(body === undefined ? {} : { body }),
    };
    return withTimeout(async () => {
      let response: Response;
      try {
        response = await fetchAdapter(
          `${baseUrl.replace(/\/+$/, "")}/${path}`,
          init,
        );
      } catch (error) {
        throw classifyFetchError(error, signal);
      }

      if (!response.ok) {
        throw new LlmError(
          "http",
          `LLM request failed with HTTP ${response.status}`,
          response.status,
        );
      }
      try {
        return (await response.json()) as unknown;
      } catch (error) {
        if (isTimeoutError(error, signal)) {
          throw new LlmError("timeout", "LLM request timed out");
        }
        throw badResponse("LLM response was not valid JSON");
      }
    }, timeoutMs);
  }
}

function withTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new LlmError("timeout", "LLM request timed out"));
    }, timeoutMs);

    void Promise.resolve()
      .then(operation)
      .then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error: unknown) => {
          clearTimeout(timer);
          reject(error);
        },
      );
  });
}

function classifyFetchError(error: unknown, signal: AbortSignal): LlmError {
  if (isTimeoutError(error, signal)) {
    return new LlmError("timeout", "LLM request timed out");
  }
  return new LlmError("network", "LLM request failed", undefined);
}

function isTimeoutError(error: unknown, signal: AbortSignal): boolean {
  return (
    signal.aborted ||
    (error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError"))
  );
}

function badResponse(message: string): LlmError {
  return new LlmError("bad-response", message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
