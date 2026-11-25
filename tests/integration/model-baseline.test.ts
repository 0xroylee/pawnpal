import { describe, expect, it } from "vitest";
import { buildRephraseRequest } from "../../src/shared/coach/promptBuilder.ts";
import { createLlmClient } from "../../src/server/llm/client.ts";
import { mockOpenAi } from "../../src/server/llm/mockOpenAi.ts";
import { loadBaselineCases } from "../../training/baseline-cases.ts";
import { measureCase, summarize } from "../../training/baseline.ts";

describe("Pip model baseline", () => {
  it("replays a fixed set of 100 distinct facts across the requested inputs", async () => {
    const first = await loadBaselineCases();
    expect(await loadBaselineCases()).toEqual(first);
    expect(first.cases).toHaveLength(100);
    expect(new Set(first.cases.map(({ id }) => id)).size).toBe(100);
    expect(new Set(first.cases.map(({ input }) => input.mode))).toEqual(
      new Set(["nudge", "explain", "reveal", "praise", "hint"]),
    );
    expect(new Set(first.cases.map(({ input }) => input.kidAge))).toEqual(
      new Set([6, 8, 11]),
    );
    expect(new Set(first.cases.map(({ input }) => input.kidColor))).toEqual(
      new Set(["w", "b"]),
    );
  });

  it("sends the shared request and counts validator failures and timeouts", async () => {
    const { cases } = await loadBaselineCases();
    const testCase = cases.find(({ input }) => input.mode === "explain")!;
    const badSquare = ["a1", "a8", "h1", "h8"].find(
      (square) => !testCase.input.fact.squares.includes(square),
    )!;
    const server = mockOpenAi({
      replies: [
        { text: "Take a closer look." },
        { text: "Look at " + badSquare + "." },
        { text: "Take a closer look.", delayMs: 100 },
      ],
    });
    const mockFetch: typeof fetch = (input, init) =>
      server.app.request(String(input), init);
    const client = (timeoutMs: number) =>
      createLlmClient({
        baseUrl: "http://mock.local/v1",
        timeoutMs,
        fetch: mockFetch,
      });
    const outcomes = [
      await measureCase(testCase, "mock-model", "unchanged", client(3000)),
      await measureCase(testCase, "mock-model", "no-think", client(3000)),
      await measureCase(testCase, "mock-model", "unchanged", client(10)),
    ];

    const request = buildRephraseRequest(testCase.input, {
      model: "mock-model",
    });
    expect(server.requests[0]?.body).toBe(JSON.stringify(request));
    expect(server.requests[1]?.body).toBe(
      JSON.stringify({
        ...request,
        messages: [
          request.messages[0],
          {
            ...request.messages[1],
            content: request.messages[1].content + "\n/no_think",
          },
        ],
      }),
    );

    expect(outcomes[0]?.result).toEqual({
      source: "llm",
      text: "Take a closer look.",
    });
    expect(outcomes[1]?.result).toMatchObject({
      source: "template",
      reason: "unknown-square",
    });
    expect(outcomes[2]?.result).toMatchObject({
      source: "template",
      reason: "timeout",
    });
    expect(summarize(outcomes)).toMatchObject({
      accepted: 1,
      total: 3,
      passRate: 1 / 3,
      fallbackReasons: { "unknown-square": 1, timeout: 1 },
    });
  });
});
