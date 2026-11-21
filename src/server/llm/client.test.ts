import { afterEach, describe, expect, it, vi } from "vitest";
import { buildRephraseRequest } from "../../shared/coach/promptBuilder.ts";
import { finalizeFact } from "../../shared/coach/types.ts";
import { createLlmClient } from "./client.ts";
import { mockOpenAi } from "./mockOpenAi.ts";

const request = buildRephraseRequest(
  {
    fact: finalizeFact({
      kind: "missed-capture",
      subject: { type: "n", color: "w", square: "f3" },
      betterMover: { type: "n", color: "w", square: "f3" },
      targets: [{ type: "r", color: "b", square: "e5" }],
      betterMoveSan: "Nxe5",
      betterMoveUci: "f3e5",
    }),
    mode: "explain",
    templateText: "Can you spot the idea?",
    kidColor: "w",
    language: "en",
  },
  { model: "mock-model" },
);

function createClient(
  mock: ReturnType<typeof mockOpenAi>,
  options: { apiKey?: string; timeoutMs?: number } = {},
) {
  return createLlmClient({
    baseUrl: "http://mock.local/v1",
    ...options,
    fetch: mock.app.request.bind(mock.app),
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("createLlmClient", () => {
  it("posts a non-streaming chat request and returns text plus raw response", async () => {
    const mock = mockOpenAi({ replies: [{ text: "Look for a safe idea." }] });
    const result = await createClient(mock).chat(request);

    expect(result).toEqual({
      text: "Look for a safe idea.",
      raw: { choices: [{ message: { content: "Look for a safe idea." } }] },
    });
    expect(mock.requests[0]?.method).toBe("POST");
    expect(mock.requests[0]?.path).toBe("/v1/chat/completions");
    expect(mock.requests[0]?.headers.get("content-type")).toContain(
      "application/json",
    );
  });

  it("sends a bearer key only when one is set", async () => {
    const withKey = mockOpenAi();
    await createClient(withKey, { apiKey: "secret" }).chat(request);
    expect(withKey.requests[0]?.headers.get("authorization")).toBe(
      "Bearer secret",
    );

    const withoutKey = mockOpenAi();
    await createClient(withoutKey).chat(request);
    expect(withoutKey.requests[0]?.headers.has("authorization")).toBe(false);
  });

  it("maps non-success HTTP responses to an http LlmError with status", async () => {
    const mock = mockOpenAi({ replies: [{ status: 500 }] });
    await expect(createClient(mock).chat(request)).rejects.toMatchObject({
      code: "http",
      status: 500,
    });
  });

  it("maps malformed response JSON or shape to bad-response", async () => {
    const invalidJson = mockOpenAi({ replies: [{ rawBody: "not json" }] });
    await expect(createClient(invalidJson).chat(request)).rejects.toMatchObject(
      {
        code: "bad-response",
      },
    );

    const invalidShape = mockOpenAi({
      replies: [{ responseBody: { choices: [] } }],
    });
    await expect(
      createClient(invalidShape).chat(request),
    ).rejects.toMatchObject({
      code: "bad-response",
    });
  });

  it("times out a five-second mock at 3000 ms", async () => {
    // The client races a JS timer with fetch so this deadline is fake-timer controllable;
    // it also passes AbortSignal.timeout to the fetch adapter for production aborts.
    vi.useFakeTimers();
    const mock = mockOpenAi({
      replies: [{ text: "Too late.", delayMs: 5000 }],
    });
    const pending = createClient(mock).chat(request);
    await Promise.resolve();
    await Promise.resolve();
    const rejection = expect(pending).rejects.toMatchObject({
      code: "timeout",
    });

    await vi.advanceTimersByTimeAsync(3000);
    await rejection;
    expect(mock.requests).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(2000);
  });

  it("maps an abort during response-body parsing to timeout", async () => {
    vi.useFakeTimers();
    const client = createLlmClient({
      baseUrl: "http://mock.local/v1",
      timeoutMs: 20,
      fetch: async (_input, init) =>
        ({
          ok: true,
          status: 200,
          json: () =>
            new Promise((_resolve, reject) => {
              init?.signal?.addEventListener(
                "abort",
                () => reject(new DOMException("Aborted", "AbortError")),
                { once: true },
              );
            }),
        }) as Response,
    });
    const pending = client.chat(request);
    const rejection = expect(pending).rejects.toMatchObject({
      code: "timeout",
    });

    await vi.advanceTimersByTimeAsync(20);
    await rejection;
  });

  it("keeps the deadline active when an adapter ignores abort during a delayed body", async () => {
    vi.useFakeTimers();
    const client = createLlmClient({
      baseUrl: "http://mock.local/v1",
      timeoutMs: 20,
      fetch: async () =>
        ({
          ok: true,
          status: 200,
          json: async () => {
            await new Promise((resolve) => setTimeout(resolve, 100));
            return { choices: [{ message: { content: "Too late." } }] };
          },
        }) as Response,
    });
    const pending = client.chat(request);
    const rejection = expect(pending).rejects.toMatchObject({
      code: "timeout",
    });

    await vi.advanceTimersByTimeAsync(20);
    await rejection;
    await vi.advanceTimersByTimeAsync(80);
  });

  it("lists model ids from the models endpoint", async () => {
    const mock = mockOpenAi({ models: ["small-model", "large-model"] });
    const models = await createClient(mock).listModels();

    expect(models).toEqual(["small-model", "large-model"]);
    expect(mock.requests[0]?.method).toBe("GET");
    expect(mock.requests[0]?.path).toBe("/v1/models");
  });

  it("posts the request body byte-for-byte as JSON.stringify(request)", async () => {
    const mock = mockOpenAi();
    await createClient(mock).chat(request);
    expect(mock.requests[0]?.body).toBe(JSON.stringify(request));
  });
});
