import { describe, expect, it } from "vitest";
import { buildRephraseRequest } from "../../src/shared/coach/promptBuilder.ts";
import { createLlmClient } from "../../src/server/llm/client.ts";
import { mockOpenAi } from "../../src/server/llm/mockOpenAi.ts";
import { loadBaselineCases, sha256 } from "../../training/baseline-cases.ts";
import { measureCase, summarize } from "../../training/baseline.ts";

describe("Pip model baseline", () => {
  it("replays a fixed set of 100 distinct facts across the requested inputs", async () => {
    const first = await loadBaselineCases();
    expect(await loadBaselineCases()).toEqual(first);
    expect(first.cases).toHaveLength(100);
    expect(
      sha256(first.cases.map((item) => JSON.stringify(item)).join("\n") + "\n"),
    ).toMatch(/^34f24a11/);
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

  it("withholds notation from every restricted fixture", async () => {
    const { cases } = await loadBaselineCases();
    const restricted = cases.filter(
      ({ input }) => input.mode === "hint" || input.mode === "nudge",
    );
    expect(restricted).toHaveLength(45);
    for (const { input } of restricted) {
      const content = buildRephraseRequest(input, {
        model: "mock-model",
        promptVersion: 3,
      }).messages[1].content;
      expect(content).not.toContain("Reference note");
      expect(content).not.toMatch(/[a-h][1-8]|o-o|0-0/i);
    }
  });

  it("uses experimental messages with the original validator context", async () => {
    const { cases } = await loadBaselineCases();
    const testCase = cases.find(
      ({ input }) => input.mode === "hint" && input.fact.betterMoveSan,
    )!;
    const requests: Parameters<
      ReturnType<typeof createLlmClient>["chat"]
    >[0][] = [];
    const client = {
      chat: async (
        request: Parameters<ReturnType<typeof createLlmClient>["chat"]>[0],
      ) => {
        requests.push(request);
        return { text: `Try ${testCase.input.fact.betterMoveSan}.`, raw: null };
      },
    };
    const outcomes = [];
    for (const version of [1, 3] as const)
      outcomes.push(
        await measureCase(
          testCase,
          "mock-model",
          "reasoning-off",
          client,
          version,
        ),
      );
    expect(requests).toHaveLength(2);
    for (const [index, request] of requests.entries()) {
      expect(request.reasoning_effort).toBe("none");
      expect(request.messages).toEqual(
        buildRephraseRequest(testCase.input, {
          model: "mock-model",
          promptVersion: ([1, 3] as const)[index],
        }).messages,
      );
    }
    expect(outcomes.map(({ result }) => result.reason)).toEqual([
      "reveals-better-move",
      "reveals-better-move",
    ]);
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
